const pool = require("../config/db");

async function calculatePrice(serviceType) {

  try {

    const basePrices = {
      plumbing: 200,
      electrical: 180,
      ac_repair: 350,
      cleaning: 150,
      general: 120
    };

    const basePrice = basePrices[serviceType] || 150;

    // check demand
    const demandResult = await pool.query(
      `
      SELECT COUNT(*) as active
      FROM bookings
      WHERE service_type = $1
      AND status IN ('pending','assigned','accepted')
      `,
      [serviceType]
    );

    const activeJobs = parseInt(demandResult.rows[0].active);

    // check available workers
    const workerResult = await pool.query(
      `
      SELECT COUNT(*) as workers
      FROM workers
      WHERE $1 = ANY(skills)
      AND is_online = true
      `,
      [serviceType]
    );

    const availableWorkers = parseInt(workerResult.rows[0].workers);

    let surgeMultiplier = 1;

    if (activeJobs > availableWorkers) {
      surgeMultiplier = 1.5;
    }

    if (activeJobs > availableWorkers * 2) {
      surgeMultiplier = 2;
    }

    const finalPrice = basePrice * surgeMultiplier;

    return {
      base_price: basePrice,
      surge_multiplier: surgeMultiplier,
      final_price: finalPrice
    };

  } catch (error) {

    console.error("Pricing engine error", error);

    return {
      base_price: 150,
      surge_multiplier: 1,
      final_price: 150
    };

  }

}

module.exports = { calculatePrice };