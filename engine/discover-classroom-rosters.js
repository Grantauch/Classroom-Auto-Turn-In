const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {assertGoogleSession}=require('./classroom-actions');
const {emit,emitError}=require('./protocol');
const {clean,validCourseId,collectClassroomPeopleDom,normalizeRosterSnapshot}=require('./classroom-roster');

const MAX_CLASSROOMS=40;

// Same conservative Teaching/Enrolled split used by multi-Classroom grading.
function collectTeachingClassroomsDom(){
  const courseHref=/^\/(?:u\/\d+\/)?c\/([^/?#]+)\/?$/i;
  const sectionHeading=/^(Teaching|Enrolled|Archived classes)$/i;
  const notACourseName=/^(?:Classroom|Google Classroom|Home|Stream|Classwork|People|Grades|Marks|Your work|To-do|To do|To review|To-review|Calendar|Settings|Archived classes|Enrolled|Teaching|Main menu|Class drive folder|Google Calendar)$/i;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT);
  const found=[],seen=new Set();let section='';
  while(walker.nextNode()){
    const element=walker.currentNode;
    const ownText=[...element.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent.trim()).join(' ').trim();
    if(ownText&&sectionHeading.test(ownText))section=ownText.toLowerCase();
    if(element.tagName!=='A')continue;
    let match=null;try{match=new URL(element.getAttribute('href')||'',location.href).pathname.match(courseHref)}catch{match=null}
    if(!match)continue;
    const courseId=match[1];if(section!=='teaching'||seen.has(courseId))continue;
    const label=String(element.innerText||element.textContent||'').replace(/\s+/g,' ').trim().replace(/^([A-Za-z0-9])\s+(?=\1)/i,'');
    if(!label||notACourseName.test(label)||label.length>160)continue;
    seen.add(courseId);found.push({courseId,courseDisplayName:label});
  }
  return found;
}

async function collectCourseRoster(page,course){
  const byEmail=new Map();let maxRows=0,headingFound=false,scrollComplete=false;
  const url=`https://classroom.google.com/c/${encodeURIComponent(course.courseId)}/r`;
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await assertGoogleSession(page,`People for ${course.courseDisplayName}`);
  await page.locator('main,[role="main"]') .first().waitFor({state:'visible',timeout:25000}).catch(()=>{});
  await page.waitForTimeout(1000);
  const capture=async()=>{
    const snapshot=await page.evaluate(collectClassroomPeopleDom,course.courseId).catch(()=>({students:[],discoveredStudentRows:0,studentsHeadingFound:false}));
    headingFound=headingFound||snapshot.studentsHeadingFound===true;maxRows=Math.max(maxRows,Number(snapshot.discoveredStudentRows)||0);
    for(const row of snapshot.students||[])if(row?.email&&!byEmail.has(String(row.email).toLowerCase()))byEmail.set(String(row.email).toLowerCase(),row);
  };
  for(let pass=0;pass<12;pass++){
    await capture();
    const moved=await page.evaluate(()=>{
      const roots=[...document.querySelectorAll('*')].filter(el=>{const s=getComputedStyle(el);return /auto|scroll/.test(s.overflowY||'')&&el.scrollHeight>el.clientHeight+40});
      const root=roots.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight))[0]||document.scrollingElement||document.documentElement;
      const before=root.scrollTop,max=Math.max(0,root.scrollHeight-root.clientHeight);root.scrollTop=Math.min(max,before+Math.max(500,root.clientHeight*0.85));return {before,after:root.scrollTop,max};
    }).catch(()=>({before:0,after:0,max:0}));
    const atEnd=moved.after>=moved.max-5||moved.after===moved.before;
    await page.waitForTimeout(atEnd?350:250);
    if(atEnd){await capture();scrollComplete=true;break;}
  }
  const students=[...byEmail.values()];
  if(!headingFound)log(`Roster discovery could not confirm the Students heading in ${course.courseDisplayName}; no guessed roster changes will be allowed.`);
  if(!scrollComplete)log(`Roster discovery reached its traversal limit in ${course.courseDisplayName}; this class is not eligible to authorize removals.`);
  log(`Roster discovery read ${students.length} verified email identit${students.length===1?'y':'ies'} in ${course.courseDisplayName}${maxRows>students.length?` with at least ${maxRows-students.length} row(s) still needing identity review`:''}.`);
  return {...course,students,discoveredStudentRows:maxRows,studentsHeadingFound:headingFound,scrollComplete};
}

(async()=>{
  const cfg=loadConfig(),context=await launchTeacherContext(cfg,{headless:false});
  try{
    const page=context.pages()[0]||await context.newPage();
    emit('status',{message:'Opening Google Classroom to find your classes and student rosters.'});
    await page.goto('https://classroom.google.com/h',{waitUntil:'domcontentloaded',timeout:45000});
    await assertGoogleSession(page,'Classroom roster discovery');
    await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:20000});
    await page.waitForTimeout(1200);
    const discovered=(await page.evaluate(collectTeachingClassroomsDom).catch(()=>[]))||[];
    const courses=discovered.map(item=>({courseId:validCourseId(item.courseId),courseDisplayName:clean(item.courseDisplayName,500)})).filter(x=>x.courseId).slice(0,MAX_CLASSROOMS);
    if(!courses.length)throw new Error('GoClassroom could not read the classes you teach from Google Classroom.');
    const classes=[];
    for(let i=0;i<courses.length;i++){
      const course=courses[i];emit('status',{message:`Reading roster ${i+1} of ${courses.length}: ${course.courseDisplayName}.`});
      try{classes.push(await collectCourseRoster(page,course))}
      catch(error){classes.push({...course,students:[],discoveredStudentRows:0,studentsHeadingFound:false,scrollComplete:false,discoveryError:clean(error?.message||error,500)});log(`Roster discovery for ${course.courseDisplayName} stopped safely: ${clean(error?.message||error,500)}`)}
    }
    const snapshot=normalizeRosterSnapshot({source:'google-classroom-ui',discoveredAt:new Date().toISOString(),classes});
    emit('classroom-rosters',{snapshot,issues:classes.filter(c=>c.discoveryError).map(c=>({courseId:c.courseId,courseDisplayName:c.courseDisplayName,message:c.discoveryError}))});
  }finally{await context.close().catch(()=>{})}
})().catch(error=>{emitError(error);process.exit(1)});
