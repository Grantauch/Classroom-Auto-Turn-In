const MAX_ROWS=5000;
const MAX_EXPORT_CHARS=4_000_000;

function sheetIdentity(value){
  let url;try{url=new URL(String(value||'').trim())}catch{throw new Error('Paste the link to your private Turn In sheet.');}
  const match=url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||url.username||url.password||!match)throw new Error('Use a Google Sheets link for your private Turn In sheet.');
  return {id:match[1],url:`https://docs.google.com/spreadsheets/d/${match[1]}/edit`};
}

function sourceScope(value){
  if(!value||value.kind==='classroom')return null;
  if(value.kind!=='storyhub')throw new Error('Choose Classroom work or StoryHub turn ins.');
  const spreadsheetUrl=sheetIdentity(value.spreadsheetUrl).url;
  const hub=String(value.hub||'').trim(),classPeriod=String(value.classPeriod||'').trim();
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(hub)||!classPeriod||classPeriod.length>200)throw new Error('Read your Turn In sheet and choose the hub and period for this assignment.');
  return {kind:'storyhub',spreadsheetUrl,hub,classPeriod};
}

// Quoted multiline answers and JSON are preserved exactly. Never grade a truncated export.
function parseCsv(raw){
  const text=String(raw||'').replace(/^\uFEFF/,'');
  if(text.length>MAX_EXPORT_CHARS)throw new Error('The Turn In sheet is too large to read safely. Use a smaller private sheet.');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const finishCell=()=>{row.push(cell);cell='';closed=false};
  const finishRow=()=>{finishCell();rows.push(row);row=[];if(rows.length>MAX_ROWS+1)throw new Error('The Turn In sheet has too many rows to read completely. Use a smaller private sheet.');};
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){if(char==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=char;continue}
    if(char==='"'){if(cell||closed)throw new Error('The Turn In export contains an unreadable quoted field.');quoted=true;continue}
    if(char===','){finishCell();continue}
    if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;finishRow();continue}
    if(closed)throw new Error('The Turn In export contains an unreadable field.');
    cell+=char;
  }
  if(quoted)throw new Error('The Turn In export ended before all answers could be read.');
  if(cell||row.length||closed)finishRow();
  return rows;
}

function submissionsFromCsv(csv){
  const rows=parseCsv(csv),headers=rows.shift()||[];
  const required=['Student Email','Class / Period','Hub','Hub Title','Submission ID','Data'];
  const columns={};for(const header of required){if(headers.filter(h=>h===header).length!==1)throw new Error('Choose the Turn In workbook with its original Turn Ins tab and column headings.');columns[header]=headers.indexOf(header)}
  return rows.filter(row=>row.some(cell=>cell)).map((row,index)=>{
    const email=String(row[columns['Student Email']]||'').trim().toLowerCase(),hub=row[columns.Hub],classPeriod=row[columns['Class / Period']];
    let data=null;try{data=JSON.parse(row[columns.Data])}catch{/* This latest row remains a review item, never a fallback to older work. */}
    const valid=Boolean(data&&data.turnedIn===true&&data.hub===hub&&Number.isFinite(Date.parse(data.savedAt))&&Array.isArray(data.answers)&&data.answers.length<=80&&data.answers.every(a=>a&&typeof a.k==='string'&&a.k.length>0&&a.k.length<=120&&typeof a.q==='string'&&typeof a.a==='string'&&a.a.length<=6000&&a.q.length<=400)&&new Set(data.answers.map(a=>a.k)).size===data.answers.length&&JSON.stringify(data.answers).length<=45000);
    return {email,hub,classPeriod,title:row[columns['Hub Title']],submissionId:row[columns['Submission ID']],data:valid?data:null,rowNumber:index+2};
  });
}

function catalog(submissions){
  const groups=new Map();
  for(const row of submissions){if(!row.hub||!row.classPeriod)continue;const key=JSON.stringify([row.hub,row.classPeriod]);if(!groups.has(key))groups.set(key,{hub:row.hub,classPeriod:row.classPeriod,title:row.title||row.hub,count:0});groups.get(key).count++}
  return [...groups.values()].sort((a,b)=>a.classPeriod.localeCompare(b.classPeriod)||a.title.localeCompare(b.title));
}

function matchSubmissions(submissions,scope,roster){
  if(!roster||!roster.studentsHeadingFound||!roster.scrollComplete)throw new Error('GoClassroom could not verify the complete Classroom roster. No hub work was matched or graded.');
  const latest=new Map();
  for(const row of submissions){
    if(row.hub!==scope.hub||row.classPeriod!==scope.classPeriod)continue;
    const prior=latest.get(row.email);
    // Sheet sorting must not change which work is graded. An unreadable row
    // suppresses grading rather than allowing an older answer to stand in.
    if(!prior||!row.data||(prior.data&&Date.parse(row.data.savedAt)>=Date.parse(prior.data.savedAt)))latest.set(row.email,row);
  }
  const byStudent=new Map(),ambiguous=new Set(),emails=new Set();
  for(const person of roster.students||[]){
    const email=String(person.email||'').trim().toLowerCase(),id=String(person.sourceStudentId||'');
    if(!email||!id)continue;
    if(emails.has(email)||byStudent.has(id)){ambiguous.add(id);for(const [otherId,other] of byStudent)if(other.email===email)ambiguous.add(otherId)}
    emails.add(email);byStudent.set(id,{email,submission:latest.get(email)||null});
  }
  for(const id of ambiguous)byStudent.delete(id);
  const verifiedEmails=new Set([...byStudent.values()].map(item=>item.email));
  byStudent.unmatched=[...latest.values()].filter(row=>!verifiedEmails.has(row.email)).map(row=>({studentEmail:row.email,submissionId:row.submissionId,reason:'This hub turn in has no unambiguous verified email match in the selected Classroom. Review the class and period mapping.'}));
  return byStudent;
}

function hubEvidence(submission){
  if(!submission?.data)throw new Error('The newest hub submission could not be read completely. Review it in the Turn In sheet.');
  return submission.data.answers.map((a,i)=>`${i+1}. ${a.q||a.k}\n${a.a.trim()?a.a:'(blank)'}`).join('\n\n');
}

async function readTurnIns(context,spreadsheetUrl){
  const {id}=sheetIdentity(spreadsheetUrl);
  const url=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Turn%20Ins&headers=1&tq=${encodeURIComponent(`select * limit ${MAX_ROWS+2}`)}`;
  const response=await context.request.get(url,{timeout:30000,failOnStatusCode:false});
  const host=new URL(response.url()).hostname,headers=response.headers(),type=String(headers['content-type']||'').toLowerCase();
  if(!response.ok()||host!=='docs.google.com'||!/^text\/(csv|plain)\b/.test(type))throw new Error('GoClassroom could not read the private Turn In sheet. Sign into Google with the teacher account that owns it. Keep the sheet private.');
  if(Number(headers['content-length'])>MAX_EXPORT_CHARS)throw new Error('The Turn In sheet is too large to read safely.');
  return submissionsFromCsv(await response.text());
}

module.exports={sheetIdentity,sourceScope,parseCsv,submissionsFromCsv,catalog,matchSubmissions,hubEvidence,readTurnIns};
