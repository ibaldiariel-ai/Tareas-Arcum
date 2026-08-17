import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PEOPLE = { ariel: "Ariel", vale: "Vale" };
const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

let tasks = [];
let whoami = localStorage.getItem("arcum_whoami");
let currentFilter = "all";
let currentView = "home";
let openCompleteId = null;

// ---------- Onboarding ----------
function initOnboarding() {
  if (whoami) return;
  document.getElementById("onboard").style.display = "flex";
  document.querySelectorAll(".onboard-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      whoami = btn.dataset.who;
      localStorage.setItem("arcum_whoami", whoami);
      document.getElementById("onboard").style.display = "none";
    });
  });
}
document.getElementById("btn-whoami").addEventListener("click", () => {
  document.getElementById("onboard").style.display = "flex";
});

// ---------- Supabase: carga inicial + tiempo real ----------
async function loadTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    showToast("Error al cargar las tareas");
    return;
  }
  tasks = data;
  render();
}

function listenTasks() {
  loadTasks();
  supabase
    .channel("tasks-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
      loadTasks();
    })
    .subscribe();
}

// ---------- Helpers ----------
function toDateOnly(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}
function today() { return toDateOnly(new Date()); }
function fmtShort(dateStr) {
  if (!dateStr) return "";
  const [y,m,d] = dateStr.split("-").map(Number);
  return `${d}/${m}`;
}
function daysUntil(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  const due = toDateOnly(new Date(y, m-1, d));
  return Math.round((due - today()) / 86400000);
}
function tsToDate(ts) {
  if (!ts) return null;
  return new Date(ts);
}
function isSameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- View switching ----------
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    currentView = btn.dataset.view;
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b === btn));
    document.getElementById("view-home").style.display = currentView === "home" ? "block" : "none";
    document.getElementById("view-indicators").style.display = currentView === "indicators" ? "block" : "none";
    document.getElementById("fab-add").style.display = currentView === "home" ? "flex" : "none";
    if (currentView === "indicators") renderIndicators();
  });
});

// ---------- Filter ----------
document.getElementById("filter-row").addEventListener("click", e => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  currentFilter = chip.dataset.filter;
  render();
});

// ---------- New task sheet ----------
const sheet = document.getElementById("sheet-new");
let selAssignee = whoami || "ariel";
let selPriority = "normal";

function openSheet() {
  document.getElementById("input-title").value = "";
  document.getElementById("input-due").value = "";
  document.getElementById("err-title").style.display = "none";
  selAssignee = whoami || "ariel";
  selPriority = "normal";
  syncToggle("toggle-assignee", selAssignee);
  syncToggle("toggle-priority", selPriority);
  sheet.style.display = "flex";
}
function closeSheet() { sheet.style.display = "none"; }
function syncToggle(containerId, val) {
  document.querySelectorAll(`#${containerId} .toggle-opt`).forEach(el => {
    el.classList.toggle("sel-orange", el.dataset.val === val);
  });
}

document.getElementById("fab-add").addEventListener("click", openSheet);
document.getElementById("btn-close-sheet").addEventListener("click", closeSheet);
sheet.addEventListener("click", e => { if (e.target === sheet) closeSheet(); });

document.getElementById("toggle-assignee").addEventListener("click", e => {
  const opt = e.target.closest(".toggle-opt");
  if (!opt) return;
  selAssignee = opt.dataset.val;
  syncToggle("toggle-assignee", selAssignee);
});
document.getElementById("toggle-priority").addEventListener("click", e => {
  const opt = e.target.closest(".toggle-opt");
  if (!opt) return;
  selPriority = opt.dataset.val;
  syncToggle("toggle-priority", selPriority);
});

document.getElementById("btn-save-task").addEventListener("click", async () => {
  const title = document.getElementById("input-title").value.trim();
  if (!title) {
    document.getElementById("err-title").style.display = "block";
    return;
  }
  const due = document.getElementById("input-due").value || null;
  const btn = document.getElementById("btn-save-task");
  btn.disabled = true;
  const { error } = await supabase.from("tasks").insert({
    title,
    assignee: selAssignee,
    priority: selPriority,
    due_date: due,
    created_by: whoami || selAssignee,
    completed: false
  });
  btn.disabled = false;
  if (error) {
    console.error(error);
    showToast("No se pudo guardar. Revisá la conexión.");
    return;
  }
  closeSheet();
  showToast("Tarea guardada");
});

// ---------- Complete task ----------
async function completeTask(id, note) {
  const { error } = await supabase
    .from("tasks")
    .update({
      completed: true,
      completed_at: new Date().toISOString(),
      completed_by: whoami,
      note: note || null
    })
    .eq("id", id);
  if (error) {
    console.error(error);
    showToast("No se pudo actualizar. Revisá la conexión.");
    return;
  }
  openCompleteId = null;
  showToast("Tarea completada");
}

