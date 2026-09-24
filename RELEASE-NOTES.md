# GoClassroom v0.9.28 — Live Roster Pilot Preview

v0.9.28 repairs live roster discovery against the current Google Classroom People pages and makes the read-only Hall Pass comparison usable for a controlled write pilot.

## Hardened in v0.9.28

- Uses the current `/r/<course>/sort-name` People route and verifies the expected course page before reading identities.
- Recovers verified student email identity from the read-only student Options menu when Classroom does not expose a mail link.
- Requires complete, stable roster traversal evidence before a class can authorize any removal review.
- Treats `Last, First` and `First Last` forms with the same normalized name tokens as already correct instead of proposing a live rewrite.
- Keeps materially different names visible for teacher review.
- Ignores a Git worktree's private `.git` pointer file when verifying release-source manifests.

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

GoClassroom v0.9.28 does not automatically remove students. Even when a Classroom roster is complete enough to identify a likely removal, the item is labeled **REVIEW REMOVE** and is not included in the server request.

The Hall Pass / Check-In server remains authoritative. It validates the teacher, contract, base roster revision, request ID, batch size, membership identity, and previous name; rejects stale/conflicting data; audits accepted changes; and supports replay/recovery of the same request ID. New memberships may receive missing PIN material, but this sync path does not email PINs.

## Release status

The source-level roster gates and repeated live read-only discovery/bridge gates pass. Windows packaging, packaged-app validation, and a teacher-observed controlled addition/name-correction test are still required before this build is described as production-ready 1.0.
