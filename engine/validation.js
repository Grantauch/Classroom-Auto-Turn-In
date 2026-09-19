const {isClassroomCourseUrl,isDriveFolderUrl,isGooglePlanFileUrl}=require('./safety');
function hasCaptureGroup(pattern){
  const s=String(pattern||'');let esc=false,inClass=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(esc){esc=false;continue}
    if(c==='\\'){esc=true;continue}
    if(c==='['){inClass=true;continue}
    if(c===']'){inClass=false;continue}
    if(inClass||c!=='(')continue;
    if(s[i+1]!=='?')return true;
    if(s[i+2]==='<' && s[i+3]!=='=' && s[i+3]!=='!')return true; // named capture
  }
  return false;
}
function validateWeekPattern(value,label){
  const s=String(value||'');
  if(!s.trim())throw new Error(`${label} cannot be blank.`);
  if(s.length>300)throw new Error(`${label} is too long. Keep the naming rule under 300 characters.`);
  try{new RegExp(s,'i')}catch(e){throw new Error(`${label} is invalid: ${e.message}`)}
  if(!hasCaptureGroup(s))throw new Error(`${label} must include a capture group for the week number, such as (\\d+).`);
  return s;
}
function validateConfig(c){
  c={...c,schedule:{...(c.schedule||{})}};
  c.assignmentTitleRegex=validateWeekPattern(c.assignmentTitleRegex,'Classroom assignment naming rule');
  c.planTitleRegex=validateWeekPattern(c.planTitleRegex,'Drive plan naming rule');
  if(c.courseUrl && !isClassroomCourseUrl(c.courseUrl))throw new Error('The selected Classroom address is not a recognized Google Classroom course. Choose the Classroom again.');
  if(c.driveFolderUrl && !isDriveFolderUrl(c.driveFolderUrl))throw new Error('The selected plan location must be a specific Google Drive folder. Open that folder and choose it again.');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.schedule?.time||'')))throw new Error('Choose a valid automatic check time.');
  const validDays=new Set(['MON','TUE','WED','THU','FRI','SAT','SUN']);
  const days=Array.isArray(c.schedule?.days)?c.schedule.days:[];
  if(!days.length||days.some(x=>!validDays.has(x)))throw new Error('Choose at least one valid automatic check day.');
  const retries=(Array.isArray(c.retryMinutes)?c.retryMinutes:[15,30]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!retries.length||retries.length>2||retries.some((v,i)=>v<1||v>180||(i>0&&v<=retries[i-1])))throw new Error('Automatic retry timing is invalid. Restore the default retry settings.');
  c.retryMinutes=retries;
  const max=Number(c.maxSubmissionsPerRun);if(!Number.isInteger(max)||max<1||max>20)throw new Error('Maximum plans in one check must be between 1 and 20.');
  const earliest=Number(c.earliestWeek??1),latest=Number(c.latestWeek??52);
  if(!Number.isInteger(earliest)||!Number.isInteger(latest)||earliest<1||latest>52||earliest>latest)throw new Error('Week range must stay between Week 1 and Week 52.');
  c.maxSubmissionsPerRun=max;c.earliestWeek=earliest;c.latestWeek=latest;c.eligibilityMode='classroomDueDate';
  return c;
}
function validatePlanList(plans){
  for(const p of plans||[]){
    const week=Number(p.week);
    if(!Number.isInteger(week)||week<1||week>52)throw new Error(`Week must be between 1 and 52. Check "${p.title||'untitled plan'}".`);
    if(!isGooglePlanFileUrl(p.url))throw new Error(`"${p.title||`Week ${week}`}" must link to a Google Docs/Sheets/Slides file or a Google Drive file, not a folder or unrelated page.`);
  }
  return plans;
}
module.exports={hasCaptureGroup,validateWeekPattern,validateConfig,validatePlanList};
