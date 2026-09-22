const crypto=require('crypto');

const READY_SCHEMA_VERSION=1;
const MAX_READY_COURSES=20;
const MAX_READY_CHECKS_PER_COURSE=120;

function clean(value,max=1000){
  return String(value??'').replace(/\u0000/g,'').replace(/\r/g,'').replace(/[ \t]+/g,' ').trim().slice(0,max);
}

function stableKey(...parts){
  return crypto.createHash('sha256').update(parts.map(x=>clean(x,1000)).join('\n'),'utf8').digest('hex').slice(0,12);
}

function summarizeReadySnapshot(snapshot={}){
  const checks=(Array.isArray(snapshot.courses)?snapshot.courses:[]).flatMap(course=>Array.isArray(course.checks)?course.checks:[]);
  const pass=checks.filter(x=>x?.status==='pass').length;
  const warning=checks.filter(x=>x?.status==='warning').length;
  const block=checks.filter(x=>x?.status==='block').length;
  return {status:block?'BLOCKED':warning?'NEEDS_ATTENTION':'READY',pass,warning,block,total:checks.length};
}

function validateReadySnapshot(snapshot={}){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw new Error('Ready snapshot must be an object.');
  if(snapshot.schemaVersion!==READY_SCHEMA_VERSION)throw new Error('Ready snapshot schema version is not supported.');
  if(!clean(snapshot.generatedAt,80)||Number.isNaN(Date.parse(snapshot.generatedAt)))throw new Error('Ready snapshot timestamp is invalid.');
  if(!clean(snapshot.source,80)||!clean(snapshot.sourceVersion,80))throw new Error('Ready snapshot source information is missing.');
  if(!Array.isArray(snapshot.courses)||!snapshot.courses.length||snapshot.courses.length>MAX_READY_COURSES)throw new Error('Ready snapshot course list is missing or too large.');
  for(const course of snapshot.courses){
    if(!course||typeof course!=='object'||!clean(course.courseName,200))throw new Error('Ready snapshot contains an invalid course.');
    if(!Array.isArray(course.checks)||!course.checks.length||course.checks.length>MAX_READY_CHECKS_PER_COURSE)throw new Error('Ready snapshot contains an invalid check list.');
    const ids=new Set();
    for(const check of course.checks){
      const id=clean(check?.id,160),label=clean(check?.label,220),detail=clean(check?.detail,1400),status=check?.status;
      if(!id||!label||!detail||!['pass','warning','block'].includes(status))throw new Error('Ready snapshot contains an invalid check.');
      if(ids.has(id))throw new Error('Ready snapshot contains duplicate check IDs.');
      ids.add(id);
    }
  }
  return snapshot;
}

// Browser-context function. Keep self-contained so Playwright can serialize it.
// It reads assignment-level operational evidence only. No student roster, work,
// grades, comments, or identifiers are collected.
function readReadyAssignmentDom(){
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const main=document.querySelector('main,[role="main"]')||document.body;
  const due=new Map(),noDue=new Set();
  const canonicalDue=value=>clean(value).toLowerCase().replace(/^due(?:\s+date)?\s*[:\-]?\s*/i,'').replace(/[.,]+$/,'').trim();
  const addDue=value=>{
    const text=clean(value);if(!text||text.length>180)return;
    if(/^no\s+due\s+date\b/i.test(text)){noDue.add('no due date');return}
    if(!/^due(?:\s+date)?\b/i.test(text))return;
    const canonical=canonicalDue(text);
    if(!canonical||canonical==='date'||canonical==='due date')return;
    if(!due.has(canonical))due.set(canonical,text);
  };

  for(const el of [...main.querySelectorAll('[aria-label],[title],[data-tooltip]')].filter(visible)){
    for(const attr of ['aria-label','title','data-tooltip'])addDue(el.getAttribute(attr)||'');
  }
  for(const line of String(main.innerText||main.textContent||'').split(/\n+/))addDue(line);

  let dueState='unknown',dueDisplay='',dueCandidates=[...due.values()];
  if(noDue.size&&dueCandidates.length)dueState='ambiguous';
  else if(noDue.size){dueState='none';dueDisplay='No due date';}
  else if(dueCandidates.length===1){dueState='due';dueDisplay=dueCandidates[0];}
  else if(dueCandidates.length>1)dueState='ambiguous';

  const links=[],seen=new Set();
  for(const a of [...main.querySelectorAll('a[href]')].filter(visible)){
    try{
      const u=new URL(a.href,location.href);
      if(!/^https?:$/.test(u.protocol))continue;
      if(/(^|\.)classroom\.google\.com$/i.test(u.hostname))continue;
      const key=u.origin+u.pathname+u.search;
      if(seen.has(key))continue;seen.add(key);
      links.push({host:u.hostname.toLowerCase(),label:clean(a.innerText||a.getAttribute('aria-label')||a.getAttribute('title')).slice(0,240)});
      if(links.length>=40)break;
    }catch{/* malformed links are ignored and never treated as proof */}
  }

  return {
    due:{state:dueState,display:dueDisplay,candidates:dueCandidates.slice(0,8)},
    links,
    mainTextLength:clean(main.innerText||main.textContent).length
  };
}

