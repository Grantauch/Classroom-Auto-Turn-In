'use strict';
// Offline Google Classroom / Drive / Docs / Accounts simulator used only by the
// end-to-end release gate. It is never packaged into the teacher installer.
//
// The simulator answers requests that Playwright routes away from the real
// Google hosts. All state lives in one JSON file so several engine processes
// (Drive scan, Safety Check, live run) observe the same Classroom state, and so
// the test can inspect exactly which mutations were attempted.
const fs = require('fs');

function readState(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeState(file, state) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}
function mutate(file, fn) { const s = readState(file); const out = fn(s); writeState(file, s); return out; }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function dueLabel(item, state, { detail = false } = {}) {
  if (!detail && state.listHidesDueDates) return state.listDueFallback || '';
  if (detail && state.detailHidesDueDates) return state.detailDueFallback || '';
  if (item.dueOffsetDays === null || item.dueOffsetDays === undefined) return 'No due date';
  if (state.listShowsStatusInsteadOfDue && !detail && ['turned_in', 'done_late'].includes(item.status)) return item.status === 'done_late' ? 'Done late' : 'Turned in';
  const today = dayStart(new Date());
  const due = new Date(today); due.setDate(due.getDate() + Number(item.dueOffsetDays));
  const time = state.dueWithTime || detail ? ', 11:59 PM' : '';
  if (detail && state.numericDetailDueDates) return `Due ${due.getMonth() + 1}/${due.getDate()}/${due.getFullYear()}${time}`;
  const word = { 0: 'Today', 1: 'Tomorrow', '-1': 'Yesterday' }[String(item.dueOffsetDays)];
  if (state.weekdayLabels && item.dueOffsetDays >= 2 && item.dueOffsetDays <= 6) return `Due ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][due.getDay()]}${time}`;
  if (word && !state.dueAlwaysMonthDay) return `Due ${state.lowercaseRelative ? word.toLowerCase() : word}${time}`;
  const year = due.getFullYear() !== today.getFullYear() ? `, ${due.getFullYear()}` : '';
  return `Due ${MONTHS[due.getMonth()]} ${due.getDate()}${year}${time}`;
}

function fileFor(state, id) { return (state.drive.files || []).find(f => f.id === id) || (state.otherDocs || []).find(f => f.id === id) || null; }
function docUrl(file) {
  if (!file) return '';
  if (file.kind === 'docx') return `https://docs.google.com/document/d/${file.id}/edit?usp=drive_web&ouid=100&rtpof=true&sd=true`;
  if (file.kind === 'pdf') return `https://drive.google.com/file/d/${file.id}/view?usp=drive_web`;
  return `https://docs.google.com/document/d/${file.id}/edit?usp=drive_web`;
}
function fileIdFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/d\/([^/?#]+)/); if (m) return m[1];
    return u.searchParams.get('id') || '';
  } catch { return ''; }
}

function allItems(state) {
  const out = [];
  for (const t of state.topics) for (const it of t.items) out.push({ topic: t, item: it });
  for (const it of state.noTopicItems || []) out.push({ topic: null, item: it });
  return out;
}
function findItem(state, id) { return allItems(state).find(x => x.item.id === id) || null; }

