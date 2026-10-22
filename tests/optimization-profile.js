const P=require('../client/production.js');
const settings={sheetW:700,sheetH:500,edge:20,inset:5,rotate:true};
const quantities=[500,400,100,50];
for(const size of [100,30,5])for(const mode of ['balanced','utilization','overproduction']){
  const jobs=quantities.map((q,i)=>({id:String(i+1),fileName:`job${i}.pdf`,filePath:`C:/pdf/${i}.pdf`,width:size,height:size,orderQ:q}));
  const start=Date.now(),before=process.memoryUsage().heapUsed;let events=0,last={};
  try{
    const result=P.planProduction({settings,jobs,mode,maxOverproductionPct:0},p=>{events++;last=p;});
    console.log(JSON.stringify({size,mode,ms:Date.now()-start,heapDeltaMB:+((process.memoryUsage().heapUsed-before)/1048576).toFixed(1),events,last,
      sheets:result.sheetCount,copies:result.totalCopies,plans:result.proposals.length,placements:result.proposals.reduce((n,p)=>n+p.totalCopies,0)}));
  }catch(e){console.log(JSON.stringify({size,mode,ms:Date.now()-start,events,last,error:e.stack}));}
}
for(const count of [30,80]){
  const jobs=Array.from({length:count},(_,i)=>({id:String(i+1),fileName:`batch${i}.pdf`,filePath:`C:/pdf/${i}.pdf`,width:30,height:30,orderQ:quantities[i%4]}));
  const start=Date.now(),before=process.memoryUsage().heapUsed;let events=0,last={};
  try{const result=P.planProduction({settings,jobs,mode:'utilization',maxOverproductionPct:0},p=>{events++;last=p;});
    console.log(JSON.stringify({count,ms:Date.now()-start,heapDeltaMB:+((process.memoryUsage().heapUsed-before)/1048576).toFixed(1),events,last,sheets:result.sheetCount,copies:result.totalCopies,plans:result.proposals.length}));
  }catch(e){console.log(JSON.stringify({count,ms:Date.now()-start,events,last,error:e.stack}));}
}
