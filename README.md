Real-Time Chat Application
A secure and scalable real-time chat platform built with Node.js, Express, Socket.IO, and SQLite for persistent storage.

Features
Real-Time Messaging: Instant message delivery using WebSockets via Socket.IO.

User Authentication: Simple session management ensures users remain logged in even after a page refresh.

Public & Private Rooms: Users can create public chat rooms or private, password-protected rooms.

Private Messaging: Engage in one-on-one conversations with other online users.

Admin Controls: A user with the name "admin" has the ability to delete any room.

Persistent Chat History: All room and private chat messages are stored in a SQLite database.

Typing Indicators: See when another user is typing a message in real-time.

Online User List: View a list of all currently online users.

Responsive Design: A mobile-first interface with a collapsible sidebar for a seamless experience on any device.

Getting Started
Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

Prerequisites
You need to have Node.js (which includes npm) installed on your computer.

Installation
Clone the repository to your local machine or download the project files into a main folder (e.g., chat-project).

Ensure the folder structure is correct:

chat-project/
├── server.js
├── package.json
└── frontend/
    ├── index.html
    ├── style.css
    └── script.js

Install dependencies: Open your terminal in the root chat-project folder and run the following command. This will read your package.json file and install all the necessary libraries into a node_modules folder.

npm install

Running the Application
Start the server: While still in the root chat-project folder, run the start command:

npm start

You should see a confirmation message in your terminal:

Server is running on http://localhost:3000
Connected to the SQLite database.

Launch the app: Open your web browser and navigate to:

http://localhost:3000

Deployment
This application is configured for deployment on a Platform-as-a-Service (PaaS) like Render. It is not compatible with serverless platforms like Vercel due to its use of WebSockets and a persistent SQLite database.

Build Command: npm install

Start Command: npm start

For a production environment, it is recommended to replace the SQLite database with a managed database service (like PostgreSQL or Redis) to ensure data persistence, as free hosting services often have ephemeral filesystems.

Technologies Used
Backend: Node.js, Express.js, Socket.IO

Database: SQLite

Frontend: HTML5, Tailwind CSS, Vanilla JavaScript
