import ErrorHandler from "../utils/errorHandler.js";

export default (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message || "Internal Server Error";
    error.statusCode = err.statusCode || 500;

    // Handle Invalid Mongoose Id error
    if (err.name === "CastError") {
        const message = `Resource not found. Invalid: ${err.path}`;
        error = new ErrorHandler(message, 404);
    }

    // Handle Mongoose Validation error
    if (err.name === "ValidationError") {
        const message = Object.values(err.errors).map(value => value.message).join(", ");
        error = new ErrorHandler(message, 400);
    }

    // Handle Mongoose Duplicate error
    if (err.code === 11000) {
        const message = `Duplicate ${Object.keys(err.keyValue)} entered`;
        error = new ErrorHandler(message, 400);
    }

    // Handle JWT error
    if (err.name === "JsonWebTokenError") {
        const message = "JSON Web Token is invalid, try again";
        error = new ErrorHandler(message, 400);
    }

    // Handle JWT Expire error
    if (err.name === "TokenExpiredError") {
        const message = "JSON Web Token is expired, try again";
        error = new ErrorHandler(message, 400);
    }

    if (process.env.NODE_ENV === "DEVELOPMENT") {
        res.status(error.statusCode).json({
            message: error.message,
            error,
            stack: error.stack
        });
    } else if (process.env.NODE_ENV === "PRODUCTION") {
        res.status(error.statusCode).json({
            message: error.message
        });
    }
};