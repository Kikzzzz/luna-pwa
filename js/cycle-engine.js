// ============================================================
// CYCLE PREDICTION ENGINE
// ============================================================

const PHASES = {
  menstrual:  { label: 'Menstrual',  class: 'menstrual'  },
  follicular: { label: 'Follicular', class: 'follicular' },
  ovulatory:  { label: 'Ovulatory',  class: 'ovulatory'  },
  luteal:     { label: 'Luteal',     class: 'luteal'     },
};

const PHASE_INFO = {
  menstrual: {
    text: 'Your body is shedding the uterine lining. Energy may be lower — honour rest and gentle movement. Iron-rich foods can support you now.',
    tips: ['🛁 Rest & warmth', '🩸 Track your flow', '🫖 Raspberry leaf tea', '🚫 Avoid intense exercise'],
  },
  follicular: {
    text: 'Estrogen rises and energy returns. This is your season of creativity, new beginnings, and social connection. Great time to start projects.',
    tips: ['💪 Try new workouts', '🥗 Light fresh foods', '🎨 Creative projects', '☀️ Social energy high'],
  },
  ovulatory: {
    text: 'You\'re at peak energy, confidence, and communication. Ovulation typically occurs around cycle day 14 (varies per person). Fertility is highest.',
    tips: ['💃 High energy activities', '💬 Important conversations', '🫐 Antioxidant foods', '🌡️ Track basal temp'],
  },
  luteal: {
    text: 'Progesterone dominates. You may feel more inward, sensitive, or tired as the cycle closes. Nourish yourself and wind down gently.',
    tips: ['🧘 Gentle yoga', '🍫 Dark chocolate OK!', '😴 Prioritise sleep', '📓 Journalling helps'],
  },
};

// ── Date Utilities ──────────────────────────────────────────
function toDateStr(d) {
  return d instanceof Date
    ? d.toISOString().split('T')[0]
    : String(d);
}

