import express from "express";
import { get } from "mongoose";
import { isAuthenticatedUser } from "../middleware/auth.js";
import { createMultiSession, joinMultiSession } from "../controllers/sessionGeneratorController.js";
const router = express.Router();

router.route("/session/create").post(isAuthenticatedUser, createMultiSession);
router.route("/session/join").post(isAuthenticatedUser, joinMultiSession);

export default router