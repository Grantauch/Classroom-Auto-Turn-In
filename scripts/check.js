const fs=require('fs'),path=require('path'),cp=require('child_process'),os=require('os');
const root=path.join(__dirname,'..');
const files=['main.js','preload.js','renderer/app.js','main-services/local-data.js','main-services/engine-runner.js','main-services/ai-service.js','main-services/grading-service.js','main-services/scheduler-service.js','engine/app-config.js','engine/json-store.js','engine/protocol.js','engine/classroom-actions.js','engine/classroom-discovery.js','engine/lib.js','engine/safety.js','engine/browser.js','engine/classroom-picker.js','engine/drive-picker.js','engine/preflight.js','engine/submit-weekly.js','engine/select-course.js','engine/select-grading-course.js','engine/discover-topics.js','engine/select-drive-folder.js','engine/scan-drive-folder.js','engine/scheduler.js','engine/dom-helpers.js','engine/validation.js','engine/ai-recovery.js','engine/grading.js','engine/docx-writer.js','engine/upload-draft-plan.js','engine/retry-policy.js','engine/browser-mode.js','engine/page-evidence.js'];
for(const f of files){const p=path.join(root,f);if(!fs.existsSync(p))throw new Error(`Missing ${f}`);cp.execFileSync(process.execPath,['--check',p],{stdio:'inherit'});}

// Git may materialize text as LF or CRLF depending on checkout settings.
// Normalize before source-shape assertions so the release gate verifies content,
// not the operating system's line-ending convention.
const mainSource=fs.readFileSync(path.join(root,'main.js'),'utf8').replace(/\r\n?/g,'\n');
const schedulerSource=fs.readFileSync(path.join(root,'engine/scheduler.js'),'utf8');
const domSource=fs.readFileSync(path.join(root,'engine/dom-helpers.js'),'utf8');
const libSource=fs.readFileSync(path.join(root,'engine/lib.js'),'utf8');
const appConfigSource=fs.readFileSync(path.join(root,'engine/app-config.js'),'utf8');
const jsonStoreSource=fs.readFileSync(path.join(root,'engine/json-store.js'),'utf8');
const protocolSource=fs.readFileSync(path.join(root,'engine/protocol.js'),'utf8');
const actionSource=fs.readFileSync(path.join(root,'engine/classroom-actions.js'),'utf8');
const discoverySource=fs.readFileSync(path.join(root,'engine/classroom-discovery.js'),'utf8');
const localDataSource=fs.readFileSync(path.join(root,'main-services/local-data.js'),'utf8');
const aiServiceSource=fs.readFileSync(path.join(root,'main-services/ai-service.js'),'utf8');
const gradingServiceSource=fs.readFileSync(path.join(root,'main-services/grading-service.js'),'utf8');
const gradingConfirmationSource=fs.readFileSync(path.join(root,'main-services/grading-confirmation.js'),'utf8');
const gradingSource=fs.readFileSync(path.join(root,'engine/grading.js'),'utf8');
const schedulerServiceSource=fs.readFileSync(path.join(root,'main-services/scheduler-service.js'),'utf8');
const runnerSource=fs.readFileSync(path.join(root,'main-services/engine-runner.js'),'utf8');
if(!mainSource.includes('const exitCode=await runBackgroundAutomation()'))throw new Error('Background scheduler wrapper is missing');
if(!mainSource.includes('app.exit(exitCode)'))throw new Error('Background scheduler does not propagate its exit code');
if(!mainSource.includes('Scheduled background attempt'))throw new Error('Background scheduler failure logging is missing');
if(/try\s*\{\s*await runAutomation\(false\)\s*\}\s*catch\s*\{\s*\}/.test(mainSource))throw new Error('Silent background automation catch has returned');
if(!schedulerServiceSource.includes('getScheduleHealth'))throw new Error('Real Task Scheduler health query is missing');
if(!appConfigSource.includes('retryMinutes:[15,30]'))throw new Error('Default +15/+30 retry offsets are missing');
if(!schedulerServiceSource.includes('scheduleRetryTask')||!schedulerServiceSource.includes('New-ScheduledTaskTrigger -Once'))throw new Error('Conditional one-time retry scheduling is missing');
if(!schedulerSource.includes('retryTargetsFrom')||!schedulerSource.includes('base.getTime()+offset*60000'))throw new Error('Retry target calculation is missing');
if(!mainSource.includes('showRunNotification'))throw new Error('Windows run notifications are missing');
const testData=fs.mkdtempSync(path.join(os.tmpdir(),'cati-v071-check-'));
process.env.CATI_DATA_DIR=testData;
const {defaultConfig,parseClassroomDueDate,assignmentEligibility,loadState,saveState,acquireRunLock,releaseRunLock,cleanupDiagnostics}=require(path.join(root,'engine/lib.js'));

