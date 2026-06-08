# Deployment Report

## Summary

The project is prepared for Railway deployment with a Railway-safe server port, MySQL environment variables, a health endpoint, Puppeteer no-sandbox launch flags, and the unused audit feature removed.

## Backend Entry File

- `server.js`

## Routes Available

- `GET /`
- `GET /api/places/health`
- `GET /api/places/scrape?search=<query>&limit=<number>`
- `DELETE /api/places/clear`

## Database Files

- `db.js`
- `jobs/cleanupOldBusinesses.js`
- `scripts/clearBusinesses.js`
- `migrations/001_create_businesses.sql`

## Browser Launch Code

- `controllers/puppeteerController.js`

## Database Requirements

Run `migrations/001_create_businesses.sql` before scraping data. The application expects a MySQL table named `businesses` with these columns:

- `id`
- `name`
- `address`
- `rating`
- `status`
- `website`
- `phone`
- `facebook`
- `instagram`
- `whatsapp`
- `created_at`

## Environment Variables Required

- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`
- `DB_PORT`

## Environment Variables Optional

- `GOOGLE_API_KEY`
- `DATA_RETENTION_DAYS`
- `SCRAPE_MAX_RESULTS`
- `SERVER_TIMEOUT_MS`

## Railway Test URLs

Replace `<railway-domain>` with the deployed Railway domain:

- `https://<railway-domain>/`
- `https://<railway-domain>/api/places/health`
- `https://<railway-domain>/api/places/scrape?search=restaurants%20in%20islamabad&limit=3`

## Verification

- Railway port uses `process.env.PORT || 5000`.
- Startup logs include environment, MySQL, and server status.
- Puppeteer launches with Railway-safe no-sandbox flags.
- Legacy audit route, controller, imports, and dependencies are removed.
