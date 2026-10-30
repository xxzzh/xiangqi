const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {XiangqiRules,START_FEN,parseRecord,redScore}=require('../public/rules');

test('initial position has 44 legal moves and 1920 legal two-ply sequences',()=>{
  const g=new XiangqiRules();assert.equal(g.legalMoves().length,44);
  let count=0;for(const m of g.legalMoves()){const next=new XiangqiRules();next.play(m);count+=next.legalMoves().length;}
  assert.equal(count,1920);assert.equal(g.toFEN(),START_FEN);
});
test('blocked horse, cannon screen, flying generals and own turn enforced',()=>{
  const g=new XiangqiRules();assert.throws(()=>g.play('b0d1'));assert.throws(()=>g.play('a9a8'));
  assert(g.legalMoves().includes('b2b9'));assert.throws(()=>g.play('b2b7'));
  const pinned=new XiangqiRules('4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1');
  assert(!pinned.legalMoves().includes('e5d5'));assert(pinned.legalMoves().includes('e5e6'));
});
test('Chinese notation, coordinate PGN, FEN and nested mainline parsing',()=>{
  const record=parseRecord('[Event "中炮"]\n1. 炮二平五 馬８進７ 2. 马二进三 车9平8');
  assert.deepEqual(record.moves,['h2e2','h9g7','h0g2','i9h9']);
  const pgn=parseRecord('[Event "test"]\n1. h2e2 {comment} h9g7 (1... b9c7 (a0a1)) 2. h0g2 i9h9 *');
  assert.deepEqual(pgn.moves,record.moves);assert.equal(pgn.hasVariations,true);
  assert.throws(()=>parseRecord('炮二平五 不认识'));
  assert.throws(()=>parseRecord('h2e2 (h9g7'));
  assert.throws(()=>parseRecord('[FEN "9/9 w"] a0a1'));
  assert.throws(()=>parseRecord('[FEN "4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1"] e0d0'));
});
test('fixed red perspective reverses black-to-move scores including mate',()=>{
  assert.equal(redScore({score:120},'w'),120);assert.equal(redScore({score:120},'b'),-120);
  assert.equal(redScore({score:-3},'b'),3);
});
test('a checkmated side has no legal moves',()=>{
  const g=new XiangqiRules('3RkR3/4P4/9/9/9/9/9/9/9/4K4 b - - 0 1');
  assert.equal(g.legalMoves().length,0);
});
test('every bundled training line is legal',()=>{
  const ctx={...require('../public/rules'),...require('../public/study'),...require('../public/lessons'),...require('../public/critical'),XiangqiBoard:class{},window:{addEventListener(){}},document:{getElementById(){}}};vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(require.resolve('../public/trainer.js'),'utf8')+'\nglobalThis.books=TRAINING_BOOKS;',ctx);
  for(const book of ctx.books){const g=new XiangqiRules(book.fen);for(const move of book.moves)g.play(move);}
});
