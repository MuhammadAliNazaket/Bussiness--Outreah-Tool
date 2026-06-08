# Railway Deployment Checklist

1. Create a Railway project from `MuhammadAliNazaket/Data-Extractor-googlemaps`.
2. Add a MySQL database service in Railway.
3. Set these backend variables:
   - `DB_HOST`
   - `DB_USER`
   - `DB_PASS`
   - `DB_NAME`
   - `DB_PORT`
   - `GOOGLE_API_KEY` (optional but recommended)
   - `DATA_RETENTION_DAYS` (optional, default `3`)
   - `SCRAPE_MAX_RESULTS` (optional, default `30`)
   - `SERVER_TIMEOUT_MS` (optional, default `120000`)
4. Run `migrations/001_create_businesses.sql` against the Railway MySQL database.
5. Deploy with Railway Nixpacks using `npm start`.
6. Confirm startup logs include:
   - `Environment loaded`
   - `MySQL Connected`
   - `Server running on port <PORT>`
7. Test:
   - `/`
   - `/api/places/health`
   - `/api/places/scrape?search=restaurants%20in%20islamabad&limit=3`
