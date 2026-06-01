"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// GET /api/user/me
router.get('/me', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, name: true, email: true, role: true, phone: true,
                department: true, boardRoll: true, regNo: true,
                semester: true, shift: true, group: true,
                employeeId: true, designation: true, createdAt: true,
            },
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json(user);
    }
    catch (error) {
        console.error('Fetch Profile Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/user/me — update own profile
router.patch('/me', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { name, phone, department, semester, shift, group, designation } = req.body;
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { name, phone, department, semester, shift, group, designation },
            select: {
                id: true, name: true, email: true, role: true, phone: true,
                department: true, semester: true, shift: true, group: true, designation: true,
            },
        });
        res.json(updated);
    }
    catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/user/fcm-token — update fcm token
router.patch('/fcm-token', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { fcmToken } = req.body;
        await prisma.user.update({
            where: { id: userId },
            data: { fcmToken },
        });
        res.json({ message: 'FCM token updated successfully' });
    }
    catch (error) {
        console.error('Update FCM Token Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/user/all — list all students (for teachers)
router.get('/all', auth_1.authenticateToken, async (req, res) => {
    try {
        const { role } = req.user;
        if (role !== 'TEACHER' && role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const { department, search } = req.query;
        const students = await prisma.user.findMany({
            where: {
                role: 'STUDENT',
                ...(department ? { department: department } : {}),
                ...(search ? { OR: [{ name: { contains: search } }, { boardRoll: { contains: search } }] } : {}),
            },
            select: {
                id: true, name: true, email: true, department: true,
                semester: true, shift: true, group: true, boardRoll: true, regNo: true,
            },
            orderBy: { name: 'asc' },
        });
        res.json(students);
    }
    catch (error) {
        console.error('Get All Users Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/users/search — search users for chatting (accessible by any logged in user)
router.get('/search', auth_1.authenticateToken, async (req, res) => {
    try {
        const { query, role } = req.query;
        const currentUserId = req.user?.id;
        if (!currentUserId)
            return res.status(401).json({ error: 'Unauthorized' });
        // Base conditions: Don't return the current user, only APPROVED users
        const whereClause = {
            id: { not: currentUserId },
            status: 'APPROVED',
            role: { in: ['STUDENT', 'TEACHER'] }, // Only chat with students or teachers
        };
        if (role && role !== 'ALL') {
            whereClause.role = role;
        }
        if (query) {
            whereClause.OR = [
                { name: { contains: query } },
                { boardRoll: { contains: query } },
                { employeeId: { contains: query } },
            ];
        }
        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                role: true,
                department: true,
                semester: true,
                designation: true,
            },
            take: 20, // Limit results
            orderBy: { name: 'asc' },
        });
        res.json(users);
    }
    catch (error) {
        console.error('Search Users Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
