const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const axeCore = require("axe-core");
const { JSDOM } = require("jsdom");

const projectRoot = path.resolve(__dirname, "..");
const storageKey = "internshipTracker.savedJobs";
const testTimestamp = "2026-08-08T10:00:00.000Z";

const savedJobs = [
  {
    id: "software-1",
    title: "Software Engineering Intern",
    company: "Northstar Labs",
    location: "London",
    description: "Build and test web applications.",
    url: "https://example.com/software-1",
    status: "Interested",
    applicationDate: "",
    notes: "",
    createdAt: testTimestamp,
    updatedAt: testTimestamp,
    source: "adzuna",
  },
  {
    id: "data-1",
    title: "Data Analyst Intern",
    company: "Harbour Analytics",
    location: "Valletta",
    description: "Explore datasets and create reports.",
    url: "https://example.com/data-1",
    status: "Interested",
    applicationDate: "",
    notes: "",
    createdAt: testTimestamp,
    updatedAt: testTimestamp,
    source: "adzuna",
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

  const dialogPrototype = dom.window.HTMLDialogElement?.prototype;
  if (dialogPrototype && typeof dialogPrototype.showModal !== "function") {
    const previouslyFocusedElements = new WeakMap();

    dialogPrototype.showModal = function showModal() {
      previouslyFocusedElements.set(this, this.ownerDocument.activeElement);
      this.open = true;
      this.querySelector("[autofocus]")?.focus();
    };

    dialogPrototype.close = function close(returnValue = "") {
      if (!this.open) {
        return;
      }

      this.returnValue = String(returnValue);
      this.open = false;
      previouslyFocusedElements.get(this)?.focus();
      this.dispatchEvent(new dom.window.Event("close"));
    };
  }

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

function changeStatus(dom, select, status) {
  select.value = status;
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

async function getAccessibilityViolations(dom) {
  dom.window.eval(axeCore.source);
  const { violations } = await dom.window.axe.run(dom.window.document, {
    rules: {
      // jsdom does not calculate layout or rendered color contrast.
      "color-contrast": { enabled: false },
    },
  });
  return Array.from(violations, ({ id, nodes }) => ({
    id,
    nodes: nodes.length,
  }));
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
    status: "Interested",
    applicationDate: "",
    notes: "",
    createdAt: testTimestamp,
    updatedAt: testTimestamp,
    source: "adzuna",
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
  assert.equal(document.activeElement, document.getElementById("saved-results"));
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
  assert.equal(document.activeElement, document.getElementById("saved-results"));
});

test("clearing saved internships requires confirmation and refreshes the page", async (t) => {
  const dom = await createPage("saved_internships.html", { storedJobs: savedJobs });
  t.after(() => dom.window.close());

  const { document, localStorage } = dom.window;
  const clearButton = document.getElementById("clear-btn");
  const confirmMenu = document.getElementById("confirm-menu");
  const cancelButton = document.getElementById("clear-cancel-btn");
  const confirmButton = document.getElementById("confirm-clear-btn");

  clearButton.focus();
  clearButton.click();
  assert.equal(confirmMenu.open, true);
  assert.notEqual(localStorage.getItem(storageKey), null);
  assert.equal(document.activeElement, cancelButton);

  cancelButton.click();
  assert.equal(confirmMenu.open, false);
  assert.notEqual(localStorage.getItem(storageKey), null);
  assert.equal(document.activeElement, clearButton);

  clearButton.click();
  confirmButton.click();
  assert.equal(localStorage.getItem(storageKey), null);

  const reloadedDom = await createPage("saved_internships.html");
  t.after(() => reloadedDom.window.close());

  const reloadedDocument = reloadedDom.window.document;
  assert.equal(reloadedDocument.getElementById("confirm-menu").open, false);
  assert.equal(reloadedDocument.querySelectorAll(".job-card").length, 0);
  assert.equal(reloadedDocument.getElementById("clear-btn").hidden, true);
  assert.equal(
    reloadedDocument.getElementById("saved-internships-header").textContent,
    "Saved Internships (0)",
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

  const [storedJob] = JSON.parse(storedValue);
  assert.equal(storedJob.status, "Interested");
  assert.equal(storedJob.applicationDate, "");
  assert.equal(storedJob.notes, "");
  assert.equal(storedJob.source, "adzuna");
  assert.equal(Number.isNaN(Date.parse(storedJob.createdAt)), false);
  assert.equal(storedJob.updatedAt, storedJob.createdAt);

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

test("a changed internship status persists into a new page load", async (t) => {
  const jobsWithStatuses = savedJobs.map((job) => ({
    ...job,
    status: "Applied",
  }));
  const firstDom = await createPage("saved_internships.html", {
    storedJobs: jobsWithStatuses,
  });
  t.after(() => firstDom.window.close());

  const select = firstDom.window.document.querySelector(".status-select");
  changeStatus(firstDom, select, "Interview");

  const storedValue = firstDom.window.localStorage.getItem(storageKey);
  assert.equal(JSON.parse(storedValue)[0].status, "Interview");

  const reloadedDom = await createPage("saved_internships.html", {
    rawStoredValue: storedValue,
  });
  t.after(() => reloadedDom.window.close());

  const reloadedSelect =
    reloadedDom.window.document.querySelector(".status-select");
  assert.equal(reloadedSelect.value, "Interview");
  assert.equal(
    reloadedSelect.closest(".status-control").dataset.status,
    "Interview",
  );
});

test("changing a status updates only the internship with the matching ID", async (t) => {
  const jobsWithStatuses = [
    { ...savedJobs[0], status: "Rejected" },
    { ...savedJobs[1], status: "Applied" },
  ];
  const dom = await createPage("saved_internships.html", {
    storedJobs: jobsWithStatuses,
  });
  t.after(() => dom.window.close());

  const selects = dom.window.document.querySelectorAll(".status-select");
  changeStatus(dom, selects[1], "Accepted");

  const storedJobs = JSON.parse(
    dom.window.localStorage.getItem(storageKey),
  );
  assert.deepEqual(
    storedJobs.map(({ id, status }) => ({ id, status })),
    [
      { id: "software-1", status: "Rejected" },
      { id: "data-1", status: "Accepted" },
    ],
  );
  assert.equal(storedJobs[0].updatedAt, jobsWithStatuses[0].updatedAt);
  assert.notEqual(storedJobs[1].updatedAt, jobsWithStatuses[1].updatedAt);
  assert.equal(Number.isNaN(Date.parse(storedJobs[1].updatedAt)), false);
  assert.equal(storedJobs[1].createdAt, jobsWithStatuses[1].createdAt);
});

test("saved internships without a status are rejected", async (t) => {
  const dom = await createPage("saved_internships.html");
  t.after(() => dom.window.close());

  const jobWithoutStatus = { ...savedJobs[0] };
  delete jobWithoutStatus.status;

  assert.equal(dom.window.isValidSavedJob(jobWithoutStatus), false);
});

test("complete application records pass schema validation", async (t) => {
  const dom = await createPage("saved_internships.html");
  t.after(() => dom.window.close());

  assert.equal(dom.window.isValidSavedJob(savedJobs[0]), true);
  assert.equal(
    dom.window.isValidSavedJob({ ...savedJobs[0], source: "manual" }),
    true,
  );
});

test("application records with invalid new fields are rejected", async (t) => {
  const dom = await createPage("saved_internships.html");
  t.after(() => dom.window.close());

  const invalidJobs = [
    ["unsupported status", { ...savedJobs[0], status: "Unknown" }],
    ["blank title", { ...savedJobs[0], title: "   " }],
    ["blank company", { ...savedJobs[0], company: "   " }],
    ["invalid creation timestamp", { ...savedJobs[0], createdAt: "not-a-date" }],
    ["invalid update timestamp", { ...savedJobs[0], updatedAt: "not-a-date" }],
    ["unsupported source", { ...savedJobs[0], source: "spreadsheet" }],
    [
      "invalid manual-record timestamp",
      { ...savedJobs[0], source: "manual", createdAt: "not-a-date" },
    ],
    ["missing notes", { ...savedJobs[0], notes: undefined }],
  ];

  invalidJobs.forEach(([description, job]) => {
    assert.equal(dom.window.isValidSavedJob(job), false, description);
  });
});

test("a status change rolls back when storage writing fails", async (t) => {
  const jobsWithStatuses = [{ ...savedJobs[0], status: "Applied" }];
  const dom = await createPage("saved_internships.html", {
    storedJobs: jobsWithStatuses,
    suppressConsoleErrors: true,
  });
  const { document, localStorage } = dom.window;
  const storagePrototype = Object.getPrototypeOf(localStorage);
  const originalSetItem = storagePrototype.setItem;
  const storedValueBeforeChange = localStorage.getItem(storageKey);

  storagePrototype.setItem = () => {
    throw new Error("Storage is unavailable.");
  };
  t.after(() => {
    storagePrototype.setItem = originalSetItem;
    dom.window.close();
  });

  const select = document.querySelector(".status-select");
  changeStatus(dom, select, "Rejected");

  assert.equal(select.value, "Applied");
  assert.equal(select.dataset.status, "Applied");
  assert.equal(
    select.closest(".status-control").dataset.status,
    "Applied",
  );
  assert.equal(localStorage.getItem(storageKey), storedValueBeforeChange);
  assert.equal(document.getElementById("app-status").hidden, false);
  assert.match(
    document.getElementById("app-status").textContent,
    /couldn't be updated/,
  );
});

test("writeSavedJobs rejects a single object without changing storage", async (t) => {
  const dom = await createPage("saved_internships.html", {
    storedJobs: savedJobs,
    suppressConsoleErrors: true,
  });
  t.after(() => dom.window.close());

  const storedValueBeforeWrite =
    dom.window.localStorage.getItem(storageKey);
  const wasSaved = dom.window.writeSavedJobs(savedJobs[0]);

  assert.equal(wasSaved, false);
  assert.equal(
    dom.window.localStorage.getItem(storageKey),
    storedValueBeforeWrite,
  );
  assert.match(
    dom.window.document.getElementById("app-status").textContent,
    /data format was invalid/,
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

test("both pages expose accessible landmarks and heading structure", async (t) => {
  const searchDom = await createPage("index.html", {
    fetchInternships: async () => ({ jobs: [], totalResults: 0 }),
  });
  const savedDom = await createPage("saved_internships.html", {
    storedJobs: savedJobs,
  });
  t.after(() => {
    searchDom.window.close();
    savedDom.window.close();
  });
  await finishAsyncEvent();

  [searchDom, savedDom].forEach((dom) => {
    const { document } = dom.window;
    assert.equal(document.querySelector(".skip-link").textContent, "Skip to main content");
    assert.equal(document.querySelector(".navbar").getAttribute("aria-label"), "Primary");
    assert.equal(
      document.getElementById("job-template").content.querySelector(".job-title").tagName,
      "H2",
    );
  });
});

test("search updates move focus to the results heading", async (t) => {
  const apiJob = {
    id: "focus-1",
    title: "Accessibility Intern",
    company: { display_name: "Inclusive Labs" },
    location: { display_name: "Remote" },
    description: "Test accessible interfaces.",
    redirect_url: "https://example.com/focus-1",
  };
  const dom = await createPage("index.html", {
    fetchInternships: async () => ({ jobs: [apiJob], totalResults: 21 }),
  });
  t.after(() => dom.window.close());
  await finishAsyncEvent();

  const { document } = dom.window;
  const form = document.getElementById("search-form");
  const resultsHeader = document.getElementById("results-header");
  form.dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await finishAsyncEvent();
  assert.equal(document.activeElement, resultsHeader);

  const nextPage = document.querySelector('#pagination button[data-page="2"]');
  nextPage.focus();
  nextPage.click();
  await finishAsyncEvent();
  assert.equal(document.activeElement, resultsHeader);
});

test("both pages pass automated axe checks", async (t) => {
  const searchDom = await createPage("index.html", {
    fetchInternships: async () => ({ jobs: [], totalResults: 0 }),
  });
  const savedDom = await createPage("saved_internships.html", {
    storedJobs: savedJobs,
  });
  t.after(() => {
    searchDom.window.close();
    savedDom.window.close();
  });
  await finishAsyncEvent();

  assert.deepEqual(await getAccessibilityViolations(searchDom), []);
  assert.deepEqual(await getAccessibilityViolations(savedDom), []);
});

test("the header action opens and closes the manual application form", async (t) => {
  const dom = await createPage("saved_internships.html");
  t.after(() => dom.window.close());

  const { document } = dom.window;
  const toggle = document.getElementById("manual-entry-toggle");
  const form = document.getElementById("manual-application-form");

  assert.equal(form.hidden, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");

  toggle.click();
  assert.equal(form.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(document.activeElement, document.getElementById("manual-title"));

  toggle.click();
  assert.equal(form.hidden, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});

test("submitting the manual form saves and displays a normalized application", async (t) => {
  const dom = await createPage("saved_internships.html");
  t.after(() => dom.window.close());

  const { document, localStorage } = dom.window;
  const form = document.getElementById("manual-application-form");
  const toggle = document.getElementById("manual-entry-toggle");
  const statusSelect = document.getElementById("manual-status");

  assert.deepEqual(
    Array.from(statusSelect.options, (option) => option.value),
    [
      "Interested",
      "Preparing",
      "Applied",
      "Online Assessment",
      "Interview",
      "Offer",
      "Accepted",
      "Rejected",
      "Withdrawn",
    ],
  );
  assert.equal(statusSelect.value, "Interested");

  document.getElementById("saved-keyword").value = "old keyword";
  document.getElementById("saved-location").value = "old location";
  toggle.click();
  document.getElementById("manual-title").value = "  QA Intern  ";
  document.getElementById("manual-company").value = "  Harbour Labs  ";
  document.getElementById("manual-location").value = "  Valletta  ";
  document.getElementById("manual-url").value = "  https://example.com/qa  ";
  document.getElementById("manual-application-date").value = "2026-08-09";
  document.getElementById("manual-description").value = "  Test applications  ";
  document.getElementById("manual-notes").value = "  Follow up next week  ";
  statusSelect.value = "Applied";

  form.dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true }),
  );

  const [storedJob] = JSON.parse(localStorage.getItem(storageKey));
  assert.equal(storedJob.title, "QA Intern");
  assert.equal(storedJob.company, "Harbour Labs");
  assert.equal(storedJob.location, "Valletta");
  assert.equal(storedJob.url, "https://example.com/qa");
  assert.equal(storedJob.status, "Applied");
  assert.equal(storedJob.applicationDate, "2026-08-09");
  assert.equal(storedJob.description, "Test applications");
  assert.equal(storedJob.notes, "Follow up next week");
  assert.equal(storedJob.source, "manual");
  assert.equal(Number.isNaN(Date.parse(storedJob.createdAt)), false);
  assert.equal(storedJob.updatedAt, storedJob.createdAt);

  assert.equal(document.querySelectorAll(".job-card").length, 1);
  assert.equal(document.querySelector(".job-title").textContent, "QA Intern");
  assert.equal(
    document.getElementById("saved-internships-header").textContent,
    "Saved Internships (1)",
  );
  assert.equal(document.getElementById("saved-keyword").value, "");
  assert.equal(document.getElementById("saved-location").value, "");
  assert.equal(form.hidden, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(document.getElementById("manual-title").value, "");
  assert.equal(statusSelect.value, "Interested");
  assert.equal(document.activeElement, document.getElementById("saved-results"));
});

test("manual submissions with a whitespace-only title are rejected", async (t) => {
  const dom = await createPage("saved_internships.html", {
    suppressConsoleErrors: true,
  });
  t.after(() => dom.window.close());

  const { document, localStorage } = dom.window;
  document.getElementById("manual-title").value = "   ";
  document.getElementById("manual-company").value = "Example Company";
  document.getElementById("manual-application-form").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true }),
  );

  assert.equal(localStorage.getItem(storageKey), null);
  assert.equal(document.querySelectorAll(".job-card").length, 0);
  assert.equal(document.getElementById("app-status").hidden, false);
  assert.match(
    document.getElementById("app-status").textContent,
    /data format was invalid/,
  );
});

test("writeSavedJobs rejects an array containing an invalid record", async (t) => {
  const dom = await createPage("saved_internships.html", {
    storedJobs: savedJobs,
    suppressConsoleErrors: true,
  });
  t.after(() => dom.window.close());

  const storedValueBeforeWrite = dom.window.localStorage.getItem(storageKey);
  const invalidJobs = [{ ...savedJobs[0], title: "   " }];
  const wasSaved = dom.window.writeSavedJobs(invalidJobs);

  assert.equal(wasSaved, false);
  assert.equal(
    dom.window.localStorage.getItem(storageKey),
    storedValueBeforeWrite,
  );
  assert.equal(dom.window.document.getElementById("app-status").hidden, false);
  assert.match(
    dom.window.document.getElementById("app-status").textContent,
    /data format was invalid/,
  );
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
