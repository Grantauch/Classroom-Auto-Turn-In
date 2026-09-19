# Privacy — Classroom Auto Turn-In v0.9.20

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

The submission text and grading result are kept in memory for the run and are not intentionally written to CATI data files or support logs. The saved local-grading settings are limited to enable state, selected model, Classroom draft-write opt-in, and batch size.

CATI sends Ollama only the assignment directions, teacher-provided rubric, and supported submission text needed for grading. Student names and attachment titles are not intentionally included in the Ollama grading packet. A submission containing direct instruction-like prompt-injection patterns is held for teacher review before being sent to Ollama. Ollama HTTP errors are reduced to bounded categories so a server error cannot echo the submission into CATI logs.

## Draft-grade writeback

When the teacher separately enables draft-grade writing and explicitly confirms a write-enabled batch in the native Cancel-by-default dialog, CATI may enter validated numeric scores into the Classroom total-grade field. The one-time authorization exists only in memory, expires after five minutes, is bound to one course/assignment, and cannot be reused. CATI does not click Return, does not publish the grade to students, and does not write model feedback into Classroom in v0.9.20.

Existing draft/final grades are not overwritten. Unsupported or incomplete evidence is held for teacher review instead of being graded from partial information.

## Policy note

Local processing reduces exposure to external AI providers but does not by itself establish district, FERPA, or other policy compliance. Use the feature only under applicable school/district policy.
