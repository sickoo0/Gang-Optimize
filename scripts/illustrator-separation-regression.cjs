// Runs the five-spot legend through the live CEP panel, then saves, reopens,
// and inspects the real Illustrator vector artwork and linked source PDF.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts/illustrator-separations');
const productionCheck=path.join(root,'scripts/illustrator-production-check.cjs');
const sourcePDF=path.join(root,'artifacts/illustrator-production/fixture.pdf');
const sourceBefore=path.join(dir,'fixture-before.pdf'),savedAI=path.join(dir,'frame-legend-separation-reopen.ai');
const reportFile=path.join(dir,'report.json'),jsxFile=path.join(dir,'validate-reopened.jsx'),imageFile=path.join(dir,'reopened-composite.png');
const port=Number(process.env.CEP_DEBUG_PORT||8088),expectedText='1/5 280c  2/5 485c  3/5 7416c  4/5 hvid  5/5 lim';
fs.mkdirSync(dir,{recursive:true});
for(const artifact of [savedAI,reportFile,jsxFile,imageFile,sourceBefore])fs.rmSync(artifact,{force:true});
const report={passed:false,checks:[],panel:{},artifacts:{sourcePDF,savedAI,imageFile}};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baseline=cp.spawnSync(process.execPath,[productionCheck],{cwd:root,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});
if(baseline.error)throw baseline.error;
assert.equal(baseline.status,0,baseline.stderr||baseline.stdout);
assert.ok(fs.existsSync(sourcePDF),'Illustrator did not produce the five-spot source fixture');
fs.copyFileSync(sourcePDF,sourceBefore);

