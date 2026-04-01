"use client";

import { useParams } from "next/navigation";

export default function TrackingPage() {

  const { bookingId } = useParams();

  return (

    <div style={{ padding: 40 }}>

      <h1>Booking Tracking</h1>

      <p>Booking ID: {bookingId}</p>

      <p>Worker will arrive soon.</p>

    </div>

  );

}