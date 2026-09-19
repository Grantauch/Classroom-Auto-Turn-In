// Browser-context helpers. These functions are intentionally self-contained so
// Playwright can serialize them into Google Classroom/Drive pages, and so the
// same DOM logic can be exercised against local Chromium fixtures offline.
function collectStrictTopicAssignmentsDom(root,{source,flags}){
  const re=new RegExp(source,(flags||'i').replace(/g/g,''));
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const rows=[]; const seen=new Set(); const seenCards=new WeakSet();
  const logicalPosition=el=>{const r=el.getBoundingClientRect();return `${Math.round(r.top+(window.scrollY||0))}:${Math.round(r.left+(window.scrollX||0))}:${Math.round(r.width)}:${Math.round(r.height)}`;};
  const nodes=[...root.querySelectorAll('a,[role="link"],[role="button"],[data-stream-item-id],li,div,span')];
  for(const el of nodes){
    try{
      if(!visible(el)) continue;
      const texts=[el.innerText,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).map(clean).filter(x=>x&&x.length<=360);
      let matched=null;
      for(const text of texts){const m=text.match(re);if(m){matched={text,m};break;}}
      if(!matched) continue;
      const week=Number(matched.m[1]); if(!Number.isFinite(week)) continue;
      let card=el.closest('[data-stream-item-id],li,[role="listitem"],article,[role="article"],[role="row"]');
      if(!card){let q=el.parentElement;for(let d=0;q&&q!==root&&d<7;d++,q=q.parentElement){const tx=clean(q.innerText||q.textContent);if(/\bDue\b/i.test(tx)){card=q;break;}}}
      card=card||el;
      if(seenCards.has(card)) continue; seenCards.add(card);
      const streamItemId=card?.getAttribute?.('data-stream-item-id')||'';
      let anchor=el.matches('a[href]')?el:(el.closest?.('a[href]')||el.querySelector?.('a[href]'));
      if(!anchor&&card){const links=[...card.querySelectorAll('a[href]')].filter(a=>/classroom\.google\.com/.test(a.href||''));if(links.length===1)anchor=links[0];}
      const href=anchor?.href||'';
      const cardText=clean(card?.innerText||card?.textContent||matched.text);
      const title=clean(matched.m[0]||matched.text);
      const rootKey=streamItemId||href||logicalPosition(card);
      const key=`${week}|${rootKey}`;
      if(seen.has(key)) continue; seen.add(key);
      rows.push({week,title,text:matched.text,cardText,href,streamItemId,rootKey});
    }catch{/* best-effort fallback */}
  }
  return rows;
}

function collectDrivePlanRowsDom({source,flags}){
  const re=new RegExp(source,(flags||'i').replace(/g/g,''));
  const out=[]; const seenRoots=new WeakSet();
  const nodes=[...document.querySelectorAll('[role="row"],[role="gridcell"],[role="option"],a[href],span,div')];
  const visible=el=>{const r=el.getBoundingClientRect(),st=getComputedStyle(el);return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden'};
  const attrsForId=['data-id','data-item-id','data-file-id','data-resource-id','data-target-id','data-doc-id'];
  const idFrom=el=>{
    let q=el;
    for(let d=0;q&&d<7;d++,q=q.parentElement){
      for(const a of attrsForId){const v=q.getAttribute&&q.getAttribute(a);if(v&&/^[A-Za-z0-9_-]{20,}$/.test(v))return v;}
      if(q.attributes){for(const at of q.attributes){if(/(?:^|-)id$/i.test(at.name)&&/^[A-Za-z0-9_-]{20,}$/.test(at.value))return at.value;}}
    }
    return '';
  };
  const hrefFrom=el=>{
    const list=[];
    if(el.matches&&el.matches('a[href]'))list.push(el);
    if(el.closest){const a=el.closest('a[href]');if(a)list.push(a)}
    if(el.querySelectorAll)list.push(...el.querySelectorAll('a[href]'));
    return list.map(a=>a.href||a.getAttribute('href')||'').find(Boolean)||'';
  };
  const logicalPosition=el=>{
    const r=el.getBoundingClientRect(); let sc=el.parentElement;
    while(sc){const st=getComputedStyle(sc);if(/auto|scroll/.test(st.overflowY||'')&&sc.scrollHeight>sc.clientHeight+10)break;sc=sc.parentElement;}
    if(sc){const sr=sc.getBoundingClientRect();return `${Math.round(r.top-sr.top+sc.scrollTop)}:${Math.round(r.left-sr.left+sc.scrollLeft)}`;}
    return `${Math.round(r.top+(window.scrollY||0))}:${Math.round(r.left+(window.scrollX||0))}`;
  };
  for(const el of nodes){
    try{
      if(!visible(el))continue;
      const raw=[el.innerText,el.textContent,el.getAttribute&&el.getAttribute('aria-label'),el.getAttribute&&el.getAttribute('title')].filter(Boolean);
      let matched=null;
      for(const value of raw){
        const text=String(value).replace(/\s+/g,' ').trim();
        if(!text||text.length>180)continue;
        const m=text.match(re); if(!m||m[0].trim().toLowerCase()!==text.toLowerCase())continue;
        matched={text,m};break;
      }
      if(!matched)continue;
      const week=Number(matched.m[1]); if(!Number.isFinite(week))continue;
      const root=(el.closest&&el.closest('[role="row"],[role="gridcell"],[role="option"],[data-id],[data-item-id],[data-file-id],[data-resource-id]'))||el.parentElement||el;
      if(seenRoots.has(root))continue; seenRoots.add(root);
      const href=hrefFrom(root),id=idFrom(root);
      const stableAttrs=['aria-label','title','data-tooltip','data-tooltip-text'].map(a=>root.getAttribute&&root.getAttribute(a)||'').filter(Boolean).join('|');
      const rootKey=id||href||`${matched.text}|${stableAttrs}|${logicalPosition(root)}`;
      out.push({week,title:matched.text,href,id,rootKey});
    }catch{/* best-effort fallback */}
  }
  return out;
}
module.exports={collectStrictTopicAssignmentsDom,collectDrivePlanRowsDom};
