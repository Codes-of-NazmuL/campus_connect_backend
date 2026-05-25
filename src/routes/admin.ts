import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireAdmin, requireRoles } from '../middleware/admin';

// Auto-assign user to dynamic chat groups based on matching filters
async function autoAssignToDynamicChatGroups(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'STUDENT' || user.status !== 'APPROVED') return;

  // Find all dynamic chat rooms
  const dynamicRooms = await prisma.chatRoom.findMany({
    where: {
      isGroup: true,
      OR: [
        { targetDepartment: { not: null } },
        { targetSemester: { not: null } },
        { targetShift: { not: null } }
      ]
    }
  });

  for (const room of dynamicRooms) {
    let matches = true;
    if (room.targetDepartment && room.targetDepartment !== user.department) matches = false;
    if (room.targetSemester && room.targetSemester !== user.semester) matches = false;
    if (room.targetShift && room.targetShift !== user.shift) matches = false;

    if (matches) {
      // Connect user to chat room if not already connected
      await prisma.chatRoomUser.upsert({
        where: {
          userId_chatRoomId: {
            userId: user.id,
            chatRoomId: room.id,
          }
        },
        update: {}, // Do nothing if already connected
        create: {
          userId: user.id,
          chatRoomId: room.id,
        }
      });
    }
  }
}

const router = Router();
const prisma = new PrismaClient();