let browser,page,sessionKey,originalSession;
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
async function run(){
async function getPanel(){
  const contexts=browser.contexts();
  for(const context of contexts)for(const candidate of context.pages())if(/Gang Optimizer/i.test(await candidate.title().catch(()=>'')))return candidate;
  return null;
}
async function restorePanelSession(){
  if(sessionKey&&originalSession!==null){
    if(page&&!page.isClosed()){
      await page.evaluate(({key,value})=>{window.addEventListener('beforeunload',e=>e.stopImmediatePropagation(),true);localStorage.setItem(key,value);},{key:sessionKey,value:originalSession}).catch(()=>{});
      await page.reload({waitUntil:'domcontentloaded',timeout:15000}).catch(()=>{});
    }
  }
}
try{
  const endpoint=await fetch(`http://127.0.0.1:${port}/json`);
  if(!endpoint.ok)throw Error(`CEP debug endpoint returned HTTP ${endpoint.status}`);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:5000,isLocal:true,noDefaults:true});
  page=await getPanel();if(!page)throw Error('Live BYTEBASE CEP panel was not found');
  sessionKey='com.bytebase.gangoptimizer.session.v1';
  originalSession=await page.evaluate(key=>localStorage.getItem(key),sessionKey);
  assert.ok(originalSession,'Original CEP working session was not found in panel storage');
  const session={version:4,savedAt:new Date().toISOString(),jobs:[{
    id:'separation-fixture',rawFileName:'MASCOT frame legend_OrderQ = 1.pdf',fileName:'MASCOT frame legend_OrderQ = 1.pdf',
    filePath:sourcePDF,width:50,height:30,orderQ:1,orderQSource:'manual',orderQConfirmed:true,orderQError:'',
    measured:true,measureError:''
  }],latest:null,productionSetup:null,proposals:[],selectedSheet:0,demoMode:false,
    settings:{sheetW:700,sheetH:500,edge:20,inset:0,rotate:true},scrollTop:0,appScrollTop:0,
    optimizationMode:'overproduction',overproductionCap:'auto',customOverproduction:'0',lastOptimizationError:null};
  await page.evaluate(({key,value})=>{window.addEventListener('beforeunload',e=>e.stopImmediatePropagation(),true);localStorage.setItem(key,value);},{key:sessionKey,value:JSON.stringify(session)});
  await page.reload({waitUntil:'domcontentloaded',timeout:20000}).catch(()=>{});
  page=await getPanel();if(!page)throw Error('CEP panel did not return after loading the regression session');
  await page.waitForFunction(()=>!!document.querySelector('#productionProfile'),null,{timeout:15000});
  await page.evaluate(()=>{
    const profile=document.querySelector('#productionProfile');profile.value='mascot';profile.dispatchEvent(new Event('change',{bubbles:true}));
    const list=document.querySelector('#inkNames');list.value='280c\n485c\n7416c\nWhite-BG\nLim';list.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#applyInkNames').click();
    const verified=document.querySelector('#verifyInks');verified.checked=true;verified.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const panelLegend=(await page.evaluate(()=>document.querySelector('#frameLegend').textContent)).trim();
  assert.equal(panelLegend,expectedText,'CEP panel must derive the correct PANTONE 7416 C display name');
  await page.evaluate(()=>document.querySelector('#optimize').click());
  await page.waitForFunction(()=>/^Planned |^Calculation failed:/.test(document.querySelector('#status')?.textContent||''),null,{timeout:30000});
  const calcStatus=(await page.evaluate(()=>document.querySelector('#status').textContent)).trim();
  assert.match(calcStatus,/^Planned /,calcStatus);
  assert.equal(await page.evaluate(()=>document.querySelector('#create').disabled),false,'Create working Illustrator layout should be enabled');
  await page.evaluate(()=>document.querySelector('#create').click());
  await page.waitForFunction(()=>/^(Created and verified |Layout generation failed:|Verify the ink list)/.test(document.querySelector('#status')?.textContent||''),null,{timeout:90000});
  const createStatus=(await page.evaluate(()=>document.querySelector('#status').textContent)).trim();
  assert.match(createStatus,/^Created and verified 1\/1 linked PDF placements across 1 artboard/,createStatus);
  report.panel={legend:panelLegend,calculation:calcStatus,creation:createStatus,sourceName:'PANTONE 7416 C',sourcePath:sourcePDF};
  report.checks.push('live CEP panel calculated the fixture and created one linked Illustrator placement');
  report.checks.push('live CEP panel displayed 7416c for the source spot PANTONE 7416 C');

  const jsx=String.raw`#target illustrator
(function(){
  $.evalFile(File(${JSON.stringify(path.join(root,'host/host.jsx'))}));
  var doc=app.activeDocument,priorDocs=[],fixture=File(${JSON.stringify(sourcePDF)}),target=File(${JSON.stringify(savedAI)}),out=File(${JSON.stringify(reportFile)}),capture=File(${JSON.stringify(imageFile)}),report={passed:false,checks:[]},interaction=app.userInteractionLevel,expectedText='1/5 280c  2/5 485c  3/5 7416c  4/5 hvid  5/5 lim';
  for(var documentIndex=0;documentIndex<app.documents.length;documentIndex++)if(app.documents[documentIndex]!==doc)priorDocs.push(app.documents[documentIndex]);
  function json(v){if(v===null||typeof v==='undefined')return 'null';if(typeof v==='string')return '"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';if(typeof v==='number'||typeof v==='boolean')return String(v);if(v instanceof Array){var a=[];for(var i=0;i<v.length;i++)a.push(json(v[i]));return '['+a.join(',')+']';}var o=[];for(var k in v)if(v.hasOwnProperty(k))o.push(json(k)+':'+json(v[k]));return '{'+o.join(',')+'}';}
  function check(ok,message){if(!ok)throw Error(message);report.checks.push(message);}
  function layer(name){return doc.layers.getByName('BYTEBASE - '+name);}
  function request(method,layout,production){return BytebaseJSONRead(Bytebase[method](encodeURIComponent(json({layout:layout,production:production}))));}
  function boundsByInk(node,boxes){if(node.typename==='PathItem'){if(node.filled){var c=node.fillColor;if(c.typename!=='SpotColor'||Math.abs(c.tint-100)>0.001)throw Error('A frame legend path is not a 100% SpotColor');var b=node.visibleBounds,r=boxes[c.spot.name];if(!r)r=boxes[c.spot.name]={left:b[0],right:b[2],top:b[1],bottom:b[3]};else{r.left=Math.min(r.left,b[0]);r.right=Math.max(r.right,b[2]);r.top=Math.max(r.top,b[1]);r.bottom=Math.min(r.bottom,b[3]);}}return;}
    if(node.typename==='GroupItem')for(var i=0;i<node.pageItems.length;i++)boundsByInk(node.pageItems[i],boxes);else if(node.typename==='CompoundPathItem')for(var j=0;j<node.pathItems.length;j++)boundsByInk(node.pathItems[j],boxes);}
  function verifyLegend(names){var boxes={};boundsByInk(layer('FRAME TEXT').groupItems[0],boxes);var expect={},prior=null;for(var i=0;i<names.length;i++){var name=names[i],b=boxes[name];expect['$'+name]=true;if(!b)throw Error('No outlined text on '+name);if(prior&&b.left<prior.right-0.01)throw Error('Legend ranges overlap or are out of order at '+name);prior=b;}for(var k in boxes)if(boxes.hasOwnProperty(k)&&!expect['$'+k])throw Error('Unexpected legend ink '+k);return boxes;}
  function verifyProduction(expectedOrder,expectedText){var group=layer('FRAME TEXT').groupItems[0],names=expectedOrder,used={},sequence=[],meta=BytebaseJSONRead(layer('REGISTRATION MARKS').groupItems[0].note);
    for(var i=0;i<meta.sequence.length;i++)sequence.push(meta.sequence[i].name);check(sequence.join('|')===names.join('|'),'source spot identities remain in expected sequence');
    var requestData=meta.production,model=BytebaseSetup.compose(requestData.profile,requestData.inks,BytebaseJSONRead(meta.layout),requestData.options);check(model.label.text===expectedText,'displayed legend text agrees with actual named source inks');
    function walk(item){if(item.typename==='PathItem'){if(item.filled){var c=item.fillColor;if(c.typename!=='SpotColor'||Math.abs(c.tint-100)>0.001)throw Error('Process color or partial tint on frame text');used[c.spot.name]=true;}if(item.stroked){var s=item.strokeColor;if(s.typename!=='SpotColor'||Math.abs(s.tint-100)>0.001)throw Error('Process stroke on frame text');used[item.strokeColor.spot.name]=true;}return;}
      if(item.typename==='GroupItem')for(var j=0;j<item.pageItems.length;j++)walk(item.pageItems[j]);else if(item.typename==='CompoundPathItem')for(var q=0;q<item.pathItems.length;q++)walk(item.pathItems[q]);}
    walk(group);var boxes=verifyLegend(names);for(i=0;i<names.length;i++)check(!!used[names[i]],'frame segment remains isolated on '+names[i]);
    check(Object.keys?Object.keys(used).length===names.length:(function(){var n=0;for(var k in used)if(used.hasOwnProperty(k))n++;return n===names.length;})(),'frame text contains exactly the five expected spot inks');
    return {meta:meta,boxes:boxes,used:used};
  }
  function verifyMarks(names){var group=layer('REGISTRATION MARKS').groupItems[0],reference={},counts={};
    function contains(values,target){for(var x=0;x<values.length;x++)if(values[x]===target)return true;return false;}
    for(var i=0;i<group.pathItems.length;i++){var item=group.pathItems[i],parts=item.name.split(' / '),ink=parts[parts.length-1];if(!contains(names,ink))continue;
      var key=parts.slice(0,parts.length-1).join(' / '),points=[];for(var j=0;j<item.pathPoints.length;j++){var p=item.pathPoints[j];points.push([p.anchor[0],p.anchor[1],p.leftDirection[0],p.leftDirection[1],p.rightDirection[0],p.rightDirection[1]]);}var signature=json(points);
      if(!reference[key])reference[key]=signature;else check(reference[key]===signature,'registration mark '+key+' has identical coordinates on '+ink);counts[ink]=(counts[ink]||0)+1;}
    for(i=0;i<names.length;i++)check(counts[names[i]]>0,'registration marks are present on '+names[i]);
  }
  try{
    app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
    check(doc.placedItems.length===1&&doc.placedItems[0].file.fsName.toLowerCase()===fixture.fsName.toLowerCase(),'actual CEP output links the untouched five-spot source PDF');
    var originalFingerprint=BytebaseProductionArtwork.fingerprint(layer('LINKED PDF ARTWORK'),json);
    var names=['PANTONE 280 C','PANTONE 485 C','PANTONE 7416 C','White-BG','Lim'],standard=verifyProduction(names,'1/5 280c  2/5 485c  3/5 7416c  4/5 hvid  5/5 lim');
    report.legendInkBounds=standard.boxes;report.usedTextInks=standard.used;
    verifyMarks(names);
    var reorder={profile:standard.meta.production.profile,inks:['485c','280c','7416c','White-BG','Lim'],options:standard.meta.production.options};
    var reordered=request('updateProduction',BytebaseJSONRead(standard.meta.layout),reorder),reorderedNames=['PANTONE 485 C','PANTONE 280 C','PANTONE 7416 C','White-BG','Lim'];
    check(!reordered.error&&reordered.text==='1/5 485c  2/5 280c  3/5 7416c  4/5 hvid  5/5 lim','reordering updates every frame number without renaming spots');
    var changed=verifyProduction(reorderedNames,reordered.text);verifyMarks(reorderedNames);
    reorder.inks=['280c','485c','7416c','White-BG','Lim'];var restored=request('updateProduction',BytebaseJSONRead(standard.meta.layout),reorder);
    check(!restored.error&&restored.text==='1/5 280c  2/5 485c  3/5 7416c  4/5 hvid  5/5 lim','original order restored after the reorder check');
    var extra=doc.spots.add(),extraColor=new CMYKColor();extra.name='PANTONE 123 C';extra.colorType=ColorModel.SPOT;extraColor.cyan=extraColor.magenta=extraColor.yellow=0;extraColor.black=100;extra.color=extraColor;
    var extraResult=request('updateProduction',BytebaseJSONRead(standard.meta.layout),reorder);
    check(!extraResult.error&&extraResult.sequence.length===5&&extraResult.text===expectedText,'unused document swatch does not create a production frame');
    var finalNames=names,finalCheck=verifyProduction(finalNames,expectedText);verifyMarks(finalNames);
    check(!finalCheck.used['PANTONE 123 C'],'unused spot is absent from frame legend output');
    check(originalFingerprint===BytebaseProductionArtwork.fingerprint(layer('LINKED PDF ARTWORK'),json),'linked artwork and transforms remain unchanged through panel creation and updates');
    doc.saveAs(target,new IllustratorSaveOptions());check(target.exists,'working sheet saved as a separate AI test artifact');
    doc.close(SaveOptions.DONOTSAVECHANGES);doc=app.open(target);check(doc.placedItems.length===1&&doc.placedItems[0].file.fsName.toLowerCase()===fixture.fsName.toLowerCase(),'saved and reopened AI retains the linked source PDF');
    var reopened=verifyProduction(finalNames,expectedText);verifyMarks(finalNames);check(!reopened.used['PANTONE 123 C'],'reopened vector outlines still exclude the unused swatch');
    check(doc.spots.getByName('PANTONE 123 C').colorType===ColorModel.SPOT,'the extra unused document swatch survives the save/reopen test without becoming artwork');
    var board=doc.artboards[0].artboardRect,shot=new ImageCaptureOptions();shot.resolution=72;shot.antiAliasing=true;doc.imageCapture(capture,board,shot);
    report.savedAI=target.fsName;report.legendInkBoundsAfterReopen=reopened.boxes;report.passed=true;
  }catch(e){report.error=String(e)+' (line '+e.line+')';}
  finally{try{if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);}catch(closeError){}for(var priorIndex=0;priorIndex<priorDocs.length;priorIndex++)try{priorDocs[priorIndex].activate();break;}catch(activateError){}app.userInteractionLevel=interaction;out.encoding='UTF-8';out.open('w');out.write(json(report));out.close();}
  return report.passed?'PASS':'FAIL: '+report.error;
}());`;
  fs.writeFileSync(jsxFile,jsx);
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  const command=cp.spawnSync('powershell',['-NoProfile','-Command',`$ai=New-Object -ComObject Illustrator.Application; $ai.DoJavaScriptFile(${quote(jsxFile)})`],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
  if(command.error)throw command.error;
  assert.equal(command.status,0,command.stderr||command.stdout);
  const result=JSON.parse(fs.readFileSync(reportFile,'utf8').replace(/^\uFEFF/,''));
  assert.equal(result.passed,true,result.error);
  report.illustrator=result;
  report.sourcePDFUnchanged=sha256(sourcePDF)===sha256(sourceBefore);
  assert.equal(report.sourcePDFUnchanged,true,'source fixture PDF changed during panel generation');
  report.checks.push('source PDF SHA-256 is unchanged after actual CEP and Illustrator operations');
}catch(error){
  report.error=String(error&&error.stack||error);report.passed=false;
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
  throw error;
}finally{
  await restorePanelSession();
  if(browser)await browser.close().catch(()=>{});
}

report.passed=true;fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
}
run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
