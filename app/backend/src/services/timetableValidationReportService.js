function buildTimetableValidationReport(result, generatedAt = new Date().toISOString()) {
  const correctionStatusCounts = {};
  const correctionRejectionCounts = {};
  const extractionStatusCounts = {};

  for (const entry of result.correctedReviewData.entries) {
    const status = entry?.extractionStatus || "MISSING_STATUS";
    extractionStatusCounts[status] = (extractionStatusCounts[status] || 0) + 1;
  }

  for (const correctionResult of result.correctionResults) {
    const status = correctionResult.correction?.approvalStatus || "INVALID";
    correctionStatusCounts[status] = (correctionStatusCounts[status] || 0) + 1;

    for (const reason of correctionResult.reasons) {
      correctionRejectionCounts[reason.code] =
        (correctionRejectionCounts[reason.code] || 0) + 1;
    }
  }

  return {
    reportTitle: "Timetable Validation Report",
    generatedAt,
    sourceFile: result.validationReport.sourceFile,
    summary: {
      sourceEntryCount: result.validationReport.sourceEntryCount,
      acceptedCount: result.validationReport.acceptedCount,
      rejectedCount: result.validationReport.rejectedCount,
      extractionStatusCounts,
      appliedCorrectionCount: result.appliedCount,
      unappliedCorrectionCount: result.unappliedCount,
      correctionStatusCounts,
      correctionRejectionCounts,
      entryRejectionCounts: result.validationReport.reasonCounts,
    },
    corrections: result.correctionResults,
    acceptedEntries: result.validationReport.acceptedEntries,
    rejectedEntries: result.validationReport.rejectedEntries,
  };
}

module.exports = { buildTimetableValidationReport };
