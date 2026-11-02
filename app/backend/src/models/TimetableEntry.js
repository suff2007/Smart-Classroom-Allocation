const mongoose = require("mongoose");

const timetableEntrySchema = new mongoose.Schema({
  day: {
    type: String,
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
  section: {
    type: String,
    required: true,
  },
  subjectOrActivity: {
    type: String,
    required: true,
  },
  roomNumber: {
    type: String,
    required: true,
  },
  block: {
    type: String,
    required: true,
    trim: true,
  },
  entryType: {
    type: String,
    required: true,
    enum: [
      "CLASS",
      "LAB",
      "MENTORING",
      "LIBRARY",
      "TUTORIAL",
      "BREAK",
      "LUNCH",
    ],
  },
  sourceFilename: {
    type: String,
    trim: true,
  },
  effectiveFrom: {
    type: Date,
  },
  extractionStatus: {
    type: String,
    enum: [
      "VERIFIED_TEXT",
      "NEEDS_VISUAL_REVIEW",
      "AMBIGUOUS",
      "MISSING_INFORMATION",
    ],
  },
  program: {
    type: String,
    trim: true,
  },
  programCode: {
    type: String,
    trim: true,
  },
  semester: {
    type: String,
    trim: true,
  },
  academicYear: {
    type: String,
    trim: true,
  },
  scheduleId: {
    type: String,
    trim: true,
  },
  isAvailable: {
    type: Boolean,
    required: true,
  },
});

module.exports = mongoose.model("TimetableEntry", timetableEntrySchema);
