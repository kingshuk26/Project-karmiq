const API_BASE = "http://localhost:5000";

export async function apiRequest(endpoint, method = "GET", body = null, token = null) {

  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(API_BASE + endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  const data = await res.json();
  return data;
}