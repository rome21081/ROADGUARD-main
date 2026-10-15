async function renderAnalytics() {
    if(currentUser.role !== 'analyst') return `<div>Access denied.</div>`;

    const res = await getData(`accident_api.php?role=${currentUser.role}&user_id=${currentUser.id}`);
    const accidents = res.success ? res.data : [];
    const types = [...new Set(accidents.map(a=>a.type_name))];

    const typeCounts = types.map(t => accidents.filter(a=>a.type_name===t).length);
    const severityCounts = ['Minor','Moderate','Severe'].map(s => accidents.filter(a=>a.severity===s).length);

    const typeChartId = "typeChart_" + Date.now();
    const severityChartId = "severityChart_" + Date.now();

    setTimeout(()=>{
        const ctx1 = document.getElementById(typeChartId).getContext('2d');
        new Chart(ctx1, { type:'pie', data:{ labels:types, datasets:[{data:typeCounts, backgroundColor:['#007bff','#ffc107','#28a745','#dc3545','#6f42c1']}] }});

        const ctx2 = document.getElementById(severityChartId).getContext('2d');
        new Chart(ctx2, { type:'bar', data:{ labels:['Minor','Moderate','Severe'], datasets:[{label:'Cases', data:severityCounts, backgroundColor:['#28a745','#ffc107','#dc3545']}] }});
    },100);

    return `
        <div class="card-title">Analytics & Reports</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <canvas id="${typeChartId}" height="200"></canvas>
            <canvas id="${severityChartId}" height="200"></canvas>
        </div>
    `;
}
