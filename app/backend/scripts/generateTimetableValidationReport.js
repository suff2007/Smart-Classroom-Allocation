const fs = require("node:fs/promises");
const path = require("node:path");

const {
  loadAndValidateTimetableCorrections,
} = require("../src/services/timetableCorrectionService");
const {
  buildTimetableValidationReport,
} = require("../src/services/timetableValidationReportService");

const OUTPUT_FILE = path.resolve(
  __dirname,
  "../data/review/timetable-validation-report.json",
);

async function main() {
  const validation = await loadAndValidateTimetableCorrections();
  const report = buildTimetableValidationReport(validation);

  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${OUTPUT_FILE}: ${report.summary.acceptedCount} accepted, ` +
      `${report.summary.rejectedCount} rejected, ` +
      `${report.summary.unappliedCorrectionCount} corrections not applied.`,
  );
}

main().catch((error) => {
  console.error("Unable to generate timetable validation report:", error);
  process.exitCode = 1;
});
