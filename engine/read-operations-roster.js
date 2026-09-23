const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {emit,emitError}=require('./protocol');
const {resolveAppsScriptBridgeFrame}=require('./apps-script-frame');
const {decodeBridgeArg,validateBridge,teacherUrl,validateOperationsPayload}=require('./operations-roster-bridge');

(async()=>{
  const bridge=validateBridge(decodeBridgeArg(process.argv[2]));
  const cfg=loadConfig(),context=await launchTeacherContext(cfg,{headless:false});
  try{
    const page=context.pages()[0]||await context.newPage();
    emit('status',{message:'Reading the current Hall Pass / Check-In roster for comparison.'});
    await page.goto(teacherUrl(bridge.url),{waitUntil:'domcontentloaded',timeout:60000});
    if(/accounts\.google\.com/i.test(page.url()))throw new Error('Sign in to the school Google account in GoClassroom before comparing rosters.');
    const bridgeFrame=await resolveAppsScriptBridgeFrame(page,{timeoutMs:35000});
    const raw=await bridgeFrame.evaluate(({contract})=>new Promise((resolve,reject)=>{
      try{
        google.script.run
          .withSuccessHandler(value=>resolve(value))
          .withFailureHandler(error=>reject(new Error(String(error&&error.message||error||'Roster bridge failed.'))))
          .getRosterSyncSnapshot(contract);
      }catch(error){reject(error)}
    }),{contract:bridge.contract});
    const result=validateOperationsPayload(raw,bridge.contract);
    log(`Read ${result.roster.length} active Hall Pass / Check-In roster membership${result.roster.length===1?'':'s'} through the read-only GoClassroom bridge.`);
    emit('operations-roster',result);
  }finally{await context.close().catch(()=>{})}
})().catch(error=>{emitError(error);process.exit(1)});
