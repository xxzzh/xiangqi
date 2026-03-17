const express = require('express');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Support environment variables for Electron packaged mode
const PUBLIC_PATH = process.env.PUBLIC_PATH || path.join(__dirname, 'public');
app.use(express.static(PUBLIC_PATH));

const ENGINE_PATH = process.env.ENGINE_PATH || path.join(__dirname, 'pikafish');
const NNUE_PATH = process.env.NNUE_PATH || path.join(__dirname, 'pikafish.nnue');

class PikafishEngine {
  constructor() {
    this.process = null;
    this.ready = false;
    this.analysisCallback = null;
    this.currentAnalysis = {};
    this.buffer = '';
    this.initResolve = null;
    this.initPhase = 'none'; // 'uci', 'ready', 'done'
  }

  start() {
    return new Promise((resolve, reject) => {
      this.initResolve = resolve;
      this.initPhase = 'uci';

      this.process = spawn(ENGINE_PATH, [], {
        cwd: path.dirname(ENGINE_PATH),
      });

      this.process.stdout.on('data', (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop();

        for (const line of lines) {
          this.handleLine(line.trim());
        }
      });

      this.process.stderr.on('data', (data) => {
        console.error('Engine stderr:', data.toString().trim());
      });

      this.process.on('error', (err) => {
        console.error('Engine spawn error:', err);
        reject(err);
      });

      this.process.on('close', (code) => {
        console.log('Engine exited with code:', code);
        this.ready = false;
      });

      this.send('uci');

      setTimeout(() => {
        if (!this.ready) {
          console.error('Engine startup timeout');
          reject(new Error('Engine startup timeout'));
        }
      }, 15000);
    });
  }

  handleLine(line) {
    if (!line) return;

    // Initialization phase
    if (this.initPhase === 'uci' && line === 'uciok') {
      console.log('Engine: uciok received');
      this.initPhase = 'ready';
      this.send(`setoption name EvalFile value ${NNUE_PATH}`);
      this.send('setoption name Threads value 2');
      this.send('setoption name Hash value 64');
      this.send('setoption name MultiPV value 3');
      this.send('isready');
      return;
    }

    if (this.initPhase === 'ready' && line === 'readyok') {
      console.log('Engine: readyok received — engine initialized');
      this.initPhase = 'done';
      this.ready = true;
      if (this.initResolve) {
        this.initResolve();
        this.initResolve = null;
      }
      return;
    }

    // Normal operation
    if (line === 'readyok') {
      this.ready = true;
      return;
    }

    if (line.startsWith('info depth') || line.startsWith('info string')) {
      if (line.startsWith('info depth')) {
        const info = this.parseInfo(line);
        if (info && info.multipv && info.depth >= 1) {
          this.currentAnalysis[info.multipv] = info;
        }
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      const bestmove = line.split(' ')[1];
      if (this.analysisCallback) {
        const results = Object.values(this.currentAnalysis)
          .sort((a, b) => a.multipv - b.multipv);
        this.analysisCallback({ bestmove, lines: results });
        this.analysisCallback = null;
      }
      return;
    }
  }

  parseInfo(line) {
    const info = {};
    const parts = line.split(' ');

    for (let i = 0; i < parts.length; i++) {
      switch (parts[i]) {
        case 'depth':
          info.depth = parseInt(parts[i + 1]);
          break;
        case 'multipv':
          info.multipv = parseInt(parts[i + 1]);
          break;
        case 'score':
          if (parts[i + 1] === 'cp') {
            info.score = parseInt(parts[i + 2]);
            info.scoreType = 'cp';
          } else if (parts[i + 1] === 'mate') {
            info.score = parseInt(parts[i + 2]);
            info.scoreType = 'mate';
          }
          break;
        case 'pv':
          info.pv = parts.slice(i + 1);
          i = parts.length;
          break;
        case 'nodes':
          info.nodes = parseInt(parts[i + 1]);
          break;
        case 'nps':
          info.nps = parseInt(parts[i + 1]);
          break;
        case 'time':
          info.time = parseInt(parts[i + 1]);
          break;
      }
    }

    return info.multipv ? info : null;
  }

  send(command) {
    if (this.process && this.process.stdin.writable) {
      this.process.stdin.write(command + '\n');
    }
  }

  analyze(fen, moves) {
    return new Promise((resolve, reject) => {
      this.currentAnalysis = {};
      this.analysisCallback = resolve;

      if (moves && moves.length > 0) {
        this.send(`position fen ${fen} moves ${moves.join(' ')}`);
      } else {
        this.send(`position fen ${fen}`);
      }
      this.send('go depth 15');

      // Timeout for analysis
      setTimeout(() => {
        if (this.analysisCallback === resolve) {
          this.send('stop');
        }
      }, 10000);
    });
  }

  newGame() {
    this.send('ucinewgame');
    this.send('isready');
  }

  stop() {
    this.send('stop');
  }

  quit() {
    this.send('quit');
    if (this.process) {
      this.process.kill();
    }
  }
}

// Global engine instance
let engine = null;

async function initEngine() {
  engine = new PikafishEngine();
  await engine.start();
  console.log('Pikafish engine ready');
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'analyze': {
          if (!engine || !engine.ready) {
            ws.send(JSON.stringify({ type: 'error', message: 'Engine not ready' }));
            return;
          }
          engine.stop();

          // Small delay after stop to let engine settle
          await new Promise(r => setTimeout(r, 50));

          const result = await engine.analyze(msg.fen, msg.moves);
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'analysis', data: result }));
          }
          break;
        }
        case 'newgame': {
          if (engine) engine.newGame();
          ws.send(JSON.stringify({ type: 'newgame_ok' }));
          break;
        }
        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown command' }));
      }
    } catch (err) {
      console.error('Message error:', err);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;

// Export a startServer function for Electron integration
async function startServer(overridePort) {
  await initEngine();
  const listenPort = overridePort !== undefined ? overridePort : PORT;
  return new Promise((resolve) => {
    server.listen(listenPort, () => {
      const actualPort = server.address().port;
      console.log(`\n🀄 Xiangqi server running at http://localhost:${actualPort}\n`);
      resolve(actualPort);
    });
  });
}

function stopEngine() {
  if (engine) engine.quit();
}

module.exports = { startServer, stopEngine };

// Auto-start when run directly (node server.js)
if (require.main === module) {
  startServer()
    .catch((err) => {
      console.error('Failed to start:', err);
      process.exit(1);
    });
}

process.on('SIGINT', () => {
  stopEngine();
  process.exit();
});

process.on('SIGTERM', () => {
  stopEngine();
  process.exit();
});
