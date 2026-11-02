const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  passwordHash: {
    type: String,
    required: true,
    minlength: 60,
  },
  emailVerified: { type: Boolean, default: false },
  emailVerificationHash: { type: String, select: false },
  emailVerificationExpires: { type: Date, select: false },
  role: {
    type: String,
    required: true,
    enum: ["ADMIN", "COORDINATOR"],
    default: "COORDINATOR",
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model("User", userSchema);
