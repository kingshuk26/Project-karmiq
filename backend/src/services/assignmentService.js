const pool = require("../config/db");

async function findBestWorker(serviceType, customerLat, customerLng) {
  try {

    const result = await pool.query(
      `
      SELECT 
        w.id,
        w.latitude,
        w.longitude,
        w.reliability_score,
        w.experience_years,
        w.last_assigned_at,

        (
          6371 * acos(
            cos(radians($2)) *
            cos(radians(w.latitude)) *
            cos(radians(w.longitude) - radians($3)) +
            sin(radians($2)) *
            sin(radians(w.latitude))
          )
        ) AS distance

      FROM workers w

      WHERE $1 = ANY(w.skills)
      AND w.is_online = true

      ORDER BY
        distance ASC,
        reliability_score DESC,
        w.last_assigned_at ASC NULLS FIRST

      LIMIT 1
      `,
      [serviceType, customerLat, customerLng]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].id;

  } catch (error) {
    console.error("Worker assignment failed:", error);
    return null;
  }
}

module.exports = { findBestWorker };