const assert = require("node:assert/strict");
const test = require("node:test");

const {
  loadAndValidateTimetableReview,
  validateEntry,
  validateReviewData,
} = require("../src/services/timetableImportService");
const { sameRoomIdentity } = require("../src/services/roomIdentityService");

function validEntry(overrides = {}) {
  return {
    sourceFilename: "reviewed-timetable.docx",
    program: "Example Program",
    programCode: "EX",
    semester: "III Semester",
    section: "A",
    academicYear: "2026-2027",
    effectiveFrom: "2026-08-10",
    day: "Monday",
    startTime: "09:25",
    endTime: "10:20",
    subjectOrActivity: "Example subject",
    roomNumber: "314",
    block: "SVB",
    entryType: "CLASS",
    extractionStatus: "VERIFIED_TEXT",
    scheduleId: "reviewed-timetable.docx#table1",
    ...overrides,
  };
}

test("accepts a complete verified timetable entry", () => {
  const result = validateEntry(validEntry(), 0);

  assert.deepEqual(result.reasons, []);
  assert.equal(result.entry.roomNumber, "314");
});

test("trims room identities and rejects invalid dates and weekday names", () => {
  const normalized = validateEntry(
    validEntry({
      roomNumber: " 314 ",
      effectiveFrom: "2026-02-30",
      day: "Funday",
    }),
    0,
  );

  assert.equal(normalized.entry.roomNumber, "314");
  assert.ok(normalized.reasons.some((reason) => reason.code === "INVALID_EFFECTIVE_DATE"));
  assert.ok(normalized.reasons.some((reason) => reason.code === "UNSUPPORTED_DAY"));
});

test("infers entry types only from explicit activity labels and LAB text", () => {
  for (const activity of ["BREAK", "Lunch", "LIBRARY", "Mentoring", "TUTORIAL"]) {
    const entry = validEntry({ subjectOrActivity: activity });
    delete entry.entryType;
    const result = validateEntry(entry, 0);

    assert.equal(result.entry.entryType, activity.toUpperCase());
    assert.equal(result.entry.entryTypeSource, "subjectOrActivity");
    assert.ok(!result.reasons.some(
      (reason) => reason.code === "UNSUPPORTED_OR_MISSING_ENTRY_TYPE",
    ));
  }

  const labEntry = validEntry({ subjectOrActivity: "DBMS LAB (SVB T1/T2)" });
  delete labEntry.entryType;
  assert.equal(validateEntry(labEntry, 0).entry.entryType, "LAB");
});

test("normalizes supported explicit entry types and rejects explicit invalid types", () => {
  const normalized = validateEntry(validEntry({ entryType: "  class  " }), 0);
  assert.deepEqual(normalized.reasons, []);
  assert.equal(normalized.entry.entryType, "CLASS");

  const invalid = validateEntry(
    validEntry({ entryType: "UNKNOWN", subjectOrActivity: "DBMS LAB" }),
    0,
  );
  assert.ok(invalid.reasons.some((reason) => reason.code === "INVALID_ENTRY_TYPE"));
  assert.equal(invalid.entry.entryType, "UNKNOWN");
});

test("does not infer class or activity types from ambiguous/unrecognized labels", () => {
  for (const subjectOrActivity of ["BEARK", "Mentoring / Seminar / Webinar", "DBMS"]) {
    const entry = validEntry({ subjectOrActivity });
    delete entry.entryType;
    assert.ok(
      validateEntry(entry, 0).reasons.some(
        (reason) => reason.code === "UNSUPPORTED_OR_MISSING_ENTRY_TYPE",
      ),
    );
  }
});

test("rejects unconfirmed timetable block labels", () => {
  const result = validateEntry(validEntry({ block: "UNKNOWN" }), 0);

  assert.ok(
    result.reasons.some((reason) => reason.code === "UNCONFIRMED_BLOCK_LABEL"),
  );
});

