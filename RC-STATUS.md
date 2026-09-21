# v0.9.22 GoClassroom Multi-Class Grading Preview Release Candidate Status

## Current status

v0.9.22 preserves the verified lesson-plan Auto Turn-In baseline and v0.9.20 grading hardening. It separates the lesson-plan destination Classroom from a teacher-managed list of grading Classrooms, adds teacher-controlled private grading review packets, and introduces the supplied GoClassroom visual system while retaining the existing Windows compatibility identity.

### Implemented in source

- Up to 20 saved grading Classrooms independent of the single lesson-plan Classroom in Setup.
- Dedicated grading-Classroom picker, switcher, deduplication, and local-only removal.
- Assignment discovery scoped to the selected saved grading Classroom.
- Bounded grading batches: 1–60 students per run, default 5.
- Strict extraction of direct response fields.
- Text export for supported Google Docs attachments.
- Unsupported/incomplete evidence fails closed to `TEACHER_REVIEW`.
- Existing draft/final grades are protected from overwrite.
- Local Ollama grading remains loopback-only and schema-constrained.
- CATI independently verifies rubric arithmetic, unique criteria, teacher-rubric labels, exact evidence excerpts, positive score bounds, and malformed model output.
- One explicit rubric total and one explicit Classroom assignment total must match before a result may remain `SAFE_DRAFT`.
- Preview mode changes no Classroom grade.
- Classroom draft writing requires a separately saved opt-in plus a native, Cancel-by-default per-run confirmation.
- Confirmation produces an assignment-bound, five-minute, one-use authorization; renderer state alone cannot enable writing.
- Concurrent batches and duplicate student identities are rejected.
- The writer fills only the total-grade field after verifying its denominator, presses Enter, reloads, and verifies the same nonblank numeric value and denominator.
- The writer contains no click path for Return; work remains hidden from students.
- Student work and grading results are not persisted by default; a teacher may explicitly enable a private review packet in a chosen folder after accepting a student-data warning.
- Review packets contain only evidence used, normalized validated results, and audit metadata; GoClassroom does not change Drive permissions.
- Student names and attachment titles are not intentionally included in the Ollama packet.
- Direct instruction-like prompt-injection text is held for teacher review before being sent to Ollama.
- Current teacher-side `/g/tg/...#u=...` student navigation, fragment parsing, hash-only reload handling, and legacy URL compatibility have DOM/source regression coverage.

### Verified on the Windows release-builder PC

- Clean lockfile dependency installation and zero production dependency vulnerabilities reported by npm audit.
- Complete deep source regression suite, including JavaScript syntax, architecture, migration, recovery, distribution isolation, scheduler, local-grading, Classroom bridge, and native-confirmation checks.
- Classroom bridge regression test covering six independent grading classes, lesson-plan separation, unsaved-course rejection, class removal isolation, bounded extraction, private review export, preview-only mode, persistent opt-in, one-time authorization, duplicate protection, SAFE_DRAFT-only writeback, existing-grade protection, and absence of a Return click.
- Native main-process confirmation regression test covering Cancel-default behavior and preview bypass.
- Chromium DOM fixtures covering point-total ambiguity, grade-field/denominator identification, and student-attachment scoping.
- Real Google Chrome background smoke test covering cross-tab Classroom and Drive picker fixtures.
- All 21 offline Classroom/Drive engine end-to-end scenarios.
- The v0.9.22 unsigned per-user NSIS installer, isolated packaged self-test, Defender scan, and backed-up in-place upgrade passed on the Windows release-builder PC. The clean disposable lifecycle remains a historical hosted-runner baseline and still needs a fresh v0.9.22 hosted run if a separate clean-run artifact is required.
- Packaged application self-test with isolated user data and packaged Chrome launch.
- The v0.9.22 in-place upgrade was verified locally with additive backup and byte-identical scheduled-task XML; the app/product/task identity remains stable for migration safety.
- Clean checkout/build/current-user install/uninstall/data-preserving reinstall on a disposable GitHub-hosted Windows runner, including packaged-browser self-tests before and after reinstall.
- Microsoft Defender targeted scan of the finished installer found no threats.

### Still requires Windows/live validation

- Manual confirmation of visible shortcuts, SmartScreen prompts, and district-managed Windows behavior on the intended school PC. The automated clean lifecycle passed, and the teacher PC's existing installation was upgraded in place without disturbing its scheduled task.
- Live Google Classroom assignment discovery against the teacher's district UI.
- Live add/switch/remove validation across the teacher's actual five or six grading Classrooms while proving lesson-plan Setup remains unchanged.
- Live direct-answer extraction and Google Docs extraction against representative student submissions.
- Live draft-grade entry/verification on a controlled test assignment before use with real grades.
- Teacher-scored benchmark comparing model draft scores with the teacher's prior grading.
- District/privacy-policy review for local processing of student work.
- District/privacy-policy and retention review for the optional private grading review folder, especially if it syncs to Google Drive.

This release candidate is not yet a field-validated 1.0 grading release. “Installer verified” and “live Classroom draft writeback validated” remain separate claims.
