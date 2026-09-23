const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {sourceFiles,canonicalSourceBytes}=require('./source-manifest-lib');
const root=path.join(__dirname,'..');
const out=path.join(root,'SOURCE-MANIFEST-SHA256.txt');
const files=sourceFiles(root);
const lines=files.map(relativePath=>{
  const hash=crypto.createHash('sha256').update(canonicalSourceBytes(root,relativePath)).digest('hex');
  return `${hash}  ${relativePath}`;
});
fs.writeFileSync(out,lines.join('\n')+'\n');
console.log(`Wrote ${path.basename(out)} for ${files.length} source files.`);
