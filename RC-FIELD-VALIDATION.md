# GoClassroom v0.9.28 Release Candidate — Field Validation

This is the final validation ledger before v1.0.0. A check is only marked PASS when it was actually observed on the Windows/district-Google environment.

## v0.9.28 approved roster sync

- [ ] Run **Discover Classroom rosters** and compare the class/student counts with the real Google Classroom rosters.
- [ ] Map each intended class to the correct Period 1–6; confirm duplicate/conflicting mappings are rejected.
- [ ] Run the live Hall Pass / Check-In comparison and manually verify the add, name-update, and removal-review counts.
- [ ] Confirm **Apply safe changes** stays disabled until a fresh Version 29 live comparison exists.
- [ ] Confirm the native dialog defaults to Cancel and lists only additions/name corrections; removal candidates remain review-only.
- [ ] Apply one controlled addition and verify it appears once in Hall Pass / Check-In.
- [ ] Apply one controlled name correction and verify the intended membership only.
- [ ] Confirm roster sync does not automatically email a PIN.
- [ ] Force a stale live-roster revision and confirm the write is rejected with a compare-again message.
- [ ] In a controlled interruption test, confirm GoClassroom retains the pending encrypted batch and retries the same request ID.
- [ ] After success, refresh the live roster and confirm the applied safe changes no longer appear pending.


## v0.9.23 due-date repair

- [ ] With the same assignment that produced `AT-CLS-110` in v0.9.22, run Safety Check and confirm the verified assignment detail page supplies the due date.
- [ ] Confirm common numeric dates such as `9/21` no longer trigger `AT-CLS-110`.
- [ ] If both the card and detail page truly omit a date, confirm GoClassroom stops with `AT-CLS-110`, includes the affected week, and submits nothing.

## v0.9.22 GoClassroom additions retained in v0.9.28

- [ ] Add at least five teaching Classrooms through the dedicated Draft grading picker.
- [ ] Switch classes and confirm assignment discovery changes to the selected class only.
- [ ] Remove and re-add one class; confirm the Google Classroom itself is unchanged.
- [ ] Confirm the lesson-plan Classroom, topic, Drive folder, schedule, and Safety Check state remain unchanged throughout.
- [ ] Confirm the write-enabled native dialog names the grading Classroom and assignment.
- [ ] Choose a restricted review folder, enable private review copies, and verify a complete packet after one preview run.
- [ ] Confirm review copies remain off by default and no packet is created when disabled.
- [ ] If using Google Drive for desktop, confirm the folder is restricted and the school retention policy is documented.

> **v0.9.17 note — September 18, 2026:** v0.9.17 preserves the live Classroom workflow from v0.9.16 and adds optional free AI providers. Classroom/Drive simulation and mocked-provider tests do not replace a teacher-controlled live provider draft. See `VERIFICATION-REPORT.md`. The items below still require the real district environment or a teacher-owned free account.
>
> **v0.9.13 reset note — September 16, 2026:** v0.9.12 reached a real school-PC Safety Check but stopped with `AT-RUN-101` because `engine/submit-weekly.js` referenced the exported `maybeClick` helper without importing it. Nothing was submitted. v0.9.13 fixes that regression; any v0.9.12 dry-run evidence after Drive discovery must be repeated before promotion.


## A. Release build

- [x] `package-lock.json` exists and is retained with the source.
- [x] `npm ci` succeeds from a clean source copy. (Linux build host, pinned Node 22.19.0)
- [x] `npm run check:release-ready` passes.
- [x] End-to-end simulator suite passes (engine and UI).
- [ ] Chrome/Edge DOM fixture test passes on Windows.
- [ ] Silent background-browser smoke test passes on Windows.
- [x] Setup EXE builds. (electron-builder 26.0.12 NSIS, cross-built)
- [x] SHA256SUMS.txt is created for release artifacts.
- [x] Silent install, upgrade over an older copy, uninstall and packaged self-test observed under Wine. Scheduled tasks survived the upgrade and were removed by the uninstall. Teacher data was kept.

## B. Upgrade preservation

Test an upgrade rather than only a clean install.

- [ ] Existing Classroom selection remains.
- [ ] Existing topic remains.
- [ ] Existing approved Drive folder remains.
- [ ] Existing schedule remains.
- [ ] Safety approval/state migrates correctly.
- [ ] Optional AI remains off when it was off.
- [ ] Optional AI opt-in/settings remain when previously enabled.
- [ ] Old primary/retry tasks are replaced or cleaned up correctly.

