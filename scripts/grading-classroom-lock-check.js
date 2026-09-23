const fs=require('fs');
const path=require('path');
const os=require('os');
const {createGradingService}=require('../main-services/grading-service');
const {createLocalData}=require('../main-services/local-data');

function assert(condition,message){if(!condition)throw new Error(message)}

// Static contract. Saving a grading Classroom runs ensureAutomationIdle, which rejects while
// the picker still holds the exclusive browser lock. Keeping the save inside that lock made
// every "Add grading Classroom" fail with AT-GRD-194 after the class had already been chosen.
const mainSource=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
const functionStart=mainSource.indexOf('async function selectGradingClassroom(');
assert(functionStart>=0,'selectGradingClassroom is missing from main.js');
const lockStart=mainSource.indexOf('withExclusiveBrowserOperation(',functionStart);
assert(lockStart>functionStart,'selectGradingClassroom no longer opens the picker inside withExclusiveBrowserOperation');
let depth=0,lockEnd=-1;
for(let i=mainSource.indexOf('(',lockStart);i<mainSource.length;i++){
  const character=mainSource[i];
  if(character==='(')depth++;
  else if(character===')'&&--depth===0){lockEnd=i;break}
}
assert(lockEnd>lockStart,'Could not read the withExclusiveBrowserOperation call in selectGradingClassroom');
assert(!mainSource.slice(lockStart,lockEnd).includes('addGradingClassroom'),'The grading Classroom is saved inside the exclusive browser lock, so ensureAutomationIdle rejects it with AT-GRD-194');
assert(mainSource.slice(lockEnd,lockEnd+600).includes('addGradingClassroom'),'selectGradingClassroom no longer saves the chosen grading Classroom after the lock is released');

// Behavioural contract, run against the real grading service and a real on-disk settings file.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gc-grading-lock-'));
const localData=createLocalData(()=>root);
let lockHeld=false;
const ensureAutomationIdle=()=>{if(lockHeld)throw new Error('Another Auto Turn-In action is already running. Wait for it to finish, then try again.')};
const service=createGradingService({localData,ensureAutomationIdle,compactError:error=>String(error?.message||error)});
const first={courseId:'course_us_history_1',courseUrl:'https://classroom.google.com/c/course_us_history_1',courseDisplayName:'U.S. History 1st Hour'};

lockHeld=true;
let blocked=null;
try{service.addGradingClassroom(first)}catch(error){blocked=error}
assert(blocked&&/already running/i.test(blocked.message),'This check no longer reproduces the AT-GRD-194 self-block it exists to prevent');
assert(service.loadSettings().gradingClassrooms.length===0,'A blocked add must not leave a grading Classroom behind');

lockHeld=false;
const saved=service.addGradingClassroom(first);
assert(saved.gradingClassrooms.length===1,'Adding a grading Classroom after the lock released did not save it');
assert(saved.activeGradingCourseId===first.courseId,'A newly added grading Classroom did not become the active one');

const others=[
  ['course_bts_3','Beyond The Scoreboard 3rd Hour'],
  ['course_us_history_4','U.S. History 4th Hour'],
  ['course_bts_5','Beyond The Scoreboard 5th Hour'],
  ['course_hidden_history_6','Hidden History 6th Hour']
];
for(const [courseId,courseDisplayName] of others)service.addGradingClassroom({courseId,courseUrl:`https://classroom.google.com/c/${courseId}`,courseDisplayName});
service.addGradingClassroom({...first,courseDisplayName:'U.S. History 1st Hour (renamed)'});

const settings=service.loadSettings();
assert(settings.gradingClassrooms.length===5,`Expected 5 saved grading Classrooms, found ${settings.gradingClassrooms.length}`);
assert(settings.gradingClassrooms.filter(course=>course.courseId===first.courseId).length===1,'Re-adding the same grading Classroom created a duplicate entry');
assert(settings.gradingClassrooms.find(course=>course.courseId===first.courseId).courseDisplayName==='U.S. History 1st Hour (renamed)','Re-adding a grading Classroom did not refresh its display name');
assert(!localData.loadConfig().courseUrl,'Saving grading Classrooms must not write the lesson-plan Classroom');

fs.rmSync(root,{recursive:true,force:true});
console.log('Grading Classroom lock checks passed: the save runs outside the browser lock, and five independent grading Classrooms save without touching the lesson-plan Classroom.');
