const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const publicDir = path.join(__dirname, "public");

const adminCredentials = {
  userId: "admin",
  password: "admin123"
};

const validStatuses = new Set(["open", "inProgress", "resolved"]);
const validCategories = new Set([
  "general",
  "road",
  "sanitation",
  "lighting",
  "safety",
  "water",
  "electricity",
  "other"
]);

const maxLengths = {
  name: 80,
  title: 100,
  description: 1000,
  location: 120
};

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function sendNoContent(res, statusCode, extraHeaders = {}) {
  res.writeHead(statusCode, extraHeaders);
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const separatorIndex = item.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }
      const key = item.slice(0, separatorIndex).trim();
      const value = item.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function createSessionCookie(sessionId) {
  return `sessionId=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax`;
}

function clearSessionCookie() {
  return "sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
}

function getContentType(filePath) {
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "application/javascript";
  if (filePath.endsWith(".html")) return "text/html";
  return "text/plain";
}

function normalizeCategory(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "").trim();
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validateComplaintPayload(payload) {
  const filedByName = normalizeName(payload.filedByName);
  const title = String(payload.title || "").trim();
  const description = String(payload.description || "").trim();
  const location = String(payload.location || "").trim();
  const category = normalizeCategory(payload.category) || "general";
  const errors = [];

  if (!filedByName) {
    errors.push("filedByName is required");
  }
  if (!title || !description || !location) {
    errors.push("title, description and location are required");
  }
  if (filedByName.length > maxLengths.name) {
    errors.push(`filedByName must be at most ${maxLengths.name} characters`);
  }
  if (title.length > maxLengths.title) {
    errors.push(`title must be at most ${maxLengths.title} characters`);
  }
  if (description.length > maxLengths.description) {
    errors.push(`description must be at most ${maxLengths.description} characters`);
  }
  if (location.length > maxLengths.location) {
    errors.push(`location must be at most ${maxLengths.location} characters`);
  }
  if (!validCategories.has(category)) {
    errors.push("Invalid category");
  }

  return {
    errors,
    data: {
      filedByName,
      title,
      description,
      location,
      category
    }
  };
}

function buildStats(reports) {
  return reports.reduce(
    (acc, report) => {
      acc.total += 1;
      acc[report.status] += 1;
      return acc;
    },
    {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0
    }
  );
}

function handleStatic(req, res, pathname) {
  const filePath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolutePath = path.join(publicDir, safePath);

  if (!absolutePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(absolutePath, (err, fileData) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": getContentType(absolutePath) });
    res.end(fileData);
  });
}

