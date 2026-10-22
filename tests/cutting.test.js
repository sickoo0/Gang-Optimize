const assert=require('node:assert/strict');
const Cutting=require('../host/cutting.js');

const settings={sheetW:100,sheetH:80,edge:10};
const trim=Cutting.outerTrimCuts(settings);
const work={x:10,y:10,w:80,h:60};
const placements=[
  {id:'A',x:10,y:10,w:30,h:20},
  {id:'B',x:40,y:10,w:50,h:20},
  {id:'C',x:10,y:30,w:80,h:40}
];
const cuts=trim.concat([
  {axis:'horizontal',at:30,region:work},
  {axis:'vertical',at:40,region:{x:10,y:10,w:80,h:20}}
]);
assert.equal(Cutting.verifyGuillotineCuts(settings,placements,cuts),true);
assert.equal(Cutting.verifyGuillotineCuts(settings,placements,cuts.slice(0,-1)),false,
  'all cut boxes must become individual final pieces');
assert.equal(Cutting.verifyGuillotineCuts(settings,placements,cuts.slice().reverse()),false,
  'the listed order must be physically executable');
const crossing=cuts.map(c=>({...c,region:{...c.region}}));
crossing[crossing.length-1].at=45;
assert.equal(Cutting.verifyGuillotineCuts(settings,placements,crossing),false,
  'a cut through a PDF cut box must be rejected');
const doublePlacement=placements.concat([{...placements[0],id:'duplicate'}]);
assert.equal(Cutting.verifyGuillotineCuts(settings,doublePlacement,cuts),false,
  'two PDFs cannot claim the same isolated piece');

// A classic five-rectangle pinwheel has no legal first full-width cut.
const pinwheel=[
  {x:0,y:0,w:1,h:2},{x:1,y:0,w:2,h:1},
  {x:2,y:1,w:1,h:2},{x:0,y:2,w:2,h:1},
  {x:1,y:1,w:1,h:1}
];
for(const candidate of [
  {axis:'vertical',at:1},{axis:'vertical',at:2},
  {axis:'horizontal',at:1},{axis:'horizontal',at:2}
]){
  const crosses=pinwheel.some(p=>candidate.axis==='vertical'
    ? p.x<candidate.at&&p.x+p.w>candidate.at
    : p.y<candidate.at&&p.y+p.h>candidate.at);
  assert.equal(crosses,true,'the pinwheel is geometrically unsliceable');
}
assert.equal(Cutting.verifyGuillotineCuts({sheetW:3,sheetH:3,edge:0},pinwheel,[]),false);
assert.equal(Cutting.outerTrimCuts({sheetW:3,sheetH:3,edge:0}).length,0);
console.log('PASS: executable trim and separation cuts; invalid, crossing, duplicate and unsliceable layouts rejected');
