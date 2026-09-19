# v0.9.20 Release Blockers

v0.9.20 is a release candidate. Automated Windows/source evidence and live-Classroom evidence are tracked separately below.

## Completed source/offline gates

- [x] Existing local Ollama grading regression checks.
- [x] Classroom draft-grading bridge regression checks.
- [x] Preview-only mode does not invoke grade writeback.
- [x] Draft writeback requires a separate setting.
- [x] Every write-enabled batch requires native main-process confirmation and a one-use assignment-bound authorization.
- [x] Concurrent batches and duplicate student identities fail closed.
- [x] Existing grades are protected from overwrite.
- [x] Unsupported, inaccessible, oversized, truncated, or incomplete evidence stops at teacher review.
- [x] Direct prompt-injection patterns stop before Ollama.
- [x] Explicit rubric/Classroom point totals and the grade-field denominator must agree.
- [x] Writer source has no Return/action click path.
- [x] Student grading content is not persisted by the grading service.

## Windows distribution gate

All items below must pass before calling a v0.9.20 Setup EXE verified:

- [x] `npm ci --no-audit --no-fund` from the committed lockfile on the Windows release-builder environment.
- [x] `npm run check:deep`.
- [x] Chromium DOM fixtures and real-Chrome browser smoke checks.
- [x] Offline Classroom/Drive engine end-to-end simulator: 21 scenarios.
- [x] Build unsigned NSIS installer with the pinned toolchain.
- [x] Packaged-app self-test with isolated user data, v0.9.20 resources, and packaged Chrome launch.
- [x] Backed-up in-place upgrade from v0.9.17 to v0.9.20; existing teacher data and the production scheduled-task definition were preserved, and the installed application passed its isolated packaged-browser self-test.
- [x] Microsoft Defender targeted installer scan: no threats found.
- [x] Clean current-user install/uninstall/data-preserving reinstall validation on a disposable GitHub-hosted Windows runner, followed by a second packaged-browser self-test ([run 35447491739](https://github.com/Grantauch/Classroom-Auto-Turn-In/actions/runs/35447491739)).
- [x] Release hashes generated from every finished downloadable artifact in the accompanying `SHA256SUMS-v0.9.20.txt` delivery manifest.

The visible shortcut/SmartScreen experience and district-managed Windows restrictions still require the controlled school-PC/IT pilot. They do not block source/package integrity status, but they do block describing the release as field validated.

## Live Google Classroom grading gate

- [ ] Confirm assignment discovery on the teacher's current district Classroom UI.
- [ ] Confirm direct-response extraction with representative assignments.
- [ ] Confirm Google Docs attachment export with representative student files.
- [ ] Confirm unsupported attachment types fail closed.
- [ ] Confirm assignment point-total detection on controlled assignments.
- [ ] Confirm preview mode leaves grades unchanged.
- [ ] Confirm draft writeback enters only the intended student's score.
- [ ] Confirm reload verification detects the saved value.
- [ ] Confirm no Return/publish action occurs.
- [ ] Confirm existing draft/final grades are never overwritten.
- [ ] Confirm district policy for locally processed student work on the intended Windows computer.

## Grading-quality gate

- [ ] Teacher-scored benchmark on prior real assignments.
- [ ] Review score disagreements, false `SAFE_DRAFT` cases, and teacher-review rate.
- [ ] Do not treat mechanical validation as proof of pedagogical correctness.

Until these gates are complete, the source package must not be described as a verified production grading release.
