const assert=require('node:assert/strict');
const Production=require('../client/production.js');
const Packing=require('../client/packing.js');

const settings={sheetW:700,sheetH:500,edge:20,inset:5,rotate:true};
const orderQs=[500,400,100,50];
const modes=['balanced','utilization','overproduction'];
const jobs=orderQs.map((orderQ,i)=>({id:String(i+1),fileName:`job-${i}-OrderQ = ${orderQ}.pdf`,
  filePath:`C:/production/job-${i}.pdf`,width:[100,120,70,45][i],height:[90,75,55,35][i],orderQ,
  orderQSource:i===1?'manual':'parsed',orderQConfirmed:true}));
const original=JSON.stringify(jobs);

function verify(plan,expectedJobs){
  assert.equal(plan.settings.sheetW,700);assert.equal(plan.settings.sheetH,500);
  assert.equal(plan.sheetCount,1,'every proposal uses one artboard');
  assert.equal(plan.jobs.length,expectedJobs.length);
  assert.ok(plan.proposals.length>=1);
  assert.ok(plan.searchDiagnostics.packingAttempts<=500,'packing attempts are bounded');
  for(const proposal of plan.proposals){
    assert.equal(proposal.totalOverproduction,0);
    assert.equal(proposal.jobs.reduce((sum,j)=>sum+j.orderQ,0),expectedJobs.reduce((sum,j)=>sum+j.orderQ,0));
    for(const result of proposal.jobs){
      assert.equal(result.producedQuantity,result.orderQ);
      assert.equal(result.producedQuantity,result.copiesPerSheet*result.printingRuns);
      assert.equal(proposal.sheets.filter(s=>s.placements.some(p=>p.id===result.id)).length,1);
    }
    for(const sheet of proposal.sheets){
      assert.ok(Array.isArray(sheet.cuts)&&sheet.cuts.length>0,'every sheet includes a cut order');
      assert.equal(Packing.verifyGuillotineCuts(proposal.settings,sheet.placements,sheet.cuts),true,
        'every placement can be isolated by straight guillotine cuts');
      for(const p of sheet.placements){
        assert.ok(p.x>=20-1e-8&&p.y>=20-1e-8);
        assert.ok(p.x+p.w<=680+1e-8&&p.y+p.h<=480+1e-8);
        assert.ok(expectedJobs.some(j=>j.id===p.id&&j.filePath===p.filePath));
      }
      for(let i=0;i<sheet.placements.length;i++)for(let j=i+1;j<sheet.placements.length;j++)
        assert.equal(Packing.intersect(sheet.placements[i],sheet.placements[j]),false);
    }
  }
}

const measurements=[];
for(let repeat=0;repeat<3;repeat++)for(const mode of modes){
  const started=Date.now();let progress=0;
  const plan=Production.planProduction({settings,jobs,mode,maxOverproductionPct:0},()=>progress++);
  verify(plan,jobs);assert.ok(progress>0);assert.ok(plan.proposals.some(p=>p.modeIds.includes(mode)));
  measurements.push({mode,repeat,ms:Date.now()-started,attempts:plan.searchDiagnostics.packingAttempts});
}
assert.equal(JSON.stringify(jobs),original,'recalculation preserves imported jobs and manual OrderQ edits');

const early=Production.planProduction({settings,jobs,mode:'utilization',maxOverproductionPct:0},null,{maxMs:1});
verify(early,jobs);assert.equal(early.stoppedEarly,true,'time limit returns a valid complete fallback');

const batch=Array.from({length:80},(_,i)=>({id:String(i+1),fileName:`batch-${i}.pdf`,filePath:`C:/production/batch-${i}.pdf`,
  width:10,height:10,orderQ:orderQs[i%4],orderQConfirmed:true}));
const batchStarted=Date.now();
const large=Production.planProduction({settings,jobs:batch,mode:'utilization',maxOverproductionPct:0});
verify(large,batch);
const measuredDimensions=[[35.3529,38.723,500],[90.36,63.9324,100],[110.3602,44.1332,50],[250.3526,67.2613,400]];
const measuredJobs=measuredDimensions.map(([width,height,orderQ],i)=>({id:String(i+1),fileName:`measured-${i}.pdf`,
  filePath:`C:/production/measured-${i}.pdf`,width,height,orderQ,orderQConfirmed:true}));
const measuredStarted=Date.now();
const measured=Production.planProduction({settings,jobs:measuredJobs,mode:'utilization',maxOverproductionPct:0});
verify(measured,measuredJobs);
assert.equal(measured.sheetCount,1);
assert.equal(measured.areaPct,67.3,'one-artboard layout meets its exact box-use ceiling');
assert.equal(measured.utilizationUpperBoundPct,67.3);
assert.deepEqual(measured.sheets.map(s=>s.printingRuns),[50]);
const balancedMeasured=Production.planProduction({settings,jobs:measuredJobs,mode:'balanced',maxOverproductionPct:0});
assert.equal(balancedMeasured.sheetCount,1);
assert.equal(balancedMeasured.areaPct,67.3,'one-sheet balanced option remains available');
const allowedOverproduction=Production.planProduction({settings,jobs:measuredJobs,mode:'utilization',maxOverproductionPct:60});
verifyAllowedOverproduction(allowedOverproduction,measuredJobs,60);
assert.equal(allowedOverproduction.sheetCount,1);
assert.ok(allowedOverproduction.areaPct>=87.3,'utilization must not regress from the previous valid layout');
require('./plan-invariants.js')(allowedOverproduction,{settings,jobs:measuredJobs,maxOverproductionPct:60});
assert.throws(()=>Production.planProduction({settings,jobs:batch.map(j=>({...j,width:30,height:30})),mode:'utilization',maxOverproductionPct:0}),
  /cannot fit on the required single gang sheet at 0% overproduction/,
'exact orders that exceed one sheet fail with a clear limit instead of spilling onto extra artboards');
console.log('PASS: three modes, repeated calculations, 0% overproduction, exact paths, valid geometry, early limit and 80-job batch');
console.log(JSON.stringify({fourJobRuns:measurements,early:{sheets:early.sheetCount,stoppedEarly:early.stoppedEarly},
  largeBatch:{jobs:batch.length,ms:Date.now()-batchStarted,attempts:large.searchDiagnostics.packingAttempts,sheets:large.sheetCount},
  measuredFour:{ms:Date.now()-measuredStarted,balancedPct:balancedMeasured.areaPct,maxPct:measured.areaPct,upperBoundPct:measured.utilizationUpperBoundPct}},null,2));

function verifyAllowedOverproduction(plan,sourceJobs,cap){
  assert.equal(plan.sheetCount,1);
  assert.equal(plan.sheets.length,1);
  for(const result of plan.jobs){
    assert.ok(result.overproductionPct<=cap+1e-9);
    assert.equal(result.producedQuantity,result.copiesPerSheet*result.printingRuns);
    assert.ok(result.producedQuantity>=result.orderQ);
  }
  const placements=plan.sheets[0].placements;
  assert.equal(Packing.verifyGuillotineCuts(plan.settings,placements,plan.sheets[0].cuts),true);
  for(let i=0;i<placements.length;i++){
    const p=placements[i];
    assert.ok(p.x>=20-1e-8&&p.y>=20-1e-8&&p.x+p.w<=680+1e-8&&p.y+p.h<=480+1e-8);
    assert.ok(sourceJobs.some(j=>j.id===p.id&&j.filePath===p.filePath));
    for(let j=i+1;j<placements.length;j++)assert.equal(Packing.intersect(p,placements[j]),false);
  }
}
