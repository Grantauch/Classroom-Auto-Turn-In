# Privacy — GoClassroom v0.9.21

## Normal Auto Turn-In

Normal lesson-plan Auto Turn-In uses the teacher's locally stored Google browser session and the configured Classroom/Drive locations. The existing privacy boundary remains unchanged.

## External AI lesson-plan recovery

Optional free-provider AI recovery is separate from student grading. It is approval-required and uses only the provider the teacher connects. Do not put student-specific personal information into that recovery workflow.

## Local grading and Classroom draft grading

Local grading is off by default. When enabled, grading requests are sent only to an Ollama HTTP server on the same computer. CATI rejects non-loopback Ollama endpoints.

For a Classroom grading run, CATI may temporarily read:

- selected assignment title/directions and visible point total;
- student name/identifier needed to keep the browser on the expected student page;
- direct answer/response text CATI can identify safely;
- supported Google Docs attachment text exported through the teacher's signed-in Google session;
- existing grade-field state needed to avoid overwriting a grade.

By default, submission text and grading results are kept in memory for the run and are not intentionally written to application data files or support logs. Saved local-grading settings include enable state, selected model, Classroom draft-write opt-in, batch size, saved grading-Classroom identifiers/display names, active grading-Classroom identifier, private-review enable flag, and the teacher-chosen review-folder path.

CATI sends Ollama only the assignment directions, teacher-provided rubric, and supported submission text needed for grading. Student names and attachment titles are not intentionally included in the Ollama grading packet. A submission containing direct instruction-like prompt-injection patterns is held for teacher review before being sent to Ollama. Ollama HTTP errors are reduced to bounded categories so a server error cannot echo the submission into CATI logs.

## Optional private grading review copies

Review copies are off by default. When a teacher chooses a folder, accepts the native student-data warning, and explicitly enables the feature, GoClassroom intentionally writes a new review folder after each Classroom grading run. This is the only supported student-work persistence path.

The review packet may contain student name/identifier, assignment title/directions/point total, exact supported evidence used for grading, evidence-completeness status, limited attachment descriptors, normalized proposed grade and rubric breakdown, `SAFE_DRAFT`/`TEACHER_REVIEW`, independent validation, model name, and Classroom draft-write verification status. It does not contain browser cookies, passwords, Google tokens, raw unvalidated model responses, or the browser profile.

The teacher may choose a Google Drive for desktop folder, but GoClassroom does not upload through the Drive API, change permissions, make public links, or select a retention period. The teacher/school must restrict access and apply district retention policy. A complete packet includes `EXPORT-COMPLETE.txt`; absence of that marker means an interrupted export should not be treated as complete.

## Draft-grade writeback

When the teacher separately enables draft-grade writing and explicitly confirms a write-enabled batch in the native Cancel-by-default dialog, GoClassroom may enter validated numeric scores into the Classroom total-grade field. The one-time authorization exists only in memory, expires after five minutes, is bound to one saved grading course/assignment, and cannot be reused. GoClassroom does not click Return, does not publish the grade to students, and does not write model feedback into Classroom in v0.9.21.

Existing draft/final grades are not overwritten. Unsupported or incomplete evidence is held for teacher review instead of being graded from partial information.

## Policy note

Local processing reduces exposure to external AI providers but does not by itself establish district, FERPA, or other policy compliance. Use the feature only under applicable school/district policy.
