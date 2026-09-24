// Opening Google Classroom's home page for a teacher, including a brand-new
// computer whose GoClassroom browser has never signed in to Google.

const CLASSROOM_HOME='https://classroom.google.com/h';
const SIGN_IN_WAIT_MS=5*60*1000;
const SIGN_IN_POLL_MS=1500;
const REOPEN_HOME_MS=30*1000;

function hostOf(url){try{return new URL(String(url||'')).hostname.toLowerCase()}catch{return ''}}

/**
 * Open Classroom home and wait until it is really showing. When Google asks
 * the teacher to sign in, say so and keep waiting in the visible window
 * instead of failing, then continue on its own once Classroom opens.
 */
async function openClassroomHome(page,{emit=()=>{},where='Google Classroom',timeoutMs=SIGN_IN_WAIT_MS,pollMs=SIGN_IN_POLL_MS}={}){
  await page.goto(CLASSROOM_HOME,{waitUntil:'domcontentloaded',timeout:45000});
  const deadline=Date.now()+Math.max(1000,Number(timeoutMs)||SIGN_IN_WAIT_MS);
  let askedToSignIn=false,lastReopen=Date.now();
  while(true){
    if(typeof page.isClosed==='function'&&page.isClosed()){
      throw new Error(`The Google window was closed before sign-in finished. Try ${where} again and sign in to your school Google account.`);
    }
    const host=hostOf(page.url());
    if(host==='classroom.google.com'){
      const ready=await page.locator('main,[role="main"]').first().isVisible().catch(()=>false);
      if(ready)return;
    }else{
      if(!askedToSignIn){
        askedToSignIn=true;
        emit('status',{message:'Sign in to your school Google account in the browser window that just opened. GoClassroom will keep going by itself.'});
      }
      // Some sign-in paths end on a Google page other than Classroom.
      if(host!=='accounts.google.com'&&Date.now()-lastReopen>REOPEN_HOME_MS){
        lastReopen=Date.now();
        await page.goto(CLASSROOM_HOME,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
      }
    }
    if(Date.now()>deadline){
      const err=new Error(`Google sign-in did not finish in time for ${where}. Try again and sign in to your school Google account in the window that opens.`);
      err.code='AUTH_REQUIRED';err.retryable=false;throw err;
    }
    await page.waitForTimeout(pollMs);
  }
}

/** Open the Classroom side menu and its Teaching list so their class links are on the page. Best effort. */
async function revealTeachingMenu(page){
  const menu=page.locator('button[aria-label="Main menu"],[role="button"][aria-label="Main menu"]').first();
  if(await menu.isVisible().catch(()=>false)){
    const expanded=await menu.getAttribute('aria-expanded').catch(()=>null);
    if(expanded!=='true')await menu.click({timeout:3000}).catch(()=>{});
    await page.waitForTimeout(600);
  }
  const teaching=page.locator('[aria-expanded="false"]').filter({hasText:/^\s*Teaching\s*$/}).first();
  if(await teaching.isVisible().catch(()=>false)){
    await teaching.click({timeout:3000}).catch(()=>{});
    await page.waitForTimeout(600);
  }
}

/**
 * Every Classroom link on the page, whether taught or enrolled. Used only when
 * the "Teaching" heading cannot be found; each class is then confirmed on its
 * People page before it is used.
 */
function collectAllClassroomLinksDom(){
  const courseHref=/^\/(?:u\/\d+\/)?c\/([^/?#]+)\/?$/i;
  const notACourseName=/^(?:Classroom|Google Classroom|Home|Stream|Classwork|People|Grades|Marks|Your work|To-do|To do|To review|To-review|Calendar|Settings|Archived classes|Enrolled|Teaching|Main menu|Class drive folder|Google Calendar)$/i;
  const found=[],seen=new Set();
  for(const element of document.querySelectorAll('a[href]')){
    let match=null;try{match=new URL(element.getAttribute('href')||'',location.href).pathname.match(courseHref)}catch{match=null}
    if(!match||seen.has(match[1]))continue;
    // Class cards start with a one-letter avatar; the class name is the first real line.
    const lines=String(element.innerText||element.textContent||'').split('\n').map(part=>part.trim()).filter(Boolean);
    const label=lines.find(line=>line.length>1)||lines[0]||'';
    const clean=label.replace(/\s+/g,' ').trim().replace(/^([A-Za-z0-9])\s+(?=\1)/i,'');
    if(!clean||notACourseName.test(clean)||clean.length>160)continue;
    seen.add(match[1]);found.push({courseId:match[1],courseDisplayName:clean});
  }
  return found;
}

/** Controls only a class's teacher sees on its People page. */
const TEACHER_ONLY_PEOPLE_CONTROLS='[aria-label^="Invite students" i],[aria-label^="Invite teachers" i],button[aria-label^="Options for student "]';

async function peoplePageShowsTeacher(page){
  return (await page.locator(TEACHER_ONLY_PEOPLE_CONTROLS).count().catch(()=>0))>0;
}

module.exports={CLASSROOM_HOME,openClassroomHome,revealTeachingMenu,collectAllClassroomLinksDom,peoplePageShowsTeacher,TEACHER_ONLY_PEOPLE_CONTROLS};
