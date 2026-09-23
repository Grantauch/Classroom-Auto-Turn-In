const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {emit,emitError}=require('./protocol');
const {decodeBridgeArg,validateBridge,teacherUrl,validateWriteRequest,validateWriteResult}=require('./operations-roster-bridge');

(async()=>{
  const payload=decodeBridgeArg(process.argv[2]);
  const bridge=validateBridge(payload?.bridge||{}),request=validateWriteRequest(payload?.request||{});
  if(!bridge.writeContract)throw new Error('The Hall Pass / Check-In roster write contract is missing. Compare rosters again.');
  const cfg=loadConfig(),context=await launchTeacherContext(cfg,{headless:false});
  try{
    const page=context.pages()[0]||await context.newPage();
    emit('status',{message:'Applying only the roster additions and name updates you approved.'});
    await page.goto(teacherUrl(bridge.url),{waitUntil:'domcontentloaded',timeout:60000});
    if(/accounts\.google\.com/i.test(page.url()))throw new Error('Sign in to the school Google account in GoClassroom before applying roster changes.');
    await page.waitForFunction(()=>Boolean(window.google&&google.script&&google.script.run),{timeout:35000});
    const raw=await page.evaluate(({request,writeContract})=>new Promise((resolve,reject)=>{
      try{
        google.script.run
          .withSuccessHandler(value=>resolve(value))
          .withFailureHandler(error=>reject(new Error(String(error&&error.message||error||'Roster write failed.'))))
          .applyRosterSyncChanges(request,writeContract);
      }catch(error){reject(error)}
    }),{request,writeContract:bridge.writeContract});
    const result=validateWriteResult(raw,{requestId:request.requestId,baseRevision:request.baseRevision,writeContract:bridge.writeContract,addCount:request.add.length,updateNameCount:request.updateName.length});
    log(`Applied approved GoClassroom roster batch ${result.requestId}: ${result.counts.added} added, ${result.counts.reactivated} reactivated, ${result.counts.nameRowsUpdated} name update(s). No removals were requested.`);
    emit('operations-roster-applied',result);
  }finally{await context.close().catch(()=>{})}
})().catch(error=>{emitError(error);process.exit(1)});
