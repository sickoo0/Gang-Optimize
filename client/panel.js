/* UI for CEP 12. Uses native CEP bridge (no externally fetched libraries). */
(function () {
  'use strict';
  var $ = function(id){return document.getElementById(id);};
  var isCEP = !!(window.__adobe_cep__ && window.__adobe_cep__.evalScript);
  var jobs = [], latest = null, proposals = [], selectedSheet = 0, demoMode = false,lastOptimizationError=null;
  var lastErrorStorageKey='com.bytebase.gangoptimizer.lastOptimizationError';
  function storeLastOptimizationError(message){
    try{if(message)window.localStorage.setItem(lastErrorStorageKey,String(message));else window.localStorage.removeItem(lastErrorStorageKey);}catch(e){}
  }
  function readLastOptimizationError(){try{return window.localStorage.getItem(lastErrorStorageKey)||null;}catch(e){return null;}}
  var optimizationWorker=null,optimizationToken=0,optimizationTimer=null;
  var optimizeButtonHTML;
  var sessionKey=window.BytebaseSession;
  function captureScroll(){
    var html=document.documentElement,body=document.body,app=document.querySelector&&document.querySelector('.app');
    return {top:Math.max(window.pageYOffset||0,html&&html.scrollTop||0,body&&body.scrollTop||0),
      left:Math.max(window.pageXOffset||0,html&&html.scrollLeft||0,body&&body.scrollLeft||0),appTop:app&&app.scrollTop||0};
  }
  function restoreScroll(position){
    if(!position)return;
    function apply(){
      if(document.documentElement)document.documentElement.scrollTop=position.top;
      if(document.body)document.body.scrollTop=position.top;
      var app=document.querySelector&&document.querySelector('.app');if(app)app.scrollTop=position.appTop;
      if(window.scrollTo)window.scrollTo(position.left,position.top);
    }
    apply();if(window.requestAnimationFrame)window.requestAnimationFrame(apply);
  }
  function logOptimization(stage,details){
    var entry={at:new Date().toISOString(),stage:stage,jobs:jobs.length,mode:$('optimizationMode').value,
      memory:window.performance&&window.performance.memory?window.performance.memory.usedJSHeapSize:null,details:details||{}};
    if(window.console&&console.info)console.info('[BYTEBASE optimization]',entry);
    try{
      var encoded=JSON.stringify(entry),fileApi=window.cep&&window.cep.fs;
      if(fileApi&&window.__adobe_cep__&&window.__adobe_cep__.getSystemPath){
        var path=window.__adobe_cep__.getSystemPath('userData').replace(/[\\/]$/,'')+'/com.bytebase.gangoptimizer-debug.log';
        var previous=fileApi.readFile(path),lines=previous&&previous.err===0?previous.data.split('\n').filter(Boolean):[];
        lines.push(encoded);fileApi.writeFile(path,lines.slice(-200).join('\n')+'\n');
      }else{
        var storage=sessionStore(),old=storage&&storage.getItem('com.bytebase.gangoptimizer.debug');
        if(storage)storage.setItem('com.bytebase.gangoptimizer.debug',(old?old.split('\n').filter(Boolean):[]).concat(encoded).slice(-200).join('\n'));
      }
    }catch(e){if(window.console&&console.error)console.error('[BYTEBASE optimization] debug log write failed',e);}
  }
  function sessionStore(){
    try{
      if(window.cep&&window.cep.fs&&window.__adobe_cep__&&window.__adobe_cep__.getSystemPath){
        var path=window.__adobe_cep__.getSystemPath('userData').replace(/[\\/]$/,'')+'/com.bytebase.gangoptimizer-session.json';
        var fallback=window.localStorage;
        return {
          getItem:function(key){var result=window.cep.fs.readFile(path);return result&&result.err===0?result.data:fallback.getItem(key);},
          setItem:function(key,value){var result=window.cep.fs.writeFile(path,value);if(!result||result.err!==0)fallback.setItem(key,value);},
          removeItem:function(key){var result=window.cep.fs.deleteFile(path);if(fallback)fallback.removeItem(key);if(result&&result.err!==0&&result.err!==20&&fallback==null)throw Error('CEP session file removal failed ('+result.err+')');}
        };
      }
      return window.localStorage;
    }catch(e){if(window.console&&console.error)console.error('[BYTEBASE session] persistent storage unavailable',e);return null;}
  }
  function saveSession(reason){
    var store=sessionStore();
    if(demoMode||!jobs.length){if(!jobs.length&&sessionKey)sessionKey.clear(store);return true;}
    var viewport=captureScroll();
    var ok=sessionKey&&sessionKey.save(store,{jobs:jobs,latest:latest,proposals:proposals,selectedSheet:selectedSheet,
      scrollTop:viewport.top,appScrollTop:viewport.appTop,
      settings:settings(),optimizationMode:$('optimizationMode').value,overproductionCap:$('overproductionCap').value,
      customOverproduction:$('customOverproduction').value,lastOptimizationError:lastOptimizationError});
    if(window.console&&console.info)console.info('[BYTEBASE session] saved',{reason:reason,jobs:jobs.length,hasLayout:!!latest,selectedSheet:selectedSheet,ok:!!ok});
    return !!ok;
  }
  function cuttable(plan){
    return !!(window.BytebaseCutting&&plan&&plan.sheetCount===1&&plan.sheets&&plan.sheets.length===1&&
      window.BytebaseCutting.verifyGuillotineCuts(plan.settings,plan.sheets[0].placements,plan.sheets[0].cuts));
  }
  function restoreSession(){
    var saved=sessionKey&&sessionKey.load(sessionStore());if(!saved)return false;
    jobs=saved.jobs;latest=saved.latest;proposals=saved.proposals;selectedSheet=saved.selectedSheet;demoMode=false;
    lastOptimizationError=saved.lastOptimizationError||readLastOptimizationError();
    if(saved.migratedOptimizerDefaults){
      // A version 1 layout was calculated with the old cap and objective.
      // Keep its imported jobs, but require a fresh preview under auto mode.
      latest=null;proposals=[];lastOptimizationError=null;storeLastOptimizationError(null);
    }
    // Older sessions have no proven straight-cut sequence. Keep their jobs and
    // settings, but never offer an uncuttable layout for generation.
    proposals=proposals.filter(cuttable);
    var replacedObsolete=!!latest&&!cuttable(latest);
    if(replacedObsolete)latest=proposals[0]||null;
    selectedSheet=0;
    ['sheetW','sheetH','edge','inset'].forEach(function(id){if(saved.settings&&saved.settings[id]!=null)$(id).value=saved.settings[id];});
    if(saved.settings&&typeof saved.settings.rotate==='boolean')$('rotate').checked=saved.settings.rotate;
    if(saved.optimizationMode)$('optimizationMode').value=saved.optimizationMode;
    if(saved.overproductionCap)$('overproductionCap').value=saved.overproductionCap;
    if(saved.customOverproduction!=null)$('customOverproduction').value=saved.customOverproduction;
    $('customOverproduction').hidden=$('overproductionCap').value!=='custom';
    if(latest){
      selectedSheet=Math.min(selectedSheet,Math.max(0,latest.sheetCount-1));
      $('metricSheets').textContent=latest.sheetCount;$('metricCopies').textContent=latest.totalCopies;$('metricUsage').textContent=latest.areaPct+'%';
      $('create').disabled=demoMode||!isCEP||jobs.some(function(j){return !j.filePath||!isFinite(j.width)||!isFinite(j.height);});
      renderProposals();renderSheetSummaries();
    }
    renderJobs();renderPreview();
    restoreScroll({top:saved.scrollTop||0,left:0,appTop:saved.appScrollTop||0});
    if(window.console&&console.info)console.info('[BYTEBASE session] restored',{jobs:jobs.length,hasLayout:!!latest,savedAt:saved.savedAt});
    setStatus(replacedObsolete?'Restored '+jobs.length+' PDF(s). The previous layout did not meet the one-sheet requirement; recalculate before creating.':
      saved.migratedOptimizerDefaults?'Restored '+jobs.length+' PDF(s). Optimizer defaults were updated; click Calculate layout to create a fresh preview.':
      latest?'Restored '+jobs.length+' imported PDF(s) and the calculated layout from this CEP session.':
      lastOptimizationError?'Last calculation failed: '+lastOptimizationError:
      'Restored '+jobs.length+' imported PDF(s) and working file data. Click Calculate layout to create a preview.',replacedObsolete||lastOptimizationError?'error':'success');
    if(replacedObsolete)saveSession('obsolete uncuttable layout removed');
    else if(saved.migratedOptimizerDefaults)saveSession('automatic optimizer defaults upgraded');
    return true;
  }
  var palette = ['#68a1c1','#e2a358','#8cc5af','#c989b4','#90a0cd','#aebf77','#db9b8f','#78baba'];
  function setStatus(msg, type) { var n=$('status'); n.textContent=msg; n.className='status'+(type?' '+type:''); }
  function hostCall(method, payload) {
    return new Promise(function(resolve,reject) {
      if (!isCEP) return reject(Error('Open the panel inside Illustrator (Window > Extensions).'));
      var encoded=encodeURIComponent(JSON.stringify(payload || {}));
      var expression='Bytebase.'+method+'("'+encoded+'")';
      window.__adobe_cep__.evalScript(expression, function(text) {
        if(window.console&&console.info)console.info('[BYTEBASE bridge] response',{method:method,response:text});
        if (!text || text==='EvalScript error.') return reject(Error('Illustrator did not return a response for '+method+'. Check the Illustrator JavaScript console for the ExtendScript exception.'));
        try {
          var result=JSON.parse(text);
          if (result.error) reject(Error(result.error));
          else resolve(result);
        } catch(e) { reject(Error('Invalid response from Illustrator: '+String(text).slice(0,160))); }
      });
    });
  }
  function num(v) { return v === '' || v == null ? NaN : Number(v); }
  function settings() {
    return {sheetW:num($('sheetW').value),sheetH:num($('sheetH').value),edge:num($('edge').value),
      inset:num($('inset').value),rotate:$('rotate').checked};
  }
  function developmentMode(){
    if(!isCEP)return false;
    var query=window.location&&window.location.search||'';
    if(/(?:\?|&)bytebaseDev=1(?:&|$)/.test(query))return true;
    try{return !!(window.localStorage&&window.localStorage.getItem&&
      window.localStorage.getItem('com.bytebase.gangoptimizer.devMode')==='1');}catch(e){return false;}
  }
  function extensionHostPath(){
    var raw=window.__adobe_cep__.getSystemPath('extension');
    if(!raw)throw Error('CEP did not provide the extension folder.');
    try{raw=decodeURIComponent(raw);}catch(e){throw Error('The extension folder path could not be decoded: '+e.message);}
    raw=raw.replace(/\\/g,'/');
    if(/^file:\/\//i.test(raw)){
      raw=raw.slice(7);
      if(/^\/[A-Za-z]:\//.test(raw))raw=raw.slice(1);
    }
    return raw.replace(/\/$/,'')+'/host/host.jsx';
  }
  function reloadUrl(){
    var parts=String(window.location.href).split('#'),url=parts[0],hash=parts.length>1?'#'+parts.slice(1).join('#'):'';
    var split=url.indexOf('?'),base=split<0?url:url.slice(0,split),query=split<0?'':url.slice(split+1);
    var params=query?query.split('&').filter(function(p){return p&&!/^bytebaseReload=/.test(p);}):[];
    params.push('bytebaseReload='+Date.now());
    return base+'?'+params.join('&')+hash;
  }
  function reloadPanel(){
    if(!developmentMode())return;
    var button=$('reloadPanel');
    button.disabled=true;
    if(optimizationWorker)stopOptimization();
    if(!saveSession('before development panel reload')){
      button.disabled=false;setStatus('Reload stopped: the working session could not be saved.','error');return;
    }
    try{
      var path=extensionHostPath(),encoded=encodeURIComponent(path);
      var expression='(function(){try{var f=new File(decodeURIComponent('+JSON.stringify(encoded)+'));'+
        'if(!f.exists)throw Error("host.jsx is missing");$.evalFile(f);'+
        'if(!$.global.Bytebase||typeof $.global.Bytebase.createLayout!=="function"||$.global.Bytebase.__hostBuild!=="single-sheet-v1")throw Error("host.jsx did not refresh the Illustrator-global handler");'+
        'return "BYTEBASE_RELOAD_OK";}catch(e){return "BYTEBASE_RELOAD_ERROR: "+String(e.message||e)+" (line "+(e.line||"?")+")";}})()';
      var completed=false,timer=setTimeout(function(){
        if(completed)return;completed=true;button.disabled=false;
        setStatus('Reload stopped: Illustrator did not answer the JSX reload request. Session data is preserved.','error');
      },10000);
      setStatus('Reloading Illustrator JSX and panel files...');
      logOptimization('development-reload-started',{hostScript:'host/host.jsx'});
      window.__adobe_cep__.evalScript(expression,function(response){
        if(completed)return;completed=true;clearTimeout(timer);
        if(response==='BYTEBASE_RELOAD_OK'){
          logOptimization('development-host-reloaded');
          window.location.replace(reloadUrl());
        }else{
          button.disabled=false;
          var message=response&&response.indexOf('BYTEBASE_RELOAD_ERROR: ')===0?response.slice(21):
            response==='EvalScript error.'?'Illustrator could not evaluate host.jsx.':String(response||'No response from Illustrator.');
          logOptimization('development-reload-failed',{message:message});
          setStatus('Reload stopped: '+message+' Session data is preserved.','error');
        }
      });
    }catch(error){if(typeof timer!=='undefined'&&timer)clearTimeout(timer);button.disabled=false;
      setStatus('Reload stopped: '+error.message+' Session data is preserved.','error');}
  }
  function stopOptimization(workerFinished){
    optimizationToken++;
    if(optimizationTimer){clearTimeout(optimizationTimer);optimizationTimer=null;}
    if(optimizationWorker){var finishedWorker=optimizationWorker;optimizationWorker=null;
      if(workerFinished){finishedWorker.onmessage=null;finishedWorker.onerror=null;finishedWorker.onmessageerror=null;}
      else finishedWorker.terminate();
    }
    if($('optimizationProgress'))$('optimizationProgress').hidden=true;
    if($('optimize')){$('optimize').disabled=false;if(optimizeButtonHTML)$('optimize').innerHTML=optimizeButtonHTML;}
  }
  function invalidate() {
    stopOptimization();
    lastOptimizationError=null;
    storeLastOptimizationError(null);
    latest=null;selectedSheet=0;
    $('layoutType').textContent='Guillotine cutting';
    $('create').disabled=true; $('metricSheets').textContent='–';$('metricCopies').textContent='–';$('metricUsage').textContent='–';
    $('prev').disabled=true;$('next').disabled=true;$('sheetIndex').textContent='– / –';
    if($('sheetSummaries'))$('sheetSummaries').innerHTML='';if($('proposals'))$('proposals').innerHTML='';proposals=[];renderJobs();renderPreview();
    setStatus('Inputs changed. Calculate layout to preview the current orders and settings.');
    saveSession('layout invalidated or inputs changed');
  }
  function renderJobs() {
    $('jobs').innerHTML='';
    $('fileCount').textContent=jobs.length+' PDF'+(jobs.length===1?'':'s');
    $('measure').disabled=jobs.length===0 || demoMode || !isCEP;
    if(!jobs.length)return;
    var planned={};
    if(latest)(latest.jobs||[]).forEach(function(p){planned[p.id]=p;});
    jobs.forEach(function(j){
      var card=document.createElement('article');card.className='job-card';
      var header=document.createElement('div');header.className='job-card-header';
      var file=document.createElement('div');file.className='job-filename';file.textContent=j.fileName;file.title=j.fileName;
      header.appendChild(file);
      var measureState=document.createElement('span');measureState.className='job-state '+(j.measureError?'measure-error':(j.measured?'measured':'manual'));
      measureState.textContent=j.measureError?'check dimensions':(j.measured?'measured':'verify');
      if(j.measureError)measureState.title=j.measureError;header.appendChild(measureState);card.appendChild(header);
      var fields=document.createElement('div');fields.className='job-card-fields';
      var sizeCell=document.createElement('div');sizeCell.className='job-dimensions';
      [['width','W'],['height','H']].forEach(function(pair){
        var field=document.createElement('label');field.textContent=pair[1]+' mm';
        var input=document.createElement('input');input.type='number';input.min='0.1';input.max='1200';input.step='0.1';input.title=pair[0]==='width'?'Artwork width (mm)':'Artwork height (mm)';
        input.value=j[pair[0]]!==null&&isFinite(j[pair[0]])?j[pair[0]]:'';
        input.addEventListener('change',function(){j[pair[0]]=num(input.value);j.measured=false;j.measureError='';invalidate();});
        field.appendChild(input);sizeCell.appendChild(field);
      });fields.appendChild(sizeCell);
      var orderCell=document.createElement('label');orderCell.className='job-order';orderCell.appendChild(document.createTextNode('OrderQ'));
      var orderInput=document.createElement('input'),qstate=document.createElement('span');
      orderInput.type='number';orderInput.min='1';orderInput.max='1000000000';orderInput.step='1';orderInput.value=Number.isInteger(j.orderQ)?j.orderQ:'';orderInput.title='Total ordered transfers (OrderQ)';
      orderInput.addEventListener('change',function(){j.orderQ=num(orderInput.value);j.orderQSource='manual';j.orderQConfirmed=Number.isInteger(j.orderQ)&&j.orderQ>0&&j.orderQ<=1000000000;j.orderQError=j.orderQConfirmed?'':'Enter a positive whole-number OrderQ.';invalidate();});
      orderCell.appendChild(orderInput);qstate.className='job-qstate '+(j.orderQConfirmed?'measured':'measure-error');
      qstate.textContent=j.orderQConfirmed?(j.orderQSource==='parsed'?'from filename':'confirmed'):'confirm quantity';
      if(j.orderQError)qstate.title=j.orderQError;orderCell.appendChild(qstate);fields.appendChild(orderCell);card.appendChild(fields);
      var pp=planned[j.id];
      if(pp){
        var details=document.createElement('details');details.className='job-plan';
        var summary=document.createElement('summary');summary.textContent='Production details · Gang '+
          (pp.sheetIndices&&pp.sheetIndices.length>1?pp.sheetIndices.map(function(index){return index+1;}).join(', '):(pp.sheetIndex+1));details.appendChild(summary);
        var detail=document.createElement('div');detail.className='job-plan-values';
        [[pp.sheetIndices&&pp.sheetIndices.length>1?'Copies / run across sheets':'Copies / sheet',pp.copiesPerSheet],['Printing runs',pp.printingRuns],['Produced',pp.producedQuantity],['Overproduction',pp.overproduction]].forEach(function(pair){
          var item=document.createElement('span');item.textContent=pair[0]+': '+pair[1];detail.appendChild(item);
        });details.appendChild(detail);card.appendChild(details);
      }
      $('jobs').appendChild(card);
    });
  }
  function acceptFiles(res) {
    if(res.cancelled) return;
    demoMode=false;
    jobs=(res.files||[]).map(function(f,i){
      var q=BytebaseProduction.parseOrderQ(f.name),normalized=q.normalizedFilename||BytebaseProduction.normalizeFilename(f.name);
      // Diagnostic for this import path: includes the unabridged bridge value,
      // the display/parser name and result. The filesystem path is intentionally
      // retained byte-for-byte and never passed through filename decoding.
      if(window.console&&console.info)console.info('[BYTEBASE OrderQ import]',{rawFilename:f.name,normalizedFilename:normalized,quantity:q.quantity,status:q.status});
      return {id:String(i+1),rawFileName:f.name,fileName:normalized,filePath:f.path,width:null,height:null,orderQ:q.quantity,orderQSource:q.status,orderQConfirmed:q.status==='parsed',measured:false,orderQError:q.reason||(q.status==='missing'?'OrderQ was not found in the full filename.':'')};
    });
    invalidate();renderJobs();saveSession('PDF folder imported');
    if(!jobs.length) setStatus('No PDF files found in that folder. Only *.pdf is scanned.','error');
    else measureJobs(true);
  }
  function measureJobs(fromImport) {
    if(!jobs.length||demoMode||!isCEP)return;
    $('measure').disabled=true;
    setStatus('Measuring Illustrator placed PDF bounds for '+jobs.length+' file(s)...');
    hostCall('measure', {files:jobs.map(function(j){return {id:j.id,path:j.filePath};})})
      .then(function(res){
        var byId={};(res.measurements||[]).forEach(function(m){byId[m.id]=m;});
        jobs.forEach(function(j){
          var m=byId[j.id];
          if(m&&!m.error&&isFinite(Number(m.width))&&isFinite(Number(m.height))&&Number(m.width)>0&&Number(m.height)>0){
            j.width=Number(m.width);j.height=Number(m.height);j.measured=true;j.measureError='';j.bounds=m.bounds||'';
          } else {j.measured=false;j.measureError=m&&m.error?m.error:'No measurement returned';}
        });
        invalidate();renderJobs();
        var errors=jobs.filter(function(j){return !!j.measureError;});
        saveSession('PDF measurement completed');
        setStatus(errors.length ? 'Measured '+(jobs.length-errors.length)+' PDFs. '+errors.length+' could not be measured; provide verified dimensions manually and check the PDF bounds before creating.' :
          'Measured all PDFs using Illustrator placed bounds. Verify that these match the intended TrimBox/CropBox before optimizing.', errors.length?'error':'success');
      }).catch(function(e){
        jobs.forEach(function(j){j.measured=false;j.measureError=e.message;});
        invalidate();saveSession('PDF measurement failed');setStatus((fromImport?'Files imported, but measurement failed: ':'Measurement failed: ')+e.message+' Provide verified dimensions manually, then remeasure before creating.','error');
      }).finally(function(){$('measure').disabled=jobs.length===0||demoMode||!isCEP;});
  }
  $('chooseFolder').addEventListener('click',function(){
    setStatus('Opening Illustrator folder picker...');
    hostCall('chooseFolder',{}).then(acceptFiles).catch(function(e){setStatus(e.message,'error');});
  });
  $('measure').addEventListener('click',function(){
    measureJobs(false);
  });
  $('demo').addEventListener('click',function(){
    if(sessionKey)sessionKey.clear(sessionStore());
    demoMode=true;
    jobs=[
      {id:'d1',fileName:'DEMO_logo_01_OrderQ = 50.pdf',filePath:'',width:90,height:50,orderQ:50,orderQSource:'parsed',orderQConfirmed:true,measured:false},
      {id:'d2',fileName:'DEMO_logo_02_OrderQ = 100.pdf',filePath:'',width:115,height:80,orderQ:100,orderQSource:'parsed',orderQConfirmed:true,measured:false},
      {id:'d3',fileName:'DEMO_logo_03_OrderQ = 400.pdf',filePath:'',width:60,height:40,orderQ:400,orderQSource:'parsed',orderQConfirmed:true,measured:false}
    ];
    invalidate();renderJobs();setStatus('Demo data loaded. You can test packing, but cannot create a document with fake PDFs.');
  });
  function overproductionLimit(){
    if($('overproductionCap').value==='auto')return window.BytebaseProduction.automaticOverproductionCap(jobs);
    if($('overproductionCap').value!=='custom')return Number($('overproductionCap').value);
    var custom=num($('customOverproduction').value);
    if(!isFinite(custom)||custom<0||custom>1000)throw Error('Enter a custom per-job overproduction cap from 0% to 1000%.');
    return custom;
  }
  function oneSheetAreaBound(config){
    var settings=config.settings,jobs=config.jobs,maxRuns=Infinity;
    jobs.forEach(function(job){maxRuns=Math.min(maxRuns,Math.floor(Number(job.orderQ)*(1+config.maxOverproductionPct/100)+1e-9));});
    maxRuns=Math.max(1,maxRuns);
    var minimumArea=0;
    jobs.forEach(function(job){minimumArea+=Math.ceil(Number(job.orderQ)/maxRuns)*
      (Number(job.width)+2*Number(settings.inset))*(Number(job.height)+2*Number(settings.inset));});
    var availableArea=(Number(settings.sheetW)-2*Number(settings.edge))*(Number(settings.sheetH)-2*Number(settings.edge));
    return {minimumArea:minimumArea,availableArea:availableArea};
  }
  function showProgress(progress){
    $('optimizationProgress').hidden=false;
    var completed=Number(progress.completed)||0,total=Number(progress.total)||0;
    $('progressBar').max=Math.max(1,total);$('progressBar').value=Math.min(completed,total);
    var phase=progress.phase==='packing'?'Packing layouts':progress.phase==='refining'?'Comparing per-sheet run counts':
      progress.phase==='packing-order'?'Reducing leftover gaps':progress.phase==='maxrects-beam'?'Refining placements and filling gaps':progress.phase==='complete'?'Finishing layout':'Preparing search';
    $('progressLabel').textContent=phase+(total?' · '+completed+' / '+total:'');
    setStatus(phase+(total?' ('+completed+'/'+total+')':''));
  }
  function finishOptimization(p,requestId){
    if(requestId!==optimizationToken)return;
    if(!p||!Array.isArray(p.jobs)||!cuttable(p))
      return failOptimization(Error('Optimizer did not return verified guillotine cut sequences for every sheet.'),requestId);
    var viewport=captureScroll();
    var previous={latest:latest,proposals:proposals,selectedSheet:selectedSheet};
    try{
    lastOptimizationError=null;storeLastOptimizationError(null);
    latest=p;selectedSheet=0;proposals=(p.proposals||[]).filter(cuttable);
    $('metricSheets').textContent=p.sheetCount;$('metricCopies').textContent=p.totalCopies;$('metricUsage').textContent=p.areaPct+'%';
    $('create').disabled=demoMode||!isCEP||jobs.some(function(j){return !j.filePath||!isFinite(j.width)||!isFinite(j.height);});
    renderProposals();renderJobs();renderSheetSummaries();renderPreview();
    restoreScroll(viewport);
    saveSession('layout calculation completed');
    logOptimization('result',{stats:p.searchDiagnostics,sheets:p.sheetCount,copies:p.totalCopies,stoppedEarly:!!p.stoppedEarly});
    stopOptimization();
    setStatus('Planned '+p.totalCopies+' placements, '+p.totalProduced+' produced transfers and '+p.totalOverproduction+' overproduction across '+p.sheetCount+' gang sheet(s). '+p.recommendation,'success');
    restoreScroll(viewport);
    }catch(error){latest=previous.latest;proposals=previous.proposals;selectedSheet=previous.selectedSheet;restoreScroll(viewport);throw error;}
  }
  function failOptimization(error,requestId,workerFinished){
    if(requestId!==optimizationToken)return;
    var viewport=captureScroll();
    logOptimization('error',{message:error&&error.message?error.message:String(error),stack:error&&error.stack?error.stack:''});
    stopOptimization(!!workerFinished);restoreScroll(viewport);lastOptimizationError=error&&error.message?error.message:String(error);storeLastOptimizationError(lastOptimizationError);
    setStatus('Calculation failed: '+lastOptimizationError,'error');saveSession('optimization failed; prior layout retained');
    restoreScroll(viewport);
  }
  function startOptimization(){
    var viewport=captureScroll();
    try{
      lastOptimizationError=null;storeLastOptimizationError(null);
      jobs.forEach(function(j){if(!j.orderQConfirmed)throw Error('Confirm a valid OrderQ for '+j.fileName+' before calculating.');});
      var automaticOverproduction=$('overproductionCap').value==='auto';
      var config={settings:settings(),jobs:jobs,mode:$('optimizationMode').value,maxOverproductionPct:overproductionLimit(),automaticOverproduction:automaticOverproduction};
      if(!jobs.length)throw Error('Import at least one PDF before calculating.');
      var areaBound=oneSheetAreaBound(config);
      if(config.maxOverproductionPct>0&&areaBound.minimumArea>areaBound.availableArea+1e-7)
        throw Error('This order cannot fit on one sheet within the current overproduction cap. Even the best-case run-count bound needs at least '+
          Math.round(1000*areaBound.minimumArea/areaBound.availableArea)/10+'% of the available cut-box area. Reduce the required quantities or cut-box sizes, use a larger sheet, or allow more overproduction.');
      stopOptimization();var requestId=++optimizationToken;
      logOptimization('started',{inputJobs:jobs.length,mode:config.mode,settings:config.settings,
        overproductionCap:automaticOverproduction?'auto':config.maxOverproductionPct});
      $('optimize').innerHTML='Cancel calculation';$('optimizationProgress').hidden=false;showProgress({phase:'packing',completed:0,total:0});
      restoreScroll(viewport);
      saveSession('calculation started');
      if(typeof Worker==='undefined')throw Error('Background workers are unavailable in this CEP panel. Calculation was stopped safely.');
      try{
        optimizationWorker=new Worker('optimizer-worker.js'+(window.bytebaseAssetSuffix||''));
        optimizationTimer=setTimeout(function(){if(requestId!==optimizationToken)return;failOptimization(Error('Optimizer exceeded the 15-second safety limit. Reduce the batch or check the debug log.'),requestId);},15000);
        optimizationWorker.onmessage=function(event){
          var message=event.data||{};if(requestId!==optimizationToken)return;
          try{
            if(message.type==='progress'){showProgress(message.progress||{});logOptimization('progress',{progress:message.progress,workerMemory:message.memory});}
            else if(message.type==='diagnostic')logOptimization(message.stage||'worker',{worker:message});
            else if(message.type==='result'){optimizationWorker=null;finishOptimization(message.plan,requestId);}
            else if(message.type==='error'){var failure=Error(message.message||'Optimization failed.');failure.stack=message.stack||failure.stack;failOptimization(failure,requestId,true);}
          }catch(error){failOptimization(error,requestId,!optimizationWorker);}
        };
        optimizationWorker.onerror=function(event){
          if(requestId!==optimizationToken)return;
          optimizationWorker=null;
          failOptimization(Error('Background optimizer failed to load or run: '+(event.message||'unknown worker error')+' (line '+(event.lineno||'?')+').'),requestId,true);
        };
        optimizationWorker.onmessageerror=function(){failOptimization(Error('Background optimizer returned an unreadable message.'),requestId);};
        optimizationWorker.postMessage({config:config});
      }catch(workerError){failOptimization(workerError,requestId);}
    }catch(error){failOptimization(error,optimizationToken);restoreScroll(viewport);}
  }
  $('optimizationMode').addEventListener('change',function(){
    var mode=$('optimizationMode').value,proposal=null;
    proposals.some(function(candidate){if((candidate.modeIds||[]).indexOf(mode)>=0){proposal=candidate;return true;}return false;});
    if(proposal){
      latest=proposal;selectedSheet=0;
      $('metricSheets').textContent=proposal.sheetCount;$('metricCopies').textContent=proposal.totalCopies;$('metricUsage').textContent=proposal.areaPct+'%';
      $('create').disabled=demoMode||!isCEP||jobs.some(function(j){return !j.filePath||!isFinite(j.width)||!isFinite(j.height);});
      renderProposals();renderJobs();renderSheetSummaries();renderPreview();
      setStatus('Selected '+proposal.label+' proposal. '+proposal.reason,'success');
    }
    saveSession('optimization mode changed');
  });
  $('overproductionCap').addEventListener('change',function(){
    $('customOverproduction').hidden=$('overproductionCap').value!=='custom';invalidate();
  });
  $('customOverproduction').addEventListener('change',invalidate);
  ['sheetW','sheetH','edge','inset','rotate'].forEach(function(id){$(id).addEventListener('change',invalidate);});
  optimizeButtonHTML=$('optimize').innerHTML;
  $('optimize').addEventListener('click',function(){
    if(optimizationWorker){logOptimization('cancelled',{reason:'user'});stopOptimization();saveSession('calculation cancelled');setStatus('Calculation cancelled. Imported PDFs and the last valid layout are retained.');}
    else startOptimization();
  });
  function renderSheetSummaries(){
    var root=$('sheetSummaries');root.innerHTML='';$('layoutType').textContent='Guillotine cutting';if(!latest)return;
    latest.sheets.forEach(function(s){
      $('layoutType').textContent='Guillotine · '+s.cuts.length+' cuts';
      var card=document.createElement('div');card.className='sheet-summary';
      var title=document.createElement('strong');title.textContent='Gang sheet '+(s.index+1);card.appendChild(title);
      var stats=document.createElement('div');stats.className='sheet-stats';
      [s.uniqueJobs+' unique jobs',s.totalPlacements+' placements',s.printingRuns+' printing runs',s.cuts.length+' straight cuts',s.areaPct+'% utilization',
        s.producedQuantity+' produced',s.totalOverproduction+' overproduction'].forEach(function(value){var span=document.createElement('span');span.textContent=value;stats.appendChild(span);});
      card.appendChild(stats);
      var names=document.createElement('small');names.className='sheet-job-list';
      names.textContent='Jobs: '+s.jobIds.map(function(id){var j=jobs.find(function(x){return x.id===id;});return j?j.fileName:id;}).join(' · ');
      card.appendChild(names);
      var cutDetails=document.createElement('details');cutDetails.className='cut-sequence';
      var cutTitle=document.createElement('summary');cutTitle.textContent='Guillotine cut order ('+s.cuts.length+')';cutDetails.appendChild(cutTitle);
      var cutList=document.createElement('ol');
      s.cuts.forEach(function(cut){
        var r=cut.region,entry=document.createElement('li'),horizontal=cut.axis==='horizontal';
        entry.textContent=(cut.purpose==='trim'?'Outer trim: ':'Separate: ')+(horizontal?'horizontal y=':'vertical x=')+
          (Math.round(cut.at*10)/10)+' mm; subpiece x '+(Math.round(r.x*10)/10)+'–'+(Math.round((r.x+r.w)*10)/10)+
          ', y '+(Math.round(r.y*10)/10)+'–'+(Math.round((r.y+r.h)*10)/10)+' mm';
        cutList.appendChild(entry);
      });
      cutDetails.appendChild(cutList);card.appendChild(cutDetails);root.appendChild(card);
    });
    if(latest.sheetCount>1){var why=document.createElement('p');why.className='helper plan-explanation';why.textContent=latest.explanation;root.appendChild(why);}
    var priorities=document.createElement('p');priorities.className='helper';priorities.textContent=latest.recommendation;root.appendChild(priorities);
  }
  function renderProposals(){
    var root=$('proposals');root.innerHTML='';if(!proposals.length)return;
    proposals.forEach(function(p){
      var card=document.createElement('article');card.className='proposal-card'+(latest&&latest.id===p.id?' selected':'');
      var button=document.createElement('button');button.type='button';button.className='proposal-choice';
      button.setAttribute('aria-pressed',latest&&latest.id===p.id?'true':'false');
      var title=document.createElement('strong');title.textContent=p.label;button.appendChild(title);
      var metrics=document.createElement('span');metrics.className='proposal-metrics';
      metrics.textContent=p.sheetCount+' sheets · '+p.totalCopies+' placements · '+p.uniqueJobs+' jobs · '+p.areaPct+'% box use';button.appendChild(metrics);
      var quantities=document.createElement('span');quantities.className='proposal-quantities';
      quantities.textContent=p.sheets.map(function(s,i){return 'S'+(i+1)+' '+s.printingRuns+' runs';}).join(' · ')+' · '+p.totalOverproduction+' over';button.appendChild(quantities);
      var reason=document.createElement('small');reason.textContent=p.reason;button.appendChild(reason);
      var algo=document.createElement('small');algo.className='proposal-algorithm';algo.textContent=p.strategyLabel;button.appendChild(algo);
      card.appendChild(button);
      var detailToggle=document.createElement('details');detailToggle.className='proposal-job-details';
      var detailTitle=document.createElement('summary');detailTitle.textContent='Per-job production and overproduction';detailToggle.appendChild(detailTitle);
      var detailList=document.createElement('div');detailList.className='proposal-job-list';
      p.jobs.forEach(function(job){var row=document.createElement('span');row.textContent=job.fileName+': '+job.copiesPerSheet+
        (job.sheetIndices&&job.sheetIndices.length>1?' copies/run across sheets × ':' copies × ')+job.printingRuns+' runs, '+job.overproduction+' over ('+job.overproductionPct+'%)';detailList.appendChild(row);});
      detailToggle.appendChild(detailList);card.appendChild(detailToggle);
      button.addEventListener('click',function(){
        var viewport=captureScroll();
        latest=p;selectedSheet=0;
        $('metricSheets').textContent=p.sheetCount;$('metricCopies').textContent=p.totalCopies;$('metricUsage').textContent=p.areaPct+'%';
        $('create').disabled=demoMode||!isCEP||jobs.some(function(j){return !j.filePath||!isFinite(j.width)||!isFinite(j.height);});
        renderProposals();renderJobs();renderSheetSummaries();renderPreview();
        restoreScroll(viewport);saveSession('optimization proposal selected');setStatus('Selected '+p.label+' proposal. '+p.reason,'success');restoreScroll(viewport);
      });
      root.appendChild(card);
    });
  }
  function renderPreview(){
    var c=$('sheetCanvas');var ctx=c.getContext('2d');
    var physicalWidth=Math.max(290,c.parentNode.clientWidth-26);var scale=window.devicePixelRatio||1;
    var sheetW=latest?latest.settings.sheetW:700,sheetH=latest?latest.settings.sheetH:500;
    var physicalHeight=Math.round(physicalWidth*sheetH/sheetW);
    c.style.height=physicalHeight+'px';c.width=Math.round(physicalWidth*scale);c.height=Math.round(physicalHeight*scale);
    ctx.setTransform(scale,0,0,scale,0,0);
    ctx.clearRect(0,0,physicalWidth,physicalHeight);ctx.fillStyle='#eef1f5';ctx.fillRect(0,0,physicalWidth,physicalHeight);
    var ratio=physicalWidth/sheetW;
    var margin=(latest?latest.settings.edge:20)*ratio;
    ctx.strokeStyle='#b87ad0';ctx.lineWidth=1;ctx.setLineDash([3,2]);
    ctx.strokeRect(margin+.5,margin+.5,physicalWidth-2*margin,physicalHeight-2*margin);ctx.setLineDash([]);
    if(latest){
      var placements=latest.sheets[selectedSheet].placements;
      placements.forEach(function(p){
        var x=p.x*ratio,y=p.y*ratio,w=p.w*ratio,h=p.h*ratio;
        var paletteIndex=(jobs.findIndex(function(j){return j.id===p.id})+palette.length)%palette.length;
        ctx.fillStyle=palette[paletteIndex];ctx.globalAlpha=.65;ctx.fillRect(x,y,w,h);ctx.globalAlpha=1;
        ctx.strokeStyle='#567187';ctx.lineWidth=.7;ctx.strokeRect(x,y,w,h);
        // The inner outline is the same unscaled artwork box placed by JSX.
        var inset=p.inset*ratio;
        ctx.setLineDash([2,2]);ctx.strokeRect(x+inset,y+inset,w-2*inset,h-2*inset);ctx.setLineDash([]);
        if(w>40&&h>21){ctx.fillStyle='#132638';ctx.font='bold 10px Segoe UI,Arial';
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText((p.fileName||'PDF').replace(/\.pdf$/i,'').slice(0,13),x+w/2,y+h/2,w-4);}
      });
      ctx.fillStyle='#e85b57';ctx.globalAlpha=.8;
      (latest.sheets[selectedSheet].cuts||[]).forEach(function(cut){
        var region=cut.region;
        if(cut.axis==='vertical')ctx.fillRect(cut.at*ratio-.5,region.y*ratio,1,region.h*ratio);
        else ctx.fillRect(region.x*ratio,cut.at*ratio-.5,region.w*ratio,1);
      });
      ctx.globalAlpha=1;
    } else {
      ctx.fillStyle='#66798f';ctx.font='11px Segoe UI,Arial';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('Your sheet preview appears here',physicalWidth/2,physicalHeight/2);
    }
    $('sheetIndex').textContent=latest?(selectedSheet+1)+' / '+latest.sheetCount:'– / –';
    $('prev').disabled=!latest||selectedSheet===0;$('next').disabled=!latest||selectedSheet===latest.sheetCount-1;
  }
  $('prev').addEventListener('click',function(){if(latest&&selectedSheet>0){selectedSheet--;renderPreview();saveSession('preview sheet changed');}});
  $('next').addEventListener('click',function(){if(latest&&selectedSheet<latest.sheetCount-1){selectedSheet++;renderPreview();saveSession('preview sheet changed');}});
  $('create').addEventListener('click',function(){
    if(!latest||demoMode) return;
    if(!cuttable(latest)){
      setStatus('Recalculate first: Illustrator requires a verified guillotine cut sequence on every sheet. Imported PDFs remain loaded.','error');return;
    }
    if(!window.confirm('Create a WORKING layout in Illustrator?\n\nThis is not production-ready: no separation/RIP validation has been done.\nSource PDF files will remain linked and untouched.')) return;
    saveSession('before Illustrator document creation');
    if(window.console&&console.info)console.info('[BYTEBASE generation] starting',{jobs:jobs.length,sheets:latest.sheetCount,placements:latest.totalCopies});
    $('create').disabled=true;setStatus('Creating working layout. Illustrator may be busy...');
    hostCall('createLayout',{layout:latest}).then(function(res){
      if(window.console&&console.info)console.info('[BYTEBASE generation] completed',res);
      setStatus('Created and verified '+res.verified+'/'+res.placed+' linked PDF placements across '+res.sheets+' artboard(s). Check visual bounds and save the working AI file. NOT RIP-ready.','success');
    }).catch(function(e){if(window.console&&console.error)console.error('[BYTEBASE generation] failed; session retained',e);saveSession('Illustrator generation failed');setStatus('Layout generation failed: '+e.message,'error');}).finally(function(){$('create').disabled=false;saveSession('Illustrator generation callback completed');});
  });
  var reloadButton=$('reloadPanel');
  if(reloadButton){reloadButton.hidden=!developmentMode();if(!reloadButton.hidden)reloadButton.addEventListener('click',reloadPanel);}
  $('customOverproduction').hidden=true;
  window.addEventListener('resize',renderPreview);
  if(!isCEP) setStatus('Browser preview mode. Open inside Illustrator for folder selection, measurement and layout creation.');
  if(window.console&&console.info)console.info('[BYTEBASE lifecycle] panel initialized',{isCEP:isCEP,readyState:document.readyState});
  if(!restoreSession())renderPreview();
  window.addEventListener('error',function(event){logOptimization('panel-exception',{message:event.message||'Unknown JavaScript error',stack:event.error&&event.error.stack?event.error.stack:'',file:event.filename,line:event.lineno});});
  window.addEventListener('unhandledrejection',function(event){var reason=event.reason;logOptimization('unhandled-rejection',{message:reason&&reason.message?reason.message:String(reason),stack:reason&&reason.stack?reason.stack:''});});
  window.addEventListener('beforeunload',function(){saveSession('panel unloading');});
}());
