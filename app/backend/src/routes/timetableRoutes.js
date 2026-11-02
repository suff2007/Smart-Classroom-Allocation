const fs = require("node:fs/promises");
const express = require("express");
const { timingSafeEqual } = require("node:crypto");
const { requireRole } = require("./authRoutes");

const {
  applyApprovedCorrections,
  decideTimetableCorrection,
  DEFAULT_CORRECTIONS_FILE,
  proposeTimetableCorrection,
} = require("../services/timetableCorrectionService");
const {
  DEFAULT_REVIEW_FILE,
} = require("../services/timetableImportService");

function createTimetableRouter({
  reviewFile = DEFAULT_REVIEW_FILE,
  correctionsFile = DEFAULT_CORRECTIONS_FILE,
} = {}) {
const router = express.Router();

function requireReviewApiKey(req, res, next) {
  const configuredKey = process.env.TIMETABLE_REVIEW_API_KEY;
  const providedKey = req.get("x-review-api-key") || "";
  if (!configuredKey || Buffer.byteLength(configuredKey) < 32) {
    return res.status(503).json({
      error: {
        code: "REVIEW_AUTH_NOT_CONFIGURED",
        message: "Timetable review actions are unavailable until a strong review API key is configured on the server.",
      },
    });
  }

  const configuredBytes = Buffer.from(configuredKey);
  const providedBytes = Buffer.from(providedKey);
  if (
    configuredBytes.length !== providedBytes.length ||
    !timingSafeEqual(configuredBytes, providedBytes)
  ) {
    return res.status(401).json({
      error: {
        code: "REVIEW_AUTH_REQUIRED",
        message: "A valid timetable review API key is required for this action.",
      },
    });
  }
  return next();
}

async function readJson(filePath) {
  const contents = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Unable to parse JSON file: ${filePath}`, { cause: error });
  }
}

router.get("/quality", async (req, res, next) => {
  try {
    const [reviewData, correctionData] = await Promise.all([
      readJson(reviewFile),
      readJson(correctionsFile),
    ]);
    const result = applyApprovedCorrections(reviewData, correctionData, reviewFile);
    const extractionStatusCounts = {};
    const correctionStatusCounts = {};
    const correctionRejectionCounts = {};

    for (const entry of reviewData.entries) {
      const status = entry?.extractionStatus || "MISSING_STATUS";
      extractionStatusCounts[status] = (extractionStatusCounts[status] || 0) + 1;
    }

    for (const item of result.correctionResults) {
      const status = item.correction?.approvalStatus || "INVALID";
      correctionStatusCounts[status] = (correctionStatusCounts[status] || 0) + 1;
      for (const reason of item.reasons) {
        correctionRejectionCounts[reason.code] =
          (correctionRejectionCounts[reason.code] || 0) + 1;
      }
    }

    return res.json({
      reviewActionsEnabled:
        Boolean(process.env.TIMETABLE_REVIEW_API_KEY) &&
        Buffer.byteLength(process.env.TIMETABLE_REVIEW_API_KEY) >= 32,
      summary: {
        sourceEntryCount: result.validationReport.sourceEntryCount,
        acceptedCount: result.validationReport.acceptedCount,
        rejectedCount: result.validationReport.rejectedCount,
        appliedCorrectionCount: result.appliedCount,
        unappliedCorrectionCount: result.unappliedCount,
        extractionStatusCounts,
        entryRejectionCounts: result.validationReport.reasonCounts,
        correctionStatusCounts,
        correctionRejectionCounts,
      },
      rejectedEntries: result.validationReport.rejectedEntries.map(
        ({ sourceIndex, entry, reasons }) => {
          const details =
            reviewData.entries[sourceIndex] &&
            typeof reviewData.entries[sourceIndex] === "object" &&
            !Array.isArray(reviewData.entries[sourceIndex])
              ? reviewData.entries[sourceIndex]
              : entry && typeof entry === "object" && !Array.isArray(entry)
                ? entry
                : {};
          return {
            sourceIndex,
            sourceFilename: details.sourceFilename || null,
            scheduleId: details.scheduleId || null,
            program: details.program || null,
            semester: details.semester || null,
            section: details.section || null,
            effectiveFrom: details.effectiveFrom || null,
            day: details.day || null,
            startTime: details.startTime || null,
            endTime: details.endTime || null,
            subjectOrActivity: details.subjectOrActivity || null,
            roomNumber: details.roomNumber || null,
            block: details.block || null,
            extractionStatus: details.extractionStatus || null,
            reasons,
          };
        },
      ),
      corrections: result.correctionResults.map(
        ({ collection, correction, reasons, applied }) => ({
          collection,
          correctionId: correction?.correctionId || null,
          sourceFilename: correction?.sourceFilename || null,
          field: correction?.field || null,
          approvalStatus: correction?.approvalStatus || "INVALID",
          reason: correction?.reason || null,
          decisionReviewer: correction?.decisionReviewer || null,
          decisionReason: correction?.decisionReason || null,
          applied,
          rejectionReasons: reasons,
        }),
      ),
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/corrections",
  requireRole("ADMIN", "COORDINATOR"),
  requireReviewApiKey,
  async (req, res, next) => {
  try {
    const correction = await proposeTimetableCorrection(
      req.body,
      reviewFile,
      correctionsFile,
    );
    return res.status(201).json({
      correction: {
        correctionId: correction.correctionId,
        sourceFilename: correction.sourceFilename,
        field: correction.field,
        approvalStatus: correction.approvalStatus,
        applied: false,
        rejectionReasons: [],
      },
      message: "Correction saved for independent review. It has not been approved or applied.",
      },
    );
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({
        error: {
          code: "INVALID_CORRECTION_PROPOSAL",
          message: error.message,
          details: error.details || [],
        },
      });
    }
    return next(error);
  }
});

router.patch(
  "/corrections/:correctionId/decision",
  requireRole("ADMIN", "COORDINATOR"),
  requireReviewApiKey,
  async (req, res, next) => {
    try {
      const result = await decideTimetableCorrection(
        req.params.correctionId,
        req.body,
        reviewFile,
        correctionsFile,
      );
      return res.json({
        correction: {
          correctionId: result.correction.correctionId,
          approvalStatus: result.correction.approvalStatus,
          decisionReviewer: result.correction.decisionReviewer,
          decisionReason: result.correction.decisionReason,
          applied: result.applied,
          rejectionReasons: result.rejectionReasons,
        },
      });
    } catch (error) {
      if ([400, 404, 409].includes(error.status)) {
        return res.status(error.status).json({
          error: {
            code: error.status === 404
              ? "CORRECTION_NOT_FOUND"
              : error.status === 409
                ? "CORRECTION_ALREADY_DECIDED"
                : "INVALID_CORRECTION_DECISION",
            message: error.message,
            details: error.details || [],
          },
        });
      }
      return next(error);
    }
  },
);

return router;
}

module.exports = createTimetableRouter();
module.exports.createTimetableRouter = createTimetableRouter;
