document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- DOM Element References ---
    const loginScreen = document.getElementById('login-screen');
    const chatUI = document.getElementById('chat-ui');
    const joinBtn = document.getElementById('join-btn');
    const usernameInput = document.getElementById('username-input');
    const loginError = document.getElementById('login-error');
    
    const welcomeUser = document.getElementById('welcome-user');
    const logoutBtn = document.getElementById('logout-btn');

    const sidebar = document.getElementById('sidebar');
    const sidebarOpenBtn = document.getElementById('sidebar-open-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    const userList = document.getElementById('user-list');
    const roomList = document.getElementById('room-list');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const roomInput = document.getElementById('room-input');
    const passwordInput = document.getElementById('password-input');
    const joinRoomError = document.getElementById('join-room-error');

    const chatHeader = document.getElementById('chat-header');
    const chatWith = document.getElementById('chat-with');
    const typingIndicator = document.getElementById('typing-indicator');
    const chatMessages = document.getElementById('chat-messages');
    
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    // --- State Variables ---
    let currentUser = null; // Will now store { id, name, token, userId, isAdmin }
    let currentChat = { type: 'public', id: 'public' };

    // --- Session Management ---
    const sessionToken = localStorage.getItem('sessionToken');
    if (sessionToken) {
        socket.emit('resume session', sessionToken);
    }


    // --- Reusable Logic Functions for Events ---
    const attemptLogin = () => {
        const username = usernameInput.value.trim();
        if (username) {
            socket.emit('login', username);
        }
    };
    
    const attemptLogout = () => {
        const token = localStorage.getItem('sessionToken');
        if (token) {
            socket.emit('logout'); 
        }
        localStorage.removeItem('sessionToken');
        
        currentUser = null;
        chatUI.classList.add('hidden');
        loginScreen.classList.remove('hidden');
        document.title = "Real-Time Chat App";
    };

    const attemptJoinRoom = () => {
        const roomName = roomInput.value.trim();
        const password = passwordInput.value;
        if (roomName) {
            socket.emit('join room', { roomName, password });
            roomInput.value = '';
            passwordInput.value = '';
            joinRoomError.textContent = '';
        }
    };

    const attemptSendMessage = () => {
        const content = messageInput.value.trim();
        if (content && currentUser) {
            const message = {
                content,
                from: currentUser.id,
                fromName: currentUser.name,
                target: currentChat,
            };
            socket.emit('chat message', message);
            messageInput.value = '';
            socket.emit('stop typing', { target: currentChat });
        }
    };

    // --- Event Listeners Setup ---
    joinBtn.addEventListener('click', attemptLogin);
    joinBtn.addEventListener('touchend', e => { e.preventDefault(); attemptLogin(); });

    logoutBtn.addEventListener('click', attemptLogout);
    logoutBtn.addEventListener('touchend', e => { e.preventDefault(); attemptLogout(); });
    
    joinRoomBtn.addEventListener('click', attemptJoinRoom);
    joinRoomBtn.addEventListener('touchend', e => { e.preventDefault(); attemptJoinRoom(); });

    sendBtn.addEventListener('click', attemptSendMessage);
    sendBtn.addEventListener('touchend', e => { e.preventDefault(); attemptSendMessage(); });

    sidebarOpenBtn.addEventListener('click', () => {
        sidebar.classList.remove('-translate-x-full');
        sidebarOverlay.classList.remove('hidden');
    });

    const closeSidebar = () => {
        sidebar.classList.add('-translate-x-full');
        sidebarOverlay.classList.add('hidden');
    }

    sidebarCloseBtn.addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);


    usernameInput.addEventListener('keypress', e => { if (e.key === 'Enter') attemptLogin(); });
    messageInput.addEventListener('keypress', e => {
        socket.emit('typing', { target: currentChat });
        if (e.key === 'Enter') {
            attemptSendMessage();
        }
    });
    
    messageInput.addEventListener('blur', () => {
        socket.emit('stop typing', { target: currentChat });
    });


    // --- Socket.IO Event Handlers ---
    socket.on('login success', (user) => {
        currentUser = user; // Now includes isAdmin flag
        localStorage.setItem('sessionToken', user.token);

        loginScreen.classList.add('hidden');
        chatUI.classList.remove('hidden');
        chatUI.classList.add('flex');
        welcomeUser.textContent = `Welcome, ${currentUser.name}`;
        if (currentUser.isAdmin) {
             welcomeUser.textContent += ' (Admin)';
        }
        document.title = `Chat - ${currentUser.name}`;
        socket.emit('request history', currentChat);
    });
    
    socket.on('force logout', () => {
        alert("You have been logged out because this account was opened in a new tab.");
        attemptLogout();
    });

    socket.on('invalid session', () => {
        localStorage.removeItem('sessionToken');
    });

    socket.on('login error', (message) => {
        loginError.textContent = message;
    });

    socket.on('join room error', (message) => {
        joinRoomError.textContent = message;
    });
    
    socket.on('join room success', (roomName) => {
        joinRoom(roomName);
        closeSidebar();
    });

    socket.on('update user list', (users) => {
        userList.innerHTML = '';
        users.forEach(user => {
            if (currentUser && user.userId === currentUser.userId) return;
            const userElement = document.createElement('a');
            userElement.href = '#';
            userElement.className = 'flex items-center space-x-2 px-2 py-2 text-gray-700 hover:bg-indigo-100 rounded-md';
            userElement.dataset.id = user.userId;
            userElement.dataset.name = user.name;
            userElement.innerHTML = `
                <span class="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>${user.name}</span>
            `;
            const startChatAction = () => {
                startPrivateChat(user);
                closeSidebar();
            };
            userElement.addEventListener('click', (e) => { e.preventDefault(); startChatAction(); });
            userElement.addEventListener('touchend', (e) => { e.preventDefault(); startChatAction(); });
            userList.appendChild(userElement);
        });
    });

    socket.on('update room list', (rooms) => {
        roomList.innerHTML = '';
        const publicRoom = createRoomElement({ name: 'public', hasPassword: false });
        roomList.appendChild(publicRoom);

        rooms.forEach(room => {
            if (room.name === 'public') return;
            const roomElement = createRoomElement(room);
            roomList.appendChild(roomElement);
        });

        // **MODIFIED**: Check if the current room was deleted
        const roomExists = rooms.some(room => room.name === currentChat.id);
        if (currentChat.type === 'room' && !roomExists) {
            alert(`The room "${currentChat.id}" was deleted. Moving you to Public chat.`);
            joinRoom('public');
        } else {
            setActiveChatUI(currentChat.id);
        }
    });

    socket.on('chat message', (message) => {
        const isPublicMessage = message.room && message.room === 'public' && currentChat.id === 'public';
        const isRoomMessage = message.room && message.room !== 'public' && message.room === currentChat.id;
        const isPrivateMessage = message.isPrivate && currentUser && (message.from === currentChat.id || message.to === currentChat.id);

        if (isPublicMessage || isRoomMessage || isPrivateMessage) {
            appendMessage(message);
        }
    });
    
    socket.on('chat history', ({ chatId, history }) => {
        if (chatId !== currentChat.id) return;
        chatMessages.innerHTML = '';
        history.forEach(appendMessage);
    });

    // --- Helper Functions ---
    function appendMessage(msg) {
        if (!currentUser) return;
        const isMine = msg.from === currentUser.userId;
        const messageElement = document.createElement('div');
        messageElement.className = `flex mb-4 ${isMine ? 'justify-end' : 'justify-start'}`;
        
        const bubbleClasses = isMine 
            ? 'bg-indigo-600 text-white' 
            : 'bg-gray-200 text-gray-800';

        messageElement.innerHTML = `
            <div class="flex flex-col max-w-xs lg:max-w-md">
                 ${!isMine ? `<span class="text-xs text-gray-500 mb-1">${msg.fromName}</span>` : ''}
                <div class="py-3 px-4 rounded-xl ${bubbleClasses}">
                    <p class="text-sm break-words">${msg.content}</p>
                    <span class="text-xs opacity-75 float-right mt-1">${new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
            </div>
        `;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function startPrivateChat(user) {
        currentChat = { type: 'private', id: user.userId };
        chatWith.textContent = `Chat with ${user.name}`;
        clearChatArea();
        socket.emit('request history', currentChat);
        setActiveChatUI(user.userId);
    }

    function joinRoom(roomName) {
        currentChat = { type: 'room', id: roomName };
        if (roomName === 'public') {
            chatWith.textContent = 'Public Chat';
        } else {
            chatWith.textContent = `Room: ${roomName}`;
        }
        clearChatArea();
        socket.emit('request history', currentChat);
        setActiveChatUI(roomName);
    }
    
    // **MODIFIED**: To add a delete button for admins
    function createRoomElement(room) {
        const roomElement = document.createElement('div');
        roomElement.className = 'flex items-center justify-between';

        const linkElement = document.createElement('a');
        linkElement.href = '#';
        linkElement.className = 'flex-grow flex items-center space-x-2 px-2 py-2 text-gray-700 hover:bg-indigo-100 rounded-md';
        linkElement.dataset.id = room.name;
        
        const lockIcon = room.hasPassword 
            ? `<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>` 
            : '';

        linkElement.innerHTML = `
            <span># ${room.name}</span>
            ${lockIcon}
        `;
        
        const joinAction = () => {
             if (room.hasPassword) {
                const password = prompt(`Enter password for room "${room.name}":`);
                if (password !== null) {
                    socket.emit('join room', { roomName: room.name, password });
                }
            } else {
                socket.emit('join room', { roomName: room.name, password: '' });
            }
             closeSidebar();
        };

        linkElement.addEventListener('click', (e) => { e.preventDefault(); joinAction(); });
        linkElement.addEventListener('touchend', (e) => { e.preventDefault(); joinAction(); });

        roomElement.appendChild(linkElement);

        // Add delete button if user is admin
        if (currentUser && currentUser.isAdmin && room.name !== 'public') {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'p-1 text-red-400 hover:text-red-600 rounded-full';
            deleteBtn.innerHTML = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"></path></svg>`;
            
            const deleteAction = (e) => {
                e.stopPropagation(); // Prevent the link from being clicked
                if (confirm(`Are you sure you want to permanently delete the room "${room.name}"?`)) {
                    socket.emit('delete room', room.name);
                }
            };
            deleteBtn.addEventListener('click', deleteAction);
            deleteBtn.addEventListener('touchend', deleteAction);
            roomElement.appendChild(deleteBtn);
        }

        return roomElement;
    }

    function setActiveChatUI(id) {
        document.querySelectorAll('a[data-id]').forEach(el => {
            el.classList.remove('bg-indigo-200', 'font-semibold');
        });
        const activeElement = document.querySelector(`a[data-id="${id}"]`);
        if (activeElement) {
            activeElement.classList.add('bg-indigo-200', 'font-semibold');
        }
    }
    
    function isChatActive(target) {
        if (!currentChat) return false;
        return target && target.type === currentChat.type && target.id === currentChat.id;
    }

    function clearChatArea() {
        chatMessages.innerHTML = '';
        typingIndicator.textContent = '';
        joinRoomError.textContent = '';
    }

    setActiveChatUI('public');
});
