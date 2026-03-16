// ============================================================
// SETTINGS MODULE
// ============================================================

// Local copies for the stepper
let settingsCycleAvg    = 28;
let settingsPeriodLen   = 5;

// ── Init Settings View ───────────────────────────────────────
function initSettingsListeners() {
  // Steppers — Cycle Avg
  document.getElementById('cycle-avg-dec').addEventListener('click', () => {
    settingsCycleAvg = Math.max(18, settingsCycleAvg - 1);
    document.getElementById('cycle-avg-val').textContent = settingsCycleAvg;
  });
  document.getElementById('cycle-avg-inc').addEventListener('click', () => {
    settingsCycleAvg = Math.min(50, settingsCycleAvg + 1);
    document.getElementById('cycle-avg-val').textContent = settingsCycleAvg;
  });

  // Steppers — Period Length
  document.getElementById('period-len-dec').addEventListener('click', () => {
    settingsPeriodLen = Math.max(1, settingsPeriodLen - 1);
    document.getElementById('period-len-val').textContent = settingsPeriodLen;
  });
  document.getElementById('period-len-inc').addEventListener('click', () => {
    settingsPeriodLen = Math.min(14, settingsPeriodLen + 1);
    document.getElementById('period-len-val').textContent = settingsPeriodLen;
  });

  // Save profile
  document.getElementById('save-profile-btn').addEventListener('click', saveProfileSettings);

  // Notification toggles
  document.getElementById('fasting-notif-toggle').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains('on')) {
      btn.classList.remove('on');
      btn.textContent = 'Enable';
      localStorage.removeItem('luna_fasting_notif');
    } else {
      const granted = await requestNotificationPermission();
      if (granted !== false) {
        btn.classList.add('on');
        btn.textContent = 'On';
        localStorage.setItem('luna_fasting_notif', '1');
        scheduleFastingReminders();
      }
    }
  });

  document.getElementById('phase-notif-toggle').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains('on')) {
      btn.classList.remove('on');
      btn.textContent = 'Enable';
      localStorage.removeItem('luna_phase_notif');
    } else {
      const granted = await requestNotificationPermission();
      if (granted !== false) {
        btn.classList.add('on');
        btn.textContent = 'On';
        localStorage.setItem('luna_phase_notif', '1');
      }
    }
  });

  // Export data
  document.getElementById('export-data-btn').addEventListener('click', exportUserData);

  // Sign out from settings
  document.getElementById('signout-settings-btn').addEventListener('click', async () => {
    await db.auth.signOut();
  });
}

// ── Populate Settings ────────────────────────────────────────
function populateSettings() {
  const { profile, user } = AppState;
  if (!profile || !user) return;

  settingsCycleAvg  = profile.cycle_avg || 28;
  settingsPeriodLen = profile.period_length || 5;

  document.getElementById('cycle-avg-val').textContent  = settingsCycleAvg;
  document.getElementById('period-len-val').textContent = settingsPeriodLen;

  if (profile.last_period_date) {
    document.getElementById('settings-last-period').value = profile.last_period_date;
  }

  // User info
  document.getElementById('settings-email').textContent = user.email || '—';

  const createdAt = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : '';
  document.getElementById('settings-joined').textContent = createdAt ? `Member since ${createdAt}` : '';

  // Notification toggle states
  if (localStorage.getItem('luna_fasting_notif')) {
    const btn = document.getElementById('fasting-notif-toggle');
    btn.classList.add('on'); btn.textContent = 'On';
  }
  if (localStorage.getItem('luna_phase_notif')) {
    const btn = document.getElementById('phase-notif-toggle');
    btn.classList.add('on'); btn.textContent = 'On';
  }

  // Streaks
  renderStreakCard();
}

// ── Save Profile ─────────────────────────────────────────────
async function saveProfileSettings() {
  const lastPeriod = document.getElementById('settings-last-period').value;
  const btn = document.getElementById('save-profile-btn');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  const { error } = await db.from('profiles').upsert({
    id:               AppState.user.id,
    cycle_avg:        settingsCycleAvg,
    period_length:    settingsPeriodLen,
    last_period_date: lastPeriod || null,
  });

  btn.textContent = 'Save Changes';
  btn.disabled = false;

  if (error) {
    showToast('Error: ' + error.message);
    return;
  }

  await fetchProfile();
  updateHomeDashboard();
  renderCalendar();
  showToast('Profile updated ✓');
}

// ── Streak Calculator ─────────────────────────────────────────
function calcStreak(logs) {
  if (!logs.length) return { current: 0, best: 0, last28: [] };

  const logDates = new Set(logs.map(l => l.date));
  const today = todayStr();

  // Current streak — count consecutive days backwards from today
  let current = 0;
  let check = today;
  while (logDates.has(check)) {
    current++;
    check = addDays(check, -1);
  }

  // Best streak — scan all dates
  const sorted = [...logDates].sort();
  let best = 0, run = 0, prev = null;
  for (const d of sorted) {
    if (prev && daysBetween(prev, d) === 1) {
      run++;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = d;
  }
  best = Math.max(best, current);

  // Last 28 days array
  const last28 = [];
  for (let i = 27; i >= 0; i--) {
    const d = addDays(today, -i);
    last28.push({ date: d, logged: logDates.has(d) });
  }

  return { current, best, last28 };
}

function renderStreakCard() {
  const { current, best, last28 } = calcStreak(AppState.dailyLogs);

  const numEl = document.getElementById('streak-num');
  numEl.textContent = current;
  numEl.classList.add('count-animate');
  setTimeout(() => numEl.classList.remove('count-animate'), 500);

  document.getElementById('streak-best').textContent = best;

  const dotsEl = document.getElementById('streak-dots');
  const today = todayStr();
  dotsEl.innerHTML = last28.map(d => `
    <div class="streak-dot ${d.logged ? 'logged' : ''} ${d.date === today ? 'today-dot' : ''}"
         title="${d.date}"></div>
  `).join('');
}

// ── Export Data ──────────────────────────────────────────────
async function exportUserData() {
  const btn = document.getElementById('export-data-btn');
  btn.textContent = 'Exporting…';
  btn.disabled = true;

  const [
    { data: logs },
    { data: vaginal },
    { data: fasting },
    { data: profile },
  ] = await Promise.all([
    db.from('daily_logs').select('*').eq('user_id', AppState.user.id).order('date'),
    db.from('vaginal_health').select('*').eq('user_id', AppState.user.id).order('date'),
    db.from('fasting_ledger').select('*').eq('user_id', AppState.user.id).order('date'),
    db.from('profiles').select('*').eq('id', AppState.user.id).single(),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    profile,
    daily_logs: logs || [],
    vaginal_health: vaginal || [],
    fasting_ledger: fasting || [],
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `luna-export-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  btn.textContent = 'Export My Data (JSON)';
  btn.disabled = false;
  showToast('Data exported ✓');
}
