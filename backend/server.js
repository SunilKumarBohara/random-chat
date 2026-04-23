const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { sequelize, User, Group, GroupMember, Message: MsgModel } = require('./models');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Trust proxy for IP detection when hosted (e.g. Nginx, Heroku)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for simplicity, enable in production
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Session configuration with database persistence
const sessionStore = new SequelizeStore({ db: sequelize });
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  store: sessionStore,
  resave: false,
  saveUninitialized: false, // Changed to false for better auth handling
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
});
sessionStore.sync();

app.use(sessionMiddleware);

// CORS configuration for production
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.FRONTEND_URL || 'https://yourdomain.com']
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST']
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Socket.io configuration
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 15 * 1024 * 1024,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Share session middleware with Socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Data structures for matching
const textWaitingUsers = []; // Only text chat users
const activePairs = new Map();
const blockedUsers = new Map();
const userSessions = new Map(); // Store user session data
let onlineCount = 0;

// Constants
const TOXIC_WORDS = [
  'fuck', 'shit', 'asshole', 'bitch', 'damn', 'crap', 'dick', 'pussy',
  'nigger', 'faggot', 'retard', 'whore', 'slut', 'cunt', 'bastard'
];

// Helper functions
function filterProfanity(text) {
  let filtered = text;
  TOXIC_WORDS.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filtered = filtered.replace(regex, '***');
  });
  return filtered;
}

function getPartner(socketId) {
  return activePairs.get(socketId);
}

// Get persistent ID (UserId if logged in, else AnonymousId)
function getPersistentId(socket) {
  const session = socket.request.session;
  if (session.userId) return `u_${session.userId}`;
  
  if (!session.anonymousId) {
    session.anonymousId = uuidv4();
    session.save();
  }
  return session.anonymousId;
}

// Match finding logic - separated by mode
function findMatch(socket, data) {
  const { nickname, gender, pref, age, interests = [], mode = 'text', country = null } = data;
  const persistentId = getPersistentId(socket);

  // Store user session data
  userSessions.set(socket.id, {
    persistentId,
    nickname,
    gender,
    pref,
    age,
    mode,
    country,
    timestamp: Date.now()
  });

  const textIndex = textWaitingUsers.findIndex(u => u.id === socket.id);
  if (textIndex !== -1) textWaitingUsers.splice(textIndex, 1);

  // Check if user is blocked
  if (blockedUsers.has(anonymousId)) {
    const blockedSet = blockedUsers.get(anonymousId);
    if (blockedSet.has('global')) {
      socket.emit('error', { message: 'You have been blocked from the platform' });
      return;
    }
  }

  // All users go to text queue
  const waitingList = textWaitingUsers;

  // Find matching partner with same mode
  let matchIndex = waitingList.findIndex(u => {
    if (u.id === socket.id) return false;

    const uId = userSessions.get(u.id)?.persistentId;
    const mySocketId = persistentId;

    if (blockedUsers.get(mySocketId)?.has(uId)) return false;
    if (blockedUsers.get(uId)?.has(mySocketId)) return false;

    const iWant = pref === 'anyone' || pref === u.gender;
    const theyWant = u.pref === 'anyone' || u.pref === gender;
    return iWant && theyWant;
  });

  if (matchIndex !== -1) {
    const partner = waitingList.splice(matchIndex, 1)[0];
    const partnerSession = userSessions.get(partner.id);

    activePairs.set(socket.id, partner.id);
    activePairs.set(partner.id, socket.id);

    const commonInterests = interests.filter(i => partner.interests?.includes(i));

    // Notify both users
    io.to(socket.id).emit('matched', {
      partnerId: partner.id,
      partnerNickname: partner.nickname,
      partnerGender: partner.gender,
      partnerAge: partner.age,
      partnerCountry: partner.country || null,
      commonInterests: commonInterests,
      mode: mode
    });

    io.to(partner.id).emit('matched', {
      partnerId: socket.id,
      partnerNickname: nickname,
      partnerGender: gender,
      partnerAge: age,
      partnerCountry: country || null,
      commonInterests: commonInterests,
      mode: mode
    });

    console.log(`✅ Match: ${nickname} (${mode}) <-> ${partner.nickname} (${partner.mode})`);
  } else {
    waitingList.push({
      id: socket.id,
      nickname,
      gender,
      pref,
      age,
      interests: interests || [],
      mode: 'text',
      country: country,
      timestamp: Date.now()
    });
    socket.emit('waiting', { mode: 'text', queueLength: waitingList.length });
    console.log(`⏳ ${nickname} waiting (${waitingList.length} total in text queue)`);
  }
}

