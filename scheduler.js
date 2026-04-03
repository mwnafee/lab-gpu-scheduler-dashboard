const PASSWORD = "labgpu123";
const STORAGE_KEY = "labGpuSchedulerBookings";
const WINDOW_DAYS = 7;
const HOURS_PER_DAY = 24;
const ALLOWED_IDS = ["nafeem", "wangj68"];
const ADMIN_ID = "nafeem";

const state = {
  statusData: null,
  gpuIds: [],
  bookings: loadBookings(),
  selectedGpuId: "",
  selectedBooking: null,
  today: new Date()
};

function loadBookings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

function saveBookings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bookings));
}

function getSlotKey(gpuId, dayIndex, hour) {
  return `${gpuId}__${dayIndex}__${hour}`;
}

function setBookingMessage(text, isSuccess) {
  const box = document.getElementById("bookingMessage");
  box.className = isSuccess ? "success" : "";
  box.innerText = text || "";
}

function switchView(viewId) {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.view === viewId);
  }
  for (const view of document.querySelectorAll(".view")) {
    view.classList.toggle("active", view.id === viewId);
  }
}

function checkPassword() {
  const input = document.getElementById("pw").value;
  const error = document.getElementById("error");

  if (input === PASSWORD) {
    document.getElementById("loginBox").style.display = "none";
    document.getElementById("app").style.display = "block";
    initializeScheduler();
    loadStatus();
    setInterval(loadStatus, 5000);
  } else {
    error.innerText = "Wrong password";
  }
}

function getEarliestBookableOffset() {
  const now = new Date();
  let hour = now.getHours();
  if (now.getMinutes() || now.getSeconds()) {
    hour += 1;
  }
  return Math.min(hour, WINDOW_DAYS * HOURS_PER_DAY - 1);
}

function getDayDate(dayIndex) {
  const d = new Date(state.today);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayIndex);
  return d;
}

