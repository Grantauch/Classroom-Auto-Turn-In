const {parseClassroomIds}=require('./safety');

const MAX_CLASSROOM_BATCH=60;
const DEFAULT_CLASSROOM_BATCH=5;
const MAX_PAYLOAD_CHARS=250000;
const MAX_EVIDENCE_CHARS=60000;
const MAX_ATTACHMENT_COUNT=20;
const MAX_GRADE_POINTS=100000;

function clean(value,max=30000){return String(value??'').replace(/\u0000/g,'').replace(/\r/g,'').trim().slice(0,max)}
function strictNumber(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  const text=String(value??'').trim();
  if(!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text))return null;
  const number=Number(text);return Number.isFinite(number)?number:null;
}
function sameNumber(a,b){const left=strictNumber(a),right=strictNumber(b);return left!==null&&right!==null&&Math.abs(left-right)<=0.001}
function clampBatch(value){const n=Math.floor(Number(value)||DEFAULT_CLASSROOM_BATCH);return Math.max(1,Math.min(MAX_CLASSROOM_BATCH,n))}
function safeId(value,label='Classroom ID'){
  const id=clean(value,300);
  if(!id||!/^[A-Za-z0-9_-]+$/.test(id))throw new Error(`${label} is missing or invalid.`);
  return id;
}
function encodePayload(value){return Buffer.from(JSON.stringify(value),'utf8').toString('base64url')}
function decodePayload(value){
  const encoded=String(value||'');
  if(!encoded||encoded.length>MAX_PAYLOAD_CHARS||!/^[A-Za-z0-9_-]+$/.test(encoded))throw new Error('The Classroom grading request could not be read safely.');
  try{
    const parsed=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('invalid payload');
    return parsed;
  }
  catch{throw new Error('The Classroom grading request could not be read safely.')}
}
function assignmentUrls(courseId,assignmentId){
  const c=safeId(courseId,'Classroom course ID'),a=safeId(assignmentId,'Classroom assignment ID');
  const root=`https://classroom.google.com/c/${c}/a/${a}`;
  return {
    detailUrl:`${root}/details`,
    studentWorkUrl:`${root}/submissions/by-status/and-sort-last-name/done`,
    studentWorkAllUrl:`${root}/submissions/by-status/and-sort-last-name/all`
  };
}
function parseStudentSubmissionUrl(value){
  try{
    const u=new URL(String(value||''));
    if(!/(^|\.)classroom\.google\.com$/i.test(u.hostname))return {courseId:'',assignmentId:'',studentId:''};
    const parts=u.pathname.split('/').filter(Boolean);
    const ids=parseClassroomIds(u.href);let studentId='';
    for(let i=0;i<parts.length-1;i++)if(parts[i]==='student'){studentId=parts[i+1]||'';break}
    return {courseId:ids.courseId,assignmentId:ids.assignmentId,studentId};
  }catch{return {courseId:'',assignmentId:'',studentId:''}}
}
function googleAttachmentInfo(value){
  try{
    const u=new URL(String(value||''));
    const host=u.hostname.toLowerCase();
    const m=u.pathname.match(/\/(document|spreadsheets|presentation)\/d\/([^/?#]+)/i);
    if(host==='docs.google.com'&&m){
      const kind=m[1].toLowerCase(),id=m[2];
      if(kind==='document')return {supported:true,kind:'document',id,sourceUrl:u.href,exportUrl:`https://docs.google.com/document/d/${id}/export?format=txt`};
      return {supported:false,kind,id,sourceUrl:u.href,exportUrl:''};
    }
    const d=u.pathname.match(/^\/file\/d\/([^/?#]+)/i);
    if(host==='drive.google.com'&&d)return {supported:false,kind:'drive-file',id:d[1],sourceUrl:u.href,exportUrl:''};
    return null;
  }catch{return null}
}
function pointCandidatesFromText(text,maxLength=60000){
  const s=clean(text,maxLength),collect=patterns=>{const found=new Set();for(const re of patterns){for(const match of s.matchAll(re)){const n=Number(match[1]);if(Number.isFinite(n)&&n>0&&n<=MAX_GRADE_POINTS)found.add(n)}}return [...found]};
  const explicit=collect([/\b(?:total|max(?:imum)?)\s+points?\s*[:/]?\s*(\d+(?:\.\d+)?)\b/ig,/\btotal\s*[:/]?\s*(\d+(?:\.\d+)?)\s+points?\b/ig,/\bout\s+of\s+(\d+(?:\.\d+)?)\b/ig]);
  if(explicit.length)return explicit;
  return collect([/\b(\d+(?:\.\d+)?)\s+points?\b/ig,/\bpoints?\s*[:/]\s*(\d+(?:\.\d+)?)\b/ig]);
}
function extractMaxPoints(text){
  const found=pointCandidatesFromText(text);
  return found.length===1?found[0]:null;
}

// Browser-context function. Keep self-contained so Playwright can serialize it.
// A teacher's Classwork page renders collapsed cards that carry no assignment links at all.
// Each card does carry data-stream-item-id, the assignment's numeric id, and Classroom's own
// URLs are the base64 of that number. The caller verifies one card against a real link before
// trusting the rest, and falls back to expanding every card when that check fails.
function collectTeacherAssignmentsDom(expectedCourseId){
  const clean=v=>String(v||'').replace(/[ \t]+/g,' ').trim();
  const course=String(expectedCourseId||'');
  const noise=/^(?:assignment|material|quiz assignment|question|more_vert|More options|Collapse|Expand|View|Posted\b.*|Due\b.*|Edited\b.*|No due date.*|\d+\s+(?:Turned in|Assigned|Graded).*)$/i;
  const rows=[],seen=new Set();
  for(const item of document.querySelectorAll('li[data-stream-item-id]')){
    const numericId=clean(item.getAttribute('data-stream-item-id'));
    if(!/^\d{6,}$/.test(numericId)||seen.has(numericId))continue;
    let assignmentId='';
    try{assignmentId=btoa(numericId)}catch{assignmentId=''}
    if(!assignmentId)continue;
    const lines=clean(item.innerText).split('\n').map(clean).filter(Boolean);
    let title=lines.find(line=>line.length>1&&!noise.test(line))||'';
    if(!title){
      title=clean(item.innerText)
        .replace(/^(?:assignment|material|quiz assignment|question)\s+/i,'')
        .replace(/\s+(?:Posted|Due|Edited)\b.*$/i,'')
        .replace(/\s*more_vert\b.*$/i,'')
        .trim();
    }
    seen.add(numericId);
    rows.push({
      courseId:course,
      assignmentId,
      numericId,
      title:title||`Assignment ${numericId}`,
      detailUrl:`https://classroom.google.com/c/${course}/a/${assignmentId}/details`,
      studentWorkUrl:`https://classroom.google.com/c/${course}/a/${assignmentId}/submissions/by-status/and-sort-last-name/done`
    });
  }
  return rows;
}

// Browser-context function. Keep self-contained so Playwright can serialize it.
function collectClassroomAssignmentsDom(expectedCourseId){
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const rows=[],seen=new Set();
  const course=String(expectedCourseId||'');
  const anchors=[...document.querySelectorAll('a[href]')].filter(visible);
  for(const a of anchors){
    try{
      const u=new URL(a.href,location.href),parts=u.pathname.split('/').filter(Boolean);
      let c='',assignmentId='';
      for(let i=0;i<parts.length-1;i++){if(parts[i]==='c'&&!c)c=parts[i+1]||'';if(parts[i]==='a'&&!assignmentId)assignmentId=parts[i+1]||'';}
      if(!assignmentId||!c||(course&&c!==course)||seen.has(assignmentId))continue;
      if(!parts.includes('details')&&!parts.includes('submissions'))continue;
      const card=a.closest('[data-stream-item-id],li,[role="listitem"],article,[role="article"],[role="row"],section')||a.parentElement||a;
      const headings=card?[...card.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].filter(visible).map(x=>clean(x.innerText||x.getAttribute('aria-label'))).filter(Boolean):[];
      const linkText=clean(a.innerText||a.getAttribute('aria-label')||a.getAttribute('title'));
      const generic=/^(?:view\s+(?:assignment|instructions|details)|turned in|assigned|student work|open)$/i;
      let title=headings.find(x=>!generic.test(x))||(!generic.test(linkText)?linkText:'');
      if(!title&&card){
        const lines=clean(card.innerText).split(/\s{2,}|\n/).map(clean).filter(Boolean);
        title=lines.find(x=>x.length>2&&!/^(?:due|posted|turned in|assigned|graded|returned|missing)\b/i.test(x))||'';
      }
      let submissionHref='';
      const submissionAnchor=card?[...card.querySelectorAll('a[href]')].find(x=>/\/a\/[^/]+\/submissions\//.test(x.href||'')):null;
      if(submissionAnchor)submissionHref=submissionAnchor.href;
      rows.push({courseId:c,assignmentId,title:title||`Assignment ${assignmentId}`,detailUrl:`https://classroom.google.com/c/${c}/a/${assignmentId}/details`,studentWorkUrl:submissionHref||`https://classroom.google.com/c/${c}/a/${assignmentId}/submissions/by-status/and-sort-last-name/done`});
      seen.add(assignmentId);
    }catch{/* ignore malformed page links */}
  }
  return rows;
}

// Browser-context function. Collect only stable submission-link identity and the
// current row's visible grade/status. The actual student work is read later.
function collectStudentSubmissionRowsDom(expectedAssignmentId){
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const out=[],seen=new Set(),expected=String(expectedAssignmentId||'');
  for(const a of [...document.querySelectorAll('a[href*="/submissions/"][href*="/student/"]')].filter(visible)){
    try{
      const u=new URL(a.href,location.href),m=u.pathname.match(/\/a\/([^/]+)\/submissions\/[^#?]*?\/student\/([^/?#]+)/);
      if(!m||m[1]!==expected||seen.has(m[2]))continue;
      const root=a.closest('[role="row"],li,[role="listitem"],article,[role="article"],[data-student-id]')||a.parentElement||a;
      const text=clean(root.innerText||root.textContent),name=clean(a.innerText||a.getAttribute('aria-label')||a.getAttribute('title'))||`Student ${m[2]}`;
      let status='';
      for(const label of ['Turned in','Draft grade','Graded','Returned','Assigned','Missing'])if(new RegExp(`\\b${label.replace(' ','\\s+')}\\b`,'i').test(text)){status=label;break}
      const inputs=[...root.querySelectorAll('input,[role="spinbutton"],[role="textbox"]')].filter(visible);
      let existingGrade='';
      for(const input of inputs){
        const label=clean(input.getAttribute('aria-label')||input.getAttribute('title'));
        if(/grade|points?/i.test(label)||inputs.length===1){const value=clean(input.value||input.getAttribute('value'));if(/^\d+(?:\.\d+)?$/.test(value)){existingGrade=value;break}}
      }
      out.push({studentId:m[2],studentName:name,studentUrl:u.href,status,existingGrade,rowText:text.slice(0,1200)});seen.add(m[2]);
    }catch{/* ignore malformed links */}
  }
  return out;
}

// Browser-context function. Direct-answer extraction is intentionally strict:
// only answer/response-labelled controls are accepted. Comment and grade fields
// are excluded. Attachments are returned separately and validated outside DOM.
function collectStudentEvidenceDom(studentName=''){
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const answers=[],attachments=[],seenAnswers=new Set(),seenLinks=new Set();let oversizedEvidence=false,tooManyAttachments=false;
  const controls=[...document.querySelectorAll('textarea,input[type="text"],[role="textbox"],[aria-label]')].filter(visible);
  for(const el of controls){
    const label=clean(el.getAttribute('aria-label')||el.getAttribute('title'));
    if(!/(?:student\s+)?(?:answer|response)|short answer/i.test(label))continue;
    if(/comment|grade|feedback/i.test(label))continue;
    const value=clean(el.value||el.innerText||el.textContent);
    if(value&&value.length>60000){oversizedEvidence=true;continue}
    if(value&&!seenAnswers.has(value)){seenAnswers.add(value);answers.push(value)}
  }
  const main=document.querySelector('main,[role="main"]')||document.body;
  for(const a of [...main.querySelectorAll('a[href]')].filter(visible)){
    try{
      const u=new URL(a.href,location.href),host=u.hostname.toLowerCase();
      if(host!=='docs.google.com'&&host!=='drive.google.com')continue;
      const href=u.href;if(seenLinks.has(href))continue;
      const root=a.closest('[role="listitem"],article,[role="article"],[role="row"],div')||a;
      const context=clean(root.innerText||root.textContent);
      // Exclude navigation/course material links when their nearby text clearly
      // identifies instructions/materials instead of selected student work.
      const named=studentName&&context.toLowerCase().includes(String(studentName).toLowerCase());
      const submissionContext=/student\s+work|submission|submitted|attachment|turned\s+in/i.test(context);
      if(/class materials?|assignment materials?|instructions/i.test(context)&&!named)continue;
      if(!named&&!submissionContext)continue;
      if(attachments.length>=20){tooManyAttachments=true;continue}
      attachments.push({href,title:clean(a.innerText||a.getAttribute('aria-label')||a.getAttribute('title'))||'Attachment',context:context.slice(0,500)});seenLinks.add(href);
    }catch{/* ignore malformed links */}
  }
  return {directAnswers:answers,attachments,oversizedEvidence,tooManyAttachments};
}


function extractAssignmentTextDom(expectedTitle=''){
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const main=document.querySelector('main,[role="main"]')||document.body;
  const clone=main.cloneNode(true);
  for(const el of [...clone.querySelectorAll('nav,header,aside,button,input,textarea,[role="button"],[role="menu"],[role="dialog"],[aria-label*="comment" i]')])el.remove();
  const raw=String(clone.innerText||clone.textContent||'').split(/\n+/).map(clean).filter(Boolean);
  const title=clean(expectedTitle),skip=/^(?:class comments?|private comments?|your work|student work|instructions|assigned|turned in|graded|returned|missing)$/i;
  const lines=[];
  for(const line of raw){
    if(skip.test(line))continue;
    if(title&&line===title)continue;
    if(/^\d+(?:\.\d+)?\s+points?$/i.test(line))continue;
    if(/^due\b/i.test(line)||/^posted\b/i.test(line))continue;
    if(lines.includes(line))continue;
    lines.push(line);
  }
  const fullText=lines.join('\n'),fullMain=clean(main.innerText||main.textContent,100000);
  const truncated=fullText.length>20000||fullMain.length>30000;
  return {title:title||clean((main.querySelector('h1,[role="heading"]')||{}).innerText),text:fullText.slice(0,20000),mainText:fullMain.slice(0,30000),truncated};
}

// Browser-context function. A single, explicit Classroom point total is
// required. Multiple visible totals are ambiguous and therefore fail closed.
function readAssignmentMaxPointsDom(){
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const add=(set,value)=>{const n=Number(value);if(Number.isFinite(n)&&n>0&&n<=100000)set.add(n)};
  const scan=(set,text)=>{
    const s=clean(text),patterns=[/\b(\d+(?:\.\d+)?)\s+points?\b/ig,/\b(?:total|max(?:imum)?)\s+points?\s*[:/]?\s*(\d+(?:\.\d+)?)\b/ig,/\bout\s+of\s+(\d+(?:\.\d+)?)\b/ig];
    for(const re of patterns){for(const m of s.matchAll(re))add(set,m[1])}
  };
  const main=document.querySelector('main,[role="main"]')||document.body,explicit=new Set(),exactLine=new Set();
  for(const el of [...main.querySelectorAll('[aria-label],[title],[data-tooltip]')].filter(visible)){
    const label=`${el.getAttribute('aria-label')||''} ${el.getAttribute('title')||''} ${el.getAttribute('data-tooltip')||''}`;
    if(/total|max(?:imum)?|out\s+of/i.test(label))scan(explicit,label);
  }
  if(explicit.size===1)return {ok:true,value:[...explicit][0],candidates:[...explicit],reason:''};
  if(explicit.size>1)return {ok:false,value:null,candidates:[...explicit],reason:'Classroom showed conflicting explicit assignment point totals.'};
  const text=String(main.innerText||main.textContent||'');
  for(const line of text.split(/\n+/).map(clean).filter(Boolean)){
    const match=line.match(/^(\d+(?:\.\d+)?)\s+points?$/i);if(match)add(exactLine,match[1]);
    if(/^(?:total|max(?:imum)?)\s+points?\s*[:/]?\s*\d/i.test(line))scan(exactLine,line);
  }
  const values=[...exactLine];
  return {ok:values.length===1,value:values.length===1?values[0]:null,candidates:values,reason:values.length?'Classroom showed more than one possible assignment point total.':'CATI could not find one explicit Classroom assignment point total.'};
}

function markTotalGradeInputDom(){
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  for(const el of document.querySelectorAll('[data-cati-grade-target]'))el.removeAttribute('data-cati-grade-target');
  const all=[...document.querySelectorAll('input,[role="spinbutton"]')].filter(visible);
  const rows=all.map(el=>({el,label:clean(el.getAttribute('aria-label')||el.getAttribute('title')),value:clean(el.value||el.getAttribute('value')),type:clean(el.getAttribute('type')),inputmode:clean(el.getAttribute('inputmode'))}));
  const safe=rows.filter(x=>!/(?:rubric|criterion|maximum|max points?)/i.test(x.label||''));
  const exact=safe.filter(x=>/^(?:total\s+)?grade(?:\s+edit)?(?:\b|$)/i.test(x.label||''));
  const labelled=exact.length?exact:safe.filter(x=>/\b(?:total\s+)?grade\b/i.test(x.label||''));
  let candidates=labelled;
  if(!candidates.length){
    const numeric=safe.filter(x=>String(x.type||'').toLowerCase()==='number'||String(x.inputmode||'').toLowerCase()==='decimal');
    const contextual=numeric.filter(x=>/\bgrade\b/i.test(clean((x.el.closest('[role="row"],section,article,div')||x.el.parentElement||x.el).innerText||'')));
    if(contextual.length===1)candidates=contextual;
  }
  if(candidates.length!==1)return {ok:false,count:candidates.length,allCount:rows.length};
  const hit=candidates[0],points=new Set(),add=value=>{const n=Number(value);if(Number.isFinite(n)&&n>0&&n<=100000)points.add(n)};
  const ariaMax=hit.el.getAttribute('aria-valuemax')||hit.el.getAttribute('max');if(ariaMax)add(ariaMax);
  const context=clean(`${hit.label} ${(hit.el.closest('[role="row"],section,article,div')||hit.el.parentElement||hit.el).innerText||''}`);
  for(const re of [/\bout\s+of\s+(\d+(?:\.\d+)?)\b/ig,/\/\s*(\d+(?:\.\d+)?)\b/g,/\b(\d+(?:\.\d+)?)\s+points?\b/ig])for(const m of context.matchAll(re))add(m[1]);
  const maxValues=[...points];
  if(maxValues.length!==1)return {ok:false,count:1,allCount:rows.length,reason:maxValues.length?'CATI found conflicting point totals beside the grade field.':'CATI could not verify the assignment point total beside the grade field.'};
  hit.el.setAttribute('data-cati-grade-target','1');
  return {ok:true,count:1,label:hit.label,value:hit.value,maxPoints:maxValues[0]};
}

function findGradeInputsDom(){
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  return [...document.querySelectorAll('input,[role="spinbutton"]')].filter(visible).map((el,index)=>({
    index,label:clean(el.getAttribute('aria-label')||el.getAttribute('title')),value:clean(el.value||el.getAttribute('value')),type:clean(el.getAttribute('type')),inputmode:clean(el.getAttribute('inputmode'))
  }));
}

module.exports={
  MAX_CLASSROOM_BATCH,DEFAULT_CLASSROOM_BATCH,MAX_PAYLOAD_CHARS,MAX_EVIDENCE_CHARS,MAX_ATTACHMENT_COUNT,clean,strictNumber,sameNumber,clampBatch,safeId,encodePayload,decodePayload,assignmentUrls,parseStudentSubmissionUrl,
  googleAttachmentInfo,pointCandidatesFromText,extractMaxPoints,collectClassroomAssignmentsDom,collectTeacherAssignmentsDom,collectStudentSubmissionRowsDom,collectStudentEvidenceDom,extractAssignmentTextDom,readAssignmentMaxPointsDom,markTotalGradeInputDom,findGradeInputsDom
};
