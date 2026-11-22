
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./db");

const authRoutes = require("./routes/auth");
const eventRoutes = require("./routes/events");
const adminRoutes = require("./routes/admin");
const registrationRoutes = require("./routes/registrations");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Event Raider backend is running!",
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Event Raider API is working.",
  });
});

// Database connection test
app.get("/api/db-test", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DATABASE() AS database_name"
    );

    res.json({
      success: true,
      message: "MySQL connected successfully!",
      database: rows[0].database_name,
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(500).json({
      success: false,
      message: "MySQL connection failed.",
    });
  }
});

// Authentication routes
app.use("/api/auth", authRoutes);

// College events routes
app.use("/api/events", eventRoutes);

// Admin routes
app.use("/api/admin", adminRoutes);
app.use("/api/registrations", registrationRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

// General error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(
    `Event Raider server running at http://localhost:${PORT}`
  );
});
