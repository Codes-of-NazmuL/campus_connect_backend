import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { fcmService } from './services/fcm.service';

dotenv.config();

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me';

// Initialize Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import announcementRoutes from './routes/announcements';
import chatRoutes from './routes/chat';
import adminRoutes from './routes/admin';
import examRoutes from './routes/exam';

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CampusConnect API is running!' });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/exam', examRoutes);

// ─── Socket.io Real-time Chat ──────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const user = jwt.verify(token, JWT_SECRET) as { id: string; role: string };
    (socket as any).user = user;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

const userSocketMap = new Map<string, string>();

io.on('connection', async (socket) => {
  const user = (socket as any).user;
  
  if (user?.id) {
    userSocketMap.set(user.id, socket.id);
  }
  console.log(`✅ User connected: ${socket.id} (userId: ${user?.id})`);

  // Automatically join all the user's existing chat rooms
  try {
    const userRooms = await prisma.chatRoomUser.findMany({
      where: { userId: user.id },
      select: { chatRoomId: true },
    });
    userRooms.forEach((ur) => {
      socket.join(ur.chatRoomId);
    });
    console.log(`✅ User ${user.id} auto-joined ${userRooms.length} rooms`);
  } catch (err) {
    console.error('Error auto-joining rooms:', err);
  }

  // Explicitly join a chat room (e.g., when a new one is created)
  socket.on('join_room', (roomId: string) => {
    socket.join(roomId);
    console.log(`User ${user?.id} joined room ${roomId}`);
  });

  // Leave a room
  socket.on('leave_room', (roomId: string) => {
    socket.leave(roomId);
  });

  // Send a message
  socket.on('send_message', async (data: { roomId: string; content: string }) => {
    try {
      const { roomId, content } = data;
      if (!content || !roomId) return;

      // Verify user is a participant
      const participant = await prisma.chatRoomUser.findUnique({
        where: { userId_chatRoomId: { userId: user.id, chatRoomId: roomId } },
      });
      if (!participant) {
        socket.emit('error', { message: 'Not a participant of this room.' });
        return;
      }

      // Save message to DB
      const message = await prisma.message.create({
        data: { content, senderId: user.id, chatRoomId: roomId },
        include: { sender: { select: { id: true, name: true } } },
      });

      // Broadcast to all room members
      io.to(roomId).emit('receive_message', message);

      // Check for offline members and send push notifications
      const roomUsers = await prisma.chatRoomUser.findMany({
        where: { chatRoomId: roomId },
        include: { user: { select: { id: true, fcmToken: true } } },
      });

      for (const ru of roomUsers) {
        if (ru.userId !== user.id && ru.user.fcmToken) {
          // Always send FCM notification. If app is in foreground, FCM hides it (or we can handle it locally).
          // If app is in background, the system tray notification will show up!
          fcmService.sendNotification(
            ru.user.fcmToken,
            message.sender.name,
            message.content,
            { roomId, type: 'message' }
          );
        }
      }
    } catch (err) {
      console.error('Send Message Error:', err);
      socket.emit('error', { message: 'Failed to send message.' });
    }
  });

  // ─── WebRTC Signaling ──────────────────────────────────────────────
  socket.on('call_user', async (data: { userToCall: string; signalData: any; from: string; name: string }) => {
    console.log(`📞 call_user received! Caller: ${data.from}, Receiver: ${data.userToCall}`);
    
    // Always send FCM call payload if possible (to trigger CallKit reliably)
    const receiver = await prisma.user.findUnique({ where: { id: data.userToCall }, select: { fcmToken: true } });
    if (receiver?.fcmToken) {
      fcmService.sendCallPayload(
        receiver.fcmToken,
        data.name,
        data.from,
        JSON.stringify(data.signalData)
      );
    }

    const receiverSocketId = userSocketMap.get(data.userToCall);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('incoming_call', {
        signal: data.signalData,
        from: data.from,
        name: data.name,
      });
    } else if (!receiver?.fcmToken) {
      // No FCM token and offline, reject
      const callerSocketId = userSocketMap.get(data.from);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call_rejected');
      }
    }
  });

  socket.on('answer_call', (data: { to: string; signal: any }) => {
    const callerSocketId = userSocketMap.get(data.to);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call_accepted', data.signal);
    }
  });

  socket.on('ice_candidate', (data: { to: string; candidate: any }) => {
    const peerSocketId = userSocketMap.get(data.to);
    if (peerSocketId) {
      io.to(peerSocketId).emit('ice_candidate', data.candidate);
    }
  });

  socket.on('end_call', (data: { to: string }) => {
    const peerSocketId = userSocketMap.get(data.to);
    if (peerSocketId) {
      io.to(peerSocketId).emit('call_ended');
    }
  });

  socket.on('reject_call', (data: { to: string }) => {
    const callerSocketId = userSocketMap.get(data.to);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call_rejected');
    }
  });

  socket.on('call_busy', (data: { to: string }) => {
    const callerSocketId = userSocketMap.get(data.to);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call_busy');
    }
  });

  socket.on('filter_changed', (data: { to: string, filterIndex: number }) => {
    const peerSocketId = userSocketMap.get(data.to);
    if (peerSocketId) {
      io.to(peerSocketId).emit('filter_changed', { filterIndex: data.filterIndex });
    }
  });

  socket.on('disconnect', () => {
    if (user?.id) {
      userSocketMap.delete(user.id);
    }
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
