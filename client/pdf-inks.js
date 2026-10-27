/* Read-only PDF object inspection. Resource presence does NOT prove use on a page. */
(function(root){
  async function inspect(bytes,lib){
    lib=lib||root.PDFLib;
    if(bytes.length>50*1024*1024)throw Error('PDF exceeds 50 MB analysis limit; verify inks manually');
    var doc=await lib.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true}),ctx=doc.context,seen=new Set(),inks=new Map();
    function name(v){return v instanceof lib.PDFName?v.decodeText():null;}
    function lookup(v){return ctx.lookup(v);}
    function visit(obj,depth){
      if(depth>80)throw Error('PDF object nesting limit; verify manually');obj=lookup(obj);if(!obj||seen.has(obj))return;seen.add(obj);
      if(seen.size>100000)throw Error('PDF analysis object limit; verify manually');
      if(obj instanceof lib.PDFArray){
        var type=name(lookup(obj.get(0)));
        if(type==='Separation'||type==='DeviceN'){
          var names=lookup(obj.get(1)),list=type==='Separation'?[names]:names instanceof lib.PDFArray?names.asArray():[],alternate=null;
          var space=name(lookup(obj.get(2))),fn=lookup(obj.get(3));
          if(type==='Separation'&&fn instanceof lib.PDFDict){
            var ft=lookup(fn.get(lib.PDFName.of('FunctionType'))),c1=lookup(fn.get(lib.PDFName.of('C1')));
            if(ft&&ft.asNumber&&ft.asNumber()===2&&c1 instanceof lib.PDFArray&&(space==='DeviceCMYK'||space==='DeviceRGB')){
              var values=c1.asArray().map(function(n){return lookup(n).asNumber();});
              if(values.length===(space==='DeviceCMYK'?4:3)&&values.every(function(n){return Number.isFinite(n)&&n>=0&&n<=1;}))alternate={space:space==='DeviceCMYK'?'CMYK':'RGB',values:values};
            }
          }
          list.forEach(function(n){var ink=name(lookup(n));if(!ink||ink==='None'||ink==='All')return;
            if(inks.has(ink)){var previous=inks.get(ink),a=previous.alternate,b=alternate;if(a&&b&&(a.space!==b.space||JSON.stringify(a.values)!==JSON.stringify(b.values)))previous.conflict=true;else if(!a&&b)previous.alternate=b;}
            else inks.set(ink,{name:ink,alternate:alternate,source:'PDF '+type+' color-space candidate'});
          });
        }
        obj.asArray().forEach(function(v){visit(v,depth+1);});
      }else if(obj instanceof lib.PDFDict)obj.entries().forEach(function(pair){visit(pair[1],depth+1);});
      else if(obj.dict)visit(obj.dict,depth+1);
    }
    ctx.enumerateIndirectObjects().forEach(function(pair){visit(pair[1],0);});
    return {inks:Array.from(inks.values()),verified:false,pages:doc.getPageCount(),status:'manual-verification',
      message:'PDF color-space candidates only. Confirm used inks and process colors on the placed page; unused resources, images, transparency and tint functions are not separation-validated.'};
  }
  var api={inspect:inspect};root.BytebasePDFInks=api;if(typeof module==='object'&&module.exports)module.exports=api;
}(typeof window!=='undefined'?window:this));
