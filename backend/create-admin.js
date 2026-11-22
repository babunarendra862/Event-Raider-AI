
require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./db");

async function createAdmin() {
  try {
    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

    if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error("Admin details are missing.");
    }

    if (ADMIN_PASSWORD.length < 8) {
      throw new Error("Password must contain at least 8 characters.");
    }

    const email = ADMIN_EMAIL.trim().toLowerCase();

    const [existing] = await db.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      throw new Error("This email already exists. No account was changed.");
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    await db.execute(
      `INSERT INTO users (name, email, password, role)
       VALUES (?, ?, ?, 'admin')`,
      [ADMIN_NAME.trim(), email, hashedPassword]
    );

    console.log("Admin account created successfully!");
    console.log("Email:", email);
  } catch (error) {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

createAdmin();