function assignmentChecks({courseName='',assignmentTitle='',assignmentText='',assignmentTextTruncated=false,evidence={}}={}){
  const key=stableKey(courseName,assignmentTitle);
  const checks=[];
  const due=evidence?.due||{};
  if(due.state==='due'){
    checks.push({id:`${key}-due-date`,label:'Due date is clear',status:'pass',detail:`Classroom shows ${clean(due.display,220)}.`,assignmentTitle});
  }else if(due.state==='none'){
    checks.push({id:`${key}-due-date`,label:'Due date is clear',status:'pass',detail:'Classroom explicitly shows No due date.',assignmentTitle});
  }else if(due.state==='ambiguous'){
    checks.push({id:`${key}-due-date`,label:'Due date needs attention',status:'block',detail:'Classroom exposed more than one due-date state, so GoClassroom would not guess which one is correct.',assignmentTitle,suggestedAction:'Open the assignment and confirm its due date.'});
  }else{
    checks.push({id:`${key}-due-date`,label:'Due date needs attention',status:'block',detail:'GoClassroom could not prove one due date or an explicit No due date state from the assignment detail page.',assignmentTitle,suggestedAction:'Open the assignment and confirm its due date.'});
  }

  const directions=clean(assignmentText,20000);
  if(!directions){
    checks.push({id:`${key}-directions`,label:'Directions need a look',status:'warning',detail:'GoClassroom could not find readable assignment directions.',assignmentTitle,suggestedAction:'Open the assignment and make sure students have enough directions to begin.'});
  }else if(assignmentTextTruncated){
    checks.push({id:`${key}-directions`,label:'Directions need a look',status:'warning',detail:'The assignment directions were longer than the bounded Ready scan could verify completely.',assignmentTitle,suggestedAction:'Review the full directions in Classroom.'});
  }else{
    checks.push({id:`${key}-directions`,label:'Directions are readable',status:'pass',detail:'GoClassroom found readable assignment directions.',assignmentTitle});
  }

  const links=Array.isArray(evidence?.links)?evidence.links:[];
  const referencesResource=/\b(?:attach(?:ed|ment)?|worksheet|slides?|document|doc\b|link\b|resource|reading|article|file\b)\b/i.test(directions);
  if(links.length){
    checks.push({id:`${key}-attachments`,label:'Assignment links are present',status:'pass',detail:`GoClassroom found ${links.length} non-Classroom link${links.length===1?'':'s'} attached or referenced on the assignment page.`,assignmentTitle});
  }else if(referencesResource){
    checks.push({id:`${key}-attachments`,label:'Possible missing resource',status:'warning',detail:'The directions appear to refer to a file, link, reading, document, or other resource, but Ready did not find a non-Classroom link on the assignment page.',assignmentTitle,suggestedAction:'Check that the resource students need is actually attached or linked.'});
  }else{
    checks.push({id:`${key}-attachments`,label:'Resource check is clear',status:'pass',detail:'Ready found no clear sign that this assignment requires an attached resource.',assignmentTitle});
  }
  return checks;
}

function buildReadySnapshot({source='GoClassroom',sourceVersion='unknown',generatedAt=new Date().toISOString(),courses=[]}={}){
  const snapshot={
    schemaVersion:READY_SCHEMA_VERSION,
    generatedAt,
    source:clean(source,80)||'GoClassroom',
    sourceVersion:clean(sourceVersion,80)||'unknown',
    courses:(Array.isArray(courses)?courses:[]).map(course=>({
      courseName:clean(course.courseName,200)||'Classroom',
      windowLabel:clean(course.windowLabel,120)||undefined,
      checks:(Array.isArray(course.checks)?course.checks:[]).map(check=>({
        id:clean(check.id,160),
        label:clean(check.label,220),
        status:check.status,
        detail:clean(check.detail,1400),
        assignmentTitle:clean(check.assignmentTitle,300)||undefined,
        suggestedAction:clean(check.suggestedAction,600)||undefined
      }))
    }))
  };
  validateReadySnapshot(snapshot);
  return snapshot;
}

module.exports={
  READY_SCHEMA_VERSION,MAX_READY_COURSES,MAX_READY_CHECKS_PER_COURSE,
  clean,stableKey,summarizeReadySnapshot,validateReadySnapshot,readReadyAssignmentDom,assignmentChecks,buildReadySnapshot
};
