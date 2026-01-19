export default function sendToken(user, statusCode, res) {

    const token = user.getJwtToken();

    // Options for cookie
    const options = {
        httpOnly: true,
        secure: true,          // REQUIRED for HTTPS (Vercel)
        sameSite: "none",      // REQUIRED for cross-origin cookies
        expires: new Date(
            Date.now() + process.env.COOKIE_EXPIRE * 24 * 60 * 60 * 1000
        ),
        
    };

    res.status(statusCode).cookie("token", token, options).json({
        success: true,
        token,
    });
}
