/* ═══════════════════════════════════════════
   Mail Summary — app.js
   ═══════════════════════════════════════════ */

/* ════════════════════════════════════════════
   CONFIG — Gmail OAuth2
   Créer un Client ID sur console.cloud.google.com :
     APIs & Services > Identifiants > ID client OAuth 2.0 (Application Web)
     Origines JS autorisées : http://localhost:5500
                              https://nekofly5.github.io
   Laisser vide pour utiliser mailstoday.json
   ════════════════════════════════════════════ */
const GMAIL_CLIENT_ID = '297850515689-89eknec1jr55p7vor9lduhlntpmhlre1.apps.googleusercontent.com';

const PALETTE = [
  '#6366f1','#8b5cf6','#a855f7','#ec4899',
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#0ea5e9','#06b6d4',
];

let all = [];
let filtered = [];
let activeChip = null;
let openId = null;
let currentView = 'aujourdhui';
let currentSort = 'date-desc';

const SORT_OPTIONS = [
  { value: 'date-desc',   label: 'Plus récent' },
  { value: 'date-asc',    label: 'Plus ancien' },
  { value: 'sender-asc',  label: 'Exp. A–Z' },
  { value: 'subject-asc', label: 'Objet A–Z' },
];

const IMPORTANT_KEYWORDS = ['urgent', 'important', 'priorité', 'action requise', 'asap'];

const emailState = {};
function getState(id) { return emailState[id] || {}; }
function setState(id, patch) { emailState[id] = { ...getState(id), ...patch }; }

/* ── Utils ─────────────────────────────── */

