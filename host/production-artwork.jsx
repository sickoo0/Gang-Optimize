/* Editable working-sheet output only. Spot-colored objects are not validated RIP masks. */
var BytebaseProductionArtwork = (function(){
  var names=['BYTEBASE - REGISTRATION MARKS','BYTEBASE - FRAME TEXT','BYTEBASE - PRINT GUIDES'];
  var owner='BYTEBASE_PRODUCTION_V1';
  function pt(v){return BytebaseGeometry.mmToPt(v);}
  function black(){var c=new CMYKColor();c.cyan=c.magenta=c.yellow=0;c.black=100;return c;}
  function rgb(hex){var c=new RGBColor();c.red=parseInt(hex.substr(1,2),16);c.green=parseInt(hex.substr(3,2),16);c.blue=parseInt(hex.substr(5,2),16);return c;}
  function point(board,v){return [board[0]+pt(v[0]),board[1]-pt(v[1])];}
  function boundsMM(item,board){var b=item.visibleBounds;return {x:(b[0]-board[0])*25.4/72,y:(board[1]-b[1])*25.4/72,w:(b[2]-b[0])*25.4/72,h:(b[1]-b[3])*25.4/72};}
  function color(c){if(!c)return null;var t=c.typename;if(t==='CMYKColor')return [t,c.cyan,c.magenta,c.yellow,c.black];if(t==='RGBColor')return [t,c.red,c.green,c.blue];if(t==='GrayColor')return [t,c.gray];if(t==='SpotColor')return [t,c.spot.name,c.tint];return [t,String(c)];}
  function fingerprint(layer,json){function collect(collection){var items=[];for(var i=0;i<collection.length;i++){var p=collection[i],v={type:p.typename,name:p.name,bounds:p.geometricBounds,visible:p.visibleBounds,hidden:p.hidden,opacity:p.opacity,locked:p.locked};
      if(p.typename==='PlacedItem'){v.file=p.file.fsName;var m=p.matrix;v.matrix=[m.mValueA,m.mValueB,m.mValueC,m.mValueD,m.mValueTX,m.mValueTY];}
      if(p.typename==='PathItem'){v.closed=p.closed;v.filled=p.filled;v.stroked=p.stroked;v.strokeWidth=p.strokeWidth;v.fill=p.filled?color(p.fillColor):null;v.stroke=p.stroked?color(p.strokeColor):null;v.overprint=[p.fillOverprint,p.strokeOverprint];v.guides=p.guides;v.points=[];for(var j=0;j<p.pathPoints.length;j++){var q=p.pathPoints[j];v.points.push([q.anchor,q.leftDirection,q.rightDirection]);}}
      if(p.typename==='TextFrame')v.contents=p.contents;
      if(p.typename==='GroupItem')v.children=collect(p.pageItems);
      if(p.typename==='CompoundPathItem')v.children=collect(p.pathItems);
      items.push(v);
    }return items;}return json({name:layer.name,visible:layer.visible,printable:layer.printable,items:collect(layer.pageItems)});}
  function find(doc,name){for(var i=0;i<doc.layers.length;i++)if(doc.layers[i].name===name)return doc.layers[i];return null;}
  function prepare(request,layout){
    if(!request)throw Error('Production setup is missing');
    var result=BytebaseSetup.compose(request.profile,request.inks,layout,request.options);
    if(result.errors.length)throw Error(result.errors.join('; '));
    if(!result.verified||!result.sequence.length)throw Error('Verify the actual ink list before generating production artwork');
    if(result.profile.text.enabled){try{app.textFonts.getByName(result.profile.text.font);}catch(e){throw Error('Font unavailable: '+result.profile.text.font+'. Choose an installed PostScript font name; no substitution was made.');}}
    return result;
  }
  function apply(doc,layout,request,json,parse,isUpdate){
    var model=prepare(request,layout),board=doc.artboards[0].artboardRect,existing=[],metadata=null,src=find(doc,'BYTEBASE - LINKED PDF ARTWORK'),originalActive=doc.activeLayer,staged=[],roots=[],createdSpots=[],committed=false;
    if(!src||doc.artboards.length!==1)throw Error('Select a generated single-frame working document');
    if(Math.abs(board[2]-board[0]-pt(layout.settings.sheetW))>0.01||Math.abs(board[1]-board[3]-pt(layout.settings.sheetH))>0.01)throw Error('Artboard changed; create a fresh working sheet');
    for(var i=0;i<names.length;i++)existing.push(find(doc,names[i]));
    if(isUpdate){
      if(!existing[0]||!existing[1]||!existing[2]||!existing[0].groupItems.length)throw Error('This document has no owned production setup; create a new working sheet');
      metadata=parse(existing[0].groupItems[0].note);
      if(!metadata||metadata.owner!==owner)throw Error('Unrecognized production objects; nothing changed');
      if(metadata.layout!==json(layout)||metadata.source!==fingerprint(src,json))throw Error('Layout or linked artwork was changed. Create a new working sheet; manual edits were preserved.');
      for(i=0;i<3;i++)if(metadata.generated[i]!==fingerprint(existing[i],json))throw Error('Generated marks/text/guides were manually edited. Create a new sheet; edits were preserved.');
    }else for(i=0;i<3;i++)if(existing[i])throw Error('Production layer name already in use');
    try{
      var resolved=BytebaseSpotInks.resolve(doc,model.sequence,model.profile,createdSpots,json),spotColors={};
      if(isUpdate&&metadata.spots){var previousSpots=parse(metadata.spots),currentSpots=parse(resolved.signature);
        for(var oldIndex=0;oldIndex<previousSpots.length;oldIndex++)for(var newIndex=0;newIndex<currentSpots.length;newIndex++)
          if(previousSpots[oldIndex].name===currentSpots[newIndex].name&&json(previousSpots[oldIndex])!==json(currentSpots[newIndex]))
            throw Error('A production spot definition changed. Create a fresh working sheet; existing artwork was preserved.');
      }
      for(i=0;i<model.sequence.length;i++)spotColors[model.sequence[i].name]=BytebaseSpotInks.fill(resolved.spots[model.sequence[i].name]);
      for(i=0;i<3;i++){var layer=doc.layers.add();layer.name=names[i]+' (staging)';layer.printable=i!==2;var group=layer.groupItems.add();group.name=owner;staged.push(layer);roots.push(group);}
      function drawMark(mark,target,inkName){
        for(var pi=0;pi<mark.paths.length;pi++){
          var path=mark.paths[pi],item=target.pathItems.add();item.name=mark.id+' / '+pi+(inkName?' / '+inkName:'');item.closed=path.closed;item.filled=path.fill;item.stroked=path.stroke;
          if(path.fill)item.fillColor=inkName?spotColors[inkName]:black();if(path.stroke){item.strokeColor=inkName?spotColors[inkName]:black();item.strokeWidth=pt(path.strokeWidth);item.strokeCap=StrokeCap.BUTTENDCAP;item.strokeJoin=StrokeJoin.MITERENDJOIN;}
          for(var vi=0;vi<path.vertices.length;vi++){var vertex=path.vertices[vi],pp=item.pathPoints.add();pp.anchor=point(board,vertex.a);pp.leftDirection=point(board,vertex.l);pp.rightDirection=point(board,vertex.r);pp.pointType=PointType.CORNER;}
          if(!BytebaseSetup.inside(boundsMM(item,board),model.geometry.sheet))throw Error('Illustrator mark exceeds sheet: '+mark.id);
        }
      }
      for(i=0;i<model.geometry.marks.length;i++)if(!model.geometry.marks[i].production)drawMark(model.geometry.marks[i],roots[2],null);
      for(var frameIndex=0;frameIndex<model.frames.length;frameIndex++)for(i=0;i<model.frames[frameIndex].marks.length;i++)
        drawMark(model.frames[frameIndex].marks[i],roots[0],model.frames[frameIndex].ink);
      var b=model.geometry.zone.bounds,boundary=model.profile.boundary;
      if(boundary.visible){var boundaryCount=boundary.production?model.sequence.length:1;for(i=0;i<boundaryCount;i++){
        var line=roots[boundary.production?0:2].pathItems.rectangle(board[1]-pt(b.y),board[0]+pt(b.x),pt(b.w),pt(b.h));line.name='Print boundary'+(boundary.production?' / '+model.sequence[i].name:'');line.filled=false;line.stroked=true;line.strokeWidth=pt(boundary.stroke);line.strokeColor=boundary.production?spotColors[model.sequence[i].name]:rgb(boundary.color);
      }}
      var t=model.profile.text,tb=model.geometry.textBounds,textBounds=null;
      if(t.enabled){
        var text=roots[1].textFrames.add();text.contents=model.label.text;text.textRange.characterAttributes.textFont=app.textFonts.getByName(t.font);text.textRange.characterAttributes.size=t.size;
        var runs=[],rebuilt='',entries=model.label.entries;for(i=0;i<entries.length;i++)runs.push({text:(i===0?model.label.prefix:t.separator)+entries[i].text+(i===entries.length-1?model.label.suffix:''),ink:entries[i].ink});
        for(i=0;i<runs.length;i++)rebuilt+=runs[i].text;if(rebuilt!==model.label.text||text.textRange.characters.length!==rebuilt.length)throw Error('Frame legend character mapping failed; no approximate colors were used');
        var charIndex=0;for(i=0;i<runs.length;i++)for(var ri=0;ri<runs[i].text.length;ri++)text.textRange.characters[charIndex++].characterAttributes.fillColor=spotColors[runs[i].ink];
        var outlines=text.createOutline();outlines.name='Frame legend outlines';
        var foundInks={},inkBounds={};function checkOutlined(item){if(item.typename==='PathItem'){if(item.filled){var ink=BytebaseSpotInks.colorOf(item);if(!ink||Math.abs(ink.tint-100)>0.001||!spotColors[ink.name])throw Error('Outlined frame text lost its 100% matching Spot Color');foundInks[ink.name]=true;
            var vb=item.visibleBounds,range=inkBounds[ink.name];if(!range)range=inkBounds[ink.name]={left:vb[0],top:vb[1],right:vb[2],bottom:vb[3]};else{range.left=Math.min(range.left,vb[0]);range.top=Math.max(range.top,vb[1]);range.right=Math.max(range.right,vb[2]);range.bottom=Math.min(range.bottom,vb[3]);}}
          return;}
          if(item.typename==='GroupItem')for(var gi=0;gi<item.pageItems.length;gi++)checkOutlined(item.pageItems[gi]);
          else if(item.typename==='CompoundPathItem')for(var ci=0;ci<item.pathItems.length;ci++)checkOutlined(item.pathItems[ci]);}
        checkOutlined(outlines);var priorInkBounds=null,expectedTextInks={};for(i=0;i<entries.length;i++){var entryInk=entries[i].ink,entryBounds=inkBounds[entryInk];expectedTextInks['$'+entryInk]=true;
          if(!foundInks[entryInk]||!entryBounds)throw Error('No outlined legend geometry for '+entryInk);
          if(priorInkBounds&&entryBounds.left<priorInkBounds.right-0.01)throw Error('Outlined frame legend segments overlap or are out of ink order at '+entryInk);
          priorInkBounds=entryBounds;}
        for(var usedInk in foundInks)if(foundInks.hasOwnProperty(usedInk)&&(!inkBounds[usedInk]||!expectedTextInks['$'+usedInk]))throw Error('Outlined frame legend contains unexpected ink '+usedInk);
        if(t.rotation===90)outlines.rotate(-90);
        var actual=boundsMM(outlines,board);if(actual.w>tb.w+0.001||actual.h>tb.h+0.001)throw Error('Frame text does not fit reserved area. Increase the label area or reduce font size; artwork was not scaled.');
        var dx=0;if(t.rotation!==90){if(t.align==='center')dx=(tb.w-actual.w)/2;else if(t.align==='right')dx=tb.w-actual.w;}
        outlines.translate(pt(tb.x+dx-actual.x),-pt(tb.y-actual.y));textBounds=boundsMM(outlines,board);
        if(!BytebaseSetup.inside(textBounds,tb))throw Error('Illustrator text exceeded its reserved area');
      }
      // Verify actual mark and label bounds against actual linked artwork, not only planned boxes.
      for(var si=0;si<src.placedItems.length;si++){
        var sourceBounds=boundsMM(src.placedItems[si],board);
        for(var mi=0;mi<roots[0].pathItems.length;mi++)if(roots[0].pathItems[mi].name.indexOf('Print boundary')!==0&&BytebaseSetup.intersects(sourceBounds,boundsMM(roots[0].pathItems[mi],board)))throw Error('Actual Illustrator mark overlaps linked artwork');
        for(var bk=0;bk<model.geometry.boundaryKeepouts.length;bk++)if(BytebaseSetup.intersects(sourceBounds,model.geometry.boundaryKeepouts[bk]))throw Error('Printable boundary overlaps linked artwork');
        if(textBounds&&BytebaseSetup.intersects(sourceBounds,textBounds))throw Error('Actual Illustrator text overlaps linked artwork');
      }
      // Commit only after all geometry/font checks succeed. Existing layers are untouched on staging failure.
      for(i=0;i<3;i++)staged[i].name=names[i];
      var generated=[];for(i=0;i<3;i++)generated.push(fingerprint(staged[i],json));
      roots[0].note=json({owner:owner,layout:json(layout),source:fingerprint(src,json),generated:generated,production:request,sequence:model.sequence,frames:model.frames,spots:resolved.signature,ripReady:false});
      for(i=0;i<3;i++)if(existing[i]){existing[i].locked=false;existing[i].remove();}
      committed=true;doc.activeLayer=src;
      return {marks:model.geometry.marks.length,text:model.label.text,textBounds:textBounds,sequence:model.sequence,spotDefinitions:resolved.signature,warning:'Working Illustrator sheet only — NOT RIP-ready'};
    }finally{
      if(!committed){for(var li=staged.length-1;li>=0;li--)try{staged[li].remove();}catch(ignore){}for(li=createdSpots.length-1;li>=0;li--)try{createdSpots[li].remove();}catch(ignore3){}try{doc.activeLayer=originalActive;}catch(ignore2){}}
    }
  }
  return {prepare:prepare,apply:apply,fingerprint:fingerprint};
}());
