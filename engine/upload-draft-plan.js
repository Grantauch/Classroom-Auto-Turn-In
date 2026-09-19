const fs=require('fs');
const path=require('path');
const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');

const {emit,emitError}=require('./protocol');
async function assertGoogleSession(page){
  if(/https?:\/\/accounts\.google\.com\//i.test(String(page.url()||''))){
    const e=new Error('Google needs you to sign in again before the approved lesson-plan folder can be used.');e.code='AUTH_REQUIRED';throw e;
  }
}
(async()=>{
  const file=path.resolve(process.argv[2]||'');
  const week=Number(process.argv[3]||0);
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('The approved lesson-plan draft file could not be found.');
  if(!Number.isInteger(week)||week<1||week>52)throw new Error('The draft week is invalid.');
  const cfg=loadConfig();if(!cfg.driveFolderUrl)throw new Error('Choose the approved Google Drive lesson-plan folder first.');
  const re=new RegExp(cfg.planTitleRegex,'i');const m=path.basename(file).match(re);
  if(!m||Number(m[1])!==week)throw new Error(`The approved draft filename does not match the configured Week ${week} lesson-plan naming rule.`);
  const context=await launchTeacherContext(cfg);const page=context.pages()[0]||await context.newPage();
  try{
    await page.goto(cfg.driveFolderUrl,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(1500);await assertGoogleSession(page);
    const newButton=page.getByRole('button',{name:/^New$/i}).first();
    if(!await newButton.waitFor({state:'visible',timeout:20000}).then(()=>true,()=>false))throw new Error('Google Drive did not show the New button. The folder may not be writable by this account.');
    await newButton.click();
    const upload=page.getByText(/^File upload$/i,{exact:true}).last();
    if(!await upload.waitFor({state:'visible',timeout:6000}).then(()=>true,()=>false))throw new Error('Google Drive did not show File upload after New was clicked.');
    const chooserPromise=page.waitForEvent('filechooser',{timeout:7000});
    await upload.click();
    const chooser=await chooserPromise;await chooser.setFiles(file);
    log(`AI recovery: uploading approved Week ${week} lesson-plan draft to the trusted Drive folder.`);
    const base=path.basename(file);
    // Drive upload completion UI varies. Wait for a positive upload-complete message
    // when available, then give Drive a little time to commit the new row. The main
    // process performs a full trusted-folder re-scan afterward and will reject any
    // duplicate or unresolved result before submission can continue.
    await Promise.race([
      page.getByText(/Upload complete|1 upload complete|Uploads? complete/i).first().waitFor({state:'visible',timeout:30000}).catch(()=>null),
      page.getByText(base,{exact:true}).first().waitFor({state:'visible',timeout:30000}).catch(()=>null),
      page.waitForTimeout(12000)
    ]);
    await page.waitForTimeout(1800);
    emit('ai-upload',{week,file:base,folderUrl:cfg.driveFolderUrl});
  }finally{await context.close();}
})().catch(e=>{emitError(e);process.exit(1)});
