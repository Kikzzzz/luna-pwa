// ============================================================
// FASTING MODULE
// ============================================================

let fastingModalType = 'missed'; // 'missed' | 'compensated'

// ── Fetch Fasting Data ──────────────────────────────────────
async function fetchFastingData() {
  const { user } = AppState;
  if (!user) return;

  const { data: ledger } = await db
    .from('fasting_ledger')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false });

  AppState.fastingLedger = ledger || [];
  calcFastingBalance();
  renderFastingView();
  // Update home dashboard counter
  document.getElementById('missed-fasts-display').textContent = AppState.fastingBalance;
  updateFastingRing();
}

// ── Calculate Balance ───────────────────────────────────────
function calcFastingBalance() {
  const missed = AppState.fastingLedger
    .filter(e => e.type === 'missed')
    .reduce((s, e) => s + (e.count || 1), 0);
  const compensated = AppState.fastingLedger
    .filter(e => e.type === 'compensated')
    .reduce((s, e) => s + (e.count || 1), 0);
  AppState.fastingBalance = Math.max(0, missed - compensated);
  return AppState.fastingBalance;
}

// ── Render Fasting View ─────────────────────────────────────
function renderFastingView() {
  const balance = AppState.fastingBalance;

  document.getElementById('fasting-balance-display').textContent = balance;
  document.getElementById('missed-fasts-display').textContent = balance;

  updateFastingRing();

  const list = document.getElementById('fasting-log-list');
  const entries = AppState.fastingLedger;

  if (!entries.length) {
    list.innerHTML = '<div class="empty-state">No fasting entries yet</div>';
    return;
  }

  list.innerHTML = entries.map(e => `
    <div class="fasting-log-item">
      <span class="fasting-type-badge type-${e.type}">${e.type}</span>
      <span class="fasting-log-date">${formatDate(e.date)}</span>
      <span class="fasting-log-reason">${e.reason || ''}</span>
      <button class="icon-btn delete-fasting-btn" data-id="${e.id}" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
        </svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.delete-fasting-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteFastingEntry(btn.dataset.id));
  });
}

// ── Ring Visual ─────────────────────────────────────────────
function updateFastingRing() {
  const ring = document.querySelector('.fasting-counter-ring');
  if (!ring) return;
  const balance = AppState.fastingBalance;
  const total = Math.max(balance, 10);
  const pct = balance / total;
  const deg = Math.round(pct * 360);
  ring.style.background = balance === 0
    ? `conic-gradient(var(--teal) 360deg, rgba(255,255,255,0.04) 360deg)`
    : `conic-gradient(var(--rose) ${deg}deg, rgba(255,255,255,0.04) ${deg}deg)`;
  ring.style.borderColor = balance === 0
    ? 'rgba(94,196,182,0.4)'
    : 'rgba(232,112,138,0.25)';
  ring.style.boxShadow = balance === 0
    ? '0 0 40px rgba(94,196,182,0.2), inset 0 0 40px rgba(94,196,182,0.05)'
    : '0 0 40px var(--rose-glow), inset 0 0 40px rgba(232,112,138,0.05)';
}

// ── Open Fasting Modal ──────────────────────────────────────
function openFastingModal(type) {
  fastingModalType = type;
  const title = type === 'missed' ? 'Add Missed Fast' : 'Mark Compensated';
  document.getElementById('fasting-modal-title').textContent = title;
  document.getElementById('fasting-date').value = todayStr();
  document.getElementById('fasting-reason').value = '';
  document.getElementById('fasting-modal-overlay').classList.add('open');
}

function closeFastingModal() {
  document.getElementById('fasting-modal-overlay').classList.remove('open');
}

// ── Save Fasting Entry ──────────────────────────────────────
async function saveFastingEntry() {
  const { user } = AppState;
  if (!user) return;

  const date   = document.getElementById('fasting-date').value;
  const reason = document.getElementById('fasting-reason').value.trim();

  if (!date) { showToast('Please select a date'); return; }

  const btn = document.getElementById('fasting-save-btn');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  const { error } = await db.from('fasting_ledger').insert({
    user_id: user.id,
    date,
    type: fastingModalType,
    reason,
    count: 1,
  });

  btn.textContent = 'Save';
  btn.disabled = false;

  if (error) {
    showToast('Error saving: ' + error.message);
    return;
  }

  closeFastingModal();
  await fetchFastingData();
  showToast(fastingModalType === 'missed' ? 'Missed fast recorded' : 'Compensation recorded ✓');
}

// ── Delete Entry ────────────────────────────────────────────
async function deleteFastingEntry(id) {
  const { error } = await db
    .from('fasting_ledger')
    .delete()
    .eq('id', id)
    .eq('user_id', AppState.user.id);

  if (!error) {
    await fetchFastingData();
    showToast('Entry deleted');
  }
}

// ── Event Listeners ─────────────────────────────────────────
function initFastingListeners() {
  document.getElementById('add-missed-btn')
    .addEventListener('click', () => openFastingModal('missed'));
  document.getElementById('add-compensated-btn')
    .addEventListener('click', () => openFastingModal('compensated'));
  document.getElementById('fasting-modal-close')
    .addEventListener('click', closeFastingModal);
  document.getElementById('fasting-cancel-btn')
    .addEventListener('click', closeFastingModal);
  document.getElementById('fasting-save-btn')
    .addEventListener('click', saveFastingEntry);

  // Close on backdrop click
  document.getElementById('fasting-modal-overlay')
    .addEventListener('click', e => {
      if (e.target === e.currentTarget) closeFastingModal();
    });
}
