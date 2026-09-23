const {assignmentEligibility,log}=require('./lib');
const {assignmentDetailVisible}=require('./classroom-actions');
const {openWeekAssignmentFromClasswork,verifyAssignmentIdentity,readAssignmentDueDate}=require('./classroom-discovery');
const {savePageEvidence}=require('./page-evidence');

const COMPLETED_LIST_LABEL=/\b(Turned in late|Turned in|Done late|Handed in late|Handed in|Marked as done|Graded|Returned)\b/i;

function listedAsCompleted(assignment){
  const text=String(assignment?.cardText||'').replace(/\s+/g,' ');
  if(/\bDue\b/i.test(text))return '';
  const match=text.match(COMPLETED_LIST_LABEL);
  return match?match[1]:'';
}

async function openVerifiedAssignmentDetail(page,item,classworkUrl,regex,cfg){
  let opened=false;
  const direct=item.detailHref||item.href||'';
  if(direct){
    try{
      await page.goto(direct,{waitUntil:'domcontentloaded',timeout:30000});
      opened=await assignmentDetailVisible(page,15000);
    }catch{/* use the verified Classwork fallback below */}
  }
  if(!opened)opened=await openWeekAssignmentFromClasswork(page,item,classworkUrl,regex,cfg);
  if(!opened)return null;
  await page.waitForTimeout(650);
  const identity=await verifyAssignmentIdentity(page,item,cfg,regex);
  return {identity,detailHref:page.url()};
}

async function buildEligibilityQueues({page,links,plans,cfg,classworkUrl,regex,addBlocker}){
  const plansByWeek=new Map(plans.map(plan=>[Number(plan.week),plan]));
  const candidates=[];
  const ineligible=[];
  const missingPlans=[];
  const unresolvedDue=[];
  const classify=(assignment,plan,eligibility)=>{
    if(!plan){
      if(eligibility.eligible)addBlocker('MISSING_PLAN',`Week ${assignment.week} is eligible in Classroom, but no matching plan is loaded.`,{week:assignment.week,assignmentTitle:assignment.text||'',dueText:eligibility.dueText||assignment.dueText||'',dueSource:eligibility.dueSource||assignment.dueSource||'',cardText:assignment.cardText||''});
      else ineligible.push({...assignment,plan:null,eligibility,week:assignment.week,reason:eligibility.reason,date:eligibility.date});
      return;
    }
    if(!eligibility.eligible){ineligible.push({...assignment,plan,eligibility,week:assignment.week,reason:eligibility.reason,date:eligibility.date});return;}
    if(eligibility.early)log(`Week ${assignment.week}: due ${eligibility.date}, which is not a scheduled check day. Today is the last scheduled check before it is due.`);
    candidates.push({...assignment,plan,eligibility});
  };

  for(const assignment of links){
    if(assignment.week<cfg.earliestWeek||assignment.week>cfg.latestWeek)continue;
    const plan=plansByWeek.get(Number(assignment.week));
    if(!plan)missingPlans.push(assignment.week);
    const eligibility=assignmentEligibility(assignment,plan,cfg);
    if(!eligibility.unknown){classify(assignment,plan,eligibility);continue;}
    const completedLabel=listedAsCompleted(assignment);
    if(completedLabel){log(`Week ${assignment.week}: Classroom lists it as ${completedLabel}; it is not a turn-in candidate.`);continue;}
    unresolvedDue.push({assignment,plan});
  }

  for(const pending of unresolvedDue){
    const opened=await openVerifiedAssignmentDetail(page,pending.assignment,classworkUrl,regex,cfg);
    if(!opened){
      await savePageEvidence(page,`ERROR-open-week-${pending.assignment.week}`).catch(()=>{});
      addBlocker('ASSIGNMENT_OPEN_FAILED',`Week ${pending.assignment.week}'s Classwork card did not show a due date, and its assignment detail page could not be opened safely. Nothing was submitted.`,{week:pending.assignment.week,assignmentTitle:pending.assignment.text||'',cardText:pending.assignment.cardText||'',dueSource:'Classwork card; detail page unavailable'});
      continue;
    }
    const detailDue=await readAssignmentDueDate(page,{timeout:8000});
    if(!detailDue.ok){
      await savePageEvidence(page,`ERROR-due-date-week-${pending.assignment.week}`).catch(()=>{});
      const reason=detailDue.ambiguous?'conflicting due-date information was visible':'no readable due-date information was visible';
      addBlocker('DUE_DATE_UNKNOWN',`Week ${pending.assignment.week}'s Classroom due date could not be read from either its Classwork card or verified assignment detail page (${reason}). Nothing was submitted.`,{week:pending.assignment.week,assignmentTitle:opened.identity.title||pending.assignment.text||'',cardText:pending.assignment.cardText||'',dueText:'',dueSource:detailDue.source,detailDueEvidence:detailDue.evidence||[]});
      continue;
    }
    const resolved={...pending.assignment,dueText:detailDue.dueText,dueSource:detailDue.source,detailHref:opened.detailHref,detailAssignmentId:opened.identity.assignmentId};
    const eligibility=assignmentEligibility(resolved,pending.plan,cfg);
    log(`Week ${resolved.week}: due-date evidence read from ${eligibility.dueSource} (${eligibility.dueText||'No due date'}).`);
    if(eligibility.unknown){
      addBlocker('DUE_DATE_UNKNOWN',`Week ${resolved.week}'s due date could not be interpreted after checking both its Classwork card and verified assignment detail page. Nothing was submitted.`,{week:resolved.week,assignmentTitle:opened.identity.title||resolved.text||'',cardText:resolved.cardText||'',dueText:resolved.dueText||'',dueSource:resolved.dueSource||'',detailDueEvidence:detailDue.evidence||[]});
      continue;
    }
    classify(resolved,pending.plan,eligibility);
  }
  return {candidates,ineligible,missingPlans};
}

module.exports={buildEligibilityQueues,openVerifiedAssignmentDetail};
