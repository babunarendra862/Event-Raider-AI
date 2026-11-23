
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

    // Check whether event is approved and upcoming
    const [events] = await db.execute(
      `SELECT
        id, title, college, event_date, location,
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

    const event = events[0];

    // Save student registration
    await db.execute(
      `INSERT INTO event_registrations (student_id, event_id)
       VALUES (?, ?)`,
      [req.user.id, eventId]
    );

    const officialLink =
      event.registration_url || event.source_url;

    // Format date
    const formattedDate = new Date(event.event_date).toLocaleString(
      "en-IN",
      {
        timeZone: "Asia/Kolkata",
        dateStyle: "long",
        timeStyle: "short",
      }
    );

    // Send confirmation email
    let emailSent = false;

    try {
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error("Email configuration is missing.");
      }

      await transporter.sendMail({
        from: `"Event Raider AI" <${process.env.EMAIL_USER}>`,
        to: req.user.email,
        subject: "Event Registration Confirmed!",
        html: `
          <div style="
            font-family:Arial,sans-serif;
            max-width:600px;
            margin:auto;
            padding:25px;
            color:#333;
          ">
            <h2 style="color:#6c4cff;">
              Registration Successful!
            </h2>

            <p>Hello <strong>${req.user.name}</strong>,</p>

            <p>
              Your registration through Event Raider AI
              has been successfully saved.
            </p>

            <h3>Event Details</h3>

            <p><strong>Event:</strong> ${event.title}</p>
            <p><strong>College:</strong> ${event.college || "Not specified"}</p>
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Venue:</strong> ${event.location || "To be announced"}</p>

            ${
              officialLink
                ? `
                  <div style="margin:25px 0;">
                    <a
                      href="${officialLink}"
                      style="
                        background:#6c4cff;
                        color:white;
                        padding:13px 22px;
                        text-decoration:none;
                        border-radius:6px;
                        display:inline-block;
                      "
                    >
                      Visit Official Event Page
                    </a>
                  </div>
                `
                : `
                  <p>
                    The official event link is currently unavailable.
                    Please check the college event website.
                  </p>
                `
            }

            <p>We look forward to seeing you at the event!</p>

            <p>
              Best regards,<br/>
              <strong>Event Raider AI Team</strong>
            </p>
          </div>
        `,
      });

      emailSent = true;

      console.log(
        "Event confirmation email sent to:",
        req.user.email
      );

    } catch (emailError) {
      console.error(
        "Event confirmation email failed:",
        emailError.message
      );
    }

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Registration successful! Confirmation email sent."
        : "Registration successful, but confirmation email could not be sent.",
      emailSent,
      event,
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
