// ============================================================
// LUNA APP — MAIN ORCHESTRATOR
// ============================================================

// ── State ────────────────────────────────────────────────────
let currentLogDate = null;
let padCount = 0;
let selectedMood = null;
let selectedSymptoms = new Set();
let currentView = 'home';

// ── Startup ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  generateStars();
  showLoadingOverlay(true);
  initAuthListeners();
  initNavListeners();
  initModalListeners();
  initFastingListeners();
  initCalendarListeners();
  initSettingsListeners();
  initNotifications();
  initOfflineDetection();
  registerServiceWorker();
  initInstallPrompt();

  // Check auth
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    await onSignIn(session.user);
  } else {
    showLoadingOverlay(false);
  }

  // Listen for auth changes (handles cross-device sync)
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      await onSignIn(session.user);
    } else if (event === 'SIGNED_OUT') {
      onSignOut();
    }
  });

  // Handle URL params (from manifest shortcuts)
  handleUrlParams();
});

// ── Auth ─────────────────────────────────────────────────────
async function onSignIn(user) {
  AppState.user = user;
  showLoadingOverlay(true);
  showScreen('app');
  await fetchAllData();
  populateSettings();
  subscribeRealtime();
  showLoadingOverlay(false);
  showToast('Welcome back ✨');
  handleUrlParams();
}

function onSignOut() {
  AppState.user = null;
  AppState.profile = null;
  AppState.dailyLogs = [];
  AppState.fastingLedger = [];
  AppState.fastingBalance = 0;
  unsubscribeRealtime();
  // Reset any displayed values
  const els = ['cycle-day-display','missed-fasts-display','next-period-display',
                'ovulation-display','cycle-avg-display','fasting-balance-display'];
  els.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '–'; });
  showScreen('auth');
}

function initAuthListeners() {
  // Tabs
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
    });
  });

  // Sign In
  document.getElementById('signin-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;
    const errEl    = document.getElementById('signin-error');
    const btn      = e.currentTarget.querySelector('button[type="submit"]');
    errEl.textContent = '';
    btn.textContent = 'Signing in…';
    btn.classList.add('loading');
    btn.disabled = true;

    const { error } = await db.auth.signInWithPassword({ email, password });

    btn.textContent = 'Enter Luna';
    btn.classList.remove('loading');
    btn.disabled = false;

    if (error) errEl.textContent = error.message;
  });

  // Sign Up
  document.getElementById('signup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email       = document.getElementById('signup-email').value.trim();
    const password    = document.getElementById('signup-password').value;
    const cycleAvg    = parseInt(document.getElementById('cycle-avg').value) || 28;
    const periodLen   = parseInt(document.getElementById('period-length').value) || 5;
    const lastPeriod  = document.getElementById('last-period').value;
    const errEl       = document.getElementById('signup-error');
    const btn         = e.currentTarget.querySelector('button[type="submit"]');
    errEl.textContent = '';

    if (password.length < 8) {
      errEl.textContent = 'Password must be at least 8 characters';
      return;
    }

    btn.textContent = 'Creating account…';
    btn.classList.add('loading');
    btn.disabled = true;

    const { data, error } = await db.auth.signUp({ email, password });

    btn.textContent = 'Begin Journey';
    btn.classList.remove('loading');
    btn.disabled = false;

    if (error) { errEl.textContent = error.message; return; }

    // Create profile
    if (data.user) {
      await db.from('profiles').upsert({
        id:               data.user.id,
        cycle_avg:        cycleAvg,
        period_length:    periodLen,
        last_period_date: lastPeriod || null,
      });
      errEl.style.color = 'var(--teal)';
      errEl.textContent = '✓ Account created! Check your email to confirm.';
    }
  });

  // Sign Out
  document.getElementById('signout-btn').addEventListener('click', async () => {
    await db.auth.signOut();
  });
}

