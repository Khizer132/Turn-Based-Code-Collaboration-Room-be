import { Server } from "socket.io";
import http from "http";
import express from "express";
import MultiSession from "../models/multiSession.js";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import cookieParser from "cookie-parser";

const app = express();
app.use(cookieParser());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "https://turn-based-code-collaboration-room.vercel.app"],
        credentials: true
    },
});

// Map to store session data 
const sessionState = new Map();

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.headers.cookie
            ?.split(';')
            .find(c => c.trim().startsWith('token='))
            ?.split('=')[1];

        if (!token) {
            return next(new Error("Authentication error: No token provided"));
        }

        const decodedData = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decodedData.id);

        if (!user) {
            return next(new Error("Authentication error: User not found"));
        }

        socket.userId = user._id.toString();
        socket.user = user;

        next();
    } catch (error) {
        console.error("Socket authentication error:", error);
        next(new Error("Authentication error: Invalid token"));
    }
});

function startTimer(sessionId, sessionData) {
    if (sessionData.timeInterval) {
        clearInterval(sessionData.timeInterval);
    }

    sessionData.remainingTime = 30;

    io.to(sessionId).emit("time-started", {
        currentTurn: sessionData.currentTurn,
        dev1enabled: sessionData.currentTurn === 'developer1',
        dev2enabled: sessionData.currentTurn === 'developer2',
        remainingTime: sessionData.remainingTime
    });

    sessionData.timeInterval = setInterval(() => {
        sessionData.remainingTime--;

        io.to(sessionId).emit("countdown-update", {
            currentTurn: sessionData.currentTurn,
            dev1enabled: sessionData.currentTurn === 'developer1',
            dev2enabled: sessionData.currentTurn === 'developer2',
            remainingTime: sessionData.remainingTime
        });

        if (sessionData.remainingTime <= 0) {
            sessionData.currentTurn = sessionData.currentTurn === 'developer1' ? 'developer2' : 'developer1';
            sessionData.remainingTime = 30;

            io.to(sessionId).emit("turn-switched", {
                currentTurn: sessionData.currentTurn,
                dev1enabled: sessionData.currentTurn === 'developer1',
                dev2enabled: sessionData.currentTurn === 'developer2',
                remainingTime: sessionData.remainingTime
            });

            console.log(`Turn switched to ${sessionData.currentTurn} for session ${sessionId}`);
        }
    }, 1000);
}

function checkToStartTime(sessionId, sessionData) {
    console.log(`[${sessionId}] checkToStartTime called - Dev1: ${sessionData.dev1Connected}, Dev2: ${sessionData.dev2Connected}, Started: ${sessionData.timeStarted}`);

    if (sessionData.dev1Connected && sessionData.dev2Connected && !sessionData.timeStarted) {
        sessionData.timeStarted = true;
        sessionData.currentTurn = 'developer1';
        sessionData.remainingTime = 30;

        console.log(`[${sessionId}] ✓ STARTING TIMER - Both developers connected!`);

        startTimer(sessionId, sessionData);
    } else {
        console.log(`[${sessionId}] Timer NOT started - conditions not met`);
    }
}

