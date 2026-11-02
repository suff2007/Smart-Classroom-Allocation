const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { deriveConfirmedSectionRoomOccupancy } = require("../src/services/sectionRoomOccupancyService");
const { searchAvailability, validateAvailabilityQuery } = require("../src/services/classroomAvailabilityService");
const root = path.resolve(__dirname, "..");
const review = JSON.parse(fs.readFileSync(path.join(root, "data/review/timetable-extraction-review.json"), "utf8"));
const inventory = JSON.parse(fs.readFileSync(path.join(root, "data/room-inventory.json"), "utf8"));

test("real REVA timetable marks SMVB 507 occupied for a matching verified class period", () => {
  const query = validateAvailabilityQuery({ date: "2026-10-26", startTime: "08:30", endTime: "09:25", block: "SMVB", roomNumber: "507" });
  assert.deepEqual(query.errors, []);
  const results = searchAvailability({
    rooms: inventory.rooms, query: query.value, databaseConnected: true,
    verifiedTimetableEntries: deriveConfirmedSectionRoomOccupancy(review.entries),
    uncertainTimetableEntries: [], bookings: [], roomTransfers: [],
  });
  assert.equal(results.resultCount, 1);
  assert.equal(results.results[0].availabilityStatus, "OCCUPIED");
  assert.equal(results.results[0].conflicts[0].sourceFilename, "RU-IOT-III- SEM TT 2026-2027-4 (1).docx");
});

test("SMVB alias does not merge with SVB room identity", () => {
  const query = validateAvailabilityQuery({ date: "2026-10-26", startTime: "08:30", endTime: "09:25", block: "SVB", roomNumber: "512" });
  assert.deepEqual(query.errors, []);
  const results = searchAvailability({
    rooms: inventory.rooms, query: query.value, databaseConnected: true,
    verifiedTimetableEntries: deriveConfirmedSectionRoomOccupancy(review.entries),
    uncertainTimetableEntries: [], bookings: [], roomTransfers: [],
  });
  assert.equal(results.resultCount, 0, "SVB 512 must not be confused with the inventory's SMVB 512");
});
