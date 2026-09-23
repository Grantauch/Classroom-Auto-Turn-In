# v0.9.26 GoClassroom Release Blockers

v0.9.26 is a release candidate. Source/offline evidence, Windows package evidence, live Classroom evidence, and live Hall Pass / Check-In roster-sync evidence are tracked separately below.

## Completed source/offline gates

- [x] Existing local Ollama grading regression checks.
- [x] Classroom draft-grading bridge regression checks.
- [x] Preview-only mode does not invoke grade writeback.
- [x] Draft writeback requires a separate setting and native confirmation.
- [x] Existing grades are protected from overwrite; no Return/publish path exists.
- [x] v0.9.23 due-date fallback and numeric date handling remain covered.
- [x] Multi-Classroom grading stays independent of the lesson-plan Classroom.
- [x] Classroom roster discovery accepts only evidence-backed student email identities.
- [x] Classroom-to-period mapping is explicit, unique, and required before comparison.
- [x] Local roster/student membership data is stored only through OS-backed encrypted storage.
- [x] Live operations comparison requires the Version 29 read contract, write contract, and stable roster revision.
- [x] Approved roster writes can contain only additions and name corrections; removal/deactivation/delete fields are rejected.
- [x] Removal candidates remain review-only and are never constructed as write actions.
- [x] Roster write requests are capped, revision-bound, and protected by a native Cancel-by-default teacher confirmation.
- [x] The exact approved pending request is encrypted locally before the write begins.
- [x] An uncertain/disconnected write keeps the pending request and retries the same idempotent request ID.
- [x] A successful response must match the request ID, write contract, previous revision, and a new revision; GoClassroom then re-reads the live roster.
- [x] Source manifest verifies exactly with no unlisted source files.

## Windows distribution gate

All items below must pass before calling a v0.9.26 Setup EXE verified:

- [ ] `npm ci --no-audit --no-fund` from the committed lockfile on the Windows release-builder environment.
- [ ] `npm run check:deep` with PowerShell available.
- [ ] Chromium DOM fixtures and real-Chrome browser smoke checks.
- [ ] Expanded offline Classroom/Drive end-to-end simulator.
- [ ] Build unsigned NSIS installer with the pinned toolchain.
- [ ] Packaged-app self-test with isolated user data and v0.9.26 resources.
- [ ] Backed-up in-place upgrade from the existing teacher installation to v0.9.26; verify teacher data and production scheduled-task definition remain unchanged.
- [ ] Microsoft Defender targeted installer scan: no threats found.
- [ ] Clean current-user install/uninstall/data-preserving reinstall validation, followed by a second packaged-browser self-test.
- [ ] Release hashes generated for every finished downloadable artifact in the v0.9.26 delivery manifest.

Historical v0.9.22 Windows evidence remains useful baseline evidence but does not verify the changed v0.9.26 package.

## Live Google Classroom grading gate

- [ ] Confirm assignment discovery on the teacher's current district Classroom UI.
- [ ] Add at least five real grading Classrooms, switch among them, and prove lesson-plan Classroom/Drive/topic setup is unchanged.
- [ ] Confirm representative direct-response and Google Docs extraction.
- [ ] Confirm unsupported/incomplete evidence fails closed.
- [ ] Confirm preview mode leaves grades unchanged.
- [ ] Confirm controlled draft writeback enters only the intended student's score and readback verifies it.
- [ ] Confirm no Return/publish action occurs and existing grades are never overwritten.
- [ ] Confirm district privacy/retention policy for local grading and optional private review packets.

## Live roster-sync gate

Use controlled test memberships first. Do not test automatic removals because v0.9.26 deliberately has no automatic-removal path.

- [ ] Discover the teacher's real Classroom rosters and verify class names/counts against Classroom.
- [ ] Map each intended Classroom to the correct Period 1–6 value and confirm duplicate period mappings fail closed.
- [ ] Read the live Hall Pass / Check-In roster and verify the comparison counts against the teacher dashboard/workbook.
- [ ] Confirm the native approval dialog shows additions/name corrections and explicitly excludes removals.
- [ ] Apply one controlled new membership and verify it appears in the live operations roster with preserved history.
- [ ] Apply one controlled name correction and verify only that membership name changes.
- [ ] Confirm a new PIN/card may be generated when needed but no PIN email is automatically sent by roster sync.
- [ ] Create a stale-comparison condition and confirm the server rejects the write instead of guessing.
- [ ] Exercise an interrupted/uncertain write in a controlled environment and confirm retry uses the same request ID and does not duplicate the membership.
- [ ] Confirm removal candidates remain review-only in the UI and are absent from the server write payload.
- [ ] Confirm a fresh comparison after success shows no remaining safe add/name-update work for the applied records.

## Grading-quality gate

- [ ] Teacher-scored benchmark on prior real assignments.
- [ ] Review score disagreements, false `SAFE_DRAFT` cases, and teacher-review rate.
- [ ] Do not treat mechanical validation as proof of pedagogical correctness.

Until the applicable Windows and live gates are complete, v0.9.26 must be described as a controlled-test release candidate, not a field-validated commercial release.
