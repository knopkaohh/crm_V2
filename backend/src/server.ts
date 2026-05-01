import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Подгружаем .env: сначала из текущей папки (cwd), затем явно из папки backend.
// Так токен и остальные переменные работают при запуске и из backend, и из корня проекта.
dotenv.config();
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
  // Оптимизации Socket.IO
  transports: ['websocket', 'polling'],
  pingInterval: 25000, // Интервал ping (25 секунд)
  pingTimeout: 20000, // Таймаут ping (20 секунд)
  maxHttpBufferSize: 1e6, // Максимальный размер буфера: 1MB
  perMessageDeflate: { // Сжатие сообщений
    threshold: 1024, // Сжимать сообщения > 1KB
  },
  allowEIO3: true, // Совместимость с старыми клиентами
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import clientRoutes from './routes/clients';
import leadRoutes from './routes/leads';
import orderRoutes from './routes/orders';
import taskRoutes from './routes/tasks';
import callRoutes from './routes/calls';
import fileRoutes from './routes/files';
import analyticsRoutes from './routes/analytics';
import notificationRoutes from './routes/notifications';
import chatRoutes from './routes/chats';
import productionCalendarRoutes from './routes/production-calendar';
import telegramRoutes from './routes/telegram';
import projectSalesRoutes from './routes/project-sales';
import { startColdCallsSyncCron } from './utils/cold-calls-cron';

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/production-calendar', productionCalendarRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/project-sales', projectSalesRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io для уведомлений
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-user-room', (userId: string) => {
    socket.join(`user-${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Export io для использования в других модулях
export { io };

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  startColdCallsSyncCron();
}).on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error(`Please stop the process using port ${PORT} or use a different port.`);
    console.error(`To find the process: netstat -ano | findstr :${PORT}`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});
