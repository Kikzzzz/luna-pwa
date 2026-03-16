// ============================================================
// ANALYSIS MODULE — Charts & Insights
// ============================================================

const MOOD_COLOURS = {
  happy:     { fill: '#d4a853', label: '😊 Happy' },
  calm:      { fill: '#5ec4b6', label: '😌 Calm' },
  energetic: { fill: '#9b7fe8', label: '⚡ Energetic' },
  focused:   { fill: '#6ba4e8', label: '🎯 Focused' },
  anxious:   { fill: '#e8c470', label: '😰 Anxious' },
  sad:       { fill: '#7a8ec4', label: '😢 Sad' },
  irritable: { fill: '#e87070', label: '😤 Irritable' },
  tired:     { fill: '#a0a0c0', label: '😴 Tired' },
};

// ── Main Render ─────────────────────────────────────────────
function renderAnalysis() {
  const { dailyLogs } = AppState;
  const last30 = get30DayLogs(dailyLogs);

  renderMoodChart(last30);
  renderSymptomBars(last30);
  renderFlowHeatmap(last30);
  renderCycleStats();
  renderCycleHistoryChart();
  renderPadChart(last30);
}

// ── Helper: Last 30 Days ────────────────────────────────────
function get30DayLogs(logs) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = toDateStr(cutoff);
  return logs.filter(l => l.date >= cutoffStr);
}

