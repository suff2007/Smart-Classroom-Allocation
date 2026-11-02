const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveConfirmedSectionRoomOccupancy } = require("../src/services/sectionRoomOccupancyService");

test("uses a confirmed section default room for verified normal class periods", () => {
  const [entry] = deriveConfirmedSectionRoomOccupancy([{
    extractionStatus: "VERIFIED_TEXT", day: "Monday", startTime: "08:30", endTime: "09:25",
    effectiveFrom: "2026-07-27", subjectOrActivity: "Computer Networks", sectionRoomAssignment: "SMVB 507",
  }]);
  assert.equal(entry.block, "SMVB");
  assert.equal(entry.roomNumber, "507");
  assert.equal(entry.entryType, "CLASS");
  assert.equal(entry.occupancyEvidenceSource, "SECTION_DEFAULT_ROOM");
});

test("keeps SVB separate and never infers room from Rotation or uncertain entries", () => {
  const entries = deriveConfirmedSectionRoomOccupancy([
    { extractionStatus: "VERIFIED_TEXT", day: "Monday", startTime: "08:30", endTime: "09:25", effectiveFrom: "2026-07-27", subjectOrActivity: "Computer Networks", sectionRoomAssignment: "SVB 512" },
    { extractionStatus: "VERIFIED_TEXT", day: "Monday", startTime: "08:30", endTime: "09:25", effectiveFrom: "2026-07-27", subjectOrActivity: "Computer Networks", sectionRoomAssignment: "Rotation" },
    { extractionStatus: "NEEDS_VISUAL_REVIEW", day: "Monday", startTime: "08:30", endTime: "09:25", effectiveFrom: "2026-07-27", subjectOrActivity: "Computer Networks", sectionRoomAssignment: "SMVB 507" },
    { extractionStatus: "VERIFIED_TEXT", day: "Monday", startTime: "08:30", endTime: "09:25", effectiveFrom: "2026-07-27", subjectOrActivity: "Programming Lab", sectionRoomAssignment: "SMVB 507" },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].block, "SVB");
  assert.equal(entries[0].roomNumber, "512");
});

test("does not treat breaks, lunch, or library labels as occupied class periods", () => {
  const entries = deriveConfirmedSectionRoomOccupancy(["BREAK", "LUNCH", "LIBRARY"].map((activity) => ({
    extractionStatus: "VERIFIED_TEXT", day: "Monday", startTime: "10:20", endTime: "10:40",
    effectiveFrom: "2026-07-27", subjectOrActivity: activity, sectionRoomAssignment: "SMVB 507",
  })));
  assert.deepEqual(entries, []);
});
