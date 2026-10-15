// sidebar-toggle.js
'use strict';

document.addEventListener("DOMContentLoaded", () => {

  // Load logged-in user
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const displayName = user.full_name || user.username || "User";

  // --- These DOM elements correspond to your sidebar header ---
  const sidebarName = document.querySelector(".sidebar-header h5 a");
  const sidebarRole = document.querySelector(".sidebar-header p");
  const sidebarAvatar = document.querySelector(".sidebar-header img");
  const welcomeMessage = document.querySelector(".welcome p");

  // --- This section updates them with the user's info ---
  sidebarName.textContent = displayName;
  sidebarRole.textContent = user.role || "User Role";
  sidebarAvatar.src = user.avatar || "https://via.placeholder.com/65";

  
  const sidebar = document.getElementById("show-side-navigation1");
  const toggleBtns = document.querySelectorAll(".show-side-btn");
  const closeBtn = document.querySelector(".close-aside");

  // Function to show sidebar
  function showSidebar() {
    sidebar.classList.add("active");
  }

  // Function to hide sidebar
  function hideSidebar() {
    sidebar.classList.remove("active");
  }

  // Toggle sidebar when button is clicked
  toggleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      sidebar.classList.toggle("active");
    });
  });

  // Hide sidebar when close button is clicked (mobile)
  if (closeBtn) {
    closeBtn.addEventListener("click", hideSidebar);
  }

  // Optional: click outside to close sidebar
  document.addEventListener("click", (event) => {
    if (!sidebar.contains(event.target) &&
        !event.target.closest(".show-side-btn") &&
        window.innerWidth < 992) {
      hideSidebar();
    }
  });
});
