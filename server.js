require("dotenv").config();

const express = require("express");
const path = require("path");

const defaultRequestTimeoutMs = 10_000;
const supportedCountries = new Set([
  "at",
  "au",
  "br",
  "ca",
  "de",
  "es",
  "fr",
  "gb",
  "in",
  "it",
  "nl",
  "nz",
  "pl",
  "sg",
  "us",
]);

function getAdzunaCredentials(environment = process.env) {
  const requiredVariables = ["APP_ID", "APP_KEY"];
  const missingVariables = requiredVariables.filter(
    (name) => !environment[name],
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVariables.join(", ")}`,
    );
  }

  return {
    appId: environment.APP_ID,
    appKey: environment.APP_KEY,
  };
}

function createApp({
  appId,
  appKey,
  fetchImpl = globalThis.fetch,
  logger = console,
  requestTimeoutMs = defaultRequestTimeoutMs,
}) {
  if (!appId || !appKey) {
    throw new Error("Adzuna credentials are required to create the server.");
  }

  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function.");
  }

  const app = express();

  // Serve only the public frontend files.
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  app.get("/saved_internships.html", (req, res) => {
    res.sendFile(path.join(__dirname, "saved_internships.html"));
  });

  app.get("/dashboard.html", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
  });

  app.get("/job.html", (req, res) => {
    res.sendFile(path.join(__dirname, "job.html"));
  });

  app.get("/privacy.html", (req, res) => {
    res.sendFile(path.join(__dirname, "privacy.html"));
  });

  app.get("/terms.html", (req, res) => {
    res.sendFile(path.join(__dirname, "terms.html"));
  });

  app.get("/api.js", (req, res) => {
    res.sendFile(path.join(__dirname, "api.js"));
  });

  app.get("/app.js", (req, res) => {
    res.sendFile(path.join(__dirname, "app.js"));
  });

  app.get("/style.css", (req, res) => {
    res.sendFile(path.join(__dirname, "style.css"));
  });

  app.get("/pfp.jpg", (req, res) => {
    res.sendFile(path.join(__dirname, "pfp.jpg"));
  });

  app.use(
    "/logos",
    express.static(path.join(__dirname, "logos"), {
      fallthrough: false,
      index: false,
      redirect: false,
    }),
  );

  // Secure endpoint that communicates with Adzuna
  app.get("/api/internships", async (req, res) => {
    const keyword =
      typeof req.query.keyword === "string" && req.query.keyword.trim()
        ? req.query.keyword.trim()
        : "software engineering intern";
    const requestedCountry =
      typeof req.query.country === "string"
        ? req.query.country.toLowerCase()
        : "";
    const country = supportedCountries.has(requestedCountry)
      ? requestedCountry
      : "gb";
    const location =
      typeof req.query.location === "string" ? req.query.location.trim() : "";
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const params = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      what: keyword,
      results_per_page: "20",
    });

    if (location) {
      params.set("where", location);
    }

    const url =
      `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`;

    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      if (!response.ok) {
        logger.error(`Adzuna returned status ${response.status}`);
        return res.status(502).json({
          error: "The internship service could not be reached.",
        });
      }

      const data = await response.json();
      return res.json({
        jobs: Array.isArray(data.results) ? data.results : [],
        totalResults: Number(data.count) || 0,
      });
    } catch (error) {
      if (error.name === "TimeoutError") {
        return res.status(504).json({
          error: "The internship service took too long to respond.",
        });
      }

      logger.error("Adzuna request failed:", error);
      return res.status(500).json({
        error: "Could not load internships.",
      });
    }
  });

  app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "404.html"));
  });

  return app;
}

function startServer(environment = process.env) {
  const { appId, appKey } = getAdzunaCredentials(environment);
  const app = createApp({ appId, appKey });
  const port = environment.PORT || 3000;

  return app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  getAdzunaCredentials,
  startServer,
};
