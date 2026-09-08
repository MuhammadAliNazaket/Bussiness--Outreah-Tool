# Cleanup Report

## Summary

- Project audited and patched for VPS deployment on Ubuntu hosts such as Oracle Cloud, Hostinger, and Contabo.
- Railway-only files, logs, editor metadata, one dead controller, and one unused npm script were removed.
- Express backend, Puppeteer scraper, MySQL integration, frontend dashboard, cleanup job, migration, and environment configuration were preserved.
- Scraper logic was not modified.

## Files Deleted

- `.vscode/settings.json` — editor-only configuration, not required at runtime.
- `.vscode/` — empty editor settings directory after deleting `settings.json`.
- `server.out.log` — empty generated log file.
- `server.err.log` — empty generated log file.
- `railway.json` — Railway-specific deployment configuration.
- `RAILWAY_DEPLOYMENT_CHECKLIST.md` — Railway-specific deployment notes.
- `DEPLOYMENT_REPORT.md` — Railway-focused deployment report, superseded by this VPS cleanup report.
- `controllers/placesController.js` — dead controller; no route, script, job, server file, or frontend file referenced it.

## Files Kept

- `server.js` — Express entry point, route registration, static frontend hosting, cleanup scheduling.
- `routes/places.js` — active `/api/places` route module registered by `server.js`.
- `controllers/puppeteerController.js` — active scraper controller used by `routes/places.js`.
- `db.js` — active MySQL connection module used by routes, jobs, scripts, and scraper storage.
- `jobs/cleanupOldBusinesses.js` — active cleanup job imported by `server.js`.
- `scripts/clearBusinesses.js` — useful maintenance script exposed as `npm run clear:businesses`.
- `migrations/001_create_businesses.sql` — database setup migration required for VPS MySQL setup.
- `public/index.html` — active frontend dashboard served by Express static middleware.
- `.env.example` — deployment environment template.
- `.gitignore` — updated to keep runtime secrets, logs, coverage, and build outputs out of Git.
- `package.json` and `package-lock.json` — dependency and startup metadata.

## Audit Findings

- Used files: all remaining source files are referenced by the runtime, npm scripts, database setup, or frontend serving path.
- Unused files: removed confirmed unused logs, Railway files, editor settings, and `controllers/placesController.js`.
- Duplicate files: none found by SHA-256 hash scan outside `.git` and `node_modules`.
- Dead routes: none found; `routes/places.js` is registered in `server.js`.
- Dead controllers: `controllers/placesController.js` removed; `controllers/puppeteerController.js` is active.
- Unused scripts: default failing `npm test` placeholder removed; `scripts/clearBusinesses.js` kept as maintenance.
- Unused dependencies: none removed; all direct dependencies are referenced by active runtime code.
- Unused assets: none found; `public/index.html` is the only public asset and is served directly.

## Dependencies

- Kept `axios` — used by `controllers/puppeteerController.js` for Google Places API requests.
- Kept `cors` — used by `server.js`.
- Kept `dotenv` — used by `server.js`, `db.js`, and `scripts/clearBusinesses.js`.
- Kept `express` — used by `server.js` and `routes/places.js`.
- Kept `mysql2` — used by `db.js`.
- Kept `puppeteer` — used by `controllers/puppeteerController.js`.
- Removed dependencies: none.
- Added `postinstall` and `install:browser` scripts so Puppeteer installs its pinned Chrome browser.
- Added optional `PUPPETEER_EXECUTABLE_PATH` support for VPS systems that use a system-installed Chrome/Chromium binary.

## Route Verification

- `GET /` — served from `public/index.html`.
- `GET /api/places/health` — registered and smoke-tested successfully.
- `GET /api/places/scrape?search=<query>&limit=<number>` — registered and used by the frontend dashboard.
- `DELETE /api/places/clear` — registered and uses active MySQL code.

## Integrity Checks

- Import syntax check passed for `server.js`, `routes/places.js`, `controllers/puppeteerController.js`, `jobs/cleanupOldBusinesses.js`, `scripts/clearBusinesses.js`, and `db.js`.
- Dependency verification passed with `npm.cmd ls --depth=0`.
- Startup smoke test passed on a temporary port with health route returning HTTP 200.
- MySQL connection verification passed with non-mutating `SELECT 1`.
- Frontend smoke test passed: `/` returned the dashboard and references `/api/places/scrape`.
- Puppeteer reference verification passed: active scraper controller still contains `puppeteer.launch`.
- Browser scraper verification passed on `http://127.0.0.1:5000/api/places/scrape?search=restaurants%20in%20Islamabad&limit=1`.

## Remaining Project Structure

```text
.
├── .env
├── .env.example
├── .gitignore
├── CLEANUP_REPORT.md
├── controllers/
│   └── puppeteerController.js
├── db.js
├── jobs/
│   └── cleanupOldBusinesses.js
├── migrations/
│   └── 001_create_businesses.sql
├── package-lock.json
├── package.json
├── public/
│   └── index.html
├── routes/
│   └── places.js
├── scripts/
│   └── clearBusinesses.js
└── server.js
```

## VPS Deployment Readiness

- Safe to deploy on VPS: YES.
- Required runtime: Node.js, npm, MySQL, and Ubuntu packages needed by Puppeteer/Chromium.
- Required setup: create the MySQL database, run `migrations/001_create_businesses.sql`, configure `.env`, install dependencies, then run `npm start`.
- Puppeteer setup: `npm install` now runs `puppeteer browsers install chrome`; if using system Chrome on VPS, set `PUPPETEER_EXECUTABLE_PATH`.
- Preserved functionality: Express backend, Puppeteer scraping, Google Places API fallback path, MySQL persistence, frontend dashboard, cleanup job, and manual cleanup script.
