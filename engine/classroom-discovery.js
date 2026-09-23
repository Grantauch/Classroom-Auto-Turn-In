const {log,parseClassroomDueDate}=require('./lib');
const {parseClassroomIds,normalizeText}=require('./safety');
const {collectStrictTopicAssignmentsDom}=require('./dom-helpers');
const {assignmentDetailVisible,pollUntil}=require('./classroom-actions');

const TOPIC_WAIT_MS=20000;

// Collect small, visible pieces of due-date evidence from an assignment detail
// page. The Node-side reader below still validates every candidate with the
// conservative Classroom parser before the value can affect eligibility.
function collectAssignmentDueEvidenceDom(){
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const looksRelevant=v=>/\bNo due date\b|\bDue\s+(?:Today|Tomorrow|Yesterday|Sun(?:day)?|Mon(?:day)?|Tue(?:s|sday)?|Wed(?:nesday)?|Thu(?:r|rs|rsday)?|Fri(?:day)?|Sat(?:urday)?|Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|\d{1,2}[/\.\-]\d{1,2})\b/i.test(v);
  const out=[];
  for(const el of document.querySelectorAll('[aria-label],[title],[data-tooltip],time')){
    if(!visible(el))continue;
    const labelled=[el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-tooltip')];
    for(const raw of labelled){
      const text=clean(raw);if(!text||text.length>260||!looksRelevant(text))continue;out.push(text);
    }
    if(el.tagName==='TIME'&&labelled.some(raw=>/\bDue\b|\bNo due date\b/i.test(clean(raw)))){
      const text=clean(el.innerText||el.textContent);if(text&&text.length<=260&&looksRelevant(text))out.push(text);
    }
  }
  return [...new Set(out)].slice(0,40);
}

function localDateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

async function readAssignmentDueDate(page,{timeout=8000,now=new Date()}={}){
  let lastEvidence=[];
  const found=await pollUntil(async()=>{
    const evidence=await page.evaluate(collectAssignmentDueEvidenceDom).catch(()=>[]);
    lastEvidence=Array.isArray(evidence)?evidence:[];
    const recognized=[];
    for(const text of lastEvidence){
      const due=parseClassroomDueDate(text,now);
      if(due)recognized.push({kind:'date',key:localDateKey(due),dueText:text});
      else if(/\bNo due date\b/i.test(text))recognized.push({kind:'none',key:'NO_DUE_DATE',dueText:'No due date'});
    }
    const unique=new Map(recognized.map(x=>[`${x.kind}:${x.key}`,x]));
    if(unique.size>1)return {ok:false,ambiguous:true,dueText:'',source:'verified assignment detail page',evidence:lastEvidence.slice(0,12)};
    if(unique.size===1){const one=[...unique.values()][0];return {ok:true,ambiguous:false,dueText:one.dueText,source:'verified assignment detail page',date:one.kind==='date'?one.key:null,evidence:lastEvidence.slice(0,12)};}
    return null;
  },timeout,350);
  return found||{ok:false,ambiguous:false,dueText:'',source:'verified assignment detail page',evidence:lastEvidence.slice(0,12)};
}

// Classroom renders Classwork after the page load event, so wait for the
// selected topic to appear before deciding it is missing.
async function getStrictTopicRegion(page,cfg,{timeout=TOPIC_WAIT_MS}={}) {
  let last=null;
  const found=await pollUntil(async()=>{
    try{return {region:await findStrictTopicRegionOnce(page,cfg)};}
    catch(e){last=e;if(e.ambiguous)return {error:e};return null;}
  },timeout,500);
  if(found?.region) return found.region;
  throw found?.error||last||new Error(`Selected Classroom topic "${normalizeText(cfg.topicName)}" was not exposed as a topic region. Refusing to scan the rest of Classwork.`);
}

async function findStrictTopicRegionOnce(page,cfg) {
  const topicName=normalizeText(cfg.topicName);
  if(!topicName) throw Object.assign(new Error('No Classroom topic is configured.'),{ambiguous:true});
  const regions=page.locator('[role="region"][aria-label]');
  const matches=[];
  const n=Math.min(await regions.count().catch(()=>0),200);
  for(let i=0;i<n;i++){
    const r=regions.nth(i);
    const label=normalizeText(await r.getAttribute('aria-label').catch(()=>''));
    const name=normalizeText(label.replace(/^Topic\b\s*:?\s*/i,''));
    const wanted=topicName.toLowerCase();
    if(name.toLowerCase()===wanted||label.toLowerCase()===wanted) matches.push(r);
  }
  if(matches.length>1) throw Object.assign(new Error(`Classroom exposed more than one topic region named "${topicName}". Refusing an ambiguous match.`),{ambiguous:true});
  if(matches.length===1) return matches[0];
  const section=await markTopicSectionByHeading(page,topicName);
  if(section.ok){
    log(`Selected topic "${topicName}" was located by its heading (${section.detail}).`);
    return page.locator('[data-cati-topic-section="1"]').first();
  }
  throw Object.assign(new Error(`Selected Classroom topic "${topicName}" was not exposed as a topic region (${section.detail}). Refusing to scan the rest of Classwork.`),{ambiguous:/share this name/.test(section.detail)});
}

// Fallback when Classroom does not label topic sections as regions: find the
// one visible heading with the exact topic name and take the largest ancestor
// that holds no other heading of the same level and no list items placed
// before the heading (Classroom lists items without a topic first).
async function markTopicSectionByHeading(page,topicName){
  return await page.evaluate(name=>{
    document.querySelectorAll('[data-cati-topic-section]').forEach(el=>el.removeAttribute('data-cati-topic-section'));
    const clean=v=>String(v||'').replace(/\s+/g,' ').trim().toLowerCase();
    const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
    const levelOf=el=>{const m=/^H([1-6])$/.exec(el.tagName);if(m)return Number(m[1]);return Number(el.getAttribute('aria-level'))||2;};
    const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].filter(visible);
    const target=clean(name);
    const found=headings.filter(h=>clean(h.innerText||h.textContent)===target);
    const outer=found.filter(h=>!found.some(o=>o!==h&&o.contains(h)));
    if(outer.length!==1)return {ok:false,detail:outer.length?`${outer.length} headings share this name`:'no heading with this exact name'};
    const heading=outer[0],level=levelOf(heading);
    const peers=headings.filter(x=>x!==heading&&!x.contains(heading)&&!heading.contains(x)&&levelOf(x)===level);
    const itemSel='li,[role="listitem"],[data-stream-item-id]';
    const before=el=>[...el.querySelectorAll(itemSel)].some(it=>!it.contains(heading)&&(it.compareDocumentPosition(heading)&Node.DOCUMENT_POSITION_FOLLOWING));
    let section=null;
    for(let p=heading.parentElement;p&&p!==document.body&&p!==document.documentElement;p=p.parentElement){
      if(p.matches('main,[role="main"]'))break;
      if(peers.some(x=>p.contains(x)))break;
      if(before(p))break;
      section=p;
    }
    if(!section||!section.querySelector(itemSel))return {ok:false,detail:'the topic heading has no separate section'};
    section.setAttribute('data-cati-topic-section','1');
    return {ok:true,detail:`${heading.tagName.toLowerCase()} heading section`};
  },topicName).catch(e=>({ok:false,detail:`heading lookup failed: ${String(e?.message||e).slice(0,120)}`}));
}

