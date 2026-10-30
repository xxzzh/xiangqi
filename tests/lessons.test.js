const {test}=require('node:test');
const assert=require('node:assert/strict');
const {XiangqiRules,START_FEN,coordinates}=require('../public/rules');
const {OPENING_COURSES,coursePosition}=require('../public/lessons');
const {criticalPosition,decisionKey}=require('../public/critical');

test('all three courses contain twelve legal, explained moves and checkpoints for both sides',()=>{
  assert.equal(OPENING_COURSES.length,3);
  for(const course of OPENING_COURSES){
    const g=new XiangqiRules(course.fen);assert.equal(course.steps.length,12);
    for(const s of course.steps){assert(s.title&&s.why&&s.avoid);g.play(s.move);}
    assert(Object.keys(course.checkpoints).some(i=>Number(i)%2===0));assert(Object.keys(course.checkpoints).some(i=>Number(i)%2===1));
    for(const [i,checkpoint] of Object.entries(course.checkpoints)){assert(Number(i)<course.moves.length);assert(checkpoint.question&&checkpoint.answer);}
  }
});

test('introductory mainlines never offer a rook to an immediate lower-value capture',()=>{
  for(const course of OPENING_COURSES){
    const g=new XiangqiRules(course.fen);
    for(const move of course.moves){
      g.play(move);
      for(const reply of g.legalMoves()){
        const [r,c,toR,toC]=coordinates(reply);
        assert(!('NCP'.includes(g.board[r][c]?.toUpperCase())&&g.board[toR][toC]?.toUpperCase()==='R'),`${course.id}: ${move} allows ${reply} to win a rook`);
      }
    }
  }
});
test('course state distinguishes following, departure, completion and later continuation',()=>{
  const course=OPENING_COURSES[0];
  const state=coursePosition(course.id,course.fen,course.moves.slice(0,4),4);assert.equal(state.status,'following');assert(state.checkpoint);assert.equal(state.next.move,'i0h0');
  assert.equal(coursePosition(course.id,course.fen,['c3c4'],1).status,'deviated');
  assert.equal(coursePosition(course.id,course.fen,[...course.moves,'a1b1'],13).status,'complete');
  assert.equal(coursePosition('custom',course.fen,[],0),null);
});
test('routine opening positions do not trigger false new-threat warnings',()=>{
  assert.equal(criticalPosition({fen:START_FEN,humanSide:'w'}),null);
  const g=new XiangqiRules();g.play('h2e2');const last=g.play('h9g7');assert.equal(criticalPosition({fen:g.toFEN(),humanSide:'w',lastMove:last}),null);
});
test('a course checkpoint asks the learner about the current side only',()=>{
  const course=OPENING_COURSES[0],g=new XiangqiRules();for(const m of course.moves.slice(0,4))g.play(m);
  const context=coursePosition(course.id,START_FEN,course.moves,4),stop=criticalPosition({fen:g.toFEN(),humanSide:'w',course:context});
  assert(stop.reasons.includes('课程思考停点'));assert.match(stop.question,/大子/);assert.equal(criticalPosition({fen:g.toFEN(),humanSide:'b',course:context}),null);
});
test('check, new threats to major pieces and a major exchange trigger meaningful reminders',()=>{
  assert.match(criticalPosition({fen:'3k5/9/9/9/9/9/9/9/4r4/4K4 w - - 0 1',humanSide:'w'}).reasons.join(''),/被将军/);
  const g=new XiangqiRules('4k4/8r/9/9/4P4/R8/9/9/9/4K4 b - - 0 1'),last=g.play('i8i4');
  assert.match(criticalPosition({fen:g.toFEN(),humanSide:'w',lastMove:last}).reasons.join(''),/直接吃大子/);
  g.turn='b';const capture=g.play('i4a4');assert.match(criticalPosition({fen:g.toFEN(),humanSide:'w',lastMove:capture}).reasons.join(''),/大子交换/);
});
test('candidate gap requires comparable depth and does not expose a move as the answer',()=>{
  const lines=[{multipv:1,scoreType:'cp',score:180,depth:12,pv:['h2e2']},{multipv:2,scoreType:'cp',score:20,depth:12,pv:['b0c2']}];
  const stop=criticalPosition({fen:START_FEN,humanSide:'w',analysis:{lines}});assert.match(stop.reasons.join(''),/评分差距/);assert.doesNotMatch(stop.question,/h2e2/);
  assert.equal(criticalPosition({fen:START_FEN,humanSide:'w',analysis:{lines:[lines[0],{...lines[1],depth:6}]}}),null);
});
test('course departure is reported once and positive mate analysis prompts calculation',()=>{
  const context={status:'deviated'};
  assert.match(criticalPosition({fen:START_FEN,humanSide:'w',course:context}).reasons.join(''),/脱离/);
  assert.equal(criticalPosition({fen:START_FEN,humanSide:'w',course:context,departureSeen:true}),null);
  assert.match(criticalPosition({fen:START_FEN,humanSide:'w',analysis:{lines:[{multipv:1,scoreType:'mate',score:5,depth:12}]}}).reasons.join(''),/杀棋/);
  assert.notEqual(decisionKey(START_FEN,4,'w'),decisionKey(START_FEN,4,'b'));
});
