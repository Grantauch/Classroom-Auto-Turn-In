# GoClassroom v0.9.28 Live Roster Pilot Verification Report

## v0.9.28 source and read-only live status — September 23, 2026

v0.9.28 preserves the teacher-confirmed Version 29 write path and repairs the live Classroom roster reader. The desktop validates both read and write contracts plus the live roster revision, constructs only additions and materially different name corrections, stores an exact pending request through OS-backed encryption, retries the same request ID after uncertain failures, verifies the returned request/revisions, and re-reads the live roster. Removal candidates remain review-only and are never constructed as write actions.

The core project check, roster bridge/service checks, architecture guard, UI integrity, teacher error-language checks, release-candidate freeze, Windows build-configuration regression, adversarial/fuzz suites, AI recovery, grading, multi-Classroom grading bridge, grading confirmation/locking/no-rubric checks, field stabilization, silent retry, migration, multi-PC, recovery audit, submission scope, distribution isolation, verified-build, and builder-bootstrap checks passed in this Linux container. The PowerShell scheduler check skipped because PowerShell is not installed here.

The source/dependency lockfile gate passed on the Windows release builder. Three consecutive live Classroom scans returned the same five class counts and 114 verified identities; the Hall Pass / Check-In bridge returned 125 active memberships plus the expected contracts and revision token read-only. A Windows release build must still complete the final package, installed self-test, upgrade-preservation, and artifact-hash gates before v0.9.28 may replace an installed copy.

The Hall Pass source counterpart is tracked separately in the protected `the-desk` release lane: the new Apps Script RPC returns only active membership identity fields and rejects non-teachers and stale roster-sync contracts. It does not expose PINs, pass/check-in history, access overrides, or workbook row numbers, and its source/runtime coverage passed the repository full-release CI before deployment.

---

## Historical v0.9.23 / v0.9.22 verification evidence

# v0.9.23 GoClassroom Due-Date Reliability Verification Report

## v0.9.23 status — September 21, 2026

The v0.9.23 source directly reproduces and repairs the installed v0.9.22 `AT-CLS-110` failure shape: the collapsed Classwork card contains no due date, the verified assignment detail page supplies the date, and Classroom displays that date numerically. Direct parser, eligibility, adversarial, fuzz, source, safety, release, and offline browser-simulation checks pass. The full engine browser run passed 21 scenarios on the first v0.9.23 run; the two fixture failures found there were corrected and both passed on focused rerun. One correction restored `AT-CLS-110` classification instead of generic `AT-RUN-101`; the other made the offline signed-out redirect portable to the Linux headless runner.

The v0.9.23 Windows installer, packaged-app self-test, Defender scan, and live district-Classroom Safety Check remain required before automatic turn-in is re-enabled on the teacher PC. The Windows results below are retained as historical v0.9.22 upgrade evidence and must not be represented as v0.9.23 installer verification.

## Historical v0.9.22 Windows evidence

## Readiness statement

**Release-candidate / controlled-test ready; not field-validated 1.0.** The v0.9.22 source, simulated Classroom/Drive workflow, DOM fixtures, real-Chrome smoke checks, Windows package, isolated packaged runtime, Microsoft Defender scan, and backed-up in-place upgrade passed their available gates on September 20, 2026.

The installed app on the teacher PC is now v0.9.22. The existing current-user application data and the `Classroom Auto Turn-In` scheduled-task definition were backed up before installation in `C:\CATI-Build\backup-20260920-2218-v0.9.21-pre-v0.9.22`. The task definition remained byte-for-byte identical, and the installed package passed an isolated self-test that launched packaged Chrome. No live Classroom assignment was opened, graded, written, returned, or published during this verification.

## Baseline and environment

- Baseline archive: `Classroom-Auto-Turn-In-v0.9.19-Classroom-Draft-Grading-Bridge-Source-and-Builder.zip`
- Baseline SHA-256: `1EA661933B1F938A308430AAF67C1B7CDA2F6CEF0CBA5B4E00CD9B5D4FB98F19`
- Baseline archive validation: 124 safe ZIP entries; no absolute or parent-traversal paths.
- Release version: `0.9.22`.
- Electron: `38.1.2`.
- Electron Builder: `26.0.12`.
- Installer format: unsigned, one-click, current-user NSIS x64.
- Release-builder path: `C:\CATI-Build\gc-repo`.

