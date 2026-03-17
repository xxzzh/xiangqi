// ===== XIANGQI GAME ENGINE =====
// Complete Chinese Chess implementation with Pikafish integration

const SVG_NS = 'http://www.w3.org/2000/svg';

// Board dimensions
const COLS = 9;
const ROWS = 10;
const CELL = 56;
const MARGIN_X = 32;
const MARGIN_Y = 30;
const PIECE_R = 24;

// Starting FEN for Xiangqi
const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

// Piece names in Chinese characters
const PIECE_CHARS = {
  'K': '帥', 'A': '仕', 'B': '相', 'N': '馬', 'R': '車', 'C': '炮', 'P': '兵',
  'k': '將', 'a': '士', 'b': '象', 'n': '馬', 'r': '車', 'c': '炮', 'p': '卒'
};

// Piece colors
function isRed(piece) { return piece >= 'A' && piece <= 'Z'; }
function isGreen(piece) { return piece >= 'a' && piece <= 'z'; }

class XiangqiGame {
  constructor() {
    this.board = [];
    this.turn = 'w'; // 'w' = red, 'b' = green/black
    this.moveHistory = [];
    this.selectedSquare = null;
    this.validMoves = [];
    this.ws = null;
    this.engineReady = false;
    this.analyzing = false;
    this.bestMoveArrows = [];
    this.flipped = false; // false = Red at bottom, true = Red at top
    this.gameOver = false;
    this.positionHistory = new Map(); // Track position counts for repetition detection

    this.svgEl = document.getElementById('board-svg');
    this.piecesGroup = null;
    this.highlightGroup = null;
    this.arrowGroup = null;

    this.init();
  }

  // ===== COORDINATE HELPERS (for flipped board) =====
  viewCol(col) { return this.flipped ? (8 - col) : col; }
  viewRow(row) { return this.flipped ? (9 - row) : row; }
  viewX(col) { return MARGIN_X + this.viewCol(col) * CELL; }
  viewY(row) { return MARGIN_Y + this.viewRow(row) * CELL; }

  init() {
    this.parseFEN(START_FEN);
    this.drawBoard();
    this.drawPieces();
    this.setupEventListeners();
    this.connectEngine();
  }

