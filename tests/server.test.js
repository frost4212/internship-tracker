const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createApp, getAdzunaCredentials } = require("../server");

const silentLogger = {
  error() {},
};

async function startTestServer(options) {
  const app = createApp({
    appId: "test-app-id",
    appKey: "test-app-key",
    logger: silentLogger,
    ...options,
  });

  const server = await new Promise((resolve, reject) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => {
      resolve(listeningServer);
    });
    listeningServer.once("error", reject);
  });
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

test("the server serves the dashboard page", async (t) => {
  const testServer = await startTestServer({});
  t.after(testServer.close);

  const response = await fetch(`${testServer.baseUrl}/dashboard.html`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  assert.match(html, /<h1>Dashboard<\/h1>/);
});

test("the internship endpoint normalizes input and returns Adzuna jobs", async (t) => {
  let requestedUrl;
  let requestOptions;
  const apiJob = { id: "api-1", title: "Software Intern" };
  const testServer = await startTestServer({
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [apiJob], count: "1" }),
      };
    },
  });
  t.after(testServer.close);

  const query = new URLSearchParams({
    keyword: "  software intern  ",
    location: "  Valletta  ",
    country: "unsupported",
    page: "2",
  });
  const response = await fetch(`${testServer.baseUrl}/api/internships?${query}`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { jobs: [apiJob], totalResults: 1 });

  const upstreamUrl = new URL(requestedUrl);
  assert.equal(upstreamUrl.pathname, "/v1/api/jobs/gb/search/2");
  assert.equal(upstreamUrl.searchParams.get("app_id"), "test-app-id");
  assert.equal(upstreamUrl.searchParams.get("app_key"), "test-app-key");
  assert.equal(upstreamUrl.searchParams.get("what"), "software intern");
  assert.equal(upstreamUrl.searchParams.get("where"), "Valletta");
  assert.equal(requestOptions.signal instanceof AbortSignal, true);
});

test("the internship endpoint replaces malformed Adzuna results with an array", async (t) => {
  const testServer = await startTestServer({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: { id: "not-an-array" }, count: 4 }),
    }),
  });
  t.after(testServer.close);

  const response = await fetch(`${testServer.baseUrl}/api/internships`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { jobs: [], totalResults: 4 });
});

test("the internship endpoint returns 502 for an upstream error response", async (t) => {
  const testServer = await startTestServer({
    fetchImpl: async () => ({ ok: false, status: 429 }),
  });
  t.after(testServer.close);

  const response = await fetch(`${testServer.baseUrl}/api/internships`);
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.match(body.error, /could not be reached/);
});

test("the internship endpoint aborts stalled requests and returns 504", async (t) => {
  const testServer = await startTestServer({
    requestTimeoutMs: 10,
    fetchImpl: (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  });
  t.after(testServer.close);

  const response = await fetch(`${testServer.baseUrl}/api/internships`);
  const body = await response.json();

  assert.equal(response.status, 504);
  assert.match(body.error, /too long to respond/);
});

test("missing Adzuna credentials are reported before startup", () => {
  assert.throws(
    () => getAdzunaCredentials({}),
    /Missing required environment variables: APP_ID, APP_KEY/,
  );
});
