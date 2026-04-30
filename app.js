const storageKey = "devartek-calendar-v1";
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const longDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

const defaultState = {
  profile: {
    name: "Devartek",
    email: "hello@devartek.local",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Local timezone"
  },
  availability: {
    days: [1, 2, 3, 4, 5],
    start: "09:00",
    end: "17:00",
    buffer: 10
  },
  services: [
    { id: createId(), name: "Discovery call", duration: 30 },
    { id: createId(), name: "Project planning", duration: 45 },
    { id: createId(), name: "Technical consultation", duration: 60 }
  ],
  bookings: [],
  blockedDates: []
};

let state = loadState();
let apiAvailable = false;
const isPublicBooking = new URLSearchParams(location.search).has("book");
let visibleDate = startOfMonth(new Date());
let selectedDate = toDateKey(new Date());
let selectedServiceId = state.services[0]?.id || "";

const $ = (selector) => document.querySelector(selector);

const elements = {
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  monthLabel: $("#monthLabel"),
  calendarGrid: $("#calendarGrid"),
  selectedDateLabel: $("#selectedDateLabel"),
  agendaList: $("#agendaList"),
  emptyAgenda: $("#emptyAgenda"),
  servicePicker: $("#servicePicker"),
  bookingDate: $("#bookingDate"),
  bookingTime: $("#bookingTime"),
  slotHelp: $("#slotHelp"),
  bookingForm: $("#bookingForm"),
  bookingError: $("#bookingError"),
  toast: $("#toast"),
  hostNamePreview: $("#hostNamePreview"),
  hostTimezonePreview: $("#hostTimezonePreview"),
  hostName: $("#hostName"),
  hostEmail: $("#hostEmail"),
  timezone: $("#timezone"),
  daysGrid: $("#daysGrid"),
  startTime: $("#startTime"),
  endTime: $("#endTime"),
  bufferMinutes: $("#bufferMinutes"),
  serviceList: $("#serviceList"),
  blockedList: $("#blockedList"),
  publicLink: $("#publicLink")
};

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeState(value) {
  const source = value || {};
  return {
    profile: { ...defaultState.profile, ...(source.profile || {}) },
    availability: { ...defaultState.availability, ...(source.availability || {}) },
    services: Array.isArray(source.services) ? source.services : defaultState.services,
    bookings: Array.isArray(source.bookings) ? source.bookings : [],
    blockedDates: Array.isArray(source.blockedDates) ? source.blockedDates : []
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return saved ? normalizeState(saved) : normalizeState(defaultState);
  } catch {
    return normalizeState(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  if (location.protocol.startsWith("http")) {
    fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    })
      .then((response) => {
        apiAvailable = response.ok;
      })
      .catch(() => {
        apiAvailable = false;
      });
  }
}

async function syncFromServer() {
  if (!location.protocol.startsWith("http")) return;
  try {
    const response = await fetch("/api/state");
    if (!response.ok) return;
    apiAvailable = true;
    const serverState = await response.json();
    if (serverState) {
      state = normalizeState(serverState);
      if (!state.services.some((service) => service.id === selectedServiceId)) {
        selectedServiceId = state.services[0]?.id || "";
      }
      renderAll();
      applyInitialRoute();
      return;
    }
    saveState();
  } catch {
    apiAvailable = false;
  }
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function minutesToTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 1, hours, minutes));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function setView(viewName) {
  elements.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === viewName));
  elements.views.forEach((view) => view.classList.toggle("active", view.id === `${viewName}View`));
  if (viewName === "booking") renderBookingSlots();
}

function renderAll() {
  renderProfile();
  renderCalendar();
  renderAgenda();
  renderServices();
  renderServicePicker();
  renderAvailability();
  renderBlockedDates();
  renderBookingSlots();
  elements.publicLink.textContent = getBookingLink();
}

function renderProfile() {
  elements.hostNamePreview.textContent = state.profile.name;
  elements.hostTimezonePreview.textContent = state.profile.timezone;
  elements.hostName.value = state.profile.name;
  elements.hostEmail.value = state.profile.email;
  elements.timezone.value = state.profile.timezone;
}

