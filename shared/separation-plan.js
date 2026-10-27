/* Explicit hand-off contract for a future validated separation backend. This module never emits PDF files. */
(function(root,factory){var S=typeof module==='object'&&module.exports?require('./production-setup'):root.BytebaseSetup,api=factory(S);if(typeof module==='object'&&module.exports)module.exports=api;root.BytebaseSeparations=api;}(typeof window!=='undefined'?window:this,function(S){
  function manifest(request,layout){
    if(!layout)throw Error('Calculate a working layout first');var model=S.compose(request.profile,request.inks,layout,request.options);
    if(model.errors.length)throw Error(model.errors.join('; '));if(!model.verified||!model.sequence.length)throw Error('Verify the source ink list first');
    var frames=[];for(var i=0;i<model.frames.length;i++)frames.push({page:i+1,name:model.frames[i].name,sourceInk:model.frames[i].ink,marks:model.frames[i].marks,label:model.frames[i].label,exposureColor:{space:'DeviceCMYK',values:[0,0,0,1]},sourcePlacements:S.clone(layout.sheets[0].placements)});
    return {schemaVersion:1,status:'WORKING PLAN — NOT RIP READY',ripReady:false,sourceArtworkPolicy:'Original linked PDFs; no rewriting, scaling, trapping or ink conversion',sheet:S.clone(layout.settings),zones:[model.geometry.zone],frames:frames,printableBoundary:model.profile.boundary.production?model.geometry.boundaryKeepouts:[],excludedFromExposure:'All nonprinting guide geometry',
      requiredOutputValidation:['Actual page count and order','Separation identity, including White-BG and Lim','100% black exposure masks','Registration geometry on every page','Original artwork geometry, overprint and trapping','Approved physical template and RIP reference comparison']};
  }
  function exportPDF(){throw Error('RIP export is disabled: no separation backend and approved output validation are configured.');}
  return {manifest:manifest,exportPDF:exportPDF};
}));
