const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const {
  DEFAULT_REVIEW_FILE,
  parseTime,
  validateEntry,
  validateReviewData,
} = require("./timetableImportService");
const {
  isConfirmedBlock,
  sameBlockIdentity,
  sameRoomIdentity,
} = require("./roomIdentityService");

const DEFAULT_CORRECTIONS_FILE = path.resolve(
  __dirname,
  "../../data/review/timetable-corrections.json",
);
const DEFAULT_INVENTORY_FILE = path.resolve(
  __dirname,
  "../../data/room-inventory.json",
);

const CORRECTABLE_FIELDS = new Set([
  "program",
  "semester",
  "section",
  "academicYear",
  "effectiveFrom",
  "day",
  "startTime",
  "endTime",
  "subjectOrActivity",
  "roomNumber",
  "block",
  "entryType",
]);

const APPROVAL_STATUSES = new Set([
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
]);
const correctionFileQueues = new Map();

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

function isValidTimestamp(value) {
  if (typeof value !== "string") {
    return false;
  }
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  );
  return Boolean(match && isValidDate(match[1]) && !Number.isNaN(Date.parse(value)));
}

function validateCorrectionRecord(correction, collection, reviewData) {
  const reasons = [];
  const addReason = (code, message) => reasons.push({ code, message });

  if (!correction || typeof correction !== "object" || Array.isArray(correction)) {
    return [{ code: "INVALID_CORRECTION", message: "Correction must be an object." }];
  }

  if (!isNonEmptyString(correction.correctionId)) {
    addReason("INVALID_CORRECTION_ID", "correctionId must be a non-empty string.");
  }
  if (!isNonEmptyString(correction.sourceFilename)) {
    addReason("INVALID_SOURCE_FILENAME", "sourceFilename must be a non-empty string.");
  }
  if (
    !correction.entryIdentifier ||
    typeof correction.entryIdentifier !== "object" ||
    Array.isArray(correction.entryIdentifier) ||
    !isNonEmptyString(correction.entryIdentifier.scheduleId) ||
    !Number.isInteger(correction.entryIdentifier.sourceIndex) ||
    correction.entryIdentifier.sourceIndex < 0
  ) {
    addReason(
      "INVALID_ENTRY_IDENTIFIER",
      "entryIdentifier must contain a scheduleId and a non-negative sourceIndex.",
    );
  }
  if (typeof correction.field !== "string" || !CORRECTABLE_FIELDS.has(correction.field)) {
    addReason("UNSUPPORTED_FIELD", "field is not eligible for correction.");
  }
  if (
    !Object.prototype.hasOwnProperty.call(correction, "originalValue") ||
    (correction.originalValue !== null && typeof correction.originalValue !== "string")
  ) {
    addReason(
      "INVALID_ORIGINAL_VALUE",
      "originalValue must be present and be a string or null.",
    );
  }
  if (!isNonEmptyString(correction.proposedValue)) {
    addReason("INVALID_PROPOSED_VALUE", "proposedValue must be a non-empty string.");
  }

  const evidence = correction.evidence;
  if (
    !evidence ||
    typeof evidence !== "object" ||
    Array.isArray(evidence) ||
    !["SOURCE_REFERENCE", "HUMAN_DECISION"].includes(evidence.type) ||
    !isNonEmptyString(evidence.reference) ||
    !isNonEmptyString(evidence.details)
  ) {
    addReason(
      "MISSING_EVIDENCE",
      "evidence must specify a supported type, reference, and details.",
    );
  } else if (
    evidence.type === "SOURCE_REFERENCE" &&
    !evidence.reference
      .toLowerCase()
      .includes(String(correction.sourceFilename || "").toLowerCase())
  ) {
    addReason(
      "SOURCE_EVIDENCE_MISMATCH",
      "A SOURCE_REFERENCE must identify the same sourceFilename as its target entry.",
    );
  }
  if (!isNonEmptyString(correction.reviewer)) {
    addReason("MISSING_REVIEWER", "reviewer must be a non-empty string.");
  }
  if (!isNonEmptyString(correction.reviewerConfirmation)) {
    addReason(
      "MISSING_REVIEWER_CONFIRMATION",
      "reviewerConfirmation must explicitly confirm the correction was reviewed.",
    );
  }
  if (!isNonEmptyString(correction.reason)) {
    addReason("MISSING_REASON", "reason must explain why the correction is needed.");
  }
  if (!isValidDate(correction.reviewDate)) {
    addReason("INVALID_REVIEW_DATE", "reviewDate must be a real YYYY-MM-DD date.");
  }
  if (!isValidTimestamp(correction.reviewedAt)) {
    addReason(
      "INVALID_REVIEW_TIMESTAMP",
      "reviewedAt must be an ISO timestamp with an explicit timezone.",
    );
  }
  if (!APPROVAL_STATUSES.has(correction.approvalStatus)) {
    addReason(
      "INVALID_APPROVAL_STATUS",
      "approvalStatus must be PENDING_REVIEW, APPROVED, or REJECTED.",
    );
  } else if (
    (collection === "approvedCorrections" &&
      correction.approvalStatus !== "APPROVED") ||
    (collection === "unapprovedCorrections" &&
      correction.approvalStatus === "APPROVED")
  ) {
    addReason(
      "APPROVAL_STATUS_MISMATCH",
      "approvalStatus must agree with the correction array.",
    );
  }

  const identifier = correction.entryIdentifier;
  if (
    identifier &&
    Number.isInteger(identifier.sourceIndex) &&
    identifier.sourceIndex >= 0 &&
    Array.isArray(reviewData.entries)
  ) {
    const entry = reviewData.entries[identifier.sourceIndex];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      addReason("ENTRY_NOT_FOUND", "entryIdentifier.sourceIndex does not identify an entry.");
    } else {
      if (entry.sourceFilename !== correction.sourceFilename) {
        addReason("SOURCE_FILENAME_MISMATCH", "sourceFilename does not match the entry.");
      }
      if (entry.scheduleId !== identifier.scheduleId) {
        addReason("SCHEDULE_ID_MISMATCH", "entryIdentifier.scheduleId does not match.");
      }
      if (
        typeof correction.field === "string" &&
        CORRECTABLE_FIELDS.has(correction.field) &&
        (entry[correction.field] ?? null) !== correction.originalValue
      ) {
        addReason(
          "ORIGINAL_VALUE_MISMATCH",
          "originalValue does not match the current extraction entry.",
        );
      }
    }
  }

  return reasons;
}

