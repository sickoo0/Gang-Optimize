/* ES3-compatible production model, shared by CEP, Node and Illustrator. Units: mm, y down. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.BytebaseSetup=api;if(typeof $!=='undefined'&&$.global)$.global.BytebaseSetup=api;}(typeof window!=='undefined'?window:this,function(){
  function clone(v){if(v===null||typeof v!=='object')return v;var out=v instanceof Array?[]:{};for(var k in v)if(v.hasOwnProperty(k)){if(k==='__proto__'||k==='constructor'||k==='prototype')throw Error('Unsafe property');out[k]=clone(v[k]);}return out;}
  function number(v,min,max,label){if(typeof v!=='number'||!isFinite(v)||v<min||v>max)throw Error('Invalid '+label);return v;}
  function text(v,label){if(typeof v!=='string'||!v.length||v.length>200||/[\x00-\x1f]/.test(v))throw Error('Invalid '+label);return v;}
  function one(v,values,label){if(('|'+values.join('|')+'|').indexOf('|'+v+'|')<0)throw Error('Invalid '+label);}
  function rect(x,y,w,h){return {x:x,y:y,w:w,h:h};}
  function intersects(a,b){return a.x<b.x+b.w-0.000001&&a.x+a.w>b.x+0.000001&&a.y<b.y+b.h-0.000001&&a.y+a.h>b.y+0.000001;}
  function inside(a,b){return a.x>=b.x-0.00001&&a.y>=b.y-0.00001&&a.x+a.w<=b.x+b.w+0.00001&&a.y+a.h<=b.y+b.h+0.00001;}
  function mark(id,anchor,x,y,type){return {id:id,type:type||'target',anchor:anchor,x:x,y:y,width:6,height:6,stroke:0.2,rotation:0,production:true,visible:true,everyFrame:true,frames:[],group:'registration',repeat:{count:1,dx:0,dy:0}};}
  function defaults(){
    var p={schemaVersion:2,id:'mascot',name:'MASCOT — Single Frame',calibration:'Provisional: calibrate against approved InDesign/IDML template',
      sheet:{width:700,height:500,edge:20,cutMargin:0},zones:[{id:'main',reference:'print'}],references:{},assets:{},
      marks:[mark('left-upper','sheet:top-left',10,35),mark('left-second','sheet:top-left',10,65),mark('right-upper','sheet:top-right',-10,35),mark('right-second','sheet:top-right',-10,65),mark('left-bottom','sheet:bottom-left',10,-10),mark('right-bottom','sheet:bottom-right',-10,-10),mark('left-dot','sheet:left',10,0,'dot'),mark('right-dot','sheet:right',-10,0,'dot')],
      boundary:{visible:true,production:false,color:'#df3dce',stroke:0.2},
      text:{enabled:true,zone:'main',anchor:'sheet:bottom-left',x:20,y:-15,width:660,height:10,font:'ArialMT',size:10,align:'left',rotation:0,mode:'full',legend:'repeat',separator:'  ',format:'{index}/{total} {ink}',prefix:'',suffix:'',displayColors:true,showJob:false,showSheet:false,showRuns:false},
      inks:{aliases:{'White-BG':'White-BG',Lim:'Lim'},labels:{'White-BG':'hvid',Lim:'lim'},tail:['White-BG','Lim'],lockTail:true,required:[],missing:'warn',colors:{'White-BG':'#ffffff',Lim:'#ffff00'}},frameName:'{index}-{ink}',exportOptions:{ripEnabled:false,pipeline:'unverified'},company:{}};
    p.marks[6].width=p.marks[6].height=p.marks[7].width=p.marks[7].height=1;
    var g=clone(p);g.id='generic';g.name='Generic — Simple';g.calibration='Configure and validate for your press';g.marks=[mark('top-left','sheet:top-left',10,10,'cross'),mark('bottom-right','sheet:bottom-right',-10,-10,'cross')];g.inks={aliases:{},labels:{},tail:[],lockTail:false,required:[],missing:'warn',colors:{}};
    var c=clone(g);c.id='custom';c.name='Custom Company Profile';return [p,g,c];
  }
  function migrate(p){p=clone(p);if(p.schemaVersion===1){p.schemaVersion=2;if(!p.references)p.references={};if(!p.assets)p.assets={};if(!p.zones)p.zones=[{id:'main',reference:'print'}];}if(p.schemaVersion!==2)throw Error('Unsupported profile version');return p;}
  function sheet(p){return rect(0,0,p.sheet.width,p.sheet.height);}
  function printArea(p){var s=p.sheet;return rect(s.edge,s.edge,s.width-2*s.edge,s.height-2*s.edge);}
  function anchor(p,name){
    if(p.references.hasOwnProperty(name))return {x:p.references[name].x,y:p.references[name].y};
    var parts=name.split(':'),r=parts[0]==='sheet'?sheet(p):printArea(p),side=parts[1];
    if(parts[0]!=='sheet'&&parts[0]!=='print'&&parts[0]!=='main')throw Error('Unknown anchor '+name);
    one(side,['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right'],'anchor '+name);
    // ExtendScript mis-evaluates nested ternaries inside arithmetic expressions.
    var dx=r.w/2,dy=r.h/2;if(side.indexOf('left')>=0)dx=0;else if(side.indexOf('right')>=0)dx=r.w;
    if(side.indexOf('top')>=0)dy=0;else if(side.indexOf('bottom')>=0)dy=r.h;
    return {x:r.x+dx,y:r.y+dy};
  }
  function validate(raw){
    var p=migrate(raw),s=p.sheet,i,m,ids={};text(p.id,'profile ID');text(p.name,'profile name');
    number(s.width,50,2000,'sheet width');number(s.height,50,2000,'sheet height');number(s.edge,0,Math.min(200,Math.min(s.width,s.height)/2-1),'edge');number(s.cutMargin,0,50,'cut margin');
    if(!p.zones||p.zones.length!==1||p.zones[0].id!=='main'||p.zones[0].reference!=='print')throw Error('Only the main single-frame production zone is supported');
    for(var ref in p.references)if(p.references.hasOwnProperty(ref)){number(p.references[ref].x,0,s.width,'reference x');number(p.references[ref].y,0,s.height,'reference y');}
    if(!(p.marks instanceof Array)||p.marks.length>100)throw Error('Maximum 100 marks');
    for(var a in p.assets)if(p.assets.hasOwnProperty(a))parseSVG(p.assets[a]);
    for(i=0;i<p.marks.length;i++){m=p.marks[i];text(m.id,'mark ID');if(ids['$'+m.id])throw Error('Duplicate mark ID');ids['$'+m.id]=true;
      one(m.type,['cross','target','dot','tick','svg'],'mark type');anchor(p,m.anchor);number(m.x,-2000,2000,'mark x');number(m.y,-2000,2000,'mark y');number(m.width,0.1,300,'mark width');number(m.height,0.1,300,'mark height');number(m.stroke,0.01,5,'mark stroke');number(m.rotation,-360,360,'rotation');
      if(typeof m.production!=='boolean'||typeof m.visible!=='boolean'||typeof m.everyFrame!=='boolean'||!(m.frames instanceof Array))throw Error('Invalid mark visibility');
      if(!m.everyFrame&&!m.frames.length&&m.production)throw Error('Select explicit frame names for marks not on every frame');
      number(m.repeat.count,1,50,'repeat count');if(Math.floor(m.repeat.count)!==m.repeat.count)throw Error('Repeat count must be whole');number(m.repeat.dx,-2000,2000,'repeat x');number(m.repeat.dy,-2000,2000,'repeat y');
      if(m.type==='svg'&&!p.assets.hasOwnProperty(m.asset))throw Error('Missing validated SVG asset');
    }
    var t=p.text;anchor(p,t.anchor);text(t.font,'PostScript font name');number(t.size,3,100,'font size');number(t.x,-2000,2000,'text x');number(t.y,-2000,2000,'text y');number(t.width,1,2000,'text width');number(t.height,1,2000,'text height');one(t.rotation,[0,90],'text orientation');one(t.align,['left','center','right'],'text alignment');one(t.mode,['full','current'],'text mode');one(t.legend,['repeat','per-ink'],'legend assignment');
    if(t.zone!=='main'||typeof t.enabled!=='boolean')throw Error('Invalid text zone');
    for(i=0;i<5;i++){var key=['format','prefix','suffix','separator','font'][i];if(typeof t[key]!=='string'||t[key].length>200||/[\x00-\x1f]/.test(t[key]))throw Error('Invalid text '+key);}
    if(t.format.indexOf('{index}')<0||t.format.indexOf('{total}')<0||t.format.indexOf('{ink}')<0)throw Error('Text format must contain {index}, {total} and {ink}');
    one(p.inks.missing,['warn','block'],'missing ink policy');if(!(p.inks.tail instanceof Array)||!(p.inks.required instanceof Array)||typeof p.inks.lockTail!=='boolean')throw Error('Invalid ink rules');
    for(i=0;i<p.inks.tail.length;i++)text(p.inks.tail[i],'special ink');for(i=0;i<p.inks.required.length;i++)text(p.inks.required[i],'required ink');
    text(p.frameName,'frame name');if(p.frameName.indexOf('{index}')<0||p.frameName.indexOf('{ink}')<0)throw Error('Frame naming requires {index} and {ink}');
    for(i=0;i<4;i++)if(typeof t[['displayColors','showJob','showSheet','showRuns'][i]]!=='boolean')throw Error('Invalid text visibility option');
    for(var k in p.inks.aliases)if(p.inks.aliases.hasOwnProperty(k)){text(k,'alias');text(p.inks.aliases[k],'alias destination');}
    for(k in p.inks.colors)if(p.inks.colors.hasOwnProperty(k)&&!/^#[0-9a-f]{6}$/i.test(p.inks.colors[k]))throw Error('Use #rrggbb display colors');
    if(!/^#[0-9a-f]{6}$/i.test(p.boundary.color)||typeof p.boundary.visible!=='boolean'||typeof p.boundary.production!=='boolean')throw Error('Invalid boundary');number(p.boundary.stroke,0.01,5,'boundary stroke');
    if(p.exportOptions.ripEnabled!==false)throw Error('RIP export has not been validated and cannot be enabled');
    geometry(p);return p;
  }
  // Deliberately small SVG dialect: no paths/transforms/CSS/references. All accepted curves are exact cubic vectors.
  function parseSVG(source){
    if(typeof source!=='string'||source.length>50000||/<!|<\?|&/.test(source))throw Error('SVG: declarations, entities and executable content are not supported');
    var tokens=source.match(/<[^>]*>/g)||[],rest=source.replace(/<[^>]*>/g,'');if(/\S/.test(rest))throw Error('SVG: unsupported text');
    var parts=[],vb=null,closed=false;
    for(var i=0;i<tokens.length;i++){
      var tag=/^<\s*(\/)?([a-zA-Z]+)([\s\S]*?)\s*(\/?)>$/.exec(tokens[i]);if(!tag)throw Error('SVG: invalid element');
      if(tag[1]){if(tag[2]!=='svg'||i!==tokens.length-1)throw Error('SVG: only self-closing geometry supported');closed=true;continue;}
      var kind=tag[2],attrs={},str=tag[3],re=/([a-zA-Z][\w:-]*)\s*=\s*(["'])(.*?)\2/g,match,consumed='';
      while((match=re.exec(str))){if(attrs.hasOwnProperty(match[1]))throw Error('SVG: duplicate attribute');attrs[match[1]]=match[3];consumed+=match[0];}
      if(/\S/.test(str.replace(re,'')))throw Error('SVG: malformed attributes');
      var attrsByType={svg:['xmlns','viewBox','width','height'],line:['x1','y1','x2','y2'],rect:['x','y','width','height'],circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry']};
      if(!attrsByType[kind])throw Error('SVG: unsupported element '+kind);
      var allowed=attrsByType[kind].concat(kind==='svg'?[]:['fill','stroke','stroke-width']);
      for(var key in attrs)if(attrs.hasOwnProperty(key)&&('|'+allowed.join('|')+'|').indexOf('|'+key+'|')<0)throw Error('SVG: unsupported attribute '+key);
      if(kind==='svg'){
        if(i!==0||!attrs.viewBox)throw Error('SVG: root viewBox required');vb=attrs.viewBox.replace(/^\s+|\s+$/g,'').split(/[ ,]+/);for(var vn=0;vn<vb.length;vn++)vb[vn]=Number(vb[vn]);
        if(vb.length!==4||!isFinite(vb[0])||!isFinite(vb[1])||!(vb[2]>0&&vb[3]>0))throw Error('SVG: invalid viewBox');
        if(attrs.xmlns&&attrs.xmlns!=='http://www.w3.org/2000/svg')throw Error('SVG: invalid namespace');
        for(var di=0;di<2;di++){var dimension=attrs[di?'height':'width'];if(dimension&&(!/^\d+(\.\d+)?(mm|px)?$/.test(dimension)||parseFloat(dimension)<=0))throw Error('SVG: unsupported dimensions');}continue;
      }
      if(!vb||!tag[4])throw Error('SVG: self-closing geometry required');one(kind,['line','rect','circle','ellipse'],'SVG geometry');
      function val(n,d){var v=attrs[n]==null?d:Number(attrs[n]);if(!isFinite(v))throw Error('SVG: invalid '+n);return v;}
      var fill=attrs.fill||'black',stroke=attrs.stroke||'none';one(fill,['none','black','#000','#000000'],'SVG fill');one(stroke,['none','black','#000','#000000'],'SVG stroke');
      var part={kind:kind,fill:fill!=='none',stroke:stroke!=='none',strokeWidth:val('stroke-width',1)};
      if(part.strokeWidth<0||part.strokeWidth>Math.max(vb[2],vb[3]))throw Error('SVG: invalid stroke width');
      if(kind==='line'){part.points=[[val('x1',0),val('y1',0)],[val('x2',0),val('y2',0)]];part.fill=false;}
      else if(kind==='rect'){part.box=rect(val('x',0),val('y',0),val('width',NaN),val('height',NaN));if(attrs.rx||attrs.ry)throw Error('SVG: rounded rectangle unsupported');}
      else{var rx=kind==='circle'?val('r',NaN):val('rx',NaN),ry=kind==='circle'?rx:val('ry',NaN);part.box=rect(val('cx',0)-rx,val('cy',0)-ry,2*rx,2*ry);}
      var expansion=part.stroke?part.strokeWidth/2:0;
      if(part.box&&(!(part.box.w>0&&part.box.h>0)||!inside(rect(part.box.x-expansion,part.box.y-expansion,part.box.w+2*expansion,part.box.h+2*expansion),rect(vb[0],vb[1],vb[2],vb[3]))))throw Error('SVG geometry/stroke exceeds viewBox');
      if(part.points)for(var pi=0;pi<part.points.length;pi++)if(!inside(rect(part.points[pi][0],part.points[pi][1],0,0),rect(vb[0],vb[1],vb[2],vb[3])))throw Error('SVG line exceeds viewBox');
      if(!part.fill&&!part.stroke)throw Error('SVG: invisible geometry is unsupported');parts.push(part);if(parts.length>100)throw Error('SVG: too many elements');
    }
    if(!closed||!parts.length)throw Error('SVG: incomplete or empty mark');return {viewBox:vb,parts:parts};
  }
  function vertices(part){var b=part.box,pts=[],i,k=0.5522847498307936;
    if(part.points){for(i=0;i<part.points.length;i++)pts.push({a:part.points[i],l:part.points[i],r:part.points[i]});return pts;}
    if(part.kind==='rect'){var corners=[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]];for(i=0;i<4;i++)pts.push({a:corners[i],l:corners[i],r:corners[i]});return pts;}
    var x=b.x+b.w/2,y=b.y+b.h/2,rx=b.w/2,ry=b.h/2;
    return [{a:[x+rx,y],l:[x+rx,y-k*ry],r:[x+rx,y+k*ry]},{a:[x,y+ry],l:[x+k*rx,y+ry],r:[x-k*rx,y+ry]},{a:[x-rx,y],l:[x-rx,y+k*ry],r:[x-rx,y-k*ry]},{a:[x,y-ry],l:[x-k*rx,y-ry],r:[x+k*rx,y-ry]}];
  }
  function geometry(p){
    var marks=[],keepouts=[],s=sheet(p),area=printArea(p);
    for(var i=0;i<p.marks.length;i++){
      var m=p.marks[i];if(!m.visible)continue;var parts=[],a=anchor(p,m.anchor),w=m.width,h=m.height;
      if(m.type==='svg'){
        var svg=parseSVG(p.assets[m.asset]),v=svg.viewBox,scale=Math.min(w/v[2],h/v[3]);
        for(var n=0;n<svg.parts.length;n++){var sp=clone(svg.parts[n]);if(sp.box)sp.box=rect((sp.box.x-v[0]-v[2]/2)*scale,(sp.box.y-v[1]-v[3]/2)*scale,sp.box.w*scale,sp.box.h*scale);
          if(sp.points)for(var q=0;q<sp.points.length;q++)sp.points[q]=[(sp.points[q][0]-v[0]-v[2]/2)*scale,(sp.points[q][1]-v[1]-v[3]/2)*scale];sp.strokeWidth*=scale;parts.push(sp);}
      }else{
        if(m.type==='cross'||m.type==='target'||m.type==='tick')parts.push({kind:'line',points:[[-w/2,0],[w/2,0]],stroke:true,fill:false,strokeWidth:m.stroke});
        if(m.type==='cross'||m.type==='target')parts.push({kind:'line',points:[[0,-h/2],[0,h/2]],stroke:true,fill:false,strokeWidth:m.stroke});
        if(m.type==='target'||m.type==='dot')parts.push({kind:'ellipse',box:rect(-w/2,-h/2,w,h),stroke:m.type==='target',fill:m.type==='dot',strokeWidth:m.stroke});
      }
      for(var ri=0;ri<m.repeat.count;ri++){
        var paths=[],minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,r=m.rotation*Math.PI/180,cx=a.x+m.x+ri*m.repeat.dx,cy=a.y+m.y+ri*m.repeat.dy;
        function transform(v){return [cx+v[0]*Math.cos(r)-v[1]*Math.sin(r),cy+v[0]*Math.sin(r)+v[1]*Math.cos(r)];}
        for(var j=0;j<parts.length;j++){var part=parts[j],vs=vertices(part),stroke=part.stroke?part.strokeWidth/2:0;
          for(var vi=0;vi<vs.length;vi++)for(var ci=0;ci<3;ci++){var key=['a','l','r'][ci],point=transform(vs[vi][key]);vs[vi][key]=point;minX=Math.min(minX,point[0]-stroke);minY=Math.min(minY,point[1]-stroke);maxX=Math.max(maxX,point[0]+stroke);maxY=Math.max(maxY,point[1]+stroke);}
          paths.push({vertices:vs,closed:part.kind!=='line',fill:part.fill,stroke:part.stroke,strokeWidth:part.strokeWidth});
        }
        var bounds=rect(minX,minY,maxX-minX,maxY-minY);if(!inside(bounds,s))throw Error('Mark '+m.id+' exceeds physical sheet');
        var item={id:m.id+'-'+ri,group:m.group,production:m.production,everyFrame:m.everyFrame,frames:clone(m.frames),paths:paths,bounds:bounds};marks.push(item);if(m.production&&intersects(bounds,area))keepouts.push(bounds);
      }
    }
    var t=p.text,at=anchor(p,t.anchor),tb=rect(at.x+t.x,at.y+t.y,t.rotation===90?t.height:t.width,t.rotation===90?t.width:t.height);
    if(t.enabled&&!inside(tb,s))throw Error('Frame text exceeds physical sheet: '+[tb.x,tb.y,tb.w,tb.h].join(',')+' vs '+[s.x,s.y,s.w,s.h].join(','));if(t.enabled)keepouts.push(tb);
    var boundaryKeepouts=[];
    if(p.boundary.visible&&p.boundary.production){var half=p.boundary.stroke/2;
      boundaryKeepouts=[rect(area.x-half,area.y-half,area.w+2*half,2*half),rect(area.x-half,area.y+area.h-half,area.w+2*half,2*half),rect(area.x-half,area.y-half,2*half,area.h+2*half),rect(area.x+area.w-half,area.y-half,2*half,area.h+2*half)];
      for(var bk=0;bk<boundaryKeepouts.length;bk++){if(!inside(boundaryKeepouts[bk],s))throw Error('Printable boundary exceeds sheet');keepouts.push(boundaryKeepouts[bk]);}
    }
    return {sheet:s,zone:{id:'main',bounds:area},marks:marks,textBounds:tb,keepouts:keepouts,boundaryKeepouts:boundaryKeepouts,boundary:clone(p.boundary)};
  }
  function canonical(name,p){text(name,'ink name');name=String(name).replace(/^\s+|\s+$/g,'').replace(/\s+/g,' ');if(!name)throw Error('Empty ink name');
    if(p.inks.aliases.hasOwnProperty(name))name=p.inks.aliases[name];var m=/^(?:PANTONE\s+)?(\d+)\s*([CU])$/i.exec(name);return m?'PANTONE '+m[1]+' '+m[2].toUpperCase():name;}
  function swatch(ink,p){var c=p.inks.colors[ink.name];if(c)return c;var a=ink.alternate,rgb;if(a&&a.space==='CMYK'&&a.values.length===4){var v=a.values;rgb=[255*(1-v[0])*(1-v[3]),255*(1-v[1])*(1-v[3]),255*(1-v[2])*(1-v[3])];}else if(a&&a.space==='RGB'&&a.values.length===3)rgb=[a.values[0]*255,a.values[1]*255,a.values[2]*255];
    if(!rgb)return '#9099a3';var out='#';for(var i=0;i<3;i++){var n=Math.max(0,Math.min(255,Math.round(rgb[i])));out+=('0'+n.toString(16)).slice(-2);}return out;}
  function sequence(input,p){var out=[],seen={},tail=[],i,j;if(!(input instanceof Array)||input.length>200)throw Error('Maximum 200 ink entries');
    for(i=0;i<input.length;i++){var item=typeof input[i]==='string'?{name:input[i]}:clone(input[i]),raw=item.name;item.name=canonical(raw,p);if(seen['$'+item.name])continue;seen['$'+item.name]=true;item.sourceName=raw;item.label=p.inks.labels[item.name]||item.name.replace(/^PANTONE (\d+) ([CU])$/,function(_,n,c){return n+c.toLowerCase();});item.color=swatch(item,p);out.push(item);}
    if(p.inks.lockTail){for(i=0;i<p.inks.tail.length;i++)for(j=out.length-1;j>=0;j--)if(out[j].name===canonical(p.inks.tail[i],p))tail.push(out.splice(j,1)[0]);out=out.concat(tail);}
    var missing=[];for(i=0;i<p.inks.required.length;i++)if(!seen['$'+canonical(p.inks.required[i],p)])missing.push(p.inks.required[i]);
    return {inks:out,missing:missing,blocked:missing.length>0&&p.inks.missing==='block'};
  }
  function format(template,index,total,ink){return template.replace(/\{index\}/g,String(index)).replace(/\{total\}/g,String(total)).replace(/\{ink\}/g,ink);}
  function labels(seq,p,frame,meta){var t=p.text,entries=[],all=[],total=seq.length;for(var i=0;i<total;i++){var value=format(t.format,i+1,total,seq[i].label);all.push(value);if(t.mode==='full'||i===frame)entries.push({text:value,ink:seq[i].name,color:seq[i].color,index:i});}
    var extra='';meta=meta||{};if(t.showJob&&meta.job)extra+=' '+meta.job;if(t.showSheet&&meta.sheet)extra+=' '+meta.sheet;if(t.showRuns&&meta.runs)extra+=' '+meta.runs+' runs';
    var selected=[];for(i=0;i<entries.length;i++)selected.push(entries[i].text);
    return {text:t.prefix+selected.join(t.separator)+t.suffix+extra,entries:entries,all:all.join(t.separator),prefix:t.prefix,suffix:t.suffix+extra};
  }
  function compose(raw,inks,layout,options){var p=validate(raw),g=geometry(p),seq=sequence(inks,p),o=options||{},frames=[],frame=Number(o.frame)||0;
    if(frame<0||frame>=Math.max(1,seq.inks.length)||Math.floor(frame)!==frame)throw Error('Invalid current frame');
    var errors=[],warnings=[];if(seq.missing.length)(seq.blocked?errors:warnings).push('Missing required inks: '+seq.missing.join(', '));if(!seq.inks.length)warnings.push('No verified ink sequence');if(!o.verified)warnings.push('Ink usage requires manual verification for every source PDF');
    for(var tm=0;tm<g.marks.length;tm++)if(p.text.enabled&&g.marks[tm].production&&intersects(g.marks[tm].bounds,g.textBounds))errors.push('Frame text overlaps mark '+g.marks[tm].id);
    if(layout){var s=layout.settings;if(s.sheetW!==p.sheet.width||s.sheetH!==p.sheet.height||s.edge!==p.sheet.edge||s.inset!==p.sheet.cutMargin)errors.push('Profile geometry changed: recalculate layout');
      var ps=layout.sheets[0].placements;for(var i=0;i<ps.length;i++)for(var k=0;k<g.keepouts.length;k++)if(intersects(ps[i],g.keepouts[k]))errors.push('Production mark/text collides with '+ps[i].fileName);
    }
    for(var f=0;f<seq.inks.length;f++){var fm=[];for(var mi=0;mi<g.marks.length;mi++){var mark=g.marks[mi];if(mark.production&&(mark.everyFrame||('|'+mark.frames.join('|')+'|').indexOf('|'+seq.inks[f].name+'|')>=0))fm.push(mark);}
      var fp=clone(p);if(fp.text.legend==='per-ink')fp.text.mode='current';frames.push({name:format(p.frameName,f+1,seq.inks.length,seq.inks[f].name),ink:seq.inks[f].name,marks:fm,label:labels(seq.inks,fp,f,o.meta)});}
    return {version:1,profile:p,geometry:g,sequence:seq.inks,frames:frames,label:labels(seq.inks,p,frame,o.meta),currentFrame:frame,verified:!!o.verified,errors:errors,warnings:warnings,ripReady:false};
  }
  return {clone:clone,defaults:defaults,validate:validate,migrate:migrate,geometry:geometry,parseSVG:parseSVG,canonical:canonical,sequence:sequence,labels:labels,compose:compose,intersects:intersects,inside:inside,swatch:swatch};
}));
