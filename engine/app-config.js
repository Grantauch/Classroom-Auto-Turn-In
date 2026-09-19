const path=require('path');

const CONFIG_SCHEMA=6;
const DEFAULT_ASSIGNMENT_PATTERN='Week\\s+(\\d+)\\s*-\\s*Lesson Plans';
const DEFAULT_PLAN_PATTERN='^Week\\s+0?(\\d+)\\s*-\\s*Lesson Plans(?:\\.(?:docx|pdf))?$';

function defaultProfileDirForDataRoot(root){
  return path.join(path.dirname(String(root||'')),'browser-profile');
}

function defaultConfig({profileDir}={}){
  return {
    courseUrl:'',courseDisplayName:'',topicName:'Lesson Plans - Teaching Staff Only',
    driveFolderUrl:'',driveFolderName:'',
    profileDir:String(profileDir||''),browserChannel:'auto',
    dryRun:true,submitOverdue:false,maxSubmissionsPerRun:5,earliestWeek:1,latestWeek:52,
    assignmentTitleRegex:DEFAULT_ASSIGNMENT_PATTERN,
    planTitleRegex:DEFAULT_PLAN_PATTERN,
    eligibilityMode:'classroomDueDate',
    screenshotOnEveryRun:false,setupComplete:false,lastDryRunOkAt:null,safetyCertification:null,
    notifications:true,diagnosticRetentionDays:45,retryMinutes:[15,30],configSchema:CONFIG_SCHEMA,
    schedule:{enabled:false,time:'06:30',days:['MON','TUE','WED','THU','FRI']}
  };
}

function expandEnv(value,env=process.env){
  return String(value||'').replace(/%([^%]+)%/g,(_,name)=>env[name]||`%${name}%`);
}

function migrateConfig(raw,{profileDir,env=process.env}={}){
  const base=defaultConfig({profileDir});
  const input=raw&&typeof raw==='object'?raw:{};
  const cfg={...base,...input,schedule:{...base.schedule,...(input.schedule||{})}};
  if(Number(input.configSchema||0)<4) cfg.screenshotOnEveryRun=false;
  if(cfg.eligibilityMode==='planWeekOf') cfg.eligibilityMode='classroomDueDate';
  cfg.configSchema=CONFIG_SCHEMA;
  cfg.profileDir=expandEnv(cfg.profileDir||profileDir,env);
  const legacy=env.LOCALAPPDATA?path.join(env.LOCALAPPDATA,'ClassroomAutoTurnIn','chrome-profile').toLowerCase():'';
  if(!cfg.profileDir||(legacy&&String(cfg.profileDir).toLowerCase()===legacy)) cfg.profileDir=String(profileDir||'');
  return cfg;
}

module.exports={CONFIG_SCHEMA,DEFAULT_ASSIGNMENT_PATTERN,DEFAULT_PLAN_PATTERN,defaultProfileDirForDataRoot,defaultConfig,migrateConfig,expandEnv};