function renderCalendar() {
  elements.monthLabel.textContent = monthFormat.format(visibleDate);
  elements.calendarGrid.innerHTML = "";

  const firstWeekday = visibleDate.getDay();
  const firstGridDate = new Date(visibleDate);
  firstGridDate.setDate(firstGridDate.getDate() - firstWeekday);

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(firstGridDate);
    date.setDate(firstGridDate.getDate() + index);
    const key = toDateKey(date);
    const bookings = state.bookings.filter((booking) => booking.date === key);
    const button = document.createElement("button");
    button.className = "day-cell";
    button.type = "button";
    button.classList.toggle("muted", date.getMonth() !== visibleDate.getMonth());
    button.classList.toggle("today", key === toDateKey(new Date()));
    button.classList.toggle("selected", key === selectedDate);
    button.innerHTML = `<span class="date-number">${date.getDate()}</span>`;
    bookings.slice(0, 3).forEach((booking) => {
      const chip = document.createElement("span");
      chip.className = "booking-chip";
      chip.textContent = `${formatTime(booking.time)} ${booking.name}`;
      button.appendChild(chip);
    });
    if (bookings.length > 3) {
      const chip = document.createElement("span");
      chip.className = "booking-chip";
      chip.textContent = `+${bookings.length - 3} more`;
      button.appendChild(chip);
    }
    button.addEventListener("click", () => {
      selectedDate = key;
      renderCalendar();
      renderAgenda();
    });
    elements.calendarGrid.appendChild(button);
  }
}

function renderAgenda() {
  const date = parseDateKey(selectedDate);
  const bookings = state.bookings
    .filter((booking) => booking.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  elements.selectedDateLabel.textContent = longDate.format(date);
  elements.emptyAgenda.style.display = bookings.length ? "none" : "grid";
  elements.agendaList.innerHTML = "";

  bookings.forEach((booking) => {
    const item = document.createElement("article");
    item.className = "agenda-item";
    item.innerHTML = `
      <strong>${escapeHtml(booking.name)}</strong>
      <span class="agenda-meta">${formatTime(booking.time)} / ${booking.serviceName} / ${booking.duration} min</span>
      <span class="agenda-meta">${escapeHtml(booking.email)}</span>
      ${booking.reminderMinutes ? `<span class="agenda-meta">Reminder ${formatReminder(booking.reminderMinutes)} / ${escapeHtml(booking.reminderEmail || booking.email)}</span>` : ""}
      ${booking.notes ? `<span class="agenda-meta">${escapeHtml(booking.notes)}</span>` : ""}
    `;
    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.textContent = "Cancel";
    remove.addEventListener("click", () => {
      state.bookings = state.bookings.filter((itemBooking) => itemBooking.id !== booking.id);
      saveState();
      renderAll();
      showToast("Booking canceled");
    });
    item.appendChild(remove);
    elements.agendaList.appendChild(item);
  });
}

function renderServicePicker() {
  if (!state.services.length) {
    selectedServiceId = "";
    elements.servicePicker.innerHTML = `<div class="empty-state"><strong>No services</strong><span>Add one in Setup.</span></div>`;
    return;
  }

  if (!state.services.some((service) => service.id === selectedServiceId)) {
    selectedServiceId = state.services[0].id;
  }

  elements.servicePicker.innerHTML = "";
  state.services.forEach((service) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "service-option";
    button.classList.toggle("active", service.id === selectedServiceId);
    button.innerHTML = `<strong>${escapeHtml(service.name)}</strong><br><span>${service.duration} minutes</span>`;
    button.addEventListener("click", () => {
      selectedServiceId = service.id;
      renderServicePicker();
      renderBookingSlots();
    });
    elements.servicePicker.appendChild(button);
  });
}

function renderServices() {
  elements.serviceList.innerHTML = "";
  state.services.forEach((service) => {
    const item = document.createElement("article");
    item.className = "service-item";
    item.innerHTML = `<div><strong>${escapeHtml(service.name)}</strong><span>${service.duration} minutes</span></div>`;
    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.services = state.services.filter((itemService) => itemService.id !== service.id);
      saveState();
      renderAll();
      showToast("Service removed");
    });
    item.appendChild(remove);
    elements.serviceList.appendChild(item);
  });
}