function daysBetween(a, b) {
  const msPerDay = 86400000;
  const da = typeof a === 'string' ? new Date(a) : a;
  const db2 = typeof b === 'string' ? new Date(b) : b;
  return Math.round((db2 - da) / msPerDay);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// ── Rolling Average Cycle Calculator ───────────────────────
/**
 * Calculate rolling average cycle length from the last 3-4 months
 * of period start dates.
 * @param {string[]} periodStartDates - array of ISO date strings, sorted asc
 * @param {number} fallback - default cycle length if insufficient data
 * @returns {number} averaged cycle length in days
 */
function calcRollingAvgCycle(periodStartDates, fallback = 28) {
  if (!periodStartDates || periodStartDates.length < 2) return fallback;

  // Use last 4 entries max (covers 3-4 gaps)
  const recent = [...periodStartDates].sort().slice(-4);
  const gaps = [];

  for (let i = 1; i < recent.length; i++) {
    const gap = daysBetween(recent[i - 1], recent[i]);
    if (gap > 14 && gap < 60) gaps.push(gap); // sanity filter
  }

  if (gaps.length === 0) return fallback;
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

// ── Cycle Day & Phase ───────────────────────────────────────
/**
 * Calculate the current cycle day (1-based) from last period start.
 */
function calcCycleDay(lastPeriodDate, cycleAvg = 28) {
  if (!lastPeriodDate) return null;
  const today = toDateStr(new Date());
  let day = daysBetween(lastPeriodDate, today) + 1;

  // Handle cycles that have looped
  while (day > cycleAvg) day -= cycleAvg;
  if (day < 1) day = 1;
  return day;
}

/**
 * Determine the current menstrual phase.
 * Phases are proportional to cycleAvg:
 *   Menstrual:  days 1 – periodLength
 *   Follicular: days (periodLength+1) – ovulatoryStart-1
 *   Ovulatory:  days ovulatoryStart – ovulatoryStart+2
 *   Luteal:     days ovulatoryStart+3 – cycleAvg
 */
function calcPhase(cycleDay, cycleAvg = 28, periodLength = 5) {
  if (!cycleDay) return 'menstrual';
  const ovStart = Math.round(cycleAvg / 2) - 1; // ~day 13 for 28-day

  if (cycleDay <= periodLength) return 'menstrual';
  if (cycleDay < ovStart)       return 'follicular';
  if (cycleDay <= ovStart + 2)  return 'ovulatory';
  return 'luteal';
}

/**
 * Get phase for any given date relative to last period.
 */
function getPhaseForDate(dateStr, lastPeriodDate, cycleAvg = 28, periodLength = 5) {
  if (!lastPeriodDate) return null;
  let day = daysBetween(lastPeriodDate, dateStr) + 1;

  // Normalise to within current cycle
  const cycleNum = Math.floor((day - 1) / cycleAvg);
  day = day - cycleNum * cycleAvg;
  if (day < 1) return null;

  return calcPhase(day, cycleAvg, periodLength);
}

// ── Predictions ─────────────────────────────────────────────
/**
 * Predict the next period start date.
 * Returns an object with { start, end } ISO strings.
 */
function predictNextPeriod(lastPeriodDate, cycleAvg = 28, periodLength = 5) {
  if (!lastPeriodDate) return null;

  const today = toDateStr(new Date());
  let nextStart = addDays(lastPeriodDate, cycleAvg);

  // If next period is in the past, keep rolling forward
  while (nextStart <= today) {
    nextStart = addDays(nextStart, cycleAvg);
  }

  return {
    start: nextStart,
    end:   addDays(nextStart, periodLength - 1),
  };
}

/**
 * Predict ovulation window (typically 14 days before next period).
 */
function predictOvulation(lastPeriodDate, cycleAvg = 28) {
  if (!lastPeriodDate) return null;

  const nextPeriod = predictNextPeriod(lastPeriodDate, cycleAvg);
  if (!nextPeriod) return null;

  const ovDate = addDays(nextPeriod.start, -14);
  return {
    start: addDays(ovDate, -1),
    peak:  ovDate,
    end:   addDays(ovDate, 1),
  };
}

// ── Format Helpers ──────────────────────────────────────────
function formatDateRange(start, end) {
  const opts = { month: 'short', day: 'numeric' };
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  if (start === end) return s.toLocaleDateString('en-GB', opts);
  return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function todayStr() {
  return toDateStr(new Date());
}

// ── Progress Arc ─────────────────────────────────────────────
function setCycleArc(cycleDay, cycleAvg) {
  const arc = document.getElementById('cycle-progress-arc');
  if (!arc || !cycleDay) return;
  const circumference = 534; // 2π × 85
  const progress = Math.min(cycleDay / cycleAvg, 1);
  const offset = circumference - progress * circumference;
  arc.style.strokeDashoffset = offset;
}

// ── Update Dashboard ─────────────────────────────────────────
function updateHomeDashboard() {
  const { profile } = AppState;
  if (!profile) return;

  const { cycle_avg = 28, period_length = 5, last_period_date } = profile;

  // Cycle Day
  const cycleDay = calcCycleDay(last_period_date, cycle_avg);
  document.getElementById('cycle-day-display').textContent = cycleDay ?? '–';
  setCycleArc(cycleDay, cycle_avg);

  // Phase
  const phase = cycleDay ? calcPhase(cycleDay, cycle_avg, period_length) : 'menstrual';
  const phaseBadge = document.getElementById('phase-badge');
  phaseBadge.textContent = PHASES[phase].label;
  phaseBadge.className = `phase-badge ${PHASES[phase].class}`;

  // Phase Info Card
  const info = PHASE_INFO[phase];
  document.getElementById('phase-info-title').textContent = `${PHASES[phase].label} Phase`;
  document.getElementById('phase-info-text').textContent = info.text;
  const tipsEl = document.getElementById('phase-tips');
  tipsEl.innerHTML = info.tips.map(t => `<span class="phase-tip">${t}</span>`).join('');

  // Next Period
  const nextP = predictNextPeriod(last_period_date, cycle_avg, period_length);
  document.getElementById('next-period-display').textContent = nextP
    ? formatDateRange(nextP.start, nextP.end)
    : '–';

  // Ovulation
  const ov = predictOvulation(last_period_date, cycle_avg);
  document.getElementById('ovulation-display').textContent = ov
    ? formatDate(ov.peak)
    : '–';

  // Cycle Avg
  document.getElementById('cycle-avg-display').textContent = `${cycle_avg} days`;

  // Missed Fasts
  document.getElementById('missed-fasts-display').textContent = AppState.fastingBalance ?? '–';
}
