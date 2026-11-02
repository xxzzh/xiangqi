const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {WebSocket}=require('ws');
const {startServer,stopServer,parseInfo,validateRequest,PikafishEngine}=require('../server');
const {XiangqiRules,START_FEN}=require('../public/rules');
let started=false;
after(async()=>{if(started)await stopServer();});
function waitMessage(ws,predicate,timeout=15000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',listener);reject(new Error('message timeout'));},timeout);const listener=raw=>{const msg=JSON.parse(raw);if(msg.type==='error'||predicate(msg)){clearTimeout(timer);ws.off('message',listener);msg.type==='error'?reject(new Error(msg.message)):resolve(msg);}};ws.on('message',listener);});}
test('UCI parser accepts default multipv and preserves negative mate',()=>{
  assert.deepEqual(parseInfo('info depth 12 score mate -3 pv a0a1'),{scoreType:'mate',score:-3,pv:['a0a1'],depth:12,multipv:1,time:0});
  assert.equal(parseInfo('info depth 12 score cp 50 lowerbound pv a0a1'),null);
});
test('backend validates history and rejects command injection/illegal moves',()=>{
  assert.throws(()=>validateRequest({id:1,fen:START_FEN+'\nquit',moves:[],ms:500}));
  assert.throws(()=>validateRequest({id:1,fen:START_FEN,moves:['a0a9'],ms:500}));
  assert.equal(validateRequest({id:1,fen:START_FEN,moves:['h2e2'],ms:500}).currentFen.split(' ')[1],'b');
});
test('stream throttling always delivers the complete final analysis',()=>{
  const messages=[],engine=new PikafishEngine(message=>messages.push(message));
  engine.active={id:9,currentFen:START_FEN,lines:{}};
  for(let depth=1;depth<=20;depth++)engine.onLine(`info depth ${depth} multipv 1 score cp 25 pv h2e2 h9g7`);
  engine.onLine('info depth 20 multipv 2 score cp 22 pv b0c2 b9c7');engine.onLine('bestmove h2e2');
  assert(messages.length<=3);const final=messages.at(-1);assert.equal(final.done,true);assert.equal(final.data.lines.length,2);assert.equal(final.data.lines[0].depth,20);assert.equal(final.data.bestmove,'h2e2');
});
test('real Pikafish streams evaluation, replaces stale searches and isolates two boards',{timeout:40000},async()=>{
  const port=await startServer(0);started=true;
  const health=await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();assert.equal(health.version,require('../package.json').version);assert.match(health.instanceId,/^[a-f0-9]{16}$/);
  const ws=new WebSocket(`ws://127.0.0.1:${port}`);
  await waitMessage(ws,m=>m.type==='status'&&m.ready);
  const first=waitMessage(ws,m=>m.type==='analysis'&&m.id===1&&!m.done);
  ws.send(JSON.stringify({type:'analyze',id:1,fen:START_FEN,moves:[],ms:3000}));await first;
  const next=waitMessage(ws,m=>m.type==='analysis'&&m.id===2&&m.done);
  ws.send(JSON.stringify({type:'analyze',id:2,fen:START_FEN,moves:['h2e2'],ms:500}));
  const result=await next;const g=new XiangqiRules();g.play('h2e2');
  assert.equal(result.fen,g.toFEN());assert(g.legalMoves().includes(result.data.bestmove));assert(result.data.lines[0].depth>0);
  const other=new WebSocket(`ws://127.0.0.1:${port}`);await waitMessage(other,m=>m.type==='status'&&m.ready);
  const a=waitMessage(ws,m=>m.type==='analysis'&&m.id===3&&m.done),b=waitMessage(other,m=>m.type==='analysis'&&m.id===4&&m.done);
  ws.send(JSON.stringify({type:'analyze',id:3,fen:START_FEN,moves:['h2e2'],ms:500}));
  other.send(JSON.stringify({type:'analyze',id:4,fen:START_FEN,moves:[],ms:500}));
  const [ra,rb]=await Promise.all([a,b]);assert.equal(ra.fen,g.toFEN());assert.equal(rb.fen,START_FEN);
  assert(new XiangqiRules().legalMoves().includes(rb.data.bestmove));ws.close();other.close();
});