// Authentication Middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phoneNumber, password, nickname, gender, age, country } = req.body;
    const existing = await User.findOne({ where: { phoneNumber } });
    if (existing) return res.status(400).json({ error: 'Phone number already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      phoneNumber,
      password: hashedPassword,
      nickname,
      gender,
      age,
      country
    });

    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, nickname: user.nickname } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    const user = await User.findOne({ where: { phoneNumber } });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, nickname: user.nickname } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await User.findByPk(req.session.userId, { attributes: { exclude: ['password'] } });
  res.json({ user });
});

app.post('/api/profile/update', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId);
    await user.update(req.body);
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- GROUP ROUTES ---
app.post('/api/groups/create', isAuthenticated, async (req, res) => {
  try {
    const { name, inviteCode, isPublic } = req.body;
    const finalCode = inviteCode ? inviteCode.toUpperCase() : uuidv4().split('-')[0].toUpperCase();
    
    const group = await Group.create({ 
      name, 
      inviteCode: finalCode, 
      isPublic: !!isPublic,
      creatorId: req.session.userId 
    });
    await GroupMember.create({ groupId: group.id, userId: req.session.userId });
    res.json({ success: true, group });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/groups/join', isAuthenticated, async (req, res) => {
  try {
    const { inviteCode, groupId } = req.body;
    let group;
    
    if (groupId) {
      group = await Group.findByPk(groupId);
    } else if (inviteCode) {
      group = await Group.findOne({ where: { inviteCode: inviteCode.toUpperCase() } });
    }

    if (!group) return res.status(404).json({ error: 'Group not found' });

    // If private and code doesn't match
    if (!group.isPublic && group.inviteCode !== inviteCode?.toUpperCase()) {
      return res.status(403).json({ error: 'Invalid invite code' });
    }

    const existing = await GroupMember.findOne({ where: { groupId: group.id, userId: req.session.userId } });
    if (existing) return res.json({ success: true, group, alreadyMember: true });

    await GroupMember.create({ groupId: group.id, userId: req.session.userId });
    res.json({ success: true, group });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/groups/my', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId, {
      include: [{ model: Group, as: 'groups' }]
    });
    res.json({ groups: user.groups });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/groups/public', async (req, res) => {
  try {
    const groups = await Group.findAll({
      attributes: ['id', 'name', 'isPublic', 'createdAt'] 
    });
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/chat.html'));
});

app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/auth.html'));
});


app.get('/api/session', (req, res) => {
  res.json({
    anonymousId: req.session.anonymousId || null,
    isNew: !req.session.anonymousId
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    onlineUsers: onlineCount,
    textWaiting: textWaitingUsers.length,
    activePairs: activePairs.size / 2,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Cleanup stale waiting users
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 300000; // 5 minutes

  [textWaitingUsers].forEach(list => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (now - list[i].timestamp > staleThreshold) {
        const staleUser = list[i];
        list.splice(i, 1);
        io.to(staleUser.id).emit('error', { message: 'Match timeout, please try again' });
        console.log(`🗑️ Removed stale user: ${staleUser.nickname}`);
      }
    }
  });
}, 60000);

// Statistics logging
setInterval(() => {
  console.log(`📊 Stats - Online: ${onlineCount}, Text Waiting: ${textWaitingUsers.length}, Pairs: ${activePairs.size / 2}`);
}, 300000);

