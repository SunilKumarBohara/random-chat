/**
 * Random Chat - Frontend Client
 * Handles all Socket.io communication and UI state management
 * Modern redesigned version with enhanced UX
 */

// Initialize Socket.io connection
const socket = io();

// DOM Elements
const app = document.getElementById('app');
const landing = document.getElementById('landing');
const chatContainer = document.getElementById('chatContainer');
const startForm = document.getElementById('startForm');
const userNameInput = document.getElementById('userName');
const interestsInput = document.getElementById('interests');
const interestTags = document.getElementById('interestTags');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const nextBtn = document.getElementById('nextBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
const statusIndicator = document.getElementById('statusIndicator');
const sharedInterestsBadge = document.getElementById('sharedInterestsBadge');
const interestPillText = document.getElementById('interestPillText');

// State management
let currentState = 'landing'; // landing, looking, chatting, disconnected
let isMatched = false;
let userName = '';
let userInterests = '';
let sharedInterests = [];
let interestArray = [];

/**
 * Parse interests from comma-separated string
 */
function parseInterests(str) {
  return str
    .split(',')
    .map(i => i.trim().toLowerCase())
    .filter(i => i.length > 0);
}

/**
 * Update interest tags display
 */
function updateInterestTags() {
  interestArray = parseInterests(interestsInput.value);
  interestTags.innerHTML = '';
  
  interestArray.forEach(interest => {
    const tag = document.createElement('div');
    tag.className = 'interest-tag';
    tag.innerHTML = `
      ${interest}
      <button type="button">×</button>
    `;
    
    tag.querySelector('button').addEventListener('click', (e) => {
      e.preventDefault();
      interestArray = interestArray.filter(i => i !== interest);
      interestsInput.value = interestArray.join(', ');
      updateInterestTags();
    });
    
    interestTags.appendChild(tag);
  });
}

/**
 * Show landing page
 */
function showLanding() {
  currentState = 'landing';
  landing.classList.remove('hidden');
  chatContainer.classList.add('hidden');
  messagesArea.innerHTML = '';
  isMatched = false;
  sharedInterests = [];
}

/**
 * Show chat interface
 */
function showChat() {
  currentState = 'chatting';
  landing.classList.add('hidden');
  chatContainer.classList.remove('hidden');
}

/**
 * Update status text and show looking spinner
 */
function showLooking() {
  currentState = 'looking';
  isMatched = false;
  messagesArea.innerHTML = `
    <div class="looking-spinner">
      <div class="spinner"></div>
      <div class="spinner-text">Finding your match</div>
    </div>
  `;
  statusText.textContent = 'Looking for stranger...';
  statusIndicator.className = 'status-indicator looking';
  sharedInterestsBadge.classList.add('hidden');
  showChat();
}

/**
 * Add message to chat display
 */
function addMessage(text, isOwn) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;

  messageDiv.appendChild(bubble);

  // Add timestamp
  const timestamp = document.createElement('div');
  timestamp.className = 'message-timestamp';
  const date = new Date();
  timestamp.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  messageDiv.appendChild(timestamp);

  messagesArea.appendChild(messageDiv);

  // Auto-scroll to latest message
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

/**
 * Add system message (e.g., disconnection notice)
 */
function addSystemMessage(text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'system-message';
  messageDiv.textContent = text;
  messagesArea.appendChild(messageDiv);
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

/**
 * Clear all messages
 */
function clearMessages() {
  messagesArea.innerHTML = '';
}

/**
 * Update shared interests badge
 */
function updateSharedInterests(interests) {
  sharedInterests = interests || [];
  if (sharedInterests.length > 0) {
    interestPillText.textContent = `🎯 You both like: ${sharedInterests.join(', ')}`;
    sharedInterestsBadge.classList.remove('hidden');
  } else {
    sharedInterestsBadge.classList.add('hidden');
  }
}

/**
 * Show "Stranger disconnected" screen
 */
function showDisconnected() {
  currentState = 'disconnected';
  isMatched = false;
  messagesArea.innerHTML = `
    <div class="disconnected-container">
      <div class="disconnect-icon">👋</div>
      <div class="disconnect-text">Stranger disconnected</div>
      <div class="disconnect-subtext">They left the chat</div>
      <div class="button-group">
        <button class="btn-primary-alt" id="findNewBtn">Find New Stranger</button>
        <button class="btn-secondary" id="goHomeBtn">Go Home</button>
      </div>
    </div>
  `;
  statusText.textContent = 'Stranger disconnected';
  statusIndicator.className = 'status-indicator';
  sharedInterestsBadge.classList.add('hidden');

  // Add event listeners
  document.getElementById('findNewBtn').addEventListener('click', () => {
    startMatching(userName, userInterests);
  });

  document.getElementById('goHomeBtn').addEventListener('click', () => {
    showLanding();
  });
}

/**
 * Start matching process
 */
function startMatching(name, interests) {
  userName = name;
  userInterests = interests;
  showLooking();
  socket.emit('find_match', {
    userName: name,
    interests: interests
  });
}

/**
 * Handle form submission
 */
startForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = userNameInput.value.trim();
  const interests = interestsInput.value.trim();
  startMatching(name, interests);
});

