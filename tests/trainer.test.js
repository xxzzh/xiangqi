const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const rules=require('../public/rules');
const study=require('../public/study');
const lessons=require('../public/lessons'),critical=require('../public/critical');
const testHints={checked:false};
const ctx={...rules,...study,...lessons,...critical,XiangqiBoard:class extends rules.XiangqiRules{},window:{addEventListener(){}},localStorage:{setItem(){},getItem(){return null;}},document:{getElementById(id){if(id==='mistake-dialog')return {close(){}};if(id==='show-hints')return testHints;throw new Error('Unexpected DOM access: '+id);}},clearTimeout,setTimeout,WebSocket:{OPEN:1}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../public/trainer.js'),'utf8')+'\nglobalThis.Trainer=XiangqiTrainer;globalThis.books=TRAINING_BOOKS;',ctx);
function game(){const g=Object.create(ctx.Trainer.prototype);g.parseFEN(rules.START_FEN);Object.assign(g,{rootFen:rules.START_FEN,history:[],cursor:0,evaluations:[],mode:'book',humanSide:'w',ms:1500,book:ctx.books[0],books:[...ctx.books],mistakes:[],practiceReturn:null,activeMistakeId:null,requestId:0,courseId:null,courseFinished:false,courseProgress:{},thinkingEnabled:false,thinkStop:null,thinkingAcknowledged:[],render(){},requestAnalysis(){},persist(){},populateBooks(){},drawBoard(){},clearSelection(){},describeBook(){},saveMistakes(){},renderMistakeSummary(){},toast(text){throw new Error(text);}});return g;}
test('book follows the exact line and engine takes over after deviation',()=>{
  const g=game();assert.equal(g.bookMove(),'h2e2');g.commit('h2e2','human');assert.equal(g.bookMove(),'h9g7');g.commit('h9g7','book');g.commit('c3c4','human');assert.equal(g.bookMove(),null);assert.match(g.bookMessage(),/偏离/);
});
test('a completed book remains marked complete after engine continuation',()=>{
  const g=game();for(const move of g.book.moves)g.commit(move,'book');g.commit(g.legalMoves()[0],'engine');assert.match(g.bookMessage(),/棋谱已练完/);assert.equal(g.bookMove(),null);
});
test('undo rewinds one complete human/AI round; history review does not discard future moves',()=>{
  const g=game();g.commit('h2e2','human');g.commit('h9g7','book');g.setPosition(1);assert.equal(g.history.length,2);assert.equal(g.turn,'b');g.setPosition(2);g.undoRound();assert.equal(g.cursor,0);assert.equal(g.history.length,0);assert.equal(g.toFEN(),rules.START_FEN);
});
test('undo for a human playing black returns to their own turn',()=>{
  const g=game();g.humanSide='b';g.commit('h2e2','book');g.commit('h9g7','human');g.commit('h0g2','book');g.undoRound();assert.equal(g.cursor,1);assert.equal(g.turn,'b');
});
test('stale engine responses cannot modify the board or evaluation',()=>{
  const g=game();g.requestId=9;g.currentEval=null;g.onAnalysis({id:8,fen:g.toFEN(),done:true,data:{bestmove:'h2e2'}});assert.equal(g.history.length,0);assert.equal(g.currentEval,null);
});
test('threefold repetition pauses practice without assigning a false loss',()=>{
  const g=game();for(const move of 'b0c2 b9c7 c2b0 c7b9 b0c2 b9c7 c2b0 c7b9'.split(' '))g.commit(move,'human');assert.match(g.outcome(),/重复局面/);assert.doesNotMatch(g.outcome(),/获胜/);
});
test('mistake practice preserves the original game, review cursor and return state',()=>{
  const g=game();for(const m of ['h2e2','h9g7','h0g2','i9h9'])g.commit(m,'human');
  const entry=study.createStudyEntry(g,2,true);g.mistakes=[entry];g.review(1);
  const original=g.toFEN();g.practiceMistake(entry.id);
  assert.equal(g.cursor,2);assert.equal(g.history.length,2);assert.equal(g.turn,'w');assert.equal(g.paused,false);assert(g.practiceReturn);
  g.commit(g.legalMoves()[0],'human');assert.equal(g.mistakes[0].attempts,1);
  g.returnToSession();assert.equal(g.cursor,1);assert.equal(g.history.length,4);assert.equal(g.toFEN(),original);assert.equal(g.paused,true);assert.equal(g.practiceReturn,null);assert.equal(g.activeMistakeId,null);
});
test('only sufficiently evaluated human errors are automatically collected, without duplicates',()=>{
  const g=game();g.commit('b0c2','human');
  g.evaluations=[{value:20,type:'cp',done:true,bestMove:'h2e2'},{value:-200,type:'cp',done:true}];
  g.captureMistakes();g.captureMistakes();assert.equal(g.mistakes.length,1);
  const engine=game();engine.commit('b0c2','engine');engine.evaluations=g.evaluations;engine.captureMistakes();assert.equal(engine.mistakes.length,0);
});
test('a course checkpoint locks moves until acknowledgement and does not repeat at the same position',()=>{
  const g=game();for(const m of g.book.moves.slice(0,4))g.commit(m,'book');g.courseId='cannon';g.thinkingEnabled=true;g.paused=false;
  assert.equal(g.considerCritical(),true);assert(g.thinkStop);assert.equal(testHints.checked,false);
  const before=g.toFEN();g.toast=()=>{};g.commit('i0h0','human');assert.equal(g.toFEN(),before);assert.equal(g.history.length,4);
  g.releaseThinking();assert.equal(g.thinkStop,null);assert.equal(g.considerCritical(),false);g.commit('i0h0','human');assert.equal(g.history.length,5);
});
test('thinking preferences and an active checkpoint survive session serialization',()=>{
  const g=game();for(const m of g.book.moves.slice(0,4))g.commit(m,'book');g.courseId='cannon';g.thinkingEnabled=true;g.paused=false;g.considerCritical();
  const restored=game();restored.applySession(JSON.parse(JSON.stringify(g.sessionData())));assert.equal(restored.courseId,'cannon');assert.equal(restored.thinkStop.key,g.thinkStop.key);assert.equal(restored.thinkingEnabled,true);
  restored.applySession({...g.sessionData(),thinkingEnabled:false});assert.equal(restored.thinkStop,null);
});
test('course completion pauses on the final position and counts each run once',()=>{
  const g=game();for(const m of g.book.moves)g.commit(m,'book');g.courseId='cannon';g.syncCourseCompletion();g.syncCourseCompletion();assert.equal(g.paused,true);assert.equal(g.courseProgress.cannon.completions,1);assert.equal(g.courseFinished,true);
});

test('mistake practice returns to the guided course with its active thinking stop',()=>{
  const g=game();for(const move of g.book.moves.slice(0,4))g.commit(move,'book');g.courseId='cannon';g.thinkingEnabled=true;g.paused=false;g.considerCritical();
  const key=g.thinkStop.key,entry=study.createStudyEntry(g,2,true);g.mistakes=[entry];g.practiceMistake(entry.id);
  assert.equal(g.courseId,null);assert.equal(g.thinkStop,null);g.returnToSession();
  assert.equal(g.courseId,'cannon');assert.equal(g.thinkStop.key,key);g.releaseThinking();assert.equal(g.paused,false);assert.equal(g.cursor,4);
});
