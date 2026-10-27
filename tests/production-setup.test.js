const test=require('node:test'),assert=require('node:assert/strict'),S=require('../shared/production-setup');
test('profiles validate, JSON round trip, migration and invalid settings',()=>{
  for(const p of S.defaults())assert.deepEqual(S.validate(JSON.parse(JSON.stringify(p))),p);
  const p=S.defaults()[0];p.schemaVersion=1;delete p.references;assert.equal(S.validate(p).schemaVersion,2);
  p.sheet.edge=400;assert.throws(()=>S.validate(p),/edge/);
});
test('exact MASCOT text, unique inks, aliases, tail and current frame',()=>{
  const p=S.defaults()[0],inks=['280c','485c','7416c','White-BG','Lim'];
  let r=S.compose(p,inks);assert.equal(r.label.text,'1/5 280c  2/5 485c  3/5 7416c  4/5 hvid  5/5 lim');
  assert.equal(S.sequence(['Lim','White-BG','485c','280c','PANTONE 280 C'],p).inks.map(i=>i.label).join(','),'485c,280c,hvid,lim');
  p.text.mode='current';assert.equal(S.compose(p,inks,null,{frame:4}).label.text,'5/5 lim');
  for(const n of [1,2,12]){const list=Array.from({length:n},(_,i)=>`Ink ${i}`);assert.equal(S.compose(p,list).sequence.length,n);}
  p.inks.required=['Lim'];p.inks.missing='block';assert.match(S.compose(p,['280c']).errors[0],/Missing/);
  p.inks.aliases['Glue']='Lim';assert.equal(S.compose(p,['Glue']).sequence[0].label,'lim');
  assert.equal(S.sequence(['280c','280u'],p).inks.length,2);
});
test('deterministic anchors, shared frame geometry, clearance and collisions',()=>{
  const p=S.defaults()[0],a=S.compose(p,['280c','White-BG','Lim']);
  assert.deepEqual(a,S.compose(p,['280c','White-BG','Lim']));
  assert.equal(a.geometry.zone.bounds.w,660);assert.equal(a.geometry.zone.bounds.h,460);
  assert.deepEqual(a.frames[0].marks,a.frames[2].marks);
  assert.equal(a.geometry.marks[0].paths[0].vertices[0].a[0],7);
  p.marks[0].x=-5;assert.throws(()=>S.validate(p),/exceeds/);
  p.marks[0].x=30;p.marks[0].y=30;
  const layout={settings:{sheetW:700,sheetH:500,edge:20,inset:0},sheets:[{placements:[{x:20,y:20,w:100,h:100,fileName:'logo.pdf'}]}]};
  assert.match(S.compose(p,['280c'],layout).errors.join(),/collides/);
});
test('restricted SVG vectors preserve proportions and reject unsafe input',()=>{
  const svg='<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="black" stroke-width="0.2"/></svg>';
  assert.equal(S.parseSVG(svg).parts.length,1);const p=S.defaults()[0];p.assets.custom=svg;p.marks[0].type='svg';p.marks[0].asset='custom';assert.equal(S.geometry(S.validate(p)).marks[0].paths[0].vertices.length,4);
  for(const bad of ['<svg><script/></svg>','<svg viewBox="0 0 10 10"><image href="https://x"/></svg>',svg.replace('cx="5"','onclick="x"'),svg.replace('fill="none"','style="fill:red"'),svg.replace('r="4"','r="40"'),'<!DOCTYPE svg>'+svg])assert.throws(()=>S.parseSVG(bad));
});
test('legend assignment, missing optional inks and display-only color',()=>{
  const p=S.defaults()[1];p.inks.colors.Lim='#FFF200';p.text.legend='per-ink';let r=S.compose(p,['280c','Lim']);assert.equal(r.frames[1].label.text,'2/2 Lim');assert.equal(r.frames[0].marks.length,r.frames[1].marks.length);
  assert.equal(r.sequence[1].color,'#FFF200');assert.equal(S.swatch({name:'x',alternate:{space:'CMYK',values:[1,0,0,0]}},p),'#00ffff');
  assert.equal(S.compose(p,['280c']).sequence.length,1);
});
test('MASCOT special spots retain approved references and multi-color logos yield unique ordered frames',()=>{
  const p=S.defaults()[0];assert.deepEqual(p.inks.spots['White-BG'],{space:'CMYK',values:[0,0,0,40]});
  assert.deepEqual(p.inks.spots.Lim,{space:'CMYK',values:[0,0,100,0]});
  assert.equal(p.inks.colors['White-BG'],'#A7A9AC');assert.equal(p.inks.colors.Lim,'#FFF200');
  assert.deepEqual(p.inks.required,['White-BG','Lim']);assert.equal(p.inks.missing,'block');
  const names=['PANTONE 356 C','PANTONE 360 C','PANTONE 152 C','PANTONE 356 C','PANTONE 299 C','Lim','White-BG'];
  let r=S.compose(p,names,null,{verified:true});assert.deepEqual(r.sequence.map(i=>i.name),['PANTONE 356 C','PANTONE 360 C','PANTONE 152 C','PANTONE 299 C','White-BG','Lim']);
  assert.deepEqual(r.errors,[]);
  assert.equal(r.label.text,'1/6 356c  2/6 360c  3/6 152c  4/6 299c  5/6 hvid  6/6 lim');
  assert.deepEqual(r.frames.map(f=>f.label.text),['1/6 356c','2/6 360c','3/6 152c','4/6 299c','5/6 hvid','6/6 lim']);
  r=S.compose(p,['Lim','White-BG','PANTONE 299 C','PANTONE 356 C'],null,{verified:true});assert.equal(r.label.text,'1/4 299c  2/4 356c  3/4 hvid  4/4 lim');
  const old=S.defaults()[0];delete old.inks.spots;old.inks.colors['White-BG']='#ffffff';assert.equal(S.validate(old).inks.colors['White-BG'],'#A7A9AC');
  const wrong=S.compose(p,[{name:'White-BG',alternate:{space:'CMYK',values:[0,0,0,0]}},{name:'Lim',alternate:{space:'RGB',values:[1,1,0]}}],null,{verified:true});
  assert.deepEqual(wrong.errors,[]);assert.match(wrong.warnings.join(' '),/White-BG PDF display alternate differs/);assert.match(wrong.warnings.join(' '),/Lim PDF display alternate differs/);
  const conflict=S.compose(S.defaults()[1],[{name:'PANTONE 356 C',alternate:{space:'CMYK',values:[0,1,0,0]}},{name:'PANTONE 356 C',alternate:{space:'CMYK',values:[0,0,1,0]}}],null,{verified:true});
  assert.match(conflict.errors.join(' '),/Conflicting PDF alternate/);
});
test('MASCOT white-only and four-color jobs have exact shared frame counts and ink order',()=>{
  const p=S.defaults()[0];
  const whiteOnly=S.compose(p,['Lim','White-BG'],null,{verified:true});
  assert.deepEqual(whiteOnly.sequence.map(i=>i.name),['White-BG','Lim']);assert.equal(whiteOnly.frames.length,2);
  const fourColor=S.compose(p,['PANTONE 186 C','PANTONE 286 C','PANTONE 356 C','PANTONE 299 C','White-BG','Lim'],null,{verified:true});
  assert.deepEqual(fourColor.sequence.map(i=>i.name),['PANTONE 186 C','PANTONE 286 C','PANTONE 356 C','PANTONE 299 C','White-BG','Lim']);assert.equal(fourColor.frames.length,6);
});
test('MASCOT merges repeated named inks across logos, keeps an independent blocker, and blocks either missing mandatory ink',()=>{
  const p=S.defaults()[0],shared=S.compose(p,[
    {name:'PANTONE 186 C',alternate:{space:'CMYK',values:[0,0.95,0.8,0.1]}},
    {name:'Blocker',alternate:{space:'CMYK',values:[0,0,0,0.7]}},
    {name:'PANTONE 186 C',alternate:{space:'RGB',values:[0.8,0.1,0.1]}},
    'Lim','White-BG','Blocker','PANTONE 186 C'
  ],null,{verified:true});
  assert.deepEqual(shared.sequence.map(i=>i.name),['PANTONE 186 C','Blocker','White-BG','Lim']);assert.equal(shared.frames.length,4);
  assert.ok(shared.warnings.some(x=>x.includes('PANTONE 186 C')));
  for(const missing of ['White-BG','Lim']){
    const actual=['PANTONE 186 C','White-BG','Lim'].filter(name=>name!==missing),result=S.compose(p,actual,null,{verified:true});
    assert.deepEqual(S.sequence(actual,p).missing,[missing]);
    assert.match(result.errors.join(' '),new RegExp('Missing required inks:.*'+missing));
  }
});
test('MASCOT migrations enforce mandatory inks while preserving custom company profiles',()=>{
  const saved=S.defaults()[0];saved.inks.required=[];saved.inks.missing='warn';saved.inks.tail=['Lim'];saved.inks.spots['White-BG']={space:'CMYK',values:[0,0,0,0]};
  const migrated=S.validate(saved);assert.deepEqual(migrated.inks.required,['White-BG','Lim']);assert.equal(migrated.inks.missing,'block');assert.deepEqual(migrated.inks.tail,['White-BG','Lim']);
  const company=S.clone(saved);company.id='company-example';company.name='Example company';company.inks.required=['Blocker'];company.inks.missing='warn';company.inks.tail=['Blocker'];company.inks.lockTail=false;
  company.inks.spots={'White-BG':{space:'CMYK',values:[0,0,0,5]},Lim:{space:'RGB',values:[12,34,56]}};company.inks.colors={'White-BG':'#eeeeee',Lim:'#ddccbb'};
  const validated=S.validate(company);assert.deepEqual(validated.inks.required,['Blocker']);assert.equal(validated.inks.missing,'warn');assert.deepEqual(validated.inks.tail,['Blocker']);
  assert.deepEqual(validated.inks.spots,company.inks.spots);assert.deepEqual(validated.inks.colors,company.inks.colors);
});
test('production settings survive empty sessions and v3 sessions migrate without losing jobs',()=>{
  const Session=require('../client/session'),state={jobs:[],productionSetup:{profiles:S.defaults(),selected:'mascot',inks:['Lim'],verified:true}};
  const store={value:'',setItem(k,v){this.value=v;},getItem(){return this.value;}};Session.save(store,state);assert.deepEqual(Session.load(store).productionSetup,state.productionSetup);
  store.value=JSON.stringify({version:3,jobs:[{filePath:'original.pdf',orderQ:47}],settings:{inset:0},latest:{id:'original'},proposals:[]});
  const migrated=Session.load(store);assert.equal(migrated.jobs[0].orderQ,47);assert.equal(migrated.latest.id,'original');assert.equal(migrated.version,4);
});
test('metadata JSON parser never executes persisted document code',()=>{
  const parse=require('../host/json-read');const data={value:'æ\\\"\n',null:null,array:[1,-1.2e-6,true,false]};assert.deepEqual(parse(JSON.stringify(data)),data);
  for(const bad of ['(function(){return 1}())','{"a":undefined}','{"__proto__":{}}','{"a":1} garbage','[1,]','{"a":1e999}'])assert.throws(()=>parse(bad));
});
test('separation manifest is ordered, excludes guides, retains sources and cannot export unvalidated PDF',()=>{
  const E=require('../shared/separation-plan'),p=S.defaults()[0],layout={settings:{sheetW:700,sheetH:500,edge:20,inset:0},sheets:[{placements:[{filePath:'original.pdf',x:30,y:30,w:40,h:20}]}]};
  const r=E.manifest({profile:p,inks:['Lim','280c','White-BG'],options:{verified:true}},layout);
  assert.deepEqual(r.frames.map(f=>f.sourceInk),['PANTONE 280 C','White-BG','Lim']);assert.equal(r.ripReady,false);
  assert.deepEqual(r.frames[0].marks,r.frames[2].marks);assert.deepEqual(r.frames[0].sourcePlacements,layout.sheets[0].placements);assert.throws(()=>E.exportPDF(),/disabled/);
});
test('printable boundary reserves only stroke edges and rejects clipped geometry',()=>{
  const p=S.defaults()[0];p.boundary.production=true;let g=S.geometry(p);assert.equal(g.boundaryKeepouts.length,4);
  assert.equal(g.boundaryKeepouts.some(b=>S.intersects(b,{x:30,y:30,w:20,h:20})),false);
  p.sheet.edge=0;assert.throws(()=>S.validate(p),/boundary exceeds/);
});
test('PDF Separation/DeviceN detection including compressed objects is read only',async()=>{
  const L=require('pdf-lib'),D=require('../client/pdf-inks'),doc=await L.PDFDocument.create();doc.addPage();
  doc.context.register(doc.context.obj([L.PDFName.of('Separation'),L.PDFName.of('White-BG'),L.PDFName.of('DeviceCMYK'),{FunctionType:2,C0:[0,0,0,0],C1:[0,0,0,1],N:1}]));
  doc.context.register(doc.context.obj([L.PDFName.of('DeviceN'),[L.PDFName.of('Lim'),L.PDFName.of('PANTONE 280 C')],L.PDFName.of('DeviceCMYK'),{}]));
  const bytes=await doc.save({useObjectStreams:true}),before=Buffer.from(bytes),r=await D.inspect(bytes,L);
  assert.deepEqual(Buffer.from(bytes),before);assert.deepEqual(r.inks.map(i=>i.name),['White-BG','Lim','PANTONE 280 C']);assert.equal(r.verified,false);
  await assert.rejects(()=>D.inspect(new Uint8Array([1,2,3]),L));
});
