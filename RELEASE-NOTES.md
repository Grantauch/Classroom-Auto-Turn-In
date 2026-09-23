# GoClassroom v0.9.27 — Roster Safety Repair Preview

v0.9.27 advances the v0.9.25 read-only live roster comparison into a deliberately narrow teacher-approved sync path with the Hall Pass / Check-In Version 29 bridge.

## Hardened in v0.9.27

- **Apply safe changes** action after a fresh live roster comparison.
- Native Cancel-by-default teacher confirmation before any roster write.
- Revision-bound Version 29 write contract (`2026-09-22-roster-write-v1`).
- Additions and name corrections only; no automatic removal/deactivation/delete path.
- Encrypted pending-write record created before the browser call begins.
- Idempotent retry using the exact same request ID after an uncertain browser/server result.
- Follow-up live roster read after a verified successful batch.
- Comparison invalidation after roster discovery or period-mapping changes.
- Teacher UI showing pending recovery state, safe write counts, and review-only removals.
- `AT-ROS-106` support path for an approved roster batch that cannot be verified safely.
- Expanded roster regression tests covering write validation, revision verification, no-removal behavior, and uncertain-write recovery.

## Safety boundary

GoClassroom v0.9.27 does not automatically remove students. Even when a Classroom roster is complete enough to identify a likely removal, the item is labeled **REVIEW REMOVE** and is not included in the server request.

The Hall Pass / Check-In server remains authoritative. It validates the teacher, contract, base roster revision, request ID, batch size, membership identity, and previous name; rejects stale/conflicting data; audits accepted changes; and supports replay/recovery of the same request ID. New memberships may receive missing PIN material, but this sync path does not email PINs.

## Release status

The source-level roster gates pass. Windows packaging, packaged-app validation, and a controlled live roster test are still required before this build replaces the installed teacher copy or is described as production-ready.
