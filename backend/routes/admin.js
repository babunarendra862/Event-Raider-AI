
const express = require("express");
const router = express.Router();
const db = require("../db");

const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");

// All routes below require Admin authentication
router.use(authenticateToken, requireAdmin);

// Admin dashboard statistics
router.get("/dashboard", async (req, res) => {
  try {
    const [users] = await db.execute(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'student'"
    );

    const [events] = await db.execute(
      "SELECT COUNT(*) AS total FROM events"
    );

    const [registrations] = await db.execute(
      "SELECT COUNT(*) AS total FROM registrations"
    );

    const [statuses] = await db.execute(
      `SELECT event_status, COUNT(*) AS total
       FROM events
       GROUP BY event_status`
    );

    res.json({
      success: true,
      statistics: {
        students: users[0].total,
        events: events[0].total,
        registrations: registrations[0].total,
        eventStatuses: statuses,
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to load dashboard statistics.",
    });
  }
});

// Get events, optionally filtered by status
router.get("/events", async (req, res) => {
  try {
    const { status } = req.query;
    const allowedStatuses = ["needs_review", "upcoming", "expired"];

    let query = "SELECT * FROM events";
    let params = [];

    if (status) {
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid event status.",
        });
      }

      query += " WHERE event_status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const [events] = await db.execute(query, params);

    res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Admin events error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to fetch events.",
    });
  }
});

// Approve or reject an event
router.patch("/events/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    if (!["upcoming", "needs_review", "expired"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event status.",
      });
    }

    const [result] = await db.execute(
      "UPDATE events SET event_status = ? WHERE id = ?",
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    res.json({
      success: true,
      message: "Event status updated successfully.",
    });
  } catch (error) {
    console.error("Event approval error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to update event status.",
    });
  }
});

module.exports = router;
