const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { updateTrustScore } = require("./utils/trustScore");
const pool = require("./config/db");
const { updateWorkerLevel } = require("./utils/workerLevel");
const { calculatePrice } = require("./utils/pricingEngine");
const jwt = require("jsonwebtoken");
const authMiddleware = require("./middlewares/auth");
const roleMiddleware = require("./middlewares/role");
require("dotenv").config();
const cron = require("node-cron");
const { detectServiceType } = require("./utils/serviceParser");
const app = express();
const { findBestWorker } = require("./services/assignmentService");
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(morgan("dev"));


app.get("/", (req, res) => {
  res.json({ message: "Jobify API Running" });
});

app.get("/top-workers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.id,
        u.name,
        w.experience_years,
        w.reliability_score,
        (w.reliability_score * 0.7 + w.experience_years * 0.3) AS worker_score
      FROM workers w
      JOIN users u ON w.user_id = u.id
      ORDER BY worker_score DESC
      LIMIT 10
    `);

    res.json(result.rows);

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch top workers" });
  }
});

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      success: true,
      time: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }

});

app.get("/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});
const bcrypt = require("bcryptjs");

app.post("/signup", async (req, res) => {
  try {
    const { name, phone, password, role } = req.body;

    if (!name || !phone || !password || !role) {
      return res.status(400).json({ error: "All fields required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, phone, role`,
      [name, phone, hashedPassword, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: "Phone and password required" });
    }

    const userResult = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/profile", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, phone, role FROM users WHERE id = $1",
      [req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.get(
  "/admin-only",
  authMiddleware,
  roleMiddleware(["admin"]),
  (req, res) => {
    res.json({ message: "Welcome Admin" });
  }
);

app.post(
  "/worker-profile",
  authMiddleware,
  roleMiddleware(["worker"]),
  async (req, res) => {
    try {
      const { skills, experience_years } = req.body;

      if (!skills || !experience_years) {
        return res.status(400).json({ error: "All fields required" });
      }

      const result = await pool.query(
        `INSERT INTO workers (user_id, skills, experience_years)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [req.user.id, skills, experience_years]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create worker profile" });
    }
  }
);

app.post(
  "/bookings",
  authMiddleware,
  roleMiddleware(["customer"]),
  async (req, res) => {
    try {

      let { service_type, description, customer_lat, customer_lng } = req.body;

      // 🔥 auto detect service type
      if (!service_type && description) {
        service_type = detectServiceType(description);
      }

      if (!service_type) {
        return res.status(400).json({ error: "Service type required" });
      }

      // 🔥 dynamic pricing
      const pricing = await calculatePrice(service_type);

      const workerId = await findBestWorker(
        service_type,
        customer_lat,
        customer_lng
      );

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // 🔹 Insert booking
      const result = await pool.query(
        `
        INSERT INTO bookings
        (customer_id, worker_id, service_type, description, price, status, assignment_expires_at, customer_lat, customer_lng)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
        `,
        [
          req.user.id,
          workerId,
          service_type,
          description,
          pricing.final_price,
          workerId ? "assigned" : "pending",
          expiresAt,
          customer_lat,
          customer_lng
        ]
      );

      const booking = result.rows[0];

      // 🔹 Update worker last assigned time
      if (workerId) {
        await pool.query(
          `
          UPDATE workers
          SET last_assigned_at = NOW()
          WHERE id = $1
          `,
          [workerId]
        );
      }

      // 🔥 Real-time worker notification
      if (workerId) {

        const io = req.app.get("io");
        const workers = req.app.get("workers");

        const socketId = workers[workerId];

        if (socketId) {
          io.to(socketId).emit("new_job", booking);
        }

      }

      res.status(201).json(booking);

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: "Booking creation failed"
      });

    }
  }
);

app.get(
  "/available-bookings",
  authMiddleware,
  roleMiddleware(["worker"]),
  async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM bookings WHERE status IN ('pending','assigned')"
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  }
);

app.post(
  "/bookings/:id/accept",
  authMiddleware,
  roleMiddleware(["worker"]),
  async (req, res) => {
    try {
      const bookingId = req.params.id;

      // Get worker profile id
      const workerResult = await pool.query(
        "SELECT id FROM workers WHERE user_id = $1",
        [req.user.id]
      );

      if (workerResult.rows.length === 0) {
        return res.status(400).json({ error: "Worker profile not found" });
      }

      const workerId = workerResult.rows[0].id;

      // Atomic update
      const updatedBooking = await pool.query(
        `UPDATE bookings
         SET status = 'accepted', worker_id = $1
         WHERE id = $2 AND status = 'pending'
         RETURNING *`,
        [workerId, bookingId]
      );

      if (updatedBooking.rows.length === 0) {
        return res.status(400).json({
          error: "Booking already accepted or not available",
        });
      }

      res.json(updatedBooking.rows[0]);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to accept booking" });
    }
  }
);

app.post(
  "/worker/accept-booking/:id",
  authMiddleware,
  roleMiddleware(["worker"]),
  async (req, res) => {
    try {

      const bookingId = req.params.id;

      const workerResult = await pool.query(
        "SELECT id FROM workers WHERE user_id = $1",
        [req.user.id]
      );

      const workerId = workerResult.rows[0].id;

      const result = await pool.query(
        `
        UPDATE bookings
        SET worker_response = 'accepted',
            status = 'accepted'
        WHERE id = $1
        AND worker_id = $2
        RETURNING *
        `,
        [bookingId, workerId]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: "Booking not found or not assigned to you" });
      }

      res.json(result.rows[0]);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to accept booking" });
    }
  }
);

app.post(
  "/worker/reject-booking/:id",
  authMiddleware,
  roleMiddleware(["worker"]),
  async (req, res) => {
    try {

      const bookingId = req.params.id;

      const workerResult = await pool.query(
        "SELECT id FROM workers WHERE user_id = $1",
        [req.user.id]
      );

      const workerId = workerResult.rows[0].id;

      const result = await pool.query(
        `
        UPDATE bookings
        SET worker_response = 'rejected',
            status = 'pending',
            worker_id = NULL
        WHERE id = $1
        AND worker_id = $2
        RETURNING *
        `,
        [bookingId, workerId]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({
          error: "Booking not found or not assigned to you"
        });
      }

      const booking = result.rows[0];

      // 🔥 find next worker
      const nextWorker = await findBestWorker(
        booking.service_type,
        booking.customer_lat,
        booking.customer_lng
      );

      if (nextWorker) {

        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await pool.query(
          `
          UPDATE bookings
          SET worker_id = $1,
              status = 'assigned',
              worker_response = 'pending',
              assignment_expires_at = $2
          WHERE id = $3
          `,
          [nextWorker, expiresAt, bookingId]
        );

      }

      res.json({
        message: "Booking rejected. Next worker assigned."
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Failed to reject booking"
      });
    }
  }
);


app.get(
  "/worker-bookings",
  authMiddleware,
  roleMiddleware(["worker"]),
  async (req, res) => {
    try {

      const workerResult = await pool.query(
        "SELECT id FROM workers WHERE user_id = $1",
        [req.user.id]
      );

      const workerId = workerResult.rows[0].id;

      const result = await pool.query(
        `SELECT * FROM bookings
         WHERE worker_id = $1`,
        [workerId]
      );

      res.json(result.rows);

    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  }
);
app.post(
  "/bookings/:id/start",
  authMiddleware,
  roleMiddleware(["worker"]),
  async (req, res) => {
    try {
      const bookingId = req.params.id;

      const result = await pool.query(
        `UPDATE bookings
         SET status = 'in_progress'
         WHERE id = $1 AND status = 'accepted'
         RETURNING *`,
        [bookingId]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: "Invalid state transition" });
      }

      res.json(result.rows[0]);

    } catch (error) {
      res.status(500).json({ error: "Failed to start booking" });
    }
  }
);

app.post(
  "/bookings/:id/complete",
  authMiddleware,
  roleMiddleware(["worker"]),
  async (req, res) => {
    try {

      const bookingId = req.params.id;

      const result = await pool.query(
        `
        UPDATE bookings
        SET status = 'completed'
        WHERE id = $1 AND status = 'in_progress'
        RETURNING *
        `,
        [bookingId]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({
          error: "Invalid state transition"
        });
      }

      const booking = result.rows[0];
      const workerId = booking.worker_id;

      // 🔥 increment worker completed jobs
      await pool.query(
        `
        UPDATE workers
        SET jobs_completed = jobs_completed + 1
        WHERE id = $1
        `,
        [workerId]
      );

      // 🔥 update worker level
      await updateWorkerLevel(workerId);

      res.json(booking);

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: "Failed to complete booking"
      });

    }
  }
);

app.post(
  "/bookings/:id/review",
  authMiddleware,
  roleMiddleware(["customer"]),
  async (req, res) => {
    try {

      const bookingId = req.params.id;
      const { rating, comment } = req.body;

      if (!rating) {
        return res.status(400).json({ error: "Rating required" });
      }

      // Check booking
      const bookingResult = await pool.query(
        "SELECT * FROM bookings WHERE id = $1",
        [bookingId]
      );

      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const booking = bookingResult.rows[0];

      if (booking.status !== "completed") {
        return res.status(400).json({
          error: "Can only review completed bookings"
        });
      }

      if (booking.customer_id !== req.user.id) {
        return res.status(403).json({
          error: "Not your booking"
        });
      }

      // Insert review
      const reviewResult = await pool.query(
        `
        INSERT INTO reviews
        (booking_id, customer_id, worker_id, rating, comment)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *
        `,
        [
          bookingId,
          req.user.id,
          booking.worker_id,
          rating,
          comment
        ]
      );

      // 🔥 Update worker trust score
      await updateTrustScore(booking.worker_id);

      res.status(201).json(reviewResult.rows[0]);

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: "Review creation failed"
      });

    }
  }
);
app.get("/workers/:id/reliability", async (req, res) => {
  try {
    const workerId = req.params.id;

    const result = await pool.query(
      `
      SELECT 
        AVG(rating) AS average_rating,
        COUNT(*) AS total_reviews
      FROM reviews
      WHERE worker_id = $1
      `,
      [workerId]
    );

    res.json(result.rows[0]);

  } catch (error) {
    res.status(500).json({ error: "Failed to calculate reliability" });
  }
});

app.post(
  "/bookings/:id/review",
  authMiddleware,
  roleMiddleware(["customer"]),
  async (req, res) => {
    try {
      const bookingId = req.params.id;
      const { rating, comment } = req.body;

      if (!rating) {
        return res.status(400).json({ error: "Rating required" });
      }

      // Get booking
      const bookingResult = await pool.query(
        "SELECT * FROM bookings WHERE id = $1",
        [bookingId]
      );

      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const booking = bookingResult.rows[0];

      if (booking.status !== "completed") {
        return res
          .status(400)
          .json({ error: "Can only review completed bookings" });
      }

      if (booking.customer_id !== req.user.id) {
        return res.status(403).json({ error: "Not your booking" });
      }

      // Insert review
      const reviewResult = await pool.query(
        `INSERT INTO reviews (booking_id, customer_id, worker_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [bookingId, req.user.id, booking.worker_id, rating, comment]
      );

      // 🔥 Recalculate worker rating
      const ratingResult = await pool.query(
        `SELECT AVG(rating) AS average_rating
         FROM reviews
         WHERE worker_id = $1`,
        [booking.worker_id]
      );

      const newAverage = ratingResult.rows[0].average_rating;

      // 🔥 Update workers table
      await pool.query(
        `UPDATE workers
         SET reliability_score = $1
         WHERE id = $2`,
        [newAverage, booking.worker_id]
      );

      res.status(201).json(reviewResult.rows[0]);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Review creation failed" });
    }
  }
);

app.post(
  "/worker/online",
  authMiddleware,
  roleMiddleware(["worker"]),
  async (req, res) => {
    try {

      const workerResult = await pool.query(
        "SELECT id FROM workers WHERE user_id = $1",
        [req.user.id]
      );

      const workerId = workerResult.rows[0].id;

      await pool.query(
        `UPDATE workers
         SET is_online = true
         WHERE id = $1`,
        [workerId]
      );

      res.json({ message: "Worker is now online" });

    } catch (error) {
      res.status(500).json({ error: "Failed to set online status" });
    }
  }
);

app.get("/booking/:id/eta", async (req, res) => {
  try {

    const bookingId = req.params.id;

    const result = await pool.query(
      `
      SELECT 
        b.customer_lat,
        b.customer_lng,
        w.latitude,
        w.longitude
      FROM bookings b
      JOIN workers w
      ON b.worker_id = w.id
      WHERE b.id = $1
      `,
      [bookingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = result.rows[0];

    const toRad = (value) => (value * Math.PI) / 180;

    const R = 6371;

    const dLat = toRad(booking.latitude - booking.customer_lat);
    const dLon = toRad(booking.longitude - booking.customer_lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(booking.customer_lat)) *
        Math.cos(toRad(booking.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c;

    // assume worker speed = 30 km/h
    const etaMinutes = Math.round((distance / 30) * 60);

    res.json({
      distance_km: distance.toFixed(2),
      eta_minutes: etaMinutes
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to calculate ETA" });
  }
});

app.get("/heatmap", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        ROUND(customer_lat::numeric, 2) AS lat,
        ROUND(customer_lng::numeric, 2) AS lng,
        COUNT(*) AS demand
      FROM bookings
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY lat, lng
      ORDER BY demand DESC
      `
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Heatmap generation failed" });
  }
});

app.post("/incentives/dispatch", async (req, res) => {
  try {

    // 1️⃣ find high demand zones (last 1 hour)
    const zones = await pool.query(
      `
      SELECT
        ROUND(customer_lat::numeric, 2) AS lat,
        ROUND(customer_lng::numeric, 2) AS lng,
        COUNT(*) AS demand
      FROM bookings
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY lat, lng
      HAVING COUNT(*) >= 3
      ORDER BY demand DESC
      `
    );

    const io = req.app.get("io");
    const workers = req.app.get("workers");

    // 2️⃣ notify all connected workers
    for (const workerId in workers) {

      const socketId = workers[workerId];

      io.to(socketId).emit("high_demand_zone", {
        zones: zones.rows,
        bonus: 50
      });

    }

    res.json({
      message: "Incentive alerts sent",
      zones: zones.rows
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Incentive dispatch failed"
    });

  }
});

app.get("/worker/:id/stats", async (req, res) => {

  try {

    const workerId = req.params.id;

    const result = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_jobs,
        COUNT(*) FILTER (WHERE worker_response = 'rejected') AS rejected_jobs,
        COUNT(*) AS total_jobs,
        AVG(r.rating) AS avg_rating,
        SUM(b.price) AS total_earnings
      FROM bookings b
      LEFT JOIN reviews r
      ON b.id = r.booking_id
      WHERE b.worker_id = $1
      `,
      [workerId]
    );

    res.json(result.rows[0]);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Worker stats fetch failed"
    });

  }

});

app.get("/admin/analytics", async (req, res) => {

  try {

    const stats = await pool.query(`
      SELECT
        COUNT(*) AS total_bookings,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_bookings,
        SUM(price) AS total_revenue
      FROM bookings
    `);

    const workers = await pool.query(`
      SELECT
        COUNT(*) AS total_workers,
        COUNT(*) FILTER (WHERE is_online = true) AS online_workers
      FROM workers
    `);

    const ratings = await pool.query(`
      SELECT AVG(rating) AS average_rating
      FROM reviews
    `);

    res.json({
      bookings: stats.rows[0],
      workers: workers.rows[0],
      ratings: ratings.rows[0]
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Analytics fetch failed"
    });

  }

});

app.get("/admin/fraud-check/:workerId", async (req, res) => {

  try {

    const workerId = req.params.workerId;

    const stats = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_jobs,
        COUNT(*) FILTER (WHERE worker_response = 'rejected') AS rejected_jobs,
        COUNT(*) AS total_jobs
      FROM bookings
      WHERE worker_id = $1
      `,
      [workerId]
    );

    const data = stats.rows[0];

    const rejectionRate =
      data.total_jobs > 0
        ? data.rejected_jobs / data.total_jobs
        : 0;

    const completionRate =
      data.total_jobs > 0
        ? data.completed_jobs / data.total_jobs
        : 0;

    let fraudFlag = false;

    if (rejectionRate > 0.5 || completionRate < 0.3) {
      fraudFlag = true;
    }

    res.json({
      worker_id: workerId,
      completion_rate: completionRate,
      rejection_rate: rejectionRate,
      suspicious: fraudFlag
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Fraud check failed"
    });

  }

});

app.post("/worker/update-status/:bookingId", async (req, res) => {

  try {

    const bookingId = req.params.bookingId;
    const { status } = req.body;

    const result = await pool.query(
      `
      UPDATE bookings
      SET status = $1
      WHERE id = $2
      RETURNING *
      `,
      [status, bookingId]
    );

    const booking = result.rows[0];

    // 🔥 real-time update to clients
    const io = req.app.get("io");

    io.emit("booking_status_update", booking);

    res.json(booking);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Status update failed"
    });

  }

});

app.post("/worker/update-location", async (req, res) => {

  try {

    const { worker_id, latitude, longitude } = req.body;

    if (!worker_id || !latitude || !longitude) {
      return res.status(400).json({
        error: "worker_id, latitude and longitude required"
      });
    }

    const result = await pool.query(
      `
      UPDATE workers
      SET latitude = $1,
          longitude = $2
      WHERE id = $3
      RETURNING *
      `,
      [latitude, longitude, worker_id]
    );

    const worker = result.rows[0];

    // 🔥 real-time location broadcast
    const io = req.app.get("io");

    io.emit("worker_location_update", {
      worker_id,
      latitude,
      longitude
    });

    res.json(worker);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Location update failed"
    });

  }

});

app.get("/route/eta", async (req, res) => {
  try {
    const { worker_lat, worker_lng, customer_lat, customer_lng } = req.query;

    if (!worker_lat || !worker_lng || !customer_lat || !customer_lng) {
      return res.status(400).json({
        error: "worker_lat, worker_lng, customer_lat, customer_lng required"
      });
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${worker_lng},${worker_lat};${customer_lng},${customer_lat}?overview=false`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      return res.status(404).json({ error: "Route not found" });
    }

    const route = data.routes[0];

    res.json({
      distance_km: (route.distance / 1000).toFixed(2),
      eta_minutes: Math.ceil(route.duration / 60)
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Route calculation failed" });
  }
});

app.post("/admin/verify-pan/:workerId", async (req, res) => {

  try {

    const workerId = req.params.workerId;

    const result = await pool.query(
      `
      UPDATE workers
      SET pan_verified = true,
          kyc_status = 'verified'
      WHERE id = $1
      RETURNING *
      `,
      [workerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Worker not found"
      });
    }

    res.json({
      message: "PAN verified successfully",
      worker: result.rows[0]
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "PAN verification failed"
    });

  }

});

app.get("/worker/skill-test-question", async (req, res) => {

  const questions = [
    "Customer ke kitchen sink ke niche pani leak ho raha hai. Aap kya steps loge?",
    "Fan chal raha hai lekin bahut slow hai aur smell aa rahi hai. Aap kaise diagnose karoge?",
    "AC thanda nahi kar raha aur water drip ho raha hai. Problem kya ho sakti hai?",
    "Electric switch on karte hi spark aa raha hai. Aap kaise fix karoge?"
  ];

  const randomQuestion =
    questions[Math.floor(Math.random() * questions.length)];

  res.json({
    question: randomQuestion
  });

});

app.post("/worker/skill-test-answer", authMiddleware, roleMiddleware(["worker"]), async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: "question and answer required" });
    }

    // get worker id
    const workerResult = await pool.query(
      "SELECT id FROM workers WHERE user_id = $1",
      [req.user.id]
    );

    if (workerResult.rows.length === 0) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const workerId = workerResult.rows[0].id;

    // basic keyword scoring
    const keywords = [
      "check",
      "replace",
      "repair",
      "pipe",
      "wire",
      "switch",
      "diagnose",
      "leak",
      "washer",
      "joint"
    ];

    const text = answer.toLowerCase();
    let score = 0;

    keywords.forEach(word => {
      if (text.includes(word)) score += 10;
    });

    if (score > 100) score = 100;

    // save test
    await pool.query(
      `
      INSERT INTO worker_skill_tests (worker_id, question, answer, ai_score)
      VALUES ($1,$2,$3,$4)
      `,
      [workerId, question, answer, score]
    );

    // update worker skill score
    await pool.query(
      `
      UPDATE workers
      SET skill_score = $1
      WHERE id = $2
      `,
      [score, workerId]
    );

    res.json({
      message: "Skill test evaluated",
      ai_score: score
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Skill test evaluation failed"
    });
  }
});

