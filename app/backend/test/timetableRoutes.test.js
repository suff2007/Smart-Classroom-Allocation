const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const test = require("node:test");

const { createTimetableRouter } = require("../src/routes/timetableRoutes");

function reviewEntry(overrides = {}) {
  return {
    sourceFilename: "reviewed-source.docx",
    scheduleId: "reviewed-source.docx#table1",
    program: "Computer Science",
    semester: "III Semester",
    section: "A",
    academicYear: "2026-2027",
    effectiveFrom: "2026-08-10",
    day: "Monday",
    startTime: "09:25",
    endTime: "10:20",
    subjectOrActivity: "Database Systems",
    roomNumber: null,
    block: null,
    entryType: "CLASS",
    extractionStatus: "VERIFIED_TEXT",
    ...overrides,
  };
}

async function startTestServer(t, reviewFile, correctionsFile, role = "COORDINATOR") {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.user = { id: "test-reviewer", role };
    next();
  });
  app.use("/api/timetable", createTimetableRouter({ reviewFile, correctionsFile }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(500).json({ error: { message: "Unexpected test server error." } });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("review API gates writes, records pending proposals, and retains accurate decisions", async (t) => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "timetable-review-"));
  t.after(() => fs.rm(tempDirectory, { recursive: true, force: true }));
  const reviewFile = path.join(tempDirectory, "review.json");
  const correctionsFile = path.join(tempDirectory, "corrections.json");
  const apiKey = "test-review-key-with-more-than-32-characters";
  const previousApiKey = process.env.TIMETABLE_REVIEW_API_KEY;
  process.env.TIMETABLE_REVIEW_API_KEY = apiKey;
  t.after(() => {
    if (previousApiKey === undefined) {
      delete process.env.TIMETABLE_REVIEW_API_KEY;
    } else {
      process.env.TIMETABLE_REVIEW_API_KEY = previousApiKey;
    }
  });

  test("review correction writes require an admin or coordinator session", async (t) => {
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "timetable-review-role-"));
    t.after(() => fs.rm(tempDirectory, { recursive: true, force: true }));
    const reviewFile = path.join(tempDirectory, "review.json");
    const correctionsFile = path.join(tempDirectory, "corrections.json");
    await fs.writeFile(reviewFile, JSON.stringify({ entries: [reviewEntry()] }));
    await fs.writeFile(correctionsFile, JSON.stringify({
      schemaVersion: 2,
      unapprovedCorrections: [],
      approvedCorrections: [],
    }));
    const baseUrl = await startTestServer(t, reviewFile, correctionsFile, "UNASSIGNED");
    const response = await fetch(`${baseUrl}/api/timetable/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 403);
  });

  const sourceData = {
    entries: [
      reviewEntry(),
      reviewEntry({
        sourceFilename: "visual-review.docx",
        scheduleId: "visual-review.docx#table1",
        extractionStatus: "NEEDS_VISUAL_REVIEW",
      }),
    ],
  };
  const originalSource = JSON.stringify(sourceData);
  await fs.writeFile(reviewFile, originalSource);
  await fs.writeFile(
    correctionsFile,
    JSON.stringify({
      schemaVersion: 2,
      unapprovedCorrections: [],
      approvedCorrections: [],
    }),
  );

  const baseUrl = await startTestServer(t, reviewFile, correctionsFile);
  const proposal = {
    sourceIndex: 0,
    field: "roomNumber",
    proposedValue: "314",
    reviewer: "Coordinator Reviewer",
    reviewerConfirmation: "I reviewed the source evidence.",
    reason: "The period cell was checked against the cited source.",
    evidence: {
      type: "SOURCE_REFERENCE",
      reference: "reviewed-source.docx table 1, Monday 09:25 cell",
      details: "The reference identifies the timetable document and relevant cell.",
    },
  };
  delete process.env.TIMETABLE_REVIEW_API_KEY;
  const notConfigured = await fetch(`${baseUrl}/api/timetable/corrections`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-review-api-key": apiKey },
    body: JSON.stringify(proposal),
  });
  assert.equal(notConfigured.status, 503);
  process.env.TIMETABLE_REVIEW_API_KEY = apiKey;

  const unauthorized = await fetch(`${baseUrl}/api/timetable/corrections`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-review-api-key": "wrong" },
    body: JSON.stringify(proposal),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(JSON.parse(await fs.readFile(correctionsFile, "utf8")).unapprovedCorrections.length, 0);

  const invalidProposals = [
    { ...proposal, field: "startTime", proposedValue: "25:00" },
    { ...proposal, field: "roomNumber", proposedValue: "not-in-inventory" },
    { ...proposal, field: "entryType", proposedValue: "NOT_A_TYPE" },
    { ...proposal, field: "unsupportedField", proposedValue: "value" },
  ];
  for (const invalidProposal of invalidProposals) {
    const response = await fetch(`${baseUrl}/api/timetable/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-review-api-key": apiKey },
      body: JSON.stringify(invalidProposal),
    });
    assert.equal(response.status, 400);
  }
  assert.equal(JSON.parse(await fs.readFile(correctionsFile, "utf8")).unapprovedCorrections.length, 0);

  const pendingResponse = await fetch(`${baseUrl}/api/timetable/corrections`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-review-api-key": apiKey },
    body: JSON.stringify(proposal),
  });
  const pendingPayload = await pendingResponse.json();
  assert.equal(pendingResponse.status, 201);
  assert.equal(pendingPayload.correction.approvalStatus, "PENDING_REVIEW");
  assert.equal(pendingPayload.correction.applied, false);

  const pendingQuality = await fetch(`${baseUrl}/api/timetable/quality`).then((response) => response.json());
  assert.equal(pendingQuality.reviewActionsEnabled, true);
  assert.equal(pendingQuality.summary.correctionStatusCounts.PENDING_REVIEW, 1);
  assert.equal(pendingQuality.rejectedEntries.length, 2);
  assert.equal(pendingQuality.rejectedEntries[0].roomNumber, null);
  assert.equal(pendingQuality.rejectedEntries[0].sourceFilename, "reviewed-source.docx");
  assert.equal(pendingQuality.rejectedEntries[0].scheduleId, "reviewed-source.docx#table1");
  assert.ok(pendingQuality.rejectedEntries[0].reasons.some((reason) => reason.code === "MISSING_PERIOD_ROOM"));
  assert.equal(await fs.readFile(reviewFile, "utf8"), originalSource);

  const pendingCorrection = pendingPayload.correction;
  const decision = {
    action: "APPROVE",
    reviewer: "Independent HOD Reviewer",
    reason: "Reviewed the record; room identity is still incomplete.",
    confirmation: "I independently reviewed and authorize this decision.",
  };
  const approvedResponse = await fetch(
    `${baseUrl}/api/timetable/corrections/${pendingCorrection.correctionId}/decision`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-review-api-key": apiKey },
      body: JSON.stringify(decision),
    },
  );
  const approvedPayload = await approvedResponse.json();
  assert.equal(approvedResponse.status, 200);
  assert.equal(approvedPayload.correction.approvalStatus, "APPROVED");
  assert.equal(approvedPayload.correction.applied, false);
  assert.ok(approvedPayload.correction.rejectionReasons.some((reason) => reason.code === "CORRECTED_ENTRY_INVALID"));

  const uncertainProposal = {
    ...proposal,
    sourceIndex: 1,
    field: "subjectOrActivity",
    proposedValue: "Reviewed activity",
    evidence: {
      type: "HUMAN_DECISION",
      reference: "Reviewer decision note",
      details: "This is a proposal only; the original image still needs inspection.",
    },
  };
  const uncertainPending = await fetch(`${baseUrl}/api/timetable/corrections`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-review-api-key": apiKey },
    body: JSON.stringify(uncertainProposal),
  }).then((response) => response.json());
  const uncertainDecision = await fetch(
    `${baseUrl}/api/timetable/corrections/${uncertainPending.correction.correctionId}/decision`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-review-api-key": apiKey },
      body: JSON.stringify(decision),
    },
  ).then((response) => response.json());
  assert.equal(uncertainDecision.correction.approvalStatus, "APPROVED");
  assert.equal(uncertainDecision.correction.applied, false);
  assert.ok(uncertainDecision.correction.rejectionReasons.some((reason) => reason.code === "UNCERTAIN_SOURCE_ENTRY"));

  const rejectProposal = {
    ...proposal,
    field: "day",
    proposedValue: "Tuesday",
  };
  const rejectedPending = await fetch(`${baseUrl}/api/timetable/corrections`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-review-api-key": apiKey },
    body: JSON.stringify(rejectProposal),
  }).then((response) => response.json());
  const rejectionReason = "Source does not establish Tuesday.";
  const rejectedDecision = await fetch(
    `${baseUrl}/api/timetable/corrections/${rejectedPending.correction.correctionId}/decision`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-review-api-key": apiKey },
      body: JSON.stringify({ ...decision, action: "REJECT", reason: rejectionReason }),
    },
  ).then((response) => response.json());
  assert.equal(rejectedDecision.correction.approvalStatus, "REJECTED");
  assert.equal(rejectedDecision.correction.applied, false);
  const repeatedDecision = await fetch(
    `${baseUrl}/api/timetable/corrections/${rejectedPending.correction.correctionId}/decision`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-review-api-key": apiKey },
      body: JSON.stringify(decision),
    },
  );
  assert.equal(repeatedDecision.status, 409);

  const finalQuality = await fetch(`${baseUrl}/api/timetable/quality`).then((response) => response.json());
  assert.equal(finalQuality.summary.acceptedCount, 0);
  assert.equal(finalQuality.summary.correctionStatusCounts.APPROVED, 2);
  assert.equal(finalQuality.summary.correctionStatusCounts.REJECTED, 1);
  assert.equal(finalQuality.summary.appliedCorrectionCount, 0);
  const rejectedCorrection = finalQuality.corrections.find(
    (correction) => correction.correctionId === rejectedPending.correction.correctionId,
  );
  assert.equal(rejectedCorrection.decisionReviewer, decision.reviewer);
  assert.equal(rejectedCorrection.decisionReason, rejectionReason);
  assert.equal(await fs.readFile(reviewFile, "utf8"), originalSource);
});
