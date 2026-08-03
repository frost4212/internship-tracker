const resultsPerPage = 20;
let currentPage = 1;

const searchForm = document.getElementById("search-form");
const searchButton = document.getElementById("search-button");
const pagination = document.getElementById("pagination");
const results = document.getElementById("results");
const savedResults = document.getElementById("saved-results");
const savedPagination = document.getElementById("saved-pagination");
const jobTemplate = document.getElementById("job-template");
const appStatus = document.getElementById("app-status");
const savedSearchForm = document.getElementById("saved-search-form");
const savedKeyword = document.getElementById("saved-keyword");
const savedLocation = document.getElementById("saved-location");
const savedSearchNavLink = document.getElementById("saved-nav-search");
const savedResultsNavLink = document.getElementById("saved-nav-results");

const profileButton = document.getElementById("profile-button");
const dropdownPanel = document.getElementById("dropdown-panel");
const profileWrapper = document.getElementById("profile-wrapper");

const resultsHeader = document.getElementById("results-header");
let latestTotalResults = null;
const savedInternshipsHeader = document.getElementById("saved-internships-header");
const savedJobsPerPage = 5;
let savedCurrentPage = 1;

const storageKey = "internshipTracker.savedJobs";

const savedJobStatus = [
  "Applied",
  "Interviewing",
  "Offer received",
  "Accepted",
  "Rejected",
  "Withdrawn"
];

if (searchForm) {
  loadJobs(1);
  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadJobs(1);
    if (latestTotalResults !== null) {
      resultsHeader.textContent = `Found ${latestTotalResults} Internships`;
    }
  });
}

if (pagination) {
  pagination.addEventListener("click", async (event) => {
    const pageButton = event.target.closest("button[data-page]");

    if (!pageButton || pageButton.disabled) {
      return;
    }

    const page = Number.parseInt(pageButton.dataset.page, 10);

    if (Number.isInteger(page) && page !== currentPage) {
      await loadJobs(page);
    }
  });
}

if (savedSearchForm) {
  if (savedInternshipsHeader) {
    const savedJobs = readSavedJobs();
    if (savedJobs !== null) {
      savedInternshipsHeader.textContent = `Saved Internships (${savedJobs.length})`;
    }
  }
  savedSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    savedCurrentPage = 1;
    searchSavedJobs();
  });
}

if (savedResults) {
  searchSavedJobs();
}

if (savedPagination) {
  savedPagination.addEventListener("click", (event) => {
    const pageButton = event.target.closest("button[data-page]");

    if (!pageButton || pageButton.disabled) {
      return;
    }

    const page = Number.parseInt(pageButton.dataset.page, 10);

    if (Number.isInteger(page) && page !== savedCurrentPage) {
      savedCurrentPage = page;
      searchSavedJobs();
    }
  });
}

if (savedSearchNavLink && savedResultsNavLink) {
  window.addEventListener("hashchange", updateSavedCurrentNavLink);
  updateSavedCurrentNavLink();
}

function updateSavedCurrentNavLink() {
  savedSearchNavLink.removeAttribute("aria-current");
  savedResultsNavLink.removeAttribute("aria-current");

  const currentLink =
    window.location.hash === "#saved-results"
      ? savedResultsNavLink
      : savedSearchNavLink;
  currentLink.setAttribute("aria-current", "location");
}

async function loadJobs(page) {
  latestTotalResults = null;
  const keyword =
    document.getElementById("keyword").value.trim() ||
    "software engineering intern";
  const country = document.getElementById("country").value;
  const location = document.getElementById("location").value.trim();

  showLoadingSkeleton(page);
  searchButton.disabled = true;
  pagination.hidden = true;

  try {
    const { jobs, totalResults } = await fetchInternships(
      keyword,
      location,
      country,
      page,
    );
    currentPage = page;
    displayResults(jobs);
    displayPagination(totalResults);
    latestTotalResults = totalResults;
  } catch (error) {
    pagination.replaceChildren();
    showMessage(error.message, "error");
  } finally {
    searchButton.disabled = false;
    results.removeAttribute("aria-busy");
  }
}

