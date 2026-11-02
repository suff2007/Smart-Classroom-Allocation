const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const Booking = require("../src/models/Booking");
const TimetableEntry = require("../src/models/TimetableEntry");

const {
  INVENTORY_FILE,
  assessRoomAvailability,
  filterRooms,
  validateAvailabilityQuery,
} = require("../src/services/classroomAvailabilityService");
const { sameRoomIdentity } = require("../src/services/roomIdentityService");

const room = {
  roomNumber: "314",
  block: "SVB",
  capacity: 120,
  classroomType: "SMART",
};

function query(overrides = {}) {
  return {
    dateFrom: "2026-10-12",
    dateTo: "2026-10-18",
    startTime: "09:25",
    endTime: "10:20",
    startMinutes: 565,
    endMinutes: 620,
    ...overrides,
  };
}

test("validates exact dates, types, capacity filters, and increasing times", () => {
  assert.deepEqual(
    validateAvailabilityQuery({
      date: "2026-10-12",
      startTime: "09:25",
      endTime: "10:20",
      classroomType: "SMART",
      minimumCapacity: "60",
    }).errors,
    [],
  );
  assert.ok(
    validateAvailabilityQuery({
      date: "2026-02-30",
      startTime: "10:20",
      endTime: "09:25",
      classroomType: "UNKNOWN",
      minimumCapacity: "0",
    }).errors.length >= 3,
  );
  assert.ok(
    validateAvailabilityQuery({
      date: "2026-10-12",
      startTime: "09:25",
      endTime: "10:20",
      roomNumber: ["314"],
    }).errors.length > 0,
  );
});

test("uses only supplied inventory and preserves unconfirmed capacities", () => {
  const inventory = JSON.parse(fs.readFileSync(INVENTORY_FILE, "utf8"));
  const room219 = inventory.rooms.find(
    (item) => item.roomNumber === "219" && item.block === "SVB",
  );
  const candidates = filterRooms(inventory.rooms, {
    block: "SVB",
    roomNumber: "219",
    classroomType: "SMART",
    minimumCapacity: 100,
  });

  assert.equal(inventory.rooms.length, 22);
  assert.equal(room219.capacity, null);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].capacityStatus, "UNCONFIRMED");
});

test("filters canonical SMV searches against inventory records carrying the SMVB source label", () => {
  const candidates = filterRooms(
    [{ block: "SMVB", roomNumber: "506", capacity: 120 }],
    {
      block: "SMV",
      roomNumber: null,
      classroomType: null,
      minimumCapacity: null,
    },
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].block, "SMVB");
});

test("room identity requires an exact confirmed block and room-number pair", () => {
  assert.equal(
    sameRoomIdentity(
      { block: "SMV", roomNumber: "317" },
      { block: "SVB", roomNumber: "317" },
    ),
    false,
  );
  assert.equal(
    sameRoomIdentity(
      { block: "SMVB", roomNumber: "317" },
      { block: "SMV", roomNumber: "317" },
    ),
    true,
  );
  assert.equal(
    sameRoomIdentity(
      { block: "CVR", roomNumber: "216-B" },
      { block: "CVR", roomNumber: "216-C" },
    ),
    false,
  );
  assert.equal(
    sameRoomIdentity(
      { block: "CVR", roomNumber: "216 B/C" },
      { block: "CVR", roomNumber: "216-B" },
    ),
    false,
  );
});

test("booking and timetable models require the block portion of room identity", async () => {
  await assert.rejects(new Booking({}).validate(), (error) => {
    assert.ok(error.errors.block);
    return true;
  });
  await assert.rejects(new TimetableEntry({}).validate(), (error) => {
    assert.ok(error.errors.block);
    return true;
  });
});

test("does not treat an inventory room with an unconfirmed block label as verified", () => {
  const result = assessRoomAvailability({
    room: { roomNumber: "317", block: "UNKNOWN", capacity: 60, classroomType: "LAB" },
    query: query(),
    databaseConnected: true,
  });

  assert.equal(result.status, "CANNOT_VERIFY");
  assert.match(result.reason, /block label is not one of the confirmed block names/);
});

