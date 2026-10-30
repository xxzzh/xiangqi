const $ = id => document.getElementById(id);
const TRAINING_BOOKS = [
  {id:'cannon',title:'中炮对屏风马 · 起步',description:'练习中炮出子与屏风马应对。留意马、车的出动次序。',fen:START_FEN,moves:'h2e2 h9g7 h0g2 i9h9 i0h0 b9c7 b0c2 a9b9'.split(' ')},
  {id:'pawn',title:'仙人指路 · 出子演练',description:'从挺兵开始，观察双方如何出马、出车。示例共 4 回合。',fen:START_FEN,moves:'c3c4 g6g5 h0g2 h9g7 b0c2 b9c7 a0b0 a9b9'.split(' ')},
  {id:'elephant',title:'飞相开局 · 稳步展开',description:'从飞相开始建立阵形，比较它与中炮开局的不同。',fen:START_FEN,moves:'g0e2 h9g7 h0g2 b9c7 b0c2 i9h9 i0h0 c6c5'.split(' ')}
];
class XiangqiTrainer extends XiangqiBoard {
  constructor() {
    super();
    this.rootFen=START_FEN; this.history=[]; this.cursor=0; this.evaluations=[];
    this.mode='engine'; this.humanSide='w'; this.ms=1500; this.paused=false;
    this.requestId=0; this.engineReady=false; this.gameOver=false; this.currentEval=null; this.lastData=null;
    this.books=[...TRAINING_BOOKS]; this.book=this.books[0];
    this.mistakes=[];this.practiceReturn=null;this.activeMistakeId=null;this.referenceIndex=null;this.hintsVisible=false;
    this.loadMistakes();
    this.restore(); this.drawBoard(); this.populateBooks(); this.bind(); this.render(); this.connectEngine();
  }
  toast(text) { $('toast').textContent=text; $('toast').hidden=false; clearTimeout(this.toastTimer); this.toastTimer=setTimeout(()=>$('toast').hidden=true,4500); }
  populateBooks() {
    $('book-select').replaceChildren(...this.books.map(book=>{const el=document.createElement('option');el.value=book.id;el.textContent=book.title;return el;}));
    $('book-select').value=this.book.id; this.describeBook();
    $('mode').value=this.mode; $('side').value=this.humanSide; $('think-time').value=String(this.ms);
    $('show-hints').checked=this.hintsVisible;
  }
  describeBook() { const book=this.books.find(b=>b.id===$('book-select').value); $('book-description').textContent=book?.description||'导入的主线，可执红或执黑练习。'; }
  bind() {
    this.svgEl.addEventListener('click',e=>this.clickBoard(e));
    $('btn-new').onclick=()=>this.startNew(false);
    $('btn-book').onclick=()=>this.startNew(true);
    $('btn-undo').onclick=()=>this.undoRound(); $('btn-retry').onclick=()=>this.retryLastHuman();
    $('btn-flip').onclick=()=>{this.flipped=!this.flipped;this.drawBoard();this.renderBoard();this.renderAnalysis();};
    $('btn-pause').onclick=()=>{this.paused=!this.paused;this.cancelAnalysis();this.render();this.requestAnalysis();};
    $('mode').onchange=()=>{this.mode=$('mode').value;this.cancelAnalysis();this.render();this.requestAnalysis();this.persist();};
    $('side').onchange=()=>{this.humanSide=$('side').value;this.cancelAnalysis();this.render();this.requestAnalysis();this.persist();};
    $('think-time').onchange=()=>{this.ms=Number($('think-time').value);this.cancelAnalysis();this.requestAnalysis();this.persist();};
    $('book-select').onchange=()=>this.describeBook();
    $('show-hints').onchange=()=>{this.hintsVisible=$('show-hints').checked;this.renderAnalysis();this.persist();};
    $('btn-first').onclick=()=>this.review(0); $('btn-prev').onclick=()=>this.review(this.cursor-1);
    $('btn-next').onclick=()=>this.review(this.cursor+1); $('btn-last').onclick=()=>this.review(this.history.length);
    $('btn-continue').onclick=()=>{this.history=this.history.slice(0,this.cursor);this.evaluations=this.evaluations.slice(0,this.cursor+1);this.paused=false;this.cancelAnalysis();this.render();this.requestAnalysis();this.persist();};
    $('btn-import').onclick=()=>{$('import-error').textContent='';$('import-dialog').showModal();};
    $('record-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>200000){$('import-error').textContent='文件太大，请使用小于 200KB 的单局文本棋谱。';return;}$('record-text').value=await file.text();};
    $('btn-import-confirm').onclick=()=>this.importRecord(); $('btn-export').onclick=()=>this.exportRecord();
    $('btn-save-mistake').onclick=()=>this.saveCurrentMistake();
    $('btn-coach-reference').onclick=()=>{const index=this.coachIndex();this.referenceIndex=this.referenceIndex===index?null:index;this.renderCoach();};
    $('btn-mistakes').onclick=()=>{this.renderMistakes();$('mistake-dialog').showModal();};
    $('btn-return-session').onclick=()=>this.returnToSession();
    window.addEventListener('beforeunload',()=>this.persist());
    document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||$('import-dialog').open)return;if(e.key==='ArrowLeft'){e.preventDefault();this.review(this.cursor-1);}if(e.key==='ArrowRight'){e.preventDefault();this.review(this.cursor+1);}});
  }
  startNew(useBook) {
    if((this.history.length||this.practiceReturn) && !window.confirm('开始新局会替换当前练习和暂存的原局。需要保留时，请先导出本局棋谱。继续吗？')) return;
    this.cancelAnalysis();
    this.practiceReturn=null;this.activeMistakeId=null;this.referenceIndex=null;
    if(useBook) { this.book=this.books.find(b=>b.id===$('book-select').value);this.mode='book';$('mode').value='book'; }
    this.rootFen=this.mode==='book'?this.book.fen:START_FEN;
    this.history=[];this.cursor=0;this.evaluations=[];this.currentEval=null;this.lastData=null;this.paused=false;
    this.parseFEN(this.rootFen);this.render();this.requestAnalysis();this.persist();
  }
  bookMove() {
    if(this.mode!=='book'||positionKey(this.rootFen)!==positionKey(this.book.fen)||this.cursor>=this.book.moves.length)return null;
    if(this.history.slice(0,this.cursor).some((m,i)=>m.uci!==this.book.moves[i]))return null;
    const move=this.book.moves[this.cursor];return this.legalMoves().includes(move)?move:null;
  }
  bookMessage() {
    if(this.mode!=='book')return this.mode==='free'?'自由分析：你可以操作双方；每次落子后自动重新评估。':'引擎会自动应招，局势评分始终显示。';
    if(positionKey(this.rootFen)!==positionKey(this.book.fen)||this.history.slice(0,Math.min(this.cursor,this.book.moves.length)).some((m,i)=>m.uci!==this.book.moves[i]))return '已偏离所选棋谱，皮卡鱼接手应招。可悔棋返回原谱。';
    if(this.cursor>=this.book.moves.length)return '这条棋谱已练完，接下来由皮卡鱼继续陪练。';
    return `跟谱中 · ${this.book.title} · 第 ${this.cursor+1} / ${this.book.moves.length} 手`;
  }
  clickBoard(e) {
    if(this.gameOver||this.cursor!==this.history.length)return;
    if(this.mode!=='free'&&(this.paused||this.turn!==this.humanSide))return;
    const rect=this.svgEl.getBoundingClientRect();
    let col=Math.round(((e.clientX-rect.left)*512/rect.width-MARGIN_X)/CELL);
    let row=Math.round(((e.clientY-rect.top)*564/rect.height-MARGIN_Y)/CELL);
    if(this.flipped){col=8-col;row=9-row;} if(row<0||row>9||col<0||col>8)return;
    const piece=this.board[row][col];
    if(this.selectedSquare) {
      const [r,c]=this.selectedSquare;
      if(r===row&&c===col){this.clearSelection();return;}
      if(this.validMoves.some(([a,b])=>a===row&&b===col)){this.commit(toUCI(r,c,row,col),'human');return;}
    }
    this.clearSelection(); if(piece&&isRed(piece)===(this.turn==='w'))this.selectSquare(row,col);
  }
  commit(uci,source) {
    if(this.cursor!==this.history.length)return;
    try {
      const move=this.play(uci);move.source=source;
      this.cancelAnalysis();this.history.push(move);this.cursor++;this.lastData=null;this.currentEval=null;
      if(source==='human'&&this.activeMistakeId){const entry=this.mistakes.find(m=>m.id===this.activeMistakeId);if(entry&&this.cursor===entry.moves.length+1){entry.attempts++;entry.lastPracticedAt=Date.now();this.saveMistakes();}}
      this.render();this.persist();if(!this.gameOver)this.requestAnalysis();
    }catch(error){this.toast(error.message);}
  }
  setPosition(index) {
    this.parseFEN(this.rootFen);for(const move of this.history.slice(0,index))this.play(move.uci);this.cursor=index;
    this.currentEval=this.evaluations[index]||null;this.lastData=null;
  }
  review(index) {
    if(index<0||index>this.history.length)return;
    this.cancelAnalysis();this.paused=true;this.setPosition(index);this.render();if(!this.gameOver)this.requestAnalysis();
  }
  undoRound() {
    if(!this.history.length)return;
    let index=this.cursor;
    if(this.mode==='free')index=Math.max(0,index-1);
    else { do {index--;} while(index>0&&isRed(this.history[index].piece)!==(this.humanSide==='w')); }
    index=Math.max(0,index);this.truncate(index);
  }
  retryLastHuman() {
    for(let i=this.cursor-1;i>=0;i--)if(this.history[i].source==='human'){this.truncate(i);return;}
  }
  truncate(index) {
    this.cancelAnalysis();this.setPosition(index);this.history=this.history.slice(0,index);this.evaluations=this.evaluations.slice(0,index+1);this.paused=false;this.render();this.requestAnalysis();this.persist();
  }
  cancelAnalysis() {
    this.requestId++;clearTimeout(this.replyTimer);
    if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:'cancel'}));
  }
  connectEngine() {
    this.ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);
    this.ws.onmessage=e=>{
      const msg=JSON.parse(e.data);
      if(msg.type==='status') {this.engineReady=msg.ready;$('engine-status').textContent=msg.ready?'● 皮卡鱼已就绪':'正在加载皮卡鱼…';if(msg.ready)this.requestAnalysis();}
      else if(msg.type==='analysis')this.onAnalysis(msg);
      else if(msg.type==='error'){$('engine-status').textContent='引擎异常';$('eval-depth').textContent='分析失败';this.toast(msg.message);}
    };
    this.ws.onclose=()=>{this.engineReady=false;this.cancelAnalysis();$('engine-status').textContent='连接已断开，正在重连…';setTimeout(()=>this.connectEngine(),3000);};
    this.ws.onerror=()=>{$('engine-status').textContent='无法连接本地引擎';};
  }
  requestAnalysis() {
    if(!this.engineReady||this.ws?.readyState!==WebSocket.OPEN||this.gameOver)return;
    const id=++this.requestId;
    $('eval-depth').textContent='正在计算当前局面…';$('engine-status').textContent='● 皮卡鱼计算中';
    this.ws.send(JSON.stringify({type:'analyze',id,fen:this.rootFen,moves:this.history.slice(0,this.cursor).map(m=>m.uci),ms:this.ms}));
  }
  onAnalysis(msg) {
    if(msg.id!==this.requestId||msg.fen!==this.toFEN())return;
    const line=msg.data.lines.find(l=>l.multipv===1);
    this.lastData=msg.data;
    if(line) {
      this.currentEval={value:redScore(line,this.turn),type:line.scoreType,depth:line.depth,done:msg.done,bestMove:msg.data.bestmove||line.pv?.[0]||null,pv:(line.pv||[]).slice(0,8)};
      this.renderEvaluation();this.renderAnalysis();
    }
    if(!msg.done)return;
    $('engine-status').textContent='● 皮卡鱼已就绪';
    if(line){this.evaluations[this.cursor]=this.currentEval;this.captureMistakes();this.renderCoach();this.renderChart();this.renderHistory();this.persist();}
    if(this.paused||this.mode==='free'||this.turn===this.humanSide||this.cursor!==this.history.length||this.gameOver)return;
    const bookMove=this.bookMove(), move=bookMove||msg.data.bestmove;
    if(!move||move==='(none)'||move==='0000'){this.paused=true;this.render();this.toast('引擎没有给出可走着法，请检查终局或重复局面。');return;}
    this.replyTimer=setTimeout(()=>{if(msg.id===this.requestId&&!this.paused&&msg.fen===this.toFEN())this.commit(move,bookMove?'book':'engine');},350);
  }
  renderBoard() {
    this.clearSelection();this.arrowGroup.replaceChildren();this.drawPieces();
    if(this.cursor){const move=this.history[this.cursor-1];this.drawLastMoveHighlight(...move.from,...move.to);}
    // Make every intersection keyboard accessible, including empty destinations.
    let targets=this.svgEl.querySelector('#board-targets');if(targets)targets.remove();
    targets=this.createSVG('g',{id:'board-targets'});
    for(let r=0;r<10;r++)for(let c=0;c<9;c++){
      const el=this.createSVG('rect',{x:this.viewX(c)-22,y:this.viewY(r)-22,width:44,height:44,fill:'transparent',tabindex:0,role:'button','aria-label':`${String.fromCharCode(97+c)}${9-r} ${this.board[r][c]?PIECE_CHARS[this.board[r][c]]:'空位'}`});
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const rect=this.svgEl.getBoundingClientRect();this.clickBoard({clientX:rect.left+this.viewX(c)*rect.width/512,clientY:rect.top+this.viewY(r)*rect.height/564});}});
      targets.appendChild(el);
    }this.svgEl.appendChild(targets);
  }
  outcome() {
    if(!this.legalMoves().length)return this.turn==='w'?'黑方获胜 · 红方无合法着法':'红方获胜 · 黑方无合法着法';
    const key=positionKey(this.toFEN());let count=positionKey(this.rootFen)===key?1:0;
    const g=new XiangqiRules(this.rootFen);
    for(const m of this.history.slice(0,this.cursor)){g.play(m.uci);if(positionKey(g.toFEN())===key)count++;}
    return count>=3?'重复局面 · 练习暂停，请变招':'';
  }
  render() {
    const outcome=this.outcome();this.gameOver=Boolean(outcome);
    $('position-label').textContent=outcome||(this.cursor!==this.history.length?'回看这一刻的选择':this.cursor?`第 ${Math.floor(this.cursor/2)+1} 回合 · ${this.turn==='w'?'红':'黑'}方行棋`:'从第一步，开始积累');
    $('session-label').textContent=this.mode==='book'?'棋谱陪练':this.mode==='free'?'自由分析':'引擎陪练';
    const checking=!this.gameOver&&this.isKingExposed(this.turn==='w'?'K':'k');
    $('turn-text').textContent=this.gameOver?'已暂停':this.paused?'复盘 / 已暂停':`${this.turn==='w'?'红':'黑'}方${checking?'被将军':'走棋'}`;
    $('btn-pause').textContent=this.paused?'继续陪练':'暂停陪练';$('btn-pause').disabled=this.gameOver||this.cursor!==this.history.length;
    $('btn-undo').disabled=this.cursor===0;$('btn-retry').disabled=!this.history.slice(0,this.cursor).some(m=>m.source==='human');
    $('btn-continue').hidden=this.cursor===this.history.length;$('book-status').textContent=this.bookMessage();
    $('practice-banner').hidden=!this.practiceReturn;
    $('practice-label').textContent=this.activeMistakeId?'错题重练 · 先独立尝试，再对照推荐走法':'';
    this.renderBoard();this.renderEvaluation();this.renderCoach();this.renderHistory();this.renderAnalysis();this.renderChart();this.renderMistakeSummary();
  }
  scoreText(e,side=1) {
    if(!e)return '—';const n=e.value*side;
    if(e.type==='mate')return n>0?`杀 ${Math.abs(n)}`:n<0?`被杀 ${Math.abs(n)}`:'将死';
    return (n>0?'+':'')+(n/100).toFixed(2);
  }
  renderEvaluation() {
    if(this.gameOver){
      const result=this.outcome(),redWin=result.startsWith('红方获胜'),blackWin=result.startsWith('黑方获胜');
      if(redWin||blackWin){$('red-score').textContent=redWin?'胜':'负';$('black-score').textContent=blackWin?'胜':'负';$('eval-fill').style.width=redWin?'100%':'0%';}
      else {$('red-score').textContent='—';$('black-score').textContent='—';$('eval-fill').style.width='50%';}
      $('eval-verdict').textContent=result;$('eval-depth').textContent='练习已结束或暂停';return;
    }
    const e=this.currentEval;
    $('red-score').textContent=this.scoreText(e);$('black-score').textContent=this.scoreText(e,-1);
    const v=e?.value||0;
    $('eval-verdict').textContent=!e?'等待当前局面评分':e.type==='mate'?(v>0?'红方有杀棋':v<0?'黑方有杀棋':'已到将死局面'):Math.abs(v)<50?'局面接近均势':(v>0?'红方':'黑方')+(Math.abs(v)<200?'稍优':'明显占优');
    $('eval-fill').style.width=(e?(e.type==='mate'?(v>0?98:2):50+46*Math.tanh(v/400)):50)+'%';
    $('eval-depth').textContent=e?`深度 ${e.depth} · ${e.done?'本次计算完成':'计算中'}`:'正在计算当前局面…';
  }
  renderAnalysis() {
    const el=$('analysis-lines');el.replaceChildren();this.arrowGroup.replaceChildren();
    if(!$('show-hints').checked){const p=document.createElement('p');p.className='subtle';p.textContent='提示已收起。评分仍会更新，先试着找出你的计划。';el.appendChild(p);return;}
    if(!this.lastData?.lines?.length){el.textContent='等待引擎给出候选走法…';return;}
    for(const [i,line] of this.lastData.lines.entries()){
      const div=document.createElement('div');div.className='analysis-line';
      const top=document.createElement('div');top.className='analysis-top';
      const g=new XiangqiRules(this.toFEN()),names=[];
      for(const m of (line.pv||[]).slice(0,5)){try{const name=g.notation(m);g.play(m);names.push(name);}catch{break;}}
      const name=document.createElement('span');name.textContent=`${i+1}. ${names[0]||'—'}`;
      const score=document.createElement('span');score.textContent='红 '+this.scoreText({value:redScore(line,this.turn),type:line.scoreType});top.append(name,score);
      const pv=document.createElement('div');pv.className='analysis-pv';pv.textContent=names.slice(1).join(' → ');div.append(top,pv);el.appendChild(div);
      if(i===0&&line.pv?.[0])this.drawArrow(line.pv[0],true);
    }
  }
  lossAt(index) {
    const move=this.history[index];
    return move?moveAssessment(move,this.evaluations[index],this.evaluations[index+1]).loss:null;
  }
  coachIndex() {
    let i=this.cursor-1;
    if(!this.paused&&this.mode!=='free')for(let j=i;j>=0;j--)if(this.history[j].source==='human'){i=j;break;}
    return i;
  }
  renderCoach() {
    const el=$('coach-text'),i=this.coachIndex();
    $('btn-save-mistake').disabled=i<0;$('move-grade').hidden=i<0;$('move-facts').replaceChildren();$('coach-reference').hidden=true;$('btn-coach-reference').disabled=true;$('btn-coach-reference').textContent='对照当时推荐';
    if(i<0){el.textContent='先独立选择一手。落子后会说明吃子、将军和直接威胁，并可收藏为错题重练。';return;}
    const m=this.history[i],a=this.evaluations[i],b=this.evaluations[i+1];
    const assessment=moveAssessment(m,a,b);
    $('move-grade').textContent=assessment.label;$('move-grade').dataset.kind=assessment.kind;
    try{for(const fact of moveFacts(m.fen,m.uci)){const li=document.createElement('li');li.textContent=fact;$('move-facts').appendChild(li);}}catch{ /* Terminal positions can be inspected through the move list. */ }
    let reference=[];
    if(a?.bestMove){
      const g=new XiangqiRules(m.fen);
      for(const uci of (a.pv?.length?a.pv:[a.bestMove]).slice(0,5)){try{const name=g.notation(uci);g.play(uci);reference.push(name);}catch{break;}}
    }
    $('btn-coach-reference').disabled=!reference.length;
    $('btn-coach-reference').textContent=this.referenceIndex===i?'收起当时推荐':'对照当时推荐';
    if(reference.length&&this.referenceIndex===i){$('coach-reference').hidden=false;$('coach-reference').textContent=`当时推荐：${reference.join(' → ')}。这是走棋前的搜索结果，可回看该局面重新核对。`;}
    if(this.gameOver){el.textContent=this.outcome()+'。可悔棋重练，或将关键一步收藏到错题本。';return;}
    if(!b){el.textContent=`${m.name}。正在评估这一步；请等当前局面计算完成后再比较。`;return;}
    if(!a){el.textContent=`${m.name} 后红方评分为 ${this.scoreText(b)}。走棋前的评分尚未完成，可回看上一局面补充评估。`;return;}
    const loss=this.lossAt(i),who=isRed(m.piece)?'红方':'黑方';
    if(loss===null){el.textContent=`${m.name} 后，${b.type==='mate'?(b.value>0?'红方出现杀棋':'黑方出现杀棋'):'局面已离开原来的杀棋变化'}。打开提示，沿着变化核对攻防。`;return;}
    const detail=loss>=150?'局势损失较大，值得退回这一步重算。':loss>=50?'局势有所下降，可以比较其他候选走法。':'这一步基本保持了局势，继续观察对方的威胁。';
    el.textContent=`${who} ${m.name}：红方评分 ${this.scoreText(a)} → ${this.scoreText(b)}。${detail}（前后评分差仅供参考，会随计算深度变化。）`;
  }
  renderHistory() {
    const list=$('move-list');list.replaceChildren();
    if(!this.history.length){const p=document.createElement('p');p.className='subtle';p.textContent='棋谱会随你的落子记录在这里。';list.appendChild(p);}
    let row,round=0;
    this.history.forEach((m,i)=>{
      const red=isRed(m.piece);
      if(red||!row){row=document.createElement('div');row.className='move-row';const n=document.createElement('span');n.className='move-number';n.textContent=String(++round).padStart(2,'0');row.appendChild(n);if(!red)row.appendChild(document.createElement('span'));list.appendChild(row);}
      const btn=document.createElement('button');btn.className=`move-button ${red?'red':''} ${i+1===this.cursor?'active':''}`;btn.textContent=m.name;btn.title=`第 ${i+1} 手 · ${m.source==='book'?'棋谱着法':m.source==='engine'?'引擎着法':m.source==='record'?'历史着法':'你的着法'} · 点击复盘`;
      const loss=this.lossAt(i);if(loss>=100){const s=document.createElement('span');s.className='score-loss';s.textContent=`损失 ≈ ${(loss/100).toFixed(2)}`;btn.appendChild(s);}
      btn.onclick=()=>this.review(i+1);row.appendChild(btn);
    });
    $('move-count').textContent=`${this.cursor} / ${this.history.length} 手`;
    $('btn-first').disabled=$('btn-prev').disabled=this.cursor===0;
    $('btn-last').disabled=$('btn-next').disabled=this.cursor===this.history.length;
    if(this.cursor===this.history.length)list.scrollTop=list.scrollHeight;
  }
  renderChart() {
    const svg=$('score-chart');svg.replaceChildren(this.createSVG('line',{x1:0,y1:31,x2:500,y2:31,stroke:'#d9ded1','stroke-dasharray':'4 4'}));
    const n=Math.max(this.history.length,1),points=[];
    this.evaluations.forEach((e,i)=>{if(e){const val=e.type==='mate'?(e.value>0?1000:-1000):e.value;points.push([i/n*490+5,31-26*Math.tanh(val/400),i]);}});
    // Gaps remain gaps: an unanalysed position is never shown as an invented score.
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(b[2]===a[2]+1)svg.appendChild(this.createSVG('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#69866b','stroke-width':2}));}
    for(const [x,y,i] of points){const dot=this.createSVG('circle',{cx:x,cy:y,r:i===this.cursor?4:2.5,fill:i===this.cursor?'#ae4a3c':'#69866b'});svg.appendChild(dot);}
  }
  importRecord() {
    try {
      const parsed=parseRecord($('record-text').value);
      if((this.history.length||this.practiceReturn)&&!window.confirm('导入会替换当前练习和暂存的原局。需要保留时请先导出。继续吗？'))return;
      this.cancelAnalysis();this.book={...parsed,id:'custom',description:`自选棋谱 · ${parsed.moves.length} 手${parsed.hasVariations?' · 已仅提取主线':''}`};
      this.practiceReturn=null;this.activeMistakeId=null;this.referenceIndex=null;
      this.books=this.books.filter(b=>b.id!=='custom');this.books.push(this.book);this.mode='book';this.rootFen=parsed.fen;
      this.history=[];this.cursor=0;this.evaluations=[];this.currentEval=null;this.lastData=null;this.paused=false;this.parseFEN(parsed.fen);
      this.populateBooks();this.render();this.requestAnalysis();this.persist();$('import-dialog').close();this.toast(parsed.hasVariations?'已导入主线；变着未导入。':'棋谱已导入，开始跟谱练习。');
    }catch(error){$('import-error').textContent=error.message;}
  }
  exportRecord() {
    const offset=this.rootFen.split(' ')[1]==='b'?1:0;
    const movetext=this.history.map((m,i)=>{const round=Math.floor((i+offset)/2)+1;return `${isRed(m.piece)?round+'. ':i===0?round+'... ':''}${m.uci}`;}).join(' ');
    const rows=['[Event "象棋研习室练习"]',`[FEN "${this.rootFen}"]`,'[Result "*"]','',movetext+' *'];
    const url=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='象棋研习室-'+new Date().toISOString().slice(0,10)+'.pgn';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  loadMistakes() {
    try {
      const saved=JSON.parse(localStorage.getItem('xiangqi-mistakes-v1'));
      if(!Array.isArray(saved))return;
      for(const item of saved.slice(0,100)){try{const entry=validateStudyEntry(item);if(!this.mistakes.some(m=>m.id===entry.id))this.mistakes.push(entry);}catch{ /* Keep other valid entries if one record is damaged. */ }}
    }catch{ /* A blocked store does not prevent a local practice session. */ }
  }
  saveMistakes() {
    try{localStorage.setItem('xiangqi-mistakes-v1',JSON.stringify(this.mistakes));}
    catch{if(!this.mistakeStorageWarning){this.mistakeStorageWarning=true;this.toast('错题暂存于本次页面，浏览器未能写入本地存储。');}}
  }
  captureMistakes() {
    let added=false;
    for(let i=0;i<this.history.length;i++){
      const entry=createStudyEntry(this,i);
      if(entry&&!this.mistakes.some(item=>item.id===entry.id)){this.mistakes=addStudyEntry(this.mistakes,entry);added=true;}
    }
    if(added){this.saveMistakes();this.renderMistakeSummary();}
  }
  saveCurrentMistake() {
    const entry=createStudyEntry(this,this.coachIndex(),true);if(!entry)return;
    const exists=this.mistakes.some(item=>item.id===entry.id);
    this.mistakes=addStudyEntry(this.mistakes,entry);this.saveMistakes();this.renderMistakeSummary();
    this.toast(exists?'这一步已在错题本中。':'已收藏，打开“我的错题本”即可重练。');
  }
  renderMistakeSummary() {
    $('mistake-count').textContent=String(this.mistakes.length);
    $('mistake-summary').textContent=this.mistakes.length?`已保存 ${this.mistakes.length} 个局面，换一局仍可继续复习。`:'评分明显下降的着法会自动收录，也可以手动收藏任意一步。';
  }
  renderMistakes() {
    const list=$('mistake-list');list.replaceChildren();
    if(!this.mistakes.length){const p=document.createElement('p');p.className='subtle';p.textContent='还没有错题。下棋后可点“收藏这一步”，或等待自动收录值得重算的着法。';list.appendChild(p);return;}
    for(const entry of this.mistakes){
      const item=document.createElement('article');item.className='mistake-item';
      const title=document.createElement('strong');title.textContent=`第 ${entry.moves.length+1} 手 · ${entry.name}`;
      const detail=document.createElement('p');detail.className='subtle';detail.textContent=`${entry.manual?'手动收藏':'自动收录'}${entry.loss===null?'':` · 评分损失参考 ${(entry.loss/100).toFixed(2)}`} · 已练 ${entry.attempts} 次`;
      const actions=document.createElement('div');actions.className='mistake-actions';
      const practice=document.createElement('button');practice.className='button primary';practice.textContent='重练这个局面';practice.onclick=()=>this.practiceMistake(entry.id);
      const remove=document.createElement('button');remove.className='text-button';remove.textContent='移出错题本';remove.onclick=()=>{this.mistakes=this.mistakes.filter(m=>m.id!==entry.id);this.saveMistakes();this.renderMistakeSummary();this.renderMistakes();};
      actions.append(practice,remove);item.append(title,detail,actions);list.appendChild(item);
    }
  }
  practiceMistake(id) {
    const entry=this.mistakes.find(m=>m.id===id);if(!entry)return;
    const g=new XiangqiRules(entry.rootFen);for(const move of entry.moves)g.play(move);
    const saved=this.practiceReturn||this.sessionData();
    const evaluations=[];evaluations[entry.moves.length]=entry.before;
    this.cancelAnalysis();
    this.applySession({rootFen:entry.rootFen,moves:entry.moves.map(uci=>({uci,source:'record'})),evaluations,mode:'engine',humanSide:g.turn,ms:this.ms,book:this.book,flipped:this.flipped,paused:false,hintsVisible:false});
    this.practiceReturn=saved;this.activeMistakeId=id;this.referenceIndex=null;
    this.drawBoard();this.populateBooks();this.render();this.requestAnalysis();this.persist();$('mistake-dialog').close();
  }
  returnToSession() {
    if(!this.practiceReturn)return;
    try{
      this.cancelAnalysis();this.applySession(this.practiceReturn);this.practiceReturn=null;this.activeMistakeId=null;this.referenceIndex=null;
      this.drawBoard();this.populateBooks();this.render();this.requestAnalysis();this.persist();
    }catch(error){this.toast('原局恢复失败：'+error.message);}
  }
  sessionData() {
    return {rootFen:this.rootFen,moves:this.history.map(m=>({uci:m.uci,source:m.source})),evaluations:this.evaluations,mode:this.mode,humanSide:this.humanSide,ms:this.ms,book:this.book,cursor:this.cursor,paused:this.paused,flipped:this.flipped,hintsVisible:this.hintsVisible};
  }
  persist() {
    try {localStorage.setItem('xiangqi-study-v1',JSON.stringify({...this.sessionData(),practiceReturn:this.practiceReturn,activeMistakeId:this.activeMistakeId}));}
    catch {if(!this.storageWarning){this.storageWarning=true;this.toast('浏览器未能保存进度，请导出棋谱备份。');}}
  }
  restore() {
    try {
      const data=JSON.parse(localStorage.getItem('xiangqi-study-v1'));if(!data)return;
      this.applySession(data);
      if(this.history.length)this.paused=true;
      if(data.practiceReturn&&typeof data.activeMistakeId==='string'){this.practiceReturn=data.practiceReturn;this.activeMistakeId=data.activeMistakeId;}
    }catch {try{localStorage.removeItem('xiangqi-study-v1');}catch{}this.parseFEN(START_FEN);}
  }
  applySession(data) {
    if(!data||!Array.isArray(data.moves)||data.moves.length>600)throw new Error('记录不正确');
    const g=new XiangqiRules(data.rootFen),records=data.moves.map(m=>({...g.play(m.uci),source:['human','engine','book'].includes(m.source)?m.source:'record'}));
    const book=data.book||this.books[0];
    if(!Array.isArray(book.moves)||book.moves.length>600)throw new Error('训练棋谱不正确');
    const b=new XiangqiRules(book.fen);for(const move of book.moves)b.play(move);
    const cursor=Number.isInteger(data.cursor)&&data.cursor>=0&&data.cursor<=records.length?data.cursor:records.length;
    const position=new XiangqiRules(data.rootFen);for(const move of records.slice(0,cursor))position.play(move.uci);
    if(book.id==='custom'){this.books=this.books.filter(b=>b.id!=='custom');this.books.push(book);}
    this.book=this.books.find(b=>b.id===book.id)||this.books[0];
    this.rootFen=data.rootFen;this.history=records;this.cursor=cursor;this.board=position.board;this.turn=position.turn;
    this.evaluations=Array.isArray(data.evaluations)?data.evaluations.slice(0,records.length+1).map(cleanEvaluation):[];
    this.currentEval=this.evaluations[cursor]||null;this.lastData=null;
    this.mode=['engine','book','free'].includes(data.mode)?data.mode:'engine';this.humanSide=data.humanSide==='b'?'b':'w';this.ms=[500,1500,3000].includes(data.ms)?data.ms:1500;
    this.paused=Boolean(data.paused);this.flipped=Boolean(data.flipped);this.hintsVisible=Boolean(data.hintsVisible);
  }
}
window.addEventListener('DOMContentLoaded',()=>{window.game=new XiangqiTrainer();});