## Source and dependency checks

| Check | Result | Evidence boundary |
|---|---|---|
| `npm ci --include=dev --no-audit --no-fund` | PASS | 384 packages installed in 18 seconds from the frozen lockfile; npm reported deprecation warnings only. |
| `npm run check:deep` | PASS | Syntax, trust/reliability, builder schema, Windows build rules, adversarial/fuzz, AI recovery, grading, six-class bridge/review export, confirmation, teacher error language, UI integrity, stabilization, architecture, migration, release-candidate, multi-PC, recovery, action scope, distribution isolation, verified build, and scheduler checks passed. |
| `npm run check:dom` | PASS | Chromium DOM fixtures passed, including ambiguous totals and grade-field scoping. |
| `npm run check:browser` | PASS | Real Google Chrome background smoke checks passed for Classroom/default grading picker and Drive picker, including dedicated “Add grading Classroom.” |
| `npm run check:e2e` engine gate | PASS | 21 offline Classroom/Drive scenarios passed. |
| `npm run check:e2e` UI gate | NOT RUN BY DESIGN | The Windows UI gate would register real scheduled tasks; the isolated installed-package gate is used instead. |
| `npm run check:visual -- validation-evidence-v0.9.22-url-fix-20260920` | PASS | Teacher dashboard and draft-grading screenshots rendered with supplied assets; no asserted horizontal overflow. Evidence is preserved at `C:\CATI-Build\validation-evidence-v0.9.22-url-fix-20260920`. |
| `npm run check:grading-bridge` | PASS | Six independent classes, lesson-plan separation, unsaved-course rejection, local-only removal, review packet completion, preview/write safety, and no Return path. |
| `npm run check:release-ready` | PASS | Release manifest, version, docs, package, and source consistency checks passed after the final manifest was regenerated. |
| Production dependency audit | PASS | `npm audit --omit=dev --audit-level=high` reported no high-severity production dependency vulnerability. |

## Classroom draft-grading safeguards verified in source

- Preview mode invokes no writer.
- The persistent draft-write setting alone cannot authorize a write.
- Every write-enabled run requires a native main-process dialog that defaults to Cancel.
- Confirmation creates one assignment-bound authorization that expires after five minutes and is consumed once.
- Renderer-provided URLs cannot redirect the service outside the configured saved grading course/assignment.
- The lesson-plan Classroom is separate from the saved grading-Classroom list; adding, switching, or removing a grading class cannot change Setup.
- Partial page loads, ambiguous Classroom totals, missing rubric totals, point mismatches, unsupported/inaccessible/oversized/truncated evidence, and direct instruction-like student text stop at `TEACHER_REVIEW`.
- Student evidence is sent only to local loopback Ollama and is not intentionally persisted by default.
- Model rubric labels must match teacher-rubric labels, evidence excerpts must occur in the submitted evidence, and all arithmetic and score bounds are independently checked.
- Existing draft/final grades are skipped, not overwritten.
- Only `SAFE_DRAFT` rows reach the writer.
- The writer rechecks the exact student, score, maximum, grade-field denominator, and blank existing-grade state.
- Reload verification must show the exact expected score and denominator.
- The writer contains no `.click(` call and no Return/publish implementation.

## Private grading review-folder verification

Review copies are off by default and require a teacher-selected folder plus a native student-data warning. The offline bridge regression created a non-overwriting per-run folder containing `assignment-review.json`, numbered student records, a private-data README, and a final `EXPORT-COMPLETE.txt` marker. The export contains only evidence actually used, normalized validated results, safety classification, and write status; it does not contain browser credentials, cookies, raw unvalidated model output, or browser-profile contents.

This is an intentional privacy exception. A Google Drive for desktop folder may be selected, but CATI does not change Drive sharing or retention settings. District policy and teacher-controlled access/retention still require review before real student data is exported.

## Windows package evidence

