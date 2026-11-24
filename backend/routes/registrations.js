
const express = require("express");
const router = express.Router();
const db = require("../db");
const nodemailer = require("nodemailer");

const {
  authenticateToken,
  requireStudent,
} = require("../middleware/authMiddleware");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function formatEventDate(date) {
  if (!date) return "Date to be announced";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Date to be announced";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

// ==========================================
// SEND CONFIRMATION EMAIL
// ==========================================

async function sendEventEmail(student, event) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Email configuration is missing.");
  }

  const officialLink = event.registration_url || event.source_url || null;

  const safeName = escapeHtml(student.name);
  const safeTitle = escapeHtml(event.title);
  const safeCollege = escapeHtml(event.college);
  const safeLocation = escapeHtml(event.location);
  const safeDate = escapeHtml(formatEventDate(event.event_date));

  const safeLink = officialLink ? escapeHtml(officialLink) : null;

  await transporter.sendMail({
    from: `"Event Raider AI" <${process.env.EMAIL_USER}>`,
    to: student.email,
    subject: `Event Registration Confirmation - ${event.title}`,

    text: `
Hello ${student.name},

Your registration has been successfully recorded on Event Raider AI.

Event Details:

Event: ${event.title}
College: ${event.college || "Not specified"}
Date: ${formatEventDate(event.event_date)}
Location: ${event.location || "Not specified"}

${
  officialLink
    ? `Official Registration Link: ${officialLink}`
    : "Official registration link is currently unavailable."
}

Regards,
Event Raider AI Team
    `,

    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:25px;color:#263247;">

        <div style="background:#101c30;padding:22px;border-radius:12px;text-align:center;">
          <h1 style="color:#38bdf8;margin:0;">Event Raider AI</h1>
          <p style="color:white;">Discover. Connect. Experience.</p>
        </div>

        <h2>Registration Confirmation!</h2>

        <p>Hello <strong>${safeName}</strong>,</p>

        <p>Your registration has been successfully recorded.</p>

        <h3>Event Details</h3>

        <div style="background:#f1f5f9;padding:20px;border-radius:10px;line-height:1.9;">
          <p><strong>Event:</strong> ${safeTitle}</p>
          <p><strong>College:</strong> ${safeCollege || "Not specified"}</p>
          <p><strong>Date:</strong> ${safeDate}</p>
          <p><strong>Location:</strong> ${safeLocation || "Not specified"}</p>
        </div>

        ${
          safeLink
            ? `
              <div style="text-align:center;margin:28px 0;">
                <a href="${safeLink}"
                   target="_blank"
                   rel="noopener noreferrer"
                   style="display:inline-block;background:#0284c7;color:white;text-decoration:none;padding:14px 25px;border-radius:8px;font-weight:bold;">
                  Official Registration Link
                </a>
              </div>
            `
            : `<p>Official registration link is currently unavailable.</p>`
        }

        <p>Thank you for using Event Raider AI!</p>

        <p>Regards,<br/><strong>Event Raider AI Team</strong></p>

        <hr/>

        <p style="font-size:12px;color:#64748b;text-align:center;">
          © ${new Date().getFullYear()} Event Raider AI
        </p>

      </div>
    `,
  });
}

// ==========================================
// REGISTER FOR AN EVENT
// ==========================================

router.post("/:eventId", authenticateToken, requireStudent, async (req, res) => {
  try {
    const eventId = Number(req.params.eventId);

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    // Only check whether the event exists.
    const [events] = await db.execute(
      `SELECT
        id,
        title,
        college,
        event_date,
        location,
        registration_url,
        source_url
       FROM events
       WHERE id = ?`,
      [eventId]
    );

    if (events.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    const event = events[0];

    // No date, expiry, status, URL or location restrictions.

    // Save student registration.
    await db.execute(
      `INSERT INTO event_registrations
        (student_id, event_id)
       VALUES (?, ?)`,
      [req.user.id, eventId]
    );

    console.log(
      `Student ${req.user.id} registered for event ${eventId}`
    );

    // Email is optional. Registration succeeds even if email fails.
    let emailSent = false;
    let emailMessage = "";

    try {
      await sendEventEmail(req.user, event);

      emailSent = true;
      emailMessage = "Confirmation email sent successfully.";

    } catch (emailError) {
      emailMessage = "Registration successful, but email could not be sent.";

      console.error(
        "Event confirmation email failed:",
        emailError.message
      );
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful!",
      emailSent,
      emailMessage,

      event: {
        id: event.id,
        title: event.title,
        college: event.college,
        event_date: event.event_date,
        location: event.location,
        official_link: event.registration_url || event.source_url || null,
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

// ==========================================
// GET STUDENT REGISTRATIONS
// ==========================================

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
