const ROSTER_SCHEMA_VERSION=1;
const MAX_CLASSROOMS=40;
const MAX_STUDENTS_PER_CLASS=500;

function clean(value,max=500){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)}
function normalizeEmail(value){return clean(value,320).toLowerCase()}
function validEmail(value){const email=normalizeEmail(value);return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:''}
function validCourseId(value){const id=clean(value,300);return /^[-_A-Za-z0-9]+$/.test(id)?id:''}
function validStudentId(value){const id=clean(value,300);return /^[-_A-Za-z0-9]+$/.test(id)?id:''}
function normalizeName(value){return clean(value,160).replace(/^(?:email|message)\s+(?:student\s+)?/i,'').trim()}
function canonicalNameTokens(value){
  return normalizeName(value)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[\u2018\u2019'`-]/g,'').replace(/[^a-z0-9]+/g,' ')
    .trim().split(' ').filter(Boolean).sort();
}
function equivalentStudentName(a,b){
  const left=canonicalNameTokens(a),right=canonicalNameTokens(b);
  return Boolean(left.length&&left.length===right.length&&left.every((token,index)=>token===right[index]));
}
function periodNumber(value){const match=clean(value,120).match(/^Period\s+([1-8])(?:\b|\s|$)/i);return match?Number(match[1]):0}
function isGenericPeriod(value){return /^Period\s+[1-8]$/i.test(clean(value,120))}
function membershipKey(courseId,email){const c=validCourseId(courseId),e=validEmail(email);return c&&e?`${c}::${e}`:''}

function normalizeStudent(value={}){
  const email=validEmail(value.email);
  const name=normalizeName(value.name);
  const sourceStudentId=validStudentId(value.sourceStudentId||value.studentId);
  const evidence=Array.isArray(value.evidence)?[...new Set(value.evidence.map(x=>clean(x,80)).filter(Boolean))].slice(0,8):[];
  return {sourceStudentId,email,name,syncEligible:Boolean(email&&name),confidence:email&&name?'verified-email':'needs-review',evidence};
}

function normalizeClassroom(value={}){
  const courseId=validCourseId(value.courseId);if(!courseId)return null;
  const courseDisplayName=clean(value.courseDisplayName||`Classroom ${courseId}`,500);
  const byEmail=new Map(),unresolved=[];
  const studentRows=[...(Array.isArray(value.students)?value.students:[]),...(Array.isArray(value.unresolved)?value.unresolved:[])];
  for(const raw of studentRows){
    const student=normalizeStudent(raw);
    if(student.email){
      const current=byEmail.get(student.email);
      if(!current||(!current.name&&student.name)||(!current.sourceStudentId&&student.sourceStudentId))byEmail.set(student.email,{...current,...student,evidence:[...new Set([...(current?.evidence||[]),...student.evidence])].slice(0,8)});
    }else if(student.name||student.sourceStudentId){
      const key=`${student.sourceStudentId}::${student.name.toLowerCase()}`;
      if(!unresolved.some(existing=>`${existing.sourceStudentId}::${existing.name.toLowerCase()}`===key))unresolved.push(student);
    }
  }
  const students=[...byEmail.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.email.localeCompare(b.email)).slice(0,MAX_STUDENTS_PER_CLASS);
  return {
    courseId,courseDisplayName,students,unresolved:unresolved.slice(0,MAX_STUDENTS_PER_CLASS),
    discoveredStudentRows:Math.max(Number(value.discoveredStudentRows)||0,students.length+unresolved.length),
    studentsHeadingFound:value.studentsHeadingFound===true,
    scrollComplete:value.scrollComplete===true,
    discoveryError:clean(value.discoveryError,500)
  };
}

function normalizeRosterSnapshot(value={}){
  const classes=[];
  for(const raw of Array.isArray(value.classes)?value.classes:[]){const c=normalizeClassroom(raw);if(c)classes.push(c);if(classes.length>=MAX_CLASSROOMS)break}
  classes.sort((a,b)=>a.courseDisplayName.localeCompare(b.courseDisplayName)||a.courseId.localeCompare(b.courseId));
  return {schemaVersion:ROSTER_SCHEMA_VERSION,source:'google-classroom-ui',discoveredAt:clean(value.discoveredAt,80)||new Date().toISOString(),classes};
}

function eligibleMemberships(snapshot={}){
  const normalized=normalizeRosterSnapshot(snapshot),map=new Map();
  for(const course of normalized.classes)for(const student of course.students){
    if(!student.syncEligible)continue;
    const key=membershipKey(course.courseId,student.email);if(key)map.set(key,{courseId:course.courseId,courseDisplayName:course.courseDisplayName,...student});
  }
  return map;
}

function diffRosterSnapshots(before={},after={}){
  const a=eligibleMemberships(before),b=eligibleMemberships(after),added=[],removed=[],changed=[];
  for(const [key,next] of b){const prev=a.get(key);if(!prev)added.push(next);else if(prev.name!==next.name||prev.sourceStudentId!==next.sourceStudentId||prev.courseDisplayName!==next.courseDisplayName)changed.push({before:prev,after:next});}
  for(const [key,prev] of a)if(!b.has(key))removed.push(prev);
  const unresolved=normalizeRosterSnapshot(after).classes.reduce((n,c)=>n+c.unresolved.length+Math.max(0,c.discoveredStudentRows-c.students.length-c.unresolved.length),0);
  return {added,removed,changed,counts:{added:added.length,removed:removed.length,changed:changed.length,unresolved}};
}

function normalizeMappings(value={}){
  const source=(value&&typeof value==='object'&&value.classMappings&&typeof value.classMappings==='object')?value.classMappings:{};
  const classMappings={};
  for(const [courseId,raw] of Object.entries(source)){
    const id=validCourseId(courseId),classPeriod=clean(raw?.classPeriod||raw,120);
    if(id&&/^Period\s+[1-8](?:\b|\s|$)/i.test(classPeriod))classMappings[id]={classPeriod};
  }
  return {schemaVersion:1,classMappings};
}

function mappingConflicts(mappings={}){
  const map=normalizeMappings(mappings).classMappings,byPeriod=new Map();
  for(const [courseId,{classPeriod}] of Object.entries(map)){const number=periodNumber(classPeriod),key=number?`period-${number}`:classPeriod.toLowerCase(),items=byPeriod.get(key)||[];items.push(courseId);byPeriod.set(key,items);}
  return [...byPeriod.entries()].filter(([,courseIds])=>courseIds.length>1).map(([periodKey,courseIds])=>({classPeriod:map[courseIds[0]].classPeriod,periodKey,courseIds}));
}

function classRosterIsAuthoritative(course={}){
  const students=Array.isArray(course.students)?course.students:[],unresolved=Array.isArray(course.unresolved)?course.unresolved:[];
  return course.studentsHeadingFound===true&&course.scrollComplete===true&&!course.discoveryError&&unresolved.length===0&&Number(course.discoveredStudentRows||0)===students.length;
}

function buildOperationsRosterCandidate(snapshot={},mappings={}){
  const normalized=normalizeRosterSnapshot(snapshot),normalizedMappings=normalizeMappings(mappings),map=normalizedMappings.classMappings;
  const conflicts=mappingConflicts(normalizedMappings),conflicted=new Set(conflicts.flatMap(x=>x.courseIds));
  const ready=[],blocked=[],classSummaries=[];
  for(const course of normalized.classes){
    const classPeriod=map[course.courseId]?.classPeriod||'',removalSafe=classRosterIsAuthoritative(course);
    classSummaries.push({courseId:course.courseId,courseDisplayName:course.courseDisplayName,classPeriod,verifiedStudents:course.students.length,unresolvedStudents:course.unresolved.length,discoveredStudentRows:course.discoveredStudentRows,studentsHeadingFound:course.studentsHeadingFound,discoveryError:course.discoveryError,removalSafe});
    if(!classPeriod){blocked.push({courseId:course.courseId,courseDisplayName:course.courseDisplayName,reason:'CLASS_MAPPING_REQUIRED',studentCount:course.students.length});continue}
    if(conflicted.has(course.courseId)){blocked.push({courseId:course.courseId,courseDisplayName:course.courseDisplayName,classPeriod,reason:'DUPLICATE_PERIOD_MAPPING',studentCount:course.students.length});continue}
    if(course.discoveryError||course.studentsHeadingFound!==true){blocked.push({courseId:course.courseId,courseDisplayName:course.courseDisplayName,classPeriod,reason:'CLASSROOM_ROSTER_NOT_VERIFIED',studentCount:course.students.length});continue}
    for(const student of course.students){
      if(!student.syncEligible){blocked.push({courseId:course.courseId,courseDisplayName:course.courseDisplayName,reason:'STUDENT_IDENTITY_REVIEW',name:student.name});continue}
      ready.push({studentEmail:student.email,studentName:student.name,classPeriod,sourceCourseId:course.courseId,sourceStudentId:student.sourceStudentId||''});
    }
    for(const student of course.unresolved)blocked.push({courseId:course.courseId,courseDisplayName:course.courseDisplayName,reason:'STUDENT_EMAIL_REQUIRED',name:student.name,sourceStudentId:student.sourceStudentId||''});
  }
  ready.sort((a,b)=>a.classPeriod.localeCompare(b.classPeriod)||a.studentName.localeCompare(b.studentName)||a.studentEmail.localeCompare(b.studentEmail));
  return {schemaVersion:1,ready,blocked,classSummaries,mappingConflicts:conflicts,counts:{ready:ready.length,blocked:blocked.length}};
}

function normalizeOperationsRoster(rows=[]){
  const out=[];
  for(const raw of Array.isArray(rows)?rows:[]){
    const studentEmail=validEmail(raw?.studentEmail||raw?.email),studentName=normalizeName(raw?.studentName||raw?.name),classPeriod=clean(raw?.classPeriod,120);
    if(!studentEmail||!studentName||!/^Period\s+[1-8](?:\b|\s|$)/i.test(classPeriod))continue;
    out.push({studentEmail,studentName,classPeriod,active:raw?.active!==false});
  }
  return out;
}
function operationsMembershipKey(row={}){return `${validEmail(row.studentEmail||row.email)}::${clean(row.classPeriod,120).toLowerCase()}`}
function planOperationsRosterSync(candidate={},currentRows=[]){
  const ready=Array.isArray(candidate.ready)?candidate.ready:[],summaries=Array.isArray(candidate.classSummaries)?candidate.classSummaries:[];
  const current=normalizeOperationsRoster(currentRows).filter(x=>x.active),nextByKey=new Map(),currentByKey=new Map(),held=[];
  const labelsByPeriod=new Map();
  for(const row of current){
    const number=periodNumber(row.classPeriod);
    if(number){const labels=labelsByPeriod.get(number)||new Set();labels.add(row.classPeriod);labelsByPeriod.set(number,labels);}
    const key=operationsMembershipKey(row);if(key&&!currentByKey.has(key))currentByKey.set(key,row);
  }
  for(const row of ready){
    const number=periodNumber(row.classPeriod),labels=[...(labelsByPeriod.get(number)||new Set())];
    if(isGenericPeriod(row.classPeriod)&&labels.some(label=>label.toLowerCase()!==row.classPeriod.toLowerCase())){
      held.push({...row,reason:labels.length===1?'CLASS_PERIOD_LABEL_MISMATCH':'SOURCE_CLASS_MAPPING_AMBIGUOUS',suggestedClassPeriods:labels});
      continue;
    }
    const key=operationsMembershipKey(row);if(key&&!nextByKey.has(key))nextByKey.set(key,row);
  }
  const add=[],updateName=[],unchanged=[],deactivate=[];
  for(const [key,next] of nextByKey){const prior=currentByKey.get(key);if(!prior)add.push(next);else if(!equivalentStudentName(prior.studentName,next.studentName))updateName.push({before:prior,after:next});else unchanged.push(next)}
  for(const [key,prior] of currentByKey){
    if(nextByKey.has(key))continue;
    const sources=summaries.filter(x=>String(x.classPeriod||'').toLowerCase()===prior.classPeriod.toLowerCase());
    if(sources.length===1&&sources[0].removalSafe===true)deactivate.push(prior);
    else held.push({...prior,reason:sources.length===1?'SOURCE_ROSTER_NOT_AUTHORITATIVE':'SOURCE_CLASS_MAPPING_AMBIGUOUS'});
  }
  const blocked=Array.isArray(candidate.blocked)?candidate.blocked:[];
  return {schemaVersion:1,add,updateName,unchanged,deactivate,held,blocked,counts:{add:add.length,updateName:updateName.length,unchanged:unchanged.length,deactivate:deactivate.length,held:held.length,blocked:blocked.length}};
}

// Browser-context helper. It intentionally accepts only student identities whose
// email is visible in the Students section. It never guesses an address from a name.
function collectClassroomPeopleDom(expectedCourseId){
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].filter(visible);
  const headingText=el=>clean(el.innerText||el.textContent||el.getAttribute('aria-label'));
  const isStudents=t=>/^(?:Students|Classmates)$/i.test(t);
  const sectionFor=el=>{
    let best='';
    for(const h of headings){
      if(h===el||h.contains(el))continue;
      const relation=h.compareDocumentPosition(el);
      if(relation&Node.DOCUMENT_POSITION_FOLLOWING)best=headingText(h);
    }
    return best;
  };
  const studentHeadings=headings.filter(h=>isStudents(headingText(h)));
  const out=[],seen=new Set(),rowKeys=new Set();
  const remember=(email,name,studentId,evidence)=>{
    email=clean(email).toLowerCase().replace(/^mailto:/i,'').split('?')[0];
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||seen.has(email))return;
    name=clean(name).replace(email,'').replace(/^(?:email|message)\s+(?:student\s+)?/i,'').replace(/\b(?:more actions|options)\b/ig,'').trim();
    if(name.length>160)name=name.slice(0,160);
    seen.add(email);out.push({email,name,sourceStudentId:clean(studentId),evidence:[evidence]});
  };
  const rowFor=el=>el.closest('[role="row"],li,[role="listitem"],article,[role="article"],[data-user-id]')||el.parentElement||el;
  for(const a of [...document.querySelectorAll('a[href^="mailto:"]')].filter(visible)){
    if(!isStudents(sectionFor(a)))continue;
    const row=rowFor(a),email=(a.getAttribute('href')||'').replace(/^mailto:/i,'').split('?')[0];
    const sid=row?.getAttribute?.('data-user-id')||row?.querySelector?.('[data-user-id]')?.getAttribute?.('data-user-id')||'';
    const label=clean(a.getAttribute('aria-label')||a.getAttribute('title'));
    const rowText=clean(row?.innerText||row?.textContent);
    remember(email,label||rowText,sid,'mailto');
    if(row)rowKeys.add(row);
  }
  // Some Classroom builds render the email as text or aria-label instead of a mailto link.
  const candidates=[...document.querySelectorAll('[data-user-id],[role="row"],li,[role="listitem"],article,[role="article"]')].filter(visible);
  for(const row of candidates){
    if(!isStudents(sectionFor(row)))continue;
    const text=clean(row.innerText||row.textContent),attrs=clean(`${row.getAttribute('aria-label')||''} ${row.getAttribute('title')||''}`);
    const match=`${text} ${attrs}`.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if(match){const sid=row.getAttribute('data-user-id')||row.querySelector?.('[data-user-id]')?.getAttribute?.('data-user-id')||'';remember(match[0],text,sid,'visible-email');rowKeys.add(row)}
  }
  // Count visible student-like rows separately so the caller can report that some
  // identities still need review instead of pretending the discovered email list is complete.
  let discoveredStudentRows=rowKeys.size;
  if(studentHeadings.length===1){
    for(const row of candidates){if(isStudents(sectionFor(row))&&clean(row.innerText||row.textContent).length>1)rowKeys.add(row)}
    discoveredStudentRows=Math.max(discoveredStudentRows,rowKeys.size);
  }
  return {courseId:String(expectedCourseId||''),students:out,discoveredStudentRows,studentsHeadingFound:studentHeadings.length===1};
}

module.exports={
  ROSTER_SCHEMA_VERSION,MAX_CLASSROOMS,MAX_STUDENTS_PER_CLASS,clean,normalizeEmail,validEmail,validCourseId,validStudentId,normalizeName,canonicalNameTokens,equivalentStudentName,normalizeStudent,periodNumber,isGenericPeriod,
  normalizeClassroom,normalizeRosterSnapshot,membershipKey,diffRosterSnapshots,normalizeMappings,mappingConflicts,classRosterIsAuthoritative,
  buildOperationsRosterCandidate,normalizeOperationsRoster,planOperationsRosterSync,collectClassroomPeopleDom
};
