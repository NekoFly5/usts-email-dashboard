/* ── Mail Summary – app.js ── */

const AVATAR_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f59e0b','#10b981','#3b82f6','#06b6d4',
];

let allEmails = [];
let filteredEmails = [];
let activeChip = null;
let selectedId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function avatarColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(email) {
  const name = email.split('@')[0];
  const parts = name.split(/[._\-+]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

function fmtFull(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })
    + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── Render chips ──────────────────────────────────────────────────────────────

function buildChips(emails) {
  const senders = [...new Set(emails.map(e => e.from))].sort();
  const wrap = document.getElementById('filter-chips');
  wrap.innerHTML = '';
  senders.forEach(sender => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = sender.split('@')[0];
    btn.title = sender;
    btn.onclick = () => toggleChip(btn, sender);
    wrap.appendChild(btn);
  });
}

function toggleChip(btn, sender) {
  const chips = document.querySelectorAll('.chip');
  if (activeChip === sender) {
    activeChip = null;
    chips.forEach(c => c.classList.remove('active'));
  } else {
    activeChip = sender;
    chips.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
  }
  applyFilters();
}

// ── Filters ───────────────────────────────────────────────────────────────────

function applyFilters() {
  const kw = document.getElementById('search-input').value.trim().toLowerCase();
  const resetBtn = document.getElementById('reset-btn');

  filteredEmails = allEmails.filter(e => {
    const matchSender = !activeChip || e.from === activeChip;
    const matchKw = !kw
      || e.from.toLowerCase().includes(kw)
      || e.subject.toLowerCase().includes(kw)
      || (e.body || '').toLowerCase().includes(kw);
    return matchSender && matchKw;
  });

  renderList(filteredEmails);
  updateFilterInfo(kw);

  const hasFilter = kw || activeChip;
  resetBtn.classList.toggle('hidden', !hasFilter);
}

function updateFilterInfo(kw) {
  const info = document.getElementById('filter-info');
  const shown = filteredEmails.length;
  const total = allEmails.length;
  if (!kw && !activeChip) { info.textContent = ''; return; }
  const parts = [];
  if (kw) parts.push(`"${kw}"`);
  if (activeChip) parts.push(activeChip.split('@')[0]);
  info.textContent = `${shown} résultat${shown !== 1 ? 's' : ''} sur ${total} — ${parts.join(', ')}`;
}

function resetFilters() {
  document.getElementById('search-input').value = '';
  activeChip = null;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  filteredEmails = [...allEmails];
  renderList(filteredEmails);
  document.getElementById('filter-info').textContent = '';
  document.getElementById('reset-btn').classList.add('hidden');
}

// ── Render email list ─────────────────────────────────────────────────────────

function renderList(emails) {
  const list = document.getElementById('email-list');
  const empty = document.getElementById('no-results');
  list.innerHTML = '';

  if (emails.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  emails.forEach(email => {
    const row = document.createElement('div');
    row.className = 'email-row unread';
    row.dataset.id = email.id;
    if (email.id === selectedId) row.classList.add('selected');

    const color = avatarColor(email.from);
    const init = initials(email.from);
    const preview = (email.body || '').substring(0, 100);

    row.innerHTML = `
      <div class="avatar" style="background:${color}">${esc(init)}</div>
      <div class="row-content">
        <div class="row-from">${esc(email.from)}</div>
        <div class="row-subject">${esc(email.subject)}</div>
        <div class="row-preview">${esc(preview)}</div>
      </div>
      <div class="row-meta">
        <span class="row-time">${fmtTime(email.date)}</span>
      </div>
    `;

    row.addEventListener('click', () => openEmail(email));
    list.appendChild(row);
  });
}

// ── Reading pane ──────────────────────────────────────────────────────────────

function openEmail(email) {
  selectedId = email.id;

  // Mark row as selected + read
  document.querySelectorAll('.email-row').forEach(r => {
    r.classList.remove('selected');
    if (r.dataset.id === email.id) {
      r.classList.add('selected');
      r.classList.remove('unread');
    }
  });

  const color = avatarColor(email.from);
  const init = initials(email.from);

  document.getElementById('reading-subject').textContent = email.subject;
  document.getElementById('reading-from').textContent = email.from;
  document.getElementById('reading-date').textContent = fmtFull(email.date);
  document.getElementById('reading-body').textContent = email.body || '';

  const avatar = document.getElementById('reading-avatar');
  avatar.textContent = init;
  avatar.style.background = color;

  document.getElementById('reading-empty').classList.add('hidden');
  document.getElementById('reading-content').classList.remove('hidden');

  // On mobile: show reading pane
  const pane = document.querySelector('.reading-pane');
  pane.style.display = 'flex';
}

function closeReading() {
  selectedId = null;
  document.querySelectorAll('.email-row').forEach(r => r.classList.remove('selected'));
  document.getElementById('reading-empty').classList.remove('hidden');
  document.getElementById('reading-content').classList.add('hidden');
}

// ── Sidebar toggle (mobile) ───────────────────────────────────────────────────

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
}

// ── Load data ─────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('mailstoday.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allEmails = (data.emails || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    filteredEmails = [...allEmails];

    // Header / sidebar
    const dateStr = fmtDate(data.date || new Date().toISOString());
    document.getElementById('topbar-date').textContent = dateStr;
    document.getElementById('sidebar-date').textContent = dateStr;
    document.getElementById('topbar-count').textContent =
      `${allEmails.length} email${allEmails.length !== 1 ? 's' : ''}`;
    document.getElementById('nav-count').textContent = allEmails.length;

    // AI summary
    document.getElementById('ai-summary').textContent =
      data.summary || 'Aucun résumé disponible.';

    buildChips(allEmails);
    renderList(allEmails);
  } catch (err) {
    console.error(err);
    document.getElementById('email-list').innerHTML = `
      <div style="padding:32px;text-align:center;color:#ef4444;font-size:13px;">
        Impossible de charger mailstoday.json.<br>
        <span style="color:#9ca3af;font-size:12px;">Servez la page via un serveur HTTP local.</span>
      </div>
    `;
    document.getElementById('ai-summary').textContent = 'Données non disponibles.';
  }
}

init();
