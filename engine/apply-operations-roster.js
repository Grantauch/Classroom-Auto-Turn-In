const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {emit,emitError}=require('./protocol');
const {resolveAppsScriptBridgeFrame}=require('./apps-script-frame');
const {decodeBridgeArg,validateBridge,teacherUrl,validateWriteRequest,validateWriteResult}=require('./operations-roster-bridge');

(async()=>{
  const payload=decodeBridgeArg(process.argv[2]);
  const bridge=validateBridge(payload?.bridge||{}),request=validateWriteRequest(payload?.request||{},{studentEmailDomain:bridge.studentEmailDomain});
  const recoveryResolution=payload?.recoveryResolution&&typeof payload.recoveryResolution==='object'?{confirmation:String(payload.recoveryResolution.confirmation||'')}:null;
  if(!bridge.writeContract)throw new Error('The Hall Pass / Check-In roster write contract is missing. Compare rosters again.');
  const cfg=loadConfig(),context=await launchTeacherContext(cfg,{headless:false});
  try{
    const page=context.pages()[0]||await context.newPage();
    emit('status',{message:'Applying only the roster additions and name updates you approved.'});
    await page.goto(teacherUrl(bridge.url),{waitUntil:'domcontentloaded',timeout:60000});
    if(/accounts\.google\.com/i.test(page.url()))throw new Error('Sign in to the school Google account in GoClassroom before applying roster changes.');
    const bridgeFrame=await resolveAppsScriptBridgeFrame(page,{timeoutMs:35000});
    const raw=await bridgeFrame.evaluate(({request,writeContract,recoveryResolution})=>new Promise((resolve,reject)=>{
      try{
        google.script.run
          .withSuccessHandler(value=>resolve(value))
          .withFailureHandler(error=>reject(new Error(String(error&&error.message||error||'Roster write failed.'))))
          .applyRosterSyncChanges(request,writeContract,recoveryResolution);
      }catch(error){reject(error)}
    }),{request,writeContract:bridge.writeContract,recoveryResolution});
    if(raw&&raw.ok===false&&String(raw.status||'')==='RECOVERY_REVIEW_REQUIRED'){
      const error=new Error(String(raw.message||'The pending roster batch needs teacher review before it can be resolved.'));
      error.code='ROSTER_RECOVERY_REVIEW_REQUIRED';error.retryable=false;throw error;
    }
    if(raw&&raw.ok===false&&String(raw.status||'')==='RECOVERY_RELEASED_FOR_RECOMPARE'){
      if(String(raw.requestId||'')!==request.requestId||String(raw.writeContract||'')!==bridge.writeContract)throw new Error('GoClassroom could not verify the reviewed roster recovery release. The pending request remains protected.');
      emit('operations-roster-recovery-released',raw);return;
    }
    if(raw&&raw.ok===false&&String(raw.status||'')==='REJECTED_NO_ROSTER_EFFECTS'){
      const error=new Error(String(raw.message||'The roster changed before anything was applied. Compare rosters again.'));
      error.code='ROSTER_REJECTED_NO_EFFECTS';error.retryable=false;throw error;
    }
    const result=validateWriteResult(raw,{requestId:request.requestId,baseRevision:request.baseRevision,writeContract:bridge.writeContract,addCount:request.add.length,updateNameCount:request.updateName.length});
    log(`Applied approved GoClassroom roster batch ${result.requestId}: ${result.counts.added} added, ${result.counts.reactivated} reactivated, ${result.counts.nameRowsUpdated} name update(s). No removals were requested.`);
    emit('operations-roster-applied',result);
  }finally{await context.close().catch(()=>{})}
})().catch(error=>{emitError(error);process.exit(1)});