const BASE_CSS = `
*{box-sizing:border-box} body{margin:0;font:14px Arial,sans-serif;color:#202124}
header{height:64px;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:24px;padding:0 16px}
header nav a{margin-right:18px;color:#3c4043;text-decoration:none;padding:20px 4px}
main{padding:16px 24px}
.topic{margin:18px 0;border-bottom:1px solid #1967d2;padding-bottom:6px}
.topic h2{font-size:28px;color:#1967d2;font-weight:400;margin:8px 0}
ol{list-style:none;margin:0;padding:0}
.item{border-bottom:1px solid #e0e0e0;min-height:56px}
.item-head{display:flex;align-items:center;gap:12px;height:56px;cursor:pointer;padding:0 8px}
.item-head .title{flex:1}
.item-body{padding:8px 48px 16px}
.cols{display:flex;gap:24px;align-items:flex-start}
.main-col{flex:1;min-width:400px}
.side-col{width:320px}
.card{border:1px solid #dadce0;border-radius:8px;padding:16px;margin-bottom:16px}
.card-hdr{display:flex;justify-content:space-between;align-items:center}
.card-hdr h2{font-size:22px;font-weight:400;margin:0}
.att{display:flex;align-items:center;border:1px solid #dadce0;border-radius:8px;margin:8px 0;height:64px;padding:0 8px}
.att a{flex:1;color:#202124;text-decoration:none}
button,.btn{display:block;width:100%;margin:8px 0;height:36px;border-radius:4px;border:1px solid #dadce0;background:#fff;cursor:pointer;font:14px Arial}
.primary{background:#1967d2;color:#fff;border:0}
.icon-btn{width:36px;margin:0}
[role=menu]{position:fixed;top:220px;right:40px;background:#fff;box-shadow:0 2px 8px #0005;width:220px;padding:8px 0;z-index:5}
[role=menuitem]{height:40px;line-height:40px;padding:0 16px;cursor:pointer}
[role=dialog]{position:fixed;top:120px;left:50%;transform:translateX(-50%);background:#fff;box-shadow:0 4px 16px #0006;width:480px;padding:24px;z-index:10}
.scrim{position:fixed;inset:0;background:#0006;z-index:9}
[hidden]{display:none!important}
.grid{height:260px;overflow-y:auto;border:1px solid #ddd;position:relative}
.row{display:flex;height:48px;align-items:center;border-bottom:1px solid #eee;padding:0 12px}
.row .name{flex:1}
`;

function page(title, body, script = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}</style></head><body>${body}<script>${script}</script></body></html>`;
}

function classroomHeader(state, active) {
  const c = state.course;
  return `<header><div role="heading" aria-level="1" style="font-size:22px">${esc(c.name)}</div><nav aria-label="Class navigation">
<a href="/c/${c.id}" ${active === 'stream' ? 'aria-current="page"' : ''}>Stream</a>
<a href="/w/${c.id}/t/all" ${active === 'classwork' ? 'aria-current="page"' : ''}>Classwork</a>
<a href="/r/${c.id}/sort-last-name">People</a></nav>
<div style="margin-left:auto">${esc(state.account.name)}</div></header>`;
}

function renderStream(state) {
  const c = state.course;
  const body = `${classroomHeader(state, 'stream')}<main role="main"><div class="card"><h1>${esc(c.name)}</h1><div>${esc(c.section || '')}</div></div>
<div class="card"><div>Upcoming</div><div>Week plans are due Fridays.</div></div></main>`;
  return page(`${c.name} - Google Classroom`, `<div id="app"></div>`, `setTimeout(()=>{document.getElementById('app').innerHTML=${JSON.stringify(body)};},${Number(state.renderDelayMs) || 0});`);
}

function itemHtml(state, item) {
  const c = state.course;
  const href = `/c/${c.id}/a/${item.id}/details`;
  const status = { assigned: 'Assigned', turned_in: 'Turned in', done_late: 'Done late', missing: 'Missing' }[item.status] || 'Assigned';
  const titleHtml = state.itemLinkVariant === 'title-link'
    ? `<a class="title" href="${href}">${esc(item.title)}</a>`
    : `<span class="title">${esc(item.title)}</span>`;
  return `<li class="item" role="listitem" ${state.noStreamItemIds ? '' : `data-stream-item-id="${esc(item.id)}"`}>
