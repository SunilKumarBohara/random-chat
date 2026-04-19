const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 6 * 1024 * 1024 });

app.use(express.static(path.join(__dirname, '../frontend')));

const waitingUsers = [];
const activePairs = {};

function findMatch(socket, data) {
  const { nickname, gender, pref, age } = data;

  // Try preferred gender match first
  let matchIndex = waitingUsers.findIndex(u => {
    if (u.id === socket.id) return false;
    const iWantThem = pref === 'anyone' || pref === u.gender;
    const theyWantMe = u.pref === 'anyone' || u.pref === gender;
    return iWantThem && theyWantMe;
  });

  // Fallback: match with anyone available
  if (matchIndex === -1) {
    matchIndex = waitingUsers.findIndex(u => u.id !== socket.id);
  }

  if (matchIndex !== -1) {
    const partner = waitingUsers.splice(matchIndex, 1)[0];
    activePairs[socket.id] = partner.id;
    activePairs[partner.id] = socket.id;

    io.to(socket.id).emit('matched', {
      partnerNickname: partner.nickname,
      partnerGender: partner.gender,
      partnerAge: partner.age
    });
    io.to(partner.id).emit('matched', {
      partnerNickname: nickname,
      partnerGender: gender,
      partnerAge: age
    });
  } else {
    waitingUsers.push({ id: socket.id, nickname, gender, pref, age });
    socket.emit('waiting');
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('find-match', (data) => findMatch(socket, data));

  socket.on('message', (msg) => {
    const partnerId = activePairs[socket.id];
    if (partnerId) io.to(partnerId).emit('message', msg);
  });

  socket.on('photo', ({ dataUrl }) => {
    const partnerId = activePairs[socket.id];
    if (partnerId) io.to(partnerId).emit('photo', { dataUrl });
  });

  socket.on('next', () => {
    const partnerId = activePairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      delete activePairs[partnerId];
    }
    delete activePairs[socket.id];
    socket.emit('disconnected-next');
  });

  socket.on('disconnect', () => {
    const idx = waitingUsers.findIndex(u => u.id === socket.id);
    if (idx !== -1) waitingUsers.splice(idx, 1);
    const partnerId = activePairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      delete activePairs[partnerId];
    }
    delete activePairs[socket.id];
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));