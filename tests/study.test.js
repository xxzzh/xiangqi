const {test}=require('node:test');
const assert=require('node:assert/strict');
const {XiangqiRules,START_FEN}=require('../public/rules');
const {moveFacts,moveAssessment,createStudyEntry,validateStudyEntry,addStudyEntry}=require('../public/study');

test('move explanations identify a real capture and a legal recapture without claiming a free gain',()=>{
  const facts=moveFacts(START_FEN,'b2b9').join('');
  assert.match(facts,/吃掉黑方的馬/);assert.match(facts,/直接吃到刚走的子/);assert.match(facts,/后续交换/);
});
test('move explanations distinguish checking, escaping check, crossing the river and quiet moves',()=>{
  assert.match(moveFacts('4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1','e5e8').join(''),/向对方将军/);
  assert.match(moveFacts('3k5/9/9/9/9/9/9/9/4r4/4K4 w - - 0 1','e0f0').join(''),/解除了将军/);
  const g=new XiangqiRules();g.play('c3c4');g.play('h9g7');assert.match(moveFacts(g.toFEN(),'c4c5').join(''),/兵卒已过河/);
  assert.match(moveFacts(START_FEN,'h2e2').join(''),/没有直接吃子或将军/);
});
test('assessment uses the moving side and never grades incomplete searches as an error',()=>{
  const red={uci:'b0c2',piece:'N'},black={uci:'b9c7',piece:'n'};
  const before={value:20,type:'cp',done:true,bestMove:'h2e2'},after={value:-200,type:'cp',done:true};
  assert.equal(moveAssessment(red,before,after).loss,220);assert.equal(moveAssessment(red,before,{...after,done:false}).collect,false);
  assert.equal(moveAssessment(black,{...before,value:-20},{...after,value:200}).loss,220);
  assert.equal(moveAssessment(red,{...before,bestMove:red.uci},after).label,'引擎首选');
  assert.equal(moveAssessment(red,before,{value:-4,type:'mate',done:true}).collect,false);
});
test('manual bookmarks work without analysis; invalid saved histories are rejected',()=>{
  const g=new XiangqiRules();const session={rootFen:START_FEN,history:[{...g.play('h2e2'),source:'human'}],evaluations:[]};
  assert.equal(createStudyEntry(session,0),null);
  const saved=createStudyEntry(session,0,true,1234);assert.equal(validateStudyEntry(saved).name,'炮二平五');
  assert.throws(()=>validateStudyEntry({...saved,moves:['a0a9']}));
});
test('duplicate bookmarks keep practice history and the collection stays bounded',()=>{
  const g=new XiangqiRules();const saved=createStudyEntry({rootFen:START_FEN,history:[{...g.play('h2e2'),source:'human'}],evaluations:[]},0,true);
  const existing={...saved,manual:false,attempts:4};const merged=addStudyEntry([existing],saved);
  assert.equal(merged.length,1);assert.equal(merged[0].attempts,4);assert.equal(merged[0].manual,true);
  assert.equal(addStudyEntry(Array.from({length:100},(_,i)=>({...saved,id:String(i)})),saved).length,100);
});
