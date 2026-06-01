"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const fcm_service_1 = require("./services/fcm.service");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me';
// Initialize Socket.io with CORS
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const user_1 = __importDefault(require("./routes/user"));
const announcements_1 = __importDefault(require("./routes/announcements"));
const chat_1 = __importDefault(require("./routes/chat"));
const admin_1 = __importDefault(require("./routes/admin"));
const exam_1 = __importDefault(require("./routes/exam"));
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'CampusConnect API is running!' });
});
// Mount Routes
app.use('/api/auth', auth_1.default);
app.use('/api/users', user_1.default);
app.use('/api/announcements', announcements_1.default);
app.use('/api/chat', chat_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/exam', exam_1.default);
// ─── Socket.io Real-time Chat ──────────────────────────────────────────
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token)
        return next(new Error('Authentication required'));
    try {
        const user = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        socket.user = user;
        next();
    }
    catch {
        next(new Error('Invalid token'));
    }
});
const userSocketMap = new Map();
io.on('connection', async (socket) => {
    const user = socket.user;
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
    }
    catch (err) {
        console.error('Error auto-joining rooms:', err);
    }
    // Explicitly join a chat room (e.g., when a new one is created)
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${user?.id} joined room ${roomId}`);
    });
    // Leave a room
    socket.on('leave_room', (roomId) => {
        socket.leave(roomId);
    });
    // Send a message
    socket.on('send_message', async (data) => {
        try {
            const { roomId, content } = data;
            if (!content || !roomId)
                return;
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
                    fcm_service_1.fcmService.sendNotification(ru.user.fcmToken, message.sender.name, message.content, { roomId, type: 'message' });
                }
            }
        }
        catch (err) {
            console.error('Send Message Error:', err);
            socket.emit('error', { message: 'Failed to send message.' });
        }
    });
    // ─── WebRTC Signaling ──────────────────────────────────────────────
    socket.on('call_user', async (data) => {
        console.log(`📞 call_user received! Caller: ${data.from}, Receiver: ${data.userToCall}`);
        // Always send FCM call payload if possible (to trigger CallKit reliably)
        const receiver = await prisma.user.findUnique({ where: { id: data.userToCall }, select: { fcmToken: true } });
        if (receiver?.fcmToken) {
            fcm_service_1.fcmService.sendCallPayload(receiver.fcmToken, data.name, data.from, JSON.stringify(data.signalData));
        }
        const receiverSocketId = userSocketMap.get(data.userToCall);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('incoming_call', {
                signal: data.signalData,
                from: data.from,
                name: data.name,
            });
        }
        else if (!receiver?.fcmToken) {
            // No FCM token and offline, reject
            const callerSocketId = userSocketMap.get(data.from);
            if (callerSocketId) {
                io.to(callerSocketId).emit('call_rejected');
            }
        }
    });
    socket.on('answer_call', (data) => {
        const callerSocketId = userSocketMap.get(data.to);
        if (callerSocketId) {
            io.to(callerSocketId).emit('call_accepted', data.signal);
        }
    });
    socket.on('ice_candidate', (data) => {
        const peerSocketId = userSocketMap.get(data.to);
        if (peerSocketId) {
            io.to(peerSocketId).emit('ice_candidate', data.candidate);
        }
    });
    socket.on('end_call', (data) => {
        const peerSocketId = userSocketMap.get(data.to);
        if (peerSocketId) {
            io.to(peerSocketId).emit('call_ended');
        }
    });
    socket.on('reject_call', (data) => {
        const callerSocketId = userSocketMap.get(data.to);
        if (callerSocketId) {
            io.to(callerSocketId).emit('call_rejected');
        }
    });
    socket.on('call_busy', (data) => {
        const callerSocketId = userSocketMap.get(data.to);
        if (callerSocketId) {
            io.to(callerSocketId).emit('call_busy');
        }
    });
    socket.on('filter_changed', (data) => {
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
