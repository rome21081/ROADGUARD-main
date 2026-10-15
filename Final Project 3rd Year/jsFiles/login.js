document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const message = document.getElementById("loginMessage");
  const signupLink = document.getElementById("signupLink");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!username || !password) {
      message.style.color = "#FF6B6B";
      message.textContent = "Please fill in all fields.";
      return;
    }

    if (username === "root" && password === "admin") {
      message.style.color = "#00FFAA";
      message.textContent = "Login successful! Redirecting...";
      localStorage.setItem("user", JSON.stringify({ username: "root", role: "admin" }));
      
      setTimeout(() => {
        window.location.href = "main.html"; 
      }, 1000);
      return; // Skip PHP login
    }

    const result = await postData("Login.php", { username, password });
    

    if (result.success) {
      message.style.color = "#00FFAA";
      message.textContent = "Login successful! Redirecting...";
          localStorage.setItem("user", JSON.stringify(result.user));
      
      setTimeout(() => {
        window.location.href = "main.html"; 
      }, 1000);
    } else {
      message.style.color = "#FF6B6B";
      message.textContent = result.message || "Login failed!";
    }
  });

  signupLink.addEventListener("click", async () => {
    const html = await getData("signup.html"); 
    document.getElementById("mainContent").innerHTML = html;
  });
});
