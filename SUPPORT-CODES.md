# Auto Turn-In support codes

Support codes are short labels shown with important problems. A teacher should not need to understand the code: the app always shows a plain-English explanation and next step beside it. The code simply lets school technology support identify the exact failure family quickly.

| Code | What it means | First thing to try |
|---|---|---|
| AT-APP-101 | Auto Turn-In could not open its local settings folder. | Restart the app. |
| AT-APP-102 | The computer is out of usable storage space. | Free some space, then reopen the app. |
| AT-APP-103 | Windows blocked access to a file Auto Turn-In needs. | Restart; if it repeats, contact school technology support. |
| AT-DATA-111 | Saved setup could not be read safely. | Keep automatic turn-in paused and open Help & support. |
| AT-DATA-112 | Saved lesson-plan list could not be read safely. | Recheck the approved Drive folder. |
| AT-DATA-113 | Earlier submission history could not be read safely. | Keep automatic turn-in paused and open Help & support. |
| AT-GGL-101 | Google needs the teacher to sign in again. | Open Setup and reconnect the correct work Google account. |
| AT-PC-102 | Chrome or Edge could not be opened. | Confirm Chrome or Edge is installed, then retry. |
| AT-PC-103 | Auto Turn-In cannot remember the Google sign-in on this computer. | Restart; if it repeats, contact school technology support. |
| AT-CLS-103 | Classroom selection timed out. | Try Choose Classroom again. |
| AT-CLS-104 | No valid Classroom is selected. | Choose the Classroom again in Setup. |
| AT-CLS-105 | The lesson-plan topic could not be identified uniquely. | Choose the topic again. |
| AT-CLS-106 | No weekly lesson-plan assignment matched. | Check the selected topic and assignment-name example. |
| AT-CLS-107 | The opened assignment did not match what Auto Turn-In expected. | Re-select the Classroom before retrying. |
| AT-CLS-108 | The assignment title did not match the naming setup. | Check the assignment-name example. |
| AT-CLS-109 | The matching Classroom assignment could not be opened safely. | Open it manually once, then run Check now again. |
| AT-CLS-110 | The Classroom due date could not be read clearly. | Check the due date manually, then retry. |
| AT-CLS-111 | More than one Classroom assignment matches the same week. | Remove or rename the duplicate. |
| AT-CLS-114 | Classroom selection was canceled or its browser window was closed. | Choose Classroom again when ready. |
| AT-DRV-103 | Drive folder selection timed out. | Try Choose folder again. |
| AT-DRV-104 | The selected Drive location is not one specific folder. | Open the exact weekly-plan folder and choose it again. |
| AT-DRV-105 | More than one Drive file matches the same week. | Keep only one matching weekly plan. |
| AT-DRV-106 | No weekly lesson-plan files matched in the selected folder. | Check the folder and filename example. |
| AT-DRV-109 | Drive folder selection was canceled or its browser window was closed. | Choose the folder again when ready. |
| AT-PLAN-105 | A due Classroom assignment has no matching weekly plan. | Put the matching plan in the approved Drive folder. |
| AT-PLAN-107 | A manually added plan does not point to a valid Google Drive file. | Correct the Drive link in Lesson plans. |
| AT-ATT-101 | Another attachment is already in Your work. | Remove the unexpected attachment before retrying. |
| AT-ATT-102 | Auto Turn-In could not verify the Your work area. | Open the assignment manually and make sure it loads normally. |
| AT-ATT-103 | Classroom's Add or create controls could not be found. | Retry once; if it repeats, open Help & support. |
| AT-ATT-104 | The exact weekly plan could not be verified after attaching it. | Check the assignment manually before retrying. |
| AT-SUB-101 | The final Turn in / Mark as done control could not be verified. | Check the assignment manually. |
| AT-SUB-102 | Classroom did not positively confirm the turn-in after reload. | Check the assignment manually before running again. |
| AT-SUB-103 | Classroom and Auto Turn-In's saved history disagree. | Check the assignment manually, then open Help & support if needed. |
| AT-SAFE-101 | The current setup has not passed a Safety Check. | Run Safety Check again. |
| AT-SCH-101 | The automatic schedule could not be saved. | Save the schedule again. |
| AT-SCH-102 | The automatic checks could not be paused. | Check the schedule again before assuming it is paused. |
| AT-SCH-103 | Auto Turn-In could not confirm the automatic schedule. | Open Automatic turn-in and save the schedule again. |
| AT-SCH-104 | The schedule is missing a valid day or time. | Choose at least one day and a valid time. |
| AT-SCH-105 | Saved automatic retry timing is invalid. | Save the automatic schedule again to restore the standard retry timing. |
| AT-SCH-106 | A temporary problem occurred but Windows could not schedule the retry. | Save the automatic schedule again, then use Check now if needed. |
| AT-AI-201 | A saved AI connection could not be opened safely. | Remove that connection and enter its private key again if AI recovery is wanted. |
| AT-AI-202 | AI recovery does not have a usable connection to the selected service. | Add a valid key or leave AI recovery off. |
| AT-AI-203 | The selected AI service could not create the draft right now. | Check the internet connection or free-service limit and retry later. |
| AT-AI-204 | The returned AI draft was not in the expected format. | Regenerate once. |
| AT-AI-205 | The local AI draft file is no longer available. | Dismiss it and create a new draft if needed. |
| AT-AI-206 | An AI draft appears to have uploaded, but Drive verification failed. | Check the approved Drive folder before retrying. |
| AT-GRD-201 | CATI could not use local Ollama. | Make sure Ollama is running and the selected model is installed; no Classroom grade was changed. |
| AT-GRD-202 | The local model returned grading data CATI could not validate. | Review the work manually; CATI rejected the draft and changed no Classroom grade. |
| AT-GRD-203 | Local grading is turned off. | Turn on Local grading before creating a draft. |
| AT-GRD-104 | CATI could not read the selected Classroom assignment list safely. | No grades were changed; reopen Classroom and try again. |
| AT-GRD-105 | CATI could not finish the Classroom draft-grading batch safely. | No uncertain grade was written; review the batch and retry. |
| AT-GRD-204 | Classroom grading assignment discovery timed out. | No grades were changed; make sure Classroom loads and retry. |
| AT-GRD-205 | The Classroom draft-grading batch timed out. | No uncertain grade was written; retry with a smaller batch if needed. |
| AT-GRD-206 | The one-time draft-write confirmation is missing, expired, or already used. | Start a new batch and confirm it again; no grade was changed. |
| AT-GRD-207 | Another Classroom grading batch is already running. | Wait for it to finish before starting another batch. |
| AT-GRD-208 | The selected grading assignment does not match a saved grading Classroom. | Choose the grading class again and find its assignments before retrying. |

