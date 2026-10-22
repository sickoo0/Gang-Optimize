const assert = require('node:assert/strict');
const P = require('../client/packing.js');
const base = {settings:{sheetW:700,sheetH:500,edge:20,inset:5,rotate:true}};
const j = (id,w,h,c=1) => ({id,filePath:'/fake/'+id+'.pdf',fileName:id+'.pdf',width:w,height:h,copies:c});
const a = P.plan({...base,jobs:[j('A',90,50,12),j('B',115,80,6),j('C',60,40,16)]});
assert.equal(a.totalCopies,34);
assert.ok(a.sheetCount>=1);
assert.ok(a.areaPct>0);
for(const sheet of a.sheets){
  for(let i=0;i<sheet.placements.length;i++){
    const p=sheet.placements[i];
    assert.ok(p.x>=19.99999&&p.y>=19.99999);
    assert.ok(p.x+p.w<=680.00001&&p.y+p.h<=480.00001);
    for(let k=i+1;k<sheet.placements.length;k++)assert.equal(P.intersect(p,sheet.placements[k]),false, 'overlap!');
  }
}
const turn = P.plan({...base,jobs:[j('long',450,600,1)]});
assert.equal(turn.sheets[0].placements[0].rotated,true);
assert.throws(()=>P.plan({...base,jobs:[j('tooBig',1000,1000)]}),/Too large/);
assert.throws(()=>P.plan({...base,jobs:[j('bad',50,0)]}),/Check width/);
const multi=P.plan({...base,jobs:[j('large',500,400,4)]});
assert.ok(multi.sheetCount>1);
const singleton=P.plan({...base,jobs:[j('one',90,50)]});
assert.deepEqual([singleton.sheets[0].placements[0].w,singleton.sheets[0].placements[0].h].sort((a,b)=>a-b),[60,100]);
const logo=P.plan({...base,jobs:[j('100mm-square',100,100)]});
assert.deepEqual([logo.sheets[0].placements[0].w,logo.sheets[0].placements[0].h],[110,110], '5 mm margin is added on every side');
const measured=P.plan({...base,jobs:[j('measured-pdf',35.35,38.72)]}).sheets[0].placements[0];
assert.deepEqual([measured.artworkW,measured.artworkH],[35.35,38.72], 'measured PDF dimensions pass into layout without a 100 mm fallback');
assert.deepEqual([measured.w,measured.h],[45.35,48.72]);
const rotated=P.plan({...base,jobs:[j('rotated',450,600)]}).sheets[0].placements[0];
assert.equal(rotated.rotated,true);
assert.deepEqual([rotated.w,rotated.h],[610,460], 'rotation turns complete artwork plus its cut margin');
assert.ok(Math.abs(P.ptToMm(P.mmToPt(100))-100)<1e-10, 'mm/point conversion round-trips');
assert.ok(Math.abs(P.mmToPt(25.4)-72)<1e-10, '25.4 mm is 72 points');
assert.throws(()=>P.plan({...base,jobs:[j('unmeasured',NaN,NaN)]}),/Check width/, 'invalid measurement cannot yield usage metrics');
// printing order and inks never enter this geometry-only module.
assert.equal(typeof P.plan,'function');
const strategyNames=['maxrects-bssf','maxrects-baf','maxrects-blsf','skyline','guillotine'];
for(const strategy of strategyNames){
  const cfg={strategy,order:2,bin:1};
  const groupJobs=[{id:'wide',fileName:'wide.pdf',width:210,height:80,orderQ:1},{id:'tall',fileName:'tall.pdf',width:75,height:190,orderQ:1},{id:'square',fileName:'square.pdf',width:120,height:120,orderQ:1}];
  const first=P.planGroups({settings:base.settings,jobs:groupJobs},1,cfg.order,cfg.strategy,cfg.bin);
  const again=P.planGroups({settings:base.settings,jobs:groupJobs},1,cfg.order,cfg.strategy,cfg.bin);
  assert.ok(first&&first.bins.length>=1,strategy+' should produce a valid arrangement');
  assert.deepEqual(first,again,strategy+' must be reproducible');
  for(const bin of first.bins)for(let i=0;i<bin.placements.length;i++){
    const p=bin.placements[i];
    assert.ok(p.x>=base.settings.edge-1e-5&&p.y>=base.settings.edge-1e-5);
    assert.ok(p.x+p.w<=base.settings.sheetW-base.settings.edge+1e-5);
    assert.ok(p.y+p.h<=base.settings.sheetH-base.settings.edge+1e-5);
    for(let k=i+1;k<bin.placements.length;k++)assert.equal(P.intersect(p,bin.placements[k]),false,strategy+' overlap');
  }
}
console.log('PASS: rectangle bounds, no overlap, rotation, multiple sheets, 5 mm margin, MaxRects variants, Skyline, Guillotine and deterministic results');
