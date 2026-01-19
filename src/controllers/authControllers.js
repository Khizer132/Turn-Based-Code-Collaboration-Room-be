import { get } from "mongoose";
import User from "../models/user.js";
import catchAsyncErrors from "../middleware/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import sendToken from "../utils/sendToken.js";

// Register a user
export const registerUser = catchAsyncErrors(async (req, res, next) => {

    const { name, email, password } = req.body;

    const user = await User.create({
        name,
        email,
        password,
    });

    sendToken(user, 201, res);
});

// Login User
export const loginUser = catchAsyncErrors(async (req, res, next) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return next(new ErrorHandler("Invalid Email and  Password ", 400))
    }

    // check if user exist
    const user = await User.findOne({ email });

    if (!user) {
        return next(new ErrorHandler("Invalid Email or Password ", 401))
    }

    const isPasswordMatched = await user.comparePassword(password);

    if (!isPasswordMatched) {
        return next(new ErrorHandler("Invalid Email or Password ", 401))
    }

    sendToken(user, 201, res);
});

// Logout User
export const logoutUser = catchAsyncErrors(async (req, res, next) => {

    res.cookie("token", null, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        expires: new Date(Date.now()),
        
    });
    res.status(200).json({
        success: true,
        message: "Logged Out successfully",
    });
});


// get current user profile
export const getUserProfile = catchAsyncErrors(async (req, res, next) => {

    const user = await User.findById(req?.user?.id);
    res.status(200).json({
        success: true,
        user,
    });
});

