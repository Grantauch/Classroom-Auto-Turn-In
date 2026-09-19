# Classroom Auto Turn-In v0.9.20 — Classroom Draft Grading Bridge Hardening Release Candidate

Classroom Auto Turn-In (CATI) is a teacher-controlled Windows app for safe scheduled Google Classroom lesson-plan turn-in. v0.9.20 preserves the verified Auto Turn-In baseline, the optional approval-required free-AI lesson-plan recovery path, the v0.9.18 local Ollama grading foundation, and the v0.9.19 Classroom Draft Grading Bridge.

v0.9.20 hardens the **Classroom Draft Grading Bridge** so incomplete evidence, ambiguous point totals, duplicate identities, concurrent batches, stale/mismatched write results, and renderer-only confirmation cannot cross the draft-write boundary.

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

Student work and grading results are held in memory for the run and are not intentionally persisted in CATI data files. CATI persists only local-grading settings: enable state, selected Ollama model, the separate Classroom draft-write opt-in, and batch size.

## Local AI contract

- Ollama endpoint is restricted to loopback HTTP (`127.0.0.1`, `localhost`, IPv6 loopback).
- Default model: `qwen3.6:latest`.
- Student work is treated as untrusted evidence, not as instructions to the model. Direct instruction-like prompt-injection patterns stop at `TEACHER_REVIEW` before the text is sent to Ollama.
- Output is constrained by a structured JSON schema.
- CATI independently checks rubric totals, earned-point totals, duplicate rubric criteria, criterion-label grounding, evidence-excerpt grounding, null/review rules, positive maximum points, and score bounds.
- `SAFE_DRAFT` means mechanically valid and complete enough to present/write as a draft; it does **not** mean the teacher must accept the model's judgment.

## Classroom grading workflow

1. Open **Local grading**.
2. Turn local grading on and choose an installed Ollama model.
3. Select **Find Classroom assignments**.
4. Choose one assignment and paste the rubric.
5. Leave **For this run, save...** unchecked for a preview-only batch.
6. Review `SAFE_DRAFT` and `TEACHER_REVIEW` results.
7. If desired, separately enable Classroom draft writing, save that setting, check the per-run write box, and confirm the native Cancel-by-default batch dialog.
8. CATI enters only validated draft scores after rechecking the grade-field denominator, reloads each student page, and verifies the saved number. It never clicks Return.

See `CLASSROOM-DRAFT-GRADING-v0.9.20.md` for the detailed contract. The v0.9.19 document remains in this package as historical baseline documentation.

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

For a Windows installer build, extract this source package to a short local path such as `C:\CATI-Build\v0.9.20` before running `BUILD-SETUP-EXE.bat`. The pinned NSIS 3.0.4.1 toolchain still uses legacy Windows path handling and can fail when the source is nested under a very long folder path even though the source checks pass.

## Important files

- `engine/grading.js` — local Ollama grading contract and validation.
- `engine/classroom-grading.js` — Classroom grading URL/DOM helpers and fail-closed extraction rules.
- `engine/grading-classroom-discover.js` — assignment discovery.
- `engine/grading-classroom-extract.js` — bounded student-work extraction.
- `engine/grading-classroom-write.js` — draft-score fill and reload verification; no Return action.
- `main-services/grading-service.js` — orchestrates discovery, extraction, local grading, validation, and optional draft writeback.
- `main-services/grading-confirmation.js` — native per-run confirmation and one-time write authorization handoff.
- `renderer/index.html` / `renderer/app.js` — teacher controls and preview/write selection.
- `scripts/classroom-grading-bridge-check.js` — offline bridge regression checks.
- `scripts/grading-confirmation-check.js` — native-confirmation and one-time authorization regression checks.

Normal Auto Turn-In remains independent of the optional grading feature.
