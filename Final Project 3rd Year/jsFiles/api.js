const API_BASE_URL = "../htmlFiles/accident.json";


function api(endpoint) {
    return `${API_BASE_URL}/${endpoint}`;
}

async function getData(endpoint) {
    try {
        const response = await fetch(api(endpoint));
        const result = await response.json();
        return result;
    } catch (err) {
        console.error("GET Error:", err);
        return { success: false, message: "Server connection failed." };
    }
}

async function postData(endpoint, payload) {
    try {
        const response = await fetch(api(endpoint), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        return result;
    } catch (err) {
        console.error("POST Error:", err);
        return { success: false, message: "Server connection failed." };
    }
}

async function putData(endpoint, payload) {
    try {
        const response = await fetch(api(endpoint), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        return result;
    } catch (err) {
        console.error("PUT Error:", err);
        return { success: false, message: "Server connection failed." };
    }
}

async function deleteData(endpoint, payload = {}) {
    try {
        const response = await fetch(api(endpoint), {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        return result;
    } catch (err) {
        console.error("DELETE Error:", err);
        return { success: false, message: "Server connection failed." };
    }
}


window.API_BASE_URL = API_BASE_URL;
window.api = api;
window.getData = getData;
window.postData = postData;
window.putData = putData;
window.deleteData = deleteData;