## C. Basic teacher workflow

- [ ] App opens without developer language.
- [ ] Home clearly says whether Auto Turn-In is ready.
- [ ] Classroom can be selected.
- [ ] Topic can be selected.
- [ ] Drive folder can be selected/scanned.
- [ ] Safety Check passes on the real district account.
- [ ] Automatic schedule installs and reports healthy.

## D. Silent scheduled operation

- [ ] Scheduled run starts with no visible Chrome/Edge window.
- [ ] Successful/no-action run ends with no retry scheduled.
- [ ] Windows task reports a successful result.
- [ ] App dashboard accurately reflects the run afterward.

## E. True retry

Use a controlled temporary failure (for example, briefly unavailable network) without risking a real submission.

- [ ] First temporary failure schedules one retry.
- [ ] Teacher is not spammed while recovery is pending.
- [ ] Retry succeeds after the temporary condition is restored.
- [ ] No second retry occurs after recovery.
- [ ] A second temporary failure schedules only the final retry.
- [ ] Retry chain expires/rejects stale attempts correctly.

## F. Nonretryable safety failures

- [ ] Signed-out Google session stops immediately and does not retry.
- [ ] Duplicate Drive week files stop immediately.
- [ ] Duplicate Classroom week assignments stop immediately.
- [ ] Unexpected attachment stops immediately.
- [ ] Unreadable due date stops immediately.
- [ ] Each case shows plain-English guidance and a precise support code.

## G. Controlled real submission

Use one harmless/approved real assignment.

- [ ] Correct assignment is identified.
- [ ] Correct weekly plan is identified.
- [ ] Only the expected attachment is present.
- [ ] Turn In/Mark as done is performed once.
- [ ] Classroom positively confirms completion.
- [ ] Dashboard records it as submitted by Auto Turn-In.
- [ ] Receiving account can open the attached lesson plan.

## H. Reboot and missed-time behavior

- [ ] Restart Windows and confirm configuration persists.
- [ ] Google profile remains usable after restart.
- [ ] Scheduled task still exists and points to the current installed app.
- [ ] Observe/verify behavior when the computer misses the normal check time.
- [ ] Confirm the chosen missed-time behavior is acceptable for district use.

## I. Data / uninstall / reinstall

- [ ] Upgrade does not erase teacher data.
- [ ] Uninstall removes the app's primary/retry Scheduled Tasks while preserving teacher data.
- [ ] Reinstall succeeds and packaged self-test passes again.
- [ ] No unexpected loss of submission history or safety state.

## J. v1.0 sign-off

- [ ] No open P0/P1 safety or reliability defect.
- [ ] Several consecutive school days of unattended checks succeed.
- [ ] At least one true retry recovery has been observed.
- [ ] At least one nonretryable failure has been observed without retry spam.
- [ ] Installer signing or approved district deployment path is decided.
- [ ] Privacy/support docs reviewed for final distribution.

## Test notes

Date(s):

Windows device / version:

Chrome/Edge version:

District Google account type:

Results / failures / support codes:

1. 
2. 
3. 

Final RC decision: **PASS / HOLD**

## Multi-PC / home-PC validation

- [ ] On PC A, save a setup copy.
- [ ] Inspect the destination PC behavior: import does not bring over Google sign-in, safety approval, submission history, AI secret/settings, or automatic-on state.
- [ ] PC B starts as Manual only.
- [ ] Sign into the work Google account independently on PC B.
- [ ] Check the approved Drive folder on PC B and run a fresh Safety Check.
- [ ] Set PC A to Main computer and PC B to Backup computer.
- [ ] Confirm PC A schedules at the base time and PC B schedules 60 minutes later, including a schedule that crosses midnight.
- [ ] Controlled Main-success scenario: PC A completes the assignment; PC B later checks and makes no second submission.
- [ ] Controlled failover scenario: keep PC A unavailable; PC B detects the still-open assignment and completes it safely.
- [ ] Confirm both installations retain independent computer names/roles and independent Google browser profiles after reboot.

### Recovery-candidate distribution note
The managed school PC is a field-test target, not the release build machine. The next school-PC test must start from a finished Setup EXE that has already passed the Windows install/self-test/uninstall/reinstall gate. The corrected unsigned build keeps Windows executable resource editing enabled and disables signing only.
