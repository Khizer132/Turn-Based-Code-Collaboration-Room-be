import catchAsyncErrors from "../middleware/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import MultiSession from "../models/multiSession.js";
import { nanoid } from "nanoid";``
import { get } from "mongoose";


// Create a new multi-developer session => post /api/v1/session/create
export const createMultiSession = catchAsyncErrors(async (req, res, next) => {

    // Generate a unique session ID
    const sessionId = nanoid(6);

    const session = await MultiSession.create({
        sessionId,
        developer1Id: req?.user?._id,
    });

    res.status(201).json({
        success: true,
        sessionId: session.sessionId,
        message: "Multi-developer session created successfully, waiting for another developer to join.",  
    });
});

// Join an existing multi-developer session => post /api/v1/session/join
export const joinMultiSession = catchAsyncErrors(async (req, res, next) => {
    const { sessionId } = req.body;

    const session = await MultiSession.findOne({ sessionId });

    if (!session) {
        return next(new ErrorHandler("Session not found", 404));
    }
    if(session.developer1Id.toString() === req?.user?._id.toString()) {
        return next(new ErrorHandler("You cannot join your own session", 400));
    }
    if (session.developer2Id) {
        return next(new ErrorHandler("Session is already full", 400));
    }

    session.developer2Id = req?.user?._id;
    session.sessionStatus = "active";

    await session.save();

    res.status(200).json({
        success: true,
        message: "Joined session successfully. let's code together!",
    });
});
