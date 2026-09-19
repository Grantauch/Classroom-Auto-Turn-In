# v0.9.20 Classroom Draft Grading Bridge Hardening Release Candidate Status

## Current status

v0.9.20 preserves the verified lesson-plan Auto Turn-In baseline, the v0.9.18 local grading foundation, and the v0.9.19 teacher-controlled Google Classroom draft-grade bridge. It hardens the bridge's confirmation, evidence, point-total, concurrency, identity, and write-verification boundaries.

### Implemented in source

- Assignment discovery in the Classroom selected in Setup.
- Bounded grading batches: 1–10 students per run, default 5.
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
- Student work and grading results are not intentionally persisted; student names and attachment titles are not intentionally included in the Ollama packet.
- Direct instruction-like prompt-injection text is held for teacher review before being sent to Ollama.

### Verified on the Windows release-builder PC

- Clean lockfile dependency installation and zero production dependency vulnerabilities reported by npm audit.
- Complete deep source regression suite, including JavaScript syntax, architecture, migration, recovery, distribution isolation, scheduler, local-grading, Classroom bridge, and native-confirmation checks.
- Classroom bridge regression test covering configured-course scope, bounded extraction, preview-only mode, persistent opt-in, one-time authorization, duplicate protection, SAFE_DRAFT-only writeback, existing-grade protection, and absence of a Return click.
- Native main-process confirmation regression test covering Cancel-default behavior and preview bypass.
- Chromium DOM fixtures covering point-total ambiguity, grade-field/denominator identification, and student-attachment scoping.
- Real Google Chrome background smoke test covering cross-tab Classroom and Drive picker fixtures.
- All 21 offline Classroom/Drive engine end-to-end scenarios.
- Unsigned per-user NSIS installer build with v0.9.20 resources.
- Packaged application self-test with isolated user data and packaged Chrome launch.
- In-place upgrade from the existing v0.9.17 current-user installation to v0.9.20; the teacher-local data folder remained present, the production scheduled-task definition remained byte-for-byte unchanged, and the installed v0.9.20 application passed the isolated packaged-browser self-test.
- Microsoft Defender targeted scan of the finished installer found no threats.

### Still requires Windows/live validation

- A full clean install/uninstall/reinstall validation on an isolated Windows user or PC. This builder's production v0.9.17 installation was backed up and successfully upgraded in place, but it was not uninstalled because that would disrupt the teacher setup.
- Live Google Classroom assignment discovery against the teacher's district UI.
- Live direct-answer extraction and Google Docs extraction against representative student submissions.
- Live draft-grade entry/verification on a controlled test assignment before use with real grades.
- Teacher-scored benchmark comparing model draft scores with the teacher's prior grading.
- District/privacy-policy review for local processing of student work.

This release candidate is not yet a field-validated 1.0 grading release. “Installer verified” and “live Classroom draft writeback validated” remain separate claims.
