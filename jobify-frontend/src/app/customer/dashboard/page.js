"use client";

import { useState } from "react";
import { apiRequest } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function CustomerDashboard() {

  const { token } = useAuth();
  const router = useRouter();

  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");

  async function createBooking() {

    console.log("BOOK BUTTON CLICKED");

    if (!description) {
      setMessage("Please describe the problem");
      return;
    }

    const res = await apiRequest(
      "/bookings",
      "POST",
      {
        description,
        customer_lat: 22.5726,
        customer_lng: 88.3639
      },
      token
    );

    console.log("BOOKING RESPONSE:", res);

    if (res.error) {
      setMessage(res.error);
      return;
    }

    setMessage("Booking created!");

    router.push(`/customer/tracking/${res.id}`);
  }

  return (

    <div style={{ padding: 40 }}>

      <h1>Book a Service</h1>

      <textarea
        placeholder="Describe your problem (e.g. kitchen sink leaking)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        style={{ width: "300px" }}
      />

      <br /><br />

      <button onClick={createBooking}>
        Book Service
      </button>

      <p>{message}</p>

    </div>

  );

}