test("does not confuse timetable references for the same number in another block", () => {
  const result = assessRoomAvailability({
    room: { roomNumber: "317", block: "SMV" },
    query: query(),
    databaseConnected: true,
    verifiedTimetableEntries: [
      {
        roomNumber: "317",
        block: "SVB",
        day: "Monday",
        startTime: "09:00",
        endTime: "10:00",
        effectiveFrom: "2026-08-10",
        entryType: "CLASS",
        extractionStatus: "VERIFIED_TEXT",
        sourceFilename: "source.docx",
      },
    ],
  });

  assert.equal(result.status, "CANNOT_VERIFY");
  assert.equal(result.conflicts.length, 0);
});

test("does not match CVR 216-B with 216-C or grouped 216 B/C evidence", () => {
  const result = assessRoomAvailability({
    room: { roomNumber: "216-B", block: "CVR" },
    query: query(),
    databaseConnected: true,
    verifiedTimetableEntries: [
      {
        roomNumber: "216-C",
        block: "CVR",
        day: "Monday",
        startTime: "09:00",
        endTime: "10:00",
        effectiveFrom: "2026-08-10",
        entryType: "LAB",
        extractionStatus: "VERIFIED_TEXT",
        sourceFilename: "source.docx",
      },
      {
        roomNumber: "216 B/C",
        block: "CVR",
        day: "Monday",
        startTime: "09:00",
        endTime: "10:00",
        effectiveFrom: "2026-08-10",
        entryType: "LAB",
        extractionStatus: "VERIFIED_TEXT",
        sourceFilename: "source.docx",
      },
    ],
  });

  assert.equal(result.status, "CANNOT_VERIFY");
  assert.equal(result.conflicts.length, 0);
});

test("reports occupied only for an explicit matching room and overlapping class", () => {
  const result = assessRoomAvailability({
    room,
    query: query({ dateFrom: "2026-10-12", dateTo: "2026-10-12" }),
    databaseConnected: true,
    verifiedTimetableEntries: [
      {
        roomNumber: "314",
        block: "SVB",
        day: "Monday",
        startTime: "09:00",
        endTime: "10:00",
        effectiveFrom: "2026-08-10",
        entryType: "CLASS",
        extractionStatus: "VERIFIED_TEXT",
        sourceFilename: "source.docx",
      },
    ],
  });

  assert.equal(result.status, "OCCUPIED");
  assert.equal(result.conflicts[0].type, "OCCUPIED_TIMETABLE");
  assert.equal(result.conflicts[0].date, "2026-10-12");
});

test("does not turn section-room assignments or free activities into availability", () => {
  const sectionRoomOnly = assessRoomAvailability({
    room,
    query: query(),
    databaseConnected: true,
    verifiedTimetableEntries: [
      {
        roomNumber: null,
        sectionRoomAssignment: "SVB 314",
        block: "SVB",
        day: "Monday",
        startTime: "09:25",
        endTime: "10:20",
        effectiveFrom: "2026-08-10",
        entryType: "LIBRARY",
        extractionStatus: "VERIFIED_TEXT",
      },
    ],
  });
  const freeActivity = assessRoomAvailability({
    room,
    query: query(),
    databaseConnected: true,
    verifiedTimetableEntries: [
      {
        roomNumber: "314",
        block: "SVB",
        day: "Monday",
        startTime: "09:25",
        endTime: "10:20",
        effectiveFrom: "2026-08-10",
        entryType: "LIBRARY",
        extractionStatus: "VERIFIED_TEXT",
      },
    ],
  });

  assert.equal(sectionRoomOnly.status, "CANNOT_VERIFY");
  assert.equal(sectionRoomOnly.conflicts.length, 0);
  assert.equal(freeActivity.status, "CANNOT_VERIFY");
});

test("does not mark a room available without complete occupancy coverage", () => {
  const result = assessRoomAvailability({
    room,
    query: query(),
    databaseConnected: true,
  });

  assert.equal(result.status, "CANNOT_VERIFY");
  assert.match(result.reason, /complete verified occupancy coverage/i);
});

test("returns cannot verify when MongoDB is disconnected", () => {
  const result = assessRoomAvailability({
    room,
    query: query(),
    databaseConnected: false,
  });

  assert.equal(result.status, "CANNOT_VERIFY");
  assert.match(result.reason, /MongoDB is disconnected/);
  assert.match(result.reason, /Complete verified occupancy coverage.*is not certified/);
});

