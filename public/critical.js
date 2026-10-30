(function(root) {
  const { XiangqiRules, coordinates, isRed, positionKey } = typeof module !== 'undefined' && module.exports ? require('./rules') : root;
  const decisionKey = (fen, ply, side) => `${positionKey(fen)}|${ply}|${side}`;

  function majorTargets(fen, attacker) {
    const game = new XiangqiRules(fen);game.turn = attacker;
    const targets = new Set();
    for (const move of game.legalMoves()) {
      const [, , row, col] = coordinates(move), piece = game.board[row][col];
      if (piece && 'RNC'.includes(piece.toUpperCase()) && isRed(piece) !== (attacker === 'w')) targets.add(`${piece}:${row}:${col}`);
    }
    return targets;
  }
  function criticalPosition({ fen, humanSide, lastMove, course, departureSeen = false, analysis }) {
    const game = new XiangqiRules(fen);
    if (game.turn !== humanSide || !game.legalMoves().length) return null;
    const reasons = [];
    let question = '先找出对方的直接威胁，再比较至少两种候选走法。', answer = '依次检查将军、吃子、保护与子力活动。对每个候选，至少算一手对方最有力的应招。';
    if (course?.checkpoint) {
      reasons.push('课程思考停点');question = course.checkpoint.question;answer = course.checkpoint.answer;
    }
    if (course?.status === 'deviated' && !departureSeen) reasons.push('已经脱离课程主线，需要重新确定计划');
    if (game.isKingExposed(game.turn === 'w' ? 'K' : 'k')) reasons.push('正在被将军，先核对应将方式');
    if (lastMove?.captured && 'RNC'.includes(lastMove.captured.toUpperCase())) reasons.push('刚发生大子交换，重新核对后续吃子顺序');
    if (lastMove?.fen) {
      const attacker = humanSide === 'w' ? 'b' : 'w';
      const before = majorTargets(lastMove.fen, attacker), after = majorTargets(fen, attacker);
      if ([...after].some(target => !before.has(target))) reasons.push('对方新出现了直接吃大子的合法着法');
    }
    const lines = analysis?.lines || [];
    const first = lines.find(l => l.multipv === 1), second = lines.find(l => l.multipv === 2);
    if (first?.scoreType === 'mate' && first.score > 0) reasons.push('引擎发现杀棋变化，值得自己核对次序');
    else if (first?.scoreType === 'cp' && second?.scoreType === 'cp' && first.depth >= 8 && second.depth >= 8 && Math.abs(first.depth-second.depth) <= 1 && first.score-second.score >= 120) {
      reasons.push('前两条候选走法评分差距较大，选择可能影响局势');
    }
    return reasons.length ? { reasons, question, answer } : null;
  }
  const api = { decisionKey, criticalPosition };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else Object.assign(root, api);
})(globalThis);
