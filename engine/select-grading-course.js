const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {classroomCourseId,classroomDisplayName,createClassroomPickerBridge}=require('./classroom-picker');
const {emit,emitError}=require('./protocol');

(async()=>{
  const cfg=loadConfig();
  const context=await launchTeacherContext(cfg);
  let bridge,timer,selectionTimeout;
  try{
    const page=context.pages()[0]||await context.newPage();
    let resolvePick,rejectPick;
    const picked=new Promise((resolve,reject)=>{resolvePick=resolve;rejectPick=reject});
    bridge=await createClassroomPickerBridge(context,payload=>resolvePick(payload),{
      purpose:'grading',
      onCancel:()=>rejectPick(new Error('Grading Classroom selection was canceled.'))
    });
    await page.goto('https://classroom.google.com/h',{waitUntil:'domcontentloaded',timeout:30000});
    if(/https?:\/\/accounts\.google\.com\//i.test(page.url()))emit('status',{message:'Sign in to Google, then open a class you grade.'});
    else emit('status',{message:'Open a class you grade, then click the green "Add grading Classroom" button.'});
    timer=setInterval(()=>bridge.inject().catch(()=>{}),700);
    await bridge.inject();
    const timeout=new Promise((_,reject)=>{selectionTimeout=setTimeout(()=>reject(new Error('Timed out waiting for grading Classroom selection.')),9*60*1000)});
    const closed=new Promise((_,reject)=>context.once('close',()=>reject(new Error('Grading Classroom selection was closed before a class was chosen.'))));
    const result=await Promise.race([picked,timeout,closed]);
    const courseId=classroomCourseId(result.url);
    if(!courseId)throw new Error('Open the Classroom itself before clicking Add grading Classroom.');
    const course={courseId,courseUrl:`https://classroom.google.com/c/${courseId}`,courseDisplayName:classroomDisplayName(result)};
    log(`Selected grading Classroom: ${course.courseDisplayName||course.courseUrl}`);
    emit('grading-course',course);
    await page.waitForTimeout(400);
  }finally{
    if(timer)clearInterval(timer);
    if(selectionTimeout)clearTimeout(selectionTimeout);
    bridge?.dispose();
    await context.close().catch(()=>{});
  }
})().catch(error=>{emitError(error);process.exit(1)});
