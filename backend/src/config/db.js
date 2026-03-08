const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL (Supabase)");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected DB Error", err);
  process.exit(1);
});

module.exports = pool;