// ── Mood Chart ──────────────────────────────────────────────
function renderMoodChart(logs) {
  const container = document.getElementById('mood-chart');
  if (!container) return;

  // Count moods
  const counts = {};
  logs.forEach(l => {
    if (l.mood) counts[l.mood] = (counts[l.mood] || 0) + 1;
  });

  if (!Object.keys(counts).length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">No mood data in the last 30 days</p>';
    return;
  }

  const max = Math.max(...Object.values(counts));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  container.innerHTML = sorted.map(([mood, count]) => {
    const cfg = MOOD_COLOURS[mood] || { fill: 'var(--rose)', label: mood };
    const pct = (count / max * 100).toFixed(1);
    return `
      <div class="mood-row">
        <span class="mood-row-label">${cfg.label || mood}</span>
        <div class="mood-bar-track">
          <div class="mood-bar-fill" style="width:0%;background:${cfg.fill}" data-width="${pct}%"></div>
        </div>
        <span class="mood-count">${count}</span>
      </div>
    `;
  }).join('');

  // Animate bars in
  requestAnimationFrame(() => {
    container.querySelectorAll('.mood-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  });
}

// ── Symptom Bars ────────────────────────────────────────────
function renderSymptomBars(logs) {
  const container = document.getElementById('symptom-bars');
  if (!container) return;

  const counts = {};
  logs.forEach(l => {
    const symptoms = Array.isArray(l.symptoms) ? l.symptoms : [];
    symptoms.forEach(s => {
      counts[s] = (counts[s] || 0) + 1;
    });
  });

  if (!Object.keys(counts).length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">No symptom data in the last 30 days</p>';
    return;
  }

  const max = Math.max(...Object.values(counts));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  container.innerHTML = sorted.map(([sym, count]) => {
    const pct = (count / max * 100).toFixed(1);
    const label = sym.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `
      <div class="symptom-row">
        <span class="symptom-row-label">${label}</span>
        <div class="symptom-bar-track">
          <div class="symptom-bar-fill" style="width:0%" data-width="${pct}%"></div>
        </div>
        <span class="symptom-count">${count}</span>
      </div>
    `;
  }).join('');

  requestAnimationFrame(() => {
    container.querySelectorAll('.symptom-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  });
}

// ── Flow Heatmap ────────────────────────────────────────────
function renderFlowHeatmap(logs) {
  const container = document.getElementById('flow-heatmap');
  if (!container) return;

  // Build a 30-day grid ending today
  const today = new Date();
  const logMap = {};
  logs.forEach(l => { logMap[l.date] = l; });
  const cells = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = toDateStr(d);
    const log = logMap[ds];
    // Only mark flow if flow_level is non-null
    cells.push({ date: ds, flow: (log && log.flow_level) ? log.flow_level : null, day: d.getDate() });
  }

  container.innerHTML = cells.map(c => {
    const cls = c.flow ? `hm-${c.flow}` : 'hm-none';
    const tip  = c.flow ? `${c.date}: ${c.flow}` : c.date;
    return `<div class="heatmap-cell ${cls}" title="${tip}">${c.day}</div>`;
  }).join('');
}

// ── Cycle Statistics ─────────────────────────────────────────
function renderCycleStats() {
  const container = document.getElementById('cycle-stats');
  if (!container) return;

  const { profile, dailyLogs } = AppState;
  if (!profile) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">No profile data available</p>';
    return;
  }

  const periodStarts = detectPeriodStarts(dailyLogs);
  const rollingAvg = calcRollingAvgCycle(
    [...(profile.last_period_date ? [profile.last_period_date] : []), ...periodStarts],
    profile.cycle_avg
  );

  const totalLogDays = dailyLogs.length;

  // Count period days in last 6 months
  const sixMonthAgo = new Date();
  sixMonthAgo.setMonth(sixMonthAgo.getMonth() - 6);
  const recentFlow = dailyLogs.filter(l =>
    l.flow_level && new Date(l.date) >= sixMonthAgo
  );

  const avgPeriodLen = periodStarts.length > 1
    ? (recentFlow.length / Math.max(periodStarts.length, 1)).toFixed(1)
    : profile.period_length;

  container.innerHTML = `
    <div class="stat-item">
      <div class="stat-label">Avg Cycle</div>
      <div class="stat-value">${rollingAvg}</div>
      <div class="stat-unit">days</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Avg Period</div>
      <div class="stat-value">${avgPeriodLen}</div>
      <div class="stat-unit">days</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Days Logged</div>
      <div class="stat-value">${totalLogDays}</div>
      <div class="stat-unit">total</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Missed Fasts</div>
      <div class="stat-value">${AppState.fastingBalance}</div>
      <div class="stat-unit">remaining</div>
    </div>
  `;
}

// ── Cycle History Chart ──────────────────────────────────────
function renderCycleHistoryChart() {
  const container = document.getElementById('cycle-history-chart');
  if (!container) return;

  const { dailyLogs, profile } = AppState;
  const periodStarts = detectPeriodStarts(dailyLogs);

  // Combine with profile last period
  const allStarts = [...new Set([
    ...(profile?.last_period_date ? [profile.last_period_date] : []),
    ...periodStarts,
  ])].sort();

  if (allStarts.length < 2) {
    container.innerHTML = '<div class="chart-empty">Not enough cycle data yet — keep logging! 🌱</div>';
    return;
  }

  // Calculate cycle lengths between consecutive starts
  const cycles = [];
  for (let i = 1; i < allStarts.length; i++) {
    const len = daysBetween(allStarts[i - 1], allStarts[i]);
    if (len >= 14 && len <= 60) {
      cycles.push({ len, label: formatDate(allStarts[i - 1]) });
    }
  }

  if (!cycles.length) {
    container.innerHTML = '<div class="chart-empty">Not enough cycle data yet</div>';
    return;
  }

  const max = Math.max(...cycles.map(c => c.len));
  const avg = Math.round(cycles.reduce((s, c) => s + c.len, 0) / cycles.length);
  const avgPct = (avg / max * 100).toFixed(1);

  container.innerHTML = `
    <div style="width:100%">
      <div style="display:flex;align-items:flex-end;gap:8px;height:100px;margin-bottom:6px;position:relative">
        ${cycles.map(c => {
          const heightPct = (c.len / max * 100).toFixed(1);
          const isAvg = c.len === avg;
          return `
            <div class="ch-bar-wrap" title="${c.len} days starting ${c.label}">
              <div class="ch-val">${c.len}</div>
              <div class="ch-bar" style="height:${heightPct}%;${isAvg ? 'background:linear-gradient(to top,var(--rose-dim),var(--rose))' : ''}"></div>
            </div>
          `;
        }).join('')}
        <div style="position:absolute;left:0;right:0;border-top:1px dashed rgba(212,168,83,0.4);bottom:${avgPct}%" title="Average: ${avg} days"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim);margin-top:4px">
        ${cycles.map(c => `<span style="flex:1;text-align:center">${c.label.split(' ')[0]}</span>`).join('')}
      </div>
      <div style="display:flex;gap:16px;margin-top:12px;font-size:12px">
        <span style="color:var(--text-muted)">— Avg: <strong style="color:var(--gold)">${avg} days</strong></span>
        <span style="color:var(--text-muted)">Min: <strong style="color:var(--text)">${Math.min(...cycles.map(c=>c.len))}</strong></span>
        <span style="color:var(--text-muted)">Max: <strong style="color:var(--text)">${max}</strong></span>
      </div>
    </div>
  `;
}

// ── Pad / Tampon Chart ────────────────────────────────────────
function renderPadChart(logs) {
  const container = document.getElementById('pad-chart');
  if (!container) return;

  const padLogs = logs.filter(l => l.pad_count > 0);
  if (!padLogs.length) {
    container.innerHTML = '<div class="chart-empty">No pad/tampon data in the last 30 days</div>';
    return;
  }

  const sorted = [...padLogs].sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(...sorted.map(l => l.pad_count));

  container.innerHTML = sorted.map(l => {
    const heightPct = (l.pad_count / max * 100).toFixed(1);
    const dayNum = new Date(l.date + 'T00:00:00').getDate();
    return `
      <div class="pad-bar-wrap" title="${l.date}: ${l.pad_count} pads">
        <div class="pad-bar" style="height:${heightPct}%"></div>
        <div class="pad-label">${dayNum}</div>
      </div>
    `;
  }).join('');
}
