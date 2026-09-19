const fs=require('fs');
const path=require('path');

async function runPackagedSelfTest({app,dataDir,ensureData,loadConfig,getMachine,getSchedulerService,selfTestFile,selfTestUserData,selfTestBrowser,compactError}){
  const result={schema:2,ok:false,version:app.getVersion(),packaged:app.isPackaged,execPath:process.execPath,userData:app.getPath('userData'),isolatedUserData:!!selfTestUserData,checks:{}};
  let browserContext=null;
  try{
    ensureData();
    result.checks.dataDirectory=fs.existsSync(dataDir());
    const probe=path.join(dataDir(),`.self-test-${process.pid}.tmp`);
    fs.writeFileSync(probe,'ok','utf8');result.checks.dataWritable=fs.readFileSync(probe,'utf8')==='ok';fs.unlinkSync(probe);
    const cfg=loadConfig();const machine=getMachine();
    result.checks.configReadable=!!cfg&&typeof cfg==='object';
    result.checks.machineReadable=!!machine&&typeof machine==='object';
    result.checks.rendererPresent=fs.existsSync(path.join(__dirname,'..','renderer','index.html'));
    result.checks.preloadPresent=fs.existsSync(path.join(__dirname,'..','preload.js'));
    result.checks.enginePresent=fs.existsSync(path.join(__dirname,'..','engine','submit-weekly.js'));
    result.checks.schedulerCommandPointsToThisExe=getSchedulerService().taskCommand().exe===process.execPath;
    if(selfTestBrowser){
      process.env.CATI_DATA_DIR=dataDir();
      process.env.CATI_BACKGROUND_MODE='1';
      const {detectInstalledBrowser,launchTeacherContext}=require('../engine/browser');
      const detected=detectInstalledBrowser();
      if(!detected.detected)throw new Error('Packaged browser self-test could not find Google Chrome or Microsoft Edge.');
      const profileDir=path.join(app.getPath('userData'),'validation-browser-profile');
      browserContext=await launchTeacherContext({profileDir,browserChannel:detected.channel},{headless:true});
      const page=browserContext.pages()[0]||await browserContext.newPage();
      await page.goto('data:text/html,<title>CATI Packaged Browser Test</title><h1 id="ok">ready</h1>',{waitUntil:'domcontentloaded',timeout:15000});
      result.checks.packagedBrowserLaunch=(await page.locator('#ok').textContent({timeout:5000}))==='ready';
      result.browser={channel:detected.channel,label:detected.label};
    }
    result.ok=Object.values(result.checks).every(Boolean);
  }catch(e){result.error=compactError(e);}
  finally{if(browserContext)await browserContext.close().catch(()=>{});}
  const target=selfTestFile?path.resolve(selfTestFile):path.join(dataDir(),'packaged-self-test.json');
  try{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(result,null,2),'utf8')}catch(e){result.ok=false;result.writeError=compactError(e)}
  return result.ok?0:1;
}

module.exports={runPackagedSelfTest};
