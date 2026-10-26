const assert=require('node:assert/strict'),Beam=require('../client/beam-packing.js'),Cutting=require('../host/cutting.js'),P=require('../client/production.js');
const fixtures=require('./packing-fixtures.js'),validate=require('./plan-invariants.js');
// Certification must reject legal geometric packings that cannot be cut.
const pinwheel=[{x:0,y:0,w:1,h:2},{x:1,y:0,w:2,h:1},{x:2,y:1,w:1,h:2},{x:0,y:2,w:2,h:1},{x:1,y:1,w:1,h:1}];
assert.equal(Cutting.deriveGuillotineCuts({sheetW:3,sheetH:3,edge:0},pinwheel),null);
assert.equal(Cutting.deriveGuillotineCuts({sheetW:3,sheetH:3,edge:0},[{x:0,y:0,w:2,h:2},{x:1,y:1,w:2,h:2}]),null);

const s={sheetW:100,sheetH:80,edge:5,inset:5,rotate:true};
const input={settings:s,jobs:[{id:'large',width:40,height:40,orderQ:1},{id:'small',width:10,height:10,orderQ:1}],maxOverproductionPct:200};
const snapshot=JSON.stringify(input);
const raw=Beam.search(input,1,{deadline:Date.now()+3000,maxStates:4000,width:6});
assert.ok(raw);assert.equal(Cutting.verifyGuillotineCuts(s,raw.bins[0].placements,raw.bins[0].cuts),true);
assert.ok(raw.bins[0].placements.filter(p=>p.id==='small').length>1,'small copies occupy space that the large logo cannot use');
assert.ok(raw.bins[0].placements.filter(p=>p.id==='small').length<=3,'gap filling respects each job cap');
assert.equal(JSON.stringify(input),snapshot);
// Operation-bounded searches are repeatable; wall deadlines are safety caps.
const first=Beam.search(input,1,{deadline:Date.now()+10000,maxStates:1000,width:4});
const second=Beam.search(input,1,{deadline:Date.now()+10000,maxStates:1000,width:4});
assert.deepEqual(first,second);
const turned=Beam.search({settings:s,jobs:[{id:'rotate',width:55,height:75,orderQ:1}],maxOverproductionPct:0},1,{deadline:Date.now()+1000});
assert.ok(turned);assert.equal(turned.bins[0].placements[0].rotated,true);
assert.equal(Beam.search({settings:{...s,rotate:false},jobs:[{id:'rotate',width:55,height:75,orderQ:1}],maxOverproductionPct:0},1,{deadline:Date.now()+1000}),null);
assert.equal(Beam.search({...input,maxOverproductionPct:0},2,{deadline:Date.now()+1000}),null,'run count that overproduces is rejected');

// Test actual production math after optional copies, rather than only the
// optimizer's rounded percentages. Baseline options must survive timeouts.
for(const fixture of [fixtures[0],fixtures[1],fixtures[4]]){
  const original=JSON.stringify(fixture),plan=P.planProduction(fixture);
  validate(plan,fixture);
  for(const proposal of plan.proposals)validate(proposal,fixture);
  assert.ok(plan.areaPct>=plan.baselineUtilizationPct);
  assert.equal(JSON.stringify(fixture),original);
  assert.ok(plan.searchDiagnostics.beam.expandedStates>1000);
}
assert.throws(()=>P.planProduction({...fixtures[0],settings:{...fixtures[0].settings,inset:4}}),/5 mm/);
assert.throws(()=>P.planProduction({...fixtures[0],jobs:[fixtures[0].jobs[0],fixtures[0].jobs[0]]}),/unique ID/);
console.log('PASS: MaxRects beam, repair, gap filling, cut certificates, exact dimensions, rotation and per-job production caps');