// ── Data Fetching ─────────────────────────────────────────────
async function fetchAllData() {
  await Promise.all([
    fetchProfile(),
    fetchDailyLogs(),
    fetchFastingData(),
  ]);
  updateHomeDashboard();
  renderCalendar();
  renderTodayPreview();
}

async function fetchProfile() {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', AppState.user.id)
    .single();

  if (error && error.code === 'PGRST116') {
    // No profile row yet — create default
    const { data: newProfile } = await db.from('profiles').upsert({
      id: AppState.user.id,
      cycle_avg: 28,
      period_length: 5,
      last_period_date: null,
    }).select().single();
    AppState.profile = newProfile;
  } else {
    AppState.profile = data;
  }
}

async function fetchDailyLogs() {
  const { data } = await db
    .from('daily_logs')
    .select('*')
    .eq('user_id', AppState.user.id)
    .order('date', { ascending: false })
    .limit(120);
  AppState.dailyLogs = data || [];
}

// ── Realtime Subscriptions ────────────────────────────────────
function subscribeRealtime() {
  const userId = AppState.user.id;

  const logSub = db
    .channel('daily_logs_changes')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'daily_logs',
      filter: `user_id=eq.${userId}`,
    }, () => {
      fetchDailyLogs().then(() => {
        updateHomeDashboard();
        renderCalendar();
        renderTodayPreview();
        if (currentView === 'analysis') renderAnalysis();
      });
    })
    .subscribe();

  const fastSub = db
    .channel('fasting_changes')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'fasting_ledger',
      filter: `user_id=eq.${userId}`,
    }, () => {
      fetchFastingData();
    })
    .subscribe();

  AppState.realtimeSubs = [logSub, fastSub];
}

function unsubscribeRealtime() {
  AppState.realtimeSubs.forEach(sub => db.removeChannel(sub));
  AppState.realtimeSubs = [];
}

// ── Navigation ────────────────────────────────────────────────
function initNavListeners() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('active', v.id === `view-${view}`));

  // Lazy render heavy views
  if (view === 'analysis') renderAnalysis();
  if (view === 'calendar') renderCalendar();
  if (view === 'fasting')  renderFastingView();
  if (view === 'settings') { populateSettings(); renderStreakCard(); }
}

// ── Logging Modal ─────────────────────────────────────────────
function initModalListeners() {
  document.getElementById('log-today-btn').addEventListener('click', () => {
    openLogModal(todayStr());
  });

  // Close
  document.getElementById('modal-close-btn').addEventListener('click', closeLogModal);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeLogModal);
  document.getElementById('log-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLogModal();
  });

  // Save
  document.getElementById('modal-save-btn').addEventListener('click', saveLogEntry);

  // Flow slider — 0=none, 1=spotting, 2=light, 3=medium, 4=heavy
  const flowSlider = document.getElementById('flow-slider');
  const flowIndicator = document.getElementById('flow-indicator');
  const flowDisplayLabels = ['No flow today', 'Spotting', 'Light', 'Medium', 'Heavy'];
  const flowColors = ['var(--text-dim)', '#f8d0d8', '#f0a0b0', 'var(--rose)', '#c0284a'];
  flowSlider.addEventListener('input', () => {
    const v = parseInt(flowSlider.value);
    flowIndicator.textContent = flowDisplayLabels[v];
    flowIndicator.style.color = flowColors[v];
    flowIndicator.dataset.level = v === 0 ? 'none' : ['spotting','light','medium','heavy'][v-1];
  });

  // Pad counter
  document.getElementById('pad-increment').addEventListener('click', () => {
    padCount = Math.min(padCount + 1, 30);
    document.getElementById('pad-count-display').textContent = padCount;
  });
  document.getElementById('pad-decrement').addEventListener('click', () => {
    padCount = Math.max(padCount - 1, 0);
    document.getElementById('pad-count-display').textContent = padCount;
  });

  // Mood buttons
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedMood = btn.dataset.mood;
    });
  });

  // Symptom buttons
  document.querySelectorAll('.symptom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      const sym = btn.dataset.symptom;
      if (selectedSymptoms.has(sym)) selectedSymptoms.delete(sym);
      else selectedSymptoms.add(sym);
    });
  });

  // Custom symptom
  document.getElementById('add-custom-symptom-btn').addEventListener('click', addCustomSymptom);
  document.getElementById('custom-symptom-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomSymptom(); }
  });

  // Discharge collapsible
  document.getElementById('discharge-toggle').addEventListener('click', () => {
    const toggle = document.getElementById('discharge-toggle');
    const body   = document.getElementById('discharge-body');
    toggle.classList.toggle('open');
    body.classList.toggle('open');
  });
}

