import { Server } from 'socket.io';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: ["http://localhost:5173", "https://rcssender.com"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Join user-specific room
    socket.on('joinUser', (userId) => {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined room`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

// Emit message updates to specific user
export const emitMessageUpdate = (userId, campaignName, data) => {
  if (io) {
    io.to(`user_${userId}`).emit('messageUpdate', { campaignName, ...data });
  }
};

// Emit new message created
export const emitNewMessage = (userId, message) => {
  if (io) {
    io.to(`user_${userId}`).emit('newMessage', message);
  }
};

// Emit message deleted
export const emitMessageDeleted = (userId, messageId) => {
  if (io) {
    io.to(`user_${userId}`).emit('messageDeleted', { messageId });
  }
};

// Emit batch progress
export const emitBatchProgress = (userId, data) => {
  if (io) {
    io.to(`user_${userId}`).emit('batchProgress', data);
  }
};

// Emit capability check progress
export const emitCapabilityProgress = (userId, data) => {
  if (io) {
    io.to(`user_${userId}`).emit('capabilityProgress', data);
  }
};

// Emit Excel import progress
export const emitImportProgress = (userId, data) => {
  if (io) {
    io.to(`user_${userId}`).emit('importProgress', data);
  }
};