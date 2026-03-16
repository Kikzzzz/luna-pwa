// ============================================================
// CALENDAR MODULE
// ============================================================

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed

// ── Render Calendar ─────────────────────────────────────────
function renderCalendar() {
  const { profile, dailyLogs } = AppState;
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  document.getElementById('cal-month-title').textContent =
    `${monthNames[calMonth]} ${calYear}`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // First day of month
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  // Days in month
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  // Days in previous month
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();

  const today = todayStr();

  // Build a quick lookup for logs
  const logMap = {};
  dailyLogs.forEach(log => { logMap[log.date] = log; });

  // Determine period start dates for rolling average
  const periodStarts = detectPeriodStarts(dailyLogs);

  // Padding cells (previous month)
  for (let i = 0; i < firstDay; i++) {
    const day = daysInPrev - firstDay + 1 + i;
    // Previous month: calMonth is 0-indexed, so previous month number = calMonth (which equals calMonth+1-1)
    const prevMonthNum = calMonth === 0 ? 12 : calMonth;
    const prevYear     = calMonth === 0 ? calYear - 1 : calYear;
    const dateStr = `${prevYear}-${String(prevMonthNum).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cell = buildCalCell(day, dateStr, false, today, logMap, profile, periodStarts);
    cell.classList.add('other-month');
    grid.appendChild(cell);
  }

  // Current month cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cell = buildCalCell(d, dateStr, true, today, logMap, profile, periodStarts);
    grid.appendChild(cell);
  }

  // Trailing cells (next month)
  const totalCells = firstDay + daysInMonth;
  const trailingCells = (7 - (totalCells % 7)) % 7;
  const nextMonthNum = calMonth === 11 ? 1 : calMonth + 2;
  const nextYear     = calMonth === 11 ? calYear + 1 : calYear;
  for (let i = 1; i <= trailingCells; i++) {
    const dateStr = `${nextYear}-${String(nextMonthNum).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
    const cell = buildCalCell(i, dateStr, false, today, logMap, profile, periodStarts);
    cell.classList.add('other-month');
    grid.appendChild(cell);
  }
}

function buildCalCell(day, dateStr, isCurrentMonth, today, logMap, profile, periodStarts) {
  const cell = document.createElement('button');
  cell.className = 'cal-cell';
  cell.dataset.date = dateStr;

  // Day number
  const dayNum = document.createElement('span');
  dayNum.textContent = day;
  cell.appendChild(dayNum);

  // Today indicator
  if (dateStr === today) cell.classList.add('today');

  if (profile && isCurrentMonth) {
    const cycleAvg = profile.cycle_avg || 28;
    const periodLength = profile.period_length || 5;

    // Determine phase using last known period start
    const lastKnownPeriod = getLastPeriodBefore(dateStr, profile.last_period_date, periodStarts);
    const phase = lastKnownPeriod
      ? getPhaseForDate(dateStr, lastKnownPeriod, cycleAvg, periodLength)
      : null;

    if (phase) cell.classList.add(`phase-${phase}`);
  }

  // Log indicator
  const log = logMap[dateStr];
  if (log) {
    cell.classList.add('has-log');
    if (log.flow_level) {
      const dot = document.createElement('span');
      dot.className = `flow-dot flow-${log.flow_level}`;
      cell.appendChild(dot);
    }
  }

  // Click handler
  cell.addEventListener('click', () => openLogModal(dateStr));
  return cell;
}

// ── Period Start Detection ───────────────────────────────────
function detectPeriodStarts(logs) {
  // Find dates where flow_level is not null and marks start of a flow sequence
  const flowDates = logs
    .filter(l => l.flow_level)
    .map(l => l.date)
    .sort();

  const starts = [];
  let lastDate = null;

  for (const d of flowDates) {
    if (!lastDate || daysBetween(lastDate, d) > 3) {
      starts.push(d);
    }
    lastDate = d;
  }

  return starts;
}

function getLastPeriodBefore(dateStr, profileLastPeriod, periodStarts) {
  // Combine profile last period with detected starts
  const allStarts = [...new Set([
    ...(profileLastPeriod ? [profileLastPeriod] : []),
    ...periodStarts,
  ])].sort();

  // Find the latest start that is <= dateStr
  let last = null;
  for (const s of allStarts) {
    if (s <= dateStr) last = s;
    else break;
  }
  return last;
}

// ── Navigation ──────────────────────────────────────────────
function initCalendarListeners() {
  document.getElementById('cal-prev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });

  document.getElementById('cal-next').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
}
