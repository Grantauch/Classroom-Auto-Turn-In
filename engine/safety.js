const crypto = require('crypto');

function normalizeText(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }

function parseClassroomIds(url){
  try{
    const u=new URL(String(url||''));
    if(!/(^|\.)classroom\.google\.com$/i.test(u.hostname)) return {courseId:'',assignmentId:''};
    const parts=u.pathname.split('/').filter(Boolean);
    let courseId='',assignmentId='';
    for(let i=0;i<parts.length-1;i++){
      if((parts[i]==='c'||parts[i]==='w')&&!courseId) courseId=parts[i+1]||'';
      if(parts[i]==='a'&&!assignmentId) assignmentId=parts[i+1]||'';
    }
    return {courseId,assignmentId};
  }catch{return {courseId:'',assignmentId:''};}
}

function extractGoogleFileId(url){
  try{
    const u=new URL(String(url||''));
    if(!/(^|\.)google\.com$/i.test(u.hostname)) return '';
    const d=u.pathname.match(/\/d\/([^/?#]+)/i); if(d) return d[1];
    const f=u.pathname.match(/\/folders\/([^/?#]+)/i); if(f) return f[1];
    const id=u.searchParams.get('id'); if(id) return id;
  }catch{/* best-effort fallback */}
  return '';
}


function isClassroomCourseUrl(url){
  const ids=parseClassroomIds(url);
  return !!ids.courseId;
}

function isDriveFolderUrl(url){
  try{
    const u=new URL(String(url||''));
    if(u.hostname.toLowerCase()!=='drive.google.com') return false;
    return /\/drive(?:\/u\/\d+)?\/folders\/[^/?#]+/i.test(u.pathname);
  }catch{return false;}
}

function isGooglePlanFileUrl(url){
  try{
    const u=new URL(String(url||''));
    const host=u.hostname.toLowerCase();
    if(host==='docs.google.com') return /^\/(?:document|spreadsheets|presentation)\/d\/[^/?#]+/i.test(u.pathname);
    if(host==='drive.google.com') return /^\/file\/d\/[^/?#]+/i.test(u.pathname) || (u.pathname==='/open' && !!u.searchParams.get('id'));
    return false;
  }catch{return false;}
}

function schoolYearKey(now=new Date()){
  const y=now.getFullYear();
  const start=now.getMonth()>=6?y:y-1;
  return `${start}-${start+1}`;
}

function stateKey(courseId,assignmentId){
  if(!courseId||!assignmentId) throw new Error('A course ID and assignment ID are required for submission state.');
  return `${courseId}:${assignmentId}`;
}

function normalizedPlan(p){
  return {
    week:Number(p?.week)||0,
    weekOf:String(p?.weekOf||''),
    title:normalizeText(p?.title),
    url:String(p?.url||'').trim(),
    fileId:extractGoogleFileId(p?.url||''),
    source:String(p?.source||'manual')
  };
}

function assertUniquePlans(plans){
  const byWeek=new Map();
  for(const p of plans||[]){
    const week=Number(p?.week);
    if(!Number.isFinite(week)||week<=0) continue;
    if(!byWeek.has(week)) byWeek.set(week,[]);
    byWeek.get(week).push(p);
  }
  const dup=[...byWeek.entries()].filter(([,rows])=>rows.length>1);
  if(dup.length){
    const detail=dup.map(([week,rows])=>`Week ${week}: ${rows.map(r=>normalizeText(r.title)||'(untitled)').join(' | ')}`).join('; ');
    throw new Error(`Duplicate plan mapping detected. Exactly one plan is allowed per week. ${detail}`);
  }
  return true;
}

function preserveTrustedDriveProvenance(incoming,existing){
  const trusted=new Map((existing||[]).filter(p=>p?.source==='drive-folder').map(p=>[Number(p.week),normalizedPlan(p)]));
  return (incoming||[]).map(p=>{
    const row={...p};
    if(row.source==='drive-folder'){
      const before=trusted.get(Number(row.week));
      const now=normalizedPlan(row);
      if(before && before.title===now.title && before.url===now.url && before.fileId===now.fileId) return row;
    }
    // Only the internal Drive scanner may create/change trusted drive-folder rows.
    // Any user/import edit is fingerprinted as manual content.
    row.source=row.source==='import'?'import':'manual';
    return row;
  });
}

function fingerprintPayload(cfg,plans){
  const cleanPlans=(plans||[]).map(normalizedPlan).sort((a,b)=>a.week-b.week||a.title.localeCompare(b.title)||a.url.localeCompare(b.url));
  // Teacher Edition trust boundary: the selected Drive folder + naming rule are
  // trusted. New files discovered in that already-approved folder must not
  // disable automation every week. Manual/imported mappings remain fingerprinted.
  const manualPlans=cleanPlans.filter(p=>p.source!=='drive-folder');
  return {
    schema:3,
    courseUrl:String(cfg?.courseUrl||'').trim(),
    topicName:normalizeText(cfg?.topicName),
    driveFolderUrl:String(cfg?.driveFolderUrl||'').trim(),
    assignmentTitleRegex:String(cfg?.assignmentTitleRegex||''),
    planTitleRegex:String(cfg?.planTitleRegex||''),
    eligibilityMode:String(cfg?.eligibilityMode||''),
    submitOverdue:cfg?.submitOverdue!==false,
    earliestWeek:Number(cfg?.earliestWeek)||1,
    latestWeek:Number(cfg?.latestWeek)||52,
    manualPlans
  };
}

function computeSafetyFingerprint(cfg,plans){
  return crypto.createHash('sha256').update(JSON.stringify(fingerprintPayload(cfg,plans))).digest('hex');
}

function normalizeState(raw){
  raw=raw&&typeof raw==='object'?raw:{};
  const legacy=raw.legacySubmittedWeeks || raw.submittedWeeks || {};
  const {submittedWeeks:_discarded,...rest}=raw;
  return {
    ...rest,
    schemaVersion:3,
    submissions:raw.submissions&&typeof raw.submissions==='object'?raw.submissions:{},
    legacySubmittedWeeks:legacy,
    lastRun:raw.lastRun||null,
    lastAttempt:raw.lastAttempt||null,
    lastOutcome:raw.lastOutcome||null,
    lastSuccess:raw.lastSuccess||null,
    lastFailure:raw.lastFailure||null,
    lastSubmission:raw.lastSubmission||null,
    currentBlockers:Array.isArray(raw.currentBlockers)?raw.currentBlockers:[],
    runHistory:Array.isArray(raw.runHistory)?raw.runHistory.slice(-50):[]
  };
}

module.exports={
  normalizeText,parseClassroomIds,extractGoogleFileId,isClassroomCourseUrl,isDriveFolderUrl,isGooglePlanFileUrl,schoolYearKey,stateKey,
  normalizedPlan,assertUniquePlans,preserveTrustedDriveProvenance,fingerprintPayload,computeSafetyFingerprint,normalizeState
};
