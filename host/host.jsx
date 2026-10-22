/*
 * BYTEBASE Gang Optimizer - Illustrator ExtendScript bridge (CEP)
 * v0.1 SAFE PILOT - never overwrites source PDFs; no RIP export.
 * Source PDF artwork remains LINKED, not embedded or edited.
 * Only geometry is planned; production-specific ink analysis is not implemented.
 */
#target illustrator
#include "geometry.js"
#include "cutting.js"
var Bytebase = Bytebase || {};
(function(){
  function mm(points){ return BytebaseGeometry.ptToMm(points); }
  function pt(mmValue){ return BytebaseGeometry.mmToPt(mmValue); }
  function round4(x){ return Math.round(x * 10000) / 10000; }
  var BOUNDS_TOLERANCE_PT=0.1;
  // Read the same Illustrator interpreted PDF geometry in measurement,
  // preflight, and final placement. Bounds are [left,top,right,bottom] points.
  function placedBounds(item){
    return BytebaseGeometry.rectFromGeometricBounds(item.geometricBounds);
  }
  function placedSize(item){
    var b=placedBounds(item);
    return {width:mm(b.right-b.left),height:mm(b.top-b.bottom)};
  }
  function boundsDescription(bounds, artboardRect){
    return 'x='+round4(mm(bounds.left-artboardRect[0]))+' mm, y='+round4(mm(artboardRect[1]-bounds.top))+
      ' mm, width='+round4(mm(bounds.right-bounds.left))+' mm, height='+round4(mm(bounds.top-bounds.bottom))+' mm';
  }
  function verifyPlacedItem(item, placement, artboardRect, sheetIndex){
    var actual=placedBounds(item), expected=BytebaseGeometry.expectedArtworkBounds(artboardRect,placement);
    var cut={left:artboardRect[0]+pt(placement.x),top:artboardRect[1]-pt(placement.y),
      right:artboardRect[0]+pt(placement.x+placement.w),bottom:artboardRect[1]-pt(placement.y+placement.h)};
    if(!BytebaseGeometry.equalBounds(actual,expected,BOUNDS_TOLERANCE_PT)||
       !BytebaseGeometry.contains(cut,actual,BOUNDS_TOLERANCE_PT)){
      throw Error('Illustrator placement verification failed for '+placement.fileName+' (copy '+placement.copyIndex+', sheet '+(sheetIndex+1)+'). Expected artwork '+
        boundsDescription(expected,artboardRect)+'; actual Illustrator bounds '+boundsDescription(actual,artboardRect)+
        '. Expected rotation: '+(placement.rotated?'90°':'0°')+'. Layout creation stopped; source PDF was not scaled.');
    }
    return actual;
  }
  function overlaps(a,b){
    return a.x < b.x+b.w-0.00001 && a.x+a.w > b.x+0.00001 &&
      a.y < b.y+b.h-0.00001 && a.y+a.h > b.y+0.00001;
  }
  function validateLayout(layout){
    var s=layout.settings, workW=Number(s.sheetW)-2*Number(s.edge), workH=Number(s.sheetH)-2*Number(s.edge);
    if(!(workW>0&&workH>0&&Number(s.inset)>=0))throw Error('Invalid sheet or cut margin settings');
    if(layout.sheets.length!==1||!BytebaseCutting.verifyGuillotineCuts(s,layout.sheets[0].placements,layout.sheets[0].cuts))
      throw Error('Layout has no valid guillotine cut sequence. Recalculate before creating an Illustrator document.');
    for(var si=0;si<layout.sheets.length;si++){
      var ps=layout.sheets[si].placements||[];
      for(var i=0;i<ps.length;i++){
        var p=ps[i], inset=Number(p.inset), aw=Number(p.artworkW), ah=Number(p.artworkH);
        if(!isFinite(p.x)||!isFinite(p.y)||!isFinite(p.w)||!isFinite(p.h)||
           !isFinite(inset)||!isFinite(aw)||!isFinite(ah)||inset!==Number(s.inset)||aw<=0||ah<=0)
          throw Error('Invalid placement geometry for '+(p.fileName||'PDF'));
        var expectedW=(p.rotated?ah:aw)+2*inset, expectedH=(p.rotated?aw:ah)+2*inset;
        if(Math.abs(Number(p.w)-expectedW)>0.001||Math.abs(Number(p.h)-expectedH)>0.001)
          throw Error('Cut rectangle dimensions do not match artwork and margin for '+(p.fileName||'PDF'));
        if(p.x<Number(s.edge)-0.001||p.y<Number(s.edge)-0.001||p.x+p.w>Number(s.sheetW)-Number(s.edge)+0.001||p.y+p.h>Number(s.sheetH)-Number(s.edge)+0.001)
          throw Error('Placement is outside the printable area: '+(p.fileName||'PDF'));
        for(var j=0;j<i;j++)if(overlaps(p,ps[j]))throw Error('Overlapping cut rectangles on sheet '+(si+1));
      }
    }
  }
  function escapeString(s) {
    return String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')
      .replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')
      .replace(/[\x00-\x1f]/g,function(c){var h=c.charCodeAt(0).toString(16);return '\\u'+('0000'+h).slice(-4);});
  }
  function json(value){
    if(value === null || typeof value === 'undefined') return 'null';
    if(typeof value === 'string') return '"'+escapeString(value)+'"';
    if(typeof value === 'number') return isFinite(value) ? String(value) : 'null';
    if(typeof value === 'boolean') return value ? 'true' : 'false';
    if(value instanceof Array){var parts=[];for(var i=0;i<value.length;i++)parts.push(json(value[i]));return '['+parts.join(',')+']';}
    var fields=[];
    for(var k in value)if(value.hasOwnProperty(k))fields.push(json(k)+':'+json(value[k]));
    return '{'+fields.join(',')+'}';
  }
  function input(payload){
    // Payload arrives as encodeURIComponent(JSON.stringify(data)) from LOCAL CEP UI.
    // Quoted JSON, produced by JSON.stringify, is evaluated in ExtendScript ES3
    // because its built-in engine does not guarantee JSON.parse support.
    return eval('('+decodeURIComponent(payload)+')');
  }
  function safeAction(f){
    try{return json(f());}catch(ex){return json({error:String(ex.message || ex)+' (line '+(ex.line||'?')+')'});}
  }
  Bytebase.chooseFolder = function(encoded){
    return safeAction(function(){
      var directory=Folder.selectDialog('Select folder with production-ready PDF files');
      if(!directory)return {cancelled:true};
      var items=directory.getFiles(function(x){return x instanceof File && /\.pdf$/i.test(x.name);});
      var result=[];
      for(var i=0;i<items.length;i++){
        var name=items[i].name;
        result.push({name:name,path:items[i].fsName});
      }
      result.sort(function(a,b){return a.name.toLowerCase()<b.name.toLowerCase()?-1:1;});
      return {cancelled:false,folder:directory.fsName,files:result};
    });
  };
  Bytebase.measure = function(encoded){
    return safeAction(function(){
      var request=input(encoded), list=request.files || [], measurements=[], tmp=null;
      if(list.length>500)throw Error('Too many files to measure');
      try {
        tmp=app.documents.add(DocumentColorSpace.CMYK,pt(700),pt(500));
        for(var i=0;i<list.length;i++){
          var f=new File(list[i].path), entry={id:list[i].id};
          if(!f.exists){entry.error='File missing';measurements.push(entry);continue;}
          var placed=null;
          try {
            placed=tmp.placedItems.add();placed.file=f;
            var size=placedSize(placed);
            entry.width=round4(size.width);entry.height=round4(size.height);
            entry.bounds='Illustrator placed PDF geometric bounds';
            entry.boxNote='Illustrator interpreted PDF bounds; verify against the intended TrimBox/CropBox.';
          } catch(e){entry.error=String(e.message||e);}
          finally{if(placed)try{placed.remove();}catch(ignore){}}
          measurements.push(entry);
        }
      } finally {
        if(tmp)try{tmp.close(SaveOptions.DONOTSAVECHANGES);}catch(ignore2){}
      }
      return {measurements:measurements};
    });
  };
  function createGuides(document,sheetCount,s){
    // Guides only. No invented registration/exposure marks in the pilot.
    var layer=document.layers.add();layer.name='BYTEBASE - PRINT LIMIT (GUIDES ONLY)';
    var w=pt(s.sheetW),h=pt(s.sheetH),e=pt(s.edge),gap=pt(30);
    for(var i=0;i<sheetCount;i++){
      var col=i%3,row=Math.floor(i/3),left=col*(w+gap),top=h-row*(h+gap);
      var rect=layer.pathItems.rectangle(top-e,left+e,w-2*e,h-2*e);
      rect.stroked=true;rect.filled=false;rect.strokeWidth=0.7;
      var rgb=new RGBColor();rgb.red=190;rgb.green=89;rgb.blue=192;rect.strokeColor=rgb;
      rect.guides=true;
    }
    layer.locked=true;
  }
  Bytebase.createLayout = function(encoded){
    return safeAction(function(){
      var request=input(encoded), layout=request.layout;
      if(!layout || !layout.sheets || !layout.sheets.length || !layout.settings)throw Error('Invalid layout data');
      if(layout.sheets.length!==1||layout.sheetCount!==1)throw Error('Only one-artboard layouts can be created. Recalculate the layout.');
      var s=layout.settings;
      validateLayout(layout);
      var w=pt(s.sheetW),h=pt(s.sheetH),tmp=null,doc=null;
      var previousCoordinateSystem=null,coordinateSystemChanged=false;
      // Preflight every input PDF before writing a layout: no automatic scaling.
      var uniq={}, files=[];
      for(var bi=0;bi<layout.sheets.length;bi++){
        var placements=layout.sheets[bi].placements;
        for(var pi=0;pi<placements.length;pi++){
          var p=placements[pi];
          if(!p.filePath)throw Error('Missing PDF source path for '+p.fileName);
          if(!uniq[p.filePath]){uniq[p.filePath]=true;files.push(p);}
        }
      }
      try{
        tmp=app.documents.add(DocumentColorSpace.CMYK,w,h);
        for(var i=0;i<files.length;i++){
          var src=new File(files[i].filePath);
          if(!src.exists)throw Error('Source file missing: '+files[i].fileName);
          var probe=null;
          try {
            probe=tmp.placedItems.add();probe.file=src;
            var actual=placedBounds(probe),actualW=actual.right-actual.left,actualH=actual.top-actual.bottom;
            var expectedW=pt(files[i].artworkW),expectedH=pt(files[i].artworkH);
            if(Math.abs(actualW-expectedW)>BOUNDS_TOLERANCE_PT || Math.abs(actualH-expectedH)>BOUNDS_TOLERANCE_PT){
             throw Error('PDF bounds differ for '+files[i].fileName+': Illustrator reports '+round4(mm(actualW))+' x '+round4(mm(actualH))+
                ' mm, layout expects '+files[i].artworkW+' x '+files[i].artworkH+' mm. Re-measure the file and recalculate.');
            }
          }finally{if(probe)try{probe.remove();}catch(ignore){}}
        }
      } finally{if(tmp)try{tmp.close(SaveOptions.DONOTSAVECHANGES);}catch(ignore2){}}
      // A fresh UNSAVED document; user source files remain unmodified.
      try {
        doc=app.documents.add(DocumentColorSpace.CMYK,w,h);
        previousCoordinateSystem=app.coordinateSystem;
        app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        coordinateSystemChanged=true;
        var srcLayer=doc.layers[0];srcLayer.name='BYTEBASE - LINKED PDF ARTWORK';
        var ab0=doc.artboards[0];ab0.artboardRect=[0,h,w,0];
        var boardRects=[];
        for(var ai=0;ai<layout.sheets.length;ai++)boardRects.push(doc.artboards[ai].artboardRect);
        var placedCount=0,actualBoundsBySheet=[];
        for(var si=0;si<layout.sheets.length;si++){
          var board=boardRects[si];
          var ps=layout.sheets[si].placements;
          actualBoundsBySheet[si]=[];
          for(var j=0;j<ps.length;j++){
            var placement=ps[j], f=new File(placement.filePath);
            doc.activeLayer=srcLayer;
            var item=doc.placedItems.add();item.file=f;
            if(placement.rotated)item.rotate(90);
            // PlacedItem.position is read-only. Translate its measured bounds after rotation.
            var wanted=BytebaseGeometry.expectedArtworkBounds(board,placement),before=placedBounds(item);
            item.translate(wanted.left-before.left,wanted.top-before.top,true,true,true,true);
            var verified=verifyPlacedItem(item,placement,board,si);
            for(var prior=0;prior<actualBoundsBySheet[si].length;prior++){
              if(BytebaseGeometry.overlaps(verified,actualBoundsBySheet[si][prior]))
                throw Error('Actual Illustrator artwork bounds overlap on sheet '+(si+1)+' near '+placement.fileName+' copy '+placement.copyIndex+'. Layout creation stopped.');
            }
            actualBoundsBySheet[si].push(verified);
            item.name='BYTEBASE | '+placement.fileName+' | copy '+placement.copyIndex;
            placedCount++;
          }
        }
        createGuides(doc,layout.sheets.length,s);
        doc.activeLayer=srcLayer;
        doc.artboards.setActiveArtboardIndex(0);
        return {sheets:layout.sheets.length,placed:placedCount,verified:placedCount,warning:'WORKING PROOF ONLY - do not send to RIP'};
      }catch(e){
        if(doc)try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignore3){}
        throw e;
      }finally{
        if(coordinateSystemChanged)try{app.coordinateSystem=previousCoordinateSystem;}catch(ignore4){}
      }
    });
  };
}());
