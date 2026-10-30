const express = require('express');
const { WebSocketServer } = require('ws');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { XiangqiRules, START_FEN } = require('./public/rules');
const ENGINE_PATH = process.env.ENGINE_PATH || path.join(__dirname, 'engine', process.platform === 'win32' ? 'Pikafish-Windows-x86-64-universal.exe' : 'pikafish');
const NNUE_PATH = process.env.NNUE_PATH || path.join(__dirname, 'engine', 'pikafish.nnue');

function parseInfo(line) {
  const score = line.match(/\bscore (cp|mate) (-?\d+)/), pv = line.match(/\bpv (.+)$/);
  if (!score || !pv || /\b(lowerbound|upperbound)\b/.test(line)) return null;
  const value = name => Number(line.match(new RegExp(`\\b${name} (\\d+)`))?.[1] || 0);
  return { scoreType: score[1], score: Number(score[2]), pv: pv[1].trim().split(/\s+/), depth: value('depth'), multipv: value('multipv') || 1, time: value('time') };
}
class PikafishEngine {
  constructor(emit) { this.emit = emit; this.active = null; this.pending = null; this.ready = false; this.closed = false; }
  start() {
    return new Promise((resolve, reject) => {
      this.resolveStart = resolve; this.rejectStart = reject;
      this.startTimer = setTimeout(() => this.fail(new Error('引擎启动超时，请检查 engine 中的文件')), 15000);
      this.process = spawn(ENGINE_PATH, [], { cwd: path.dirname(ENGINE_PATH), windowsHide: true });
      let buffer = '';
      this.process.stdout.on('data', data => {
        buffer += data.toString(); const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) this.onLine(line.trim());
      });
      this.process.stderr.on('data', () => {});
      this.process.on('error', error => this.fail(error));
      this.process.on('exit', code => { if (!this.closed) this.fail(new Error(`引擎已退出（${code}），刷新页面可重试`)); });
      this.process.stdin.on('error', error => { if (!this.closed) this.fail(error); });
      this.send('uci');
    });
  }
  send(command) { if (this.process?.stdin.writable && !this.closed) this.process.stdin.write(command + '\n'); }
  onLine(line) {
    if (line === 'uciok') {
      this.send(`setoption name EvalFile value ${NNUE_PATH}`);
      this.send('setoption name Threads value 2'); this.send('setoption name Hash value 64'); this.send('setoption name MultiPV value 3'); this.send('isready');
    } else if (line === 'readyok' && !this.ready) {
      clearTimeout(this.startTimer); this.ready = true; this.resolveStart?.(); this.resolveStart = null; this.rejectStart = null; this.pump();
    } else if (line.startsWith('info ') && this.active) {
      const info = parseInfo(line);
      if (info) { this.active.lines[info.multipv] = info; if (!this.active.cancelled) this.emitResult(false); }
    } else if (line.startsWith('bestmove ') && this.active) {
      clearTimeout(this.searchTimer);
      if (!this.active.cancelled) this.emitResult(true, line.split(/\s+/)[1]);
      this.active = null; this.pump();
    }
  }
  emitResult(done, bestmove) {
    // Keep evaluation live without rebuilding the browser's candidate list for every UCI line.
    const now=Date.now();
    if(!done&&this.active.lastEmission&&now-this.active.lastEmission<100)return;
    this.active.lastEmission=now;
    this.emit({ type: 'analysis', id: this.active.id, fen: this.active.currentFen, done, data: { bestmove, lines: Object.values(this.active.lines).sort((a,b) => a.multipv-b.multipv) } });
  }
  submit(request) {
    this.pending = request;
    if (this.active) { this.active.cancelled = true; this.send('stop'); } else this.pump();
  }
  pump() {
    if (!this.ready || this.closed || this.active || !this.pending) return;
    this.active = { ...this.pending, lines: {} }; this.pending = null;
    const { fen, moves, ms } = this.active;
    this.send(`position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`); this.send(`go movetime ${ms}`);
    this.searchTimer = setTimeout(() => this.fail(new Error('引擎计算超时，刷新页面重试')), ms + 8000);
  }
  cancel() { this.pending = null; if (this.active) { this.active.cancelled = true; this.send('stop'); } }
  fail(error) {
    if (this.closed) return;
    this.rejectStart?.(error); this.rejectStart = null;
    this.emit({ type: 'error', message: error.message }); this.quit();
  }
  quit() {
    if (this.closed) return;
    this.send('quit'); this.closed = true; this.ready = false;
    clearTimeout(this.startTimer); clearTimeout(this.searchTimer); this.process?.kill();
  }
}
function validateRequest(msg) {
  if (!Number.isSafeInteger(msg.id) || !Array.isArray(msg.moves) || msg.moves.length > 600 || ![500,1500,3000].includes(msg.ms)) throw new Error('分析请求参数不正确');
  const fen = msg.fen || START_FEN, game = new XiangqiRules(fen);
  for (const move of msg.moves) game.play(move);
  return { id: msg.id, fen, moves: msg.moves, ms: msg.ms, currentFen: game.toFEN() };
}
const app = express(); app.disable('x-powered-by');
app.get('/api/health', (_req,res) => res.json({ app: 'xiangqi-study', ok: true, engineInstalled: fs.existsSync(ENGINE_PATH) && fs.existsSync(NNUE_PATH) }));
app.use(express.static(process.env.PUBLIC_PATH || path.join(__dirname, 'public')));
const server = http.createServer(app), engines = new Set();
const wss = new WebSocketServer({ server, maxPayload: 32768, verifyClient: ({req}) => !req.headers.origin || req.headers.origin === `http://${req.headers.host}` });
wss.on('connection', ws => {
  const emit = message => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); };
  if (engines.size >= 4) { emit({type:'error',message:'最多同时打开 4 个棋盘，请关闭多余页面'}); ws.close(); return; }
  const engine = new PikafishEngine(emit); engines.add(engine); emit({type:'status',ready:false});
  engine.start().then(() => { if (ws.readyState === 1) emit({type:'status',ready:true}); else engine.quit(); }).catch(() => {});
  ws.on('message', data => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'cancel') { engine.cancel(); return; }
      if (msg.type !== 'analyze') throw new Error('未知请求');
      if (!engine.ready) throw new Error('引擎尚未就绪，请稍后重试或刷新页面');
      engine.submit(validateRequest(msg));
    } catch(error) { emit({type:'error',message:error.message}); }
  });
  ws.on('error', () => {}); ws.on('close', () => { engine.quit(); engines.delete(engine); });
});
async function startServer(port = Number(process.env.PORT || 3000)) {
  return new Promise((resolve,reject) => {
    server.once('error',reject);
    server.listen(port, '127.0.0.1', () => { const actual=server.address().port; console.log(`象棋研习室：http://127.0.0.1:${actual}`); resolve(actual); });
  });
}
function stopEngine() { for(const engine of engines) engine.quit(); }
async function stopServer() { stopEngine(); for(const client of wss.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); }
module.exports = { startServer, stopServer, stopEngine, PikafishEngine, parseInfo, validateRequest };
if (require.main === module) startServer().catch(error => { console.error(error.message); process.exitCode=1; });
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{stopEngine();process.exit();});
