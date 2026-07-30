const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");

const projectRoot = path.resolve(__dirname, "..");
const storageKey = "internshipTracker.savedJobs";

const savedJobs = [
  {
    id: "software-1",
    title: "Software Engineering Intern",
    company: "Northstar Labs",
    location: "London",
    description: "Build and test web applications.",
    url: "https://example.com/software-1",
  },
  {
    id: "data-1",
    title: "Data Analyst Intern",
    company: "Harbour Analytics",
    location: "Valletta",
    description: "Explore datasets and create reports.",
    url: "https://example.com/data-1",
  },
];

async function createPage(
  fileName,
  {
    storedJobs,
    rawStoredValue,
    fetchInternships,
    suppressConsoleErrors = false,
  } = {},
) {
  const [html, appScript] = await Promise.all([
    readFile(path.join(projectRoot, fileName), "utf8"),
    readFile(path.join(projectRoot, "app.js"), "utf8"),
  ]);
  const urlPath = fileName === "index.html" ? "" : fileName;
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: `http://localhost/${urlPath}`,
  });

  if (rawStoredValue !== undefined) {
    dom.window.localStorage.setItem(storageKey, rawStoredValue);
  } else if (storedJobs !== undefined) {
    dom.window.localStorage.setItem(storageKey, JSON.stringify(storedJobs));
  }

  if (fetchInternships) {
    dom.window.fetchInternships = fetchInternships;
  }

  if (suppressConsoleErrors) {
    dom.window.console.error = () => {};
  }

  dom.window.eval(appScript);
  return dom;
}

async function finishAsyncEvent() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("saved search filters internships by keyword and location", async (t) => {
  const dom = await createPage("saved_internships.html", { storedJobs: savedJobs });
  t.after(() => dom.window.close());

  const { document } = dom.window;
  assert.equal(document.querySelectorAll(".job-card").length, 2);

  document.getElementById("saved-keyword").value = "analyst";
  document.getElementById("saved-location").value = "valletta";
  document.getElementById("saved-search-form").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true }),
  );

  const cards = document.querySelectorAll(".job-card");
  assert.equal(cards.length, 1);
  assert.equal(
    cards[0].querySelector(".job-title").textContent,
    "Data Analyst Intern",
  );
});

test("saved internships can be viewed on multiple pages", async (t) => {
  const jobsForPagination = Array.from({ length: 6 }, (_, index) => ({
    id: `saved-${index + 1}`,
    title: `Saved Internship ${index + 1}`,
    company: "Example Company",
    location: "Remote",
    description: "A saved internship used to test pagination.",
    url: `https://example.com/saved-${index + 1}`,
  }));
  const dom = await createPage("saved_internships.html", {
    storedJobs: jobsForPagination,
  });
  t.after(() => dom.window.close());

  const { document } = dom.window;
  const savedPagination = document.getElementById("saved-pagination");

  assert.equal(document.querySelectorAll(".job-card").length, 5);
  assert.equal(savedPagination.hidden, false);

  savedPagination.querySelector('button[data-page="2"]').click();

  assert.equal(document.querySelectorAll(".job-card").length, 1);
  assert.equal(
    document.querySelector(".job-title").textContent,
    "Saved Internship 6",
  );
  assert.equal(
    savedPagination.querySelector('[aria-current="page"]').textContent,
    "2",
  );
});

test("removing a saved internship updates storage and the saved page", async (t) => {
  const dom = await createPage("saved_internships.html", { storedJobs: savedJobs });
  t.after(() => dom.window.close());

  const { document, localStorage } = dom.window;
  document.querySelector(".save-button").click();

  const storedJobsAfterRemoval = JSON.parse(localStorage.getItem(storageKey));
  assert.deepEqual(
    storedJobsAfterRemoval.map((job) => job.id),
    ["data-1"],
  );
  assert.equal(document.querySelectorAll(".job-card").length, 1);
  assert.equal(
    document.querySelector(".job-title").textContent,
    "Data Analyst Intern",
  );
});

test("a saved internship persists into a new page load", async (t) => {
  const apiJob = {
    id: "design-1",
    title: "Product Design Intern",
    company: { display_name: "Studio One" },
    location: { display_name: "Remote" },
    description: "Help design accessible product experiences.",
    redirect_url: "https://example.com/design-1",
  };
  const searchDom = await createPage("index.html", {
    fetchInternships: async () => ({
      jobs: [apiJob],
      totalResults: 1,
    }),
  });
  t.after(() => searchDom.window.close());

  searchDom.window.document.getElementById("search-form").dispatchEvent(
    new searchDom.window.Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );
  await finishAsyncEvent();

  searchDom.window.document.querySelector(".save-button").click();
  const storedValue = searchDom.window.localStorage.getItem(storageKey);
  assert.notEqual(storedValue, null);

  const savedDom = await createPage("saved_internships.html", {
    rawStoredValue: storedValue,
  });
  t.after(() => savedDom.window.close());

  assert.equal(
    savedDom.window.document.querySelector(".job-title").textContent,
    "Product Design Intern",
  );
  assert.equal(
    savedDom.window.document
      .querySelector(".save-button")
      .getAttribute("aria-pressed"),
    "true",
  );
});

test("the profile dropdown opens, closes outside, and closes with Escape", async (t) => {
  const dom = await createPage("index.html");
  t.after(() => dom.window.close());

  const { document } = dom.window;
  const profileButton = document.getElementById("profile-button");
  const dropdownPanel = document.getElementById("dropdown-panel");

  profileButton.click();
  assert.equal(dropdownPanel.hidden, false);
  assert.equal(profileButton.getAttribute("aria-expanded"), "true");
  assert.equal(profileButton.getAttribute("aria-label"), "Close profile menu");

  document.body.dispatchEvent(
    new dom.window.Event("pointerdown", { bubbles: true }),
  );
  assert.equal(dropdownPanel.hidden, true);
  assert.equal(profileButton.getAttribute("aria-expanded"), "false");

  profileButton.click();
  document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      bubbles: true,
      key: "Escape",
    }),
  );
  assert.equal(dropdownPanel.hidden, true);
  assert.equal(document.activeElement, profileButton);
});

test("a storage failure shows an error without showing the empty state", async (t) => {
  const dom = await createPage("saved_internships.html", {
    rawStoredValue: "{invalid JSON",
    suppressConsoleErrors: true,
  });
  t.after(() => dom.window.close());

  const { document } = dom.window;
  assert.equal(document.getElementById("app-status").hidden, false);
  assert.match(
    document.getElementById("app-status").textContent,
    /couldn't be loaded/,
  );
  assert.equal(document.querySelectorAll(".saved-empty").length, 0);
  assert.equal(document.querySelectorAll(".job-card").length, 0);
});

test("malformed saved descriptions are rejected before rendering", async (t) => {
  const malformedJob = {
    ...savedJobs[0],
    id: "malformed-1",
    description: { text: "This is not a string." },
  };
  const dom = await createPage("saved_internships.html", {
    storedJobs: [malformedJob, savedJobs[1]],
  });
  t.after(() => dom.window.close());

  const cards = dom.window.document.querySelectorAll(".job-card");
  assert.equal(cards.length, 1);
  assert.equal(
    cards[0].querySelector(".job-title").textContent,
    "Data Analyst Intern",
  );
});
