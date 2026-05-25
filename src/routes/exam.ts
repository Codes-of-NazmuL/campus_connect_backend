import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireRoles } from '../middleware/admin';

const router = Router();
const prisma = new PrismaClient();

// Only EXAM_CONTROLLER (and maybe ADMIN) can manage these
const examControllerRoles = ['ADMIN', 'EXAM_CONTROLLER'];

// --- SCHEDULES ---
router.get('/schedules', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { department, semester } = req.query;
    const whereClause: any = {};
    if (department) whereClause.department = department as string;
    if (semester) whereClause.semester = semester as string;

    const schedules = await prisma.schedule.findMany({
      where: whereClause,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/schedules', authenticateToken, requireRoles(examControllerRoles), async (req: AuthRequest, res) => {
  try {
    const { title, subject, date, startTime, endTime, room, type, department, semester, shift, group } = req.body;
    if (!title || !subject || !date || !startTime || !endTime || !department || !semester) {
      return res.status(400).json({ error: 'Missing required fields: title, subject, date, startTime, endTime, department, semester' });
    }
    const schedule = await prisma.schedule.create({
      data: { title, subject, date, startTime, endTime, room, type: type || 'EXAM', department, semester, shift, group }
    });
    res.status(201).json(schedule);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/schedules/:id', authenticateToken, requireRoles(examControllerRoles), async (req: AuthRequest, res) => {
  try {
    await prisma.schedule.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Schedule deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- STUDENTS ---
router.get('/students', authenticateToken, requireRoles(['ADMIN', 'EXAM_CONTROLLER']), async (req: AuthRequest, res) => {
  try {
    const { department, semester, shift, group } = req.query;
    
    // Build query conditions
    const whereClause: any = { role: 'STUDENT', status: 'APPROVED' };
    if (department) whereClause.department = department as string;
    if (semester) whereClause.semester = semester as string;
    if (shift) whereClause.shift = shift as string;
    if (group) whereClause.group = group as string;

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
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return (a || '').localeCompare(b || '');
      });

    res.json(rolls);
  } catch (error) {
    console.error('Fetch students error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- EXAM SEATS ---
router.get('/exam-seats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const seats = await prisma.examSeat.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(seats);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/exam-seats', authenticateToken, requireRoles(['ADMIN', 'EXAM_CONTROLLER']), async (req: AuthRequest, res) => {
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
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/exam-seats/:id', authenticateToken, requireRoles(examControllerRoles), async (req: AuthRequest, res) => {
  try {
    await prisma.examSeat.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Exam seat deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- RESULTS ---
router.get('/results', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const results = await prisma.result.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/results', authenticateToken, requireRoles(examControllerRoles), async (req: AuthRequest, res) => {
  try {
    const { title, fileUrl, department, semester, shift, group } = req.body;
    if (!title || !fileUrl || !department || !semester) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await prisma.result.create({
      data: { title, fileUrl, department, semester, shift, group }
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/results/:id', authenticateToken, requireRoles(examControllerRoles), async (req: AuthRequest, res) => {
  try {
    await prisma.result.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Result deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
