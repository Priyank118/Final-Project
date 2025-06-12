// --- Required Modules ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// --- Initialization ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// --- In-Memory State Management ---
let onlineUsers = {}; 
let activeRooms = {}; 

// --- Database Setup (SQLite) ---
const db = new sqlite3.Database('./chat.db', (err) => {
    if (err) {
        console.error("Error opening database", err.message);
    } else {
        console.log("Connected to the SQLite database.");
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, from_user_id TEXT, from_user_name TEXT, to_user_id TEXT, room TEXT, content TEXT, is_private BOOLEAN, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            db.run(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, socket_id TEXT, username TEXT, user_id TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS rooms (room_name TEXT PRIMARY KEY, password TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS room_members (room_name TEXT, user_id TEXT, PRIMARY KEY (room_name, user_id))`, (err) => {
                if (!err) {
                    loadRoomsFromDB();
                }
            });
        });
    }
});


// --- Serve Frontend Files ---
const publicPath = path.join(__dirname, 'frontend');
app.use(express.static(publicPath));


// **FIX**: Function to load all rooms and their passwords from DB into memory on startup
const loadRoomsFromDB = () => {
    db.all(`SELECT room_name, password FROM rooms`, [], (err, rows) => {
        if (err) {
            console.error("Could not load rooms from DB:", err);
            return;
        }
        activeRooms = { 'public': { password: '', members: [] } }; // Reset and add public
        rows.forEach(row => {
            if (!activeRooms[row.room_name]) {
                activeRooms[row.room_name] = { password: row.password || '', members: [] };
            }
        });
        console.log("Rooms loaded from database into memory.");
    });
};


const getClientRoomList = () => {
    return Object.keys(activeRooms).map(roomName => ({
        name: roomName,
        hasPassword: !!activeRooms[roomName].password 
    }));
};

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- Session Handling with SQLite ---
    socket.on('login', (username) => {
        try {
            const isUsernameTaken = Object.values(onlineUsers).some(user => user.name === username);
            if (isUsernameTaken) {
                socket.emit('login error', 'Username is already taken.');
                return;
            }
            
            const sessionToken = uuidv4();
            const userId = uuidv4(); 
            // **NEW**: Check for admin username
            const isAdmin = username.toLowerCase() === 'admin';
            const user = { id: socket.id, name: username, token: sessionToken, userId: userId, isAdmin: isAdmin };
            onlineUsers[socket.id] = user;

            db.run(`INSERT INTO sessions (token, socket_id, username, user_id) VALUES (?, ?, ?, ?)`, 
                [sessionToken, socket.id, username, userId]
            );

            // **MODIFIED**: Send user object with isAdmin flag
            socket.emit('login success', user);
            io.emit('update user list', Object.values(onlineUsers));
            
            socket.join('public');
            if (!activeRooms.public.members.includes(userId)) {
                activeRooms.public.members.push(userId);
            }
            db.run(`INSERT OR IGNORE INTO room_members (room_name, user_id) VALUES (?, ?)`, ['public', userId]);

            socket.emit('update room list', getClientRoomList());

        } catch (error) {
            console.error('[CRITICAL] Error in "login":', error);
        }
    });

    socket.on('resume session', (token) => {
        try {
            if (!token) return;
            db.get(`SELECT * FROM sessions WHERE token = ?`, [token], (err, session) => {
                if (err) { return console.error("Error resuming session:", err); }
                
                if (session) {
                    const oldUserEntry = Object.entries(onlineUsers).find(([id, u]) => u.name === session.username);
                    if(oldUserEntry) {
                        io.to(oldUserEntry[0]).emit('force logout');
                    }
                    
                    const isAdmin = session.username.toLowerCase() === 'admin';
                    const user = { id: socket.id, name: session.username, token: token, userId: session.user_id, isAdmin: isAdmin };
                    onlineUsers[socket.id] = user;

                    db.run(`UPDATE sessions SET socket_id = ? WHERE token = ?`, [socket.id, token]);
                    
                    socket.emit('login success', user);
                    io.emit('update user list', Object.values(onlineUsers));
                    
                    db.all(`SELECT room_name FROM room_members WHERE user_id = ?`, [user.userId], (err, rows) => {
                        if (err) { return console.error("Error fetching user's rooms:", err); }
                        
                        rows.forEach(row => {
                            socket.join(row.room_name);
                             if (activeRooms[row.room_name]) {
                                if (!activeRooms[row.room_name].members.includes(user.userId)) {
                                    activeRooms[row.room_name].members.push(user.userId);
                                }
                             } else {
                                activeRooms[row.room_name] = { password: '', members: [user.userId] };
                             }
                        });
                        socket.emit('update room list', getClientRoomList());
                    });

                } else {
                    socket.emit('invalid session');
                }
            });
        } catch (error) {
            console.error('[CRITICAL] Error in "resume session":', error);
        }
    });

    const handleDisconnect = (isLogout = false) => {
        try {
            const user = onlineUsers[socket.id];
            if (user) {
                const userId = user.userId;
                
                if (isLogout && user.token) {
                    db.serialize(() => {
                        db.run(`DELETE FROM sessions WHERE token = ?`, [user.token]);
                        db.run(`DELETE FROM messages WHERE from_user_id = ?`, [userId]);
                        db.run(`DELETE FROM room_members WHERE user_id = ?`, [userId]);
                    });
                }
                
                delete onlineUsers[socket.id];
                io.emit('update user list', Object.values(onlineUsers));

                Object.keys(activeRooms).forEach(roomName => {
                    const room = activeRooms[roomName];
                    const memberIndex = room.members.indexOf(userId);
                    if (memberIndex > -1) {
                        room.members.splice(memberIndex, 1);
                    }
                });

                io.emit('update room list', getClientRoomList());
            }
        } catch(error) {
            console.error('[CRITICAL] Error in "handleDisconnect":', error);
        }
    };

    socket.on('logout', () => handleDisconnect(true));
    socket.on('disconnect', () => handleDisconnect(false));

    // **NEW**: Admin functionality to delete a room
    socket.on('delete room', (roomName) => {
        const user = onlineUsers[socket.id];
        // Security check: only admin can delete, and can't delete 'public'
        if (!user || !user.isAdmin || roomName === 'public') {
            return;
        }

        console.log(`Admin ${user.name} is deleting room: ${roomName}`);
        
        db.serialize(() => {
            db.run(`DELETE FROM rooms WHERE room_name = ?`, [roomName]);
            db.run(`DELETE FROM room_members WHERE room_name = ?`, [roomName]);
            db.run(`DELETE FROM messages WHERE room = ?`, [roomName], (err) => {
                if (err) {
                    console.error(`Error deleting room ${roomName}:`, err);
                    return;
                }
                // Once DB operations are done, update in-memory state
                delete activeRooms[roomName];
                // Notify all clients that the room list has changed
                io.emit('update room list', getClientRoomList());
            });
        });
    });

    socket.on('join room', (data) => {
        try {
            const { roomName, password } = data;
            const user = onlineUsers[socket.id];
            if (!user) return;

            db.get(`SELECT password FROM rooms WHERE room_name = ?`, [roomName], (err, room) => {
                if (err) {
                    console.error("Error checking room:", err);
                    return;
                }

                if (room) { 
                    if (room.password && room.password !== password) {
                        socket.emit('join room error', 'Incorrect password.');
                        return;
                    }
                } else { 
                    db.run(`INSERT OR IGNORE INTO rooms (room_name, password) VALUES (?, ?)`, [roomName, password || '']);
                    activeRooms[roomName] = { password: password || '', members: [] };
                }
                
                socket.join(roomName);
                if (!activeRooms[roomName].members.includes(user.userId)) {
                    activeRooms[roomName].members.push(user.userId);
                    db.run(`INSERT OR IGNORE INTO room_members (room_name, user_id) VALUES (?, ?)`, [roomName, user.userId]);
                }
                
                io.emit('update room list', getClientRoomList());
                socket.emit('join room success', roomName);
            });

        } catch(error) {
            console.error('[CRITICAL] Error in "join room":', error);
        }
    });

     socket.on('request history', (chat) => {
        const user = onlineUsers[socket.id];
        if (!user || !chat) return;

        let query, params;
        if (chat.type === 'private') {
            query = `SELECT from_user_id AS "from", from_user_name AS fromName, content, timestamp FROM messages WHERE is_private = 1 AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)) ORDER BY timestamp ASC`;
            params = [user.userId, chat.id, chat.id, user.userId];
        } else {
            query = `SELECT from_user_id AS "from", from_user_name AS fromName, content, timestamp FROM messages WHERE room = ? AND is_private = 0 ORDER BY timestamp ASC`;
            params = [chat.id];
        }
        db.all(query, params, (err, rows) => {
            if (err) { return console.error('Error fetching history:', err); }
            socket.emit('chat history', { chatId: chat.id, history: rows });
        });
    });

    socket.on('chat message', (msg) => {
        try {
            if (!msg || !msg.target) return;
            const sender = onlineUsers[socket.id];
            if (!sender) return;

            const messageData = { from: sender.userId, fromName: sender.name, content: msg.content, timestamp: new Date() };
            
             if (msg.target.type === 'private') {
                const targetUser = Object.values(onlineUsers).find(u => u.userId === msg.target.id);
                if (targetUser) {
                    messageData.to = msg.target.id;
                    messageData.isPrivate = true;
                    db.run(`INSERT INTO messages (from_user_id, from_user_name, to_user_id, content, is_private) VALUES (?, ?, ?, ?, ?)`, 
                        [sender.userId, sender.name, msg.target.id, msg.content, true], (err) => { 
                            if (!err) io.to(targetUser.id).to(socket.id).emit('chat message', messageData);
                    });
                }
            } else {
                messageData.room = msg.target.id;
                messageData.isPrivate = false;
                 db.run(`INSERT INTO messages (from_user_id, from_user_name, room, content, is_private) VALUES (?, ?, ?, ?, ?)`, 
                    [sender.userId, sender.name, msg.target.id, msg.content, false], (err) => {
                        if (!err) io.to(msg.target.id).emit('chat message', messageData);
                });
            }
        } catch (error) {
             console.error('[CRITICAL] Error in "chat message":', error);
        }
    });
});

// --- Start the Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
