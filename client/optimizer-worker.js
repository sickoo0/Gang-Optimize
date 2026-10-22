/* Run bounded production planning away from the CEP panel's UI thread. */
importScripts('../host/cutting.js','packing.js','production.js');

self.onmessage=function(event){
  var started=Date.now(),lastSent=0,lastPhase='';
  try{
    var config=event.data&&event.data.config;
    self.postMessage({type:'diagnostic',stage:'started',jobs:config&&config.jobs?config.jobs.length:0,mode:config&&config.mode,
      memory:self.performance&&self.performance.memory?self.performance.memory.usedJSHeapSize:null});
    var plan=self.BytebaseProduction.planProduction(config,function(progress){
      var now=Date.now();
      if(progress.phase!==lastPhase||now-lastSent>=250||progress.phase==='complete'){
        lastSent=now;lastPhase=progress.phase;
        self.postMessage({type:'progress',progress:progress,memory:self.performance&&self.performance.memory?self.performance.memory.usedJSHeapSize:null});
      }
    },{maxMs:5000});
    self.postMessage({type:'diagnostic',stage:'finished',durationMs:Date.now()-started,stats:plan.searchDiagnostics,
      memory:self.performance&&self.performance.memory?self.performance.memory.usedJSHeapSize:null});
    self.postMessage({type:'result',plan:plan});
  }catch(error){
    self.postMessage({type:'error',message:error&&error.message?error.message:String(error),stack:error&&error.stack?error.stack:'',durationMs:Date.now()-started});
  }
};