// GET /api/admin/stats
router.get('/stats', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const [totalUsers, students, teachers, announcements, pendingApprovals] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.announcement.count(),
      prisma.user.count({ where: { status: 'PENDING' } }),
    ]);
    res.json({ totalUsers, students, teachers, announcements, pendingApprovals });
  } catch (error) {
    console.error('Admin Stats Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/analytics
router.get('/analytics', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    // Dummy trend data for last 7 days (Ideally generated via group by createdAt)
    const trendData = [
      { name: 'Mon', users: 12 },
      { name: 'Tue', users: 19 },
      { name: 'Wed', users: 15 },
      { name: 'Thu', users: 22 },
      { name: 'Fri', users: 30 },
      { name: 'Sat', users: 18 },
      { name: 'Sun', users: 25 },
    ];

    // Get departments distribution
    const users = await prisma.user.findMany({
      where: { role: 'STUDENT', department: { not: null } },
      select: { department: true }
    });

    const deptCounts: Record<string, number> = {};
    users.forEach((u: any) => {
      const d = u.department || 'Unknown';
      deptCounts[d] = (deptCounts[d] || 0) + 1;
    });

    const departmentData = Object.entries(deptCounts).map(([name, count]) => ({ name, value: count }));
    if (departmentData.length === 0) {
      departmentData.push({ name: 'CSE', value: 120 }, { name: 'EEE', value: 85 }, { name: 'BBA', value: 60 });
    }

    const [totalMessages, totalChatRooms] = await Promise.all([
      prisma.message.count(),
      prisma.chatRoom.count()
    ]);

    res.json({
      trendData,
      departmentData,
      totalMessages,
      totalChatRooms
    });
  } catch (error) {
    console.error('Analytics Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/users — list all users
router.get('/users', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const { role, search } = req.query;
    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role: role as string } : {}),
        ...(search ? { OR: [{ name: { contains: search as string } }, { email: { contains: search as string } }] } : {}),
      },
      select: {
        id: true, name: true, email: true, role: true, status: true,
        department: true, phone: true, createdAt: true,
        boardRoll: true, regNo: true, semester: true, employeeId: true, designation: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error('Admin Get Users Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id/role — change user role
router.patch('/users/:id/role', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { role } = req.body;
    if (!['STUDENT', 'TEACHER', 'ADMIN', 'PRINCIPAL', 'EXAM_CONTROLLER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    res.json(user);
  } catch (error) {
    console.error('Admin Update Role Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id/status — change user status
router.patch('/users/:id/status', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { status },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    res.json(user);
  } catch (error) {
    console.error('Admin Update Status Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/users/:id — update user profile fields
router.put('/users/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { 
      name, email, phone, department, 
      boardRoll, regNo, semester, shift, group, 
      employeeId, designation 
    } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (department !== undefined) data.department = department;
    if (boardRoll !== undefined) data.boardRoll = boardRoll;
    if (regNo !== undefined) data.regNo = regNo;
    if (semester !== undefined) data.semester = semester;
    if (shift !== undefined) data.shift = shift;
    if (group !== undefined) data.group = group;
    if (employeeId !== undefined) data.employeeId = employeeId;
    if (designation !== undefined) data.designation = designation;

    const user = await prisma.user.update({
      where: { id: id as string },
      data,
    });
    
    if (user.status === 'APPROVED') {
      await autoAssignToDynamicChatGroups(user.id);
    }
    
    // Omit password
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Admin Update User Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Admin Delete User Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/announcements — all announcements (admin view)
router.get('/announcements', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const announcements = await prisma.announcement.findMany({
      include: { author: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NOTICES CRUD

router.get('/notices', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const notices = await prisma.notice.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(notices);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/notices', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const { title, content, fileUrl } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    const notice = await prisma.notice.create({
      data: { title, content, fileUrl }
    });
    res.status(201).json(notice);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/notices/:id', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    await prisma.notice.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Notice deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/chat-groups — view all group chats
router.get('/chat-groups', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const groups = await prisma.chatRoom.findMany({
      where: { isGroup: true },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, role: true, department: true } } }
        },
        _count: { select: { messages: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(groups);
  } catch (error) {
    console.error('Get Chat Groups Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/chat-groups — admin create group chat
router.post('/chat-groups', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const { name, participantIds, department, semester, shift } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    const uniqueParticipants = new Set((participantIds || []) as string[]);

    // Find all users matching department, semester, shift
    const query: any = { role: 'STUDENT' };
    let hasFilters = false;
    if (department) { query.department = department; hasFilters = true; }
    if (semester) { query.semester = semester; hasFilters = true; }
    if (shift) { query.shift = shift; hasFilters = true; }

    if (hasFilters) {
      const matchedStudents = await prisma.user.findMany({ where: query, select: { id: true } });
      matchedStudents.forEach(s => uniqueParticipants.add(s.id));
    }

    const finalParticipants = Array.from(uniqueParticipants);
    if (finalParticipants.length === 0) {
      return res.status(400).json({ error: 'At least one participant or valid filter is required.' });
    }

    const room = await prisma.chatRoom.create({
      data: {
        name,
        isGroup: true,
        targetDepartment: department || null,
        targetSemester: semester || null,
        targetShift: shift || null,
        participants: {
          create: finalParticipants.map((uid) => ({ userId: uid as string })),
        },
      },
      include: {
        participants: { include: { user: { select: { id: true, name: true, role: true, department: true } } } },
      },
    });

    res.status(201).json(room);
  } catch (error) {
    console.error('Create Chat Group Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/chat-groups/:id — admin edit group chat
router.put('/chat-groups/:id', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { name, participantIds, department, semester, shift } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    const uniqueParticipants = new Set((participantIds || []) as string[]);

    // Find all users matching department, semester, shift
    const query: any = { role: 'STUDENT' };
    let hasFilters = false;
    if (department) { query.department = department; hasFilters = true; }
    if (semester) { query.semester = semester; hasFilters = true; }
    if (shift) { query.shift = shift; hasFilters = true; }

    if (hasFilters) {
      const matchedStudents = await prisma.user.findMany({ where: query, select: { id: true } });
      matchedStudents.forEach(s => uniqueParticipants.add(s.id));
    }

    const finalParticipants = Array.from(uniqueParticipants);
    if (finalParticipants.length === 0) {
      return res.status(400).json({ error: 'At least one participant or valid filter is required.' });
    }

    // Update group name and clear old participants, then add new ones
    // Since Prisma nested mutations for many-to-many with implicit/explicit join tables can be tricky,
    // we delete existing participants and create new ones.
    await prisma.$transaction([
      prisma.chatRoom.update({
        where: { id: id as string },
        data: { 
          name,
          targetDepartment: department || null,
          targetSemester: semester || null,
          targetShift: shift || null,
        },
      }),
      prisma.chatRoomUser.deleteMany({
        where: { chatRoomId: id },
      }),
      prisma.chatRoomUser.createMany({
        data: finalParticipants.map(uid => ({
          chatRoomId: id,
          userId: uid as string,
        })),
      }),
    ]);

    const updatedRoom = await prisma.chatRoom.findUnique({
      where: { id },
      include: {
        participants: { include: { user: { select: { id: true, name: true, role: true, department: true } } } },
        _count: { select: { messages: true } }
      },
    });

    res.json(updatedRoom);
  } catch (error) {
    console.error('Update Chat Group Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/chat-groups/:id — admin delete group chat
router.delete('/chat-groups/:id', authenticateToken, requireRoles(['ADMIN', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    await prisma.chatRoom.delete({
      where: { id },
    });
    res.json({ message: 'Chat group deleted successfully.' });
  } catch (error) {
    console.error('Delete Chat Group Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