test("canonicalizes the source-backed SMVB alias without merging SVB identities", () => {
  const result = validateEntry(validEntry({ block: " smvb " }), 0);

  assert.equal(result.entry.block, "SMV");
  assert.deepEqual(result.reasons, []);
  assert.equal(
    sameRoomIdentity(
      { block: "SMVB", roomNumber: "317" },
      { block: "SMV", roomNumber: "317" },
    ),
    true,
  );
  assert.equal(
    sameRoomIdentity(
      { block: "SMV", roomNumber: "317" },
      { block: "SVB", roomNumber: "317" },
    ),
    false,
  );
  assert.ok(
    validateEntry(validEntry({ block: "SMVB; SVB" }), 0).reasons.some(
      (reason) => reason.code === "AMBIGUOUS_BLOCK",
    ),
  );
});

test("rejects all uncertain extraction statuses", () => {
  for (const extractionStatus of [
    "NEEDS_VISUAL_REVIEW",
    "AMBIGUOUS",
    "MISSING_INFORMATION",
  ]) {
    const result = validateEntry(validEntry({ extractionStatus }), 0);

    assert.ok(
      result.reasons.some((reason) => reason.code === "UNCERTAIN_EXTRACTION"),
      `${extractionStatus} should be rejected`,
    );
  }
});

test("reports missing required fields and does not use the section room as a period room", () => {
  const entry = validEntry({
    sourceFilename: "",
    roomNumber: null,
    block: null,
    entryType: null,
    sectionRoomAssignment: "SVB 301",
  });

  const result = validateEntry(entry, 4);
  const codes = result.reasons.map((reason) => reason.code);

  assert.ok(codes.includes("MISSING_REQUIRED_FIELD"));
  assert.ok(codes.includes("MISSING_PERIOD_ROOM"));
  assert.ok(codes.includes("MISSING_BLOCK"));
  assert.ok(codes.includes("UNSUPPORTED_OR_MISSING_ENTRY_TYPE"));
  assert.equal(result.entry.sectionRoomAssignment, "SVB 301");
});

test("rejects malformed, reversed, and ambiguous clock ranges", () => {
  const invalidRanges = [
    { startTime: "9:60", endTime: "10:20" },
    { startTime: "10:20", endTime: "09:25" },
    { startTime: "12:30", endTime: "01:30" },
    { startTime: "09:25", endTime: "09:25" },
  ];

  for (const range of invalidRanges) {
    const result = validateEntry(validEntry(range), 0);
    assert.ok(
      result.reasons.some((reason) =>
        ["INVALID_START_TIME", "INVALID_END_TIME", "INVALID_TIME_RANGE"].includes(
          reason.code,
        ),
      ),
      `${range.startTime}-${range.endTime} should be rejected`,
    );
  }
});

test("keeps rejected source entries and reason details in the validation report", () => {
  const report = validateReviewData({
    entries: [
      validEntry(),
      validEntry({ extractionStatus: "AMBIGUOUS", roomNumber: null }),
    ],
  });

  assert.equal(report.acceptedCount, 1);
  assert.equal(report.rejectedCount, 1);
  assert.equal(report.rejectedEntries[0].entry.extractionStatus, "AMBIGUOUS");
  assert.ok(report.rejectedEntries[0].reasons.length > 0);
  assert.equal(report.reasonCounts.UNCERTAIN_EXTRACTION, 1);
});

test("loads and validates the actual review report without importing records", async () => {
  const report = await loadAndValidateTimetableReview();

  assert.equal(report.sourceEntryCount, 657);
  assert.equal(report.acceptedCount, 0);
  assert.equal(report.rejectedCount, report.sourceEntryCount);
  assert.equal(report.reasonCounts.UNCERTAIN_EXTRACTION, 243);
  assert.equal(report.reasonCounts.UNSUPPORTED_OR_MISSING_ENTRY_TYPE, 498);
  assert.equal(report.reasonCounts.UNCONFIRMED_BLOCK_LABEL, undefined);
  assert.equal(report.reasonCounts.AMBIGUOUS_BLOCK, 2);
  assert.equal(
    report.rejectedEntries.filter(
      ({ entry }) => entry.entryTypeSource === "subjectOrActivity",
    ).length,
    159,
  );
});
