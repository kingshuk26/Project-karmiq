const pool = require("../config/db");

async function updateTrustScore(workerId) {

  try {

    const reviewResult = await pool.query(
      `
      SELECT AVG(rating) as avg_rating
      FROM reviews
      WHERE worker_id = $1
      `,
      [workerId]
    );

    const rating = reviewResult.rows[0].avg_rating || 0;

    const bookingResult = await pool.query(
      `
      SELECT
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE worker_response = 'rejected') as rejected,
      COUNT(*) as total
      FROM bookings
      WHERE worker_id = $1
      `,
      [workerId]
    );

    const stats = bookingResult.rows[0];

    const completionRate = stats.total > 0
      ? stats.completed / stats.total
      : 0;

    const rejectionRate = stats.total > 0
      ? stats.rejected / stats.total
      : 0;

    // basic formula
    const trustScore =
      rating * 20 +
      completionRate * 40 -
      rejectionRate * 20;

    await pool.query(
      `
      UPDATE workers
      SET trust_score = $1
      WHERE id = $2
      `,
      [trustScore, workerId]
    );

  } catch (error) {

    console.error("Trust score update failed", error);

  }

}

module.exports = { updateTrustScore };