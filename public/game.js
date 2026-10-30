// SVG board adapted from vinybnb/xiangqi (MIT).
const SVG_NS = 'http://www.w3.org/2000/svg';

// Board dimensions
const COLS = 9;
const ROWS = 10;
const CELL = 56;
const MARGIN_X = 32;
const MARGIN_Y = 30;
const PIECE_R = 24;

class XiangqiBoard extends XiangqiRules {
  constructor() { super(); this.flipped=false; this.svgEl=document.getElementById("board-svg"); this.drawBoard(); this.drawPieces(); }
  viewCol(col) { return this.flipped ? (8 - col) : col; }
  viewRow(row) { return this.flipped ? (9 - row) : row; }
  viewX(col) { return MARGIN_X + this.viewCol(col) * CELL; }
  viewY(row) { return MARGIN_Y + this.viewRow(row) * CELL; }

  drawBoard() {
    const svg = this.svgEl;
    svg.innerHTML = '';

    // Background
    const bg = this.createSVG('rect', {
      x: 0, y: 0, width: 512, height: 564,
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
      points: '0 0, 6 2.5, 0 5', fill: 'rgba(38, 77, 70, 0.9)'
    }));
    defs.appendChild(markerGreenBest);

    const markerGreenAlt = this.createSVG('marker', {
      id: 'arrowhead-green-alt', markerWidth: 6, markerHeight: 5,
      refX: 5, refY: 2.5, orient: 'auto'
    });
    markerGreenAlt.appendChild(this.createSVG('polygon', {
      points: '0 0, 6 2.5, 0 5', fill: 'rgba(38, 77, 70, 0.55)'
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
    const color = red ? '#c0392b' : '#253b3a';
    const bgColor = red ? '#fdf6f0' : '#f6f2e6';
    const borderColor = red ? '#a52f23' : '#253b3a';

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
    const bestColor = isRedTurn ? 'rgba(220, 50, 40, 0.9)' : 'rgba(38, 77, 70, 0.9)';
    const altColor = isRedTurn ? 'rgba(220, 50, 40, 0.5)' : 'rgba(38, 77, 70, 0.5)';
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

  createSVG(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
    return el;
  }
}
