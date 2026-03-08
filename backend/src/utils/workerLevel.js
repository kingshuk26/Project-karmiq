const pool = require("../config/db");

async function updateWorkerLevel(workerId) {

  try {

    const stats = await pool.query(
      `
      SELECT
        w.skill_score,
        w.jobs_completed,
        AVG(r.rating) as avg_rating
      FROM workers w
      LEFT JOIN bookings b ON w.id = b.worker_id
      LEFT JOIN reviews r ON b.id = r.booking_id
      WHERE w.id = $1
      GROUP BY w.skill_score, w.jobs_completed
      `,
      [workerId]
    );

    if (stats.rows.length === 0) return;

    const data = stats.rows[0];

    const skillScore = data.skill_score || 0;
    const jobs = data.jobs_completed || 0;
    const rating = data.avg_rating || 0;

    let level = "fresher";

    if (jobs >= 200 && rating >= 4.7) {
      level = "elite";
    }
    else if (jobs >= 50 && rating >= 4.2) {
      level = "pro";
    }
    else if (jobs >= 5 && rating >= 3) {
      level = "verified";
    }
    else if (skillScore >= 60) {
      level = "fresher";
    }

    await pool.query(
      `
      UPDATE workers
      SET worker_level = $1
      WHERE id = $2
      `,
      [level, workerId]
    );

  } catch (error) {

    console.error("Worker level update failed", error);

  }

}

module.exports = { updateWorkerLevel };