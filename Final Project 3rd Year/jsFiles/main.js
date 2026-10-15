'use strict';

document.addEventListener("DOMContentLoaded", () => {

  const user = JSON.parse(localStorage.getItem("user"));

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const displayName = user.full_name || user.username || "User";

  const sidebarName = document.querySelector(".sidebar-header h5 a");
  const sidebarRole = document.querySelector(".sidebar-header p");
  const sidebarAvatar = document.querySelector(".sidebar-header img");
  const welcomeMessage = document.querySelector(".welcome p");

  sidebarName.textContent = displayName;
  sidebarRole.textContent = user.role || "User Role";
  sidebarAvatar.src = user.avatar || "https://via.placeholder.com/65";

  
  const sidebar = document.getElementById("show-side-navigation1");
  const toggleBtns = document.querySelectorAll(".show-side-btn");
  const closeBtn = document.querySelector(".close-aside");

  function showSidebar() {
    sidebar.classList.add("active");
  }

  function hideSidebar() {
    sidebar.classList.remove("active");
  }

  toggleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      sidebar.classList.toggle("active");
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", hideSidebar);
  }

  document.addEventListener("click", (event) => {
    if (!sidebar.contains(event.target) &&
        !event.target.closest(".show-side-btn") &&
        window.innerWidth < 992) {
      hideSidebar();
    }
  });
});
