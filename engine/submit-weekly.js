const { launchTeacherContext } = require('./browser');
const path = require('path');
const {spawn} = require('child_process');
const {loadConfig,loadPlans,savePlans,loadState,saveState,log,screenshotPath,acquireRunLock,releaseRunLock} = require('./lib');
const {assertUniquePlans,computeSafetyFingerprint,extractGoogleFileId,parseClassroomIds,schoolYearKey,stateKey} = require('./safety');
const {assertGoogleSession,maybeClick,isSubmitted,isReturned,getSubmissionAction,verifyPlanAttachment,assertSafeAttachmentSet,attachLink,verifyDryRunControls,submitAssignment}=require('./classroom-actions');
const {emit,lastPayload,lastError,parseLine}=require('./protocol');
const {getAssignmentLinks}=require('./classroom-discovery');
const {isTransientFailure}=require('./transient-error');
const {savePageEvidence}=require('./page-evidence');
const {buildEligibilityQueues,openVerifiedAssignmentDetail}=require('./due-date-resolution');

const forceDry = process.argv.includes('--dry-run');

const runId=`${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${process.pid}`;
const runStartedAt=new Date().toISOString();
let activeLock=null;
let activeState=null;
let runMode=forceDry?'DRY RUN':'LIVE';
const runStats={submitted:0,alreadyCompleted:0,verifiedDry:0,candidates:0,deferred:0,blockers:[],warnings:[]};

function addBlocker(type,message,extra={}){
  const b={type,message,...extra}; runStats.blockers.push(b); log(`BLOCKER [${type}]: ${message}`); return b;
}
function classifyFailure(err){
  const msg=String(err?.message||err||'Unknown failure');
  const code=String(err?.code||'');
  if(code==='RUN_LOCKED') return {status:'BLOCKED',retryable:false,type:'RUN_LOCKED'};
  if(code==='DATA_CORRUPT') return {status:'BLOCKED',retryable:false,type:'DATA_CORRUPT'};
  if(code==='AUTH_REQUIRED'||/sign[ -]?in|session expired|choose an account|accounts\.google\.com/i.test(msg)) return {status:'BLOCKED',retryable:false,type:'AUTH_REQUIRED'};
  if(/safety certificate|duplicate|invalid|configured|selected topic|matching lesson-plan assignments|unexpected attachment|due date could not|Your work attachment area/i.test(msg)) return {status:'BLOCKED',retryable:false,type:'CONFIGURATION'};
  if(isTransientFailure(err)) return {status:'FAILED',retryable:true,type:'TRANSIENT'};
  return {status:'FAILED',retryable:false,type:'UNEXPECTED'};
}
function persistOutcome(result){
  if(!activeState) return;
  activeState.lastRun=result.finishedAt;
  activeState.lastAttempt=result;
  activeState.lastOutcome=result;
  activeState.currentBlockers=Array.isArray(result.blockers)?result.blockers:[];
  activeState.runHistory=[...(activeState.runHistory||[]),result].slice(-50);
  if(['SUCCESS','NO_ACTION'].includes(result.status)) activeState.lastSuccess=result;
  else activeState.lastFailure=result;
  saveState(activeState);
}
function makeOutcome(status,message,{retryable=false,errorType=null}={}){
  return {
    schema:1,runId,mode:runMode,status,retryable,errorType,
    startedAt:runStartedAt,finishedAt:new Date().toISOString(),message,
    submitted:runStats.submitted,alreadyCompleted:runStats.alreadyCompleted,
    verifiedDry:runStats.verifiedDry,candidates:runStats.candidates,deferred:runStats.deferred,
    blockers:runStats.blockers,warnings:runStats.warnings
  };
}
function emitOutcome(result){ emit('run-result',result); }
const SAFETY_PROBE_LIMIT=6;
function startOfToday(){ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(); }
async function openClassworkPage(page,cfg){
  const {courseId}=parseClassroomIds(cfg.courseUrl);
  const onClasswork=()=>{const ids=parseClassroomIds(page.url());return /\/w\//.test(new URL(page.url()).pathname)&&ids.courseId===courseId;};
  await maybeClick(page.getByText('Classwork',{exact:true}),2200);
  await page.waitForTimeout(1600);
  if(courseId&&!onClasswork()){
    const prefix=(new URL(cfg.courseUrl).pathname.match(/^\/u\/\d+/)||[''])[0];
    const url=`https://classroom.google.com${prefix}/w/${courseId}/t/all`;
    log(`Opening the Classwork page directly: ${url}`);
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForTimeout(1600);
  }
}
async function safeScreenshot(page,label){
  try{
    const file=screenshotPath(label);
    await page.screenshot({path:file,fullPage:true});
    return true;
  }catch(e){
    const message=`Troubleshooting screenshot could not be saved (${label}): ${String(e?.message||e)}`;
    runStats.warnings.push(message);
    log(message);
    return false;
  }
}
async function refreshTrustedDrivePlans(cfg){
  if(!cfg.driveFolderUrl) return loadPlans();
  log('Checking the approved Google Drive folder for new or updated weekly plans.');
  const script=path.join(__dirname,'scan-drive-folder.js');
  const output=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[script],{env:process.env,windowsHide:true});let out='',settled=false;
    const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(value)};
    const timer=setTimeout(()=>{
      try{if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL')}catch{/* best-effort fallback */}
      const e=new Error('The approved Drive folder check took too long and was stopped safely.');e.code='CHILD_TIMEOUT';finish(e);
    },4*60*1000);
    const collect=d=>{const t=d.toString();out=(out+t).slice(-5_000_000);for(const line of t.split(/\r?\n/).filter(Boolean)){const ev=parseLine(line);if(!ev||!['drive-plans','status'].includes(ev.type))log(`Drive check: ${ev?.type==='error'?(ev.payload?.message||'Drive check failed'):line}`)}};
    child.stdout.on('data',collect);child.stderr.on('data',collect);child.on('error',e=>finish(e));child.on('exit',code=>{if(settled)return;if(code===0)return finish(null,out);const pe=lastError(out);finish(new Error(pe?.message||'The Drive folder check stopped before it finished.'))});
  });
  const discovered=lastPayload(output,'drive-plans');
  if(!Array.isArray(discovered)) throw new Error('The approved Drive folder was checked, but no usable lesson-plan list was returned.');
  assertUniquePlans(discovered);
  const existing=loadPlans();
  const priorDrive=new Map(existing.filter(p=>p.source==='drive-folder').map(p=>[Number(p.week),p]));
  const manual=existing.filter(p=>p.source!=='drive-folder');
  const synced=discovered.map(p=>({...p,week:Number(p.week),weekOf:priorDrive.get(Number(p.week))?.weekOf||p.weekOf||'',source:'drive-folder'}));
  const combined=[...manual,...synced];assertUniquePlans(combined);savePlans(combined);
  log(`Approved Drive folder is current: ${synced.length} matching weekly plan(s) available.`);
  return loadPlans();
}


