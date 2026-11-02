const path = require("node:path");

const { parseTime, parseTimetableTime, parseSingleSectionRoom, subjectMentionsRoom } = require("./timetableImportService");
const {
  hasConfirmedRoomIdentity,
  sameBlockIdentity,
  sameRoomIdentity,
} = require("./roomIdentityService");

const INVENTORY_FILE = path.resolve(__dirname, "../../data/room-inventory.json");
const ROOM_TYPES = new Set(["SMART", "BLACKBOARD", "REGULAR", "LAB"]);
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toDateString(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return null;
}

function getWeekday(dateString) {
  return WEEKDAYS[new Date(`${dateString}T00:00:00.000Z`).getUTCDay()];
}

function validateAvailabilityQuery(query) {
  const dateFrom = query.date || query.dateFrom;
  const dateTo = query.date || query.dateTo || dateFrom;
  const startMinutes = parseTime(query.startTime);
  const endMinutes = parseTime(query.endTime);
  const errors = [];

  if (!isValidDate(dateFrom) || !isValidDate(dateTo) || dateTo < dateFrom) {
    errors.push("date or dateFrom/dateTo must be valid YYYY-MM-DD dates in ascending order.");
  }
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    errors.push("startTime and endTime must form a valid, increasing 24-hour time range.");
  }
  if (query.classroomType && !ROOM_TYPES.has(query.classroomType)) {
    errors.push("classroomType must be SMART, BLACKBOARD, REGULAR, or LAB.");
  }
  if (
    query.minimumCapacity !== undefined &&
    (!/^\d+$/.test(String(query.minimumCapacity)) ||
      Number(query.minimumCapacity) < 1)
  ) {
    errors.push("minimumCapacity must be a positive integer.");
  }
  for (const field of ["block", "roomNumber"]) {
    if (
      query[field] !== undefined &&
      (typeof query[field] !== "string" || !query[field].trim())
    ) {
      errors.push(`${field} must be a non-empty string when supplied.`);
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors,
    value: {
      dateFrom,
      dateTo,
      startTime: query.startTime,
      endTime: query.endTime,
      startMinutes,
      endMinutes,
      block: typeof query.block === "string" ? query.block.trim() : undefined,
      roomNumber:
        typeof query.roomNumber === "string" ? query.roomNumber.trim() : undefined,
      classroomType: query.classroomType,
      minimumCapacity:
        query.minimumCapacity === undefined ? null : Number(query.minimumCapacity),
    },
  };
}

