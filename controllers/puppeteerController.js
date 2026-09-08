const axios = require("axios");
const puppeteer = require("puppeteer");
const db = require("../db");

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getMaxResults(req) {
    const fromQuery = Number.parseInt(req.query.limit, 10);
    const fromEnv = Number.parseInt(process.env.SCRAPE_MAX_RESULTS, 10);
    const raw = Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : fromEnv;
    const value = Number.isFinite(raw) && raw > 0 ? raw : 30;

    return Math.max(1, Math.min(60, value));
}

function getGoogleErrorMessage(err) {
    return (
        err.response?.data?.error?.message ||
        err.response?.data?.error_message ||
        err.message
    );
}

async function prepareMapsPage(page) {
    await page.setRequestInterception(true);
    page.on("request", request => {
        if (["image", "media", "font"].includes(request.resourceType())) {
            request.abort();
            return;
        }

        request.continue();
    });
}

async function gotoWithRetry(page, url, options, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await page.goto(url, options);
        } catch (err) {
            const canRetry =
                /Navigating frame was detached|net::ERR_ABORTED/i.test(err.message || "");

            if (!canRetry || attempt === retries) {
                throw err;
            }

            await sleep(1000 * (attempt + 1));
        }
    }
}

async function fetchTextSearchPage(search, pageToken, pageSize) {
    const body = {
        textQuery: search,
        pageSize
    };

    if (pageToken) {
        body.pageToken = pageToken;
    }

    try {
        const response = await axios.post(
            "https://places.googleapis.com/v1/places:searchText",
            body,
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": process.env.GOOGLE_API_KEY,
                    "X-Goog-FieldMask":
                        "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.websiteUri,places.googleMapsUri,places.businessStatus,nextPageToken"
                }
            }
        );

        return response.data;
    } catch (err) {
        throw new Error(getGoogleErrorMessage(err));
    }
}

async function fetchPlaces(search, maxResults) {
    const places = [];
    let pageToken = "";

    while (places.length < maxResults) {
        if (pageToken) {
            await sleep(1500);
        }

        const remaining = maxResults - places.length;
        const page = await fetchTextSearchPage(search, pageToken, Math.min(20, remaining));
        places.push(...(page.places || []));

        if (!page.nextPageToken || places.length >= maxResults) {
            break;
        }

        pageToken = page.nextPageToken;
    }

    return places.slice(0, maxResults);
}

async function collectMapsPlaceUrls(page, search, maxResults) {
    await prepareMapsPage(page);
    await gotoWithRetry(
        page,
        `https://www.google.com/maps/search/${encodeURIComponent(search)}`,
        { waitUntil: "domcontentloaded", timeout: 60000 }
    );
    await page.waitForSelector("div[role='article'], a[href*='/place/']", {
        timeout: 30000
    });
    await sleep(2500);

    let urls = [];
    let unchangedPasses = 0;

    for (let pass = 0; pass < 35 && urls.length < maxResults; pass++) {
        const nextUrls = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll("a[href*='/place/']"))
                .map(link => link.href)
                .filter(Boolean);

            return Array.from(new Set(links));
        });

        if (nextUrls.length === urls.length) {
            unchangedPasses++;
        } else {
            unchangedPasses = 0;
        }

        urls = nextUrls;
        if (unchangedPasses >= 5) break;

        await page.evaluate(() => {
            const feed = document.querySelector("div[role='feed']");
            if (feed) {
                feed.scrollBy(0, 1200);
                return;
            }
            window.scrollBy(0, window.innerHeight);
        });
        await sleep(1200);
    }

    return urls.slice(0, maxResults);
}

