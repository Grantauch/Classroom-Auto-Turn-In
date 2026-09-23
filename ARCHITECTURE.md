# GoClassroom — v0.9.26 Approved Roster Sync Preview Architecture

## Design goal

Keep the safety-critical automation small, explicit, testable, and fail-closed. Teacher-facing Electron code should coordinate operations; engine modules should own Classroom/Drive behavior; shared configuration/state contracts should have one source of truth.

## Process layout

```text
Electron main process
  main.js
    ├─ main-services/local-data.js
    ├─ main-services/engine-runner.js
    ├─ main-services/scheduler-service.js
    ├─ main-services/ai-service.js
    ├─ main-services/grading-service.js
    └─ main-services/grading-confirmation.js
           │
           └─ bounded Node engine helper processes
                ├─ submit-weekly.js
                ├─ scan-drive-folder.js
                ├─ select-course.js
                ├─ select-grading-course.js
                ├─ select-drive-folder.js
                ├─ discover-topics.js
                ├─ preflight.js
                ├─ upload-draft-plan.js
                ├─ grading-classroom-discover.js
                ├─ grading-classroom-extract.js
                └─ grading-classroom-write.js

Renderer
  renderer/index.html
  renderer/app.js
  renderer/styles.css
       │
       └─ preload.js allowlisted IPC bridge
```

## Desktop main process

### `main.js`

Owns:

- Electron lifecycle/window hardening;
- user-visible IPC endpoints;
- high-level run coordination;
- notification decisions;
- dashboard composition;
- exclusive setup/browser operation boundary.

It should not reimplement config defaults, JSON persistence, Task Scheduler details, AI persistence, or child-process parsing.

### `main-services/local-data.js`

Owns desktop local persistence:

- configuration;
- plan mappings;
- submission state loading;
- atomic/backup JSON writes through `engine/json-store.js`;
- trusted Drive provenance preservation;
- local diagnostic logging.

### `main-services/engine-runner.js`

Owns process isolation:

- engine child spawning;
- operation-specific hard timeouts;
- child-tree termination;
- bounded stdout/stderr capture;
- `CATI_EVENT` parsing;
- structured child failure reconstruction.

### `main-services/scheduler-service.js`

Owns Windows scheduled execution:

- primary recurring task;
- true one-time retry tasks;
- retry-chain state/verification;
- schedule health;
- install/remove operations.

### `main-services/ai-service.js`

Owns optional AI recovery:

- opt-in settings;
- encrypted private-key persistence;
- local drafts;
- OpenAI draft creation;
- approval/upload orchestration;
- AI-specific plan recovery.

AI remains outside the core Auto Turn-In requirement and stays OFF by default.

### `main-services/grading-service.js`

Owns teacher-controlled local grading and the v0.9.22 multi-Classroom draft bridge:

- grading enable/model settings;
- separate Classroom draft-write opt-in and bounded batch size;
- a saved, deduplicated list of up to 20 grading Classrooms that is independent of the lesson-plan `config.json` Classroom;
- an active grading-Classroom selection and rejection of arbitrary/unsaved course IDs;
- optional teacher-controlled review-folder settings and review-packet export;
- loopback Ollama availability/model discovery;
- manual one-off grading through `engine/grading.js`;
- Classroom assignment discovery through a bounded helper process;
- student-work extraction through a bounded helper process;
- per-student `SAFE_DRAFT` / `TEACHER_REVIEW` decisions;
- Classroom point-total cross-check before any write candidate is accepted;
- assignment-bound, single-use write authorization consumption;
- rejection of concurrent or duplicate Classroom grading work;
- optional draft-score writeback only after the separate setting is enabled;
- status-only logging without student submission content.

The service never performs a final-grade/Return action. Existing grades are not overwritten.

### `main-services/grading-confirmation.js`

Owns the consequential per-run write confirmation outside the renderer:

- native Electron warning dialog;
- Cancel is the default and escape action;
- assignment title and bounded batch size are shown to the teacher;
- a confirmed run receives a short-lived one-time authorization from `grading-service.js`;
- preview-only runs bypass the write-confirmation path entirely.

### `engine/grading.js`

Owns the local grading contract:

- loopback-only Ollama URL validation;
- strict JSON schema for the grading response;
- the draft-grading prompt and missing-evidence rules;
- independent rubric-point and total-score validation;
- exact rubric-label and student-evidence grounding for `SAFE_DRAFT`;
- deterministic prompt-injection screening before student work is sent to Ollama;
- `SAFE_DRAFT` versus `TEACHER_REVIEW` classification.

The renderer never calls Ollama directly. It uses allowlisted IPC through `preload.js`, and the main process/service owns the network request. Student work and grade results are not written to the application data store. If the teacher explicitly enables private review copies after choosing a folder and accepting the native privacy warning, the service may write a bounded audit packet to that external folder.

### Classroom grading bridge helpers

- `engine/classroom-grading.js` owns Classroom grading URL parsing, batch bounds, strict DOM helper functions, attachment classification, and grade-field identification.
- `engine/select-grading-course.js` reuses the signed-in Classroom picker but returns a grading-course identity without changing lesson-plan Setup.
- `engine/grading-classroom-discover.js` accepts only a main-process-validated saved grading course and emits a structured assignment list for that course.
- `engine/grading-classroom-extract.js` reads assignment directions/one explicit point total and a bounded set of student submissions. It accepts only clearly identified direct responses and supported Google Docs plain text; inaccessible, oversized, unsupported, or truncated evidence fails closed.
- `engine/grading-classroom-write.js` receives only explicitly classified `SAFE_DRAFT` candidates, rejects duplicate students, re-verifies course/assignment/student identity, the single total-grade field, and its visible denominator, fills the score, presses Enter, reloads, and confirms the same nonblank numeric value. It has no Return click path.

