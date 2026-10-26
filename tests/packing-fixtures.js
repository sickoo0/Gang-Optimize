const settings={sheetW:700,sheetH:500,edge:20,inset:5,rotate:true};
const jobs=rows=>rows.map(([width,height,orderQ],i)=>({id:String(i+1),fileName:`fixture-${i+1}.pdf`,filePath:`C:/test/fixture-${i+1}.pdf`,width,height,orderQ,orderQConfirmed:true}));
const measured=jobs([[35.3529,38.723,500],[90.36,63.9324,100],[110.3602,44.1332,50],[250.3526,67.2613,400]]);
const six=jobs([[90.3594,18.9135,100],[260.3601,161.1883,50],[80.0001,25,1000],[90,18.5533,120],[100.0002,64.1742,400],[90.3527,31.4064,100]]);
module.exports=[
  {name:'measured-four-exact',settings,jobs:measured,mode:'utilization',maxOverproductionPct:0},
  {name:'measured-four-cap60',settings,jobs:measured,mode:'utilization',maxOverproductionPct:60},
  {name:'measured-six-cap20',settings,jobs:six,mode:'utilization',maxOverproductionPct:20},
  {name:'measured-six-cap76',settings,jobs:six,mode:'utilization',maxOverproductionPct:76},
  {name:'narrow-gap-no-rotation',settings:{...settings,rotate:false},jobs:jobs([[205,140,100],[60,18,100],[35,30,100]]),mode:'utilization',maxOverproductionPct:30},
  {name:'mixed-aspect-ratios',settings,jobs:jobs([[240,65,100],[95,95,200],[35,15,300],[160,25,100],[55,40,200]]),mode:'utilization',maxOverproductionPct:25}
];
