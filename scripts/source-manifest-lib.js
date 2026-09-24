const fs=require('fs'),path=require('path');

const SKIP_DIRS=new Set(['node_modules','dist','.build-tools','.git']);
const SKIP_FILES=new Set(['SOURCE-MANIFEST-SHA256.txt','.git']);

function sourceFiles(root){
  const files=[];
  (function walk(dir){
    for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
      if(ent.isDirectory()&&SKIP_DIRS.has(ent.name))continue;
      const p=path.join(dir,ent.name);
      if(ent.isDirectory())walk(p);
      else if(ent.isFile()&&!SKIP_FILES.has(ent.name))files.push(path.relative(root,p).replace(/\\/g,'/'));
    }
  })(root);
  return files.sort((a,b)=>a.localeCompare(b));
}

// .gitattributes intentionally checks .bat/.cmd files out as CRLF even though
// every other text file is LF. Hash the repository's declared line-ending form
// so a manifest created on Linux verifies against the same source on Windows.
function canonicalSourceBytes(root,relativePath){
  const file=path.join(root,relativePath),buffer=fs.readFileSync(file);
  if(!/\.(?:bat|cmd)$/i.test(relativePath))return buffer;
  const text=buffer.toString('utf8').replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\n/g,'\r\n');
  return Buffer.from(text,'utf8');
}

module.exports={sourceFiles,canonicalSourceBytes};