const {computeSafetyFingerprint,assertUniquePlans,parseClassroomIds,extractGoogleFileId,isClassroomCourseUrl,isDriveFolderUrl,isGooglePlanFileUrl,normalizeState,stateKey}=require(path.join(root,'engine/safety.js'));
const {hasCaptureGroup,validateWeekPattern,validateConfig,validatePlanList}=require(path.join(root,'engine/validation.js'));
const {classroomCourseId,classroomDisplayName}=require(path.join(root,'engine/classroom-picker.js'));
const {driveFolderId,driveFolderDisplayName}=require(path.join(root,'engine/drive-picker.js'));
if(classroomCourseId('https://classroom.google.com/c/COURSE1/sp/TEACHER/all/default')!=='COURSE1')throw new Error('Classroom picker rejected a current course-work URL');
if(classroomCourseId('https://classroom.google.com/u/0/c/COURSE2')!=='COURSE2')throw new Error('Classroom picker rejected an account-scoped course URL');
if(classroomCourseId('https://drive.google.com/drive/folders/COURSE1'))throw new Error('Classroom picker accepted a non-Classroom URL');
if(classroomDisplayName({title:'Your work in 26/27 - EAJ Staff - Google Classroom',heading:'Grant Auch'})!=='26/27 - EAJ Staff')throw new Error('Classroom picker saved the teacher heading instead of the course name');
if(driveFolderId('https://drive.google.com/drive/u/0/folders/FOLDER1')!=='FOLDER1')throw new Error('Drive picker rejected an account-scoped folder URL');
if(driveFolderId('https://drive.google.com/drive/my-drive'))throw new Error('Drive picker accepted My Drive instead of one specific folder');
if(driveFolderDisplayName({title:'Weekly Plans - Google Drive'})!=='Weekly Plans')throw new Error('Drive picker did not clean the folder display name');
const cfgA={...defaultConfig(),courseUrl:'https://classroom.google.com/c/COURSE1',topicName:'Lesson Plans',driveFolderUrl:'https://drive.google.com/drive/folders/FOLDER1'};
const plansA=[{week:5,weekOf:'2026-09-14',title:'Week 05 - Lesson Plans',url:'https://docs.google.com/document/d/FILE12345678901234567890/edit'}];
const fp1=computeSafetyFingerprint(cfgA,plansA);
const fp2=computeSafetyFingerprint({...cfgA,topicName:'Different Topic'},plansA);
if(fp1===fp2)throw new Error('Safety fingerprint did not change after a protected configuration change');
const fp3=computeSafetyFingerprint(cfgA,[{...plansA[0],source:'manual',title:'Week 05 - Lesson Plans revised'}]);
if(fp1===fp3)throw new Error('Safety fingerprint did not change after a manual plan change');
const driveA=[{...plansA[0],source:'drive-folder'}];
const driveB=[...driveA,{week:6,title:'Week 06 - Lesson Plans',url:'https://docs.google.com/document/d/FILE22345678901234567890/edit',source:'drive-folder'}];
if(computeSafetyFingerprint(cfgA,driveA)!==computeSafetyFingerprint(cfgA,driveB))throw new Error('Adding a plan inside the approved Drive folder incorrectly invalidates the trusted-folder fingerprint');
let dupBlocked=false;try{assertUniquePlans([plansA[0],{...plansA[0],url:'https://docs.google.com/document/d/OTHERFILE123456789012345/edit'}])}catch{dupBlocked=true}
if(!dupBlocked)throw new Error('Duplicate week plans were not rejected');
const ids=parseClassroomIds('https://classroom.google.com/u/0/c/COURSE1/a/ASSIGNMENT9/details');
if(ids.courseId!=='COURSE1'||ids.assignmentId!=='ASSIGNMENT9')throw new Error('Classroom ID parser failed');
if(extractGoogleFileId('https://docs.google.com/document/d/FILE123/edit')!=='FILE123')throw new Error('Google file ID parser failed');
if(!isClassroomCourseUrl('https://classroom.google.com/c/COURSE1'))throw new Error('Valid Classroom course URL was rejected');
if(isClassroomCourseUrl('https://drive.google.com/drive/folders/FOLDER1'))throw new Error('Non-Classroom URL was accepted as a Classroom course');
if(!isDriveFolderUrl('https://drive.google.com/drive/u/0/folders/FOLDER123'))throw new Error('Valid Drive folder URL was rejected');
if(isDriveFolderUrl('https://docs.google.com/document/d/FILE123/edit'))throw new Error('Document URL was accepted as a Drive folder');
if(!isGooglePlanFileUrl('https://docs.google.com/document/d/FILE123/edit'))throw new Error('Google Docs plan URL was rejected');
if(!isGooglePlanFileUrl('https://drive.google.com/file/d/FILE123/view'))throw new Error('Google Drive file plan URL was rejected');
if(isGooglePlanFileUrl('https://drive.google.com/drive/folders/FOLDER123'))throw new Error('Drive folder was incorrectly accepted as a lesson-plan file');
if(!hasCaptureGroup('Week (\\d+)'))throw new Error('Capture-group validation rejected a normal week pattern');
if(hasCaptureGroup('Week \\d+'))throw new Error('Capture-group validation accepted a pattern with no week capture');
let noCaptureBlocked=false;try{validateWeekPattern('Week \\d+','Test rule')}catch{noCaptureBlocked=true}if(!noCaptureBlocked)throw new Error('Naming rule without a week capture group was not blocked');
let folderPlanBlocked=false;try{validatePlanList([{week:5,title:'Week 5',url:'https://drive.google.com/drive/folders/FOLDER123'}])}catch{folderPlanBlocked=true}if(!folderPlanBlocked)throw new Error('Drive folder URL was accepted as a plan file');
if(stateKey('COURSE1','ASSIGNMENT9')!=='COURSE1:ASSIGNMENT9')throw new Error('Assignment state key failed');
const migrated=normalizeState({submittedWeeks:{5:{confirmed:true}}});
if(!migrated.legacySubmittedWeeks['5']||!migrated.submissions)throw new Error('Legacy state migration failed');

