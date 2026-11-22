
require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./db");

async function resetAdminPassword() {
  try {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password || password.length < 8) {
      throw new Error("Valid admin email and password are required.");
    }

    const [users] = await db.execute(
      "SELECT id FROM users WHERE email = ? AND role = 'admin'",
      [email]
    );

    if (users.length === 0) {
      throw new Error("Admin account not found.");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await db.execute(
      "UPDATE users SET password = ? WHERE id = ? AND role = 'admin'",
      [hashedPassword, users[0].id]
    );

    console.log("Admin password reset successfully!");
  } catch (error) {
    console.error("Password reset failed:", error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

resetAdminPassword();
