const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");

const DEFAULT_ANALYSIS_TIMEOUT_MS = Number(process.env.LIGHTHOUSE_TIMEOUT_MS || 90000);
const CHROME_KILL_TIMEOUT_MS = Number(process.env.LIGHTHOUSE_CHROME_KILL_TIMEOUT_MS || 8000);
const MAX_CONCURRENT = Math.max(1, Number(process.env.LIGHTHOUSE_MAX_CONCURRENT || 2));
const ALLOW_PRIVATE_HOSTS = String(process.env.LIGHTHOUSE_ALLOW_PRIVATE_HOSTS || "").toLowerCase() === "true";
const NO_SANDBOX = String(process.env.LIGHTHOUSE_NO_SANDBOX || "").toLowerCase() === "true";

let activeRuns = 0;

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = "ETIMEDOUT";
      reject(err);
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function isPrivateIPv4(hostname) {
  // Fast-path for literal IPv4s.
  const m = hostname.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (!m) return false;
  const parts = hostname.split(".").map(n => Number(n));
  if (parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return true;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function normalizeUrl(input) {
  if (!input || typeof input !== "string") {
    return { error: "Missing `url` (string) in request body." };
  }

  let raw = input.trim();
  if (!raw) return { error: "Empty `url`." };

  // Convenience for users pasting without protocol.
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: "Invalid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Only http/https URLs are supported." };
  }

  return { url: url.toString() };
}

async function loadLighthouse() {
  try {
    // Prefer CJS if available.
    // eslint-disable-next-line global-require
    return require("lighthouse");
  } catch (err) {
    // Lighthouse may be ESM in some versions.
    const mod = await import("lighthouse");
    return mod.default || mod;
  }
}

async function loadChromeLauncher() {
  try {
    // eslint-disable-next-line global-require
    return require("chrome-launcher");
  } catch {
    const mod = await import("chrome-launcher");
    return mod.default || mod;
  }
}

function pickAudit(lhr, id) {
  const a = lhr?.audits?.[id];
  if (!a) return null;
  return {
    id,
    title: a.title,
    score: a.score,
    displayValue: a.displayValue,
    numericValue: a.numericValue,
    numericUnit: a.numericUnit,
  };
}

function scoreToPercent(score) {
  if (typeof score !== "number") return null;
  return Math.round(score * 100);
}

