"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const admin_1 = require("../middleware/admin");
const child_process_1 = require("child_process");
const util_1 = __importDefault(require("util"));
const execPromise = util_1.default.promisify(child_process_1.exec);
// Auto-assign user to dynamic chat groups based on matching filters
async function autoAssignToDynamicChatGroups(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'STUDENT' || user.status !== 'APPROVED')
        return;
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
        if (room.targetDepartment && room.targetDepartment !== user.department)
            matches = false;
        if (room.targetSemester && room.targetSemester !== user.semester)
            matches = false;
        if (room.targetShift && room.targetShift !== user.shift)
            matches = false;
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
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// GET /api/admin/stats
router.get('/stats', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
    try {
        const [totalUsers, students, teachers, announcements, pendingApprovals] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { role: 'STUDENT' } }),
            prisma.user.count({ where: { role: 'TEACHER' } }),
            prisma.announcement.count(),
            prisma.user.count({ where: { status: 'PENDING' } }),
        ]);
        res.json({ totalUsers, students, teachers, announcements, pendingApprovals });
    }
    catch (error) {
        console.error('Admin Stats Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/admin/analytics
router.get('/analytics', auth_1.authenticateToken, admin_1.requireAdmin, async (req, res) => {
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
        const deptCounts = {};
        users.forEach((u) => {
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
    }
    catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/admin/users — list all users
router.get('/users', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
    try {
        const { role, search } = req.query;
        const users = await prisma.user.findMany({
            where: {
                ...(role ? { role: role } : {}),
                ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] } : {}),
            },
            select: {
                id: true, name: true, email: true, role: true, status: true,
                department: true, phone: true, createdAt: true,
                boardRoll: true, regNo: true, semester: true, employeeId: true, designation: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(users);
    }
    catch (error) {
        console.error('Admin Get Users Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/admin/users/:id/role — change user role
router.patch('/users/:id/role', auth_1.authenticateToken, admin_1.requireAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['STUDENT', 'TEACHER', 'ADMIN', 'PRINCIPAL', 'EXAM_CONTROLLER'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role.' });
        }
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { role },
            select: { id: true, name: true, email: true, role: true },
        });
        res.json(user);
    }
    catch (error) {
        console.error('Admin Update Role Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/admin/users/:id/status — change user status
router.patch('/users/:id/status', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
    try {
        const { status } = req.body;
        if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { status },
            select: { id: true, name: true, email: true, role: true, status: true },
        });
        res.json(user);
    }
    catch (error) {
        console.error('Admin Update Status Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/admin/users/:id — update user profile fields
router.put('/users/:id', auth_1.authenticateToken, admin_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, department, boardRoll, regNo, semester, shift, group, employeeId, designation } = req.body;
        const data = {};
        if (name !== undefined)
            data.name = name;
        if (email !== undefined)
            data.email = email;
        if (phone !== undefined)
            data.phone = phone;
        if (department !== undefined)
            data.department = department;
        if (boardRoll !== undefined)
            data.boardRoll = boardRoll;
        if (regNo !== undefined)
            data.regNo = regNo;
        if (semester !== undefined)
            data.semester = semester;
        if (shift !== undefined)
            data.shift = shift;
        if (group !== undefined)
            data.group = group;
        if (employeeId !== undefined)
            data.employeeId = employeeId;
        if (designation !== undefined)
            data.designation = designation;
        const user = await prisma.user.update({
            where: { id: id },
            data,
        });
        if (user.status === 'APPROVED') {
            await autoAssignToDynamicChatGroups(user.id);
        }
        // Omit password
        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    }
    catch (error) {
        console.error('Admin Update User Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/admin/users/:id
router.delete('/users/:id', auth_1.authenticateToken, admin_1.requireAdmin, async (req, res) => {
    try {
        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ message: 'User deleted successfully.' });
    }
    catch (error) {
        console.error('Admin Delete User Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/admin/announcements — all announcements (admin view)
router.get('/announcements', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
    try {
        const announcements = await prisma.announcement.findMany({
            include: { author: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(announcements);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// NOTICES CRUD
router.get('/notices', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
    try {
        const notices = await prisma.notice.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(notices);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/notices', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
    try {
        const { title, content, fileUrl } = req.body;
        if (!title || !content)
            return res.status(400).json({ error: 'Title and content required' });
        const notice = await prisma.notice.create({
            data: { title, content, fileUrl }
        });
        res.status(201).json(notice);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/notices/:id', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
    try {
        await prisma.notice.delete({ where: { id: req.params.id } });
        res.json({ message: 'Notice deleted.' });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/admin/chat-groups — view all group chats
router.get('/chat-groups', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
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
    }
    catch (error) {
        console.error('Get Chat Groups Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/admin/chat-groups — admin create group chat
router.post('/chat-groups', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
    try {
        const { name, participantIds, department, semester, shift } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required.' });
        }
        const uniqueParticipants = new Set((participantIds || []));
        // Find all users matching department, semester, shift
        const query = { role: 'STUDENT' };
        let hasFilters = false;
        if (department) {
            query.department = department;
            hasFilters = true;
        }
        if (semester) {
            query.semester = semester;
            hasFilters = true;
        }
        if (shift) {
            query.shift = shift;
            hasFilters = true;
        }
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
                    create: finalParticipants.map((uid) => ({ userId: uid })),
                },
            },
            include: {
                participants: { include: { user: { select: { id: true, name: true, role: true, department: true } } } },
            },
        });
        res.status(201).json(room);
    }
    catch (error) {
        console.error('Create Chat Group Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/admin/chat-groups/:id — admin edit group chat
router.put('/chat-groups/:id', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
    try {
        const id = req.params.id;
        const { name, participantIds, department, semester, shift } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required.' });
        }
        const uniqueParticipants = new Set((participantIds || []));
        // Find all users matching department, semester, shift
        const query = { role: 'STUDENT' };
        let hasFilters = false;
        if (department) {
            query.department = department;
            hasFilters = true;
        }
        if (semester) {
            query.semester = semester;
            hasFilters = true;
        }
        if (shift) {
            query.shift = shift;
            hasFilters = true;
        }
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
                where: { id: id },
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
                    userId: uid,
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
    }
    catch (error) {
        console.error('Update Chat Group Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/admin/chat-groups/:id — admin delete group chat
router.delete('/chat-groups/:id', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'PRINCIPAL']), async (req, res) => {
    try {
        const id = req.params.id;
        await prisma.chatRoom.delete({
            where: { id },
        });
        res.json({ message: 'Chat group deleted successfully.' });
    }
    catch (error) {
        console.error('Delete Chat Group Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/admin/logs — view server PM2 logs
router.get('/logs', auth_1.authenticateToken, admin_1.requireAdmin, async (req, res) => {
    try {
        // Attempt to run pm2 logs for the 'backend' process.
        // Use --nostream to prevent it from hanging, and get the last 200 lines.
        const { stdout, stderr } = await execPromise('pm2 logs backend --lines 200 --nostream');
        res.json({ logs: stdout || stderr });
    }
    catch (error) {
        console.error('Fetch Logs Error:', error);
        // If pm2 is not found or fails (e.g. running locally without pm2), return an error message
        res.json({ logs: `Log fetch failed. You might not be running in a PM2 environment.\n\nError: ${error.message}` });
    }
});
exports.default = router;
