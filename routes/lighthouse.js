const express = require("express");
const router = express.Router();
const lighthouseController = require("../controllers/lighthouseController");

// React frontend calls: POST /api/lighthouse/analyze  { url: "https://example.com" }
router.post("/analyze", lighthouseController.analyze);

module.exports = router;