Unknown problems use a general support code and are still shown in plain English. Technical details remain in the local support files rather than on teacher screens.

## Timeout and retry codes

| Code | Meaning | Teacher action |
|---|---|---|
| `AT-RUN-101` | An unexpected run-level problem stopped the check before it could finish safely. | Nothing uncertain was submitted. Open **Help & support** and share the newest local support log if the problem repeats. |
| `AT-RUN-102` | Another Auto Turn-In check is already running. | Wait for the active check to finish, then try again. |
| `AT-RUN-103` | An Auto Turn-In check exceeded its safe runtime and was stopped. | Try **Check now** once. If it repeats, open Help & support. |
| `AT-CLS-112` | Classroom selection remained open too long. | Choose Classroom again when ready. |
| `AT-CLS-113` | Reading Classroom topics exceeded its safe runtime. | Make sure Classroom loads normally, then retry. |
| `AT-DRV-107` | Checking the approved Drive folder exceeded its safe runtime. | Try checking the folder once more; use Help & support if it repeats. |
| `AT-DRV-108` | Drive folder selection remained open too long. | Choose the folder again when ready. |
| `AT-PC-104` | Computer readiness check exceeded its safe runtime. | Restart Auto Turn-In and retry the check. |
| `AT-AI-207` | Optional AI draft upload exceeded its safe runtime. | Check the approved Drive folder before retrying. |
| `AT-APP-104` | Another non-submission action exceeded its safe runtime. | Retry once, then use Help & support if it repeats. |

## Multi-PC / setup transfer

- `AT-PC-105` — This computer's local Auto Turn-In identity could not be read safely.
- `AT-PC-106` — This computer's name/role could not be saved.
- `AT-SCH-107` — This computer is set to Manual only or an old automatic schedule still exists while Manual only is selected.
- `AT-SET-108` — A portable setup copy could not be saved.
- `AT-SET-109` — A portable setup file could not be imported safely.

## IPC fallback support codes

These codes are used only if the normal typed main-process error cannot cross the Electron IPC boundary. They keep Help & support actionable even during an IPC failure.

