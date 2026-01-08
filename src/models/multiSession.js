import mongoose from "mongoose";

const multiSessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
    },
    developer1Id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    developer2Id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    sessionStatus: {
        type: String,
        enum: ["active", "waiting", "ended"],
        default: "waiting",
    },
}); 

export default mongoose.model("MultiSession", multiSessionSchema);