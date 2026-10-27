const assert=require('node:assert/strict');
const Session=require('../client/session.js');
const Production=require('../client/production.js');

const storage={data:{},setItem(k,v){this.data[k]=v;},getItem(k){return this.data[k]||null;},removeItem(k){delete this.data[k];}};
const jobs=[
  {id:'1',rawFileName:'Logo A_OrderQ = 50.pdf',fileName:'Logo A_OrderQ = 50.pdf',filePath:'C:/production/Logo A_OrderQ = 50.pdf',width:90,height:50,orderQ:50,orderQSource:'parsed',orderQConfirmed:true,measured:true},
  {id:'2',rawFileName:'Logo B_OrderQ = 100.pdf',fileName:'Logo B_OrderQ = 100.pdf',filePath:'C:/production/Logo B_OrderQ = 100.pdf',width:70,height:100,orderQ:100,orderQSource:'manual',orderQConfirmed:true,measured:false}
];
const settings={sheetW:700,sheetH:500,edge:20,inset:5,rotate:true};
const plan=Production.planProduction({settings,jobs,mode:'balanced'});
const selected=plan.proposals.find(p=>p.id!==plan.id)||plan;
const state={jobs,latest:selected,proposals:plan.proposals,selectedSheet:Math.min(0,selected.sheetCount-1),scrollTop:650,settings,
  optimizationMode:'balanced',overproductionCap:'5',customOverproduction:'0'};

// Import -> calculate -> select -> generate (host receives payload) -> panel reload.
assert.equal(Session.save(storage,state),true);
const generatedPayload=JSON.stringify({layout:selected});
assert.ok(generatedPayload.includes(jobs[0].filePath));
const restored=Session.load(storage);
assert.deepEqual(restored.jobs,jobs,'source paths, names, dimensions, OrderQ and measured/manual flags survive panel reload');
assert.deepEqual(restored.latest,selected,'selected proposal and calculated layout survive panel reload');
assert.deepEqual(restored.proposals,plan.proposals,'all optimization choices survive panel reload');
assert.equal(restored.selectedSheet,state.selectedSheet);
assert.equal(restored.scrollTop,650,'panel position survives a CEP reload');

// Generation can be repeated without reimporting, and failure does not clear the session.
const secondPayload=JSON.stringify({layout:restored.latest});
assert.equal(secondPayload,generatedPayload);
assert.deepEqual(Session.load(storage).jobs,jobs);
Session.save(storage,{...state,jobs:restored.jobs,latest:restored.latest});
assert.deepEqual(Session.load(storage).latest,selected,'failed generation callback leaves layout intact');
Session.clear(storage);
assert.equal(Session.load(storage),null);

// Existing users who saved the old zero-cap default now get the automatic
// optimizer and the least-overproduction objective after upgrading.
storage.setItem(Session.key,JSON.stringify({version:1,jobs,latest:null,proposals:[],selectedSheet:0,
  settings,optimizationMode:'balanced',overproductionCap:'0',customOverproduction:'0'}));
const upgraded=Session.load(storage);
assert.equal(upgraded.version,4);
assert.equal(upgraded.migratedOptimizerDefaults,true);
assert.equal(upgraded.settings.inset,5,'a saved 5 mm production margin remains intact');
assert.equal(upgraded.optimizationMode,'overproduction');
assert.equal(upgraded.overproductionCap,'auto');
storage.setItem(Session.key,JSON.stringify({version:2,jobs,settings:{...settings,inset:4},latest:null,proposals:[]}));
const chosenMargin=Session.load(storage);
assert.equal(chosenMargin.version,4);
assert.equal(chosenMargin.settings.inset,4,'a saved nondefault margin remains available');
console.log('PASS: import, calculate, generate, CEP reload recovery, repeat generation, and failure retention');
