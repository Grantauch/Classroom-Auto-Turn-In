# GoClassroom v0.9.22 — Multi-Class Grading Preview Release Candidate

v0.9.22 fixes the core grading workflow so the Classroom that receives lesson plans is no longer the only class available for grading. It also applies the supplied GoClassroom visual system and adds an optional private grading-review export without weakening the draft-only boundary.

## New in v0.9.22

- Separate saved grading-Classroom list, independent of lesson-plan Setup.
- Add, switch among, and remove up to 20 grading classes; duplicate course IDs are deduplicated.
- Unsaved/arbitrary course IDs are rejected before a browser process runs.
- Assignment discovery, extraction, confirmation, and write authorization remain bound to the selected grading course and assignment.
- Corrected Classroom student-work navigation to use the teacher-side `/g/tg/...#u=...` view instead of the roster-shaped legacy student URL; hash-only student changes are reloaded and identity-checked before evidence or draft writing.
- Removing a grading class changes only the local shortcut and never changes Google Classroom or lesson-plan Setup.
- Optional private review copies save the evidence actually graded, normalized draft result, safety classification, independent validation, and write status to a teacher-chosen folder.
- Review copies are off by default and require a native student-data warning.
- GoClassroom logo, space banner, new color system, clearer lesson-plan/grading labels, and teacher-focused grading controls use the supplied production SVG/icon pack.
- Windows app ID, product/install identity, user-data location, browser profile, and scheduled-task names remain unchanged for upgrade safety while GoClassroom is evaluated as the pre-1.0 name.

## Clean Windows release verification

- Added checkout-stable line-ending rules and normalized source assertions so the SHA-256 source manifest verifies consistently after a real Git checkout.
- A disposable GitHub-hosted Windows runner passed the full source, DOM, Chrome, 21-scenario offline Classroom/Drive, installer build, clean current-user install, data-preserving uninstall, reinstall, packaged-browser retest, hash, and artifact-upload workflow.
- The final downloadable installer is the independently tested hosted-runner artifact. CATI remains unsigned and still requires a controlled school-PC/SmartScreen/live-Classroom pilot.

## Preserved hardening from v0.9.20

- Moved consequential per-run confirmation into a native, Cancel-by-default main-process dialog.
- Added short-lived, assignment-bound, single-use write authorization.
- Rejects concurrent grading batches, duplicate student identities, mismatched configured courses, noncanonical assignment URLs, and mismatched writer results.
- Requires one explicit positive rubric total and one explicit Classroom point total before `SAFE_DRAFT` write eligibility.
- Rechecks the grade-field denominator before writing and after reload.
- Prevents a blank field from falsely verifying as a saved zero.
- Hardens the disposable Windows install/uninstall/reinstall gate against the NSIS cleanup handoff: validation now waits for the old app and uninstaller to disappear before reinstalling, and permits one narrowly scoped retry only for a pre-install `0xC0000005` exit when no partial app executable exists. Every other installer failure still stops the release.
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

See `VERIFICATION-REPORT.md` for the exact automated, browser, build, installer, and packaged-app checks completed for v0.9.22, plus clearly separated historical v0.9.20 baseline evidence. Live district multi-Classroom selection, DOM/writeback, Drive-folder retention policy, and teacher benchmark validation remain release blockers.
