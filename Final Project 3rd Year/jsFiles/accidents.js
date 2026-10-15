let currentPage = 1;
const perPage = 5;

// Load list on page load
document.addEventListener("DOMContentLoaded", () => {
  loadAccidents();
});

// Fetch accidents
async function loadAccidents(page = 1) {
  currentPage = page;

  const response = await fetch(
    `https://192.168.100.35/appdevfinal/accident_api.php?page=${page}&limit=${perPage}`
  )
    .then(res => res.json())
    .catch(err => {
      console.error("API ERROR:", err);
      return { data: [], total: 0 };
    });

  const accidents = response.data || [];
  const total = response.total || 0;

  renderAccidentList(accidents);
  renderPagination(total);
}

// Render list
function renderAccidentList(accidents) {
  const container = document.getElementById("accidentList");
  container.innerHTML = "";

  if (accidents.length === 0) {
    container.innerHTML = `<p class="text-white">No accident records found.</p>`;
    return;
  }

  accidents.forEach(acc => {
    const card = document.createElement("div");
    card.className = "accident-card";
    card.onclick = () =>
      window.location.href = `accident_view.html?id=${acc.accident_id}`;

    card.innerHTML = `
      <div class="accident-header">
        <h5 class="mb-1">Case #${acc.case_number}</h5>
        <span class="severity-badge sev-${acc.severity}">
          ${acc.severity}
        </span>
      </div>

      <p class="mb-1"><strong>Date:</strong> ${acc.accident_date}</p>
      <p class="mb-1"><strong>Address:</strong> ${acc.address}</p>

      <div class="mt-2 text-muted">
        <small>${acc.vehicle_type_name || "Unknown vehicle"}</small>
      </div>
    `;

    container.appendChild(card);
  });
}

// Pagination
function renderPagination(total) {
  const totalPages = Math.ceil(total / perPage);
  const pag = document.getElementById("pagination");
  pag.innerHTML = "";

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.classList.toggle("active", i === currentPage);
    btn.onclick = () => loadAccidents(i);
    pag.appendChild(btn);
  }
}