async function expandStrictTopic(region) {
  let total=0;
  for(let round=0;round<10;round++){
    const candidates=[
      region.getByText(/^View more$/i),
      region.getByText(/^Show more$/i),
      region.getByRole('button',{name:/^(View|Show) more$/i})
    ];
    let clicked=0;
    for(const loc of candidates){
      const n=Math.min(await loc.count().catch(()=>0),30);
      for(let i=0;i<n;i++){
        const el=loc.nth(i);
        try{
          if(!(await el.isVisible({timeout:200}))) continue;
          await el.click({timeout:1200}); clicked++; total++;
          await new Promise(r=>setTimeout(r,180));
        }catch{/* best-effort fallback */}
      }
    }
    if(!clicked) break;
  }
  return total;
}

async function collectStrictTopicAssignments(region,regex) {
  return await region.evaluate(collectStrictTopicAssignmentsDom,{source:regex.source,flags:regex.flags});
}

async function markScopedWeekTitle(region,regex,week){
  const ok=await region.evaluate((root,{source,flags,week})=>{
    root.querySelectorAll('[data-cati-week-title]').forEach(el=>el.removeAttribute('data-cati-week-title'));
    const re=new RegExp(source,(flags||'i').replace(/g/g,''));
    const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
    const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
    const matches=[];
    for(const el of root.querySelectorAll('a,[role="link"],[role="button"],div,span')){
      if(!visible(el)) continue;
      const t=clean(el.innerText||el.textContent); if(!t||t.length>360) continue;
      const m=t.match(re); if(!m||Number(m[1])!==Number(week)) continue;
      matches.push({el,len:t.length});
    }
    matches.sort((a,b)=>a.len-b.len);
    if(!matches.length) return false;
    matches[0].el.setAttribute('data-cati-week-title','1'); return true;
  },{source:regex.source,flags:regex.flags,week}).catch(()=>false);
  return ok?region.locator('[data-cati-week-title="1"]').first():null;
}