const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const kycStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/kyc/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const kycUpload = multer({ storage: kycStorage });

app.post(
  "/worker/kyc",
  authMiddleware,
  roleMiddleware(["worker"]),
  kycUpload.single("pan_image"),
  async (req, res) => {
    try {
      const { pan_number } = req.body;

      if (!pan_number || !req.file) {
        return res.status(400).json({
          error: "pan_number and pan_image required",
        });
      }

      // worker id from logged-in user
      const workerResult = await pool.query(
        "SELECT id FROM workers WHERE user_id = $1",
        [req.user.id]
      );

      if (workerResult.rows.length === 0) {
        return res.status(404).json({ error: "Worker not found" });
      }

      const workerId = workerResult.rows[0].id;

      await pool.query(
        `
        UPDATE workers
        SET pan_number = $1,
            kyc_status = 'pending'
        WHERE id = $2
        `,
        [pan_number, workerId]
      );

      res.json({
        message: "KYC submitted. Verification pending.",
        worker_id: workerId,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "KYC submission failed" });
    }
  }
);
app.post("/upload-problem-image", upload.single("image"), async (req, res) => {

  try {

    const imagePath = req.file.path;

    // future AI analysis
    const detectedService = "plumbing";

    res.json({
      message: "Image uploaded",
      image_path: imagePath,
      detected_service: detectedService
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Image upload failed"
    });

  }

});

