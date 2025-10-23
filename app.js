// Todo PWA - app logic
// Data shape: { id: string, title: string, details?: string, due?: 'YYYY-MM-DD', status: 'Not started'|'in-progress'|'pending'|'Blocked'|'completed', createdAt: number }

const STORAGE_KEY = 'todo-pwa:v1:tasks';
const STATUS_VALUES = ['Not started', 'in-progress', 'pending', 'Blocked', 'completed'];
let tasks = loadTasks();
let currentFilter = 'all';
let deferredPrompt = null;
let currentView = 'table'; // default to table view only

// Elements
const form = document.getElementById('todoForm');
const titleEl = document.getElementById('title');
const detailsEl = document.getElementById('details');
const dueEl = document.getElementById('due');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('emptyState');
const tableSectionEl = document.getElementById('tableSection');
const taskTableEl = document.getElementById('taskTable');
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
// View toggle
const viewListBtn = document.getElementById('viewList');
const viewTableBtn = document.getElementById('viewTable');
viewListBtn?.addEventListener('click', () => {
  setView('list');
});
viewTableBtn?.addEventListener('click', () => {
  setView('table');
});

function setView(view) {
  currentView = view;
  // Update UI states
  if (viewListBtn && viewTableBtn) {
    const isList = view === 'list';
    viewListBtn.classList.toggle('active', isList);
    viewTableBtn.classList.toggle('active', !isList);
    viewListBtn.setAttribute('aria-selected', String(isList));
    viewTableBtn.setAttribute('aria-selected', String(!isList));
  }
  render();
}
const dashOverdueEl = document.getElementById('dashOverdue');
const dashPendingEl = document.getElementById('dashPending');
const dashTodayEl = document.getElementById('dashToday');
const dashDoneEl = document.getElementById('dashDone');
const dashboardEl = document.getElementById('dashboard');
const dashToggleBtn = document.getElementById('dashToggle');
// Status dashboard elements
const dashStatusNotStartedEl = document.getElementById('dashStatusNotStarted');
const dashStatusInProgressEl = document.getElementById('dashStatusInProgress');
const dashStatusPendingEl = document.getElementById('dashStatusPending');
const dashStatusBlockedEl = document.getElementById('dashStatusBlocked');
const dashStatusCompletedEl = document.getElementById('dashStatusCompleted');
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

// Dashboard expand/collapse toggle (no horizontal scroll)
dashToggleBtn?.addEventListener('click', () => {
  if (!dashboardEl) return;
  dashboardEl.classList.toggle('compact');
  const expanded = !dashboardEl.classList.contains('compact');
  dashToggleBtn.textContent = expanded ? 'Hide status breakdown' : 'Show status breakdown';
  dashToggleBtn.setAttribute('aria-expanded', String(expanded));
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
  const task = { id: crypto.randomUUID(), title, details: details || undefined, due, status: 'Not started', createdAt: Date.now() };
  tasks.unshift(task);
  persist();
  form.reset();
  render();
  closeAddModal();
});

filterEls.forEach(el => el.addEventListener('click', () => {
  setFilter(el.dataset.filter);
}));

function setFilter(filter) {
  currentFilter = filter;
  // Update chips active state only for native chips
  const chipFilters = new Set(['all','today','upcoming','done']);
  filterEls.forEach(f => {
    const isActive = chipFilters.has(filter) && f.dataset.filter === filter;
    f.classList.toggle('active', isActive);
    if (chipFilters.has(filter)) {
      f.setAttribute('aria-selected', String(isActive));
    } else {
      f.setAttribute('aria-selected', 'false');
    }
  });
  render();
}

searchEl.addEventListener('input', () => render());
clearDoneBtn.addEventListener('click', () => {
  tasks = tasks.filter(t => t.status !== 'completed');
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
      filtered = tasks.filter(t => t.due === todayStr && t.status !== 'completed');
      break;
    case 'upcoming':
      filtered = tasks.filter(t => t.due && t.due > todayStr && t.status !== 'completed');
      break;
    case 'done':
      filtered = tasks.filter(t => t.status === 'completed');
      break;
    case 'overdue':
      filtered = tasks.filter(t => t.due && t.due < todayStr && t.status !== 'completed');
      break;
    case 'pending':
      filtered = tasks.filter(t => t.status !== 'completed');
      break;
  }
  if (typeof currentFilter === 'string' && currentFilter.startsWith('status:')) {
    const wanted = currentFilter.slice('status:'.length);
    filtered = tasks.filter(t => (t.status || 'Not started') === wanted);
  }
  if (search) {
    filtered = filtered.filter(t =>
      t.title.toLowerCase().includes(search) || (t.details?.toLowerCase().includes(search))
    );
  }

  if (currentView === 'list') {
    renderList(filtered);
  } else {
    renderTable(filtered);
  }
}

