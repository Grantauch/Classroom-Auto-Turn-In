# v0.9.18 Local Grading Foundation — Source Verification

Verification date: 2026-09-19 UTC

## Source-level checks completed in this environment

The following dependency-independent checks passed after the local-grading integration:

- `npm run check`
- `npm run check:grading`
- `scripts/windows-build-config-check.js`
- `scripts/offline-adversarial-check.js`
- `scripts/offline-fuzz-check.js`
- `scripts/ai-recovery-check.js`
- `scripts/error-language-check.js`
- `scripts/ui-integrity-check.js`
- `scripts/field-stabilization-check.js`
- `scripts/silent-retry-check.js`
- `scripts/architecture-check.js`
- `scripts/migration-check.js`
- `scripts/release-candidate-check.js`
- `scripts/release-readiness-check.js`
- `scripts/multi-pc-check.js`
- `scripts/field-hotfix-v0913-check.js`
- `scripts/builder-bootstrap-check.js`
- `scripts/recovery-audit-check.js`
- `scripts/submission-action-scope-check.js`
- `scripts/distribution-isolation-check.js`
- `scripts/verified-build-v0914-check.js`

The scheduler PowerShell source gate was invoked but skipped itself because `pwsh` is not installed on this non-Windows host.

## What the new grading test proves

`scripts/grading-check.js` verifies:

- the default endpoint is loopback-only Ollama;
- remote grading endpoints are rejected;
- the default model is `qwen3.6:latest`;
- grading requests are non-streaming, thinking-disabled, and schema-constrained;
- student-submission text is isolated as untrusted evidence in the grading packet;
- oversized grading inputs fail closed instead of being silently truncated;
- a mechanically valid 10/10 result becomes `SAFE_DRAFT`;
- missing evidence becomes `TEACHER_REVIEW` with null score/earned values;
- deliberately inconsistent score arithmetic is rejected;
- wrong JSON field types are rejected by CATI's independent validator;
- only grading enable/model settings are persisted;
- student work and grading results are not persisted by the grading service.

## Not proven in this environment

This source package is **not** a finished Windows installer validation. The following release gates still require the pinned dependencies and/or the Windows release environment:

- `electron-builder-schema-check.js` through an installed `app-builder-lib` package;
- DOM/browser tests using the pinned Playwright/browser environment;
- the full Electron UI/engine end-to-end suite;
- PowerShell/Task Scheduler validation on Windows;
- building the v0.9.18 NSIS installer;
- installed-package/reinstall/uninstall validation of that v0.9.18 installer.

The existing v0.9.17 verification evidence remains historical evidence for the inherited Auto Turn-In baseline; it is not presented as proof that a v0.9.18 installer has already passed those installer-level gates.

## Classroom grading boundary

v0.9.18 contains a manual local grading lab only. It does not discover student submissions from Google Classroom, write draft grades to Classroom, or return/publish grades. Those capabilities require separate implementation and validation before they may be enabled.