function renderAvailability() {
  elements.startTime.value = state.availability.start;
  elements.endTime.value = state.availability.end;
  elements.bufferMinutes.value = state.availability.buffer;
  elements.daysGrid.innerHTML = "";

  dayNames.forEach((day, index) => {
    const button = document.createElement("button");
    button.className = "day-toggle";
    button.classList.toggle("active", state.availability.days.includes(index));
    button.type = "button";
    button.textContent = day;
    button.addEventListener("click", () => {
      const days = new Set(state.availability.days);
      days.has(index) ? days.delete(index) : days.add(index);
      state.availability.days = [...days].sort();
      saveState();
      renderAvailability();
      renderBookingSlots();
    });
    elements.daysGrid.appendChild(button);
  });
}

function renderBlockedDates() {
  elements.blockedList.innerHTML = "";
  if (!state.blockedDates.length) {
    elements.blockedList.innerHTML = `<div class="empty-state"><strong>No blocked dates</strong><span>Add vacations or unavailable days here.</span></div>`;
    return;
  }

  groupDateRanges(state.blockedDates).forEach((range) => {
    const item = document.createElement("article");
    item.className = "blocked-item";
    item.innerHTML = `<span>${formatDateRange(range.start, range.end)}</span>`;
    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.textContent = "Unblock";
    remove.addEventListener("click", () => {
      const datesToRemove = new Set(getDateRange(range.start, range.end));
      state.blockedDates = state.blockedDates.filter((blockedDate) => !datesToRemove.has(blockedDate));
      saveState();
      renderAll();
      showToast(range.start === range.end ? "Date unblocked" : "Date range unblocked");
    });
    item.appendChild(remove);
    elements.blockedList.appendChild(item);
  });
}

function getDateRange(startKey, endKey) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey || startKey);
  const dates = [];
  const cursor = start <= end ? start : end;
  const last = start <= end ? end : start;

  while (cursor <= last) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function groupDateRanges(dateKeys) {
  const uniqueDates = [...new Set(dateKeys)].sort();
  const ranges = [];

  uniqueDates.forEach((dateKey) => {
    const lastRange = ranges.at(-1);
    if (!lastRange) {
      ranges.push({ start: dateKey, end: dateKey });
      return;
    }

    const nextExpected = parseDateKey(lastRange.end);
    nextExpected.setDate(nextExpected.getDate() + 1);
    if (toDateKey(nextExpected) === dateKey) {
      lastRange.end = dateKey;
      return;
    }

    ranges.push({ start: dateKey, end: dateKey });
  });

  return ranges;
}

function formatDateRange(startKey, endKey) {
  const start = longDate.format(parseDateKey(startKey));
  if (startKey === endKey) return start;
  return `${start} to ${longDate.format(parseDateKey(endKey))}`;
}

function renderBookingSlots() {
  const dateKey = elements.bookingDate.value;
  const service = state.services.find((item) => item.id === selectedServiceId);
  elements.bookingTime.innerHTML = "";

  if (!dateKey || !service) {
    elements.slotHelp.textContent = service ? "Choose a date to see open times." : "Add a service in Setup first.";
    return;
  }

  const slots = getOpenSlots(dateKey, service.duration);
  if (!slots.length) {
    elements.bookingTime.innerHTML = `<option value="">No open times</option>`;
    elements.slotHelp.textContent = "This day is outside your availability or already booked.";
    return;
  }

  slots.forEach((slot) => {
    const option = document.createElement("option");
    option.value = slot;
    option.textContent = formatTime(slot);
    elements.bookingTime.appendChild(option);
  });
  elements.slotHelp.textContent = `${slots.length} open time${slots.length === 1 ? "" : "s"} available.`;
}

function getOpenSlots(dateKey, duration) {
  const date = parseDateKey(dateKey);
  const weekday = date.getDay();
  if (!state.availability.days.includes(weekday) || state.blockedDates.includes(dateKey)) return [];

  const start = timeToMinutes(state.availability.start);
  const end = timeToMinutes(state.availability.end);
  const step = duration + Number(state.availability.buffer || 0);
  const slots = [];

  for (let cursor = start; cursor + duration <= end; cursor += step) {
    const slot = minutesToTime(cursor);
    const collides = hasScheduleConflict(dateKey, slot, duration);
    if (!collides) slots.push(slot);
  }

  return slots;
}

