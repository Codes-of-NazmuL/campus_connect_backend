"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const admin_1 = require("../middleware/admin");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Only EXAM_CONTROLLER (and maybe ADMIN) can manage these
const examControllerRoles = ['ADMIN', 'EXAM_CONTROLLER'];
// --- SCHEDULES ---
router.get('/schedules', auth_1.authenticateToken, async (req, res) => {
    try {
        const { department, semester } = req.query;
        const whereClause = {};
        if (department)
            whereClause.department = department;
        if (semester)
            whereClause.semester = semester;
        const schedules = await prisma.schedule.findMany({
            where: whereClause,
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        });
        res.json(schedules);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/schedules', auth_1.authenticateToken, (0, admin_1.requireRoles)(examControllerRoles), async (req, res) => {
    try {
        const { title, subject, date, startTime, endTime, room, type, department, semester, shift, group } = req.body;
        if (!title || !subject || !date || !startTime || !endTime || !department || !semester) {
            return res.status(400).json({ error: 'Missing required fields: title, subject, date, startTime, endTime, department, semester' });
        }
        const schedule = await prisma.schedule.create({
            data: { title, subject, date, startTime, endTime, room, type: type || 'EXAM', department, semester, shift, group }
        });
        res.status(201).json(schedule);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/schedules/:id', auth_1.authenticateToken, (0, admin_1.requireRoles)(examControllerRoles), async (req, res) => {
    try {
        await prisma.schedule.delete({ where: { id: req.params.id } });
        res.json({ message: 'Schedule deleted.' });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// --- STUDENTS ---
router.get('/students', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'EXAM_CONTROLLER']), async (req, res) => {
    try {
        const { department, semester, shift, group } = req.query;
        // Build query conditions
        const whereClause = { role: 'STUDENT', status: 'APPROVED' };
        if (department)
            whereClause.department = department;
        if (semester)
            whereClause.semester = semester;
        if (shift)
            whereClause.shift = shift;
        if (group)
            whereClause.group = group;
        const students = await prisma.user.findMany({
            where: whereClause,
            select: { boardRoll: true },
        });
        // Extract valid board rolls and sort them sequentially
        const rolls = students
            .map(s => s.boardRoll)
            .filter(Boolean)
            .sort((a, b) => {
            // basic sort: if they are numeric strings, sort numerically
            const numA = parseInt(a || '0');
            const numB = parseInt(b || '0');
            if (!isNaN(numA) && !isNaN(numB))
                return numA - numB;
            return (a || '').localeCompare(b || '');
        });
        res.json(rolls);
    }
    catch (error) {
        console.error('Fetch students error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// --- EXAM SEATS ---
router.get('/exam-seats', auth_1.authenticateToken, async (req, res) => {
    try {
        const seats = await prisma.examSeat.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(seats);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/exam-seats', auth_1.authenticateToken, (0, admin_1.requireRoles)(['ADMIN', 'EXAM_CONTROLLER']), async (req, res) => {
    try {
        const { title, fileUrl, rows, columns, layoutJson, department, semester, shift, group } = req.body;
        if (!title || !department || !semester) {
            return res.status(400).json({ error: 'Title, department, and semester are required.' });
        }
        const examSeat = await prisma.examSeat.create({
            data: {
                title, fileUrl,
                rows: rows || 0,
                columns: columns || 0,
                layoutJson: layoutJson || '[]',
                department, semester, shift, group
            },
        });
        res.status(201).json(examSeat);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/exam-seats/:id', auth_1.authenticateToken, (0, admin_1.requireRoles)(examControllerRoles), async (req, res) => {
    try {
        await prisma.examSeat.delete({ where: { id: req.params.id } });
        res.json({ message: 'Exam seat deleted.' });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// --- RESULTS ---
router.get('/results', auth_1.authenticateToken, async (req, res) => {
    try {
        const results = await prisma.result.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(results);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/results', auth_1.authenticateToken, (0, admin_1.requireRoles)(examControllerRoles), async (req, res) => {
    try {
        const { title, fileUrl, department, semester, shift, group } = req.body;
        if (!title || !fileUrl || !department || !semester) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const result = await prisma.result.create({
            data: { title, fileUrl, department, semester, shift, group }
        });
        res.status(201).json(result);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/results/:id', auth_1.authenticateToken, (0, admin_1.requireRoles)(examControllerRoles), async (req, res) => {
    try {
        await prisma.result.delete({ where: { id: req.params.id } });
        res.json({ message: 'Result deleted.' });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