function findFirstWeekdayInRange(dateFrom, dateTo, weekday) {
  const first = new Date(`${dateFrom}T00:00:00.000Z`);
  const targetDay = WEEKDAYS.findIndex(
    (day) => day.toUpperCase() === String(weekday).toUpperCase(),
  );
  if (targetDay < 0) {
    return null;
  }

  const offset = (targetDay - first.getUTCDay() + 7) % 7;
  first.setUTCDate(first.getUTCDate() + offset);
  const candidate = first.toISOString().slice(0, 10);
  return candidate <= dateTo ? candidate : null;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function timetableRoomIdentity(entry) {
  const hasPeriodRoom =
    typeof entry?.roomNumber === "string" &&
    entry.roomNumber.trim();

  const hasPeriodBlock =
    typeof entry?.block === "string" &&
    entry.block.trim();

  if (hasPeriodRoom && hasPeriodBlock) {
    return {
      roomNumber: entry.roomNumber.trim(),
      block: entry.block.trim(),
    };
  }

  // Never guess when only half of a room identity is available.
  if (hasPeriodRoom || hasPeriodBlock) return null;

  // Extract a room only when the subject contains exactly one
  // clearly identifiable block + room reference.
  const subject = entry?.subjectOrActivity || "";
  const matches = [
    ...subject.matchAll(
      /\b(SMVB|SMV|SVB|CVR)\s+([A-Z0-9-]+)\b/gi
    ),
  ];

  const uniqueRooms = new Map();

  for (const match of matches) {
    const room = parseSingleSectionRoom(
      `${match[1]} ${match[2]}`
    );

    if (room) {
      uniqueRooms.set(
        `${room.block}:${room.roomNumber}`,
        room
      );
    }
  }

  if (uniqueRooms.size === 1) {
    return [...uniqueRooms.values()][0];
  }

  // Multiple room references are ambiguous; do not guess.
  if (uniqueRooms.size > 1 || subjectMentionsRoom(subject)) {
    return null;
  }

  return parseSingleSectionRoom(entry?.sectionRoomAssignment);
}

function hasRoomTimetableCoverage(entries, room, query) {
  return entries.some((entry) => {
    const identity = timetableRoomIdentity(entry);
    if (!identity || !sameRoomIdentity(identity, room)) return false;
    const start = parseTimetableTime(entry.startTime);
    const end = parseTimetableTime(entry.endTime);
    const effectiveFrom = toDateString(entry.effectiveFrom);
    return ["CLASS", "LAB", "MENTORING", "TUTORIAL"].includes(entry.entryType) &&
      start !== null && end !== null && end > start && Boolean(effectiveFrom) &&
      effectiveFrom <= query.dateTo &&
      typeof entry.day === "string" && WEEKDAYS.some((day) => day.toUpperCase() === entry.day.toUpperCase());
  });
}

function findTimetableEvidence(entries, room, query) {
  const evidence = [];

  for (const entry of entries) {
    if (
      !sameRoomIdentity(timetableRoomIdentity(entry) || {}, room) ||
      !["CLASS", "LAB", "MENTORING", "LIBRARY", "TUTORIAL", "BREAK", "LUNCH"].includes(
        entry?.entryType,
      )
    ) {
      continue;
    }

    const start = parseTimetableTime(entry.startTime);
    const end = parseTimetableTime(entry.endTime);
    const effectiveFrom = toDateString(entry.effectiveFrom);
    if (start === null || end === null || end <= start || !effectiveFrom) {
      evidence.push({
        type: "UNVERIFIED_TIMETABLE_ENTRY",
        sourceFilename: entry.sourceFilename,
        scheduleId: entry.scheduleId,
        reason: "Matching room evidence has invalid or missing schedule timing metadata.",
      });
      continue;
    }

    const applicableFrom = effectiveFrom > query.dateFrom ? effectiveFrom : query.dateFrom;
    const conflictDate = findFirstWeekdayInRange(applicableFrom, query.dateTo, entry.day);
    if (
      conflictDate &&
      overlaps(start, end, query.startMinutes, query.endMinutes)
    ) {
      evidence.push({
        type:
          ["CLASS", "LAB", "MENTORING", "TUTORIAL"].includes(entry.entryType)
            ? "OCCUPIED_TIMETABLE"
            : "FREE_ACTIVITY_TIMETABLE",
        date: conflictDate,
        startTime: entry.startTime,
        endTime: entry.endTime,
        entryType: entry.entryType,
        subjectOrActivity: entry.subjectOrActivity,
        sourceFilename: entry.sourceFilename,
        scheduleId: entry.scheduleId,
        extractionStatus: entry.extractionStatus,
      });
    }
  }

  return evidence;
}

function findUncertainRoomEvidence(entries, room, query) {
  const evidence = [];
  for (const entry of entries) {
    if (!sameRoomIdentity(timetableRoomIdentity(entry) || {}, room)) {
      continue;
    }

    const start = parseTimetableTime(entry.startTime);
    const end = parseTimetableTime(entry.endTime);
    const effectiveFrom = toDateString(entry.effectiveFrom);
    if (start === null || end === null || end <= start || !effectiveFrom) {
      continue;
    }
    const applicableFrom = effectiveFrom > query.dateFrom ? effectiveFrom : query.dateFrom;
    const conflictDate = findFirstWeekdayInRange(applicableFrom, query.dateTo, entry.day);
    if (
      conflictDate &&
      overlaps(start, end, query.startMinutes, query.endMinutes)
    ) {
      evidence.push({
        type: "UNCERTAIN_TIMETABLE_ENTRY",
        date: conflictDate,
        sourceFilename: entry.sourceFilename,
        scheduleId: entry.scheduleId,
        extractionStatus: entry.extractionStatus,
        notes: entry.notes,
      });
    }
  }
  return evidence;
}

function findDatedConflicts(records, room, query, recordType, activeStatuses) {
  const conflicts = [];
  for (const record of records) {
    if (
      record.roomNumber !== room.roomNumber ||
      !activeStatuses.includes(record.status)
    ) {
      continue;
    }

    const date = toDateString(record.date);
    const start = parseTime(record.startTime);
    const end = parseTime(record.endTime);
    if (
      date < query.dateFrom ||
      date > query.dateTo ||
      start === null ||
      end === null ||
      end <= start ||
      !overlaps(start, end, query.startMinutes, query.endMinutes)
    ) {
      continue;
    }

    if (typeof record.block !== "string" || record.block.length === 0) {
      conflicts.push({
        type: "UNVERIFIED_ROOM_IDENTITY",
        date,
        startTime: record.startTime,
        endTime: record.endTime,
        status: record.status,
        id: String(record._id || ""),
        reason:
          "The record has no block, so its room identity cannot be matched safely.",
      });
      continue;
    }
    if (!sameRoomIdentity(record, room)) {
      continue;
    }

    conflicts.push({
      type: recordType,
      date,
      startTime: record.startTime,
      endTime: record.endTime,
      status: record.status,
      id: String(record._id || ""),
    });
  }
  return conflicts;
}

function filterRooms(rooms, query) {
  return rooms.filter((room) => {
    if (query.block && !sameBlockIdentity(room.block, query.block)) {
      return false;
    }
    if (query.roomNumber && room.roomNumber !== query.roomNumber) {
      return false;
    }
    if (query.classroomType && room.classroomType !== query.classroomType) {
      return false;
    }
    return query.minimumCapacity === null || room.capacity === null ||
      room.capacity >= query.minimumCapacity;
  });
}

function assessRoomAvailability({
  room,
  query,
  databaseConnected,
  verifiedTimetableEntries = [],
  uncertainTimetableEntries = [],
  bookings = [],
  roomTransfers = [],
}) {
  if (!hasConfirmedRoomIdentity(room)) {
    return {
      status: "CANNOT_VERIFY",
      reason:
        "The room block label is not one of the confirmed block names; its identity requires clarification.",
      conflicts: [],
    };
  }

  const timetableEvidence = findTimetableEvidence(
    verifiedTimetableEntries,
    room,
    query,
  );
  const uncertaintyEvidence = findUncertainRoomEvidence(
    uncertainTimetableEntries,
    room,
    query,
  );
  const bookingEvidence = findDatedConflicts(
    bookings,
    room,
    query,
    "ALLOTTED_BOOKING",
    ["ALLOTTED"],
  );
  const transferEvidence = findDatedConflicts(
    roomTransfers,
    room,
    query,
    "APPROVED_ROOM_TRANSFER",
    ["APPROVED"],
  );
  const conflicts = [
    ...timetableEvidence,
    ...uncertaintyEvidence,
    ...bookingEvidence,
    ...transferEvidence,
  ];

  if (bookingEvidence.some((item) => item.type !== "UNVERIFIED_ROOM_IDENTITY") ||
      transferEvidence.some((item) => item.type !== "UNVERIFIED_ROOM_IDENTITY") ||
      timetableEvidence.some((item) => item.type === "OCCUPIED_TIMETABLE")) {
    return {
      status: "OCCUPIED",
      reason: "A matching class, lab, allotted booking, or approved transfer conflicts.",
      conflicts,
    };
  }
  const verificationLimitations = [];
  if (!databaseConnected) {
    verificationLimitations.push(
      "MongoDB is disconnected, so persisted bookings and approved transfers cannot be checked.",
    );
  }
  if (
    uncertaintyEvidence.length > 0 ||
    bookingEvidence.some((item) => item.type === "UNVERIFIED_ROOM_IDENTITY") ||
    transferEvidence.some((item) => item.type === "UNVERIFIED_ROOM_IDENTITY") ||
    timetableEvidence.some((item) => item.type === "UNVERIFIED_TIMETABLE_ENTRY")
  ) {
    verificationLimitations.push(
      "Matching timetable or booking evidence has an uncertain room identity or extraction status.",
    );
  }

  const hasTimetableCoverage = hasRoomTimetableCoverage(
    verifiedTimetableEntries,
    room,
    query,
  );
  if (!hasTimetableCoverage) {
    verificationLimitations.push(
      "No usable room-specific timetable coverage was found for this room in the supplied timetable records.",
    );
  }

  if (verificationLimitations.length === 0) {
    return {
      status: "AVAILABLE",
      reason: "No class, lab, saved booking, or approved room transfer conflicts with this interval in the supplied timetable records.",
      conflicts,
    };
  }
  return {
    status: "CANNOT_VERIFY",
    reason: verificationLimitations.join(" "),
    conflicts,
  };
}

function searchAvailability({ rooms, query, ...evidence }) {
  const candidates = filterRooms(rooms, query);
  const results = candidates.map((room) => {
    const availability = assessRoomAvailability({
      room,
      query,
      ...evidence,
    });
    const capacityKnown = Number.isInteger(room.capacity) && room.capacity > 0;
    return {
      ...room,
      requestedDateFrom: query.dateFrom,
      requestedDateTo: query.dateTo,
      requestedStartTime: query.startTime,
      requestedEndTime: query.endTime,
      availabilityStatus: availability.status,
      reason: availability.reason,
      conflicts: availability.conflicts,
      capacityStatus: capacityKnown ? "CONFIRMED" : "UNCONFIRMED",
      meetsMinimumCapacity:
        query.minimumCapacity === null
          ? capacityKnown
            ? true
            : null
          : capacityKnown
            ? room.capacity >= query.minimumCapacity
            : null,
    };
  });

  return {
    query: {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      startTime: query.startTime,
      endTime: query.endTime,
    },
    resultCount: results.length,
    results,
  };
}

module.exports = {
  INVENTORY_FILE,
  assessRoomAvailability,
  filterRooms,
  searchAvailability,
  validateAvailabilityQuery,
};
