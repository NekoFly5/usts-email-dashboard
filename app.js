/* ── Email Dashboard – app.js ── */

let allEmails = [];
let filteredEmails = [];

// Format date to French locale
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// Format time only
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Format date + time together
function formatDateTime(isoString) {
  return `${formatDate(isoString)} à ${formatTime(isoString)}`;
}

// Short format for email cards
function formatShortDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Populate sender filter dropdown with unique senders
function populateSenderFilter(emails) {
  const select = document.getElementById('sender-filter');
  const senders = [...new Set(emails.map(e => e.from))].sort();
  senders.forEach(sender => {
    const option = document.createElement('option');
    option.value = sender;
    option.textContent = sender;
    select.appendChild(option);
  });
}

// Build one email card element
function createEmailCard(email) {
  const card = document.createElement('div');
  card.className = 'email-card';
  card.dataset.id = email.id;

  const preview = email.body
    ? email.body.substring(0, 120) + (email.body.length > 120 ? '…' : '')
    : '';

  card.innerHTML = `
    <span class="email-from">${escapeHtml(email.from)}</span>
    <span class="email-date">${formatShortDateTime(email.date)}</span>
    <span class="email-subject">${escapeHtml(email.subject)}</span>
    <span class="email-preview">${escapeHtml(preview)}</span>
    <div class="email-body">${escapeHtml(email.body || '')}</div>
  `;

  // Toggle expanded state on click
  card.addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  return card;
}

// Render the filtered email list
function renderEmails(emails) {
  const list = document.getElementById('email-list');
  const noResults = document.getElementById('no-results');

  list.innerHTML = '';

  if (emails.length === 0) {
    noResults.classList.remove('hidden');
    return;
  }

  noResults.classList.add('hidden');
  emails.forEach(email => list.appendChild(createEmailCard(email)));
}

// Apply search + sender filters
function applyFilters() {
  const keyword = document.getElementById('search-input').value.trim().toLowerCase();
  const sender = document.getElementById('sender-filter').value;

  filteredEmails = allEmails.filter(email => {
    const matchSender = !sender || email.from === sender;
    const matchKeyword =
      !keyword ||
      email.from.toLowerCase().includes(keyword) ||
      email.subject.toLowerCase().includes(keyword) ||
      (email.body && email.body.toLowerCase().includes(keyword));
    return matchSender && matchKeyword;
  });

  renderEmails(filteredEmails);
  updateFilterInfo(keyword, sender);
}

// Show filter status info
function updateFilterInfo(keyword, sender) {
  const info = document.getElementById('filter-info');
  const total = allEmails.length;
  const shown = filteredEmails.length;

  if (!keyword && !sender) {
    info.textContent = '';
    return;
  }

  const parts = [];
  if (keyword) parts.push(`mot-clé "${keyword}"`);
  if (sender) parts.push(`expéditeur "${sender}"`);

  info.textContent = `${shown} email${shown !== 1 ? 's' : ''} sur ${total} · Filtre : ${parts.join(', ')}`;
}

// Reset all filters
function resetFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('sender-filter').value = '';
  filteredEmails = [...allEmails];
  renderEmails(filteredEmails);
  updateFilterInfo('', '');
}

// XSS prevention
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Load data from mailstoday.json
async function loadEmails() {
  try {
    const res = await fetch('mailstoday.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Sort by date descending (most recent first)
    allEmails = (data.emails || []).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    filteredEmails = [...allEmails];

    // Update header
    document.getElementById('date-display').textContent = formatDate(
      data.date || new Date().toISOString()
    );
    document.getElementById('email-count').textContent =
      `${allEmails.length} email${allEmails.length !== 1 ? 's' : ''} aujourd'hui`;

    // AI summary
    const summaryEl = document.getElementById('ai-summary');
    summaryEl.textContent = data.summary || 'Aucun résumé disponible.';

    // Footer date
    document.getElementById('footer-date').textContent = new Date().toLocaleString('fr-FR');

    // Populate filters & render
    populateSenderFilter(allEmails);
    renderEmails(allEmails);
  } catch (err) {
    console.error('Erreur lors du chargement:', err);
    document.getElementById('email-list').innerHTML = `
      <div class="card" style="text-align:center;padding:32px;color:#dc2626;">
        <p>⚠️ Impossible de charger les emails.</p>
        <p style="font-size:.85rem;margin-top:8px;color:#64748b;">Vérifiez que <code>mailstoday.json</code> est présent et que la page est servie via un serveur HTTP.</p>
      </div>
    `;
    document.getElementById('ai-summary').textContent = 'Données non disponibles.';
  }
}

// Init
loadEmails();