function validateCorrectionFile(reviewData, correctionData) {
  if (!reviewData || !Array.isArray(reviewData.entries)) {
    throw new TypeError("Timetable review JSON must contain an entries array.");
  }
  if (
    !correctionData ||
    typeof correctionData !== "object" ||
    correctionData.schemaVersion !== 2 ||
    !Array.isArray(correctionData.unapprovedCorrections) ||
    !Array.isArray(correctionData.approvedCorrections)
  ) {
    throw new TypeError(
      "Timetable corrections JSON must have schemaVersion 2 and both correction arrays.",
    );
  }

  const records = [
    ...correctionData.unapprovedCorrections.map((correction) => ({
      collection: "unapprovedCorrections",
      correction,
    })),
    ...correctionData.approvedCorrections.map((correction) => ({
      collection: "approvedCorrections",
      correction,
    })),
  ];
  const idCounts = new Map();
  for (const { correction } of records) {
    if (isNonEmptyString(correction?.correctionId)) {
      idCounts.set(correction.correctionId, (idCounts.get(correction.correctionId) || 0) + 1);
    }
  }

  const targetCounts = new Map();
  for (const { collection, correction } of records) {
    const identifier = correction?.entryIdentifier;
    if (
      collection === "approvedCorrections" &&
      identifier &&
      Number.isInteger(identifier.sourceIndex) &&
      typeof correction.field === "string"
    ) {
      const key = `${identifier.sourceIndex}:${correction.field}`;
      targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
    }
  }

  return records.map(({ collection, correction }) => {
    const reasons = validateCorrectionRecord(correction, collection, reviewData);
    if (isNonEmptyString(correction?.correctionId) && idCounts.get(correction.correctionId) > 1) {
      reasons.push({
        code: "DUPLICATE_CORRECTION_ID",
        message: "correctionId must be unique across both correction arrays.",
      });
    }
    const identifier = correction?.entryIdentifier;
    if (
      collection === "approvedCorrections" &&
      identifier &&
      Number.isInteger(identifier.sourceIndex) &&
      typeof correction.field === "string" &&
      targetCounts.get(`${identifier.sourceIndex}:${correction.field}`) > 1
    ) {
      reasons.push({
        code: "DUPLICATE_APPROVED_FIELD",
        message: "Only one approved correction per entry field may be applied.",
      });
    }

    return {
      collection,
      correction,
      reasons,
      applied: false,
    };
  });
}

