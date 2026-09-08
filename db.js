require("dotenv").config();
const mysql = require("mysql2");

const sslEnabled = !["0", "false", "no"].includes(
    String(process.env.DB_SSL ?? "true").toLowerCase()
);

const ssl = sslEnabled
    ? {
          minVersion: "TLSv1.2",
          rejectUnauthorized:
              String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "true").toLowerCase() !==
              "false",
          ...(process.env.DB_SSL_CA
              ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") }
              : {})
      }
    : undefined;

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT, 10) || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl
});

db.connect(err => {
    if (err) {
        console.log("DB Error:", err);
    } else {
        console.log("MySQL Connected");
    }
});

module.exports = db;