
const { google } = require("googleapis");

async function sendGmail({ to, subject, text, html }) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  const boundary = `event-raider-${Date.now()}`;

  const encodedSubject = Buffer.from(subject, "utf8").toString("base64");

  const message = [
    `From: Event Raider AI <${process.env.EMAIL_USER}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text || "", "utf8").toString("base64"),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html || "", "utf8").toString("base64"),
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const raw = Buffer.from(message).toString("base64url");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  console.log("Gmail API email sent:", result.data.id);

  return result.data;
}

module.exports = sendGmail;
