
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const ca = process.env.DB_SSL_CA
  ? process.env.DB_SSL_CA.replace(/\\n/g, "\n")
  : fs.readFileSync(
      path.join(__dirname, "certs", "tidb-ca.pem"),
      "utf8"
    );

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  ssl: {
    ca,
    minVersion: "TLSv1.2",
  },
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
