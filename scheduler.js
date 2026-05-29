const PASSWORD = "labgpu123";
const EMAILJS_CONFIG = window.SCHEDULER_CONFIG || {};

const USERS = [
  { name: "Yuxuan Liang", rcsId: "liangy15" },
  { name: "Derik", rcsId: "azamm" },
  { name: "Jason", rcsId: "wangj68" },
  { name: "Manik", rcsId: "manikm" },
  { name: "Zabirul", rcsId: "islamm11" },
  { name: "Wasif", rcsId: "nafeem" },
  { name: "Hao", rcsId: "gongh2" },
  { name: "Marshal", rcsId: "shawkm" }
];

const state = {
  statusData: null
};

let emailjsReady = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMessage(id, text, isSuccess) {
  const box = document.getElementById(id);
  box.className = isSuccess === true ? "success" : "";
  box.innerText = text || "";
}

function hasEmailjsConfig(templateId) {
  return Boolean(
    window.emailjs &&
    EMAILJS_CONFIG.emailjsPublicKey &&
    EMAILJS_CONFIG.emailjsServiceId &&
    templateId
  );
}

function initializeEmailjs(templateId) {
  if (!hasEmailjsConfig(templateId)) return false;
  if (emailjsReady) return true;

  emailjs.init({
    publicKey: EMAILJS_CONFIG.emailjsPublicKey
  });
  emailjsReady = true;
  return true;
}

function makePlaceholder(label) {
  return `<option value="">Select ${label}</option>`;
}

function makeUserOptions() {
  return makePlaceholder("user") + USERS
    .map((user) => (
      `<option value="${escapeHtml(user.rcsId)}" data-name="${escapeHtml(user.name)}">` +
      `${escapeHtml(user.name)} (${escapeHtml(user.rcsId)})</option>`
    ))
    .join("");
}

function getSelectedUser(selectId) {
  const select = document.getElementById(selectId);
  const option = select.selectedOptions[0];
  if (!select.value || !option) return null;
  return {
    name: option.dataset.name,
    rcsId: select.value,
    label: option.textContent
  };
}

function checkPassword() {
  const input = document.getElementById("pw").value;
  const error = document.getElementById("error");

  if (input === PASSWORD) {
    document.getElementById("loginBox").style.display = "none";
    document.getElementById("app").style.display = "block";
    initializeDashboard();
    loadStatus();
    setInterval(loadStatus, 5000);
  } else {
    error.innerText = "Wrong password";
  }
}

function initializeDashboard() {
  document.getElementById("supportUser").innerHTML = makeUserOptions();
  document.getElementById("freeUpUser").innerHTML = makeUserOptions();
  document.getElementById("freeUpGpuCount").innerHTML = '<option value="1">1</option>';

  document.getElementById("sendSupportBtn").addEventListener("click", sendSupportRequest);
  document.getElementById("sendFreeUpBtn").addEventListener("click", sendFreeUpRequest);
  document.getElementById("freeUpServer").addEventListener("change", updateFreeUpGpuCount);
}

function makeSummary(data) {
  const freeItems = [];

  for (const [server, info] of Object.entries(data.servers || {})) {
    if (info.status !== "ok") continue;
    for (const gpu of info.gpus || []) {
      if (gpu.state === "free") {
        freeItems.push(`${escapeHtml(server)} -> GPU ${escapeHtml(gpu.index)}`);
      }
    }
  }

  const summary = document.getElementById("summary");
  if (freeItems.length === 0) {
    summary.innerHTML = `
      <h2>Free GPUs</h2>
      <div>No clearly free GPUs right now.</div>
    `;
  } else {
    summary.innerHTML = `
      <h2>Free GPUs</h2>
      <div>${freeItems.join("<br>")}</div>
    `;
  }
}

function updateServerOptions(data) {
  const servers = Object.keys(data.servers || {});
  const options = makePlaceholder("server") + servers
    .map((server) => `<option value="${escapeHtml(server)}">${escapeHtml(server)}</option>`)
    .join("");

  for (const id of ["supportServer", "freeUpServer"]) {
    const select = document.getElementById(id);
    const current = select.value;
    select.innerHTML = options;
    select.value = servers.includes(current) ? current : "";
  }

  updateFreeUpGpuCount();
}

function updateFreeUpGpuCount() {
  const server = document.getElementById("freeUpServer").value;
  const select = document.getElementById("freeUpGpuCount");
  const serverInfo = state.statusData?.servers?.[server];
  const gpuTotal = Math.max(1, serverInfo?.gpus?.length || 1);
  const current = Number(select.value || "1");

  select.innerHTML = "";
  for (let count = 1; count <= gpuTotal; count += 1) {
    select.innerHTML += `<option value="${count}">${count}</option>`;
  }
  select.value = String(current <= gpuTotal ? current : 1);
}

