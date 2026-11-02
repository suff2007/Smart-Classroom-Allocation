const fs = require("node:fs/promises");
const path = require("node:path");
const {
  isConfirmedBlock,
  normalizeConfirmedBlock,
} = require("./roomIdentityService");

const SUPPORTED_DAYS = new Set([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

const SUPPORTED_ENTRY_TYPES = new Set([
  "CLASS",
  "LAB",
  "MENTORING",
  "LIBRARY",
  "TUTORIAL",
  "BREAK",
  "LUNCH",
]);

const EXACT_ACTIVITY_TYPES = new Set([
  "BREAK",
  "LUNCH",
  "LIBRARY",
  "MENTORING",
  "TUTORIAL",
]);

const UNCERTAIN_STATUSES = new Set([
  "NEEDS_VISUAL_REVIEW",
  "AMBIGUOUS",
  "MISSING_INFORMATION",
]);

const DEFAULT_REVIEW_FILE = path.resolve(
  __dirname,
  "../../data/review/timetable-extraction-review.json",
);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseTime(value) {
  if (typeof value !== "string" || !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

// REVA timetable grids use 12-hour labels after lunch (01:20 means 13:20).
// Keep parseTime strict for user-entered search times; apply this only to source timetable cells.
function parseTimetableTime(value) {
  const minutes = parseTime(value);
  if (minutes === null) return null;
  const [rawHours, minutePart] = value.split(":").map(Number);
  const hours = rawHours >= 1 && rawHours <= 4 ? rawHours + 12 : rawHours;
  return hours * 60 + minutePart;
}

function parseSingleSectionRoom(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(SMVB|SMV|SVB|CVR)\s+([A-Za-z0-9-]+)$/i);
  if (!match) return null;
  return { block: normalizeConfirmedBlock(match[1]), roomNumber: match[2].toUpperCase() };
}

function subjectMentionsRoom(subjectOrActivity) {
  return typeof subjectOrActivity === "string" &&
    /\b(?:SMVB|SMV|SVB|CVR)\s*(?:G\s*)?[A-Z0-9]+/i.test(subjectOrActivity);
}

function inferEntryTypeFromSubject(subjectOrActivity) {
  if (typeof subjectOrActivity !== "string") {
    return null;
  }

  const normalized = subjectOrActivity.trim().replace(/\s+/g, " ").toUpperCase();

  if (EXACT_ACTIVITY_TYPES.has(normalized)) {
    return normalized;
  }
  if (/\bLAB\b|\bPFL\b|\bPRACTICAL\b/.test(normalized)) {
    return "LAB";
  }
  // Obvious extraction typos and multi-activity labels need review, not guessing.
  if (normalized === "BEARK" || normalized.includes("/")) return null;
  // Ordinary named subjects (e.g. DBMS, OOPs, Computer Networks) are classes.
  return normalized ? "CLASS" : null;
}

function validateEntry(entry, sourceIndex) {
  const reasons = [];

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return {
      sourceIndex,
      entry,
      reasons: [{ code: "INVALID_ENTRY", message: "Entry must be an object." }],
    };
  }

  let validatedEntry = entry;
  const rawEntryType = entry.entryType;
  const hasExplicitEntryType =
    rawEntryType !== null &&
    rawEntryType !== undefined &&
    !(typeof rawEntryType === "string" && rawEntryType.trim() === "");
  if (hasExplicitEntryType && typeof rawEntryType === "string") {
    const normalizedEntryType = rawEntryType.trim().replace(/\s+/g, " ").toUpperCase();
    if (normalizedEntryType !== rawEntryType) {
      validatedEntry = { ...validatedEntry, entryType: normalizedEntryType };
    }
  } else {
    const inferredEntryType = inferEntryTypeFromSubject(entry.subjectOrActivity);
    if (inferredEntryType) {
      validatedEntry = {
        ...validatedEntry,
        entryType: inferredEntryType,
        entryTypeSource: "subjectOrActivity",
      };
    }
  }

  if (UNCERTAIN_STATUSES.has(entry.extractionStatus)) {
    reasons.push({
      code: "UNCERTAIN_EXTRACTION",
      message: `Extraction status ${entry.extractionStatus} is not eligible for import.`,
    });
  } else if (entry.extractionStatus !== "VERIFIED_TEXT") {
    reasons.push({
      code: "UNSUPPORTED_EXTRACTION_STATUS",
      message: "Only VERIFIED_TEXT entries are eligible for import.",
    });
  }

  const requiredTextFields = [
    "sourceFilename",
    "program",
    "semester",
    "section",
    "academicYear",
    "day",
    "subjectOrActivity",
    "scheduleId",
  ];

  for (const field of requiredTextFields) {
    if (!isNonEmptyString(entry[field])) {
      reasons.push({
        code: "MISSING_REQUIRED_FIELD",
        field,
        message: `${field} must be a non-empty string.`,
      });
    }
  }

  if (!isValidDate(entry.effectiveFrom)) {
    reasons.push({
      code: "INVALID_EFFECTIVE_DATE",
      field: "effectiveFrom",
      message: "effectiveFrom must be a real calendar date in YYYY-MM-DD format.",
    });
  }

  if (isNonEmptyString(entry.day) && !SUPPORTED_DAYS.has(entry.day.trim().toUpperCase())) {
    reasons.push({
      code: "UNSUPPORTED_DAY",
      field: "day",
      message: "day must be a recognized weekday name.",
    });
  }

  const startMinutes = parseTimetableTime(entry.startTime);
  const endMinutes = parseTimetableTime(entry.endTime);

  if (startMinutes === null) {
    reasons.push({
      code: "INVALID_START_TIME",
      field: "startTime",
      message: "startTime must use a valid 24-hour HH:mm or H:mm clock value.",
    });
  }

  if (endMinutes === null) {
    reasons.push({
      code: "INVALID_END_TIME",
      field: "endTime",
      message: "endTime must use a valid 24-hour HH:mm or H:mm clock value.",
    });
  } else if (startMinutes !== null && endMinutes <= startMinutes) {
    reasons.push({
      code: "INVALID_TIME_RANGE",
      message:
        "endTime must be later than startTime; ambiguous 12-hour/afternoon values are not adjusted automatically.",
    });
  }

  let roomNumber = typeof entry.roomNumber === "string" ? entry.roomNumber.trim() : entry.roomNumber;
  let block = typeof entry.block === "string" ? entry.block.trim() : entry.block;
  // When a subject explicitly names another/grouped room, do not silently assign the section's default room.
  if (!isNonEmptyString(roomNumber) && !subjectMentionsRoom(entry.subjectOrActivity)) {
    const sectionRoom = parseSingleSectionRoom(entry.sectionRoomAssignment);
    if (sectionRoom) {
      roomNumber = sectionRoom.roomNumber;
      if (!isNonEmptyString(block)) block = sectionRoom.block;
      validatedEntry = { ...validatedEntry, roomNumber, block, roomAssignmentSource: "SECTION_DEFAULT_ROOM" };
    }
  }
  if (typeof roomNumber === "string" && roomNumber !== entry.roomNumber) {
    validatedEntry = { ...validatedEntry, roomNumber };
  }
  if (!isNonEmptyString(roomNumber)) {
    reasons.push({
      code: "MISSING_PERIOD_ROOM",
      field: "roomNumber",
      message: "A clear period room or single-room section assignment is required.",
    });
  } else if (/[,/;&]/.test(roomNumber)) {
    reasons.push({
      code: "AMBIGUOUS_ROOM_REFERENCE",
      field: "roomNumber",
      message: "roomNumber must identify one room, not a grouped or alternative room reference.",
    });
  }

  if (!isNonEmptyString(block)) {
    reasons.push({
      code: "MISSING_BLOCK",
      field: "block",
      message: "A confirmed block is required for the period room.",
    });
  } else if (/[,/;&]/.test(block)) {
    reasons.push({
      code: "AMBIGUOUS_BLOCK",
      field: "block",
      message: "block must identify one block, not a grouped or alternative reference.",
    });
  } else if (!isConfirmedBlock(block)) {
    reasons.push({
      code: "UNCONFIRMED_BLOCK_LABEL",
      field: "block",
      message: "block must use a confirmed block identity: SMV, SVB, or CVR.",
    });
  } else {
    const normalizedBlock = normalizeConfirmedBlock(block);
    if (normalizedBlock !== block) {
      validatedEntry = { ...validatedEntry, block: normalizedBlock };
    }
  }

  const entryType = validatedEntry.entryType;
  if (typeof entryType !== "string" || !SUPPORTED_ENTRY_TYPES.has(entryType)) {
    reasons.push({
      code: hasExplicitEntryType
        ? "INVALID_ENTRY_TYPE"
        : "UNSUPPORTED_OR_MISSING_ENTRY_TYPE",
      field: "entryType",
      message: hasExplicitEntryType
        ? `Explicit entryType must be one of: ${[...SUPPORTED_ENTRY_TYPES].join(", ")}.`
        : `entryType is missing and could not be inferred; supported values are: ${[...SUPPORTED_ENTRY_TYPES].join(", ")}.`,
    });
  }

  return { sourceIndex, entry: validatedEntry, reasons };
}

function validateReviewData(reviewData, sourceFile = DEFAULT_REVIEW_FILE) {
  if (!reviewData || typeof reviewData !== "object" || !Array.isArray(reviewData.entries)) {
    throw new TypeError("Timetable review JSON must contain an entries array.");
  }

  const acceptedEntries = [];
  const rejectedEntries = [];

  reviewData.entries.forEach((entry, sourceIndex) => {
    const result = validateEntry(entry, sourceIndex);

    if (result.reasons.length > 0) {
      rejectedEntries.push(result);
    } else {
      acceptedEntries.push({ sourceIndex, entry: result.entry });
    }
  });

  const reasonCounts = {};
  for (const rejected of rejectedEntries) {
    for (const reason of rejected.reasons) {
      reasonCounts[reason.code] = (reasonCounts[reason.code] || 0) + 1;
    }
  }

  return {
    sourceFile,
    sourceEntryCount: reviewData.entries.length,
    acceptedCount: acceptedEntries.length,
    rejectedCount: rejectedEntries.length,
    reasonCounts,
    acceptedEntries,
    rejectedEntries,
  };
}

async function loadAndValidateTimetableReview(
  reviewFile = DEFAULT_REVIEW_FILE,
) {
  const contents = await fs.readFile(reviewFile, "utf8");
  let reviewData;

  try {
    reviewData = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Unable to parse timetable review file: ${reviewFile}`, {
      cause: error,
    });
  }

  return validateReviewData(reviewData, reviewFile);
}

module.exports = {
  DEFAULT_REVIEW_FILE,
  loadAndValidateTimetableReview,
  validateEntry,
  validateReviewData,
  parseTime,
  parseTimetableTime,
  parseSingleSectionRoom,
  subjectMentionsRoom,
  inferEntryTypeFromSubject,
};
