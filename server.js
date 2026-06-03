00require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cleanupOldBusinesses = require("./jobs/cleanupOldBusinesses");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api/places", require("./routes/places"));
app.use("/api/lighthouse", require("./routes/lighthouse"));
app.use(require("express").static("public"));

const serverTimeoutMs = Number(process.env.SERVER_TIMEOUT_MS || 120000);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    const runCleanup = async () => {
        try {
            const deletedRows = await cleanupOldBusinesses();
            const days = Number.parseInt(process.env.DATA_RETENTION_DAYS, 10) || 3;
            console.log(
                `Cleanup complete: deleted ${deletedRows} businesses older than ${days} day(s)`
            );
        } catch (err) {
            console.error("Cleanup failed (server will continue):", err?.message || err);
        }
    };

    runCleanup();
    setInterval(runCleanup, 24 * 60 * 60 * 1000);
});

server.setTimeout(serverTimeoutMs);