const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let plans=[];
let cfg={};
let machine={role:'primary',displayName:'This PC',backupDelayMinutes:60};
let running=false;
let wizardStep=1;
let aiVisible=false;
let latestDashboard=null;
let latestAiState=null;
let confirmResolver=null;
let previousFocus=null;
const dirty=new Set();

window.addEventListener('unhandledrejection',event=>{event.preventDefault();toast(event.reason?.message||'CATI_UI|AT-UI-999|Auto Turn-In hit an unexpected problem. Nothing uncertain was submitted or changed. Restart the app if this happens again.',true);});
window.addEventListener('error',event=>{if(!event?.error)return;toast('CATI_UI|AT-UI-998|Auto Turn-In hit an unexpected screen problem. Your saved setup was not intentionally changed. Close and reopen the app if it happens again.',true);});

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(v){if(!v)return 'Never';const d=new Date(v);return Number.isNaN(d.getTime())?'Unknown':d.toLocaleString();}
function relativeTime(v){
  if(!v)return 'Never'; const d=new Date(v); if(Number.isNaN(d.getTime()))return 'Unknown';
  const sec=Math.round((d-Date.now())/1000),abs=Math.abs(sec);
  if(abs<45)return 'just now'; const rtf=new Intl.RelativeTimeFormat(undefined,{numeric:'auto'});
  if(abs<3600)return rtf.format(Math.round(sec/60),'minute');
  if(abs<86400)return rtf.format(Math.round(sec/3600),'hour');
  if(abs<604800)return rtf.format(Math.round(sec/86400),'day');
  return d.toLocaleDateString();
}
function formatClock(v){
  const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/); if(!m)return v||'';
  const d=new Date();d.setHours(Number(m[1]),Number(m[2]),0,0);return d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
}
function addMinutes(v,n){const m=String(v||'06:30').match(/^(\d{1,2}):(\d{2})$/);if(!m)return v;const total=(Number(m[1])*60+Number(m[2])+n)%(24*60);return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;}
function classroomName(c=cfg){return c?.courseDisplayName||(c?.courseUrl?'Classroom selected':'No Classroom selected.');}
function driveFolderName(c=cfg){return c?.driveFolderName||(c?.driveFolderUrl?'Drive folder selected':'No Drive folder selected.');}
function dayName(code){return ({MON:'Mon',TUE:'Tue',WED:'Wed',THU:'Thu',FRI:'Fri',SAT:'Sat',SUN:'Sun'}[String(code||'').toUpperCase()]||String(code||''));}
function formatDays(days=[]){return days.length?days.map(dayName).join(', '):'No days selected';}
function shiftedDays(days=[],time='06:30',offset=0){const order=['SUN','MON','TUE','WED','THU','FRI','SAT'],m=String(time||'06:30').match(/^(\d{1,2}):(\d{2})$/);if(!m)return days;const shift=Math.floor((Number(m[1])*60+Number(m[2])+Number(offset||0))/1440);return days.map(code=>order[(order.indexOf(code)+shift+7)%7]);}
function planSourceLabel(source){return ({manual:'Added manually',import:'Imported from a saved list'}[String(source||'').toLowerCase()]||'Added manually');}

function activePage(){return $('.page.active')?.id||'dashboard';}
function dirtyForPage(id=activePage()){return ({setup:'setup',plans:'plans',automation:'automation',ai:'ai',grading:'grading',rosters:'rosters'}[id]||null);}
function markDirty(section){if(!section)return;dirty.add(section);renderUnsaved();}
function clearDirty(section){dirty.delete(section);renderUnsaved();}
function renderUnsaved(){
  const section=dirtyForPage(); const bar=$('#unsavedBar'); const show=section&&dirty.has(section);
  bar.classList.toggle('hidden',!show);
  if(show)$('#unsavedText').textContent=({setup:'Setup has changes that are not saved yet.',plans:'The manual plan list has changes that are not saved yet.',automation:'Your schedule changes are not saved yet.',ai:'AI recovery settings have changes that are not saved yet.',grading:'Local grading settings have changes that are not saved yet.',rosters:'Class-to-period roster mappings have changes that are not saved yet.'}[section]);
}

