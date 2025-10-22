// Todo PWA - app logic
// Data shape: { id: string, title: string, details?: string, due?: 'YYYY-MM-DD', done: boolean, createdAt: number }

const STORAGE_KEY = 'todo-pwa:v1:tasks';
let tasks = loadTasks();
let currentFilter = 'all';
let deferredPrompt = null;

// Elements
const form = document.getElementById('todoForm');
const titleEl = document.getElementById('title');
const detailsEl = document.getElementById('details');
const dueEl = document.getElementById('due');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('emptyState');
const filterEls = Array.from(document.querySelectorAll('.chip[data-filter]'));
const searchEl = document.getElementById('search');
const clearDoneBtn = document.getElementById('clearDone');
const exportBtn = document.getElementById('exportJson');
const importBtn = document.getElementById('importJson');
const importFile = document.getElementById('importFile');
const installBtn = document.getElementById('installBtn');
const notifyBtn = document.getElementById('notifyBtn');
const fabAdd = document.getElementById('fabAdd');
const addModal = document.getElementById('addModal');
const dashOverdueEl = document.getElementById('dashOverdue');
const dashPendingEl = document.getElementById('dashPending');
const dashTodayEl = document.getElementById('dashToday');
const dashDoneEl = document.getElementById('dashDone');
let swReg = null;
const NOTIFIED_KEY = 'todo-pwa:v1:notified';

// Service worker & PWA install
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      swReg = reg;
      // Try setting app badge with current overdue count
      updateAppBadge();
      // After SW ready, check notifications if permission already granted
      maybeNotifyOverdue();
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn?.addEventListener('click', async () => {
  installBtn.hidden = true;
  deferredPrompt?.prompt();
  const { outcome } = await deferredPrompt?.userChoice || { outcome: 'dismissed' };
  deferredPrompt = null;
});

// Notifications opt-in
notifyBtn?.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    alert('Notifications are not supported in this browser.');
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      await maybeNotifyOverdue(true);
      notifyBtn.textContent = 'Notifications enabled';
      notifyBtn.disabled = true;
    } else if (perm === 'denied') {
      alert('Notifications are blocked. You can enable them in your browser settings.');
    }
  } catch {
    // noop
  }
});

// Installed handler: hide button when installed
window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  deferredPrompt = null;
});

// iOS hint: beforeinstallprompt is not supported on iOS Safari/Chrome
(() => {
  const ua = window.navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isIOS && !isStandalone) {
    const tip = document.createElement('div');
    tip.className = 'ios-install-tip';
    tip.textContent = 'On iOS: Share → Add to Home Screen to install';
    const header = document.querySelector('.app-header');
    if (header && header.parentElement) {
      header.insertAdjacentElement('afterend', tip);
    }
  }
})();

// Event listeners
// Modal open/close
fabAdd?.addEventListener('click', openAddModal);
document.querySelectorAll('[data-close]')?.forEach(el => el.addEventListener('click', closeAddModal));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAddModal();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  const details = detailsEl.value.trim();
  const due = dueEl.value || undefined;
  if (!title) return;
  const task = { id: crypto.randomUUID(), title, details: details || undefined, due, done: false, createdAt: Date.now() };
  tasks.unshift(task);
  persist();
  form.reset();
  render();
  closeAddModal();
});

filterEls.forEach(el => el.addEventListener('click', () => {
  filterEls.forEach(f => f.classList.remove('active'));
  el.classList.add('active');
  currentFilter = el.dataset.filter;
  render();
}));

searchEl.addEventListener('input', () => render());
clearDoneBtn.addEventListener('click', () => {
  tasks = tasks.filter(t => !t.done);
  persist();
  render();
});
exportBtn.addEventListener('click', () => {
  const csv = tasksToCSV(tasks);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'todo-export.csv'; a.click();
  URL.revokeObjectURL(url);
});
importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    let parsed = [];
    if (text.trim().startsWith('[')) {
      // JSON fallback
      const data = JSON.parse(text);
      if (Array.isArray(data)) parsed = data;
    } else {
      parsed = parseCSVToTasks(text);
    }
    if (Array.isArray(parsed)) {
      tasks = sanitizeTasks(parsed);
      persist();
      render();
    }
  } catch {}
  importFile.value = '';
});

