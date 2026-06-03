require("dotenv").config();

const db = require("../db");

async function main() {
    try {
        const [result] = await db.promise().query("DELETE FROM businesses");
        const deletedRows = Number(result?.affectedRows || 0);
        console.log(`All business data deleted. Rows deleted: ${deletedRows}`);
        await db.promise().end();
        process.exit(0);
    } catch (err) {
        console.error("Failed to delete business data:", err?.message || err);
        try {
            await db.promise().end();
        } catch {}
        process.exit(1);
    }
}

main();

