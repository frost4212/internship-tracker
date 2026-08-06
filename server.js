require("dotenv").config();

  const requiredVariables = ["APP_ID", "APP_KEY"];
  const missingVariables = requiredVariables.filter(
    (name) => !process.env[name],
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVariables.join(", ")}`,
    );
  }
  
  const express = require("express");
  const path = require("path");

  const app = express();
  const port = process.env.PORT || 3000;
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

  // Serve only the public frontend files
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  app.get("/saved_internships.html", (req, res) => {
    res.sendFile(path.join(__dirname, "saved_internships.html"));
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

  // Secure endpoint that communicates with Adzuna
  app.get("/api/internships", async (req, res) => {
    const keyword = req.query.keyword || "software engineering intern";
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
      app_id: process.env.APP_ID,
      app_key: process.env.APP_KEY,
      what: keyword,
      results_per_page: "20",
    });

    if (location) {
      params.set("where", location);
    }

    const url =
      `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`Adzuna returned status ${response.status}`);
        return res.status(502).json({
          error: "The internship service could not be reached.",
        });
      }

      const data = await response.json();
      res.json({
        jobs: data.results || [],
        totalResults: Number(data.count) || 0,
      });
    } catch (error) {
      console.error("Adzuna request failed:", error);

      res.status(500).json({
        error: "Could not load internships.",
      });
    }
  });

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
