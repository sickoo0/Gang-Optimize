// Reproducible algorithm benchmark using the four real OrderQ values and
// fixture dimensions. Production PDFs are not stored in this repository, so
// these dimensions are deliberately synthetic and are not a production claim.
const assert=require('node:assert/strict');
const Packing=require('../client/packing.js');
const Production=require('../client/production.js');
const jobs=[
  {id:'LS1419',fileName:'LS1419_Lemvigh-Müller_OrderQ = 500.pdf',width:100,height:90,orderQ:500},
  {id:'LS7285',fileName:'LS7285_Frank KT Rücken Weiß_OrderQ = 400.pdf',width:120,height:75,orderQ:400},
  {id:'LS27406',fileName:'LS27406_VESTJYSK RUSTFRI HVID LILLE_OrderQ = 100.pdf',width:70,height:55,orderQ:100},
  {id:'LS29718',fileName:'LS29718_SAFEWORK small_OrderQ = 50.pdf',width:45,height:35,orderQ:50}
];
const settings={sheetW:700,sheetH:500,edge:20,inset:5,rotate:true};
const baselineStarted=Date.now();
const old=Packing.planGroups({settings,jobs},50,0,'maxrects-bssf',0);
const baselineMs=Date.now()-baselineStarted;
assert.ok(old,'the 50-run BSSF baseline should fit these fixture dimensions');
const oldPlacements=old.bins.reduce((sum,b)=>sum+b.placements.length,0);
const oldOccupied=old.bins.reduce((sum,b)=>sum+b.placements.reduce((area,p)=>area+p.w*p.h,0),0);
const oldWork=old.bins.length*(settings.sheetW-2*settings.edge)*(settings.sheetH-2*settings.edge);
const started=Date.now();
const newer=Production.planProduction({settings,jobs,mode:'balanced',maxOverproductionPct:0});
const elapsedMs=Date.now()-started;
for(const plan of newer.proposals){
  assert.equal(plan.settings.sheetW,700);assert.equal(plan.settings.sheetH,500);
  assert.equal(plan.jobs.length,4);
  for(const j of plan.jobs)assert.ok(j.producedQuantity>=j.orderQ);
  for(const sheet of plan.sheets){
    const ids={};sheet.placements.forEach(p=>{ids[p.id]=true;});
    assert.equal(Object.keys(ids).length,sheet.uniqueJobs);
    for(let i=0;i<sheet.placements.length;i++)for(let k=i+1;k<sheet.placements.length;k++)
      assert.equal(Packing.intersect(sheet.placements[i],sheet.placements[k]),false);
  }
  for(const j of jobs)assert.equal(plan.sheets.filter(s=>s.placements.some(p=>p.id===j.id)).length,1);
}
const planA=newer.proposals.find(p=>p.modeIds.includes('balanced'));
assert.ok(planA);
console.log(JSON.stringify({
  note:'Synthetic dimensions; same jobs, quantities, 700x500 sheet, 20 mm outer margin, 5 mm cut margin.',
  baseline:{strategy:'MaxRects BSSF, 50 runs',searchMs:baselineMs,sheets:old.bins.length,placements:oldPlacements,overproduction:0,boxUtilizationPct:Math.round(1000*oldOccupied/oldWork)/10},
  optimized:{strategy:planA.strategyLabel,searchMs:elapsedMs,sheets:planA.sheetCount,placements:planA.totalCopies,printingRuns:planA.sheets.map(s=>s.printingRuns),overproduction:planA.totalOverproduction,boxUtilizationPct:planA.areaPct},
  options:newer.proposals.map(p=>({id:p.id,sheets:p.sheetCount,placements:p.totalCopies,runs:p.sheets.map(s=>s.printingRuns),overproduction:p.totalOverproduction,boxUtilizationPct:p.areaPct}))
},null,2));
