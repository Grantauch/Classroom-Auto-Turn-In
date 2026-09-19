# Classroom Draft Grading Verification — v0.9.20

## What the automated checks prove

`scripts/grading-check.js` verifies the local grading boundary:

- Ollama is restricted to the loopback endpoint;
- the default model path supports `qwen3.6:latest`;
- structured schema version 2 output is required;
- rubric labels and quoted evidence are grounded in teacher/student inputs;
- duplicate criteria, invented evidence, malformed JSON, missing fields, bad arithmetic, zero/invalid maxima, and missing rubric data fail closed;
- direct prompt-injection patterns stop before Ollama is called;
- missing models, unavailable Ollama, and timeouts produce safe teacher-review outcomes;
- student work and grading responses are not intentionally persisted.

`scripts/classroom-grading-bridge-check.js` verifies the service boundary:

- assignment discovery is limited to the configured Classroom course;
- canonical course and assignment identities are derived and rechecked;
- extraction receives a bounded 1–10 batch size;
- incomplete, duplicate, or mismatched submission packets do not become writable results;
- preview mode invokes no writer;
- the persistent draft-write opt-in is necessary but not sufficient;
- write mode also requires one unexpired, assignment-bound, single-use native authorization;
- only validated `SAFE_DRAFT` rows are supplied to the writer;
- existing draft/final grades are skipped rather than overwritten;
- rubric, assignment, model, and writer point totals must agree;
- writer results must match the requested course, assignment, student, score, and maximum;
- grading content is not written to CATI data files.

`scripts/grading-confirmation-check.js` verifies the consequential-action boundary:

- the native main-process dialog defaults to Cancel;
- cancelling stops before authorization or grading service execution;
- confirmation issues exactly one authorization for the named assignment and batch;
- preview batches bypass the dialog and remain non-writing.

`scripts/dom-fixture-check.js` and the browser smoke checks verify the current fixture/UI boundary:

- partial page loads are rejected instead of treated as complete;
- ambiguous point totals are rejected;
- one intended grade field and visible denominator are required;
- an unlabeled numeric input is not accepted as the grade field;
- teacher materials are excluded from student evidence;
- supported cross-tab Classroom/Drive flows remain functional in Chrome fixtures.

The static source checks also require the writer to have no `.click(` call. CATI therefore has no writer action that could click Return or another Classroom button.

## What installed-package checks add

The Windows release gate builds the pinned NSIS package, installs it in an isolated validation profile, verifies version resources and packaged payloads, launches the packaged app, runs the packaged browser self-test, validates scheduled-task isolation, checks uninstall/reinstall behavior, and hashes the finished artifact. This proves the packaged release is internally coherent on the builder PC; it still does not exercise a live district Classroom account.

## What remains live-only

Automated tests cannot certify:

- the current Google Classroom DOM and permissions in the teacher's district account;
- every assignment/rubric structure used by that district;
- direct-response and Google Docs extraction against representative real submissions;
- draft write/reload behavior in a real controlled Classroom assignment;
- district policy approval for local student-work processing;
- the grading quality of `qwen3.6:latest` against the teacher's expectations.

Use `TEST-TEACHER-CHECKLIST.md` with a controlled test course, assignment, and test accounts. Do not begin with live student grades. A successful mechanical check means the safeguards behaved as designed; it is not proof that a model's pedagogical judgment is correct.