<div class="item-head" role="button" aria-expanded="false" tabindex="0" data-item="${esc(item.id)}">
<span aria-hidden="true">&#128196;</span>${titleHtml}<span class="due">${esc(dueLabel(item, state))}</span></div>
<div class="item-body" hidden><div>Posted Sep 1</div><div>${esc(status)}</div><div>Please attach this week's plan.</div>
<div class="instructions-control" style="position:relative;width:160px;height:32px"><span aria-hidden="true">View instructions</span><a aria-label="View instructions" href="${href}" style="position:absolute;inset:0"></a></div></div></li>`;
}

function renderClasswork(state) {
  const c = state.course;
  const sections = state.topics.map(t => {
    const list = `<ol role="list">${t.items.map(it => itemHtml(state, it)).join('')}</ol>`;
    const heading = `<h2>${esc(t.name)}</h2>`;
    if (state.classworkVariant === 'heading-only') return `<div class="topic" data-topic-id="${esc(t.id)}">${heading}${list}</div>`;
    const label = state.classworkVariant === 'region-plain' ? t.name : `Topic ${t.name}`;
    return `<div class="topic" role="region" aria-label="${esc(label)}">${heading}${list}</div>`;
  }).join('');
  const loose = (state.noTopicItems || []).length ? `<ol role="list">${state.noTopicItems.map(it => itemHtml(state, it)).join('')}</ol>` : '';
  const body = `${classroomHeader(state, 'classwork')}<main role="main"><div><a href="/a/not-turned-in/all">View your work</a></div>${loose}${sections}</main>`;
  const script = `setTimeout(()=>{document.getElementById('app').innerHTML=${JSON.stringify(body)};
document.querySelectorAll('.item-head').forEach(h=>h.addEventListener('click',ev=>{
  if(ev.target.closest('a'))return;
  const body=h.parentElement.querySelector('.item-body');const open=body.hasAttribute('hidden');
  document.querySelectorAll('.item-body').forEach(b=>b.setAttribute('hidden',''));
  document.querySelectorAll('.item-head').forEach(x=>x.setAttribute('aria-expanded','false'));
  if(open){body.removeAttribute('hidden');h.setAttribute('aria-expanded','true');}
}));},${Number(state.renderDelayMs) || 0});`;
  return page(`Classwork for ${c.name}`, `<div id="app"></div>`, script);
}

function yourWorkHtml(state, item) {
  const done = ['turned_in', 'done_late'].includes(item.status);
  const status = { assigned: 'Assigned', turned_in: 'Turned in', done_late: 'Done late', missing: 'Missing' }[item.status] || 'Assigned';
  const atts = (item.attachments || []).map(a => {
    const f = fileFor(state, a.fileId) || { id: a.fileId, name: a.title || 'Untitled', kind: 'gdoc' };
    const idAttr = state.attachmentIdAttr ? ` data-file-id="${esc(f.id)}"` : '';
    const href = a.externalUrl || docUrl(f);
    const name = a.externalUrl ? a.title || a.externalUrl : f.name;
    return `<div class="att"${idAttr}><a href="${esc(href)}" target="_blank" rel="noopener"><div>${esc(name)}</div><div style="color:#5f6368">${a.externalUrl ? 'Link' : 'Google Docs'}</div></a>${done ? '' : `<button class="icon-btn" aria-label="Remove attachment ${esc(name)}" data-remove="${esc(a.fileId || a.externalUrl)}">&#215;</button>`}</div>`;
  }).join('');
  const hasAtt = (item.attachments || []).length > 0;
  const action = done ? '<button class="unsubmit">Unsubmit</button>'
    : `${state.addAsDivButton ? '<div role="button" tabindex="0" class="btn add" aria-haspopup="menu">+ Add or create</div>' : '<button class="add" aria-haspopup="menu">+ Add or create</button>'}<button class="primary submit">${hasAtt ? 'Turn in' : 'Mark as done'}</button>`;
  return `<div class="card-hdr"><h2>Your work</h2><div class="status">${esc(status)}</div></div><div class="att-list">${atts}</div>${action}`;
}

function renderDetails(state, item) {
  const c = state.course;
  const materials = (item.materials || []).map(m => {
    const f = fileFor(state, m.fileId) || { id: m.fileId, name: m.title, kind: 'gdoc' };
    return `<div class="att"><a href="${esc(docUrl(f))}">${esc(f.name)}</a></div>`;
  }).join('');
  const privateLink = state.privateCommentLink ? `<div><a href="https://example.org/meeting-notes">https://example.org/meeting-notes</a></div>` : '';
  const body = `${classroomHeader(state, 'classwork')}<div hidden><div>Your work</div><div>Add or create</div></div><main role="main"><div class="cols">
<div class="main-col"><h1>${esc(item.title)}</h1><div>Principal Office &#8226; Sep 1</div><div>100 points</div><div class="due">${esc(dueLabel(item, state, { detail: true }))}</div>
<p>Attach this week's lesson plan and turn it in.</p>${materials}<div class="card"><h3>Class comments</h3><div role="textbox" contenteditable="true" aria-label="Add class comment"></div></div></div>
<aside class="side-col"><div class="card" id="yourwork">${yourWorkHtml(state, item)}</div>
<div class="card"><h3>Private comments</h3>${privateLink}<div role="textbox" contenteditable="true" aria-label="Add private comment..." style="border:1px solid #ccc;min-height:36px"></div></div></aside></div></main>
<div role="menu" id="addmenu" hidden aria-label="Add or create">
<div role="menuitem" tabindex="-1">Google Drive</div><div role="menuitem" tabindex="-1" id="menu-link">${state.linkMenuLabel || 'Link'}</div><div role="menuitem" tabindex="-1">File</div><div role="separator"></div><div role="menuitem" tabindex="-1">Docs</div><div role="menuitem" tabindex="-1">Slides</div><div role="menuitem" tabindex="-1">Sheets</div><div role="menuitem" tabindex="-1">Drawings</div></div>
<div class="scrim" id="scrim" hidden></div>
<div role="dialog" id="linkdlg" hidden aria-modal="true" aria-labelledby="linkdlg-h"><h2 id="linkdlg-h">Add link</h2><input id="linkinput" type="${state.linkInputType || 'url'}" aria-label="Link" style="width:100%;height:36px"><div style="display:flex;gap:8px"><button id="linkcancel">Cancel</button><button id="linkadd">Add link</button></div></div>
<div role="dialog" id="confirmdlg" hidden aria-modal="true" aria-labelledby="confirmdlg-h"><h2 id="confirmdlg-h"></h2><p id="confirmdlg-p"></p><div style="display:flex;gap:8px"><button id="confirmcancel">Cancel</button><button id="confirmok"></button></div></div>`;
  const cfg = { id: item.id, courseId: c.id, delay: Number(state.renderDelayMs) || 0, attachDelay: Number(state.attachDelayMs) || 700, confirmDialog: state.confirmDialog !== false, ignoreTurnIn: !!state.ignoreTurnIn };
  const script = `const CFG=${JSON.stringify(cfg)};
const api=(op,data)=>fetch('/__mock/api/'+op,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:CFG.id,...data})}).then(r=>r.json());
function hideAll(){['addmenu','linkdlg','confirmdlg','scrim'].forEach(id=>document.getElementById(id).setAttribute('hidden',''));}
async function refreshYourWork(){const r=await api('your-work',{});document.getElementById('yourwork').innerHTML=r.html;bindYourWork();}
function bindYourWork(){
  const add=document.querySelector('#yourwork .add');
  if(add)add.addEventListener('click',ev=>{ev.stopPropagation();document.getElementById('addmenu').removeAttribute('hidden');});
  document.querySelectorAll('#yourwork [data-remove]').forEach(b=>b.addEventListener('click',async()=>{await api('remove',{key:b.dataset.remove});refreshYourWork();}));
  const submit=document.querySelector('#yourwork .submit');
  if(submit)submit.addEventListener('click',()=>{
    const label=submit.textContent.trim();
    if(!CFG.confirmDialog){doSubmit(label);return;}
    document.getElementById('confirmdlg-h').textContent=label==='Turn in'?'Turn in your work?':'Mark as done?';
    document.getElementById('confirmdlg-p').textContent=label==='Turn in'?'1 attachment will be submitted.':'You did not attach any work.';
    document.getElementById('confirmok').textContent=label;
    document.getElementById('scrim').removeAttribute('hidden');document.getElementById('confirmdlg').removeAttribute('hidden');
  });
  const uns=document.querySelector('#yourwork .unsubmit');
  if(uns)uns.addEventListener('click',async()=>{await api('unsubmit',{});refreshYourWork();});
}
async function doSubmit(label){hideAll();await api('submit',{label});if(!CFG.ignoreTurnIn)setTimeout(refreshYourWork,300);}
document.getElementById('menu-link').addEventListener('click',()=>{hideAll();document.getElementById('scrim').removeAttribute('hidden');const d=document.getElementById('linkdlg');d.removeAttribute('hidden');const i=document.getElementById('linkinput');i.value='';i.focus();});
document.getElementById('linkcancel').addEventListener('click',hideAll);
document.getElementById('linkadd').addEventListener('click',async()=>{const url=document.getElementById('linkinput').value.trim();hideAll();if(!url)return;await api('attach',{url});setTimeout(refreshYourWork,CFG.attachDelay);});
document.getElementById('confirmcancel').addEventListener('click',hideAll);
document.getElementById('confirmok').addEventListener('click',()=>doSubmit(document.getElementById('confirmok').textContent));
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')hideAll();});
document.addEventListener('click',ev=>{const m=document.getElementById('addmenu');if(!m.hasAttribute('hidden')&&!m.contains(ev.target))m.setAttribute('hidden','');});`;
  const wrapped = `setTimeout(()=>{document.getElementById('app').innerHTML=${JSON.stringify(body)};${script};bindYourWork();},${cfg.delay});`;
  return page(`${item.title}`, `<div id="app"></div>`, wrapped);
}