// Atomic state + backup recovery.
saveState({schemaVersion:3,submissions:{first:{confirmed:true}},runHistory:[]});
saveState({schemaVersion:3,submissions:{first:{confirmed:true},second:{confirmed:true}},runHistory:[]});
if(!fs.existsSync(path.join(testData,'state.json.bak')))throw new Error('State backup was not created');
fs.writeFileSync(path.join(testData,'state.json'),'{broken json');
const recovered=loadState();
if(!recovered.submissions?.first||!recovered.submissions?.second)throw new Error('State backup recovery did not restore the latest committed history');

// Cross-process-style lock semantics in one process.
const l1=acquireRunLock({staleMinutes:45});
let lockBlocked=false,blockedLock;try{blockedLock=acquireRunLock({staleMinutes:45})}catch(e){lockBlocked=e.code==='RUN_LOCKED'}
if(!lockBlocked)throw new Error('Second automation run was not blocked by run lock');
// A contender that never acquired a token must not be able to release the owner lock.
releaseRunLock(blockedLock);
if(!fs.existsSync(path.join(testData,'automation.lock')))throw new Error('Blocked contender deleted the active run lock');
releaseRunLock(l1);
const l2=acquireRunLock({staleMinutes:45});releaseRunLock(l2);
const fakeLock={pid:99999999,startedAt:new Date().toISOString(),token:'dead-process'};fs.writeFileSync(path.join(testData,'automation.lock'),JSON.stringify(fakeLock));
const l3=acquireRunLock({staleMinutes:45});releaseRunLock(l3);

// Diagnostics retention removes only expired files.
const logDir=path.join(testData,'logs');fs.mkdirSync(logDir,{recursive:true});
const oldFile=path.join(logDir,'old.log'),newFile=path.join(logDir,'new.log');fs.writeFileSync(oldFile,'old');fs.writeFileSync(newFile,'new');
const oldTime=new Date(Date.now()-60*86400000);fs.utimesSync(oldFile,oldTime,oldTime);
const cleaned=cleanupDiagnostics(45);
if(cleaned.removed<1||fs.existsSync(oldFile)||!fs.existsSync(newFile))throw new Error('Diagnostics retention cleanup failed');

