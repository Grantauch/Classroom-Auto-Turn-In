const fs=require('fs');
const path=require('path');

function crc32(buf){
  let c=0xffffffff;
  for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}
  return (c^0xffffffff)>>>0;
}
function dosDateTime(date=new Date()){
  const y=Math.max(1980,date.getFullYear());
  const time=(date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2);
  const day=(y-1980)<<9|(date.getMonth()+1)<<5|date.getDate();
  return {time,day};
}
function zipStore(entries){
  const local=[];const central=[];let offset=0;const now=dosDateTime();
  for(const ent of entries){
    const name=Buffer.from(ent.name.replace(/\\/g,'/'),'utf8');
    const data=Buffer.isBuffer(ent.data)?ent.data:Buffer.from(String(ent.data),'utf8');
    const crc=crc32(data);
    const lh=Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0,6);lh.writeUInt16LE(0,8);
    lh.writeUInt16LE(now.time,10);lh.writeUInt16LE(now.day,12);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(data.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(name.length,26);lh.writeUInt16LE(0,28);
    local.push(lh,name,data);
    const ch=Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0,8);ch.writeUInt16LE(0,10);
    ch.writeUInt16LE(now.time,12);ch.writeUInt16LE(now.day,14);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(data.length,24);
    ch.writeUInt16LE(name.length,28);ch.writeUInt16LE(0,30);ch.writeUInt16LE(0,32);ch.writeUInt16LE(0,34);ch.writeUInt16LE(0,36);ch.writeUInt32LE(0,38);ch.writeUInt32LE(offset,42);
    central.push(ch,name);offset+=lh.length+name.length+data.length;
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0);const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
  return Buffer.concat([...local,...central,end]);
}
function xml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function para(text,style='Normal',bold=false){
  const lines=String(text??'').split(/\r?\n/);const runs=[];
  lines.forEach((line,i)=>{if(i)runs.push('<w:r><w:br/></w:r>');runs.push(`<w:r>${bold?'<w:rPr><w:b/></w:rPr>':''}<w:t xml:space="preserve">${xml(line)}</w:t></w:r>`)});
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${runs.join('')}</w:p>`;
}
function bullet(text){return para(`• ${text}`,'Normal');}
function planToDocumentXml(plan){
  const parts=[];
  parts.push(para(plan.title||`Week ${plan.weekNumber||''} - Lesson Plans`,'Title'));
  if(plan.weekLabel)parts.push(para(plan.weekLabel,'Subtitle'));
  parts.push(para('Weekly overview','Heading1'));
  parts.push(para(plan.overview||'','Normal'));
  for(const course of plan.courses||[]){
    parts.push(para(course.course||'Course','Heading1'));
    if(course.objective)parts.push(para(`Objective: ${course.objective}`,'Normal',true));
    if(course.standards)parts.push(para(`Standards / focus: ${course.standards}`));
    for(const day of course.days||[]){
      parts.push(para(day.day||'Day','Heading2'));
      if(day.topic)parts.push(para(`Topic: ${day.topic}`,'Normal',true));
      if(day.activities)parts.push(para(`Activities: ${day.activities}`));
      if(day.assessment)parts.push(para(`Assessment / evidence: ${day.assessment}`));
      if(day.materials)parts.push(para(`Materials: ${day.materials}`));
    }
  }
  if(Array.isArray(plan.teacherReview)&&plan.teacherReview.length){
    parts.push(para('Teacher review before approval','Heading1'));
    for(const item of plan.teacherReview)parts.push(bullet(item));
  }
  if(plan.notes){parts.push(para('Notes','Heading1'));parts.push(para(plan.notes));}
  parts.push(`<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join('')}</w:body></w:document>`;
}
function stylesXml(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:i/><w:color w:val="666666"/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="260" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="180" w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`}
function contentTypes(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`}
function rootRels(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`}
function docRels(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`}
function coreXml(plan){const now=new Date().toISOString();return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(plan.title||'Weekly Lesson Plans')}</dc:title><dc:creator>Classroom Auto Turn-In AI Recovery</dc:creator><cp:lastModifiedBy>Classroom Auto Turn-In AI Recovery</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`}
function appXml(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Classroom Auto Turn-In</Application></Properties>`}
function createPlanDocx(plan,file){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const entries=[
    {name:'[Content_Types].xml',data:contentTypes()},
    {name:'_rels/.rels',data:rootRels()},
    {name:'word/document.xml',data:planToDocumentXml(plan)},
    {name:'word/styles.xml',data:stylesXml()},
    {name:'word/_rels/document.xml.rels',data:docRels()},
    {name:'docProps/core.xml',data:coreXml(plan)},
    {name:'docProps/app.xml',data:appXml()}
  ];
  fs.writeFileSync(file,zipStore(entries));
  return file;
}
module.exports={crc32,zipStore,createPlanDocx,planToDocumentXml};
