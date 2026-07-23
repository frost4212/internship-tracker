const resultsPerPage = 20;
let currentPage = 1;

const searchForm = document.getElementById("search-form");
const searchButton = document.getElementById("search-button");
const pagination = document.getElementById("pagination");
const results = document.getElementById("results");
const jobTemplate = document.getElementById("job-template");

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadJobs(1);
});

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

async function loadJobs(page) {
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

  jobs.forEach((job) => {
    const card = jobTemplate.content.cloneNode(true);

    card.querySelector(".job-title").textContent =
      job.title || "Untitled position";
    card.querySelector(".job-company").textContent =
      job.company?.display_name || "Not listed";
    card.querySelector(".job-location").textContent =
      job.location?.display_name || "Not listed";
    card.querySelector(".job-description").textContent = job.description
      ? `${job.description.substring(0, 150)}...`
      : "No description available.";

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
