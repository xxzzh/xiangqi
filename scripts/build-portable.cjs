// Build on Windows using only Node.js and the system tar.exe. No system-wide installs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const cache = path.join(root, '.runtime', 'portable-cache');
const dist = path.join(root, 'dist');
const name = `xiangqi-study-v${version}-windows-x64`;
const build = path.join(dist, `build-${Date.now()}`);
const app = path.join(build, name);
const output = path.resolve(root, process.argv[2] || `dist/${name}.zip`);
const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const sources = {
  node: { version:'24.22.2', file:'node-v24.22.2-win-x64.zip', url:'https://nodejs.org/dist/v24.22.2/node-v24.22.2-win-x64.zip', sha256:'ca1bff5d8ead13c9f2ea404a176db46bd430704d5b5113734049fa365e7799e2' },
  engine: { version:'2026-09-06', file:'Pikafish.2026-09-06.7z', url:'https://github.com/official-pikafish/Pikafish/releases/download/Pikafish-2026-09-06/Pikafish.2026-09-06.7z', sha256:'41952bbfe2520faceb5902c69e6ab4845cc999841d2b49a95cc1be7867a25e5b' },
  engineSource: { file:'Pikafish-2026-09-06-source.tar.gz', url:'https://api.github.com/repos/official-pikafish/Pikafish/tarball/Pikafish-2026-09-06', sha256:'5befd4715f84e775520f5374febc4ccd301b31705ec754d9dc8e82118a5cbc8b' }
};
function run(exe,args,options={}) { return execFileSync(exe,args,{cwd:root,windowsHide:true,stdio:'pipe',...options}); }
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function copy(from,to) { fs.mkdirSync(path.dirname(to),{recursive:true});fs.cpSync(from,to,{recursive:true}); }
async function download(source) {
  const target=path.join(cache,source.file);
  // Reuse the previously downloaded official engine archive only after hash verification.
  const existing=path.join(root,'engine','pikafish-release.7z');
  if(!fs.existsSync(target)&&source===sources.engine&&fs.existsSync(existing)&&hash(existing)===source.sha256)copy(existing,target);
  if(!fs.existsSync(target)){
    const response=await fetch(source.url,{headers:{'User-Agent':'xiangqi-portable-builder'}});
    if(!response.ok)throw new Error(`Download failed: ${source.file} HTTP ${response.status}`);
    fs.writeFileSync(target,Buffer.from(await response.arrayBuffer()));
  }
  if(hash(target)!==source.sha256)throw new Error(`SHA256 mismatch: ${source.file}. Remove the bad cache file and retry.`);
  return target;
}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error(`Unexpected symlink: ${p}`);return e.isDirectory()?files(p):[p];});}
async function main(){
  if(process.platform!=='win32')throw new Error('This builder targets Windows; run it on Windows.');
  if(!output.startsWith(dist+path.sep)||fs.existsSync(output))throw new Error('Output must be a new file inside dist/.');
  fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(app,{recursive:true});
  const [nodeArchive,engineArchive,sourceArchive]=await Promise.all(Object.values(sources).map(download));
  const nodeExtract=path.join(build,'node-download'),engineExtract=path.join(build,'engine-download');
  fs.mkdirSync(nodeExtract);fs.mkdirSync(engineExtract);
  run(tar,['-xf',nodeArchive,'-C',nodeExtract]);run(tar,['-xf',engineArchive,'-C',engineExtract]);
  const nodeDir=path.join(nodeExtract,`node-v${sources.node.version}-win-x64`),node=path.join(nodeDir,'node.exe');
  if(run(node,['--version']).toString().trim()!==`v${sources.node.version}`)throw new Error('Unexpected runtime version.');
  for(const item of ['package.json','package-lock.json','server.js','public','examples','docs','README.md','LICENSE','THIRD_PARTY.md','start.ps1','stop.ps1','启动研习室.cmd','停止研习室.cmd','停止研习室.ps1'])copy(path.join(root,item),path.join(app,item));
  copy(path.join(root,'docs','portable','使用说明.txt'),path.join(app,'开始使用.txt'));
  copy(path.join(root,'docs','portable','LICENSES.md'),path.join(app,'licenses','README.md'));
  copy(node,path.join(app,'runtime','node.exe'));copy(path.join(nodeDir,'LICENSE'),path.join(app,'runtime','LICENSE'));
  for(const item of ['Pikafish-Windows-x86-64-universal.exe','pikafish.nnue','Copying.txt','NNUE-License.md','AUTHORS','README.md'])copy(path.join(engineExtract,item),path.join(app,'engine',item));
  copy(sourceArchive,path.join(app,'licenses',sources.engineSource.file));
  // Install exactly the lockfile's production dependencies; do not execute lifecycle scripts.
  run(node,[path.join(nodeDir,'node_modules','npm','bin','npm-cli.js'),'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--prefix',app],{env:{...process.env,PATH:nodeDir+path.delimiter+process.env.PATH}});
  if(fs.existsSync(path.join(app,'node_modules','electron')))throw new Error('A development dependency leaked into the package.');
  const deps=[];
  for(const file of files(path.join(app,'node_modules')).filter(p=>path.basename(p)==='package.json')){
    const pkg=JSON.parse(fs.readFileSync(file,'utf8'));if(!pkg.name||!pkg.version)continue;
    const dir=path.dirname(file),licenses=fs.readdirSync(dir).filter(n=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(n));
    if(!licenses.length)throw new Error(`Dependency has no bundled license: ${pkg.name}`);
    deps.push({name:pkg.name,version:pkg.version,license:pkg.license,files:licenses.map(n=>path.relative(app,path.join(dir,n)).replaceAll('\\','/'))});
  }
  fs.writeFileSync(path.join(app,'licenses','npm-dependencies.json'),JSON.stringify(deps,null,2)+'\n');
  const dirty=run('git',['status','--porcelain']).toString().trim();
  const manifest={app:'xiangqi-study',version,platform:'win32-x64',sourceCommit:dirty?null:run('git',['rev-parse','HEAD']).toString().trim(),nodeVersion:sources.node.version,engineVersion:sources.engine.version,sources,files:{}};
  for(const file of files(app))manifest.files[path.relative(app,file).replaceAll('\\','/')]=hash(file);
  fs.writeFileSync(path.join(app,'portable.json'),JSON.stringify(manifest,null,2)+'\n');
  // Without hdrcharset, Windows tar may write local-codepage names that other ZIP readers misdecode.
  run(tar,['-a','--options=zip:hdrcharset=UTF-8','-cf',output,'-C',build,name]);
  const digest=hash(output);
  fs.writeFileSync(output+'.sha256',`${digest}  ${path.basename(output)}\n`);
  fs.writeFileSync(path.join(cache,'last-build.json'),JSON.stringify({app,output,version,sha256:digest,bytes:fs.statSync(output).size},null,2));
  console.log(JSON.stringify({app,output,version,sha256:digest,bytes:fs.statSync(output).size,dependencies:deps.length},null,2));
}
main().catch(error=>{console.error(error.message);if(error.stderr)console.error(error.stderr.toString());process.exitCode=1;});
