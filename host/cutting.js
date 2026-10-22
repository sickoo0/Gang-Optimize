/* Shared CEP / ExtendScript verification of a complete guillotine cut sequence.
 * Every cut spans one existing subpiece; every PDF cut box must be a final piece.
 */
(function(root,factory){
  var cutting=factory();
  if(typeof module==='object'&&module.exports)module.exports=cutting;
  if(root)root.BytebaseCutting=cutting;
  if(typeof $!=='undefined'&&$.global)$.global.BytebaseCutting=cutting;
}(typeof window!=='undefined'?window:this,function(){
  'use strict';
  var EPS=0.0001;
  function near(a,b){return Math.abs(Number(a)-Number(b))<=EPS;}
  function sameRect(a,b){return a&&b&&near(a.x,b.x)&&near(a.y,b.y)&&near(a.w,b.w)&&near(a.h,b.h);}
  function validRect(r){return r&&isFinite(Number(r.x))&&isFinite(Number(r.y))&&
    isFinite(Number(r.w))&&isFinite(Number(r.h))&&Number(r.w)>EPS&&Number(r.h)>EPS;}
  function outerTrimCuts(settings){
    var sheetW=Number(settings.sheetW),sheetH=Number(settings.sheetH),edge=Number(settings.edge);
    if(!isFinite(sheetW)||!isFinite(sheetH)||!isFinite(edge)||edge<0||sheetW<=2*edge||sheetH<=2*edge)
      throw Error('Invalid sheet size or outer margin for guillotine trimming.');
    if(edge<=EPS)return [];
    var workW=sheetW-2*edge;
    return [
      {axis:'vertical',at:edge,region:{x:0,y:0,w:sheetW,h:sheetH},purpose:'trim'},
      {axis:'vertical',at:sheetW-edge,region:{x:edge,y:0,w:sheetW-edge,h:sheetH},purpose:'trim'},
      {axis:'horizontal',at:edge,region:{x:edge,y:0,w:workW,h:sheetH},purpose:'trim'},
      {axis:'horizontal',at:sheetH-edge,region:{x:edge,y:edge,w:workW,h:sheetH-edge},purpose:'trim'}
    ];
  }
  function verifyGuillotineCuts(settings,placements,cuts){
    if(!settings||!placements||!cuts||typeof placements.length!=='number'||typeof cuts.length!=='number'||
       !placements.length||cuts.length>placements.length*4+4)return false;
    var edge=Number(settings.edge),workW=Number(settings.sheetW)-2*edge,workH=Number(settings.sheetH)-2*edge;
    if(!isFinite(edge)||!isFinite(workW)||!isFinite(workH)||edge<0||workW<=EPS||workH<=EPS)return false;
    var pieces=[{x:0,y:0,w:Number(settings.sheetW),h:Number(settings.sheetH)}];
    for(var i=0;i<cuts.length;i++){
      var cut=cuts[i],region=cut&&cut.region,at=Number(cut&&cut.at),index=-1;
      if(!validRect(region)||!isFinite(at))return false;
      for(var pi=0;pi<pieces.length;pi++)if(sameRect(pieces[pi],region)){
        if(index!==-1)return false;index=pi;
      }
      if(index<0)return false;
      var first,second;
      if(cut.axis==='vertical'){
        if(at<=Number(region.x)+EPS||at>=Number(region.x)+Number(region.w)-EPS)return false;
        first={x:Number(region.x),y:Number(region.y),w:at-Number(region.x),h:Number(region.h)};
        second={x:at,y:Number(region.y),w:Number(region.x)+Number(region.w)-at,h:Number(region.h)};
      }else if(cut.axis==='horizontal'){
        if(at<=Number(region.y)+EPS||at>=Number(region.y)+Number(region.h)-EPS)return false;
        first={x:Number(region.x),y:Number(region.y),w:Number(region.w),h:at-Number(region.y)};
        second={x:Number(region.x),y:at,w:Number(region.w),h:Number(region.y)+Number(region.h)-at};
      }else return false;
      pieces.splice(index,1,first,second);
    }
    for(var j=0;j<placements.length;j++){
      if(!validRect(placements[j]))return false;
      var match=-1;
      for(var k=0;k<pieces.length;k++)if(sameRect(pieces[k],placements[j])){
        if(match!==-1)return false;match=k;
      }
      if(match<0)return false;
      pieces.splice(match,1);
    }
    return true;
  }
  return {outerTrimCuts:outerTrimCuts,verifyGuillotineCuts:verifyGuillotineCuts};
}));
