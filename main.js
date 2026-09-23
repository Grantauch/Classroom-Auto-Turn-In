const { app, BrowserWindow, ipcMain, dialog, shell, Notification, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const {computeSafetyFingerprint,assertUniquePlans,parseClassroomIds,schoolYearKey} = require('./engine/safety');
const {createLocalData}=require('./main-services/local-data');
const {createEngineRunner}=require('./main-services/engine-runner');
const {createAiService}=require('./main-services/ai-service');
const {createGradingService}=require('./main-services/grading-service');
const {createRosterIntegration}=require('./main-services/roster-integration');
const {createRosterApplyHandler}=require('./main-services/roster-confirmation');
const {createGradingRequestHandler}=require('./main-services/grading-confirmation');
const {createSchedulerService}=require('./main-services/scheduler-service');
const {createMachineService}=require('./main-services/machine-service');
const {createIpcErrorReporter}=require('./main-services/ipc-error-reporter');
const {buildSetupExport,parseSetupImport}=require('./main-services/setup-transfer');
const {runPackagedSelfTest}=require('./main-services/packaged-self-test');
const {parseCsv,toCsv}=require('./main-services/plan-csv');
const {lastPayload}=require('./engine/protocol');
const {schedulePoints,retryOffsets,triggerStartTime} = require('./engine/scheduler');
const {nextRetryPlan,isRetryChainFresh} = require('./engine/retry-policy');
const {publicError} = require('./engine/user-errors');
const {isTransientFailure}=require('./engine/transient-error');

let mainWindow;
let mainOperationActive=null;
const backgroundMode=process.argv.includes('--background-run');
const selfTestArg=process.argv.find(x=>x.startsWith('--self-test-file='));
const selfTestUserDataArg=process.argv.find(x=>x.startsWith('--self-test-user-data='));
const selfTestBrowser=process.argv.includes('--self-test-browser');
const selfTestMode=process.argv.includes('--self-test')||!!selfTestArg||!!selfTestUserDataArg||selfTestBrowser;
const selfTestFile=selfTestArg?selfTestArg.slice('--self-test-file='.length):'';
const selfTestUserData=selfTestUserDataArg?path.resolve(selfTestUserDataArg.slice('--self-test-user-data='.length)):'';
if(selfTestMode&&selfTestUserData){
  fs.mkdirSync(selfTestUserData,{recursive:true});
  app.setPath('userData',selfTestUserData);
}
const retryAttemptArg=process.argv.find(x=>/^--retry-attempt=\d+$/.test(x));
const retryChainArg=process.argv.find(x=>x.startsWith('--retry-chain='));
const backgroundRetryAttempt=retryAttemptArg?Math.max(0,Number(retryAttemptArg.split('=')[1])||0):0;
const backgroundRetryChainId=retryChainArg?retryChainArg.slice('--retry-chain='.length):'';
const PRIMARY_TASK_NAME='Classroom Auto Turn-In';
// Windows only shows toasts for an app ID that matches the installer's Start
// Menu shortcut, which electron-builder stamps with the configured appId.
if(process.platform==='win32'){try{app.setAppUserModelId('org.classroomautoturnin.app')}catch{/* best-effort fallback */}}
const RETRY_TASK_PREFIX='Classroom Auto Turn-In Retry';
let interactiveInstanceLock=true;
if(!backgroundMode&&!selfTestMode){
  interactiveInstanceLock=app.requestSingleInstanceLock();
  if(!interactiveInstanceLock) app.quit();
  else app.on('second-instance',()=>{
    if(mainWindow&&!mainWindow.isDestroyed()){
      if(mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show(); mainWindow.focus();
    }
  });
}
const localData=createLocalData(()=>app.getPath('userData'));
const {dataDir,ensureData,jsonPath,writeJson,loadConfig,saveConfig,normalizePlan,loadPlans,savePlans,loadState,appLog}=localData;
const localDataIssues=localData.issues;
const machineService=createMachineService({dataDir,logger:appLog});
function getMachine(){return machineService.load()}
function saveMachine(v){return machineService.save(v||{})}
function pidAlive(pid){try{process.kill(Number(pid),0);return true}catch(e){return e?.code==='EPERM'}}
function ensureAutomationIdle(){
  if(mainOperationActive) throw new Error('Another Auto Turn-In action is already running. Wait for it to finish, then try again.');
  const lock=getRunLockInfo();
  if(lock&&pidAlive(lock.pid))throw new Error('An automatic turn-in check is running right now. Try this setup action again after it finishes.');
}
function engineEnv(){ return {...process.env,CATI_DATA_DIR:dataDir(),ELECTRON_RUN_AS_NODE:'1',CATI_BACKGROUND_MODE:backgroundMode?'1':'0'}; }
function enginePath(file){ return path.join(__dirname,'engine',file); }
function compactError(err){
  return String(err?.message||err||'Unknown error').replace(/\s+/g,' ').trim().slice(0,2000);
}

const userSafeError=createIpcErrorReporter({publicError,appLog});
function handleIpc(channel,handler){
  ipcMain.handle(channel,async(event,...args)=>{
    try{return await handler(event,...args)}
    catch(err){
      const info=userSafeError(channel,err);
      throw new Error(`CATI_UI|${info.code}|${info.message}`);
    }
  });
}
function safeOutcomeForTeacher(result){
  if(!result||typeof result!=='object')return result;
  const status=String(result.status||'').toUpperCase();
  if(status==='SUCCESS'){
    const message=String(result.mode||'').toUpperCase()==='DRY RUN'
      ? 'Safety Check passed. Auto Turn-In verified the Classroom, matching plan, and Turn in controls without submitting anything.'
      : (Number(result.submitted||0)>0
          ? `Auto Turn-In successfully turned in ${Number(result.submitted)} lesson plan${Number(result.submitted)===1?'':'s'}.`
          : 'The check finished successfully.');
    return {...result,message};
  }
  if(status==='NO_ACTION')return {...result,message:'Nothing needs to be turned in right now.'};
  if(['BLOCKED','FAILED','PARTIAL'].includes(status)){
    const firstBlocker=Array.isArray(result.blockers)&&result.blockers.length?result.blockers[0]:null;
    const info=publicError(firstBlocker?.message||result.message||result.errorType||'','automation:run');
    const prefix=status==='PARTIAL'&&Number(result.submitted||0)>0
      ? `Auto Turn-In turned in ${Number(result.submitted)} lesson plan${Number(result.submitted)===1?'':'s'}, but another item needs attention. `
      : '';
    return {...result,message:`${prefix}${info.message}`,supportCode:info.code};
  }
  return {...result,message:'The check finished.'};
}

let aiService=null;
function getAiService(){
  if(!aiService) aiService=createAiService({
    safeStorage,localData,ensureAutomationIdle,runNodeScript,lastPayload,
    acquireLock:acquireMainAutomationLock,releaseLock:releaseMainAutomationLock,runAutomation,
    userSafeError,compactError,getMainWindow:()=>mainWindow
  });
  return aiService;
}
function loadAiSettings(){return getAiService().loadAiSettings()}
function saveAiSettings(v){return getAiService().saveAiSettings(v)}
function aiPublicState(){return getAiService().aiPublicState()}
function draftsDir(){return getAiService().draftsDir()}
function loadAiDrafts(){return getAiService().loadAiDrafts()}
function saveAiDrafts(v){return getAiService().saveAiDrafts(v)}
function getAiDraft(id){return getAiService().getAiDraft(id)}
function createAiDraftForBlocker(b,o){return getAiService().createAiDraftForBlocker(b,o)}
function processMissingPlanRecovery(r){return getAiService().processMissingPlanRecovery(r)}
function scanAndSaveDrivePlans(){return getAiService().scanAndSaveDrivePlans()}
function approveAiDraft(id){return getAiService().approveAiDraft(id)}

let gradingService=null;
function getGradingService(){
  if(!gradingService)gradingService=createGradingService({localData,ensureAutomationIdle,compactError,runNodeScript,runExclusiveBrowser:withExclusiveBrowserOperation});
  return gradingService;
}
function gradingState(){return getGradingService().state()}
async function saveGradingSettings(v={}){
  const service=getGradingService(),current=service.loadSettings();
  if(v.classroomDraftWriteEnabled===true&&!current.classroomDraftWriteEnabled){const ans=await dialog.showMessageBox({type:'warning',buttons:['Cancel','Allow draft-grade writing'],defaultId:0,cancelId:0,title:'Allow Classroom draft-grade writing?',message:'GoClassroom may enter validated draft scores into Google Classroom.',detail:'GoClassroom will never click Return. Draft grades remain hidden from students until you choose to return work in Classroom. Existing grades are never overwritten.'});if(ans.response!==1)return {...current,cancelled:true}}
  if(v.reviewExportEnabled===true&&!current.reviewExportEnabled){const ans=await dialog.showMessageBox({type:'warning',buttons:['Cancel','Save private review copies'],defaultId:0,cancelId:0,title:'Save grading review copies?',message:'This will intentionally save student work and AI-assisted grading data in the folder you chose.',detail:'Keep that folder private and follow your school or district retention rules. GoClassroom will not share the folder or make it public. You can turn review copies off at any time.'});if(ans.response!==1)return {...current,cancelled:true}}
  return service.saveSettings(v||{});
}
function createDraftGrade(v){return getGradingService().grade(v||{})}function discoverGradingAssignments(courseId){return getGradingService().discoverAssignments(courseId)}
async function selectGradingClassroom(){const selected=await withExclusiveBrowserOperation('Grading Classroom selection',async()=>lastPayload(await runNodeScript('select-grading-course.js'),'grading-course'));if(!selected)throw new Error('GoClassroom did not receive a grading Classroom selection.');return getGradingService().addGradingClassroom(selected)} // The save must stay outside the browser lock: addGradingClassroom runs ensureAutomationIdle, which rejects while the lock is held (AT-GRD-194).
function removeGradingClassroom(courseId){return getGradingService().removeGradingClassroom(courseId)}
async function selectGradingReviewFolder(){ensureAutomationIdle();const result=await dialog.showOpenDialog({title:'Choose a private grading review folder',properties:['openDirectory','createDirectory']});if(result.canceled||!result.filePaths[0])return null;return getGradingService().saveSettings({...getGradingService().loadSettings(),reviewFolderPath:path.resolve(result.filePaths[0])})}
async function openGradingReviewFolder(){const settings=getGradingService().loadSettings();if(!settings.reviewFolderPath)throw new Error('Choose a grading review folder first.');const result=await shell.openPath(settings.reviewFolderPath);if(result)throw new Error(result);return true}
const processClassroomGrading=createGradingRequestHandler({dialog,getGradingService});

const rosterIntegration=createRosterIntegration({safeStorage,localData,ensureAutomationIdle,compactError,runNodeScript,runExclusiveBrowser:withExclusiveBrowserOperation});
const applyApprovedRosterChanges=createRosterApplyHandler({dialog,getRosterIntegration:()=>rosterIntegration});
function getRunLockInfo(){try{return JSON.parse(fs.readFileSync(path.join(dataDir(),'automation.lock'),'utf8'))}catch{return null}}
function acquireMainAutomationLock(label='setup action'){
  ensureData();const file=path.join(dataDir(),'automation.lock');const token=`main-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;const payload={pid:process.pid,startedAt:new Date().toISOString(),token,label};
  const create=()=>{const fd=fs.openSync(file,'wx');try{fs.writeFileSync(fd,JSON.stringify(payload,null,2),'utf8');fs.fsyncSync(fd)}finally{fs.closeSync(fd)};return payload};
  try{return create()}catch(e){if(e.code!=='EEXIST')throw e;const existing=getRunLockInfo();if(existing&&!pidAlive(existing.pid)){try{fs.unlinkSync(file)}catch{/* best-effort fallback */};return create()}throw new Error('An automatic turn-in check is running right now. Try this action again after it finishes.');}
}
function releaseMainAutomationLock(lock){if(!lock?.token)return false;const file=path.join(dataDir(),'automation.lock');try{const current=JSON.parse(fs.readFileSync(file,'utf8'));if(current.token!==lock.token)return false;fs.unlinkSync(file);return true}catch{return false}}
function cleanupDiagnostics(retentionDays=45){
  const days=Math.max(1,Math.min(365,Number(retentionDays)||45));
  const dir=path.join(dataDir(),'logs');fs.mkdirSync(dir,{recursive:true});const cutoff=Date.now()-days*86400000;let removed=0;
  for(const name of fs.readdirSync(dir)){if(!/\.(?:log|png)$/i.test(name))continue;const file=path.join(dir,name);try{if(fs.statSync(file).mtimeMs<cutoff){fs.unlinkSync(file);removed++}}catch{/* best-effort fallback */}}
  return {removed,retentionDays:days};
}

let engineRunner=null;
function getEngineRunner(){
  if(!engineRunner) engineRunner=createEngineRunner({engineDir:path.join(__dirname,'engine'),execPath:process.execPath,envProvider:engineEnv});
  return engineRunner;
}
function childTimeoutFor(file){return getEngineRunner().childTimeoutFor(file)}
function runNodeScript(file,args=[],broadcast=true,{timeoutMs=childTimeoutFor(file)}={}){
  return getEngineRunner().run(file,args,{broadcast,timeoutMs});
}
async function withExclusiveBrowserOperation(label,fn){
  ensureAutomationIdle();
  const lock=acquireMainAutomationLock(label);
  mainOperationActive={label,startedAt:new Date().toISOString()};
  try{return await fn();}
  finally{releaseMainAutomationLock(lock);mainOperationActive=null;}
}
function parseRunResult(output){return lastPayload(output,'run-result')}
function notificationFingerprint(result,title,body){
  const blocker=Array.isArray(result?.blockers)&&result.blockers.length?result.blockers[0]:null;
  return [String(result?.status||''),String(result?.errorType||''),String(blocker?.type||''),String(blocker?.week||''),String(title||''),String(body||'')].join('|').slice(0,1200);
}
function shouldShowIncidentNotification(key,{windowMs=6*60*60*1000}={}){
  if(!key)return true;
  const file=jsonPath('notification-state.json');let state={};
  try{state=JSON.parse(fs.readFileSync(file,'utf8'))||{}}catch{/* best-effort fallback */}
  const now=Date.now(),last=Number(state.when)||0;
  if(state.key===key && now-last<windowMs)return false;
  try{writeJson('notification-state.json',{key,when:now})}catch{/* best-effort fallback */}
  return true;
}
function showRunNotification(result){
  const cfg=loadConfig();
  if(!cfg.notifications||!Notification.isSupported()||!result)return;
  let title='Classroom Auto Turn-In',body='';
  if(result.aiDraftsCreated?.length){title='Lesson-plan draft ready';body=`Week ${result.aiDraftsCreated.map(x=>x.week).join(', ')} needs a plan. A draft is ready for your review; nothing was uploaded or submitted.`;}
  else if(result.aiDraftsPending?.length){return;} // already notified when the draft was first created; automatic retries stay quiet
  else if(result.aiDraftFailures?.length){const info=publicError(result.message||'AI draft failed','ai:regenerate');title='Lesson-plan draft needs attention';body=`${info.message} Code ${info.code}.`;}
  else if(result.status==='SUCCESS'&&result.submitted>0){title='Lesson plan submitted';body=result.message||'The matching lesson plan was submitted successfully.';}
  else if(['FAILED','BLOCKED','PARTIAL'].includes(result.status)){const firstBlocker=Array.isArray(result.blockers)&&result.blockers.length?result.blockers[0]:null;const info=publicError(firstBlocker?.message||result.message||result.errorType||'','automation:run');title=result.status==='FAILED'?'Auto Turn-In could not finish':'Auto Turn-In needs attention';body=`${info.message} Code ${info.code}.`;}
  else return;
  if(['FAILED','BLOCKED','PARTIAL'].includes(String(result.status||'').toUpperCase())){
    const key=notificationFingerprint(result,title,body);
    if(!shouldShowIncidentNotification(key))return;
  }
  try{new Notification({title,body:String(body).slice(0,240)}).show()}catch{/* best-effort fallback */}
}
async function delay(ms){return new Promise(r=>setTimeout(r,ms));}

async function runAutomation(dry){
  ensureAutomationIdle();
  mainOperationActive={label:dry?'Safety Check':'automatic turn-in check',startedAt:new Date().toISOString()};
  if(mainWindow&&!mainWindow.isDestroyed()) mainWindow.webContents.send('automation-status',{running:true,dry});
  try{
    let out='';
    try{out=await runNodeScript('submit-weekly.js',dry?['--dry-run']:[]);}
    catch(err){
      const result=parseRunResult(err.output);err.runResult=result;
      if(!dry&&result){
        await processMissingPlanRecovery(result);
        if(result.aiDraftsCreated?.length) err.message=`Week ${result.aiDraftsCreated.map(x=>x.week).join(', ')} was missing. An AI lesson-plan draft is ready for review; nothing was uploaded or submitted.`;
        else if(result.aiDraftsPending?.length) err.message=result.message;
        else if(result.aiDraftFailures?.length) err.message=result.message;
      }
      throw err;
    }
    const result=parseRunResult(out);
    if(!dry&&result) await processMissingPlanRecovery(result);
    if(dry){
      const cert=lastPayload(out,'dry-cert');
      if(!cert||typeof cert!=='object') {const err=new Error(result?.message||'Safety check finished without a matching assignment it could verify. No automatic turn-in approval was recorded.');err.runResult=result;throw err;}
      const cfg=loadConfig(),plans=loadPlans();
      assertUniquePlans(plans);
      const currentFingerprint=computeSafetyFingerprint(cfg,plans);
      if(cert.fingerprint!==currentFingerprint) throw new Error('Setup changed while the dry test was running. Run the safety test again.');
      if(!Array.isArray(cert.verified)||!cert.verified.length) throw new Error('Safety check did not verify a matching assignment, matching plan, and submission controls.');
      const passedAt=new Date().toISOString();
      cfg.lastDryRunOkAt=passedAt;
      cfg.safetyCertification={...cert,passedAt};
      saveConfig(cfg);
    }
    return {ok:true,output:out,result:safeOutcomeForTeacher(result)};
  }finally{
    mainOperationActive=null;
    if(mainWindow&&!mainWindow.isDestroyed()) mainWindow.webContents.send('automation-status',{running:false,dry});
  }
}
let schedulerService=null;
function getSchedulerService(){
  if(!schedulerService) schedulerService=createSchedulerService({
    app,localData,logger:appLog,userSafeError,compactError,
    schedulePoints,retryOffsets,triggerStartTime,nextRetryPlan,isRetryChainFresh,
    getMachine,primaryTaskName:PRIMARY_TASK_NAME,retryTaskPrefix:RETRY_TASK_PREFIX
  });
  return schedulerService;
}
function loadRetryState(){return getSchedulerService().loadRetryState()}
function clearRetryState(){return getSchedulerService().clearRetryState()}
function currentRetryContext(){return getSchedulerService().currentRetryContext(backgroundRetryAttempt,backgroundRetryChainId)}
function finishRetryChain(chain,result){return getSchedulerService().finishRetryChain(chain,result)}
function clearRetryTasks(){return getSchedulerService().clearRetryTasks()}
function scheduleNextRetry(chain,currentAttempt,cfg,result){return getSchedulerService().scheduleNextRetry(chain,currentAttempt,cfg,result)}
function getScheduleHealth(){return getSchedulerService().getScheduleHealth()}
function installSchedule(){return getSchedulerService().installSchedule()}
function reconcileScheduleOnStartup(){return getSchedulerService().reconcileScheduleOnStartup()}
function removeSchedule(){return getSchedulerService().removeSchedule()}
function normalizeRetryFailure(err,result){
  if(result)return result;
  const msg=compactError(err);
  const transient=isTransientFailure(err);
  return {status:'FAILED',message:msg,submitted:0,retryable:transient,errorType:transient?'TRANSIENT':'UNEXPECTED'};
}
async function runBackgroundAutomation(){
  const cfg=loadConfig(),machine=getMachine();
  if(machine?.damaged){
    const result={status:'BLOCKED',message:"This computer's Auto Turn-In identity could not be read safely. Nothing was submitted. Open Automatic turn-in and save this computer again.",submitted:0,retryable:false,errorType:'MACHINE_DATA_CORRUPT'};
    appLog(`Scheduled background run BLOCKED: ${result.message}`);showRunNotification(result);return 2;
  }
  if(machine?.role==='manual'){
    appLog('Scheduled run skipped because this computer is set to manual only.');
    return 0;
  }
  if(localDataIssues.has('config.json')){
    const result={status:'BLOCKED',message:'Saved Auto Turn-In settings are damaged. Nothing was submitted. Open the app and repair setup.',submitted:0,retryable:false,errorType:'DATA_CORRUPT'};
    appLog(`Scheduled background run BLOCKED: ${result.message}`);showRunNotification(result);return 2;
  }
  const retryContext=currentRetryContext();
  if(!retryContext.valid){
    appLog(`Stale retry attempt ${backgroundRetryAttempt} was skipped safely because its retry chain is no longer active.`);
    try{await clearRetryTasks()}catch{/* best-effort fallback */};clearRetryState();
    return 0;
  }
  const {attempt,chain}=retryContext;
  if(attempt===0){try{await clearRetryTasks()}catch(e){appLog(`Could not remove an old retry task before the new daily check: ${compactError(e)}`)}}
  if(attempt===0&&machine.role==='backup'){appLog('Backup-computer check is waiting briefly so the main computer can finish a late run before this PC touches Classroom.');await delay(120000);}
  appLog(`Scheduled background run requested. Attempt=${attempt}; Mode=${cfg.dryRun?'DRY RUN':'LIVE'}; browser=background.`);
  if(cfg.dryRun){
    finishRetryChain(chain,{status:'NO_ACTION',message:'Automatic submissions are off.'});
    appLog('Scheduled background run skipped safely because automatic submissions are off.');
    try{await clearRetryTasks()}catch{/* best-effort fallback */}
    return 0;
  }
  try{
    const r=await runAutomation(false);
    const result=r.result||{status:'NO_ACTION',message:'Nothing needed to be submitted.',submitted:0,retryable:false};
    appLog(`Scheduled background run completed. Outcome=${result.status||'UNKNOWN'}.`);
    finishRetryChain(chain,result);
    try{await clearRetryTasks()}catch{/* best-effort fallback */}
    showRunNotification(result);
    if(result && ['BLOCKED','PARTIAL','FAILED'].includes(result.status)) return result.status==='PARTIAL'?3:2;
    if(result?.submitted>0) await delay(900);
    return 0;
  }catch(err){
    const parsed=err.runResult||parseRunResult(err.output);
    const result=normalizeRetryFailure(err,parsed);
    appLog(`Scheduled background attempt ${attempt} did not finish: ${compactError(err)}`);
    appLog(`Structured outcome=${result.status}; retryable=${!!result.retryable}; ${result.message||''}`);
    if(result.status==='FAILED'&&result.retryable){
      try{
        const scheduled=await scheduleNextRetry(chain,attempt,cfg,result);
        if(scheduled){
          appLog(`Temporary problem: retry ${scheduled.attempt} scheduled for ${scheduled.runAt}. No teacher notification is needed yet.`);
          return 0;
        }
      }catch(scheduleErr){
        appLog(`A retry could not be scheduled: ${compactError(scheduleErr)}`);
        const failed={status:'FAILED',message:'Auto Turn-In hit a temporary problem, but Windows could not schedule the automatic retry. Open the app and check Help & support.',submitted:0,retryable:false,errorType:'RETRY_SCHEDULE_FAILED'};
        finishRetryChain(chain,failed);showRunNotification(failed);await delay(900);return 1;
      }
    }
    finishRetryChain(chain,result);
    try{await clearRetryTasks()}catch{/* best-effort fallback */}
    showRunNotification(result);await delay(900);
    return Number(err.exitCode)||1;
  }
}
async function dashboard(){
  const cfg=loadConfig(),plans=loadPlans(),state=loadState();
  const courseId=parseClassroomIds(cfg.courseUrl).courseId;
  const year=schoolYearKey();
  const records=Object.values(state.submissions||{}).filter(r=>r&&r.courseId===courseId&&r.schoolYear===year&&r.confirmed);
  const autoSubmittedRecords=records.filter(r=>r.detected!==true);
  const completedWeeks=new Set(records.map(r=>Number(r.week)).filter(Number.isFinite));
  const anchorWeeks=[
    ...records.map(r=>Number(r.week)),
    Number(state.lastSubmission?.week),
    ...((cfg.safetyCertification?.verified||[]).map(v=>Number(v.week)))
  ].filter(n=>Number.isInteger(n)&&n>=1&&n<=52);
  const anchor=anchorWeeks.length?Math.max(...anchorWeeks):null;
  const pendingPlans=plans.filter(p=>!completedWeeks.has(Number(p.week))).sort((a,b)=>Number(a.week)-Number(b.week));
  const next=(anchor===null?pendingPlans[0]:pendingPlans.find(p=>Number(p.week)>=anchor))||pendingPlans[0]||null;
  const fingerprint=computeSafetyFingerprint(cfg,plans);
  const certified=!!cfg.safetyCertification && cfg.safetyCertification.fingerprint===fingerprint && Array.isArray(cfg.safetyCertification.verified) && cfg.safetyCertification.verified.length>0;
  const machine=getMachine();
  const scheduler=await getScheduleHealth();
  const manualOnly=String(machine?.role||'primary')==='manual';
  const schedulerReady=manualOnly
    ? !scheduler.exists&&!scheduler.retryActive&&!scheduler.retryProblem
    : (process.platform==='win32'?!!scheduler.healthy:!!cfg.schedule?.enabled);
  const localDataHealthy=!state.dataCorrupt&&!localDataIssues.has('config.json')&&!localDataIssues.has('plans.json');
  const readiness={classroom:!!cfg.courseUrl,topic:!!cfg.topicName,drive:!!cfg.driveFolderUrl,plans:plans.length>0,dryTest:certified,history:localDataHealthy,live:!cfg.dryRun,schedule:schedulerReady};
  // Optional AI data must never become a core Auto Turn-In blocker when the teacher
  // has not opted into that feature. Only core configuration/plan corruption belongs here.
  const coreIssueNames=new Set(['config.json','plans.json']);
  const dataBlockers=[...localDataIssues.entries()].filter(([file])=>coreIssueNames.has(file)).map(([file,message])=>({type:'DATA_CORRUPT',message:`${file}: ${message}`}));
  const machineBlockers=machine?.damaged?[{type:'MACHINE_DATA_CORRUPT',message:"This computer's Auto Turn-In identity could not be read safely. Automatic checks are paused until you save this computer again."}]:[];
  const currentBlockers=[...(state.currentBlockers||[]),...dataBlockers,...machineBlockers];
  const teacherBlockers=currentBlockers.map(b=>{const info=publicError(b?.message||b?.type||'', 'automation:run');return {...b,message:info.message,supportCode:info.code};});
  const teacherOutcome=o=>safeOutcomeForTeacher(o);
  const failureAt=Date.parse(state.lastFailure?.finishedAt||0)||0,successAt=Date.parse(state.lastSuccess?.finishedAt||0)||0;
  const unresolvedFailure=failureAt>successAt?teacherOutcome(state.lastFailure):null;
  const ai=aiPublicState();const pendingDrafts=ai.drafts.filter(d=>d.status==='ready');
  return {config:cfg,machine,plansCount:plans.length,submittedCount:autoSubmittedRecords.length,lastRun:state.lastRun,nextPlan:next,state:{...state,currentBlockers:undefined,dataCorrupt:!localDataHealthy},readiness,scheduler,lock:getRunLockInfo(),ai:{settings:ai.settings,pendingCount:pendingDrafts.length,drafts:ai.drafts.slice(0,20)},diagnostics:{lastOutcome:teacherOutcome(state.lastOutcome),lastSuccess:teacherOutcome(state.lastSuccess),lastFailure:teacherOutcome(state.lastFailure),unresolvedFailure,lastSubmission:state.lastSubmission,currentBlockers:teacherBlockers,recoveredFromBackupAt:state.recoveredFromBackupAt||null}};
}

function validSafetyCertification(cfg=loadConfig(),plans=loadPlans()){
  try{assertUniquePlans(plans)}catch{return false}
  const fingerprint=computeSafetyFingerprint(cfg,plans);
  return !!cfg.safetyCertification && cfg.safetyCertification.fingerprint===fingerprint && Array.isArray(cfg.safetyCertification.verified) && cfg.safetyCertification.verified.length>0;
}
async function finishFirstRunSetup(time){
  let cfg=loadConfig();
  if(!validSafetyCertification(cfg,loadPlans())) throw new Error('Run the safety check successfully before finishing setup.');
  cfg.schedule={...(cfg.schedule||{}),time:String(time||cfg.schedule?.time||'06:30')};
  saveConfig(cfg);
  const scheduled=await installSchedule();
  if(!scheduled?.health?.healthy) throw new Error('Windows could not confirm the automatic schedule. Try saving the schedule again.');
  cfg=loadConfig();
  if(!validSafetyCertification(cfg,loadPlans())) throw new Error('Setup changed while finishing. Run the safety check again.');
  cfg.dryRun=false;cfg.setupComplete=true;saveConfig(cfg);
  return {enabled:true,schedule:cfg.schedule,health:scheduled.health,retryOffsets:scheduled.retryOffsets};
}

function createWindow(){
  mainWindow=new BrowserWindow({width:1280,height:840,minWidth:820,minHeight:680,backgroundColor:'#f2f8fe',autoHideMenuBar:true,icon:path.join(__dirname,'assets','GoClassroom.ico'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:false}});
  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(!String(url).startsWith('file://'))event.preventDefault();});
  mainWindow.loadFile(path.join(__dirname,'renderer','index.html'));
}

app.whenReady().then(async()=>{
  if(!interactiveInstanceLock) return;
  ensureData();
  try{const c=loadConfig();const cleaned=cleanupDiagnostics(c.diagnosticRetentionDays||45);if(cleaned.removed)appLog(`Diagnostics cleanup removed ${cleaned.removed} expired file(s).`)}catch{/* best-effort fallback */}
  if(selfTestMode){const exitCode=await runPackagedSelfTest({app,dataDir,ensureData,loadConfig,getMachine,getSchedulerService,selfTestFile,selfTestUserData,selfTestBrowser,compactError});app.exit(exitCode);return;}
  if(backgroundMode){
    const exitCode=await runBackgroundAutomation();
    app.exit(exitCode);
    return;
  }
  if(app.isPackaged&&process.platform==='win32'){
    try{const repaired=await reconcileScheduleOnStartup();if(repaired?.repaired)appLog('Startup repaired the Windows automatic schedule after install/update.')}catch(e){appLog(`Startup schedule repair was not completed: ${compactError(e)}`)}
  }
  createWindow(); app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

handleIpc('dashboard:get',()=>dashboard());

handleIpc('machine:get',()=>getMachine());
handleIpc('machine:save',(_e,v)=>{ensureAutomationIdle();return saveMachine(v||{});});
handleIpc('setup:export-portable',async()=>{
  const r=await dialog.showSaveDialog({defaultPath:'Classroom-Auto-Turn-In-Setup.json',filters:[{name:'Auto Turn-In setup',extensions:['json']}]});
  if(r.canceled)return null;
  fs.writeFileSync(r.filePath,JSON.stringify(buildSetupExport(loadConfig()),null,2),'utf8');
  return r.filePath;
});
handleIpc('setup:import-portable',async()=>{
  ensureAutomationIdle();
  const r=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'Auto Turn-In setup',extensions:['json']}]});
  if(r.canceled)return null;
  const imported=parseSetupImport(fs.readFileSync(r.filePaths[0],'utf8'),loadConfig());
  if(process.platform==='win32'){try{await removeSchedule()}catch(e){appLog(`Could not remove the previous automatic schedule during setup import: ${compactError(e)}`)}}
  savePlans([]);
  const saved=saveConfig(imported);
  const machine=machineService.markImported();
  try{await clearRetryTasks()}catch{/* best-effort fallback */}
  clearRetryState();
  return {config:saved,machine,message:'Setup imported. This computer is set to manual only until you choose whether it should be the main or backup computer and run a new Safety Check.'};
});

handleIpc('config:get',()=>loadConfig());
handleIpc('config:save',(_e,v)=>{ensureAutomationIdle();return saveConfig({...loadConfig(),...v,schedule:{...loadConfig().schedule,...(v.schedule||{})}})});
handleIpc('setup:finish',(_e,time)=>{ensureAutomationIdle();return finishFirstRunSetup(time)});
handleIpc('plans:get',()=>loadPlans());
handleIpc('plans:save',(_e,v)=>{ensureAutomationIdle();return savePlans(v)});
handleIpc('plans:import',async()=>{ensureAutomationIdle();const r=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'Auto Turn-In plan lists',extensions:['csv','json']}]});if(r.canceled)return null;const p=r.filePaths[0],txt=fs.readFileSync(p,'utf8');const plans=(p.toLowerCase().endsWith('.json')?JSON.parse(txt):parseCsv(txt,normalizePlan)).map(x=>({...x,source:'import'}));return savePlans(plans)});
handleIpc('plans:export',async()=>{const plans=loadPlans();const r=await dialog.showSaveDialog({defaultPath:'classroom-auto-turn-in-plans.csv',filters:[{name:'Auto Turn-In plan list',extensions:['csv']}]});if(r.canceled)return null;fs.writeFileSync(r.filePath,toCsv(plans));return r.filePath});
handleIpc('course:select',async()=>withExclusiveBrowserOperation('Classroom selection',async()=>{const out=await runNodeScript('select-course.js');return lastPayload(out,'course')||{courseUrl:loadConfig().courseUrl,courseDisplayName:loadConfig().courseDisplayName}}));
handleIpc('topics:discover',async()=>withExclusiveBrowserOperation('Classroom topic check',async()=>{const out=await runNodeScript('discover-topics.js');const topics=lastPayload(out,'topics');return Array.isArray(topics)?topics:[]}));
handleIpc('drive:select-folder',async()=>withExclusiveBrowserOperation('Drive folder selection',async()=>{const out=await runNodeScript('select-drive-folder.js');return lastPayload(out,'drive-folder')||{driveFolderUrl:loadConfig().driveFolderUrl,driveFolderName:loadConfig().driveFolderName}}));
handleIpc('environment:check',async()=>{const out=await runNodeScript('preflight.js',[],false);return lastPayload(out,'preflight')||{ready:false}});
handleIpc('drive:scan-folder',async()=>withExclusiveBrowserOperation('Drive folder check',()=>scanAndSaveDrivePlans()));
handleIpc('automation:run',async(_e,dry)=>runAutomation(!!dry));
handleIpc('automation:set-live',async(_e,enabled)=>{
  ensureAutomationIdle();
  if(enabled){
    const cfg=loadConfig(),plans=loadPlans();
    try{assertUniquePlans(plans)}catch(e){const info=userSafeError('automation:set-live',e);return {enabled:false,cancelled:true,reason:`CATI_UI|${info.code}|${info.message}`}}
    if(!validSafetyCertification(cfg,plans)) return {enabled:false,cancelled:true,reason:'CATI_UI|AT-SAFE-101|The current setup has not passed a Safety Check. Run the Safety Check again after confirming the Classroom, topic, and Drive folder.'};
    const ans=await dialog.showMessageBox({type:'warning',buttons:['Cancel','Turn on automatic turn-in'],defaultId:0,cancelId:0,title:'Turn on automatic turn-in?',message:'Auto Turn-In may attach the matching lesson plan and turn in the Classroom assignment when it is due.',detail:'If the Classroom, topic, Drive folder, or naming setup changes later, automatic turn-in will pause until another Safety Check passes.'});
    if(ans.response!==1)return {enabled:false,cancelled:true};
  }
  const cfg=loadConfig();cfg.dryRun=!enabled;saveConfig(cfg);return {enabled:!cfg.dryRun};
});
handleIpc('schedule:install',()=>{ensureAutomationIdle();return installSchedule()});
handleIpc('schedule:remove',()=>{ensureAutomationIdle();return removeSchedule()});
handleIpc('schedule:health',()=>getScheduleHealth());
handleIpc('ai:get-state',()=>aiPublicState());
handleIpc('ai:save-settings',(_e,v)=>saveAiSettings(v||{}));
handleIpc('ai:open-draft',async(_e,id)=>{const d=getAiDraft(id);if(!d)throw new Error('That AI draft no longer exists.');const r=await shell.openPath(d.localFile);if(r)throw new Error(r);return true});
handleIpc('ai:open-folder',()=>shell.openPath(draftsDir()));
handleIpc('ai:open-provider-setup',async(_e,provider)=>{const links={groq:'https://console.groq.com/keys',gemini:'https://aistudio.google.com/app/apikey',openrouter:'https://openrouter.ai/settings/keys',openai:'https://platform.openai.com/api-keys'},url=links[String(provider||'').toLowerCase()];if(!url)throw new Error('Choose a supported AI service first.');await shell.openExternal(url);return true});
handleIpc('ai:regenerate',async(_e,id,weekNotes)=>{ensureAutomationIdle();const d=getAiDraft(id);if(!d)throw new Error('That AI draft no longer exists.');return createAiDraftForBlocker({week:d.week,assignmentTitle:d.assignmentTitle,dueText:d.dueText,cardText:d.cardText},{weekNotes:String(weekNotes||''),force:true})});
handleIpc('ai:approve',async(_e,id)=>approveAiDraft(id));
handleIpc('ai:dismiss',(_e,id)=>{ensureAutomationIdle();const all=loadAiDrafts();const d=all.find(x=>x.id===id);if(!d)throw new Error('That AI draft no longer exists.');d.status='dismissed';d.updatedAt=new Date().toISOString();saveAiDrafts(all);return d});
handleIpc('grading:get-state',()=>gradingState());
handleIpc('grading:save-settings',(_e,v)=>saveGradingSettings(v||{}));
handleIpc('grading:grade',(_e,v)=>createDraftGrade(v||{}));
handleIpc('grading:select-classroom',()=>selectGradingClassroom());
handleIpc('grading:remove-classroom',(_e,courseId)=>removeGradingClassroom(courseId));
handleIpc('grading:discover-classroom',(_e,courseId)=>discoverGradingAssignments(courseId));handleIpc('grading:discover-my-classrooms',()=>getGradingService().discoverTeachingClassrooms());
handleIpc('grading:process-classroom',(_e,v)=>processClassroomGrading(v||{}));
handleIpc('grading:select-review-folder',()=>selectGradingReviewFolder());
handleIpc('grading:open-review-folder',()=>openGradingReviewFolder());
handleIpc('roster:get-state',()=>rosterIntegration.state());
handleIpc('roster:discover',()=>rosterIntegration.discover());handleIpc('roster:read-operations',()=>rosterIntegration.readOperationsRoster());
handleIpc('roster:apply-safe',()=>applyApprovedRosterChanges());
handleIpc('roster:save-mappings',(_e,v)=>rosterIntegration.saveMappings(v));
handleIpc('diagnostics:cleanup',()=>{const cfg=loadConfig();return cleanupDiagnostics(cfg.diagnosticRetentionDays||45)});
handleIpc('logs:open',()=>{const dir=path.join(dataDir(),'logs');fs.mkdirSync(dir,{recursive:true});return shell.openPath(dir)});
