
const express = require("express");
const router = express.Router();
const db = require("../db");

// GET all admin-approved events
router.get("/", async (req, res) => {
  try {
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
      ORDER BY
        event_date IS NULL ASC,
        event_date ASC,
        id DESC`
    );

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });

  } catch (error) {
    console.error("Error fetching events:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch events.",
    });
  }
});

module.exports = router;
