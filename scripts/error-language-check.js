const path=require('path');
const fs=require('fs');
const {publicError}=require('../engine/user-errors');

const cases=[
  ["Failed to get 'localAppData' path",'dashboard:get','AT-APP-101'],
  ['ENOSPC: no space left on device','config:save','AT-APP-102'],
  ['EACCES permission denied','config:save','AT-APP-103'],
  ['config.json and its backup could not be read safely.','dashboard:get','AT-DATA-111'],
  ['plans.json and its backup could not be read safely.','plans:get','AT-DATA-112'],
  ['Saved submission history could not be read safely.','automation:run','AT-DATA-113'],
  ['An automatic turn-in check is running right now.','config:save','AT-RUN-102'],
  ['submit-weekly.js took too long to finish and was stopped safely.','automation:run','AT-RUN-103'],
  ['select-course.js took too long to finish and was stopped safely.','course:select','AT-CLS-112'],
  ['discover-topics.js took too long to finish and was stopped safely.','topics:discover','AT-CLS-113'],
  ['The approved Drive folder check took too long and was stopped safely.','automation:run','AT-DRV-107'],
  ['select-drive-folder.js took too long to finish and was stopped safely.','drive:select-folder','AT-DRV-108'],
  ['preflight.js took too long to finish and was stopped safely.','environment:check','AT-PC-104'],
  ['Another Auto Turn-In action is already running. Wait for it to finish, then try again.','drive:select-folder','AT-RUN-102'],
  ['upload-draft-plan.js took too long to finish and was stopped safely.','ai:approve','AT-AI-207'],
  ['Google session expired; accounts.google.com opened.','automation:run','AT-GGL-101'],
  ['Could not open Google Chrome or Microsoft Edge.','environment:check','AT-PC-102'],
  ['Timed out waiting for Classroom selection.','course:select','AT-CLS-103'],
  ['Classroom selection was canceled.','course:select','AT-CLS-114'],
  ['Drive folder selection was closed before a folder was chosen.','drive:select-folder','AT-DRV-109'],
  ['Selected Classroom topic was not exposed as a topic region.','automation:run','AT-CLS-105'],
  ['No matching lesson-plan assignments were found inside selected topic.','automation:run','AT-CLS-106'],
  ['Assignment ID mismatch. Expected 1, got 2.','automation:run','AT-CLS-107'],
  ['Assignment detail title did not verify as Week 8.','automation:run','AT-CLS-108'],
  ['Week 8 due date could not be read clearly.','automation:run','AT-CLS-110'],
  ['More than one matching Week 8 assignment exists.','automation:run','AT-CLS-111'],
  ['Timed out waiting for Drive folder selection.','drive:select-folder','AT-DRV-103'],
  ['Open a specific folder that contains your weekly lesson plans.','drive:select-folder','AT-DRV-104'],
  ['Duplicate plan files map to Week 8.','drive:scan-folder','AT-DRV-105'],
  ['No lesson-plan files matched the plan filename pattern.','drive:scan-folder','AT-DRV-106'],
  ['Week 8 no matching plan is loaded.','automation:run','AT-PLAN-105'],
  ['Choose a valid automatic check time.','config:save','AT-SCH-104'],
  ['Automatic retry timing is invalid. Restore the default retry settings.','config:save','AT-SCH-105'],
  ['Auto Turn-In hit a temporary problem, but Windows could not schedule the automatic retry.','automation:run','AT-SCH-106'],
  ['Maximum plans in one check must be between 1 and 20.','config:save','AT-SET-106'],
  ['Week range must stay between Week 1 and Week 52.','config:save','AT-SET-107'],
  ['Week 8 has an unexpected attachment in Your work.','automation:run','AT-ATT-101'],
  ['Could not verify the Your work attachment area.','automation:run','AT-ATT-102'],
  ['Could not find Add or create.','automation:run','AT-ATT-103'],
  ['Exact plan did not appear inside Your work.','automation:run','AT-ATT-104'],
  ['Could not find Turn in or Mark as done button.','automation:run','AT-SUB-101'],
  ['Classroom did not show a positive Turned in/Submitted state after reload.','automation:run','AT-SUB-102'],
  ['STATE_CONFLICT between saved history and Classroom.','automation:run','AT-SUB-103'],
  ['Current setup does not have a valid dry-run safety certificate.','automation:run','AT-SAFE-101'],
  ['Windows secure storage is not available, so the saved Groq private key cannot be opened safely.','ai:get-state','AT-AI-201'],
  ['That Google Gemini Free private key looks incomplete.','ai:save-settings','AT-AI-202'],
  ['Groq Free draft request failed: free-service limit reached.','ai:regenerate','AT-AI-203'],
  ['OpenRouter Free returned a lesson-plan draft that could not be read safely.','ai:regenerate','AT-AI-204'],
  ['That AI draft no longer exists.','ai:open-draft','AT-AI-205'],
  ['Google Drive accepted the upload, but Week 8 could not be verified.','ai:approve','AT-AI-206'],
  ['This write-enabled batch does not have a current one-time teacher confirmation. Preview mode remains available.','grading:process-classroom','AT-GRD-206'],
  ['Another Classroom grading batch is already running. Wait for it to finish before starting another batch.','grading:process-classroom','AT-GRD-207'],
  ['The selected grading assignment does not belong to the Classroom configured in Setup.','grading:process-classroom','AT-GRD-208'],
  ['PowerShell exited 1','schedule:install','AT-SCH-101'],
  ['PowerShell exited 1','schedule:remove','AT-SCH-102'],
  ['PowerShell exited 1','schedule:health','AT-SCH-103'],
  ["This computer's Auto Turn-In identity could not be read safely.",'machine:get','AT-PC-105'],
  ['This computer is set to manual only.','schedule:install','AT-SCH-107'],
  ['anything unexpected','machine:save','AT-PC-106'],
  ['anything unexpected','setup:export-portable','AT-SET-108'],
  ['That file is not a valid Auto Turn-In setup file.','setup:import-portable','AT-SET-109']
];
for(const [raw,op,expected] of cases){
  const got=publicError(raw,op);
  if(got.code!==expected)throw new Error(`${op}: expected ${expected}, got ${got.code} for ${raw}`);
  if(!got.message||got.message.length<12)throw new Error(`${got.code} has an unhelpful public message`);
}

const catalog=fs.readFileSync(path.join(__dirname,'../engine/user-errors.js'),'utf8');
const banned=/\b(?:IPC|JSON|regex|regular expression|PowerShell|Task Scheduler|localAppData|userData|exit code|fingerprint|course ID|assignment ID|stream ID|stdout|stderr|schema)\b/i;
for(const m of catalog.matchAll(/return \['(AT-[A-Z0-9-]+)',`?([^'`\n]+)[`']\];/g)){
  if(banned.test(m[2]))throw new Error(`${m[1]} exposes developer language: ${m[2]}`);
}
console.log(`Teacher error-language checks passed: ${cases.length} precise support-code cases.`);
