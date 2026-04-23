const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../server");

function makeRequest(baseUrl, route, options = {}) {
  return fetch(`${baseUrl}${route}`, options);
}

function extractSessionCookie(response) {
  const setCookieHeader = response.headers.get("set-cookie");
  if (!setCookieHeader) {
    return "";
  }
  return setCookieHeader.split(";")[0];
}

async function loginAsAdmin(baseUrl, password = "admin123") {
  const response = await makeRequest(baseUrl, "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", password })
  });

  return {
    response,
    cookie: extractSessionCookie(response)
  };
}

async function startTestServer() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  return { server, baseUrl };
}

function stopTestServer(server) {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

function withCookie(cookie, headers = {}) {
  return cookie ? { ...headers, Cookie: cookie } : headers;
}

test("public users can submit complaints", async () => {
  const { server, baseUrl } = await startTestServer();

  const createResponse = await makeRequest(baseUrl, "/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filedByName: "Maya",
      title: "Broken streetlight",
      description: "The streetlight on 3rd avenue is not working.",
      location: "3rd Avenue",
      category: "lighting"
    })
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.title, "Broken streetlight");
  assert.equal(created.filedByName, "Maya");
  assert.equal(created.status, "open");

  await stopTestServer(server);
});

test("rejects incomplete or invalid complaints", async () => {
  const { server, baseUrl } = await startTestServer();

  const createResponse = await makeRequest(baseUrl, "/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filedByName: "",
      title: "",
      description: "Missing details",
      location: "Main Street",
      category: "parks"
    })
  });

  assert.equal(createResponse.status, 400);
  const body = await createResponse.json();
  assert.match(body.error, /filedByName is required/);
  assert.match(body.error, /title, description and location are required/);
  assert.match(body.error, /Invalid category/);

  await stopTestServer(server);
});

test("admin login is required for dashboard endpoints", async () => {
  const { server, baseUrl } = await startTestServer();

  const unauthorizedList = await makeRequest(baseUrl, "/api/reports");
  assert.equal(unauthorizedList.status, 401);

  const unauthorizedStats = await makeRequest(baseUrl, "/api/reports/stats");
  assert.equal(unauthorizedStats.status, 401);

  const badLogin = await loginAsAdmin(baseUrl, "wrong-password");
  assert.equal(badLogin.response.status, 401);

  const loginResult = await loginAsAdmin(baseUrl);
  assert.equal(loginResult.response.status, 200);

  const meResponse = await makeRequest(baseUrl, "/api/me", {
    headers: withCookie(loginResult.cookie)
  });
  assert.equal(meResponse.status, 200);
  const me = await meResponse.json();
  assert.equal(me.role, "admin");
  assert.equal(me.userId, "admin");

  await stopTestServer(server);
});

test("admin can see all complaints and change status", async () => {
  const { server, baseUrl } = await startTestServer();

  const firstComplaint = await makeRequest(baseUrl, "/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filedByName: "Alice",
      title: "Pothole near school",
      description: "Large pothole blocks lane.",
      location: "Oak Street",
      category: "road"
    })
  });
  const created = await firstComplaint.json();

  const adminLogin = await loginAsAdmin(baseUrl);
  assert.equal(adminLogin.response.status, 200);

  const listResponse = await makeRequest(baseUrl, "/api/reports", {
    headers: withCookie(adminLogin.cookie)
  });
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].filedByName, "Alice");

  const updateResponse = await makeRequest(baseUrl, `/api/reports/${created.id}/status`, {
    method: "PATCH",
    headers: withCookie(adminLogin.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({ status: "resolved" })
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.status, "resolved");

  const statsResponse = await makeRequest(baseUrl, "/api/reports/stats", {
    headers: withCookie(adminLogin.cookie)
  });
  assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json();
  assert.deepEqual(stats, {
    total: 1,
    open: 0,
    inProgress: 0,
    resolved: 1
  });

  await stopTestServer(server);
});

test("admin report filtering searches filer names too", async () => {
  const { server, baseUrl } = await startTestServer();

  const payloads = [
    {
      filedByName: "Alice",
      title: "Streetlight outage",
      description: "Dark stretch after 8pm.",
      location: "Maple Avenue",
      category: "lighting"
    },
    {
      filedByName: "Bob",
      title: "Leaking water line",
      description: "Water pooling at intersection.",
      location: "Main junction",
      category: "water"
    }
  ];

  for (const payload of payloads) {
    const response = await makeRequest(baseUrl, "/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.equal(response.status, 201);
  }

  const adminLogin = await loginAsAdmin(baseUrl);
  const filteredByName = await makeRequest(baseUrl, "/api/reports?q=alice", {
    headers: withCookie(adminLogin.cookie)
  });
  assert.equal(filteredByName.status, 200);
  const reportsByName = await filteredByName.json();
  assert.equal(reportsByName.length, 1);
  assert.equal(reportsByName[0].filedByName, "Alice");

  const filteredByCategory = await makeRequest(baseUrl, "/api/reports?category=water", {
    headers: withCookie(adminLogin.cookie)
  });
  const categoryReports = await filteredByCategory.json();
  assert.equal(categoryReports.length, 1);
  assert.equal(categoryReports[0].category, "water");

  await stopTestServer(server);
});

test("complainants can view complaint status by name", async () => {
  const { server, baseUrl } = await startTestServer();

  const payloads = [
    {
      filedByName: "Maya",
      title: "Streetlight outage",
      description: "Dark stretch after 8pm.",
      location: "Maple Avenue",
      category: "lighting"
    },
    {
      filedByName: "Maya",
      title: "Leaking water line",
      description: "Water pooling at intersection.",
      location: "Main junction",
      category: "water"
    },
    {
      filedByName: "Alex",
      title: "Pothole near market",
      description: "Large pothole blocks lane.",
      location: "Oak Street",
      category: "road"
    }
  ];

  for (const payload of payloads) {
    const response = await makeRequest(baseUrl, "/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.equal(response.status, 201);
  }

  const mayaReportsResponse = await makeRequest(
    baseUrl,
    "/api/complainant/reports?filedByName=maya"
  );
  assert.equal(mayaReportsResponse.status, 200);
  const mayaReports = await mayaReportsResponse.json();
  assert.equal(mayaReports.length, 2);
  assert.equal(mayaReports[0].filedByName, "Maya");
  assert.equal(mayaReports[1].filedByName, "Maya");

  const missingNameResponse = await makeRequest(baseUrl, "/api/complainant/reports");
  assert.equal(missingNameResponse.status, 400);

  await stopTestServer(server);
});