(async()=>{
  const cfg=loadConfig();
  const dry=forceDry || cfg.dryRun;
  runMode=dry?'DRY RUN':'LIVE';
  activeLock=acquireRunLock();
  if (!cfg.courseUrl) throw new Error('No Classroom course is configured.');
  const plans=await refreshTrustedDrivePlans(cfg);
  assertUniquePlans(plans);
  const state=loadState();
  activeState=state;
  state.lastAttempt={schema:1,runId,mode:runMode,status:'RUNNING',startedAt:runStartedAt,finishedAt:null,message:'Automation run is in progress.',submitted:0,blockers:[]};
  saveState(state);
  let regex;
  try{regex=new RegExp(cfg.assignmentTitleRegex,'i');}catch(e){throw new Error(`Assignment title pattern is invalid: ${e.message}`);}
  const safetyFingerprint=computeSafetyFingerprint(cfg,plans);
  if(!dry){
    const cert=cfg.safetyCertification;
    const certified=!!cert && cert.fingerprint===safetyFingerprint && Array.isArray(cert.verified) && cert.verified.length>0;
    if(!certified) throw new Error('LIVE run blocked: the current setup does not have a valid dry-run safety certificate. Run a new safety test for this exact configuration.');
  }
  const year=schoolYearKey();
  const context=await launchTeacherContext(cfg);
  const page=context.pages()[0] || await context.newPage();
  const verifiedDry=[];
  log(`Run started. Mode=${dry?'DRY RUN':'LIVE'}. Safety fingerprint=${safetyFingerprint.slice(0,12)}.`);
  try {
    await page.goto(cfg.courseUrl,{waitUntil:'domcontentloaded',timeout:30000});
    await assertGoogleSession(page,'Google Classroom');
    await page.waitForTimeout(1500);
    await openClassworkPage(page,cfg);
    await assertGoogleSession(page,'Classwork');

    const links=await getAssignmentLinks(page,regex,cfg);
    log(`Selected topic "${cfg.topicName}" exposes matching week(s): ${links.map(x=>x.week).join(', ')}.`);
    const classworkUrl=page.url();
    const {candidates,ineligible,missingPlans}=await buildEligibilityQueues({page,links,plans,cfg,classworkUrl,regex,addBlocker});
    // A safety test is non-mutating, so it may verify a correctly matched
    // assignment that is not due today. Prefer the nearest upcoming week, then
    // the most recent earlier week. Several are queued because weeks that are
    // already turned in cannot certify the Turn in controls.
    if(dry && ineligible.length){
      const upcoming=ineligible.filter(x=>x.plan&&Number(x.eligibility?.time)>=startOfToday()).sort((a,b)=>a.eligibility.time-b.eligibility.time);
      const earlier=ineligible.filter(x=>x.plan&&Number(x.eligibility?.time)<startOfToday()).sort((a,b)=>b.eligibility.time-a.eligibility.time);
      const probes=[...upcoming,...earlier].filter(x=>!candidates.some(c=>Number(c.week)===Number(x.week))).slice(0,SAFETY_PROBE_LIMIT);
      for(const probe of probes) candidates.push({...probe,safetyOnly:true});
      if(probes.length) log(`Safety test fallback queued: Week ${probes.map(p=>`${p.week} (${p.reason})`).join(', ')}. The first one that is not already turned in is verified; no attachment or submission will occur.`);
    }
    runStats.candidates=candidates.length;
    log(`Found ${links.length} matching assignment(s) in the selected topic; ${candidates.filter(x=>x.eligibility?.eligible).length} are date-eligible and have exactly one matching plan.`);
    if (missingPlans.length) log(`No plan mapping exists for week(s): ${missingPlans.join(', ')}.`);
    if (ineligible.length) log(`Waiting week(s): ${ineligible.map(x=>`${x.week} (${x.reason}${x.date?`, ${x.date}`:''})`).join('; ')}.`);

    let submitted=0;
    for (const item of candidates) {
      if(dry && verifiedDry.length) break;
      if (submitted>=cfg.maxSubmissionsPerRun) { runStats.deferred=Math.max(0,candidates.length-candidates.indexOf(item)); log(`Submission cap reached; ${runStats.deferred} candidate(s) deferred to the next check.`); break; }
      const opened=await openVerifiedAssignmentDetail(page,item,classworkUrl,regex,cfg);
      if (!opened) {
        await savePageEvidence(page,`ERROR-open-week-${item.week}`).catch(()=>{});
        addBlocker('ASSIGNMENT_OPEN_FAILED',`Week ${item.week} is eligible, but its assignment detail page could not be opened safely.`,{week:item.week});
        continue;
      }

      // Re-read identity from the actual detail page before any attachment or
      // submission action. Course ID + assignment ID become the durable state key.
      const identity=opened.identity;
      const key=stateKey(identity.courseId,identity.assignmentId);
      log(`Week ${item.week}: verified assignment identity ${identity.courseId}/${identity.assignmentId} (${identity.title}).`);

      // Returned work may expose Turn in again. It requires human review;
      // never automatically resubmit it or claim it is a new confirmed turn-in.
      if(await isReturned(page)){
        const message=`Week ${item.week}: Classroom marks this work Returned. Left unchanged; any requested revision must be reviewed and submitted manually.`;
        log(message);runStats.warnings.push(message);continue;
      }

      if (await isSubmitted(page)) {
        state.submissions[key]={
          when:new Date().toISOString(),courseId:identity.courseId,assignmentId:identity.assignmentId,
          schoolYear:year,week:item.week,title:identity.title,plan:item.plan.title,detected:true,confirmed:true
        };
        saveState(state); runStats.alreadyCompleted++;
        log(`Week ${item.week}: already completed in Classroom; recorded by assignment ID and skipped.`);
        continue;
      }

      const priorRecord=state.submissions[key];
      const attachment=await verifyPlanAttachment(page,item.plan,1200);
      if (!dry && priorRecord) {
        const actionStillVisible=await getSubmissionAction(page);
        if (!actionStillVisible) {
          addBlocker('STATE_UNCONFIRMED',`Week ${item.week} has a prior local record, but Classroom shows neither a positive Turned in/Submitted state nor a submission button. Nothing was assumed or clicked.`,{week:item.week,assignmentId:identity.assignmentId});
          continue;
        }
        if (priorRecord.confirmed) {
          addBlocker('STATE_CONFLICT',`Week ${item.week} is locally confirmed, but Classroom still shows ${actionStillVisible.label}. No click was attempted.`,{week:item.week,assignmentId:identity.assignmentId});
          continue;
        }
        if (!attachment.verified) {
          addBlocker('RECOVERY_ATTACHMENT_MISSING',`Week ${item.week} has an unconfirmed prior record, but the exact plan is not visible inside Your work.`,{week:item.week,assignmentId:identity.assignmentId});
          continue;
        }

        try{await assertSafeAttachmentSet(page,item.plan)}catch(e){addBlocker('UNEXPECTED_ATTACHMENT',e.message,{week:item.week,assignmentId:identity.assignmentId});continue}
        log(`Week ${item.week}: RECOVERY - exact plan verified (${attachment.method}) with no unexpected attachments; finalizing ${actionStillVisible.label} without adding another attachment.`);
        try {
          if(await isSubmitted(page)){
            Object.assign(priorRecord,{confirmed:true,confirmedWhen:new Date().toISOString(),confirmedBy:'Classroom completed state before final click',detected:true});
            saveState(state);runStats.alreadyCompleted++;log(`Week ${item.week}: another Auto Turn-In computer or the teacher completed the assignment before the recovery click; no second click was attempted.`);continue;
          }
          const submitResult=await submitAssignment(page);
          Object.assign(priorRecord,{confirmed:true,confirmedWhen:new Date().toISOString(),confirmedBy:submitResult.confirmedBy,action:submitResult.label,detected:submitResult.alreadyCompleted===true||priorRecord.detected===true});
          saveState(state);
          if(submitResult.alreadyCompleted){runStats.alreadyCompleted++;log(`Week ${item.week}: another computer completed Classroom during final recovery confirmation; no confirmation click was sent.`);}
          else {submitted++;runStats.submitted++;state.lastSubmission={when:new Date().toISOString(),week:item.week,courseId:identity.courseId,assignmentId:identity.assignmentId,title:identity.title,plan:item.plan.title};saveState(state);log(`Week ${item.week}: RECOVERY COMPLETE - ${submitResult.label.toUpperCase()} confirmed (${submitResult.confirmedBy}).`);}
        } catch (e) {
          await safeScreenshot(page,`ERROR-recovery-week-${item.week}`);
          log(`Week ${item.week}: RECOVERY ERROR ${e.message}`); throw e;
        }
        continue;
      }

      log(`Week ${item.week}: unsubmitted assignment found (${identity.title}).`);
      if (dry) {
        const check=await verifyDryRunControls(page,item.plan);
        verifiedDry.push({
          courseId:identity.courseId,assignmentId:identity.assignmentId,schoolYear:year,
          week:item.week,assignmentTitle:identity.title,planTitle:item.plan.title,
          planFileId:extractGoogleFileId(item.plan.url),controlVerification:check
        });
        runStats.verifiedDry++;
        log(`Week ${item.week}: DRY RUN verified assignment identity + plan mapping + ${check}.`);
        await safeScreenshot(page,`dry-week-${item.week}`);
        continue;
      }

      try {
        let attachResult;
        try { attachResult=await attachLink(page,item.plan); }
        catch (attachErr) {
          // No submission control has been clicked yet. If Classroom now shows
          // this assignment as completed, another computer or the teacher
          // finished it while the plan was being attached.
          if (await isSubmitted(page)) {
            state.submissions[key]={when:new Date().toISOString(),courseId:identity.courseId,assignmentId:identity.assignmentId,schoolYear:year,week:item.week,title:identity.title,plan:item.plan.title,detected:true,confirmed:true,confirmedBy:'Classroom completed state while attaching'};
            saveState(state);runStats.alreadyCompleted++;log(`Week ${item.week}: Classroom shows it completed while the plan was being attached (${attachErr.message}); nothing else was clicked.`);continue;
          }
          throw attachErr;
        }
        log(`Week ${item.week}: ${attachResult} (${item.plan.url}).`);
        // A second Windows PC may have completed the same assignment while this
        // one was attaching/verifying the plan. Re-check shared Classroom state
        // immediately before the final click and stop if completion is now visible.
        if(await isSubmitted(page)){
          state.submissions[key]={when:new Date().toISOString(),courseId:identity.courseId,assignmentId:identity.assignmentId,schoolYear:year,week:item.week,title:identity.title,plan:item.plan.title,detected:true,confirmed:true,confirmedBy:'Classroom completed state before final click'};
          saveState(state);runStats.alreadyCompleted++;log(`Week ${item.week}: Classroom became completed before the final click; no second submission was attempted.`);continue;
        }
        // attachLink refuses to return until the exact attachment is visible in
        // Your work. Only then can the final Classroom submission action run.
        const submitResult=await submitAssignment(page);
        state.submissions[key]={
          when:new Date().toISOString(),courseId:identity.courseId,assignmentId:identity.assignmentId,
          schoolYear:year,week:item.week,title:identity.title,plan:item.plan.title,
          planFileId:extractGoogleFileId(item.plan.url),action:submitResult.label,
          confirmed:true,confirmedBy:submitResult.confirmedBy,detected:submitResult.alreadyCompleted===true
        };
        saveState(state);
        if(submitResult.alreadyCompleted){runStats.alreadyCompleted++;log(`Week ${item.week}: Classroom became completed during the final confirmation window; no confirmation click was sent.`);}
        else {submitted++;runStats.submitted++;state.lastSubmission={when:new Date().toISOString(),week:item.week,courseId:identity.courseId,assignmentId:identity.assignmentId,title:identity.title,plan:item.plan.title};saveState(state);log(`Week ${item.week}: ${submitResult.label.toUpperCase()} confirmed successfully (${submitResult.confirmedBy}).`);}
      } catch (e) {
        await safeScreenshot(page,`ERROR-week-${item.week}`);
        log(`Week ${item.week}: ERROR ${e.message}`); throw e;
      }
    }

    if (dry) {
      if (verifiedDry.length) {
        const cert={schema:1,fingerprint:safetyFingerprint,schoolYear:year,verified:verifiedDry};
        emit('dry-cert',cert);
        log(`Dry-run safety certificate created for ${verifiedDry.length} verified assignment(s).`);
      } else {
        log('Safety test completed without a certifiable matching assignment. Automatic turn-in approval remains disabled.');
      }
    }
    if (cfg.screenshotOnEveryRun) await safeScreenshot(page,'final');
    let status='NO_ACTION';
    let message=dry ? (verifiedDry.length?`Safety test verified ${verifiedDry.length} matching assignment(s) and the submission controls.`:'Safety test could not find a matching assignment it could safely verify.') : 'No eligible unsubmitted assignments required action.';
    if(runStats.blockers.length && runStats.submitted>0){status='PARTIAL';message=`Submitted ${runStats.submitted} assignment(s), but ${runStats.blockers.length} blocker(s) need attention.`;}
    else if(runStats.blockers.length){status='BLOCKED';message=`No unsafe action was taken; ${runStats.blockers.length} blocker(s) need attention.`;}
    else if(runStats.submitted>0){status='SUCCESS';message=`Successfully submitted ${runStats.submitted} assignment(s).`;}
    else if(dry && verifiedDry.length){status='SUCCESS';}
    const result=makeOutcome(status,message,{retryable:false});
    persistOutcome(result); emitOutcome(result);
    log(`Run complete. Outcome=${status}. New live submissions=${submitted}. Dry verifications=${verifiedDry.length}. Blockers=${runStats.blockers.length}.`);
    return result;
  } catch (e) {
    if (e?.code!=='AUTH_REQUIRED') await savePageEvidence(page,'ERROR-run').catch(()=>{});
    throw e;
  } finally { await context.close(); }
})().then(result=>{
  releaseRunLock(activeLock); activeLock=null;
  if(['BLOCKED','PARTIAL','FAILED'].includes(result.status)) process.exitCode=result.status==='PARTIAL'?3:2;
}).catch(e=>{
  const failure=classifyFailure(e);
  if(failure.type!=='RUN_LOCKED') addBlocker(failure.type,String(e?.message||e));
  const result=makeOutcome(failure.status,String(e?.message||e),{retryable:failure.retryable,errorType:failure.type});
  try { persistOutcome(result); } catch{/* best-effort fallback */}
  emitOutcome(result);
  log(`FATAL [${failure.type}]: ${e.stack||e.message}`);
  releaseRunLock(activeLock); activeLock=null;
  process.exitCode=failure.status==='BLOCKED'?2:1;
});
