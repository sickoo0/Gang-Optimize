/* Production Setup owns profiles/inks; the optimizer remains an independent consumer of sheet settings. */
(function(){
  var S=window.BytebaseSetup,$=function(id){return document.getElementById(id);};
  window.BytebaseSetupUI=function(api,saved){
    var profiles=S.defaults(),selected='mascot',inks=[],verified=false,frame=0,reports={},drag=null,lastJobs='',busy=false,recovery=null;
    if(saved){try{profiles=saved.profiles.map(S.validate);selected=saved.selected;inks=saved.inks||[];verified=!!saved.verified;frame=saved.frame||0;reports=saved.reports||{};lastJobs=saved.jobsKey||'';recovery=saved.recovery||null;}catch(e){recovery=saved;api.status('Saved production setup requires repair: '+e.message,'error');}}
    else{var old=api.settings();profiles[0].sheet={width:old.sheetW,height:old.sheetH,edge:old.edge,cutMargin:old.inset};}
    function current(){return profiles.filter(function(p){return p.id===selected;})[0]||profiles[0];}
    function snapshot(){return {version:1,profiles:profiles,selected:selected,inks:inks,verified:verified,frame:frame,reports:reports,jobsKey:lastJobs,recovery:recovery};}
    function jobsKey(){return JSON.stringify(api.jobs().map(function(j){return [j.id,j.filePath,j.width,j.height];}));}
    function changedJobs(){var key=jobsKey(),changed=!!lastJobs&&lastJobs!==key;if(changed){verified=false;reports={};inks=[];}lastJobs=key;return changed;}
    function payload(strict){changedJobs();var options={verified:verified,frame:frame,meta:{job:$('productionJob').value,sheet:$('productionSheet').value,runs:api.layout()?api.layout().sheets[0].printingRuns:0}},p=S.clone(current());
      // The existing Sheet Settings remain editable; preserve their actual cut margin.
      var s=api.settings();p.sheet={width:s.sheetW,height:s.sheetH,edge:s.edge,cutMargin:s.inset};current().sheet=S.clone(p.sheet);
      var model=S.compose(p,inks,api.layout(),options);
      if(strict){if(model.errors.length)throw Error(model.errors.join('; '));if(!verified||!model.sequence.length)throw Error('Verify the ink list in Production Setup before generating marks and text.');}
      return {profile:p,inks:S.clone(inks),options:options};
    }
    function model(){var p=payload(false);return S.compose(p.profile,p.inks,api.layout(),p.options);}
    function save(){api.save();}
    function options(){var node=$('productionProfile');node.innerHTML='';profiles.forEach(function(p){var o=document.createElement('option');o.value=p.id;o.textContent=p.name;node.appendChild(o);});node.value=current().id;}
    function refresh(){
      changedJobs();var p=current();$('profileName').value=p.name;$('profileEditor').value=JSON.stringify(p,null,2);$('frameTextMode').value=p.text.mode;$('showProductionGuides').checked=p.boundary.visible;$('lockSpecialInks').checked=p.inks.lockTail;$('lockSpecialInks').disabled=p.id==='mascot';
      $('markType').value=p.marks.length?p.marks[0].type:'cross';$('inkNames').value=inks.map(function(i){return typeof i==='string'?i:i.name;}).join('\n');$('verifyInks').checked=verified;
      var edited=$('editMark').value;$('editMark').innerHTML='';p.marks.forEach(function(m){var option=document.createElement('option');option.value=m.id;option.textContent=m.id;$('editMark').appendChild(option);});if(p.marks.some(function(m){return m.id===edited;}))$('editMark').value=edited;refreshMark();
      [['textFont','font'],['textSize','size'],['textWidth','width'],['textX','x'],['textY','y'],['textFormat','format'],['legendAssignment','legend']].forEach(function(pair){$(pair[0]).value=p.text[pair[1]];});
      var result;try{result=model();$('productionValidation').textContent=result.errors.concat(result.warnings).concat([p.calibration]).join('\n');$('productionValidation').className='helper production-report'+(result.errors.length?' production-error':'');$('frameLegend').textContent=result.label.text||'Confirm source inks to generate the frame legend.';}catch(e){$('productionValidation').textContent=e.message;$('productionValidation').className='helper production-report production-error';}
      $('currentFrame').innerHTML='';(result?result.sequence:[]).forEach(function(i,index){var o=document.createElement('option');o.value=index;o.textContent=(index+1)+' / '+result.sequence.length+' · '+i.name;$('currentFrame').appendChild(o);});$('currentFrame').value=String(frame);
      var list=$('inkSequence');list.innerHTML='';(result?result.sequence:[]).forEach(function(ink,index){
        var row=document.createElement('li'),swatch=document.createElement('span'),label=document.createElement('span'),up=document.createElement('button'),down=document.createElement('button');
        row.draggable=true;row.dataset.ink=ink.name;swatch.className='ink-swatch';swatch.style.backgroundColor=ink.color;label.textContent=ink.name+' → '+(index+1)+'/'+result.sequence.length+' '+ink.label;
        row.appendChild(swatch);row.appendChild(label);up.textContent='↑';down.textContent='↓';up.setAttribute('aria-label','Move '+ink.name+' up');down.setAttribute('aria-label','Move '+ink.name+' down');
        var locked=p.inks.lockTail&&p.inks.tail.indexOf(ink.name)>=0;up.disabled=down.disabled=locked;row.draggable=!locked;if(locked)row.title='Position locked by profile';
        function move(to){var ordered=result.sequence.map(S.clone),item=ordered.splice(index,1)[0];ordered.splice(Math.max(0,Math.min(to,ordered.length)),0,item);inks=ordered;changed(false);}
        up.onclick=function(){move(index-1);};down.onclick=function(){move(index+1);};row.ondragstart=function(){drag=index;};row.ondragover=function(e){e.preventDefault();};row.ondrop=function(e){e.preventDefault();if(drag===null||locked)return;var ordered=result.sequence.map(S.clone),item=ordered.splice(drag,1)[0];ordered.splice(index,0,item);inks=ordered;drag=null;changed(false);};
        row.appendChild(up);row.appendChild(down);list.appendChild(row);
      });
      $('inkReports').textContent=Object.keys(reports).map(function(k){return reports[k].name+': '+reports[k].message;}).join('\n');
      drawMarkPreview();
    }
    function changed(geometry){frame=Math.min(frame,Math.max(0,S.sequence(inks,current()).inks.length-1));if(geometry)api.invalidate();refresh();save();api.draw();}
    function geometryChanged(a,b){return JSON.stringify(a.sheet)!==JSON.stringify(b.sheet)||JSON.stringify(S.geometry(a).keepouts)!==JSON.stringify(S.geometry(b).keepouts);}
    function updateProfile(p){p=S.validate(p);var old=current(),geometry=geometryChanged(old,p);if(profiles.some(function(item){return item!==old&&item.id===p.id;}))throw Error('Profile ID already exists');if(JSON.stringify(old.inks.aliases)!==JSON.stringify(p.inks.aliases))verified=false;profiles[profiles.indexOf(old)]=p;selected=p.id;applySheet(p);options();changed(geometry);}
    function applySheet(p){[['sheetW',p.sheet.width],['sheetH',p.sheet.height],['edge',p.sheet.edge],['inset',p.sheet.cutMargin]].forEach(function(pair){$(pair[0]).value=pair[1];});}
    function safe(fn){return function(){try{var r=fn.apply(null,arguments);if(r&&r.catch)r.catch(function(e){api.status(e.message,'error');});}catch(e){api.status(e.message,'error');}};}
    function download(name,body,type){if(window.__adobe_cep__){api.host('saveProductionJSON',{name:name,body:body}).then(function(r){if(r.saved)api.status('JSON file saved.','success');}).catch(function(e){api.status(e.message,'error');});return;}
      var blob=new Blob([body],{type:type||'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
    function addProfile(p){p=S.validate(p);var geometry=geometryChanged(current(),p);p.id='company-'+Date.now();profiles.push(p);selected=p.id;applySheet(p);options();changed(geometry);}
    $('productionProfile').onchange=safe(function(){var old=current();selected=$('productionProfile').value;var geometry=geometryChanged(old,current());applySheet(current());verified=false;changed(geometry);});
    $('newProfile').onclick=safe(function(){var p=S.defaults()[2];p.name=$('profileName').value||'New company';addProfile(p);});
    $('duplicateProfile').onclick=safe(function(){var p=S.clone(current());p.name+=' copy';addProfile(p);});
    $('renameProfile').onclick=safe(function(){var p=S.clone(current());p.name=$('profileName').value;updateProfile(p);});
    $('saveProfile').onclick=safe(function(){updateProfile(JSON.parse($('profileEditor').value));api.status('Company profile saved.','success');});
    $('resetProfile').onclick=safe(function(){var original=S.defaults().filter(function(p){return p.id===selected;})[0];if(!original){original=S.defaults()[2];original.id=selected;original.name=current().name;}updateProfile(original);});
    $('exportProfile').onclick=safe(function(){download(current().id+'.json',JSON.stringify(S.validate(current()),null,2));});
    $('exportRecovery').onclick=safe(function(){if(!recovery)throw Error('No damaged setup to recover');download('production-setup-recovery.json',JSON.stringify(recovery,null,2));});
    function readFile(input,fn){input.onchange=safe(async function(){var file=input.files[0];if(!file)return;if(file.size>1000000)throw Error('Profile/SVG file too large');fn(await file.text());input.value='';});}
    readFile($('importProfile'),function(body){addProfile(JSON.parse(body));});
    readFile($('importMarkSVG'),function(body){S.parseSVG(body);var p=S.clone(current());p.assets.imported=body;p.marks.forEach(function(m){if(m.group==='registration'){m.type='svg';m.asset='imported';}});updateProfile(p);});
    $('markType').onchange=safe(function(){var type=$('markType').value;if(type==='svg'&&!current().assets.imported)throw Error('Import an SVG before selecting custom SVG');var p=S.clone(current());p.marks.forEach(function(m){if(m.group==='registration'){m.type=type;if(type==='svg')m.asset='imported';}});updateProfile(p);});
    $('frameTextMode').onchange=safe(function(){var p=S.clone(current());p.text.mode=$('frameTextMode').value;updateProfile(p);});
    $('showProductionGuides').onchange=safe(function(){var p=S.clone(current());p.boundary.visible=$('showProductionGuides').checked;updateProfile(p);});
    $('lockSpecialInks').onchange=safe(function(){var p=S.clone(current());p.inks.lockTail=$('lockSpecialInks').checked;updateProfile(p);});
    function refreshMark(){var m=current().marks.filter(function(m){return m.id===$('editMark').value;})[0];if(!m)return;[['markWidth','width'],['markHeight','height'],['markX','x'],['markY','y'],['markStroke','stroke'],['markRotation','rotation'],['markAnchor','anchor']].forEach(function(pair){$(pair[0]).value=m[pair[1]];});$('markPrintable').checked=m.production;$('markVisible').checked=m.visible;}
    $('editMark').onchange=refreshMark;
    $('saveMark').onclick=safe(function(){var p=S.clone(current()),m=p.marks.filter(function(m){return m.id===$('editMark').value;})[0];if(!m)throw Error('Add a mark first');[['markWidth','width'],['markHeight','height'],['markX','x'],['markY','y'],['markStroke','stroke'],['markRotation','rotation']].forEach(function(pair){m[pair[1]]=Number($(pair[0]).value);});m.anchor=$('markAnchor').value;m.production=$('markPrintable').checked;m.visible=$('markVisible').checked;updateProfile(p);});
    $('addMark').onclick=safe(function(){var p=S.clone(current()),m=S.clone(S.defaults()[1].marks[0]);m.id='mark-'+Date.now();p.marks.push(m);updateProfile(p);$('editMark').value=m.id;refreshMark();});
    $('removeMark').onclick=safe(function(){var p=S.clone(current());p.marks=p.marks.filter(function(m){return m.id!==$('editMark').value;});updateProfile(p);});
    $('saveText').onclick=safe(function(){var p=S.clone(current());[['textFont','font'],['textFormat','format'],['legendAssignment','legend']].forEach(function(pair){p.text[pair[1]]=$(pair[0]).value;});[['textSize','size'],['textWidth','width'],['textX','x'],['textY','y']].forEach(function(pair){p.text[pair[1]]=Number($(pair[0]).value);});updateProfile(p);});
    function readInkNames(){var existing=inks;inks=$('inkNames').value.split(/\r?\n/).filter(function(s){return s.trim();}).map(function(name){return existing.filter(function(i){return i.name===name;})[0]||{name:name};});S.sequence(inks,current());}
    $('inkNames').oninput=function(){verified=false;$('verifyInks').checked=false;save();};
    $('applyInkNames').onclick=safe(function(){readInkNames();verified=false;changed(false);});
    $('verifyInks').onchange=safe(function(){if(!$('inkNames').value.trim()){$('verifyInks').checked=false;throw Error('Enter the actual inks first');}readInkNames();verified=$('verifyInks').checked;changed(false);});
    $('currentFrame').onchange=safe(function(){frame=Number($('currentFrame').value);changed(false);});
    ['productionJob','productionSheet'].forEach(function(id){$(id).value=saved&&saved[id]||'';$(id).onchange=safe(function(){changed(false);});});
    $('analyzeInks').onclick=safe(async function(){
      if(busy)return;busy=true;$('analyzeInks').disabled=true;$('applyInkNames').disabled=true;$('verifyInks').disabled=true;verified=false;inks=[];reports={};
      try{var jobs=api.jobs();if(!jobs.length)throw Error('Import production PDFs first');
        for(var i=0;i<jobs.length;i++){var j=jobs[i];try{
          if(!window.cep||!window.cep.fs)throw Error('PDF reading requires the Illustrator CEP panel');
          var data=window.cep.fs.readFile(j.filePath,window.cep.encoding.Base64);if(data.err!==0)throw Error('Cannot read source PDF ('+data.err+')');
          var binary=atob(data.data),bytes=new Uint8Array(binary.length);for(var bi=0;bi<binary.length;bi++)bytes[bi]=binary.charCodeAt(bi);
          var report=await window.BytebasePDFInks.inspect(bytes);reports[j.id]={name:j.fileName,message:report.message};inks=inks.concat(report.inks);
        }catch(e){reports[j.id]={name:j.fileName,message:'Manual verification required: '+e.message};}}
        inks=S.sequence(inks,current()).inks;changed(false);api.status('PDF color-space analysis complete. Confirm the actual inks for all files.','success');
      }finally{busy=false;$('analyzeInks').disabled=false;$('applyInkNames').disabled=false;$('verifyInks').disabled=false;refresh();save();}
    });
    $('applyProduction').onclick=safe(async function(){if(!api.layout())throw Error('Calculate a layout first');var request=payload(true);var response=await api.host('updateProduction',{layout:api.layout(),production:request});api.status('Production marks and text updated. '+response.warning,'success');});
    $('exportManifest').onclick=safe(function(){var request=payload(true);download('working-sheet-manifest.json',JSON.stringify(window.BytebaseSeparations.manifest(request,api.layout()),null,2));});
    function path(ctx,p,ratio){ctx.beginPath();var v=p.vertices;ctx.moveTo(v[0].a[0]*ratio,v[0].a[1]*ratio);for(var i=1;i<v.length;i++)ctx.bezierCurveTo(v[i-1].r[0]*ratio,v[i-1].r[1]*ratio,v[i].l[0]*ratio,v[i].l[1]*ratio,v[i].a[0]*ratio,v[i].a[1]*ratio);if(p.closed){ctx.bezierCurveTo(v[v.length-1].r[0]*ratio,v[v.length-1].r[1]*ratio,v[0].l[0]*ratio,v[0].l[1]*ratio,v[0].a[0]*ratio,v[0].a[1]*ratio);ctx.closePath();}if(p.fill)ctx.fill();if(p.stroke){ctx.lineWidth=p.strokeWidth*ratio;ctx.stroke();}}
    function draw(ctx,ratio){try{if(changedJobs())refresh();var r=model(),g=r.geometry,p=r.profile;$('productionValidation').textContent=r.errors.concat(r.warnings).concat([p.calibration]).concat(recovery?['A damaged saved setup is preserved. Export recovery data before repairing profiles.']:[]).join('\n');$('productionValidation').className='helper production-report'+(r.errors.length?' production-error':'');ctx.save();ctx.strokeStyle='#242a32';ctx.fillStyle='#242a32';g.marks.forEach(function(m){ctx.strokeStyle=ctx.fillStyle=m.production?'#121820':'#00a8bf';m.paths.forEach(function(v){path(ctx,v,ratio);});});
      if(p.boundary.visible){var b=g.zone.bounds;ctx.strokeStyle=p.boundary.color;ctx.lineWidth=p.boundary.stroke*ratio;ctx.strokeRect(b.x*ratio,b.y*ratio,b.w*ratio,b.h*ratio);}
      if(p.text.enabled){var t=p.text,b=g.textBounds;ctx.fillStyle='rgba(230,170,65,0.12)';ctx.fillRect(b.x*ratio,b.y*ratio,b.w*ratio,b.h*ratio);ctx.translate(b.x*ratio,b.y*ratio);if(t.rotation===90){ctx.translate(b.w*ratio,0);ctx.rotate(Math.PI/2);}ctx.font=(t.size*25.4/72*ratio)+'px "'+t.font.replace(/MT$/,'')+'"';ctx.textBaseline='top';ctx.textAlign='left';
        var width=ctx.measureText(r.label.text).width,x=t.align==='left'?0:t.align==='right'?t.width*ratio-width:(t.width*ratio-width)/2;
        var pieces=[{text:r.label.prefix,color:t.displayColors&&r.label.entries.length?r.label.entries[0].color:'#172738'}];r.label.entries.forEach(function(e,i){pieces.push({text:(i?t.separator:'')+e.text,color:t.displayColors?e.color:'#172738'});});pieces.push({text:r.label.suffix,color:t.displayColors&&r.label.entries.length?r.label.entries[r.label.entries.length-1].color:'#172738'});
        pieces.forEach(function(piece){ctx.fillStyle=piece.color;ctx.fillText(piece.text,x,0);x+=ctx.measureText(piece.text).width;});
        if(width>t.width*ratio)$('productionValidation').textContent+='\nText preview exceeds reserved width; adjust font size or label area. Illustrator validates actual outlined glyph bounds.';
      }
      ctx.restore();$('frameLegend').textContent=r.label.text||'Confirm source inks to generate the frame legend.';
    }catch(e){$('productionValidation').textContent=e.message;$('productionValidation').className='helper production-report production-error';}}
    function drawMarkPreview(){var c=$('markPreview'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);try{var g=S.geometry(current()),m=g.marks[0];if(!m)return;var scale=Math.min(70/m.bounds.w,70/m.bounds.h);ctx.save();ctx.translate(15-m.bounds.x*scale,15-m.bounds.y*scale);ctx.strokeStyle=ctx.fillStyle='#eeb040';m.paths.forEach(function(p){path(ctx,p,scale);});ctx.restore();}catch(e){}}
    var result={snapshot:function(){var s=snapshot();s.productionJob=$('productionJob').value;s.productionSheet=$('productionSheet').value;return s;},request:payload,draw:draw,refresh:refresh,analyze:function(){$('analyzeInks').onclick();}};options();refresh();return result;
  };
}());
