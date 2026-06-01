"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// GET /api/chat/rooms — get all rooms for current user
router.get('/rooms', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const rooms = await prisma.chatRoom.findMany({
            where: {
                participants: { some: { userId } },
            },
            include: {
                participants: {
                    include: { user: { select: { id: true, name: true, role: true } } },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: { sender: { select: { id: true, name: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(rooms);
    }
    catch (error) {
        console.error('Get Rooms Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/chat/rooms — create a DM or group room
router.post('/rooms', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { participantIds, name, isGroup } = req.body;
        if (!participantIds || !Array.isArray(participantIds)) {
            return res.status(400).json({ error: 'participantIds array is required.' });
        }
        const allParticipants = [...new Set([userId, ...participantIds])];
        // For DMs, check if room already exists
        if (!isGroup && allParticipants.length === 2) {
            const existing = await prisma.chatRoom.findFirst({
                where: {
                    isGroup: false,
                    participants: {
                        every: { userId: { in: allParticipants } },
                    },
                },
                include: {
                    participants: { include: { user: { select: { id: true, name: true } } } },
                    messages: { take: 1 },
                },
            });
            if (existing)
                return res.json(existing);
        }
        const room = await prisma.chatRoom.create({
            data: {
                name: name || null,
                isGroup: isGroup || false,
                participants: {
                    create: allParticipants.map((uid) => ({ userId: uid })),
                },
            },
            include: {
                participants: { include: { user: { select: { id: true, name: true } } } },
                messages: { take: 1 },
            },
        });
        res.status(201).json(room);
    }
    catch (error) {
        console.error('Create Room Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/chat/rooms/:roomId/messages
router.get('/rooms/:roomId/messages', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Verify user is participant
        const participant = await prisma.chatRoomUser.findUnique({
            where: { userId_chatRoomId: { userId, chatRoomId: req.params.roomId } },
        });
        if (!participant)
            return res.status(403).json({ error: 'Not a participant.' });
        const messages = await prisma.message.findMany({
            where: { chatRoomId: req.params.roomId },
            include: { sender: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        res.json(messages);
    }
    catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/chat/rooms/:roomId/leave
router.delete('/rooms/:roomId/leave', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { roomId } = req.params;
        // Delete the participant record
        await prisma.chatRoomUser.deleteMany({
            where: {
                userId,
                chatRoomId: roomId,
            },
        });
        res.json({ success: true, message: 'Left chat room successfully' });
    }
    catch (error) {
        console.error('Leave Room Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
