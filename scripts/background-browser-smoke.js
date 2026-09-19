const fs=require('fs'),path=require('path'),os=require('os');
if(process.platform!=='win32'){
  console.log('Background browser smoke test skipped on non-Windows host; Windows builder/CI is the release gate.');
  process.exit(0);
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cati-bg-browser-'));
process.env.CATI_DATA_DIR=path.join(temp,'data');
process.env.CATI_BACKGROUND_MODE='1';
const {detectInstalledBrowser,launchTeacherContext}=require('../engine/browser');
const {createClassroomPickerBridge}=require('../engine/classroom-picker');
const {createDriveFolderPickerBridge}=require('../engine/drive-picker');
(async()=>{
  const detected=detectInstalledBrowser();
  if(!detected.detected)throw new Error('Chrome or Edge was not found for the background-browser smoke test.');
  let context;
  try{
    context=await launchTeacherContext({profileDir:path.join(temp,'profile'),browserChannel:detected.channel});
    const page=context.pages()[0]||await context.newPage();
    await page.goto('data:text/html,<title>CATI Background Test</title><h1 id="ok">ready</h1>',{waitUntil:'domcontentloaded',timeout:15000});
    const text=await page.locator('#ok').textContent({timeout:5000});
    if(text!=='ready')throw new Error('Background browser opened but did not load the smoke-test page correctly.');
    await context.route('https://classroom.google.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Your work in Test Classroom - Google Classroom</title><a href="/c/COURSE_TEST">Test Classroom</a><h1>Teacher Name</h1>'}));
    let resolvePick;
    let classroomCanceled=false;
    const picked=new Promise(resolve=>resolvePick=resolve);
    const bridge=await createClassroomPickerBridge(context,payload=>resolvePick(payload),{onCancel:()=>{classroomCanceled=true}});
    const second=await context.newPage();
    await second.goto('https://classroom.google.com/c/COURSE_TEST/sp/TEACHER/all/default',{waitUntil:'domcontentloaded',timeout:15000});
    if(await bridge.inject()!==1)throw new Error('Cross-tab Classroom picker did not appear on the course page.');
    await second.locator('#cati-classroom-picker button').filter({hasText:'Cancel'}).click({timeout:5000});
    await second.waitForTimeout(50);
    if(!classroomCanceled)throw new Error('Cross-tab Classroom picker did not return its cancel action.');
    await second.locator('#cati-classroom-picker button').filter({hasText:'Use this Classroom'}).click({timeout:5000});
    const payload=await Promise.race([picked,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Cross-tab Classroom picker did not return the teacher choice.')),5000))]);
    if(!String(payload.url||'').includes('/c/COURSE_TEST')||payload.courseName!=='Test Classroom')throw new Error('Cross-tab Classroom picker returned the wrong course details.');
    bridge.dispose();
    await context.route('https://drive.google.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Weekly Plans - Google Drive</title><h1>Weekly Plans</h1>'}));
    let resolveFolder;
    let driveCanceled=false;
    const folderPicked=new Promise(resolve=>resolveFolder=resolve);
    const driveBridge=await createDriveFolderPickerBridge(context,payload=>resolveFolder(payload),{onCancel:()=>{driveCanceled=true}});
    const third=await context.newPage();
    await third.goto('https://drive.google.com/drive/u/0/folders/FOLDER_TEST',{waitUntil:'domcontentloaded',timeout:15000});
    if(await driveBridge.inject()!==1)throw new Error('Cross-tab Drive picker did not appear on the folder page.');
    await third.locator('#cati-drive-picker button').filter({hasText:'Cancel'}).click({timeout:5000});
    await third.waitForTimeout(50);
    if(!driveCanceled)throw new Error('Cross-tab Drive picker did not return its cancel action.');
    await third.locator('#cati-drive-picker button').filter({hasText:'Use this folder'}).click({timeout:5000});
    const folderPayload=await Promise.race([folderPicked,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Cross-tab Drive picker did not return the teacher choice.')),5000))]);
    if(!String(folderPayload.url||'').includes('/folders/FOLDER_TEST')||folderPayload.title!=='Weekly Plans - Google Drive')throw new Error('Cross-tab Drive picker returned the wrong folder details.');
    driveBridge.dispose();
    console.log(`Background Playwright smoke test passed with ${detected.label}, including cross-tab Classroom and Drive pickers.`);
  }finally{
    if(context)await context.close().catch(()=>{});
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(`Background browser smoke test FAILED: ${e.message||e}`);try{fs.rmSync(temp,{recursive:true,force:true})}catch{/* best-effort fallback */};process.exit(1)});
