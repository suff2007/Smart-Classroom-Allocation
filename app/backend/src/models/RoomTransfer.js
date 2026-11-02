const mongoose = require("mongoose");

const roomTransferSchema = new mongoose.Schema({
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  requestType: {
    type: String,
    required: true,
    enum: ["LEND", "BORROW"],
  },
  roomNumber: {
    type: String,
    required: true,
  },
  block: {
    type: String,
    required: true,
  },
  requesterName: {
    type: String,
    required: true,
    trim: true,
  },
  requesterEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  requesterDepartment: {
    type: String,
    required: true,
    trim: true,
  },
  lendingDepartment: {
    type: String,
    required: true,
  },
  borrowingDepartment: {
    type: String,
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
    enum: ["REQUESTED", "APPROVED", "REJECTED", "COMPLETED"],
  },
});

module.exports = mongoose.model("RoomTransfer", roomTransferSchema);