function applyApprovedCorrections(reviewData, correctionData, sourceFile = DEFAULT_REVIEW_FILE) {
  const correctionResults = validateCorrectionFile(reviewData, correctionData);
  const correctedReviewData = {
    ...reviewData,
    entries: reviewData.entries.map((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry) ? { ...entry } : entry,
    ),
  };

  const approvedByEntry = new Map();
  for (const result of correctionResults) {
    if (result.collection !== "approvedCorrections") {
      continue;
    }
    const sourceIndex = result.correction?.entryIdentifier?.sourceIndex;
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      continue;
    }
    if (!approvedByEntry.has(sourceIndex)) {
      approvedByEntry.set(sourceIndex, []);
    }
    approvedByEntry.get(sourceIndex).push(result);
  }

  for (const [sourceIndex, entryCorrections] of approvedByEntry) {
    if (entryCorrections.some((result) => result.reasons.length > 0)) {
      for (const result of entryCorrections) {
        if (result.reasons.length === 0) {
          result.reasons.push({
            code: "ATOMIC_CORRECTION_SET_REJECTED",
            message:
              "Another approved correction for this entry is invalid; no correction for the entry was applied.",
          });
        }
      }
      continue;
    }

    const sourceEntry = correctedReviewData.entries[sourceIndex];
    if (
      !sourceEntry ||
      typeof sourceEntry !== "object" ||
      Array.isArray(sourceEntry) ||
      sourceEntry.extractionStatus !== "VERIFIED_TEXT"
    ) {
      for (const result of entryCorrections) {
        result.reasons.push({
          code: "UNCERTAIN_SOURCE_ENTRY",
          message:
            "Corrections cannot make an uncertain or visually unverified entry eligible for availability.",
        });
      }
      continue;
    }

    const candidateEntry = { ...sourceEntry };
    for (const result of entryCorrections) {
      candidateEntry[result.correction.field] = result.correction.proposedValue;
    }
    const validation = validateEntry(candidateEntry, sourceIndex);
    if (validation.reasons.length > 0) {
      const codes = validation.reasons.map((reason) => reason.code).join(", ");
      for (const result of entryCorrections) {
        result.reasons.push({
          code: "CORRECTED_ENTRY_INVALID",
          message: `Approved corrections were rejected atomically; corrected entry still fails validation: ${codes}.`,
        });
      }
      continue;
    }

    const changesRoomIdentity = entryCorrections.some(({ correction }) =>
      ["roomNumber", "block"].includes(correction.field),
    );
    if (changesRoomIdentity) {
      let inventory;
      try {
        inventory = JSON.parse(
          fsSync.readFileSync(DEFAULT_INVENTORY_FILE, "utf8"),
        );
      } catch (error) {
        throw new Error(
          `Unable to load room inventory for correction validation: ${DEFAULT_INVENTORY_FILE}`,
          { cause: error },
        );
      }
      if (
        !inventory.rooms.some((room) =>
          sameRoomIdentity(room, validation.entry),
        )
      ) {
        for (const result of entryCorrections) {
          result.reasons.push({
            code: "ROOM_IDENTITY_NOT_IN_INVENTORY",
            message:
              "The corrected block and room number do not match one exact room identity in the supplied inventory.",
          });
        }
        continue;
      }
    }

    correctedReviewData.entries[sourceIndex] = validation.entry;
    for (const result of entryCorrections) {
      result.applied = true;
    }
  }

  return {
    correctedReviewData,
    correctionResults,
    appliedCount: correctionResults.filter((result) => result.applied).length,
    unappliedCount: correctionResults.filter((result) => !result.applied).length,
    validationReport: validateReviewData(correctedReviewData, sourceFile),
  };
}

function withCorrectionFileLock(filePath, operation) {
  const previous = correctionFileQueues.get(filePath) || Promise.resolve();
  const next = previous.then(operation);
  const queued = next.catch(() => {});
  correctionFileQueues.set(filePath, queued);
  return next.finally(() => {
    if (correctionFileQueues.get(filePath) === queued) {
      correctionFileQueues.delete(filePath);
    }
  });
}

async function readCorrectionInputs(reviewFile, correctionsFile) {
  const [reviewContents, correctionsContents] = await Promise.all([
    fs.readFile(reviewFile, "utf8"),
    fs.readFile(correctionsFile, "utf8"),
  ]);

  let reviewData;
  let correctionData;
  try {
    reviewData = JSON.parse(reviewContents);
  } catch (error) {
    throw new Error(`Unable to parse timetable review file: ${reviewFile}`, {
      cause: error,
    });
  }
  try {
    correctionData = JSON.parse(correctionsContents);
  } catch (error) {
    throw new Error(`Unable to parse timetable corrections file: ${correctionsFile}`, {
      cause: error,
    });
  }
  return { reviewData, correctionData };
}

