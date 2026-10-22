/* Durable CEP panel working-session storage. Kept independent for regression tests. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BytebaseSession=api;
}(typeof self!=='undefined'?self:typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var KEY='com.bytebase.gangoptimizer.session.v1';
  function snapshot(state){
    return {version:1,savedAt:new Date().toISOString(),jobs:state.jobs||[],latest:state.latest||null,
      proposals:state.proposals||[],selectedSheet:state.selectedSheet||0,demoMode:false,settings:state.settings||{},
      scrollTop:Math.max(0,Number(state.scrollTop)||0),appScrollTop:Math.max(0,Number(state.appScrollTop)||0),
      optimizationMode:state.optimizationMode||'balanced',overproductionCap:state.overproductionCap||'0',
      customOverproduction:state.customOverproduction||'0'};
  }
  function save(storage,state){
    try{storage.setItem(KEY,JSON.stringify(snapshot(state)));return true;}catch(e){return false;}
  }
  function load(storage){
    try{
      var raw=storage.getItem(KEY);if(!raw)return null;
      var value=JSON.parse(raw);
      if(!value||value.version!==1||!Array.isArray(value.jobs))return null;
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
