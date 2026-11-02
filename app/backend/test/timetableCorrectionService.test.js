const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyApprovedCorrections,
  validateCorrectionFile,
} = require("../src/services/timetableCorrectionService");
const {
  buildTimetableValidationReport,
} = require("../src/services/timetableValidationReportService");

function reviewEntry(overrides = {}) {
  return {
    sourceFilename: "example.docx",
    scheduleId: "example.docx#table1",
    day: "Monday",
    startTime: "12:30",
    endTime: "01:20",
    subjectOrActivity: "Example subject",
    roomNumber: null,
    block: null,
    entryType: "CLASS",
    program: "Example program",
    semester: "III Semester",
    section: "A",
    academicYear: "2026-2027",
    effectiveFrom: "2026-08-10",
    extractionStatus: "VERIFIED_TEXT",
    ...overrides,
  };
}

function correction(overrides = {}) {
  return {
    correctionId: "correction-1",
    sourceFilename: "example.docx",
    entryIdentifier: {
      scheduleId: "example.docx#table1",
      sourceIndex: 0,
    },
    field: "startTime",
    originalValue: "12:30",
    proposedValue: "12:30",
    evidence: {
      type: "HUMAN_DECISION",
      reference: "Academic timetable review record 1",
      details: "The timetable owner confirmed the clock interpretation.",
    },
    reviewer: "reviewer-1",
    reviewerConfirmation:
      "I reviewed the cited evidence and confirm this correction applies to this period.",
    reason: "The source reviewer confirmed the corrected timetable value.",
    reviewDate: "2026-10-11",
    reviewedAt: "2026-10-11T10:30:00.000Z",
    approvalStatus: "APPROVED",
    ...overrides,
  };
}

function correctionFile({ unapprovedCorrections = [], approvedCorrections = [] } = {}) {
  return {
    schemaVersion: 2,
    unapprovedCorrections,
    approvedCorrections,
  };
}

test("validates correction schema and applies only an approved correction", () => {
  const reviewData = {
    entries: [reviewEntry({ roomNumber: "314", block: "SVB" })],
  };
  const approved = correction({
    field: "endTime",
    originalValue: "01:20",
    proposedValue: "13:20",
  });
  const unapproved = correction({
    correctionId: "correction-2",
    field: "roomNumber",
    originalValue: "314",
    proposedValue: "218",
    approvalStatus: "PENDING_REVIEW",
  });
  const result = applyApprovedCorrections(
    reviewData,
    correctionFile({
      unapprovedCorrections: [unapproved],
      approvedCorrections: [approved],
    }),
  );

  assert.deepEqual(validateCorrectionFile(reviewData, correctionFile({
    unapprovedCorrections: [unapproved],
    approvedCorrections: [approved],
  })).map((item) => item.reasons), [[], []]);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.unappliedCount, 1);
  assert.equal(result.correctedReviewData.entries[0].endTime, "13:20");
  assert.equal(result.correctedReviewData.entries[0].roomNumber, "314");
  assert.equal(result.validationReport.acceptedCount, 1);
  assert.equal(reviewData.entries[0].endTime, "01:20");
});

test("keeps unapproved corrections unapplied and uncertain entries rejected", () => {
  const reviewData = {
    entries: [
      reviewEntry({
        extractionStatus: "NEEDS_VISUAL_REVIEW",
        endTime: "10:20",
      }),
    ],
  };
  const pending = correction({
    field: "endTime",
    originalValue: "10:20",
    proposedValue: "11:20",
    approvalStatus: "PENDING_REVIEW",
  });
  const result = applyApprovedCorrections(
    reviewData,
    correctionFile({ unapprovedCorrections: [pending] }),
  );

  assert.equal(result.appliedCount, 0);
  assert.equal(result.correctedReviewData.entries[0].endTime, "10:20");
  assert.equal(result.validationReport.acceptedCount, 0);
  assert.ok(
    result.validationReport.rejectedEntries[0].reasons.some(
      (reason) => reason.code === "UNCERTAIN_EXTRACTION",
    ),
  );
});

test("reports corrections with missing evidence and does not apply them", () => {
  const reviewData = { entries: [reviewEntry()] };
  const unsupported = correction({
    evidence: { type: "HUMAN_DECISION", reference: "", details: "" },
  });
  const result = applyApprovedCorrections(
    reviewData,
    correctionFile({ approvedCorrections: [unsupported] }),
  );

  assert.equal(result.appliedCount, 0);
  assert.ok(
    result.correctionResults[0].reasons.some(
      (reason) => reason.code === "MISSING_EVIDENCE",
    ),
  );
  assert.equal(result.correctedReviewData.entries[0].startTime, "12:30");
});