io.on("connection", (socket) => {
    console.log("Connected to socket.io, userId:", socket.userId);

    // join session - connection
    socket.on("join-session", async ({ sessionId }) => {
        try {
            const session = await MultiSession.findOne({ sessionId })
                .populate('developer1Id', 'name _id')
                .populate('developer2Id', 'name _id');

            console.log("[+] Session found:", sessionId);

            if (!session) {
                socket.emit("error", "Session not found");
                socket.disconnect();
                return;
            }

            // Check if user is part of session
            const isDeveloper1 = session.developer1Id._id.toString() === socket.userId;
            const isDeveloper2 = session.developer2Id?._id.toString() === socket.userId;

            console.log(`User ${socket.userId} - isDev1: ${isDeveloper1}, isDev2: ${isDeveloper2}`);

            if (!isDeveloper1 && !isDeveloper2) {
                socket.emit("error", "You are not authorized to join this session");
                socket.disconnect();
                return;
            }

            // Handle waiting room for developer1
            if (session.sessionStatus === "waiting" && isDeveloper1) {
                socket.join(sessionId);
                socket.sessionId = sessionId;
                socket.emit("session-joined", { sessionId, message: "Waiting for another developer..." });
                console.log("Developer1 joined the waiting room");
                return;
            }

            // Session must be active to proceed
            if (session.sessionStatus !== "active") {
                socket.emit("error", "Session is not active yet");
                socket.disconnect();
                return;
            }

            // Join the socket room
            socket.join(sessionId);
            socket.sessionId = sessionId;

            // Initialize session state if doesn't exist
            if (!sessionState.has(sessionId)) {
                console.log(`[${sessionId}] Initializing new session state`);
                sessionState.set(sessionId, {
                    dev1Connected: false,
                    dev2Connected: false,
                    timeStarted: false,
                    currentTurn: null,
                    timeInterval: null,
                    remainingTime: 30,
                    connectedSockets: new Map()
                });
            }

            const sessionData = sessionState.get(sessionId);

            const userKey = socket.userId;
            const alrdyConn = sessionData.connectedSockets.has(userKey);

            console.log(`[${sessionId}] User ${userKey} already connected: ${alrdyConn}`);

            // Only update connection state if this user hasn't connected yet
            if (!alrdyConn) {
                sessionData.connectedSockets.set(userKey, socket.id);

                if (isDeveloper1) {
                    sessionData.dev1Connected = true;
                    socket.isDeveloper1 = true;
                    console.log(`[${sessionId}] Developer1 connected`);
                } else if (isDeveloper2) {
                    sessionData.dev2Connected = true;
                    socket.isDeveloper2 = true;
                    console.log(`[${sessionId}] Developer2 connected`);

                    // Notify everyone that session is now active
                    io.to(sessionId).emit("session-activated", {
                        message: "Session is now active! Starting coding session...",
                        developer1: session.developer1Id,
                        developer2: session.developer2Id,
                        shouldRejoin: true
                    });
                }

                // Notify others that user joined
                socket.to(sessionId).emit("user-joined", {
                    userId: socket.userId,
                    userName: socket.user.name
                });
            } else {
                // User reconnecting - restore their role
                if (isDeveloper1) {
                    socket.isDeveloper1 = true;
                } else if (isDeveloper2) {
                    socket.isDeveloper2 = true;
                }
                console.log(`[${sessionId}] User ${userKey} reconnecting`);
            }

            socket.emit("session-participants", {
                developer1: session.developer1Id,
                developer2: session.developer2Id
            });

            // Log current state before checking timer
            console.log(`[${sessionId}] State check - Dev1: ${sessionData.dev1Connected}, Dev2: ${sessionData.dev2Connected}, TimerStarted: ${sessionData.timeStarted}`);

            // Send current timer state if it exists
            if (sessionData.timeStarted && sessionData.currentTurn) {
                console.log(`[${sessionId}] Sending existing timer state to user`);
                socket.emit("time-started", {
                    currentTurn: sessionData.currentTurn,
                    dev1enabled: sessionData.currentTurn === 'developer1',
                    dev2enabled: sessionData.currentTurn === 'developer2',
                    remainingTime: sessionData.remainingTime || 30
                });
            } else {
                console.log(`[${sessionId}] Attempting to start timer...`);
                checkToStartTime(sessionId, sessionData);

                // delayed check 
                setTimeout(() => {
                    if (!sessionData.timeStarted && sessionData.dev1Connected && sessionData.dev2Connected) {
                        console.log(`[${sessionId}] CheckK - Both devs connected but timer not started! Force starting...`);
                        checkToStartTime(sessionId, sessionData);
                    }
                }, 1000);
            }

        } catch (error) {
            console.error("Error joining session:", error);
            socket.emit("error", "Internal Server Error");
        }
    });

    // Exchange code - connection
    socket.on("code-updated", ({ code, sessionId }) => {
        const sessionData = sessionState.get(sessionId);
        if (!sessionData) return;

        socket.to(sessionId).emit("code-exchanged", {
            code,
            userId: socket.userId,
            userName: socket.user.name
        });
    });

    //  socket.on("code-operation", ({ sessionId, changes }) => {
    //     socket.to(sessionId).emit("remote-code-operation", { changes });
    // });



    // Disconnect user - connection
    socket.on("disconnect", () => {
        console.log(`User disconnecting: ${socket.userId}`);

        if (socket.sessionId) {
            const sessionData = sessionState.get(socket.sessionId);

            if (sessionData) {
                // Remove from connected sockets Map
                sessionData.connectedSockets.delete(socket.userId);

                if (socket.isDeveloper1) {
                    sessionData.dev1Connected = false;
                    console.log(`[${socket.sessionId}] Developer1 disconnected`);
                } else if (socket.isDeveloper2) {
                    sessionData.dev2Connected = false;
                    console.log(`[${socket.sessionId}] Developer2 disconnected`);
                }

                // Stop timer if both developers are gone
                if (!sessionData.dev1Connected && !sessionData.dev2Connected) {
                    if (sessionData.timeInterval) {
                        clearInterval(sessionData.timeInterval);
                        sessionData.timeInterval = null;
                    }
                    sessionData.timeStarted = false;
                    console.log(`[${socket.sessionId}] Both developers disconnected - timer stopped`);
                }

                // Notify others
                socket.to(socket.sessionId).emit("user-left", {
                    userId: socket.userId,
                    userName: socket.user.name
                });
            }
        }
        console.log("User Disconnected, userId:", socket.userId);
    });
});

export { io, server, app };