// Rendering
function render() {
  const search = searchEl.value.trim().toLowerCase();
  const todayStr = localYMD(new Date());

  // Update dashboard counts (always based on full task list)
  updateDashboard();

  let filtered = tasks;
  switch (currentFilter) {
    case 'today':
      filtered = tasks.filter(t => t.due === todayStr && !t.done);
      break;
    case 'upcoming':
      filtered = tasks.filter(t => t.due && t.due > todayStr && !t.done);
      break;
    case 'done':
      filtered = tasks.filter(t => t.done);
      break;
  }
  if (search) {
    filtered = filtered.filter(t =>
      t.title.toLowerCase().includes(search) || (t.details?.toLowerCase().includes(search))
    );
  }

  listEl.innerHTML = '';
  if (filtered.length === 0) {
    emptyEl.hidden = false;
    return;
  } else {
    emptyEl.hidden = true;
  }

  for (const t of filtered) {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = t.id;
    if (t.done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = t.done;
    checkbox.addEventListener('change', () => toggleDone(t.id, checkbox.checked));

    const meta = document.createElement('div');
    meta.className = 'meta';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = t.title;

    const details = document.createElement('div');
    details.className = 'details';
    details.textContent = t.details || '';

    const due = document.createElement('div');
    due.className = 'due';
    if (t.due) {
      const label = labelForDue(t.due);
      due.textContent = label;
      const todayStr = localYMD(new Date());
      const isOverdue = t.due < todayStr && !t.done;
      if (isOverdue) {
        li.classList.add('overdue');
        const badge = document.createElement('span');
        badge.className = 'badge overdue';
        badge.textContent = 'Overdue';
        due.appendChild(document.createTextNode(' '));
        due.appendChild(badge);
      }
    } else {
      due.textContent = '';
    }

    meta.appendChild(title);
    if (t.details) meta.appendChild(details);
    if (t.due) meta.appendChild(due);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn outline';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => beginEdit(t.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn danger outline';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => removeTask(t.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(checkbox);
    li.appendChild(meta);
    li.appendChild(actions);

    listEl.appendChild(li);
  }
}

function labelForDue(yyyyMmDd) {
  const todayStr = localYMD(new Date());
  if (yyyyMmDd === todayStr) return 'Due today';
  if (yyyyMmDd < todayStr) {
    const d = new Date(yyyyMmDd);
    return `Overdue: ${d.toLocaleDateString()}`;
  }
  const d = new Date(yyyyMmDd);
  return `Due ${d.toLocaleDateString()}`;
}

function toggleDone(id, done) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  t.done = done;
  persist();
  // keep item in place but optional re-render for filters
  render();
}

function removeTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  persist();
  render();
}