function openLogModal(dateStr) {
  currentLogDate = dateStr;
  document.getElementById('modal-date-title').textContent = formatDateFull(dateStr);

  // Reset form
  resetLogModal();

  // Pre-fill existing log
  const existing = AppState.dailyLogs.find(l => l.date === dateStr);
  if (existing) {
    // Flow: 0=none,1=spotting,2=light,3=medium,4=heavy
    const flowMap = { spotting: 1, light: 2, medium: 3, heavy: 4 };
    const flowDisplayLabels = ['No flow today', 'Spotting', 'Light', 'Medium', 'Heavy'];
    const flowColors = ['var(--text-dim)', '#f8d0d8', '#f0a0b0', 'var(--rose)', '#c0284a'];
    const slider    = document.getElementById('flow-slider');
    const indicator = document.getElementById('flow-indicator');
    const fv = existing.flow_level ? (flowMap[existing.flow_level] ?? 0) : 0;
    slider.value = fv;
    indicator.textContent = flowDisplayLabels[fv];
    indicator.style.color = flowColors[fv];
    indicator.dataset.level = fv === 0 ? 'none' : existing.flow_level;

    padCount = existing.pad_count || 0;
    document.getElementById('pad-count-display').textContent = padCount;

    if (existing.mood) {
      selectedMood = existing.mood;
      document.querySelectorAll('.mood-btn').forEach(b => {
        if (b.dataset.mood === existing.mood) b.classList.add('selected');
      });
    }

    const symptoms = Array.isArray(existing.symptoms) ? existing.symptoms : [];
    symptoms.forEach(sym => {
      selectedSymptoms.add(sym);
      const btn = document.querySelector(`.symptom-btn[data-symptom="${sym}"]`);
      if (btn) btn.classList.add('selected');
      else addCustomSymptomTag(sym);
    });

    if (existing.notes) document.getElementById('log-notes').value = existing.notes;
  }

  document.getElementById('log-modal-overlay').classList.add('open');
}

function closeLogModal() {
  document.getElementById('log-modal-overlay').classList.remove('open');
  currentLogDate = null;
}

function resetLogModal() {
  const slider = document.getElementById('flow-slider');
  const indicator = document.getElementById('flow-indicator');
  slider.value = 0;
  indicator.textContent = 'No flow today';
  indicator.style.color = 'var(--text-dim)';
  indicator.dataset.level = 'none';

  padCount = 0;
  document.getElementById('pad-count-display').textContent = '0';
  selectedMood = null;
  selectedSymptoms = new Set();
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.symptom-btn').forEach(b => b.classList.remove('selected'));

  // Remove any dynamically added custom symptom buttons
  document.querySelectorAll('.symptom-btn.custom').forEach(b => b.remove());

  document.getElementById('log-notes').value = '';
  document.getElementById('custom-symptom-input').value = '';
  document.getElementById('discharge-colour').value = '';
  document.getElementById('discharge-consistency').value = '';

  // Collapse discharge section
  document.getElementById('discharge-toggle').classList.remove('open');
  document.getElementById('discharge-body').classList.remove('open');
}