exports.analyze = async (req, res) => {
  const requestId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  const startedAt = Date.now();

  const normalized = normalizeUrl(req.body?.url ?? req.query?.url);
  if (normalized.error) return res.status(400).json({ requestId, error: normalized.error });

  const targetUrl = normalized.url;
  const hostname = new URL(targetUrl).hostname;

  // Basic SSRF guard (best-effort without DNS resolution).
  if (!ALLOW_PRIVATE_HOSTS) {
    const lower = hostname.toLowerCase();
    if (lower === "localhost" || lower.endsWith(".local") || isPrivateIPv4(lower)) {
      return res.status(400).json({
        requestId,
        error: "Refusing to analyze private/localhost targets. Set LIGHTHOUSE_ALLOW_PRIVATE_HOSTS=true to override (dev only).",
      });
    }
  }

  if (activeRuns >= MAX_CONCURRENT) {
    return res.status(429).json({
      requestId,
      error: `Too many concurrent Lighthouse runs (max ${MAX_CONCURRENT}). Try again shortly.`,
    });
  }

  activeRuns += 1;

  let chrome;
  let userDataDir;

  const analysisTimeoutMs = Math.max(10000, Number(req.body?.timeoutMs || DEFAULT_ANALYSIS_TIMEOUT_MS));

  // Make the HTTP connection time out slightly after our internal timeout.
  res.setTimeout(analysisTimeoutMs + 5000);

  try {
    const [lighthouse, chromeLauncher] = await Promise.all([loadLighthouse(), loadChromeLauncher()]);

    // Unique temporary profile per run to prevent Windows profile locks and cross-request conflicts.
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "lighthouse-chrome-"));

    const chromeFlags = [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-client-side-phishing-detection",
      "--disable-default-apps",
      "--disable-hang-monitor",
      "--disable-popup-blocking",
      "--disable-prompt-on-repost",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
    ];

    if (NO_SANDBOX) {
      chromeFlags.push("--no-sandbox", "--disable-setuid-sandbox");
    }

    const launchOpts = {
      chromeFlags,
      userDataDir,
      // Optional override for environments where Chrome isn't discoverable.
      chromePath: process.env.CHROME_PATH || undefined,
      logLevel: process.env.LIGHTHOUSE_CHROME_LOGLEVEL || "silent",
    };

    chrome = await chromeLauncher.launch(launchOpts);

    const lighthouseFlags = {
      logLevel: process.env.LIGHTHOUSE_LOGLEVEL || "info",
      output: "json",
      port: chrome.port,
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      // Avoid long hangs on pages that never finish loading.
      maxWaitForLoad: Math.min(60000, analysisTimeoutMs),
    };

    const runnerResult = await withTimeout(
      lighthouse(targetUrl, lighthouseFlags),
      analysisTimeoutMs,
      "Lighthouse analysis"
    );

    const lhr = runnerResult?.lhr;
    if (!lhr) {
      return res.status(500).json({
        requestId,
        error: "Lighthouse returned no results (missing lhr).",
      });
    }

    const response = {
      requestId,
      requestedUrl: lhr.requestedUrl,
      finalUrl: lhr.finalUrl,
      fetchTime: lhr.fetchTime,
      userAgent: lhr.userAgent,
      timingMs: {
        total: Date.now() - startedAt,
      },
      categories: {
        performance: {
          score: lhr.categories?.performance?.score ?? null,
          scorePercent: scoreToPercent(lhr.categories?.performance?.score),
        },
        accessibility: {
          score: lhr.categories?.accessibility?.score ?? null,
          scorePercent: scoreToPercent(lhr.categories?.accessibility?.score),
        },
        bestPractices: {
          score: lhr.categories?.["best-practices"]?.score ?? null,
          scorePercent: scoreToPercent(lhr.categories?.["best-practices"]?.score),
        },
        seo: {
          score: lhr.categories?.seo?.score ?? null,
          scorePercent: scoreToPercent(lhr.categories?.seo?.score),
        },
      },
      metrics: {
        fcp: pickAudit(lhr, "first-contentful-paint"),
        lcp: pickAudit(lhr, "largest-contentful-paint"),
        tbt: pickAudit(lhr, "total-blocking-time"),
        cls: pickAudit(lhr, "cumulative-layout-shift"),
        si: pickAudit(lhr, "speed-index"),
        tti: pickAudit(lhr, "interactive"),
      },
    };

    return res.json(response);
  } catch (err) {
    const safeErr = {
      message: err?.message || String(err),
      code: err?.code,
      stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
    };

    // Detailed backend logging for debugging Chrome profile / permissions issues.
    console.error("[lighthouse.analyze]", {
      requestId,
      url: targetUrl,
      hostname,
      timeoutMs: analysisTimeoutMs,
      activeRuns,
      userDataDir,
      chromePort: chrome?.port,
      error: safeErr,
    });

    const isTimeout = err?.code === "ETIMEDOUT" || /timed out/i.test(err?.message || "");
    return res.status(isTimeout ? 504 : 500).json({
      requestId,
      error: safeErr.message,
      code: safeErr.code,
    });
  } finally {
    // Always attempt to close Chrome to prevent stuck processes and profile locks.
    if (chrome) {
      try {
        await withTimeout(chrome.kill(), CHROME_KILL_TIMEOUT_MS, "Chrome kill");
      } catch (e) {
        console.error("[lighthouse.cleanup] failed to kill Chrome", {
          requestId,
          chromePort: chrome?.port,
          error: e?.message || String(e),
        });
      }
    }

    // Best-effort cleanup of the temp Chrome profile dir.
    if (userDataDir) {
      try {
        await fs.rm(userDataDir, { recursive: true, force: true });
      } catch (e) {
        console.error("[lighthouse.cleanup] failed to remove userDataDir", {
          requestId,
          userDataDir,
          error: e?.message || String(e),
        });
      }
    }

    activeRuns = Math.max(0, activeRuns - 1);
  }
};
