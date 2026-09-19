# Classroom Draft Grading Verification — v0.9.19

## Offline source checks

`scripts/classroom-grading-bridge-check.js` verifies:

- assignment and student-submission URL handling;
- Google Docs support while unsupported evidence, including Sheets, remains fail-closed;
- Classroom point-total parsing;
- 1–10 batch bounds;
- preview mode performs no grade write;
- draft writing is blocked unless its separate saved setting is enabled;
- only a validated `SAFE_DRAFT` is handed to the write step;
- incomplete evidence remains `TEACHER_REVIEW`;
- existing grades are skipped rather than overwritten;
- the draft writer contains no `.click(` path and therefore no Return-button click path;
- student grading content is not persisted by the grading service.

The existing `scripts/grading-check.js` continues to verify loopback-only Ollama, schema-constrained output, prompt-injection isolation, arithmetic validation, `SAFE_DRAFT` / `TEACHER_REVIEW`, and grading-data non-persistence.

The final recovery pass also reran the dependency-independent architecture, migration, release-candidate, recovery-audit, distribution-isolation, error-language, UI-integrity, and verified-build regressions successfully. The source manifest was regenerated and verified against the final tree.

## Not proven by these offline checks

Offline tests do not certify the current Google Classroom DOM in a district account, the packaged Electron/Playwright runtime, or an installed Windows build. `npm run check:deep` was not completed in this environment because `node_modules` is absent, and the PowerShell scheduler check was skipped because this host does not provide `pwsh`.

Live teacher-controlled validation is required before relying on writeback with real student work. A grading benchmark against assignments already scored by the teacher is also required before treating `SAFE_DRAFT` as a useful grading-quality signal.