test("requires source-reference evidence to identify the correction target document", () => {
  const reviewData = { entries: [reviewEntry()] };
  const sourceReference = correction({
    evidence: {
      type: "SOURCE_REFERENCE",
      reference: "other-source.docx table 1",
      details: "The cited cell was checked.",
    },
  });
  const result = applyApprovedCorrections(
    reviewData,
    correctionFile({ approvedCorrections: [sourceReference] }),
  );

  assert.equal(result.appliedCount, 0);
  assert.ok(
    result.correctionResults[0].reasons.some(
      (reason) => reason.code === "SOURCE_EVIDENCE_MISMATCH",
    ),
  );

  const supportedReference = correction({
    evidence: {
      type: "SOURCE_REFERENCE",
      reference: "example.docx table 1 cell Monday 09:25",
      details: "The cited source cell supports the reviewed value.",
    },
    field: "subjectOrActivity",
    originalValue: "Example subject",
    proposedValue: "Reviewed subject",
  });
  const acceptedReference = applyApprovedCorrections(
    {
      entries: [
        reviewEntry({
          roomNumber: "314",
          block: "SVB",
          startTime: "09:25",
          endTime: "10:20",
        }),
      ],
    },
    correctionFile({ approvedCorrections: [supportedReference] }),
  );

  assert.equal(acceptedReference.appliedCount, 1);
  assert.deepEqual(acceptedReference.correctionResults[0].reasons, []);
});

test("invalid corrected time ranges remain rejected by the existing validator", () => {
  const reviewData = {
    entries: [
      reviewEntry({
        startTime: "09:25",
        endTime: "10:20",
        roomNumber: "314",
        block: "SVB",
      }),
    ],
  };
  const invalidTimeCorrection = correction({
    field: "endTime",
    originalValue: "10:20",
    proposedValue: "09:00",
  });
  const result = applyApprovedCorrections(
    reviewData,
    correctionFile({ approvedCorrections: [invalidTimeCorrection] }),
  );

  assert.equal(result.appliedCount, 0);
  assert.equal(result.correctedReviewData.entries[0].endTime, "10:20");
  assert.equal(result.validationReport.acceptedCount, 1);
  assert.ok(
    result.correctionResults[0].reasons.some(
      (reason) => reason.code === "CORRECTED_ENTRY_INVALID",
    ),
  );

});

test("rejects an approved correction set that still leaves room assignment incomplete", () => {
  const reviewData = { entries: [reviewEntry({ roomNumber: null, block: null })] };
  const result = applyApprovedCorrections(
    reviewData,
    correctionFile({
      approvedCorrections: [
        correction({
          field: "block",
          originalValue: null,
          proposedValue: "SVB",
        }),
      ],
    }),
  );

  assert.equal(result.appliedCount, 0);
  assert.equal(result.correctedReviewData.entries[0].block, null);
  assert.ok(
    result.correctionResults[0].reasons.some(
      (reason) => reason.code === "CORRECTED_ENTRY_INVALID",
    ),
  );
  assert.ok(
    result.validationReport.rejectedEntries[0].reasons.some(
      (reason) => reason.code === "MISSING_PERIOD_ROOM",
    ),
  );
});

test("does not partially apply an entry's approved corrections when one is invalid", () => {
  const reviewData = {
    entries: [reviewEntry({ roomNumber: null, block: null })],
  };
  const validRoomCorrection = correction({
    field: "roomNumber",
    originalValue: null,
    proposedValue: "314",
  });
  const mismatchedBlockCorrection = correction({
    correctionId: "correction-2",
    field: "block",
    originalValue: "WRONG",
    proposedValue: "SVB",
  });
  const originalReviewData = structuredClone(reviewData);
  const result = applyApprovedCorrections(
    reviewData,
    correctionFile({
      approvedCorrections: [validRoomCorrection, mismatchedBlockCorrection],
    }),
  );

  assert.equal(result.appliedCount, 0);
  assert.equal(result.correctedReviewData.entries[0].roomNumber, null);
  assert.equal(result.correctedReviewData.entries[0].block, null);
  assert.ok(
    result.correctionResults[0].reasons.some(
      (reason) => reason.code === "ATOMIC_CORRECTION_SET_REJECTED",
    ),
  );
  assert.ok(
    result.correctionResults[1].reasons.some(
      (reason) => reason.code === "ORIGINAL_VALUE_MISMATCH",
    ),
  );
  assert.deepEqual(reviewData, originalReviewData);
});