function renderSignIn() {
  return page('Sign in - Google Accounts', `<main><h1>Sign in</h1><div>Use your Google Account</div><input type="email" aria-label="Email or phone"><button>Next</button></main>`);
}

function renderDriveFolder(state) {
  const d = state.drive;
  const rows = d.files.map(f => {
    const label = f.kind === 'docx' ? `${f.name}.docx` : f.kind === 'pdf' ? `${f.name}.pdf` : f.name;
    const typeName = f.kind === 'docx' ? 'Microsoft Word' : f.kind === 'pdf' ? 'PDF' : 'Google Docs';
    const link = d.exposeHref ? `<a href="${esc(docUrl(f))}" tabindex="-1">${esc(label)}</a>` : `<span>${esc(label)}</span>`;
    return { id: f.id, url: docUrl(f), html: `<div class="row" role="row" data-id="${esc(f.id)}" aria-selected="false" tabindex="-1"><div role="gridcell" class="name"><div data-tooltip="${esc(typeName)}: ${esc(label)}">${link}</div></div><div role="gridcell">me</div><div role="gridcell">Sep 1</div></div>` };
  });
  const script = `const ROWS=${JSON.stringify(rows)};const VIRTUAL=${d.virtualized ? 'true' : 'false'};
setTimeout(()=>{
  document.getElementById('app').innerHTML='<header><div>Drive</div><button aria-label="New">New</button></header><main role="main"><h1>${esc(d.folderName)}</h1><div role="grid" class="grid" id="grid" aria-label="List view"><div id="spacer" style="position:relative"></div></div></main>';
  const grid=document.getElementById('grid'),spacer=document.getElementById('spacer');
  function draw(){
    const rowH=48;spacer.style.height=(ROWS.length*rowH)+'px';
    const first=VIRTUAL?Math.max(0,Math.floor(grid.scrollTop/rowH)-1):0;
    const last=VIRTUAL?Math.min(ROWS.length,first+Math.ceil(grid.clientHeight/rowH)+2):ROWS.length;
    spacer.innerHTML=ROWS.slice(first,last).map((r,i)=>'<div style="position:absolute;left:0;right:0;top:'+((first+i)*rowH)+'px">'+r.html+'</div>').join('');
    spacer.querySelectorAll('[role=row]').forEach(row=>row.addEventListener('dblclick',()=>{const r=ROWS.find(x=>x.id===row.dataset.id);window.open(r.url,'_blank');}));
  }
  grid.addEventListener('scroll',draw);draw();
},${Number(state.renderDelayMs) || 0});`;
  return page(`${d.folderName} - Google Drive`, `<div id="app"></div>`, script);
}

