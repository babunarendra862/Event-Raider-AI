
const express = require("express");
const db = require("../db");
const {
  authenticateToken,
  requireStudent,
} = require("../middleware/authMiddleware");

const router = express.Router();

const RESEND_API_URL = "https://api.resend.com/emails";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

async function sendEventConfirmationEmail(student, event) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is missing.");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.RESEND_FROM ||
        "Event Raider AI <onboarding@resend.dev>",
      to: [student.email],
      subject: `Registration Confirmed - ${event.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
          <h2>Event Registration Confirmed!</h2>
          <p>Hello ${escapeHtml(student.name)},</p>
          <p>Your registration has been successfully completed.</p>
          <hr />
          <h3>Event Details</h3>
          <p><strong>Event:</strong> ${escapeHtml(event.title)}</p>
          <p><strong>Date:</strong> ${escapeHtml(event.event_date)}</p>
          <p><strong>Location:</strong> ${escapeHtml(event.location)}</p>
          ${
            event.registration_url
              ? `<p><strong>Registration Link:</strong>
                  <a href="${escapeHtml(event.registration_url)}">Open Link</a></p>`
              : ""
          }
          <hr />
          <p>Thank you for using Event Raider AI.</p>
          <p><strong>Event Raider AI Team</strong></p>
        </div>
      `,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message || result.error || "Confirmation email could not be sent."
    );
  }

  return result;
}

// REGISTER FOR AN EVENT
router.post(
  "/:eventId",
  authenticateToken,
  requireStudent,
  async (req, res) => {
    try {
      const eventId = Number(req.params.eventId);
      const studentId = req.user.id;

      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid event ID.",
        });
      }

      // Find the event.
      const [events] = await db.query(
        `SELECT id, title, event_date, location, registration_url, source_url
         FROM events
         WHERE id = ?
         AND event_status = 'upcoming'
         AND DATE(event_date) >= CURDATE()
         LIMIT 1`,
        [eventId]
      );

      if (events.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Event not found or registration is unavailable.",
        });
      }

      const event = events[0];

      // Find the student.
      const [students] = await db.query(
        `SELECT id, name, email
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [studentId]
      );

      if (students.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Student account not found.",
        });
      }

      const student = students[0];

      // Save event registration.
      try {
        await db.query(
          `INSERT INTO event_registrations (student_id, event_id)
           VALUES (?, ?)`,
          [studentId, eventId]
        );
      } catch (insertError) {
        if (insertError.code === "ER_DUP_ENTRY") {
          return res.status(409).json({
            success: false,
            message: "You have already registered for this event.",
          });
        }

        throw insertError;
      }

      // Send confirmation email. Do not undo registration if email fails.
      let emailSent = false;

      try {
        await sendEventConfirmationEmail(student, event);
        emailSent = true;
        console.log("Event confirmation email sent to:", student.email);
      } catch (emailError) {
        console.error(
          "Event confirmation email failed:",
          emailError.message
        );
      }

      return res.status(201).json({
        success: true,
        message: "Registration successful!",
        emailSent,
        event,
      });
    } catch (error) {
      console.error("Event registration error:", error);

      return res.status(500).json({
        success: false,
        message: "Event registration failed. Please try again.",
      });
    }
  }
);

// GET STUDENT'S REGISTERED EVENTS
router.get(
  "/my",
  authenticateToken,
  requireStudent,
  async (req, res) => {
    try {
      const studentId = req.user.id;

      const [registrations] = await db.query(
        `SELECT
           er.id AS registration_id,
           er.student_id,
           er.event_id,
           e.title,
           e.event_date,
           e.location,
           e.registration_url,
           e.source_url
         FROM event_registrations er
         JOIN events e ON er.event_id = e.id
         WHERE er.student_id = ?
         ORDER BY er.id DESC`,
        [studentId]
      );

      return res.status(200).json({
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
  }
);

module.exports = router;