function addCustomSymptom() {
  const input = document.getElementById('custom-symptom-input');
  const val = input.value.trim().toLowerCase().replace(/\s+/g, '_');
  if (!val) return;
  if (selectedSymptoms.has(val)) { input.value = ''; return; }

  addCustomSymptomTag(val);
  input.value = '';
}

function addCustomSymptomTag(val) {
  const grid = document.getElementById('symptom-grid');
  const btn = document.createElement('button');
  btn.className = 'symptom-btn selected custom';
  btn.dataset.symptom = val;
  btn.textContent = val.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  selectedSymptoms.add(val);
  btn.addEventListener('click', () => {
    btn.classList.toggle('selected');
    if (selectedSymptoms.has(val)) selectedSymptoms.delete(val);
    else selectedSymptoms.add(val);
  });
  grid.appendChild(btn);
}

// ── Save Log Entry ────────────────────────────────────────────
async function saveLogEntry() {
  if (!currentLogDate || !AppState.user) return;

  // 0=none(null), 1=spotting, 2=light, 3=medium, 4=heavy
  const flowLevelMap = [null, 'spotting', 'light', 'medium', 'heavy'];
  const flowVal    = parseInt(document.getElementById('flow-slider').value);
  const flowLevel  = flowLevelMap[flowVal]; // null means no flow
  const notes      = document.getElementById('log-notes').value.trim();
  const colour     = document.getElementById('discharge-colour').value;
  const consistency = document.getElementById('discharge-consistency').value;

  const btn = document.getElementById('modal-save-btn');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  // Upsert daily log
  const { error: logError } = await db.from('daily_logs').upsert({
    user_id:    AppState.user.id,
    date:       currentLogDate,
    flow_level: flowLevel,
    pad_count:  padCount,
    symptoms:   Array.from(selectedSymptoms),
    mood:       selectedMood || null,
    notes:      notes || null,
  }, { onConflict: 'user_id,date' });

  // Optional vaginal health
  if (colour || consistency) {
    await db.from('vaginal_health').upsert({
      user_id:               AppState.user.id,
      date:                  currentLogDate,
      discharge_colour:      colour || null,
      discharge_consistency: consistency || null,
      is_optional:           true,
    }, { onConflict: 'user_id,date' });
  }

  // Auto-update last_period_date when a new flow sequence begins
  if (flowLevel) {
    const recentFlow = AppState.dailyLogs.find(l =>
      l.flow_level &&
      l.date !== currentLogDate &&
      daysBetween(l.date, currentLogDate) >= 1 &&
      daysBetween(l.date, currentLogDate) <= 3
    );
    const currentLastPeriod = AppState.profile?.last_period_date;
    const isNewStart = !recentFlow &&
      (!currentLastPeriod || daysBetween(currentLastPeriod, currentLogDate) > 14);

    if (isNewStart) {
      await db.from('profiles').update({ last_period_date: currentLogDate })
        .eq('id', AppState.user.id);
      await fetchProfile();
    }
  }

  btn.textContent = 'Save Entry';
  btn.disabled = false;

  if (logError) {
    showToast('Error saving: ' + logError.message);
    return;
  }

  closeLogModal();
  await fetchDailyLogs();
  updateHomeDashboard();
  renderCalendar();
  renderTodayPreview();
  showToast('Entry saved ✓');
}

