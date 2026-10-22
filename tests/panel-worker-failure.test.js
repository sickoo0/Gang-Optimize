const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Production=require('../client/production.js');
const Cutting=require('../host/cutting.js');

const jobs=[500,400,100,50].map((q,i)=>({id:String(i+1),fileName:`job-${i}-OrderQ = ${q}.pdf`,
  filePath:`C:/production/job-${i}.pdf`,width:100,height:80,orderQ:q,orderQConfirmed:true,measured:true}));
const settings={sheetW:700,sheetH:500,edge:20,inset:5,rotate:true};
const prior=Production.planProduction({settings,jobs,mode:'balanced',maxOverproductionPct:0});

const scrollRoot={scrollTop:0,scrollLeft:0};
class Element{
  constructor(id){this.id=id;this.children=[];this.handlers={};this.style={};this.parentNode={clientWidth:420};
    this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.innerHTML='';this.textContent='';}
  get innerHTML(){return this._innerHTML;}
  set innerHTML(value){this._innerHTML=value;if(this.id==='proposals')scrollRoot.scrollTop=0;}
  addEventListener(type,fn){this.handlers[type]=fn;}
  appendChild(child){this.children.push(child);return child;}
  setAttribute(){}
  getContext(){return {setTransform(){},clearRect(){},fillRect(){},strokeRect(){},setLineDash(){},fillText(){}};}
}
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
for(const [id,value] of Object.entries({sheetW:700,sheetH:500,edge:20,inset:5,optimizationMode:'balanced',overproductionCap:'0',customOverproduction:'0'}))get(id).value=String(value);
get('rotate').checked=true;get('optimize').innerHTML='Calculate layout';
let saved,workerStarts=0,synchronousCalls=0;
const context={
  document:{getElementById:get,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),readyState:'complete',documentElement:scrollRoot,body:scrollRoot},
  window:{devicePixelRatio:1,localStorage:{},__adobe_cep__:{evalScript(){}},addEventListener(){},
    BytebaseCutting:Cutting,BytebaseSession:{load(){return {jobs,latest:prior,proposals:prior.proposals,selectedSheet:0,settings,
      optimizationMode:'balanced',overproductionCap:'0',customOverproduction:'0'};},save(storage,value){saved=value;return true;},clear(){}}},
  Worker:class{constructor(){workerStarts++;throw Error('CEP worker failed to load');}},
  BytebaseProduction:{planProduction(){synchronousCalls++;throw Error('unsafe UI-thread fallback');}},
  setTimeout(){throw Error('UI-thread fallback was scheduled');},clearTimeout(){},
  console:{info(){},error(){}}
};
vm.runInNewContext(fs.readFileSync(require.resolve('../client/panel.js'),'utf8'),context,{filename:'panel.js'});
get('optimize').handlers.click();
assert.equal(workerStarts,1);
assert.equal(synchronousCalls,0,'worker failure must never run the optimizer on the CEP UI thread');
assert.match(get('status').textContent,/CEP worker failed to load/);
assert.equal(get('fileCount').textContent,'4 PDFs');
assert.equal(saved.jobs.length,4);
assert.equal(saved.latest.id,prior.id,'last valid layout survives calculation failure');
assert.equal(saved.proposals.length,prior.proposals.length);

// Re-rendering proposals used to lose the viewport position after calculation.
let worker;
context.Worker=class{constructor(){worker=this;}postMessage(){}terminate(){}};
context.setTimeout=()=>1;
context.window.scrollTo=(x,y)=>{scrollRoot.scrollTop=y;};
context.window.requestAnimationFrame=fn=>fn();
scrollRoot.scrollTop=650;
get('optimize').handlers.click();
worker.onmessage({data:{type:'result',plan:prior}});
assert.equal(scrollRoot.scrollTop,650,'calculation result keeps the CEP panel at its prior scroll position');
assert.equal(saved.scrollTop,650,'the viewport position is saved for a possible CEP reload');
assert.match(get('status').textContent,/Planned/);
// A persisted proposal from the former multi-artboard optimizer cannot be
// offered for generation after a CEP reload. Its imported PDFs remain intact.
const stale={...prior,id:'obsolete-two-sheet-plan',sheetCount:2,sheets:[prior.sheets[0],prior.sheets[0]]};
const elements2=new Map(),scrollRoot2={scrollTop:0,scrollLeft:0};
const get2=id=>{if(!elements2.has(id))elements2.set(id,new Element(id));return elements2.get(id);};
for(const [id,value] of Object.entries({sheetW:700,sheetH:500,edge:20,inset:5,optimizationMode:'utilization',overproductionCap:'0',customOverproduction:'0'}))get2(id).value=String(value);
get2('rotate').checked=true;get2('optimize').innerHTML='Calculate layout';
let restoredSnapshot;
const reloaded={
  document:{getElementById:get2,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),
    readyState:'complete',documentElement:scrollRoot2,body:scrollRoot2},
  window:{devicePixelRatio:1,localStorage:{},__adobe_cep__:{evalScript(){}},addEventListener(){},
    BytebaseCutting:Cutting,BytebaseSession:{load(){return {jobs,latest:stale,proposals:[stale,prior],selectedSheet:1,settings,
      optimizationMode:'utilization',overproductionCap:'0',customOverproduction:'0'};},
      save(storage,value){restoredSnapshot=value;return true;},clear(){}}},
  Worker:class{},setTimeout(){},clearTimeout(){},console:{info(){},error(){}}
};
vm.runInNewContext(fs.readFileSync(require.resolve('../client/panel.js'),'utf8'),reloaded,{filename:'panel.js'});
assert.equal(get2('fileCount').textContent,'4 PDFs');
assert.equal(get2('metricSheets').textContent,1);
assert.equal(restoredSnapshot.latest.sheetCount,1);
assert.equal(restoredSnapshot.jobs.length,4);
assert.equal(restoredSnapshot.proposals.length,1);
assert.match(get2('status').textContent,/previous layout had no verified guillotine cut sequence/);
console.log('PASS: worker failure retains jobs/proposals and a successful calculation preserves scroll position');
