const mongoose = require("mongoose");

const classroomSchema = new mongoose.Schema({
  roomNumber: {
    type: String,
    required: true,
    trim: true,
  },
  block: {
    type: String,
    required: true,
    trim: true,
  },
  capacity: {
    type: Number,
    default: null,
    validate: {
      validator: (value) => value === null || (Number.isInteger(value) && value > 0),
      message: "capacity must be a positive integer or null when unconfirmed.",
    },
    min: 1,
  },
  classroomType: {
    type: String,
    required: true,
    enum: ["SMART", "BLACKBOARD", "REGULAR", "LAB"],
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true,
  },
});

module.exports = mongoose.model("Classroom", classroomSchema);
