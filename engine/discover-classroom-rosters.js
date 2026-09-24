const {loadConfig,log}=require('./lib');
const {assertGoogleSession}=require('./classroom-actions');
const {emit,emitError}=require('./protocol');
const {clean,validCourseId,collectClassroomPeopleDom,normalizeRosterSnapshot}=require('./classroom-roster');
const {openClassroomHome,revealTeachingMenu,collectAllClassroomLinksDom,peoplePageShowsTeacher}=require('./classroom-home');

const MAX_CLASSROOMS=40;
const NO_TEACHING_CLASSES='GoClassroom opened Google Classroom but found no classes that you teach.';
const ROSTER_END_STABILITY_CONFIRMATIONS=4;
const ROSTER_END_STABILITY_WAIT_MS=400;

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

function scrollRosterPageDom(){
  const roots=[...document.querySelectorAll('*')].filter(el=>{const s=getComputedStyle(el);return /auto|scroll/.test(s.overflowY||'')&&el.scrollHeight>el.clientHeight+40});
  const root=roots.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight))[0]||document.scrollingElement||document.documentElement;
  const before=root.scrollTop,max=Math.max(0,root.scrollHeight-root.clientHeight);root.scrollTop=Math.min(max,before+Math.max(500,root.clientHeight*0.85));return {before,after:root.scrollTop,max};
}

function peopleCourseName(title,fallback){
  const match=String(title||'').match(/^People in (.+?) - Classroom$/i);
  return clean(match?.[1]||fallback,500);
}

async function collectStudentMenuIdentities(page){
  const rows=page.locator('[role="listitem"][data-student-id][data-by-student="true"]');
  const count=Math.min(await rows.count(),500),out=[];
  for(let i=0;i<count;i++){
    const row=rows.nth(i),sourceStudentId=clean(await row.getAttribute('data-student-id').catch(()=>''),300);
    let name=clean(await row.locator('input[type="checkbox"][aria-label]').first().getAttribute('aria-label').catch(()=>''),160);
    const options=row.locator('button[aria-label^="Options for student "]').first();
    if(!name){
      const optionLabel=clean(await options.getAttribute('aria-label').catch(()=>''),220);
      name=clean(optionLabel.replace(/^Options for student\s+/i,''),160);
    }
    let email='';
    if(await options.count()){
      try{
        await options.click({timeout:3000});
        const emailLabel=await page.locator('[role="menu"][aria-label^="Options for student "] [role="menuitem"][aria-label^="Email "]').first().getAttribute('aria-label',{timeout:2500}).catch(()=>'');
        const emailMatch=String(emailLabel||'').match(/^Email\s+([^\s@]+@[^\s@]+\.[^\s@]+)\s*$/i);
        if(emailMatch)email=clean(emailMatch[1],320).toLowerCase();
      }finally{
        await page.keyboard.press('Escape').catch(()=>{});
        await page.waitForTimeout(40);
      }
    }
    if(name||sourceStudentId)out.push({email,name,sourceStudentId,evidence:[email?'student-options-email':'student-row']});
  }
  return out;
}

