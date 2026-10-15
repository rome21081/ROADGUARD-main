document.addEventListener('DOMContentLoaded', () => {
  const currentLocationBtn = document.getElementById('currentLocationBtn');
  const plotLocationBtn = document.getElementById('plotLocationBtn');
  const locationInput = document.getElementById('location');
  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  const mapModal = document.getElementById('mapModal');
  const mapSearchBtn = document.getElementById('mapSearchBtn');
  const mapCloseBtn = document.getElementById('mapCloseBtn');
  const mapSearchInput = document.getElementById('mapSearch');

  const form = document.getElementById('accidentForm');
  const formResponse = document.getElementById('formResponse');
  const vehicleCheckboxes = document.querySelectorAll('.vehicle-checkbox');
  const vehicleOtherText = document.getElementById('vehicleOtherText');
  const vehicleOtherCheckbox = document.getElementById('vehicleOther');

  const plateNumberInput = document.getElementById('plateNumber');
  const vehicleTypeInput = document.getElementById('vehicleType');
  const vehicleBrandInput = document.getElementById('vehicleBrand');
  const vehicleModelInput = document.getElementById('vehicleModel');
  const vehicleColorInput = document.getElementById('vehicleColor');
  const vehicleYearInput = document.getElementById('vehicleYear');
  const vehicleNotesInput = document.getElementById('vehicleNotes');
  const vehicleImageInput = document.getElementById('vehicleImage');

  let map, marker;

async function reverseGeocodePH(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    );
    const data = await res.json();

    const addr = data.address || {};

    const street =
      addr.road ||
      addr.neighbourhood ||
      addr.hamlet ||
      "";

    const barangay =
      addr.village ||
      addr.barangay ||     // Sometimes available on PH maps
      addr.suburb ||
      "";

    const municipality =
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.county ||
      "";

    const province =
      addr.state ||
      addr.region ||
      "";

    let full = `${street}, ${barangay}, ${municipality}, ${province}`;

    full = full
      .replace(/,\s*,/g, ",")
      .replace(/,\s*$/, "")
      .replace(/^\s*,\s*/, "")
      .trim();

    return full || "Unknown Location";

  } catch (err) {
    console.error("Reverse geocode error:", err);
    return "Unknown Location";
  }
}


  currentLocationBtn.addEventListener('click', async () => {
    if (!navigator.geolocation) return alert("Geolocation not supported by your browser.");
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      latInput.value = lat;
      lngInput.value = lng;
      locationInput.value = await reverseGeocodePH(lat, lng);
    }, err => alert("Unable to get location: " + err.message));
  });

  plotLocationBtn.addEventListener('click', () => {
    mapModal.style.display = 'block';

    if (!map) {
      map = L.map('map', { zoomControl: false }).setView([16.5, 121.5], 9);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
    }

    if (latInput.value && lngInput.value) {
      if (marker) map.removeLayer(marker);
      marker = L.marker([latInput.value, lngInput.value]).addTo(map);
      map.setView([latInput.value, lngInput.value], 15);
    }

    map.on('click', async e => {
      const { lat, lng } = e.latlng;
      if (marker) map.removeLayer(marker);
      marker = L.marker([lat, lng]).addTo(map);
      latInput.value = lat;
      lngInput.value = lng;
      locationInput.value = await reverseGeocodePH(lat, lng);
    });
  });

  mapSearchBtn.addEventListener('click', async () => {
    const query = mapSearchInput.value.trim();
    if (!query) return alert("Enter a location to search.");

    try {
      const bbox = '121.1,16.0,122.0,17.0';
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Isabela, Philippines')}&bounded=1&viewbox=${bbox}`);
      const results = await res.json();
      if (results.length === 0) return alert("Location not found in Isabela.");

      const { lat, lon } = results[0];
      if (marker) map.removeLayer(marker);
      marker = L.marker([lat, lon]).addTo(map);
      map.setView([lat, lon], 15);

      latInput.value = lat;
      lngInput.value = lon;
      locationInput.value = `${query}, Isabela, Philippines`;
    } catch (err) {
      console.error(err);
      alert("Error searching location.");
    }
  });

  mapSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      mapSearchBtn.click();
    }
  });

  mapCloseBtn.addEventListener('click', () => {
    mapModal.style.display = 'none';
  });

  vehicleOtherCheckbox.addEventListener('change', () => {
    vehicleOtherText.style.display = vehicleOtherCheckbox.checked ? 'block' : 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const loggedInUser = JSON.parse(localStorage.getItem('user'));
    if (!loggedInUser) return alert("User not logged in.");
    const userId = loggedInUser.user_id;

    if (!latInput.value || !lngInput.value) {
      return alert("Please select a location on the map or use your current location.");
    }

    const accidentTypeIdMap = { 
      "Hit another vehicle": 1,
      "Hit person": 2,
      "Hit object": 3,
      "Fell alone": 4
    };
    const categoryMap = { 
      "Car": "Vehicle",
      "Motorcycle": "Vehicle",
      "Truck/Bus": "Vehicle",
      "Bicycle": "Vehicle",
      "Pedestrian": "Person"
    };


    let accidentTypeSelection = document.getElementById('accidentType').value;
    let vehicleSelected = Array.from(vehicleCheckboxes).find(cb => cb.checked);
    let category = vehicleSelected ? categoryMap[vehicleSelected.value] || "Other" : "Other";
    let type_id = accidentTypeIdMap[accidentTypeSelection] ?? 1;

    const date = document.getElementById('accidentDate').value;
    const time = document.getElementById('accidentTime').value;
    const accidentDateTime = `${date} ${time}:00`;

    const severityMap = {
      "No injuries": "Minor",
      "Minor injuries": "Minor",
      "Serious injuries": "Moderate",
      "Fatal": "Severe"
    };
    const selectedSeverity = document.getElementById('severity').value;
    const severity = severityMap[selectedSeverity] || "Minor";


    const vehicleData = {
      plate_number: plateNumberInput.value || null,
      type: vehicleTypeInput.value || null,
      brand: vehicleBrandInput.value || null,
      model: vehicleModelInput.value || null,
      color: vehicleColorInput.value || null,
      year: vehicleYearInput.value || null,
      notes: vehicleNotesInput.value || null
    };

    const payload = {
      accident_date: accidentDateTime,
      latitude: parseFloat(latInput.value),
      longitude: parseFloat(lngInput.value),
      address: locationInput.value,
      description: document.getElementById('description').value,
      severity: severity,
      reported_by: userId,
      type_id: type_id,
      category: category,
      vehicle: vehicleData
    };

    const imageFile = document.getElementById('imageUpload').files[0];
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = async () => {
        payload.image = reader.result;
        await submitReport(payload);
      };
      reader.readAsDataURL(imageFile);
    } else {
      await submitReport(payload);
    }
  });

  async function submitReport(payload) {
    try {
      const loggedInUser = JSON.parse(localStorage.getItem('user'));
      if (!loggedInUser) return alert("User not logged in.");
      const userId = loggedInUser.user_id;
      const role = loggedInUser.role;

      let res;
      try {
        res = await postData(`accident_api.php`, payload);
      } catch (jsonErr) {
        console.error("Invalid JSON from server:", jsonErr);
        formResponse.innerHTML = `<div class="alert alert-danger">Server returned invalid response.</div>`;
        return;
      }

      if (res.success) {
        formResponse.innerHTML = `<div class="alert alert-success">Report submitted successfully!</div>`;
        form.reset();
        if (marker) map.removeLayer(marker);
      } else {
        formResponse.innerHTML = `<div class="alert alert-danger">${res.message || 'Failed to submit report.'}</div>`;
      }
    } catch (err) {
      console.error(err);
      formResponse.innerHTML = `<div class="alert alert-danger">Server error. Try again later.</div>`;
    }
  }

});