| Code | IPC action | Fallback meaning |
|---|---|---|
| `AT-HOME-199` | `dashboard:get` | Auto Turn-In could not load the Home status. Close and reopen the app, then try again. |
| `AT-SET-199` | `config:get` | Auto Turn-In could not load your saved setup. Restart the app and try again. |
| `AT-SET-198` | `config:save` | Your setup changes could not be saved. Nothing was changed. Try again. |
| `AT-SET-197` | `setup:finish` | Setup could not be fully turned on. Nothing unsafe was enabled. |
| `AT-PLAN-199` | `plans:get` | Auto Turn-In could not load the lesson-plan list. Open Lesson plans and check the approved folder again. |
| `AT-PLAN-198` | `plans:save` | The lesson-plan list could not be saved. Nothing was submitted. |
| `AT-PLAN-197` | `plans:import` | The saved plan list could not be imported. Choose a list created by Auto Turn-In and try again. |
| `AT-PLAN-196` | `plans:export` | A copy of the lesson-plan list could not be saved. Choose another folder and try again. |
| `AT-CLS-199` | `course:select` | The Classroom could not be selected. Make sure the correct Google account is signed in, then try again. |
| `AT-CLS-198` | `topics:discover` | The Classroom topics could not be read. Open the Classroom again and try once more. |
| `AT-DRV-199` | `drive:select-folder` | The Drive folder could not be selected. Open the exact weekly-plan folder and try again. |
| `AT-DRV-198` | `drive:scan-folder` | The approved Drive folder could not be checked. Nothing was submitted. |
| `AT-PC-199` | `environment:check` | The computer readiness check could not finish. Restart the app and try again. |
| `AT-RUN-199` | `automation:run` | The check could not finish safely. Nothing uncertain was submitted. |
| `AT-AUTO-199` | `automation:set-live` | Automatic turn-in could not be changed. Your previous setting is still in effect. |
| `AT-SCH-199` | `schedule:install` | Windows could not save the automatic check schedule. Try Save schedule again. |
| `AT-SCH-198` | `schedule:remove` | Windows could not pause the automatic checks. Check the schedule again before assuming it is paused. |
| `AT-SCH-197` | `schedule:health` | Auto Turn-In could not confirm the automatic schedule in Windows. |
| `AT-AI-199` | `ai:get-state` | The optional AI settings could not be loaded. Normal Auto Turn-In is unaffected. |
| `AT-AI-198` | `ai:save-settings` | The optional AI settings could not be saved. Normal Auto Turn-In is unaffected. |
| `AT-AI-197` | `ai:open-draft` | The lesson-plan draft could not be opened. |
| `AT-AI-196` | `ai:open-folder` | The lesson-plan drafts folder could not be opened. |
| `AT-AI-192` | `ai:open-provider-setup` | The selected AI service page could not be opened. Open the provider website in the normal browser instead. |
| `AT-AI-195` | `ai:regenerate` | The lesson-plan draft could not be rewritten right now. Nothing was uploaded or submitted. |
| `AT-AI-194` | `ai:approve` | The lesson-plan draft could not be approved safely. Nothing uncertain was submitted. |
| `AT-AI-193` | `ai:dismiss` | The lesson-plan draft could not be dismissed. Try again. |
| `AT-GRD-199` | `grading:get-state` | Local grading status could not be loaded. Normal Auto Turn-In is unaffected. |
| `AT-GRD-198` | `grading:save-settings` | Local grading settings could not be saved. Nothing was published to Classroom. |
| `AT-GRD-197` | `grading:grade` | The local draft grade could not be created safely. Nothing was published to Classroom. |
| `AT-GRD-196` | `grading:discover-classroom` | CATI could not read the selected Classroom assignment list safely. No grades were changed. |
| `AT-GRD-195` | `grading:process-classroom` | CATI could not finish the Classroom draft-grading batch safely. No uncertain grade was written. |
| `AT-GRD-194` | `grading:select-classroom` | The grading Classroom could not be added. Lesson-plan Setup and grades were not changed. |
| `AT-GRD-193` | `grading:remove-classroom` | The grading Classroom could not be removed from the local list. Google Classroom was not changed. |
| `AT-GRD-192` | `grading:select-review-folder` | The private grading review folder could not be selected. No student work was saved by that action. |
| `AT-GRD-191` | `grading:open-review-folder` | Windows could not open the saved private grading review folder. |
| `AT-GRD-190` | `grading:discover-my-classrooms` | GoClassroom could not read your class list. Saved classes and grades were not changed. |
| `AT-RDY-199` | `ready:get-latest` | Ready could not load the last classroom preflight. Run the Ready check again. |
| `AT-RDY-198` | `ready:scan` | Ready could not finish the classroom preflight safely. Nothing was changed in Classroom. |
| `AT-RDY-197` | `ready:export` | The Ready report could not be saved. Run Ready again or choose another folder. |
| `AT-SUP-198` | `diagnostics:cleanup` | Old support files could not be cleaned up. This does not affect automatic turn-in. |
| `AT-SUP-196` | `logs:open` | Windows could not open the Auto Turn-In support folder. |
| `AT-PC-105` | `machine:get` | Auto Turn-In could not read this computer's local role. Restart the app and try again. |
| `AT-PC-106` | `machine:save` | This computer's Auto Turn-In role could not be saved. Your previous setting is still in effect. |
| `AT-SET-108` | `setup:export-portable` | Auto Turn-In could not save a setup copy for another computer. Choose another folder and try again. |
| `AT-SET-109` | `setup:import-portable` | Auto Turn-In could not use that setup file. Nothing unsafe was enabled. |
| `AT-APP-999` | `other IPC action` | Auto Turn-In could not complete that action safely. Nothing uncertain was submitted or changed. |