function renderList(items) {
  listEl.innerHTML = '';
  // Toggle containers
  listEl.parentElement?.removeAttribute('hidden');
  if (tableSectionEl) tableSectionEl.hidden = true;

  if (items.length === 0) {
    emptyEl.hidden = false;
    return;
  } else {
    emptyEl.hidden = true;
  }

  for (const t of items) {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = t.id;
    if (t.status === 'completed') li.classList.add('done');

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
      const label = labelForDue(t.due, t.status);
      due.textContent = label;
      const todayStr2 = localYMD(new Date());
      const isOverdue = t.due < todayStr2 && t.status !== 'completed';
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

    const statusSelect = document.createElement('select');
    statusSelect.className = 'status-select';
    for (const s of STATUS_VALUES) {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      if ((t.status || 'Not started') === s) opt.selected = true;
      statusSelect.appendChild(opt);
    }
    statusSelect.addEventListener('change', () => updateStatus(t.id, statusSelect.value));

    const editBtn = document.createElement('button');
    editBtn.className = 'btn outline';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => beginEdit(t.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn danger outline';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => removeTask(t.id));

    actions.appendChild(statusSelect);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(meta);
    li.appendChild(actions);

    listEl.appendChild(li);
  }
}

function renderTable(items) {
  // Toggle containers
  if (tableSectionEl) tableSectionEl.hidden = false;
  // Hide list container section
  listEl.parentElement?.setAttribute('hidden', '');

  // Empty state
  if (items.length === 0) {
    taskTableEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  } else {
    emptyEl.hidden = true;
  }

  const header = `
    <thead>
      <tr>
        <th style="width:28%">Title</th>
        <th style="width:32%">Details</th>
        <th style="width:14%">Due</th>
        <th style="width:16%">Status</th>
        <th style="width:10%; text-align:right">Actions</th>
      </tr>
    </thead>`;

  const rows = items.map(t => {
    const dueLabel = t.due ? labelForDue(t.due, t.status) : '';
    const isOverdue = t.due ? (t.due < localYMD(new Date()) && t.status !== 'completed') : false;
    const statusOptions = STATUS_VALUES.map(s => `<option value="${s}" ${((t.status||'Not started')===s)?'selected':''}>${s}</option>`).join('');
    return `
      <tr data-id="${t.id}">
        <td class="col-title">${escapeHtml(t.title)}</td>
        <td class="col-details">${escapeHtml(t.details || '')}</td>
        <td class="col-due">${dueLabel}${isOverdue? ' <span class="badge overdue">Overdue</span>':''}</td>
        <td>
          <select class="status-select" data-action="status">${statusOptions}</select>
        </td>
        <td class="col-actions">
          <button class="btn outline" data-action="edit">Edit</button>
          <button class="btn danger outline" data-action="delete">Delete</button>
        </td>
      </tr>`;
  }).join('');

  taskTableEl.innerHTML = `${header}<tbody>${rows}</tbody>`;

  // Wire row actions
  taskTableEl.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.getAttribute('data-id');
    const statusSelect = tr.querySelector('select[data-action="status"]');
    const editBtn = tr.querySelector('button[data-action="edit"]');
    const delBtn = tr.querySelector('button[data-action="delete"]');
    statusSelect?.addEventListener('change', () => updateStatus(id, statusSelect.value));
    editBtn?.addEventListener('click', () => beginEdit(id));
    delBtn?.addEventListener('click', () => removeTask(id));
  });
}

function labelForDue(yyyyMmDd, status) {
  const todayStr = localYMD(new Date());
  if (yyyyMmDd === todayStr) return 'Due today';
  if (yyyyMmDd < todayStr && status !== 'completed') {
    const d = new Date(yyyyMmDd);
    return `Overdue: ${d.toLocaleDateString()}`;
  }
  const d = new Date(yyyyMmDd);
  return `Due ${d.toLocaleDateString()}`;
}

