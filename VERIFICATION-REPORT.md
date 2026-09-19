# v0.9.20 Verification Report

## Readiness statement

**Share with caveats.** The v0.9.20 source, simulated Classroom/Drive workflow, Windows package, clean Windows install/uninstall/reinstall lifecycle, packaged-browser runtime, and backed-up in-place upgrade passed their available gates on September 19, 2026. The unsigned installer is suitable for an IT-reviewed, controlled test. It is not a field-validated production grading release.

The standard destructive install/uninstall/reinstall gate correctly refused to run on the teacher PC because CATI v0.9.17 and a real `Classroom Auto Turn-In` scheduled task were already present. After the user requested that this PC be set up with the release, the v0.9.17 program, teacher-local data, and task definition were fully backed up; v0.9.20 was installed in place; and the scheduled task was proven byte-for-byte unchanged. The clean lifecycle was then run independently on a disposable GitHub-hosted Windows runner from commit `9f21b0e8bff9905b44559180709709be33905454`; [workflow run 35447491739](https://github.com/Grantauch/Classroom-Auto-Turn-In/actions/runs/35447491739) passed fresh install, packaged self-test, uninstall with data preservation, reinstall, and a second packaged-browser self-test.

## Baseline and environment

- Baseline archive: `Classroom-Auto-Turn-In-v0.9.19-Classroom-Draft-Grading-Bridge-Source-and-Builder.zip`
- Baseline SHA-256: `1EA661933B1F938A308430AAF67C1B7CDA2F6CEF0CBA5B4E00CD9B5D4FB98F19`
- Baseline archive validation: 124 safe ZIP entries; no absolute or parent-traversal paths.
- Baseline source manifest: 112 listed files verified exactly before changes; no missing, mismatched, or extra files.
- Release-builder OS: Windows.
- Release version: `0.9.20`.
- Electron: `38.1.2`.
- Electron Builder: `26.0.12`.
- Installer format: unsigned, one-click, current-user NSIS x64.

## Source and dependency checks

| Check | Result | Evidence boundary |
|---|---|---|
| `npm ci --no-audit --no-fund` | PASS | Installed 384 packages from the frozen lockfile. |
| `npm audit --omit=dev --audit-level=high` | PASS | Reported 0 production dependency vulnerabilities. |
| `npm run check:deep` | PASS | Syntax, Electron Builder schema, Windows build rules, adversarial/fuzz, AI recovery, grading, Classroom bridge, native confirmation, 61 support-code cases, UI integrity, architecture, migration, recovery, isolation, verified-build, and 21 generated scheduler scripts passed. |
| `npm run check:dom` | PASS | Chromium DOM fixtures passed, including ambiguous totals and grade-field scoping. |
| `npm run check:browser` | PASS | Real Google Chrome background smoke test passed, including cross-tab Classroom and Drive picker fixtures. |
| `npm run check:e2e` engine gate | PASS | 21 offline Classroom/Drive scenarios passed in Electron. |
| `npm run check:e2e` UI gate | NOT RUN BY DESIGN | On Windows this test would register real scheduled tasks. The script explicitly skipped it; isolated installed validation is the intended Windows gate. |
| GitHub-hosted Windows lifecycle | PASS | Clean checkout, all source/browser/simulator gates, installer build, isolated current-user install, uninstall/data preservation, reinstall, packaged-browser retest, hashes, and artifact upload passed in run 35447491739. |

## Classroom draft-grading safeguards verified in source

- Preview mode invokes no writer.
- The persistent draft-write setting alone cannot authorize a write.
- Every write-enabled run requires a native main-process dialog that defaults to Cancel.
- Confirmation creates one assignment-bound authorization that expires after five minutes and is consumed once.
- Renderer-provided URLs cannot redirect the service outside the configured course/assignment.
- Concurrent batches and duplicate student identities fail closed.
- Partial page loads, ambiguous Classroom totals, missing rubric totals, point mismatches, unsupported/inaccessible/oversized/truncated evidence, and direct prompt-injection phrases stop at teacher review.
- Student evidence is sent only to local loopback Ollama and is not intentionally persisted.
- Ollama errors are categorized without logging the prompt or server response body.
- Model rubric labels must match teacher-rubric labels, evidence excerpts must occur in the submitted evidence, and all arithmetic and score bounds are independently checked.
- Existing draft/final grades are skipped, not overwritten.
- Only `SAFE_DRAFT` rows reach the writer.
- The writer rechecks the exact student, score, maximum, grade-field denominator, and blank existing-grade state.
- A blank input cannot verify as numeric zero.
- Reload verification must show the exact expected score and denominator.
- The writer contains no `.click(` call and no Return/publish implementation.

## Windows package evidence

The first installer attempt from the deeply nested workspace reached NSIS but failed because the legacy NSIS include path exceeded its practical Windows path limit. Rebuilding the identical source through a short temporary drive mapping succeeded. The temporary mapping was removed afterward. The source package instructs builders to extract to a short local path.

- Final downloadable installer: `Classroom-Auto-Turn-In-Setup-0.9.20-x64.exe`
- Size: 89,924,465 bytes.
- SHA-256: `3F2B4B68A7377F487F86F02A725CB17B96D64E8D3D095A7EDB09DBD82CB455B2`
- Authenticode: Not signed, as expected for this release candidate.
- Installer resource version: `0.9.20`.
- Installer product name: `Classroom Auto Turn-In`.
- Microsoft Defender targeted scan of the final downloadable installer: PASS, no threats found.
- Unpacked packaged-app resource version: `0.9.20.0`.
- Packaged-app isolated-user-data self-test: PASS.
- Packaged Playwright/Chrome launch: PASS when run through a short validation path matching a normal installation path.
- In-place installer exit code: `0`.
- Installed application resource version: `0.9.20.0`.
- Installed application packaged-browser self-test: PASS with isolated user data.

The locally built installer used for the backed-up in-place upgrade had SHA-256 `EEDA767C4F7AFCEAABCA90F9E90EF8CA9BCD27DFD58557EF507DDC3948605849` and size 90,650,004 bytes. The final downloadable installer above was rebuilt from the same application source on the clean hosted runner and is the artifact that passed the clean lifecycle. NSIS output is not byte-for-byte reproducible across those two build environments, so both hashes are recorded rather than treated as interchangeable.

## Installed-package boundary

`scripts/windows-installed-validation.ps1` deliberately refused to run while this PC still had the production CATI installation and task. Before the requested upgrade, the PC had:

- installed CATI version `0.9.17.0` under the current user's local Programs folder;
- one ready production scheduled task named `Classroom Auto Turn-In`.

Before installing, an additive private recovery backup captured 1,805 files (600,089,278 bytes): the v0.9.17 program folder, teacher-local CATI data/browser profile, and scheduled-task XML. The installer then upgraded the same current-user program path. Verification showed:

- installed version `0.9.20.0`;
- installer exit code `0`;
- teacher-local data remained present at the same measured size immediately after the upgrade;
- the production scheduled-task XML SHA-256 remained `EBB9EDD5DE672D2DE278CD8853578BF561AC40AB8734CE617F46A3B6D25AEE0E` before and after;
- the task remained Ready and continued to point at the same current-user executable path;
- the installed v0.9.20 self-test passed with isolated user data and a packaged Chrome launch.

The disposable hosted Windows runner additionally proved that the final installer:

- installs silently as the current user on a clean environment;
- exposes the expected v0.9.20 product/version resources and uninstaller;
- keeps packaged self-test data isolated and creates no production scheduled task;
- preserves an application-data marker across uninstall;
- reinstalls successfully and preserves that marker;
- passes the packaged-browser self-test again after reinstall.

The automated lifecycle does not assert the visible Start-menu/Desktop shortcut experience, SmartScreen prompts, or district-managed Windows policy behavior. Those remain part of the controlled school-PC/IT pilot, not a source or installer-integrity failure.

## Live and pedagogical blockers

No live district Classroom assignment or student submission was opened or changed during this build. No grade was written, returned, or published. Before routine use, complete `TEST-TEACHER-CHECKLIST.md` with a controlled test course, assignment, and test accounts, including:

- current district Classroom assignment discovery and page selectors;
- direct-answer and Google Docs extraction against representative test submissions;
- preview-only proof that Classroom remains unchanged;
- one controlled draft write and independent Classroom reload/readback;
- existing-grade protection and rubric/Classroom mismatch tests;
- proof that work remains unreturned/unpublished;
- district/privacy-policy review for local student-work processing;
- teacher-scored benchmark for grading quality and false `SAFE_DRAFT` cases;
- multi-day school-PC operation and SmartScreen/IT review for the unsigned installer.

Mechanical safety validation is not evidence that the model's pedagogical judgment matches the teacher's grading. `SAFE_DRAFT` means CATI proved its mechanical gates, not that the teacher must accept the score.
