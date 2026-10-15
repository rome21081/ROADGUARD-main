if (typeof Chart !== 'undefined') {
Chart.defaults.global.defaultFontColor = '#b5c6df';
Chart.defaults.global.defaultFontFamily = "'DM Sans', system-ui, sans-serif";
Chart.defaults.global.legend.position = 'bottom';
Chart.defaults.global.maintainAspectRatio = false;
Chart.defaults.scale.gridLines.color = '#2d3b54';
}
let charts = [];

var allData = [];


for(let i=0;i<500;i++){
let today=new Date();
let randomDate=new Date(today.getFullYear(),Math.floor(Math.random()*12),Math.floor(Math.random()*28)+1);

const categories=["Medical","Trauma","Conduction","Motor Vehicle Crash"];
const medicalTypes=["Pediatric","Psychiatric","Surgical","Obstetrical"];
const traumaTypes=["Fall","Electrocution","Domestic Violence","Fire Rescue Incident"];
const conductionTypes=["Dialysis","Check-up","Travel (Within Region 2)","Travel (Outside Region 2)"];
const mvcTypes=["Collision","Self-Accident"];
const vehicles=["Single Motor","Tricycle","Bicycle"];
const persons=["Driver","Passenger","Pedestrian"];
const engineSize=[">4500","<4500"];
const binary=["+","-"];

let category=categories[Math.floor(Math.random()*4)];
let obj={category:category,date:randomDate};

if(category==="Medical") obj.sub_type=medicalTypes[Math.floor(Math.random()*4)];
if(category==="Trauma") obj.sub_type=traumaTypes[Math.floor(Math.random()*4)];
if(category==="Conduction") obj.sub_type=conductionTypes[Math.floor(Math.random()*4)];

if(category==="Motor Vehicle Crash"){
obj.sub_type=mvcTypes[Math.floor(Math.random()*2)];
obj.vehicle=vehicles[Math.floor(Math.random()*3)];
obj.person=persons[Math.floor(Math.random()*3)];
obj.engine=engineSize[Math.floor(Math.random()*2)];
obj.license=binary[Math.floor(Math.random()*2)];
obj.helmet=binary[Math.floor(Math.random()*2)];
obj.alcohol=binary[Math.floor(Math.random()*2)];
}

allData.push(obj);
}

function filterByDate(data){
const f=document.getElementById("filterType").value;
const today=new Date();
return data.filter(d=>{
let dt=new Date(d.date);
if(f==="day") return dt.toDateString()===today.toDateString();
if(f==="month") return dt.getMonth()===today.getMonth() && dt.getFullYear()===today.getFullYear();
if(f==="year") return dt.getFullYear()===today.getFullYear();
return true;
});
}

function countBy(data,key){
let obj={};
data.forEach(d=>{
if(d[key]) obj[d[key]]=(obj[d[key]]||0)+1;
});
return obj;
}

function percentFormatter(value,context){
let total=context.dataset.data.reduce((a,b)=>a+b,0);
let percent=(total ? (value/total)*100 : 0).toFixed(1);
return percent+"%";
}