async function writeCorrectionFileAtomically(filePath, correctionData) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(correctionData, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function createCorrectionProposalRecord(reviewData, proposal, inventory) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    const error = new TypeError("Correction proposal must be a JSON object.");
    error.status = 400;
    error.details = ["Correction proposal must be a JSON object."];
    throw error;
  }

  const { sourceIndex, field, proposedValue } = proposal;
  const sourceEntry = Number.isInteger(sourceIndex)
    ? reviewData.entries[sourceIndex]
    : null;
  if (!sourceEntry || typeof sourceEntry !== "object" || Array.isArray(sourceEntry)) {
    const error = new TypeError("The selected source entry does not exist.");
    error.status = 400;
    error.details = ["sourceIndex must identify an existing timetable entry."];
    throw error;
  }
  if (!CORRECTABLE_FIELDS.has(field)) {
    const error = new TypeError("The selected field is not eligible for correction.");
    error.status = 400;
    error.details = ["field is not eligible for correction."];
    throw error;
  }
  if (!isNonEmptyString(proposedValue)) {
    const error = new TypeError("A proposed value is required.");
    error.status = 400;
    error.details = ["proposedValue must be a non-empty string."];
    throw error;
  }

  const fieldIsValid = {
    effectiveFrom: isValidDate(proposedValue),
    day:
      typeof proposedValue === "string" &&
      [
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY",
      ].includes(proposedValue.trim().toUpperCase()),
    startTime: parseTime(proposedValue) !== null,
    endTime: parseTime(proposedValue) !== null,
    roomNumber:
      !/[,/;&]/.test(proposedValue) &&
      inventory.rooms.some((room) => room.roomNumber === proposedValue.trim()),
    block:
      !/[,/;&]/.test(proposedValue) &&
      isConfirmedBlock(proposedValue) &&
      inventory.rooms.some((room) => sameBlockIdentity(room.block, proposedValue)),
    entryType: [
      "CLASS",
      "LAB",
      "MENTORING",
      "LIBRARY",
      "TUTORIAL",
      "BREAK",
      "LUNCH",
    ].includes(proposedValue.trim().toUpperCase()),
  };
  if (Object.hasOwn(fieldIsValid, field) && !fieldIsValid[field]) {
    const error = new TypeError(`The proposed ${field} value is invalid.`);
    error.status = 400;
    error.details = [`proposedValue is not valid for ${field}.`];
    throw error;
  }

  const correction = {
    correctionId: randomUUID(),
    sourceFilename: sourceEntry.sourceFilename,
    entryIdentifier: { scheduleId: sourceEntry.scheduleId, sourceIndex },
    field,
    originalValue: sourceEntry[field] ?? null,
    proposedValue,
    evidence: proposal.evidence,
    reviewer: proposal.reviewer,
    reviewerConfirmation: proposal.reviewerConfirmation,
    reason: proposal.reason,
    reviewDate: new Date().toISOString().slice(0, 10),
    reviewedAt: new Date().toISOString(),
    approvalStatus: "PENDING_REVIEW",
  };

  return correction;
}

async function proposeTimetableCorrection(
  proposal,
  reviewFile = DEFAULT_REVIEW_FILE,
  correctionsFile = DEFAULT_CORRECTIONS_FILE,
  inventoryFile = DEFAULT_INVENTORY_FILE,
) {
  return withCorrectionFileLock(correctionsFile, async () => {
    const [{ reviewData, correctionData }, inventoryContents] = await Promise.all([
      readCorrectionInputs(
      reviewFile,
      correctionsFile,
      ),
      fs.readFile(inventoryFile, "utf8"),
    ]);
    let inventory;
    try {
      inventory = JSON.parse(inventoryContents);
    } catch (error) {
      throw new Error(`Unable to parse room inventory file: ${inventoryFile}`, {
        cause: error,
      });
    }
    if (!inventory || !Array.isArray(inventory.rooms)) {
      throw new TypeError("Room inventory JSON must contain a rooms array.");
    }
    const correction = createCorrectionProposalRecord(reviewData, proposal, inventory);
    const nextCorrectionData = {
      ...correctionData,
      unapprovedCorrections: [
        ...correctionData.unapprovedCorrections,
        correction,
      ],
    };
    const result = validateCorrectionFile(reviewData, nextCorrectionData).find(
      (item) => item.correction?.correctionId === correction.correctionId,
    );
    if (result.reasons.length > 0) {
      const error = new TypeError("Correction proposal failed validation.");
      error.status = 400;
      error.details = result.reasons.map((reason) => reason.message);
      error.reasons = result.reasons;
      throw error;
    }

    await writeCorrectionFileAtomically(correctionsFile, nextCorrectionData);
    return correction;
  });
}

