# Classroom Auto Turn-In v0.9.20 — Classroom Draft Grading Bridge Hardening Release Candidate

v0.9.20 hardens the v0.9.19 teacher-controlled Classroom Draft Grading Bridge without weakening its draft-only boundary.

## Clean Windows release verification

- Added checkout-stable line-ending rules and normalized source assertions so the SHA-256 source manifest verifies consistently after a real Git checkout.
- A disposable GitHub-hosted Windows runner passed the full source, DOM, Chrome, 21-scenario offline Classroom/Drive, installer build, clean current-user install, data-preserving uninstall, reinstall, packaged-browser retest, hash, and artifact-upload workflow.
- The final downloadable installer is the independently tested hosted-runner artifact. CATI remains unsigned and still requires a controlled school-PC/SmartScreen/live-Classroom pilot.

## Hardening in v0.9.20

- Moved consequential per-run confirmation into a native, Cancel-by-default main-process dialog.
- Added short-lived, assignment-bound, single-use write authorization.
- Rejects concurrent grading batches, duplicate student identities, mismatched configured courses, noncanonical assignment URLs, and mismatched writer results.
- Requires one explicit positive rubric total and one explicit Classroom point total before `SAFE_DRAFT` write eligibility.
- Rechecks the grade-field denominator before writing and after reload.
- Prevents a blank field from falsely verifying as a saved zero.
- Rejects overlong/truncated directions, combined submissions, and Google Docs exports instead of grading partial evidence.
- Requires model rubric labels to come from the teacher rubric and evidence quotes to appear in the submission.
- Stops direct instruction-like prompt injection before student work is sent to Ollama.
- Keeps attachment titles out of the Ollama prompt and prevents Ollama errors from echoing student work into logs.

## Fail-closed evidence rules

Current automatic extraction accepts direct answer/response fields and Google Docs plain text. If CATI sees unsupported, inaccessible, oversized, ambiguous, or incomplete evidence; cannot identify one grade field and denominator; cannot verify assignment/rubric points; or detects instruction-like prompt injection, that student stops at teacher review.

## What CATI still never does

- It never clicks Return.
- It never publishes a grade to a student.
- It never overwrites an existing grade.
- It never scales a draft score when rubric points and Classroom points disagree.
- It never uses external lesson-plan AI providers for student grading.

## Validation status

See `VERIFICATION-REPORT.md` for the exact automated, browser, build, installer, and packaged-app checks completed for v0.9.20. Live district Classroom DOM/writeback and teacher benchmark validation remain release blockers.
