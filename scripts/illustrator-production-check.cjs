// Executes in the real Illustrator via COM. Only generated fixtures/new unsaved documents are touched.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts/illustrator-production');fs.mkdirSync(dir,{recursive:true});
const S=require('../shared/production-setup'),P=require('../client/production');
const input={settings:{sheetW:700,sheetH:500,edge:20,inset:0,rotate:true},mode:'overproduction',maxOverproductionPct:0,jobs:[{id:'1',fileName:'fixture.pdf',filePath:path.join(dir,'fixture.pdf'),width:50,height:30,orderQ:2,orderQConfirmed:true}]};
const plan=P.planProduction(input),production={profile:S.defaults()[0],inks:['280c','485c','7616c','White-BG','Lim'],options:{verified:true,frame:0}};
const output=path.join(dir,'report.json'),script=path.join(dir,'check.jsx');
const jsx=String.raw`#target illustrator
(function(){
  $.evalFile(File(${JSON.stringify(path.join(root,'host/host.jsx'))}));
  var plan=${JSON.stringify(plan)},production=${JSON.stringify(production)},fixture=File(${JSON.stringify(input.jobs[0].filePath)}),report={passed:false,checks:[]},doc=null,original=app.documents.length?app.activeDocument:null,interaction=app.userInteractionLevel;
  function pt(mm){return mm*72/25.4;}
  function json(v){if(v===null||typeof v==='undefined')return 'null';if(typeof v==='string')return '"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';if(typeof v==='number'||typeof v==='boolean')return String(v);if(v instanceof Array){var a=[];for(var i=0;i<v.length;i++)a.push(json(v[i]));return '['+a.join(',')+']';}var o=[];for(var k in v)if(v.hasOwnProperty(k))o.push(json(k)+':'+json(v[k]));return '{'+o.join(',')+'}';}
  function check(ok,message){if(!ok)throw Error(message);report.checks.push(message);}
  function invoke(method){return BytebaseJSONRead(Bytebase[method](encodeURIComponent(json({layout:plan,production:production}))));}
  function layer(name){return doc.layers.getByName('BYTEBASE - '+name);}
  try{
    app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
    doc=app.documents.add(DocumentColorSpace.CMYK,pt(50),pt(30));doc.artboards[0].artboardRect=[0,pt(30),pt(50),0];
    var sourceInks=[['PANTONE 280 C',[100,90,0,20]],['PANTONE 485 C',[0,95,95,0]],['PANTONE 7616 C',[0,70,80,20]],['White-BG',[0,0,0,40]],['Lim',[0,0,100,0]]];
    for(var fi=0;fi<sourceInks.length;fi++){try{var def=sourceInks[fi],spot=doc.spots.add(),c=new CMYKColor();c.cyan=def[1][0];c.magenta=def[1][1];c.yellow=def[1][2];c.black=def[1][3];spot.name=def[0];spot.colorType=ColorModel.SPOT;spot.color=c;
      var patch=doc.pathItems.rectangle(pt(25),pt(fi*10),pt(10),pt(10)),inkFill=new SpotColor();inkFill.spot=spot;inkFill.tint=100;patch.stroked=false;patch.filled=true;patch.fillColor=inkFill;}catch(inner){throw Error('fixture spot '+fi+' '+def[0]+': '+inner+' line '+inner.line);}}
    var opts=new PDFSaveOptions();opts.preserveEditability=false;opts.viewAfterSaving=false;doc.saveAs(fixture,opts);doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;
    // Save a byte-for-byte baseline before any plugin operations.
    fixture.copy(${JSON.stringify(path.join(dir,'fixture-before.pdf'))});
    var count=app.documents.length,result=invoke('createLayout');if(result.error)throw Error(result.error);doc=app.activeDocument;
    check(app.documents.length===count+1,'one new working document');check(doc.placedItems.length===plan.totalCopies,'all original linked placements');
    check(result.production.text==='1/5 280c  2/5 485c  3/5 7616c  4/5 hvid  5/5 lim','exact five-ink legend in real Illustrator');
    var white=doc.spots.getByName('White-BG'),lim=doc.spots.getByName('Lim');
    check(white.colorType===ColorModel.SPOT&&white.spotKind===SpotColorKind.SPOTCMYK&&white.color.cyan===0&&white.color.magenta===0&&white.color.yellow===0&&Math.abs(white.color.black-40)<0.1,'White-BG is the exact CMYK 0/0/0/40 spot');
    check(lim.colorType===ColorModel.SPOT&&lim.spotKind===SpotColorKind.SPOTCMYK&&lim.color.cyan===0&&lim.color.magenta===0&&Math.abs(lim.color.yellow-100)<0.1&&lim.color.black===0,'Lim is the exact CMYK 0/0/100/0 spot');
    function verifySpotArt(node,used){if(node.typename==='PathItem'){if(node.filled){var f=node.fillColor;if(f.typename!=='SpotColor'||Math.abs(f.tint-100)>0.001)throw Error('Process color or partial tint in production art');used[f.spot.name]=true;}if(node.stroked){var s=node.strokeColor;if(s.typename!=='SpotColor'||Math.abs(s.tint-100)>0.001)throw Error('Process stroke in production art');used[s.spot.name]=true;}return;}
      if(node.typename==='GroupItem')for(var vi=0;vi<node.pageItems.length;vi++)verifySpotArt(node.pageItems[vi],used);else if(node.typename==='CompoundPathItem')for(var vi=0;vi<node.pathItems.length;vi++)verifySpotArt(node.pathItems[vi],used);}
    var usedText={},usedMarks={};verifySpotArt(layer('FRAME TEXT').groupItems[0],usedText);verifySpotArt(layer('REGISTRATION MARKS').groupItems[0],usedMarks);
    for(var si=0;si<sourceInks.length;si++){check(usedText[sourceInks[si][0]],'legend has 100% matching source spot '+sourceInks[si][0]);check(usedMarks[sourceInks[si][0]],'registration marks have 100% matching source spot '+sourceInks[si][0]);}
    function countKeys(o){var n=0;for(var k in o)if(o.hasOwnProperty(k))n++;return n;}check(countKeys(usedText)===sourceInks.length&&countKeys(usedMarks)===sourceInks.length,'generated production layers introduce no process colors or extra ink names');
    check(layer('PRINT GUIDES').printable===false,'guides are nonprinting');check(layer('REGISTRATION MARKS').printable&&layer('FRAME TEXT').printable,'production layers are printable');
    var board=doc.artboards[0].artboardRect,g=BytebaseSetup.geometry(production.profile),maxError=0;
    var marks=layer('REGISTRATION MARKS').groupItems[0];
    for(var mi=0;mi<g.marks.length;mi++)for(var pi=0;pi<g.marks[mi].paths.length;pi++){
      var expected=g.marks[mi].paths[pi],actual=marks.pathItems.getByName(g.marks[mi].id+' / '+pi+' / PANTONE 280 C');
      for(var vi=0;vi<expected.vertices.length;vi++){var point=expected.vertices[vi].a,b=actual.pathPoints[vi].anchor;maxError=Math.max(maxError,Math.abs(b[0]-board[0]-pt(point[0])),Math.abs(b[1]-board[1]+pt(point[1])));}
    }
    check(maxError<0.01,'preview and Illustrator mark anchors match within 0.01 pt');report.maximumMarkErrorPt=maxError;report.textBounds=result.production.textBounds;
    var capture=new ImageCaptureOptions();capture.resolution=72;capture.antiAliasing=true;doc.imageCapture(File(${JSON.stringify(path.join(dir,'working-sheet.png'))}),board,capture);
    var source=BytebaseProductionArtwork.fingerprint(layer('LINKED PDF ARTWORK'),json),markSignature=BytebaseProductionArtwork.fingerprint(layer('REGISTRATION MARKS'),json),itemCount=doc.pageItems.length;
    result=invoke('updateProduction');check(!result.error,'repeat update succeeds: '+(result.error||'OK'));check(doc.pageItems.length===itemCount,'repeat generation does not duplicate objects');check(source===BytebaseProductionArtwork.fingerprint(layer('LINKED PDF ARTWORK'),json),'linked artwork bounds and transforms unchanged');check(markSignature===BytebaseProductionArtwork.fingerprint(layer('REGISTRATION MARKS'),json),'repeated marks have identical geometry');
    var wrongWhite=new CMYKColor();wrongWhite.cyan=wrongWhite.magenta=wrongWhite.yellow=wrongWhite.black=0;white.color=wrongWhite;result=invoke('updateProduction');check(!!result.error&&result.error.indexOf('White-BG source Spot Color does not match')>=0,'mismatched White-BG source spot is rejected without replacement');var correctWhite=new CMYKColor();correctWhite.cyan=correctWhite.magenta=correctWhite.yellow=0;correctWhite.black=40;white.color=correctWhite;
    production.inks=['485c','280c','7616c','White-BG','Lim'];result=invoke('updateProduction');check(!result.error&&result.text.indexOf('1/5 485c  2/5 280c')===0,'ink reordering renumbers the spot-colored legend');production.inks=['280c','485c','7616c','White-BG','Lim'];
    production.profile.text.mode='current';production.options.frame=4;result=invoke('updateProduction');check(!result.error&&result.text==='5/5 lim','current-frame mode includes Lim');
    production.profile.text.align='center';result=invoke('updateProduction');check(!result.error&&Math.abs(result.textBounds.x-(20+(660-result.textBounds.w)/2))<0.001,'center alignment matches reserved area');production.profile.text.align='left';
    production.profile.text.rotation=90;production.profile.text.width=80;production.profile.text.y=-100;result=invoke('updateProduction');check(!result.error&&result.textBounds.h>result.textBounds.w,'vertical text is outlined without scaling');production.profile.text.rotation=0;production.profile.text.width=660;production.profile.text.y=-15;
    production.profile.assets.test='<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="black" stroke-width="0.2"/></svg>';
    production.profile.marks[0].type='svg';production.profile.marks[0].asset='test';production.profile.marks[0].rotation=30;result=invoke('updateProduction');check(!result.error,'validated SVG mark is generated as rotated vector geometry');
    production.profile.text.font='BYTEBASE-Nonexistent-Font';var before=doc.pageItems.length;result=invoke('updateProduction');check(!!result.error&&doc.pageItems.length===before,'missing font fails without changing existing sheet');production.profile.text.font='ArialMT';
    production.profile.text.width=1;result=invoke('updateProduction');check(!!result.error&&doc.pageItems.length===before,'overflow fails and staging layers are removed');production.profile.text.width=660;
    layer('REGISTRATION MARKS').groupItems[0].pathItems[0].translate(1,0);result=invoke('updateProduction');check(!!result.error&&result.error.indexOf('manually edited')>=0,'manual mark edits are preserved and update rejected');
    doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;
    production.profile.text.font='BYTEBASE-Nonexistent-Font';result=invoke('createLayout');check(!!result.error&&app.documents.length===count,'failed generation leaves no partial document');
    doc=app.documents.add(DocumentColorSpace.CMYK,pt(20),pt(20));var created=[];
    var candidate={name:'White-BG',source:'PDF Separation color-space candidate',alternate:{space:'CMYK',values:[0,0,0,0.4]}};
    var resolved=BytebaseSpotInks.resolve(doc,[candidate],production.profile,created,json),made=resolved.spots['White-BG'];
    check(created.length===1&&made.colorType===ColorModel.SPOT&&made.spotKind===SpotColorKind.SPOTCMYK&&Math.abs(made.color.black-40)<0.1,'missing MASCOT special creates exact Spot Color from matching PDF candidate');
    var badCandidate={name:'Lim',source:'PDF Separation color-space candidate',alternate:{space:'CMYK',values:[0,0,0,0]}};
    var rejected=false;try{BytebaseSpotInks.resolve(doc,[badCandidate],production.profile,created,json);}catch(expected){rejected=String(expected).indexOf('No matching source Spot Color')>=0;}
    check(rejected,'missing MASCOT special rejects mismatched PDF candidate');doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;
    report.passed=true;
  }catch(e){report.error=String(e)+' (line '+e.line+')';}
  finally{if(doc)try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignore){}if(original)try{original.activate();}catch(ignore2){}app.userInteractionLevel=interaction;var out=File(${JSON.stringify(output)});out.encoding='UTF-8';out.open('w');out.write(json(report));out.close();}
  return report.passed?'PASS':'FAIL: '+report.error;
}());`;
fs.writeFileSync(script,jsx);
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const r=cp.spawnSync('powershell',['-NoProfile','-Command',`$ai=New-Object -ComObject Illustrator.Application; $ai.DoJavaScriptFile(${quote(script)})`],{encoding:'utf8',timeout:180000});
if(r.error)throw r.error;assert.equal(r.status,0,r.stderr);
const report=JSON.parse(fs.readFileSync(output,'utf8').replace(/^\uFEFF/,''));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex');
report.sourcePDFUnchanged=hash('fixture.pdf')===hash('fixture-before.pdf');fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));assert.equal(report.passed,true,report.error);assert.equal(report.sourcePDFUnchanged,true);
