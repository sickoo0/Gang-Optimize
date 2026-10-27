/*
 * BYTEBASE Gang Optimizer - Illustrator ExtendScript bridge (CEP)
 * v0.1 SAFE PILOT - never overwrites source PDFs; no RIP export.
 * Source PDF artwork remains LINKED, not embedded or edited.
 * Only geometry is planned; production-specific ink analysis is not implemented.
 */
#target illustrator
#include "geometry.js"
#include "cutting.js"
// evalFile runs this file in its own scope during Reload Panel. Reuse the
// Illustrator-global namespace explicitly so refreshed methods replace stale
// handlers instead of remaining trapped in the evalFile scope.
var Bytebase = $.global.Bytebase || {};
$.global.Bytebase = Bytebase;
Bytebase.__hostBuild = 'variable-cut-margin-v2';
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
  function offsetBounds(b,dx,dy){
    return {left:b.left+dx,top:b.top+dy,right:b.right+dx,bottom:b.bottom+dy};
  }
  function placeWithoutRoundingOverlap(item,placement,board,prior,sheetIndex){
    var actual=verifyPlacedItem(item,placement,board,sheetIndex),overlap=false;
    for(var i=0;i<prior.length;i++)if(BytebaseGeometry.overlaps(actual,prior[i])){overlap=true;break;}
    if(!overlap)return actual;
    // At zero cut margin, Illustrator can report a few ten-thousandths of a
    // point more width than the measured/rounded millimetres. Move only enough
    // to clear that numerical overlap. PDF dimensions and rotation stay intact.
    var maxShift=0.05,gap=0.001,xs=[0],ys=[0],expected=BytebaseGeometry.expectedArtworkBounds(board,placement),
      cut={left:board[0]+pt(placement.x),top:board[1]-pt(placement.y),
        right:board[0]+pt(placement.x+placement.w),bottom:board[1]-pt(placement.y+placement.h)};
    function addOffset(list,value){
      if(Math.abs(value)>maxShift)return;
      for(var oi=0;oi<list.length;oi++)if(Math.abs(list[oi]-value)<0.000001)return;
      list.push(value);
    }
    for(var n=0;n<prior.length;n++){
      var p=prior[n];
      if(p.right<actual.left-maxShift||p.left>actual.right+maxShift||
         p.top<actual.bottom-maxShift||p.bottom>actual.top+maxShift)continue;
      var offsets=[p.right-actual.left+gap,p.left-actual.right-gap,
        p.top-actual.bottom+gap,p.bottom-actual.top-gap];
      addOffset(xs,offsets[0]);addOffset(xs,offsets[1]);
      addOffset(ys,offsets[2]);addOffset(ys,offsets[3]);
    }
    var candidates=[];
    for(var xi=0;xi<xs.length;xi++)for(var yi=0;yi<ys.length;yi++)
      candidates.push({dx:xs[xi],dy:ys[yi],distance:Math.abs(xs[xi])+Math.abs(ys[yi])});
    candidates.sort(function(a,b){return a.distance-b.distance;});
    for(var ci=0;ci<candidates.length;ci++){
      var move=candidates[ci],shifted=offsetBounds(actual,move.dx,move.dy),clear=true;
      if(!BytebaseGeometry.equalBounds(shifted,expected,BOUNDS_TOLERANCE_PT)||
         !BytebaseGeometry.contains(cut,shifted,BOUNDS_TOLERANCE_PT))continue;
      for(var pi=0;pi<prior.length;pi++)if(BytebaseGeometry.overlaps(shifted,prior[pi])){clear=false;break;}
      if(!clear)continue;
      item.translate(move.dx,move.dy,true,true,true,true);
      var verified=verifyPlacedItem(item,placement,board,sheetIndex);
      for(var check=0;check<prior.length;check++)if(BytebaseGeometry.overlaps(verified,prior[check]))
        throw Error('Illustrator placement still overlaps after rounding correction for '+placement.fileName+'. Layout creation stopped.');
      return verified;
    }
    throw Error('Actual Illustrator artwork bounds overlap on sheet '+(sheetIndex+1)+' near '+placement.fileName+
      ' copy '+placement.copyIndex+'. Layout creation stopped.');
  }
  function validateLayout(layout){
    var s=layout.settings, workW=Number(s.sheetW)-2*Number(s.edge), workH=Number(s.sheetH)-2*Number(s.edge);
    var layoutClearance=Number(s.artworkClearance)||0;
    if(!(workW>0&&workH>0&&isFinite(Number(s.inset))&&Number(s.inset)>=0&&Number(s.inset)<=50&&
      isFinite(layoutClearance)&&layoutClearance>=0&&layoutClearance<=0.5))
      throw Error('Invalid sheet or cut margin settings');
    if(layout.sheets.length!==1||layout.sheetCount!==1)
      throw Error('The layout must contain exactly one verified gang sheet. Recalculate before creating an Illustrator document.');
    for(var si=0;si<layout.sheets.length;si++){
      var ps=layout.sheets[si].placements||[];
      if(!BytebaseCutting.verifyGuillotineCuts(s,ps,layout.sheets[si].cuts))
        throw Error('Sheet '+(si+1)+' has no valid guillotine cut sequence. Recalculate before creating an Illustrator document.');
      for(var i=0;i<ps.length;i++){
        var p=ps[i], inset=Number(p.inset), clearance=Number(p.clearance)||0,aw=Number(p.artworkW), ah=Number(p.artworkH);
        if(typeof p.rotated!=='boolean'||s.rotate===false&&p.rotated)throw Error('Invalid artwork rotation');
        if(!isFinite(p.x)||!isFinite(p.y)||!isFinite(p.w)||!isFinite(p.h)||
           !isFinite(inset)||!isFinite(clearance)||!isFinite(aw)||!isFinite(ah)||inset!==Number(s.inset)||clearance!==layoutClearance||aw<=0||ah<=0)
          throw Error('Invalid placement geometry for '+(p.fileName||'PDF'));
        var expectedW=(p.rotated?ah:aw)+2*inset+clearance, expectedH=(p.rotated?aw:ah)+2*inset+clearance;
        if(Math.abs(Number(p.w)-expectedW)>0.001||Math.abs(Number(p.h)-expectedH)>0.001)
          throw Error('Cut rectangle dimensions do not match artwork and margin for '+(p.fileName||'PDF'));
        if(p.x<Number(s.edge)-0.001||p.y<Number(s.edge)-0.001||p.x+p.w>Number(s.sheetW)-Number(s.edge)+0.001||p.y+p.h>Number(s.sheetH)-Number(s.edge)+0.001)
          throw Error('Placement is outside the printable area: '+(p.fileName||'PDF'));
        for(var j=0;j<i;j++)if(overlaps(p,ps[j]))throw Error('Overlapping cut rectangles on sheet '+(si+1));
      }
      if(layout.jobs){
        var counts={},known={},copies={},run=Number(layout.sheets[si].printingRuns),cap=Number(layout.maxAllowedOverproductionPct);
        if(!isFinite(cap)||cap<0||!isFinite(run)||run<1||Math.floor(run)!==run)throw Error('Recalculate the layout to verify production limits.');
        for(var pc=0;pc<ps.length;pc++){
          var id=String(ps[pc].id),copy=Number(ps[pc].copyIndex),copyKey=id+'|'+copy;
          if(copy<1||Math.floor(copy)!==copy||copies[copyKey])throw Error('Invalid copy index in production layout');
          copies[copyKey]=true;counts[id]=(counts[id]||0)+1;
        }
        for(var ji=0;ji<layout.jobs.length;ji++){
          var job=layout.jobs[ji],jobId=String(job.id),q=Number(job.orderQ),count=counts[jobId]||0,produced=count*run;
          if(known[jobId]||!isFinite(q)||q<1||Math.floor(q)!==q||!count||produced<q||100*(produced-q)/q>cap+1e-9||
             Number(job.copiesPerSheet)!==count||Number(job.producedQuantity)!==produced||Number(job.printingRuns)!==run)
            throw Error('Production quantities or overproduction limit do not match the preview. Recalculate the layout.');
          known[jobId]=true;
        }
        for(var placedId in counts)if(counts.hasOwnProperty(placedId)&&!known[placedId])throw Error('Unknown job in production layout');
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
      if(layout.sheets.length!==1||layout.sheetCount!==1)throw Error('The layout must contain exactly one verified gang sheet. Recalculate the layout.');
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
        var boardRects=[ab0.artboardRect];
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
            var verified=placeWithoutRoundingOverlap(item,placement,board,actualBoundsBySheet[si],si);
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
