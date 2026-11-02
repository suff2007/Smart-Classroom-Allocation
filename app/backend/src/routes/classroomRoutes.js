const fs = require("node:fs/promises");
const express = require("express");
const mongoose = require("mongoose");

const RoomTransfer = require("../models/RoomTransfer");
const TimetableEntry = require("../models/TimetableEntry");
const Booking = require("../models/Booking");
const EventRequest = require("../models/EventRequest");
const { requireAuth, requireRole } = require("./authRoutes");
const {
  applyApprovedCorrections,
  DEFAULT_CORRECTIONS_FILE,
} = require("../services/timetableCorrectionService");
const {
  DEFAULT_REVIEW_FILE,
} = require("../services/timetableImportService");
const {
  INVENTORY_FILE,
  searchAvailability,
  validateAvailabilityQuery,
} = require("../services/classroomAvailabilityService");
const { planEventAllocation } = require("../services/eventAllocationService");
const { deriveConfirmedSectionRoomOccupancy } = require("../services/sectionRoomOccupancyService");
const {
  hasConfirmedRoomIdentity,
  sameBlockIdentity,
  sameRoomIdentity,
} = require("../services/roomIdentityService");

const router = express.Router();

async function readJson(filePath) {
  const contents = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Unable to parse JSON file: ${filePath}`, { cause: error });
  }
}

async function getAvailabilitySnapshot(rawQuery) {
  const validation = validateAvailabilityQuery(rawQuery);
  if (validation.errors.length > 0) {
    return { validationErrors: validation.errors };
  }

  const inventory = await readJson(INVENTORY_FILE);
  const matchingRooms = inventory.rooms.filter((room) => {
    const query = validation.value;
    return (
      (!query.block || sameBlockIdentity(room.block, query.block)) &&
      (!query.roomNumber || room.roomNumber === query.roomNumber) &&
      (!query.classroomType || room.classroomType === query.classroomType) &&
      (query.minimumCapacity === null ||
        room.capacity === null ||
        room.capacity >= query.minimumCapacity)
    );
  });
  const reviewData = await readJson(DEFAULT_REVIEW_FILE);
  const correctionData = await readJson(DEFAULT_CORRECTIONS_FILE);
  const corrected = applyApprovedCorrections(reviewData, correctionData);
  let databaseConnected = mongoose.connection.readyState === 1;
  let bookings = [];
  let roomTransfers = [];
  let databaseTimetableEntries = [];

  if (databaseConnected) {
    const dateFrom = new Date(`${validation.value.dateFrom}T00:00:00.000Z`);
    const dateTo = new Date(`${validation.value.dateTo}T23:59:59.999Z`);
    const roomNumbers = matchingRooms.map((room) => room.roomNumber);
    [bookings, roomTransfers, databaseTimetableEntries] = await Promise.all([
      Booking.find({
        roomNumber: { $in: roomNumbers },
        status: "ALLOTTED",
        date: { $gte: dateFrom, $lte: dateTo },
      }).lean(),
      RoomTransfer.find({
        roomNumber: { $in: roomNumbers },
        status: "APPROVED",
        date: { $gte: dateFrom, $lte: dateTo },
      }).lean(),
      TimetableEntry.find({
        roomNumber: { $in: roomNumbers },
      }).lean(),
    ]);
  }

  const verifiedTimetableEntries = [
    ...corrected.validationReport.acceptedEntries.map(({ entry }) => entry),
    ...deriveConfirmedSectionRoomOccupancy(reviewData.entries),
    ...databaseTimetableEntries.filter(
      (entry) => entry.extractionStatus === "VERIFIED_TEXT",
    ),
  ];
  const uncertainTimetableEntries = [
    ...corrected.validationReport.rejectedEntries.map(({ entry }) => entry),
    ...databaseTimetableEntries.filter(
      (entry) => entry.extractionStatus !== "VERIFIED_TEXT",
    ),
  ];
  return {
    validation,
    databaseConnected,
    results: searchAvailability({
      rooms: matchingRooms,
      query: validation.value,
      databaseConnected,
      verifiedTimetableEntries,
      uncertainTimetableEntries,
      bookings,
      roomTransfers,
    }),
  };
}

function validateTransferRequest(body, inventoryRooms) {
  const errors = [];
  const required = [
    "requestType",
    "roomNumber",
    "block",
    "requesterDepartment",
    "lendingDepartment",
    "borrowingDepartment",
    "date",
    "startTime",
    "endTime",
    "purpose",
  ];

  for (const field of required) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      errors.push(`${field} is required.`);
    }
  }
  if (body.requestType && !["LEND", "BORROW"].includes(body.requestType)) {
    errors.push("requestType must be LEND or BORROW.");
  }
  const queryValidation = validateAvailabilityQuery({
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime,
  });
  if (queryValidation.errors.length > 0) {
    errors.push(...queryValidation.errors);
  }

  const room = inventoryRooms.find((item) =>
    sameRoomIdentity(item, {
      roomNumber: body.roomNumber?.trim(),
      block: body.block?.trim(),
    }),
  );
  if (!room) {
    errors.push("The requested room and block are not in the supplied room inventory.");
  } else if (!hasConfirmedRoomIdentity(room)) {
    errors.push(
      "The room's block label is not confirmed; room transfer requests are unavailable until its identity is clarified.",
    );
  }
  if (
    body.requestType === "LEND" &&
    body.requesterDepartment?.trim() !== body.lendingDepartment?.trim()
  ) {
    errors.push("For a LEND request, requesterDepartment must match lendingDepartment.");
  }
  if (
    body.requestType === "BORROW" &&
    body.requesterDepartment?.trim() !== body.borrowingDepartment?.trim()
  ) {
    errors.push("For a BORROW request, requesterDepartment must match borrowingDepartment.");
  }

  return { errors, room };
}

router.get("/", async (req, res, next) => {
  try {
    const inventory = await readJson(INVENTORY_FILE);
    res.json({
      source: inventory.source,
      rooms: inventory.rooms,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/availability", async (req, res, next) => {
  try {
    const snapshot = await getAvailabilitySnapshot(req.query);
    if (snapshot.validationErrors) {
      return res.status(400).json({
        error: {
          code: "INVALID_SEARCH",
          message: "Availability search parameters are invalid.",
          details: snapshot.validationErrors,
        },
      });
    }

    return res.json({
      ...snapshot.results,
      databaseConnected: snapshot.databaseConnected,
      completeness: "NOT_CERTIFIED",
      availabilityNotice:
        "A room is never marked Available until complete verified occupancy coverage is available. Unknown capacity is not treated as sufficient.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/allocation-preview", async (req, res, next) => {
  try {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};
    const participantCount = Number(body.participantCount);
    if (!Number.isInteger(participantCount) || participantCount < 1) {
      return res.status(400).json({
        error: {
          code: "INVALID_PARTICIPANT_COUNT",
          message: "participantCount must be a positive integer.",
        },
      });
    }
    if (!["EXAM", "PLACEMENT"].includes(body.eventType)) {
      return res.status(400).json({
        error: {
          code: "INVALID_EVENT_TYPE",
          message: "eventType must be EXAM or PLACEMENT.",
        },
      });
    }

    const snapshot = await getAvailabilitySnapshot(body);
    if (snapshot.validationErrors) {
      return res.status(400).json({
        error: {
          code: "INVALID_SEARCH",
          message: "Allocation preview parameters are invalid.",
          details: snapshot.validationErrors,
        },
      });
    }
    
console.log(
  "ALLOCATION CANDIDATE ROOMS:",
  JSON.stringify(snapshot.results.results, null, 2)
);

    const preview = planEventAllocation({
      eventType: body.eventType,
      participantCount,
      candidateRooms: snapshot.results.results,
    });
    return res.json({
      preview,
      databaseConnected: snapshot.databaseConnected,
      allocationNotice:
        "This is a non-binding preview only. No room is reserved, approved, or allotted.",
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/transfers", requireAuth, async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Room requests cannot be saved while MongoDB is disconnected.",
        },
      });
    }

    const inventory = await readJson(INVENTORY_FILE);
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};
    const validation = validateTransferRequest(body, inventory.rooms);
    if (validation.errors.length > 0) {
      return res.status(400).json({
        error: {
          code: "INVALID_ROOM_TRANSFER",
          message: "Room transfer request is invalid.",
          details: validation.errors,
        },
      });
    }

    const transfer = await RoomTransfer.create({
      requestedBy: req.session.user.id,
      requestType: body.requestType,
      roomNumber: validation.room.roomNumber,
      block: validation.room.block,
      requesterName: req.session.user.name,
      requesterEmail: req.session.user.email,
      requesterDepartment: body.requesterDepartment.trim(),
      lendingDepartment: body.lendingDepartment.trim(),
      borrowingDepartment: body.borrowingDepartment.trim(),
      date: new Date(`${body.date}T00:00:00.000Z`),
      startTime: body.startTime,
      endTime: body.endTime,
      purpose: body.purpose.trim(),
      status: "REQUESTED",
    });

    return res.status(201).json({
      message: "Room request submitted for review; no allocation has been approved.",
      request: transfer,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/transfers", requireAuth, async (req, res, next) => {
  try {
    const isReviewer = ["ADMIN", "COORDINATOR"].includes(req.session.user.role);
    const requests = await RoomTransfer.find(
      isReviewer ? {} : { requestedBy: req.session.user.id },
    ).sort({ createdAt: -1 }).lean();
    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  "/transfers/:transferId/status",
  requireRole("ADMIN", "COORDINATOR"),
  async (req, res, next) => {
    try {
      const status = req.body?.status;
      if (!["APPROVED", "REJECTED"].includes(status)) {
        return res.status(400).json({
          error: {
            code: "INVALID_TRANSFER_DECISION",
            message: "status must be APPROVED or REJECTED.",
          },
        });
      }
      if (!mongoose.Types.ObjectId.isValid(req.params.transferId)) {
        return res.status(400).json({
          error: {
            code: "INVALID_TRANSFER_ID",
            message: "A valid room request ID is required.",
          },
        });
      }
      const transfer = await RoomTransfer.findOneAndUpdate(
        { _id: req.params.transferId, status: "REQUESTED" },
        { $set: { status } },
        { new: true, runValidators: true },
      );
      if (!transfer) {
        return res.status(404).json({
          error: {
            code: "TRANSFER_NOT_FOUND_OR_DECIDED",
            message: "The pending room request was not found or has already been decided.",
          },
        });
      }
      return res.json({
        transfer,
        message: `Room request marked ${status.toLowerCase()}; this decision does not reserve or allot the room.`,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post("/events", requireAuth, async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Event requests cannot be saved while MongoDB is disconnected.",
        },
      });
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
    const participantCount = Number(body.participantCount);
    if (!Number.isInteger(participantCount) || participantCount < 1) {
      return res.status(400).json({
        error: { code: "INVALID_PARTICIPANT_COUNT", message: "participantCount must be a positive integer." },
      });
    }
    if (!["EXAM", "PLACEMENT"].includes(body.eventType)) {
      return res.status(400).json({
        error: { code: "INVALID_EVENT_TYPE", message: "eventType must be EXAM or PLACEMENT." },
      });
    }
    const snapshot = await getAvailabilitySnapshot(body);
    if (snapshot.validationErrors) {
      return res.status(400).json({
        error: {
          code: "INVALID_SEARCH",
          message: "Event request details are invalid.",
          details: snapshot.validationErrors,
        },
      });
    }
    const preview = planEventAllocation({
      eventType: body.eventType,
      participantCount,
      candidateRooms: snapshot.results.results,
    });
    const eventRequest = await EventRequest.create({
      requestedBy: req.session.user.id,
      eventType: body.eventType,
      participantCount,
      date: new Date(`${snapshot.validation.value.dateFrom}T00:00:00.000Z`),
      startTime: snapshot.validation.value.startTime,
      endTime: snapshot.validation.value.endTime,
      block: snapshot.validation.value.block || undefined,
      classroomType: snapshot.validation.value.classroomType || undefined,
      minimumCapacity: snapshot.validation.value.minimumCapacity ?? undefined,
      previewStatus: preview.status,
      previewRooms: preview.rooms,
      allocationCreated: false,
    });
    return res.status(201).json({
      event: eventRequest,
      preview,
      message: "Event request saved. No room has been reserved, approved, or allotted.",
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/events", requireAuth, async (req, res, next) => {
  try {
    const isReviewer = ["ADMIN", "COORDINATOR"].includes(req.session.user.role);
    const events = await EventRequest.find(
      isReviewer ? {} : { requestedBy: req.session.user.id },
    ).sort({ createdAt: -1 }).lean();
    return res.json({ events });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
module.exports.validateTransferRequest = validateTransferRequest;
