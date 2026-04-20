const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10 * 1024 * 1024 });

app.use(express.static(path.join(__dirname, '../frontend')));

// Serve setup.html as default
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

const waitingUsers = [];
const activePairs = {};

function findMatch(socket, data) {
  const { nickname, gender, pref, age } = data;
  
  // Remove user if already in waiting list to avoid duplicates
  const existingIdx = waitingUsers.findIndex(u => u.id === socket.id);
  if (existingIdx !== -1) waitingUsers.splice(existingIdx, 1);

  let matchIndex = waitingUsers.findIndex(u => {
    if (u.id === socket.id) return false;
    const iWant = pref === 'anyone' || pref === u.gender;
    const theyWant = u.pref === 'anyone' || u.pref === gender;
    return iWant && theyWant;
  });

  // Fallback to anyone if no preference match (optional, but keeps the app active)
  if (matchIndex === -1 && pref === 'anyone') {
    matchIndex = waitingUsers.findIndex(u => u.id !== socket.id);
  }

  if (matchIndex !== -1) {
    const partner = waitingUsers.splice(matchIndex, 1)[0];
    activePairs[socket.id] = partner.id;
    activePairs[partner.id] = socket.id;
    io.to(socket.id).emit('matched', { partnerNickname: partner.nickname, partnerGender: partner.gender, partnerAge: partner.age });
    io.to(partner.id).emit('matched', { partnerNickname: nickname, partnerGender: gender, partnerAge: age });
  } else {
    waitingUsers.push({ id: socket.id, nickname, gender, pref, age });
    socket.emit('waiting');
  }
}

function getPartner(socket) { return activePairs[socket.id]; }

io.on('connection', (socket) => {
  socket.on('find-match', data => findMatch(socket, data));
  socket.on('message', ({ text }) => { const p = getPartner(socket); if(p) io.to(p).emit('message', { text }); });
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

  socket.on('next', () => {
    const p = getPartner(socket);
    if(p) { io.to(p).emit('partner-left'); delete activePairs[p]; }
    delete activePairs[socket.id];
    const idx = waitingUsers.findIndex(u => u.id === socket.id);
    if(idx !== -1) waitingUsers.splice(idx, 1);
    socket.emit('disconnected-next');
  });

  socket.on('disconnect', () => {
    const idx = waitingUsers.findIndex(u => u.id === socket.id);
    if(idx !== -1) waitingUsers.splice(idx, 1);
    const p = getPartner(socket);
    if(p) { io.to(p).emit('partner-left'); delete activePairs[p]; }
    delete activePairs[socket.id];
  });
});

server.listen(3000, () => console.log('Server running at http://localhost:3000'));