test("rejects duplicate correction IDs and reports source-target mismatches", () => {
  const reviewData = { entries: [reviewEntry()] };
  const duplicateId = correction({
    field: "endTime",
    originalValue: "01:20",
    proposedValue: "13:20",
  });
  const mismatchedTarget = correction({
    field: "startTime",
    sourceFilename: "other-source.docx",
    entryIdentifier: {
      scheduleId: "different-schedule",
      sourceIndex: 0,
    },
  });
  const result = applyApprovedCorrections(
    reviewData,
    correctionFile({
      unapprovedCorrections: [duplicateId],
      approvedCorrections: [mismatchedTarget],
    }),
  );

  assert.equal(result.appliedCount, 0);
  assert.ok(
    result.correctionResults[0].reasons.some(
      (reason) => reason.code === "DUPLICATE_CORRECTION_ID",
    ),
  );
  const mismatchCodes = result.correctionResults[1].reasons.map(
    (reason) => reason.code,
  );
  assert.ok(mismatchCodes.includes("DUPLICATE_CORRECTION_ID"));
  assert.ok(mismatchCodes.includes("SOURCE_FILENAME_MISMATCH"));
  assert.ok(mismatchCodes.includes("SCHEDULE_ID_MISMATCH"));

  const duplicateFieldResult = applyApprovedCorrections(
    {
      entries: [
        reviewEntry({
          roomNumber: "314",
          block: "SVB",
          startTime: "09:25",
          endTime: "10:20",
        }),
      ],
    },
    correctionFile({
      approvedCorrections: [
        correction({ field: "startTime", originalValue: "09:25", proposedValue: "09:30" }),
        correction({
          correctionId: "correction-2",
          field: "startTime",
          originalValue: "09:25",
          proposedValue: "09:35",
        }),
      ],
    }),
  );
  assert.equal(duplicateFieldResult.appliedCount, 0);
  assert.ok(
    duplicateFieldResult.correctionResults.every((item) =>
      item.reasons.some((reason) => reason.code === "DUPLICATE_APPROVED_FIELD"),
    ),
  );
});

test("keeps visually unverified entries rejected and does not apply their corrections", () => {
  const reviewData = {
    entries: [
      reviewEntry({
        extractionStatus: "NEEDS_VISUAL_REVIEW",
        roomNumber: "314",
        block: "SVB",
      }),
    ],
  };
  const result = applyApprovedCorrections(
    reviewData,
    correctionFile({
      approvedCorrections: [
        correction({
          field: "subjectOrActivity",
          originalValue: "Example subject",
          proposedValue: "Confirmed subject",
        }),
      ],
    }),
  );

  assert.equal(result.appliedCount, 0);
  assert.equal(result.correctedReviewData.entries[0].subjectOrActivity, "Example subject");
  assert.ok(
    result.correctionResults[0].reasons.some(
      (reason) => reason.code === "UNCERTAIN_SOURCE_ENTRY",
    ),
  );
  assert.ok(
    result.validationReport.rejectedEntries[0].reasons.some(
      (reason) => reason.code === "UNCERTAIN_EXTRACTION",
    ),
  );
});

test("requires explicit reviewer confirmation, reason, and timestamp", () => {
  const result = applyApprovedCorrections(
    { entries: [reviewEntry({ roomNumber: "314", block: "SVB" })] },
    correctionFile({
      approvedCorrections: [
        correction({
          reviewerConfirmation: "",
          reason: "",
          reviewedAt: "2026-10-11",
        }),
      ],
    }),
  );

  assert.equal(result.appliedCount, 0);
  const codes = result.correctionResults[0].reasons.map((reason) => reason.code);
  assert.ok(codes.includes("MISSING_REVIEWER_CONFIRMATION"));
  assert.ok(codes.includes("MISSING_REASON"));
  assert.ok(codes.includes("INVALID_REVIEW_TIMESTAMP"));

  const impossibleTimestamp = applyApprovedCorrections(
    { entries: [reviewEntry({ roomNumber: "314", block: "SVB" })] },
    correctionFile({
      approvedCorrections: [
        correction({ reviewedAt: "2026-02-30T10:30:00.000Z" }),
      ],
    }),
  );
  assert.ok(
    impossibleTimestamp.correctionResults[0].reasons.some(
      (reason) => reason.code === "INVALID_REVIEW_TIMESTAMP",
    ),
  );
});

test("builds a persistent-report payload with correction and entry rejection details", () => {
  const result = applyApprovedCorrections(
    { entries: [reviewEntry({ extractionStatus: "AMBIGUOUS" })] },
    correctionFile({
      unapprovedCorrections: [
        correction({
          approvalStatus: "PENDING_REVIEW",
          originalValue: "12:30",
        }),
      ],
    }),
  );
  const report = buildTimetableValidationReport(result, "2026-10-11T00:00:00.000Z");

  assert.equal(report.generatedAt, "2026-10-11T00:00:00.000Z");
  assert.equal(report.summary.sourceEntryCount, 1);
  assert.equal(report.summary.rejectedCount, 1);
  assert.equal(report.summary.extractionStatusCounts.AMBIGUOUS, 1);
  assert.equal(report.summary.unappliedCorrectionCount, 1);
  assert.equal(report.summary.correctionStatusCounts.PENDING_REVIEW, 1);
  assert.equal(report.rejectedEntries[0].reasons[0].code, "UNCERTAIN_EXTRACTION");
});
