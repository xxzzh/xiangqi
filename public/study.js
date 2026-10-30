// Facts and study records derived from the rules and completed engine searches.
(function (root) {
  const rules = typeof module !== 'undefined' && module.exports ? require('./rules') : root;
  const { XiangqiRules, isRed, coordinates } = rules;

  function moveFacts(fen, uci) {
    const game = new XiangqiRules(fen);
    const side = game.turn;
    const escapingCheck = game.isKingExposed(side === 'w' ? 'K' : 'k');
    const move = game.play(uci);
    const facts = [];
    if (escapingCheck) facts.push('这一步解除了将军。');
    if (move.captured) {
      facts.push(`吃掉${isRed(move.captured) ? '红' : '黑'}方的${rules.PIECE_CHARS[move.captured]}。`);
    }
    if (game.isKingExposed(game.turn === 'w' ? 'K' : 'k')) facts.push('这一步向对方将军。');
    if (move.piece.toUpperCase() === 'P' && (side === 'w' ? move.from[0] === 5 && move.to[0] === 4 : move.from[0] === 4 && move.to[0] === 5)) {
      facts.push('兵卒已过河，之后可以向前或横走。');
    }
    const attackers = game.legalMoves().filter(uciMove => {
      const [, , row, col] = coordinates(uciMove);
      return row === move.to[0] && col === move.to[1];
    });
    if (attackers.length) {
      const names = attackers.slice(0, 2).map(m => game.notation(m));
      facts.push(`对方可用${names.join('或')}直接吃到刚走的子；是否应吃还需结合后续交换。`);
    }
    if (!facts.length) facts.push('这一步没有直接吃子或将军。留意下一手的出子、攻防与对方威胁。');
    return facts;
  }

  function moveAssessment(move, before, after) {
    if (!before?.done || !after?.done || !Number.isFinite(before.value) || !Number.isFinite(after.value)) {
      return { label: '待评估', kind: 'pending', loss: null, collect: false };
    }
    if (before.bestMove === move.uci) return { label: '引擎首选', kind: 'good', loss: 0, collect: false };
    if (before.type !== 'cp' || after.type !== 'cp') {
      return { label: '核对杀棋变化', kind: 'neutral', loss: null, collect: false };
    }
    const loss = Math.max(0, (before.value - after.value) * (isRed(move.piece) ? 1 : -1));
    return {
      label: loss >= 150 ? '值得重算' : loss >= 50 ? '可以改进' : '局势基本保持',
      kind: loss >= 150 ? 'mistake' : loss >= 50 ? 'inaccuracy' : 'good',
      loss,
      collect: loss >= 150 && Boolean(before.bestMove)
    };
  }

  function cleanEvaluation(value) {
    if (!value || !Number.isFinite(value.value) || Math.abs(value.value) > 1000000 || !['cp', 'mate'].includes(value.type)) return null;
    return {
      value: value.value, type: value.type, depth: Number.isInteger(value.depth) ? value.depth : 0,
      done: value.done === true,
      bestMove: typeof value.bestMove === 'string' && /^[a-i][0-9][a-i][0-9]$/.test(value.bestMove) ? value.bestMove : null,
      pv: Array.isArray(value.pv) ? value.pv.filter(m => typeof m === 'string' && /^[a-i][0-9][a-i][0-9]$/.test(m)).slice(0, 8) : []
    };
  }

  function createStudyEntry(session, index, manual = false, now = Date.now()) {
    const move = session.history[index];
    if (!move) return null;
    const before = cleanEvaluation(session.evaluations[index]);
    const after = cleanEvaluation(session.evaluations[index + 1]);
    const assessment = moveAssessment(move, before, after);
    if (!manual && (move.source !== 'human' || !assessment.collect)) return null;
    const moves = session.history.slice(0, index).map(m => m.uci);
    return {
      id: JSON.stringify([session.rootFen, moves, move.uci]), rootFen: session.rootFen, moves,
      move: move.uci, name: move.name, before, after, loss: assessment.loss,
      manual, createdAt: now, attempts: 0, lastPracticedAt: null
    };
  }

  function validateStudyEntry(entry) {
    if (!entry || !Array.isArray(entry.moves) || entry.moves.length > 599) throw new Error('错题记录不正确');
    const game = new XiangqiRules(entry.rootFen);
    for (const move of entry.moves) game.play(move);
    const actual = game.play(entry.move);
    return {
      id: JSON.stringify([entry.rootFen, entry.moves, entry.move]), rootFen: entry.rootFen, moves: [...entry.moves],
      move: actual.uci, name: actual.name, before: cleanEvaluation(entry.before), after: cleanEvaluation(entry.after),
      loss: Number.isFinite(entry.loss) && entry.loss >= 0 ? entry.loss : null,
      manual: entry.manual === true, createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
      attempts: Number.isSafeInteger(entry.attempts) && entry.attempts >= 0 ? entry.attempts : 0,
      lastPracticedAt: Number.isFinite(entry.lastPracticedAt) ? entry.lastPracticedAt : null
    };
  }

  function addStudyEntry(entries, entry) {
    const previous = entries.find(item => item.id === entry.id);
    if (previous) return entries.map(item => item.id === entry.id && entry.manual ? { ...item, manual: true } : item);
    return [entry, ...entries].slice(0, 100);
  }

  const api = { moveFacts, moveAssessment, cleanEvaluation, createStudyEntry, validateStudyEntry, addStudyEntry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(globalThis);