async function openWeekAssignmentFromClasswork(page,item,classworkUrl,regex,cfg) {
  await page.goto(classworkUrl,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(900);
  const region=await getStrictTopicRegion(page,cfg);
  await expandStrictTopic(region);
  const title=await markScopedWeekTitle(region,regex,item.week);
  if(!title){log(`Week ${item.week}: title is no longer visible inside selected topic "${cfg.topicName}".`);return false;}
  await title.scrollIntoViewIfNeeded().catch(()=>{});

  // Navigate directly only when Classroom supplied a real assignment href.
  // Internal stream IDs are not converted into guessed URLs; without a real
  // link we click the already-verified card inside the selected topic instead.
  const derived=item.href||'';
  if(derived){
    try{
      await page.goto(derived,{waitUntil:'domcontentloaded',timeout:30000});
      if(await assignmentDetailVisible(page,12000)) return true;
    }catch{/* best-effort fallback */}
    await page.goto(classworkUrl,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
    await page.waitForTimeout(700);
  }

  const freshRegion=await getStrictTopicRegion(page,cfg);
  await expandStrictTopic(freshRegion);
  const freshTitle=await markScopedWeekTitle(freshRegion,regex,item.week);
  if(!freshTitle) return false;
  const before=page.url();
  try{
    await freshTitle.click({timeout:2500});
    if(await assignmentDetailVisible(page,page.url()!==before?12000:1500)) return true;
    if(page.url()!==before&&await assignmentDetailVisible(page,4000))return true;
  }catch{/* best-effort fallback */}

  // Classroom may replace the title node when expanding. Reacquire the card
  // from the selected topic on every poll, and use a real Playwright pointer
  // click: DOM element.click() misses controls driven by pointer events.
  const navigation=await pollUntil(async()=>{
    if(await assignmentDetailVisible(page,0))return {detail:true};
    const target=await freshRegion.evaluate(markWeekInstructionsDom,{
      source:regex.source,flags:regex.flags,week:item.week,streamItemId:item.streamItemId||''
    });
    return target.ok?target:null;
  },12000,300);
  if(navigation?.detail)return true;
  if(navigation?.ok){
    try{
      const action=freshRegion.locator('[data-cati-week-instructions="1"]');
      await action.click({timeout:10000});
      log(`Week ${item.week}: clicked ${navigation.label} inside its verified assignment card.`);
      if(await assignmentDetailVisible(page,15000))return true;
    }catch(e){log(`Week ${item.week}: instructions navigation failed: ${String(e?.message||e).split('\n')[0]}`);}
  }
  log(`Week ${item.week}: no verified detail page after expanding its card in the selected topic.`);
  return false;
}

// Self-contained DOM helper so the exact scoping rules can be regression tested.
// Never climb to the topic/list/page to borrow a neighboring card's action.
function markWeekInstructionsDom(root,{source,flags,week,streamItemId=''}){
  root.querySelectorAll('[data-cati-week-instructions]').forEach(el=>el.removeAttribute('data-cati-week-instructions'));
  const re=new RegExp(source,(flags||'i').replace(/[gy]/g,''));
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const nodes=[...root.querySelectorAll('a,button,[role="link"],[role="button"],h3,h4,div,span')];
  const titles=nodes.filter(el=>{
    if(!visible(el))return false;
    const text=clean(el.innerText||el.textContent);
    const m=text.length<=360&&text.match(re);
    return m&&Number(m[1])===Number(week);
  });
  // Wrapper text is not an independent title.
  const leaves=titles.filter(el=>!titles.some(other=>other!==el&&el.contains(other)));
  const cards=new Set();
  for(const title of leaves){
    let card=title.closest('li,[role="listitem"],article,[role="article"],[role="row"]');
    if(!card||card===root||!root.contains(card))card=title.closest('[data-stream-item-id]');
    if(!card||card===root||!root.contains(card))continue;
    // Some Classroom versions repeat the stream ID on nested wrappers. Take
    // the outer wrapper for that same ID, staying below the topic boundary.
    const id=card.getAttribute('data-stream-item-id')||title.closest('[data-stream-item-id]')?.getAttribute('data-stream-item-id')||'';
    if(streamItemId&&id&&streamItemId!==id)continue;
    if(card.matches('[data-stream-item-id]')){
      for(let p=card.parentElement;p&&p!==root;p=p.parentElement){
        if(p.matches('ol,ul,[role="list"],[role="region"]'))break;
        if(p.getAttribute('data-stream-item-id')===id)card=p;
      }
    }
    cards.add(card);
  }
  if(cards.size!==1)return {ok:false,reason:'assignment card missing or ambiguous'};
  const card=[...cards][0];
  // A malformed wrapper spanning several assignments is not a safe boundary.
  if([...card.querySelectorAll('li,[role="listitem"],article,[role="article"],[role="row"]')].length)return {ok:false,reason:'nested assignment cards'};
  if(nodes.some(el=>{
    if(!card.contains(el)||!visible(el))return false;
    const text=clean(el.innerText||el.textContent),m=text.length<=360&&text.match(re);
    return m&&Number(m[1])!==Number(week);
  }))return {ok:false,reason:'card contains another week'};
  const actionRe=/^(View assignment|View instructions|View details)$/i;
  const matches=[...card.querySelectorAll('a,button,[role="button"],[role="link"],span,div')].filter(el=>visible(el)&&actionRe.test(clean(el.innerText||el.textContent)||clean(el.getAttribute('aria-label'))));
  // Classroom's current Material Design control renders the visible label in
  // an aria-hidden span and places a separate, empty <a aria-label="View
  // instructions"> over it. Both are visible leaf nodes with the same name,
  // but only the anchor is actionable. Prefer one real interactive element;
  // keep the leaf-node fallback for older Classroom layouts whose click
  // handler lived on a plain div/span.
  const interactive=matches.filter(el=>el.matches('a[href],button,[role="button"],[role="link"]'));
  const interactiveLeaves=interactive.filter(el=>!interactive.some(other=>other!==el&&el.contains(other)));
  const fallbackLeaves=matches.filter(el=>!matches.some(other=>other!==el&&el.contains(other)));
  const actions=interactiveLeaves.length?interactiveLeaves:fallbackLeaves;
  if(actions.length!==1)return {ok:false,reason:'instructions missing or ambiguous'};
  actions[0].setAttribute('data-cati-week-instructions','1');
  return {ok:true,label:clean(actions[0].innerText||actions[0].textContent)||clean(actions[0].getAttribute('aria-label'))};
}

async function verifyAssignmentIdentity(page,item,cfg,regex){
  const configured=parseClassroomIds(cfg.courseUrl);
  const actual=parseClassroomIds(page.url());
  if(!configured.courseId) throw new Error('Configured Classroom URL does not expose a course ID.');
  if(!actual.courseId||actual.courseId!==configured.courseId) throw new Error(`Assignment detail course mismatch. Expected course ${configured.courseId}, got ${actual.courseId||'(none)'}.`);
  if(!actual.assignmentId) throw new Error('Opened page does not expose a Classroom assignment ID.');
  const expectedFromLink=parseClassroomIds(item.href||'').assignmentId;
  if(expectedFromLink&&expectedFromLink!==actual.assignmentId) throw new Error(`Assignment ID mismatch. Expected ${expectedFromLink}, got ${actual.assignmentId}.`);
  const readMatches=async()=>{
    const headings=await page.evaluate(()=>{
      const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
      return [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].filter(visible).map(el=>String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,100);
    }).catch(()=>[]);
    const out=[];
    for(const text of headings){const m=text.match(regex);if(m&&Number(m[1])===Number(item.week))out.push(text);}
    return out.length?out:null;
  };
  const matches=(await pollUntil(readMatches,8000,400))||[];
  if(!matches.length) throw new Error(`Assignment detail title did not verify as Week ${item.week} using the configured assignment pattern.`);
  matches.sort((a,b)=>a.length-b.length);
  return {courseId:actual.courseId,assignmentId:actual.assignmentId,title:matches[0],week:Number(item.week)};
}

async function getAssignmentLinks(page, regex, cfg) {
  const region=await getStrictTopicRegion(page,cfg);
  const expanded=await expandStrictTopic(region);
  if(expanded) log(`Expanded ${expanded} View more/Show more control(s) inside selected topic "${cfg.topicName}".`);
  const rows=(await pollUntil(async()=>{const r=await collectStrictTopicAssignments(region,regex);return r.length?r:null;},6000,500))||[];
  if(!rows.length) throw new Error(`No matching lesson-plan assignments were found inside selected topic "${cfg.topicName}".`);

  const byWeek=new Map();
  for(const row of rows){if(!byWeek.has(row.week))byWeek.set(row.week,[]);byWeek.get(row.week).push(row);}
  const out=[];
  for(const [week,items] of [...byWeek.entries()].sort((a,b)=>a[0]-b[0])){
    const distinct=new Map(items.map(x=>[x.rootKey||x.streamItemId||x.href||`${x.title}|${x.cardText}`,x]));
    if(distinct.size>1){
      throw new Error(`More than one matching Week ${week} assignment exists inside selected topic "${cfg.topicName}". Resolve the duplicate before automation can continue.`);
    }
    const one=[...distinct.values()][0];
    const best=one;
    const href=best.href||'';
    out.push({...best,href,assignmentId:parseClassroomIds(href).assignmentId});
  }
  return out;
}

module.exports={getStrictTopicRegion,expandStrictTopic,collectStrictTopicAssignments,markScopedWeekTitle,markWeekInstructionsDom,collectAssignmentDueEvidenceDom,readAssignmentDueDate,openWeekAssignmentFromClasswork,verifyAssignmentIdentity,getAssignmentLinks};
