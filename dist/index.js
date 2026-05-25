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
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Initialize Socket.io with CORS
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*', // Allow all origins for development (update for production)
        methods: ['GET', 'POST'],
    },
});
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Basic API Route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'CampusConnect API is running!' });
});
// WebSocket connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    // Example chat message event
    socket.on('send_message', (data) => {
        console.log('Message received:', data);
        // Broadcast the message to all connected clients
        io.emit('receive_message', data);
    });
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});
// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
