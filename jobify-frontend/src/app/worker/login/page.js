"use client";

import { useState } from "react";
import { workerLogin } from "@/services/workerService";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function WorkerLogin() {

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();

    const res = await workerLogin({ phone, password });

    if (res.error) {
      setMessage(res.error);
      return;
    }

    login(res.user, res.token);

    router.push("/worker/dashboard");
  }

  return (
    <div style={{ padding: 40 }}>

      <h1>Worker Login</h1>

      <form onSubmit={handleSubmit}>

        <input placeholder="Phone" onChange={(e) => setPhone(e.target.value)} />
        <br /><br />

        <input type="password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} />
        <br /><br />

        <button type="submit">Login</button>

      </form>

      <p>{message}</p>

    </div>
  );
}