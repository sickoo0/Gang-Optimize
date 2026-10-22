/* Quantity-aware screen-print planning; intentionally independent of Illustrator. */
(function(root,factory){
  var production=factory(typeof module==='object'&&module.exports?require('./packing.js'):root.BytebasePacking);
  if(typeof module==='object'&&module.exports)module.exports=production;
  root.BytebaseProduction=production;
}(typeof window!=='undefined'?window:this,function(P){
  'use strict';
  var MAX_PLACEMENTS=500,MAX_RUN_CANDIDATES=64,MAX_SEARCH_RUNS=12,MAX_PACKING_ATTEMPTS=128,
    MAX_TOTAL_ATTEMPTS=600,MAX_STORED_CANDIDATES=160,DEFAULT_SEARCH_MS=5000;
  // File.name can cross the CEP/ExtendScript bridge either literally or as a
  // URI escaped string. Normalize only the name; callers must keep `path`
  // untouched because it is the filesystem path passed back to Illustrator.
  function normalizeFilename(fileName){
    var text=String(fileName==null?'':fileName);
    // ExtendScript's legacy escape() emits %uXXXX for non-ASCII characters.
    text=text.replace(/%u([0-9a-f]{4})/ig,function(_,hex){return String.fromCharCode(parseInt(hex,16));});
    for(var i=0;i<3;i++){
      if(!/%[0-9a-f]{2}/i.test(text))break;
      var previous=text;
      try {
        // Protect a literal stray percent so valid neighboring escapes can
        // still be decoded, then decode UTF-8 URI sequences normally.
        text=decodeURIComponent(text.replace(/%(?![0-9a-f]{2})/ig,'%25'));
      } catch(_){
        // Older bridge/host combinations may expose escape()'s Latin-1 byte
        // encoding instead of UTF-8. Decode only when that is unambiguous.
        text=text.replace(/(?:%[0-9a-f]{2})+/ig,function(run){
          try{return decodeURIComponent(run);}catch(__){return run.replace(/%([0-9a-f]{2})/ig,function(_,hex){return String.fromCharCode(parseInt(hex,16));});}
        });
      }
      if(text===previous)break;
    }
    return text;
  }
  function parseOrderQ(fileName){
    var text=normalizeFilename(fileName),re=/OrderQ\s*=/ig,matches=[],m;
    while((m=re.exec(text))!==null)matches.push(m.index+m[0].length);
    if(!matches.length)return {status:'missing',quantity:null,normalizedFilename:text};
    if(matches.length!==1)return {status:'invalid',quantity:null,reason:'Multiple OrderQ values',normalizedFilename:text};
    var value=text.slice(matches[0]).replace(/\.pdf\s*$/i,'').trim();
    if(!/^\d+$/.test(value))return {status:'invalid',quantity:null,reason:'OrderQ must be a positive whole number',normalizedFilename:text};
    var quantity=Number(value);
    if(!isFinite(quantity)||Math.floor(quantity)!==quantity||quantity<1||quantity>1000000000)
      return {status:'invalid',quantity:null,reason:'OrderQ is outside the supported positive integer range',normalizedFilename:text};
    return {status:'parsed',quantity:quantity,normalizedFilename:text};
  }
  function quantities(orderQ,runs){
    var q=Number(orderQ),r=Number(runs);
    if(!Number.isInteger(q)||q<1||!Number.isInteger(r)||r<1)throw Error('OrderQ and printing runs must be positive whole numbers.');
    var copies=Math.ceil(q/r),produced=copies*r;
    return {copiesPerSheet:copies,printingRuns:r,producedQuantity:produced,overproduction:produced-q};
  }
  function isRunWithinOverproductionLimit(jobs,runs,maxPct){
    var limit=Number(maxPct);
    if(!isFinite(limit)||limit<0)return false;
    for(var i=0;i<jobs.length;i++){
      var q=Number(jobs[i].orderQ),result=quantities(q,runs);
      if(result.overproduction/q*100>limit+1e-9)return false;
    }
    return true;
  }
  function makeRunCandidates(jobs,withinBudget){
    var set={},maxQ=1,breakpoints=0;
    for(var i=0;i<jobs.length;i++)maxQ=Math.max(maxQ,Number(jobs[i].orderQ));
    var minRun=Math.max(1,Math.ceil(maxQ/MAX_PLACEMENTS));
    for(var qi=0;qi<jobs.length;qi++){
      var q=Number(jobs[qi].orderQ),r=minRun;
      while(r<=q){
        if((breakpoints++&255)===0&&withinBudget&&!withinBudget())return [];
        if(breakpoints>200000)return [];
        set[r]=true;
        var copies=Math.ceil(q/r),last=copies<=1?q:Math.floor((q-1)/(copies-1));
        r=last+1;
      }
    }
    set[maxQ]=true;
    var candidates=Object.keys(set).map(Number).sort(function(a,b){return a-b;}),feasible=[];
    for(var c=0;c<candidates.length;c++){
      var total=0;
      for(var j=0;j<jobs.length;j++){total+=Math.ceil(Number(jobs[j].orderQ)/candidates[c]);if(total>MAX_PLACEMENTS)break;}
      if(total<=MAX_PLACEMENTS)feasible.push(candidates[c]);
    }
    if(feasible.length>MAX_RUN_CANDIDATES){
      var sampled=[],seen={};
      // Preserve order quantities as useful run-count candidates, then sample
      // the remaining quotient breakpoints evenly to keep large batches fast.
      var anchors=[];
      jobs.forEach(function(j){var q=Number(j.orderQ);if(feasible.indexOf(q)>=0&&anchors.indexOf(q)<0)anchors.push(q);});
      anchors.sort(function(a,b){return a-b;});
      if(anchors.length>MAX_RUN_CANDIDATES){
        var reduced=[];for(var a=0;a<MAX_RUN_CANDIDATES;a++)reduced.push(anchors[Math.round(a*(anchors.length-1)/(MAX_RUN_CANDIDATES-1))]);anchors=reduced;
      }
      anchors.forEach(function(v){if(!seen[v]){seen[v]=true;sampled.push(v);}});
      for(var s=0;s<MAX_RUN_CANDIDATES&&sampled.length<MAX_RUN_CANDIDATES;s++){
        var index=Math.round(s*(feasible.length-1)/(MAX_RUN_CANDIDATES-1)),value=feasible[index];
        if(!seen[value]){seen[value]=true;sampled.push(value);}
      }
      feasible=sampled.sort(function(a,b){return a-b;});
    }
    return feasible;
  }
  function searchConfigs(jobCount){
    // A physical guillotine must be able to cut every chosen layout. Search
    // only constructive guillotine partitions, varying job order and bin fit.
    var configs=[
      {strategy:'guillotine',order:0,bin:0},{strategy:'guillotine',order:1,bin:0},
      {strategy:'guillotine',order:2,bin:0},{strategy:'guillotine',order:3,bin:0},
      {strategy:'guillotine',order:4,bin:0},{strategy:'guillotine',order:0,bin:1},
      {strategy:'guillotine',order:1,bin:1},{strategy:'guillotine',order:2,bin:1},
      {strategy:'guillotine',order:3,bin:1},{strategy:'guillotine',order:4,bin:1}
    ];
    return jobCount>20?configs.filter(function(c,i){return [0,1,2,3,5,7].indexOf(i)>=0;}):configs;
  }
  function scoreRaw(raw,jobs,run){
    var over=0,placements=0,work=(raw.settings.sheetW-2*raw.settings.edge)*(raw.settings.sheetH-2*raw.settings.edge);
    for(var i=0;i<jobs.length;i++){var q=quantities(jobs[i].orderQ,run);over+=q.overproduction;placements+=q.copiesPerSheet;}
    var occupied=0;
    for(var b=0;b<raw.bins.length;b++)for(var p=0;p<raw.bins[b].placements.length;p++)occupied+=raw.bins[b].placements[p].w*raw.bins[b].placements[p].h;
    return {sheets:raw.bins.length,over:over,placements:placements,unused:raw.bins.length*work-occupied,
      areaPct:occupied/(raw.bins.length*work),strategy:raw.strategy,order:raw.orderMode,bin:raw.binMode};
  }
  function compareSheets(a,b){return a.sheetCount-b.sheetCount||a.totalOverproduction-b.totalOverproduction||a.totalCopies-b.totalCopies||a.unusedArea-b.unusedArea;}
  function compareOver(a,b){return a.totalOverproduction-b.totalOverproduction||a.sheetCount-b.sheetCount||a.totalCopies-b.totalCopies||a.unusedArea-b.unusedArea;}
  function compareUtilization(a,b){return b.areaPct-a.areaPct||a.totalOverproduction-b.totalOverproduction||a.sheetCount-b.sheetCount||a.totalCopies-b.totalCopies;}
  function compareRawSheets(a,b){return a.score.sheets-b.score.sheets||a.score.over-b.score.over||a.score.placements-b.score.placements||a.score.unused-b.score.unused;}
  function compareRawOver(a,b){return a.score.over-b.score.over||a.score.sheets-b.score.sheets||a.score.placements-b.score.placements||a.score.unused-b.score.unused;}
  function compareRawUtil(a,b){return b.score.areaPct-a.score.areaPct||a.score.over-b.score.over||a.score.sheets-b.score.sheets||a.score.placements-b.score.placements;}
  function localImprove(attempts,jobs,settings,onProgress,withinBudget,stats){
    var seeds=attempts.slice().sort(compareRawSheets).slice(0,2),utilSeed=attempts.slice().sort(compareRawUtil)[0];
    if(utilSeed&&seeds.indexOf(utilSeed)<0)seeds.push(utilSeed);
    var seen={};attempts.forEach(function(a){seen[a.run+'|'+a.raw.strategy+'|'+a.raw.orderMode+'|'+a.raw.binMode+'|'+a.raw.groupOrder.join(',')]=true;});
    seeds.forEach(function(seed){
      var current=seed;
      for(var pass=0;pass<2;pass++){
        var order=current.raw.groupOrder.slice(),moves=Math.min(8,Math.max(0,order.length-1));
        if(!moves)break;
        var best=current;
        for(var mi=0;mi<moves;mi++){
          if(attempts.length>=MAX_STORED_CANDIDATES){stats.stoppedEarly=true;return;}
          if(!withinBudget())return;
          var at=moves===1?0:Math.round(mi*(order.length-2)/(moves-1)),neighbor=order.slice(),tmp=neighbor[at];
          neighbor[at]=neighbor[at+1];neighbor[at+1]=tmp;
          var raw=P.planGroups({settings:settings,jobs:jobs},current.run,current.raw.orderMode,current.raw.strategy,current.raw.binMode,neighbor);
          stats.packingAttempts++;stats.searchIterations++;
          if(onProgress)onProgress({phase:'refining',completed:mi+1,total:moves});
          if(!raw)continue;
          raw.config=current.raw.config;
          var candidate={raw:raw,run:current.run,score:scoreRaw(raw,jobs,current.run)},key=candidate.run+'|'+raw.strategy+'|'+raw.orderMode+'|'+raw.binMode+'|'+raw.groupOrder.join(',');
          if(!seen[key]){seen[key]=true;attempts.push(candidate);}
          if(compareRawSheets(candidate,best)<0)best=candidate;
        }
        if(best===current)break;
        current=best;
      }
    });
  }
  function selectRunCandidates(candidates,jobs,limit,settings,maxOverPct){
    limit=limit||MAX_SEARCH_RUNS;
    if(candidates.length<=limit)return candidates.slice();
    var selected=[],seen={};
    function add(value){if(candidates.indexOf(value)>=0&&!seen[value]&&selected.length<limit){seen[value]=true;selected.push(value);}}
    add(candidates[0]);add(candidates[candidates.length-1]);
    if(settings){
      var work=(settings.sheetW-2*settings.edge)*(settings.sheetH-2*settings.edge);
      candidates.map(function(run){
        var area=0,copies=0;
        jobs.forEach(function(j){var count=Math.ceil(Number(j.orderQ)/run);copies+=count;
          area+=count*(Number(j.width)+2*settings.inset)*(Number(j.height)+2*settings.inset);});
        return {run:run,area:area,copies:copies};
      }).filter(function(x){return x.copies<=MAX_PLACEMENTS&&x.area<=work+1e-7&&
        isRunWithinOverproductionLimit(jobs,x.run,maxOverPct);})
        .sort(function(a,b){return b.area-a.area||a.run-b.run;}).slice(0,Math.min(5,limit-2))
        .forEach(function(x){add(x.run);});
    }
    var scored=candidates.map(function(run){var over=0,copies=0;jobs.forEach(function(j){var q=quantities(j.orderQ,run);over+=q.overproduction;copies+=q.copiesPerSheet;});return {run:run,over:over,copies:copies};});
    scored.slice().sort(function(a,b){return a.over-b.over||a.copies-b.copies||a.run-b.run;}).slice(0,2).forEach(function(x){add(x.run);});
    scored.slice().sort(function(a,b){return a.copies-b.copies||a.over-b.over||b.run-a.run;}).slice(0,2).forEach(function(x){add(x.run);});
    jobs.forEach(function(j){add(Number(j.orderQ));});
    // Evenly sample the remaining quotient breakpoints for varied run/placement trade-offs.
    for(var i=0;i<limit&&selected.length<limit;i++)add(candidates[Math.round(i*(candidates.length-1)/(limit-1))]);
    return selected.sort(function(a,b){return a-b;});
  }
  function jobSetKey(bin){
    var ids={},list=[];
    for(var i=0;i<bin.placements.length;i++)if(!ids[bin.placements[i].id]){ids[bin.placements[i].id]=true;list.push(bin.placements[i].id);}
    return list.sort().join('|');
  }
  function candidateForGroup(jobs,settings,runs,config){
    var best=null;
    var raw=P.planGroups({settings:settings,jobs:jobs},runs,config.order,config.strategy,config.bin);
    if(!raw||raw.bins.length!==1)return null;
    var score=scoreRaw(raw,jobs,runs);best={raw:raw,score:score,runs:runs};
    return best;
  }
  function singletonSeed(jobs,settings,config){
    var bins=[];
    for(var i=0;i<jobs.length;i++){
      var job=jobs[i],raw=P.planGroups({settings:settings,jobs:[job]},Number(job.orderQ),config.order,config.strategy,config.bin);
      if(!raw||raw.bins.length!==1)return null;
      bins.push(raw.bins[0]);
    }
    return {settings:settings,bins:bins,printingRuns:null,totalPlacements:jobs.length,strategy:config.strategy,
      orderMode:config.order,binMode:config.bin,groupOrder:jobs.map(function(j){return String(j.id);}),config:config};
  }
  function optimizeSheetRuns(raw,jobs,settings,candidates,config,objective,maxOverPct,onProgress,withinBudget,stats){
    var optimized=[];
    for(var bi=0;bi<raw.bins.length;bi++){
      var key=jobSetKey(raw.bins[bi]),subset=jobs.filter(function(j){return ('|'+key+'|').indexOf('|'+String(j.id)+'|')>=0;}),best=null;
      var groupCandidates=candidates.slice();
      subset.forEach(function(j){var exact=Number(j.orderQ);if(groupCandidates.indexOf(exact)<0)groupCandidates.push(exact);});
      var validRuns=groupCandidates.filter(function(run){return isRunWithinOverproductionLimit(subset,run,maxOverPct);});
      validRuns=selectRunCandidates(validRuns,subset,subset.length>20?8:MAX_SEARCH_RUNS,settings,maxOverPct);
      for(var ci=0;ci<validRuns.length;ci++){
        if(!withinBudget())return null;
        var choice=candidateForGroup(subset,settings,validRuns[ci],config);
        stats.packingAttempts++;stats.searchIterations++;
        if(onProgress)onProgress({phase:'refining',completed:ci+1,total:validRuns.length,sheet:bi+1,sheets:raw.bins.length});
        if(!choice)continue;
        var better=!best||(objective==='utilization'?
          choice.score.areaPct>best.score.areaPct+1e-10||Math.abs(choice.score.areaPct-best.score.areaPct)<=1e-10&&(choice.score.over<best.score.over||choice.score.over===best.score.over&&choice.score.placements<best.score.placements):
          choice.score.over<best.score.over||choice.score.over===best.score.over&&(choice.score.placements<best.score.placements||choice.score.placements===best.score.placements&&choice.score.unused<best.score.unused));
        if(better)best=choice;
      }
      if(!best)return null;
      optimized.push(best);
    }
    return optimized;
  }
  // For small zero-overproduction batches, inspect every exact run count for
  // the complete job set. The result must always be one physical artboard.
  function exactSmallBatchPlan(jobs,settings,withinBudget,stats,onProgress){
    var work=(settings.sheetW-2*settings.edge)*(settings.sheetH-2*settings.edge);
    var common=0,complete=true,best=null,bestArea=-1,boundArea=-1;
    function gcd(a,b){while(b){var next=a%b;a=b;b=next;}return a;}
    function divisors(value){var low=[],high=[];for(var d=1;d*d<=value;d++)if(value%d===0){low.push(d);if(d*d!==value)high.push(value/d);}return low.concat(high.reverse());}
    var configs=searchConfigs(jobs.length);
    for(var j=0;j<jobs.length;j++)common=common?gcd(common,Number(jobs[j].orderQ)):Number(jobs[j].orderQ);
    // Start with the fewest required placements, so even a short time budget
    // can return a complete one-sheet plan before trying denser run counts.
    var runs=divisors(common).reverse();
    for(var ri=0;ri<runs.length;ri++){
      var run=runs[ri],copies=0,area=0;
      for(var sj=0;sj<jobs.length;sj++){
        var job=jobs[sj],count=Number(job.orderQ)/run;
        copies+=count;area+=count*(job.width+2*settings.inset)*(job.height+2*settings.inset);
      }
      if(copies>MAX_PLACEMENTS||area>work+1e-7)continue;
      if(area>boundArea)boundArea=area;
      if(area<=bestArea)continue;
      for(var ci=0;ci<configs.length;ci++){
        if(stats.packingAttempts>0&&!withinBudget()){complete=false;break;}
        var cfg=configs[ci],raw=P.planGroups({settings:settings,jobs:jobs},run,cfg.order,cfg.strategy,cfg.bin);
        stats.packingAttempts++;stats.searchIterations++;
        if(raw&&raw.bins.length===1){best={raw:raw,runs:run};bestArea=area;break;}
      }
      if(onProgress)onProgress({phase:'run-search',completed:ri+1,total:runs.length});
      if(!complete)break;
    }
    return {plan:best?buildPlan([best],jobs,settings):null,
      upperBoundPct:complete&&boundArea>=0?Math.round(1000*boundArea/work)/10:null};
  }
  function buildPlan(optimized,jobs,settings){
    var jobResults={},sheets=[],work=(Number(settings.sheetW)-2*Number(settings.edge))*(Number(settings.sheetH)-2*Number(settings.edge));
    optimized.forEach(function(choice,si){
      var rawBin=choice.raw.bins[0],run=choice.runs,placements=rawBin.placements,unique={},produced=0,over=0,jobProduction=[];
      jobs.forEach(function(j){
        if(('|'+jobSetKey(rawBin)+'|').indexOf('|'+String(j.id)+'|')<0)return;
        var q=quantities(Number(j.orderQ),run),overPct=100*q.overproduction/Number(j.orderQ);unique[j.id]=true;produced+=q.producedQuantity;over+=q.overproduction;
        jobResults[j.id]={id:j.id,fileName:j.fileName,orderQ:Number(j.orderQ),copiesPerSheet:q.copiesPerSheet,
          printingRuns:q.printingRuns,producedQuantity:q.producedQuantity,overproduction:q.overproduction,
          overproductionPct:Math.round(overPct*100)/100,sheetIndex:si};
        jobProduction.push({id:j.id,fileName:j.fileName,orderQ:Number(j.orderQ),copiesPerSheet:q.copiesPerSheet,
          producedQuantity:q.producedQuantity,overproduction:q.overproduction,overproductionPct:Math.round(overPct*100)/100});
      });
      if(!P.verifyGuillotineCuts(settings,placements,rawBin.cuts))throw Error('Optimizer produced an uncuttable layout.');
      sheets.push({index:si,placements:placements,cuts:rawBin.cuts,cutCount:rawBin.cuts.length,
        areaPct:Math.round(1000*(placements.reduce(function(sum,p){return sum+p.w*p.h;},0)/work))/10,
        uniqueJobs:Object.keys(unique).length,totalPlacements:placements.length,printingRuns:run,
        producedQuantity:produced,totalOverproduction:over,jobIds:Object.keys(unique),jobProduction:jobProduction});
    });
    var perJob=jobs.map(function(j){return jobResults[j.id];});
    var totalProduced=0,totalOverproduction=0,totalCopies=0,totalOccupied=0,totalOrderQ=0;
    perJob.forEach(function(j){totalProduced+=j.producedQuantity;totalOverproduction+=j.overproduction;totalCopies+=j.copiesPerSheet;totalOrderQ+=j.orderQ;});
    sheets.forEach(function(s){s.placements.forEach(function(p){totalOccupied+=p.w*p.h;});});
    return {settings:settings,sheets:sheets,sheetCount:sheets.length,totalCopies:totalCopies,
      areaPct:Math.round(1000*(totalOccupied/(sheets.length*work)))/10,
      artworkAreaPct:Math.round(1000*(jobs.reduce(function(sum,j){return sum+j.width*j.height*jobResults[j.id].copiesPerSheet;},0)/(sheets.length*work)))/10,
      jobs:perJob,totalProduced:totalProduced,totalOverproduction:totalOverproduction,
      totalOrderQ:totalOrderQ,totalOverproductionPct:Math.round(10000*totalOverproduction/totalOrderQ)/100,
      uniqueJobs:jobs.length,unusedArea:sheets.length*work-totalOccupied,totalOccupied:totalOccupied,
      explanation:'Every PDF cut box has a verified straight-cut sequence on one gang sheet.',
      strategy:optimized.length?optimized[0].raw.strategy:'maxrects-bssf',
      strategyLabel:optimized.length?strategyLabel(optimized[0].raw.strategy):'MaxRects Best Short Side Fit',
      layoutQuality:measureLayoutQuality(sheets)};
  }
  function measureLayoutQuality(sheets){
    var envelopeWaste=0,groupSpread=0,cutCount=0;
    sheets.forEach(function(sheet){
      cutCount+=(sheet.cuts||[]).length;
      var ps=sheet.placements,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,occupied=0,byId={};
      ps.forEach(function(p){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x+p.w);maxY=Math.max(maxY,p.y+p.h);occupied+=p.w*p.h;(byId[p.id]||(byId[p.id]=[])).push(p);});
      if(ps.length)envelopeWaste+=(maxX-minX)*(maxY-minY)-occupied;
      Object.keys(byId).forEach(function(id){var list=byId[id];for(var i=0;i<list.length;i++)for(var j=i+1;j<list.length;j++)
        groupSpread+=Math.abs(list[i].x-list[j].x)+Math.abs(list[i].y-list[j].y);});
    });
    return {cutCount:cutCount,envelopeWaste:Math.round(envelopeWaste*100)/100,groupSpread:Math.round(groupSpread*100)/100};
  }
  function strategyLabel(strategy){
    return strategy==='maxrects-baf'?'MaxRects Best Area Fit':strategy==='maxrects-blsf'?'MaxRects Best Long Side Fit':
      strategy==='skyline'?'Skyline':strategy==='guillotine'?'Guillotine cut plan':'MaxRects Best Short Side Fit';
  }
  function productionSignature(plan){
    var sheets=plan.sheets.map(function(s){return s.printingRuns+':'+s.jobIds.slice().sort().join(',');}).sort();
    return sheets.join('|')+'#'+plan.jobs.map(function(j){return [j.id,j.copiesPerSheet,j.printingRuns].join(':');}).sort().join('|');
  }
  function compareLayoutQuality(a,b){
    return a.layoutQuality.cutCount-b.layoutQuality.cutCount||
      a.layoutQuality.envelopeWaste-b.layoutQuality.envelopeWaste||a.layoutQuality.groupSpread-b.layoutQuality.groupSpread;
  }
  function planProduction(config,onProgress,options){
    var jobs=config.jobs||[],settings=config.settings||{},mode=config.mode||'balanced',maxOverPct=config.maxOverproductionPct==null?0:Number(config.maxOverproductionPct);
    var start=Date.now(),maxMs=options&&Number(options.maxMs)>0?Number(options.maxMs):DEFAULT_SEARCH_MS;
    var stats={inputJobs:jobs.length,mode:mode,runCandidatesEvaluated:0,packingAttempts:0,searchIterations:0,candidateCount:0,elapsedMs:0,stoppedEarly:false,stage:'validating'};
    function withinBudget(){if(Date.now()-start<maxMs&&stats.packingAttempts<MAX_TOTAL_ATTEMPTS)return true;stats.stoppedEarly=true;return false;}
    function progress(p){stats.stage=p.phase;stats.elapsedMs=Date.now()-start;stats.candidateCount=p.candidateCount==null?stats.candidateCount:p.candidateCount;
      if(onProgress){p.diagnostics={inputJobs:stats.inputJobs,mode:stats.mode,runCandidatesEvaluated:stats.runCandidatesEvaluated,
        packingAttempts:stats.packingAttempts,searchIterations:stats.searchIterations,candidateCount:stats.candidateCount,
        elapsedMs:stats.elapsedMs,stage:stats.stage};onProgress(p);}}
    if(!jobs.length)throw Error('Import at least one PDF.');
    if(['balanced','utilization','overproduction'].indexOf(mode)<0)throw Error('Choose a valid production optimization mode.');
    if(!isFinite(maxOverPct)||maxOverPct<0||maxOverPct>1000)throw Error('Maximum allowed overproduction must be between 0% and 1000%.');
    jobs.forEach(function(j){
      if(!Number.isInteger(Number(j.orderQ))||Number(j.orderQ)<1||Number(j.orderQ)>1000000000)
        throw Error('Enter a confirmed positive OrderQ for '+(j.fileName||'PDF')+'.');
      if(typeof j.width!=='number'||!isFinite(j.width)||j.width<=0||typeof j.height!=='number'||!isFinite(j.height)||j.height<=0)
        throw Error('Measure or verify PDF dimensions for '+(j.fileName||'PDF')+'.');
    });
    progress({phase:'preflight',completed:1,total:1});
    var singleton=jobs.length<=20?singletonSeed(jobs,settings,searchConfigs(jobs.length)[0]):null;
    var fallbackPlan=singleton&&singleton.bins.length===1?buildPlan([{raw:{bins:singleton.bins,strategy:singleton.strategy},runs:Number(jobs[0].orderQ)}],jobs,settings):null;
    var exactSearch=maxOverPct===0&&jobs.length<=4?exactSmallBatchPlan(jobs,settings,withinBudget,stats,progress):null;
    progress({phase:'run-candidates',completed:0,total:1});
    var allRuns=makeRunCandidates(jobs,withinBudget);
    if(!allRuns.length&&fallbackPlan)stats.stoppedEarly=true;
    if(!allRuns.length&&!(exactSearch&&exactSearch.plan)&&!fallbackPlan)
      throw Error('No run count can fit every required PDF on one artboard within the placement limit. Review sheet size, margins and orders.');
    // Runs are selected per eventual sheet group. A global cap check here
    // incorrectly rejected valid plans where separate sheets use different
    // run counts for their own jobs.
    var runLimit=jobs.length>20?8:MAX_SEARCH_RUNS,candidates=selectRunCandidates(allRuns,jobs,runLimit,settings,maxOverPct),configs=searchConfigs(jobs.length),attempts=[];
    var totalInitial=Math.min(MAX_PACKING_ATTEMPTS,candidates.length*configs.length),completedInitial=0;
    var runSeen={},configSeen={};
    progress({phase:'packing',completed:0,total:totalInitial});
    // Visit each run count before spending the remaining budget on more strategies.
    var configOrder=configs.map(function(_,i){return i;});
    initialSearch: for(var cfgIndex=0;cfgIndex<configOrder.length;cfgIndex++)for(var ci=0;ci<candidates.length;ci++){
      if(completedInitial>=MAX_PACKING_ATTEMPTS||!withinBudget()){stats.stoppedEarly=true;break initialSearch;}
      var c=configs[configOrder[cfgIndex]],raw=P.planGroups({settings:settings,jobs:jobs},candidates[ci],c.order,c.strategy,c.bin);
      runSeen[candidates[ci]]=true;configSeen[configOrder[cfgIndex]]=true;stats.runCandidatesEvaluated=Object.keys(runSeen).length;
      stats.packingAttempts++;stats.searchIterations++;
      if(raw&&raw.bins.length===1){raw.config=c;attempts.push({raw:raw,score:scoreRaw(raw,jobs,candidates[ci]),run:candidates[ci]});}
      completedInitial++;stats.candidateCount=attempts.length;progress({phase:'packing',completed:completedInitial,total:totalInitial});
    }
    if(!attempts.length&&!(exactSearch&&exactSearch.plan)&&!fallbackPlan)
      throw Error('The required PDFs cannot fit together on one artboard with the current sheet, margins, OrderQ and overproduction limit. No second artboard was created.');
    progress({phase:'refining',completed:0,total:1});
    if(withinBudget()&&attempts.length)localImprove(attempts,jobs,settings,progress,withinBudget,stats);
    progress({phase:'refining',completed:1,total:1});
    var bySheets=attempts.slice().sort(compareRawSheets),byOver=attempts.slice().sort(compareRawOver),byUtil=attempts.slice().sort(compareRawUtil),finalists=[],attemptSeen={};
    var finalistsPerObjective=jobs.length>20?2:4;
    function addFinalists(list,count){for(var i=0;i<list.length&&count>0;i++){
      var a=list[i],key=a.run+'|'+a.raw.strategy+'|'+a.raw.orderMode+'|'+a.raw.binMode+'|'+a.raw.bins.map(jobSetKey).join('::');
      if(!attemptSeen[key]){attemptSeen[key]=true;finalists.push(a);count--;}
    }}
    addFinalists(bySheets,finalistsPerObjective);addFinalists(byOver,finalistsPerObjective);addFinalists(byUtil,finalistsPerObjective);
    var plans=[],planSeen={},singletons=singleton;
    if(fallbackPlan){var fallbackKey=productionSignature(fallbackPlan);planSeen[fallbackKey]=fallbackPlan;plans.push(fallbackPlan);}
    if(exactSearch&&exactSearch.plan){var exactKey=productionSignature(exactSearch.plan);
      if(!planSeen[exactKey]){planSeen[exactKey]=exactSearch.plan;plans.push(exactSearch.plan);}}
    if(singletons&&singletons.bins.length===1&&withinBudget()){
      var singleOptimized=optimizeSheetRuns(singletons,jobs,settings,allRuns,configs[0],'overproduction',maxOverPct,progress,withinBudget,stats);
      if(singleOptimized&&singleOptimized.length===1){var singlePlan=buildPlan(singleOptimized,jobs,settings),singleKey=productionSignature(singlePlan);
        if(!planSeen[singleKey]){planSeen[singleKey]=singlePlan;plans.push(singlePlan);}}
    }
    finalistSearch: for(var fi=0;fi<finalists.length;fi++)for(var objectiveIndex=0;objectiveIndex<2;objectiveIndex++){
      if(!withinBudget())break finalistSearch;
      var base=finalists[fi],objective=objectiveIndex?'utilization':'overproduction';
      var optimized=optimizeSheetRuns(base.raw,jobs,settings,allRuns,base.raw.config,objective,maxOverPct,progress,withinBudget,stats);
      if(!optimized||optimized.length!==1)continue;
      var result=buildPlan(optimized,jobs,settings),fingerprint=productionSignature(result),existing=planSeen[fingerprint];
      if(!existing){planSeen[fingerprint]=result;plans.push(result);}
      else if(compareLayoutQuality(result,existing)<0){plans[plans.indexOf(existing)]=result;planSeen[fingerprint]=result;}
    }
    plans=plans.filter(function(p){return p.sheetCount===1;});
    if(!plans.length)throw Error('The required PDFs cannot fit together on one artboard with the current sheet, margins, OrderQ and overproduction limit. No second artboard was created.');
    progress({phase:'ranking',completed:0,total:1,candidateCount:plans.length});
    var totalRuns=plans.map(function(p){return p.sheets.reduce(function(sum,s){return sum+s.printingRuns;},0);});
    var ranges={sheets:rangeOf(plans.map(function(p){return p.sheetCount;})),runs:rangeOf(totalRuns),over:rangeOf(plans.map(function(p){return p.totalOverproductionPct;})),
      copies:rangeOf(plans.map(function(p){return p.totalCopies;})),unused:rangeOf(plans.map(function(p){return p.areaPct;}))};
    function balancedScore(p){
      var runs=p.sheets.reduce(function(sum,s){return sum+s.printingRuns;},0);
      return (normalizeMetric(p.sheetCount,ranges.sheets,false)+normalizeMetric(runs,ranges.runs,false)+
        normalizeMetric(p.totalOverproductionPct,ranges.over,false)+normalizeMetric(p.totalCopies,ranges.copies,false)+
        normalizeMetric(p.areaPct,ranges.unused,true))/5;
    }
    var sortedBalanced=plans.slice().sort(function(a,b){return balancedScore(a)-balancedScore(b)||compareSheets(a,b);});
    var modeChoices=[
      {id:'balanced',label:'Balanced',reason:'Equal normalized balance of sheets, total printing runs, placements, overproduction rate and cut-box utilization across tested plans; this is a heuristic, not a cost model.',candidate:sortedBalanced[0]},
      {id:'utilization',label:'Maximum sheet utilization',reason:'Highest cut-box utilization among plans that satisfy the per-job overproduction limit; overproduction and sheet count are shown alongside it.',candidate:plans.slice().sort(compareUtilization)[0]},
      {id:'overproduction',label:'Minimum overproduction',reason:'Lowest total overproduction among tested valid plans; ties favor fewer sheets, then fewer placements.',candidate:plans.slice().sort(compareOver)[0]}
    ];
    var proposals=[],bySignature={};
    modeChoices.forEach(function(choice){
      var signature=productionSignature(choice.candidate),proposal=bySignature[signature];
      if(!proposal){proposal={};for(var key in choice.candidate)if(choice.candidate.hasOwnProperty(key))proposal[key]=choice.candidate[key];
        proposal.id=choice.id;proposal.label=choice.label;proposal.reason=choice.reason;proposal.modeIds=[];proposal.modeLabels=[];
        proposal.runSummary=choice.candidate.sheets.map(function(s){return s.printingRuns;});bySignature[signature]=proposal;proposals.push(proposal);}
      proposal.modeIds.push(choice.id);proposal.modeLabels.push(choice.label);
      if(proposal.modeIds.length>1){proposal.label=proposal.modeLabels.join(' + ');proposal.reason='This same production plan ranks best for: '+proposal.modeLabels.join(', ')+'. '+proposal.modeLabels.map(function(label){return modeChoices.filter(function(m){return m.label===label;})[0].reason;}).join(' ');}
    });
    var selected=proposals.filter(function(p){return p.modeIds.indexOf(mode)>=0;})[0]||proposals[0],result={};
    for(var resultKey in selected)if(selected.hasOwnProperty(resultKey))result[resultKey]=selected[resultKey];
    result.recommendation=selected.reason+' Search tested '+stats.runCandidatesEvaluated+' run-count seeds and '+Object.keys(configSeen).length+' packing configurations; each final sheet run count satisfies the '+maxOverPct+'% per-job overproduction cap. Selection and tie breaks are deterministic.';
    var reachedUtilizationBound=exactSearch&&exactSearch.plan&&exactSearch.upperBoundPct!=null&&
      Math.abs(exactSearch.plan.areaPct-exactSearch.upperBoundPct)<=0.05;
    if(stats.stoppedEarly)result.recommendation+=reachedUtilizationBound?
      ' The small-batch utilization check reached its theoretical ceiling; broader packing comparisons stopped at their attempt limit.':
      ' Search stopped at its time or attempt limit; the best complete valid plan found so far is shown.';
    result.recommendedMode=mode;result.recommendedId=selected.id;result.proposals=proposals;
    result.maxAllowedOverproductionPct=maxOverPct;result.testedRunCounts=candidates.filter(function(r){return !!runSeen[r];});result.testedPackingConfigurations=Object.keys(configSeen).length;
    if(exactSearch&&exactSearch.upperBoundPct!=null){result.utilizationUpperBoundPct=exactSearch.upperBoundPct;
      result.recommendation+=' One-artboard box-use ceiling from the required copy counts under the current zero-overproduction rule: '+exactSearch.upperBoundPct+'%. This percentage counts the 5 mm cut margins inside every placement.';}
    stats.elapsedMs=Date.now()-start;stats.candidateCount=attempts.length;
    result.searchDiagnostics={inputJobs:stats.inputJobs,mode:stats.mode,runCandidatesEvaluated:stats.runCandidatesEvaluated,
      packingAttempts:stats.packingAttempts,searchIterations:stats.searchIterations,candidateCount:stats.candidateCount,stoppedEarly:stats.stoppedEarly};
    result.stoppedEarly=stats.stoppedEarly;
    progress({phase:'complete',completed:1,total:1});
    return result;
  }
  function rangeOf(values){return {min:Math.min.apply(Math,values),max:Math.max.apply(Math,values)};}
  function normalizeMetric(value,range,inverse){var span=range.max-range.min;if(span<=1e-12)return 0;return inverse?(range.max-value)/span:(value-range.min)/span;}
  return {normalizeFilename:normalizeFilename,parseOrderQ:parseOrderQ,quantities:quantities,
    isRunWithinOverproductionLimit:isRunWithinOverproductionLimit,planProduction:planProduction,makeRunCandidates:makeRunCandidates};
}));
