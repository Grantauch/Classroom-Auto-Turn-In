function text(err){return String(err?.message||err||'').replace(/\s+/g,' ').trim();}
function weekOf(s){const m=String(s).match(/\bWeek\s+(\d{1,2})\b/i);return m?Number(m[1]):null;}

const FALLBACK={
  'dashboard:get':['AT-HOME-101','Auto Turn-In could not load the Home status. Close and reopen the app. If this happens again, open Help & support and copy the support summary.'],
  'config:get':['AT-SET-101','Auto Turn-In could not load your saved setup. Restart the app. If this happens again, open Help & support.'],
  'config:save':['AT-SET-102','Your setup changes could not be saved. Nothing was changed. Try again, then open Help & support if it still fails.'],
  'setup:finish':['AT-SET-104','Setup could not be fully turned on. Nothing unsafe was enabled. Review the item marked for attention and try again.'],
  'plans:get':['AT-PLAN-101','Auto Turn-In could not load the saved lesson-plan list. Open Lesson plans and check the approved Drive folder again.'],
  'plans:save':['AT-PLAN-102','The lesson-plan list could not be saved. Nothing was submitted. Check the entries and try again.'],
  'plans:import':['AT-PLAN-103','The plan list could not be imported. Make sure you selected a plan-list file created by Auto Turn-In, then try again.'],
  'plans:export':['AT-PLAN-104','The plan list could not be exported to the location you chose. Pick another folder and try again.'],
  'course:select':['AT-CLS-101','The Classroom could not be selected. Make sure you are signed into the correct Google account, then try Choose Classroom again.'],
  'topics:discover':['AT-CLS-102','Auto Turn-In could not read the assignment topics in the selected Classroom. Open the Classroom again and make sure you are signed in.'],
  'drive:select-folder':['AT-DRV-101','The Drive folder could not be selected. Open the exact folder that holds the weekly plans, then choose it again.'],
  'drive:scan-folder':['AT-DRV-102','Auto Turn-In could not check the approved Drive folder. Nothing was submitted. Make sure Google Drive opens correctly and try Check folder again.'],
  'environment:check':['AT-PC-101','Auto Turn-In could not finish the computer readiness check. Restart the app and try Check again.'],
  'automation:run':['AT-RUN-101','The check could not finish safely. Nothing uncertain was submitted. Open Help & support to see the recommended next step.'],
  'automation:set-live':['AT-AUTO-101','Automatic turn-in could not be changed. Your previous setting is still in effect. Review Setup and try again.'],
  'schedule:install':['AT-SCH-101','Windows could not save the automatic check schedule. Automatic checks may not run until this is fixed. Try Save schedule again.'],
  'schedule:remove':['AT-SCH-102','Windows could not pause the automatic checks. Check the schedule again before assuming it is paused.'],
  'schedule:health':['AT-SCH-103','Auto Turn-In could not confirm the automatic schedule in Windows. Open Automatic turn-in and save the schedule again.'],
  'ai:get-state':['AT-AI-101','The optional AI settings could not be loaded. Normal Auto Turn-In is unaffected.'],
  'ai:save-settings':['AT-AI-102','The optional AI settings could not be saved. Normal Auto Turn-In is unaffected.'],
  'ai:open-draft':['AT-AI-103','The lesson-plan draft could not be opened. It may have been moved or deleted.'],
  'ai:open-folder':['AT-AI-104','The lesson-plan drafts folder could not be opened.'],
  'ai:regenerate':['AT-AI-105','The lesson-plan draft could not be rewritten right now. Nothing was uploaded or submitted.'],
  'ai:approve':['AT-AI-106','The lesson-plan draft could not be approved and uploaded safely. Nothing uncertain was submitted.'],
  'ai:dismiss':['AT-AI-107','The lesson-plan draft could not be dismissed. Try again.'],
  'grading:get-state':['AT-GRD-101','Local grading status could not be loaded. Normal Auto Turn-In is unaffected.'],
  'grading:save-settings':['AT-GRD-102','Local grading settings could not be saved. Nothing was published to Classroom.'],
  'grading:grade':['AT-GRD-103','The local draft grade could not be created safely. Nothing was written to Classroom.'],
  'grading:discover-classroom':['AT-GRD-104','CATI could not read the selected Classroom assignment list safely. No grades were changed.'],
  'grading:discover-my-classrooms':['AT-GRD-190','GoClassroom could not read your class list. Your saved classes and grades were not changed.'],
  'grading:process-classroom':['AT-GRD-105','CATI could not finish the Classroom draft-grading batch safely. No uncertain grade was written.'],
  'diagnostics:cleanup':['AT-SUP-102','Old support files could not be cleaned up. This does not affect automatic turn-in.'],
  'logs:open':['AT-SUP-104','Windows could not open the Auto Turn-In support folder.'],
  'machine:get':['AT-PC-105',"Auto Turn-In could not read this computer\'s local role. Restart the app and try again."],
  'machine:save':['AT-PC-106',"This computer\'s Auto Turn-In role could not be saved. Your previous setting is still in effect."],
  'setup:export-portable':['AT-SET-108','Auto Turn-In could not save a setup copy for another computer. Choose another folder and try again.'],
  'setup:import-portable':['AT-SET-109','Auto Turn-In could not use that setup file. Nothing unsafe was enabled.']
};