test("uses recurring timetable conflicts after each schedule effective date", () => {
  const result = assessRoomAvailability({
    room,
    query: query({
      dateFrom: "2026-10-12",
      dateTo: "2026-10-25",
      endTime: "10:30",
      endMinutes: 630,
    }),
    databaseConnected: true,
    verifiedTimetableEntries: [
      {
        roomNumber: "314",
        block: "SVB",
        day: "Monday",
        startTime: "10:20",
        endTime: "11:00",
        effectiveFrom: "2026-10-19",
        entryType: "CLASS",
        extractionStatus: "VERIFIED_TEXT",
        sourceFilename: "source.docx",
        scheduleId: "source.docx#table1",
      },
    ],
  });

  assert.equal(result.status, "OCCUPIED");
  assert.equal(result.conflicts[0].date, "2026-10-19");
});

test("uses half-open time boundaries for dated bookings and approved transfers", () => {
  const adjacentBooking = assessRoomAvailability({
    room,
    query: query({ dateFrom: "2026-10-12", dateTo: "2026-10-12" }),
    databaseConnected: true,
    bookings: [
      {
        roomNumber: "314",
        date: "2026-10-12",
        startTime: "08:30",
        endTime: "09:25",
        status: "ALLOTTED",
      },
    ],
  });
  const overlappingTransfer = assessRoomAvailability({
    room,
    query: query({ dateFrom: "2026-10-12", dateTo: "2026-10-12" }),
    databaseConnected: true,
    roomTransfers: [
      {
        roomNumber: "314",
        block: "SVB",
        date: "2026-10-12",
        startTime: "10:00",
        endTime: "10:30",
        status: "APPROVED",
      },
    ],
  });

  assert.equal(adjacentBooking.status, "CANNOT_VERIFY");
  assert.equal(adjacentBooking.conflicts.length, 0);
  assert.equal(overlappingTransfer.status, "OCCUPIED");
  assert.equal(overlappingTransfer.conflicts[0].type, "APPROVED_ROOM_TRANSFER");
});

test("detects overlapping confirmed bookings for the same room and date", () => {
  const result = assessRoomAvailability({
    room,
    query: query({ dateFrom: "2026-10-12", dateTo: "2026-10-12" }),
    databaseConnected: true,
    bookings: [
      {
        _id: "booking-1",
        roomNumber: "314",
        block: "SVB",
        date: "2026-10-12",
        startTime: "09:00",
        endTime: "10:00",
        status: "ALLOTTED",
      },
      {
        _id: "booking-2",
        roomNumber: "314",
        block: "SVB",
        date: "2026-10-12",
        startTime: "09:45",
        endTime: "10:30",
        status: "ALLOTTED",
      },
      {
        _id: "booking-other-date",
        roomNumber: "314",
        block: "SVB",
        date: "2026-10-13",
        startTime: "09:00",
        endTime: "10:30",
        status: "ALLOTTED",
      },
      {
        _id: "booking-pending",
        roomNumber: "314",
        block: "SVB",
        date: "2026-10-12",
        startTime: "09:00",
        endTime: "10:30",
        status: "PENDING",
      },
    ],
  });

  assert.equal(result.status, "OCCUPIED");
  assert.equal(result.conflicts.length, 2);
  assert.deepEqual(
    result.conflicts.map((conflict) => conflict.id),
    ["booking-1", "booking-2"],
  );
});

test("treats an overlapping legacy booking without a block as identity-uncertain", () => {
  const result = assessRoomAvailability({
    room,
    query: query({ dateFrom: "2026-10-12", dateTo: "2026-10-12" }),
    databaseConnected: true,
    bookings: [
      {
        _id: "legacy-booking",
        roomNumber: "314",
        date: "2026-10-12",
        startTime: "09:30",
        endTime: "10:00",
        status: "ALLOTTED",
      },
    ],
  });

  assert.equal(result.status, "CANNOT_VERIFY");
  assert.equal(result.conflicts[0].type, "UNVERIFIED_ROOM_IDENTITY");
});

test("does not count a same-number booking from another block as this room's conflict", () => {
  const result = assessRoomAvailability({
    room: { roomNumber: "317", block: "SMV" },
    query: query({ dateFrom: "2026-10-12", dateTo: "2026-10-12" }),
    databaseConnected: true,
    bookings: [
      {
        _id: "other-block-booking",
        roomNumber: "317",
        block: "SVB",
        date: "2026-10-12",
        startTime: "09:30",
        endTime: "10:00",
        status: "ALLOTTED",
      },
    ],
  });

  assert.equal(result.status, "CANNOT_VERIFY");
  assert.equal(result.conflicts.length, 0);
});
