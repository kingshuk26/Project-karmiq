import { apiRequest } from "./api";

export async function signup(data) {
  return await apiRequest("/signup", "POST", data);
}

export async function login(data) {
  return await apiRequest("/login", "POST", data);
}