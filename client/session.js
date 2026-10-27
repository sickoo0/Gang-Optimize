/* Durable CEP panel working-session storage. Kept independent for regression tests. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BytebaseSession=api;
}(typeof self!=='undefined'?self:typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var KEY='com.bytebase.gangoptimizer.session.v1';
  function snapshot(state){
    return {version:4,savedAt:new Date().toISOString(),jobs:state.jobs||[],latest:state.latest||null,productionSetup:state.productionSetup||null,
      proposals:state.proposals||[],selectedSheet:state.selectedSheet||0,demoMode:false,settings:state.settings||{},
      scrollTop:Math.max(0,Number(state.scrollTop)||0),appScrollTop:Math.max(0,Number(state.appScrollTop)||0),
      optimizationMode:state.optimizationMode||'overproduction',overproductionCap:state.overproductionCap||'auto',
      customOverproduction:state.customOverproduction||'0',lastOptimizationError:state.lastOptimizationError||null};
  }
  function save(storage,state){
    try{storage.setItem(KEY,JSON.stringify(snapshot(state)));return true;}catch(e){return false;}
  }
  function load(storage){
    try{
      var raw=storage.getItem(KEY);if(!raw)return null;
      var value=JSON.parse(raw);
      if(!value||[1,2,3,4].indexOf(value.version)<0||!Array.isArray(value.jobs))return null;
      if(value.version===1){
        // Version 1 exposed the cap as a required top-level setting. Upgrade
        // that default workflow to automatic optimization; manual caps remain
        // available under Advanced production limits.
        value.overproductionCap='auto';
        if(!value.optimizationMode||value.optimizationMode==='balanced')value.optimizationMode='overproduction';
        value.version=2;value.migratedOptimizerDefaults=true;
      }
      if(value.version===2){
        // A saved 5 mm margin can be a production requirement. Keep every
        // stored value intact; only brand-new panels start at 0 mm.
        value.version=3;
      }
      if(value.version===3){value.version=4;value.productionSetup=null;}
      value.jobs=value.jobs.filter(function(j){return j&&j.filePath;});
      value.proposals=Array.isArray(value.proposals)?value.proposals:[];
      value.selectedSheet=Math.max(0,Number(value.selectedSheet)||0);
      value.demoMode=false;
      return value;
    }catch(e){return null;}
  }
  function clear(storage){try{storage.removeItem(KEY);}catch(e){}}
  return {key:KEY,save:save,load:load,clear:clear,snapshot:snapshot};
}));
