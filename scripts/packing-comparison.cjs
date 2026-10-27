// Compare the complete pre-change production optimizer, not a single greedy
// placement, with identical geometry, quantities, constraints and objective.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ref='ec0d1f988854b826c10d0025158cde4645e50146';
for(const file of ['client/production.js','client/packing.js','host/cutting.js']){
  const target=path.join(root,'artifacts/packing-baseline',file);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,cp.execFileSync('git',['show',ref+':'+file],{cwd:root}));
}
const old=require('../artifacts/packing-baseline/client/production.js'),current=require('../client/production.js');
const fixtures=require('../tests/packing-fixtures.js'),validate=require('../tests/plan-invariants.js'),rows=[];
function measure(api,input){const started=performance.now(),plan=api.planProduction(structuredClone(input));validate(plan,input,{legacy:api===old});
  return {ms:Math.round(performance.now()-started),cutBoxPct:plan.areaPct,artworkPct:plan.artworkAreaPct,
    copies:plan.totalCopies,runs:plan.sheets[0].printingRuns,excess:plan.totalOverproduction,diagnostics:plan.searchDiagnostics,plan};}
for(const input of fixtures){
  const before=measure(old,input),after=measure(current,input);
  assert.ok(after.plan.totalOccupied>=before.plan.totalOccupied-1e-6,input.name+' regressed');
  const row={name:input.name,input,before,after,improvementPoints:Number((after.cutBoxPct-before.cutBoxPct).toFixed(1))};rows.push(row);
  console.log(JSON.stringify({name:row.name,before:{...before,plan:undefined,diagnostics:undefined},after:{...after,plan:undefined},improvementPoints:row.improvementPoints}));
}
const destination=path.join(root,'artifacts/packing-comparison');fs.mkdirSync(destination,{recursive:true});
fs.writeFileSync(path.join(destination,'report.json'),JSON.stringify({baselineCommit:ref,generatedAt:new Date().toISOString(),rows},null,2));
function svg(plan){return `<svg viewBox="0 0 700 500"><rect width="700" height="500" fill="#eef1f5"/>${plan.sheets[0].placements.map(p=>`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="hsl(${Number(p.id)*65} 60% 70%)" stroke="#345" stroke-width=".6"/>${p.inset>0?`<rect x="${p.x+p.inset}" y="${p.y+p.inset}" width="${p.w-2*p.inset}" height="${p.h-2*p.inset}" fill="none" stroke="#345" stroke-dasharray="2 2" stroke-width=".4"/>`:''}`).join('')}</svg>`;}
fs.writeFileSync(path.join(destination,'report.html'),`<!doctype html><meta charset="utf-8"><title>Packing benchmark</title><style>body{font:16px system-ui;margin:30px;background:#fafafa;color:#182432}section{margin:30px 0}.pair{display:flex;gap:20px}.pair>div{width:50%}svg{width:100%;border:1px solid #bbb}small{display:block}</style><h1>Packing comparison</h1><p>Baseline ${ref.slice(0,7)}. Same inputs and production limits. Dashed outlines show original artwork when a cut margin is configured. Measured results of a bounded search, not proof of optimality.</p>${rows.map(r=>`<section><h2>${r.name} (${r.input.settings.inset} mm margin): +${r.improvementPoints} percentage points</h2><div class="pair">${['before','after'].map(key=>`<div><b>${key}: ${r[key].cutBoxPct}% boxes / ${r[key].artworkPct}% artwork</b><small>${r[key].copies} placements · ${r[key].runs} runs · ${r[key].excess} excess · ${r[key].ms} ms</small>${svg(r[key].plan)}</div>`).join('')}</div></section>`).join('')}`);
console.log('Report: '+path.join(destination,'report.html'));
