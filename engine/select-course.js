const { launchTeacherContext } = require('./browser');
const { loadConfig, saveConfig, log } = require('./lib');
const {classroomCourseId,classroomDisplayName,createClassroomPickerBridge}=require('./classroom-picker');

const {emit,emitError}=require('./protocol');
(async()=>{
  const cfg=loadConfig();
  const context=await launchTeacherContext(cfg);
  let bridge,timer,selectionTimeout;
  try{
    const page=context.pages()[0] || await context.newPage();
    let resolvePick,rejectPick;
    const picked=new Promise((resolve,reject)=>{resolvePick=resolve;rejectPick=reject});
    bridge=await createClassroomPickerBridge(context,payload=>resolvePick(payload),{onCancel:()=>rejectPick(new Error('Classroom selection was canceled.'))});
    await page.goto('https://classroom.google.com/h',{waitUntil:'domcontentloaded',timeout:30000});
    if(/https?:\/\/accounts\.google\.com\//i.test(page.url())) emit('status',{message:'Sign in to Google, then open the Classroom you want to use.'});
    else emit('status',{message:'Open the Classroom you want to use, then click the blue "Use this Classroom" button.'});

    timer=setInterval(()=>bridge.inject().catch(()=>{}),700);
    await bridge.inject();
    const timeout=new Promise((_,rej)=>{selectionTimeout=setTimeout(()=>rej(new Error('Timed out waiting for Classroom selection.')),9*60*1000)});
    const closed=new Promise((_,rej)=>context.once('close',()=>rej(new Error('Classroom selection was closed before a Classroom was chosen.'))));
    const result=await Promise.race([picked,timeout,closed]);
    const courseId=classroomCourseId(result.url);
    if(!courseId)throw new Error('Open the Classroom itself before clicking Use this Classroom.');
    const canonical=`https://classroom.google.com/c/${courseId}`;
    cfg.courseUrl=canonical;
    cfg.courseDisplayName=classroomDisplayName(result);
    saveConfig(cfg);
    log(`Selected Classroom: ${cfg.courseDisplayName||canonical}`);
    emit('course',{courseUrl:canonical,courseDisplayName:cfg.courseDisplayName});
    await page.waitForTimeout(400);
  }finally{
    if(timer)clearInterval(timer);
    if(selectionTimeout)clearTimeout(selectionTimeout);
    bridge?.dispose();
    await context.close().catch(()=>{});
  }
})().catch(e=>{emitError(e);process.exit(1)});
