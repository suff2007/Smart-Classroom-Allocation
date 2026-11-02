
function deriveConfirmedSectionRoomOccupancy(reviewEntries) {
  const ignoredActivities = /\b(BREAK|LUNCH|LIBRARY)\b/i;
  const labLikeActivity = /\b(LAB|PFL|PRACTICAL)\b/i;
  const result = [];

  for (const entry of reviewEntries || []) {
    if (!entry) continue;
    if (
      !["VERIFIED_TEXT", "NEEDS_VISUAL_REVIEW"].includes(
        entry.extractionStatus
      )
    ) continue;

    if (
      !entry.day ||
      !entry.startTime ||
      !entry.endTime ||
      !entry.effectiveFrom
    ) continue;

    if (ignoredActivities.test(entry.subjectOrActivity || "")) {
      continue;
    }

    let roomNumber =
      typeof entry.roomNumber === "string"
        ? entry.roomNumber.trim().toUpperCase()
        : "";

    let block =
      typeof entry.block === "string"
        ? entry.block.trim().toUpperCase()
        : "";

    let assignmentSource = "PERIOD_ROOM";

    if (!roomNumber || !block) {
      if (labLikeActivity.test(entry.subjectOrActivity || "")) {
        continue;
      }

      const assignment =
        typeof entry.sectionRoomAssignment === "string"
          ? entry.sectionRoomAssignment
              .trim()
              .match(/^(SMVB|SMV|SVB|CVR)\s+([A-Za-z0-9-]+)$/i)
          : null;

      if (!assignment) continue;

      block = assignment[1].toUpperCase();
      roomNumber = assignment[2].toUpperCase();
      assignmentSource = "SECTION_DEFAULT_ROOM";
    }

    // Never use uncertain rows as confirmed occupancy evidence.
    if (entry.extractionStatus !== "VERIFIED_TEXT") continue;

    result.push({
      ...entry,
      block: block === "SMV" ? "SMV" : block,
      roomNumber,
      entryType: labLikeActivity.test(entry.subjectOrActivity || "")
        ? "LAB"
        : "CLASS",
      occupancyEvidenceSource: assignmentSource,
    });
  }

  return result;
}

module.exports = { deriveConfirmedSectionRoomOccupancy };
