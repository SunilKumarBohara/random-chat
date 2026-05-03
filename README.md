# Random Chat - Anonymous Stranger Chat

A modern, real-time web application where users can chat anonymously with random strangers. Built with Node.js, Express, and Socket.io.

## Features

✨ **Random Matching** - Get connected with a random stranger instantly
🎯 **Interest-Based Matching** - System tries to match users with shared interests
💬 **Real-Time Messaging** - Instant messaging powered by Socket.io
⏭️ **Skip Feature** - Move to the next stranger with one click
🎨 **Modern UI** - Clean, dark-themed interface with smooth animations
📱 **Mobile Responsive** - Works seamlessly on all devices
🚀 **In-Memory** - No database needed, simple and fast

## Tech Stack

- **Backend**: Node.js + Express.js
- **Real-Time**: Socket.io
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Data**: In-memory (no database)

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Clone or navigate to the project directory:
```bash
cd random-chat
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

Start the server:
```bash
npm start
```

The application will be available at:
```
http://localhost:3000
```

### Development Mode

For development with auto-restart on file changes:
```bash
npm run dev
```

## How to Use

1. **Enter Your Details**:
   - Optionally enter your name (or stay anonymous)
   - List your interests separated by commas (e.g., "music, gaming, anime")
   - Click "Start Chatting"

2. **Get Matched**:
   - The system looks for someone with shared interests
   - If no match found within 10 seconds, you'll be matched with anyone available
   - When matched, you'll see "Stranger connected!" and shared interests badge

3. **Chat**:
   - Type your message and press Enter to send
   - Messages appear in real-time for both users
   - The chat window auto-scrolls to the latest message

4. **Next Stranger**:
   - Click "Next" to disconnect and find a new stranger
   - Your chat history clears and matching starts again

5. **Stop Chatting**:
   - Click "Stop" to exit the chat completely
   - You'll return to the landing page

## Project Structure

```
random-chat/
├── server.js              # Main Express + Socket.io server
├── package.json           # Project dependencies
├── public/
│   ├── index.html         # Full chat UI (HTML + CSS)
│   └── client.js          # Frontend Socket.io client logic
└── README.md             # This file
```

## How Matching Works

### Priority Matching:
1. **Interest Match** (First 10 seconds):
   - System looks for users with at least one shared interest
   - If found, users are matched instantly

2. **Fallback Match** (After 10 seconds):
   - If no interest match found, user is placed in general queue
   - Matched with the next available user

### Safety Features:
- Users cannot be matched with themselves
- Disconnection is handled gracefully
- Both users are notified when partner leaves
- Session data is cleared on disconnect

## Socket.io Events

### Client → Server:
- **`find_match`**: { userName: string, interests: string }
- **`message`**: { text: string }
- **`next`**: (no data)
- **`stop`**: (no data)

### Server → Client:
- **`looking`**: User is waiting for a match
- **`matched`**: { sharedInterests: string[] }
- **`message`**: { text: string, timestamp: number }
- **`stranger_disconnected`**: Partner has left

## API Response Examples

### Find Match
```javascript
socket.emit('find_match', {
  userName: 'Alex',
  interests: 'music, gaming, tech'
});
```

### Send Message
```javascript
socket.emit('message', {
  text: 'Hey, how are you?'
});
```

## Features Explained

### Auto-Matching Algorithm
- Maintains two queues: one for interest-based matching, one for general
- After 10 seconds without a match, users move to general queue
- Ensures users don't wait too long

### Message Handling
- Messages appear instantly for both users
- Auto-scroll keeps latest message visible
- Clear distinction between own messages and stranger's messages

### Connection Stability
- Handles tab closes, browser refreshes, network drops
- Notifies other user if connection is lost
- Queues auto-cleanup on disconnect

## Troubleshooting

### "Connection refused" error
- Make sure the server is running: `npm start`
- Check that port 3000 is not blocked

### Messages not sending
- Ensure both users are connected (check status bar)
- Verify Socket.io connection in browser console

### Stuck on "Looking for stranger"
- This is normal if no one else is online
- Server finds matches when other users connect
- Try sharing the link with others to test

## Performance Notes

- In-memory storage keeps everything fast
- Scales well for 1000+ concurrent users
- No database delays or queries
- Real-time updates via Socket.io

## Deployment

The app can be deployed to:
- Heroku
- Railway
- DigitalOcean
- AWS
- Any Node.js-compatible hosting

### Environment Variables (Optional)
```
PORT=3000          # Server port (default: 3000)
NODE_ENV=production # Environment mode
```

## License

ISC

## Contributing

Feel free to fork, modify, and improve this project!

---

**Built with ❤️ for real-time communication**
