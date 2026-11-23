const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

// Student registration
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

    // Validate required fields
    const requiredFields = {
      name,
      email,
      password,
      phone,
      college,
      usn,
      department,
      semester,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (typeof value !== "string" || !value.trim()) {
        return res.status(400).json({
          success: false,
          message: `${field} is required.`,
        });
      }
    }

    // Validate password
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    // Validate phone
    if (!/^[0-9+() -]{7,20}$/.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid phone number.",
      });
    }

    // Validate semester
    if (!/^[1-8]$/.test(semester.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please select a semester from 1 to 8.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsn = usn.trim().toUpperCase();

    // Check duplicate email
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

    // Check duplicate USN
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert student
    const [result] = await db.execute(
      `INSERT INTO users
        (
          name,
          email,
          password,
          role,
          phone,
          college,
          usn,
          department,
          semester
        )
       VALUES (?, ?, ?, 'student', ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        normalizedEmail,
        hashedPassword,
        phone.trim(),
        college.trim(),
        normalizedUsn,
        department.trim(),
        semester.trim(),
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Student registered successfully.",
      user: {
        id: result.insertId,
        name: name.trim(),
        email: normalizedEmail,
        role: "student",
        phone: phone.trim(),
        college: college.trim(),
        usn: normalizedUsn,
        department: department.trim(),
        semester: semester.trim(),
      },
    });

  } catch (error) {
    console.error("Registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to register. Please try again.",
    });
  }
});

// Login for students and admins
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

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
        id,
        name,
        email,
        password,
        role,
        phone,
        college,
        usn,
        department,
        semester
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
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to log in. Please try again.",
    });
  }
});

module.exports = router;