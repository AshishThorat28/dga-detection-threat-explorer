export const familyPalette={
  benign:'#718096',random:'#E69F00',hex:'#56B4E9',numeric:'#009E73',
  gozi_like:'#F0E442',matsnu_like:'#0072B2',suffix:'#D55E00',lcg:'#CC79A7',md5_date:'#999999',
};

export function makeChart(canvas,type,data,options={}){
  if(!globalThis.Chart||!canvas)return null;
  return new Chart(canvas,{type,data,options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:getComputedStyle(document.documentElement).getPropertyValue('--text')}}},...options}});
}

export function chartColors(labels){return labels.map(label=>familyPalette[label]||familyPalette.benign)}