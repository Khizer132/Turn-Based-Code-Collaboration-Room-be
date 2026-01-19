import express from 'express'
import { connectDB } from './config/db.js';
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser';
import cors from 'cors';
import {app , server} from './config/socket.js';

dotenv.config();

const PORT = process.env.PORT || 5001
app.use(cors({
    origin: ["http://localhost:5173",
        "https://turn-based-code-collaboration-room.vercel.app/"
    ],

    credentials: true,
}));


app.use(express.json());
app.use(cookieParser());

import authRoutes from './routes/authRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';

app.use("/api/v1", authRoutes);
app.use("/api/v1", sessionRoutes);


server.listen(PORT, () => {
    console.log("Serer listening on port:", PORT);
    connectDB();
});