// Socket.io connection handling
io.on('connection', (socket) => {
  onlineCount++;
  io.emit('online-count', onlineCount);

  const persistentId = getPersistentId(socket);
  console.log(`🔌 Connected: ${socket.id} (ID: ${persistentId}, Online: ${onlineCount})`);

  // Send session data to client
  socket.emit('session', { persistentId });

  // App-level heartbeat (in addition to Socket.IO transport ping/pong)
  socket.on('app-ping', ({ ts } = {}) => {
    socket.emit('app-pong', { ts: ts || Date.now(), serverTs: Date.now() });
  });

  socket.on('find-match', (data) => {
    findMatch(socket, data);
  });

  socket.on('cancel-match', () => {
    const textIndex = textWaitingUsers.findIndex(u => u.id === socket.id);
    if (textIndex !== -1) textWaitingUsers.splice(textIndex, 1);

    socket.emit('match-cancelled');
  });

  socket.on('message', ({ id, text, reply } = {}, ack) => {
    const partnerId = getPartner(socket.id);
    if (!partnerId) {
      if (typeof ack === 'function') ack({ ok: false, error: 'no_partner' });
      return;
    }
    const filteredText = filterProfanity(text || '');
    const timestamp = Date.now();

    // Ack to sender that server accepted the message
    if (typeof ack === 'function') ack({ ok: true, serverTs: timestamp });

    // Deliver to partner (include sender socket id for delivery receipts)
    io.to(partnerId).emit('message', {
      id,
      text: filteredText,
      reply,
      timestamp,
      from: socket.id
    });
  });


  // Delivery receipt from recipient -> notify original sender
  socket.on('message-received', ({ id, from } = {}) => {
    if (!id || !from) return;
    io.to(from).emit('message-delivered', { id, timestamp: Date.now() });
  });

  socket.on('message-read', ({ id, from } = {}) => {
    if (!id || !from) return;
    io.to(from).emit('message-read', { id, timestamp: Date.now() });
  });

  socket.on('typing', () => {
    const partnerId = getPartner(socket.id);
    if (partnerId) io.to(partnerId).emit('typing');
  });

  socket.on('typing-stop', () => {
    const partnerId = getPartner(socket.id);
    if (partnerId) io.to(partnerId).emit('typing-stop');
  });

  socket.on('photo', ({ dataUrl }) => {
    const partnerId = getPartner(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('photo', { dataUrl, timestamp: Date.now() });
    }
  });

  // --- GROUP SOCKET EVENTS ---
  socket.on('join-group', async ({ groupId }) => {
    try {
      if (!socket.request.session.userId) return;
      const member = await GroupMember.findOne({ where: { groupId, userId: socket.request.session.userId } });
      if (member) {
        socket.join(`group_${groupId}`);
        const lastMessages = await MsgModel.findAll({
          where: { groupId },
          limit: 50,
          order: [['createdAt', 'ASC']]
        });
        socket.emit('group-history', { groupId, messages: lastMessages });
      }
    } catch (e) {
      console.error('Join group error:', e);
    }
  });

  socket.on('group-message', async ({ groupId, text, type = 'text', dataUrl }) => {
    try {
      if (!socket.request.session.userId) return;
      const member = await GroupMember.findOne({ where: { groupId, userId: socket.request.session.userId } });
      if (!member) return;

      const user = await User.findByPk(socket.request.session.userId);
      const filteredText = filterProfanity(text || '');

      const msg = await MsgModel.create({
        senderId: user.id,
        senderNickname: user.nickname,
        text: filteredText,
        type,
        groupId
      });

      io.to(`group_${groupId}`).emit('group-message', {
        id: msg.id,
        groupId,
        senderId: user.id,
        senderNickname: user.nickname,
        text: filteredText,
        type: msg.type,
        dataUrl: dataUrl,
        timestamp: msg.createdAt
      });
    } catch (e) {
      console.error('Group message error:', e);
    }
  });



  socket.on('report-partner', () => {
    const partnerId = getPartner(socket.id);
    if (partnerId) {
      const partnerIdStr = userSessions.get(partnerId)?.persistentId;
      const myIdStr = persistentId;

      if (!blockedUsers.has(myIdStr)) blockedUsers.set(myIdStr, new Set());
      blockedUsers.get(myIdStr).add(partnerIdStr);

      io.to(partnerId).emit('partner-left', { reason: 'reported' });
      activePairs.delete(partnerId);
      activePairs.delete(socket.id);
      socket.emit('disconnected-next');
    }
  });

  socket.on('block-partner', () => {
    const partnerId = getPartner(socket.id);
    if (partnerId) {
      const partnerIdStr = userSessions.get(partnerId)?.persistentId;
      const myIdStr = persistentId;

      if (!blockedUsers.has(myIdStr)) blockedUsers.set(myIdStr, new Set());
      blockedUsers.get(myIdStr).add(partnerIdStr);

      io.to(partnerId).emit('partner-left', { reason: 'blocked' });
      activePairs.delete(partnerId);
      activePairs.delete(socket.id);
      socket.emit('disconnected-next');
    }
  });

  socket.on('next', () => {
    const partnerId = getPartner(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner-left', { reason: 'next' });
      activePairs.delete(partnerId);
    }
    activePairs.delete(socket.id);
    socket.emit('disconnected-next');
  });

  socket.on('disconnect', () => {
    onlineCount = Math.max(0, onlineCount - 1);
    io.emit('online-count', onlineCount);

    const textIndex = textWaitingUsers.findIndex(u => u.id === socket.id);
    if (textIndex !== -1) textWaitingUsers.splice(textIndex, 1);

    const partnerId = getPartner(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner-left', { reason: 'disconnected' });
      activePairs.delete(partnerId);
    }
    activePairs.delete(socket.id);
    userSessions.delete(socket.id);

    console.log(`🔌 Disconnected: ${socket.id} (Online: ${onlineCount})`);
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

// For direct exposure (no Nginx)
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Sync database and start server
sequelize.sync().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`
    ═══════════════════════════════════════════════════════
    🚀 RANDOM CHAT SERVER - RUNNING
    ═══════════════════════════════════════════════════════
    📡 URL: http://localhost:${PORT}
    🌍 Environment: ${process.env.NODE_ENV || 'development'}
    📊 DB: SQLite Synchronized
    ═══════════════════════════════════════════════════════
    `);
  });
}).catch(err => {
  console.error('❌ Database Sync Error:', err);
});