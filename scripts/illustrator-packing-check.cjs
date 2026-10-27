// Windows/Illustrator integration check. Creates only fixture PDFs and new
// unsaved test documents. Existing user documents are never changed/closed.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'artifacts/illustrator-packing');
fs.mkdirSync(directory,{recursive:true});
const benchmark=JSON.parse(fs.readFileSync(path.join(root,'artifacts/packing-comparison/report.json'),'utf8'));
const selectedNames=process.argv.includes('--cut-margin-only')?['zero-cut-margin','four-mm-cut-margin']:
  ['measured-four-cap60','measured-six-cap76','narrow-gap-no-rotation','zero-cut-margin','four-mm-cut-margin'];
const cases=benchmark.rows.filter(r=>selectedNames.includes(r.name))
  .map(r=>({name:r.name,input:r.input,plan:r.after.plan}));
assert.equal(cases.length,selectedNames.length,'Run npm run benchmark:packing first');
const target=path.join(directory,'check.jsx'),output=path.join(directory,'report.json');
const script=String.raw`#target illustrator
(function(){
  var root=${JSON.stringify(root)},directory=${JSON.stringify(directory)},output=${JSON.stringify(output)},cases=${JSON.stringify(cases)};
  $.evalFile(File(root+'/host/host.jsx'));
  var report={passed:false,cases:[]},testDoc=null,original=app.documents.length?app.activeDocument:null,previousInteraction=app.userInteractionLevel;
  function pt(mm){return mm*72/25.4;}
  function stringify(value){
    if(value===null)return 'null';
    if(typeof value==='string')return '"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n')+'"';
    if(typeof value==='number'||typeof value==='boolean')return String(value);
    if(value instanceof Array){var a=[];for(var i=0;i<value.length;i++)a.push(stringify(value[i]));return '['+a.join(',')+']';}
    var fields=[];for(var key in value)if(value.hasOwnProperty(key))fields.push(stringify(key)+':'+stringify(value[key]));return '{'+fields.join(',')+'}';
  }
  try{
    app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
    for(var ci=0;ci<cases.length;ci++){
      var c=cases[ci],files={},byName={},maximumError=0,rotated=0,actualItems=[];
      for(var ji=0;ji<c.input.jobs.length;ji++){
        var j=c.input.jobs[ji],f=File(directory+'/'+c.name+'-'+j.id+'.pdf');
        testDoc=app.documents.add(DocumentColorSpace.CMYK,pt(j.width),pt(j.height));
        testDoc.artboards[0].artboardRect=[0,pt(j.height),pt(j.width),0];
        var rect=testDoc.pathItems.rectangle(pt(j.height),0,pt(j.width),pt(j.height));rect.stroked=false;rect.filled=true;
        var opts=new PDFSaveOptions();opts.preserveEditability=false;opts.viewAfterSaving=false;
        testDoc.saveAs(f,opts);testDoc.close(SaveOptions.DONOTSAVECHANGES);testDoc=null;files[String(j.id)]=f.fsName;
      }
      var ps=c.plan.sheets[0].placements;
      for(var pi=0;pi<ps.length;pi++){
        var p=ps[pi];p.filePath=files[p.id];byName['BYTEBASE | '+p.fileName+' | copy '+p.copyIndex]=p;
        if(p.rotated)rotated++;
      }
      var before=app.documents.length;
      var result=eval('('+Bytebase.createLayout(encodeURIComponent(stringify({layout:c.plan})))+')');
      if(result.error)throw Error(c.name+': '+result.error);
      testDoc=app.activeDocument;
      if(app.documents.length!==before+1||testDoc.artboards.length!==1||testDoc.placedItems.length!==ps.length||result.verified!==ps.length)throw Error('Unexpected Illustrator document/placement count');
      for(var itemIndex=0;itemIndex<testDoc.placedItems.length;itemIndex++){
        var item=testDoc.placedItems[itemIndex],expected=byName[item.name];if(!expected)throw Error('Unexpected artwork item');
        var actual=item.geometricBounds,aw=expected.rotated?expected.artworkH:expected.artworkW,ah=expected.rotated?expected.artworkW:expected.artworkH;
        for(var previous=0;previous<actualItems.length;previous++){
          var other=actualItems[previous];
          if(actual[0]<other[2]&&actual[2]>other[0]&&actual[1]>other[3]&&actual[3]<other[1])
            throw Error('Actual Illustrator artwork overlaps another linked PDF');
        }
        actualItems.push(actual);
        var inset=expected.inset;
        var wanted=[pt(expected.x+inset),pt(c.plan.settings.sheetH-expected.y-inset),pt(expected.x+inset+aw),pt(c.plan.settings.sheetH-expected.y-inset-ah)];
        for(var bi=0;bi<4;bi++){var error=Math.abs(actual[bi]-wanted[bi]);maximumError=Math.max(maximumError,error);if(error>0.1)throw Error('Output differs from preview by '+error+' pt');}
        if(item.file.fsName!==expected.filePath)throw Error('Linked source PDF changed');
        var m=item.matrix;
        if(Math.abs(Math.sqrt(m.mValueA*m.mValueA+m.mValueB*m.mValueB)-1)>0.0001||Math.abs(Math.sqrt(m.mValueC*m.mValueC+m.mValueD*m.mValueD)-1)>0.0001)throw Error('Artwork was scaled');
      }
      testDoc.close(SaveOptions.DONOTSAVECHANGES);testDoc=null;
      report.cases.push({name:c.name,placements:ps.length,rotated:rotated,maximumBoundsErrorPt:maximumError,cutBoxPct:c.plan.areaPct});
      // Production metadata is rechecked before Illustrator opens any file.
      var originalProduced=c.plan.jobs[0].producedQuantity;c.plan.jobs[0].producedQuantity++;
      var rejected=eval('('+Bytebase.createLayout(encodeURIComponent(stringify({layout:c.plan})))+')');
      c.plan.jobs[0].producedQuantity=originalProduced;
      if(!rejected.error||app.documents.length!==before)throw Error('Tampered production quantities were not rejected before document creation');
    }
    report.passed=true;
  }catch(e){report.error=String(e)+' (line '+e.line+')';}
  finally{
    if(testDoc)try{testDoc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignore){}
    if(original)try{original.activate();}catch(ignore2){}
    app.userInteractionLevel=previousInteraction;
    var out=File(output);out.encoding='UTF-8';out.open('w');out.write(stringify(report));out.close();
  }
  return report.passed?'PASS':'FAIL: '+report.error;
}());`;
fs.writeFileSync(target,script);
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const response=cp.spawnSync('powershell',['-NoProfile','-Command',`$ai = New-Object -ComObject Illustrator.Application; $ai.DoJavaScriptFile(${quote(target)})`],{encoding:'utf8',timeout:180000});
if(response.error)throw response.error;
assert.equal(response.status,0,response.stderr);
const report=JSON.parse(fs.readFileSync(output,'utf8').replace(/^\uFEFF/,''));
console.log(JSON.stringify(report,null,2));assert.equal(report.passed,true,report.error);
