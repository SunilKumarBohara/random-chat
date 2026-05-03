const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve public folder as static files
app.use(express.static(path.join(__dirname, 'public')));

// Queue management
const waitingWithInterests = []; // [{socketId, interests, timestamp}, ...]
const waitingGeneral = [];        // [{socketId, interests, timestamp}, ...]
const activePairs = new Map();    // socketId -> {partnerSocketId, sharedInterests: [...]}
const userSessions = new Map();   // socketId -> {interests, userName}
const interestTimeouts = new Map(); // socketId -> timeoutId (for 10s interest matching timeout)

const PORT = process.env.PORT || 3000;

// Helper: Calculate interest overlap
function getSharedInterests(interests1, interests2) {
  if (!interests1 || !interests2) return [];
  
  const set1 = new Set(
    interests1
      .split(',')
      .map(i => i.trim().toLowerCase())
      .filter(i => i.length > 0)
  );
  
  const set2 = new Set(
    interests2
      .split(',')
      .map(i => i.trim().toLowerCase())
      .filter(i => i.length > 0)
  );

  return Array.from(set1).filter(interest => set2.has(interest));
}

// Helper: Find matching user from waiting queue
function findMatchInQueue(socketId, userInterests, queue) {
  // Don't match with yourself
  for (let i = 0; i < queue.length; i++) {
    if (queue[i].socketId !== socketId) {
      return queue.splice(i, 1)[0]; // Remove and return
    }
  }
  return null;
}

// Helper: Match two users together
function matchUsers(user1, user2) {
  const sharedInterests = getSharedInterests(user1.interests, user2.interests);
  
  // Set up the pair mapping
  activePairs.set(user1.socketId, {
    partnerSocketId: user2.socketId,
    sharedInterests: sharedInterests
  });
  
  activePairs.set(user2.socketId, {
    partnerSocketId: user1.socketId,
    sharedInterests: sharedInterests
  });

  // Emit matched event to both users
  io.to(user1.socketId).emit('matched', {
    sharedInterests: sharedInterests
  });
  
  io.to(user2.socketId).emit('matched', {
    sharedInterests: sharedInterests
  });

  console.log(`[MATCH] ${user1.socketId} <-> ${user2.socketId} | Shared: ${sharedInterests.join(', ') || 'none'}`);
}

