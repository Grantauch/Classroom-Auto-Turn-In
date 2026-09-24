const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {openClassroomHome}=require('./classroom-home');
const {clean}=require('./classroom-grading');
const {readCourseAssignments}=require('./classwork-assignments');
const {emit,emitError}=require('./protocol');

const MAX_CLASSROOMS=20;

// Reads the sidebar in document order and keeps only the classes under "Teaching".
// Classes the teacher is merely enrolled in, such as a staff Classroom that receives
// lesson plans, sit under "Enrolled" and are deliberately left out.
function collectTeachingClassroomsDom(){
  const courseHref=/^\/(?:u\/\d+\/)?c\/([^/?#]+)\/?$/i;
  // Only the real section headings. "To review" and "To-do" sit between a heading and its
  // classes, so treating them as headings loses the Teaching and Enrolled split entirely.
  const sectionHeading=/^(Teaching|Enrolled|Archived classes)$/i;
  const notACourseName=/^(?:Classroom|Google Classroom|Home|Stream|Classwork|People|Grades|Marks|Your work|To-do|To do|To review|To-review|Calendar|Settings|Archived classes|Enrolled|Teaching|Main menu|Class drive folder|Google Calendar)$/i;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT);
  const found=[],seen=new Set();
  let section='';
  while(walker.nextNode()){
    const element=walker.currentNode;
    const ownText=[...element.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent.trim()).join(' ').trim();
    if(ownText&&sectionHeading.test(ownText))section=ownText.toLowerCase();
    if(element.tagName!=='A')continue;
    let match=null;
    try{match=new URL(element.getAttribute('href')||'',location.href).pathname.match(courseHref)}catch{match=null}
    if(!match)continue;
    const courseId=match[1];
    if(section!=='teaching'||seen.has(courseId))continue;
    // Sidebar rows start with the class avatar letter, as in "H Hidden History 6th Hour".
    const label=String(element.innerText||element.textContent||'').replace(/\s+/g,' ').trim()
      .replace(/^([A-Za-z0-9])\s+(?=\1)/i,'');
    if(!label||notACourseName.test(label)||label.length>160)continue;
    seen.add(courseId);
    found.push({courseId,courseDisplayName:label});
  }
  return found;
}

(async()=>{
  const cfg=loadConfig();
  const context=await launchTeacherContext(cfg,{headless:false});
  try{
    const page=context.pages()[0]||await context.newPage();
    emit('status',{message:'Opening Google Classroom to find the classes you teach.'});
    await openClassroomHome(page,{emit,where:'Find my classes'});
    await page.waitForTimeout(1200);
    const discovered=(await page.evaluate(collectTeachingClassroomsDom).catch(()=>[]))||[];
    const classrooms=discovered
      .map(item=>({courseId:clean(item.courseId,300),courseDisplayName:clean(item.courseDisplayName,500)}))
      .filter(item=>item.courseId&&/^[-_a-z0-9]+$/i.test(item.courseId))
      .slice(0,MAX_CLASSROOMS);
    if(!classrooms.length)throw new Error('GoClassroom could not read the classes you teach from Classroom. Add a class with Add grading Classroom instead.');
    log(`Teaching Classroom discovery found ${classrooms.length} class(es).`);
    emit('status',{message:`Found ${classrooms.length} class${classrooms.length===1?'':'es'}. Reading assignments in each one.`});
    for(const course of classrooms){
      emit('status',{message:`Reading assignments in ${course.courseDisplayName}.`});
      try{
        await page.goto(`https://classroom.google.com/w/${course.courseId}/t/all`,{waitUntil:'domcontentloaded',timeout:45000});
        await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:20000});
        await page.waitForTimeout(900);
        course.assignments=await readCourseAssignments(page,course.courseId,{log});
      }catch(error){
        course.assignments=[];
        course.assignmentsReason=String(error?.message||error).replace(/\s+/g,' ').trim().slice(0,300);
      }
      log(`Teaching Classroom discovery read ${course.assignments.length} assignment(s) in ${course.courseDisplayName}.`);
    }
    emit('teaching-classrooms',{classrooms});
  }finally{await context.close().catch(()=>{})}
})().catch(error=>{emitError(error);process.exit(1)});
