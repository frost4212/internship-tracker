const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
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
    urlSearch = "",
    suppressConsoleErrors = false,
    setTimeoutImplementation,
  } = {},
) {
  const [html, appScript] = await Promise.all([
    readFile(path.join(projectRoot, fileName), "utf8"),
    readFile(path.join(projectRoot, "app.js"), "utf8"),
  ]);
  const urlPath = fileName === "index.html" ? "" : fileName;
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: `http://localhost/${urlPath}${urlSearch}`,
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

  if (setTimeoutImplementation) {
    dom.window.setTimeout = setTimeoutImplementation;
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

test("saved internships can be filtered by a dashboard status URL", async (t) => {
  const jobsWithDifferentStatuses = [
    savedJobs[0],
    {
      ...savedJobs[1],
      id: "interview-1",
      title: "Interview Stage Intern",
      status: "Interview",
    },
  ];
  const dom = await createPage("saved_internships.html", {
    storedJobs: jobsWithDifferentStatuses,
    urlSearch: "?status=Interview",
  });
  t.after(() => dom.window.close());

  const cards = dom.window.document.querySelectorAll(".job-card");
  assert.equal(cards.length, 1);
  assert.equal(
    cards[0].querySelector(".job-title").textContent,
    "Interview Stage Intern",
  );
  assert.equal(cards[0].querySelector(".status-select").value, "Interview");
});

test("dashboard displays total and per-status application counts", async (t) => {
  const statuses = [
    "Interested",
    "Preparing",
    "Applied",
    "Online Assessment",
    "Interview",
    "Offer",
    "Accepted",
    "Rejected",
    "Withdrawn",
  ];
  const dashboardJobs = statuses.map((status, index) => ({
    ...savedJobs[index % savedJobs.length],
    id: `dashboard-${index}`,
    title: `${status} Internship`,
    status,
  }));
  dashboardJobs.push({
    ...savedJobs[0],
    id: "dashboard-second-interview",
    title: "Second Interview Internship",
    status: "Interview",
  });

  const dom = await createPage("dashboard.html", {
    storedJobs: dashboardJobs,
  });
  t.after(() => dom.window.close());

  const { document } = dom.window;
  assert.equal(document.getElementById("total-saved-jobs").textContent, "10");

  statuses.forEach((status) => {
    const expectedCount = status === "Interview" ? "2" : "1";
    const count = document.querySelector(`[data-status-count="${status}"]`);
    const link = document.querySelector(`.dashboard-status[data-status="${status}"]`);

    assert.equal(count.textContent, expectedCount);
    assert.equal(new URL(link.href).searchParams.get("status"), status);
  });

  assert.equal(
    new URL(document.querySelector(".dashboard-total-link").href).pathname,
    "/saved_internships.html",
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

test("application details load the saved record selected by URL", async (t) => {
  const dom = await createPage("job.html", {
    storedJobs: savedJobs,
    urlSearch: "?id=data-1",
  });
  t.after(() => dom.window.close());

  const { document } = dom.window;
  assert.equal(document.getElementById("job-detail").hidden, false);
  assert.equal(document.getElementById("job-detail-empty").hidden, true);
  assert.equal(document.getElementById("job-title").textContent, "Data Analyst Intern");
  assert.equal(document.getElementById("job-company").textContent, "Harbour Analytics");
  assert.equal(document.getElementById("job-status").value, "Interested");
  assert.equal(
    document.getElementById("job-posting-link").href,
    "https://example.com/data-1",
  );
});

test("changing application status updates the visible progress state", async (t) => {
  const dom = await createPage("job.html", {
    storedJobs: savedJobs,
    urlSearch: "?id=software-1",
  });
  t.after(() => dom.window.close());

  const { document } = dom.window;
  const select = document.getElementById("job-status");
  changeStatus(dom, select, "Offer");

  const progress = document.querySelector(".application-progress");
  assert.equal(
    progress.querySelector('[data-progress-status="Interview"]').className,
    "is-complete",
  );
  assert.equal(
    progress.querySelector('[data-progress-status="Offer"]').className,
    "is-current",
  );
  const outcome = document.getElementById("application-outcome");
  const outcomeValue = document.getElementById("application-outcome-value");
  assert.equal(outcome.hidden, true);

  changeStatus(dom, select, "Accepted");
  assert.equal(outcome.hidden, false);
  assert.equal(outcome.dataset.outcome, "accepted");
  assert.equal(outcomeValue.textContent, "Accepted");

  changeStatus(dom, select, "Rejected");
  assert.equal(outcome.dataset.outcome, "rejected");
  assert.equal(outcomeValue.textContent, "Rejected");
});

test("application detail changes persist to the matching record", async (t) => {
  let dismissSuccessStatus;
  let successStatusDuration;
  const dom = await createPage("job.html", {
    storedJobs: savedJobs,
    urlSearch: "?id=software-1",
    setTimeoutImplementation(callback, duration) {
      dismissSuccessStatus = callback;
      successStatusDuration = duration;
      return 1;
    },
  });
  t.after(() => dom.window.close());

  const { document, localStorage } = dom.window;
  document.getElementById("job-status").value = "Interview";
  document.getElementById("job-application-date").value = "2026-08-12";
  document.getElementById("job-notes").value = "  Prepare system design examples.  ";
  document.getElementById("job-detail-form").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true }),
  );

  const updatedJobs = JSON.parse(localStorage.getItem(storageKey));
  assert.equal(updatedJobs[0].status, "Interview");
  assert.equal(updatedJobs[0].applicationDate, "2026-08-12");
  assert.equal(updatedJobs[0].notes, "Prepare system design examples.");
  assert.equal(updatedJobs[1].status, savedJobs[1].status);
  const appStatus = document.getElementById("app-status");
  const appStatusMessage = appStatus.querySelector(".app-status-message");
  assert.equal(appStatusMessage.textContent, "Changes saved.");
  assert.equal(appStatus.hidden, false);
  assert.equal(appStatus.getAttribute("role"), "status");
  assert.equal(appStatus.getAttribute("aria-atomic"), "true");
  assert.equal(appStatus.classList.contains("is-success"), true);
  assert.equal(successStatusDuration, 5000);

  dismissSuccessStatus();
  assert.equal(appStatus.hidden, true);
  assert.equal(appStatusMessage.textContent, "");
  assert.equal(appStatus.classList.contains("is-success"), false);
});

test("confirming application deletion removes only the current job", async (t) => {
  const dom = await createPage("job.html", {
    storedJobs: savedJobs,
    urlSearch: "?id=software-1",
  });
  t.after(() => dom.window.close());

  const { document, localStorage } = dom.window;
  document.getElementById("job-delete-button").click();
  document.getElementById("job-delete-confirm").click();

  const remainingJobs = JSON.parse(localStorage.getItem(storageKey));
  assert.deepEqual(
    remainingJobs.map(({ id }) => id),
    ["data-1"],
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
