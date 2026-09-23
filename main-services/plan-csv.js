function parseCsv(text,normalizePlan){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim()); if(!lines.length)return [];
  const split=(line)=>{const out=[];let s='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(s.trim());s='';}else s+=c;}out.push(s.trim());return out;};
  const first=split(lines[0]).map(x=>x.toLowerCase()),hasHeader=first.includes('week')||first.includes('weekof');
  return (hasHeader?lines.slice(1):lines).map(split).map(r=>normalizePlan({week:r[0],weekOf:r[1]||'',title:r[2]||'',url:r[3]||'',source:r[4]||'import'})).filter(x=>x.week&&x.title&&x.url);
}
function csvEscape(value){const s=String(value??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function toCsv(plans){return ['week,weekOf,title,url,source',...plans.map(p=>[p.week,p.weekOf,p.title,p.url,p.source||'manual'].map(csvEscape).join(','))].join('\r\n');}
module.exports={parseCsv,toCsv};
