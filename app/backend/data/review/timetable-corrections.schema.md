# Timetable correction workflow

`timetable-corrections.json` is a separate, reviewable overlay. It does not edit the extraction report and is never written to MongoDB by this workflow.

## File structure

- `schemaVersion`: currently `2`.
- `unapprovedCorrections`: proposed or rejected corrections. `PENDING_REVIEW` and `REJECTED` records are allowed here and are never applied.
- `approvedCorrections`: records with `approvalStatus: "APPROVED"`. Only valid records in this array are applied in memory.

Both arrays start empty. Do not add a correction until a reviewer has an explicit source reference or has documented a human decision.

## Correction record

Each record has this shape:

```json
{
  "correctionId": "unique-review-id",
  "sourceFilename": "exact source DOCX filename",
  "entryIdentifier": {
    "scheduleId": "exact scheduleId from the extraction entry",
    "sourceIndex": 0
  },
  "field": "roomNumber",
  "originalValue": null,
  "proposedValue": "314",
  "evidence": {
    "type": "HUMAN_DECISION",
    "reference": "minutes, ticket, or source document location",
    "details": "The reviewer records what was confirmed and why it applies to this period."
  },
  "reviewer": "reviewer name or institutional identifier",
  "reviewerConfirmation": "I reviewed this source evidence and confirm this correction applies to this specific entry.",
  "reason": "Why the existing value is incorrect and why the proposed value is supported.",
  "reviewDate": "YYYY-MM-DD",
  "reviewedAt": "2026-10-11T10:30:00.000Z",
  "approvalStatus": "PENDING_REVIEW"
}
```

`entryIdentifier.sourceIndex` is the zero-based position in `entries` in the unchanged extraction JSON; `scheduleId` and `sourceFilename` must also match that entry. When the original field is absent or `null`, record `originalValue` as `null`. Otherwise, it must exactly match the extracted value. Proposed values must be non-empty strings.

Allowed corrected fields are `program`, `semester`, `section`, `academicYear`, `effectiveFrom`, `day`, `startTime`, `endTime`, `subjectOrActivity`, `roomNumber`, `block`, and `entryType`. Source identity, `extractionStatus`, `scheduleId`, notes, and `sectionRoomAssignment` cannot be corrected through this overlay. In particular, an approved correction cannot mark an uncertain or visually unverified entry as verified.

`evidence.type` is `SOURCE_REFERENCE` or `HUMAN_DECISION`; `reference` and `details` are both required. `reviewerConfirmation`, `reason`, `reviewDate`, and `reviewedAt` are mandatory; `reviewedAt` must be a timestamp with an explicit timezone. For a room correction, the evidence must explicitly confirm the room for that individual period. A section-level room assignment is not sufficient. The workflow verifies that evidence and reviewer statements are recorded, not that the cited source or human decision is factually correct.

`reviewDate` must be a real calendar date. `approvalStatus` is `PENDING_REVIEW`, `APPROVED`, or `REJECTED`; status must agree with the containing array.

For an entry, all approved field corrections are staged together and validated atomically. They are applied only if the resulting entry passes the existing full timetable validator. An incomplete set (for example, still missing room, block, type, or valid times) is rejected as a group; correct the entry by proposing all necessary supported fields together. `extractionStatus` cannot be corrected. Any `NEEDS_VISUAL_REVIEW`, `AMBIGUOUS`, or `MISSING_INFORMATION` source entry remains rejected and its proposed changes are not applied for availability.

The correction processor never writes the extraction JSON or MongoDB. It cannot verify that a cited source or reviewer statement is factually correct; a designated university reviewer must do so before placing records in `approvedCorrections`.
