# v0.9.32 GoClassroom Multi-Teacher Roster Release Candidate Status

v0.9.32 makes roster problems diagnosable from a teacher's computer. "Copy support summary" now lists the last three problems with their support code, the action, and the underlying reason, with student email addresses removed. The plaintext log records the same scrubbed reason. Behavior is otherwise unchanged from v0.9.31.

## Previous: v0.9.31

v0.9.31 is a visual and layout overhaul. Behavior, safety rules, and support codes are unchanged from v0.9.30.

- **New look.** A calm light workspace with a deep-space sidebar, one indigo accent, a consistent outline icon set, and a redrawn robot mascot and space scene on Home and the welcome screen. New app and installer icon.
- **Organized around a teacher's week.** The menu groups Rosters & Hall Pass and Draft grading under "Your classes", and Turn-in setup, Lesson plans, and Automatic turn-in under "Lesson-plan turn-in". Help & support sits at the bottom.
- **Pages in the order teachers use them.** Rosters is three numbered steps (connect, find and map, compare and add). Draft grading leads with grading an assignment; model settings and the sample-work tester move lower. Automatic turn-in puts Check now above the schedule, with multi-computer options folded away. Rarely used setup options are collapsed.

## Previous: v0.9.30

v0.9.30 fixes Find my rosters on a brand-new computer and makes roster problems say exactly what is wrong:

- **Signs in instead of failing.** If GoClassroom's browser is not signed in to Google yet, Find my rosters now waits in the open window for the teacher to sign in (up to five minutes) and then continues by itself.
- **Finds taught classes more reliably.** If the Classroom "Teaching" list is not on the page, GoClassroom opens the side menu, and as a last resort checks each class's People page for teacher-only controls before using it.
- **Specific roster support codes.** AT-ROS-108 (no classes you teach), AT-ROS-109 (took too long), AT-ROS-110 (sign in), AT-ROS-111 (Hall Pass link not saved yet), AT-ROS-112 (wrong Google account for this Hall Pass), AT-ROS-113 (GoClassroom older than Hall Pass), AT-ROS-114 (Hall Pass page did not open), and AT-ROS-115 (not a Hall Pass link), each with the one step to fix it.

## Previous: v0.9.29

v0.9.29 keeps every v0.9.28 roster-write safety rule and adds two things other teachers need:

- **Your own Hall Pass.** The Rosters page has a "Which Hall Pass should your rosters go to?" box. Each teacher pastes the `/exec` link of their own Hall Pass copy and their student email ending. Changing the link discards the previous comparison, and it is refused while an approved batch still needs recovery, so nothing planned against one Hall Pass can be written to another. Existing installs keep the original link until the teacher changes it.
- **Periods 1 through 8.** Class-to-period mapping, roster previews, and write validation accept Period 7 and Period 8 for schools with longer days.

Status: source checks pass; Windows installer build, packaged self-test, and TheAtlas upgrade from v0.9.28 are pending.

## Previous: v0.9.28 GoClassroom Live Roster Pilot Release Candidate Status

## Current status

v0.9.28 preserves the v0.9.27 roster-write safety foundation, repairs live Classroom People-page discovery, and prevents harmless `Last, First` / `First Last` formatting differences from becoming live name updates.

This is a **source preview / release candidate**, not a field-validated production installer. No real roster change should be applied until the Windows package gate and a controlled teacher test have passed.

## Implemented in source

- Google Classroom roster discovery reuses the teacher's existing authenticated local browser profile.
- Only student identities whose email address is actually exposed by Classroom are accepted; GoClassroom never guesses addresses.
- Each teaching Classroom must be explicitly mapped to one school period before it can participate in an operations sync.
- Classroom roster snapshots and live Hall Pass / Check-In snapshots are stored only through Electron `safeStorage` encrypted local storage.
- Every new Classroom discovery or period-mapping change invalidates the prior live comparison and requires a fresh Version 29 roster revision.
- The live bridge response must include the expected read contract, write contract, and a valid roster revision before the Apply button can become eligible.
- The write path can send **only additions and name corrections**. It does not construct removal/deactivation/delete requests.
- A native Electron warning dialog is Cancel-by-default and must be accepted before a safe roster batch is sent.
- The server is still authoritative: it rejects stale revisions, caps approved batches, rejects removals, audits accepted changes, and creates missing PIN material without emailing it.
- Before an approved write starts, GoClassroom stores the exact request encrypted, including its request ID and base revision.
- If the browser disconnects or the result is uncertain, the exact pending request is retained and the UI requires recovery before scanning, remapping, or comparing again.
- Retrying uses the same request ID so the Version 29 server can replay/recover the idempotent batch instead of creating duplicate memberships.
- A successful response must verify the same request ID, write contract, previous revision, and a new revision.
- After success, GoClassroom clears the pending request and re-reads the live operations roster. If that follow-up read fails, the completed write remains recorded and the UI requires a fresh comparison.
- Removal candidates remain visible as **review-only** even when Classroom evidence is complete. v0.9.28 never removes a student automatically.
- Name comparison is email-and-period anchored and token-order tolerant. The live pilot reduced a false 105-name-update proposal to 9 materially different names while retaining 96 already-correct memberships.

## Automated evidence completed in this source workspace

- JavaScript syntax checks for the new roster bridge, service, IPC/preload, main process, and renderer code.
- Encrypted roster-storage regression checks.
- Roster identity/mapping/completeness checks.
- Version 29 read-contract checks for `writeContract` and roster `revision`.
- Approved-write request validation proving no removal request is constructed.
- Approved-write response validation proving request ID and before/after revisions are checked.
- Service simulation proving additions and name corrections are the only sent writes and removal candidates remain review-only.
- Simulated uncertain browser failure proving the encrypted pending request survives and the retry uses the identical request ID.
- Core `scripts/check.js` source gate passes for v0.9.28.
- Three consecutive read-only Classroom scans produced the same five class counts and 114 verified identities with zero unresolved rows.
- The production Hall Pass / Check-In bridge returned 125 active memberships, the expected read/write contracts, and a stable revision token without changing any record.
- Five class-to-period mappings were proven uniquely from the Classroom hour labels and the live operations period labels.

## Still required before replacing an installed copy

- Restore pinned dependencies with `npm ci` and run the full deep/release-ready suite.
- Run DOM, browser, and offline E2E gates.
- Build the v0.9.28 unsigned per-user NSIS installer on the Windows release environment.
- Run packaged self-test and Defender scan.
- Verify an in-place upgrade from the currently installed GoClassroom preserves teacher data, browser profile, and scheduled-task definitions.
- Perform a controlled live test using a synthetic/test membership first: compare, add, name-correct, simulate/recover a retry if practical, and verify no removal occurs.
- Confirm the live Hall Pass / Check-In audit rows and PIN behavior match the Version 29 contract.

## Release boundary

The source is ready for controlled packaging and a teacher-observed write pilot. It is **not yet certified for automatic production roster maintenance** and it should not be described as commercially complete until the Windows gate and controlled addition/name-correction write are closed.
