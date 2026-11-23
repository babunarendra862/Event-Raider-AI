
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

const RESEND_API_URL = "https://api.resend.com/emails";

// Escape user-provided values before inserting them into HTML.
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

async function sendWelcomeEmail(student) {
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
      subject: "Welcome to Event Raider AI!",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
          <h2>Welcome to Event Raider AI, ${escapeHtml(student.name)}!</h2>
          <p>Your student account has been created successfully.</p>
          <p>You can now explore college events and register for events through Event Raider AI.</p>
          <hr />
          <p><strong>Name:</strong> ${escapeHtml(student.name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(student.email)}</p>
          <p><strong>College:</strong> ${escapeHtml(student.college)}</p>
          <p><strong>USN:</strong> ${escapeHtml(student.usn)}</p>
          <p>Thank you for joining us!</p>
          <p><strong>Event Raider AI Team</strong></p>
        </div>
      `,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message || result.error || "Welcome email could not be sent."
    );
  }

  return result;
}

// STUDENT REGISTRATION
router.post("/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      college,
      usn,
      department,
      semester,
    } = req.body;

    if (
      !name ||
      !email ||
      !password ||
      !phone ||
      !college ||
      !usn ||
      !department ||
      semester === undefined ||
      semester === null ||
      semester === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required fields.",
      });
    }

    const semesterNumber = Number(semester);

    if (
      !Number.isInteger(semesterNumber) ||
      semesterNumber < 1 ||
      semesterNumber > 8
    ) {
      return res.status(400).json({
        success: false,
        message: "Semester must be between 1 and 8.",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedUsn = String(usn).trim().toUpperCase();

    // Check duplicate email.
    const [existingEmail] = await db.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered.",
      });
    }

    // Check duplicate USN.
    const [existingUsn] = await db.query(
      "SELECT id FROM users WHERE usn = ? LIMIT 1",
      [normalizedUsn]
    );

    if (existingUsn.length > 0) {
      return res.status(409).json({
        success: false,
        message: "USN is already registered.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create student account.
    const [insertResult] = await db.query(
      `INSERT INTO users
       (name, email, password, role, phone, college, usn, department, semester)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        normalizedEmail,
        hashedPassword,
        "student",
        String(phone).trim(),
        String(college).trim(),
        normalizedUsn,
        String(department).trim(),
        semesterNumber,
      ]
    );

    const student = {
      id: insertResult.insertId,
      name: String(name).trim(),
      email: normalizedEmail,
      role: "student",
      phone: String(phone).trim(),
      college: String(college).trim(),
      usn: normalizedUsn,
      department: String(department).trim(),
      semester: semesterNumber,
    };

    // Send welcome email. Registration remains successful if email fails.
    try {
      await sendWelcomeEmail(student);
      console.log("Welcome email sent to:", student.email);
    } catch (emailError) {
      console.error("Welcome email failed:", emailError.message);
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful!",
      user: student,
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
    });
  }
});

// STUDENT LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const [users] = await db.query(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = users[0];

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing.");
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "2h",
      }
    );

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      college: user.college,
      usn: user.usn,
      department: user.department,
      semester: user.semester,
    };

    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
    });
  }
});

module.exports = router;