// ---------- Rendering: Home ----------
function filteredTasks() {
  if (currentFilter === "all") return tasks;
  return tasks.filter(t => t.assignee === currentFilter);
}

function render() {
  renderStats();
  renderFilterChips();
  renderMonthsStrip();
  renderTaskList();
  if (currentView === "indicators") renderIndicators();
}

function renderStats() {
  const pend = tasks.filter(t => !t.completed);
  const overdue = pend.filter(t => t.due_date && daysUntil(t.due_date) < 0);
  const doneToday = tasks.filter(t => t.completed && t.completed_at && isSameDay(tsToDate(t.completed_at), new Date()));
  document.getElementById("stat-pending").textContent = pend.length;
  document.getElementById("stat-overdue").textContent = overdue.length;
  document.getElementById("stat-today").textContent = doneToday.length;
}

function renderFilterChips() {
  document.querySelectorAll(".filter-chip").forEach(chip => {
    const f = chip.dataset.filter;
    chip.classList.remove("active-all", "active-orange", "active-blue");
    if (f === currentFilter) {
      if (f === "all") chip.classList.add("active-all");
      if (f === "ariel") chip.classList.add("active-orange");
      if (f === "vale") chip.classList.add("active-blue");
    }
  });
}

function renderMonthsStrip() {
  const strip = document.getElementById("months-strip");
  strip.innerHTML = "";
  const base = new Date();
  const list = filteredTasks().filter(t => !t.completed && t.due_date);

  for (let i = 0; i < 3; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const monthTasks = list.filter(t => {
      const [y,m] = t.due_date.split("-").map(Number);
      return y === d.getFullYear() && (m-1) === d.getMonth();
    });
    const overdueCount = monthTasks.filter(t => daysUntil(t.due_date) < 0).length;
    const card = document.createElement("div");
    card.className = "month-card" + (overdueCount > 0 ? " has-overdue" : "");
    card.innerHTML = `
      <div class="month-card-label">${MONTHS[d.getMonth()]}</div>
      <div class="month-card-count">${monthTasks.length}</div>
      <div class="month-card-sub">${overdueCount > 0 ? overdueCount + " vencida" + (overdueCount>1?"s":"") : "&nbsp;"}</div>
    `;
    card.addEventListener("click", () => {
      const target = document.getElementById("month-section-" + d.getFullYear() + "-" + d.getMonth());
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    strip.appendChild(card);
  }
}

function renderTaskList() {
  const container = document.getElementById("task-list");
  container.innerHTML = "";
  const list = filteredTasks();

  const pending = list.filter(t => !t.completed);
  const recentDone = list.filter(t => t.completed)
    .sort((a,b) => (tsToDate(b.completed_at)||0) - (tsToDate(a.completed_at)||0))
    .slice(0, 5);

  if (pending.length === 0 && recentDone.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay tareas todavía. Tocá el botón "+" para cargar la primera.</div>`;
    return;
  }

  const noDate = pending.filter(t => !t.due_date);
  const withDate = pending.filter(t => t.due_date).sort((a,b) => a.due_date.localeCompare(b.due_date));

  if (noDate.length) {
    container.appendChild(sectionTitle("sin fecha"));
    noDate.forEach(t => container.appendChild(taskCard(t)));
  }

  const groups = {};
  withDate.forEach(t => {
    const [y,m] = t.due_date.split("-").map(Number);
    const key = `${y}-${m-1}`;
    if (!groups[key]) groups[key] = { y, m: m-1, items: [] };
    groups[key].items.push(t);
  });
  Object.values(groups)
    .sort((a,b) => (a.y - b.y) || (a.m - b.m))
    .forEach(g => {
      const title = sectionTitle(MONTHS[g.m] + (g.y !== new Date().getFullYear() ? " " + g.y : ""));
      title.id = `month-section-${g.y}-${g.m}`;
      container.appendChild(title);
      g.items.forEach(t => container.appendChild(taskCard(t)));
    });

  if (recentDone.length) {
    container.appendChild(sectionTitle("completadas recientemente"));
    recentDone.forEach(t => container.appendChild(taskCard(t)));
  }
}

function sectionTitle(text) {
  const div = document.createElement("div");
  div.className = "section-title";
  div.innerHTML = `<span>${text}</span><div class="line"></div>`;
  return div;
}

function taskCard(t) {
  const wrap = document.createElement("div");
  wrap.className = "task-card" + (openCompleteId === t.id ? " complete-panel" : "");

  const checkClasses = ["task-check", `assignee-${t.assignee}`, t.completed ? "done" : ""].join(" ");
  const checkIcon = t.completed
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 9 18 20 6"/></svg>`
    : "";

  let dateRow = "";
  if (t.due_date && !t.completed) {
    const dleft = daysUntil(t.due_date);
    const overdue = dleft < 0;
    const chipText = overdue ? "vencida" : (dleft === 0 ? "hoy" : `en ${dleft} día${dleft>1?"s":""}`);
    dateRow = `
      <div class="task-date-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span style="font-size:12px;color:var(--text-secondary);">estimada: ${fmtShort(t.due_date)}</span>
        <span class="due-chip ${overdue ? "overdue" : "upcoming"}">${chipText}</span>
      </div>`;
  }

  const priorityBadge = (t.priority === "urgent" && !t.completed)
    ? `<span class="priority-badge" style="margin-left:auto;">urgente</span>` : "";

  const metaText = t.completed
    ? `${PEOPLE[t.completed_by] || "—"} completó · ${PEOPLE[t.assignee] || ""}`
    : `${PEOPLE[t.assignee] || ""} · cargada ${t.created_at ? "el " + shortCreated(t.created_at) : ""}`;

  const noteHtml = (t.completed && t.note) ? `<div class="note-text">"${escapeHtml(t.note)}"</div>` : "";

  wrap.innerHTML = `
    <div class="task-row">
      <button class="${checkClasses}" data-id="${t.id}">${checkIcon}</button>
      <div class="task-main">
        <div class="task-title ${t.completed ? "done" : ""}">${escapeHtml(t.title)}</div>
        <div class="task-meta">${metaText}</div>
      </div>
      ${priorityBadge}
    </div>
    ${dateRow}
    ${noteHtml}
  `;

  if (openCompleteId === t.id) {
    const panel = document.createElement("div");
    panel.innerHTML = `
      <label class="field-label">¿Alguna observación? (opcional)</label>
      <textarea rows="2" placeholder="ej: quedó para el jueves"></textarea>
      <div class="complete-actions">
        <button class="btn-text" data-action="omit" data-id="${t.id}">omitir</button>
        <button class="btn-primary-sm" data-action="confirm" data-id="${t.id}">listo</button>
      </div>
    `;
    wrap.appendChild(panel);
  }

  const checkBtn = wrap.querySelector(".task-check");
  checkBtn.addEventListener("click", () => {
    if (t.completed) return;
    openCompleteId = openCompleteId === t.id ? null : t.id;
    render();
  });

  const omitBtn = wrap.querySelector('[data-action="omit"]');
  const confirmBtn = wrap.querySelector('[data-action="confirm"]');
  if (omitBtn) omitBtn.addEventListener("click", () => completeTask(t.id, null));
  if (confirmBtn) confirmBtn.addEventListener("click", () => {
    const ta = wrap.querySelector("textarea");
    completeTask(t.id, ta.value.trim());
  });

  return wrap;
}

function shortCreated(ts) {
  const d = tsToDate(ts);
  if (!d) return "";
  return `${d.getDate()}/${d.getMonth()+1}`;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

// ---------- Indicators view ----------
function renderIndicators() {
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const doneWeek = tasks.filter(t => t.completed && t.completed_at && tsToDate(t.completed_at) >= weekAgo);
  const pendingNow = tasks.filter(t => !t.completed);

  document.getElementById("week-done").textContent = doneWeek.length;
  document.getElementById("week-pending").textContent = pendingNow.length;

  const byArie = doneWeek.filter(t => t.completed_by === "ariel").length;
  const byVale = doneWeek.filter(t => t.completed_by === "vale").length;
  const max = Math.max(byArie, byVale, 1);
  document.getElementById("bar-ariel").style.width = (byArie / max * 100) + "%";
  document.getElementById("bar-vale").style.width = (byVale / max * 100) + "%";
  document.getElementById("count-ariel").textContent = byArie;
  document.getElementById("count-vale").textContent = byVale;

  const obsList = document.getElementById("obs-list");
  const withNotes = tasks.filter(t => t.completed && t.note)
    .sort((a,b) => (tsToDate(b.completed_at)||0) - (tsToDate(a.completed_at)||0))
    .slice(0, 6);
  if (withNotes.length === 0) {
    obsList.innerHTML = `<div class="empty-state">Todavía no hay observaciones.</div>`;
  } else {
    obsList.innerHTML = withNotes.map(t =>
      `<div class="obs-item">"${escapeHtml(t.note)}" — ${escapeHtml(t.title)}</div>`
    ).join("");
  }
}

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

// ---------- Init ----------
initOnboarding();
listenTasks();