function renderDoc(state, id) {
  const f = fileFor(state, id);
  return page(`${f ? f.name : 'Document'} - Google Docs`, `<h1>${esc(f ? f.name : 'Unknown document')}</h1>`);
}

async function handleRoute(route, stateFile) {
  const req = route.request();
  const url = new URL(req.url());
  const state = readState(stateFile);
  const html = body => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  const json = obj => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
  const log = ev => mutate(stateFile, s => { s.requests = (s.requests || []).slice(-400); s.requests.push({ at: new Date().toISOString(), ...ev }); });

  if (state.networkDown && url.hostname !== 'accounts.google.com') return route.abort('internetdisconnected');
  if (req.resourceType() === 'document') log({ type: 'nav', url: url.href, ua: req.headers()['user-agent'] || '' });

  if (url.hostname === 'accounts.google.com') return html(renderSignIn());
  const signedIn = state.signedIn !== false;
  if (!signedIn && ['classroom.google.com', 'drive.google.com', 'docs.google.com'].includes(url.hostname)) {
    const destination=`https://accounts.google.com/v3/signin/identifier?continue=${encodeURIComponent(url.href)}`;
    // A scripted navigation keeps the offline fixture portable across Chrome
    // channels whose route.fulfill implementation does not follow synthetic
    // 302 responses. The resulting page URL is still accounts.google.com.
    return html(page('Redirecting to sign in', '<main>Redirecting to Google sign-in…</main>', `location.replace(${JSON.stringify(destination)});`));
  }

  if (url.hostname === 'classroom.google.com') {
    const p = url.pathname.replace(/^\/u\/\d+/, '');
    if (p.startsWith('/__mock/api/')) {
      const op = p.slice('/__mock/api/'.length);
      const data = JSON.parse(req.postData() || '{}');
      const result = mutate(stateFile, s => {
        const hit = findItem(s, data.id); if (!hit) return { ok: false };
        const it = hit.item;
        s.events = s.events || [];
        if (op === 'attach') {
          const fileId = fileIdFromUrl(data.url);
          it.attachments = it.attachments || [];
          if (fileId && fileFor(s, fileId)) it.attachments.push({ fileId });
          else it.attachments.push({ externalUrl: data.url, title: data.url });
          s.events.push({ type: 'attach', assignmentId: it.id, title: it.title, url: data.url, fileId });
          if (s.otherComputerCompletesAfterAttach === it.id) { it.status = 'turned_in'; s.events.push({ type: 'other-pc-turn-in', assignmentId: it.id }); }
        } else if (op === 'remove') {
          it.attachments = (it.attachments || []).filter(a => (a.fileId || a.externalUrl) !== data.key);
          s.events.push({ type: 'remove', assignmentId: it.id, key: data.key });
        } else if (op === 'submit') {
          s.events.push({ type: 'submit-click', assignmentId: it.id, title: it.title, label: data.label, attachments: (it.attachments || []).map(a => a.fileId || a.externalUrl) });
          if (!s.ignoreTurnIn) {
            if (['turned_in', 'done_late'].includes(it.status)) s.events.push({ type: 'duplicate-submit', assignmentId: it.id });
            it.status = Number(it.dueOffsetDays) < 0 ? 'done_late' : 'turned_in';
            s.events.push({ type: 'turn-in', assignmentId: it.id, title: it.title, attachments: (it.attachments || []).map(a => a.fileId || a.externalUrl) });
          }
        } else if (op === 'unsubmit') {
          it.status = 'assigned'; s.events.push({ type: 'unsubmit', assignmentId: it.id });
        }
        return { ok: true };
      });
      if (op === 'your-work') { const hit = findItem(readState(stateFile), data.id); return json({ html: hit ? yourWorkHtml(readState(stateFile), hit.item) : '' }); }
      return json(result);
    }
    const c = state.course;
    if (p === '/' || p === '/h') return html(page('Classes', `<main><a href="/c/${c.id}">${esc(c.name)}</a></main>`));
    let m;
    if ((m = p.match(/^\/c\/([^/]+)\/?$/)) && m[1] === c.id) return html(renderStream(state));
    if ((m = p.match(/^\/w\/([^/]+)\/t\/all\/?$/)) && m[1] === c.id) return html(renderClasswork(state));
    if ((m = p.match(/^\/c\/([^/]+)\/a\/([^/]+)\/details\/?$/)) && m[1] === c.id) {
      const hit = findItem(state, m[2]);
      if (hit) return html(renderDetails(state, hit.item));
    }
    return route.fulfill({ status: 404, contentType: 'text/html', body: page('Not found', '<h1>Classroom could not find this page</h1>') });
  }
  if (url.hostname === 'drive.google.com') {
    const m = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([^/?#]+)/);
    if (m && m[1] === state.drive.folderId) return html(renderDriveFolder(state));
    const f = url.pathname.match(/^\/file\/d\/([^/]+)/);
    if (f) return html(renderDoc(state, f[1]));
    if (url.pathname === '/open') return html(renderDoc(state, url.searchParams.get('id')));
    return html(page('Google Drive', '<h1>My Drive</h1>'));
  }
  if (url.hostname === 'docs.google.com') {
    const m = url.pathname.match(/\/d\/([^/]+)/);
    return html(renderDoc(state, m ? m[1] : ''));
  }
  return route.abort('blockedbyclient');
}

async function installMockRoutes(context, stateFile) {
  await context.route(/^https?:\/\/[^/]+\//, route => {
    const host = new URL(route.request().url()).hostname;
    if (['classroom.google.com', 'drive.google.com', 'docs.google.com', 'accounts.google.com'].includes(host)) return handleRoute(route, stateFile).catch(err => route.fulfill({ status: 500, body: String(err && err.stack || err) }));
    return route.abort('blockedbyclient');
  });
}

module.exports = { installMockRoutes, readState, writeState, mutate, dueLabel, fileIdFromUrl };