function displayPagination(totalResults) {
  const totalPages = Math.ceil(totalResults / resultsPerPage);
  pagination.replaceChildren();

  if (totalPages <= 1) {
    pagination.hidden = true;
    return;
  }

  const controls = document.createDocumentFragment();
  controls.appendChild(
    createPaginationButton("‹", currentPage - 1, {
      ariaLabel: "Previous page",
      disabled: currentPage === 1,
    }),
  );

  getVisiblePages(currentPage, totalPages).forEach((page) => {
    if (page === currentPage) {
      const current = document.createElement("span");
      current.className = "pagination-page is-current";
      current.setAttribute("aria-current", "page");
      current.setAttribute("aria-label", `Page ${page}, current page`);
      current.textContent = page;
      controls.appendChild(current);
      return;
    }

    controls.appendChild(
      createPaginationButton(String(page), page, {
        ariaLabel: `Go to page ${page}`,
      }),
    );
  });

  controls.appendChild(
    createPaginationButton("›", currentPage + 1, {
      ariaLabel: "Next page",
      disabled: currentPage === totalPages,
    }),
  );

  pagination.appendChild(controls);
  pagination.hidden = false;
}

function getVisiblePages(page, totalPages) {
  const visiblePageCount = 5;
  let firstPage = Math.max(1, page - Math.floor(visiblePageCount / 2));
  const lastPage = Math.min(totalPages, firstPage + visiblePageCount - 1);

  firstPage = Math.max(1, lastPage - visiblePageCount + 1);

  return Array.from(
    { length: lastPage - firstPage + 1 },
    (_, index) => firstPage + index,
  );
}

function createPaginationButton(label, page, options = {}) {
  const button = document.createElement("button");
  button.className = "pagination-button";
  button.type = "button";
  button.dataset.page = page;
  button.disabled = options.disabled || false;
  button.setAttribute("aria-label", options.ariaLabel);
  button.textContent = label;
  return button;
}

