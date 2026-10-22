const assert = require('node:assert/strict');
const Production = require('../client/production.js');

const parse=Production.parseOrderQ;
assert.equal(parse('LS1419_Lemvigh-Müller_OrderQ = 500.pdf').quantity,500);
assert.equal(parse('LS7285_Frank KT Rücken Weiß_orderq=400.PDF').quantity,400);
assert.equal(parse('LS27406_VESTJYSK RUSTFRI HVID LILLE_OrderQ   =   100.pdf').quantity,100);
assert.equal(parse('LS29718_SAFEWORK-small_OrderQ=50.pdf').quantity,50);
assert.equal(parse('Logo Łódź_日本_OrderQ = 25.pdf').quantity,25);
const actualFiles=[
  ['LS1419_Lemvigh-Müller_OrderQ = 500.pdf',500],
  ['LS7285_Frank KT Rücken Weiß_OrderQ = 400.pdf',400],
  ['LS27406_VESTJYSK RUSTFRI HVID LILLE_OrderQ = 100.pdf',100],
  ['LS29718_SAFEWORK small_OrderQ = 50.pdf',50]
];
for(const [name,quantity] of actualFiles)assert.equal(parse(name).quantity,quantity,name);
assert.equal(parse('LS1419_Lemvigh-M%C3%B8ller_OrderQ%20%3D%20500.pdf').quantity,500);
assert.equal(parse('LS1419_Lemvigh-M%25C3%25B8ller_OrderQ%2520%253D%2520500.pdf').quantity,500);
assert.equal(parse('Logo_OrderQ%3D400.pdf').quantity,400);
assert.equal(parse('Logo_OrderQ%20=%20400.pdf').quantity,400);
assert.equal(parse('Logo_OrderQ = 400%2Epdf').quantity,400);
assert.equal(parse('Fran%E7ais_OrderQ%20%3D%20400.pdf').quantity,400);
assert.equal(Production.normalizeFilename('LS1419_Lemvigh-M%C3%B8ller_OrderQ%20%3D%20500.pdf'),'LS1419_Lemvigh-Møller_OrderQ = 500.pdf');
assert.equal(parse('Logo without quantity.pdf').status,'missing');
assert.equal(parse('bad%name_OrderQ%20%3D%2050.pdf').quantity,50);
assert.equal(parse('Logo_OrderQ = 0.pdf').status,'invalid');
assert.equal(parse('Logo_OrderQ = fifty.pdf').status,'invalid');
assert.equal(parse('Logo_OrderQ = 10_OrderQ = 20.pdf').status,'invalid');

assert.deepEqual(Production.quantities(50,50),{copiesPerSheet:1,printingRuns:50,producedQuantity:50,overproduction:0});
assert.deepEqual(Production.quantities(100,50),{copiesPerSheet:2,printingRuns:50,producedQuantity:100,overproduction:0});
assert.deepEqual(Production.quantities(400,50),{copiesPerSheet:8,printingRuns:50,producedQuantity:400,overproduction:0});
assert.deepEqual(Production.quantities(500,50),{copiesPerSheet:10,printingRuns:50,producedQuantity:500,overproduction:0});
assert.deepEqual(Production.quantities(51,50),{copiesPerSheet:2,printingRuns:50,producedQuantity:100,overproduction:49});