The renderer can run preview-only grading with no write call. Write-enabled batches require the persisted draft-write opt-in plus a native main-process confirmation naming both the grading Classroom and assignment. Confirmation creates an in-memory, course/assignment-bound authorization that expires after five minutes and is consumed once before extraction begins.

Private review export is a separate persistence boundary. It is off by default, requires a teacher-chosen absolute directory and a native warning, writes a new non-overwriting folder per run, and writes `EXPORT-COMPLETE.txt` last. It does not use the Google Drive API or change sharing permissions. Export failure is reported separately from grading/writeback so a completed Classroom operation is not falsely described as rolled back.

## Engine

### `engine/submit-weekly.js`

Run orchestrator. It should read configuration/plans, coordinate discovery/actions, maintain fail-closed outcomes, update state, and emit the final structured run result.

### `engine/classroom-discovery.js`

Owns read/discovery behavior:

- strict selected topic region;
- assignment collection;
- duplicate detection;
- assignment opening;
- exact assignment identity verification.

### `engine/classroom-actions.js`

Owns mutation/verification behavior:

- `Your work` scoping;
- already-submitted verification;
- attachment-set verification;
- Add/Create and Link interaction;
- dry-run submission-control verification;
- Turn in / Mark as done action;
- positive post-submit confirmation.

### Shared engine contracts

- `engine/app-config.js` — config defaults/schema/migration
- `engine/json-store.js` — atomic JSON persistence
- `engine/protocol.js` — child-process event protocol
- `engine/lib.js` — engine runtime/state/locking utilities
- `engine/safety.js` — fingerprints, IDs, state normalization, uniqueness
- `engine/validation.js` — config/URL/plan/schedule validation
- `engine/browser.js` / `browser-mode.js` — persistent Chrome/Edge launch mode
- `engine/retry-policy.js` / `scheduler.js` — pure retry/schedule math
- `engine/user-errors.js` — teacher-safe error mapping

## Child-process protocol

Engine helpers communicate machine-readable results using:

```text
CATI_EVENT:<JSON envelope>
```

The envelope contains a protocol version, event type, timestamp, and payload. Ordinary logs are not treated as protocol messages.

Protocol version: **1**.

## Data safety boundaries

Local data is stored beneath Electron's per-user application-data directory.

Important files include:

- `config.json`
- `plans.json`
- `state.json`
- retry/notification state
- optional AI settings/drafts/secrets
- local grading settings (enable/model/draft-write opt-in/batch size/saved grading classes/active class/review enable and folder path; no student submissions or grade results in app data)
- optional teacher-enabled grading review packets in an external folder, which intentionally contain student evidence and validated results
- logs/screenshots
- dedicated Google browser profile

Configuration/plan/state writes use atomic replacement and validated backup recovery. Corrupt safety state fails closed rather than silently resetting submission history.

## Concurrency boundaries

- only one interactive desktop instance;
- automation lock protects a run across processes;
- setup/browser mutation operations acquire the same exclusive automation boundary;
- only one Classroom grading batch may run inside the grading service at a time;
- Windows primary task uses IgnoreNew;
- retry tasks carry chain + attempt identity.

## Release gates

`npm run check:deep` includes:

- syntax and source contract checks;
- offline adversarial tests;
- randomized date/scheduler fuzzing;
- optional-AI isolation/recovery tests;
- local Ollama grading tests;
- Classroom draft-grading bridge tests;
- teacher-language and UI integrity checks;
- field-stabilization regression tests;
- silent/retry regression tests;
- architecture graph/IPC/protocol checks;
- configuration/state migration checks.

Windows release builds additionally require:

- dependency release-readiness check;
- Chrome/Edge local DOM fixtures;
- real silent persistent-browser smoke test;
- the end-to-end simulator suite (`npm run check:e2e`).

## End-to-end test harness (`scripts/e2e/`, never packaged)

- `mock-google.js` simulates Google Classroom, Drive, Docs and the Google sign-in page. Playwright routes the real Google hosts to it, and every other host is blocked. All state lives in one JSON file, so several helper processes see the same Classroom and the test can inspect every attach and turn-in click.
- `preload.js` is loaded into helper processes with `NODE_OPTIONS=--require`. It installs the simulator routes on every browser the engine launches.
- `engine-e2e-check.js` drives the real helper processes through the real `engine-runner` and can target a packaged app (`--engine-dir`, `--exec`).
- `ui-e2e-check.js` launches the real desktop app with `electron-main-preload.js`, which points the scheduler service at a mock `powershell.exe` backed by `mock-task-scheduler.js`.
- `scripts/scheduler-powershell-check.js` proves the generated Task Scheduler scripts in Constrained Language Mode.

v0.9.13, v0.9.16, v0.9.17, v0.9.18, v0.9.19, v0.9.20, v0.9.22, v0.9.23, v0.9.24, v0.9.25, v0.9.26 and 1.x require a frozen `package-lock.json` before the normal release builder may install dependencies. Release builds use `npm ci` only.

## Multi-PC layer

- `main-services/machine-service.js` owns the local installation identity, friendly computer name, Main/Backup/Manual role, and backup delay.
- `main-services/setup-transfer.js` owns the portable safe-setup format and strips machine-specific, secret, history, safety-certificate, and automatic-on state.
- `engine/scheduler.js` shifts Backup schedules across time and day boundaries without changing the teacher's base schedule.
- `engine/submit-weekly.js` performs a final shared-Classroom completion re-check immediately before the final submission action.
- There is deliberately no fake cloud mutex. Without an authenticated atomic cloud service, a Drive-file “lock” would provide weaker guarantees. v0.9.13 instead uses staggered Main/Backup timing, a short Backup grace period, exact Classroom state checks, and fail-closed submission verification.
