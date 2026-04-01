"use client";

import { useState } from "react";
import { workerSignup } from "@/services/workerService";

export default function WorkerSignup() {

  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: ""
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

    const res = await workerSignup(form);

    if (res.error) {
      setMessage(res.error);
    } else {
      setMessage("Worker signup successful!");
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Worker Signup</h1>

      <form onSubmit={handleSubmit}>

        <input name="name" placeholder="Name" onChange={handleChange} />
        <br /><br />

        <input name="phone" placeholder="Phone" onChange={handleChange} />
        <br /><br />

        <input name="password" type="password" placeholder="Password" onChange={handleChange} />
        <br /><br />

        <button type="submit">Signup</button>

      </form>

      <p>{message}</p>
    </div>
  );
}