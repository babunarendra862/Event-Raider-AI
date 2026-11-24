
require("dotenv").config();

const http = require("http");
const { google } = require("googleapis");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

const REDIRECT_URI = "http://localhost:3000/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing Gmail OAuth credentials in .env");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/gmail.send"],
});

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/oauth2callback")) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const url = new URL(req.url, REDIRECT_URI);

  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400);
    res.end("Authorization code missing.");
    server.close();
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.end("Gmail authorization successful! Close this window.");

    console.log("\nGMAIL AUTHORIZATION SUCCESSFUL");

    if (tokens.refresh_token) {
      console.log("\nRefresh Token:\n");
      console.log(tokens.refresh_token);
    } else {
      console.log("No refresh token received. Try authorization again.");
    }

  } catch (error) {
    console.error("OAuth error:", error.message);
    res.end("Authorization failed. Check your terminal.");
  }

  server.close();
});

server.listen(3000, () => {
  console.log("\nOpen this URL in your browser:\n");
  console.log(authUrl);
});