function getDayLabel(dayIndex) {
  const d = getDayDate(dayIndex);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function getHourLabel(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function offsetToSlot(offset) {
  return {
    dayIndex: Math.floor(offset / HOURS_PER_DAY),
    hour: offset % HOURS_PER_DAY
  };
}

function slotToOffset(dayIndex, hour) {
  return dayIndex * HOURS_PER_DAY + hour;
}

function formatSlot(dayIndex, hour) {
  if (dayIndex === WINDOW_DAYS) {
    return `${getDayLabel(WINDOW_DAYS - 1)} 24:00`;
  }
  return `${getDayLabel(dayIndex)} ${getHourLabel(hour)}`;
}

function makeSummary(data) {
  let freeItems = [];

  for (const [server, info] of Object.entries(data.servers)) {
    if (info.status !== "ok") continue;
    for (const gpu of info.gpus) {
      if (gpu.state === "free") {
        freeItems.push(`${server} -> GPU ${gpu.index}`);
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

function updateGpuList(data) {
  const gpuIds = [];

  for (const [server, info] of Object.entries(data.servers)) {
    if (info.status !== "ok") continue;
    for (const gpu of info.gpus) {
      gpuIds.push(`${server}-GPU${gpu.index}`);
    }
  }

  state.gpuIds = gpuIds;
  if (!state.selectedGpuId || !gpuIds.includes(state.selectedGpuId)) {
    state.selectedGpuId = gpuIds[0] || "";
  }

  const options = gpuIds.map((gpuId) => `<option value="${gpuId}">${gpuId}</option>`).join("");
  document.getElementById("gpuSelect").innerHTML = options;
  document.getElementById("gridGpuSelect").innerHTML = options;
  document.getElementById("gpuSelect").value = state.selectedGpuId;
  document.getElementById("gridGpuSelect").value = state.selectedGpuId;
}

function renderDashboard(data) {
  const content = document.getElementById("content");
  content.innerHTML = "";

  for (const [server, info] of Object.entries(data.servers)) {
    const box = document.createElement("div");
    box.className = "server";

    let html = `<h2>${server}</h2>`;

    if (info.status !== "ok") {
      html += "<p>Unavailable</p>";
    } else {
      for (const gpu of info.gpus) {
        html += `
          <div class="gpu ${gpu.state}">
            <div class="gpu-top">
              GPU ${gpu.index} | ${gpu.name} | ${gpu.state.toUpperCase()}
            </div>
            <div class="gpu-sub">
              Memory: ${gpu.used_mib} / ${gpu.total_mib} MiB |
              Utilization: ${gpu.util_percent}%
            </div>
        `;

        if (gpu.processes && gpu.processes.length > 0) {
          html += `<div><strong>Processes</strong></div><div class="proc-list">`;
          for (const proc of gpu.processes) {
            html += `
              <div class="proc-item">
                ${proc.user} | PID ${proc.pid} | ${proc.name} | ${proc.used_mib} MiB
              </div>
            `;
          }
          html += `</div>`;
        } else {
          html += `<div class="no-proc">No active compute processes listed.</div>`;
        }

        html += `</div>`;
      }
    }

    box.innerHTML = html;
    content.appendChild(box);
  }
}

function initializeScheduler() {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  }

  document.getElementById("gpuSelect").addEventListener("change", (event) => {
    state.selectedGpuId = event.target.value;
    document.getElementById("gridGpuSelect").value = state.selectedGpuId;
    renderBookingGrid();
  });

  document.getElementById("gridGpuSelect").addEventListener("change", (event) => {
    state.selectedGpuId = event.target.value;
    document.getElementById("gpuSelect").value = state.selectedGpuId;
    state.selectedBooking = null;
    renderSelectedBooking();
    renderBookingGrid();
  });

  document.getElementById("endDay").addEventListener("change", () => {
    renderEndHourOptions();
    updateBookingHint();
  });

  for (const id of ["startDay", "startHour", "endHour"]) {
    document.getElementById(id).addEventListener("change", updateBookingHint);
  }

  document.getElementById("rpiId").addEventListener("input", renderSelectedBooking);
  document.getElementById("createBookingBtn").addEventListener("click", createBooking);
  document.getElementById("removeBookingBtn").addEventListener("click", removeSelectedBooking);

  document.getElementById("bookingGridBody").addEventListener("click", (event) => {
    const cell = event.target.closest(".booked-cell");
    if (!cell) return;
    state.selectedBooking = buildBookingSummary(
      cell.dataset.gpuId,
      Number(cell.dataset.dayIndex),
      Number(cell.dataset.hour)
    );
    renderSelectedBooking();
    renderBookingGrid();
  });

  renderSchedulerControls();
}

function renderSchedulerControls() {
  const startDay = document.getElementById("startDay");
  const endDay = document.getElementById("endDay");
  const startHour = document.getElementById("startHour");

  startDay.innerHTML = "";
  endDay.innerHTML = "";
  startHour.innerHTML = "";

  for (let day = 0; day < WINDOW_DAYS; day += 1) {
    const label = getDayLabel(day);
    startDay.innerHTML += `<option value="${day}">${label}</option>`;
    endDay.innerHTML += `<option value="${day}">${label}</option>`;
  }
  endDay.innerHTML += `<option value="${WINDOW_DAYS}">End of ${getDayLabel(WINDOW_DAYS - 1)}</option>`;

  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    startHour.innerHTML += `<option value="${hour}">${getHourLabel(hour)}</option>`;
  }

  const startOffset = getEarliestBookableOffset();
  const endOffset = Math.min(startOffset + 1, WINDOW_DAYS * HOURS_PER_DAY);
  const startSlot = offsetToSlot(startOffset);
  const endSlot = offsetToSlot(endOffset);

  startDay.value = String(startSlot.dayIndex);
  startHour.value = String(startSlot.hour);
  endDay.value = String(endSlot.dayIndex);
  renderEndHourOptions();
  document.getElementById("endHour").value = String(endSlot.hour);
  updateBookingHint();
  renderSelectedBooking();
}

function renderEndHourOptions() {
  const endDay = Number(document.getElementById("endDay").value);
  const endHour = document.getElementById("endHour");
  endHour.innerHTML = "";
  const limit = endDay === WINDOW_DAYS ? 1 : HOURS_PER_DAY;
  for (let hour = 0; hour < limit; hour += 1) {
    endHour.innerHTML += `<option value="${hour}">${getHourLabel(hour)}</option>`;
  }
}

function updateBookingHint() {
  const earliest = offsetToSlot(getEarliestBookableOffset());
  document.getElementById("bookingHint").innerText =
    `Allowed RCS IDs: ${ALLOWED_IDS.join(", ")}. Earliest bookable slot: ${formatSlot(earliest.dayIndex, earliest.hour)}.`;
}

function createBooking() {
  const user = document.getElementById("displayName").value.trim();
  const rpiId = document.getElementById("rpiId").value.trim().toLowerCase();
  const gpuId = document.getElementById("gpuSelect").value;
  const startDayIndex = Number(document.getElementById("startDay").value);
  const startHour = Number(document.getElementById("startHour").value);
  const endDayIndex = Number(document.getElementById("endDay").value);
  const endHour = Number(document.getElementById("endHour").value);

  const startOffset = slotToOffset(startDayIndex, startHour);
  const endOffset = slotToOffset(endDayIndex, endHour);

  if (!user) {
    setBookingMessage("Display name is required.", false);
    return;
  }

  if (!ALLOWED_IDS.includes(rpiId)) {
    setBookingMessage("This RCS ID is not allowed to book GPUs.", false);
    return;
  }

  if (endOffset <= startOffset) {
    setBookingMessage("End time must be after start time.", false);
    return;
  }

  if (startOffset < getEarliestBookableOffset()) {
    setBookingMessage("Start time must be in the future.", false);
    return;
  }

  if (endOffset > WINDOW_DAYS * HOURS_PER_DAY) {
    setBookingMessage("Booking must stay within the next 7 days.", false);
    return;
  }

  for (let offset = startOffset; offset < endOffset; offset += 1) {
    const slot = offsetToSlot(offset);
    const key = getSlotKey(gpuId, slot.dayIndex, slot.hour);
    if (state.bookings[key]) {
      setBookingMessage("One or more selected slots are already booked.", false);
      return;
    }
  }

  const bookingId = `booking-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const payload = { user, rpiId, bookingId };

  for (let offset = startOffset; offset < endOffset; offset += 1) {
    const slot = offsetToSlot(offset);
    state.bookings[getSlotKey(gpuId, slot.dayIndex, slot.hour)] = payload;
  }

  saveBookings();
  state.selectedGpuId = gpuId;
  state.selectedBooking = null;
  document.getElementById("gridGpuSelect").value = gpuId;
  setBookingMessage("Booking created in this browser.", true);
  renderBookingGrid();
  renderSelectedBooking();
}

function buildBookingSummary(gpuId, dayIndex, hour) {
  const booking = state.bookings[getSlotKey(gpuId, dayIndex, hour)];
  if (!booking) return null;

  let startOffset = slotToOffset(dayIndex, hour);
  let endOffset = startOffset + 1;

  while (startOffset > 0) {
    const prev = offsetToSlot(startOffset - 1);
    const prevBooking = state.bookings[getSlotKey(gpuId, prev.dayIndex, prev.hour)];
    if (!prevBooking || prevBooking.bookingId !== booking.bookingId) break;
    startOffset -= 1;
  }

  while (endOffset < WINDOW_DAYS * HOURS_PER_DAY) {
    const next = offsetToSlot(endOffset);
    const nextBooking = state.bookings[getSlotKey(gpuId, next.dayIndex, next.hour)];
    if (!nextBooking || nextBooking.bookingId !== booking.bookingId) break;
    endOffset += 1;
  }

  const start = offsetToSlot(startOffset);
  const end = offsetToSlot(endOffset);

  return {
    gpuId,
    dayIndex,
    hour,
    bookingId: booking.bookingId,
    user: booking.user,
    rpiId: booking.rpiId,
    startDayIndex: start.dayIndex,
    startHour: start.hour,
    endDayIndex: end.dayIndex,
    endHour: end.hour
  };
}

function renderSelectedBooking() {
  const box = document.getElementById("selectedBookingInfo");
  const button = document.getElementById("removeBookingBtn");

  if (!state.selectedBooking) {
    box.innerText = "Click any booked cell to select it for removal.";
    button.disabled = true;
    return;
  }

  const actor = document.getElementById("rpiId").value.trim().toLowerCase();
  const canDelete = actor === ADMIN_ID || actor === state.selectedBooking.rpiId;

  box.innerHTML = `
    <div><strong>GPU:</strong> ${state.selectedBooking.gpuId}</div>
    <div><strong>User:</strong> ${state.selectedBooking.user} (${state.selectedBooking.rpiId})</div>
    <div><strong>Start:</strong> ${formatSlot(state.selectedBooking.startDayIndex, state.selectedBooking.startHour)}</div>
    <div><strong>End:</strong> ${formatSlot(state.selectedBooking.endDayIndex, state.selectedBooking.endHour)}</div>
    <div style="margin-top: 8px;">${canDelete ? "You can remove this booking." : "Only the booking owner or nafeem can remove this booking."}</div>
  `;
  button.disabled = false;
}

function removeSelectedBooking() {
  if (!state.selectedBooking) return;

  const actor = document.getElementById("rpiId").value.trim().toLowerCase();
  if (actor !== ADMIN_ID && actor !== state.selectedBooking.rpiId) {
    setBookingMessage("You can only remove your own bookings.", false);
    return;
  }

  const bookingId = state.selectedBooking.bookingId;
  const gpuPrefix = `${state.selectedBooking.gpuId}__`;

  for (const key of Object.keys(state.bookings)) {
    if (key.startsWith(gpuPrefix) && state.bookings[key].bookingId === bookingId) {
      delete state.bookings[key];
    }
  }

  saveBookings();
  state.selectedBooking = null;
  setBookingMessage("Booking removed from this browser.", true);
  renderSelectedBooking();
  renderBookingGrid();
}

function renderBookingGrid() {
  const head = document.getElementById("bookingGridHead");
  const body = document.getElementById("bookingGridBody");

  let headHtml = "<tr><th>Hour</th>";
  for (let day = 0; day < WINDOW_DAYS; day += 1) {
    headHtml += `<th>${getDayLabel(day)}</th>`;
  }
  headHtml += "</tr>";
  head.innerHTML = headHtml;

  let bodyHtml = "";
  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    bodyHtml += `<tr><td class="hour-cell">${getHourLabel(hour)}</td>`;
    for (let day = 0; day < WINDOW_DAYS; day += 1) {
      const booking = state.bookings[getSlotKey(state.selectedGpuId, day, hour)];
      if (!booking) {
        bodyHtml += `<td class="free-cell">Free</td>`;
      } else {
        const selected = state.selectedBooking &&
          state.selectedBooking.gpuId === state.selectedGpuId &&
          state.selectedBooking.bookingId === booking.bookingId;
        bodyHtml += `
          <td
            class="booked-cell${selected ? " selected" : ""}"
            data-gpu-id="${state.selectedGpuId}"
            data-day-index="${day}"
            data-hour="${hour}"
          >
            <div class="cell-title">${booking.user}</div>
            <div class="cell-subtitle">${booking.rpiId}</div>
          </td>
        `;
      }
    }
    bodyHtml += "</tr>";
  }

  body.innerHTML = bodyHtml;
}

async function loadStatus() {
  try {
    const res = await fetch("gpu_status.json?t=" + Date.now());
    const data = await res.json();
    state.statusData = data;

    document.getElementById("updated").innerText =
      "Last updated (UTC): " + data.updated_utc;

    makeSummary(data);
    updateGpuList(data);
    renderDashboard(data);
    renderBookingGrid();
  } catch (err) {
    document.getElementById("content").innerHTML =
      "<p>Could not load gpu_status.json</p>";
  }
}