const settings={sheetW:700,sheetH:500,edge:10,inset:5,rotate:true};
const job=(id,w,h,q)=>({id,filePath:'/test/'+id+'.pdf',fileName:id+'_OrderQ = '+q+'.pdf',width:w,height:h,orderQ:q});
const mixed=Production.planProduction({settings,jobs:[job('A',10,10,50),job('B',10,10,100),job('C',10,10,400),job('D',10,10,500)]});
assert.equal(mixed.sheetCount,1);
assert.ok(mixed.sheets[0].printingRuns>=1);
assert.equal(mixed.totalOverproduction,0);
assert.equal(mixed.totalCopies,mixed.jobs.reduce((sum,j)=>sum+j.copiesPerSheet,0));
assert.ok(mixed.jobs.every(j=>j.producedQuantity===j.orderQ));
assert.deepEqual(mixed.jobs.map(j=>j.sheetIndex),[0,0,0,0]);
assert.equal(mixed.settings.sheetW,700);
assert.equal(mixed.settings.sheetH,500);
assert.equal(mixed.recommendedMode,'balanced');
assert.ok(mixed.proposals.length>=1);
assert.deepEqual(['balanced','utilization','overproduction'].sort(),Array.from(new Set(mixed.proposals.flatMap(p=>p.modeIds))).sort());
for(const proposal of mixed.proposals){
  assert.ok(proposal.modeIds.every(mode=>['balanced','overproduction','utilization'].includes(mode)));
  assert.equal(proposal.settings.sheetW,700);
  assert.equal(proposal.settings.sheetH,500);
  assert.equal(proposal.jobs.reduce((sum,j)=>sum+j.copiesPerSheet,0),proposal.totalCopies);
  for(const result of proposal.jobs)assert.ok(result.overproductionPct<=mixed.maxAllowedOverproductionPct+1e-9);
  for(const sheet of proposal.sheets){
    assert.equal(require('../client/packing.js').verifyGuillotineCuts(proposal.settings,sheet.placements,sheet.cuts),true);
    for(let i=0;i<sheet.placements.length;i++){
      const p=sheet.placements[i];
      assert.ok(p.x>=settings.edge-1e-5&&p.y>=settings.edge-1e-5);
      assert.ok(p.x+p.w<=settings.sheetW-settings.edge+1e-5&&p.y+p.h<=settings.sheetH-settings.edge+1e-5);
      for(let k=i+1;k<sheet.placements.length;k++)assert.equal(require('../client/packing.js').intersect(p,sheet.placements[k]),false,'proposal cut rectangles cannot overlap');
    }
  }
  for(const result of proposal.jobs)assert.equal(proposal.sheets.filter(s=>s.placements.some(p=>p.id===result.id)).length,1,'each proposal keeps a job on exactly one sheet');
}
const utilizationPlan=Production.planProduction({settings,jobs:[job('A',10,10,50),job('B',10,10,100),job('C',10,10,400),job('D',10,10,500)],mode:'utilization'});
assert.equal(utilizationPlan.recommendedMode,'utilization');
for(const p of mixed.sheets[0].placements){assert.ok(p.x>=10&&p.y>=10);assert.ok(p.x+p.w<=690&&p.y+p.h<=490);}
for(let i=0;i<mixed.sheets[0].placements.length;i++)for(let k=i+1;k<mixed.sheets[0].placements.length;k++)
  assert.equal(require('../client/packing.js').intersect(mixed.sheets[0].placements[i],mixed.sheets[0].placements[k]),false);

// Match the panel import sequence: parse full names before planning, preserve
// the linked path verbatim, and retain imported quantities through recalculation.
const imported=actualFiles.map(([name],i)=>{
  const parsed=parse(name);
  return {id:String(i+1),fileName:parsed.normalizedFilename,filePath:'C:/production/'+name,width:10+i,height:12+i,orderQ:parsed.quantity,orderQConfirmed:parsed.status==='parsed'};
});
assert.deepEqual(imported.map(j=>j.orderQ),[500,400,100,50]);
assert.ok(imported.every(j=>j.orderQConfirmed));
const originalPaths=imported.map(j=>j.filePath);
const recalc1=Production.planProduction({settings,jobs:imported});
const recalc2=Production.planProduction({settings,jobs:imported});
assert.deepEqual(recalc1,recalc2,'bounded candidate selection and plan ordering are deterministic');
assert.deepEqual(recalc1.jobs.map(j=>j.orderQ),[500,400,100,50]);
assert.deepEqual(recalc2.jobs.map(j=>j.orderQ),[500,400,100,50]);
assert.deepEqual(imported.map(j=>j.filePath),originalPaths);

// Jobs that need multiple sheets must fail without making a second artboard.
assert.throws(()=>Production.planProduction({settings,jobs:[job('A',200,200,50),job('B',200,200,100),job('C',200,200,400),job('D',200,200,500)]}),
  /one artboard/);
assert.throws(()=>Production.planProduction({settings,jobs:[job('run-50',460,340,50),job('run-7',460,340,7)]}),
  /one artboard/);

// Cap enforcement is per job and applied after jobs are assigned to a sheet.
const capJobs=[job('cap-500',500,100,500),job('cap-400',400,100,400),job('cap-100',100,100,100),job('cap-50',50,100,50)];
assert.equal(Production.isRunWithinOverproductionLimit(capJobs.slice(0,3),40,20),true);
assert.equal(Production.isRunWithinOverproductionLimit(capJobs,40,20),false,'one job cannot hide overproduction behind aggregate totals');
assert.throws(()=>Production.planProduction({settings,jobs:[job('cap-large-A',460,340,500),job('cap-large-B',460,340,400)],maxOverproductionPct:5}),
  /one artboard/);
assert.throws(()=>Production.planProduction({settings,jobs:capJobs,maxOverproductionPct:-1}),/between 0% and 1000%/);
let progressEvents=0;
Production.planProduction({settings,jobs:[job('progress',20,20,20)]},()=>progressEvents++);
assert.ok(progressEvents>0,'optimizer reports progress for the CEP panel');

// Whole-job packing never silently spills any job onto another sheet.
assert.throws(()=>Production.planProduction({settings:{sheetW:700,sheetH:500,edge:10,inset:5,rotate:false},jobs:[
  job('large-A',220,220,1),job('large-B',220,220,1),job('large-C',220,220,1),
  job('large-D',220,220,1),job('large-E',220,220,1)
]}),/one artboard/);

assert.throws(()=>Production.planProduction({settings,jobs:[{...job('missing',20,20,1),orderQ:null}]}),/confirmed positive OrderQ/);
console.log('PASS: literal/encoded OrderQ parsing (including the four production filenames), quantity persistence, production math, margins, rotation and overlaps');