// ── Today's Preview ──────────────────────────────────────────
function renderTodayPreview() {
  const today = todayStr();
  const log = AppState.dailyLogs.find(l => l.date === today);
  const container = document.getElementById('today-log-preview');

  if (!log) {
    container.innerHTML = '<div class="no-log-msg">No log yet for today</div>';
    return;
  }

  const symptoms = Array.isArray(log.symptoms) ? log.symptoms : [];
  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      ${log.flow_level ? `<span class="symptom-btn selected" style="pointer-events:none">
        Flow: ${log.flow_level}
      </span>` : ''}
      ${log.mood ? `<span class="mood-btn selected" style="pointer-events:none">
        ${MOOD_COLOURS[log.mood]?.label || log.mood}
      </span>` : ''}
      ${symptoms.slice(0,3).map(s =>
        `<span class="symptom-btn selected" style="pointer-events:none;font-size:11px">${s.replace(/_/g,' ')}</span>`
      ).join('')}
      ${symptoms.length > 3 ? `<span style="font-size:11px;color:var(--text-dim)">+${symptoms.length-3} more</span>` : ''}
    </div>
  `;
}

// ── Screen Switch ─────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`${name}-screen`).classList.add('active');
}

// ── Loading Overlay ───────────────────────────────────────────
function showLoadingOverlay(show) {
  document.getElementById('loading-overlay').classList.toggle('show', show);
}

// ── URL Params (manifest shortcuts) ──────────────────────────
function handleUrlParams() {
  if (!AppState.user) return;
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  const view   = params.get('view');

  if (action === 'log') {
    setTimeout(() => openLogModal(todayStr()), 300);
  } else if (view && ['home','calendar','fasting','analysis','settings'].includes(view)) {
    switchView(view);
  }

  // Clean URL
  if (action || view) {
    history.replaceState(null, '', window.location.pathname);
  }
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Offline Detection ─────────────────────────────────────────
function initOfflineDetection() {
  const banner = document.getElementById('offline-banner');

  function update() {
    if (!navigator.onLine) banner.classList.add('show');
    else banner.classList.remove('show');
  }

  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
  update();
}

// ── Service Worker ────────────────────────────────────────────
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./service-worker.js');
    console.log('[Luna] SW registered:', reg.scope);

    // Listen for SW messages
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'SYNC_REQUESTED') {
        if (AppState.user) fetchAllData();
      }
    });
  } catch (err) {
    console.warn('[Luna] SW registration failed:', err);
  }
}

// ── Install Prompt ────────────────────────────────────────────
let deferredInstallPrompt = null;

function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // Delay so the user is fully signed in and app is rendered
    setTimeout(() => showInstallBanner(), 4000);
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    showToast('Luna installed to home screen 🌙');
  });
}

function showInstallBanner() {
  if (!AppState.user) return;
  if (localStorage.getItem('luna_install_dismissed')) return;
  if (document.querySelector('.install-prompt')) return; // already showing

  const banner = document.createElement('div');
  banner.className = 'install-prompt';
  banner.innerHTML = `
    <div class="install-prompt-text">
      <strong>Install Luna</strong> — offline access &amp; home screen icon
    </div>
    <button class="btn-sm" id="install-btn">Install</button>
    <button class="install-dismiss" id="install-dismiss" aria-label="Dismiss">✕</button>
  `;
  document.body.appendChild(banner);

  document.getElementById('install-btn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') showToast('Luna installed! 🌙');
    banner.remove();
    deferredInstallPrompt = null;
  });

  document.getElementById('install-dismiss').addEventListener('click', () => {
    localStorage.setItem('luna_install_dismissed', '1');
    banner.remove();
  });
}

// ── Star Field ────────────────────────────────────────────────
function generateStars() {
  const container = document.getElementById('stars');
  if (!container) return;
  const count = 80;
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.style.cssText = `
      position:absolute;
      width:${Math.random() * 2 + 1}px;
      height:${Math.random() * 2 + 1}px;
      border-radius:50%;
      background:white;
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      opacity:${Math.random() * 0.6 + 0.1};
      animation: twinkle ${Math.random() * 3 + 2}s ease-in-out ${Math.random() * 3}s infinite alternate;
    `;
    container.appendChild(star);
  }

  // Inject twinkle animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes twinkle {
      from { opacity: 0.1; transform: scale(0.8); }
      to   { opacity: 0.7; transform: scale(1.2); }
    }
  `;
  document.head.appendChild(style);
}
