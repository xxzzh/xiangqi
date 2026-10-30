// Movement rules adapted from vinybnb/xiangqi (MIT). See THIRD_PARTY.md.
(function(root) {
const ROWS=10, COLS=9;
const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

// Piece names in Chinese characters
const PIECE_CHARS = {
  'K': '帥', 'A': '仕', 'B': '相', 'N': '馬', 'R': '車', 'C': '炮', 'P': '兵',
  'k': '將', 'a': '士', 'b': '象', 'n': '馬', 'r': '車', 'c': '炮', 'p': '卒'
};

// Piece colors
function isRed(piece) { return piece >= 'A' && piece <= 'Z'; }
function isGreen(piece) { return piece >= 'a' && piece <= 'z'; }

class XiangqiRules {
  constructor(fen=START_FEN) { this.parseFEN(fen); }
  parseFEN(fen) {
    if (typeof fen !== 'string' || /[\r\n]/.test(fen)) throw new Error('局面格式不正确');
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    if (rows.length !== 10 || !['w','b'].includes(parts[1]) ||
        rows.some(row => !/^[rnbakcpRNBAKCP1-9]+$/.test(row) || [...row].reduce((n,c)=>n+(/\d/.test(c)?Number(c):1),0)!==9) ||
        [...parts[0]].filter(c=>c==='K').length!==1 || [...parts[0]].filter(c=>c==='k').length!==1) {
      throw new Error('FEN 必须为 10 行、每行 9 路，并各有一个将帅');
    }
    this.board = [];

    for (let r = 0; r < ROWS; r++) {
      this.board[r] = [];
      let col = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '9') {
          for (let i = 0; i < parseInt(ch); i++) {
            this.board[r][col++] = null;
          }
        } else {
          this.board[r][col++] = ch;
        }
      }
    }

    this.turn = parts.length > 1 ? parts[1] : 'w';
  }

  toFEN() {
    let fen = '';
    for (let r = 0; r < ROWS; r++) {
      let empty = 0;
      for (let c = 0; c < COLS; c++) {
        if (this.board[r][c]) {
          if (empty > 0) { fen += empty; empty = 0; }
          fen += this.board[r][c];
        } else {
          empty++;
        }
      }
      if (empty > 0) fen += empty;
      if (r < ROWS - 1) fen += '/';
    }
    return fen + ' ' + this.turn + ' - - 0 1';
  }

  getValidMoves(row, col) {
    const piece = this.board[row][col];
    if (!piece) return [];

    const type = piece.toUpperCase();
    let moves = [];

    switch (type) {
      case 'K': moves = this.getKingMoves(row, col, piece); break;
      case 'A': moves = this.getAdvisorMoves(row, col, piece); break;
      case 'B': moves = this.getBishopMoves(row, col, piece); break;
      case 'N': moves = this.getKnightMoves(row, col, piece); break;
      case 'R': moves = this.getRookMoves(row, col, piece); break;
      case 'C': moves = this.getCannonMoves(row, col, piece); break;
      case 'P': moves = this.getPawnMoves(row, col, piece); break;
    }

    // Filter out moves that leave king in check
    return moves.filter(([r, c]) => {
      const captured = this.board[r][c];
      this.board[r][c] = piece;
      this.board[row][col] = null;
      const inCheck = this.isKingExposed(piece);
      this.board[row][col] = piece;
      this.board[r][c] = captured;
      return !inCheck;
    });
  }

  isEnemy(piece, target) {
    if (!target) return false;
    return isRed(piece) !== isRed(target);
  }

  canMoveTo(piece, row, col) {
    if (row < 0 || row > 9 || col < 0 || col > 8) return false;
    const target = this.board[row][col];
    if (!target) return true;
    return this.isEnemy(piece, target);
  }

  getKingMoves(row, col, piece) {
    const moves = [];
    const red = isRed(piece);
    const minR = red ? 7 : 0;
    const maxR = red ? 9 : 2;
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= minR && nr <= maxR && nc >= 3 && nc <= 5) {
        if (this.canMoveTo(piece, nr, nc)) {
          moves.push([nr, nc]);
        }
      }
    }

    // Flying general rule - can "capture" opposing king across open file
    const dir = red ? -1 : 1;
    let r = row + dir;
    while (r >= 0 && r <= 9) {
      const target = this.board[r][col];
      if (target) {
        if (target.toUpperCase() === 'K' && this.isEnemy(piece, target)) {
          moves.push([r, col]);
        }
        break;
      }
      r += dir;
    }

    return moves;
  }

  getAdvisorMoves(row, col, piece) {
    const moves = [];
    const red = isRed(piece);
    const minR = red ? 7 : 0;
    const maxR = red ? 9 : 2;
    const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= minR && nr <= maxR && nc >= 3 && nc <= 5) {
        if (this.canMoveTo(piece, nr, nc)) {
          moves.push([nr, nc]);
        }
      }
    }
    return moves;
  }

  getBishopMoves(row, col, piece) {
    const moves = [];
    const red = isRed(piece);
    const minR = red ? 5 : 0;
    const maxR = red ? 9 : 4;
    const dirs = [[2, 2], [2, -2], [-2, 2], [-2, -2]];

    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      // Check blocking piece (elephant eye)
      const blockR = row + dr / 2;
      const blockC = col + dc / 2;
      if (nr >= minR && nr <= maxR && nc >= 0 && nc <= 8) {
        if (!this.board[blockR][blockC] && this.canMoveTo(piece, nr, nc)) {
          moves.push([nr, nc]);
        }
      }
    }
    return moves;
  }

  getKnightMoves(row, col, piece) {
    const moves = [];
    const knightMoves = [
      [-2, -1, -1, 0], [-2, 1, -1, 0],
      [2, -1, 1, 0], [2, 1, 1, 0],
      [-1, -2, 0, -1], [-1, 2, 0, 1],
      [1, -2, 0, -1], [1, 2, 0, 1]
    ];

    for (const [dr, dc, blockR, blockC] of knightMoves) {
      const nr = row + dr;
      const nc = col + dc;
      // Check hobbling leg
      if (!this.board[row + blockR]?.[col + blockC] && this.canMoveTo(piece, nr, nc)) {
        moves.push([nr, nc]);
      }
    }
    return moves;
  }

  getRookMoves(row, col, piece) {
    const moves = [];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    for (const [dr, dc] of dirs) {
      let nr = row + dr;
      let nc = col + dc;
      while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
        const target = this.board[nr][nc];
        if (!target) {
          moves.push([nr, nc]);
        } else {
          if (this.isEnemy(piece, target)) {
            moves.push([nr, nc]);
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
    return moves;
  }

  getCannonMoves(row, col, piece) {
    const moves = [];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    for (const [dr, dc] of dirs) {
      let nr = row + dr;
      let nc = col + dc;
      let jumped = false;

      while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
        const target = this.board[nr][nc];
        if (!jumped) {
          if (!target) {
            moves.push([nr, nc]);
          } else {
            jumped = true;
          }
        } else {
          if (target) {
            if (this.isEnemy(piece, target)) {
              moves.push([nr, nc]);
            }
            break;
          }
        }
        nr += dr;
        nc += dc;
      }
    }
    return moves;
  }

  getPawnMoves(row, col, piece) {
    const moves = [];
    const red = isRed(piece);

    if (red) {
      // Red pawns move up (decreasing row)
      if (row > 0 && this.canMoveTo(piece, row - 1, col)) moves.push([row - 1, col]);
      // After crossing river (row <= 4), can move sideways
      if (row <= 4) {
        if (col > 0 && this.canMoveTo(piece, row, col - 1)) moves.push([row, col - 1]);
        if (col < 8 && this.canMoveTo(piece, row, col + 1)) moves.push([row, col + 1]);
      }
    } else {
      // Green pawns move down (increasing row)
      if (row < 9 && this.canMoveTo(piece, row + 1, col)) moves.push([row + 1, col]);
      // After crossing river (row >= 5), can move sideways
      if (row >= 5) {
        if (col > 0 && this.canMoveTo(piece, row, col - 1)) moves.push([row, col - 1]);
        if (col < 8 && this.canMoveTo(piece, row, col + 1)) moves.push([row, col + 1]);
      }
    }
    return moves;
  }

  // Flying General check
  isKingExposed(movedPiece) {
    // Find both kings
    let redKing = null, greenKing = null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.board[r][c] === 'K') redKing = [r, c];
        if (this.board[r][c] === 'k') greenKing = [r, c];
      }
    }

    if (isRed(movedPiece) ? !redKing : !greenKing) return true;
    if (!redKing || !greenKing) return false;

    // Check if kings face each other
    if (redKing[1] === greenKing[1]) {
      let blocked = false;
      const minR = Math.min(redKing[0], greenKing[0]);
      const maxR = Math.max(redKing[0], greenKing[0]);
      for (let r = minR + 1; r < maxR; r++) {
        if (this.board[r][redKing[1]]) { blocked = true; break; }
      }
      if (!blocked) return true;
    }

    // Check if current side's king is in check
    const myKing = isRed(movedPiece) ? redKing : greenKing;
    return this.isUnderAttack(myKing[0], myKing[1], movedPiece);
  }

  isUnderAttack(row, col, friendlyPiece) {
    // Check all enemy pieces to see if they attack this square
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = this.board[r][c];
        if (!piece || !this.isEnemy(friendlyPiece, piece)) continue;

        const type = piece.toUpperCase();
        switch (type) {
          case 'R': {
            if (this.canRookAttack(r, c, row, col)) return true;
            break;
          }
          case 'C': {
            if (this.canCannonAttack(r, c, row, col)) return true;
            break;
          }
          case 'N': {
            if (this.canKnightAttack(r, c, row, col)) return true;
            break;
          }
          case 'P': {
            if (this.canPawnAttack(r, c, row, col, piece)) return true;
            break;
          }
          case 'K': {
            // Flying General
            if (c === col) {
              let blocked = false;
              const minR2 = Math.min(r, row);
              const maxR2 = Math.max(r, row);
              for (let k = minR2 + 1; k < maxR2; k++) {
                if (this.board[k][c]) { blocked = true; break; }
              }
              if (!blocked) return true;
            }
            break;
          }
        }
      }
    }
    return false;
  }

  canRookAttack(r1, c1, r2, c2) {
    if (r1 !== r2 && c1 !== c2) return false;
    if (r1 === r2) {
      const min = Math.min(c1, c2);
      const max = Math.max(c1, c2);
      for (let c = min + 1; c < max; c++) {
        if (this.board[r1][c]) return false;
      }
    } else {
      const min = Math.min(r1, r2);
      const max = Math.max(r1, r2);
      for (let r = min + 1; r < max; r++) {
        if (this.board[r][c1]) return false;
      }
    }
    return true;
  }

  canCannonAttack(r1, c1, r2, c2) {
    if (r1 !== r2 && c1 !== c2) return false;
    let count = 0;
    if (r1 === r2) {
      const min = Math.min(c1, c2);
      const max = Math.max(c1, c2);
      for (let c = min + 1; c < max; c++) {
        if (this.board[r1][c]) count++;
      }
    } else {
      const min = Math.min(r1, r2);
      const max = Math.max(r1, r2);
      for (let r = min + 1; r < max; r++) {
        if (this.board[r][c1]) count++;
      }
    }
    return count === 1;
  }

  canKnightAttack(r1, c1, r2, c2) {
    const dr = r2 - r1;
    const dc = c2 - c1;
    const knightAttacks = [
      [-2, -1, -1, 0], [-2, 1, -1, 0],
      [2, -1, 1, 0], [2, 1, 1, 0],
      [-1, -2, 0, -1], [-1, 2, 0, 1],
      [1, -2, 0, -1], [1, 2, 0, 1]
    ];
    for (const [mr, mc, blockR, blockC] of knightAttacks) {
      if (dr === mr && dc === mc) {
        return !this.board[r1 + blockR]?.[c1 + blockC];
      }
    }
    return false;
  }

  canPawnAttack(r1, c1, r2, c2, pawn) {
    const dr = r2 - r1;
    const dc = c2 - c1;
    const red = isRed(pawn);

    if (red) {
      if (dr === -1 && dc === 0) return true;
      if (r1 <= 4 && dr === 0 && Math.abs(dc) === 1) return true;
    } else {
      if (dr === 1 && dc === 0) return true;
      if (r1 >= 5 && dr === 0 && Math.abs(dc) === 1) return true;
    }
    return false;
  }

}
const coordinates = uci => {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(uci)) throw new Error('着法须为 a0a1 这样的坐标');
  return [9-Number(uci[1]),uci.charCodeAt(0)-97,9-Number(uci[3]),uci.charCodeAt(2)-97];
};
const toUCI = (r,c,nr,nc) => String.fromCharCode(97+c)+(9-r)+String.fromCharCode(97+nc)+(9-nr);
const positionKey = fen => fen.split(' ').slice(0,2).join(' ');
XiangqiRules.prototype.legalMoves = function() {
  const result=[];
  for(let r=0;r<10;r++) for(let c=0;c<9;c++) {
    const p=this.board[r][c];
    if(p && isRed(p)===(this.turn==='w')) for(const [nr,nc] of this.getValidMoves(r,c)) result.push(toUCI(r,c,nr,nc));
  }
  return result;
};
XiangqiRules.prototype.play = function(uci) {
  const [r,c,nr,nc]=coordinates(uci), p=this.board[r][c];
  if(!p || isRed(p)!==(this.turn==='w') || !this.getValidMoves(r,c).some(([a,b])=>a===nr&&b===nc)) throw new Error('非法着法：'+uci);
  const move={uci, from:[r,c], to:[nr,nc], piece:p, captured:this.board[nr][nc], fen:this.toFEN(), name:this.notation(uci)};
  this.board[nr][nc]=p; this.board[r][c]=null; this.turn=this.turn==='w'?'b':'w';
  return move;
};
XiangqiRules.prototype.notation = function(uci) {
  const [r,c,nr,nc]=coordinates(uci), p=this.board[r][c];
  if(!p) return uci;
  const red=isRed(p), nums=red?'零一二三四五六七八九':'0123456789';
  const names={K:'帅',k:'将',R:'车',r:'车',N:'马',n:'马',B:'相',b:'象',A:'仕',a:'士',C:'炮',c:'炮',P:'兵',p:'卒'};
  const same=this.board.map((row,i)=>row[c]===p?i:-1).filter(i=>i>=0).sort((a,b)=>red?a-b:b-a);
  let lead=names[p]+nums[red?9-c:c+1];
  if(same.length===2) lead=(same[0]===r?'前':'后')+names[p];
  else if(same.length===3) lead=['前','中','后'][same.indexOf(r)]+names[p];
  else if(same.length>3) lead=nums[same.indexOf(r)+1]+names[p];
  const action=nr===r?'平':(red?nr<r:nr>r)?'进':'退';
  const end=nr===r || 'NBA'.includes(p.toUpperCase()) ? (red?9-nc:nc+1):Math.abs(nr-r);
  return lead+action+nums[end];
};
const normalizeNotation = s => s.replace(/[車馬砲帥將後進]/g,c=>({'車':'车','馬':'马','砲':'炮','帥':'帅','將':'将','後':'后','進':'进'}[c])).replace(/[一二三四五六七八九]/g,c=>'123456789'['一二三四五六七八九'.indexOf(c)]).replace(/[１-９]/g,c=>String(c.charCodeAt(0)-0xff10));
function parseRecord(text) {
  if(typeof text!=='string'||text.length>200000) throw new Error('棋谱为空或过大（上限 200KB）');
  const fenMatch=text.match(/\[FEN\s+"([^"\r\n]+)"\]/i);
  const titleMatch=text.match(/\[Event\s+"([^"\r\n]*)"\]/i);
  const fen=fenMatch?fenMatch[1]:START_FEN;
  const game=new XiangqiRules(fen);
  for(let r=0;r<10;r++) for(let c=0;c<9;c++) {
    const p=game.board[r][c]; if(!p) continue;
    if(p.toUpperCase()==='K' && (c<3||c>5||(isRed(p)?r<7:r>2))) throw new Error('将帅必须位于各自九宫内');
  }
  if(game.isKingExposed(game.turn==='w'?'k':'K')) throw new Error('初始局面非法：非轮走方正被将军或将帅照面');
  let body=text.replace(/\[[^\]\r\n]*\]/g,' ').replace(/\{[^}]*\}/g,' ').replace(/;[^\r\n]*/g,' ');
  // PGN mainline only; skip nested variations without accidentally replaying them.
  let level=0, clean='', hasVariations=false;
  for(const ch of body) { if(ch==='('){level++;hasVariations=true;} else if(ch===')'){if(--level<0)throw new Error('棋谱变着括号不匹配');} else if(!level)clean+=ch; }
  if(level) throw new Error('棋谱变着括号不匹配');
  const tokens=clean.replace(/\d+\.(?:\.\.)?/g,' ').replace(/\$\d+/g,' ').replace(/[!?！？,，]/g,' ').trim().split(/\s+/).filter(Boolean);
  const moves=[];
  for(const token of tokens) {
    if(['*','1-0','0-1','1/2-1/2'].includes(token)) continue;
    if(moves.length>=600) throw new Error('单条棋谱最多支持 600 手');
    let uci=token.toLowerCase();
    if(!/^[a-i][0-9][a-i][0-9]$/.test(uci)) {
      const candidates=game.legalMoves().filter(m=>normalizeNotation(game.notation(m))===normalizeNotation(token));
      if(candidates.length!==1) throw new Error(`第 ${moves.length+1} 手无法识别或不合法：${token}。支持空格分隔的中文着法或坐标 PGN。`);
      uci=candidates[0];
    }
    game.play(uci); moves.push(uci);
  }
  if(!moves.length) throw new Error('棋谱中没有着法');
  return {title:titleMatch?.[1]||'导入的棋谱',fen,moves,hasVariations};
}
function redScore(line,turn) { return line.score*(turn==='w'?1:-1); }
const api={XiangqiRules,START_FEN,PIECE_CHARS,isRed,coordinates,toUCI,positionKey,parseRecord,redScore};
if(typeof module!=="undefined" && module.exports) module.exports=api;
else Object.assign(root,api);
})(globalThis);
