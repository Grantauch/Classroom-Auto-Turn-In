const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const root=path.join(__dirname,'..');
const {assignmentChecks,buildReadySnapshot,summarizeReadySnapshot,validateReadySnapshot}=require('../engine/ready-snapshot');

function checks(overrides={}){
  return assignmentChecks({
    courseName:'US History',
    assignmentTitle:'Industrialization Reading',
    assignmentText:'Read the attached article and answer the questions.',
    evidence:{due:{state:'due',display:'Due Sep 22',candidates:['Due Sep 22']},links:[{host:'docs.google.com',label:'Reading'}]},
    ...overrides
  });
}

{
  const result=checks();
  assert.equal(result.find(x=>x.label==='Due date is clear').status,'pass');
  assert.equal(result.find(x=>x.label==='Assignment links are present').status,'pass');
}
{
  const result=checks({evidence:{due:{state:'unknown',display:'',candidates:[]},links:[]}});
  assert.equal(result.find(x=>x.label==='Due date needs attention').status,'block');
  assert.equal(result.find(x=>x.label==='Possible missing resource').status,'warning');
}
{
  const result=checks({assignmentText:'',assignmentTextTruncated:false,evidence:{due:{state:'none',display:'No due date',candidates:[]},links:[]}});
  assert.equal(result.find(x=>x.label==='Due date is clear').status,'pass');
  assert.equal(result.find(x=>x.label==='Directions need a look').status,'warning');
}
{
  const courseChecks=checks();
  const snapshot=buildReadySnapshot({
    sourceVersion:'v0.9.22',
    courses:[{courseName:'US History',windowLabel:'current Classwork',checks:courseChecks}]
  });
  assert.equal(validateReadySnapshot(snapshot),snapshot);
  assert.equal(summarizeReadySnapshot(snapshot).status,'READY');
}
{
  const courseChecks=checks({evidence:{due:{state:'ambiguous',display:'',candidates:['Due Sep 22','Due Sep 23']},links:[]}});
  const snapshot=buildReadySnapshot({sourceVersion:'v0.9.22',courses:[{courseName:'US History',checks:courseChecks}]});
  assert.equal(summarizeReadySnapshot(snapshot).status,'BLOCKED');
}
{
  const bad=buildReadySnapshot({sourceVersion:'v0.9.22',courses:[{courseName:'US History',checks:checks()}]});
  bad.courses[0].checks[1].id=bad.courses[0].checks[0].id;
  assert.throws(()=>validateReadySnapshot(bad),/duplicate check IDs/);
}


{
  const source=fs.readFileSync(path.join(root,'engine/ready-scan.js'),'utf8');
  const service=fs.readFileSync(path.join(root,'main-services/ready-service.js'),'utf8');
  assert.equal(source.includes('.click('),false,'Ready scanner must remain read-only and contain no click path');
  for(const forbidden of ['grading-classroom-write','submitAssignment','attachLink','Turn in','Return']) {
    assert.equal(source.includes(forbidden),false,`Ready scanner must not import or implement consequential action: ${forbidden}`);
  }
  assert.match(service,/writeJson\('ready-latest\.json'/,'Ready service may persist only the sanitized Ready report');
}
{
  const snapshot=buildReadySnapshot({
    sourceVersion:'v0.9.22',
    courses:[{courseName:'US History',checks:checks()}]
  });
  const serialized=JSON.stringify(snapshot);
  for(const forbidden of ['courseId','assignmentId','studentId','studentName','studentWork','grade','privateUrl','pin']) {
    assert.equal(serialized.includes(forbidden),false,`Ready snapshot leaked forbidden field name: ${forbidden}`);
  }
}

console.log('Ready scanner contract: PASS — sanitized snapshot, due-date fail-closed rules, directions/resource warnings, and overall status verified.');

const root=path.join(__dirname,'..');

