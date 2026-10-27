const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('../shared/production-setup');

function spot(name,kind,values){
  return {name,colorType:'Spot',spotKind:kind,color:{typename:'CMYKColor',cyan:values[0],magenta:values[1],yellow:values[2],black:values[3]}};
}
function resolver(){
  const sandbox={ColorModel:{SPOT:'Spot'},SpotColorKind:{SPOTCMYK:'SpotColorKind.SPOTCMYK',SPOTRGB:'SpotColorKind.SPOTRGB'}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../host/spot-inks.jsx'),'utf8'),sandbox);
  return sandbox.BytebaseSpotInks;
}
function documentWith(spots){return {spots:spots,swatches:spots.map(function(s){return {name:s.name,color:{typename:'SpotColor'}};})};}

test('MASCOT merges same-name imported Spot identities while preserving their distinct source alternates',()=>{
  const api=resolver(),first=spot('White-BG','SpotColorKind.SPOTCMYK',[0,0,0,0]),second=spot('White-BG','SpotColorKind.SPOTCMYK',[0,0,0,2]);
  const lim=spot('Lim','SpotColorKind.SPOTRGB',[4,0,61,0]),doc=documentWith([first,second,lim]),created=[];
  const result=api.resolve(doc,[{name:'White-BG'},{name:'Lim'}],S.defaults()[0],created,JSON.stringify);
  assert.equal(result.spots['White-BG'],first);assert.equal(result.spots.Lim,lim);assert.deepEqual(created,[]);
  assert.equal(first.color.black,0);assert.equal(second.color.black,2);assert.equal(result.signature.includes('White-BG'),true);
});

test('MASCOT host resolver blocks missing mandatory names without synthesizing spots',()=>{
  const api=resolver(),profile=S.defaults()[0],created=[];
  for(const absent of ['White-BG','Lim']){
    const present=absent==='White-BG'?'Lim':'White-BG';
    const existing=spot(present,'SpotColorKind.SPOTCMYK',[0,0,0,0]),doc=documentWith([existing]);
    assert.throws(()=>api.resolve(doc,[{name:'White-BG'},{name:'Lim'}],profile,created,JSON.stringify),new RegExp('Missing source Spot Color for '+absent));
    assert.equal(doc.spots.length,1);assert.deepEqual(created,[]);
  }
});

test('non-MASCOT profiles keep strict duplicate-name handling',()=>{
  const api=resolver(),profile=S.defaults()[2];profile.id='company-example';
  const doc=documentWith([spot('PANTONE 280 C','SpotColorKind.SPOTCMYK',[0,0,0,0]),spot('PANTONE 280 C','SpotColorKind.SPOTCMYK',[0,0,0,1])]);
  assert.throws(()=>api.resolve(doc,[{name:'PANTONE 280 C'}],profile,[],JSON.stringify),/Multiple Illustrator spots named PANTONE 280 C/);
});
