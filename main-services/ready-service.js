const fs=require('fs');
const {encodePayload}=require('../engine/classroom-grading');
const {lastPayload}=require('../engine/protocol');
const {validateReadySnapshot,summarizeReadySnapshot}=require('../engine/ready-snapshot');

function createReadyService({localData,ensureAutomationIdle,runNodeScript,getGradingService,runExclusiveBrowser=null,dialog=null}){
  const {readJson,writeJson,loadConfig,appLog}=localData;
  const exclusive=runExclusiveBrowser||((_label,fn)=>fn());

  function savedCourses(){
    const grading=getGradingService().loadSettings();
    const courses=Array.isArray(grading.gradingClassrooms)?grading.gradingClassrooms:[];
    if(courses.length)return courses;
    const cfg=loadConfig();
    if(cfg.courseUrl){
      const match=String(cfg.courseUrl).match(/\/c\/([^/?#]+)/);
      if(match?.[1])return [{courseId:match[1],courseDisplayName:cfg.courseDisplayName||'Lesson-plan Classroom'}];
    }
    return [];
  }

  function latest(){
    const snapshot=readJson('ready-latest.json',null);
    if(!snapshot)return {snapshot:null,summary:null};
    try{validateReadySnapshot(snapshot);return {snapshot,summary:summarizeReadySnapshot(snapshot)}}
    catch{return {snapshot:null,summary:null}}
  }

  async function scan(){
    ensureAutomationIdle();
    const courses=savedCourses();
    if(!courses.length)throw new Error('Ready needs at least one Classroom. Add your teaching classes in Draft grading or choose the lesson-plan Classroom in Setup.');
    const payload=encodePayload({courses,maxAssignmentsPerCourse:8});
    const out=await exclusive('Ready classroom preflight',()=>runNodeScript('ready-scan.js',[payload],false,{timeoutMs:20*60*1000}));
    const snapshot=lastPayload(out,'ready-snapshot');
    validateReadySnapshot(snapshot);
    writeJson('ready-latest.json',snapshot);
    const summary=summarizeReadySnapshot(snapshot);
    appLog(`Ready preflight completed: ${summary.status}; ${summary.block} blocking, ${summary.warning} warning, ${summary.pass} passed check(s).`);
    return {snapshot,summary};
  }

  async function exportSnapshot(){
    ensureAutomationIdle();
    if(!dialog)throw new Error('Ready report saving is unavailable in this build.');
    const current=latest();
    if(!current.snapshot)throw new Error('Run Ready once before saving a report.');
    const result=await dialog.showSaveDialog({title:'Save Ready report',defaultPath:`GoClassroom-Ready-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'GrantDesk Ready report',extensions:['json']}]});
    if(result.canceled||!result.filePath)return null;
    fs.writeFileSync(result.filePath,JSON.stringify(current.snapshot,null,2),'utf8');
    return result.filePath;
  }

  return {savedCourses,latest,scan,exportSnapshot};
}

module.exports={createReadyService};
