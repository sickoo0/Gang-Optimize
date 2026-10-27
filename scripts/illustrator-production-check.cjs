// Executes in the real Illustrator via COM. Only generated fixtures/new unsaved documents are touched.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts/illustrator-production');fs.mkdirSync(dir,{recursive:true});
const S=require('../shared/production-setup'),P=require('../client/production');
const input={settings:{sheetW:700,sheetH:500,edge:20,inset:0,rotate:true},mode:'overproduction',maxOverproductionPct:0,jobs:[{id:'1',fileName:'fixture.pdf',filePath:path.join(dir,'fixture.pdf'),width:50,height:30,orderQ:2,orderQConfirmed:true}]};
const plan=P.planProduction(input),production={profile:S.defaults()[0],inks:['280c','485c','7416c','White-BG','Lim'],options:{verified:true,frame:0}};
const output=path.join(dir,'report.json'),script=path.join(dir,'check.jsx'),reopenScript=path.join(dir,'reopen-check.jsx'),reopenOutput=path.join(dir,'reopen-report.json'),savedAI=path.join(dir,'frame-legend-separation-reopen.ai');
for(const artifact of [output,script,reopenScript,reopenOutput,savedAI,path.join(dir,'reopened-composite.png')])fs.rmSync(artifact,{force:true});
const jsx=String.raw`#target illustrator
(function(){
  $.evalFile(File(${JSON.stringify(path.join(root,'host/host.jsx'))}));
  var plan=${JSON.stringify(plan)},production=${JSON.stringify(production)},fixture=File(${JSON.stringify(input.jobs[0].filePath)}),report={passed:false,checks:[]},doc=null,original=app.documents.length?app.activeDocument:null,interaction=app.userInteractionLevel;
  function pt(mm){return mm*72/25.4;}
  function json(v){if(v===null||typeof v==='undefined')return 'null';if(typeof v==='string')return '"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';if(typeof v==='number'||typeof v==='boolean')return String(v);if(v instanceof Array){var a=[];for(var i=0;i<v.length;i++)a.push(json(v[i]));return '['+a.join(',')+']';}var o=[];for(var k in v)if(v.hasOwnProperty(k))o.push(json(k)+':'+json(v[k]));return '{'+o.join(',')+'}';}
  function check(ok,message){if(!ok)throw Error(message);report.checks.push(message);}
  function invoke(method){return BytebaseJSONRead(Bytebase[method](encodeURIComponent(json({layout:plan,production:production}))));}
  function layer(name){return doc.layers.getByName('BYTEBASE - '+name);}
  function findSpot(name){for(var i=0;i<doc.spots.length;i++)if(doc.spots[i].name===name)return doc.spots[i];return null;}
  function inkBounds(node,result){if(node.typename==='PathItem'){if(node.filled){var c=node.fillColor,b=node.visibleBounds;if(c.typename!=='SpotColor'||Math.abs(c.tint-100)>0.001)throw Error('Frame legend contains a process or partial-tint path');var r=result[c.spot.name];if(!r)r=result[c.spot.name]={left:b[0],right:b[2],top:b[1],bottom:b[3]};else{r.left=Math.min(r.left,b[0]);r.right=Math.max(r.right,b[2]);r.top=Math.max(r.top,b[1]);r.bottom=Math.min(r.bottom,b[3]);}}return;}
    if(node.typename==='GroupItem')for(var i=0;i<node.pageItems.length;i++)inkBounds(node.pageItems[i],result);else if(node.typename==='CompoundPathItem')for(var j=0;j<node.pathItems.length;j++)inkBounds(node.pathItems[j],result);}
  function verifyInkRanges(group,names){var boxes={},expected={};inkBounds(group,boxes);var prior=null;for(var i=0;i<names.length;i++){var name=names[i],box=boxes[name];expected['$'+name]=true;if(!box)throw Error('No legend geometry for '+name);if(prior&&box.left<prior.right-0.01)throw Error('Legend ink ranges overlap or appear out of order at '+name);prior=box;}for(var k in boxes)if(boxes.hasOwnProperty(k)&&!expected['$'+k])throw Error('Unexpected legend ink '+k);return boxes;}
  try{
    app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
    doc=app.documents.add(DocumentColorSpace.CMYK,pt(50),pt(30));doc.artboards[0].artboardRect=[0,pt(30),pt(50),0];
    var sourceInks=[['PANTONE 280 C','CMYK',[100,90,0,20]],['PANTONE 485 C','CMYK',[0,95,95,0]],['PANTONE 7416 C','CMYK',[0,70,80,20]],['White-BG','CMYK',[0,0,0,0]],['Lim','RGB',[255,255,127]]];
    for(var fi=0;fi<sourceInks.length;fi++){try{var def=sourceInks[fi],spot=doc.spots.add(),c;
      if(def[1]==='RGB'){c=new RGBColor();c.red=def[2][0];c.green=def[2][1];c.blue=def[2][2];}
      else{c=new CMYKColor();c.cyan=def[2][0];c.magenta=def[2][1];c.yellow=def[2][2];c.black=def[2][3];}
      spot.name=def[0];spot.colorType=ColorModel.SPOT;spot.color=c;
      var patch=doc.pathItems.rectangle(pt(25),pt(fi*10),pt(10),pt(10)),inkFill=new SpotColor();inkFill.spot=spot;inkFill.tint=100;patch.stroked=false;patch.filled=true;patch.fillColor=inkFill;}catch(inner){throw Error('fixture spot '+fi+' '+def[0]+': '+inner+' line '+inner.line);}}
    var opts=new PDFSaveOptions();opts.preserveEditability=false;opts.viewAfterSaving=false;doc.saveAs(fixture,opts);doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;
    // Save a byte-for-byte baseline before any plugin operations.
    fixture.copy(${JSON.stringify(path.join(dir,'fixture-before.pdf'))});
    var count=app.documents.length,result=invoke('createLayout');if(result.error)throw Error(result.error);doc=app.activeDocument;
    check(app.documents.length===count+1,'one new working document');check(doc.placedItems.length===plan.totalCopies,'all original linked placements');
    check(result.production.text==='1/5 280c  2/5 485c  3/5 7416c  4/5 hvid  5/5 lim','exact five-ink legend in real Illustrator with source Pantone number preserved');
    var white=doc.spots.getByName('White-BG'),lim=doc.spots.getByName('Lim');
    check(white.colorType===ColorModel.SPOT&&white.spotKind===SpotColorKind.SPOTCMYK&&white.color.cyan===0&&white.color.magenta===0&&white.color.yellow===0&&white.color.black===0,'White-BG keeps its imported CMYK 0/0/0/0 alternate');
    check(lim.colorType===ColorModel.SPOT&&lim.spotKind===SpotColorKind.SPOTRGB&&lim.color.typename==='CMYKColor','Lim remains an imported RGB-kind Spot Color; Illustrator exposes its color property as CMYK');
    var whiteBefore=json(BytebaseSpotInks.describe(white)),limBefore=json(BytebaseSpotInks.describe(lim));
    function verifySpotArt(node,used){if(node.typename==='PathItem'){if(node.filled){var f=node.fillColor;if(f.typename!=='SpotColor'||Math.abs(f.tint-100)>0.001)throw Error('Process color or partial tint in production art');used[f.spot.name]=true;}if(node.stroked){var s=node.strokeColor;if(s.typename!=='SpotColor'||Math.abs(s.tint-100)>0.001)throw Error('Process stroke in production art');used[s.spot.name]=true;}return;}
      if(node.typename==='GroupItem')for(var vi=0;vi<node.pageItems.length;vi++)verifySpotArt(node.pageItems[vi],used);else if(node.typename==='CompoundPathItem')for(var vi=0;vi<node.pathItems.length;vi++)verifySpotArt(node.pathItems[vi],used);}
    var usedText={},usedMarks={};verifySpotArt(layer('FRAME TEXT').groupItems[0],usedText);verifySpotArt(layer('REGISTRATION MARKS').groupItems[0],usedMarks);
    for(var si=0;si<sourceInks.length;si++){check(usedText[sourceInks[si][0]],'legend has 100% matching source spot '+sourceInks[si][0]);check(usedMarks[sourceInks[si][0]],'registration marks have 100% matching source spot '+sourceInks[si][0]);}
    var expectedInkNames=[];for(si=0;si<sourceInks.length;si++)expectedInkNames.push(sourceInks[si][0]);var legendBounds=verifyInkRanges(layer('FRAME TEXT').groupItems[0],expectedInkNames);
    check(true,'each outlined legend segment occupies its own non-overlapping source-spot range');report.legendInkBounds=legendBounds;
    check(json(BytebaseSpotInks.describe(white))===whiteBefore&&json(BytebaseSpotInks.describe(lim))===limBefore,'MASCOT generation leaves imported White-BG and Lim Spot definitions unchanged');
    function countKeys(o){var n=0;for(var k in o)if(o.hasOwnProperty(k))n++;return n;}check(countKeys(usedText)===sourceInks.length&&countKeys(usedMarks)===sourceInks.length,'generated production layers introduce no process colors or extra ink names');
    check(layer('PRINT GUIDES').printable===false,'guides are nonprinting');check(layer('REGISTRATION MARKS').printable&&layer('FRAME TEXT').printable,'production layers are printable');
    var board=doc.artboards[0].artboardRect,g=BytebaseSetup.geometry(production.profile),maxError=0;
    var marks=layer('REGISTRATION MARKS').groupItems[0];
    for(var mi=0;mi<g.marks.length;mi++)for(var pi=0;pi<g.marks[mi].paths.length;pi++){
      var expected=g.marks[mi].paths[pi],actual=marks.pathItems.getByName(g.marks[mi].id+' / '+pi+' / PANTONE 280 C');
      for(var vi=0;vi<expected.vertices.length;vi++){var point=expected.vertices[vi].a,b=actual.pathPoints[vi].anchor;maxError=Math.max(maxError,Math.abs(b[0]-board[0]-pt(point[0])),Math.abs(b[1]-board[1]+pt(point[1])));}
      for(si=1;si<sourceInks.length;si++){var other=marks.pathItems.getByName(g.marks[mi].id+' / '+pi+' / '+sourceInks[si][0]);for(vi=0;vi<expected.vertices.length;vi++){
        var basePoint=actual.pathPoints[vi],otherPoint=other.pathPoints[vi];maxError=Math.max(maxError,Math.abs(basePoint.anchor[0]-otherPoint.anchor[0]),Math.abs(basePoint.anchor[1]-otherPoint.anchor[1]),Math.abs(basePoint.leftDirection[0]-otherPoint.leftDirection[0]),Math.abs(basePoint.leftDirection[1]-otherPoint.leftDirection[1]),Math.abs(basePoint.rightDirection[0]-otherPoint.rightDirection[0]),Math.abs(basePoint.rightDirection[1]-otherPoint.rightDirection[1]));}}
    }
    check(maxError<0.01,'all five spot-colored registration-mark sets use identical coordinates');report.maximumMarkErrorPt=maxError;report.textBounds=result.production.textBounds;
    var capture=new ImageCaptureOptions();capture.resolution=72;capture.antiAliasing=true;doc.imageCapture(File(${JSON.stringify(path.join(dir,'working-sheet.png'))}),board,capture);
    var source=BytebaseProductionArtwork.fingerprint(layer('LINKED PDF ARTWORK'),json),markSignature=BytebaseProductionArtwork.fingerprint(layer('REGISTRATION MARKS'),json),itemCount=doc.pageItems.length;
    result=invoke('updateProduction');check(!result.error,'repeat update succeeds: '+(result.error||'OK'));check(doc.pageItems.length===itemCount,'repeat generation does not duplicate objects');check(source===BytebaseProductionArtwork.fingerprint(layer('LINKED PDF ARTWORK'),json),'linked artwork bounds and transforms unchanged');check(markSignature===BytebaseProductionArtwork.fingerprint(layer('REGISTRATION MARKS'),json),'repeated marks have identical geometry');
    result=invoke('updateProduction');check(!result.error&&json(BytebaseSpotInks.describe(white))===whiteBefore&&json(BytebaseSpotInks.describe(lim))===limBefore,'repeated updates preserve both imported special Spot definitions');
    production.inks=['485c','280c','7416c','White-BG','Lim'];result=invoke('updateProduction');check(!result.error&&result.text==='1/5 485c  2/5 280c  3/5 7416c  4/5 hvid  5/5 lim','ink reordering renumbers every legend segment');
    var reorderedNames=[];for(si=0;si<result.sequence.length;si++)reorderedNames.push(result.sequence[si].name);check(reorderedNames.join('|')==='PANTONE 485 C|PANTONE 280 C|PANTONE 7416 C|White-BG|Lim','reordering retains each source Spot Color identity');
    verifyInkRanges(layer('FRAME TEXT').groupItems[0],reorderedNames);production.inks=['280c','485c','7416c','White-BG','Lim'];result=invoke('updateProduction');check(!result.error&&result.text==='1/5 280c  2/5 485c  3/5 7416c  4/5 hvid  5/5 lim','canonical five-spot legend restored after reorder');
    production.profile.text.mode='current';production.options.frame=4;result=invoke('updateProduction');check(!result.error&&result.text==='5/5 lim','current-frame mode includes Lim');
    production.profile.text.align='center';result=invoke('updateProduction');check(!result.error&&Math.abs(result.textBounds.x-(20+(660-result.textBounds.w)/2))<0.001,'center alignment matches reserved area');production.profile.text.align='left';
    production.profile.text.rotation=90;production.profile.text.width=80;production.profile.text.y=-100;result=invoke('updateProduction');check(!result.error&&result.textBounds.h>result.textBounds.w,'vertical text is outlined without scaling');production.profile.text.rotation=0;production.profile.text.width=660;production.profile.text.y=-15;
    production.profile.assets.test='<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="black" stroke-width="0.2"/></svg>';
    production.profile.marks[0].type='svg';production.profile.marks[0].asset='test';production.profile.marks[0].rotation=30;result=invoke('updateProduction');check(!result.error,'validated SVG mark is generated as rotated vector geometry');
    production.profile.text.font='BYTEBASE-Nonexistent-Font';var before=doc.pageItems.length;result=invoke('updateProduction');check(!!result.error&&doc.pageItems.length===before,'missing font fails without changing existing sheet');production.profile.text.font='ArialMT';
    production.profile.text.width=1;result=invoke('updateProduction');check(!!result.error&&doc.pageItems.length===before,'overflow fails and staging layers are removed');production.profile.text.width=660;
    production.profile=BytebaseSetup.defaults()[0];production.inks=['280c','485c','7416c','White-BG','Lim'];production.options={verified:true,frame:0};result=invoke('updateProduction');check(!result.error&&result.text==='1/5 280c  2/5 485c  3/5 7416c  4/5 hvid  5/5 lim','canonical MASCOT profile and full legend restored before save/reopen validation');
    var unused=doc.spots.add(),unusedColor=new CMYKColor();unused.name='PANTONE 123 C';unused.colorType=ColorModel.SPOT;unusedColor.cyan=unusedColor.magenta=unusedColor.yellow=0;unusedColor.black=100;unused.color=unusedColor;
    result=invoke('updateProduction');check(!result.error&&result.sequence.length===5&&result.text.indexOf('PANTONE 123 C')<0,'an unused document Spot Color does not create a production frame');
    var afterUnusedText={},afterUnusedMarks={};verifySpotArt(layer('FRAME TEXT').groupItems[0],afterUnusedText);verifySpotArt(layer('REGISTRATION MARKS').groupItems[0],afterUnusedMarks);
    check(!afterUnusedText['PANTONE 123 C']&&!afterUnusedMarks['PANTONE 123 C'],'unused document Spot Color is absent from generated text and marks');
    var saveOptions=new IllustratorSaveOptions();saveOptions.pdfCompatible=true;doc.saveAs(File(${JSON.stringify(savedAI)}),saveOptions);check(File(${JSON.stringify(savedAI)}).exists,'test Illustrator sheet saved before reopen');
    report.savedAI=${JSON.stringify(savedAI)};check(File(${JSON.stringify(savedAI)}).exists,'test AI with the full five-ink legend saved for separate reopen validation');
    layer('REGISTRATION MARKS').groupItems[0].pathItems[0].translate(1,0);result=invoke('updateProduction');check(!!result.error&&result.error.indexOf('manually edited')>=0,'manual mark edits are preserved and update rejected');
    doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;
    production.profile.text.font='BYTEBASE-Nonexistent-Font';result=invoke('createLayout');check(!!result.error&&app.documents.length===count,'failed generation leaves no partial document');
    doc=app.documents.add(DocumentColorSpace.CMYK,pt(20),pt(20));var created=[];
    var candidate={name:'White-BG',source:'PDF Separation color-space candidate',alternate:{space:'CMYK',values:[0,0,0,0]}};
    var rejected=false;try{BytebaseSpotInks.resolve(doc,[candidate],production.profile,created,json);}catch(expected){rejected=String(expected).indexOf('Missing required MASCOT source inks')>=0;}
    check(rejected&&created.length===0&&!findSpot('White-BG')&&!findSpot('Lim'),'missing mandatory MASCOT inks block without creating spot artwork');
    var onlyWhite=doc.spots.add(),whiteColor=new CMYKColor();whiteColor.cyan=whiteColor.magenta=whiteColor.yellow=whiteColor.black=0;onlyWhite.name='White-BG';onlyWhite.colorType=ColorModel.SPOT;onlyWhite.color=whiteColor;
    var missingLim=false;try{BytebaseSpotInks.resolve(doc,[candidate,{name:'Lim',source:'PDF Separation color-space candidate',alternate:{space:'RGB',values:[1,1,0.498039]}}],production.profile,created,json);}catch(expected2){missingLim=String(expected2).indexOf('Missing source Spot Color for Lim')>=0;}
    check(missingLim&&created.length===0&&!!findSpot('White-BG')&&!findSpot('Lim'),'missing Lim blocks when White-BG exists; no spot is fabricated');doc.close(SaveOptions.DONOTSAVECHANGES);doc=app.documents.add(DocumentColorSpace.CMYK,pt(20),pt(20));
    var onlyLim=doc.spots.add(),limColor=new RGBColor();limColor.red=255;limColor.green=255;limColor.blue=127;onlyLim.name='Lim';onlyLim.colorType=ColorModel.SPOT;onlyLim.color=limColor;
    var missingWhite=false;try{BytebaseSpotInks.resolve(doc,[candidate,{name:'Lim',source:'PDF Separation color-space candidate',alternate:{space:'RGB',values:[1,1,0.498039]}}],production.profile,created,json);}catch(expected3){missingWhite=String(expected3).indexOf('Missing source Spot Color for White-BG')>=0;}
    check(missingWhite&&created.length===0&&!findSpot('White-BG')&&!!findSpot('Lim'),'missing White-BG blocks when Lim exists; no spot is fabricated');doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;
    report.passed=true;
  }catch(e){report.error=String(e)+' (line '+e.line+')';}
  finally{if(doc)try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignore){}if(original)try{original.activate();}catch(ignore2){}app.userInteractionLevel=interaction;var out=File(${JSON.stringify(output)});out.encoding='UTF-8';out.open('w');out.write(json(report));out.close();}
  return report.passed?'PASS':'FAIL: '+report.error;
}());`;
fs.writeFileSync(script,jsx);
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const runIllustrator=file=>cp.spawnSync('powershell',['-NoProfile','-Command',`$ai=New-Object -ComObject Illustrator.Application; $ai.DoJavaScriptFile(${quote(file)})`],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
const r=runIllustrator(script);
if(r.error)throw r.error;assert.equal(r.status,0,r.stderr);
const report=JSON.parse(fs.readFileSync(output,'utf8').replace(/^\uFEFF/,''));
assert.equal(report.passed,true,report.error);

// Run save/reopen inspection in a fresh Illustrator ExtendScript invocation.
// This prevents transient state from earlier negative-path tests affecting the
// spot references read back from the saved AI file.
const reopenJsx=String.raw`#target illustrator
(function(){
  $.evalFile(File(${JSON.stringify(path.join(root,'host/host.jsx'))}));
  var target=File(${JSON.stringify(savedAI)}),source=File(${JSON.stringify(input.jobs[0].filePath)}),out=File(${JSON.stringify(reopenOutput)}),capture=File(${JSON.stringify(path.join(dir,'reopened-composite.png'))}),priorDocs=[],doc=null,report={passed:false,checks:[]},interaction=app.userInteractionLevel;
  for(var di=0;di<app.documents.length;di++)priorDocs.push(app.documents[di]);
  function json(v){if(v===null||typeof v==='undefined')return 'null';if(typeof v==='string')return '"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';if(typeof v==='number'||typeof v==='boolean')return String(v);if(v instanceof Array){var a=[];for(var i=0;i<v.length;i++)a.push(json(v[i]));return '['+a.join(',')+']';}var o=[];for(var k in v)if(v.hasOwnProperty(k))o.push(json(k)+':'+json(v[k]));return '{'+o.join(',')+'}';}
  function check(ok,message){if(!ok)throw Error(message);report.checks.push(message);}
  function layer(name){return doc.layers.getByName('BYTEBASE - '+name);}
  function equivalent(a,b){if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<=0.00001;if(a===b)return true;if(a===null||b===null||typeof a!==typeof b)return false;if(a instanceof Array){if(!(b instanceof Array)||a.length!==b.length)return false;for(var ai=0;ai<a.length;ai++)if(!equivalent(a[ai],b[ai]))return false;return true;}if(typeof a==='object'){var ac=0,bc=0;for(var ak in a)if(a.hasOwnProperty(ak)){ac++;if(!b.hasOwnProperty(ak)||!equivalent(a[ak],b[ak]))return false;}for(var bk in b)if(b.hasOwnProperty(bk))bc++;return ac===bc;}return false;}
  function walk(node,used,bounds){if(node.typename==='PathItem'){if(node.filled){var f=node.fillColor;if(f.typename!=='SpotColor'||Math.abs(f.tint-100)>0.001)throw Error('Process-color or non-100% fill after save/reopen');var name=f.spot.name;used[name]=true;if(bounds){var b=node.visibleBounds,r=bounds[name];if(!r)bounds[name]=r={left:b[0],right:b[2]};else{r.left=Math.min(r.left,b[0]);r.right=Math.max(r.right,b[2]);}}}if(node.stroked){var s=node.strokeColor;if(s.typename!=='SpotColor'||Math.abs(s.tint-100)>0.001)throw Error('Process-color or non-100% stroke after save/reopen');used[s.spot.name]=true;}return;}if(node.typename==='GroupItem')for(var gi=0;gi<node.pageItems.length;gi++)walk(node.pageItems[gi],used,bounds);else if(node.typename==='CompoundPathItem')for(var ci=0;ci<node.pathItems.length;ci++)walk(node.pathItems[ci],used,bounds);}
  function markSignature(item){var points=[];for(var pi=0;pi<item.pathPoints.length;pi++){var p=item.pathPoints[pi];points.push([p.anchor[0],p.anchor[1],p.leftDirection[0],p.leftDirection[1],p.rightDirection[0],p.rightDirection[1]]);}return json(points);}
  try{
    app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;doc=app.open(target);
    check(doc.artboards.length===1,'reopened AI retains its single production artboard');
    check(doc.placedItems.length===${plan.totalCopies}&&doc.placedItems[0].file.fsName.toLowerCase()===source.fsName.toLowerCase(),'reopened AI retains every original linked source PDF placement');
    var meta=BytebaseJSONRead(layer('REGISTRATION MARKS').groupItems[0].note),layout=BytebaseJSONRead(meta.layout),names=[],expected=['PANTONE 280 C','PANTONE 485 C','PANTONE 7416 C','White-BG','Lim'];
    for(var i=0;i<meta.sequence.length;i++)names.push(meta.sequence[i].name);
    check(names.join('|')===expected.join('|'),'reopened Illustrator spot sequence retains source names and order');
    var model=BytebaseSetup.compose(meta.production.profile,meta.production.inks,layout,meta.production.options);
    check(model.label.text==='1/5 280c  2/5 485c  3/5 7416c  4/5 hvid  5/5 lim','actual Pantone 7416 C name agrees with displayed 7416c frame label');
    var textUsed={},textBounds={};walk(layer('FRAME TEXT').groupItems[0],textUsed,textBounds);
    var expectedMap={};for(i=0;i<expected.length;i++){expectedMap['$'+expected[i]]=true;check(!!textUsed[expected[i]]&&!!textBounds[expected[i]],'reopened outlined legend retains 100% source SpotColor '+expected[i]);}
    var textCount=0;for(var ink in textUsed)if(textUsed.hasOwnProperty(ink)){textCount++;if(!expectedMap['$'+ink])throw Error('Unexpected frame-text ink '+ink);}
    check(textCount===expected.length,'reopened frame text contains only the five ordered source spot inks');
    var prior=null;for(i=0;i<expected.length;i++){var box=textBounds[expected[i]];if(prior&&box.left<prior.right-0.01)throw Error('Reopened legend segment overlaps or shares a spot region at '+expected[i]);prior=box;}
    check(true,'reopened legend segments remain spatially isolated by spot ink');
    var marks=layer('REGISTRATION MARKS').groupItems[0],markByGeometry={},markCount={};
    for(i=0;i<marks.pathItems.length;i++){var item=marks.pathItems[i],parts=item.name.split(' / '),inkName=parts[parts.length-1],known=false;for(var ni=0;ni<expected.length;ni++)if(inkName===expected[ni])known=true;if(!known)continue;
      var key=parts.slice(0,parts.length-1).join(' / '),signature=markSignature(item);if(!markByGeometry[key])markByGeometry[key]=signature;else if(markByGeometry[key]!==signature)throw Error('Registration mark coordinates differ across plates: '+key);markCount[inkName]=(markCount[inkName]||0)+1;}
    for(i=0;i<expected.length;i++)check(markCount[expected[i]]>0,'reopened registration marks exist on '+expected[i]);
    check(true,'reopened registration marks have identical coordinates on every spot plate');
    check(!textUsed['PANTONE 123 C'],'reopened unused document swatch creates no legend art');
    check(doc.spots.getByName('PANTONE 123 C').name==='PANTONE 123 C','unused swatch remains separate from generated frame inks');
    check(equivalent(BytebaseJSONRead(meta.source),BytebaseJSONRead(BytebaseProductionArtwork.fingerprint(layer('LINKED PDF ARTWORK'),json))),'reopened linked source artwork and transforms match saved metadata within Illustrator numeric precision');
    var board=doc.artboards[0].artboardRect,shot=new ImageCaptureOptions();shot.resolution=72;shot.antiAliasing=true;doc.imageCapture(capture,board,shot);
    report.savedAI=target.fsName;report.compositePreview=capture.fsName;report.passed=true;
  }catch(e){report.error=String(e)+' (line '+e.line+')';}
  finally{if(doc)try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignore){}for(var ri=0;ri<priorDocs.length;ri++)try{priorDocs[ri].activate();break;}catch(ignore2){}app.userInteractionLevel=interaction;out.encoding='UTF-8';out.open('w');out.write(json(report));out.close();}
  return report.passed?'PASS':'FAIL: '+report.error;
}());`;
fs.writeFileSync(reopenScript,reopenJsx);
const reopenedRun=runIllustrator(reopenScript);
if(reopenedRun.error)throw reopenedRun.error;assert.equal(reopenedRun.status,0,reopenedRun.stderr||reopenedRun.stdout);
const reopenReport=JSON.parse(fs.readFileSync(reopenOutput,'utf8').replace(/^\uFEFF/,''));
assert.equal(reopenReport.passed,true,reopenReport.error);report.saveReopen=reopenReport;
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex');
report.sourcePDFUnchanged=hash('fixture.pdf')===hash('fixture-before.pdf');fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));assert.equal(report.passed,true,report.error);assert.equal(report.sourcePDFUnchanged,true);
