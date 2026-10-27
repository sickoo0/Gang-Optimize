/* Resolve the actual Illustrator Spot objects imported with linked PDFs. */
var BytebaseSpotInks=(function(){
  function alternate(spot){var c=spot.color;if(c.typename==='CMYKColor')return {space:'CMYK',values:[c.cyan,c.magenta,c.yellow,c.black]};
    if(c.typename==='RGBColor')return {space:'RGB',values:[c.red*100/255,c.green*100/255,c.blue*100/255]};return null;}
  function describe(spot){var a=alternate(spot);return {name:spot.name,colorType:String(spot.colorType),kind:String(spot.spotKind),alternate:a};}
  function matches(spot,definition){var a=alternate(spot);if(!a||a.space!==definition.space||a.values.length!==definition.values.length)return false;
    if(definition.space==='CMYK'&&spot.spotKind!==SpotColorKind.SPOTCMYK)return false;
    if(definition.space==='RGB'&&spot.spotKind!==SpotColorKind.SPOTRGB)return false;
    for(var i=0;i<a.values.length;i++)if(Math.abs(a.values[i]-definition.values[i])>0.1)return false;return true;}
  function sameSourceAlternate(ink,definition){var a=ink.alternate;if(!a||a.space!==definition.space||a.values.length!==definition.values.length)return false;
    for(var i=0;i<a.values.length;i++)if(Math.abs(a.values[i]*100-definition.values[i])>0.05)return false;return true;}
  function resolve(doc,sequence,profile,created,json){var result={},signature=[];
    for(var i=0;i<sequence.length;i++){
      var ink=sequence[i],name=ink.name,definition=profile.inks.spots[name],found=null,count=0;
      for(var j=0;j<doc.spots.length;j++)if(doc.spots[j].name===name){found=doc.spots[j];count++;}
      if(count>1)throw Error('Multiple Illustrator spots named '+name+'; resolve the ambiguity in the source artwork');
      for(j=0;j<doc.swatches.length;j++)if(doc.swatches[j].name===name&&doc.swatches[j].color.typename!=='SpotColor')
        throw Error('A process swatch is named '+name+'; resolve the color conflict before creating the sheet');
      if(!found){
        if(!definition||definition.space!=='CMYK'||!ink.source||ink.source.indexOf('PDF ')!==0||!sameSourceAlternate(ink,definition))
          throw Error('No matching source Spot Color for '+name+'. Inspect the linked PDF and verify its exact spot definition; no approximate swatch was created.');
        var c=new CMYKColor();c.cyan=definition.values[0];c.magenta=definition.values[1];c.yellow=definition.values[2];c.black=definition.values[3];
        found=doc.spots.add();created.push(found);found.name=name;found.colorType=ColorModel.SPOT;found.color=c;
      }
      if(found.colorType!==ColorModel.SPOT)throw Error(name+' is not an Illustrator Spot Color');
      if(definition&&!matches(found,definition))throw Error(name+' source Spot Color does not match profile '+definition.space+' '+definition.values.join('/')+'; found '+String(found.spotKind)+' '+(alternate(found)?alternate(found).values.join('/'):'unknown')+'. Correct the source or use an explicitly approved profile.');
      result[name]=found;signature.push(describe(found));
    }
    signature.sort(function(a,b){return a.name<b.name?-1:a.name>b.name?1:0;});
    return {spots:result,signature:json(signature)};
  }
  function fill(spot){var c=new SpotColor();c.spot=spot;c.tint=100;return c;}
  function colorOf(item){if(!item.filled)return null;var c=item.fillColor;return c.typename==='SpotColor'?{name:c.spot.name,tint:c.tint}:null;}
  return {resolve:resolve,fill:fill,colorOf:colorOf,describe:describe};
}());