async function decideTimetableCorrection(
  correctionId,
  decision,
  reviewFile = DEFAULT_REVIEW_FILE,
  correctionsFile = DEFAULT_CORRECTIONS_FILE,
) {
  return withCorrectionFileLock(correctionsFile, async () => {
    const { reviewData, correctionData } = await readCorrectionInputs(
      reviewFile,
      correctionsFile,
    );
    const index = correctionData.unapprovedCorrections.findIndex(
      (item) => item.correctionId === correctionId,
    );
    if (
      index < 0 ||
      correctionData.unapprovedCorrections[index].approvalStatus !== "PENDING_REVIEW"
    ) {
      const error = new TypeError("Pending correction was not found.");
      error.status = index < 0 ? 404 : 409;
      error.details = ["Only an existing pending correction can be decided."];
      throw error;
    }

    const { action, reviewer, confirmation, reason } = decision || {};
    if (
      !["APPROVE", "REJECT"].includes(action) ||
      !isNonEmptyString(reviewer) ||
      !isNonEmptyString(confirmation) ||
      !isNonEmptyString(reason)
    ) {
      const error = new TypeError("Correction decision is incomplete.");
      error.status = 400;
      error.details = [
        "action must be APPROVE or REJECT; reviewer, confirmation, and reason are required.",
      ];
      throw error;
    }

    const correction = {
      ...correctionData.unapprovedCorrections[index],
      approvalStatus: action === "APPROVE" ? "APPROVED" : "REJECTED",
      decisionReviewer: reviewer.trim(),
      decisionConfirmation: confirmation.trim(),
      decisionReason: reason.trim(),
      decisionAt: new Date().toISOString(),
    };
    const remainingUnapproved = correctionData.unapprovedCorrections.filter(
      (_, itemIndex) => itemIndex !== index,
    );
    const nextCorrectionData = {
      ...correctionData,
      unapprovedCorrections:
        action === "REJECT"
          ? [...remainingUnapproved, correction]
          : remainingUnapproved,
      approvedCorrections:
        action === "APPROVE"
          ? [...correctionData.approvedCorrections, correction]
          : correctionData.approvedCorrections,
    };
    const validation = validateCorrectionFile(reviewData, nextCorrectionData).find(
      (item) => item.correction?.correctionId === correctionId,
    );
    if (validation.reasons.length > 0) {
      const error = new TypeError("Correction cannot be approved in its current state.");
      error.status = 400;
      error.details = validation.reasons.map((item) => item.message);
      error.reasons = validation.reasons;
      throw error;
    }

    await writeCorrectionFileAtomically(correctionsFile, nextCorrectionData);
    const application = applyApprovedCorrections(reviewData, nextCorrectionData);
    const result = application.correctionResults.find(
      (item) => item.correction?.correctionId === correctionId,
    );
    return {
      correction,
      applied: result.applied,
      rejectionReasons: result.reasons,
    };
  });
}

async function loadAndValidateTimetableCorrections(
  reviewFile = DEFAULT_REVIEW_FILE,
  correctionsFile = DEFAULT_CORRECTIONS_FILE,
) {
  const [reviewContents, correctionsContents] = await Promise.all([
    fs.readFile(reviewFile, "utf8"),
    fs.readFile(correctionsFile, "utf8"),
  ]);

  let reviewData;
  let correctionData;
  try {
    reviewData = JSON.parse(reviewContents);
  } catch (error) {
    throw new Error(`Unable to parse timetable review file: ${reviewFile}`, {
      cause: error,
    });
  }
  try {
    correctionData = JSON.parse(correctionsContents);
  } catch (error) {
    throw new Error(`Unable to parse timetable corrections file: ${correctionsFile}`, {
      cause: error,
    });
  }

  return applyApprovedCorrections(reviewData, correctionData, reviewFile);
}

module.exports = {
  DEFAULT_CORRECTIONS_FILE,
  DEFAULT_INVENTORY_FILE,
  applyApprovedCorrections,
  decideTimetableCorrection,
  loadAndValidateTimetableCorrections,
  proposeTimetableCorrection,
  validateCorrectionFile,
};
