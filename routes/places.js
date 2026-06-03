const express = require("express");
const router = express.Router();
const puppeteerController = require("../controllers/puppeteerController");
const db = require("../db");

router.get("/health", (req, res) => {
    res.json({
        ok: true,
        message: "Places route working"
    });
});

router.get("/scrape", puppeteerController.scrapePlaces);

router.delete("/clear", async (req, res) => {
    try {
        const [result] = await db.promise().query("DELETE FROM businesses");

        res.json({
            message: "All business data deleted",
            deletedRows: Number(result?.affectedRows || 0)
        });
    } catch (err) {
        console.error("Clear businesses failed:", err?.message || err);
        res.status(500).json({ message: "Failed to delete business data" });
    }
});

router.get("/health", (req, res) => {
    res.json({
        ok: true,
        message: "Places route working"
    });
});

module.exports = router;