The first installer attempt from the deeply nested workspace reached NSIS but failed because the legacy NSIS include path exceeded Windows path handling limits. Rebuilding the identical source from the short path above succeeded. The source package instructs builders to extract to a short local path.

- Final installer: `Classroom-Auto-Turn-In-Setup-0.9.22-x64.exe`
- Size: `90,670,650` bytes.
- SHA-256: `0908A0A158B1D03BEE3552C74942F5A07FEB91469F5045E21393FC0D5855BFB2`.
- Authenticode: unsigned, as expected for this release candidate.
- Installer resource version: `0.9.22`.
- Installer product name: `Classroom Auto Turn-In` (stable compatibility identity).
- Unpacked packaged-app resource version: `0.9.22.0`.
- Packaged-app isolated-user-data self-test: PASS.
- Packaged Chrome launch: PASS.
- Microsoft Defender targeted scan: PASS; the finished installer scan reported no threats.

The installer was also applied in place on this Windows PC. The installer exited `0`; the installed executable reports file/product version `0.9.22.0`; and the installed packaged-browser self-test passed with isolated user data.

The GitHub-hosted disposable Windows lifecycle gate initially exposed an NSIS timing race: one run exited with Windows status `0xC0000005` before installation, and another reached the immediate reinstall before the asynchronous uninstaller cleanup had fully released its files. The validation script now waits for both installed executables to disappear before reinstalling and allows one retry only for that exact pre-install status when no partial app executable exists. This changes the release gate, not GoClassroom's teacher runtime; the corrected gate must pass on the final commit before delivery is called complete.

## Backed-up in-place upgrade evidence

Before installation, the following additive backup was created:

- Backup folder: `C:\CATI-Build\backup-20260920-2218-v0.9.21-pre-v0.9.22`.
- Existing installed executable: `0.9.21.0`.
- Existing executable SHA-256: `D9A251B6ABBB2F3D010573F0C9D2B689AD3D74E9787B70C00069C1C5A15AC0CD`.
- Teacher-local data backup: 1,931 files / 453,388,348 bytes.
- Existing task XML SHA-256 before: `A5C3ECAEE7F7499495AB652B19A13B49EDA8F944EF820D8D418BD2266E9F1FA9`.
- Existing task XML SHA-256 after: `A5C3ECAEE7F7499495AB652B19A13B49EDA8F944EF820D8D418BD2266E9F1FA9`.
- Task state after upgrade: Ready.
- Task action after upgrade: current-user v0.9.22 executable with `--background-run`.
- Installed executable after upgrade: `0.9.22.0`; SHA-256 `A919AE26406BE4D450ECBD2C6646A776D280D074C0ABBD5FB5382F83CC6B2C37`.
- Checked `data` settings hashes (`ai-secrets.json`, `ai-settings.json`, `config.json`, `machine.json`, `plans.json`, and `state.json`): unchanged from the backup.

The app windows were closed gracefully before the upgrade; no unrelated process was changed. The app was not launched into the teacher's real Classroom account for this check.

## Live and pedagogical blockers

The following still require a controlled teacher/IT validation pass:

- Live assignment discovery against the teacher's current district Classroom UI.
- Adding and switching among the teacher's actual five or six grading Classes while proving lesson-plan Setup remains unchanged.
- Direct-answer and Google Docs extraction against representative test submissions.
- Preview-only proof that Classroom remains unchanged.
- One controlled draft write and independent Classroom reload/readback.
- Existing-grade protection and rubric/Classroom mismatch tests in the live UI.
- Proof that work remains unreturned/unpublished.
- Teacher-scored benchmark for grading quality, disagreement review, and false `SAFE_DRAFT` cases.
- District/privacy-policy review for local student-work processing and the optional Drive-synced review folder.
- Multi-day school-PC operation, SmartScreen, visible shortcuts, and district-managed Windows policy review for the unsigned installer.

Mechanical `SAFE_DRAFT` validation means CATI proved its safety gates; it does not mean the teacher must accept the model's pedagogical judgment.

Until those gates are complete, this package must be described as a controlled-test release candidate, not a verified production grading release or a 1.0 release.
