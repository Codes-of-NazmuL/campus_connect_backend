"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// GET /api/announcements — list all, filterable by role target
router.get('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const role = req.user?.role ?? 'STUDENT';
        const announcements = await prisma.announcement.findMany({
            where: {
                OR: [
                    { target: 'ALL' },
                    { target: role },
                ],
            },
            include: {
                author: { select: { id: true, name: true, designation: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        res.json(announcements);
    }
    catch (error) {
        console.error('Get Announcements Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/announcements — create (Teacher or Admin only)
router.post('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const { role, id: authorId } = req.user;
        if (role !== 'TEACHER' && role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only teachers and admins can post announcements.' });
        }
        const { title, content, target } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required.' });
        }
        const announcement = await prisma.announcement.create({
            data: {
                title,
                content,
                target: target || 'ALL',
                authorId: authorId,
            },
            include: {
                author: { select: { id: true, name: true, designation: true } },
            },
        });
        res.status(201).json(announcement);
    }
    catch (error) {
        console.error('Create Announcement Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/announcements/:id (author or admin)
router.delete('/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
        if (!announcement)
            return res.status(404).json({ error: 'Announcement not found.' });
        if (announcement.authorId !== userId && role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        await prisma.announcement.delete({ where: { id: req.params.id } });
        res.json({ message: 'Announcement deleted.' });
    }
    catch (error) {
        console.error('Delete Announcement Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
