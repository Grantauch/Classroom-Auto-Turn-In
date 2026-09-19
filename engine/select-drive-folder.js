const { launchTeacherContext } = require('./browser');
const { loadConfig, saveConfig, log } = require('./lib');
const {driveFolderId,driveFolderDisplayName,createDriveFolderPickerBridge}=require('./drive-picker');

const {emit,emitError}=require('./protocol');
(async()=>{
  const cfg=loadConfig();
  const context=await launchTeacherContext(cfg);
  let bridge,timer,selectionTimeout;
  try{
    const page=context.pages()[0] || await context.newPage();
    let resolvePick,rejectPick;
    const picked=new Promise((resolve,reject)=>{resolvePick=resolve;rejectPick=reject});
    bridge=await createDriveFolderPickerBridge(context,payload=>resolvePick(payload),{onCancel:()=>rejectPick(new Error('Drive folder selection was canceled.'))});
    await page.goto(cfg.driveFolderUrl || 'https://drive.google.com/drive/my-drive',{waitUntil:'domcontentloaded',timeout:30000});
    if(/https?:\/\/accounts\.google\.com\//i.test(page.url())) emit('status',{message:'Sign in to Google, then open the folder that contains your weekly lesson plans.'});
    else emit('status',{message:'Navigate into the folder that contains your weekly lesson plans, then click the blue "Use this folder" button.'});

    timer=setInterval(()=>bridge.inject().catch(()=>{}),700);
    await bridge.inject();
    const timeout=new Promise((_,rej)=>{selectionTimeout=setTimeout(()=>rej(new Error('Timed out waiting for Drive folder selection.')),9*60*1000)});
    const closed=new Promise((_,rej)=>context.once('close',()=>rej(new Error('Drive folder selection was closed before a folder was chosen.'))));
    const result=await Promise.race([picked,timeout,closed]);
    if(!driveFolderId(result.url))throw new Error('Open a specific folder that contains your weekly lesson plans before clicking Use this folder. Do not select My Drive itself.');
    cfg.driveFolderUrl=result.url;
    cfg.driveFolderName=driveFolderDisplayName(result);
    saveConfig(cfg);
    log(`Selected Drive folder: ${cfg.driveFolderName} (${cfg.driveFolderUrl})`);
    emit('drive-folder',{driveFolderUrl:cfg.driveFolderUrl,driveFolderName:cfg.driveFolderName});
    await page.waitForTimeout(500);
  }finally{
    if(timer)clearInterval(timer);
    if(selectionTimeout)clearTimeout(selectionTimeout);
    bridge?.dispose();
    await context.close().catch(()=>{});
  }
})().catch(e=>{emitError(e);process.exit(1)});
