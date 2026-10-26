const assert=require('node:assert/strict');
const Cutting=require('../host/cutting.js');
const Geometry=require('../host/geometry.js');
module.exports=function validate(plan,input){
  const {settings:s,jobs}=input,cap=plan.maxAllowedOverproductionPct??input.maxOverproductionPct;
  assert.equal(plan.sheetCount,1);assert.equal(plan.sheets.length,1);assert.deepEqual(plan.settings,s);
  const sheet=plan.sheets[0],ps=sheet.placements,counts=new Map(),indices=new Set();
  assert.ok(Number.isInteger(sheet.printingRuns)&&sheet.printingRuns>0);
  assert.ok(ps.length<=500);assert.equal(Cutting.verifyGuillotineCuts(s,ps,sheet.cuts),true);
  let artwork=0,boxes=0;
  for(let i=0;i<ps.length;i++){
    const p=ps[i],j=jobs.find(j=>String(j.id)===p.id);assert.ok(j);
    assert.equal(p.filePath,j.filePath);assert.equal(p.artworkW,j.width);assert.equal(p.artworkH,j.height);assert.equal(p.inset,5);
    assert.equal(typeof p.rotated,'boolean');if(!s.rotate)assert.equal(p.rotated,false);
    assert.ok(Math.abs(p.w-(p.rotated?j.height:j.width)-10)<1e-6);
    assert.ok(Math.abs(p.h-(p.rotated?j.width:j.height)-10)<1e-6);
    assert.ok(p.x>=s.edge-1e-6&&p.y>=s.edge-1e-6&&p.x+p.w<=s.sheetW-s.edge+1e-6&&p.y+p.h<=s.sheetH-s.edge+1e-6);
    for(let k=0;k<i;k++){const q=ps[k];assert.ok(!(p.x<q.x+q.w-1e-6&&p.x+p.w>q.x+1e-6&&p.y<q.y+q.h-1e-6&&p.y+p.h>q.y+1e-6),'cut boxes overlap');}
    assert.ok(Number.isInteger(p.copyIndex)&&p.copyIndex>0);assert.ok(!indices.has(p.id+'|'+p.copyIndex));indices.add(p.id+'|'+p.copyIndex);
    counts.set(p.id,(counts.get(p.id)||0)+1);artwork+=j.width*j.height;boxes+=p.w*p.h;
    const bounds=Geometry.expectedArtworkBounds([0,Geometry.mmToPt(s.sheetH),Geometry.mmToPt(s.sheetW),0],p);
    assert.ok(Math.abs(Geometry.ptToMm(bounds.left)-(p.x+5))<1e-8);
    assert.ok(Math.abs(s.sheetH-Geometry.ptToMm(bounds.top)-(p.y+5))<1e-8);
  }
  let produced=0,over=0;
  for(const j of jobs){
    const copies=counts.get(String(j.id));assert.ok(copies>0);
    const result=plan.jobs.find(r=>String(r.id)===String(j.id)),q=copies*sheet.printingRuns;
    assert.equal(result.orderQ,j.orderQ);assert.equal(result.copiesPerSheet,copies);assert.equal(result.producedQuantity,q);assert.equal(result.printingRuns,sheet.printingRuns);
    assert.equal(result.overproduction,q-j.orderQ);assert.ok(q>=j.orderQ);assert.ok(100*(q-j.orderQ)/j.orderQ<=cap+1e-9,'per-job cap exceeded');
    produced+=q;over+=q-j.orderQ;
  }
  assert.equal(plan.totalCopies,ps.length);assert.equal(plan.totalProduced,produced);assert.equal(plan.totalOverproduction,over);
  const area=(s.sheetW-2*s.edge)*(s.sheetH-2*s.edge);
  assert.equal(plan.areaPct,Math.round(1000*boxes/area)/10);assert.equal(plan.artworkAreaPct,Math.round(1000*artwork/area)/10);
};
