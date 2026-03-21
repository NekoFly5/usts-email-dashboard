/* ═══════════════════════════════════════════
   Mail Summary — app.js
   ═══════════════════════════════════════════ */

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

const IMPORTANT_KEYWORDS = ['urgent', 'important', 'priorité', 'action requise', 'asap'];

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
        const text = (e.subject + ' ' + (e.body || '')).toLowerCase();
        return IMPORTANT_KEYWORDS.some(k => text.includes(k));
      });
    case 'archive':
      return all.filter(e => e.archived === true);
    case 'corbeille':
      return all.filter(e => e.deleted === true);
    default:
      return all;
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
  filtered = [...viewEmails];
  buildChips(viewEmails);
  renderList(viewEmails);
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

/* ── Filters ───────────────────────────── */

function applyFilters() {
  const kw = document.getElementById('search-input').value.trim().toLowerCase();
  const base = getViewEmails();

  filtered = base.filter(e => {
    const okSender = !activeChip || e.from === activeChip;
    const okKw = !kw
      || e.from.toLowerCase().includes(kw)
      || e.subject.toLowerCase().includes(kw)
      || (e.body || '').toLowerCase().includes(kw);
    return okSender && okKw;
  });

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
  filtered = [...viewEmails];
  renderList(viewEmails);
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
        <span class="row-dot"></span>
      </div>
    `;

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

/* ── Sidebar toggle ────────────────────── */

function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const ovl = document.getElementById('overlay');
  const open = sb.classList.toggle('open');
  ovl.classList.toggle('hidden', !open);
}

/* ── Init ──────────────────────────────── */

async function init() {
  try {
    const res = await fetch('mailstoday.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    all = (data.emails || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    filtered = [...all];

    // Header info
    const dayStr = fmtDayFull(data.date || new Date().toISOString());
    document.getElementById('topbar-date').textContent  = dayStr;
    document.getElementById('sb-date-full').textContent = dayStr;
    document.getElementById('topbar-pill').textContent  =
      `${all.length} email${all.length !== 1 ? 's' : ''}`;
    document.getElementById('nav-count').textContent = all.length;

    // AI summary
    document.getElementById('ai-summary').textContent =
      data.summary || 'Aucun résumé disponible.';

    renderStats(all);
    buildChips(all);
    renderList(all);

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

init();
