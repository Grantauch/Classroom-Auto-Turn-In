const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const root=path.join(__dirname,'..'),manifest=path.join(root,'SOURCE-MANIFEST-SHA256.txt');
const skipDirs=new Set(['node_modules','dist','.build-tools','.git']);
const skipFiles=new Set(['SOURCE-MANIFEST-SHA256.txt']);
function sourceFiles(){
  const files=[];
  (function walk(dir){
    for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
      if(ent.isDirectory()&&skipDirs.has(ent.name))continue;
      const p=path.join(dir,ent.name);
      if(ent.isDirectory())walk(p);
      else if(ent.isFile()&&!skipFiles.has(ent.name))files.push(path.relative(root,p).replace(/\\/g,'/'));
    }
  })(root);
  return files.sort((a,b)=>a.localeCompare(b));
}
assert(fs.existsSync(manifest),'SOURCE-MANIFEST-SHA256.txt is missing. Regenerate it before building the release candidate.');
const rows=fs.readFileSync(manifest,'utf8').split(/\r?\n/).filter(Boolean);
assert(rows.length>20,'Source manifest is unexpectedly small.');
const listed=[];
for(const row of rows){
  const m=row.match(/^([a-f0-9]{64})  (.+)$/i);assert(m,`Malformed source-manifest row: ${row}`);
  assert(!listed.includes(m[2]),`Duplicate source-manifest entry: ${m[2]}`);listed.push(m[2]);
  const file=path.join(root,m[2]);assert(fs.existsSync(file),`Manifest file missing: ${m[2]}`);
  const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(actual.toLowerCase(),m[1].toLowerCase(),`Source hash mismatch: ${m[2]}`);
}
const actualFiles=sourceFiles();
assert.deepStrictEqual(listed.slice().sort((a,b)=>a.localeCompare(b)),actualFiles,'Source tree and manifest differ. Regenerate the manifest; unlisted or stale source files are not allowed.');
assert(listed.includes('package-lock.json'),'package-lock.json exists but is not included in the source manifest. Regenerate the manifest.');
console.log(`Source manifest verified exactly: ${rows.length} files, no unlisted source files.`);
