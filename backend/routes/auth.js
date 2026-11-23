
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db = require("../db");

const router = express.Router();

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send welcome email
async function sendWelcomeEmail(student) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Email configuration is missing.");
  }

  await transporter.sendMail({
    from: `"Event Raider AI" <${process.env.EMAIL_USER}>`,
    to: student.email,
    subject: "Welcome to Event Raider AI!",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:25px;color:#333;">
        <h2 style="color:#6c4cff;">Welcome to Event Raider AI!</h2>

        <p>Hello <strong>${student.name}</strong>,</p>

        <p>Your student account has been successfully created.</p>

        <h3>Your Student Details</h3>

        <p><strong>Name:</strong> ${student.name}</p>
        <p><strong>Email:</strong> ${student.email}</p>
        <p><strong>College:</strong> ${student.college}</p>
        <p><strong>USN:</strong> ${student.usn}</p>
        <p><strong>Department:</strong> ${student.department}</p>
        <p><strong>Semester:</strong> ${student.semester}</p>

        <p>You can now log in and explore upcoming college events.</p>

        <p>Happy exploring!</p>

        <p>
          Best regards,<br/>
          <strong>Event Raider AI Team</strong>
        </p>
      </div>
    `,
  });
}

// ==========================================
// STUDENT REGISTRATION
// ==========================================

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
    } = req.body || {};

    const requiredFields = {
      name,
      email,
      password,
      phone,
      college,
      usn,
      department,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (typeof value !== "string" || !value.trim()) {
        return res.status(400).json({
          success: false,
          message: `${field} is required.`,
        });
      }
    }

    const semesterNumber = Number(semester);

    if (
      semester === undefined ||
      semester === null ||
      semester === "" ||
      !Number.isInteger(semesterNumber) ||
      semesterNumber < 1 ||
      semesterNumber > 8
    ) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid semester from 1 to 8.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    const normalizedPhone = phone.trim();

    if (!/^[0-9+() -]{7,20}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid phone number.",
      });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCollege = college.trim();
    const normalizedUsn = usn.trim().toUpperCase();
    const normalizedDepartment = department.trim();

    const [existing] = await db.execute(
      "SELECT id FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const [existingUsn] = await db.execute(
      "SELECT id FROM users WHERE usn = ?",
      [normalizedUsn]
    );

    if (existingUsn.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This USN / Student ID is already registered.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      `INSERT INTO users
        (
          name, email, password, role, phone,
          college, usn, department, semester
        )
       VALUES (?, ?, ?, 'student', ?, ?, ?, ?, ?)`,
      [
        normalizedName,
        normalizedEmail,
        hashedPassword,
        normalizedPhone,
        normalizedCollege,
        normalizedUsn,
        normalizedDepartment,
        semesterNumber,
      ]
    );

    // Send welcome email after successful database insertion
    let emailSent = false;

    try {
      await sendWelcomeEmail({
        name: normalizedName,
        email: normalizedEmail,
        college: normalizedCollege,
        usn: normalizedUsn,
        department: normalizedDepartment,
        semester: semesterNumber,
      });

      emailSent = true;
      console.log("Welcome email sent to:", normalizedEmail);

    } catch (emailError) {
      console.error("Welcome email failed:", emailError.message);
    }

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Student registered successfully. Welcome email sent."
        : "Student registered successfully, but welcome email could not be sent.",
      emailSent,
      user: {
        id: result.insertId,
        name: normalizedName,
        email: normalizedEmail,
        role: "student",
        phone: normalizedPhone,
        college: normalizedCollege,
        usn: normalizedUsn,
        department: normalizedDepartment,
        semester: semesterNumber,
      },
    });

  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to register. Please try again.",
    });
  }
});

// ==========================================
// LOGIN FOR STUDENTS AND ADMINS
// ==========================================

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const [users] = await db.execute(
      `SELECT
        id, name, email, password, role,
        phone, college, usn, department, semester
       FROM users
       WHERE email = ?`,
      [email.trim().toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = users[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing.");

      return res.status(500).json({
        success: false,
        message: "Server authentication is not configured.",
      });
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

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        college: user.college,
        usn: user.usn,
        department: user.department,
        semester: user.semester,
      },
    });

  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to log in. Please try again.",
    });
  }
});

module.exports = router;
