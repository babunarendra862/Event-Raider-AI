
const express = require("express");
const router = express.Router();
const db = require("../db");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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

    // Check whether the event is approved and upcoming
    const [events] = await db.execute(
      `SELECT id, title, event_date, location,
              registration_url, source_url
       FROM events
       WHERE id = ?
       AND event_status = 'upcoming'
       AND event_date IS NOT NULL
       AND DATE(event_date) >= ?`,
      [eventId, getToday()]
    );

    if (events.length === 0) {
      return res.status(404).json({
        success: false,
        message: "This event is unavailable for registration.",
      });
    }

    // Save student registration
    await db.execute(
      `INSERT INTO event_registrations (student_id, event_id)
       VALUES (?, ?)`,
      [req.user.id, eventId]
    );

    // Select official registration link
    const officialLink =
      events[0].registration_url || events[0].source_url;

    // Send registration confirmation email
    try {
      await transporter.sendMail({
        from: `"Event Raider AI" <${process.env.EMAIL_USER}>`,
        to: req.user.email,
        subject: "Event Registration Confirmed!",
        html: `
          <div style="
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: auto;
            padding: 25px;
            color: #333;
          ">

            <h2 style="color: #6c4cff;">
              Registration Successful!
            </h2>

            <p>Hello ${req.user.name},</p>

            <p>
              Thank you for registering through Event Raider AI.
              Your registration has been successfully completed.
            </p>

            <h3>Event Details</h3>

            <p>
              <strong>Event:</strong> ${events[0].title}
            </p>

            <p>
              <strong>Date:</strong>
              ${events[0].event_date}
            </p>

            <p>
              <strong>Venue:</strong>
              ${events[0].location || "To be announced"}
            </p>

            ${
              officialLink
                ? `
                  <div style="margin: 25px 0;">
                    <a
                      href="${officialLink}"
                      target="_blank"
                      style="
                        background-color: #6c4cff;
                        color: white;
                        padding: 13px 22px;
                        text-decoration: none;
                        border-radius: 6px;
                        display: inline-block;
                        font-weight: bold;
                      "
                    >
                      Visit Official Registration Page
                    </a>
                  </div>

                  <p>
                    You can also copy this link:
                    <br />
                    <a href="${officialLink}">
                      ${officialLink}
                    </a>
                  </p>
                `
                : `
                  <p>
                    The official registration link is currently unavailable.
                    Please check the college event website.
                  </p>
                `
            }

            <p>
              We look forward to seeing you at the event!
            </p>

            <p>
              Best regards,<br />
              <strong>Event Raider AI Team</strong>
            </p>

          </div>
        `,
      });

      console.log(
        "Confirmation email sent to:",
        req.user.email
      );

    } catch (emailError) {
      console.error(
        "Confirmation email failed:",
        emailError.message
      );
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful!",
      event: events[0],
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
