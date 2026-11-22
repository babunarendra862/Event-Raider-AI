
const cron = require("node-cron");
const db = require("./db");

async function updateEventStatuses() {
  try {
    const [result] = await db.query(`
      UPDATE events
      SET event_status = CASE
        WHEN event_date IS NULL THEN 'needs_review'
        WHEN DATE(event_date) < CURDATE() THEN 'expired'
        ELSE 'upcoming'
      END
    `);

    console.log(
      `Event status check completed. Updated ${result.affectedRows} records.`
    );
  } catch (error) {
    console.error("Event status update failed:", error.message);
  }
}

// Check immediately when the backend starts.
updateEventStatuses();

// Then check every day at 2:00 AM.
cron.schedule("0 2 * * *", updateEventStatuses, {
  timezone: "Asia/Kolkata"
});

console.log("Automatic event status checker is running.");
