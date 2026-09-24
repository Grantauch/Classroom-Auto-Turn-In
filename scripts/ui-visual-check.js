const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const {detectInstalledBrowser}=require('../engine/browser');

(async()=>{
  const browserInfo=detectInstalledBrowser();
  if(!browserInfo.detected)throw new Error('Chrome or Edge is required for GoClassroom visual QA.');
  const output=path.resolve(process.argv[2]||path.join(__dirname,'..','validation-evidence-v0.9.31'));
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:browserInfo.path});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:840},deviceScaleFactor:1});
    await page.addInitScript(()=>{
      const config={setupComplete:true,dryRun:false,courseUrl:'https://classroom.google.com/c/LESSON_PLANS',courseDisplayName:'Staff Lesson Plans',driveFolderUrl:'https://drive.google.com/drive/folders/PLANS',driveFolderName:'Weekly Plans',topicName:'Lesson Plans',schedule:{time:'06:30',days:['MON','TUE','WED','THU','FRI']}};
      const gradingClassrooms=Array.from({length:6},(_,index)=>({courseId:`period_${index+1}`,courseUrl:`https://classroom.google.com/c/period_${index+1}`,courseDisplayName:`Period ${index+1} — US History`}));
      const grading={settings:{enabled:true,model:'qwen3.6:latest',classroomDraftWriteEnabled:false,batchSize:5,gradingClassrooms,activeGradingCourseId:'period_1',reviewExportEnabled:false,reviewFolderPath:''},ollama:{available:true,models:[{name:'qwen3.6:latest',parameter_size:'36B'}],selectedModelAvailable:true}};
      const dashboard={config,plans:[],planCount:0,submittedCount:0,machine:{role:'primary',displayName:'TheAtlas'},scheduler:{exists:true,healthy:true,nextRun:new Date(Date.now()+3600000).toISOString()},diagnostics:{currentBlockers:[],lastOutcome:{status:'SUCCESS'}},ai:{settings:{optedIn:false,enabled:false},pendingCount:0},readiness:{}};
      const base={getDashboard:async()=>dashboard,getConfig:async()=>config,saveConfig:async value=>Object.assign(config,value),getMachine:async()=>dashboard.machine,getPlans:async()=>[],getAiState:async()=>({settings:{optedIn:false,enabled:false,provider:'groq',models:{}},drafts:[],connections:[],pendingCount:0}),getGradingState:async()=>grading,getScheduleHealth:async()=>dashboard.scheduler,checkEnvironment:async()=>({ready:true,browser:'Chrome'}),discoverTopics:async()=>[],onAiDraftReady:()=>{},onStatus:()=>{}};
      window.cati=new Proxy(base,{get(target,key){if(key in target)return target[key];return async()=>null}});
    });
    await page.goto(`file:///${path.join(__dirname,'..','renderer','index.html').replace(/\\/g,'/')}`,{waitUntil:'networkidle'});
    await page.waitForTimeout(500);
    const brandLoaded=await page.locator('.brand-logo').evaluate(image=>image.complete&&image.naturalWidth>0);
    if(!brandLoaded)throw new Error('GoClassroom logo did not render.');
    const bannerBackground=await page.locator('.space-banner').evaluate(node=>getComputedStyle(node).backgroundImage);
    if(!/space-banner\.svg/.test(bannerBackground))throw new Error('GoClassroom space banner did not render.');
    const botLoaded=await page.locator('.space-banner-bot').evaluate(image=>image.complete&&image.naturalWidth>0);
    if(!botLoaded)throw new Error('GoClassroom robot did not render.');
    if(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1))throw new Error('Home screen has unintended horizontal overflow at 1280 px.');
    await page.screenshot({path:path.join(output,'goclassroom-v0.9.31-home.png'),fullPage:true});
    await page.locator('[data-page="grading"]').click();
    await page.waitForSelector('#grading.active');
    await page.waitForTimeout(300);
    const classes=await page.locator('#gradingClassroomSelect option').count();
    if(classes!==6)throw new Error(`Expected six grading Classroom choices, found ${classes}.`);
    if(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1))throw new Error('Draft grading screen has unintended horizontal overflow at 1280 px.');
    await page.screenshot({path:path.join(output,'goclassroom-v0.9.31-draft-grading.png'),fullPage:true});
    console.log(`GoClassroom visual QA passed in ${browserInfo.label}: logo/banner loaded, six-class selector rendered, and no 1280px horizontal overflow.`);
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
