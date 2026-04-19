const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10 * 1024 * 1024 });

app.use(express.static(path.join(__dirname, '../frontend')));

const waitingUsers = [];
const activePairs = {};

function findMatch(socket, data) {
  const { nickname, gender, pref, age } = data;

  let matchIndex = waitingUsers.findIndex(u => {
    if (u.id === socket.id) return false;
    const iWantThem = pref === 'anyone' || pref === u.gender;
    const theyWantMe = u.pref === 'anyone' || u.pref === gender;
    return iWantThem && theyWantMe;
  });

  if (matchIndex === -1)
    matchIndex = waitingUsers.findIndex(u => u.id !== socket.id);

  if (matchIndex !== -1) {
    const partner = waitingUsers.splice(matchIndex, 1)[0];
    activePairs[socket.id] = partner.id;
    activePairs[partner.id] = socket.id;
    io.to(socket.id).emit('matched', { partnerNickname: partner.nickname, partnerGender: partner.gender, partnerAge: partner.age });
    io.to(partner.id).emit('matched', { partnerNickname: nickname, partnerGender: gender, partnerAge: age });
  } else {
    // Only add to waiting if not already there
    const alreadyWaiting = waitingUsers.find(u => u.id === socket.id);
    if (!alreadyWaiting) {
      waitingUsers.push({ id: socket.id, nickname, gender, pref, age });
    }
    socket.emit('waiting');
  }
}

io.on('connection', (socket) => {
  socket.on('find-match', (data) => findMatch(socket, data));

  socket.on('message', ({ text }) => {
    const partnerId = activePairs[socket.id];
    if (partnerId) io.to(partnerId).emit('message', { text });
  });

  socket.on('photo', ({ dataUrl }) => {
    const partnerId = activePairs[socket.id];
    if (partnerId) io.to(partnerId).emit('photo', { dataUrl });
  });

  socket.on('voice', ({ dataUrl, duration }) => {
    const partnerId = activePairs[socket.id];
    if (partnerId) io.to(partnerId).emit('voice', { dataUrl, duration });
  });

  socket.on('typing', () => {
    const partnerId = activePairs[socket.id];
    if (partnerId) io.to(partnerId).emit('typing');
  });

  socket.on('typing-stop', () => {
    const partnerId = activePairs[socket.id];
    if (partnerId) io.to(partnerId).emit('typing-stop');
  });

  socket.on('next', () => {
    const partnerId = activePairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      delete activePairs[partnerId];
    }
    delete activePairs[socket.id];
    const idx = waitingUsers.findIndex(u => u.id === socket.id);
    if (idx !== -1) waitingUsers.splice(idx, 1);
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

server.listen(3000, () => console.log('Server running at http://localhost:3000'));