function hasScheduleConflict(dateKey, time, duration, ignoreBookingId = "") {
  const start = timeToMinutes(time);
  const end = start + duration;
  const buffer = Number(state.availability.buffer || 0);

  return state.bookings.some((booking) => {
    if (booking.id === ignoreBookingId || booking.date !== dateKey) return false;
    const bookingStart = timeToMinutes(booking.time);
    const bookingEnd = bookingStart + booking.duration;
    return start < bookingEnd + buffer && end + buffer > bookingStart;
  });
}

function addBooking({ name, email, reminderEmail, reminderMinutes, notes, date, time, service }) {
  state.bookings.push({
    id: createId(),
    name,
    email,
    reminderEmail,
    reminderMinutes,
    notes,
    date,
    time,
    serviceId: service.id,
    serviceName: service.name,
    duration: service.duration,
    createdAt: new Date().toISOString()
  });
  saveState();
}

function formatReminder(minutes) {
  const value = Number(minutes);
  if (!value) return "off";
  if (value < 60) return `${value} minutes before`;
  if (value === 60) return "1 hour before";
  if (value === 1440) return "1 day before";
  if (value % 1440 === 0) return `${value / 1440} days before`;
  if (value % 60 === 0) return `${value / 60} hours before`;
  return `${value} minutes before`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function exportIcs() {
  if (!state.bookings.length) {
    showToast("No bookings to export yet");
    return;
  }

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Devartek Calendar//Self Hosted//EN"];
  state.bookings.forEach((booking) => {
    const start = buildIcsDate(booking.date, booking.time);
    const end = buildIcsDate(booking.date, minutesToTime(timeToMinutes(booking.time) + booking.duration));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${booking.id}@devartek-calendar`,
      `DTSTAMP:${toIcsStamp(new Date())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${icsText(`${booking.serviceName} with ${booking.name}`)}`,
      `DESCRIPTION:${icsText(buildIcsDescription(booking))}`,
      `ORGANIZER:MAILTO:${state.profile.email}`,
      `ATTENDEE;CN=${icsText(booking.name)}:MAILTO:${booking.email}`
    );
    if (Number(booking.reminderMinutes) > 0) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsText(`Reminder: ${booking.serviceName} with ${booking.name}`)}`,
        `TRIGGER:-${icsDuration(booking.reminderMinutes)}`,
        "END:VALARM"
      );
      if (booking.reminderEmail) {
        lines.push(
          "BEGIN:VALARM",
          "ACTION:EMAIL",
          `ATTENDEE:MAILTO:${booking.reminderEmail}`,
          `SUMMARY:${icsText(`Reminder: ${booking.serviceName}`)}`,
          `DESCRIPTION:${icsText(`Reminder for ${booking.serviceName} with ${booking.name}`)}`,
          `TRIGGER:-${icsDuration(booking.reminderMinutes)}`,
          "END:VALARM"
        );
      }
    }
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "devartek-bookings.ics";
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildIcsDescription(booking) {
  const lines = [booking.notes || "Booked through Devartek Calendar"];
  if (booking.reminderMinutes) {
    lines.push(`Reminder: ${formatReminder(booking.reminderMinutes)}`);
    lines.push(`Reminder email: ${booking.reminderEmail || booking.email}`);
  }
  return lines.join("\n");
}

function icsDuration(minutes) {
  const value = Number(minutes);
  if (value % 1440 === 0) return `P${value / 1440}D`;
  if (value % 60 === 0) return `PT${value / 60}H`;
  return `PT${value}M`;
}

function buildIcsDate(dateKey, time) {
  const [year, month, day] = dateKey.split("-");
  const [hours, minutes] = time.split(":");
  return `${year}${month}${day}T${hours}${minutes}00`;
}

function toIcsStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsText(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function attachEvents() {
  elements.navItems.forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
  $("#prevMonth").addEventListener("click", () => {
    visibleDate.setMonth(visibleDate.getMonth() - 1);
    renderCalendar();
  });
  $("#nextMonth").addEventListener("click", () => {
    visibleDate.setMonth(visibleDate.getMonth() + 1);
    renderCalendar();
  });
  $("#todayButton").addEventListener("click", () => {
    visibleDate = startOfMonth(new Date());
    selectedDate = toDateKey(new Date());
    renderCalendar();
    renderAgenda();
  });
  $("#newBooking").addEventListener("click", () => setView("booking"));
  $("#exportIcs").addEventListener("click", exportIcs);
  $("#copyLink").addEventListener("click", async () => {
    const link = getBookingLink();
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(link);
      showToast("Booking link copied");
      return;
    }
    showToast(link);
  });
  elements.bookingDate.addEventListener("change", renderBookingSlots);

  elements.bookingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    elements.bookingError.textContent = "";
    const service = state.services.find((item) => item.id === selectedServiceId);
    const date = elements.bookingDate.value;
    const time = elements.bookingTime.value;
    const name = $("#guestName").value.trim();
    const email = $("#guestEmail").value.trim();
    const reminderEmail = $("#reminderEmail").value.trim() || email;
    const reminderMinutes = Number($("#reminderMinutes").value);
    const notes = $("#guestNotes").value.trim();

    if (!service || !date || !time || !name || !email) {
      elements.bookingError.textContent = "Choose a service, date, time, and enter visitor details.";
      return;
    }

    if (!getOpenSlots(date, service.duration).includes(time)) {
      elements.bookingError.textContent = "That time conflicts with another booking or is outside your availability. Pick another slot.";
      renderBookingSlots();
      return;
    }

    if (hasScheduleConflict(date, time, service.duration)) {
      elements.bookingError.textContent = "That time overlaps another booking. Pick another slot.";
      renderBookingSlots();
      return;
    }

    addBooking({ name, email, reminderEmail, reminderMinutes, notes, date, time, service });
    selectedDate = date;
    visibleDate = startOfMonth(parseDateKey(date));
    elements.bookingForm.reset();
    renderAll();
    if (isPublicBooking) {
      setView("booking");
      showToast("Booking confirmed");
      return;
    }
    setView("calendar");
    showToast("Booking confirmed");
  });

  $("#profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.profile = {
      name: elements.hostName.value.trim(),
      email: elements.hostEmail.value.trim(),
      timezone: elements.timezone.value.trim()
    };
    saveState();
    renderAll();
    showToast("Profile saved");
  });

  $("#availabilityForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.availability.start = elements.startTime.value;
    state.availability.end = elements.endTime.value;
    state.availability.buffer = Number(elements.bufferMinutes.value);
    saveState();
    renderAll();
    showToast("Availability saved");
  });

  $("#serviceForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#serviceName").value.trim();
    const duration = Number($("#serviceDuration").value);
    if (!name || !duration) return;
    state.services.push({ id: createId(), name, duration });
    event.currentTarget.reset();
    saveState();
    renderAll();
    showToast("Service added");
  });

  $("#blockRangeToggle").addEventListener("change", (event) => {
    const isRange = event.currentTarget.checked;
    $("#blockEndField").classList.toggle("active", isRange);
    $("#blockEndDate").required = isRange;
    if (!isRange) $("#blockEndDate").value = "";
  });

  $("#blockForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const startDate = $("#blockDate").value;
    const isRange = $("#blockRangeToggle").checked;
    const endDate = isRange ? $("#blockEndDate").value : startDate;
    if (!startDate || !endDate) return;

    const existingDates = new Set(state.blockedDates);
    const datesToAdd = getDateRange(startDate, endDate);
    datesToAdd.forEach((date) => existingDates.add(date));
    state.blockedDates = [...existingDates].sort();
    event.currentTarget.reset();
    $("#blockEndField").classList.remove("active");
    $("#blockEndDate").required = false;
    saveState();
    renderAll();
    showToast(datesToAdd.length === 1 ? "Date blocked" : `${datesToAdd.length} days blocked`);
  });
}

attachEvents();
renderAll();
applyInitialRoute();
syncFromServer();

function applyInitialRoute() {
  if (isPublicBooking) {
    document.body.classList.add("public-mode");
    setView("booking");
    return;
  }

  if (location.hash === "#booking") {
    setView("booking");
  }
}

function getBookingLink() {
  return `${location.origin}${location.pathname}?book=1#booking`;
}