const now=new Date(2026,8,15,8,0,0);
const iso=d=>d&&`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
if(iso(parseClassroomDueDate('Due Sep 21, 8:00 AM',now))!=='2026-09-21')throw new Error('Due-date parser failed Sep 21');
if(iso(parseClassroomDueDate('Due Yesterday, 8:00 AM',now))!=='2026-09-14')throw new Error('Due-date parser failed Yesterday');
if(iso(parseClassroomDueDate('Due Jan 4, 8:00 AM',new Date(2026,11,20)))!=='2027-01-04')throw new Error('Due-date year inference failed');
const future=assignmentEligibility({cardText:'Due Sep 21, 8:00 AM'},{week:5},{eligibilityMode:'classroomDueDate',submitOverdue:true},now);
if(future.eligible)throw new Error('Future assignment was incorrectly eligible');
const overdue=assignmentEligibility({cardText:'Due Sep 14, 8:00 AM'},{week:4},{eligibilityMode:'classroomDueDate',submitOverdue:true},now);
if(!overdue.eligible)throw new Error('Overdue assignment was incorrectly blocked');
const unknownDue=assignmentEligibility({cardText:'Assignment posted with no readable due date'},{week:8},{eligibilityMode:'classroomDueDate',submitOverdue:true},now);
if(unknownDue.eligible||!unknownDue.unknown)throw new Error('Unreadable due date is not treated as an explicit unknown/blocking state');
const misleadingTitleDate=assignmentEligibility({cardText:'Assignment posted with no readable due date',text:'Week 8 - Lesson Plans 09/14/2026'},{week:8},{eligibilityMode:'classroomDueDate',submitOverdue:true},now);
if(misleadingTitleDate.eligible||!misleadingTitleDate.unknown)throw new Error('Eligibility still infers a due date from unrelated assignment/title text');
if(defaultConfig().screenshotOnEveryRun!==false)throw new Error('Successful-run screenshots are still enabled by default');
const planRe=new RegExp(defaultConfig().planTitleRegex,'i');
for(const title of ['Week 05 - Lesson Plans','Week 5 - Lesson Plans.docx','Week 12 - Lesson Plans.pdf']){
  const m=title.match(planRe);if(!m)throw new Error(`Default plan regex failed: ${title}`);
}
if('Week 5 - Math Homework'.match(planRe))throw new Error('Default plan regex is too broad');

const submitSource=fs.readFileSync(path.join(root,'engine/submit-weekly.js'),'utf8');
const submissionSafetySource=submitSource+'\n'+actionSource+'\n'+discoverySource;
for(const required of ['getStrictTopicRegion','verifyAssignmentIdentity','verifyPlanAttachment','state.submissions[key]','LIVE run blocked: the current setup does not have a valid dry-run safety certificate']){
  if(!submissionSafetySource.includes(required))throw new Error(`Trust-release safety control missing: ${required}`);
}
if(!submitSource.includes("emit('dry-cert',cert)"))throw new Error('Structured dry-run certificate event is missing');
if(submitSource.includes('state.submittedWeeks[item.week]'))throw new Error('Week-only submission state is still active');
for(const required of ['acquireRunLock','AUTH_REQUIRED','MISSING_PLAN','STATE_CONFLICT','runHistory']){
  if(!submissionSafetySource.includes(required))throw new Error(`Reliability control missing from submission engine: ${required}`);
}
if(!submitSource.includes("emit('run-result',result)"))throw new Error('Structured run-result event is missing');
const preloadSource=fs.readFileSync(path.join(root,'preload.js'),'utf8');
for(const required of ['getScheduleHealth','getDashboard','cleanupDiagnostics'])if(!preloadSource.includes(required))throw new Error(`Reliability UI bridge missing: ${required}`);
const rendererSource=fs.readFileSync(path.join(root,'renderer/app.js'),'utf8');
for(const required of ['diagOutcome','diagTask','diagBlockers','scheduleHealthText'])if(!rendererSource.includes(required))throw new Error(`Diagnostics dashboard binding missing: ${required}`);
if(!rendererSource.includes('cati.finishSetup(time)'))throw new Error('Wizard Finish is not a single finish-and-enable action');
if(!mainSource.includes('async function finishFirstRunSetup(time)'))throw new Error('Atomic first-run finish flow is missing');
if(!rendererSource.includes("const time=$('#wizScheduleTime').value"))throw new Error('Wizard Finish does not persist the visible schedule time');
if(!schedulerServiceSource.includes('health.scheduleMatches'))throw new Error('Task Scheduler health does not compare configured trigger timing');
if(!schedulerServiceSource.includes('Unregister-ScheduledTask'))throw new Error('Schedule removal is not failure-aware');
if(submitSource.includes("confirmedBy:'submission action disappeared'")||submitSource.includes("confirmedBy:'submission action absent after reload'"))throw new Error('Submission can still succeed without positive Classroom completion evidence');
if(!actionSource.includes('same-title card is not enough'))throw new Error('Exact Google file-ID attachment verification hardening is missing');
if(!actionSource.includes('assertSafeAttachmentSet'))throw new Error('Unexpected Your work attachments are not blocked');
if(!submitSource.includes('STATE_UNCONFIRMED'))throw new Error('Ambiguous legacy recovery state is not blocked');
if(submitSource.includes("confirmedBy='submission action absent on fresh detail page'"))throw new Error('Legacy button-absence confirmation regression returned');
if(!actionSource.includes("const scope=await getYourWorkScope(page)"))throw new Error('Submission completion evidence is not scoped to Your work');
if(!submitSource.includes('DUE_DATE_UNKNOWN'))throw new Error('Unreadable Classroom due dates are not surfaced as blockers');
if(!submitSource.includes('safeScreenshot'))throw new Error('Diagnostics screenshots can still affect automation flow');
if(!submitSource.includes('refreshTrustedDrivePlans'))throw new Error('Teacher Edition does not refresh the approved Drive folder before automation');
if(!submitSource.includes('Safety test fallback queued: Week'))throw new Error('Safety check cannot queue a future matching assignment after already-completed older work');
if(!submitSource.includes('{assertGoogleSession,maybeClick,isSubmitted'))throw new Error('submit-weekly.js does not import the exported maybeClick safe-navigation helper');
const safeOutcomeSource=mainSource.slice(mainSource.indexOf('function safeOutcomeForTeacher'),mainSource.indexOf('let aiService=null'));
if(/userSafeError\(['\"]automation:run/.test(safeOutcomeSource))throw new Error('Dashboard-safe outcome formatting still writes duplicate automation failure logs');
if(!mainSource.includes('ensureAutomationIdle'))throw new Error('Setup browser operations are not protected from an active automation run');

if(!mainSource.includes('app.requestSingleInstanceLock()'))throw new Error('Duplicate interactive app instances are not prevented');
for(const marker of ["handleIpc('config:save',(_e,v)=>{ensureAutomationIdle()", "handleIpc('plans:save',(_e,v)=>{ensureAutomationIdle()", "handleIpc('automation:set-live',async(_e,enabled)=>{\n  ensureAutomationIdle()"]){if(!mainSource.includes(marker))throw new Error(`Mutating UI action is not automation-idle guarded: ${marker}`)}
if(!rendererSource.includes("Everything is working")||!rendererSource.includes('fullyReady'))throw new Error('Teacher-facing overall status does not require both LIVE mode and a healthy schedule');
if(!rendererSource.includes('wizardCompleteText'))throw new Error('Teacher Edition wizard does not finish with a clear success state');
const coursePickerSource=fs.readFileSync(path.join(root,'engine/select-course.js'),'utf8');
const coursePickerBridgeSource=fs.readFileSync(path.join(root,'engine/classroom-picker.js'),'utf8');
if(!coursePickerBridgeSource.includes('Use this Classroom')||!coursePickerBridgeSource.includes('catiPickClassroom')||!coursePickerSource.includes('createClassroomPickerBridge'))throw new Error('Cross-tab Classroom selection is not explicit');
const drivePickerSource=fs.readFileSync(path.join(root,'engine/drive-picker.js'),'utf8'),driveSelectorSource=fs.readFileSync(path.join(root,'engine/select-drive-folder.js'),'utf8');
if(!drivePickerSource.includes('Use this folder')||!drivePickerSource.includes('catiPickDriveFolder')||!driveSelectorSource.includes('createDriveFolderPickerBridge'))throw new Error('Cross-tab Drive selection is not explicit');
if(!rendererSource.includes('withSetupBrowserLock')||!rendererSource.includes('Finish or cancel the open Google setup window'))throw new Error('Setup UI does not prevent overlapping Google selection actions');
const htmlSource=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8');
for(const required of ['Naming & safety options','Add or correct a plan manually','More status details','Finish & turn on','Help & support'])if(!htmlSource.includes(required))throw new Error(`Commercial Teacher UI element missing: ${required}`);
if(htmlSource.includes('id="saveSchedule"'))throw new Error('Teacher UI still exposes a save-without-install schedule button');
if(htmlSource.includes('planWeekOf'))throw new Error('Retired plan-week-start mode is still exposed in Teacher Edition');
if(!htmlSource.includes('v0.9.21'))throw new Error('Teacher Edition sidebar version is stale');
if(htmlSource.indexOf('id="wizPlanRegex"')>htmlSource.indexOf('id="wizScanDrive"'))throw new Error('Custom Drive naming rule is still inaccessible before the required Drive scan');
if(!htmlSource.includes('must be on and signed in'))throw new Error('Teacher UI does not explain that the computer must be on and signed in');
if(!mainSource.includes('mainWindow.setMenu(null)')||!mainSource.includes('autoHideMenuBar:true'))throw new Error('Generic Electron application menu is still exposed');
if(!htmlSource.includes('role="dialog"')||!htmlSource.includes('aria-modal="true"'))throw new Error('Guided setup is not exposed as an accessible modal dialog');
if(!rendererSource.includes('function trapFocus')||!rendererSource.includes('askConfirm('))throw new Error('Commercial modal focus/confirmation behavior is missing');
if(rendererSource.includes('confirm('))throw new Error('Browser-native confirm() dialogs are still used');
if(!htmlSource.includes('id="toastRegion"')||!rendererSource.includes("setAttribute('role',error?'alert':'status')"))throw new Error('Accessible notification region is missing');
if(!htmlSource.includes('data-tip=')||!htmlSource.includes('class="help-tip"'))throw new Error('Contextual hover/focus help is missing');
const cssSource=fs.readFileSync(path.join(root,'renderer/styles.css'),'utf8');
if(cssSource.includes('.switch input{display:none}'))throw new Error('Switch checkboxes are hidden from keyboard focus');
if(!cssSource.includes(':focus-visible')||!cssSource.includes('prefers-reduced-motion'))throw new Error('Keyboard focus or reduced-motion accessibility styling is missing');
if(!htmlSource.includes('Example Classroom assignment')||!htmlSource.includes('Example Drive plan filename'))throw new Error('Teacher setup still lacks example-based naming controls');
if(!rendererSource.includes('regexFromExample'))throw new Error('Example-based naming rules are not generated internally');
if(!htmlSource.includes('Submitted by Auto Turn-In'))throw new Error('Dashboard submission metric is ambiguous');
if(!htmlSource.includes('Unsaved changes')||!rendererSource.includes('markDirty'))throw new Error('Unsaved-change protection is missing');
if(!htmlSource.includes("You're all set")||!htmlSource.includes('id="wizardComplete"'))throw new Error('Guided setup completion screen is missing');
const driveScanSource=fs.readFileSync(path.join(root,'engine/scan-drive-folder.js'),'utf8');
if(!domSource.includes('logicalPosition'))throw new Error('Drive/Classroom logical-position duplicate evidence is missing');
for(const required of ['unresolvedThisPass','Duplicate plan files map to Week'])if(!driveScanSource.includes(required))throw new Error(`Drive duplicate hardening missing: ${required}`);
for(const required of ['seenCards','rootKey'])if(!domSource.includes(required))throw new Error(`Classroom DOM duplicate-assignment hardening missing: ${required}`);
if(!discoverySource.includes('distinct.size>1'))throw new Error('Classroom duplicate-assignment decision hardening is missing');
if(discoverySource.includes('deriveAssignmentUrl(')||submitSource.includes('deriveAssignmentUrl('))throw new Error('Submission engine still constructs guessed Classroom assignment URLs from internal stream IDs');
if(!actionSource.includes("querySelectorAll('[data-file-id],[data-doc-id],[data-resource-id]')"))throw new Error('Unexpected non-link attachment evidence is not inspected');
const topicsSource=fs.readFileSync(path.join(root,'engine/discover-topics.js'),'utf8');
if(!topicsSource.includes('accounts\\.google\\.com'))throw new Error('Topic discovery does not diagnose expired Google sign-in');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(pkg.version!=='0.9.21')throw new Error('package.json version is not 0.9.21');
if(String(pkg.dependencies['playwright-core']).startsWith('^')||String(pkg.devDependencies.electron).startsWith('^')||String(pkg.devDependencies['electron-builder']).startsWith('^'))throw new Error('Top-level build/runtime dependencies are not pinned exactly');
const portableNode=fs.readFileSync(path.join(root,'scripts/Get-PortableNode.ps1'),'utf8');
if(!portableNode.includes("$version = 'v22.19.0'"))throw new Error('Portable Node build version is not pinned');
const releaseBuilder=fs.readFileSync(path.join(root,'BUILD-SETUP-EXE.bat'),'utf8');
if(!releaseBuilder.includes('npm ci --no-audit --no-fund')||!releaseBuilder.includes('npm run check:release-ready')||!releaseBuilder.includes('npm run check:dom')||!releaseBuilder.includes('npm run check:browser'))throw new Error('Windows release builder does not enforce locked installs/release readiness/DOM/background-browser gates');
if(!portableNode.includes("$expectedSha256 = 'ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86'"))throw new Error('Portable Node SHA-256 verification is missing');
if(!mainSource.includes('sandbox:true')||!mainSource.includes("setWindowOpenHandler(()=>({action:'deny'}))")||!mainSource.includes("will-navigate"))throw new Error('Electron renderer shell hardening is incomplete');
if(!schedulerServiceSource.includes('timeoutMs=20000'))throw new Error('PowerShell scheduler operations do not have a timeout');
if(!mainSource.includes("localDataIssues.has('config.json')"))throw new Error('Background wrapper can still treat corrupted configuration as a harmless Dry Run skip');
if(!localDataSource.includes('preserveTrustedDriveProvenance')||!aiServiceSource.includes('{trustedDriveSync:true}'))throw new Error('User/import plan edits can still masquerade as trusted Drive-scanner rows');
if(!mainSource.includes("handleIpc('ai:approve'")||!aiServiceSource.includes('createAiDraftForBlocker'))throw new Error('AI missing-plan recovery IPC/pipeline is missing');
if(!aiServiceSource.includes('safeStorage.encryptString')||!aiServiceSource.includes('safeStorage.decryptString'))throw new Error('AI private keys are not protected with Electron safeStorage');
if(!aiServiceSource.includes("status:'ready'")||!rendererSource.includes('Approve this lesson plan'))throw new Error('AI approval-first workflow markers are missing');
const aiSource=fs.readFileSync(path.join(root,'engine/ai-recovery.js'),'utf8');
if(!aiSource.includes('json_schema')||!aiSource.includes('responseJsonSchema')||!aiSource.includes('teacherReview'))throw new Error('Multi-provider structured lesson-plan drafting contract is missing');
if(!aiSource.includes('store:false'))throw new Error('OpenAI Responses request does not explicitly disable response storage');
for(const required of ['api.groq.com','generativelanguage.googleapis.com','openrouter.ai/api','data_collection:\'deny\'','zdr:true'])if(!aiSource.includes(required))throw new Error(`Free AI provider or privacy control is missing: ${required}`);
if(!aiServiceSource.includes("const FREE_PROVIDER_ORDER=['groq','gemini','openrouter']")||aiServiceSource.includes("const FREE_PROVIDER_ORDER=['groq','gemini','openrouter','openai']"))throw new Error('Automatic fallback is not restricted to free providers');
if(!aiServiceSource.includes('raw.openaiApiKeyEncrypted')||!aiServiceSource.includes('providers.openai'))throw new Error('Existing OpenAI connection migration is missing');
if(aiServiceSource.includes("writeJson('ai-secrets.json'"))throw new Error('AI secrets still use ordinary rollback-backup JSON storage');
if(!aiServiceSource.includes('removeLegacyAiSecretBackup')||!aiServiceSource.includes('clearAiSecret(keyProvider)'))throw new Error('AI key clear/migration hardening is missing');
if(!jsonStoreSource.includes('fs.copyFileSync(file,`${file}.bak`)'))throw new Error('JSON backups do not mirror the latest committed value');
for(const required of ['Groq Free','Google Gemini Free','OpenRouter Free','Free limits can change','never buys credits','free service I connected'])if(!htmlSource.includes(required))throw new Error(`Free AI teacher disclosure is missing: ${required}`);
if(!rendererSource.includes('free-tier content may be used to improve its products')||!rendererSource.includes('API billing is separate from ChatGPT and may create charges'))throw new Error('AI provider privacy or cost disclosure is missing');
if(!aiServiceSource.includes('planningContext.trim().length<20')||!htmlSource.includes('It does not automatically read your other Classroom lessons'))throw new Error('AI drafting can still be enabled without adequate teacher context or overstates its context access');
if(!mainSource.includes("handleIpc('grading:grade'")||!mainSource.includes("handleIpc('grading:get-state'"))throw new Error('Local grading IPC pipeline is missing');
if(!gradingSource.includes("DEFAULT_OLLAMA_URL='http://127.0.0.1:11434'")||!gradingSource.includes("status:'SAFE_DRAFT'")||!gradingSource.includes("status:'TEACHER_REVIEW'"))throw new Error('Local grading fail-closed decision contract is missing');
if(!gradingSource.includes('format:GRADE_SCHEMA')||!gradingSource.includes('think:false')||!gradingSource.includes('num_predict:1000'))throw new Error('Local Ollama grading structured-output request is missing');
if(!gradingSource.includes('Rubric possible points do not add up to max_score.')||!gradingSource.includes('Reported score does not equal the rubric point total.'))throw new Error('Local grading arithmetic validation is missing');
if(!gradingSource.includes("['127.0.0.1','localhost','::1','[::1]']")||!gradingServiceSource.includes('baseUrl=DEFAULT_OLLAMA_URL')&&!gradingServiceSource.includes('baseUrl:DEFAULT_OLLAMA_URL'))throw new Error('Local grading is not restricted to loopback Ollama');
if(gradingServiceSource.includes('studentWork')&&gradingServiceSource.includes("writeJson('grading-drafts"))throw new Error('Local grading persists student work unexpectedly');
if(!htmlSource.includes('Draft grading')||!htmlSource.includes('GoClassroom never clicks <b>Return</b>')||!rendererSource.includes('Preview only. No Classroom grade was changed.')||!rendererSource.includes('GoClassroom never clicks Return'))throw new Error('Teacher-facing local grading / draft-only safety boundary is missing');
const classroomGradingSource=fs.readFileSync(path.join(root,'engine/classroom-grading.js'),'utf8');
const gradingPreloadSource=fs.readFileSync(path.join(root,'preload.js'),'utf8');
const classroomGradingDiscoverSource=fs.readFileSync(path.join(root,'engine/grading-classroom-discover.js'),'utf8');
const classroomGradingExtractSource=fs.readFileSync(path.join(root,'engine/grading-classroom-extract.js'),'utf8');
const classroomGradingWriteSource=fs.readFileSync(path.join(root,'engine/grading-classroom-write.js'),'utf8');
if(!mainSource.includes("handleIpc('grading:discover-classroom'")||!mainSource.includes("handleIpc('grading:process-classroom'")||!gradingPreloadSource.includes('discoverGradingAssignments')||!gradingPreloadSource.includes('processClassroomGrading'))throw new Error('Classroom draft-grading IPC bridge is missing');
if(!mainSource.includes("handleIpc('grading:select-classroom'")||!mainSource.includes("handleIpc('grading:remove-classroom'")||!gradingPreloadSource.includes('selectGradingClassroom')||!htmlSource.includes('gradingClassroomSelect'))throw new Error('Independent multi-Classroom grading controls are missing');
if(!gradingServiceSource.includes('gradingClassrooms')||!gradingServiceSource.includes('reviewExportEnabled')||!gradingServiceSource.includes('exportReviewPacket')||!htmlSource.includes('gradingReviewExportEnabled'))throw new Error('Multi-Classroom settings or teacher-controlled review exports are missing');
if(!gradingServiceSource.includes('classroomDraftWriteEnabled:false')||!gradingServiceSource.includes("if(writeDrafts&&!settings.classroomDraftWriteEnabled)")||!gradingServiceSource.includes("status==='SAFE_DRAFT'"))throw new Error('Classroom draft-write opt-in / SAFE_DRAFT gate is missing');
if(!classroomGradingExtractSource.includes('supported Google Doc attachment')&&!classroomGradingExtractSource.includes('GOOGLE DOC ATTACHMENT'))throw new Error('Classroom grading extraction does not include supported Google Docs evidence');
if(!classroomGradingExtractSource.includes('At least one student attachment could not be read safely'))throw new Error('Classroom grading extraction no longer fails closed on incomplete evidence');
if(classroomGradingWriteSource.includes('.click(')||!classroomGradingWriteSource.includes("status:'SAVED_DRAFT'")||!classroomGradingWriteSource.includes('work was not returned to the student'))throw new Error('Classroom draft writer lost its no-Return / verified-draft contract');
if(!htmlSource.includes('gradingClassroomWriteEnabled')||!htmlSource.includes('gradingWriteDraftsThisRun')||!gradingConfirmationSource.includes('Confirm this draft-grade batch')||!gradingConfirmationSource.includes('authorizeWriteBatch'))throw new Error('Main-process Classroom draft-write confirmation controls are missing');
const docxSource=fs.readFileSync(path.join(root,'engine/docx-writer.js'),'utf8');
if(!docxSource.includes('[Content_Types].xml')||!docxSource.includes('word/document.xml'))throw new Error('Local Word draft writer is missing required DOCX package parts');
const uploadSource=fs.readFileSync(path.join(root,'engine/upload-draft-plan.js'),'utf8');
if(!uploadSource.includes('File upload')||!uploadSource.includes("emit('ai-upload'"))throw new Error('Approved AI draft Drive upload path is missing');
if(!htmlSource.includes('AI missing-plan recovery')||!rendererSource.includes('Approve & turn in'))throw new Error('Teacher-facing AI recovery workflow is missing');
if(!aiServiceSource.includes('optedIn:false,enabled:false'))throw new Error('AI recovery is not opt-in/off by default');
if(!htmlSource.includes('id="aiNav" class="nav hidden"'))throw new Error('Optional AI navigation is visible before opt-in');
if(!htmlSource.includes('name="wizAiChoice" value="no" checked'))throw new Error('First-run wizard does not default optional AI recovery to No');
if(!rendererSource.includes('function applyAiVisibility')||!rendererSource.includes('settings.optedIn'))throw new Error('Optional AI UI is not gated behind teacher opt-in');
if(!rendererSource.includes('optedIn:false,enabled:false'))throw new Error('Teacher cannot fully opt out and hide optional AI recovery');
if(!mainSource.includes("coreIssueNames=new Set(['config.json','plans.json'])"))throw new Error('Optional AI data corruption can still leak into core Auto Turn-In blockers');
if(!htmlSource.includes('Content-Security-Policy'))throw new Error('Renderer Content Security Policy is missing');
if(!htmlSource.includes('v0.9.21'))throw new Error('Teacher Edition sidebar version is not v0.9.21');

const preloadText=fs.readFileSync(path.join(root,'preload.js'),'utf8');
const errorCatalog=fs.readFileSync(path.join(root,'engine/user-errors.js'),'utf8');
if(mainSource.includes("app.getPath('localAppData')"))throw new Error('Invalid Electron localAppData path name is still present');
if(!appConfigSource.includes("browser-profile"))throw new Error('Browser profile is not centralized under the application data root');
if(!mainSource.includes('handleIpc(')||!mainSource.includes('encodePublicError')&&!mainSource.includes('publicError'))throw new Error('Central user-facing IPC error boundary is missing');
if(!preloadText.includes('cleanRemoteError')||!preloadText.includes('CATI_UI|'))throw new Error('Preload does not strip Electron remote-method error wrappers');
for(const required of ['AT-APP-101','AT-GGL-101','AT-CLS-110','AT-DRV-105','AT-ATT-101','AT-SUB-102','AT-SCH-101','AT-SCH-106','AT-AI-203','AT-GRD-201'])if(!errorCatalog.includes(required))throw new Error(`Precise support-code catalog is missing ${required}`);
if(!rendererSource.includes('Support code:')||!htmlSource.includes('id="attentionCode"')||!htmlSource.includes('id="helpCode"'))throw new Error('Teacher-facing support codes are not surfaced for actionable problems');
if(htmlSource.includes('Technical log')||htmlSource.includes('Help & diagnostics')||htmlSource.includes('regular expression'))throw new Error('Developer language is still visible in the teacher interface');
if(!htmlSource.includes('Files for school technology support')||!rendererSource.includes('Support files are stored on this computer and are not shown inside the app.'))throw new Error('Raw logs are still exposed directly in the teacher interface');

if(!protocolSource.includes("const PREFIX='CATI_EVENT:'")||!runnerSource.includes("lastPayload(output,'run-result')"))throw new Error('Versioned child-process protocol is not wired end-to-end');
try{fs.rmSync(testData,{recursive:true,force:true})}catch{/* best-effort fallback */}
console.log('Project syntax, Trust/Reliability safety, Teacher Edition, multi-Classroom grading, optional private review export, and v0.9.21 GoClassroom preview checks passed.');