function render(){
charts.forEach(c=>c.destroy());
charts=[];

let filtered=filterByDate(allData);
if (typeof Chart === "undefined") {
 document.getElementById("analyticsStatus").textContent = "Charts could not be loaded. The summary tables remain available.";
 const counts = countBy(filtered,"category");
 for (const [id,key] of [["totalCases",null],["medicalCases","Medical"],["traumaCases","Trauma"],["conductionCases","Conduction"]]) document.getElementById(id).innerText = key ? counts[key] || 0 : filtered.length;
 renderSummary(filtered); renderMVCSummary(filtered.filter(item=>item.category==="Motor Vehicle Crash")); return;
}
let categoryCount=countBy(filtered,"category");

document.getElementById("totalCases").innerText=filtered.length;
document.getElementById("medicalCases").innerText=categoryCount.Medical||0;
document.getElementById("traumaCases").innerText=categoryCount.Trauma||0;
document.getElementById("conductionCases").innerText=categoryCount.Conduction||0;

const commonBar={
legend:{display:false},
plugins:{
datalabels:{
color:"#fff",
anchor:"end",
align:"top",
formatter:percentFormatter,
font:{weight:"bold"}
}
},
scales:{
xAxes:[{ticks:{fontColor:"#fff"}}],
yAxes:[{ticks:{beginAtZero:true,fontColor:"#fff"}}]
}
};

charts.push(new Chart(document.getElementById("categoryChart"),{
type:'pie',
plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
data:{
labels:Object.keys(categoryCount),
datasets:[{
data:Object.values(categoryCount),
backgroundColor:["#3b82f6","#ef4444","#10b981","#f59e0b"]
}]},
options:{
plugins:{
datalabels:{
color:"#fff",
formatter:percentFormatter
}
}
}
}));

["Trauma","Medical","Conduction"].forEach(type=>{
charts.push(new Chart(document.getElementById(type.toLowerCase()+"Chart"),{
type:'bar',
plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
data:{
labels:Object.keys(countBy(filtered.filter(d=>d.category===type),"sub_type")),
datasets:[{
data:Object.values(countBy(filtered.filter(d=>d.category===type),"sub_type")),
backgroundColor:"#6366f1"
}]},
options:commonBar
}));
});

let mvc=filtered.filter(d=>d.category==="Motor Vehicle Crash");

charts.push(new Chart(document.getElementById("mvcChart"),{
type:'bar',
plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
data:{
labels:Object.keys(countBy(mvc,"sub_type")),
datasets:[{
data:Object.values(countBy(mvc,"sub_type")),
backgroundColor:"#a855f7"
}]},
options:commonBar
}));

charts.push(new Chart(document.getElementById("vehicleChart"),{
type:'bar',
plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
data:{
labels:Object.keys(countBy(mvc,"vehicle")),
datasets:[{
data:Object.values(countBy(mvc,"vehicle")),
backgroundColor:"#f97316"
}]},
options:commonBar
}));

charts.push(new Chart(document.getElementById("personChart"),{
type:'bar',
plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
data:{
labels:Object.keys(countBy(mvc,"person")),
datasets:[{
data:Object.values(countBy(mvc,"person")),
backgroundColor:"#14b8a6"
}]},
options:commonBar
}));

charts.push(new Chart(document.getElementById("engineChart"),{
type:'bar',
plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
data:{
labels:Object.keys(countBy(mvc,"engine")),
datasets:[{
data:Object.values(countBy(mvc,"engine")),
backgroundColor:["#2563eb","#fbbf24"]
}]},
options:commonBar
}));

charts.push(new Chart(document.getElementById("licenseChart"),{
type:'pie',
plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
data:{
labels:["License (+)","License (-)"],
datasets:[{
data:[countBy(mvc,"license")["+"]||0,countBy(mvc,"license")["-"]||0],
backgroundColor:["#22c55e","#ef4444"]
}]},
options:{plugins:{datalabels:{color:"#fff",formatter:percentFormatter}}}
}));

charts.push(new Chart(document.getElementById("helmetChart"),{
type:'pie',
plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
data:{
labels:["Helmet (+)","Helmet (-)"],
datasets:[{
data:[countBy(mvc,"helmet")["+"]||0,countBy(mvc,"helmet")["-"]||0],
backgroundColor:["#22c55e","#ef4444"]
}]},
options:{plugins:{datalabels:{color:"#fff",formatter:percentFormatter}}}
}));

charts.push(new Chart(document.getElementById("alcoholChart"),{
type:'pie',
plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
data:{
labels:["Alcohol (+)","Alcohol (-)"],
datasets:[{
data:[countBy(mvc,"alcohol")["+"]||0,countBy(mvc,"alcohol")["-"]||0],
backgroundColor:["#ef4444","#22c55e"]
}]},
options:{plugins:{datalabels:{color:"#fff",formatter:percentFormatter}}}
}));

renderSummary(filtered);
renderMVCSummary(mvc);
renderMonthlyTrend(filtered);
}

function renderMonthlyTrend(filtered){
let monthCounts=new Array(12).fill(0);
filtered.forEach(d=>{
let month=new Date(d.date).getMonth();
monthCounts[month]++;
});

charts.push(new Chart(document.getElementById("monthlyTrendChart"),{
type:'line',
data:{
labels:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
datasets:[{
label:"Total Incidents",
data:monthCounts,
borderColor:"#3b82f6",
backgroundColor:"rgba(59,130,246,0.2)",
fill:true
}]
}
}));
}

function renderSummary(filtered){
let total=filtered.length;
let categoryCount=countBy(filtered,"category");
let tbody=document.getElementById("summaryTable");
tbody.innerHTML="";
Object.keys(categoryCount).forEach(cat=>{
let count=categoryCount[cat];
let percent=((count/total)*100).toFixed(2);
tbody.innerHTML+=`<tr><td>${cat}</td><td>${count}</td><td>${percent}%</td></tr>`;
});
tbody.innerHTML+=`<tr style="font-weight:bold;"><td>Total</td><td>${total}</td><td>${total ? "100%" : "0%"}</td></tr>`;
}

function renderMVCSummary(mvc){
let total=mvc.length;
let mvcCount=countBy(mvc,"sub_type");
let tbody=document.getElementById("mvcSummaryTable");
tbody.innerHTML="";
Object.keys(mvcCount).forEach(cat=>{
let count=mvcCount[cat];
let percent=((count/total)*100).toFixed(2);
tbody.innerHTML+=`<tr><td>${cat}</td><td>${count}</td><td>${percent}%</td></tr>`;
});
tbody.innerHTML+=`<tr style="font-weight:bold;"><td>Total</td><td>${total}</td><td>${total ? "100%" : "0%"}</td></tr>`;
}

document.getElementById("filterType").addEventListener("change",render);
render();

