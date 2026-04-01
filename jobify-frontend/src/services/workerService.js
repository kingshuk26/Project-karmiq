import { apiRequest } from "./api";

export async function workerSignup(data) {
  return await apiRequest("/worker/signup", "POST", data);
}

export async function workerLogin(data) {
  return await apiRequest("/worker/login", "POST", data);
}