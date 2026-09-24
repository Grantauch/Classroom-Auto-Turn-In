# GoClassroom v0.9.28 — Product Specification

## Live roster comparison preview

v0.9.28 extends the v0.9.27 revision-bound write bridge with repaired live Classroom People-page discovery and name-format-equivalent comparison. GoClassroom still discovers teaching Classrooms through the authenticated local browser profile, accepts only evidence-backed email identities, requires explicit Classroom-to-period mappings, encrypts roster data locally, and calculates a deterministic sync plan. After a fresh comparison and native confirmation, only additions and materially different name corrections may be applied; removals remain review-only and are never included in the write request.

## Product goal

Help a teacher reliably manage recurring lesson-plan submission and optional AI-assisted workflows while stopping instead of guessing when Google Classroom, Drive, local state, or AI output is ambiguous.

## Preserved Auto Turn-In behavior

v0.9.28 preserves the v0.9.23 due-date reliability work and the existing recurring lesson-plan workflow, schedule/retry behavior, Google sign-in model, duplicate prevention, multi-PC controls, approval-required AI lesson-plan recovery, fail-closed submission rules, and the v0.9.22 multi-Classroom grading work. It retains a verified assignment-detail due-date fallback for collapsed Classwork cards and supports common numeric Classroom date formats.

## Local grading

Local grading is optional and off by default.

Requirements:

- connect only to an Ollama endpoint on the same computer;
- default to `qwen3.6:latest` while allowing another installed Ollama model;
- treat student work as untrusted evidence rather than model instructions;
- hold direct prompt-injection patterns for teacher review before sending the text to Ollama;
- require structured grading output;
- independently validate rubric arithmetic, unique criteria, teacher-rubric labels, exact evidence excerpts, positive maximum points, and score bounds;
- classify the result as `SAFE_DRAFT` or `TEACHER_REVIEW`;
- never persist student submission text or grading results as ordinary application state;
- persist grading review records only after a teacher chooses a private folder, accepts the student-data warning, and explicitly enables review copies.

## Classroom Draft Grading Bridge

The v0.9.22 bridge may:

1. save up to 20 grading Classrooms independently of the lesson-plan Classroom selected in Setup;
2. discover assignments only from the currently selected saved grading Classroom;
3. read a bounded batch of ungraded/turned-in student work;
4. extract assignment directions and visible point total;
5. extract supported student evidence;
6. locally grade each readable submission;
7. present batch results in preview mode;
8. optionally save a private review packet in a teacher-chosen folder;
9. optionally save validated `SAFE_DRAFT` numeric scores into Classroom as hidden draft grades.

### Supported automatic evidence

- Direct answer/response fields identified unambiguously.
- Google Docs attachments exported as text.

Unsupported or incomplete evidence must produce `TEACHER_REVIEW`. CATI must not grade only the readable subset when another attachment is unreadable.

### Draft-write requirements

Classroom draft writing must be independently gated from local grading itself.

- Persistent setting defaults to OFF.
- Enabling it requires a warning/confirmation.
- Per-run write selection defaults to OFF.
- A write-enabled run requires teacher confirmation.
- Confirmation must occur in the main process, default to Cancel, and issue a short-lived assignment-bound authorization that is consumed once.
- Existing grades must never be overwritten.
- `SAFE_DRAFT` is required.
- One explicit positive rubric total and one explicit Classroom assignment total must be known and match the draft's `max_score`.
- The writer must re-read the grade field's visible denominator immediately before entry and after reload.
- Missing/duplicate student identities, concurrent batches, mismatched write results, blank numeric verification values, and oversized/truncated evidence must fail closed.
- Score must be numeric, nonnegative, and not exceed maximum points.
- After entry, CATI reloads and verifies the same draft score.
- CATI must never click Return or otherwise publish the grade to the student.

The teacher remains the final grader and decides whether/when to return student work.

## Batch limits

Default Classroom grading batch: 5 students.
Maximum: 10 students per run.

This bound limits accidental scope, keeps browser verification manageable, and makes teacher review practical.

## Data persistence

Permitted grading settings persisted locally:

- enabled;
- selected local model;
- Classroom draft-write enable flag;
- batch size.
- saved grading Classroom IDs/display names and active grading Classroom;
- private review-copy enable flag and folder path.

Do not persist as ordinary application state or logs:

- assignment directions copied for grading;
- rubric text entered for a run;
- student submission text;
- extracted attachment text;
- rubric evidence generated by the model;
- draft scores or feedback produced by local grading.

When the teacher explicitly enables private review copies, the selected external folder may contain the assignment context, evidence actually graded, student identifier/name, normalized result, validation, and write status. GoClassroom must not make that folder public, change sharing permissions, or place authentication material in it.

## Release acceptance

Before broad school-PC release, v0.9.28 requires the Windows distribution gate, packaged browser/e2e checks, a controlled live due-date validation, a controlled six-class picker/switching validation, controlled live Classroom extraction/write validation, private-review-folder policy review, controlled live roster approved add/name-update validation, encrypted pending-write recovery validation, and teacher benchmark testing. Automated/source and read-only live checks alone are not sufficient for 1.0 promotion.
