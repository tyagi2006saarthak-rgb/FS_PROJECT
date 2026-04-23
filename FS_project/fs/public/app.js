const chooseComplainantButton = document.getElementById("choose-complainant");
const chooseAdminButton = document.getElementById("choose-admin");
const roleMessage = document.getElementById("role-message");
const complainantPanel = document.getElementById("complainant-panel");
const adminArea = document.getElementById("admin-area");
const complaintForm = document.getElementById("complaint-form");
const complaintMessage = document.getElementById("complaint-message");
const complainantStatusForm = document.getElementById("complainant-status-form");
const complainantStatusMessage = document.getElementById("complainant-status-message");
const complainantReportsList = document.getElementById("complainant-reports-list");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const adminLoginPanel = document.querySelector(".admin-login-panel");
const appShell = document.getElementById("app-shell");
const logoutButton = document.getElementById("logout-button");
const sessionLabel = document.getElementById("session-label");
const welcomeTitle = document.getElementById("welcome-title");
const welcomeCopy = document.getElementById("welcome-copy");

const filtersForm = document.getElementById("filters-form");
const adminMessage = document.getElementById("admin-message");
const adminReportsList = document.getElementById("admin-reports-list");
const adminRefresh = document.getElementById("admin-refresh");

const statTotal = document.getElementById("stat-total");
const statOpen = document.getElementById("stat-open");
const statInProgress = document.getElementById("stat-inProgress");
const statResolved = document.getElementById("stat-resolved");

const statusLabelMap = {
  open: "Open",
  inProgress: "In Progress",
  resolved: "Resolved"
};

const categoryLabelMap = {
  general: "General",
  road: "Road",
  sanitation: "Sanitation",
  lighting: "Lighting",
  safety: "Safety",
  water: "Water",
  electricity: "Electricity",
  other: "Other"
};

let isAdminLoggedIn = false;
let selectedRole = "";

function setMessage(element, text, type = "info") {
  element.textContent = text;
  element.dataset.type = type;
}

function clearMessages() {
  setMessage(complaintMessage, "");
  setMessage(complainantStatusMessage, "");
  setMessage(loginMessage, "");
  setMessage(adminMessage, "");
}

function updateRoleButtonState(role) {
  chooseComplainantButton.classList.toggle("is-selected", role === "complainant");
  chooseAdminButton.classList.toggle("is-selected", role === "admin");
}

function setInitialViewState() {
  complainantPanel.hidden = true;
  adminArea.hidden = true;
  appShell.hidden = true;
  adminLoginPanel.hidden = false;
  selectedRole = "";
  updateRoleButtonState("");
}

function selectRole(role) {
  selectedRole = role;
  updateRoleButtonState(role);

  if (role === "complainant") {
    complainantPanel.hidden = false;
    adminArea.hidden = true;
    setMessage(roleMessage, "Complainant panel opened.", "success");
    return;
  }

  complainantPanel.hidden = true;
  adminArea.hidden = false;
  setMessage(roleMessage, "Admin panel opened. Sign in to continue.", "success");
}

function apiFetch(path, options = {}) {
  return fetch(path, {
    credentials: "same-origin",
    ...options
  });
}

