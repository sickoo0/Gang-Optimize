/*
 * Run from Illustrator's ExtendScript console or via Application.DoJavaScriptFile.
 * Creates only temporary geometric fixture PDFs and unsaved test layouts.
 * Bytebase.createLayout verifies each final PlacedItem.geometricBounds in Illustrator.
 */
#target illustrator
(function () {
  var root=File($.fileName).parent.parent;
  $.evalFile(File(root.fsName+'/host/host.jsx'));
  var fixtureFolder=Folder.temp;
  var first=File(fixtureFolder.fsName+'/bytebase-placement-fixture-90x50.pdf');
  var second=File(fixtureFolder.fsName+'/bytebase-placement-fixture-70x100.pdf');
  var fixtureDocs=[];
  function mmPt(v){return BytebaseGeometry.mmToPt(v);}
  function stringify(value){
    if(value===null||typeof value==='undefined')return 'null';
    if(typeof value==='string')return '"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n')+'"';
    if(typeof value==='number'||typeof value==='boolean')return String(value);
    if(value instanceof Array){var entries=[];for(var i=0;i<value.length;i++)entries.push(stringify(value[i]));return '['+entries.join(',')+']';}
    var fields=[];for(var key in value)if(value.hasOwnProperty(key))fields.push(stringify(key)+':'+stringify(value[key]));
    return '{'+fields.join(',')+'}';
  }
  function makePdf(file,wMm,hMm){
    var doc=app.documents.add(DocumentColorSpace.CMYK,mmPt(wMm),mmPt(hMm));
    fixtureDocs.push(doc);
    doc.artboards[0].artboardRect=[0,mmPt(hMm),mmPt(wMm),0];
    var rect=doc.pathItems.rectangle(mmPt(hMm),0,mmPt(wMm),mmPt(hMm));
    rect.stroked=false;rect.filled=true;
    var opts=new PDFSaveOptions();opts.preserveEditability=false;opts.viewAfterSaving=false;
    doc.saveAs(file,opts);
    doc.close(SaveOptions.DONOTSAVECHANGES);
    fixtureDocs.pop();
  }
  function parseHost(text){return eval('('+text+')');}
  function place(id,file,name,w,h,x,y,rotated,copy){
    var rw=(rotated?h:w)+10,rh=(rotated?w:h)+10;
    return {id:id,filePath:file.fsName,fileName:name,artworkW:w,artworkH:h,
      x:x,y:y,w:rw,h:rh,rotated:rotated,inset:5,copyIndex:copy};
  }
  function fixtureCuts(placements){
    var cuts=BytebaseCutting.outerTrimCuts({sheetW:700,sheetH:500,edge:10});
    var pieces=[{x:10,y:10,w:680,h:480}],tolerance=0.0001;
    function split(piece,axis,at,keepSecond){
      var first,second;
      if(axis==='vertical'){
        first={x:piece.x,y:piece.y,w:at-piece.x,h:piece.h};
        second={x:at,y:piece.y,w:piece.x+piece.w-at,h:piece.h};
      }else{
        first={x:piece.x,y:piece.y,w:piece.w,h:at-piece.y};
        second={x:piece.x,y:at,w:piece.w,h:piece.y+piece.h-at};
      }
      cuts.push({axis:axis,at:at,region:piece});
      pieces.push(keepSecond?first:second);
      return keepSecond?second:first;
    }
    for(var i=0;i<placements.length;i++){
      var p=placements[i],index=-1;
      for(var j=0;j<pieces.length;j++){
        var r=pieces[j];
        if(p.x>=r.x-tolerance&&p.y>=r.y-tolerance&&
           p.x+p.w<=r.x+r.w+tolerance&&p.y+p.h<=r.y+r.h+tolerance){index=j;break;}
      }
      if(index<0)throw Error('Fixture placements cannot be separated by straight cuts');
      var piece=pieces.splice(index,1)[0];
      if(p.x>piece.x+tolerance)piece=split(piece,'vertical',p.x,true);
      if(p.y>piece.y+tolerance)piece=split(piece,'horizontal',p.y,true);
      if(p.x+p.w<piece.x+piece.w-tolerance)piece=split(piece,'vertical',p.x+p.w,false);
      if(p.y+p.h<piece.y+piece.h-tolerance)piece=split(piece,'horizontal',p.y+p.h,false);
    }
    if(!BytebaseCutting.verifyGuillotineCuts({sheetW:700,sheetH:500,edge:10},placements,cuts))
      throw Error('Fixture cut sequence did not verify');
    return cuts;
  }
  function runLayout(sheets,label){
    for(var si=0;si<sheets.length;si++)sheets[si].cuts=fixtureCuts(sheets[si].placements);
    var before=app.documents.length;
    var result=parseHost(Bytebase.createLayout(encodeURIComponent(stringify({layout:{
      settings:{sheetW:700,sheetH:500,edge:10,inset:5,rotate:true},sheetCount:sheets.length,sheets:sheets
    }}))));
    if(result.error)throw Error(label+': '+result.error);
    if(result.verified!==result.placed)throw Error(label+': not every placed PDF was verified');
    var layoutDoc=app.activeDocument;
    if(layoutDoc.artboards.length!==1)throw Error(label+': expected exactly one Illustrator artboard');
    for(var ai=0;ai<layoutDoc.artboards.length;ai++){
      var rect=layoutDoc.artboards[ai].artboardRect;
      if(Math.abs((rect[2]-rect[0])-mmPt(700))>0.1||Math.abs((rect[1]-rect[3])-mmPt(500))>0.1)
        throw Error(label+': artboard '+(ai+1)+' is not 700 x 500 mm landscape');
    }
    if(app.documents.length>before)app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
    return result.verified;
  }
  function run(){
    makePdf(first,90,50);makePdf(second,70,100);
    var measured=parseHost(Bytebase.measure(encodeURIComponent(stringify({files:[
      {id:'a',path:first.fsName},{id:'b',path:second.fsName}
    ]}))));
    var dims={};
    for(var i=0;i<measured.measurements.length;i++){
      var m=measured.measurements[i];if(m.error)throw Error('Fixture measurement failed: '+m.error);
      dims[m.id]={w:m.width,h:m.height};
    }
    var one=place('a',first,'fixture-90x50.pdf',dims.a.w,dims.a.h,10,10,false,1);
    var oneCount=runLayout([{index:0,placements:[one]}],'Single original-size PDF');
    var copies=[
      place('a',first,'fixture-90x50.pdf',dims.a.w,dims.a.h,10,10,false,1),
      place('a',first,'fixture-90x50.pdf',dims.a.w,dims.a.h,120,10,false,2),
      place('a',first,'fixture-90x50.pdf',dims.a.w,dims.a.h,10,80,false,3),
      place('a',first,'fixture-90x50.pdf',dims.a.w,dims.a.h,120,80,false,4)
    ];
    var copyCount=runLayout([{index:0,placements:copies}],'Multiple copies of one PDF');
    var mixed0=[
      place('a',first,'fixture-90x50.pdf',dims.a.w,dims.a.h,10,10,false,1),
      place('b',second,'fixture-70x100.pdf',dims.b.w,dims.b.h,120,10,false,1),
      place('b',second,'fixture-70x100.pdf',dims.b.w,dims.b.h,220,10,true,2)
    ];
    var mixedCount=runLayout([{index:0,placements:mixed0}], 'Mixed sizes on one artboard');
    var beforeReject=app.documents.length;
    var noCuts=parseHost(Bytebase.createLayout(encodeURIComponent(stringify({layout:{
      settings:{sheetW:700,sheetH:500,edge:10,inset:5,rotate:true},sheetCount:1,
      sheets:[{index:0,placements:[one]}]
    }}))));
    if(!noCuts.error||noCuts.error.indexOf('guillotine')<0)throw Error('Layout without cuts was not rejected');
    if(app.documents.length!==beforeReject)throw Error('Invalid cut sequence created an Illustrator document');
    var multi=parseHost(Bytebase.createLayout(encodeURIComponent(stringify({layout:{
      settings:{sheetW:700,sheetH:500,edge:10,inset:5,rotate:true},sheetCount:2,
      sheets:[{index:0,placements:[one],cuts:fixtureCuts([one])},
        {index:1,placements:[place('b',second,'fixture-70x100.pdf',dims.b.w,dims.b.h,10,10,false,1)]}]
    }}))));
    if(!multi.error||multi.error.indexOf('exactly one')<0)throw Error('Two-artboard layout was not rejected');
    if(app.documents.length!==beforeReject)throw Error('Rejected multi-artboard layout opened an Illustrator document');
    if(first.exists)first.remove();if(second.exists)second.remove();
    return 'PASS: Illustrator actual-bounds placement: '+oneCount+' original PDF, '+copyCount+' same-PDF copies, '+mixedCount+
      ' mixed-size placements; multi-artboard input was rejected (including 90° rotation).';
  }
  try{$.global.BYTEBASE_PLACEMENT_TEST_RESULT=run();$.writeln($.global.BYTEBASE_PLACEMENT_TEST_RESULT);}
  catch(e){
    for(var i=fixtureDocs.length-1;i>=0;i--)try{fixtureDocs[i].close(SaveOptions.DONOTSAVECHANGES);}catch(ignore){}
    if(first.exists)first.remove();if(second.exists)second.remove();
    $.global.BYTEBASE_PLACEMENT_TEST_RESULT='FAIL: '+String(e);
    throw e;
  }
}());