function beginEdit(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  const newTitle = prompt('Edit title', t.title) || t.title;
  const newDetails = prompt('Edit details', t.details ?? '') ?? t.details;
  const newDue = prompt('Edit due date (YYYY-MM-DD)', t.due ?? '') ?? t.due;
  if (!newTitle.trim()) return;
  t.title = newTitle.trim();
  t.details = newDetails?.trim() || undefined;
  t.due = (newDue?.trim()) || undefined;
  persist();
  render();
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  updateAppBadge();
}
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return sanitizeTasks(data);
  } catch {
    return [];
  }
}
function sanitizeTasks(arr) {
  return arr
    .filter(x => x && typeof x === 'object')
    .map(x => ({
      id: String(x.id || crypto.randomUUID()),
      title: String(x.title || '').slice(0, 120),
      details: x.details ? String(x.details).slice(0, 300) : undefined,
      due: x.due ? String(x.due) : undefined,
      done: Boolean(x.done),
      createdAt: Number(x.createdAt || Date.now()),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Initial render
render();

// Utilities
function localYMD(d) {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}

// Footer date: show a nice formatted date like "Mon, Oct 21, 2025"
(() => {
  const el = document.getElementById('today');
  if (!el) return;
  const now = new Date();
  const opts = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  try {
    el.textContent = now.toLocaleDateString(undefined, opts);
  } catch {
    el.textContent = now.toDateString();
  }
  el.setAttribute('datetime', now.toISOString().slice(0, 10));
})();

function updateDashboard() {
  if (!dashOverdueEl) return; // dashboard not present
  const todayStr = localYMD(new Date());
  const overdue = tasks.filter(t => t.due && t.due < todayStr && !t.done).length;
  const pending = tasks.filter(t => !t.done).length;
  const today = tasks.filter(t => t.due === todayStr && !t.done).length;
  const done = tasks.filter(t => t.done).length;
  dashOverdueEl.textContent = String(overdue);
  dashPendingEl.textContent = String(pending);
  dashTodayEl.textContent = String(today);
  dashDoneEl.textContent = String(done);
}

function openAddModal() {
  if (!addModal) return;
  addModal.hidden = false;
  addModal.setAttribute('aria-hidden', 'false');
  // focus the title input
  setTimeout(() => titleEl?.focus(), 0);
}
function closeAddModal() {
  if (!addModal) return;
  addModal.hidden = true;
  addModal.setAttribute('aria-hidden', 'true');
}

// CSV helpers
function tasksToCSV(items) {
  const headers = ['id','title','details','due','done','createdAt'];
  const lines = [headers.join(',')];
  for (const t of items) {
    const row = [
      t.id ?? '',
      t.title ?? '',
      t.details ?? '',
      t.due ?? '',
      String(!!t.done),
      String(t.createdAt ?? '')
    ].map(csvEscape);
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function parseCSVToTasks(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const idx = Object.fromEntries(headers.map((h,i)=>[h,i]));
  const out = [];
  for (let i=1;i<lines.length;i++) {
    const cols = parseCSVLine(lines[i]);
    const get = (name) => cols[idx[name]] ?? '';
    const doneStr = String(get('done')).toLowerCase();
    const created = Number(get('createdAt'));
    out.push({
      id: get('id') || crypto.randomUUID(),
      title: get('title'),
      details: get('details') || undefined,
      due: get('due') || undefined,
      done: doneStr === 'true' || doneStr === '1' || doneStr === 'yes',
      createdAt: Number.isFinite(created) && created > 0 ? created : Date.now()
    });
  }
  return out;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i+1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

// Overdue notifications and app badge helpers
function getOverdueTasks() {
  const todayStr = localYMD(new Date());
  return tasks.filter(t => t.due && t.due < todayStr && !t.done);
}

async function maybeNotifyOverdue(force = false) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !swReg) return;
    const overdue = getOverdueTasks();
    if (overdue.length === 0) return;
    const notified = loadNotified();
    const toNotify = overdue.filter(t => force || !notified.has(t.id));
    if (toNotify.length === 0) return;
    for (const t of toNotify) {
      await swReg.showNotification('Task overdue', {
        body: t.title + (t.due ? ` (due ${t.due})` : ''),
        icon: './assets/icons/icon-192.png',
        badge: './assets/icons/icon-192.png',
        tag: 'overdue-' + t.id,
        data: { id: t.id }
      });
      notified.add(t.id);
    }
    saveNotified(notified);
  } catch {}
}

function loadNotified() {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function saveNotified(set) {
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(Array.from(set))); } catch {}
}

function updateAppBadge() {
  try {
    const count = getOverdueTasks().length;
    if ('setAppBadge' in navigator) {
      if (count > 0) navigator.setAppBadge(count); else navigator.clearAppBadge();
    }
  } catch {}
}