function getFiltersQueryString() {
  const formData = new FormData(filtersForm);
  const params = new URLSearchParams();

  const status = String(formData.get("status") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const q = String(formData.get("q") || "").trim();

  if (status) {
    params.set("status", status);
  }
  if (category) {
    params.set("category", category);
  }
  if (q) {
    params.set("q", q);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function setAdminState(loggedIn, user = null) {
  isAdminLoggedIn = loggedIn;
  appShell.hidden = !loggedIn;
  adminLoginPanel.hidden = loggedIn;

  if (!loggedIn) {
    sessionLabel.textContent = "";
    updateRoleButtonState(selectedRole);
    if (selectedRole === "admin") {
      adminArea.hidden = false;
    }
    return;
  }

  selectedRole = "admin";
  updateRoleButtonState("admin");
  complainantPanel.hidden = true;
  adminArea.hidden = false;

  sessionLabel.textContent = `${user.role === "admin" ? "Admin" : "User"}: ${user.userId}`;
  welcomeTitle.textContent = "Admin dashboard";
  welcomeCopy.textContent = "Review all complaints and update their status.";
}

function createStatusPill(status) {
  const pill = document.createElement("span");
  pill.className = `status-pill status-${status}`;
  pill.textContent = statusLabelMap[status] || status;
  return pill;
}

function createReportCard(report) {
  const item = document.createElement("li");
  item.className = "report-card";

  const topRow = document.createElement("div");
  topRow.className = "report-top-row";

  const title = document.createElement("h3");
  title.textContent = report.title;

  topRow.appendChild(title);
  topRow.appendChild(createStatusPill(report.status));

  const description = document.createElement("p");
  description.className = "report-description";
  description.textContent = report.description;

  const meta = document.createElement("p");
  meta.className = "report-meta";
  const categoryLabel = categoryLabelMap[report.category] || report.category;
  const createdAt = new Date(report.createdAt).toLocaleString();
  meta.textContent = `${report.location} | ${categoryLabel} | Filed by ${report.filedByName} | Reported ${createdAt}`;

  const actions = document.createElement("div");
  actions.className = "report-actions";

  const statusSelect = document.createElement("select");
  statusSelect.setAttribute("aria-label", `Update status for report ${report.id}`);
  ["open", "inProgress", "resolved"].forEach((statusValue) => {
    const option = document.createElement("option");
    option.value = statusValue;
    option.textContent = statusLabelMap[statusValue];
    if (report.status === statusValue) {
      option.selected = true;
    }
    statusSelect.appendChild(option);
  });

  const updateButton = document.createElement("button");
  updateButton.type = "button";
  updateButton.className = "secondary";
  updateButton.textContent = "Update Status";
  updateButton.addEventListener("click", async () => {
    updateButton.disabled = true;
    const updated = await updateReportStatus(report.id, statusSelect.value);
    updateButton.disabled = false;
    if (updated) {
      await Promise.all([loadReports(), loadStats()]);
    }
  });

  actions.appendChild(statusSelect);
  actions.appendChild(updateButton);

  item.appendChild(topRow);
  item.appendChild(description);
  item.appendChild(meta);
  item.appendChild(actions);
  return item;
}

function createComplainantReportCard(report) {
  const item = document.createElement("li");
  item.className = "report-card";

  const topRow = document.createElement("div");
  topRow.className = "report-top-row";

  const title = document.createElement("h3");
  title.textContent = report.title;

  topRow.appendChild(title);
  topRow.appendChild(createStatusPill(report.status));

  const description = document.createElement("p");
  description.className = "report-description";
  description.textContent = report.description;

  const meta = document.createElement("p");
  meta.className = "report-meta";
  const categoryLabel = categoryLabelMap[report.category] || report.category;
  const createdAt = new Date(report.createdAt).toLocaleString();
  meta.textContent = `${report.location} | ${categoryLabel} | Reported ${createdAt}`;

  item.appendChild(topRow);
  item.appendChild(description);
  item.appendChild(meta);
  return item;
}

function renderReports(reports) {
  adminReportsList.innerHTML = "";

  if (!reports.length) {
    const empty = document.createElement("li");
    empty.className = "report-empty";
    empty.textContent = "No complaints found.";
    adminReportsList.appendChild(empty);
    return;
  }

  reports.forEach((report) => {
    adminReportsList.appendChild(createReportCard(report));
  });
}

function renderComplainantReports(reports) {
  complainantReportsList.innerHTML = "";

  if (!reports.length) {
    const empty = document.createElement("li");
    empty.className = "report-empty";
    empty.textContent = "No complaints found for this name.";
    complainantReportsList.appendChild(empty);
    return;
  }

  reports.forEach((report) => {
    complainantReportsList.appendChild(createComplainantReportCard(report));
  });
}

async function loadComplainantReportsByName(name) {
  const params = new URLSearchParams({ filedByName: name });

  try {
    const response = await apiFetch(`/api/complainant/reports?${params.toString()}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      setMessage(
        complainantStatusMessage,
        errorBody?.error || "Failed to load complaint status.",
        "error"
      );
      return;
    }

    const reports = await response.json();
    renderComplainantReports(reports);
    setMessage(complainantStatusMessage, "Complaint status loaded.", "success");
  } catch {
    setMessage(complainantStatusMessage, "Failed to load complaint status.", "error");
  }
}

async function loadStats() {
  if (!isAdminLoggedIn) {
    return;
  }

  try {
    const response = await apiFetch("/api/reports/stats");
    if (!response.ok) {
      return;
    }

    const stats = await response.json();
    statTotal.textContent = String(stats.total || 0);
    statOpen.textContent = String(stats.open || 0);
    statInProgress.textContent = String(stats.inProgress || 0);
    statResolved.textContent = String(stats.resolved || 0);
  } catch {
    // Non-fatal.
  }
}

async function loadReports() {
  if (!isAdminLoggedIn) {
    return;
  }

  try {
    const response = await apiFetch(`/api/reports${getFiltersQueryString()}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      setMessage(adminMessage, errorBody?.error || "Failed to load complaints.", "error");
      return;
    }

    const reports = await response.json();
    renderReports(reports);
  } catch {
    setMessage(adminMessage, "Failed to load complaints.", "error");
  }
}

async function updateReportStatus(reportId, status) {
  try {
    const response = await apiFetch(`/api/reports/${reportId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      setMessage(adminMessage, errorBody?.error || "Failed to update complaint status.", "error");
      return false;
    }

    setMessage(adminMessage, "Complaint status updated.", "success");
    return true;
  } catch {
    setMessage(adminMessage, "Failed to update complaint status.", "error");
    return false;
  }
}

async function handleComplaintSubmit(event) {
  event.preventDefault();
  setMessage(complaintMessage, "");

  const formData = new FormData(complaintForm);
  const payload = {
    filedByName: formData.get("filedByName"),
    title: formData.get("title"),
    description: formData.get("description"),
    location: formData.get("location"),
    category: formData.get("category")
  };

  try {
    const response = await apiFetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      setMessage(complaintMessage, errorBody?.error || "Failed to submit complaint.", "error");
      return;
    }

    complaintForm.reset();
    setMessage(complaintMessage, "Complaint submitted successfully.", "success");
    const submittedName = String(payload.filedByName || "").trim();
    if (submittedName) {
      complainantStatusForm.elements.statusName.value = submittedName;
      await loadComplainantReportsByName(submittedName);
    }
    if (isAdminLoggedIn) {
      await Promise.all([loadReports(), loadStats()]);
    }
  } catch {
    setMessage(complaintMessage, "Failed to submit complaint.", "error");
  }
}

async function handleComplainantStatusSubmit(event) {
  event.preventDefault();
  setMessage(complainantStatusMessage, "");

  const formData = new FormData(complainantStatusForm);
  const statusName = String(formData.get("statusName") || "").trim();
  if (!statusName) {
    setMessage(complainantStatusMessage, "Your name is required.", "error");
    return;
  }

  await loadComplainantReportsByName(statusName);
}

async function handleLogin(event) {
  event.preventDefault();
  setMessage(loginMessage, "");

  const formData = new FormData(loginForm);
  const payload = {
    userId: String(formData.get("userId") || "").trim(),
    password: String(formData.get("password") || "").trim()
  };

  try {
    const response = await apiFetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status === 404) {
        setMessage(loginMessage, "Login API not found. Start the app with npm start and open http://localhost:3000.", "error");
        return;
      }
      const errorBody = await response.json().catch(() => null);
      setMessage(loginMessage, errorBody?.error || "Unable to sign in.", "error");
      return;
    }

    const user = await response.json();
    setAdminState(true, user);
    await Promise.all([loadReports(), loadStats()]);
  } catch {
    setMessage(loginMessage, "Unable to sign in.", "error");
  }
}

async function handleLogout() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch {
    // Ignore logout network errors and still clear the UI.
  }

  setAdminState(false);
}

async function handleAdminRefresh() {
  setMessage(adminMessage, "Refreshing complaints...", "info");
  await Promise.all([loadReports(), loadStats()]);
  setMessage(adminMessage, "Complaints updated.", "success");
}

async function loadCurrentSession() {
  try {
    const response = await apiFetch("/api/me");
    if (!response.ok) {
      setAdminState(false);
      return;
    }

    const user = await response.json();
    setAdminState(true, user);
    await Promise.all([loadReports(), loadStats()]);
  } catch {
    setAdminState(false);
  }
}

complaintForm.addEventListener("submit", handleComplaintSubmit);
complainantStatusForm.addEventListener("submit", handleComplainantStatusSubmit);
loginForm.addEventListener("submit", handleLogin);
logoutButton.addEventListener("click", handleLogout);
adminRefresh.addEventListener("click", handleAdminRefresh);
chooseComplainantButton.addEventListener("click", () => {
  selectRole("complainant");
});
chooseAdminButton.addEventListener("click", () => {
  selectRole("admin");
});
filtersForm.addEventListener("input", () => {
  if (isAdminLoggedIn) {
    loadReports();
  }
});
filtersForm.addEventListener("change", () => {
  if (isAdminLoggedIn) {
    loadReports();
  }
});

clearMessages();
setInitialViewState();
loadCurrentSession();
