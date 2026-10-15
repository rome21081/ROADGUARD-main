let allData = [];

const subCategories = {
  Medical: ["Pediatric","Psychiatric","Surgical","Obstetrical"],
  Trauma: ["Fall","Electrocution","Domestic Violence","Fire Rescue Incident"],
  Conduction: ["Dialysis","Check-up","Travel (Within Region 2)","Travel (Outside Region 2)"],
  MotorVehicleCrashType: ["Collision","Self-Accident"],
  VehicleType: ["Bicycle","Tricycle","Single Motor"],
  PersonInvolve: ["Driver","Passenger","Pedestrian"],
  EngineSize: [">4500","<4500"],
  License: ["License (+)","License (-)"],
  Helmet: ["Helmet (+)","Helmet (-)"],
  Alcohol: ["Alcohol (+)","Alcohol (-)"]
};

const categoryKeys = Object.keys(subCategories);

// Generate 500 records
for(let i = 0; i < 500; i++) {

  let randomDate = new Date(
    2026,
    Math.floor(Math.random() * 12),
    Math.floor(Math.random() * 28) + 1
  );

  let category = categoryKeys[
    Math.floor(Math.random() * categoryKeys.length)
  ];

  let subType = subCategories[category][
    Math.floor(Math.random() * subCategories[category].length)
  ];

  allData.push({
    category,
    sub_type: subType,
    date: randomDate
  });
}


/* =========================================
   FILTER FUNCTION
========================================= */

function getFilteredData() {

  let filtered = [...allData];

  let month = document.getElementById("monthFilter")?.value;
  let category = document.getElementById("categoryFilter")?.value;

  if (month !== "") {
    filtered = filtered.filter(d =>
      new Date(d.date).getMonth() == month
    );
  }

  if (category !== "") {
    filtered = filtered.filter(d =>
      d.category === category
    );
  }

  return filtered;
}


/* =========================================
   GENERATE TABLE
========================================= */

function generateFullSpreadsheet() {

  let table = document.getElementById("spreadsheetTable");
  if (!table) return;

  let month = document.getElementById("monthFilter")?.value;
  let category = document.getElementById("categoryFilter")?.value;

  let data = getFilteredData();

  // 👉 IF FILTER IS ACTIVE → SHOW RECORDS ONLY
  if (month !== "" || category !== "") {

    let html = `
      <tr>
        <th>#</th>
        <th>Category</th>
        <th>Sub Type</th>
        <th>Date</th>
      </tr>
    `;

    if (data.length === 0) {
      html += `<tr><td colspan="4">No records found</td></tr>`;
    } else {

      data.forEach((d, index) => {

        html += `
          <tr>
            <td>${index + 1}</td>
            <td>${d.category}</td>
            <td>${d.sub_type}</td>
            <td>${new Date(d.date).toLocaleDateString()}</td>
          </tr>
        `;
      });

      html += `
        <tr class="total-row">
          <td colspan="3">TOTAL RECORDS</td>
          <td>${data.length}</td>
        </tr>
      `;
    }

    table.innerHTML = html;
    return;
  }


  // 👉 IF NO FILTER → SHOW FULL MASTER SPREADSHEET

  let months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  let categories = {
    "CONDUCTION": subCategories.Conduction,
    "MEDICAL": subCategories.Medical,
    "TRAUMA": subCategories.Trauma,
    "MOTOR VEHICLE CRASH TYPE": subCategories.MotorVehicleCrashType,
    "VEHICLE TYPE": subCategories.VehicleType,
    "PERSON INVOLVED": subCategories.PersonInvolve,
    "ENGINE SIZE": subCategories.EngineSize,
    "LICENSE": subCategories.License,
    "HELMET": subCategories.Helmet,
    "ALCOHOL": subCategories.Alcohol
  };

  let html = "<tr><th>Category</th>";
  months.forEach(m => html += "<th>" + m + "</th>");
  html += "<th>Total</th></tr>";

  let monthTotals = new Array(12).fill(0);

  Object.keys(categories).forEach(section => {

    html += "<tr class='section-row'><td colspan='14'>" + section + "</td></tr>";

    categories[section].forEach(sub => {

      let monthCounts = new Array(12).fill(0);

      data.forEach(d => {
        if (d.sub_type === sub) {
          let month = new Date(d.date).getMonth();
          monthCounts[month]++;
        }
      });

      for (let i = 0; i < 12; i++) {
        monthTotals[i] += monthCounts[i];
      }

      let total = monthCounts.reduce((a,b) => a+b, 0);

      html += "<tr><td>" + sub + "</td>";
      monthCounts.forEach(c => html += "<td>" + c + "</td>");
      html += "<td>" + total + "</td></tr>";

    });
  });

  let grandTotal = monthTotals.reduce((a,b) => a+b, 0);

  html += "<tr class='total-row'><td>GRAND TOTAL</td>";
  monthTotals.forEach(m => html += "<td>" + m + "</td>");
  html += "<td>" + grandTotal + "</td></tr>";

  table.innerHTML = html;
}


function downloadSpreadsheet() {

  let data = getFilteredData();

  let months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  let categories = {
    "CONDUCTION": subCategories.Conduction,
    "MEDICAL": subCategories.Medical,
    "TRAUMA": subCategories.Trauma,
    "MOTOR VEHICLE CRASH TYPE": subCategories.MotorVehicleCrashType,
    "VEHICLE TYPE": subCategories.VehicleType,
    "PERSON INVOLVED": subCategories.PersonInvolve,
    "ENGINE SIZE": subCategories.EngineSize,
    "LICENSE": subCategories.License,
    "HELMET": subCategories.Helmet,
    "ALCOHOL": subCategories.Alcohol
  };

  let exportData = [];
  exportData.push(["Category", ...months, "Total"]);

  let monthTotals = new Array(12).fill(0);

  Object.keys(categories).forEach(section => {

    exportData.push([section]);

    categories[section].forEach(sub => {

      let monthCounts = new Array(12).fill(0);

      data.forEach(d => {
        if (d.sub_type === sub) {
          let month = new Date(d.date).getMonth();
          monthCounts[month]++;
        }
      });

      for (let i = 0; i < 12; i++) {
        monthTotals[i] += monthCounts[i];
      }

      let total = monthCounts.reduce((a,b) => a+b, 0);

      exportData.push([sub, ...monthCounts, total]);

    });

  });

  let grandTotal = monthTotals.reduce((a,b) => a+b, 0);

  exportData.push([]);
  exportData.push(["GRAND TOTAL", ...monthTotals, grandTotal]);

  const ws = XLSX.utils.aoa_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Incident Report");

  XLSX.writeFile(wb, "EMS_Spreadsheet_Report.xlsx");
}


document.addEventListener("DOMContentLoaded", () => {
  generateFullSpreadsheet();
});