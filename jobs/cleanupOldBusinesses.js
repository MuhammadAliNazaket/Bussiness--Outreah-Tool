const db = require("../db");

function getRetentionDays() {
    const raw = process.env.DATA_RETENTION_DAYS;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 3;
}

async function ensureBusinessesCreatedAtColumn() {
    const sql = `
        SELECT COUNT(*) AS cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'businesses'
          AND COLUMN_NAME = 'created_at'
    `;

    const [rows] = await db.promise().query(sql);
    const exists = Number(rows?.[0]?.cnt || 0) > 0;
    if (exists) return false;

    await db
        .promise()
        .query(
            "ALTER TABLE businesses ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        );
    return true;
}

async function cleanupOldBusinesses(retentionDays = getRetentionDays()) {
    const days = Number.parseInt(retentionDays, 10);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 3;

    await ensureBusinessesCreatedAtColumn();

    const [result] = await db
        .promise()
        .query(
            "DELETE FROM businesses WHERE created_at < NOW() - INTERVAL ? DAY",
            [safeDays]
        );

    return Number(result?.affectedRows || 0);
}

module.exports = cleanupOldBusinesses;
module.exports.cleanupOldBusinesses = cleanupOldBusinesses;
module.exports.ensureBusinessesCreatedAtColumn = ensureBusinessesCreatedAtColumn;

