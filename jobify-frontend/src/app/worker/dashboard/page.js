"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/services/api";
import { useAuth } from "@/context/AuthContext";

export default function WorkerDashboard() {

  const { token } = useAuth();
  const [jobs, setJobs] = useState([]);

  async function fetchJobs() {

    const res = await apiRequest("/worker/bookings", "GET", null, token);

    console.log("JOBS:", res);

    if (!res.error) {
      setJobs(res);
    }

  }

  useEffect(() => {
    fetchJobs();
  }, []);

  async function acceptJob(id) {

    const res = await apiRequest(
      `/worker/accept-booking/${id}`,
      "POST",
      null,
      token
    );

    console.log("ACCEPT:", res);

    fetchJobs();
  }

  async function rejectJob(id) {

    const res = await apiRequest(
      `/worker/reject-booking/${id}`,
      "POST",
      null,
      token
    );

    console.log("REJECT:", res);

    fetchJobs();
  }

  return (

    <div style={{ padding: 40 }}>

      <h1>Worker Dashboard</h1>

      {jobs.length === 0 && <p>No jobs available</p>}

      {jobs.map((job) => (

        <div key={job.id} style={{ border: "1px solid gray", margin: 10, padding: 10 }}>

          <p><b>Service:</b> {job.service_type}</p>
          <p><b>Description:</b> {job.description}</p>
          <p><b>Status:</b> {job.status}</p>

          {job.status === "assigned" && (
            <>
              <button onClick={() => acceptJob(job.id)}>Accept</button>
              <button onClick={() => rejectJob(job.id)}>Reject</button>
            </>
          )}

        </div>

      ))}

    </div>

  );

}