function classify(err,operation=''){
  const raw=text(err),s=raw.toLowerCase(),week=weekOf(raw),w=week?`Week ${week}`:'This week';
  if(/failed to get ['\"]?localappdata|failed to get ['\"]?userdata|user data path|localappdata/.test(s))
    return ['AT-APP-101','Auto Turn-In could not open its local settings folder. Restart the app. If this happens again, open Help & support and copy the support summary.'];
  if(/enospc|no space left|disk.*full/.test(s))
    return ['AT-APP-102','This computer is out of free storage space. Auto Turn-In could not safely save its information. Free some space, then reopen the app.'];
  if(/eacces|eperm|permission denied|access is denied|operation not permitted/.test(s))
    return ['AT-APP-103','Windows blocked Auto Turn-In from saving or opening a required local file. Restart the app. If it continues, ask school technology support to allow the app to use its local data folder.'];
  if(/^ai:/.test(operation)&&/windows secure storage|(?:api|private) key.*decrypt|(?:api|private) key.*(?:read|opened?) safely|saved .*private key.*could not be (?:opened|decrypted)|saved ai connection file/.test(s))
    return ['AT-AI-201','Windows could not safely open a saved AI connection. Normal Auto Turn-In is unaffected. Remove that connection and enter its private key again if you want to use AI recovery.'];
  if(/^ai:/.test(operation)&&/ai returned|draft week mismatch|did not contain any course plans|lesson-plan draft.*could not be read safely|returned no lesson-plan text/.test(s)&&/ai|openai|groq|gemini|openrouter|draft/.test(s))
    return ['AT-AI-204','The optional AI draft came back in an unexpected format, so Auto Turn-In rejected it. Nothing was uploaded or submitted. Try Regenerate once.'];
  if(/^grading:/.test(operation)&&/could not reach ollama|ollama returned http|local ollama grading timed out|local ollama grading failed/.test(s))
    return ['AT-GRD-201','CATI could not use Ollama on this computer. Make sure Ollama is running and the selected local model is installed. No uncertain grade was written to Classroom.'];
  if(/^grading:/.test(operation)&&/grading data that could not be read safely|grading result failed cati validation|ollama returned no grading response/.test(s))
    return ['AT-GRD-202','The local model returned a grading result CATI could not validate, so CATI rejected it. No uncertain grade was written to Classroom.'];
  if(/^grading:/.test(operation)&&/local grading is off/.test(s))
    return ['AT-GRD-203','Local grading is off. Turn it on before creating a draft grade.'];
  if(operation==='grading:process-classroom'&&/one-time teacher confirmation/.test(s))
    return ['AT-GRD-206','That draft-write confirmation is missing or has expired. Start a new batch and confirm it again. No grade was changed.'];
  if(operation==='grading:process-classroom'&&/another classroom grading batch is already running/.test(s))
    return ['AT-GRD-207','Another Classroom grading batch is already running. Wait for it to finish before starting another batch.'];
  if(/^grading:/.test(operation)&&/does not belong to the classroom configured in setup|did not match the classroom configured in setup|saved grading classrooms|did not match the selected grading classroom/.test(s))
    return ['AT-GRD-208','The selected assignment does not match a saved grading Classroom. Choose the class and find its assignments again before grading.'];
  if(operation==='grading:select-classroom')return ['AT-GRD-194','The grading Classroom could not be added. Your lesson-plan setup and Classroom grades were not changed.'];
  if(operation==='grading:remove-classroom')return ['AT-GRD-193','The grading Classroom could not be removed from the local list. Nothing was changed in Google Classroom.'];
  if(operation==='grading:select-review-folder')return ['AT-GRD-192','The private grading review folder could not be selected. No student work was saved by this action.'];
  if(operation==='grading:open-review-folder')return ['AT-GRD-191','Windows could not open the private grading review folder. Choose the folder again if it moved.'];
  if(/config\.json|saved auto turn-in settings are damaged/.test(s)&&/could not be read|damaged|data_corrupt/.test(s))
    return ['AT-DATA-111','Your saved Auto Turn-In setup could not be read safely. Automatic turn-in is paused. Open Help & support and copy the support summary before changing the setup.'];
  if(/plans\.json|saved lesson-plan list/.test(s)&&/could not be read|damaged|data_corrupt/.test(s))
    return ['AT-DATA-112','Your saved lesson-plan list could not be read safely. Nothing was submitted. Open Lesson plans and check the approved Drive folder again.'];
  if(/state\.json|saved submission history/.test(s)&&/could not be read|damaged|data_corrupt/.test(s))
    return ['AT-DATA-113','Auto Turn-In could not safely read its record of earlier submissions. Automatic turn-in is paused to prevent a duplicate submission. Open Help & support before turning it back on.'];
  if(/machine_data_corrupt|computer.*identity.*could not be read|computer.*identity needs attention/.test(s))
    return ['AT-PC-105','This computer’s Auto Turn-In identity could not be read safely. Automatic checks are paused. Open Automatic turn-in and save this computer again.'];
  if(/data_corrupt|could not be read safely/.test(s))
    return ['AT-DATA-101','Saved Auto Turn-In information could not be read safely, so automatic submission is paused. Open Help & support before turning it back on.'];
  if(/already active|already running|running right now|run_locked|automatic turn-in check is running/.test(s))
    return ['AT-RUN-102','A check is already running. Wait for it to finish, then try this action again.'];
  if(/approved drive folder check took too long/.test(s))
    return ['AT-DRV-107','Checking the approved Drive folder took too long, so Auto Turn-In stopped that check safely. Nothing uncertain was submitted. Try Check folder once more; if it repeats, open Help & support.'];
  if(/took too long to finish and was stopped safely/.test(s)){
    const timed={
      'automation:run':['AT-RUN-103','The Auto Turn-In check took too long, so it was stopped safely. Nothing uncertain was submitted. Try Check now once; if it repeats, open Help & support.'],
      'course:select':['AT-CLS-112','Classroom selection was open too long and was closed safely. No Classroom was changed. Try Choose Classroom again when you are ready.'],
      'topics:discover':['AT-CLS-113','Reading the Classroom topics took too long and was stopped safely. Nothing was submitted. Make sure Classroom loads normally, then try again.'],
      'drive:select-folder':['AT-DRV-108','Drive folder selection was open too long and was closed safely. No folder was changed. Try Choose folder again when you are ready.'],
      'drive:scan-folder':['AT-DRV-107','Checking the approved Drive folder took too long, so Auto Turn-In stopped that check safely. Nothing uncertain was submitted. Try Check folder once more; if it repeats, open Help & support.'],
      'environment:check':['AT-PC-104','The computer readiness check took too long. Restart Auto Turn-In and try Check again.'],
      'ai:approve':['AT-AI-207','The optional AI draft upload took too long and was stopped safely. Nothing uncertain was submitted. Check the approved Drive folder before trying again.'],
      'grading:discover-classroom':['AT-GRD-204','Reading the Classroom assignment list took too long and was stopped safely. No grades were changed.'],
      'grading:process-classroom':['AT-GRD-205','The Classroom draft-grading batch took too long and was stopped safely. No uncertain grade was written.']
    };
    return timed[operation]||['AT-APP-104','That action took too long and was stopped safely. Try it once more, then open Help & support if it repeats.'];
  }
  if(/accounts\.google\.com|session expired|sign[ -]?in|choose an account/.test(s))
    return ['AT-GGL-101','Google needs you to sign in again. Nothing was submitted. Open Setup, choose the correct work account, and try again.'];
  if(/set to manual only/.test(s))
    return ['AT-SCH-107','This computer is set to Manual only, so it will not run automatic checks. Choose Main computer or Backup computer before saving a schedule.'];
  if(/no supported browser|could not open google chrome or microsoft edge/.test(s))
    return ['AT-PC-102','Auto Turn-In could not open Google Chrome or Microsoft Edge. Make sure one of those browsers is installed and close any Auto Turn-In browser window that may still be open.'];
  if(/profile.*writable|cannot save its google sign-in|local google sign-in/.test(s))
    return ['AT-PC-103','Auto Turn-In cannot save its Google sign-in on this computer. Restart the app. If it continues, school technology support may need to allow the app to save local browser information.'];
  if(/timed out waiting for classroom selection/.test(s))
    return ['AT-CLS-103','Classroom selection timed out. No Classroom was changed. Try Choose Classroom again when you are ready.'];
  if(/classroom selection was (?:canceled|closed)/.test(s))
    return ['AT-CLS-114','Classroom selection was canceled. No Classroom was changed. Try Choose Classroom again when you are ready.'];
  if(/open the classroom itself|not.*google classroom course|no classroom course is configured/.test(s))
    return ['AT-CLS-104','Auto Turn-In does not have a valid Classroom selected. Open Setup and choose the Classroom that receives the weekly lesson plans.'];
  if(/topic region|selected classroom topic|more than one topic region/.test(s))
    return ['AT-CLS-105','Auto Turn-In could not uniquely identify the lesson-plan topic in Classroom. Nothing was submitted. Open Setup and choose the topic again.'];
  if(/no matching lesson-plan assignments/.test(s))
    return ['AT-CLS-106','No weekly lesson-plan assignment matched inside the selected Classroom topic. Check the topic and the assignment naming example in Setup.'];
  if(/assignment detail.*mismatch|assignment id mismatch|does not expose a classroom assignment id|course id/.test(s))
    return ['AT-CLS-107','The assignment that opened did not match the Classroom and assignment Auto Turn-In expected. Nothing was submitted. Open Setup and choose the Classroom again before retrying.'];
  if(/assignment detail title did not verify|assignment title pattern is invalid/.test(s))
    return ['AT-CLS-108',`${w} did not match the assignment naming setup. Nothing was submitted. Check the assignment example in Setup.`];
  if(/assignment detail page could not be opened|assignment_open_failed/.test(s))
    return ['AT-CLS-109',`${w}'s Classroom assignment could not be opened safely. Nothing was submitted. Run Safety Check again. If it still stops, use Open support files to share the newest log and screenshot.`];
  if(/due_date_unknown|due date could not|could not read.*due date|due date.*unclear/.test(s))
    return ['AT-CLS-110',`${w}'s Classroom due date could not be read clearly. Nothing was submitted. Check that assignment's due date in Classroom, then try again.`];
  if(/more than one matching week .* assignment|duplicate.*assignment/.test(s))
    return ['AT-CLS-111',`${w} has more than one matching Classroom assignment. Nothing was submitted. Remove or rename the duplicate assignment, then check again.`];
  if(/timed out waiting for drive folder selection/.test(s))
    return ['AT-DRV-103','Drive folder selection timed out. No folder was changed. Try Choose folder again when you are ready.'];
  if(/drive folder selection was (?:canceled|closed)/.test(s))
    return ['AT-DRV-109','Drive folder selection was canceled. No folder was changed. Try Choose folder again when you are ready.'];
  if(/selected page is not google drive|open a specific folder|drive folder first|selected plan location must be a specific google drive folder/.test(s))
    return ['AT-DRV-104','Auto Turn-In needs one specific Google Drive folder for weekly plans. Open that folder, not My Drive, and choose it again.'];
  if(/duplicate plan files|more than one matching file|exactly one plan is allowed/.test(s))
    return ['AT-DRV-105',`${w} has more than one matching lesson-plan file in the approved Drive folder. Nothing was submitted. Keep only one matching file for that week.`];
  if(/no lesson-plan files matched|no usable lesson-plan list/.test(s))
    return ['AT-DRV-106','No weekly lesson-plan files matched in the approved Drive folder. Check the folder and the filename example in Setup, then check the folder again.'];
  if(/missing_plan|no matching plan|no matching plan is loaded|no plan mapping exists/.test(s))
    return ['AT-PLAN-105',`${w}'s Classroom assignment is ready, but the matching lesson-plan file was not found in the approved Drive folder. Nothing was submitted.`];
  if(/valid automatic check time|choose at least one.*check day|choose at least one schedule day/.test(s))
    return ['AT-SCH-104','The automatic schedule is missing a valid time or day. Choose at least one day and a valid check time, then save the schedule again.'];
  if(/automatic retry timing is invalid/.test(s))
    return ['AT-SCH-105','The automatic retry timing is not valid. Save the automatic schedule again to restore the standard retry timing.'];
  if(/maximum plans in one check/.test(s))
    return ['AT-SET-106','Maximum plans in one check must be a whole number from 1 to 20.'];
  if(/week range must stay/.test(s))
    return ['AT-SET-107','The allowed week range must stay between Week 1 and Week 52.'];
  if(/must link to a google docs|google drive file, not a folder|unrelated page/.test(s))
    return ['AT-PLAN-107','One manually added lesson plan does not point to a Google Drive file. Open Lesson plans, correct that Drive link, and save again.'];
  if(/naming rule|regular expression|capture group|pattern is invalid/.test(s))
    return ['AT-SET-105','The advanced naming rule cannot be used. Use the simple assignment and filename examples in Setup, or restore the default advanced rule.'];
  if(/unexpected_attachment|unexpected attachment/.test(s))
    return ['AT-ATT-101',`${w} already has another attachment in Your work. Nothing was submitted. Remove the unexpected attachment in Classroom, then try again.`];
  if(/your work attachment area|could not verify the your work/.test(s))
    return ['AT-ATT-102',`${w}'s Your work area could not be verified. Nothing was submitted. Open the assignment manually and make sure Your work loads normally.`];
  if(/add or create/.test(s)&&/could not find|could not choose|link was not found/.test(s))
    return ['AT-ATT-103',`${w}'s Add or create controls could not be found in Classroom. Nothing was submitted. Classroom may have changed its layout; try again once, then use Help & support if it repeats.`];
  if(/link-entry dialog|confirm add link|exact plan.*did not appear/.test(s))
    return ['AT-ATT-104',`${w}'s lesson plan could not be verified after attaching it. Nothing was submitted. Check the assignment manually before trying again.`];
  if(/confirmation dialog appeared|turn in or mark as done|submission button/.test(s))
    return ['AT-SUB-101',`${w}'s final Turn in control could not be verified. Nothing was recorded as submitted. Open the assignment manually and check its current state.`];
  if(/still shows .* after reload|positive turned in\/submitted state|did not show a positive/.test(s))
    return ['AT-SUB-102',`${w} was clicked for turn-in, but Classroom did not confirm the submission after reloading. Auto Turn-In did not record success. Check the assignment manually before running it again.`];
  if(/state_unconfirmed|state_conflict|prior local record|locally confirmed/.test(s))
    return ['AT-SUB-103',`${w}'s saved history and Classroom do not agree. Auto Turn-In stopped instead of guessing. Check the assignment manually, then open Help & support if the warning remains.`];
  if(/safety certificate|dry-run safety|run the safety check|safety test|safety check did not verify/.test(s))
    return ['AT-SAFE-101','The current setup has not passed a Safety Check. Automatic submission remains off. Run the Safety Check again after confirming the Classroom, topic, and Drive folder.'];
  if(/windows secure storage|(?:api|private) key.*decrypt|(?:api|private) key.*(?:read|opened?) safely|saved .*private key.*could not be (?:opened|decrypted)|saved ai connection file/.test(s))
    return ['AT-AI-201','Windows could not safely open a saved AI connection. Normal Auto Turn-In is unaffected. Remove that connection and enter its private key again if you want to use AI recovery.'];
  if(/(?:api|private) key.*not configured|private key looks incomplete|connect .* before turning on|is not connected/.test(s))
    return ['AT-AI-202','Optional AI recovery needs a valid connection to the selected AI service. Normal Auto Turn-In is unaffected.'];
  if(/ai drafting.*timed out|drafting could not reach|draft request failed|no connected ai service could create/.test(s))
    return ['AT-AI-203','The selected AI service could not create the missing-plan draft right now. Nothing was uploaded or submitted. Check the internet connection or free-service limit and try again later.'];
  if(/ai returned|draft week mismatch|did not contain any course plans|lesson-plan draft.*could not be read safely|returned no lesson-plan text/.test(s)&&/ai|openai|groq|gemini|openrouter|draft/.test(s))
    return ['AT-AI-204','The optional AI draft came back in an unexpected format, so Auto Turn-In rejected it. Nothing was uploaded or submitted. Try Regenerate once.'];
  if(/draft.*no longer exists|draft file could not be found/.test(s))
    return ['AT-AI-205','That lesson-plan draft is no longer available on this computer. Dismiss it and create a new draft if needed.'];
  if(/google drive accepted the upload.*could not be verified/.test(s))
    return ['AT-AI-206',`${w}'s AI draft appears to have uploaded, but Auto Turn-In could not verify it in the approved Drive folder. Nothing will be submitted until the folder can be verified.`];
  if(/could not schedule the automatic retry|retry_schedule_failed/.test(s))
    return ['AT-SCH-106','A temporary problem occurred, but Windows could not schedule the automatic retry. Open Automatic turn-in and save the schedule again, then use Check now if needed.'];
  if(/windows took too long|powershell|task scheduler|automatic schedule/.test(s)){
    const fb=FALLBACK[operation]||FALLBACK['schedule:health'];return fb;
  }
  if(/json|unexpected token|csv/.test(s)&&/^plans:/.test(operation))
    return ['AT-PLAN-106','The selected plan-list file could not be read. Use a plan-list file exported by Auto Turn-In, then try again.'];
  return FALLBACK[operation]||['AT-APP-999','Auto Turn-In could not complete that action safely. Nothing uncertain was submitted or changed. Try the action once more, then open Help & support if it repeats.'];
}

function publicError(err,operation=''){
  const [code,message]=classify(err,operation);return {code,message,technical:text(err)};
}
function encodePublicError(err,operation=''){
  const p=publicError(err,operation);return `CATI_UI|${p.code}|${p.message}`;
}
module.exports={publicError,encodePublicError};
