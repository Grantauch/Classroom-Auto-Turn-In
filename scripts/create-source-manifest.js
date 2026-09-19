const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..');
const out=path.join(root,'SOURCE-MANIFEST-SHA256.txt');
const skipDirs=new Set(['node_modules','dist','.build-tools','.git']);
const skipFiles=new Set(['SOURCE-MANIFEST-SHA256.txt']);
const files=[];
(function walk(dir){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(ent.isDirectory()&&skipDirs.has(ent.name))continue;
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())walk(p);
    else if(ent.isFile()&&!skipFiles.has(ent.name))files.push(p);
  }
})(root);
files.sort((a,b)=>path.relative(root,a).localeCompare(path.relative(root,b)));
const lines=files.map(p=>{
  const hash=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  return `${hash}  ${path.relative(root,p).replace(/\\/g,'/')}`;
});
fs.writeFileSync(out,lines.join('\n')+'\n');
console.log(`Wrote ${path.basename(out)} for ${files.length} source files.`);