async function extractMapsPlace(browser, url) {
    const page = await browser.newPage();
    await prepareMapsPage(page);

    try {
        await gotoWithRetry(page, url, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });
        await page.waitForSelector("h1", { timeout: 15000 });
        await sleep(1800);

        return page.evaluate(() => {
            const clean = value =>
                String(value || "")
                    .split("\n")
                    .map(part => part.trim())
                    .filter(Boolean)
                    .pop() || "";

            const ratingText =
                document
                    .querySelector("div[role='main'] span[role='img']")
                    ?.getAttribute("aria-label") || "";
            const links = Array.from(document.querySelectorAll("a")).map(link => link.href);

            return {
                name: document.querySelector("h1")?.innerText || "",
                rating: parseFloat(ratingText) || null,
                address: clean(
                    document.querySelector("button[data-item-id='address']")?.innerText
                ),
                website:
                    document.querySelector("a[data-item-id='authority']")?.href || "",
                phone: clean(
                    document.querySelector("button[data-item-id^='phone']")?.innerText
                ),
                facebook:
                    links.find(href => href.includes("facebook.com")) || "",
                instagram:
                    links.find(href => href.includes("instagram.com")) || "",
                whatsapp:
                    links.find(
                        href => href.includes("wa.me") || href.includes("whatsapp")
                    ) || "",
                status: "",
                mapsUrl: window.location.href
            };
        });
    } finally {
        await page.close();
    }
}

async function scrapeMapsHeadless(search, maxResults) {
    console.log("Launching Puppeteer with VPS-safe no-sandbox args");

    const launchOptions = {
        headless: "new",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
        ]
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const browser = await puppeteer.launch(launchOptions);
    try {
        const searchPage = await browser.newPage();
        const urls = await collectMapsPlaceUrls(searchPage, search, maxResults);
        await searchPage.close();
        console.log(`Headless Maps collected ${urls.length} place URLs`);

        const results = [];
        const concurrency = 5;

        for (let i = 0; i < urls.length; i += concurrency) {
            const batch = urls.slice(i, i + concurrency);
            const batchResults = await Promise.all(
                batch.map(url =>
                    extractMapsPlace(browser, url).catch(err => {
                        console.log("Headless Maps detail error:", err.message);
                        return null;
                    })
                )
            );

            for (const place of batchResults) {
                if (place?.name) {
                    results.push(place);
                    console.log("Found:", place.name);
                }
            }
        }

        return results;
    } finally {
        await browser.close();
    }
}

function normalizePlace(place) {
    return {
        name: place.displayName?.text || "",
        rating: place.rating || null,
        address: place.formattedAddress || "",
        website: place.websiteUri || "",
        phone:
            place.nationalPhoneNumber || place.internationalPhoneNumber || "",
        facebook: "",
        instagram: "",
        whatsapp: "",
        status: place.businessStatus || "",
        mapsUrl: place.googleMapsUri || ""
    };
}

async function saveBusinesses(results) {
    if (!results.length) return;

    const sql = `
        INSERT INTO businesses
        (name, address, rating, status, website, phone, facebook, instagram, whatsapp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await Promise.all(
        results.map(place =>
            db.promise().query(sql, [
                place.name,
                place.address,
                place.rating,
                place.status,
                place.website,
                place.phone,
                place.facebook,
                place.instagram,
                place.whatsapp
            ])
        )
    );
}

exports.scrapePlaces = async (req, res) => {
    const { search } = req.query;
    const maxResults = getMaxResults(req);

    if (!search) {
        return res.status(400).json({ message: "Search query is required" });
    }

    try {
        let results = [];
        let source = "google_places_api";

        if (process.env.GOOGLE_API_KEY) {
            try {
                console.log(`Searching Google Places API for "${search}" (limit ${maxResults})`);
                const places = await fetchPlaces(search, maxResults);

                for (const place of places) {
                    const normalized = normalizePlace(place);

                    if (normalized.name) {
                        results.push(normalized);
                        console.log("Found:", normalized.name);
                    }
                }
            } catch (err) {
                console.log("Google Places API unavailable, using headless Maps:", err.message);
                results = [];
            }
        }

        if (!results.length) {
            source = "google_maps_headless";
            results = await scrapeMapsHeadless(search, maxResults);
        }

        await saveBusinesses(results);

        res.json({
            data: results,
            count: results.length,
            requested: maxResults,
            source
        });
    } catch (err) {
        console.log("Google Places search failed:", err.message);
        res.status(500).json({
            message: "Failed to search businesses",
            error: err.message
        });
    }
};
