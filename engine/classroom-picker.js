function classroomCourseId(value){
  try{
    const url=new URL(String(value||''),'https://classroom.google.com');
    if(url.hostname.toLowerCase()!=='classroom.google.com')return null;
    const match=url.pathname.match(/^\/(?:u\/\d+\/)?(?:c|w)\/([^/?#]+)/i);
    return match?match[1]:null;
  }catch{return null}
}

function cleanCourseName(value){
  return String(value||'')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/\s*[-–—]\s*Google Classroom.*$/i,'')
    .replace(/^(?:Your work in|Classwork for|People in|Grades for|Stream for)\s+/i,'')
    .trim();
}

// Navigation and tab labels that link back to the course but are not its name.
const NOT_A_COURSE_NAME=/^(?:Classroom|Google Classroom|Home|Stream|Classwork|People|Grades|Marks|Your work|To-do|To do|To review|To-review|Calendar|Settings|Archived classes|Enrolled|Teaching|Main menu|Class drive folder|Google Calendar)$/i;

function classroomDisplayName(payload={}){
  const candidates=[payload.courseName,payload.title,payload.heading]
    .map(cleanCourseName)
    .filter(name=>name&&!NOT_A_COURSE_NAME.test(name));
  return candidates[0]||'Selected Classroom';
}

function installClassroomPicker(options={}){
  if(location.hostname.toLowerCase()!=='classroom.google.com')return false;
  const match=location.pathname.match(/^\/(?:u\/\d+\/)?(?:c|w)\/([^/?#]+)/i);
  let host=document.getElementById('cati-classroom-picker');
  if(!match){if(host)host.remove();return false}
  if(host)return true;

  const courseId=match[1];
  host=document.createElement('div');
  host.id='cati-classroom-picker';
  host.style.cssText='position:fixed;right:24px;bottom:24px;z-index:2147483647;background:#111827;color:white;padding:14px 16px;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.35);font:13px Segoe UI,Arial,sans-serif;max-width:330px';
  const text=document.createElement('div');
  const purpose=String(options.purpose||'lesson-plans');
  text.textContent=purpose==='grading'
    ? 'GoClassroom: if this is one of the classes you grade, add it to your grading list.'
    : 'GoClassroom: if this is the Classroom that receives your lesson plans, choose it here.';
  text.style.cssText='margin-bottom:10px;line-height:1.35;color:#dbe4f0';
  const btn=document.createElement('button');
  btn.type='button';
  btn.textContent=purpose==='grading'?'Add grading Classroom':'Use this Classroom';
  btn.style.cssText='flex:1;border:0;border-radius:9px;padding:10px 12px;background:#3468e8;color:white;font-weight:700;cursor:pointer';
  btn.addEventListener('click',async event=>{
    event.preventDefault();
    event.stopPropagation();
    if(btn.dataset.busy==='1')return;
    btn.dataset.busy='1';
    btn.disabled=true;
    btn.textContent='Choosing…';
    try{
      const notName=/^(?:Classroom|Google Classroom|Home|Stream|Classwork|People|Grades|Marks|Your work|To-do|To do|To review|To-review|Calendar|Settings|Archived classes|Enrolled|Teaching|Main menu|Class drive folder|Google Calendar)$/i;
      const courseName=[...document.querySelectorAll('a[href]')].map(anchor=>{
        try{
          const url=new URL(anchor.href,location.href);
          const found=url.hostname.toLowerCase()==='classroom.google.com'&&url.pathname.match(/^\/(?:u\/\d+\/)?c\/([^/?#]+)\/?$/i);
          const label=String(anchor.textContent||'').replace(/\s+/g,' ').trim();
          return found&&found[1]===courseId&&label.length<=160?label:'';
        }catch{return ''}
      }).find(label=>label&&!notName.test(label))||'';
      if(typeof window.catiPickClassroom!=='function')throw new Error('The Classroom picker is not connected to the app.');
      await window.catiPickClassroom({url:location.href,title:document.title,heading:(document.querySelector('h1')?.innerText||''),courseName});
      btn.textContent='Classroom chosen';
    }catch{
      btn.dataset.busy='0';
      btn.disabled=false;
      btn.textContent='Try again';
      text.textContent='The app could not receive this choice. Close this browser window, return to Auto Turn-In, and choose the Classroom again.';
    }
  });
  const cancel=document.createElement('button');
  cancel.type='button';
  cancel.textContent='Cancel';
  cancel.style.cssText='border:1px solid #60708a;border-radius:9px;padding:10px 12px;background:#253149;color:white;font-weight:700;cursor:pointer';
  cancel.addEventListener('click',async event=>{
    event.preventDefault();
    event.stopPropagation();
    cancel.disabled=true;
    cancel.textContent='Closing…';
    try{await window.catiCancelClassroomPicker()}catch{cancel.disabled=false;cancel.textContent='Cancel'}
  });
  const actions=document.createElement('div');
  actions.style.cssText='display:flex;gap:8px';
  actions.append(btn,cancel);
  host.append(text,actions);
  document.body.appendChild(host);
  return true;
}

async function createClassroomPickerBridge(context,onPick,{onCancel=()=>{},purpose='lesson-plans'}={}){
  const pageBindings=new WeakMap();
  let disposed=false;
  const bind=async page=>{
    if(disposed||!page||page.isClosed())return;
    if(pageBindings.has(page))return pageBindings.get(page);
    const binding=(async()=>{
      await page.exposeFunction('catiPickClassroom',onPick);
      await page.exposeFunction('catiCancelClassroomPicker',onCancel);
    })();
    pageBindings.set(page,binding);
    try{await binding}catch(error){pageBindings.delete(page);throw error}
  };
  const onPage=page=>{bind(page).catch(()=>{})};
  context.on('page',onPage);
  for(const page of context.pages())await bind(page);
  return {
    async inject(){
      let visible=0;
      for(const page of context.pages()){
        if(page.isClosed())continue;
        try{
          await bind(page);
          if(await page.evaluate(installClassroomPicker,{purpose}))visible++;
        }catch(error){
          if(classroomCourseId(page.url()))throw error;
        }
      }
      return visible;
    },
    dispose(){
      disposed=true;
      context.off('page',onPage);
    }
  };
}

module.exports={classroomCourseId,classroomDisplayName,createClassroomPickerBridge};
