  // ===== Multi-Step Form =====
let currentStep = 0;
const steps = document.querySelectorAll(".form-step");
const indicators = document.querySelectorAll(".step-indicator span");

function showStep(index) {
  steps.forEach((step, i) => {
    step.classList.toggle("active", i === index);
    indicators[i].classList.toggle("active", i === index);
  });

  // When Step 5 is shown, render the preview
  if (steps[index].querySelector(".review-block")) {
    renderOverview();
  }
}   

function nextStep() {
    if (currentStep < steps.length - 1) {
        currentStep++;
        showStep(currentStep);
    }
}

function prevStep() {
    if (currentStep > 0) {
        currentStep--;
        showStep(currentStep);
    }
}
// ===============================
// Render Step 5 Overview
// ===============================
function renderOverview() {
  const reviewBlock = document.querySelector(".review-block");
  const form = document.getElementById("patientForm");
  const formData = new FormData(form);

  const data = {};

  // Convert FormData to object (handles checkboxes correctly)
  formData.forEach((value, key) => {
    if (data[key]) {
      if (!Array.isArray(data[key])) {
        data[key] = [data[key]];
      }
      data[key].push(value);
    } else {
      data[key] = value;
    }
  });

  const formatLabel = (key) =>
    key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  let html = `
    <h3>Patient Care Report Preview</h3>
    <table style="width:100%; border-collapse:collapse;" border="1">
  `;

  for (const key in data) {
    let value = Array.isArray(data[key])
      ? data[key].join(", ")
      : data[key];

    if (!value) value = "<i>Not provided</i>";

    html += `
      <tr>
        <td style="padding:6px; font-weight:bold; width:40%;">
          ${formatLabel(key)}
        </td>
        <td style="padding:6px;">
          ${value}
        </td>
      </tr>
    `;
  }

  html += "</table>";

  reviewBlock.innerHTML = html;
}
// ===============================
// STEP 5: REVIEW & CONFIRMATION
// ===============================

function renderOverview() {
  const reviewBlock = document.querySelector(".review-block");
  const form = document.getElementById("patientForm");
  const formData = new FormData(form);

  let overviewHTML = "<h3>Summary of Inputted Data</h3>";

  // Group data (handles multiple checkboxes with same name)
  const groupedData = {};
  formData.forEach((value, key) => {
    if (groupedData[key]) {
      if (!Array.isArray(groupedData[key])) groupedData[key] = [groupedData[key]];
      groupedData[key].push(value);
    } else {
      groupedData[key] = value;
    }
  });

  // Group by sections manually for better readability
  const sections = {
    "Respondent Info": ["response_no","responding-team","car","driver","main_aid","assistant_aid"],
    "Nature of Call": ["call_type","incident_date","incident_time","incident_place","departure_time","arrival_scene","departure_scene","arrival_hospital","departure_hospital","back_to_base"],
    "Patient Info": ["patient_name","age","birthday","gender","civil_status","address","contact_person","contact_number"],
    "Assessment": ["triage","emergency_type","medical_type","medical_other","lmp","lmp_g","lmp_p","edc","edc_known","edc_unknown","aog","baby_specify","ie_cm","placenta_specify","trauma_type","assault_specify","animal_bite_specify","trauma_other_specify","trauma_nature","ingestion_specify","fall_specify","motor_vehicle_crash_type","mvc_role","mvc_plate_number","alcohol_breath","helmet","drivers_licence","chief_complaint"],
    "Vital Signs & GCS": ["vital_signs_time","vital_signs_time2","vital_signs_time3","blood_pressure","blood_pressure2","blood_pressure3","pulse_rate","pulse_rate2","pulse_rate3","respiratory_rate","respiratory_rate2","respiratory_rate3","temperature","temperature2","temperature3","oxygen_saturation","oxygen_saturation2","oxygen_saturation3","gcs_eye","gcs_verbal","gcs_motor","gcs_total","pain_scale","pain_onset","pain_quality","pain_other"],
    "Airway & Breathing": ["airway","breathing_status","o2_lpm","breathing_method"],
    "Circulation": ["pulse","pulse_strength","capillary_refill","pupils","skin"],
    "Allergies & Medications": ["allergies_status","allergies_food","allergies_drug","allergies_other","medications_status","medications_drug","medications_dose","medications_datetime"],
    "Medical History & Lifestyle": ["medical_history","medical_history_other","smoke","smoke_count","smoke_stopped","alcohol","alcohol_frequency"],
    "Interventions": ["vital","wound","c-collar","oxygen","cpr","sponge_bath","cold_hot","wood_splints","arm_sling","ked","elastic_triangular","spine_board","endorcement","hoc"],
    "Response & Transport": ["hospital","transfer_reason","patient_signature","signature_datetime"]
  };

  for (const section in sections) {
    overviewHTML += `<h4>${section}</h4><table>`;
    sections[section].forEach(key => {
      if (groupedData[key] !== undefined) {
        const value = Array.isArray(groupedData[key]) ? groupedData[key].join(", ") : groupedData[key];
        overviewHTML += `<tr><td style="font-weight:bold;">${key.replace(/_/g, " ")}</td><td>${value}</td></tr>`;
      }
    });
    overviewHTML += "</table><br>";
  }

  reviewBlock.innerHTML = overviewHTML;
}

// Call overview when entering Step 5
function showStep(index) {
  steps.forEach((step, i) => {
    step.classList.toggle("active", i === index);
    indicators[i].classList.toggle("active", i === index);
  });

  // Render overview if Step 5
  if (index === steps.length - 1) renderOverview();
}  

// ===== Store Reports =====
let storedCareReports = [];

function saveReport(event) {
    event.preventDefault();
    const form = document.getElementById("patientForm");
    const jsonObject = {};
    const elements = form.elements;

    for (let el of elements) {
        const name = el.name;
        if (!name) continue;

        switch (el.type) {
            case "checkbox":
                if (!jsonObject[name]) jsonObject[name] = [];
                if (el.checked) jsonObject[name].push(el.value);
                break;

            case "radio":
                if (el.checked) jsonObject[name] = el.value;
                else if (!(name in jsonObject)) jsonObject[name] = null;
                break;

            default:
                jsonObject[name] = el.value || "";
        }
    }

    // Add metadata
    jsonObject.saved_at = new Date().toISOString();

    // Store the report
    storedCareReports.push(jsonObject);

    console.log("Latest Saved Report:", jsonObject);
    console.log("All Stored Reports:", storedCareReports);

    alert("Care Report stored!");
    form.reset();
    showStep(0); // Reset to first step
}

// ===== GCS Calculation =====
function calculateGCS() {
    const eye = parseInt(document.getElementById("gcs_eye").value) || 0;
    const verbal = parseInt(document.getElementById("gcs_verbal").value) || 0;
    const motor = parseInt(document.getElementById("gcs_motor").value) || 0;
    document.getElementById("gcs_total").value = eye + verbal + motor;
}

document.getElementById("gcs_eye").addEventListener("input", calculateGCS);
document.getElementById("gcs_verbal").addEventListener("input", calculateGCS);
document.getElementById("gcs_motor").addEventListener("input", calculateGCS);

// ===== Submit Form =====
document.getElementById("patientForm").addEventListener("submit", saveReport);