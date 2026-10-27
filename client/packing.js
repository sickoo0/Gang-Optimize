/* BYTEBASE Gang Optimizer - host independent geometric planner
 * v0.1: Rectangle / MaxRects, sheet packing only (NOT spot-color ganging).
 * All dimensions in millimetres. No production art is modified.
 * GPL-free original implementation, no external runtime dependencies.
 */
(function (root, factory) {
  var planner = factory(typeof module === 'object' && module.exports ? require('../host/cutting.js') : root.BytebaseCutting);
  if (typeof module === 'object' && module.exports) module.exports = planner;
  root.BytebasePacking = planner;
}(typeof window !== 'undefined' ? window : globalThis, function (Cutting) {
  'use strict';
  var EPS = 0.00001;
  // The run-count search repeatedly packs the same artwork geometries. Cache
  // only immutable cut-box calculations; placements and bins stay per-search.
  var geometryCache = Object.create(null), geometryCacheKeys = [], MAX_GEOMETRY_CACHE = 2048;
  function compareId(a,b){a=String(a);b=String(b);return a<b?-1:(a>b?1:0);}
  function inside(a, b) {
    return a.x >= b.x - EPS && a.y >= b.y - EPS &&
      a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS;
  }
  function intersect(a, b) {
    return a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS &&
      a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
  }
  function createBin(x, y, w, h) {
    return { x: x, y: y, w: w, h: h, free: [{ x: x, y: y, w: w, h: h }],
      skyline:[{x:x,y:y,w:w}],placements: [],cuts:[] };
  }
  function insertMaxRects(bin, unit, canRotate, heuristic) {
    var best = null;
    for (var i = 0; i < bin.free.length; i++) {
      var f = bin.free[i];
      for (var r = 0; r < (canRotate && Math.abs(unit.w - unit.h) > EPS ? 2 : 1); r++) {
        var w = r === 1 ? unit.h : unit.w;
        var h = r === 1 ? unit.w : unit.h;
        if (w <= f.w + EPS && h <= f.h + EPS) {
          var shortFit = Math.min(f.w - w, f.h - h);
          var longFit = Math.max(f.w - w, f.h - h);
          var areaFit=f.w*f.h-w*h;
          var primary=heuristic==='baf'?areaFit:(heuristic==='blsf'?longFit:shortFit);
          var secondary=heuristic==='baf'?shortFit:(heuristic==='blsf'?shortFit:longFit);
          if (!best || primary < best.primary - EPS ||
            (Math.abs(primary - best.primary) <= EPS && secondary < best.secondary - EPS)) {
            best = { x: f.x, y: f.y, w: w, h: h, rotated: r === 1,
              shortFit: shortFit, longFit: longFit,primary:primary,secondary:secondary };
          }
        }
      }
    }
    if (!best) return null;
    var used = { x: best.x, y: best.y, w: best.w, h: best.h };
    var split = [];
    for (var j = 0; j < bin.free.length; j++) {
      var f2 = bin.free[j];
      if (!intersect(f2, used)) { split.push(f2); continue; }
      if (used.x > f2.x + EPS) split.push({ x:f2.x, y:f2.y, w:used.x-f2.x, h:f2.h });
      if (used.x + used.w < f2.x + f2.w - EPS) split.push({ x:used.x+used.w, y:f2.y, w:f2.x+f2.w-used.x-used.w, h:f2.h });
      if (used.y > f2.y + EPS) split.push({ x:f2.x, y:f2.y, w:f2.w, h:used.y-f2.y });
      if (used.y + used.h < f2.y + f2.h - EPS) split.push({ x:f2.x, y:used.y+used.h, w:f2.w, h:f2.y+f2.h-used.y-used.h });
    }
    var pruned = [];
    for (var a = 0; a < split.length; a++) {
      if (split[a].w <= EPS || split[a].h <= EPS) continue;
      var covered = false;
      for (var b = 0; b < split.length; b++) {
        if (a !== b && inside(split[a], split[b]) &&
            (split[b].w * split[b].h > split[a].w * split[a].h + EPS || b < a &&
              Math.abs(split[b].w * split[b].h - split[a].w * split[a].h) <= EPS)) {
          covered = true; break;
        }
      }
      if (!covered) pruned.push(split[a]);
    }
    bin.free = pruned;
    var p = { id:unit.id, filePath:unit.filePath, fileName:unit.fileName,
      artworkW:unit.artworkW, artworkH:unit.artworkH, clearance:unit.clearance||0,
      x: best.x, y: best.y, w: best.w, h: best.h,
      rotated: best.rotated, inset: unit.inset, copyIndex: unit.copyIndex };
    bin.placements.push(p);
    return p;
  }
  function insertGuillotine(bin,unit,canRotate){
    var best=null;
    for(var i=0;i<bin.free.length;i++)for(var r=0;r<(canRotate&&Math.abs(unit.w-unit.h)>EPS?2:1);r++){
      var f=bin.free[i],w=r?unit.h:unit.w,h=r?unit.w:unit.h;
      if(w>f.w+EPS||h>f.h+EPS)continue;
      var areaWaste=f.w*f.h-w*h,shortFit=Math.min(f.w-w,f.h-h),longFit=Math.max(f.w-w,f.h-h);
      if(!best||areaWaste<best.areaWaste-EPS||Math.abs(areaWaste-best.areaWaste)<=EPS&&shortFit<best.shortFit-EPS)
        best={index:i,x:f.x,y:f.y,w:w,h:h,rotated:r===1,areaWaste:areaWaste,shortFit:shortFit,longFit:longFit};
    }
    if(!best)return null;
    var free=bin.free.splice(best.index,1)[0],rw=free.w-best.w,rh=free.h-best.h;
    var region={x:free.x,y:free.y,w:free.w,h:free.h};
    // Guillotine splits leave two non-overlapping free rectangles. Choose the
    // partition that gives the larger short side to the first remainder.
    var splitA=Math.min(Math.min(rw,best.h),Math.min(free.w,rh));
    var splitB=Math.min(Math.min(rw,free.h),Math.min(best.w,rh));
    if(splitA>=splitB){
      // First cut off the full-width bottom piece, then split the top strip.
      if(rh>EPS)bin.cuts.push({axis:'horizontal',at:best.y+best.h,region:region});
      if(rw>EPS)bin.cuts.push({axis:'vertical',at:best.x+best.w,
        region:{x:free.x,y:free.y,w:free.w,h:best.h}});
      if(rw>EPS)bin.free.push({x:best.x+best.w,y:best.y,w:rw,h:best.h});
      if(rh>EPS)bin.free.push({x:best.x,y:best.y+best.h,w:free.w,h:rh});
    }else{
      // First cut off the full-height right piece, then split the left strip.
      if(rw>EPS)bin.cuts.push({axis:'vertical',at:best.x+best.w,region:region});
      if(rh>EPS)bin.cuts.push({axis:'horizontal',at:best.y+best.h,
        region:{x:free.x,y:free.y,w:best.w,h:free.h}});
      if(rw>EPS)bin.free.push({x:best.x+best.w,y:best.y,w:rw,h:free.h});
      if(rh>EPS)bin.free.push({x:best.x,y:best.y+best.h,w:best.w,h:rh});
    }
    var p={id:unit.id,filePath:unit.filePath,fileName:unit.fileName,artworkW:unit.artworkW,artworkH:unit.artworkH,clearance:unit.clearance||0,
      x:best.x,y:best.y,w:best.w,h:best.h,rotated:best.rotated,inset:unit.inset,copyIndex:unit.copyIndex};
    bin.placements.push(p);return p;
  }
  function skylineY(bin,start,width){
    var end=start+width,cursor=start,y=bin.y;
    for(var i=0;i<bin.skyline.length&&cursor<end-EPS;i++){
      var n=bin.skyline[i],ne=n.x+n.w;
      if(ne<=cursor+EPS)continue;
      if(n.x>cursor+EPS)return null;
      y=Math.max(y,n.y);cursor=Math.min(end,ne);
    }
    return cursor>=end-EPS?y:null;
  }
  function insertSkyline(bin,unit,canRotate){
    var best=null;
    for(var i=0;i<bin.skyline.length;i++)for(var r=0;r<(canRotate&&Math.abs(unit.w-unit.h)>EPS?2:1);r++){
      var w=r?unit.h:unit.w,h=r?unit.w:unit.h,x=bin.skyline[i].x,y=skylineY(bin,x,w);
      if(y===null||x+w>bin.x+bin.w+EPS||y+h>bin.y+bin.h+EPS)continue;
      // Lowest skyline top wins; ties prefer less skyline disturbance and left.
      var nodesTouched=0;for(var n=0;n<bin.skyline.length;n++)if(bin.skyline[n].x<x+w-EPS&&bin.skyline[n].x+bin.skyline[n].w>x+EPS)nodesTouched++;
      if(!best||y+h<best.bottom-EPS||Math.abs(y+h-best.bottom)<=EPS&&(nodesTouched<best.nodesTouched||nodesTouched===best.nodesTouched&&x<best.x-EPS))
        best={x:x,y:y,w:w,h:h,rotated:r===1,bottom:y+h,nodesTouched:nodesTouched};
    }
    if(!best)return null;
    var end=best.x+best.w,next=[];
    for(var si=0;si<bin.skyline.length;si++){
      var node=bin.skyline[si],nodeEnd=node.x+node.w;
      if(nodeEnd<=best.x+EPS||node.x>=end-EPS){next.push(node);continue;}
      if(node.x<best.x-EPS)next.push({x:node.x,y:node.y,w:best.x-node.x});
      if(nodeEnd>end+EPS)next.push({x:end,y:node.y,w:nodeEnd-end});
    }
    next.push({x:best.x,y:best.y+best.h,w:best.w});next.sort(function(a,b){return a.x-b.x;});
    bin.skyline=[];
    for(var ni=0;ni<next.length;ni++){
      var last=bin.skyline[bin.skyline.length-1];
      if(last&&Math.abs(last.x+last.w-next[ni].x)<=EPS&&Math.abs(last.y-next[ni].y)<=EPS)last.w+=next[ni].w;
      else bin.skyline.push(next[ni]);
    }
    var p={id:unit.id,filePath:unit.filePath,fileName:unit.fileName,artworkW:unit.artworkW,artworkH:unit.artworkH,clearance:unit.clearance||0,
      x:best.x,y:best.y,w:best.w,h:best.h,rotated:best.rotated,inset:unit.inset,copyIndex:unit.copyIndex};
    bin.placements.push(p);return p;
  }
  function insert(bin,unit,canRotate,strategy){
    if(strategy==='skyline')return insertSkyline(bin,unit,canRotate);
    if(strategy==='guillotine')return insertGuillotine(bin,unit,canRotate);
    return insertMaxRects(bin,unit,canRotate,strategy==='maxrects-baf'?'baf':strategy==='maxrects-blsf'?'blsf':'bssf');
  }
  function finiteInRange(x, min, max) { return typeof x === 'number' && isFinite(x) && x >= min && x <= max; }
  function cachedGeometry(width,height,inset,clearance){
    var key=String(width)+'|'+String(height)+'|'+String(inset)+'|'+String(clearance),found=geometryCache[key];
    if(found)return found;
    found={artworkW:width,artworkH:height,inset:inset,clearance:clearance,cutW:width+2*inset+clearance,cutH:height+2*inset+clearance,artworkArea:width*height,cutArea:(width+2*inset+clearance)*(height+2*inset+clearance)};
    if(geometryCacheKeys.length>=MAX_GEOMETRY_CACHE){delete geometryCache[geometryCacheKeys.shift()];}
    geometryCache[key]=found;geometryCacheKeys.push(key);return found;
  }
  function mmToPt(value) { return value * 72 / 25.4; }
  function ptToMm(value) { return value * 25.4 / 72; }
  function cloneBin(bin) {
    return {x:bin.x,y:bin.y,w:bin.w,h:bin.h,
      free:bin.free.map(function(r){return {x:r.x,y:r.y,w:r.w,h:r.h};}),
      skyline:(bin.skyline||[]).map(function(r){return {x:r.x,y:r.y,w:r.w};}),
      cuts:(bin.cuts||[]).map(function(c){var cut={axis:c.axis,at:c.at,
        region:{x:c.region.x,y:c.region.y,w:c.region.w,h:c.region.h}};
        if(c.purpose!==undefined)cut.purpose=c.purpose;
        return cut;}),
      placements:bin.placements.map(function(p){var q={};for(var k in p)if(p.hasOwnProperty(k))q[k]=p[k];return q;})};
  }
  function binQuality(bin,strategy){
    if(strategy==='skyline'){
      var top=bin.y;for(var i=0;i<bin.skyline.length;i++)top=Math.max(top,bin.skyline[i].y);
      return [bin.skyline.length,top];
    }
    var largest=0;for(var j=0;j<bin.free.length;j++)largest=Math.max(largest,bin.free[j].w*bin.free[j].h);
    return [-largest,bin.free.length];
  }
  // Pack copies of production jobs either in contiguous job groups or
  // interleaved rounds. The schedule matters because each guillotine cut
  // permanently divides a bin.
  function planGroups(config, printingRuns, orderMode, strategy, binMode, orderOverride, packingOrder) {
    var settings=config.settings||{}, sheetW=Number(settings.sheetW),sheetH=Number(settings.sheetH);
    var edge=Number(settings.edge),inset=Number(settings.inset),clearance=Number(settings.artworkClearance)||0,rotate=settings.rotate!==false;
    var workW=sheetW-2*edge,workH=sheetH-2*edge;
    if(!finiteInRange(sheetW,50,2000)||!finiteInRange(sheetH,50,2000)||
       !finiteInRange(edge,0,200)||!finiteInRange(inset,0,50)||!finiteInRange(clearance,0,0.5)||workW<=0||workH<=0)throw Error('Invalid sheet settings.');
    if(!Number.isInteger(printingRuns)||printingRuns<1)throw Error('Invalid printing-run count.');
    var jobs=config.jobs||[],groups=[],placementTotal=0;
    if(!jobs.length)return null;
    for(var i=0;i<jobs.length;i++){
      var j=jobs[i],w=Number(j.width),h=Number(j.height),orderQ=Number(j.orderQ);
      if(!finiteInRange(w,1,1200)||!finiteInRange(h,1,1200)||!Number.isInteger(orderQ)||orderQ<1)
        throw Error('Check measured dimensions and OrderQ for '+(j.fileName||'PDF')+'.');
      var copies=Math.ceil(orderQ/printingRuns),geometry=cachedGeometry(w,h,inset,clearance),rw=geometry.cutW,rh=geometry.cutH;
      if(!((rw<=workW+EPS&&rh<=workH+EPS)||(rotate&&rh<=workW+EPS&&rw<=workH+EPS)))return null;
      placementTotal+=copies;
      if(placementTotal>500)return null;
      groups.push({job:j,copies:copies,rw:rw,rh:rh,area:copies*geometry.cutArea,
        largest:Math.max(rw,rh),runs:printingRuns});
    }
    strategy=strategy||'maxrects-bssf';orderMode=Number(orderMode)||0;binMode=Number(binMode)||0;
    var orderRanks={};if(orderOverride)for(var oi=0;oi<orderOverride.length;oi++)orderRanks[String(orderOverride[oi])]=oi;
    groups.sort(function(a,b){
      if(orderOverride){var ra=orderRanks[String(a.job.id)],rb=orderRanks[String(b.job.id)];if(ra!==rb)return ra-rb;}
      var aLong=Math.max(a.rw,a.rh),bLong=Math.max(b.rw,b.rh);
      var aRatio=Math.max(a.rw/a.rh,a.rh/a.rw),bRatio=Math.max(b.rw/b.rh,b.rh/b.rw);
      if(orderMode===1)return bLong-aLong||b.area-a.area||compareId(a.job.id,b.job.id);
      if(orderMode===2)return (bRatio*bLong)-(aRatio*aLong)||b.area-a.area||compareId(a.job.id,b.job.id);
      if(orderMode===3)return a.area-b.area||aLong-bLong||compareId(a.job.id,b.job.id);
      if(orderMode===4)return b.copies-a.copies||b.area-a.area||compareId(a.job.id,b.job.id);
      return b.area-a.area||bLong-aLong||compareId(a.job.id,b.job.id);
    });
    var units=[];
    if(packingOrder===1){
      var maxCopies=0;for(var mc=0;mc<groups.length;mc++)maxCopies=Math.max(maxCopies,groups[mc].copies);
      for(var copyRound=0;copyRound<maxCopies;copyRound++)for(var rg=0;rg<groups.length;rg++){
        var roundGroup=groups[rg];if(copyRound<roundGroup.copies)units.push({group:roundGroup,copyIndex:copyRound+1});
      }
    }else{
      for(var ug=0;ug<groups.length;ug++)for(var uc=0;uc<groups[ug].copies;uc++)units.push({group:groups[ug],copyIndex:uc+1});
    }
    var bins=[];
    for(var gi=0;gi<units.length;gi++){
      var unit=units[gi],g=unit.group,placed=false;
      var bestBin=-1,bestTrial=null,bestQuality=null;
      for(var bi=0;bi<bins.length;bi++){
        var trial=cloneBin(bins[bi]);
        if(insert(trial,{id:String(g.job.id),filePath:g.job.filePath,fileName:g.job.fileName,
          artworkW:Number(g.job.width),artworkH:Number(g.job.height),inset:inset,clearance:clearance,
          w:g.rw,h:g.rh,copyIndex:unit.copyIndex},rotate,strategy)){
          if(!binMode){bins[bi]=trial;placed=true;break;}
          var quality=binQuality(trial,strategy);
          if(bestQuality===null||quality[0]<bestQuality[0]-EPS||Math.abs(quality[0]-bestQuality[0])<=EPS&&quality[1]<bestQuality[1]-EPS){
            bestBin=bi;bestTrial=trial;bestQuality=quality;
          }
        }
      }
      if(!placed&&bestBin>=0){bins[bestBin]=bestTrial;placed=true;}
      if(!placed){
        if(bins.length>=20)return null; // Illustrator's layout pilot supports at most 20 artboards.
        var bin=createBin(edge,edge,workW,workH),fits=true;
        if(strategy==='guillotine')bin.cuts=Cutting.outerTrimCuts({sheetW:sheetW,sheetH:sheetH,edge:edge});
        if(!insert(bin,{id:String(g.job.id),filePath:g.job.filePath,fileName:g.job.fileName,
          artworkW:Number(g.job.width),artworkH:Number(g.job.height),inset:inset,clearance:clearance,
          w:g.rw,h:g.rh,copyIndex:unit.copyIndex},rotate,strategy))fits=false;
        if(!fits)return null;
        bins.push(bin);
      }
    }
    if(strategy==='guillotine'){
      if(!Cutting||!Cutting.verifyGuillotineCuts)throw Error('Guillotine cut verifier is unavailable.');
      for(var check=0;check<bins.length;check++)if(!Cutting.verifyGuillotineCuts(
        {sheetW:sheetW,sheetH:sheetH,edge:edge},bins[check].placements,bins[check].cuts))
        // Search candidates are heuristic. If a candidate's cut trace cannot
        // be certified, reject it and let the optimizer continue with the
        // other run counts and packing orders instead of aborting the search.
        return null;
    }
    return {settings:{sheetW:sheetW,sheetH:sheetH,edge:edge,inset:inset,artworkClearance:clearance,rotate:rotate},
      bins:bins,printingRuns:printingRuns,totalPlacements:placementTotal,
      strategy:strategy,orderMode:orderMode,binMode:binMode,packingOrder:packingOrder||0,
      groupOrder:groups.map(function(g){return String(g.job.id);})};
  }
  function plan(config) {
    var settings = config.settings || {};
    var sheetW = Number(settings.sheetW), sheetH = Number(settings.sheetH);
    var edge = Number(settings.edge), inset = Number(settings.inset),clearance=Number(settings.artworkClearance)||0;
    var rotate = settings.rotate !== false;
    if (!finiteInRange(sheetW, 50, 2000) || !finiteInRange(sheetH, 50, 2000)) throw Error('Invalid sheet size.');
    if (!finiteInRange(edge, 0, 200) || !finiteInRange(inset, 0, 50)||!finiteInRange(clearance,0,0.5)) throw Error('Invalid margins.');
    var workW = sheetW - 2 * edge, workH = sheetH - 2 * edge;
    if (workW <= 0 || workH <= 0) throw Error('The inner print area is empty.');
    var jobs = config.jobs || [];
    if (!jobs.length) throw Error('Add at least one PDF.');
    var units = [];
    var totalArtworkArea = 0;
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      var w = Number(j.width), h = Number(j.height), count = Number(j.copies);
      if (!finiteInRange(w, 1, 1200) || !finiteInRange(h, 1, 1200) ||
          !Number.isInteger(count) || count < 1 || count > 500) {
        throw Error('Check width, height and copies for ' + (j.fileName || 'PDF') + '.');
      }
      var rw = w + 2*inset+clearance, rh = h + 2*inset+clearance;
      if (!((rw <= workW + EPS && rh <= workH + EPS) ||
          (rotate && rh <= workW + EPS && rw <= workH + EPS))) {
        throw Error('Too large for the print area: ' + (j.fileName || 'PDF'));
      }
      for (var c = 0; c < count; c++) {
        units.push({ id:String(j.id), filePath:j.filePath, fileName:j.fileName,
          artworkW:w, artworkH:h, inset:inset, clearance:clearance,w:rw, h:rh, copyIndex:c+1 });
        totalArtworkArea += w*h;
      }
    }
    if (units.length > 500) throw Error('Pilot limit: max 500 placements in one calculation.');
    units.sort(function (a, b) {
      return Math.max(b.w,b.h) - Math.max(a.w,a.h) ||
        b.w*b.h - a.w*a.h || compareId(a.id,b.id);
    });
    var bins = [];
    for (var u = 0; u < units.length; u++) {
      var done = false;
      for (var bi = 0; bi < bins.length; bi++) {
        if (insert(bins[bi], units[u], rotate)) { done = true; break; }
      }
      if (!done) {
        if (bins.length >= 20) throw Error('Pilot limit: max 20 sheets per layout. Reduce copies.');
        var newBin = createBin(edge,edge,workW,workH);
        if (!insert(newBin, units[u], rotate)) throw Error('Cannot fit: '+units[u].fileName);
        bins.push(newBin);
      }
    }
    var occupied = 0;
    var sheets = bins.map(function(bin, i) {
      var area = 0;
      for (var pi=0; pi<bin.placements.length; pi++) area += bin.placements[pi].w * bin.placements[pi].h;
      occupied += area;
      return { index:i, placements:bin.placements, areaPct:Math.round(1000*area/(workW*workH))/10 };
    });
    return {
      settings:{sheetW:sheetW,sheetH:sheetH,edge:edge,inset:inset,artworkClearance:clearance,rotate:rotate},
      sheets:sheets, totalCopies:units.length, sheetCount:sheets.length,
      areaPct:Math.round(1000*occupied/(sheets.length*workW*workH))/10,
      artworkAreaPct:Math.round(1000*totalArtworkArea/(sheets.length*workW*workH))/10,
      note:'Geometric packing preview only. No ink/production optimization or RIP separation output.'
    };
  }
  return { plan: plan, planGroups:planGroups, verifyGuillotineCuts:Cutting&&Cutting.verifyGuillotineCuts,
    intersect: intersect, mmToPt: mmToPt, ptToMm: ptToMm };
}));
