function hhmmAdd(time,minutes){
  const [h,m]=String(time||'06:30').split(':').map(Number);
  const total=((h*60+m+minutes)%1440+1440)%1440;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function retryOffsets(cfg={}){
  return (Array.isArray(cfg.retryMinutes)?cfg.retryMinutes:[15,30])
    .map(Number)
    .filter((v,i,a)=>Number.isFinite(v)&&v>0&&a.indexOf(v)===i)
    .sort((a,b)=>a-b);
}
function schedulePoints(cfg={},machine={}){
  const map={MON:'Monday',TUE:'Tuesday',WED:'Wednesday',THU:'Thursday',FRI:'Friday',SAT:'Saturday',SUN:'Sunday'};
  const bit={SUN:1,MON:2,TUE:4,WED:8,THU:16,FRI:32,SAT:64};
  const order=['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const original=(cfg.schedule?.days||[]).filter(x=>map[x]);
  if(!original.length) throw new Error('Choose at least one schedule day.');
  if(String(machine?.role||'primary')==='manual') throw new Error('This computer is set to manual only. Choose Main computer or Backup computer before saving an automatic schedule.');
  const role=String(machine?.role||'primary');
  const offset=role==='backup'?Math.max(45,Math.min(240,Number(machine?.backupDelayMinutes)||60)):0;
  const [h,m]=String(cfg.schedule?.time||'06:30').split(':').map(Number);
  const raw=h*60+m+offset,dayShift=Math.floor(raw/1440),mins=((raw%1440)+1440)%1440;
  const time=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
  const dayCodes=original.map(code=>order[(order.indexOf(code)+dayShift+7)%7]);
  return [{offset,time,dayCodes,days:dayCodes.map(code=>map[code]),dayMask:dayCodes.reduce((n,code)=>n+bit[code],0),baseTime:String(cfg.schedule?.time||'06:30'),role}];
}
function retryTargetsFrom(start,cfg={}){
  const base=start instanceof Date?start:new Date(start);
  if(Number.isNaN(base.getTime())) throw new Error('A valid retry-chain start time is required.');
  return retryOffsets(cfg).map(offset=>({offset,at:new Date(base.getTime()+offset*60000)}));
}
function triggerStartTime(v){const m=String(v||'').match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:'';}
module.exports={hhmmAdd,retryOffsets,schedulePoints,retryTargetsFrom,triggerStartTime};