function updateStatus(id, status) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  t.status = status;
  persist();
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
    .map(x => {
      // Migrate legacy "done" boolean to status
      let status = 'Not started';
      if (typeof x.status === 'string' && STATUS_VALUES.includes(x.status)) status = x.status;
      else if (x.done === true) status = 'completed';
      return {
        id: String(x.id || crypto.randomUUID()),
        title: String(x.title || '').slice(0, 120),
        details: x.details ? String(x.details).slice(0, 300) : undefined,
        due: x.due ? String(x.due) : undefined,
        status,
        createdAt: Number(x.createdAt || Date.now()),
      };
    })
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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const overdue = tasks.filter(t => t.due && t.due < todayStr && t.status !== 'completed').length;
  const pending = tasks.filter(t => t.status !== 'completed').length;
  const today = tasks.filter(t => t.due === todayStr && t.status !== 'completed').length;
  const done = tasks.filter(t => t.status === 'completed').length;
  dashOverdueEl.textContent = String(overdue);
  dashPendingEl.textContent = String(pending);
  dashTodayEl.textContent = String(today);
  dashDoneEl.textContent = String(done);

  // Status breakdown counts (optional UI may omit these elements)
  if (dashStatusNotStartedEl) {
    dashStatusNotStartedEl.textContent = String(tasks.filter(t => t.status === 'Not started').length);
  }
  if (dashStatusInProgressEl) {
    dashStatusInProgressEl.textContent = String(tasks.filter(t => t.status === 'in-progress').length);
  }
  if (dashStatusPendingEl) {
    dashStatusPendingEl.textContent = String(tasks.filter(t => t.status === 'pending').length);
  }
  if (dashStatusBlockedEl) {
    dashStatusBlockedEl.textContent = String(tasks.filter(t => t.status === 'Blocked').length);
  }
  if (dashStatusCompletedEl) {
    dashStatusCompletedEl.textContent = String(tasks.filter(t => t.status === 'completed').length);
  }

  // Make dashboard values clickable to filter
  dashOverdueEl?.setAttribute('title', 'Click to filter overdue');
  dashPendingEl?.setAttribute('title', 'Click to filter pending');
  dashTodayEl?.setAttribute('title', 'Click to filter due today');
  dashDoneEl?.setAttribute('title', 'Click to filter completed');

  dashOverdueEl?.addEventListener('click', () => setFilter('overdue'), { once: true });
  dashPendingEl?.addEventListener('click', () => setFilter('pending'), { once: true });
  dashTodayEl?.addEventListener('click', () => setFilter('today'), { once: true });
  dashDoneEl?.addEventListener('click', () => setFilter('done'), { once: true });

  dashStatusNotStartedEl?.setAttribute('title', 'Click to filter Not started');
  dashStatusInProgressEl?.setAttribute('title', 'Click to filter In progress');
  dashStatusPendingEl?.setAttribute('title', 'Click to filter Pending');
  dashStatusBlockedEl?.setAttribute('title', 'Click to filter Blocked');
  dashStatusCompletedEl?.setAttribute('title', 'Click to filter Completed');

  dashStatusNotStartedEl?.addEventListener('click', () => setFilter('status:Not started'), { once: true });
  dashStatusInProgressEl?.addEventListener('click', () => setFilter('status:in-progress'), { once: true });
  dashStatusPendingEl?.addEventListener('click', () => setFilter('status:pending'), { once: true });
  dashStatusBlockedEl?.addEventListener('click', () => setFilter('status:Blocked'), { once: true });
  dashStatusCompletedEl?.addEventListener('click', () => setFilter('status:completed'), { once: true });
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
  const headers = ['id','title','details','due','status','createdAt'];
  const lines = [headers.join(',')];
  for (const t of items) {
    const row = [
      t.id ?? '',
      t.title ?? '',
      t.details ?? '',
      t.due ?? '',
      t.status ?? 'Not started',
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
    const statusStr = String(get('status'));
    const created = Number(get('createdAt'));
    let status = 'Not started';
    if (statusStr && STATUS_VALUES.includes(statusStr)) status = statusStr;
    else if (doneStr === 'true' || doneStr === '1' || doneStr === 'yes') status = 'completed';
    out.push({
      id: get('id') || crypto.randomUUID(),
      title: get('title'),
      details: get('details') || undefined,
      due: get('due') || undefined,
      status,
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
  return tasks.filter(t => t.due && t.due < todayStr && t.status !== 'completed');
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