function createServer() {
  const reports = [];
  const sessions = new Map();
  let nextId = 1;

  function getSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.sessionId;
    if (!sessionId) {
      return null;
    }
    return sessions.get(sessionId) || null;
  }

  function requireAdminSession(req) {
    const session = getSession(req);
    if (!session || session.role !== "admin") {
      return null;
    }
    return session;
  }

  function createSession(res, session) {
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, session);
    res.setHeader("Set-Cookie", createSessionCookie(sessionId));
  }

  function destroySession(req, res) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.sessionId;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    res.setHeader("Set-Cookie", clearSessionCookie());
  }

  async function handleApi(req, res, pathname, reqUrl) {
    if (req.method === "POST" && pathname === "/api/login") {
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON payload" });
      }

      const userId = normalizeName(payload.userId);
      const password = String(payload.password || "").trim();

      if (!userId || !password) {
        return sendJson(res, 400, { error: "userId and password are required" });
      }

      if (userId !== adminCredentials.userId || password !== adminCredentials.password) {
        return sendJson(res, 401, { error: "Invalid admin credentials" });
      }

      createSession(res, { userId: adminCredentials.userId, role: "admin" });
      return sendJson(res, 200, { userId: adminCredentials.userId, role: "admin" });
    }

    if (req.method === "POST" && pathname === "/api/logout") {
      destroySession(req, res);
      return sendNoContent(res, 204);
    }

    if (req.method === "GET" && pathname === "/api/me") {
      const session = requireAdminSession(req);
      if (!session) {
        return sendJson(res, 401, { error: "Authentication required" });
      }
      return sendJson(res, 200, session);
    }

    if (req.method === "POST" && pathname === "/api/reports") {
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON payload" });
      }

      const validated = validateComplaintPayload(payload);
      if (validated.errors.length) {
        return sendJson(res, 400, { error: validated.errors.join("; ") });
      }

      const now = new Date().toISOString();
      const report = {
        id: nextId++,
        filedByName: validated.data.filedByName,
        title: validated.data.title,
        description: validated.data.description,
        location: validated.data.location,
        category: validated.data.category,
        status: "open",
        createdAt: now,
        updatedAt: now
      };
      reports.push(report);
      return sendJson(res, 201, report);
    }

    if (req.method === "GET" && pathname === "/api/complainant/reports") {
      const filedByName = normalizeName(reqUrl.searchParams.get("filedByName"));
      if (!filedByName) {
        return sendJson(res, 400, { error: "filedByName is required" });
      }

      const normalizedName = normalizeSearch(filedByName);
      const complainantReports = reports
        .filter((report) => normalizeSearch(report.filedByName) === normalizedName)
        .slice()
        .sort((a, b) => b.id - a.id)
        .map((report) => ({
          id: report.id,
          filedByName: report.filedByName,
          title: report.title,
          description: report.description,
          location: report.location,
          category: report.category,
          status: report.status,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt
        }));

      return sendJson(res, 200, complainantReports);
    }

    const adminSession = requireAdminSession(req);
    if (!adminSession) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    if (req.method === "GET" && pathname === "/api/reports") {
      const statusFilter = String(reqUrl.searchParams.get("status") || "").trim();
      const categoryFilter = normalizeCategory(reqUrl.searchParams.get("category"));
      const searchQuery = String(reqUrl.searchParams.get("q") || "")
        .trim()
        .toLowerCase();

      if (statusFilter && !validStatuses.has(statusFilter)) {
        return sendJson(res, 400, { error: "Invalid status filter" });
      }
      if (categoryFilter && !validCategories.has(categoryFilter)) {
        return sendJson(res, 400, { error: "Invalid category filter" });
      }

      const filteredReports = reports
        .filter((report) => !statusFilter || report.status === statusFilter)
        .filter((report) => !categoryFilter || report.category === categoryFilter)
        .filter((report) => {
          if (!searchQuery) {
            return true;
          }
          const searchableText = `${report.title} ${report.description} ${report.location} ${report.filedByName}`.toLowerCase();
          return searchableText.includes(searchQuery);
        })
        .slice()
        .sort((a, b) => b.id - a.id);

      return sendJson(res, 200, filteredReports);
    }

    if (req.method === "GET" && pathname === "/api/reports/stats") {
      return sendJson(res, 200, buildStats(reports));
    }

    const reportByIdMatch = pathname.match(/^\/api\/reports\/(\d+)$/);
    if (req.method === "GET" && reportByIdMatch) {
      const reportId = Number(reportByIdMatch[1]);
      const report = reports.find((item) => item.id === reportId);
      if (!report) {
        return sendJson(res, 404, { error: "Report not found" });
      }
      return sendJson(res, 200, report);
    }

    const statusMatch = pathname.match(/^\/api\/reports\/(\d+)\/status$/);
    if (req.method === "PATCH" && statusMatch) {
      const reportId = Number(statusMatch[1]);
      const report = reports.find((item) => item.id === reportId);
      if (!report) {
        return sendJson(res, 404, { error: "Report not found" });
      }

      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON payload" });
      }

      const status = String(payload.status || "").trim();
      if (!validStatuses.has(status)) {
        return sendJson(res, 400, { error: "Invalid status" });
      }

      report.status = status;
      report.updatedAt = new Date().toISOString();
      return sendJson(res, 200, report);
    }

    return false;
  }

  return http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, "http://localhost");
    const pathname = reqUrl.pathname;

    try {
      if (pathname.startsWith("/api/")) {
        const handled = await handleApi(req, res, pathname, reqUrl);
        if (handled !== false) {
          return;
        }
        return sendJson(res, 404, { error: "Not found" });
      }
      handleStatic(req, res, pathname);
    } catch (err) {
      console.error("Request error:", err);
      sendJson(res, 500, { error: "Internal Server Error" });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = { createServer };
