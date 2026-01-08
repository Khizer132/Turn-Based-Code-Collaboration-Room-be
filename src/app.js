import express from 'express'
import { connectDB } from './config/db.js';
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5001

connectDB();

app.use(express.json());
app.use(cookieParser());

import authRoutes from './routes/authRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';

app.use("/api/v1", authRoutes);
app.use("/api/v1", sessionRoutes);


app.listen(PORT, () => {
    console.log("Serer listening on port:", PORT);
});
