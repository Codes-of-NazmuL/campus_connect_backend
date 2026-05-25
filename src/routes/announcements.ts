import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/announcements — list all, filterable by role target
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
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
  } catch (error) {
    console.error('Get Announcements Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/announcements — create (Teacher or Admin only)
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { role, id: authorId } = req.user!;
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
        authorId: authorId!,
      },
      include: {
        author: { select: { id: true, name: true, designation: true } },
      },
    });

    res.status(201).json(announcement);
  } catch (error) {
    console.error('Create Announcement Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/announcements/:id (author or admin)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id: userId, role } = req.user!;
    const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id as string } });

    if (!announcement) return res.status(404).json({ error: 'Announcement not found.' });
    if (announcement.authorId !== userId && role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    await prisma.announcement.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Announcement deleted.' });
  } catch (error) {
    console.error('Delete Announcement Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
