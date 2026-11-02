// Exercise an extracted ZIP through Windows PowerShell 5.1, with no Node/npm on PATH.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');const assert=require('node:assert/strict');
const exec=promisify(execFile),root=path.resolve(__dirname,'..'),archive=path.resolve(process.argv[2]||'');
const system=path.join(process.env.SystemRoot||'C:\\Windows','System32'),powershell=path.join(system,'WindowsPowerShell','v1.0','powershell.exe');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const env={...process.env,PATH:system+';'+path.dirname(powershell),ENGINE_PATH:'Z:\\missing-engine.exe',NNUE_PATH:'Z:\\missing.nnue',PUBLIC_PATH:'Z:\\missing-public',NODE_PATH:'Z:\\missing-modules',NODE_OPTIONS:'--deliberately-invalid-option',npm_config_offline:'true'};
const checks=[];let app,foreign,socket,session; function note(...messages){checks.push(...messages);for(const message of messages)console.log(`PASS ${message}`);}
async function ps(command){return exec(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-Command','[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false); '+command],{env,windowsHide:true,timeout:30000,maxBuffer:1024*1024});}
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
async function start(port){await ps(`& ${quote(path.join(app,'启动研习室.cmd'))} -NoBrowser -Port ${port}`);return readJson(path.join(app,'.runtime','session.json'));}
async function stop(){if(app)await ps(`& ${quote(path.join(app,'stop.ps1'))}`);}
async function expectFailure(command,pattern){try{await ps(command);assert.fail('Launch unexpectedly succeeded');}catch(error){assert.match(String(error.stdout||'')+String(error.stderr||''),pattern);}}
async function main(){
  assert(process.platform==='win32'&&fs.existsSync(archive),'Pass a Windows portable ZIP path.');
  const extract=path.join(root,'dist',`验收 空格 & 符号 ${Date.now()}`);fs.mkdirSync(extract,{recursive:true});
  await ps(`Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extract)} -Force`);
  const names=fs.readdirSync(extract);assert.equal(names.length,1);app=path.join(extract,names[0]);
  const manifest=readJson(path.join(app,'portable.json'));
  for(const [relative,digest] of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(app,relative))).digest('hex'),digest,relative);
  note('Windows ZIP extraction preserves Chinese filenames and all file SHA256 values match');
  foreign=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'xiangqi-study',instanceId:'another-directory',ok:true}));});
  await new Promise(resolve=>foreign.listen(0,'127.0.0.1',resolve));const port=foreign.address().port;assert(port<=65525);
  session=await start(port);assert.notEqual(session.port,port);
  const health=await (await fetch(session.url+'/api/health')).json();assert.equal(health.version,manifest.version);assert(health.engineInstalled);assert.equal(health.instanceId,session.instanceId);
  const processInfo=JSON.parse((await ps(`Get-CimInstance Win32_Process -Filter 'ProcessId = ${session.pid}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`)).stdout);
  assert.equal(processInfo.ExecutablePath.toLowerCase(),path.join(app,'runtime','node.exe').toLowerCase());
  note('bundled runtime works without installed Node/npm and ignores inherited engine overrides','occupied port and another directory are left untouched','Chinese, spaces and ampersand in extraction path work');
  const again=await start(port);assert.equal(again.pid,session.pid);note('repeated launch reuses the same instance');
  for(const relative of ['','rules.js','study.js','lessons.js','critical.js','game.js','trainer.js','style.css']){const response=await fetch(session.url+'/'+relative);assert.equal(response.status,200,relative);assert((await response.text()).length>100,relative);}
  const {WebSocket}=require(path.join(app,'node_modules','ws'));
  socket=new WebSocket(session.url.replace('http:','ws:'));
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Engine smoke test timed out')),15000);socket.on('error',reject);socket.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='error'){clearTimeout(timer);reject(new Error(m.message));}if(m.type==='status'&&m.ready)socket.send(JSON.stringify({type:'analyze',id:1,fen:'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',moves:[],ms:500}));if(m.type==='analysis'&&m.done){clearTimeout(timer);assert(m.data.lines[0].depth>0&&/^[a-i][0-9][a-i][0-9]$/.test(m.data.bestmove));resolve();}});});
  note('all local assets load and bundled Pikafish produces a real evaluated move');
  const children=JSON.parse((await ps(`@(Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${session.pid}' | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress`)).stdout);
  await stop();socket.terminate();socket=null;
  const alive=await ps(`@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(${[session.pid,...(Array.isArray(children)?children:[children])].join(',')}) }) | Measure-Object | Select-Object -ExpandProperty Count`);assert.equal(Number(alive.stdout.trim()),0);
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).instanceId,'another-directory');
  note('stop removes only this server and its engine descendants');
  const nnue=path.join(app,'engine','pikafish.nnue');fs.renameSync(nnue,nnue+'.hold');
  try{await expectFailure(`& ${quote(path.join(app,'start.ps1'))} -NoBrowser -Port ${session.port}`,/缺少文件/);}finally{fs.renameSync(nnue+'.hold',nnue);}
  const node=path.join(app,'runtime','node.exe');fs.renameSync(node,node+'.hold');
  try{await expectFailure(`& ${quote(path.join(app,'start.ps1'))} -NoBrowser -Port ${session.port}`,/缺少 runtime/);}finally{fs.renameSync(node+'.hold',node);}
  note('missing runtime or NNUE gives a readable error without downloading anything');
  if(process.argv.includes('--keep-running'))session=await start(session.port);
  const result={version:manifest.version,archive,app,session,keptRunning:process.argv.includes('--keep-running'),checks};
  fs.writeFileSync(path.join(root,'.runtime','portable-smoke-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
main().catch(async error=>{console.error(error.stack||error.message);if(error.stdout)console.error(error.stdout);if(error.stderr)console.error(error.stderr);socket?.terminate();try{await stop();}catch{}process.exitCode=1;}).finally(()=>foreign?.close());
