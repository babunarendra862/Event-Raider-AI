
const express = require("express");
const router = express.Router();
const db = require("../db");

function getIndiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

router.get("/", async (req, res) => {
  try {
    const today = getIndiaDate();

    const [events] = await db.execute(
      `SELECT
        id,
        title,
        college,
        category,
        description,
        event_date,
        location,
        registration_url,
        source_url
      FROM events
      WHERE event_status = 'upcoming'
        AND event_date IS NOT NULL
        AND DATE(event_date) >= ?
      ORDER BY event_date ASC`,
      [today]
    );

    res.json({
      success: true,
      count: events.length,
      events
    });

  } catch (error) {
    console.error("Error fetching events:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch events."
    });
  }
});

module.exports = router;
