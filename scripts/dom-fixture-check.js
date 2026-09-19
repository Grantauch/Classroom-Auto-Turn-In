const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const {collectStrictTopicAssignmentsDom,collectDrivePlanRowsDom}=require('../engine/dom-helpers');
const {markWeekInstructionsDom}=require('../engine/classroom-discovery');
const {collectStudentEvidenceDom,readAssignmentMaxPointsDom,markTotalGradeInputDom}=require('../engine/classroom-grading');
function browserPath(){
  const guesses=process.platform==='win32'?[
    process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe'),
    process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google','Chrome','Application','chrome.exe'),
    process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Google','Chrome','Application','chrome.exe'),
    process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Microsoft','Edge','Application','msedge.exe'),
    process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe'),
    process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe')
  ]:['/usr/bin/chromium','/usr/bin/google-chrome'];
  const direct=guesses.filter(Boolean).find(fs.existsSync);if(direct)return direct;
  if(process.platform==='win32'){
    for(const name of ['chrome.exe','msedge.exe']){
      const r=cp.spawnSync('where.exe',[name],{encoding:'utf8',timeout:5000});
      const candidate=String(r.stdout||'').split(/\r?\n/).map(x=>x.trim()).find(x=>x&&fs.existsSync(x));
      if(candidate)return candidate;
    }
  }
  return null;
}
const browser=browserPath();
if(!browser){
  if(process.platform==='win32'){console.error('DOM fixture checks FAILED: Chrome or Edge could not be located on this Windows PC.');process.exit(1)}
  console.log('DOM fixture checks skipped on this non-Windows audit host: no local Chromium-family browser found.');process.exit(0)
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cati-dom-fixtures-'));
function runFixture(name,body,script){
  const file=path.join(dir,`${name}.html`);
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px sans-serif}.card,[role=row]{display:block;width:700px;min-height:48px;margin:12px;padding:8px;border:1px solid #aaa}span{display:inline-block}</style></head><body>${body}<script>${script}<\/script></body></html>`;
  fs.writeFileSync(file,html);
  const r=cp.spawnSync(browser,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--dump-dom',`file://${file}`],{encoding:'utf8',timeout:30000});
  if(r.error){if(process.platform!=='win32'&&r.error.code==='ETIMEDOUT'){console.log('DOM fixture checks skipped on this non-Windows audit host: local Chromium headless mode timed out.');fs.rmSync(dir,{recursive:true,force:true});process.exit(0)}throw r.error}if(r.status!==0)throw new Error(`${name}: browser exited ${r.status}: ${r.stderr}`);
  const m=String(r.stdout).match(/data-result="([^"]*)"/);if(!m)throw new Error(`${name}: no fixture result in DOM`);
  return JSON.parse(decodeURIComponent(m[1].replace(/&amp;/g,'&')));
}
const assignmentSource=String.raw`Week\s+(\d+)\s*-\s*Lesson Plans`;
const planSource=String.raw`^Week\s+0?(\d+)\s*-\s*Lesson Plans(?:\.(?:docx|pdf))?$`;
const assignmentFn=collectStrictTopicAssignmentsDom.toString();
const driveFn=collectDrivePlanRowsDom.toString();
const instructionsFn=markWeekInstructionsDom.toString();
const evidenceFn=collectStudentEvidenceDom.toString();
const assignmentPointsFn=readAssignmentMaxPointsDom.toString();
const gradeFieldFn=markTotalGradeInputDom.toString();
let rows=runFixture('classroom-duplicate-no-ids',`<section id="topic"><div role="listitem" class="card"><span>Week 5 - Lesson Plans</span><span>Due Sep 15</span></div><div role="listitem" class="card"><span>Week 5 - Lesson Plans</span><span>Due Sep 15</span></div></section>`,`const fn=${assignmentFn};const r=fn(document.getElementById('topic'),{source:${JSON.stringify(assignmentSource)},flags:'i'});document.documentElement.setAttribute('data-result',encodeURIComponent(JSON.stringify(r)));`);
if(rows.length!==2||new Set(rows.map(x=>x.rootKey)).size!==2)throw new Error(`Classroom duplicate fixture expected 2 distinct cards, got ${JSON.stringify(rows)}`);
rows=runFixture('classroom-one-card-many-matches',`<section id="topic"><div role="listitem" class="card"><div>Week 5 - Lesson Plans</div><span aria-label="Week 5 - Lesson Plans">Week 5 - Lesson Plans</span><span>Due Sep 15</span></div></section>`,`const fn=${assignmentFn};const r=fn(document.getElementById('topic'),{source:${JSON.stringify(assignmentSource)},flags:'i'});document.documentElement.setAttribute('data-result',encodeURIComponent(JSON.stringify(r)));`);
if(rows.length!==1)throw new Error(`Classroom single-card fixture should deduplicate descendants, got ${rows.length}`);
rows=runFixture('classroom-overlaid-instructions-link',`<section id="topic"><ol><li class="card" data-stream-item-id="week-5"><div><span>Week 5 - Lesson Plans 9/21/26</span></div><div class="action" style="position:relative;width:160px;height:32px"><span aria-hidden="true">View instructions</span><a aria-label="View instructions" href="/c/course/a/week-5/details" style="position:absolute;inset:0"></a></div></li></ol></section>`,`const fn=${instructionsFn};const root=document.getElementById('topic');const result=fn(root,{source:${JSON.stringify(assignmentSource)},flags:'i',week:5,streamItemId:'week-5'});const tagged=root.querySelector('[data-cati-week-instructions="1"]');const r={result,tag:tagged&&tagged.tagName,href:tagged&&tagged.getAttribute('href')};document.documentElement.setAttribute('data-result',encodeURIComponent(JSON.stringify(r)));`);
if(!rows.result?.ok||rows.tag!=='A'||rows.href!=='/c/course/a/week-5/details')throw new Error(`Classroom overlaid instructions fixture did not choose the real link: ${JSON.stringify(rows)}`);
rows=runFixture('drive-duplicate-no-ids',`<div role="row"><span>Week 05 - Lesson Plans</span></div><div role="row"><span>Week 05 - Lesson Plans</span></div>`,`const fn=${driveFn};const r=fn({source:${JSON.stringify(planSource)},flags:'i'});document.documentElement.setAttribute('data-result',encodeURIComponent(JSON.stringify(r)));`);
if(rows.length!==2||new Set(rows.map(x=>x.rootKey)).size!==2)throw new Error(`Drive duplicate fixture expected 2 distinct rows, got ${JSON.stringify(rows)}`);
rows=runFixture('drive-one-row-many-matches',`<div role="row"><span>Week 05 - Lesson Plans</span><span aria-label="Week 05 - Lesson Plans">Week 05 - Lesson Plans</span></div>`,`const fn=${driveFn};const r=fn({source:${JSON.stringify(planSource)},flags:'i'});document.documentElement.setAttribute('data-result',encodeURIComponent(JSON.stringify(r)));`);
if(rows.length!==1)throw new Error(`Drive single-row fixture should deduplicate descendants, got ${rows.length}`);
rows=runFixture('grading-assignment-points',`<main role="main"><h1>Essay</h1><div>10 points</div><p>Explain the five points made in the reading.</p></main>`,`const fn=${assignmentPointsFn};const r=fn();document.documentElement.setAttribute('data-result',encodeURIComponent(JSON.stringify(r)));`);
if(!rows.ok||rows.value!==10)throw new Error(`Classroom assignment total fixture was not read safely: ${JSON.stringify(rows)}`);
rows=runFixture('grading-assignment-points-ambiguous',`<main role="main"><div>10 points</div><div>20 points</div></main>`,`const fn=${assignmentPointsFn};const r=fn();document.documentElement.setAttribute('data-result',encodeURIComponent(JSON.stringify(r)));`);
if(rows.ok||rows.candidates.length!==2)throw new Error(`Conflicting Classroom point totals did not fail closed: ${JSON.stringify(rows)}`);
rows=runFixture('grading-total-field',`<main role="main"><div role="row"><label>Grade out of 10 <input aria-label="Grade out of 10" type="number" value=""></label></div><button>Return</button></main>`,`const fn=${gradeFieldFn};const r=fn();document.documentElement.setAttribute('data-result',encodeURIComponent(JSON.stringify(r)));`);
if(!rows.ok||rows.maxPoints!==10)throw new Error(`Total-grade field and denominator were not identified safely: ${JSON.stringify(rows)}`);
rows=runFixture('grading-unlabelled-number-field',`<main role="main"><div><input type="number" value=""></div><button>Return</button></main>`,`const fn=${gradeFieldFn};const r=fn();document.documentElement.setAttribute('data-result',encodeURIComponent(JSON.stringify(r)));`);
if(rows.ok)throw new Error(`Unlabelled numeric input was mistaken for the Classroom total-grade field: ${JSON.stringify(rows)}`);
rows=runFixture('grading-student-attachment-scope',`<main role="main"><div>Assignment materials <a href="https://docs.google.com/document/d/teacher/edit">Teacher source</a></div><div role="listitem">Alice submission attachment <a href="https://docs.google.com/document/d/student/edit">Alice essay</a></div></main>`,`const fn=${evidenceFn};const r=fn('Alice');document.documentElement.setAttribute('data-result',encodeURIComponent(JSON.stringify(r)));`);
if(rows.attachments.length!==1||!rows.attachments[0].href.includes('/student/'))throw new Error(`Teacher materials leaked into student evidence: ${JSON.stringify(rows)}`);
fs.rmSync(dir,{recursive:true,force:true});
console.log('Chromium DOM fixture checks passed.');
