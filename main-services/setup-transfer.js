const {validateConfig}=require('../engine/validation');

const FORMAT='classroom-auto-turn-in-setup';
const VERSION=1;
const SAFE_FIELDS=['courseUrl','courseDisplayName','topicName','driveFolderUrl','driveFolderName','assignmentTitleRegex','planTitleRegex','assignmentTitleExample','planTitleExample','eligibilityMode','maxSubmissionsPerRun','earliestWeek','latestWeek','submitOverdue','screenshotOnEveryRun','notifications'];
function pickSafeConfig(cfg={}){
  const out={};for(const k of SAFE_FIELDS)if(cfg[k]!==undefined)out[k]=cfg[k];
  out.schedule={time:String(cfg.schedule?.time||'06:30'),days:Array.isArray(cfg.schedule?.days)?[...cfg.schedule.days]:['MON','TUE','WED','THU','FRI']};
  return out;
}
function buildSetupExport(cfg={}){
  return {format:FORMAT,version:VERSION,exportedAt:new Date().toISOString(),setup:pickSafeConfig(cfg)};
}
function parseSetupImport(value,currentCfg){
  const raw=typeof value==='string'?JSON.parse(value):value;
  if(!raw||raw.format!==FORMAT||Number(raw.version)!==VERSION||!raw.setup||typeof raw.setup!=='object')throw new Error('That file is not a valid Auto Turn-In setup file.');
  const imported=raw.setup;
  const merged={...currentCfg,...pickSafeConfig(imported),profileDir:currentCfg.profileDir,browserChannel:currentCfg.browserChannel,dryRun:true,setupComplete:true,lastDryRunOkAt:null,safetyCertification:null,schedule:{...(currentCfg.schedule||{}),...(pickSafeConfig(imported).schedule||{}),enabled:false}};
  return validateConfig(merged);
}
module.exports={FORMAT,VERSION,SAFE_FIELDS,pickSafeConfig,buildSetupExport,parseSetupImport};