  // ===== FEN PARSING =====
  parseFEN(fen) {
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
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

  // ===== SVG BOARD DRAWING =====
  drawBoard() {
    const svg = this.svgEl;
    svg.innerHTML = '';

    // Background
    const bg = this.createSVG('rect', {
      x: 0, y: 0, width: 540, height: 600,
      fill: '#f5e6c8',
      rx: 12
    });
    svg.appendChild(bg);

    // Outer border
    const border = this.createSVG('rect', {
      x: MARGIN_X - 16, y: MARGIN_Y - 14,
      width: CELL * 8 + 32, height: CELL * 9 + 28,
      fill: 'none', stroke: '#6b4f2f', 'stroke-width': 3,
      rx: 4
    });
    svg.appendChild(border);

    // Inner border
    const inner = this.createSVG('rect', {
      x: MARGIN_X - 10, y: MARGIN_Y - 8,
      width: CELL * 8 + 20, height: CELL * 9 + 16,
      fill: 'none', stroke: '#6b4f2f', 'stroke-width': 1.5,
      rx: 2
    });
    svg.appendChild(inner);

    // Lines group
    const linesGroup = this.createSVG('g', { stroke: '#6b4f2f', 'stroke-width': 1.2 });
    svg.appendChild(linesGroup);

    // Horizontal lines
    for (let r = 0; r < ROWS; r++) {
      linesGroup.appendChild(this.createSVG('line', {
        x1: MARGIN_X, y1: MARGIN_Y + r * CELL,
        x2: MARGIN_X + 8 * CELL, y2: MARGIN_Y + r * CELL
      }));
    }

    // Vertical lines (split at river)
    for (let c = 0; c < COLS; c++) {
      if (c === 0 || c === 8) {
        // Edge lines go full height
        linesGroup.appendChild(this.createSVG('line', {
          x1: MARGIN_X + c * CELL, y1: MARGIN_Y,
          x2: MARGIN_X + c * CELL, y2: MARGIN_Y + 9 * CELL
        }));
      } else {
        // Top half
        linesGroup.appendChild(this.createSVG('line', {
          x1: MARGIN_X + c * CELL, y1: MARGIN_Y,
          x2: MARGIN_X + c * CELL, y2: MARGIN_Y + 4 * CELL
        }));
        // Bottom half
        linesGroup.appendChild(this.createSVG('line', {
          x1: MARGIN_X + c * CELL, y1: MARGIN_Y + 5 * CELL,
          x2: MARGIN_X + c * CELL, y2: MARGIN_Y + 9 * CELL
        }));
      }
    }

    // Palace diagonals - top (green/black side)
    linesGroup.appendChild(this.createSVG('line', {
      x1: MARGIN_X + 3 * CELL, y1: MARGIN_Y,
      x2: MARGIN_X + 5 * CELL, y2: MARGIN_Y + 2 * CELL
    }));
    linesGroup.appendChild(this.createSVG('line', {
      x1: MARGIN_X + 5 * CELL, y1: MARGIN_Y,
      x2: MARGIN_X + 3 * CELL, y2: MARGIN_Y + 2 * CELL
    }));

    // Palace diagonals - bottom (red side)
    linesGroup.appendChild(this.createSVG('line', {
      x1: MARGIN_X + 3 * CELL, y1: MARGIN_Y + 7 * CELL,
      x2: MARGIN_X + 5 * CELL, y2: MARGIN_Y + 9 * CELL
    }));
    linesGroup.appendChild(this.createSVG('line', {
      x1: MARGIN_X + 5 * CELL, y1: MARGIN_Y + 7 * CELL,
      x2: MARGIN_X + 3 * CELL, y2: MARGIN_Y + 9 * CELL
    }));

    // River text
    const riverY = MARGIN_Y + 4.5 * CELL;
    const riverBg = this.createSVG('rect', {
      x: MARGIN_X + CELL * 0.5, y: riverY - 16,
      width: CELL * 7, height: 32,
      fill: '#f5e6c8', opacity: 0.9
    });
    svg.appendChild(riverBg);

    // When flipped, swap the river text positions
    const leftText = this.flipped ? '漢界' : '楚河';
    const rightText = this.flipped ? '楚河' : '漢界';

    const riverText1 = this.createSVG('text', {
      x: MARGIN_X + CELL * 2, y: riverY + 6,
      'font-family': "'Noto Serif SC', serif",
      'font-size': '22',
      'font-weight': '600',
      fill: '#8b7355',
      'text-anchor': 'middle',
      'letter-spacing': '12'
    });
    riverText1.textContent = leftText;
    svg.appendChild(riverText1);

    const riverText2 = this.createSVG('text', {
      x: MARGIN_X + CELL * 6, y: riverY + 6,
      'font-family': "'Noto Serif SC', serif",
      'font-size': '22',
      'font-weight': '600',
      fill: '#8b7355',
      'text-anchor': 'middle',
      'letter-spacing': '12'
    });
    riverText2.textContent = rightText;
    svg.appendChild(riverText2);

    // Position markers (small crosses at cannon and pawn positions)
    const markerPositions = [
      [2, 1], [2, 7], [7, 1], [7, 7], // cannons
      [3, 0], [3, 2], [3, 4], [3, 6], [3, 8], // green pawns
      [6, 0], [6, 2], [6, 4], [6, 6], [6, 8], // red pawns
    ];
    const markersGroup = this.createSVG('g', { stroke: '#8b7355', 'stroke-width': 1 });
    svg.appendChild(markersGroup);
    for (const [r, c] of markerPositions) {
      this.drawPositionMarker(markersGroup, this.viewCol(c), this.viewRow(r));
    }

    // Highlight and arrow layers
    this.highlightGroup = this.createSVG('g', { id: 'highlights' });
    svg.appendChild(this.highlightGroup);

    this.arrowGroup = this.createSVG('g', { id: 'arrows' });
    svg.appendChild(this.arrowGroup);

    // Arrow marker definitions — colors set dynamically per arrow
    const defs = this.createSVG('defs', {});

    // Red arrowheads
    const markerRedBest = this.createSVG('marker', {
      id: 'arrowhead-red-best', markerWidth: 6, markerHeight: 5,
      refX: 5, refY: 2.5, orient: 'auto'
    });
    markerRedBest.appendChild(this.createSVG('polygon', {
      points: '0 0, 6 2.5, 0 5', fill: 'rgba(220, 50, 40, 0.9)'
    }));
    defs.appendChild(markerRedBest);

    const markerRedAlt = this.createSVG('marker', {
      id: 'arrowhead-red-alt', markerWidth: 6, markerHeight: 5,
      refX: 5, refY: 2.5, orient: 'auto'
    });
    markerRedAlt.appendChild(this.createSVG('polygon', {
      points: '0 0, 6 2.5, 0 5', fill: 'rgba(220, 50, 40, 0.55)'
    }));
    defs.appendChild(markerRedAlt);

    // Green arrowheads
    const markerGreenBest = this.createSVG('marker', {
      id: 'arrowhead-green-best', markerWidth: 6, markerHeight: 5,
      refX: 5, refY: 2.5, orient: 'auto'
    });
    markerGreenBest.appendChild(this.createSVG('polygon', {
      points: '0 0, 6 2.5, 0 5', fill: 'rgba(20, 160, 80, 0.9)'
    }));
    defs.appendChild(markerGreenBest);

    const markerGreenAlt = this.createSVG('marker', {
      id: 'arrowhead-green-alt', markerWidth: 6, markerHeight: 5,
      refX: 5, refY: 2.5, orient: 'auto'
    });
    markerGreenAlt.appendChild(this.createSVG('polygon', {
      points: '0 0, 6 2.5, 0 5', fill: 'rgba(20, 160, 80, 0.55)'
    }));
    defs.appendChild(markerGreenAlt);

    svg.appendChild(defs);

    // Pieces layer
    this.piecesGroup = this.createSVG('g', { id: 'pieces' });
    svg.appendChild(this.piecesGroup);
  }

  drawPositionMarker(parent, col, row) {
    const cx = MARGIN_X + col * CELL;
    const cy = MARGIN_Y + row * CELL;
    const s = 5;
    const g = 3;

    const drawL = (px, py, dx, dy) => {
      // horizontal part
      parent.appendChild(this.createSVG('line', {
        x1: px, y1: py, x2: px + dx * s, y2: py
      }));
      // vertical part
      parent.appendChild(this.createSVG('line', {
        x1: px, y1: py, x2: px, y2: py + dy * s
      }));
    };

    if (col > 0) {
      drawL(cx - g, cy - g, -1, -1);
      drawL(cx - g, cy + g, -1, 1);
    }
    if (col < 8) {
      drawL(cx + g, cy - g, 1, -1);
      drawL(cx + g, cy + g, 1, 1);
    }
  }

  // ===== PIECE RENDERING =====
  drawPieces() {
    this.piecesGroup.innerHTML = '';

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = this.board[r][c];
        if (piece) {
          this.drawPiece(c, r, piece);
        }
      }
    }
  }

  drawPiece(col, row, piece) {
    const cx = this.viewX(col);
    const cy = this.viewY(row);
    const red = isRed(piece);
    const color = red ? '#c0392b' : '#0e7a46';
    const bgColor = red ? '#fdf6f0' : '#f0fdf6';
    const borderColor = red ? '#a52f23' : '#0a5e36';

    const g = this.createSVG('g', {
      class: 'piece',
      'data-row': row,
      'data-col': col,
      cursor: 'pointer',
      transform: `translate(${cx}, ${cy})`
    });

    // Shadow
    g.appendChild(this.createSVG('circle', {
      cx: 1, cy: 2, r: PIECE_R,
      fill: 'rgba(0,0,0,0.15)'
    }));

    // Outer ring
    g.appendChild(this.createSVG('circle', {
      cx: 0, cy: 0, r: PIECE_R,
      fill: bgColor,
      stroke: borderColor,
      'stroke-width': 2
    }));

    // Inner ring
    g.appendChild(this.createSVG('circle', {
      cx: 0, cy: 0, r: PIECE_R - 4,
      fill: 'none',
      stroke: borderColor,
      'stroke-width': 1,
      opacity: 0.5
    }));

    // Chinese character
    const text = this.createSVG('text', {
      x: 0, y: 7,
      'font-family': "'Noto Serif SC', serif",
      'font-size': '22',
      'font-weight': '700',
      fill: color,
      'text-anchor': 'middle',
      'pointer-events': 'none'
    });
    text.textContent = PIECE_CHARS[piece];
    g.appendChild(text);

    this.piecesGroup.appendChild(g);
  }

  // ===== EVENT HANDLING =====
  setupEventListeners() {
    this.svgEl.addEventListener('click', (e) => this.handleBoardClick(e));
    document.getElementById('btn-undo').addEventListener('click', () => this.undoMove());
    document.getElementById('btn-new').addEventListener('click', () => this.newGame());
    document.getElementById('btn-flip').addEventListener('click', () => this.flipBoard());
  }

  flipBoard() {
    this.flipped = !this.flipped;
    this.clearSelection();
    this.drawBoard();
    this.drawPieces();
    // Redraw last move highlight if there is one
    if (this.moveHistory.length > 0) {
      const last = this.moveHistory[this.moveHistory.length - 1];
      this.drawLastMoveHighlight(last.from[0], last.from[1], last.to[0], last.to[1]);
    }
    // Re-request analysis to redraw arrows
    if (this.lastAnalysisData) {
      this.handleAnalysis(this.lastAnalysisData);
    }
  }

  handleBoardClick(e) {
    if (this.gameOver) return;
    const rect = this.svgEl.getBoundingClientRect();
    const scaleX = 540 / rect.width;
    const scaleY = 600 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let col = Math.round((x - MARGIN_X) / CELL);
    let row = Math.round((y - MARGIN_Y) / CELL);

    // Convert visual coordinates back to logical coordinates
    if (this.flipped) {
      col = 8 - col;
      row = 9 - row;
    }

    if (col < 0 || col > 8 || row < 0 || row > 9) return;

    const piece = this.board[row][col];

    if (this.selectedSquare) {
      const [sr, sc] = this.selectedSquare;

      // Clicking the same square - deselect
      if (sr === row && sc === col) {
        this.clearSelection();
        return;
      }

      // Clicking another own piece - reselect
      if (piece && this.isOwnPiece(piece)) {
        this.clearSelection();
        this.selectSquare(row, col);
        return;
      }

      // Try to make the move
      if (this.isValidMove(sr, sc, row, col)) {
        this.makeMove(sr, sc, row, col);
      } else {
        this.clearSelection();
      }
    } else {
      if (piece && this.isOwnPiece(piece)) {
        this.selectSquare(row, col);
      }
    }
  }

  isOwnPiece(piece) {
    if (this.turn === 'w') return isRed(piece);
    return isGreen(piece);
  }

  selectSquare(row, col) {
    this.selectedSquare = [row, col];
    this.validMoves = this.getValidMoves(row, col);
    this.drawHighlights();
  }

  clearSelection() {
    this.selectedSquare = null;
    this.validMoves = [];
    this.highlightGroup.innerHTML = '';
  }

  drawHighlights() {
    this.highlightGroup.innerHTML = '';

    // Selected square highlight
    const [sr, sc] = this.selectedSquare;
    const selCx = this.viewX(sc);
    const selCy = this.viewY(sr);
    this.highlightGroup.appendChild(this.createSVG('circle', {
      cx: selCx, cy: selCy, r: PIECE_R + 3,
      fill: 'none',
      stroke: '#d4a04a',
      'stroke-width': 3,
      opacity: 0.9
    }));

    // Valid move highlights
    for (const [r, c] of this.validMoves) {
      const cx = this.viewX(c);
      const cy = this.viewY(r);

      if (this.board[r][c]) {
        // Capture highlight - red ring
        this.highlightGroup.appendChild(this.createSVG('circle', {
          cx, cy, r: PIECE_R + 3,
          fill: 'none',
          stroke: '#e74c3c',
          'stroke-width': 3,
          'stroke-dasharray': '6,3',
          opacity: 0.8
        }));
      } else {
        // Move dot
        this.highlightGroup.appendChild(this.createSVG('circle', {
          cx, cy, r: 6,
          fill: 'rgba(212, 160, 74, 0.5)'
        }));
      }
    }
  }

  // ===== MOVE VALIDATION =====
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

    if (!redKing || !greenKing) return true;

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

  isValidMove(fromR, fromC, toR, toC) {
    return this.validMoves.some(([r, c]) => r === toR && c === toC);
  }

  // ===== MAKING MOVES =====
  makeMove(fromR, fromC, toR, toC) {
    const piece = this.board[fromR][fromC];
    const captured = this.board[toR][toC];

    // Save move to history
    this.moveHistory.push({
      from: [fromR, fromC],
      to: [toR, toC],
      piece,
      captured,
      fen: this.toFEN()
    });

    // Execute move
    this.board[toR][toC] = piece;
    this.board[fromR][fromC] = null;
    this.turn = this.turn === 'w' ? 'b' : 'w';

    // Track position for repetition detection
    const posKey = this.toFEN().split(' ').slice(0, 2).join(' '); // board + turn
    const count = (this.positionHistory.get(posKey) || 0) + 1;
    this.positionHistory.set(posKey, count);

    // Update UI
    this.clearSelection();
    this.drawPieces();
    this.drawLastMoveHighlight(fromR, fromC, toR, toC);
    this.updateTurnIndicator();
    this.updateMoveHistory();
    this.updateUndoButton();

    // Check for 3-fold repetition (perpetual check / perpetual chase)
    if (count >= 3) {
      // The side that just moved caused the repetition — they lose
      const loser = this.turn === 'w' ? 'Red' : 'Green'; // current turn is the opponent
      const winner = this.turn === 'w' ? 'Green' : 'Red';
      // Wait — the side that JUST moved is the one who repeated, which is the PREVIOUS turn
      // After making the move, this.turn flipped, so the side that moved is the opposite of current turn
      const repeater = this.turn === 'w' ? 'Green' : 'Red';
      const beneficiary = this.turn === 'w' ? 'Red' : 'Green';
      this.gameOver = true;
      this.showVictory(beneficiary, 'Perpetual repetition — ' + repeater + ' must change moves');
      return;
    }

    // Check for game over (no available moves for current player)
    if (!this.hasAnyValidMoves()) {
      const winner = this.turn === 'w' ? 'Green' : 'Red';
      this.gameOver = true;
      this.showVictory(winner, 'Checkmate — no available moves');
      return;
    }

    // Request analysis
    this.requestAnalysis();
  }

  // Check if current player has any valid moves
  hasAnyValidMoves() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = this.board[r][c];
        if (!piece || !this.isOwnPiece(piece)) continue;
        const moves = this.getValidMoves(r, c);
        if (moves.length > 0) return true;
      }
    }
    return false;
  }

  // Show victory overlay
  showVictory(winner, reason) {
    const isRed = winner === 'Red';
    const color = isRed ? '#c0392b' : '#0e7a46';
    const charText = isRed ? '紅勝' : '綠勝';
    const emoji = '🏆';

    // Remove existing overlay if any
    const existing = document.getElementById('victory-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'victory-overlay';
    overlay.innerHTML = `
      <div class="victory-card">
        <div class="victory-emoji">${emoji}</div>
        <div class="victory-char" style="color: ${color}">${charText}</div>
        <div class="victory-text">${winner} Wins!</div>
        <div class="victory-sub">${reason || 'Game over'}</div>
        <button class="victory-btn" id="victory-new-game">⟳ New Game</button>
        <button class="victory-btn victory-btn-undo" id="victory-undo">↩ Undo Last Move</button>
      </div>
    `;

    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; animation: fadeIn 0.3s ease;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      .victory-card {
        background: linear-gradient(135deg, #2d2638, #1a1520);
        border: 2px solid ${color}44;
        border-radius: 16px; padding: 40px 48px; text-align: center;
        box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 40px ${color}22;
        animation: scaleIn 0.4s ease;
      }
      .victory-emoji { font-size: 3rem; margin-bottom: 8px; }
      .victory-char {
        font-family: 'Noto Serif SC', serif; font-size: 2.5rem;
        font-weight: 700; margin-bottom: 4px;
      }
      .victory-text {
        font-size: 1.3rem; font-weight: 600;
        color: #f0e6d3; margin-bottom: 6px;
      }
      .victory-sub {
        font-size: 0.85rem; color: #6b5f75; margin-bottom: 24px;
      }
      .victory-btn {
        display: block; width: 100%; padding: 12px 24px;
        margin-top: 8px; border: 1px solid ${color}44;
        border-radius: 8px; background: ${color}22;
        color: #f0e6d3; font-size: 0.95rem; font-weight: 500;
        cursor: pointer; transition: all 0.2s;
        font-family: 'Inter', system-ui, sans-serif;
      }
      .victory-btn:hover { background: ${color}44; border-color: ${color}; }
      .victory-btn-undo { background: transparent; border-color: rgba(255,255,255,0.1); }
      .victory-btn-undo:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); }
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    document.getElementById('victory-new-game').addEventListener('click', () => {
      overlay.remove(); style.remove();
      this.newGame();
    });
    document.getElementById('victory-undo').addEventListener('click', () => {
      overlay.remove(); style.remove();
      this.undoMove();
    });
  }

  drawLastMoveHighlight(fromR, fromC, toR, toC) {
    // Clear old arrows first
    this.arrowGroup.innerHTML = '';

    const fromCx = this.viewX(fromC);
    const fromCy = this.viewY(fromR);
    const toCx = this.viewX(toC);
    const toCy = this.viewY(toR);

    // From square
    this.highlightGroup.appendChild(this.createSVG('rect', {
      x: fromCx - CELL / 2 + 2, y: fromCy - CELL / 2 + 2,
      width: CELL - 4, height: CELL - 4,
      fill: 'rgba(212, 160, 74, 0.15)',
      stroke: 'rgba(212, 160, 74, 0.3)',
      'stroke-width': 1.5,
      rx: 4
    }));

    // To square
    this.highlightGroup.appendChild(this.createSVG('rect', {
      x: toCx - CELL / 2 + 2, y: toCy - CELL / 2 + 2,
      width: CELL - 4, height: CELL - 4,
      fill: 'rgba(212, 160, 74, 0.2)',
      stroke: 'rgba(212, 160, 74, 0.5)',
      'stroke-width': 1.5,
      rx: 4
    }));
  }

  // ===== UNDO =====
  undoMove() {
    if (this.moveHistory.length === 0) return;

    // Decrement position count before restoring
    const posKey = this.toFEN().split(' ').slice(0, 2).join(' ');
    const count = this.positionHistory.get(posKey) || 0;
    if (count > 1) {
      this.positionHistory.set(posKey, count - 1);
    } else {
      this.positionHistory.delete(posKey);
    }

    this.gameOver = false;
    const lastMove = this.moveHistory.pop();
    this.board[lastMove.from[0]][lastMove.from[1]] = lastMove.piece;
    this.board[lastMove.to[0]][lastMove.to[1]] = lastMove.captured;
    this.turn = this.turn === 'w' ? 'b' : 'w';

    this.clearSelection();
    this.arrowGroup.innerHTML = '';
    this.drawPieces();
    this.updateTurnIndicator();
    this.updateMoveHistory();
    this.updateUndoButton();

    // Update analysis display
    if (this.moveHistory.length > 0) {
      this.requestAnalysis();
    } else {
      this.clearAnalysis();
    }
  }

  // ===== NEW GAME =====
  newGame() {
    this.gameOver = false;
    this.positionHistory = new Map();
    this.parseFEN(START_FEN);
    this.moveHistory = [];
    this.clearSelection();
    this.arrowGroup.innerHTML = '';
    this.drawPieces();
    this.updateTurnIndicator();
    this.updateMoveHistory();
    this.updateUndoButton();
    this.clearAnalysis();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'newgame' }));
    }
  }

  // ===== UI UPDATES =====
  updateTurnIndicator() {
    const indicator = document.getElementById('turn-indicator');
    const dot = indicator.querySelector('.turn-dot');
    const text = document.getElementById('turn-text');

    dot.className = 'turn-dot ' + (this.turn === 'w' ? 'red-dot' : 'green-dot');
    text.textContent = this.turn === 'w' ? "Red's Turn" : "Green's Turn";
  }

  updateUndoButton() {
    document.getElementById('btn-undo').disabled = this.moveHistory.length === 0;
  }

  updateMoveHistory() {
    const list = document.getElementById('move-list');
    if (this.moveHistory.length === 0) {
      list.innerHTML = '<div class="empty-history">No moves yet</div>';
      return;
    }

    list.innerHTML = '';
    this.moveHistory.forEach((move, i) => {
      const red = isRed(move.piece);
      const entry = document.createElement('div');
      entry.className = 'move-entry';
      entry.innerHTML = `
        <span class="move-number">${i + 1}.</span>
        <span class="move-piece-icon">${PIECE_CHARS[move.piece]}</span>
        <span class="move-text ${red ? 'red' : 'green'}">${this.formatMove(move)}</span>
      `;
      list.appendChild(entry);
    });

    list.scrollTop = list.scrollHeight;
  }

  formatMove(move) {
    const colLabels = 'abcdefghi';
    const from = colLabels[move.from[1]] + (9 - move.from[0]);
    const to = colLabels[move.to[1]] + (9 - move.to[0]);
    const capture = move.captured ? '×' : '→';
    return `${from} ${capture} ${to}`;
  }

  // ===== ENGINE COMMUNICATION =====
  connectEngine() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);

    this.ws.addEventListener('open', () => {
      this.engineReady = true;
      this.updateEngineStatus('connected', 'Engine ready');
    });

    this.ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'analysis') {
        this.handleAnalysis(msg.data);
      }
    });

    this.ws.addEventListener('close', () => {
      this.engineReady = false;
      this.updateEngineStatus('connecting', 'Disconnected. Reconnecting...');
      setTimeout(() => this.connectEngine(), 3000);
    });

    this.ws.addEventListener('error', () => {
      this.updateEngineStatus('connecting', 'Connection error');
    });
  }

  updateEngineStatus(status, text) {
    const el = document.getElementById('engine-status');
    el.innerHTML = `<span class="status-dot ${status}"></span> ${text}`;
  }

  requestAnalysis() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.analyzing = true;
    this.updateEngineStatus('analyzing', 'Analyzing...');

    this.ws.send(JSON.stringify({
      type: 'analyze',
      fen: this.toFEN()
    }));
  }

  handleAnalysis(data) {
    this.analyzing = false;
    this.lastAnalysisData = data; // Store for flip redraw
    this.updateEngineStatus('connected', 'Engine ready');

    const linesEl = document.getElementById('analysis-lines');
    linesEl.innerHTML = '';

    // Clear old arrows
    this.arrowGroup.innerHTML = '';

    // Re-add last move highlight
    if (this.moveHistory.length > 0) {
      const last = this.moveHistory[this.moveHistory.length - 1];
      this.drawLastMoveHighlight(last.from[0], last.from[1], last.to[0], last.to[1]);
    }

    if (!data.lines || data.lines.length === 0) {
      linesEl.innerHTML = '<div class="empty-analysis">No analysis available</div>';
      return;
    }

    const rankClasses = ['best', 'second', 'third'];

    data.lines.forEach((line, i) => {
      const div = document.createElement('div');
      div.className = `analysis-line ${rankClasses[i] || ''}`;

      let scoreText = '';
      let scoreClass = '';
      if (line.scoreType === 'mate') {
        scoreText = `M${Math.abs(line.score)}`;
        scoreClass = 'mate';
      } else {
        const cp = line.score / 100;
        scoreText = (cp >= 0 ? '+' : '') + cp.toFixed(1);
        scoreClass = cp >= 0 ? 'positive' : 'negative';
      }

      const pvMoves = line.pv ? line.pv.slice(0, 6).join(' ') : '';

      div.innerHTML = `
        <span class="line-rank">#${i + 1}</span>
        <span class="line-score ${scoreClass}">${scoreText}</span>
        <span class="line-moves">${this.formatPV(line.pv)}</span>
      `;

      // Hover to show arrow for this line
      div.addEventListener('mouseenter', () => this.showMoveArrow(line.pv, i));
      div.addEventListener('mouseleave', () => this.clearMoveArrows());

      linesEl.appendChild(div);

      // Draw arrow for the best move only
      if (i === 0 && line.pv && line.pv.length > 0) {
        this.drawArrow(line.pv[0], true);
      }
    });
  }

  formatPV(pv) {
    if (!pv || pv.length === 0) return '';
    return pv.slice(0, 5).map(m => this.formatUCIMove(m)).join(' → ');
  }

  formatUCIMove(uci) {
    if (!uci || uci.length < 4) return uci;
    const cols = 'abcdefghi';
    const fromC = cols.indexOf(uci[0]);
    const fromR = parseInt(uci[1]);
    const toC = cols.indexOf(uci[2]);
    const toR = parseInt(uci[3]);
    return `${uci[0]}${fromR}${uci[2]}${toR}`;
  }

  showMoveArrow(pv, lineIndex) {
    this.clearMoveArrows();
    if (pv && pv.length > 0) {
      this.drawArrow(pv[0], lineIndex === 0);
    }
  }

  clearMoveArrows() {
    // Remove temporary arrows, keep permanent best move arrow
    const arrows = this.arrowGroup.querySelectorAll('.temp-arrow');
    arrows.forEach(a => a.remove());
  }

  drawArrow(uciMove, isBest) {
    if (!uciMove || uciMove.length < 4) return;
    const cols = 'abcdefghi';
    const fromC = cols.indexOf(uciMove[0]);
    const fromR = 9 - parseInt(uciMove[1]);
    const toC = cols.indexOf(uciMove[2]);
    const toR = 9 - parseInt(uciMove[3]);

    const x1 = this.viewX(fromC);
    const y1 = this.viewY(fromR);
    const x2 = this.viewX(toC);
    const y2 = this.viewY(toR);

    // Shorten the line — keep arrows close to pieces
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const shortenStart = PIECE_R - 2;
    const shortenEnd = PIECE_R - 2;

    const sx = x1 + (dx / len) * shortenStart;
    const sy = y1 + (dy / len) * shortenStart;
    const ex = x2 - (dx / len) * shortenEnd;
    const ey = y2 - (dy / len) * shortenEnd;

    // Color based on whose turn it is (analysis is for current player)
    const isRedTurn = this.turn === 'w';
    const sideColor = isRedTurn ? 'red' : 'green';
    const bestColor = isRedTurn ? 'rgba(220, 50, 40, 0.9)' : 'rgba(20, 160, 80, 0.9)';
    const altColor = isRedTurn ? 'rgba(220, 50, 40, 0.5)' : 'rgba(20, 160, 80, 0.5)';
    const markerId = `arrowhead-${sideColor}-${isBest ? 'best' : 'alt'}`;

    const arrow = this.createSVG('line', {
      x1: sx, y1: sy, x2: ex, y2: ey,
      stroke: isBest ? bestColor : altColor,
      'stroke-width': isBest ? 7 : 5,
      'stroke-linecap': 'round',
      'marker-end': `url(#${markerId})`,
      class: isBest ? 'best-arrow' : 'temp-arrow',
      opacity: 1
    });

    this.arrowGroup.appendChild(arrow);
  }

  clearAnalysis() {
    const linesEl = document.getElementById('analysis-lines');
    linesEl.innerHTML = '<div class="empty-analysis">Make a move to see analysis</div>';
    this.arrowGroup.innerHTML = '';
  }

  // ===== SVG HELPER =====
  createSVG(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
    return el;
  }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
  window.game = new XiangqiGame();
});
