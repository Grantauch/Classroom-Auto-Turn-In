const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core');
const {detectInstalledBrowser}=require('../engine/browser');
const {pathToFileURL}=require('node:url');

(async()=>{
  const binary=process.env.GOCLASSROOM_TEST_BROWSER||detectInstalledBrowser().path;
  if(!binary)throw new Error('Chrome or Edge is required for the StoryHub workflow UI check.');
  const browser=await chromium.launch({headless:true,executablePath:binary});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:840}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      const config={setupComplete:true,dryRun:true,courseUrl:'https://classroom.google.com/c/staff',courseDisplayName:'Staff',driveFolderUrl:'https://drive.google.com/drive/folders/plans',topicName:'Lesson Plans',schedule:{time:'06:30',days:['MON']}};
      const settings={enabled:true,model:'synthetic-local-model',classroomDraftWriteEnabled:false,batchSize:35,gradingClassrooms:[{courseId:'history',courseDisplayName:'History Period 1'},{courseId:'other',courseDisplayName:'History Period 2'}],activeGradingCourseId:'history',reviewExportEnabled:false,reviewFolderPath:'',storyHubSheetUrl:''};
      const dashboard={config,plans:[],planCount:0,submittedCount:0,machine:{role:'manual',displayName:'Test PC'},scheduler:{exists:false},diagnostics:{currentBlockers:[]},ai:{settings:{},pendingCount:0},readiness:{}};
      const base={getDashboard:async()=>dashboard,getConfig:async()=>config,getMachine:async()=>dashboard.machine,getPlans:async()=>[],getScheduleHealth:async()=>dashboard.scheduler,getAiState:async()=>({settings:{},drafts:[],connections:[]}),getGradingState:async()=>({settings,ollama:{available:true,models:[{name:settings.model}],selectedModelAvailable:true}}),saveGradingSettings:async value=>Object.assign(settings,value),discoverGradingAssignments:async courseId=>({courseId,courseDisplayName:'History Period 1',assignments:[{courseId,assignmentId:'work',title:'Example hub assignment'}]}),readStoryHubCatalog:async value=>({spreadsheetUrl:value.spreadsheetUrl,groups:[{hub:'ush9-example',classPeriod:'Period 1',title:'Example hub',count:2}]}),processClassroomGrading:async request=>{
        window.__hubRequest=request;
        if(request.writeDrafts)throw new Error('The UI fixture may only preview.');
        return {assignment:request.assignment,summary:{scanned:1,safeDrafts:1,teacherReview:0,draftsSaved:0},results:[{studentId:'synthetic',studentName:'Synthetic Student',status:'SAFE_DRAFT',grade:{score:8,max_score:10,feedback:'Review this draft.'},source:'storyhub',studentWork:'Question\nA complete answer with <literal> text.',writeStatus:'NOT_WRITTEN'}]};
      },getRosterState:async()=>({}),checkEnvironment:async()=>({ready:true,browser:{detected:true,label:'Test browser'},profileWritable:true}),onStatus:()=>{},onAiDraftReady:()=>{}};
      window.cati=new Proxy(base,{get:(target,key)=>key in target?target[key]:async()=>null});
    });
    await page.goto(pathToFileURL(path.join(__dirname,'..','renderer','index.html')).href,{waitUntil:'networkidle'});
    await page.locator('[data-page="grading"]').click();
    await page.waitForSelector('#grading.active');
    assert.equal(await page.locator('#gradingBatchSize').inputValue(),'35','Class-size setting must survive loading');
    await page.locator('#discoverGradingAssignments').click();
    await page.locator('#gradingClassroomAssignment').selectOption('work');
    await page.locator('#gradingWorkSource').selectOption('storyhub');
    await page.locator('#gradingHubSheet').fill('https://docs.google.com/spreadsheets/d/SYNTHETIC_WORKBOOK/edit');
    await page.locator('#readGradingHubs').click();
    await page.locator('#gradingHubGroup').selectOption('0');
    await page.locator('#runClassroomGrading').click();
    await page.waitForSelector('#gradingClassroomResultPanel:not(.hidden)');
    const request=await page.evaluate(()=>window.__hubRequest);
    assert.equal(request.submissionSource.kind,'storyhub');assert.equal(request.submissionSource.hub,'ush9-example');assert.equal(request.submissionSource.classPeriod,'Period 1');
    assert.equal(request.assignment.courseId,'history');assert.equal(request.batchSize,35);assert.equal(request.writeDrafts,false);
    await page.getByText('Read hub answers',{exact:true}).click();
    assert.match(await page.locator('#gradingClassroomResultPanel').innerText(),/complete answer with <literal> text/);
    assert.equal(await page.locator('#gradingClassroomResultPanel literal').count(),0,'Evidence must render as text');
    assert.equal(await page.locator('.toast.error').count(),0,'The workflow must not show a caught startup or grading error');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1),false);
    if(process.env.GOCLASSROOM_TEST_SCREENSHOT)await page.screenshot({path:process.env.GOCLASSROOM_TEST_SCREENSHOT,fullPage:true});
    await page.locator('#gradingClassroomSelect').selectOption('other');
    assert.equal(await page.locator('#gradingHubGroup').inputValue(),'','Changing class requires a new hub choice');
    assert.deepEqual(errors,[]);
    console.log('StoryHub UI check passed: private source selection, hub/period mapping, preserved 35-student batch, preview request, complete escaped evidence and class-change reset.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