async function collectCourseRoster(page,course){
  const byEmail=new Map();let maxRows=0,headingFound=false,scrollComplete=false,evaluationFailed=false;
  const url=`https://classroom.google.com/r/${encodeURIComponent(course.courseId)}/sort-name`;
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await assertGoogleSession(page,`People for ${course.courseDisplayName}`);
  const actualUrl=new URL(page.url());
  if(actualUrl.hostname!=='classroom.google.com'||!new RegExp(`^/r/${course.courseId}/`).test(actualUrl.pathname)||/404/i.test(await page.title())){
    throw new Error('Google Classroom did not open the expected People page. Nothing was synchronized.');
  }
  await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:25000});
  await page.waitForTimeout(1000);
  // A class found without the "Teaching" heading is used only if its People
  // page shows controls that only the class's teacher sees.
  if(course.needsTeacherCheck&&!await peoplePageShowsTeacher(page))return null;
  const courseDisplayName=peopleCourseName(await page.title(),course.courseDisplayName);
  const capture=async()=>{
    const snapshot=await page.evaluate(collectClassroomPeopleDom,course.courseId).catch(()=>null);
    if(!snapshot){evaluationFailed=true;return false;}
    headingFound=headingFound||snapshot.studentsHeadingFound===true;maxRows=Math.max(maxRows,Number(snapshot.discoveredStudentRows)||0);
    for(const row of snapshot.students||[])if(row?.email&&!byEmail.has(String(row.email).toLowerCase()))byEmail.set(String(row.email).toLowerCase(),row);
    return true;
  };
  for(let pass=0;pass<12;pass++){
    if(!await capture())break;
    const moved=await page.evaluate(scrollRosterPageDom).catch(()=>null);
    if(!moved){evaluationFailed=true;break;}
    const atEnd=moved.after>=moved.max-5;
    if(!atEnd){await page.waitForTimeout(250);continue;}
    let stableConfirmations=1,lastEvidence=`${moved.max}|${maxRows}|${byEmail.size}`;
    while(stableConfirmations<ROSTER_END_STABILITY_CONFIRMATIONS){
      await page.waitForTimeout(ROSTER_END_STABILITY_WAIT_MS);
      if(!await capture())break;
      const probe=await page.evaluate(scrollRosterPageDom).catch(()=>null);
      if(!probe){evaluationFailed=true;break;}
      const probeAtEnd=probe.after>=probe.max-5,nextEvidence=`${probe.max}|${maxRows}|${byEmail.size}`;
      if(!probeAtEnd||nextEvidence!==lastEvidence)break;
      stableConfirmations++;lastEvidence=nextEvidence;
    }
    if(evaluationFailed)break;
    if(stableConfirmations>=ROSTER_END_STABILITY_CONFIRMATIONS){scrollComplete=true;break;}
  }
  const unresolved=[],resolvedStudentIds=new Set([...byEmail.values()].map(row=>String(row?.sourceStudentId||'')).filter(Boolean));
  if(headingFound&&!evaluationFailed&&byEmail.size<maxRows){
    const menuIdentities=await collectStudentMenuIdentities(page).catch(error=>{
      evaluationFailed=true;
      log(`Roster discovery could not read verified student email actions in ${courseDisplayName}: ${clean(error?.message||error,300)}`);
      return [];
    });
    if(menuIdentities.length)maxRows=menuIdentities.length;
    for(const row of menuIdentities){
      if(row.email){
        if(row.sourceStudentId){
          for(const [existingEmail,existing] of byEmail){
            if(String(existing?.sourceStudentId||'')===row.sourceStudentId&&existingEmail!==row.email)byEmail.delete(existingEmail);
          }
          resolvedStudentIds.add(row.sourceStudentId);
        }
        byEmail.set(row.email,row);
      }else if((row.name||row.sourceStudentId)&&!resolvedStudentIds.has(row.sourceStudentId)){
        unresolved.push(row);
      }
    }
  }
  const students=[...byEmail.values()];
  if(!headingFound)log(`Roster discovery could not confirm the Students heading in ${courseDisplayName}; no guessed roster changes will be allowed.`);
  if(evaluationFailed)log(`Roster discovery could not confirm a complete roster scan in ${courseDisplayName}; this class is not eligible to authorize removals.`);
  else if(!scrollComplete)log(`Roster discovery reached its traversal limit in ${courseDisplayName}; this class is not eligible to authorize removals.`);
  log(`Roster discovery read ${students.length} verified email identit${students.length===1?'y':'ies'} in ${courseDisplayName}${maxRows>students.length?` with at least ${maxRows-students.length} row(s) still needing identity review`:''}.`);
  return {...course,courseDisplayName,students,unresolved,discoveredStudentRows:maxRows,studentsHeadingFound:headingFound,scrollComplete:scrollComplete&&!evaluationFailed};
}

async function main(){
  const {launchTeacherContext}=require('./browser');
  const cfg=loadConfig(),context=await launchTeacherContext(cfg,{headless:false});
  try{
    const page=context.pages()[0]||await context.newPage();
    emit('status',{message:'Opening Google Classroom to find your classes and student rosters.'});
    await openClassroomHome(page,{emit,where:'Find my rosters'});
    await page.waitForTimeout(1200);
    let discovered=(await page.evaluate(collectTeachingClassroomsDom).catch(()=>[]))||[],needsTeacherCheck=false;
    if(!discovered.length){
      await revealTeachingMenu(page);
      discovered=(await page.evaluate(collectTeachingClassroomsDom).catch(()=>[]))||[];
    }
    if(!discovered.length){
      discovered=(await page.evaluate(collectAllClassroomLinksDom).catch(()=>[]))||[];
      needsTeacherCheck=true;
      log(`Roster discovery could not find the Teaching list; checking ${discovered.length} Classroom link(s) for teacher-only controls instead.`);
    }
    const courses=discovered.map(item=>({courseId:validCourseId(item.courseId),courseDisplayName:clean(item.courseDisplayName,500),needsTeacherCheck})).filter(x=>x.courseId).slice(0,MAX_CLASSROOMS);
    if(!courses.length)throw new Error(NO_TEACHING_CLASSES);
    const classes=[];
    for(let i=0;i<courses.length;i++){
      const course=courses[i];emit('status',{message:`Reading roster ${i+1} of ${courses.length}: ${course.courseDisplayName}.`});
      try{
        const roster=await collectCourseRoster(page,course);
        if(roster){const {needsTeacherCheck:_ignored,...kept}=roster;classes.push(kept)}
        else log(`Roster discovery skipped ${course.courseDisplayName}: you are not a teacher of that class.`);
      }
      catch(error){
        if(course.needsTeacherCheck){log(`Roster discovery skipped ${course.courseDisplayName}: its People page could not be checked.`);continue;}
        const {needsTeacherCheck:_ignored,...base}=course;classes.push({...base,students:[],discoveredStudentRows:0,studentsHeadingFound:false,scrollComplete:false,discoveryError:clean(error?.message||error,500)});log(`Roster discovery for ${course.courseDisplayName} stopped safely: ${clean(error?.message||error,500)}`)}
    }
    if(!classes.length)throw new Error(NO_TEACHING_CLASSES);
    const snapshot=normalizeRosterSnapshot({source:'google-classroom-ui',discoveredAt:new Date().toISOString(),classes});
    emit('classroom-rosters',{snapshot,issues:classes.filter(c=>c.discoveryError).map(c=>({courseId:c.courseId,courseDisplayName:c.courseDisplayName,message:c.discoveryError}))});
  }finally{await context.close().catch(()=>{})}
}

if(require.main===module)main().catch(error=>{emitError(error);process.exit(1)});

module.exports={collectTeachingClassroomsDom,scrollRosterPageDom,peopleCourseName,collectStudentMenuIdentities,collectCourseRoster};