function showLoadingSkeleton(page) {
  const loadingState = document.createElement("div");
  loadingState.className = "results-loading";

  const status = document.createElement("p");
  status.className = "visually-hidden";
  status.setAttribute("role", "status");
  status.textContent = `Loading internships, page ${page}.`;
  loadingState.appendChild(status);

  for (let index = 0; index < 4; index += 1) {
    const card = document.createElement("article");
    card.className = "job-card skeleton-card";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-meta"></div>
      <div class="skeleton skeleton-meta skeleton-meta-short"></div>
      <div class="skeleton skeleton-copy"></div>
      <div class="skeleton skeleton-copy skeleton-copy-short"></div>
      <div class="skeleton skeleton-link"></div>
    `;
    loadingState.appendChild(card);
  }

  results.setAttribute("aria-busy", "true");
  results.replaceChildren(loadingState);
}

function displayResults(jobs) {
  results.replaceChildren();

  if (!jobs.length) {
    showMessage("No internships found.", "error");
    return;
  }

  const jobCards = document.createDocumentFragment();
  const savedJobsAtRender = readSavedJobs() ?? [];

  jobs.forEach((job) => {
    const card = jobTemplate.content.cloneNode(true);
    const jobTitle = job.title || "Untitled position";

    card.querySelector(".job-title").textContent = jobTitle;
    card.querySelector(".job-company").textContent =
      job.company?.display_name || "Not listed";
    card.querySelector(".job-location").textContent =
      job.location?.display_name || "Not listed";
    card.querySelector(".job-description").textContent = job.description
      ? `${job.description.substring(0, 150)}...`
      : "No description available.";
    const saveButton = card.querySelector(".save-button");

    const isInitiallySaved = savedJobsAtRender.some(
      (savedJob) => savedJob.id === job.id,
    );

    if (isInitiallySaved) {
      saveButton.setAttribute(
        "aria-label",
        `Remove ${jobTitle} from saved internships`,
      );
      saveButton.setAttribute("aria-pressed", "true");
    } else {
      saveButton.setAttribute(
        "aria-label",
        `Save ${jobTitle} to saved internships`,
      );
      saveButton.setAttribute("aria-pressed", "false");
    }

    saveButton.addEventListener("click", () => {
      const savedJobs = readSavedJobs();

      if (savedJobs === null) {
        return;
      }

      let isSaved = false;
      for (let i = 0; i < savedJobs.length; i++) {
        if (savedJobs[i].id === job.id) {
          isSaved = true;
          break;
        }
      }

      if (!isSaved) {
        const savedJob = {
          id: job.id,
          title: jobTitle,
          company: job.company?.display_name || "Not listed",
          location: job.location?.display_name || "Not listed",
          description: job.description || "No description available.",
          url: getSafeJobUrl(job.redirect_url),
          status: savedJobStatus[0],
        };

        savedJobs.push(savedJob);
        if (writeSavedJobs(savedJobs) === true) {
          saveButton.setAttribute(
            "aria-label",
            `Remove ${jobTitle} from saved internships`,
          );
          saveButton.setAttribute("aria-pressed", "true");
        }
      } else {
        const newSavedJobs = savedJobs.filter(
          (savedJob) => savedJob.id !== job.id,
        );

        if (writeSavedJobs(newSavedJobs) === true) {
          saveButton.setAttribute(
            "aria-label",
            `Save ${jobTitle} to saved internships`,
          );
          saveButton.setAttribute("aria-pressed", "false");
        }
      }
    });

    const link = card.querySelector(".job-link");
    const safeUrl = getSafeJobUrl(job.redirect_url);

    if (safeUrl) {
      link.href = safeUrl;
    } else {
      link.remove();
    }

    jobCards.appendChild(card);
  });

  results.appendChild(jobCards);
}

function showMessage(message, className) {
  const status = document.createElement("div");
  status.className = className;
  status.textContent = message;
  results.replaceChildren(status);
}

function getSafeJobUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function readSavedJobs() {
  try {
    const savedData = localStorage.getItem(storageKey);
    if (savedData !== null) {
      const parsedData = JSON.parse(savedData);
      if (Array.isArray(parsedData)) {
        clearStorageError();
        return parsedData.filter(isValidSavedJob);
      } else {
        showStorageError(
          "Saved internships couldn't be loaded. Check your browser storage settings and try again.",
        );
        return null;
      }
    } else {
      clearStorageError();
      return [];
    }
  } catch (error) {
    console.error("Could not load saved internships:", error);
    showStorageError(
      "Saved internships couldn't be loaded. Check your browser storage settings and try again.",
    );
    return null;
  }
}

function writeSavedJobs(jobs) {
  if (!Array.isArray(jobs)) {
    console.error("Could not save internships: expected an array.");
    showStorageError(
      "Saved internships couldn't be updated because the data format was invalid.",
    );
    return false;
  }

  try {
    const newData = JSON.stringify(jobs);
    localStorage.setItem(storageKey, newData);
    clearStorageError();
    return true;
  } catch (error) {
    console.error("Could not save internships:", error);
    showStorageError(
      "Saved internships couldn't be updated. Check your browser storage settings and try again.",
    );
    return false;
  }
}

function searchSavedJobs() {
  const keyword = savedKeyword.value.trim().toLowerCase();
  const location = savedLocation.value.trim().toLowerCase();
  const savedJobs = readSavedJobs();

  if (savedJobs === null) {
    savedResults.replaceChildren();
    savedPagination.replaceChildren();
    savedPagination.hidden = true;
    return;
  }

  const filteredSavedJobs = savedJobs.filter((savedJob) => {
    const searchableText = [
      savedJob.title,
      savedJob.company,
      savedJob.location,
      savedJob.description,
    ]
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLowerCase();
    const savedJobLocation =
      typeof savedJob.location === "string"
        ? savedJob.location.toLowerCase()
        : "";

    const matchesKeyword =
      keyword.length === 0 || searchableText.includes(keyword);
    const matchesLocation =
      location.length === 0 || savedJobLocation.includes(location);

    return matchesKeyword && matchesLocation;
  });

  const emptyMessage =
    savedJobs.length === 0
      ? "You haven't saved any internships yet."
      : "No saved internships match your search.";

  const totalPages = Math.ceil(filteredSavedJobs.length / savedJobsPerPage);
  savedCurrentPage = Math.min(savedCurrentPage, Math.max(1, totalPages));

  const firstJobIndex = (savedCurrentPage - 1) * savedJobsPerPage;
  const jobsForCurrentPage = filteredSavedJobs.slice(
    firstJobIndex,
    firstJobIndex + savedJobsPerPage,
  );

  displaySavedJobs(jobsForCurrentPage, emptyMessage);
  displaySavedPagination(filteredSavedJobs.length);
}

function displaySavedPagination(totalResults) {
  const totalPages = Math.ceil(totalResults / savedJobsPerPage);
  savedPagination.replaceChildren();

  if (totalPages <= 1) {
    savedPagination.hidden = true;
    return;
  }

  const controls = document.createDocumentFragment();
  controls.appendChild(
    createPaginationButton("‹", savedCurrentPage - 1, {
      ariaLabel: "Previous saved internships page",
      disabled: savedCurrentPage === 1,
    }),
  );

  getVisiblePages(savedCurrentPage, totalPages).forEach((page) => {
    if (page === savedCurrentPage) {
      const current = document.createElement("span");
      current.className = "pagination-page is-current";
      current.setAttribute("aria-current", "page");
      current.setAttribute("aria-label", `Page ${page}, current page`);
      current.textContent = page;
      controls.appendChild(current);
      return;
    }

    controls.appendChild(
      createPaginationButton(String(page), page, {
        ariaLabel: `Go to saved internships page ${page}`,
      }),
    );
  });

  controls.appendChild(
    createPaginationButton("›", savedCurrentPage + 1, {
      ariaLabel: "Next saved internships page",
      disabled: savedCurrentPage === totalPages,
    }),
  );

  savedPagination.appendChild(controls);
  savedPagination.hidden = false;
}

function displaySavedJobs(
  savedJobs = readSavedJobs(),
  emptyMessage = "You haven't saved any internships yet.",
) {
  savedResults.replaceChildren();

  if (savedJobs === null) {
    return;
  }

  if (savedJobs.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "saved-empty";
    emptyState.textContent = emptyMessage;
    savedResults.appendChild(emptyState);
    return;
  }

  const savedJobCards = document.createDocumentFragment();

  savedJobs.forEach((savedJob) => {
    const card = jobTemplate.content.cloneNode(true);
    const jobTitle = savedJob.title || "Untitled position";

    card.querySelector(".job-title").textContent = jobTitle;
    card.querySelector(".job-company").textContent =
      savedJob.company || "Not listed";
    card.querySelector(".job-location").textContent =
      savedJob.location || "Not listed";
    card.querySelector(".job-description").textContent = savedJob.description
      ? `${savedJob.description.substring(0, 150)}...`
      : "No description available.";
    const saveButton = card.querySelector(".save-button");

    const currentStatus = savedJobStatus.includes(savedJob.status)
      ? savedJob.status
      : savedJobStatus[0];
    const select = document.createElement("select");
    select.className = "status-select";
    select.setAttribute("aria-label", `Application status for ${jobTitle}`);
    select.dataset.status = currentStatus;

    const statusControl = document.createElement("label");
    statusControl.className = "status-control";
    statusControl.dataset.status = currentStatus;

    const statusSelectShell = document.createElement("span");
    statusSelectShell.className = "status-select-shell";

    const iconNamespace = "http://www.w3.org/2000/svg";
    const statusChevron = document.createElementNS(iconNamespace, "svg");
    statusChevron.classList.add("status-chevron");
    statusChevron.setAttribute("viewBox", "0 0 12 12");
    statusChevron.setAttribute("aria-hidden", "true");

    const statusChevronPath = document.createElementNS(iconNamespace, "path");
    statusChevronPath.setAttribute("d", "m3.25 4.75 2.75 2.75 2.75-2.75");
    statusChevron.appendChild(statusChevronPath);

    savedJobStatus.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      option.selected = status === currentStatus;
      select.appendChild(option);
    });

    select.addEventListener("change", () => {
      const previousStatus = statusControl.dataset.status;
      const nextStatus = select.value;
      const savedJobs = readSavedJobs();
      if (savedJobs === null) {
        select.value = previousStatus;
        return;
      }

      const matchingJob = savedJobs.find(
        (storedJob) => storedJob.id === savedJob.id,
      );

      if (matchingJob === undefined) {
        select.value = previousStatus;
        return;
      }

      matchingJob.status = select.value;
      const wasSaved = writeSavedJobs(savedJobs);
      if (!wasSaved) {
        select.value = previousStatus;
        return;
      }

      select.dataset.status = nextStatus;
      statusControl.dataset.status = select.value;
    });

    statusSelectShell.append(select, statusChevron);
    statusControl.append(statusSelectShell);

    const cardFooter = card.querySelector(".job-card-footer");
    cardFooter.append(statusControl);

    saveButton.setAttribute(
      "aria-label",
      `Remove ${jobTitle} from saved internships`,
    );
    saveButton.setAttribute("aria-pressed", "true");

    saveButton.addEventListener("click", () => {
      const currentSavedJobs = readSavedJobs();

      if (currentSavedJobs === null) {
        return;
      }

      const newSavedJobs = currentSavedJobs.filter(
        (currentSavedJob) => currentSavedJob.id !== savedJob.id,
      );

      if (writeSavedJobs(newSavedJobs) === true) {
        if (savedInternshipsHeader) {
          savedInternshipsHeader.textContent =
          `Saved Internships (${newSavedJobs.length})`;
        }
        if (savedSearchForm) {
          searchSavedJobs();
        } else {
          displaySavedJobs();
        }
      }
    });

    const link = card.querySelector(".job-link");
    const safeUrl = getSafeJobUrl(savedJob.url);

    if (safeUrl) {
      link.href = safeUrl;
    } else {
      link.remove();
    }

    savedJobCards.appendChild(card);
  });

  savedResults.appendChild(savedJobCards);
}

function isValidSavedJob(savedJob) {
  return (
    savedJob !== null &&
    !Array.isArray(savedJob) &&
    typeof savedJob === "object" &&
    (typeof savedJob.id === "string" ||
      typeof savedJob.id === "number") &&
      typeof savedJob.title === "string" &&
      typeof savedJob.description === "string" &&
      typeof savedJob.location === "string" &&
      typeof savedJob.company === "string" &&
      (savedJob.url === null || typeof savedJob.url === "string")
  );
}

function showStorageError(message) {
  appStatus.textContent = message;
  appStatus.hidden = false;
}

function clearStorageError() {
  appStatus.textContent = "";
  appStatus.hidden = true;
}

//Dropdown menu functions
profileButton.addEventListener("click", () => {
  if (dropdownPanel.hidden === true) {
    dropdownPanel.hidden = false;
    profileButton.setAttribute("aria-expanded", true);
    profileButton.setAttribute("aria-label", "Close profile menu");
  } else {
    dropdownPanel.hidden = true;
    profileButton.setAttribute("aria-expanded", false);
    profileButton.setAttribute("aria-label", "Open profile menu");
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!profileWrapper.contains(event.target)) {
    dropdownPanel.hidden = true;
    profileButton.setAttribute("aria-expanded", false);
    profileButton.setAttribute("aria-label", "Open profile menu");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dropdownPanel.hidden === false) {
    dropdownPanel.hidden = true;
    profileButton.setAttribute("aria-expanded", false);
    profileButton.setAttribute("aria-label", "Open profile menu");
    profileButton.focus();
  }
});
