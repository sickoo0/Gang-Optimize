/* Bounded MaxRects beam search with destroy/repair and optional gap filling.
 * All positions are cut boxes in mm. Original artwork sizes are immutable.
 * Only complete, certified guillotine layouts may leave this module.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?require('../host/cutting.js'):root.BytebaseCutting);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.BytebaseBeamPacking=api;
}(typeof window!=='undefined'?window:this,function(Cutting){
  'use strict';
  var EPS=1e-7,MAX_PLACEMENTS=500;
  function overlaps(a,b){return a.x<b.x+b.w-EPS&&a.x+a.w>b.x+EPS&&a.y<b.y+b.h-EPS&&a.y+a.h>b.y+EPS;}
  function contains(a,b){return a.x<=b.x+EPS&&a.y<=b.y+EPS&&a.x+a.w>=b.x+b.w-EPS&&a.y+a.h>=b.y+b.h-EPS;}
  function subtract(free,p){
    var split=[];
    free.forEach(function(f){
      if(!overlaps(f,p)){split.push(f);return;}
      if(p.x>f.x+EPS)split.push({x:f.x,y:f.y,w:p.x-f.x,h:f.h});
      if(p.x+p.w<f.x+f.w-EPS)split.push({x:p.x+p.w,y:f.y,w:f.x+f.w-p.x-p.w,h:f.h});
      if(p.y>f.y+EPS)split.push({x:f.x,y:f.y,w:f.w,h:p.y-f.y});
      if(p.y+p.h<f.y+f.h-EPS)split.push({x:f.x,y:p.y+p.h,w:f.w,h:f.y+f.h-p.y-p.h});
    });
    return split.filter(function(a,i){return a.w>EPS&&a.h>EPS&&!split.some(function(b,j){
      return i!==j&&contains(b,a)&&(!contains(a,b)||j<i);
    });});
  }
  function stateFrom(placements,types,work){
    var free=[work],counts=types.map(function(){return 0;}),area=0;
    placements.forEach(function(p){free=subtract(free,p);area+=p.w*p.h;
      for(var i=0;i<types.length;i++)if(types[i].id===p.id){counts[i]++;break;}
    });
    return {free:free,placements:placements.slice(),counts:counts,area:area};
  }
  function contact(state,p,work){
    var score=0;
    if(Math.abs(p.x-work.x)<EPS||Math.abs(p.x+p.w-work.x-work.w)<EPS)score+=p.h;
    if(Math.abs(p.y-work.y)<EPS||Math.abs(p.y+p.h-work.y-work.h)<EPS)score+=p.w;
    state.placements.forEach(function(q){
      if(Math.abs(p.x+p.w-q.x)<EPS||Math.abs(q.x+q.w-p.x)<EPS)score+=Math.max(0,Math.min(p.y+p.h,q.y+q.h)-Math.max(p.y,q.y));
      if(Math.abs(p.y+p.h-q.y)<EPS||Math.abs(q.y+q.h-p.y)<EPS)score+=Math.max(0,Math.min(p.x+p.w,q.x+q.w)-Math.max(p.x,q.x));
    });
    return score;
  }
  function movesFor(state,types,limits,rotate,work,stats,control){
    var moves=[],seen={},last=state.placements[state.placements.length-1];
    for(var ti=0;ti<types.length;ti++){
      if(!control.alive())break;
      var t=types[ti];if(state.counts[ti]>=limits[ti])continue;
      for(var fi=0;fi<state.free.length;fi++)for(var rot=0;rot<(rotate&&Math.abs(t.w-t.h)>EPS?2:1);rot++){
        var f=state.free[fi],w=rot?t.h:t.w,h=rot?t.w:t.h;
        if(w>f.w+EPS||h>f.h+EPS)continue;
        // Opposite-corner anchors permit regrouping and preserve narrow slots.
        for(var corner=0;corner<4;corner++){
          var x=f.x+(corner&1?f.w-w:0),y=f.y+(corner&2?f.h-h:0);
          var key=ti+'|'+rot+'|'+x.toFixed(6)+'|'+y.toFixed(6);if(seen[key])continue;seen[key]=true;
          var p={id:t.id,filePath:t.filePath,fileName:t.fileName,artworkW:t.artworkW,artworkH:t.artworkH,
            inset:t.inset,copyIndex:state.counts[ti]+1,x:x,y:y,w:w,h:h,rotated:!!rot};
          var shortFit=Math.min(f.w-w,f.h-h),longFit=Math.max(f.w-w,f.h-h),touch=contact(state,p,work);
          moves.push({p:p,type:ti,short:shortFit,long:longFit,waste:f.w*f.h-w*h,
            touch:touch,group:last&&last.id===t.id?1:0,area:w*h});stats.placementCandidates++;
        }
      }
    }
    // Diverse heuristics keep both large blockers and small gap fillers in
    // the frontier; grouping is only a tie-break, never a hard constraint.
    var orders=[
      function(a,b){return a.short-b.short||a.long-b.long||b.area-a.area;},
      function(a,b){return a.waste-b.waste||b.area-a.area||b.group-a.group;},
      function(a,b){return b.area-a.area||a.p.y+a.p.h-b.p.y-b.p.h||a.p.x-b.p.x;},
      function(a,b){return b.touch/(b.p.w+b.p.h)-a.touch/(a.p.w+a.p.h)||b.group-a.group||a.waste-b.waste;}
    ],chosen=[],used={};
    orders.forEach(function(compare,oi){
      moves.sort(compare);
      for(var i=0;i<Math.min(3,moves.length);i++){
        var m=moves[i],key=m.type+'|'+m.p.x+'|'+m.p.y+'|'+m.p.rotated;
        if(!used[key]){used[key]=true;chosen.push(m);}
      }
    });
    return chosen;
  }
  function add(state,move){
    var counts=state.counts.slice();counts[move.type]++;
    return {free:subtract(state.free,move.p),placements:state.placements.concat([move.p]),counts:counts,area:state.area+move.area};
  }
  function canComplete(state,types,required,rotate){
    for(var i=0;i<types.length;i++)if(state.counts[i]<required[i]){
      var t=types[i],fits=state.free.some(function(f){return t.w<=f.w+EPS&&t.h<=f.h+EPS||rotate&&t.h<=f.w+EPS&&t.w<=f.h+EPS;});
      if(!fits)return false;
    }
    return true;
  }
  function quality(state,work,types,limits,rotate){
    var right=work.x,bottom=work.y,stranded=0;
    state.placements.forEach(function(p){right=Math.max(right,p.x+p.w);bottom=Math.max(bottom,p.y+p.h);});
    // MaxRects free rectangles overlap: use the largest stranded rectangle,
    // not their sum, which would falsely count the same whitespace twice.
    state.free.forEach(function(f){
      if(!types.some(function(t,i){return state.counts[i]<limits[i]&&(t.w<=f.w+EPS&&t.h<=f.h+EPS||rotate&&t.h<=f.w+EPS&&t.w<=f.h+EPS);}))
        stranded=Math.max(stranded,f.w*f.h);
    });
    return (right-work.x)*(bottom-work.y)-state.area+stranded*0.2+state.free.length*0.01;
  }
  function fingerprint(s){return s.placements.map(function(p){return p.id+':'+p.x.toFixed(5)+','+p.y.toFixed(5)+','+p.w.toFixed(5)+','+p.h.toFixed(5);}).sort().join('|');}
  function beam(seed,types,required,limits,settings,work,control,optional){
    var frontier=[seed],best=null,depth=0,width=control.width,stats=control.stats;
    function accept(state){
      var certificate=Cutting.deriveGuillotineCuts(settings,state.placements);stats.certifications++;
      if(!certificate)return false;
      state.cuts=certificate.cuts;
      state.quality=quality(state,work,types,limits,settings.rotate!==false);
      if(!best||state.area>best.area+EPS||Math.abs(state.area-best.area)<=EPS&&state.quality<best.quality)best=state;
      return true;
    }
    while(frontier.length&&control.alive()){
      var next=[],seen={};
      for(var si=0;si<frontier.length&&control.alive();si++){
        var state=frontier[si],complete=state.counts.every(function(n,i){return n>=required[i];});
        if(complete&&accept(state)&&!optional)continue;
        if(state.placements.length>=MAX_PLACEMENTS)continue;
        var moves=movesFor(state,types,complete&&optional?limits:required,settings.rotate!==false,work,stats,control);
        for(var mi=0;mi<moves.length&&control.alive();mi++){
          var child=add(state,moves[mi]);stats.expandedStates++;
          if(!canComplete(child,types,required,settings.rotate!==false))continue;
          var key=fingerprint(child);if(seen[key])continue;seen[key]=true;
          // A non-slicing partial packing can never become slicing by adding
          // rectangles. Prune it before it consumes the full beam budget.
          if(depth%4===3&&!Cutting.deriveGuillotineCuts(settings,child.placements)){stats.unsliceablePruned++;continue;}
          child.quality=quality(child,work,types,limits,settings.rotate!==false);
          next.push(child);
        }
      }
      next.sort(function(a,b){return b.area-a.area||a.quality-b.quality;});
      frontier=next.slice(0,width);depth++;
    }
    // A deadline can fall between the last insertion and the next level.
    frontier.forEach(function(state){if(state.counts.every(function(n,i){return n>=required[i];}))accept(state);});
    return best;
  }
  function search(config,runs,options){
    options=options||{};
    var settings=config.settings,jobs=config.jobs,edge=Number(settings.edge),inset=Number(settings.inset),
      work={x:edge,y:edge,w:Number(settings.sheetW)-2*edge,h:Number(settings.sheetH)-2*edge},cap=Number(config.maxOverproductionPct)||0;
    var stats=options.stats||{placementCandidates:0,expandedStates:0,certifications:0,unsliceablePruned:0,localIterations:0},
      startedStates=stats.expandedStates,started=Date.now(),deadline=options.deadline||Date.now()+1000,phaseDeadline=deadline;
    var control={width:options.width||10,stats:stats,alive:function(){return Date.now()<phaseDeadline&&stats.expandedStates-startedStates<(options.maxStates||18000);}};
    var types=jobs.map(function(j){return {id:String(j.id),filePath:j.filePath,fileName:j.fileName,
      artworkW:j.width,artworkH:j.height,inset:inset,w:j.width+2*inset,h:j.height+2*inset};});
    var required=jobs.map(function(j){return Math.ceil(j.orderQ/runs);}),limits=jobs.map(function(j){return Math.min(MAX_PLACEMENTS,Math.floor((j.orderQ*(1+cap/100)+1e-9)/runs));});
    if(required.some(function(n,i){return n>limits[i];})||required.reduce(function(a,b){return a+b;},0)>MAX_PLACEMENTS||
      required.reduce(function(sum,n,i){return sum+n*types[i].w*types[i].h;},0)>work.w*work.h+EPS)return null;
    var seed=stateFrom([],types,work),best=null;
    if(options.seed){
      var candidate=stateFrom(options.seed,types,work);
      if(candidate.counts.every(function(n,i){return n>=required[i]&&n<=limits[i];})&&Cutting.deriveGuillotineCuts(settings,candidate.placements))best=candidate;
    }
    function keep(candidate){
      if(!candidate)return;
      candidate.quality=quality(candidate,work,types,limits,settings.rotate!==false);
      if(!best||candidate.area>best.area+EPS||Math.abs(candidate.area-best.area)<=EPS&&candidate.quality<best.quality)best=candidate;
    }
    if(best)best.quality=quality(best,work,types,limits,settings.rotate!==false);
    if(!best){
      phaseDeadline=started+(deadline-started)*0.6;
      keep(beam(seed,types,required,limits,settings,work,control,false));
    }
    var minimal=best;
    // Reserve time for fill before local repair: a difficult rearrangement
    // must not consume the budget needed to exploit already available gaps.
    phaseDeadline=best&&options.seed?started+(deadline-started)*0.35:started+(deadline-started)*0.8;
    if(best&&options.fill!==false&&control.alive())keep(beam(best,types,best.counts.slice(),limits,settings,work,control,true));
    phaseDeadline=deadline;
    // Deterministic spatial destroy/repair frees a strip or a cluster, rotates
    // and regroups its members, and retains only monotonic improvements.
    for(var pass=0;best&&pass<6&&control.alive();pass++){
      var ordered=best.placements.slice(),anchor=ordered[(pass*7)%ordered.length];
      ordered.sort(function(a,b){
        if(pass%3===0)return b.x+b.w-a.x-a.w;
        if(pass%3===1)return b.y+b.h-a.y-a.h;
        return Math.abs(a.x-anchor.x)+Math.abs(a.y-anchor.y)-Math.abs(b.x-anchor.x)-Math.abs(b.y-anchor.y);
      });
      var remove=Math.min(ordered.length,Math.max(3,Math.ceil(ordered.length*0.25))),fixed=ordered.slice(remove);
      var target=pass%2?required:best.counts.slice();stats.localIterations++;
      var repairStart=Date.now();phaseDeadline=Math.min(deadline,repairStart+Math.max(15,(deadline-repairStart)/(6-pass)));
      keep(beam(stateFrom(fixed,types,work),types,target,limits,settings,work,control,options.fill!==false));
      phaseDeadline=deadline;
    }
    if(best&&options.fill!==false&&control.alive())keep(beam(best,types,best.counts.slice(),limits,settings,work,control,true));
    if(!best)return null;
    // copyIndex is serialised from actual occurrences after repair, never
    // reused from removed instances. Counts and geometry stay authoritative.
    var counts={};best.placements=best.placements.map(function(p){var q={};for(var k in p)q[k]=p[k];q.copyIndex=counts[q.id]=(counts[q.id]||0)+1;return q;});
    var certificate=Cutting.deriveGuillotineCuts(settings,best.placements);if(!certificate)return null;
    var bin={x:work.x,y:work.y,w:work.w,h:work.h,placements:best.placements,free:best.free,cuts:certificate.cuts};
    return {settings:settings,bins:[bin],printingRuns:runs,totalPlacements:best.placements.length,strategy:'maxrects-beam',
      minimal:minimal&&minimal!==best?{settings:settings,bins:[{placements:minimal.placements,free:minimal.free,cuts:Cutting.deriveGuillotineCuts(settings,minimal.placements).cuts}],strategy:'maxrects-beam'}:null};
  }
  return {search:search};
}));
