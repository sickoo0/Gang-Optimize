const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Session=require('../client/session.js');
const Production=require('../client/production.js');
const Cutting=require('../host/cutting.js');

const settings={sheetW:700,sheetH:500,edge:20,inset:5,rotate:true};
const jobs=[500,400,100,50].map((orderQ,i)=>({id:String(i+1),fileName:`job-${i}-OrderQ = ${orderQ}.pdf`,
  filePath:`C:/production/job-${i}.pdf`,width:20+i,height:20+i,orderQ,orderQSource:i===1?'manual':'parsed',
  orderQConfirmed:true,measured:i!==1}));
const plan=Production.planProduction({settings,jobs,mode:'utilization',maxOverproductionPct:0});
const state={jobs,latest:plan,proposals:plan.proposals,selectedSheet:0,scrollTop:420,appScrollTop:0,
  settings,optimizationMode:'utilization',overproductionCap:'0',customOverproduction:'0'};

class Element{
  constructor(id){this.id=id;this.children=[];this.handlers={};this.style={};this.parentNode={clientWidth:420};
    this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.innerHTML='';this.textContent='';}
  addEventListener(type,fn){this.handlers[type]=fn;}
  appendChild(child){this.children.push(child);return child;}
  setAttribute(){}
  getContext(){return {setTransform(){},clearRect(){},fillRect(){},strokeRect(){},setLineDash(){},fillText(){}};}
}
function panel({dev=false,jsxResponse='BYTEBASE_RELOAD_OK',saveFails=false,extensionPath='file:///C:/work/Bytebase%20Gang'}){
  let blockSave=false;
  const data={},storage={getItem(k){return data[k]||null;},setItem(k,v){if(blockSave&&k===Session.key)throw Error('disk full');data[k]=v;},removeItem(k){delete data[k];}};
  Session.save(storage,state);
  blockSave=saveFails;
  if(dev)storage.setItem('com.bytebase.gangoptimizer.devMode','1');
  const elements=new Map(),scrollRoot={scrollTop:0,scrollLeft:0};
  const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  for(const [id,value] of Object.entries({sheetW:700,sheetH:500,edge:20,inset:5,optimizationMode:'balanced',overproductionCap:'0',customOverproduction:'0'}))get(id).value=String(value);
  get('rotate').checked=true;get('optimize').innerHTML='Calculate layout';
  let expression=null,replaced=null,callback=null;
  const location={href:'file:///C:/work/Bytebase%20Gang/client/index.html?other=1#preview',search:'?other=1',
    replace(url){replaced=url;}};
  const cep={getSystemPath(type){assert.equal(type,'extension');return extensionPath;},evalScript(source,done){expression=source;callback=done;}};
  const window={localStorage:storage,__adobe_cep__:cep,location,devicePixelRatio:1,addEventListener(){},
    BytebaseSession:Session,BytebaseCutting:Cutting,
    scrollTo(x,y){scrollRoot.scrollTop=y;},requestAnimationFrame(fn){fn();},console:{info(){},error(){}}};
  const context={document:{getElementById:get,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),
    documentElement:scrollRoot,body:scrollRoot,readyState:'complete'},window,Worker:class{},
    setTimeout(){return 1;},clearTimeout(){},console:window.console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../client/panel.js'),'utf8'),context,{filename:'panel.js'});
  return {get,storage,location,click(){get('reloadPanel').handlers.click();},expression(){return expression;},
    answer(value=jsxResponse){callback(value);},replaced(){return replaced;}};
}

const hidden=panel({dev:false});
assert.equal(hidden.get('reloadPanel').hidden,true,'button is absent outside development mode');
assert.equal(hidden.get('reloadPanel').handlers.click,undefined);

const active=panel({dev:true});
assert.equal(active.get('reloadPanel').hidden,false);
assert.equal(active.get('fileCount').textContent,'4 PDFs');
assert.equal(active.get('metricUsage').textContent,plan.areaPct+'%');
active.click();
assert.equal(active.get('reloadPanel').disabled,true);
assert.equal(active.replaced(),null,'HTML reload waits for fresh JSX');
const match=/decodeURIComponent\("([^"]+)"\)/.exec(active.expression());
assert.ok(match,'the JSX path is safely encoded in the ExtendScript expression');
assert.equal(decodeURIComponent(match[1]),'C:/work/Bytebase Gang/host/host.jsx');
assert.match(active.expression(),/\$\.evalFile\(f\)/);
assert.deepEqual(Session.load(active.storage).jobs,jobs);
assert.deepEqual(Session.load(active.storage).latest,plan);
assert.equal(Session.load(active.storage).optimizationMode,'utilization');
assert.equal(Session.load(active.storage).scrollTop,420);
active.answer();
assert.match(active.replaced(),/^file:\/\/\/C:.*\/client\/index\.html\?other=1&bytebaseReload=\d+#preview$/);
assert.deepEqual(Session.load(active.storage).proposals,plan.proposals);

const failed=panel({dev:true,jsxResponse:'BYTEBASE_RELOAD_ERROR: syntax error (line 4)'});
failed.click();failed.answer();
assert.equal(failed.replaced(),null,'failed JSX reload does not navigate');
assert.equal(failed.get('reloadPanel').disabled,false);
assert.match(failed.get('status').textContent,/syntax error/);
assert.deepEqual(Session.load(failed.storage).jobs,jobs);

const unsaved=panel({dev:true,saveFails:true});
unsaved.click();
assert.equal(unsaved.expression(),null,'failed session persistence stops reload before JSX evaluation');
assert.match(unsaved.get('status').textContent,/could not be saved/);

const inline=[...fs.readFileSync(path.join(__dirname,'../client/index.html'),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(inline.length,2);
const written=[],assetContext={window:{location:{search:'?bytebaseReload=123'}},document:{write(text){written.push(text);}}};
inline.forEach(source=>vm.runInNewContext(source,assetContext));
assert.deepEqual(written,[
  '<link rel="stylesheet" href="styles.css?bytebaseReload=123">',
  '<link rel="stylesheet" href="optimization.css?bytebaseReload=123">',
  '<script src="../host/cutting.js?bytebaseReload=123"></script>',
  '<script src="packing.js?bytebaseReload=123"></script>',
  '<script src="production.js?bytebaseReload=123"></script>',
  '<script src="session.js?bytebaseReload=123"></script>',
  '<script src="panel.js?bytebaseReload=123"></script>'
]);
console.log('PASS: development-only reload, saved jobs/settings/plan, JSX refresh, failure retention and cache-busted HTML assets');
