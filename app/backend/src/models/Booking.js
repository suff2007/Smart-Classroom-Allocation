const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
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
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
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
  purpose: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: ["PENDING", "ALLOTTED", "COMPLETED", "CANCELLED"],
  },
  bookingType: {
    type: String,
    required: true,
    enum: ["NORMAL", "BORROWED"],
  },
});

module.exports = mongoose.model("Booking", bookingSchema);
