
const express = require("express");
const router = express.Router();
const db = require("../db");

const {
  authenticateToken,
  requireStudent,
} = require("../middleware/authMiddleware");

// Get today's date in Indian timezone
function getToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Register for an event
router.post("/:eventId", authenticateToken, requireStudent, async (req, res) => {
  try {
    const eventId = Number(req.params.eventId);

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    // Step 1: Find the event without applying eligibility filters
    const [events] = await db.execute(
      `SELECT
        id,
        title,
        college,
        event_date,
        DATE_FORMAT(event_date, '%Y-%m-%d') AS event_day,
        location,
        registration_url,
        source_url,
        event_status
       FROM events
       WHERE id = ?`,
      [eventId]
    );

    // Check whether event exists
    if (events.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found in the database.",
      });
    }

    const event = events[0];

    // Step 2: Check event status
    if (
      String(event.event_status || "").trim().toLowerCase() !== "upcoming"
    ) {
      return res.status(409).json({
        success: false,
        message: `Event is not available. Current status: ${event.event_status || "Not set"}.`,
      });
    }

    // Step 3: Check event date
    if (!event.event_day) {
      return res.status(409).json({
        success: false,
        message: "Event date is missing. Please contact the administrator.",
      });
    }

    // Step 4: Reject expired events
    if (event.event_day < getToday()) {
      return res.status(409).json({
        success: false,
        message: `This event has expired. Event date: ${event.event_day}.`,
      });
    }

    // Step 5: Register student
    await db.execute(
      `INSERT INTO event_registrations (student_id, event_id)
       VALUES (?, ?)`,
      [req.user.id, eventId]
    );

    console.log(
      `Student ${req.user.id} registered successfully for event ${eventId}`
    );

    return res.status(201).json({
      success: true,
      message: "Registration successful!",
      event: {
        id: event.id,
        title: event.title,
        college: event.college,
        event_date: event.event_date,
        location: event.location,
      },
    });

  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "You have already registered for this event.",
      });
    }

    console.error("Event registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to complete registration.",
    });
  }
});

// Get logged-in student's registrations
router.get("/my", authenticateToken, requireStudent, async (req, res) => {
  try {
    const [registrations] = await db.execute(
      `SELECT
         r.id AS registration_id,
         r.registration_date,
         r.status AS registration_status,
         e.id AS event_id,
         e.title,
         e.college,
         e.category,
         e.event_date,
         e.location,
         e.registration_url,
         e.source_url
       FROM event_registrations r
       JOIN events e ON r.event_id = e.id
       WHERE r.student_id = ?
       ORDER BY r.registration_date DESC`,
      [req.user.id]
    );

    return res.json({
      success: true,
      registrations,
    });

  } catch (error) {
    console.error("Fetch registrations error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch your registrations.",
    });
  }
});

module.exports = router;