const esc = s =>
  (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(email) {
  const local = email.split('@')[0];
  const parts = local.split(/[._\-+]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function fmtShortTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtLong(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
       + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDayFull(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/* ── Views ──────────────────────────────── */

function getViewEmails() {
  switch (currentView) {
    case 'importants':
      return all.filter(e => {
        const s = getState(e.id);
        if (s.deleted || s.archived) return false;
        if (s.important) return true;
        const text = (e.subject + ' ' + (e.body || '')).toLowerCase();
        return IMPORTANT_KEYWORDS.some(k => text.includes(k));
      });
    case 'archive':
      return all.filter(e => getState(e.id).archived && !getState(e.id).deleted);
    case 'corbeille':
      return all.filter(e => getState(e.id).deleted);
    default:
      return all.filter(e => !getState(e.id).deleted && !getState(e.id).archived);
  }
}

function setView(el, view) {
  currentView = view;

  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');

  const titles = {
    'aujourdhui': "Résumé du jour",
    'tous':       "Tous les mails",
    'importants': "Importants",
    'archive':    "Archive",
    'corbeille':  "Corbeille",
  };
  document.querySelector('.topbar-title').textContent = titles[view] || view;

  const showMeta = view === 'aujourdhui';
  document.getElementById('stats-strip').style.display   = showMeta ? '' : 'none';
  document.querySelector('.summary-block').style.display = showMeta ? '' : 'none';

  activeChip = null;
  document.getElementById('search-input').value = '';
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  document.getElementById('filter-info').textContent = '';
  document.getElementById('reset-btn').classList.add('hidden');

  closeDetail();

  const viewEmails = getViewEmails();
  filtered = sortEmails(viewEmails);
  buildChips(viewEmails);
  renderList(filtered);
}

/* ── Context menu ───────────────────────── */

function refreshView() {
  if (openId && !getViewEmails().some(e => e.id === openId)) closeDetail();
  buildChips(getViewEmails());
  applyFilters();
}

let toastTimeout = null;

function showToast(message, undoFn) {
  const existing = document.getElementById('toast');
  if (existing) { clearTimeout(toastTimeout); existing.remove(); }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.id = 'toast';
  toast.innerHTML = `<span class="toast-msg">${esc(message)}</span><button class="toast-undo">Annuler</button>`;

  toast.querySelector('.toast-undo').addEventListener('click', () => {
    clearTimeout(toastTimeout);
    undoFn();
    refreshView();
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 200);
  });

  document.body.appendChild(toast);

  toastTimeout = setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

function closeContextMenu() {
  const m = document.getElementById('ctx-menu');
  if (m) m.remove();
}

function showContextMenuById(id, event) {
  event.stopPropagation();
  const email = all.find(e => e.id === id);
  if (email) showContextMenu(email, event);
}

function showContextMenu(email, event) {
  closeContextMenu();
  event.stopPropagation();

  const s = getState(email.id);

  const iStar    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="${s.important ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  const iArchive = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;
  const iTrash   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  const iRestore = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;

  const items = [
    {
      label:  s.important ? 'Retirer des importants' : 'Marquer comme important',
      icon:   iStar,
      cls:    s.important ? 'active-state' : '',
      action: () => setState(email.id, { important: !s.important }),
    },
    {
      label:  s.archived ? 'Désarchiver' : 'Archiver',
      icon:   iArchive,
      cls:    s.archived ? 'active-state' : '',
      action: () => {
        const prev = { ...getState(email.id) };
        setState(email.id, { archived: !s.archived, deleted: false });
        showToast(s.archived ? 'Email désarchivé' : 'Email archivé', () => { emailState[email.id] = prev; });
      },
    },
    'sep',
    {
      label:  s.deleted ? 'Restaurer' : 'Mettre à la corbeille',
      icon:   s.deleted ? iRestore : iTrash,
      cls:    s.deleted ? '' : 'danger',
      action: () => {
        const prev = { ...getState(email.id) };
        setState(email.id, { deleted: !s.deleted, archived: false });
        showToast(s.deleted ? 'Email restauré' : 'Déplacé dans la corbeille', () => { emailState[email.id] = prev; });
      },
    },
  ];

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.id = 'ctx-menu';

  items.forEach(item => {
    if (item === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'ctx-separator';
      menu.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = 'ctx-item' + (item.cls ? ' ' + item.cls : '');
    el.innerHTML = item.icon + `<span>${esc(item.label)}</span>`;
    el.addEventListener('click', e => {
      e.stopPropagation();
      item.action();
      closeContextMenu();
      refreshView();
    });
    menu.appendChild(el);
  });

  document.body.appendChild(menu);
  menu.style.left = event.clientX + 'px';
  menu.style.top  = event.clientY + 'px';

  const rect = menu.getBoundingClientRect();
  if (rect.right  > window.innerWidth  - 8) menu.style.left = (event.clientX - rect.width)  + 'px';
  if (rect.bottom > window.innerHeight - 8) menu.style.top  = (event.clientY - rect.height) + 'px';

  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeContextMenu(); }, { once: true });
  }, 0);
}

/* ── Stats strip ───────────────────────── */

function renderStats(emails) {
  const strip = document.getElementById('stats-strip');
  const senders = new Set(emails.map(e => e.from));

  // Most frequent sender
  const freq = {};
  emails.forEach(e => { freq[e.from] = (freq[e.from] || 0) + 1; });
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];

  strip.innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Emails reçus</span>
      <span class="stat-value">${emails.length}</span>
      <span class="stat-sub">aujourd'hui</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Expéditeurs</span>
      <span class="stat-value">${senders.size}</span>
      <span class="stat-sub">uniques</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Plus actif</span>
      <span class="stat-value" style="font-size:14px;letter-spacing:0;padding-top:4px">${
        top ? esc(top[0].split('@')[0]) : '—'
      }</span>
      <span class="stat-sub">${top ? top[1] + ' message' + (top[1] > 1 ? 's' : '') : ''}</span>
    </div>
  `;
}

/* ── Chips ─────────────────────────────── */

function buildChips(emails) {
  const wrap = document.getElementById('filter-chips');
  const senders = [...new Set(emails.map(e => e.from))].sort();
  wrap.innerHTML = '';
  document.getElementById('filter-sep')?.classList.toggle('hidden', senders.length === 0);
  senders.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = s.split('@')[0];
    btn.title = s;
    btn.onclick = () => {
      activeChip = activeChip === s ? null : s;
      wrap.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      if (activeChip) btn.classList.add('active');
      applyFilters();
    };
    wrap.appendChild(btn);
  });
}

/* ── Filters & sort ────────────────────── */

function sortEmails(emails) {
  const arr = [...emails];
  switch (currentSort) {
    case 'date-asc':    return arr.sort((a, b) => new Date(a.date) - new Date(b.date));
    case 'sender-asc':  return arr.sort((a, b) => a.from.localeCompare(b.from, 'fr'));
    case 'subject-asc': return arr.sort((a, b) => a.subject.localeCompare(b.subject, 'fr'));
    default:            return arr.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
}

function buildSortChips() {
  const wrap = document.getElementById('sort-chips');
  wrap.innerHTML = '';
  SORT_OPTIONS.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'sort-chip' + (currentSort === opt.value ? ' active' : '');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      currentSort = opt.value;
      wrap.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
    wrap.appendChild(btn);
  });
}

function applyFilters() {
  const kw = document.getElementById('search-input').value.trim().toLowerCase();
  const base = getViewEmails();

  filtered = sortEmails(base.filter(e => {
    const okSender = !activeChip || e.from === activeChip;
    const okKw = !kw
      || e.from.toLowerCase().includes(kw)
      || e.subject.toLowerCase().includes(kw)
      || (e.body || '').toLowerCase().includes(kw);
    return okSender && okKw;
  }));

  renderList(filtered);

  const info = document.getElementById('filter-info');
  const btn  = document.getElementById('reset-btn');
  const active = kw || activeChip;

  btn.classList.toggle('hidden', !active);

  if (!active) { info.textContent = ''; return; }
  const parts = [];
  if (kw) parts.push(`"${kw}"`);
  if (activeChip) parts.push(activeChip.split('@')[0]);
  info.textContent = `${filtered.length} résultat${filtered.length !== 1 ? 's' : ''} — ${parts.join(', ')}`;
}

function resetFilters() {
  document.getElementById('search-input').value = '';
  activeChip = null;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  const viewEmails = getViewEmails();
  filtered = sortEmails(viewEmails);
  renderList(filtered);
  document.getElementById('filter-info').textContent = '';
  document.getElementById('reset-btn').classList.add('hidden');
}

/* ── Email list ────────────────────────── */

function renderList(emails) {
  const list  = document.getElementById('email-list');
  const empty = document.getElementById('no-results');

  list.innerHTML = '';

  if (emails.length === 0) {
    empty.classList.remove('hidden');
    const emptyMsgs = {
      archive:    'Aucun email archivé',
      corbeille:  'La corbeille est vide',
      importants: 'Aucun email important',
    };
    document.getElementById('no-results-text').textContent =
      emptyMsgs[currentView] || 'Aucun résultat';
    return;
  }
  empty.classList.add('hidden');

  emails.forEach(email => {
    const row   = document.createElement('div');
    const color = hashColor(email.from);
    const init  = initials(email.from);
    const preview = (email.body || '').substring(0, 90);

    row.className = 'email-row unread';
    row.dataset.id = email.id;
    if (email.id === openId) row.classList.add('active');

    row.innerHTML = `
      <div class="row-avatar" style="background:${color}">${esc(init)}</div>
      <div class="row-body">
        <div class="row-from">${esc(email.from)}</div>
        <div class="row-subject">${esc(email.subject)}</div>
        <div class="row-preview">${esc(preview)}</div>
      </div>
      <div class="row-meta">
        <span class="row-time">${fmtShortTime(email.date)}</span>
        ${getState(email.id).important ? '<svg class="row-star" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' : ''}
        <span class="row-dot"></span>
        <button class="row-menu-btn" onclick="showContextMenuById('${email.id}',event)" title="Actions">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
        </button>
      </div>
    `;

    row.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(email, e); });
    row.addEventListener('click', () => openEmail(email));
    list.appendChild(row);
  });
}

/* ── Detail panel ──────────────────────── */

function openEmail(email) {
  openId = email.id;

  // Update row states
  document.querySelectorAll('.email-row').forEach(r => {
    r.classList.remove('active');
    if (r.dataset.id === email.id) {
      r.classList.add('active');
      r.classList.remove('unread');
      const dot = r.querySelector('.row-dot');
      if (dot) dot.style.display = 'none';
    }
  });

  const color = hashColor(email.from);
  const init  = initials(email.from);

  document.getElementById('detail-subject').textContent  = email.subject;
  document.getElementById('detail-from').textContent     = email.from;
  document.getElementById('detail-when').textContent     = fmtLong(email.date);
  document.getElementById('detail-message').textContent  = email.body || '';

  const av = document.getElementById('detail-avatar');
  av.textContent = init;
  av.style.background = color;

  document.getElementById('detail-placeholder').classList.add('hidden');
  document.getElementById('detail-body').classList.remove('hidden');

  // On tablet/mobile: show detail over content
  const panel = document.querySelector('.detail');
  panel.style.display = 'flex';
}

function closeDetail() {
  openId = null;
  document.querySelectorAll('.email-row').forEach(r => r.classList.remove('active'));
  document.getElementById('detail-placeholder').classList.remove('hidden');
  document.getElementById('detail-body').classList.add('hidden');
}

/* ── Theme ─────────────────────────────── */

const MOON_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const SUN_ICON  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

function updateThemeBtn(theme) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = theme === 'dark';
  btn.innerHTML = isDark ? SUN_ICON : MOON_ICON;
  btn.title = isDark ? 'Passer en mode clair' : 'Passer en mode sombre';
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeBtn(next);
}

/* ── Sidebar toggle ────────────────────── */

function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const ovl = document.getElementById('overlay');
  const open = sb.classList.toggle('open');
  ovl.classList.toggle('hidden', !open);
}

function toggleSidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const layout  = document.querySelector('.layout');
  const collapsed = sidebar.classList.toggle('collapsed');
  layout.classList.toggle('sb-collapsed', collapsed);
  localStorage.setItem('sb-collapsed', collapsed ? '1' : '0');
}

/* ── Gmail API ─────────────────────────── */

let _gapiReady = false;
let _gisReady  = false;
let _tokenClient;

function gapiLoaded() { _gapiReady = true; }
function gisLoaded()  { _gisReady  = true; }

function waitForGApis() {
  return new Promise(resolve => {
    const t = setInterval(() => {
      if (_gapiReady && _gisReady) { clearInterval(t); resolve(); }
    }, 30);
  });
}

function initGmailAuth() {
  gapi.load('client', async () => {
    await gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'],
    });

    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GMAIL_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      callback: async resp => {
        if (resp.error) { console.error(resp); return; }
        document.getElementById('auth-wall').classList.add('hidden');
        document.getElementById('sb-signout').classList.remove('hidden');
        document.getElementById('email-list').innerHTML =
          '<div class="list-loading"><div class="spinner"></div>Chargement des emails…</div>';
        await loadFromGmail();
      },
    });

    document.getElementById('auth-wall').classList.remove('hidden');
    document.getElementById('email-list').innerHTML = '';
    document.getElementById('ai-summary').textContent = 'En attente de connexion…';
    document.getElementById('auth-btn').addEventListener('click', () =>
      _tokenClient.requestAccessToken({ prompt: 'consent' })
    );
  });
}

function signOut() {
  const token = gapi.client.getToken();
  if (token) google.accounts.oauth2.revoke(token.access_token, () => {});
  gapi.client.setToken(null);
  all = []; filtered = []; openId = null;
  document.getElementById('sb-signout').classList.add('hidden');
  document.getElementById('auth-wall').classList.remove('hidden');
  document.getElementById('email-list').innerHTML = '';
  document.getElementById('ai-summary').textContent = 'En attente de connexion…';
  document.getElementById('stats-strip').innerHTML = '';
  document.getElementById('filter-chips').innerHTML = '';
  document.getElementById('sort-chips').innerHTML = '';
  document.getElementById('topbar-pill').textContent = '';
  closeDetail();
}

async function loadFromGmail() {
  try {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');

    const listRes = await gapi.client.gmail.users.messages.list({
      userId: 'me',
      q: `after:${y}/${m}/${d}`,
      maxResults: 50,
    });

    const msgs = listRes.result.messages || [];
    const emails = (await Promise.all(
      msgs.map(msg =>
        gapi.client.gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
          .then(r => parseGmailMsg(r.result))
      )
    )).filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date));

    populateUI(emails, `${y}-${m}-${d}`, autoSummary(emails));
  } catch (err) {
    console.error(err);
    document.getElementById('email-list').innerHTML = `
      <div style="padding:28px 0;text-align:center;font-size:13px;color:#ef4444;">
        Erreur Gmail<br>
        <span style="color:#a1a1aa;font-size:12px;">${esc(String(err.message || err))}</span>
      </div>`;
  }
}

function parseGmailMsg(msg) {
  try {
    const hdr = msg.payload.headers || [];
    const h   = name => hdr.find(x => x.name.toLowerCase() === name)?.value || '';
    const fromRaw = h('from');
    return {
      id:      msg.id,
      from:    fromRaw.match(/<(.+)>/)?.[1] || fromRaw,
      subject: h('subject') || '(Sans objet)',
      date:    new Date(h('date')).toISOString(),
      body:    extractTextBody(msg.payload).replace(/\s+/g, ' ').trim().slice(0, 400),
    };
  } catch { return null; }
}

function b64ToUtf8(b64) {
  const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function extractTextBody(payload) {
  if (payload.mimeType === 'text/plain' && payload.body?.data)
    return b64ToUtf8(payload.body.data);
  for (const part of payload.parts || []) {
    const txt = extractTextBody(part);
    if (txt) return txt;
  }
  return '';
}

function autoSummary(emails) {
  if (!emails.length) return "Aucun email reçu aujourd'hui.";
  const senders = new Set(emails.map(e => e.from)).size;
  const urgent  = emails.filter(e =>
    IMPORTANT_KEYWORDS.some(k => (e.subject + ' ' + e.body).toLowerCase().includes(k))
  ).length;
  let s = `${emails.length} email${emails.length > 1 ? 's' : ''} reçu${emails.length > 1 ? 's' : ''} aujourd'hui, de ${senders} expéditeur${senders > 1 ? 's' : ''} différent${senders > 1 ? 's' : ''}.`;
  if (urgent) s += ` ${urgent} message${urgent > 1 ? 's semblent' : ' semble'} urgent${urgent > 1 ? 's' : ''}.`;
  return s;
}

/* ── Init ──────────────────────────────── */

function populateUI(emails, dateStr, summary) {
  all = emails;
  filtered = sortEmails([...all]);

  const [y, m, d] = dateStr.split('-');
  const dayStr = new Date(+y, +m - 1, +d).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  document.getElementById('topbar-date').textContent  = dayStr;
  document.getElementById('sb-date-full').textContent = dayStr;
  document.getElementById('topbar-pill').textContent  = `${all.length} email${all.length !== 1 ? 's' : ''}`;
  document.getElementById('nav-count').textContent    = all.length;
  document.getElementById('ai-summary').textContent   = summary || 'Aucun résumé disponible.';

  renderStats(all);
  buildChips(all);
  buildSortChips();
  renderList(filtered);
}

async function loadFromJson() {
  try {
    const res = await fetch('mailstoday.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const emails = (data.emails || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    const dateStr = data.date || new Date().toISOString().split('T')[0];
    populateUI(emails, dateStr, data.summary);
  } catch (err) {
    console.error(err);
    document.getElementById('email-list').innerHTML = `
      <div style="padding:28px 0;text-align:center;font-size:13px;color:#ef4444;">
        Impossible de charger mailstoday.json<br>
        <span style="color:#a1a1aa;font-size:12px;">Utilisez un serveur HTTP local (ex: Live Server)</span>
      </div>`;
    document.getElementById('ai-summary').textContent = 'Données non disponibles.';
  }
}

async function init() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeBtn(savedTheme);

  if (localStorage.getItem('sb-collapsed') === '1') {
    document.getElementById('sidebar').classList.add('collapsed');
    document.querySelector('.layout').classList.add('sb-collapsed');
  }

  if (GMAIL_CLIENT_ID) {
    await waitForGApis();
    initGmailAuth();
  } else {
    await loadFromJson();
  }
}

init();
