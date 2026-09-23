# GoClassroom v0.9.26 — Approved Roster Sync Preview

GoClassroom is the umbrella product built on the existing Classroom Auto Turn-In (CATI) Windows identity. v0.9.26 preserves the stable app ID, install identity, saved setup, browser profile, scheduled-task names, v0.9.23 due-date repair, and v0.9.25 live roster comparison while adding a teacher-confirmed, revision-bound roster write path.

GoClassroom can discover teaching Classrooms locally, accept only evidence-backed student email identities, require explicit Classroom-to-period mappings, compare against the current Hall Pass / Check-In roster, and apply only additions and name corrections after native confirmation. Removal candidates remain review-only. Pending writes are encrypted and retried with the same idempotent request ID after uncertain failures.

The supplied GoClassroom production SVG/icon pack is used directly in the new teacher-first interface. “GoClassroom” remains a preview name pending a formal trademark/domain review; the current installer retains the proven Classroom Auto Turn-In compatibility identity.

## Hard grading boundary

CATI does **not** make the final grading decision for the teacher.

- Local grading is off by default.
- Classroom draft-score writing has a second, separate opt-in.
- Each write-enabled batch requires a native, Cancel-by-default main-process confirmation and a short-lived, assignment-bound, single-use authorization.
- CATI never clicks **Return** and never publishes a grade to a student.
- Existing draft/final grades are never overwritten.
- A grade is write-eligible only when the local model returns `SAFE_DRAFT`, rubric labels come from the teacher rubric, quoted evidence is grounded in the submission, CATI independently validates the point math, and one explicit rubric total matches Classroom's assignment point total.
- Missing, unreadable, unsupported, or ambiguous evidence becomes `TEACHER_REVIEW`; CATI does not guess.
- The teacher remains responsible for reviewing and returning student work in Classroom.

## What the Classroom bridge reads

For the selected assignment CATI currently supports:

- direct answer/response fields that can be identified unambiguously;
- Google Docs attachments exported as text through the teacher's already signed-in Google session.

Sheets, Slides, PDFs, arbitrary Drive files, images, and other unsupported attachments cause the affected submission to stop at `TEACHER_REVIEW` rather than grading from partial evidence.

By default, student work and grading results are held in memory for the run and are not intentionally persisted in application data files. v0.9.22 adds an explicit teacher-controlled exception: **Private grading review copies**. If the teacher chooses a private folder, accepts the student-data warning, and turns the option on, GoClassroom writes one review folder per run containing the assignment context, exact evidence used, proposed grade, rubric breakdown, safety classification, independent validation, and Classroom write status. The feature is off by default and never changes Drive sharing permissions.

## Local AI contract

- Ollama endpoint is restricted to loopback HTTP (`127.0.0.1`, `localhost`, IPv6 loopback).
- Default model: `qwen3.6:latest`.
- Student work is treated as untrusted evidence, not as instructions to the model. Direct instruction-like prompt-injection patterns stop at `TEACHER_REVIEW` before the text is sent to Ollama.
- Output is constrained by a structured JSON schema.
- CATI independently checks rubric totals, earned-point totals, duplicate rubric criteria, criterion-label grounding, evidence-excerpt grounding, null/review rules, positive maximum points, and score bounds.
- `SAFE_DRAFT` means mechanically valid and complete enough to present/write as a draft; it does **not** mean the teacher must accept the model's judgment.

## Classroom grading workflow

1. Open **Draft grading**.
2. Turn local grading on and choose an installed Ollama model.
3. Select **Add grading Classroom**, open one class you teach, and choose **Add grading Classroom** in the browser. Repeat for each class.
4. Choose a grading Classroom in the app, then select **Find assignments in this class**.
5. Choose one assignment and paste the rubric.
6. Leave **For this run, save...** unchecked for a preview-only batch.
7. Review `SAFE_DRAFT` and `TEACHER_REVIEW` results.
8. Optionally choose a private grading review folder and enable review copies. This intentionally persists student data in that folder and should follow school retention policy.
9. If desired, separately enable Classroom draft writing, save that setting, check the per-run write box, and confirm the native Cancel-by-default batch dialog, which names the grading Classroom and assignment.
10. GoClassroom enters only validated draft scores after rechecking the grade-field denominator, reloads each student page, and verifies the saved number. It never clicks Return.

See `GOCLASSROOM-MULTI-CLASS-GRADING-v0.9.22.md` for the new multi-class and review-copy contract. The v0.9.19 and v0.9.20 grading documents remain in this package as historical baseline documentation.

## Release status

This package remains a **release candidate**, not a field-validated 1.0 release. Read `VERIFICATION-REPORT.md` for the exact source, browser, build, installer, and packaged-app evidence completed for this archive. Controlled live Classroom extraction/writeback, district policy approval, teacher benchmark review, and multi-day school operation remain separate gates in `RELEASE-BLOCKERS.md`.

Dedicated private source repository: `https://github.com/Grantauch/Classroom-Auto-Turn-In`. CATI is not stored in or deployed from the GrantDesk repositories.

## Useful checks

```text
npm ci --no-audit --no-fund
npm run check:deep
npm run check:grading
npm run check:grading-bridge
npm run check:dom
npm run check:browser
npm run check:e2e
npm run check:release-ready
```

The end-to-end/browser checks remain separate because they require the packaged/browser environment.

For a Windows installer build, extract this source package to a short local path such as `C:\CATI-Build\v0.9.26` before running `BUILD-SETUP-EXE.bat`. The pinned NSIS 3.0.4.1 toolchain still uses legacy Windows path handling and can fail when the source is nested under a very long folder path even though the source checks pass.

## Important files

- `engine/grading.js` — local Ollama grading contract and validation.
- `engine/classroom-grading.js` — Classroom grading URL/DOM helpers and fail-closed extraction rules.
- `engine/grading-classroom-discover.js` — assignment discovery.
- `engine/select-grading-course.js` — dedicated grading-Classroom picker that does not modify lesson-plan Setup.
- `engine/grading-classroom-extract.js` — bounded student-work extraction.
- `engine/grading-classroom-write.js` — draft-score fill and reload verification; no Return action.
- `main-services/grading-service.js` — orchestrates discovery, extraction, local grading, validation, and optional draft writeback.
- `main-services/grading-service.js` also owns the saved grading-class list and optional private review export.
- `main-services/grading-confirmation.js` — native per-run confirmation and one-time write authorization handoff.
- `renderer/index.html` / `renderer/app.js` — teacher controls and preview/write selection.
- `scripts/classroom-grading-bridge-check.js` — offline bridge regression checks.
- `scripts/grading-confirmation-check.js` — native-confirmation and one-time authorization regression checks.

Normal Auto Turn-In remains independent of the optional grading feature.
