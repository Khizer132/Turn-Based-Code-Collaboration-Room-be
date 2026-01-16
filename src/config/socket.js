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
        origin: ["http://localhost:5173"],
        credentials: true
    },
});


const sessionState = new Map();


// Authenticate socket connection using JWT token from cookies
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

    sessionData.timeInterval = setInterval(() => {

        sessionData.currentTurn = sessionData.currentTurn === 'developer1' ? 'developer2' : 'developer1';

        io.to(sessionId).emit("turn-switched", {
            currentTurn: sessionData.currentTurn,

            dev1enabled: sessionData.currentTurn === 'developer1',
            dev2enabled: sessionData.currentTurn === 'developer2',

            remainingTime: 30
        });

        console.log(`Turn switeched to ${sessionData.currentTurn} for session ${sessionId}`);

    }, 30000);

}

function checkToStartTime(sessionId, sessionData) {
    if (sessionData.dev1Connected && sessionData.dev2Connected && !sessionData.timeStarted) {
        sessionData.timeStarted = true;
        sessionData.currentTurn = 'developer1';

        io.to(sessionId).emit("time-started", {
            currentTurn: sessionData.currentTurn,
            dev1enabled: true,
            dev2enabled: false,
            remainingTime: 30
        });

        startTimer(sessionId, sessionData);
    }
}



io.on("connection", (socket) => {
    console.log("Connected to socket.io, userId:", socket.userId);

    // Join session
    socket.on("join-session", async ({ sessionId }) => {
        try {
            const session = await MultiSession.findOne({ sessionId })
                .populate('developer1Id', 'name _id')
                .populate('developer2Id', 'name _id');

            if (!session) {
                socket.emit("error", "Session not found");
                socket.disconnect();
                return;
            }

            // Check if user is part of this session
            const isDeveloper1 = session.developer1Id._id.toString() === socket.userId;
            const isDeveloper2 = session.developer2Id?._id.toString() === socket.userId;

            if (!isDeveloper1 && !isDeveloper2) {
                socket.emit("error", "You are not authorized to join this session");
                socket.disconnect();
                return;
            }

            if (session.sessionStatus === "waiting" && isDeveloper1) {
                socket.join(sessionId);
                socket.sessionId = sessionId;
                socket.emit("session-joined", { sessionId, message: "Waiting for another developer..." });
                console.log("user joined the waiting room", socket.userId);
                return;
            }

            if (session.sessionStatus !== "active") {
                socket.emit("error", "Session is not active yet");
                socket.disconnect();
                return;
            }

            socket.join(sessionId);
            socket.sessionId = sessionId;


            if (!sessionState.has(sessionId)) {
                sessionState.set(sessionId, {
                    dev1Connected: false,
                    dev2Connected: false,
                    timeStarted: false,
                    currentTurn: null,
                    timeInterval: null
                });
            }

            const sessionData = sessionState.get(sessionId);

            if (isDeveloper1) {
                sessionData.dev1Connected = true;
                socket.isDeveloper1 = true;
            } else if (isDeveloper2) {
                sessionData.dev2Connected = true;
                socket.isDeveloper2 = true;
            }


            // Send session participants info
            socket.emit("session-participants", {
                developer1: session.developer1Id,
                developer2: session.developer2Id
            });

            // Notify other users
            socket.to(sessionId).emit("user-joined", {
                userId: socket.userId,
                userName: socket.user.name
            });


            checkToStartTime(sessionId, sessionData);

        } catch (error) {
            console.log("Error joining session:", error);
            socket.emit("error", "Internal Server Error");
        }
    });

    // Exchange code connection
    socket.on("code-updated", ({ code, sessionId }) => {
        const sessionData = sessionState.get(sessionId);
        if (!sessionData) return;

        socket.to(sessionId).emit("code-exchanged", {
            code,
            userId: socket.userId,
            userName: socket.user.name
        });
    });



    // Disconnect user connection
    socket.on("disconnect", () => {

        if (socket.sessionId) {
            socket.to(socket.sessionId).emit("user-left", {
                userId: socket.userId,
                userName: socket.user.name
            });
        }
        console.log("User Disconnected, userId:", socket.userId);
    });
});

export { io, server, app };