// Handle socket connections
io.on('connection', (socket) => {
  console.log(`[CONNECT] User connected: ${socket.id}`);

  // User sends find_match event with their interests
  socket.on('find_match', (data) => {
    const userName = data.userName || 'Anonymous';
    const interests = data.interests || '';

    userSessions.set(socket.id, { userName, interests });

    console.log(`[FIND_MATCH] ${socket.id} searching | Interests: ${interests || 'none'}`);

    // Try to match with someone who has similar interests (from waitingWithInterests queue)
    if (waitingWithInterests.length > 0) {
      const sharedInterests = getSharedInterests(interests, waitingWithInterests[0].interests);
      
      if (sharedInterests.length > 0) {
        // Found a match with common interest
        const match = waitingWithInterests.shift();
        clearTimeout(interestTimeouts.get(match.socketId));
        interestTimeouts.delete(match.socketId);
        matchUsers({ socketId: socket.id, interests }, match);
        return;
      }
    }

    // Try to match from general waiting queue
    if (waitingGeneral.length > 0) {
      const match = waitingGeneral.shift();
      clearTimeout(interestTimeouts.get(match.socketId));
      interestTimeouts.delete(match.socketId);
      matchUsers({ socketId: socket.id, interests }, match);
      return;
    }

    // No match found, add to waitingWithInterests
    const userObj = { socketId: socket.id, interests, timestamp: Date.now() };
    waitingWithInterests.push(userObj);

    // After 10 seconds, move from waitingWithInterests to waitingGeneral
    const timeoutId = setTimeout(() => {
      const index = waitingWithInterests.findIndex(u => u.socketId === socket.id);
      if (index !== -1) {
        const user = waitingWithInterests.splice(index, 1)[0];
        waitingGeneral.push(user);
        console.log(`[TIMEOUT] ${socket.id} moved to general queue after 10s`);

        // Try to match with anyone in general queue
        if (waitingGeneral.length > 1) {
          const match = waitingGeneral.shift();
          clearTimeout(interestTimeouts.get(match.socketId));
          interestTimeouts.delete(match.socketId);
          interestTimeouts.delete(socket.id);
          matchUsers({ socketId: socket.id, interests }, match);
        }
      }
    }, 10000);

    interestTimeouts.set(socket.id, timeoutId);
    socket.emit('looking');
  });

  // User sends a message to their matched partner
  socket.on('message', (data) => {
    const pairInfo = activePairs.get(socket.id);
    
    if (!pairInfo) {
      console.log(`[MESSAGE] ${socket.id} tried to message but not in a pair`);
      return;
    }

    const partnerSocketId = pairInfo.partnerSocketId;
    const messageData = {
      text: data.text,
      timestamp: Date.now()
    };

    // Send message to partner
    io.to(partnerSocketId).emit('message', messageData);
  });

  // User clicks "Next" to skip current partner
  socket.on('next', () => {
    const pairInfo = activePairs.get(socket.id);
    
    if (pairInfo) {
      const partnerSocketId = pairInfo.partnerSocketId;
      
      // Notify partner
      io.to(partnerSocketId).emit('stranger_disconnected');
      
      // Clean up pair mapping
      activePairs.delete(socket.id);
      activePairs.delete(partnerSocketId);
      
      console.log(`[NEXT] ${socket.id} skipped ${partnerSocketId}`);
    }

    // User re-enters queue
    const session = userSessions.get(socket.id);
    if (session) {
      socket.emit('looking');
      
      // Re-add to matching queue
      const userObj = { socketId: socket.id, interests: session.interests, timestamp: Date.now() };
      
      // Check if there's someone waiting
      if (waitingGeneral.length > 0) {
        const match = waitingGeneral.shift();
        clearTimeout(interestTimeouts.get(match.socketId));
        interestTimeouts.delete(match.socketId);
        matchUsers({ socketId: socket.id, interests: session.interests }, match);
      } else if (waitingWithInterests.length > 0) {
        const sharedInterests = getSharedInterests(session.interests, waitingWithInterests[0].interests);
        if (sharedInterests.length > 0) {
          const match = waitingWithInterests.shift();
          clearTimeout(interestTimeouts.get(match.socketId));
          interestTimeouts.delete(match.socketId);
          matchUsers({ socketId: socket.id, interests: session.interests }, match);
        } else {
          waitingWithInterests.push(userObj);
          const timeoutId = setTimeout(() => {
            const index = waitingWithInterests.findIndex(u => u.socketId === socket.id);
            if (index !== -1) {
              const user = waitingWithInterests.splice(index, 1)[0];
              waitingGeneral.push(user);
            }
          }, 10000);
          interestTimeouts.set(socket.id, timeoutId);
        }
      } else {
        waitingWithInterests.push(userObj);
        const timeoutId = setTimeout(() => {
          const index = waitingWithInterests.findIndex(u => u.socketId === socket.id);
          if (index !== -1) {
            const user = waitingWithInterests.splice(index, 1)[0];
            waitingGeneral.push(user);
          }
        }, 10000);
        interestTimeouts.set(socket.id, timeoutId);
      }
    }
  });

  // User clicks "Stop" to end chat entirely
  socket.on('stop', () => {
    const pairInfo = activePairs.get(socket.id);
    
    if (pairInfo) {
      const partnerSocketId = pairInfo.partnerSocketId;
      io.to(partnerSocketId).emit('stranger_disconnected');
      activePairs.delete(socket.id);
      activePairs.delete(partnerSocketId);
    }

    // Remove from all queues
    const wIndex = waitingWithInterests.findIndex(u => u.socketId === socket.id);
    if (wIndex !== -1) {
      waitingWithInterests.splice(wIndex, 1);
    }

    const gIndex = waitingGeneral.findIndex(u => u.socketId === socket.id);
    if (gIndex !== -1) {
      waitingGeneral.splice(gIndex, 1);
    }

    // Clear any pending timeouts
    clearTimeout(interestTimeouts.get(socket.id));
    interestTimeouts.delete(socket.id);

    userSessions.delete(socket.id);
    console.log(`[STOP] ${socket.id} stopped chatting`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] User disconnected: ${socket.id}`);

    const pairInfo = activePairs.get(socket.id);
    
    if (pairInfo) {
      const partnerSocketId = pairInfo.partnerSocketId;
      io.to(partnerSocketId).emit('stranger_disconnected');
      activePairs.delete(socket.id);
      activePairs.delete(partnerSocketId);
    }

    // Remove from queues
    const wIndex = waitingWithInterests.findIndex(u => u.socketId === socket.id);
    if (wIndex !== -1) {
      waitingWithInterests.splice(wIndex, 1);
    }

    const gIndex = waitingGeneral.findIndex(u => u.socketId === socket.id);
    if (gIndex !== -1) {
      waitingGeneral.splice(gIndex, 1);
    }

    // Clear timeout
    clearTimeout(interestTimeouts.get(socket.id));
    interestTimeouts.delete(socket.id);

    userSessions.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