async function go(id,{force=false}={}){
  if(id==='ai'&&!aiVisible)return false;
  const from=activePage(),section=dirtyForPage(from);
  if(!force&&from!==id&&section&&dirty.has(section)){
    const discard=await askConfirm('Discard unsaved changes?','You changed settings on this page but have not saved them yet.',{ok:'Discard changes',danger:true});
    if(!discard)return false;
    clearDirty(section);
    await reloadSection(from);
  }
  $$('.page').forEach(x=>x.classList.toggle('active',x.id===id));
  $$('.nav').forEach(x=>{const on=x.dataset.page===id;x.classList.toggle('active',on);if(on)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});
  if(id==='logs'){await loadLogs();await loadHelpSummary();}
  if(id==='dashboard')await loadDashboard();
  if(id==='setup')await loadSetup();
  if(id==='plans')await loadPlans();
  if(id==='ai')await loadAi();
  if(id==='grading')await loadGrading();
  if(id==='rosters')await loadRosters();
  if(id==='automation')await loadAutomation();
  renderUnsaved();
  const heading=$('.page.active h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  return true;
}
async function reloadSection(id){if(id==='setup')return loadSetup();if(id==='plans')return loadPlans();if(id==='ai')return loadAi();if(id==='grading')return loadGrading();if(id==='rosters')return loadRosters();if(id==='automation')return loadAutomation();}
$$('.nav').forEach(b=>b.onclick=()=>go(b.dataset.page));
$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

function applyAiVisibility(ai={}){
  const settings=ai.settings||{},pending=Number(ai.pendingCount||0);const show=!!settings.optedIn||!!settings.enabled||pending>0;
  aiVisible=show;$('#aiNav')?.classList.toggle('hidden',!show);$('#aiHomePanel')?.classList.toggle('hidden',!show);
  if(!show&&$('#ai')?.classList.contains('active'))go('dashboard',{force:true});
  return show;
}

function decodeUserMessage(msg,{error=false}={}){
  const raw=String(msg??'').trim();
  const tagged=raw.match(/CATI_UI\|([A-Z0-9-]+)\|([\s\S]+)$/i);
  if(tagged)return {message:tagged[2].trim(),code:tagged[1].toUpperCase()};
  let clean=raw.replace(/^CATI_ERROR:/,'').replace(/^Error invoking remote method ['"][^'"]+['"]:\s*Error:\s*/i,'').trim();
  if(/DUE_DATE_UNKNOWN|due date could not|could not be determined/i.test(clean)){
    const week=clean.match(/\bWeek\s+\d+\b/i)?.[0]||'';
    return {message:`${week?`${week}'s`:'The'} Classroom due date could not be read clearly from either the Classwork card or the verified assignment page. Nothing was submitted. Check that assignment's due date in Classroom, then try again.`,code:'AT-CLS-110'};
  }
  const known=[
    [/RUN_LOCKED|already active|running right now/i,'A check is already running. Wait for it to finish, then try again.','AT-RUN-102'],
    [/safety certificate|dry-run safety|has not passed a safety check|needs another safety check|run the safety check/i,'The current setup needs another Safety Check before automatic turn-in can be used.','AT-SAFE-101'],
    [/accounts\.google\.com|sign[ -]?in|session expired|choose an account/i,'Google needs you to sign in again. Nothing was submitted. Open Setup and reconnect to the correct work Google account.','AT-GGL-101'],
    [/DATA_CORRUPT|could not be read safely|saved submission history|saved auto turn-in settings are damaged/i,'Saved Auto Turn-In information is damaged, so automatic submission is paused to prevent a duplicate or incorrect turn-in. Open Help & support before turning it back on.','AT-DATA-101'],
    [/UNEXPECTED_ATTACHMENT|unexpected attachment/i,'This assignment already has another attachment in Your work. Nothing was submitted. Remove the extra attachment, then check again.','AT-ATT-101'],
    [/MISSING_PLAN|no matching plan/i,'Classroom has a matching assignment, but the lesson plan was not found in the approved Drive folder. Nothing was submitted.','AT-PLAN-105'],
    [/OpenAI API key|API key is not configured|API key looks incomplete/i,'Optional AI recovery needs a valid OpenAI private key. Normal Auto Turn-In is unaffected.','AT-AI-202'],
    [/AI drafting timed out|could not reach OpenAI|OpenAI draft request failed/i,'OpenAI could not create the missing-plan draft right now. Nothing was uploaded or submitted. Check the internet connection and try again later.','AT-AI-203'],
    [/duplicate/i,'More than one file or assignment matches the same week. Nothing was submitted. Remove or rename the duplicate, then check again.','AT-MATCH-101']
  ];
  for(const [re,message,code] of known)if(re.test(clean))return {message,code};
  const developer=/error invoking|remote method|ipc|json|regular expression|regex|localappdata|userdata|powershell|task scheduler|exit code|err_|undefined|null|fingerprint|course id|assignment id|stream id|stdout|stderr|schema|\bat\s+[^ ]+\.js|eacces|enoent|eperm/i;
  if(error&&developer.test(clean))return {message:'Auto Turn-In could not complete that action safely. Nothing uncertain was submitted or changed. Try the action once more, then open Help & support if it repeats.',code:'AT-APP-999'};
  return {message:clean||'Auto Turn-In could not complete that action.',code:null};
}
function friendlyMessage(msg){return decodeUserMessage(msg,{error:true}).message;}
function blockerEvidence(b={}){
  const parts=[];
  if(b.week)parts.push(`Week ${b.week}`);
  if(b.dueSource)parts.push(`due-date source: ${String(b.dueSource).slice(0,120)}`);
  if(b.dueText)parts.push(`detected: ${String(b.dueText).replace(/\s+/g,' ').trim().slice(0,160)}`);
  return parts.length?` [${parts.join('; ')}]`:'';
}
function toast(msg,error=false,{persist=error}={}){
  const decoded=decodeUserMessage(msg,{error});const region=$('#toastRegion');const item=document.createElement('div');item.className=`toast${error?' error':''}`;item.setAttribute('role',error?'alert':'status');
  const code=error&&decoded.code?`<small class="support-code">Support code: ${escapeHtml(decoded.code)}</small>`:'';
  item.innerHTML=`<div class="toast-icon"><svg><use href="#${error?'i-warning':'i-check'}"/></svg></div><div class="toast-copy"><p>${escapeHtml(decoded.message)}</p>${code}</div><button class="toast-close" aria-label="Dismiss notification">×</button>`;
  item.querySelector('.toast-close').onclick=()=>item.remove();region.appendChild(item);
  if(!persist)setTimeout(()=>item.remove(),4200);
  return item;
}
function setStatus(msg,error=false){msg=decodeUserMessage(msg,{error}).message;const el=$('#runStatus');if(el){el.textContent=msg;el.classList.toggle('error',error);}toast(msg,error);}

function setBusy(btn,busy,label='Working…'){
  if(!btn)return;
  if(busy){if(!btn.dataset.originalHtml)btn.dataset.originalHtml=btn.innerHTML;btn.classList.add('is-loading');btn.disabled=true;btn.innerHTML=`<span>${escapeHtml(label)}</span>`;}
  else{btn.classList.remove('is-loading');btn.disabled=false;if(btn.dataset.originalHtml){btn.innerHTML=btn.dataset.originalHtml;delete btn.dataset.originalHtml;}}
}
async function withBusy(btn,label,fn){setBusy(btn,true,label);try{return await fn();}finally{setBusy(btn,false);}}
let setupBrowserBusy=false;
const setupBrowserButtonIds=['selectCourse','discoverTopics','selectDriveFolder','scanDriveFolder','wizSelectCourse','wizFindTopics','wizSelectDrive','wizScanDrive','wizNext','wizBack','wizRunTest','wizFinish','runTest','runLive','saveSetup','installSchedule','removeSchedule','syncDrivePlans'];
async function withSetupBrowserLock(label,fn){
  if(setupBrowserBusy){toast('Finish or cancel the open Google setup window before starting another setup action.',true);return null}
  setupBrowserBusy=true;
  const states=setupBrowserButtonIds.map(id=>{const button=$('#'+id);const disabled=button?.disabled; if(button)button.disabled=true;return {button,disabled}});
  setStatus(`${label} is open in Google. Finish or cancel it there before continuing.`);
  try{return await fn()}finally{setupBrowserBusy=false;for(const {button,disabled} of states)if(button)button.disabled=!!disabled}
}

function askConfirm(title,text,{ok='Continue',cancel='Cancel',danger=false}={}){
  if(confirmResolver){confirmResolver(false);confirmResolver=null;}
  previousFocus=document.activeElement;$('#confirmTitle').textContent=title;$('#confirmText').textContent=text;$('#confirmOk').textContent=ok;$('#confirmOk').className=`btn ${danger?'danger':'primary'}`;$('#confirmCancel').textContent=cancel;
  const layer=$('#confirmModal');layer.classList.remove('hidden');layer.setAttribute('aria-hidden','false');$('#confirmCancel').focus();
  return new Promise(resolve=>{confirmResolver=resolve;});
}
function closeConfirm(result){const layer=$('#confirmModal');layer.classList.add('hidden');layer.setAttribute('aria-hidden','true');const r=confirmResolver;confirmResolver=null;if(r)r(result);previousFocus?.focus?.();}
$('#confirmCancel').onclick=()=>closeConfirm(false);$('#confirmOk').onclick=()=>closeConfirm(true);

function trapFocus(layer,e){
  if(e.key==='Escape'){if(layer.id==='confirmModal')closeConfirm(false);else if(layer.id==='wizard')hideWizard();return;}
  if(e.key!=='Tab')return;const nodes=[...layer.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
}
$('#wizard').addEventListener('keydown',e=>trapFocus($('#wizard'),e));$('#confirmModal').addEventListener('keydown',e=>trapFocus($('#confirmModal'),e));

function literalPattern(s){
  let out='',space=false;for(const ch of s){if(/\s/.test(ch)){if(!space)out+='\\s+';space=true;continue}space=false;out+=/[\\^$.*+?()[\]{}|\-]/.test(ch)?`\\${ch}`:ch;}return out;
}
function regexFromExample(example,{file=false}={}){
  let s=String(example||'').trim();if(!s)return '';
  if(file)s=s.replace(/\.(docx|pdf)$/i,'');
  // Only the number attached to the word "Week" defines the week. This avoids
  // misreading examples such as "2026 Week 5" or "Unit 3 - Week 5".
  const m=/\bweek(\s*[-#:]?\s*)(0?\d{1,2})\b/i.exec(s);if(!m)return '';
  const local=m[0].lastIndexOf(m[2]);const numberIndex=m.index+local;
  const prefix=s.slice(0,numberIndex),suffix=s.slice(numberIndex+m[2].length);const week=m[2].length>1&&/^0/.test(m[2])?'0?(\\d+)':'(\\d+)';
  return `^${literalPattern(prefix)}${week}${literalPattern(suffix)}${file?'(?:\\.(?:docx|pdf))?':''}$`;
}
function syncExampleToRegex(exampleId,regexId,file=false){const value=$(exampleId).value.trim();const generated=regexFromExample(value,{file});if(generated)$(regexId).value=generated;}
function assertExampleValid(exampleId,{file=false,label='Naming example'}={}){const value=$(exampleId).value.trim();if(value&&!regexFromExample(value,{file}))throw new Error(`${label} must include a week number, such as Week 5.`);}
function protectedChanged(next){return ['topicName','assignmentTitleRegex','planTitleRegex','eligibilityMode','submitOverdue'].some(k=>String(next[k]??'')!==String(cfg[k]??''));}

async function checkEnvironment(targets=[]){
  const list=Array.isArray(targets)?targets:[targets];
  try{const r=await cati.checkEnvironment();const browser=r.browser?.detected?(r.browser.label||'Chrome or Edge'):'Chrome or Edge was not found';const msg=r.ready?`${browser} is ready.`:`${browser}. ${r.profileWritable?'Auto Turn-In can remember the Google sign-in.':'Auto Turn-In cannot remember the Google sign-in on this computer.'}`;for(const t of list)if(t)t.textContent=msg;const card=$('.env-card');if(card){card.classList.toggle('good',!!r.ready);card.classList.toggle('bad',!r.ready)}return r;}
  catch(e){for(const t of list)if(t)t.textContent=friendlyMessage(e.message);$('.env-card')?.classList.add('bad');return {ready:false,error:e.message};}
}

function blockerRoute(b){const t=String(b?.type||b?.message||'').toUpperCase();if(t.includes('MISSING_PLAN'))return 'plans';if(t.includes('AUTH')||t.includes('SIGN'))return 'setup';if(t.includes('SCHEDULE'))return 'automation';return 'logs';}
function blockerTitle(b){const t=String(b?.type||'').toUpperCase();if(t.includes('AUTH'))return 'Google sign-in needed';if(t.includes('MISSING_PLAN'))return 'Lesson plan missing';if(t.includes('DUE_DATE'))return 'Due date needs attention';if(t.includes('UNEXPECTED_ATTACHMENT'))return 'Extra attachment found';if(t.includes('DUPLICATE'))return 'Duplicate match found';if(t.includes('SCHEDULE'))return 'Automatic schedule needs attention';if(t.includes('DATA_CORRUPT'))return 'Saved information needs attention';if(t.includes('STATE'))return 'Classroom status needs review';return 'Auto Turn-In stopped safely';}
function outcomeLabel(status){return ({SUCCESS:'Completed',NO_ACTION:'Nothing due',BLOCKED:'Stopped safely',PARTIAL:'Some items need attention',FAILED:'Could not finish',RUNNING:'Checking now'}[String(status||'').toUpperCase()]||'No check result');}
function renderAttention(d){
  const diag=d.diagnostics||{},blockers=[...(diag.currentBlockers||[])];const sh=d.scheduler||{},live=!d.config.dryRun;
  if(!sh.retryActive&&diag.unresolvedFailure&&!blockers.length)blockers.push({type:'RUN_FAILURE',supportCode:diag.unresolvedFailure.supportCode||'',message:diag.unresolvedFailure.message||'The last automatic check could not finish.'});
  if(sh.retryProblem)blockers.unshift({type:'SCHEDULE_RETRY',supportCode:sh.retrySupportCode||'AT-SCH-106',message:sh.retryTeacherMessage||'The automatic retry is no longer scheduled.'});
  const manualOnly=String(d.machine?.role||'primary')==='manual';
  if(live&&((!manualOnly&&!sh.healthy)||(manualOnly&&sh.exists)))blockers.unshift({type:'SCHEDULE',supportCode:sh.supportCode||'AT-SCH-103',message:sh.teacherMessage||(manualOnly?'This computer is Manual only, but an old automatic schedule still exists.':'Automatic turn-in is on, but automatic checks are not scheduled.')});
  const card=$('#attentionCard');if(!blockers.length){card.classList.add('hidden');return}
  const b=blockers[0],msg=friendlyMessage(b.message||b.type);card.classList.remove('hidden');$('#attentionTitle').textContent=blockerTitle(b);$('#attentionText').textContent=msg;const code=$('#attentionCode');if(b.supportCode){code.textContent=`Support code: ${b.supportCode}`;code.classList.remove('hidden')}else{code.textContent='';code.classList.add('hidden')}$('#attentionAction').onclick=()=>go(blockerRoute(b));
}
function badge(el,state,text){el.className=`status-badge ${state}`;el.textContent=text;}

async function loadDashboard(){
  const d=await cati.getDashboard();latestDashboard=d;cfg=d.config;renderAttention(d);
  $('#dashCourse').textContent=classroomName(cfg);$('#dashPlans').textContent=d.plansCount;$('#dashSubmitted').textContent=d.submittedCount;$('#dashLast').textContent=d.lastRun?relativeTime(d.lastRun):'Never';$('#dashLast').title=d.lastRun?fmtDate(d.lastRun):'';
  const sh=d.scheduler||{},live=!cfg.dryRun,manualOnly=String(d.machine?.role||'primary')==='manual',historyHealthy=!d.state?.dataCorrupt,blockerCount=(d.diagnostics?.currentBlockers||[]).length,hasUnresolvedFailure=!!d.diagnostics?.unresolvedFailure,scheduleReady=manualOnly?(!sh.exists&&!sh.retryActive&&!sh.retryProblem):!!sh.healthy,fullyReady=live&&scheduleReady&&historyHealthy&&blockerCount===0&&!hasUnresolvedFailure&&!sh.retryActive;
  $('#autoDot').classList.toggle('on',fullyReady);$('#autoDot').classList.toggle('bad',live&&!fullyReady);
  if(sh.retryActive){$('#autoState').textContent='Retry scheduled';$('#nextCheck').textContent=`A temporary problem interrupted the last check. Auto Turn-In will try again${sh.retryNextRun?` ${relativeTime(sh.retryNextRun)}`:' automatically'}.`;}
  else if(fullyReady&&manualOnly){$('#autoState').textContent='Manual checks are ready';$('#nextCheck').textContent='This computer will not run automatic checks. You can use Safety Check or Check now whenever you want.';}
  else if(fullyReady){$('#autoState').textContent='Everything is working';$('#nextCheck').textContent=`Next automatic check: ${sh.nextRun?fmtDate(sh.nextRun):'scheduled'}`;}
  else if(live&&!historyHealthy){$('#autoState').textContent='Automatic turn-in needs attention';$('#nextCheck').textContent='Saved history needs repair. Submissions are paused.';}
  else if(live&&blockerCount){$('#autoState').textContent='Automatic turn-in needs attention';$('#nextCheck').textContent='A recent check found something that needs your attention. See the message above.';}
  else if(live&&hasUnresolvedFailure){$('#autoState').textContent='Automatic turn-in needs attention';$('#nextCheck').textContent='The last check could not finish after its automatic retries. See the message above.';}
  else if(live){$('#autoState').textContent='Automatic turn-in needs attention';$('#nextCheck').textContent=sh.exists?'The automatic schedule needs to be saved again.':'Automatic checks are not scheduled yet.';}
  else{$('#autoState').textContent='Automatic turn-in is off';$('#nextCheck').textContent=sh.exists?`Checks are scheduled, but submission is paused${sh.nextRun?` · next check ${fmtDate(sh.nextRun)}`:''}.`:'Automatic checks are not scheduled yet.';}
  if(d.nextPlan){$('#nextPlan').classList.remove('empty');$('#nextPlan').innerHTML=`<b>Week ${Number(d.nextPlan.week)}</b><span>Ready in approved Drive folder</span><span class="plan-title">${escapeHtml(d.nextPlan.title)}</span>`;badge($('#nextBadge'),'good','Plan ready');}
  else{$('#nextPlan').className='next-plan empty';$('#nextPlan').textContent='No pending weekly plan found.';badge($('#nextBadge'),'neutral','Clear');}
  const labels={classroom:'Classroom chosen',topic:'Lesson-plan topic chosen',drive:'Drive folder chosen',plans:'Lesson plans found',dryTest:'Safety Check passed',history:'Saved history healthy',live:manualOnly?'Manual submission ready':'Automatic submissions on',schedule:manualOnly?'No automatic schedule on this PC':'Automatic schedule ready'},ready=d.readiness||{},box=$('#readiness');box.innerHTML='';let count=0;
  for(const k of Object.keys(labels)){const ok=!!ready[k];if(ok)count++;const row=document.createElement('div');row.className=`ready-item ${ok?'ok':''}`;row.innerHTML=`<span>${labels[k]}</span><i>${ok?'✓':'–'}</i>`;box.appendChild(row)}
  const total=Object.keys(labels).length;$('#readyCount').textContent=`${count}/${total}`;const rp=$('#readinessPanel');if(count===total){$('#readinessTitle').textContent='Everything is ready';badge($('#readyCount'),'good',`${count}/${total}`);rp.open=false;}else{$('#readinessTitle').textContent=`${total-count} setup item${total-count===1?'':'s'} need attention`;badge($('#readyCount'),'warn',`${count}/${total}`);rp.open=true;}
  const diag=d.diagnostics||{},last=diag.lastOutcome||null;badge($('#diagOutcome'),last?.status==='SUCCESS'?'good':last?.status==='FAILED'||last?.status==='BLOCKED'?'bad':'neutral',last?outcomeLabel(last.status):'No checks yet');
  $('#diagTask').textContent=sh.exists?(sh.healthy?'Ready':'Needs attention'):'Not set up';$('#diagNext').textContent=sh.nextRun?fmtDate(sh.nextRun):'None scheduled';$('#diagLastResult').textContent=last?`${outcomeLabel(last.status)}${last.message?` · ${friendlyMessage(last.message)}`:''}`:'No checks yet';$('#diagLastSuccess').textContent=diag.lastSuccess?.finishedAt?fmtDate(diag.lastSuccess.finishedAt):'Never';$('#diagLastFailure').textContent=diag.lastFailure?.finishedAt?`${fmtDate(diag.lastFailure.finishedAt)} · ${outcomeLabel(diag.lastFailure.status)}`:'None';$('#diagLock').textContent=d.lock?.startedAt?`Running since ${fmtDate(d.lock.startedAt)}`:'None';const blockers=diag.currentBlockers||[];$('#diagBlockers').innerHTML=blockers.length?`<b>Needs attention:</b> ${blockers.map(b=>escapeHtml(friendlyMessage(b.message||b.type))).join(' · ')}`:'Nothing needs attention.';
  const ai=d.ai||{},aic=ai.settings||{},pending=Number(ai.pendingCount||0);applyAiVisibility(ai);$('#aiHomeStatus').textContent=aic.enabled?(pending?`${pending} AI draft${pending===1?' is':'s are'} waiting for review.`:'AI missing-plan recovery is on.'):'Optional AI recovery is set up but currently off.';$('#aiHomeDrafts').innerHTML=pending?`<b>${pending} draft${pending===1?'':'s'} waiting.</b> Nothing is uploaded or submitted until you approve it.`:'No drafts are waiting for review.';
  return d;
}

async function loadSetup(){
  cfg=await cati.getConfig();$('#courseLabel').textContent=classroomName(cfg);$('#driveFolderLabel').textContent=driveFolderName(cfg);$('#assignmentRegex').value=cfg.assignmentTitleRegex||'';$('#planRegex').value=cfg.planTitleRegex||'';$('#assignmentExample').value=cfg.assignmentTitleExample||'';$('#planExample').value=cfg.planTitleExample||'';$('#eligibilityMode').value=cfg.eligibilityMode||'classroomDueDate';$('#maxSubmissions').value=cfg.maxSubmissionsPerRun||5;$('#submitOverdue').checked=!!cfg.submitOverdue;$('#screenshots').checked=!!cfg.screenshotOnEveryRun;renderTopicChoices($('#topicSelect'),cfg.topicName);clearDirty('setup');checkEnvironment($('#environmentLabel'));
}
async function maybeWarnProtected(action){if(!cfg.setupComplete)return true;return askConfirm('This will pause automatic turn-in','Changing the Classroom, topic, Drive folder, or naming setup requires a new Safety Check before automatic turn-in can resume.',{ok:action||'Continue'});}
async function chooseCourse(targetLabel,{warn=true}={}){
  if(warn&&!(await maybeWarnProtected('Choose a new Classroom')))return null;return withSetupBrowserLock('Classroom selection',async()=>{setStatus('Opening Google Classroom…');const r=await cati.selectCourse();cfg=await cati.getConfig();const label=r.courseDisplayName||'Classroom selected';if(targetLabel)targetLabel.textContent=label;$('#courseLabel').textContent=label;setStatus('Classroom saved.');return r});
}
let discoveredTopics=[];
function renderTopicChoices(select,saved){
  // Keep the topics found in Classroom; never silently fall back to a guessed name once real topics are known.
  const fallback=saved||'Lesson Plans - Teaching Staff Only',topics=discoveredTopics.length?discoveredTopics:[fallback];
  select.innerHTML='';
  if(discoveredTopics.length&&!topics.includes(saved)){const p=document.createElement('option');p.value='';p.textContent='Choose a topic';select.appendChild(p);}
  for(const t of topics){const o=document.createElement('option');o.value=t;o.textContent=t;select.appendChild(o)}
  select.value=topics.includes(saved)?saved:(discoveredTopics.length?'':fallback);
}
async function findTopics(select){return withSetupBrowserLock('Classroom topic check',async()=>{setStatus('Finding Classroom topics…');const topics=await cati.discoverTopics();const current=select.value;if(topics.length)discoveredTopics=topics.slice();renderTopicChoices(select,topics.includes(current)?current:cfg.topicName);setStatus(`Found ${topics.length} topic${topics.length===1?'':'s'}.`);return topics});}
async function chooseDrive(targetLabel,{warn=true}={}){
  if(warn&&!(await maybeWarnProtected('Choose a new Drive folder')))return null;return withSetupBrowserLock('Drive folder selection',async()=>{setStatus('Opening Google Drive…');const r=await cati.selectDriveFolder();cfg=await cati.getConfig();const label=r.driveFolderName||'Drive folder selected';if(targetLabel)targetLabel.textContent=label;$('#driveFolderLabel').textContent=label;$('#plansDriveFolder').textContent=label;setStatus('Drive folder saved.');return r});
}
function setupPayload(){assertExampleValid('#assignmentExample',{label:'Classroom assignment example'});assertExampleValid('#planExample',{file:true,label:'Drive filename example'});syncExampleToRegex('#assignmentExample','#assignmentRegex',false);syncExampleToRegex('#planExample','#planRegex',true);return {topicName:$('#topicSelect').value||cfg.topicName,assignmentTitleRegex:$('#assignmentRegex').value||cfg.assignmentTitleRegex,planTitleRegex:$('#planRegex').value||cfg.planTitleRegex,assignmentTitleExample:$('#assignmentExample').value.trim(),planTitleExample:$('#planExample').value.trim(),eligibilityMode:$('#eligibilityMode').value,maxSubmissionsPerRun:Number($('#maxSubmissions').value||5),submitOverdue:$('#submitOverdue').checked,screenshotOnEveryRun:$('#screenshots').checked};}
async function saveSetupFields({warn=true}={}){const next=setupPayload();if(warn&&cfg.setupComplete&&protectedChanged(next)){const ok=await maybeWarnProtected('Save changes');if(!ok)return null}cfg=await cati.saveConfig(next);clearDirty('setup');return cfg;}
async function syncDrive(targetLabel){const saved=await saveSetupFields({warn:true});if(!saved)return null;setStatus('Checking the approved Drive folder…');plans=await cati.scanDriveFolder();renderPlans();const msg=`Found ${plans.length} matching plan${plans.length===1?'':'s'} in Drive.`;if(targetLabel)targetLabel.textContent=msg;badge($('#driveSyncStatus'),plans.length?'good':'neutral',plans.length?`${plans.length} found`:'None found');setStatus(msg);return plans;}

$('#assignmentExample').addEventListener('input',()=>{syncExampleToRegex('#assignmentExample','#assignmentRegex');markDirty('setup')});$('#planExample').addEventListener('input',()=>{syncExampleToRegex('#planExample','#planRegex',true);markDirty('setup')});
['topicSelect','assignmentRegex','planRegex','maxSubmissions','submitOverdue','screenshots'].forEach(id=>$('#'+id)?.addEventListener('input',()=>markDirty('setup')));
$('#checkEnvironment').onclick=()=>withBusy($('#checkEnvironment'),'Checking…',async()=>{const r=await checkEnvironment($('#environmentLabel'));toast(r.ready?'This PC is ready for Auto Turn-In.':'This PC needs attention before automation can run.',!r.ready)});
$('#selectCourse').onclick=()=>withBusy($('#selectCourse'),'Opening…',async()=>{const r=await chooseCourse($('#courseLabel'));if(r)await findTopics($('#topicSelect')).catch(e=>toast(e.message,true));});
$('#discoverTopics').onclick=()=>withBusy($('#discoverTopics'),'Finding…',()=>findTopics($('#topicSelect')).catch(e=>{throw e})).catch(e=>toast(e.message,true));
$('#selectDriveFolder').onclick=()=>withBusy($('#selectDriveFolder'),'Opening…',async()=>{const r=await chooseDrive($('#driveFolderLabel'));if(r)await syncDrive().catch(e=>toast(e.message,true));});
$('#scanDriveFolder').onclick=()=>withBusy($('#scanDriveFolder'),'Checking…',()=>syncDrive()).catch(e=>toast(e.message,true));
$('#saveSetup').onclick=()=>withBusy($('#saveSetup'),'Saving…',async()=>{const r=await saveSetupFields({warn:true});if(r)toast('Settings saved.');});

$('#exportSetup').onclick=()=>withBusy($('#exportSetup'),'Saving…',async()=>{const p=await cati.exportSetup();if(p)toast('Setup copy saved. Google sign-in, submission history, and private AI information were not included.');}).catch(e=>toast(e.message,true));
$('#importSetup').onclick=async()=>{if(!(await askConfirm('Use a setup from another computer?','This replaces the Classroom, topic, Drive folder, naming rules, and schedule time on this PC. Automatic turn-in will stay off until you run a new Safety Check.',{ok:'Choose setup file'})))return;await withBusy($('#importSetup'),'Importing…',async()=>{const r=await cati.importSetup();if(!r)return;clearDirty('setup');clearDirty('automation');await loadSetup();await loadPlans();await loadAutomation();await loadDashboard();toast(r.message||'Setup imported. Run a new Safety Check before turning automatic submission on.');await go('automation',{force:true});}).catch(e=>toast(e.message,true));};

function renderPlans(){
  const body=$('#plansBody');body.innerHTML='';$('#plansEmpty').style.display=plans.length?'none':'block';
  const overview=$('#plansOverview');overview.innerHTML='';const recent=[...plans].sort((a,b)=>Number(b.week)-Number(a.week)).slice(0,8).sort((a,b)=>Number(a.week)-Number(b.week));
  for(const p of recent){const row=document.createElement('div');row.className='plan-row';row.innerHTML=`<span class="week">Week ${Number(p.week)}</span><span class="title">${escapeHtml(p.title)}</span><span class="status-badge ${p.source==='drive-folder'?'good':'info'}">${p.source==='drive-folder'?'Drive':'Manual'}</span>`;overview.appendChild(row)}
  for(const p of plans){const tr=document.createElement('tr'),synced=p.source==='drive-folder';if(synced){tr.innerHTML=`<td>${Number(p.week)}</td><td>${escapeHtml(p.title)}</td><td><span class="muted">Verified from approved Drive folder</span></td><td>Drive folder</td><td><span class="muted">Automatic</span></td>`;}else{tr.innerHTML=`<td><input data-k="week" type="number" value="${p.week}"></td><td><input data-k="title" value="${escapeHtml(p.title)}"></td><td><input data-k="url" value="${escapeHtml(p.url)}"></td><td>${escapeHtml(planSourceLabel(p.source))}</td><td><button class="row-del">Remove</button></td>`;tr.querySelectorAll('input').forEach(i=>i.oninput=()=>{p[i.dataset.k]=i.dataset.k==='week'?Number(i.value):i.value;markDirty('plans')});tr.querySelector('.row-del').onclick=()=>{plans=plans.filter(x=>x!==p);markDirty('plans');renderPlans()};}body.appendChild(tr)}
}
async function loadPlans(){plans=await cati.getPlans();cfg=await cati.getConfig();$('#plansDriveFolder').textContent=driveFolderName(cfg);const n=plans.filter(p=>p.source==='drive-folder').length;badge($('#driveSyncStatus'),n?'good':'neutral',n?`${n} found`:'Not checked yet');renderPlans();clearDirty('plans');}
async function saveManualPlans(){plans=await cati.savePlans(plans);renderPlans();clearDirty('plans');$('#plansSaved').textContent='Saved';setTimeout(()=>$('#plansSaved').textContent='',1800);await loadDashboard();return plans;}
$('#addPlan').onclick=()=>{const last=[...plans].sort((a,b)=>Number(a.week)-Number(b.week)).at(-1);const n=last?Number(last.week)+1:1;plans.push({week:n,weekOf:'',title:`Week ${String(n).padStart(2,'0')} - Lesson Plans`,url:'',source:'manual'});markDirty('plans');renderPlans()};
$('#savePlans').onclick=()=>withBusy($('#savePlans'),'Saving…',saveManualPlans).catch(e=>toast(e.message,true));
$('#importPlans').onclick=()=>withBusy($('#importPlans'),'Importing…',async()=>{const p=await cati.importPlans();if(p){plans=p;clearDirty('plans');renderPlans();toast(`Imported ${p.length} plan${p.length===1?'':'s'}.`);await loadDashboard();}}).catch(e=>toast(e.message,true));
$('#exportPlans').onclick=()=>withBusy($('#exportPlans'),'Exporting…',async()=>{const p=await cati.exportPlans();if(p)toast('A copy of the plan list was saved.')}).catch(e=>toast(e.message,true));
$('#syncDrivePlans').onclick=()=>withBusy($('#syncDrivePlans'),'Checking…',()=>syncDrive()).catch(e=>toast(e.message,true));

const AI_PROVIDER_LABELS={groq:'Groq Free',gemini:'Google Gemini Free',openrouter:'OpenRouter Free',openai:'OpenAI API'};
const AI_PROVIDER_PRIVACY={groq:'Only the missing assignment details, your planning instructions, and correction notes are sent to Groq. Groq says ordinary inference prompts are not retained by default. Do not include student-specific personal information.',gemini:'Only the missing assignment details, your planning instructions, and correction notes are sent to Google. Google says free-tier content may be used to improve its products. Do not include student-specific personal information.',openrouter:'Only the missing assignment details, your planning instructions, and correction notes are sent through OpenRouter to an available free model provider. The provider can change, so data handling may differ. The app asks for routes that deny training and retention, but availability is not guaranteed. Do not include student-specific personal information.',openai:'Only the missing assignment details, your planning instructions, and correction notes are sent to OpenAI. OpenAI API billing is separate from ChatGPT and may create charges. Do not include student-specific personal information.'};
const AI_MODELS={groq:[['openai/gpt-oss-20b','GPT-OSS 20B — recommended free model'],['qwen/qwen3.8-27b','Qwen 3.8 27B — free model'],['openai/gpt-oss-120b','GPT-OSS 120B — free model']],gemini:[['gemini-3.5-flash','Gemini 3.5 Flash — free tier'],['gemini-3-flash-preview','Gemini 3 Flash Preview — free tier']],openrouter:[['openrouter/free','OpenRouter Free — automatically chooses a free model']],openai:[['gpt-5.6-terra','GPT-5.6 Terra'],['gpt-5.6-luna','GPT-5.6 Luna'],['gpt-5.6-sol','GPT-5.6 Sol']]};
function aiStatusText(status){return ({ready:'Waiting for review',uploading:'Uploading to Drive',uploaded:'Uploaded to Drive',submitted:'Submitted',dismissed:'Dismissed'}[status]||'Needs attention');}
function selectedAiProvider(){return $('#aiProvider').value||'groq'}
function renderAiModelOptions(provider,selected){const choices=[...(AI_MODELS[provider]||[])];if(selected&&!choices.some(([id])=>id===selected))choices.push([selected,`${selected} — saved model`]);$('#aiModel').innerHTML=choices.map(([id,label])=>`<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join('');$('#aiModel').value=selected||choices[0]?.[0]||'';}
function renderAiConnection(provider,state=latestAiState){const a=state?.settings||{},connections=a.connections||{},connection=connections[provider]||{hasApiKey:false,apiKeySource:'none'},label=AI_PROVIDER_LABELS[provider]||'AI service',envKey=connection.apiKeySource==='environment',keyError=connection.apiKeySource==='error';$('#aiApiKeyLabel').textContent=`${label} private key`;$('#aiKeyStatus').textContent=envKey?`${label} is connected through a school-managed Windows setting.`:keyError?`The saved ${label} connection could not be opened safely. Remove it and connect again.`:connection.hasApiKey?`${label} is connected securely on this Windows account.`:`${label} is not connected yet.`;$('#clearAiKey').disabled=envKey||(!connection.hasApiKey&&!keyError);$('#aiPrivacyText').textContent=AI_PROVIDER_PRIVACY[provider]||AI_PROVIDER_PRIVACY.groq;const connected=Object.keys(AI_PROVIDER_LABELS).filter(id=>connections[id]?.hasApiKey).map(id=>AI_PROVIDER_LABELS[id]);$('#aiConnectionList').textContent=connected.length?`Connected on this PC: ${connected.join(', ')}.`:'No free AI services are connected yet.';}
function aiDraftPreview(d){
  const courses=(d.plan?.courses||[]).slice(0,6).map(c=>`<div class="ai-course-preview"><b>${escapeHtml(c.course||'Course')}</b>${escapeHtml(c.objective||'No objective supplied')}</div>`).join('');const review=(d.plan?.teacherReview||[]).slice(0,8);const reviewHtml=review.length?`<ul class="ai-review-list">${review.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:'';const writer=d.providerLabel||AI_PROVIDER_LABELS[d.provider]||'';
  return `<div class="ai-draft-card ${escapeHtml(d.status||'ready')}" data-draft-id="${escapeHtml(d.id)}"><div class="ai-draft-top"><div><h3>Week ${Number(d.week)} - Lesson Plans</h3><div class="ai-draft-meta">Created ${escapeHtml(fmtDate(d.createdAt))}${writer?` · ${escapeHtml(writer)}`:''}</div></div><span class="status-badge ${d.status==='ready'?'warn':'good'}">${escapeHtml(aiStatusText(d.status))}</span></div><div class="ai-draft-preview"><div><b>Overview:</b> ${escapeHtml(d.plan?.overview||'No overview supplied.')}</div>${courses}${reviewHtml}</div>${d.status==='ready'?`<div class="ai-week-notes"><label><span class="section-kicker">ANYTHING TO CHANGE THIS WEEK?</span><textarea data-ai-notes rows="3" placeholder="Optional corrections or context for regeneration.">${escapeHtml(d.weekNotes||'')}</textarea></label></div><div class="ai-draft-actions"><button class="btn secondary" data-ai-open>Open draft</button><button class="btn secondary" data-ai-regenerate>Regenerate</button><button class="btn primary" data-ai-approve>Approve & turn in</button><button class="btn text-btn" data-ai-dismiss>Dismiss</button></div>`:`<div class="ai-draft-actions"><button class="btn secondary" data-ai-open>Open Word copy</button></div>`}</div>`;
}
async function loadAi(){
  try{const state=await cati.getAiState();latestAiState=state;const a=state.settings||{},provider=a.provider||'groq';$('#aiEnabled').checked=!!a.enabled;$('#aiAutoDraft').checked=a.autoDraftMissing!==false;$('#aiPlanningContext').value=a.planningContext||'';$('#aiProvider').value=provider;$('#aiFallbackEnabled').checked=!!a.fallbackEnabled;renderAiModelOptions(provider,a.models?.[provider]||a.model);$('#aiFileNameTemplate').value=a.fileNameTemplate||'Week {week2} - Lesson Plans.docx';$('#aiMaxDrafts').value=a.maxDraftsPerCheck||1;$('#aiApiKey').value='';renderAiConnection(provider,state);$('#aiModeTitle').textContent=a.enabled?'ON':'OFF';$('#aiModeDesc').textContent=a.enabled?'If a due plan is missing, a local AI draft can be created for review.':'Missing plans will stop safely and notify you.';
    const drafts=(state.drafts||[]).filter(d=>['ready','uploading','uploaded','submitted'].includes(d.status)),pending=drafts.filter(d=>d.status==='ready');badge($('#aiDraftCount'),pending.length?'warn':'neutral',`${pending.length} waiting`);const list=$('#aiDraftList');list.innerHTML=drafts.length?drafts.map(aiDraftPreview).join(''):'<div class="empty-state">No AI drafts are waiting for review.</div>';
    list.querySelectorAll('[data-draft-id]').forEach(card=>{const id=card.dataset.draftId,open=card.querySelector('[data-ai-open]'),regen=card.querySelector('[data-ai-regenerate]'),approve=card.querySelector('[data-ai-approve]'),dismiss=card.querySelector('[data-ai-dismiss]');if(open)open.onclick=()=>withBusy(open,'Opening…',()=>cati.openAiDraft(id)).catch(e=>toast(e.message,true));if(regen)regen.onclick=()=>withBusy(regen,'Writing…',async()=>{const notes=card.querySelector('[data-ai-notes]')?.value||'';await cati.regenerateAiDraft(id,notes);await loadAi();await loadDashboard();toast('A new AI draft is ready for review.');}).catch(e=>toast(e.message,true));if(approve)approve.onclick=async()=>{if(!(await askConfirm('Approve this lesson plan?','The Word file will be uploaded to your approved Drive folder, then Auto Turn-In will run its normal safety checks.',{ok:'Approve & turn in'})))return;await withBusy(approve,'Uploading…',async()=>{const r=await cati.approveAiDraft(id);await loadAi();await loadPlans();await loadDashboard();if(r?.submission?.submitted>0)toast(`Week ${r.draft?.week||''} was uploaded and turned in successfully.`);else if(r?.submitError){toast('The approved plan was uploaded to Drive, but the Classroom turn-in still needs attention.');toast(r.submitError,true);}else toast('The approved plan was uploaded. The normal automatic check will handle submission when allowed.');}).catch(e=>toast(e.message,true));};if(dismiss)dismiss.onclick=async()=>{if(!(await askConfirm('Dismiss this AI draft?','The Word file will stay in the local drafts folder, but it will no longer wait for approval.',{ok:'Dismiss draft'})))return;try{await cati.dismissAiDraft(id);await loadAi();await loadDashboard()}catch(e){toast(e.message,true)}};});clearDirty('ai');
  }catch(e){toast(e.message,true)}
}
function aiPayload(){return {optedIn:true,enabled:$('#aiEnabled').checked,autoDraftMissing:$('#aiAutoDraft').checked,provider:selectedAiProvider(),fallbackEnabled:$('#aiFallbackEnabled').checked,planningContext:$('#aiPlanningContext').value,model:$('#aiModel').value,fileNameTemplate:$('#aiFileNameTemplate').value,maxDraftsPerCheck:Number($('#aiMaxDrafts').value||1),apiKey:$('#aiApiKey').value};}
async function saveAi(){const saved=await cati.saveAiSettings(aiPayload());clearDirty('ai');$('#aiSettingsSaved').textContent='Saved';setTimeout(()=>$('#aiSettingsSaved').textContent='',1800);$('#aiApiKey').value='';await loadAi();await loadDashboard();toast(saved.enabled?'AI missing-plan recovery is on.':'AI recovery settings saved.');return saved;}
['aiEnabled','aiAutoDraft','aiPlanningContext','aiModel','aiFileNameTemplate','aiMaxDrafts','aiApiKey','aiFallbackEnabled'].forEach(id=>$('#'+id)?.addEventListener('input',()=>markDirty('ai')));
$('#aiProvider').onchange=()=>{const provider=selectedAiProvider(),saved=latestAiState?.settings?.models?.[provider];renderAiModelOptions(provider,saved);$('#aiApiKey').value='';renderAiConnection(provider);markDirty('ai')};
$('#aiGetKey').onclick=()=>cati.openAiProviderSetup(selectedAiProvider()).catch(e=>toast(e.message,true));
$('#saveAiSettings').onclick=()=>withBusy($('#saveAiSettings'),'Saving…',saveAi).catch(e=>toast(e.message,true));
$('#clearAiKey').onclick=async()=>{const provider=selectedAiProvider(),label=AI_PROVIDER_LABELS[provider]||'AI service';if(!(await askConfirm(`Remove the saved ${label} connection?`,'Normal Auto Turn-In will keep working. AI recovery will use another connected service only if you selected it.',{ok:'Remove connection',danger:true})))return;try{const state=await cati.getAiState(),primary=state.settings?.provider||'groq';await cati.saveAiSettings({connectionProvider:provider,provider:primary,enabled:provider===primary?false:!!state.settings?.enabled,clearApiKey:true});clearDirty('ai');await loadAi();await loadDashboard();toast(`Saved ${label} connection removed.`)}catch(e){toast(e.message,true)}};
$('#aiEnabled').onchange=()=>{$('#aiModeTitle').textContent=$('#aiEnabled').checked?'ON':'OFF';$('#aiModeDesc').textContent=$('#aiEnabled').checked?'Save settings to enable missing-plan drafting.':'Missing plans will stop safely and notify you.';markDirty('ai')};
$('#openAiFolder').onclick=()=>cati.openAiDraftFolder().catch(e=>toast(e.message,true));
$('#openOptionalAi').onclick=async()=>{try{const state=await cati.getAiState();await cati.saveAiSettings({optedIn:true,enabled:!!state.settings?.enabled});const d=await loadDashboard();applyAiVisibility(d.ai||{});await loadAi();await go('ai',{force:true});toast('Normal Auto Turn-In is unchanged. AI recovery is optional.')}catch(e){toast(e.message,true)}};
$('#disableAiFeature').onclick=async()=>{if(!(await askConfirm('Hide AI recovery?','Normal Auto Turn-In will keep working. Existing local draft files will not be deleted.',{ok:'Hide AI recovery'})))return;try{await cati.saveAiSettings({optedIn:false,enabled:false});clearDirty('ai');const d=await loadDashboard(),pending=Number(d.ai?.pendingCount||0);if(pending)toast(`AI recovery is off. ${pending} existing draft${pending===1?' is':'s are'} still visible for review.`);else{await go('dashboard',{force:true});toast('AI recovery is off and hidden.')}}catch(e){toast(e.message,true)}};

let latestRosterState=null;
function rosterUnresolvedCount(course={}){
  const explicit=Array.isArray(course.unresolved)?course.unresolved.length:0;
  return explicit+Math.max(0,Number(course.discoveredStudentRows||0)-Number(course.students?.length||0)-explicit);
}
function rosterPeriodNumber(value){const match=String(value||'').trim().match(/^Period\s+([1-6])(?:\b|\s|$)/i);return match?Number(match[1]):0}
function rosterMappingOptions(current='',authoritative=[]){
  const live=[...new Set((Array.isArray(authoritative)?authoritative:[]).map(value=>String(value||'').trim()).filter(value=>/^Period\s+[1-6](?:\b|\s|$)/i.test(value)))];
  const represented=new Set(live.map(rosterPeriodNumber).filter(Boolean));
  const standard=['Period 1','Period 2','Period 3','Period 4','Period 5','Period 6'].filter(value=>!represented.has(rosterPeriodNumber(value)));
  const choices=[...live,...standard];
  if(current&&!choices.includes(current))choices.unshift(current);
  return `<option value="">Choose period…</option>`+choices.map(value=>`<option value="${escapeHtml(value)}" ${value===current?'selected':''}>${escapeHtml(value)}</option>`).join('');
}
function renderRosters(state=latestRosterState||{}){
  latestRosterState=state||{};
  const classes=Array.isArray(state?.snapshot?.classes)?state.snapshot.classes:[];
  const verified=classes.reduce((n,c)=>n+(Array.isArray(c.students)?c.students.length:0),0);
  const unresolved=classes.reduce((n,c)=>n+rosterUnresolvedCount(c),0);
  $('#rosterClassCount').textContent=String(classes.length);
  $('#rosterVerifiedCount').textContent=String(verified);
  $('#rosterReviewCount').textContent=String(unresolved);
  $('#rosterLastDiscovery').textContent=state.lastDiscoveryAt?relativeTime(state.lastDiscoveryAt):'Never';
  badge($('#rosterDiscoveryBadge'),classes.length?(unresolved?'warn':'good'):'neutral',classes.length?(unresolved?`${unresolved} need review`:'Roster ready'):'Not scanned');
  const diff=state.lastDiff?.counts||{};
  $('#rosterDiff').innerHTML=state.lastDiscoveryAt
    ? `<b>Latest comparison:</b> ${Number(diff.added||0)} added · ${Number(diff.removed||0)} removed · ${Number(diff.changed||0)} changed · ${Number(diff.unresolved||0)} unresolved. <span class="muted">No operational roster was changed.</span>`
    : 'Run roster discovery to create the first snapshot.';
  const mappings=state.mappings?.classMappings||{},operationalPeriods=Array.isArray(state?.operations?.classPeriods)?state.operations.classPeriods:[];
  $('#rosterClassList').innerHTML=classes.length?classes.map(course=>{
    const mapped=mappings[course.courseId]?.classPeriod||'';
    const ready=Array.isArray(course.students)?course.students.length:0,review=rosterUnresolvedCount(course);
    return `<div class="roster-class-card" data-course-id="${escapeHtml(course.courseId)}"><div class="roster-class-copy"><strong>${escapeHtml(course.courseDisplayName||'Classroom')}</strong><span>${ready} verified ${ready===1?'student':'students'}${review?` · ${review} need${review===1?'s':''} identity review`:''}</span></div><label class="field roster-map-field">School period<select class="roster-map-select" data-course-id="${escapeHtml(course.courseId)}">${rosterMappingOptions(mapped,operationalPeriods)}</select></label></div>`;
  }).join(''):'<div class="empty-state">No Classroom roster snapshot has been saved yet.</div>';
  const pendingRecovery=state?.pendingWrite?.status==='PENDING';
  $$('.roster-map-select').forEach(select=>{select.disabled=pendingRecovery;select.onchange=()=>{markDirty('rosters');renderRosterPreviewFromControls();const live=$('#rosterLiveComparison');if(live)live.innerHTML='<div class="notice compact"><b>Comparison needs refresh.</b> Save the period mapping, then compare rosters again.</div>';const apply=$('#applyOperationsRoster');if(apply)apply.disabled=true;};});
  if($('#findClassroomRosters'))$('#findClassroomRosters').disabled=pendingRecovery;
  if($('#saveRosterMappings'))$('#saveRosterMappings').disabled=pendingRecovery;
  if($('#compareOperationsRoster'))$('#compareOperationsRoster').disabled=pendingRecovery;
  renderRosterPreviewFromControls();
  renderLiveRosterComparison(state);
}
function rosterMappingsFromControls(){
  const classMappings={};
  $$('.roster-map-select').forEach(select=>{const classPeriod=select.value.trim();if(classPeriod)classMappings[select.dataset.courseId]={classPeriod};});
  return {schemaVersion:1,classMappings};
}
function renderRosterPreviewFromControls(){
  const classes=Array.isArray(latestRosterState?.snapshot?.classes)?latestRosterState.snapshot.classes:[];
  const mappings=rosterMappingsFromControls().classMappings,periodCounts={};
  Object.values(mappings).forEach(({classPeriod})=>{const key=String(classPeriod||'').toLowerCase();if(key)periodCounts[key]=(periodCounts[key]||0)+1});
  const duplicatePeriods=new Set(Object.entries(periodCounts).filter(([,count])=>count>1).map(([key])=>key));
  let ready=0,blocked=0,unmapped=0,review=0,duplicateMapped=0,removalHoldClasses=0;
  for(const course of classes){
    const verified=Array.isArray(course.students)?course.students.length:0,needsReview=rosterUnresolvedCount(course),mapping=mappings[course.courseId];
    if(!mapping){unmapped++;blocked+=verified+needsReview;continue}
    if(duplicatePeriods.has(String(mapping.classPeriod||'').toLowerCase())){duplicateMapped++;blocked+=verified+needsReview;continue}
    ready+=verified;review+=needsReview;blocked+=needsReview;
    const complete=course.studentsHeadingFound===true&&course.scrollComplete===true&&!course.discoveryError&&needsReview===0&&Number(course.discoveredStudentRows||0)===verified;
    if(!complete)removalHoldClasses++;
  }
  const el=$('#rosterOperationsPreview');if(!el)return;
  if(!classes.length){el.innerHTML='<div class="empty-state">Run roster discovery first.</div>';return}
  const duplicateNote=duplicateMapped?`${duplicateMapped} mapped class${duplicateMapped===1?'':'es'} share${duplicateMapped===1?'s':''} a school period. Choose one Classroom per period before saving. `:'';
  const removalNote=removalHoldClasses?`${removalHoldClasses} mapped class${removalHoldClasses===1?' is':'es are'} not complete enough to authorize a future removal, so removals would be held for review. `:'';
  el.innerHTML=`<div class="roster-operation-counts"><div><span>Ready to map</span><strong>${ready}</strong></div><div><span>Blocked safely</span><strong>${blocked}</strong></div><div><span>Classes not mapped</span><strong>${unmapped}</strong></div></div><div class="notice compact"><b>Mapping preview.</b> ${duplicateNote}${review?`${review} student identit${review===1?'y':'ies'} still require a verified email. `:''}${removalNote}No Hall Pass, Check-In, PIN, or student history record is being changed.</div>`;
}
function renderLiveRosterComparison(state=latestRosterState||{}){
  const el=$('#rosterLiveComparison'),applyBtn=$('#applyOperationsRoster');if(!el)return;
  const plan=state?.syncPlan,ops=state?.operations||{},pending=state?.pendingWrite||{};
  if(pending.status==='PENDING'){
    if(applyBtn){applyBtn.disabled=false;const span=applyBtn.querySelector('span');if(span)span.textContent='Retry approved batch';}
    el.innerHTML=`<div class="notice compact"><b>Approved batch needs recovery.</b> GoClassroom retained the exact encrypted request from ${pending.createdAt?relativeTime(pending.createdAt):'the previous attempt'}. Retry it before scanning, remapping, or comparing again. The server will replay the same request ID instead of creating a second batch.</div><div class="roster-operation-counts"><div><span>Pending additions</span><strong>${Number(pending.add||0)}</strong></div><div><span>Pending name updates</span><strong>${Number(pending.updateName||0)}</strong></div></div>`;
    return;
  }
  if(!plan||!ops.lastReadAt){if(applyBtn){applyBtn.disabled=true;const span=applyBtn.querySelector('span');if(span)span.textContent='Apply safe changes';}el.innerHTML='<div class="empty-state">Save your period mappings, then compare against the current operations roster.</div>';return}
  const c=plan.counts||{},safeCount=Number(c.add||0)+Number(c.updateName||0);
  if(applyBtn){applyBtn.disabled=!ops.writeReady||safeCount<1;const span=applyBtn.querySelector('span');if(span)span.textContent='Apply safe changes';}
  const rows=[];
  const push=(label,item,detail='')=>rows.push(`<div class="roster-change-row"><span class="status-badge neutral">${escapeHtml(label)}</span><div><strong>${escapeHtml(item.studentName||item.after?.studentName||'Student')}</strong><span>${escapeHtml(item.classPeriod||item.after?.classPeriod||'')}${detail?` · ${escapeHtml(detail)}`:''}</span></div></div>`);
  (plan.add||[]).forEach(x=>push('ADD',x,'can be applied after confirmation'));
  (plan.updateName||[]).forEach(x=>push('NAME',x,`${x.before?.studentName||''} → ${x.after?.studentName||''}`));
  (plan.deactivate||[]).forEach(x=>push('REVIEW REMOVE',x,'never applied automatically'));
  (plan.held||[]).forEach(x=>push('HELD',x,x.reason==='SOURCE_ROSTER_NOT_AUTHORITATIVE'?'source roster is incomplete':x.reason==='CLASS_PERIOD_LABEL_MISMATCH'?`choose the existing class label: ${(x.suggestedClassPeriods||[]).join(', ')}`:'class mapping is ambiguous'));
  const writeText=safeCount?`${safeCount} safe change${safeCount===1?' is':'s are'} eligible for a separate teacher confirmation. `:'No safe additions or name updates are waiting. ';
  el.innerHTML=`<div class="roster-operation-counts"><div><span>Already correct</span><strong>${Number(c.unchanged||0)}</strong></div><div><span>To add</span><strong>${Number(c.add||0)}</strong></div><div><span>Name updates</span><strong>${Number(c.updateName||0)}</strong></div><div><span>Removal review</span><strong>${Number(c.deactivate||0)}</strong></div><div><span>Held safely</span><strong>${Number(c.held||0)+Number(c.blocked||0)}</strong></div></div><div class="notice compact"><b>Fresh live comparison.</b> ${Number(ops.count||0)} active operations membership${Number(ops.count||0)===1?'':'s'} read ${ops.lastReadAt?relativeTime(ops.lastReadAt):''}. ${writeText}Removals remain review-only.</div>${rows.length?`<div class="roster-change-list">${rows.join('')}</div>`:'<div class="empty-state">The mapped roster is already aligned with the active operations roster.</div>'}`;
}
async function compareOperationsRoster(){
  if(dirty.has('rosters'))throw new Error('Save the period mapping before comparing rosters.');
  const state=await cati.readOperationsRoster();renderRosters(state);clearDirty('rosters');const c=state?.syncPlan?.counts||{};
  toast(`Roster comparison complete: ${Number(c.unchanged||0)} correct, ${Number(c.add||0)} add, ${Number(c.updateName||0)} name update, ${Number(c.deactivate||0)} removal review, ${Number(c.held||0)+Number(c.blocked||0)} held safely. Nothing was changed live.`);return state;
}
async function applyOperationsRoster(){
  const pendingRecovery=latestRosterState?.pendingWrite?.status==='PENDING';
  if(dirty.has('rosters')&&!pendingRecovery)throw new Error('Save the period mapping and compare rosters again before applying changes.');
  const outcome=await cati.applySafeRosterChanges();
  if(outcome?.cancelled)return outcome;
  const state=outcome?.state||await cati.getRosterState();renderRosters(state);clearDirty('rosters');
  const c=outcome?.result?.counts||{},changed=Number(c.added||0)+Number(c.reactivated||0)+Number(c.nameRowsUpdated||0);
  toast(`Roster sync verified: ${Number(c.added||0)} added, ${Number(c.reactivated||0)} reactivated, ${Number(c.nameRowsUpdated||0)} name update${Number(c.nameRowsUpdated||0)===1?'':'s'}. No students were removed.${outcome?.refreshNeeded?' Run Compare rosters again to refresh the live view.':''}`);
  return outcome;
}
async function loadRosters(){
  try{const state=await cati.getRosterState();renderRosters(state);clearDirty('rosters');return state}catch(e){toast(e.message,true);return null}
}
async function saveRosterMappings(){
  const mappings=rosterMappingsFromControls(),counts={};Object.values(mappings.classMappings).forEach(({classPeriod})=>{const key=String(classPeriod||'').toLowerCase();counts[key]=(counts[key]||0)+1});
  if(Object.values(counts).some(count=>count>1))throw new Error('Choose only one Google Classroom for each school period before saving.');
  const state=await cati.saveRosterMappings(mappings);renderRosters(state);clearDirty('rosters');toast('Period mappings saved locally. No Hall Pass or Check-In roster was changed.');return state;
}
$('#findClassroomRosters').onclick=()=>withBusy($('#findClassroomRosters'),'Reading Classroom…',async()=>{const state=await cati.discoverClassroomRosters();renderRosters(state);clearDirty('rosters');const classes=state?.snapshot?.classes?.length||0,verified=state?.snapshot?.classes?.reduce((n,c)=>n+(c.students?.length||0),0)||0,review=state?.snapshot?.classes?.reduce((n,c)=>n+rosterUnresolvedCount(c),0)||0;toast(`Roster preview saved: ${classes} class${classes===1?'':'es'}, ${verified} verified student identit${verified===1?'y':'ies'}${review?`, ${review} needing review`:''}. Nothing was synced live.`);return state}).catch(e=>toast(e.message,true));
$('#saveRosterMappings').onclick=()=>withBusy($('#saveRosterMappings'),'Saving…',saveRosterMappings).catch(e=>toast(e.message,true));
$('#compareOperationsRoster').onclick=()=>withBusy($('#compareOperationsRoster'),'Comparing…',compareOperationsRoster).catch(e=>toast(e.message,true));
$('#applyOperationsRoster').onclick=()=>withBusy($('#applyOperationsRoster'),'Applying…',applyOperationsRoster).catch(e=>{toast(e.message,true);loadRosters();});

let latestGradingState=null;
let gradingAssignments=[];
let gradingAssignmentsByCourse={};
function renderGradingClassrooms(settings=latestGradingState?.settings||{}){
  const select=$('#gradingClassroomSelect');if(!select)return;
  const classrooms=Array.isArray(settings.gradingClassrooms)?settings.gradingClassrooms:[];
  const selected=settings.activeGradingCourseId||classrooms[0]?.courseId||'';
  select.innerHTML=classrooms.length
    ? classrooms.map(course=>`<option value="${escapeHtml(course.courseId)}">${escapeHtml(course.courseDisplayName||'Selected Classroom')}</option>`).join('')
    : '<option value="">No classes yet</option>';
  if(classrooms.some(course=>course.courseId===selected))select.value=selected;
  const active=classrooms.find(course=>course.courseId===select.value);
  $('#removeGradingClassroom').disabled=!active;
  $('#discoverGradingAssignments').disabled=!active;
  $('#gradingClassroomCourse').textContent=active?`${classrooms.length} class${classrooms.length===1?'':'es'} saved.`:'Your lesson plan setup will not change.';
  badge($('#gradingClassroomBadge'),active?'info':'neutral',active?(classrooms.length===1?'1 class':`${classrooms.length} classes`):'No class selected');
}
function renderGradingModels(state){
  const settings=state?.settings||{},models=state?.ollama?.models||[],select=$('#gradingModel'),selected=settings.model||'qwen3.6:latest';
  const choices=models.map(m=>[m.name,m.parameter_size?`${m.name} — ${m.parameter_size}`:m.name]);
  if(selected&&!choices.some(([id])=>id===selected))choices.unshift([selected,`${selected} — selected`]);
  if(!choices.length)choices.push([selected,selected]);
  select.innerHTML=choices.map(([id,label])=>`<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join('');
  select.value=selected;
}
function renderGradingAssignmentOptions(){
  const select=$('#gradingClassroomAssignment');if(!select)return;
  const current=select.value;
  select.innerHTML=`<option value="">${gradingAssignments.length?'Choose an assignment':'Find assignments first'}</option>`+gradingAssignments.map(a=>`<option value="${escapeHtml(a.assignmentId)}">${escapeHtml(a.title||`Assignment ${a.assignmentId}`)}</option>`).join('');
  if(gradingAssignments.some(a=>a.assignmentId===current))select.value=current;
}
function syncClassroomWriteControls(settings=latestGradingState?.settings||{}){
  const allowed=!!settings.classroomDraftWriteEnabled;
  if($('#gradingClassroomWriteEnabled'))$('#gradingClassroomWriteEnabled').checked=allowed;
  if($('#gradingWriteDraftsThisRun')){
    $('#gradingWriteDraftsThisRun').disabled=!allowed;
    if(!allowed)$('#gradingWriteDraftsThisRun').checked=false;
  }
}
function syncReviewCopyControls(settings=latestGradingState?.settings||{}){
  const enabled=!!settings.reviewExportEnabled,folder=settings.reviewFolderPath||'';
  $('#gradingReviewExportEnabled').checked=enabled;
  $('#gradingReviewFolder').textContent=folder||'No folder selected';
  $('#openGradingReviewFolder').disabled=!folder;
  badge($('#gradingReviewBadge'),enabled?'warn':'neutral',enabled?'On · private student data':'Off');
}
async function loadGrading(){
  try{
    const state=await cati.getGradingState();latestGradingState=state;const settings=state.settings||{},ollama=state.ollama||{};
    $('#gradingEnabled').checked=!!settings.enabled;$('#gradingModeTitle').textContent=settings.enabled?'ON':'OFF';$('#gradingModeDesc').textContent=settings.enabled?'CATI may create local draft grades after validation. Classroom draft writing still requires its separate opt-in.':'Local grading is disabled. Nothing is sent to Ollama until you turn it on.';
    renderGradingModels(state);syncClassroomWriteControls(settings);renderGradingClassrooms(settings);syncReviewCopyControls(settings);
    if($('#gradingBatchSize'))$('#gradingBatchSize').value=Math.max(1,Math.min(10,Number(settings.batchSize)||5));
    if(ollama.available){
      badge($('#gradingOllamaBadge'),ollama.selectedModelAvailable?'good':'warn',ollama.selectedModelAvailable?'Ready':'Model missing');
      $('#gradingOllamaStatus').textContent=ollama.models?.length?`Ollama is running. Found ${ollama.models.length} local model${ollama.models.length===1?'':'s'}. ${ollama.selectedModelAvailable?'The selected grading model is installed.':'Choose an installed model before grading.'}`:'Ollama is running, but no local models were reported.';
    }else{
      badge($('#gradingOllamaBadge'),'bad','Not available');
      $('#gradingOllamaStatus').textContent=ollama.error||'CATI could not reach Ollama at 127.0.0.1:11434.';
    }
    clearDirty('grading');
    return state;
  }catch(e){toast(e.message,true);return null}
}
async function saveGrading(){
  const saved=await cati.saveGradingSettings({
    enabled:$('#gradingEnabled').checked,
    model:$('#gradingModel').value,
    classroomDraftWriteEnabled:$('#gradingClassroomWriteEnabled')?.checked===true,
    batchSize:Number($('#gradingBatchSize')?.value)||5,
    activeGradingCourseId:$('#gradingClassroomSelect')?.value||'',
    reviewExportEnabled:$('#gradingReviewExportEnabled')?.checked===true
  });
  clearDirty('grading');await loadGrading();
  if(saved.cancelled){toast('That privacy-sensitive setting was not enabled. Your previous grading settings remain in place.');return saved;}
  toast(saved.enabled?'Local grading settings saved.':'Local grading settings saved; local grading is off.');return saved;
}
function renderGradeResult(result){
  const panel=$('#gradingResultPanel'),grade=result?.grade,validation=result?.validation,status=result?.status||'TEACHER_REVIEW',safe=status==='SAFE_DRAFT';panel.classList.remove('hidden');
  badge($('#gradingResultBadge'),safe?'good':'warn',safe?'Safe draft':'Teacher review');
  $('#gradingResultTitle').textContent=safe&&grade?.score!==null&&grade?.score!==undefined?`Draft score: ${grade.score}/${grade.max_score}`:'Teacher review required';
  $('#gradingResultSummary').textContent=result?.reason||(safe?'The model response passed CATI structure and point-math validation. This is still a teacher-reviewable draft.':'CATI did not accept a draft score.');
  const rows=(grade?.rubric_breakdown||[]).map(item=>`<div class="grading-rubric-row"><div><b>${escapeHtml(item.criterion||'Criterion')}</b><small>${escapeHtml(item.evidence||'No evidence supplied.')}</small></div><strong>${item.earned===null||item.earned===undefined?'—':escapeHtml(item.earned)}/${escapeHtml(item.possible)}</strong></div>`).join('');
  const review=grade?.review_reason?`<div class="notice compact"><b>Why teacher review is required:</b> ${escapeHtml(grade.review_reason)}</div>`:'';
  const feedback=grade?.feedback?`<div class="grading-feedback"><span class="section-kicker">STUDENT FEEDBACK DRAFT</span><p>${escapeHtml(grade.feedback)}</p></div>`:'';
  const validationText=validation?.valid===true?`Validated totals: ${validation.calculated_score===null||validation.calculated_score===undefined?'not scoreable':escapeHtml(validation.calculated_score)} / ${escapeHtml(validation.calculated_max)}.`:(validation?.errors?.length?`Validation stopped the draft: ${escapeHtml(validation.errors.join(' | '))}`:'No validated grade was produced.');
  $('#gradingResultBody').innerHTML=`${review}${rows?`<div class="grading-rubric">${rows}</div>`:''}${feedback}<div class="notice compact"><b>CATI validation:</b> ${validationText}</div><div class="notice compact"><b>Safety boundary:</b> This manual-lab result has not been written to Google Classroom.</div>`;
}
function renderClassroomGradingResult(result){
  const panel=$('#gradingClassroomResultPanel');if(!panel)return;panel.classList.remove('hidden');
  const summary=result?.summary||{},assignment=result?.assignment||{};
  const headline=`${escapeHtml(assignment.title||'Selected assignment')} — ${Number(summary.safeDrafts||0)} safe draft${Number(summary.safeDrafts||0)===1?'':'s'}, ${Number(summary.teacherReview||0)} teacher review`;
  const writeText=result?.writeDraftsRequested?`${Number(summary.draftsSaved||0)} Classroom draft score${Number(summary.draftsSaved||0)===1?'':'s'} saved/verified.`:'Preview only. No Classroom grade was changed.';
  const rows=(result?.results||[]).map(row=>{
    const safe=row.status==='SAFE_DRAFT',score=safe&&row.grade?.score!==null&&row.grade?.score!==undefined?`${escapeHtml(row.grade.score)}/${escapeHtml(row.grade.max_score)}`:'—';
    const reason=row.reason||row.grade?.feedback||'';
    const write=row.writeStatus==='SAVED_DRAFT'||row.writeStatus==='ALREADY_SAVED'?row.writeMessage:(row.writeStatus&&row.writeStatus!=='NOT_WRITTEN'?row.writeMessage:'');
    return `<div class="classroom-grade-row"><div class="classroom-grade-name"><b>${escapeHtml(row.studentName||'Student')}</b><span class="status-badge ${safe?'good':'warn'}">${safe?'SAFE_DRAFT':'TEACHER_REVIEW'}</span></div><div class="classroom-grade-score">${score}</div><p>${escapeHtml(reason||'Validated draft ready for teacher review.')}</p>${write?`<small>${escapeHtml(write)}</small>`:''}</div>`;
  }).join('')||'<div class="empty-state">No eligible student submissions were found in this batch.</div>';
  const review=result?.reviewExport?.folderPath?`<div class="notice compact review-saved"><b>Private review copy saved:</b> ${escapeHtml(result.reviewExport.folderPath)}</div>`:(result?.reviewExport?.error?`<div class="notice compact error-soft"><b>Grading finished, but the review copy failed:</b> ${escapeHtml(result.reviewExport.error)}</div>`:'');
  panel.innerHTML=`<div class="grading-classroom-summary"><b>${headline}</b><span>${escapeHtml(writeText)}</span>${summary.alreadyGraded?`<small>${escapeHtml(summary.alreadyGraded)} existing/returned grade${Number(summary.alreadyGraded)===1?' was':'s were'} left untouched.</small>`:''}${Number(summary.gradedWithoutRubric)?`<small>${escapeHtml(summary.gradedWithoutRubric)} graded from the Classroom directions because no rubric was given.</small>`:''}</div>${review}<div class="classroom-grade-list">${rows}</div><div class="notice compact"><b>Safety boundary:</b> GoClassroom never clicks Return. Draft scores remain hidden from students until you return work yourself in Classroom.</div>`;
}
async function discoverClassroomGrading(){
  const courseId=$('#gradingClassroomSelect').value;if(!courseId)throw new Error('Add and choose a grading Classroom first.');
  const payload=await cati.discoverGradingAssignments(courseId);gradingAssignments=(Array.isArray(payload?.assignments)?payload.assignments:[]).map(item=>({...item,courseDisplayName:payload?.courseDisplayName||''}));gradingAssignmentsByCourse[courseId]=gradingAssignments;renderGradingAssignmentOptions();
  $('#gradingClassroomCourse').textContent=payload?.courseDisplayName?`Ready: ${payload.courseDisplayName}`:'Class loaded.';
  badge($('#gradingClassroomBadge'),gradingAssignments.length?'good':'warn',gradingAssignments.length?`${gradingAssignments.length} found`:'None found');
  return payload;
}
['gradingEnabled','gradingModel','gradingClassroomWriteEnabled','gradingBatchSize','gradingReviewExportEnabled'].forEach(id=>$('#'+id)?.addEventListener('input',()=>markDirty('grading')));
$('#gradingEnabled').onchange=()=>{$('#gradingModeTitle').textContent=$('#gradingEnabled').checked?'ON':'OFF';$('#gradingModeDesc').textContent=$('#gradingEnabled').checked?'Save settings to enable local draft grading.':'Local grading is disabled.';markDirty('grading')};
$('#gradingClassroomWriteEnabled').onchange=()=>{if(!$('#gradingClassroomWriteEnabled').checked)$('#gradingWriteDraftsThisRun').checked=false;markDirty('grading')};
$('#gradingReviewExportEnabled').onchange=()=>{badge($('#gradingReviewBadge'),$('#gradingReviewExportEnabled').checked?'warn':'neutral',$('#gradingReviewExportEnabled').checked?'Save to turn on':'Off');markDirty('grading')};
$('#gradingClassroomSelect').onchange=()=>{const courseId=$('#gradingClassroomSelect').value;gradingAssignments=gradingAssignmentsByCourse[courseId]||[];renderGradingAssignmentOptions();$('#gradingClassroomResultPanel').classList.add('hidden');const settings=latestGradingState?.settings||{};settings.activeGradingCourseId=courseId;renderGradingClassrooms(settings);markDirty('grading')};
$('#saveGradingSettings').onclick=()=>withBusy($('#saveGradingSettings'),'Saving…',saveGrading).catch(e=>toast(e.message,true));
$('#refreshGrading').onclick=()=>withBusy($('#refreshGrading'),'Checking…',loadGrading).catch(e=>toast(e.message,true));
$('#discoverGradingAssignments').onclick=()=>withBusy($('#discoverGradingAssignments'),'Finding…',discoverClassroomGrading).catch(e=>toast(e.message,true));
$('#addGradingClassroom').onclick=()=>withBusy($('#addGradingClassroom'),'Opening Classroom…',async()=>{const settings=await cati.selectGradingClassroom();latestGradingState={...(latestGradingState||{}),settings};gradingAssignments=[];renderGradingAssignmentOptions();renderGradingClassrooms(settings);clearDirty('grading');toast(`${settings.gradingClassrooms?.find(item=>item.courseId===settings.activeGradingCourseId)?.courseDisplayName||'Class'} added. Your lesson plan class was not changed.`)}).catch(e=>toast(e.message,true));
$('#findTeachingClassrooms').onclick=()=>withBusy($('#findTeachingClassrooms'),'Reading Classroom…',async()=>{
  const result=await cati.discoverMyGradingClassrooms();
  const settings=result?.settings||{};
  latestGradingState={...(latestGradingState||{}),settings};
  gradingAssignmentsByCourse={...gradingAssignmentsByCourse,...(result?.assignmentsByCourse||{})};
  renderGradingClassrooms(settings);
  gradingAssignments=gradingAssignmentsByCourse[$('#gradingClassroomSelect').value]||[];
  renderGradingAssignmentOptions();
  clearDirty('grading');
  const classes=Number(result?.classroomCount)||0,assignments=Number(result?.assignmentCount)||0;
  badge($('#gradingClassroomBadge'),'good',classes===1?'1 class':`${classes} classes`);
  const empty=(result?.classrooms||[]).filter(course=>!course.assignmentCount).map(course=>course.courseDisplayName);
  toast(`${classes} class${classes===1?'':'es'} and ${assignments} assignment${assignments===1?'':'s'} ready.${empty.length?` No assignments found in ${empty.join(', ')}.`:''}`);
}).catch(e=>toast(e.message,true));
$('#removeGradingClassroom').onclick=async()=>{const courseId=$('#gradingClassroomSelect').value,course=(latestGradingState?.settings?.gradingClassrooms||[]).find(item=>item.courseId===courseId);if(!course)return;if(!(await askConfirm(`Remove ${course.courseDisplayName}?`,'This only takes it off your grading list here. Nothing in Google Classroom changes.',{ok:'Remove'})))return;try{const settings=await cati.removeGradingClassroom(courseId);latestGradingState={...(latestGradingState||{}),settings};delete gradingAssignmentsByCourse[courseId];gradingAssignments=gradingAssignmentsByCourse[settings.activeGradingCourseId]||[];renderGradingAssignmentOptions();renderGradingClassrooms(settings);clearDirty('grading');toast('Class removed from your grading list.')}catch(e){toast(e.message,true)}};
$('#chooseGradingReviewFolder').onclick=()=>withBusy($('#chooseGradingReviewFolder'),'Choosing…',async()=>{const settings=await cati.selectGradingReviewFolder();if(!settings)return;latestGradingState={...(latestGradingState||{}),settings};syncReviewCopyControls(settings);clearDirty('grading');toast('Private grading review folder selected. Review copies are still off until you enable and save them.')} ).catch(e=>toast(e.message,true));
$('#openGradingReviewFolder').onclick=()=>cati.openGradingReviewFolder().catch(e=>toast(e.message,true));
$('#runLocalGrade').onclick=()=>withBusy($('#runLocalGrade'),'Grading…',async()=>{
  await cati.saveGradingSettings({enabled:$('#gradingEnabled').checked,model:$('#gradingModel').value,classroomDraftWriteEnabled:$('#gradingClassroomWriteEnabled')?.checked===true,batchSize:Number($('#gradingBatchSize')?.value)||5,activeGradingCourseId:$('#gradingClassroomSelect')?.value||'',reviewExportEnabled:$('#gradingReviewExportEnabled')?.checked===true});clearDirty('grading');
  const result=await cati.createDraftGrade({model:$('#gradingModel').value,question:$('#gradingQuestion').value,rubric:$('#gradingRubric').value,studentWork:$('#gradingStudentWork').value});
  renderGradeResult(result);if(result.status==='SAFE_DRAFT')toast('Local draft grade created and validated. Nothing was written to Classroom.');else toast('CATI stopped at teacher review. Nothing was written to Classroom.');
}).catch(e=>toast(e.message,true));
$('#runClassroomGrading').onclick=()=>withBusy($('#runClassroomGrading'),'Reading Classroom…',async()=>{
  const assignmentId=$('#gradingClassroomAssignment').value,assignment=gradingAssignments.find(a=>a.assignmentId===assignmentId);if(!assignment)throw new Error('Find Classroom assignments and choose one before grading.');

  const saved=await cati.saveGradingSettings({enabled:$('#gradingEnabled').checked,model:$('#gradingModel').value,classroomDraftWriteEnabled:$('#gradingClassroomWriteEnabled')?.checked===true,batchSize:Number($('#gradingBatchSize')?.value)||5,activeGradingCourseId:$('#gradingClassroomSelect')?.value||'',reviewExportEnabled:$('#gradingReviewExportEnabled')?.checked===true});if(saved.cancelled)return;clearDirty('grading');latestGradingState={...(latestGradingState||{}),settings:{...(latestGradingState?.settings||{}),...saved}};syncClassroomWriteControls(saved);syncReviewCopyControls(saved);
  let writeDrafts=$('#gradingWriteDraftsThisRun').checked===true;
  if(writeDrafts&&!saved.classroomDraftWriteEnabled)throw new Error('Classroom draft writing is off. Turn on the separate draft-write setting and save it first.');
  const result=await cati.processClassroomGrading({assignment,rubric:$('#gradingClassroomRubric').value,questionOverride:$('#gradingClassroomQuestion').value,model:$('#gradingModel').value,batchSize:Number($('#gradingBatchSize').value)||5,writeDrafts});
  if(result?.cancelled){toast('Draft-grade batch cancelled. No Classroom grade was changed.');return;}
  renderClassroomGradingResult(result);const reviewNote=result.reviewExport?.folderPath?' Private review copies were saved.':result.reviewExport?.error?' The review copy needs attention.':'';toast((writeDrafts?`Classroom grading finished. ${Number(result.summary?.draftsSaved||0)} draft score${Number(result.summary?.draftsSaved||0)===1?'':'s'} saved and verified.`:'Classroom grading preview finished. No grades were changed.')+reviewNote);
}).catch(e=>toast(e.message,true));

function machineRoleLabel(role){return ({primary:'Main computer',backup:'Backup computer',manual:'Manual only'}[role]||'Main computer');}
function renderMachineHelp(){const role=$('#machineRole')?.value||machine.role||'primary',name=$('#machineName')?.value||machine.displayName||'This PC',t=$('#scheduleTime')?.value||cfg.schedule?.time||'06:30';if($('#machineBadge'))badge($('#machineBadge'),role==='manual'?'neutral':role==='backup'?'info':'good',machineRoleLabel(role));if($('#machineRoleHelp'))$('#machineRoleHelp').textContent=role==='primary'?`${name} is the main computer. It checks at ${formatClock(t)}.`:role==='backup'?`${name} is a backup computer. It waits about ${Number(machine.backupDelayMinutes||60)} minutes, then checks Classroom only if work is still not turned in.`:`${name} is manual only. It can run Safety Check or Check now, but it will never run on a schedule.`;}
function renderSchedulePreview(){const t=$('#scheduleTime').value||'06:30',days=$$('#scheduleDays input:checked').map(i=>i.value),role=$('#machineRole')?.value||machine.role||'primary',delay=Number(machine.backupDelayMinutes||60),shownDays=role==='backup'?shiftedDays(days,t,delay):days;let detail=role==='backup'?`this backup PC checks ${formatClock(addMinutes(t,delay))}`:role==='manual'?'no automatic check runs on this PC':`this main PC checks ${formatClock(t)}`;$('#nextSchedulePreview').textContent=`${formatDays(shownDays)} · ${detail}. Temporary problems can retry automatically. This computer must be on and signed in.`;renderMachineHelp();}
async function loadAutomation(){cfg=await cati.getConfig();machine=await cati.getMachine();const live=!cfg.dryRun,manualOnly=String(machine.role||'primary')==='manual';$('#liveToggle').checked=live;$('#scheduleTime').value=cfg.schedule?.time||'06:30';$$('#scheduleDays input').forEach(i=>i.checked=(cfg.schedule?.days||[]).includes(i.value));$('#machineName').value=machine.displayName||'This PC';$('#machineRole').value=machine.role||'primary';renderMode(live);const h=await cati.getScheduleHealth();const expectedHealthy=manualOnly?!h.exists:!!h.healthy;$('#scheduleEnabled').value=expectedHealthy?'1':'0';const healthText=manualOnly&&!h.exists?'Manual only · no automatic checks are scheduled on this computer.':(h.retryProblem?`${h.retryTeacherMessage||'The automatic retry needs attention.'} Support code: ${h.retrySupportCode||'AT-SCH-106'}`:(h.retryActive?`Temporary problem · retry scheduled${h.retryNextRun?` ${relativeTime(h.retryNextRun)}`:''}`:(h.supportCode?`${h.teacherMessage||'Auto Turn-In could not confirm the automatic schedule.'} Support code: ${h.supportCode}`:(h.exists?`${h.healthy?'Schedule ready':'Schedule needs attention'}${h.nextRun?` · next ${fmtDate(h.nextRun)}`:''}`:'Automatic checks are not scheduled'))));$('#scheduleHealthText').textContent=healthText;$('#scheduleStatus').classList.toggle('good',expectedHealthy&&!h.retryProblem&&!h.supportCode);$('#scheduleStatus').classList.toggle('bad',!!h.retryProblem||!!h.supportCode||!!h.exists&&!h.healthy);renderSchedulePreview();clearDirty('automation');}
function renderMode(live){$('#modeTitle').textContent=live?'ON':'OFF';$('#modeDesc').textContent=live?'Verified matching lesson plans may be submitted automatically.':'Automatic submitting is off. You can still run a Safety Check.';$('#runLive').disabled=!live||running;}
$('#liveToggle').onchange=async()=>{const wanted=$('#liveToggle').checked;try{const r=await cati.setLiveEnabled(wanted);if(r.cancelled){$('#liveToggle').checked=false;if(r.reason)toast(r.reason,true)}await loadAutomation();await loadDashboard()}catch(e){toast(e.message,true);await loadAutomation()}};
['scheduleTime','machineName'].forEach(id=>$('#'+id).addEventListener('input',()=>{markDirty('automation');renderSchedulePreview()}));$('#machineRole').addEventListener('change',()=>{markDirty('automation');renderSchedulePreview()});$$('#scheduleDays input').forEach(i=>i.addEventListener('change',()=>{markDirty('automation');renderSchedulePreview()}));
async function persistSchedule(){const role=$('#machineRole').value,name=$('#machineName').value.trim()||'This PC',days=$$('#scheduleDays input:checked').map(i=>i.value);const savedMachine=await cati.saveMachine({role,displayName:name});machine=savedMachine.machine||savedMachine;if(role==='manual'){await cati.removeSchedule();clearDirty('automation');await loadAutomation();await loadDashboard();toast('This computer is set to manual only. No automatic checks will run here.');return {machine};}if(!days.length)throw new Error('Choose at least one day for automatic checks.');cfg=await cati.saveConfig({schedule:{...(cfg.schedule||{}),time:$('#scheduleTime').value,days}});const r=await cati.installSchedule();clearDirty('automation');await loadAutomation();await loadDashboard();const actual=role==='backup'?addMinutes(cfg.schedule.time,Number(machine.backupDelayMinutes||60)):cfg.schedule.time;toast(`Schedule saved for ${machineRoleLabel(role).toLowerCase()}. This computer checks at ${formatClock(actual)}.`);return r;}
$('#saveMachine').onclick=()=>withBusy($('#saveMachine'),'Saving…',persistSchedule).catch(e=>toast(e.message,true));
$('#installSchedule').onclick=()=>withBusy($('#installSchedule'),'Saving…',persistSchedule).catch(e=>toast(e.message,true));
$('#removeSchedule').onclick=async()=>{if(!(await askConfirm('Pause automatic checks?','Auto Turn-In will stop opening Classroom on its schedule until you save a schedule again.',{ok:'Pause checks',danger:true})))return;await withBusy($('#removeSchedule'),'Pausing…',async()=>{await cati.removeSchedule();clearDirty('automation');await loadAutomation();await loadDashboard();toast('Automatic checks are paused.');}).catch(e=>toast(e.message,true));};
async function run(dry){if(running)return false;running=true;$('#runTest').disabled=true;$('#runLive').disabled=true;setStatus(dry?'Safety Check is running…':'Checking for anything due now…');try{const r=await cati[dry?'runTest':'runLive']();const result=r?.result||{};const message=dry?'Safety Check passed. Nothing was attached or submitted.':(Number(result.submitted||0)>0?`Auto Turn-In successfully turned in ${Number(result.submitted)} lesson plan${Number(result.submitted)===1?'':'s'}.`:'Nothing needs to be turned in right now.');setStatus(message);return true}catch(e){setStatus(e.message,true);return false}finally{running=false;$('#runTest').disabled=false;cfg=await cati.getConfig();renderMode(!cfg.dryRun);await loadLogs();await loadDashboard()}}
$('#runTest').onclick=()=>withBusy($('#runTest'),'Checking…',()=>run(true)).catch(e=>toast(e.message,true));$('#runLive').onclick=()=>withBusy($('#runLive'),'Checking…',()=>run(false)).catch(e=>toast(e.message,true));

async function loadLogs(){const box=$('#logBox');if(box)box.textContent='Support files are stored on this computer and are not shown inside the app.';}
function meaningForProblem(msg){const s=friendlyMessage(msg||'');if(/sign in/i.test(s))return ['Google needs your attention','Open Setup and reconnect to the correct work Google account.'];if(/lesson plan.*not found|weekly plan is missing/i.test(s))return ['A weekly plan is missing','Open Lesson plans and make sure the matching weekly file is in the approved Drive folder.'];if(/due date/i.test(s))return ['The assignment due date needs attention','Check the assignment due date in Classroom, then run Check now again.'];if(/damaged|history/i.test(s))return ['Saved Auto Turn-In information needs attention','Keep automatic turn-in paused and copy the support summary for whoever is helping you.'];if(/schedule/i.test(s))return ['The automatic schedule needs attention','Open Automatic turn-in and save the schedule again.'];return [s||'No recent problems','If something needs attention, Auto Turn-In will stop instead of guessing.'];}
async function loadHelpSummary(){const d=latestDashboard||await cati.getDashboard();latestDashboard=d;const diag=d.diagnostics||{},block=(diag.currentBlockers||[])[0],failure=diag.unresolvedFailure||null,last=block?.message||failure?.message||'',supportCode=block?.supportCode||failure?.supportCode||'';const code=$('#helpCode');if(!last){$('#helpLastProblem').textContent='No current problems';$('#helpMeaning').textContent='Auto Turn-In is not reporting a current problem.';$('#helpAction').textContent='No action is needed right now.';code.textContent='';code.classList.add('hidden');return}const [title,action]=meaningForProblem(last);$('#helpLastProblem').textContent=title;$('#helpMeaning').textContent=friendlyMessage(last);$('#helpAction').textContent=action;if(supportCode){code.textContent=`Support code: ${supportCode}`;code.classList.remove('hidden')}else{code.textContent='';code.classList.add('hidden')}}
$('#refreshLogs').onclick=()=>withBusy($('#refreshLogs'),'Refreshing…',async()=>{await loadLogs();await loadHelpSummary()});$('#openLogs').onclick=()=>cati.openLogs();$('#cleanupLogs').onclick=()=>withBusy($('#cleanupLogs'),'Cleaning…',async()=>{const r=await cati.cleanupDiagnostics();toast(`Removed ${r.removed} old support file${r.removed===1?'':'s'}.`);await loadLogs()});
$('#runDiagnostics').onclick=()=>withBusy($('#runDiagnostics'),'Checking…',async()=>{await Promise.all([checkEnvironment([]),loadDashboard(),loadLogs()]);await loadHelpSummary();toast('App health checked.');});
$('#copyDiagnostics').onclick=async()=>{const d=latestDashboard||await cati.getDashboard(),sh=d.scheduler||{},diag=d.diagnostics||{},manualOnly=String(d.machine?.role||'primary')==='manual';const text=[`GoClassroom preview v0.9.26 (Classroom Auto Turn-In compatibility identity)`,`This computer: ${d.machine?.displayName||'This PC'} (${machineRoleLabel(d.machine?.role||'primary')})`,`Lesson-plan Classroom: ${d.config?.courseDisplayName||(d.config?.courseUrl?'Selected':'Not selected')}`,`Automatic turn-in: ${d.config?.dryRun?'Off':'On'}`,`Automatic schedule: ${manualOnly&&!sh.exists?'Manual only':(d.config?.dryRun&&!sh.exists?'Not scheduled — automatic turn-in off':(sh.healthy?'Ready':'Needs attention'))}`,`Next check: ${manualOnly&&!sh.exists?'None — manual only':(d.config?.dryRun&&!sh.exists?'None — automatic turn-in off':(sh.nextRun?fmtDate(sh.nextRun):'None scheduled'))}`,`Last check: ${diag.lastOutcome?outcomeLabel(diag.lastOutcome.status):'No checks yet'}${diag.lastOutcome?.supportCode?` (${diag.lastOutcome.supportCode})`:''}`,`Current issue: ${((diag.currentBlockers||[]).map(x=>`${friendlyMessage(x.message||x.type)}${blockerEvidence(x)}${x.supportCode?` (${x.supportCode})`:''}`).join(' | ')||(diag.unresolvedFailure?`${friendlyMessage(diag.unresolvedFailure.message)}${diag.unresolvedFailure.supportCode?` (${diag.unresolvedFailure.supportCode})`:''}`:'None'))}`].join('\n');try{await navigator.clipboard.writeText(text);toast('Support summary copied.')}catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Support summary copied.')}};

cati.onAiDraftReady(d=>{toast(`Week ${d.week} AI lesson-plan draft is ready for review.`);loadDashboard();if($('#ai')?.classList.contains('active'))loadAi()});

cati.onStatus(s=>{running=s.running;$('#runTest').disabled=running;renderMode(!cfg.dryRun)});
$('#refreshDash').onclick=()=>withBusy($('#refreshDash'),'Refreshing…',loadDashboard).catch(e=>toast(e.message,true));

// Guided setup wizard
function showWizard(force=false){if(force||!cfg.setupComplete){previousFocus=document.activeElement;$('#wizard').classList.remove('hidden');$('#wizard').setAttribute('aria-hidden','false');$('#wizardSteps').classList.remove('hidden');$('#wizardComplete').classList.add('hidden');$('#wizardFoot').classList.remove('hidden');wizardStep=1;renderWizard();setTimeout(()=>$('.wizard-card')?.focus(),0)}}
function hideWizard(){$('#wizard').classList.add('hidden');$('#wizard').setAttribute('aria-hidden','true');previousFocus?.focus?.();}
function setSafetyResult(passed,text){const box=$('#wizTestResult');box.classList.toggle('passed',!!passed);box.querySelectorAll('i').forEach(i=>i.textContent=passed?'Verified':'Waiting');if(!passed&&text){box.querySelector('i').textContent=text;}}
function renderWizard(){$$('.wizard-step').forEach(s=>s.classList.toggle('active',Number(s.dataset.step)===wizardStep));$$('.wizard-progress li').forEach(s=>s.classList.toggle('on',Number(s.dataset.dot)<=wizardStep));$('#wizStepLabel').textContent=`Step ${wizardStep} of 5`;$('#wizBack').disabled=wizardStep===1;$('#wizNext').classList.toggle('hidden',wizardStep===5);$('#wizFinish').classList.toggle('hidden',wizardStep!==5);if(wizardStep===5)cati.getConfig().then(c=>{const passed=c.safetyCertification?.passedAt;$('#wizFinish').disabled=!passed;setSafetyResult(!!passed,passed?null:'Not tested')})}
async function hydrateWizard(){cfg=await cati.getConfig();const aiState=await cati.getAiState();checkEnvironment([$('#wizEnvironment'),$('#environmentLabel')]);$('#wizCourse').textContent=cfg.courseDisplayName||(cfg.courseUrl?'Classroom selected':'Not selected yet.');$('#wizDrive').textContent=cfg.driveFolderName||(cfg.driveFolderUrl?'Drive folder selected':'No folder selected yet.');$('#wizAssignmentRegex').value=cfg.assignmentTitleRegex||'';$('#wizPlanRegex').value=cfg.planTitleRegex||'';$('#wizAssignmentExample').value=cfg.assignmentTitleExample||'';$('#wizPlanExample').value=cfg.planTitleExample||'';$('#wizEligibility').value=cfg.eligibilityMode||'classroomDueDate';$('#wizOverdue').checked=!!cfg.submitOverdue;$('#wizScheduleTime').value=cfg.schedule?.time||'06:30';const aiChoice=aiState.settings?.optedIn?'yes':'no',radio=document.querySelector(`input[name="wizAiChoice"][value="${aiChoice}"]`);if(radio)radio.checked=true;renderTopicChoices($('#wizTopic'),cfg.topicName);}
$('#wizPlanExample').addEventListener('input',()=>syncExampleToRegex('#wizPlanExample','#wizPlanRegex',true));$('#wizAssignmentExample').addEventListener('input',()=>syncExampleToRegex('#wizAssignmentExample','#wizAssignmentRegex',false));
$('#openWizard').onclick=async()=>{await hydrateWizard();showWizard(true)};$('#closeWizard').onclick=hideWizard;$('#wizDone').onclick=hideWizard;
$('#wizSelectCourse').onclick=()=>withBusy($('#wizSelectCourse'),'Opening…',async()=>{const r=await chooseCourse($('#wizCourse'),{warn:false});if(r){await findTopics($('#wizTopic')).catch(e=>toast(e.message,true));await hydrateWizard();}}).catch(e=>toast(e.message,true));
$('#wizFindTopics').onclick=()=>withBusy($('#wizFindTopics'),'Finding…',()=>findTopics($('#wizTopic')).catch(e=>{throw e})).catch(e=>toast(e.message,true));
$('#wizSelectDrive').onclick=()=>withBusy($('#wizSelectDrive'),'Opening…',async()=>{const r=await chooseDrive($('#wizDrive'),{warn:false});if(r)await hydrateWizard();}).catch(e=>toast(e.message,true));
$('#wizScanDrive').onclick=()=>withBusy($('#wizScanDrive'),'Checking…',async()=>{const current=await cati.getConfig();assertExampleValid('#wizPlanExample',{file:true,label:'Drive filename example'});syncExampleToRegex('#wizPlanExample','#wizPlanRegex',true);await cati.saveConfig({...current,planTitleRegex:$('#wizPlanRegex').value||current.planTitleRegex,planTitleExample:$('#wizPlanExample').value.trim()});plans=await cati.scanDriveFolder();renderPlans();$('#wizScanResult').textContent=`Found ${plans.length} matching plan${plans.length===1?'':'s'}.`;toast(`Found ${plans.length} matching plan${plans.length===1?'':'s'}.`);}).catch(e=>{toast(e.message,true);$('#wizScanResult').textContent=friendlyMessage(e.message)});
$('#wizBack').onclick=()=>{if(wizardStep>1){wizardStep--;renderWizard()}};
$('#wizNext').onclick=async()=>{
  try{
    if(wizardStep===1){cfg=await cati.getConfig();if(!cfg.courseUrl)throw new Error('Choose a Classroom before continuing.');}
    if(wizardStep===2){const topic=$('#wizTopic').value;if(!topic)throw new Error('Choose an assignment topic.');cfg=await cati.saveConfig({...(await cati.getConfig()),topicName:topic});}
    if(wizardStep===3){cfg=await cati.getConfig();if(!cfg.driveFolderUrl)throw new Error('Choose a Google Drive plan folder before continuing.');const p=await cati.getPlans();if(!p.length)throw new Error('Check the Drive folder and find at least one matching plan before continuing.');}
    if(wizardStep===4){assertExampleValid('#wizAssignmentExample',{label:'Classroom assignment example'});assertExampleValid('#wizPlanExample',{file:true,label:'Drive filename example'});syncExampleToRegex('#wizAssignmentExample','#wizAssignmentRegex',false);syncExampleToRegex('#wizPlanExample','#wizPlanRegex',true);const current=await cati.getConfig();cfg=await cati.saveConfig({...current,assignmentTitleRegex:$('#wizAssignmentRegex').value||current.assignmentTitleRegex,planTitleRegex:$('#wizPlanRegex').value||current.planTitleRegex,assignmentTitleExample:$('#wizAssignmentExample').value.trim(),planTitleExample:$('#wizPlanExample').value.trim(),eligibilityMode:$('#wizEligibility').value,submitOverdue:$('#wizOverdue').checked,schedule:{...(current.schedule||{}),time:$('#wizScheduleTime').value}});const wantAi=document.querySelector('input[name="wizAiChoice"]:checked')?.value==='yes';const aiState=await cati.getAiState();await cati.saveAiSettings({optedIn:wantAi,enabled:wantAi&&!!aiState.settings?.enabled});}
    wizardStep++;renderWizard();
  }catch(e){toast(e.message,true)}
};
$('#wizRunTest').onclick=()=>withBusy($('#wizRunTest'),'Checking…',async()=>{const ok=await run(true);cfg=await cati.getConfig();const passed=cfg.safetyCertification?.passedAt;if(ok&&passed){setSafetyResult(true);$('#wizFinish').disabled=false;toast('Safety Check passed. Setup is safe to turn on.');}else{setSafetyResult(false,'Needs attention');$('#wizFinish').disabled=true;}});
$('#wizFinish').onclick=()=>withBusy($('#wizFinish'),'Finishing…',async()=>{
  cfg=await cati.getConfig();if(!cfg.safetyCertification?.passedAt){toast('Run the Safety Check successfully before finishing setup.',true);return}
  const time=$('#wizScheduleTime').value||cfg.schedule?.time||'06:30',finished=await cati.finishSetup(time);if(!finished?.enabled||!finished?.health?.healthy)throw new Error('Setup could not be fully turned on. Nothing unsafe was enabled.');
  await loadSetup();await loadPlans();await loadAutomation();const d=await loadDashboard();$('#wizardSteps').classList.add('hidden');$('#wizardFoot').classList.add('hidden');$('#wizardComplete').classList.remove('hidden');$('#completeClassroom').textContent=d.config?.courseDisplayName||'Ready';$('#completeDrive').textContent=d.config?.driveFolderName||'Ready';$('#completeSchedule').textContent=`${formatClock(time)} on selected days`;$('#wizardCompleteText').textContent=`Automatic turn-in is on. The first daily check starts at ${formatClock(time)}.`;const wantAi=document.querySelector('input[name="wizAiChoice"]:checked')?.value==='yes';if(wantAi){applyAiVisibility(d.ai||{});toast('Normal Auto Turn-In is ready. Optional AI setup will be available after you close this window.');}
}).catch(e=>toast(friendlyMessage(e.message||String(e)),true));

async function saveDirty(section){if(section==='setup'){await saveSetupFields({warn:true});toast('Settings saved.');}else if(section==='plans')await saveManualPlans();else if(section==='automation')await persistSchedule();else if(section==='ai')await saveAi();else if(section==='grading')await saveGrading();else if(section==='rosters')await saveRosterMappings();}
$('#unsavedSave').onclick=async()=>{const section=dirtyForPage();if(!section)return;await withBusy($('#unsavedSave'),'Saving…',()=>saveDirty(section)).catch(e=>toast(e.message,true));};
$('#unsavedDiscard').onclick=async()=>{const section=dirtyForPage();if(!section)return;clearDirty(section);await reloadSection(activePage());};

(async()=>{
  const d=await loadDashboard();await loadSetup();await loadPlans();if(applyAiVisibility(d.ai||{}))await loadAi();await loadAutomation();await loadLogs();await hydrateWizard();cfg=await cati.getConfig();showWizard(false);
})().catch(e=>toast(e?.message||'CATI_UI|AT-START-101|Auto Turn-In could not finish opening. Close and reopen the app. If it happens again, open Help & support.',true));
