// ============================================================
// NOTIFICATIONS MODULE
// ============================================================

let notifyPermission = 'default';

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Notifications not supported on this browser');
    return false;
  }
  if (Notification.permission === 'granted') {
    notifyPermission = 'granted';
    return true;
  }
  if (Notification.permission === 'denied') {
    showToast('Notifications blocked — please enable in browser settings');
    return false;
  }
  const result = await Notification.requestPermission();
  notifyPermission = result;
  if (result === 'granted') {
    showToast('Notifications enabled ✓');
    scheduleLocalNotifications();
    return true;
  }
  showToast('Notifications permission denied');
  return false;
}

// ── Schedule local notifications via Service Worker ─────────
function scheduleLocalNotifications() {
  if (notifyPermission !== 'granted') return;

  // Fasting reminder: Mondays (1) and Thursdays (4) at 05:00
  scheduleFastingReminders();

  // Phase change check (runs on each app open)
  checkPhaseChangeNotification();
}

// ── Fasting Day Reminder ─────────────────────────────────────
function scheduleFastingReminders() {
  const now = new Date();
  const today = now.getDay(); // 0=Sun … 6=Sat
  const todayHour = now.getHours();

  const fastingDays = [1, 4]; // Monday, Thursday
  const targetHour = 5;

  fastingDays.forEach(day => {
    let daysUntil = (day - today + 7) % 7;
    if (daysUntil === 0 && todayHour >= targetHour) daysUntil = 7;

    const triggerDate = new Date(now);
    triggerDate.setDate(triggerDate.getDate() + daysUntil);
    triggerDate.setHours(targetHour, 0, 0, 0);

    const msUntil = triggerDate - now;
    if (msUntil > 0 && msUntil < 7 * 24 * 60 * 60 * 1000) {
      setTimeout(() => {
        sendLocalNotification(
          '🌙 Fasting Intention',
          `Today is a fasting day. Set your intention for Sunnah fasting.`,
          { tag: 'fasting-reminder', renotify: true }
        );
      }, msUntil);
    }
  });
}

// ── Phase Change Notification ────────────────────────────────
function checkPhaseChangeNotification() {
  const { profile } = AppState;
  if (!profile) return;

  const { cycle_avg = 28, period_length = 5, last_period_date } = profile;
  const cycleDay = calcCycleDay(last_period_date, cycle_avg);
  if (!cycleDay) return;

  const phase = calcPhase(cycleDay, cycle_avg, period_length);
  const lastNotifiedPhase = localStorage.getItem('luna_last_phase');

  if (phase !== lastNotifiedPhase) {
    localStorage.setItem('luna_last_phase', phase);
    if (lastNotifiedPhase) {
      // Entered a new phase since last visit
      const messages = {
        menstrual:  'Your period phase has begun. Rest and restore 🌸',
        follicular: 'You\'ve entered your Follicular phase — energy returning! 🌱',
        ovulatory:  'Ovulatory phase: your most energetic and expressive days ✨',
        luteal:     'Luteal phase has arrived. Wind down and nourish yourself 🌕',
      };
      sendLocalNotification(
        `🌙 New Phase: ${PHASES[phase].label}`,
        messages[phase] || 'A new phase of your cycle has begun.',
        { tag: 'phase-change' }
      );
    }
  }
}

// ── Send Notification ────────────────────────────────────────
function sendLocalNotification(title, body, opts = {}) {
  if (notifyPermission !== 'granted') return;

  // Use Service Worker if available
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title,
      body,
      opts: { icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', ...opts },
    });
  } else {
    new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      ...opts,
    });
  }
}

// ── Init ─────────────────────────────────────────────────────
function initNotifications() {
  notifyPermission = Notification?.permission ?? 'default';

  document.getElementById('notify-btn').addEventListener('click', async () => {
    await requestNotificationPermission();
  });

  // Check if notifications are already granted
  if (notifyPermission === 'granted') {
    scheduleLocalNotifications();
  }
}
