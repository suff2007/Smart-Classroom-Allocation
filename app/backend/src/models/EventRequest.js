const mongoose = require("mongoose");

const eventRequestSchema = new mongoose.Schema({
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  eventType: {
    type: String,
    required: true,
    enum: ["EXAM", "PLACEMENT"],
  },
  participantCount: {
    type: Number,
    required: true,
    min: 1,
  },
  date: {
    type: Date,
    required: true,
  },
  startTime: {
    type: String,
    required: true,
  },
  endTime: {
    type: String,
    required: true,
  },
  block: String,
  classroomType: String,
  minimumCapacity: Number,
  previewStatus: {
    type: String,
    required: true,
  },
  previewRooms: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  allocationCreated: {
    type: Boolean,
    required: true,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model("EventRequest", eventRequestSchema);
