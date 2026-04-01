"use client";

import { useState } from "react";
import { login } from "@/services/authService";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function LoginPage() {

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const { login: saveLogin } = useAuth();
  const router = useRouter();

  async function handleSubmit(e) {

    e.preventDefault();
    console.log("FORM SUBMITTED");

    const res = await login({
      phone,
      password
    });
    console.log("LOGIN RESPONSE:", res);
    if (res.error) {
      setMessage(res.error);
      return;
    }

    saveLogin(res.user, res.token);
    router.push("/customer/dashboard");


    // redirect based on role
    //if (res.user.role === "customer") {
    //  router.push("/customer/dashboard");
    //}

    //if (res.user.role === "worker") {
    //  router.push("/worker/dashboard");
    //}

    //if (res.user.role === "admin") {
    //  router.push("/admin/dashboard");
    //}

  }

  return (
    <div style={{ padding: 40 }}>

      <h1>Login</h1>

      <form onSubmit={handleSubmit}>

        <input
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <br /><br />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <br /><br />

        <button type="submit">
          Login
        </button>

      </form>

      <p>{message}</p>

    </div>
  );

}