app.post("/voice-problem", upload.single("audio"), async (req, res) => {

  try {

    // later AI speech recognition add karenge
    // abhi demo text use karte hain

    const detectedText = "fan nahi chal raha";

    const service = detectServiceType(detectedText);

    res.json({
      speech_text: detectedText,
      detected_service: service
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Voice processing failed"
    });

  }

});

app.post(
  "/worker/offline",
  authMiddleware,
  roleMiddleware(["worker"]),
  async (req, res) => {
    try {

      const workerResult = await pool.query(
        "SELECT id FROM workers WHERE user_id = $1",
        [req.user.id]
      );

      const workerId = workerResult.rows[0].id;

      await pool.query(
        `UPDATE workers
         SET is_online = false
         WHERE id = $1`,
        [workerId]
      );

      res.json({ message: "Worker is now offline" });

    } catch (error) {
      res.status(500).json({ error: "Failed to set offline status" });
    }
  }
);

// 🔥 Reassignment cron job (runs every minute)
cron.schedule("* * * * *", async () => {
  try {

    const expired = await pool.query(`
      SELECT * FROM bookings
      WHERE status = 'assigned'
      AND assignment_expires_at < NOW()
    `);

    for (const booking of expired.rows) {

      // find next worker
      const newWorker = await findBestWorker(booking.service_type);

      if (!newWorker) continue;

      const newExpire = new Date(Date.now() + 10 * 60 * 1000);

      await pool.query(
        `
        UPDATE bookings
        SET worker_id = $1,
            assignment_expires_at = $2
        WHERE id = $3
        `,
        [newWorker, newExpire, booking.id]
      );

      console.log("Booking reassigned:", booking.id);

    }

  } catch (error) {
    console.error("Cron error:", error);
  }
});
module.exports = app;