function getCurrentUsers(server) {
  const serverInfo = state.statusData?.servers?.[server];
  if (!serverInfo || serverInfo.status !== "ok") return "unknown";

  const users = new Set();
  for (const gpu of serverInfo.gpus || []) {
    for (const proc of gpu.processes || []) {
      if (proc.user) users.add(proc.user);
    }
  }

  return users.size ? Array.from(users).sort().join(", ") : "none listed";
}

function renderDashboard(data) {
  const content = document.getElementById("content");
  content.innerHTML = "";

  for (const [server, info] of Object.entries(data.servers || {})) {
    const box = document.createElement("div");
    box.className = "server";

    let html = `<h2>${escapeHtml(server)}</h2>`;

    if (info.status !== "ok") {
      html += "<p>Unavailable</p>";
    } else {
      for (const gpu of info.gpus || []) {
        html += `
          <div class="gpu ${escapeHtml(gpu.state)}">
            <div class="gpu-top">
              GPU ${escapeHtml(gpu.index)} | ${escapeHtml(gpu.name)} | ${escapeHtml(gpu.state).toUpperCase()}
            </div>
            <div class="gpu-sub">
              Memory: ${escapeHtml(gpu.used_mib)} / ${escapeHtml(gpu.total_mib)} MiB |
              Utilization: ${escapeHtml(gpu.util_percent)}%
            </div>
        `;

        if (gpu.processes && gpu.processes.length > 0) {
          html += '<div><strong>Processes</strong></div><div class="proc-list">';
          for (const proc of gpu.processes) {
            html += `
              <div class="proc-item">
                ${escapeHtml(proc.user)} | PID ${escapeHtml(proc.pid)} | ${escapeHtml(proc.name)} | ${escapeHtml(proc.used_mib)} MiB
              </div>
            `;
          }
          html += "</div>";
        } else {
          html += '<div class="no-proc">No active compute processes listed.</div>';
        }

        html += "</div>";
      }
    }

    box.innerHTML = html;
    content.appendChild(box);
  }
}

async function sendSupportRequest() {
  const user = getSelectedUser("supportUser");
  const server = document.getElementById("supportServer").value;
  const issue = document.getElementById("supportIssue").value;
  const button = document.getElementById("sendSupportBtn");
  const templateId = EMAILJS_CONFIG.supportTemplateId;

  if (!user || !server) {
    setMessage("supportMessage", "Select a user and server before sending.", false);
    return;
  }

  if (!initializeEmailjs(templateId)) {
    setMessage("supportMessage", "EmailJS is not configured.", false);
    return;
  }

  button.disabled = true;
  setMessage("supportMessage", "Sending support request...");

  try {
    await emailjs.send(
      EMAILJS_CONFIG.emailjsServiceId,
      templateId,
      {
        name: user.name,
        user: user.label,
        server,
        issue,
        note: issue,
        time: new Date().toLocaleString(),
        page: window.location.href
      }
    );
    setMessage("supportMessage", "Support request sent.", true);
  } catch (error) {
    setMessage("supportMessage", error.text || error.message || "Could not send support request.", false);
  } finally {
    button.disabled = false;
  }
}

async function sendFreeUpRequest() {
  const user = getSelectedUser("freeUpUser");
  const server = document.getElementById("freeUpServer").value;
  const gpuCount = document.getElementById("freeUpGpuCount").value;
  const button = document.getElementById("sendFreeUpBtn");
  const templateId = EMAILJS_CONFIG.freeUpTemplateId;

  if (!user || !server) {
    setMessage("freeUpMessage", "Select a user and server before sending.", false);
    return;
  }

  if (!initializeEmailjs(templateId)) {
    setMessage("freeUpMessage", "EmailJS is not configured.", false);
    return;
  }

  button.disabled = true;
  setMessage("freeUpMessage", "Sending free-up request...");

  try {
    await emailjs.send(
      EMAILJS_CONFIG.emailjsServiceId,
      templateId,
      {
        name: user.name,
        user: user.label,
        server,
        current_users: getCurrentUsers(server),
        gpu_count: gpuCount || "1",
        note: `${user.label} is requesting ${gpuCount || "1"} GPU(s) be freed on ${server}.`,
        time: new Date().toLocaleString(),
        page: window.location.href
      }
    );
    setMessage("freeUpMessage", "Free-up request sent.", true);
  } catch (error) {
    setMessage("freeUpMessage", error.text || error.message || "Could not send free-up request.", false);
  } finally {
    button.disabled = false;
  }
}

async function loadStatus() {
  try {
    const res = await fetch("gpu_status.json?t=" + Date.now());
    const data = await res.json();
    state.statusData = data;

    document.getElementById("updated").innerText =
      "Last updated (UTC): " + data.updated_utc;

    makeSummary(data);
    updateServerOptions(data);
    renderDashboard(data);
  } catch (err) {
    document.getElementById("content").innerHTML =
      "<p>Could not load gpu_status.json</p>";
  }
}
