const assert=require('assert');
const fs=require('fs'),path=require('path'),os=require('os');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cati-fuzz-'));process.env.CATI_DATA_DIR=temp;
const lib=require('../engine/lib');
const sched=require('../engine/scheduler');
const validation=require('../engine/validation');

function ymd(d){return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:null}
const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Exhaustively exercise every real calendar day across four years, including leap year.
for(let year=2025;year<=2028;year++){
  for(let month=0;month<12;month++){
    const days=new Date(year,month+1,0).getDate();
    for(let day=1;day<=days;day++){
      const parsed=lib.parseClassroomDueDate(`Due ${monthNames[month]} ${day}, ${year}, 11:59 PM`,new Date(year,0,1));
      assert.equal(ymd(parsed),`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
    }
    assert.equal(lib.parseClassroomDueDate(`Due ${monthNames[month]} ${days+1}, ${year}`,new Date(year,0,1)),null);
  }
}
// Randomized retry rollover. Compare retry target calculation to direct millisecond arithmetic.
for(let i=0;i<500;i++){
  const h=Math.floor(Math.random()*24),m=Math.floor(Math.random()*60),offset=1+Math.floor(Math.random()*3000);
  const day=1+Math.floor(Math.random()*25);
  const base=new Date(2026,5,day,h,m,0,0);
  const got=sched.retryTargetsFrom(base,{retryMinutes:[offset]})[0];
  const want=new Date(base.getTime()+offset*60000);
  assert.equal(got.offset,offset);
  assert.equal(got.at.getTime(),want.getTime());
}
// The normal weekly task remains a single trigger regardless of configured retry offsets.
for(let i=0;i<100;i++){
  const h=Math.floor(Math.random()*24),m=Math.floor(Math.random()*60);
  const base=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  const pts=sched.schedulePoints({schedule:{time:base,days:['MON','FRI']},retryMinutes:[15,30]});
  assert.equal(pts.length,1);assert.equal(pts[0].time,base);assert.deepEqual(pts[0].dayCodes,['MON','FRI']);
}
// Validation rejects missing week capture and accepts common custom formats.
for(const good of ['Week\\s+(\\d+)','Lesson Plans Week (\\d+)','W(?<week>\\d+)-Plans']) assert.doesNotThrow(()=>validation.validateWeekPattern(good,'Test rule'));
for(const bad of ['', '^Week \\d+$','[broken']) assert.throws(()=>validation.validateWeekPattern(bad,'Test rule'));
fs.rmSync(temp,{recursive:true,force:true});
console.log('Offline fuzz checks passed: calendar dates, scheduler rollover, and naming-rule validation.');
