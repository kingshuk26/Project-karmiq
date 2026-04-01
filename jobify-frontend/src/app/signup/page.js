"use client";

import { useState } from "react";
import { signup } from "@/services/authService";

export default function SignupPage() {

  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    role: "customer"
  });

  const [message, setMessage] = useState("");

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const res = await signup(form);

    if (res.error) {
      setMessage(res.error);
    } else {
      setMessage("Signup successful!");
    }
  }

  return (
    <div style={{ padding: 40 }}>

      <h1>Signup</h1>

      <form onSubmit={handleSubmit}>

        <input
          name="name"
          placeholder="Name"
          onChange={handleChange}
        />
        <br /><br />

        <input
          name="phone"
          placeholder="Phone"
          onChange={handleChange}
        />
        <br /><br />

        <input
          name="password"
          type="password"
          placeholder="Password"
          onChange={handleChange}
        />
        <br /><br />

        <select
          name="role"
          onChange={handleChange}
        >
          <option value="customer">Customer</option>
          <option value="worker">Worker</option>
        </select>

        <br /><br />

        <button type="submit">
          Signup
        </button>

      </form>

      <p>{message}</p>

    </div>
  );
}