/**
 * Update interest tags on input
 */
interestsInput.addEventListener('input', updateInterestTags);

/**
 * Send message on Enter key or button click
 */
function sendMessage() {
  const text = messageInput.value.trim();

  if (text && isMatched) {
    // Send message via Socket.io
    socket.emit('message', { text });

    // Display own message immediately
    addMessage(text, true);

    // Clear input and reset height
    messageInput.value = '';
    messageInput.style.height = 'auto';
  }
}

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

/**
 * Auto-resize textarea as user types
 */
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
});

/**
 * Next button - skip current stranger
 */
nextBtn.addEventListener('click', () => {
  if (isMatched || currentState === 'looking') {
    clearMessages();
    socket.emit('next');
    showLooking();
  }
});

/**
 * Stop button - end chat entirely
 */
stopBtn.addEventListener('click', () => {
  if (isMatched || currentState === 'looking') {
    socket.emit('stop');
    showLanding();
  }
});

/**
 * ==================== SOCKET.IO EVENT HANDLERS ====================
 */

/**
 * Connected to server
 */
socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
});

/**
 * Looking for match event
 */
socket.on('looking', () => {
  console.log('Looking for stranger...');
  showLooking();
});

/**
 * Matched with a stranger
 */
socket.on('matched', (data) => {
  console.log('Matched with stranger!', data);
  isMatched = true;
  currentState = 'chatting';
  
  // Clear the "looking" spinner
  clearMessages();
  
  // Update status and show shared interests
  statusText.textContent = 'Stranger connected!';
  statusIndicator.className = 'status-indicator';
  updateSharedInterests(data.sharedInterests);

  // Focus on message input
  messageInput.focus();
});

/**
 * Receive message from stranger
 */
socket.on('message', (data) => {
  console.log('Message received:', data);
  if (isMatched) {
    addMessage(data.text, false);
  }
});

/**
 * Stranger disconnected
 */
socket.on('stranger_disconnected', () => {
  console.log('Stranger disconnected');
  isMatched = false;
  showDisconnected();
});

/**
 * Disconnection from server
 */
socket.on('disconnect', () => {
  console.log('Disconnected from server');
  isMatched = false;
  currentState = 'landing';
});

/**
 * Connection error
 */
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  addSystemMessage('⚠️ Connection error. Please check your internet connection.');
});

/**
 * Initialize on page load
 */
document.addEventListener('DOMContentLoaded', () => {
  showLanding();
  userNameInput.focus();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (isMatched || currentState === 'looking') {
    socket.emit('stop');
  }
});

