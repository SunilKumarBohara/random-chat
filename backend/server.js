// ChatRoom Server - Production Grade Signaling
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  maxHttpBufferSize: 15 * 1024 * 1024, // 15MB for high-res photos
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

let waitingUsers = [];
const activePairs = new Map();
const blockedUsers = new Map(); // Map of socket.id -> Set of blocked partner IDs
let onlineCount = 0;

// Expanded toxic word filter
const TOXIC_WORDS = ['badword1', 'badword2', 'offensive', 'toxic', 'spam', 'scam'];

function findMatch(socket, data) {
  const { nickname, gender, pref, age, interests } = data;
  
  // Cleanup
  waitingUsers = waitingUsers.filter(u => u.id !== socket.id);

  let matchIndex = -1;

  // 1. Try to match by interests first
  if (interests && interests.length > 0) {
    matchIndex = waitingUsers.findIndex(u => {
      if (u.id === socket.id) return false;
      
      // Check if either has blocked the other
      if (blockedUsers.get(socket.id)?.has(u.id) || blockedUsers.get(u.id)?.has(socket.id)) return false;

      const commonInterests = interests.filter(i => u.interests.includes(i));
      if (commonInterests.length === 0) return false;

      const iWant = pref === 'anyone' || pref === u.gender;
      const theyWant = u.pref === 'anyone' || u.pref === gender;
      return iWant && theyWant;
    });
  }

  // 2. Fallback to general matching
  if (matchIndex === -1) {
    matchIndex = waitingUsers.findIndex(u => {
      if (u.id === socket.id) return false;
      if (blockedUsers.get(socket.id)?.has(u.id) || blockedUsers.get(u.id)?.has(socket.id)) return false;
      
      const iWant = pref === 'anyone' || pref === u.gender;
      const theyWant = u.pref === 'anyone' || u.pref === gender;
      return iWant && theyWant;
    });
  }

  if (matchIndex !== -1) {
    const partner = waitingUsers.splice(matchIndex, 1)[0];
    activePairs.set(socket.id, partner.id);
    activePairs.set(partner.id, socket.id);
    
    io.to(socket.id).emit('matched', { 
      partnerNickname: partner.nickname, 
      partnerGender: partner.gender, 
      partnerAge: partner.age,
      commonInterests: interests.filter(i => partner.interests.includes(i))
    });
    io.to(partner.id).emit('matched', { 
      partnerNickname: nickname, 
      partnerGender: gender, 
      partnerAge: age,
      commonInterests: interests.filter(i => partner.interests.includes(i))
    });
    
    console.log(`[Match] ${nickname} matched with ${partner.nickname}`);
  } else {
    waitingUsers.push({ id: socket.id, nickname, gender, pref, age, interests: interests || [] });
    socket.emit('waiting');
  }
}

function getPartner(socket) { return activePairs.get(socket.id); }

io.on('connection', (socket) => {
  onlineCount++;
  io.emit('online-count', onlineCount);
  console.log(`[Connected] User ${socket.id} (Online: ${onlineCount})`);

  socket.on('find-match', data => findMatch(socket, data));
  
  socket.on('message', ({ text }) => { 
    const p = getPartner(socket); 
    if(!p) return;
    
    // Safety: Filter toxic language
    let filteredText = text;
    TOXIC_WORDS.forEach(word => {
      const reg = new RegExp(word, 'gi');
      filteredText = filteredText.replace(reg, '***');
    });

    io.to(p).emit('message', { text: filteredText }); 
  });

  socket.on('photo', ({ dataUrl }) => { const p = getPartner(socket); if(p) io.to(p).emit('photo', { dataUrl }); });
  socket.on('voice', ({ dataUrl, duration }) => { const p = getPartner(socket); if(p) io.to(p).emit('voice', { dataUrl, duration }); });
  socket.on('typing', () => { const p = getPartner(socket); if(p) io.to(p).emit('typing'); });
  socket.on('typing-stop', () => { const p = getPartner(socket); if(p) io.to(p).emit('typing-stop'); });

  // WebRTC signaling
  socket.on('call-offer', ({ offer, withVideo }) => { const p = getPartner(socket); if(p) io.to(p).emit('call-offer', { offer, withVideo }); });
  socket.on('call-answer', ({ answer }) => { const p = getPartner(socket); if(p) io.to(p).emit('call-answer', { answer }); });
  socket.on('ice-candidate', ({ candidate }) => { const p = getPartner(socket); if(p) io.to(p).emit('ice-candidate', { candidate }); });
  socket.on('call-reject', () => { const p = getPartner(socket); if(p) io.to(p).emit('call-reject'); });
  socket.on('call-end', () => { const p = getPartner(socket); if(p) io.to(p).emit('call-end'); });
  socket.on('call-upgrade', ({ withVideo }) => { const p = getPartner(socket); if(p) io.to(p).emit('call-upgrade', { withVideo }); });
  socket.on('call-upgrade-accept', () => { const p = getPartner(socket); if(p) io.to(p).emit('call-upgrade-accept'); });
  socket.on('call-upgrade-reject', () => { const p = getPartner(socket); if(p) io.to(p).emit('call-upgrade-reject'); });

  socket.on('report-partner', () => {
    const p = getPartner(socket);
    if(p) {
      console.log(`[Report] User ${socket.id} reported ${p}`);
      
      // Implement Blocking
      if (!blockedUsers.has(socket.id)) blockedUsers.set(socket.id, new Set());
      blockedUsers.get(socket.id).add(p);

      io.to(p).emit('partner-left');
      activePairs.delete(p);
      activePairs.delete(socket.id);
      socket.emit('disconnected-next');
    }
  });

  socket.on('block-user', () => {
    const p = getPartner(socket);
    if(p) {
      if (!blockedUsers.has(socket.id)) blockedUsers.set(socket.id, new Set());
      blockedUsers.get(socket.id).add(p);
      io.to(p).emit('partner-left');
      activePairs.delete(p);
      activePairs.delete(socket.id);
      socket.emit('disconnected-next');
    }
  });

  socket.on('next', () => {
    const p = getPartner(socket);
    if(p) { io.to(p).emit('partner-left'); activePairs.delete(p); }
    activePairs.delete(socket.id);
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    socket.emit('disconnected-next');
  });

  socket.on('disconnect', () => {
    onlineCount--;
    io.emit('online-count', Math.max(0, onlineCount));
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    const p = getPartner(socket);
    if(p) { io.to(p).emit('partner-left'); activePairs.delete(p); }
    activePairs.delete(socket.id);
    console.log(`[Disconnected] User ${socket.id} (Online: ${onlineCount})`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`RandomChat Production Server running at http://localhost:${PORT}`));