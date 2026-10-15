async function renderUsers() {
    if(currentUser.role !== 'admin') return `<div>Access denied.</div>`;

    const res = await getData(`Signup.php`);
    const users = res.success ? res.data : [];

    if(users.length===0) return `<div>No users found.</div>`;

    const rows = users.map(u => `
        <tr>
            <td>${u.user_id}</td>
            <td>${u.full_name}</td>
            <td>${u.role}</td>
            <td>${u.email || '-'}</td>
        </tr>
    `).join('');

    return `
        <div class="card-title">Users</div>
        <table class="table">
            <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Email</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}
