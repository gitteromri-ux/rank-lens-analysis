/* Rank Lens v4 — simplified, action-oriented dashboard.
   5 cohorts: Overall, Hebrew · English, Hebrew · Spanish, Biblical · English, Biblical · Spanish.
   Centerpiece: staffing recommendation panel.
*/

const COLORS = {
  good: '#2a7f52',
  goodSoft: 'rgba(42,127,82,0.18)',
  bad: '#b23b2e',
  ink: '#1a1a1c',
  inkMuted: '#5a5a60',
  inkSoft: '#8a8a91',
  line: '#e7e6e2',
  neutral: '#2d62c4',
  neutralSoft: 'rgba(45,98,196,0.18)',
  amber: '#b78a2a',
};

const fmtMoney = (n) => {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (a >= 1_000) return '$' + Math.round(n / 1_000) + 'k';
  return '$' + Math.round(n);
};
const fmtMoneyExact = (n) => '$' + Math.round(n).toLocaleString();
const fmtInt = (n) => (n == null ? '—' : Math.round(n).toLocaleString());
const fmtPct = (x, d = 0) => (x == null || isNaN(x) ? '—' : (x * 100).toFixed(d) + '%');
const fmtX = (x) => (x == null || isNaN(x) ? '—' : x.toFixed(2) + '×');

// ---------- State ----------
const state = {
  data: null,
  monthly: null,
  kpis: null,
  cohort: 'Overall',
  charts: {},
};

// ---------- Boot ----------
async function boot() {
  const [data, monthly, kpis] = await Promise.all([
    fetch('data.json').then((r) => r.json()),
    fetch('monthly.json').then((r) => r.json()),
    fetch('kpis.json').then((r) => r.json()),
  ]);
  state.data = data;
  state.monthly = monthly;
  state.kpis = kpis;

  renderHero();
  renderMeta();
  bindTabs();
  renderCohort(state.cohort);
}

// ---------- Hero / meta ----------
function renderHero() {
  const k = state.kpis;
  document.getElementById('hero-ratio').textContent = fmtX(k.rank4_to_rank1_productivity);
  document.getElementById('hero-lift').textContent = fmtMoney(k.rec_total_weekly_lift) + '/week';
  document.getElementById('hero-pct').textContent = '+' + Math.round(k.rec_total_lift_pct * 100) + '%';
  document.getElementById('hero-current').textContent = fmtMoney(k.rec_current_weekly_sov) + '/week';
}
function renderMeta() {
  const k = state.kpis;
  document.getElementById('meta-strip').innerHTML = `
    <span>${k.total_weeks} weeks</span><span class="dot"></span>
    <span>${k.date_range_start} → ${k.date_range_end}</span><span class="dot"></span>
    <span>${k.n_reps} reps</span>
  `;
  const endEl = document.getElementById('m-end-date');
  if (endEl) endEl.textContent = k.date_range_end;
  document.getElementById('foot-meta').textContent =
    `Generated from ${k.total_weeks} weekly observations · ${fmtInt(k.total_contacted)} total contacted`;
}

// ---------- Tabs ----------
function bindTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const c = btn.dataset.cohort;
      state.cohort = c;
      renderCohort(c);
      window.scrollTo({ top: document.querySelector('.tabs').offsetTop - 12, behavior: 'smooth' });
    });
  });
}

// ---------- Cohort render ----------
function renderCohort(cohort) {
  const cd = state.data[cohort];
  if (!cd) return;
  renderKpiRow(cd);
  renderStaffing(cd, cohort);
  renderRankTable(cd);
  renderTrendChart(cd, cohort);
  renderMonthlyChart(cohort);
}

function renderKpiRow(cd) {
  const op = cd.operating;
  const prod = cd.productivity;
  const rec = cd.recommendation;
  const items = [
    {
      label: 'Current weekly SOV',
      value: fmtMoney(op.current_total_sov),
      sub: `Trailing 4-wk · week ending ${op.current_week_end}`,
    },
    {
      label: 'Rank-3/4 utilization',
      value: fmtPct(op.r34_utilization, 0),
      sub: `${op.current_r34_reps.toFixed(1)} active of ${op.roster_r34} on roster`,
    },
    {
      label: 'Rank-4 productivity',
      value: fmtX(prod.ratio_r4_to_r1),
      sub: `vs Rank-1 ($${Math.round(prod.spc_rank4)}/contact vs $${Math.round(prod.spc_rank1)})`,
    },
    {
      label: 'Recommended weekly lift',
      value: '+' + fmtMoney(rec.expected_weekly_lift),
      sub: `${rec.priority_count} priority reps · ${fmtPct(rec.lift_pct, 0)} on baseline`,
      accent: 'good',
    },
  ];
  document.getElementById('kpi-row').innerHTML = items
    .map(
      (k) => `
    <div class="kpi ${k.accent ? 'kpi--' + k.accent : ''}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`
    )
    .join('');
}

// ---------- Staffing panel ----------
function renderStaffing(cd, cohort) {
  const rec = cd.recommendation;
  const sub = document.getElementById('staff-sub');
  const summary = document.getElementById('staff-summary');
  const tbody = document.getElementById('staff-tbody');
  const foot = document.getElementById('staff-foot');

  if (!rec.priority_reps || rec.priority_reps.length === 0) {
    sub.textContent = 'No bench candidates with sufficient history in this cohort.';
    summary.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Nothing to recommend right now.</td></tr>';
    foot.textContent = '';
    return;
  }

  sub.innerHTML = `Activate the <strong>${rec.priority_reps.length}</strong> bench reps below to ${fmtPct(
    rec.target_activation, 0
  )} of weeks. Reps shown are those with the highest historical $/active week who are currently working &lt; ${fmtPct(
    rec.bench_threshold, 0
  )} of recent weeks.`;

  summary.innerHTML = `
    <div class="staff-stat">
      <div class="staff-stat-value">+${fmtMoney(rec.expected_weekly_lift)}</div>
      <div class="staff-stat-label">expected weekly lift</div>
    </div>
    <div class="staff-stat">
      <div class="staff-stat-value">${fmtMoney(rec.expected_weekly_sov_after)}</div>
      <div class="staff-stat-label">projected weekly SOV</div>
    </div>
    <div class="staff-stat">
      <div class="staff-stat-value">+${Math.round(rec.lift_pct * 100)}%</div>
      <div class="staff-stat-label">vs current baseline</div>
    </div>
  `;

  tbody.innerHTML = rec.priority_reps
    .map(
      (r, i) => `
    <tr>
      <td class="rank-num">${i + 1}</td>
      <td><span class="rep-name">${escapeHtml(r.name)}</span><span class="rep-meta">${r.active_weeks} active weeks total</span></td>
      <td class="num"><span class="pill rank-${r.rank}">R${r.rank}</span></td>
      <td class="num">${fmtMoneyExact(r.avg_sov_when_active)}</td>
      <td class="num">${fmtPct(r.recent_activation_rate, 0)}<span class="rep-meta">${r.recent_active_weeks}/8 wks</span></td>
      <td class="num strong">+${fmtMoneyExact(r.individual_lift)}</td>
    </tr>`
    )
    .join('');

  foot.textContent =
    `Cohort baseline: ${fmtMoney(rec.current_avg_weekly_sov)}/wk · ` +
    `total ${rec.bench_candidates_total} bench candidates considered · ` +
    `top ${rec.priority_reps.length} shown.`;
}

// ---------- Per-rank productivity table ----------
function renderRankTable(cd) {
  const rows = cd.per_rank;
  const r1 = rows.find((r) => r.rank === 1);
  const baseSpc = r1 ? r1.sov_per_contact : null;
  document.getElementById('rank-tbody').innerHTML = rows
    .map((r) => {
      const ratio = baseSpc ? r.sov_per_contact / baseSpc : null;
      const ratioCell =
        ratio == null
          ? '—'
          : r.rank === 1
          ? '<span class="ratio-base">baseline</span>'
          : `<span class="ratio-up">${ratio.toFixed(2)}×</span>`;
      return `
        <tr>
          <td><span class="pill rank-${r.rank}">Rank ${r.rank}</span></td>
          <td class="num">${fmtInt(r.n_reps)}</td>
          <td class="num">${fmtInt(r.contacted)}</td>
          <td class="num">${fmtMoneyExact(r.sov)}</td>
          <td class="num strong">$${Math.round(r.sov_per_contact)}</td>
          <td class="num">${ratioCell}</td>
        </tr>`;
    })
    .join('');
}

// ---------- Trend chart ----------
function renderTrendChart(cd, cohort) {
  const ts = cd.timeseries;
  const ctx = document.getElementById('trend-chart');
  destroyChart('trend');

  const labels = ts.map((t) => t.Date);
  const sov4wk = ts.map((t) => t.total_sov_4wk);
  const r34Reps = ts.map((t) => t.r34_reps);

  state.charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Total SOV (4-wk avg)',
          data: sov4wk,
          yAxisID: 'y1',
          borderColor: COLORS.ink,
          backgroundColor: 'rgba(26,26,28,0.06)',
          borderWidth: 2,
          tension: 0.28,
          pointRadius: 0,
          fill: true,
          order: 2,
        },
        {
          label: 'Rank-3/4 reps active',
          data: r34Reps,
          yAxisID: 'y2',
          borderColor: COLORS.good,
          backgroundColor: 'transparent',
          borderWidth: 1.6,
          borderDash: [4, 4],
          tension: 0.25,
          pointRadius: 0,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#fff',
          titleColor: COLORS.ink,
          bodyColor: COLORS.ink,
          borderColor: COLORS.line,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.yAxisID === 'y1') return `Total SOV (4-wk): ${fmtMoneyExact(ctx.parsed.y)}`;
              return `R3/4 active: ${ctx.parsed.y.toFixed(1)} reps`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 10, color: COLORS.inkMuted }, grid: { display: false } },
        y1: {
          position: 'left',
          ticks: {
            color: COLORS.inkMuted,
            callback: (v) => fmtMoney(v),
          },
          grid: { color: COLORS.line },
          title: { display: true, text: 'Weekly SOV', color: COLORS.inkMuted, font: { size: 11 } },
        },
        y2: {
          position: 'right',
          ticks: { color: COLORS.good },
          grid: { display: false },
          title: { display: true, text: 'R3/4 active', color: COLORS.good, font: { size: 11 } },
        },
      },
    },
  });

  document.getElementById('trend-legend').innerHTML = `
    <span class="legend-item"><span class="swatch" style="background:${COLORS.ink}"></span>Total SOV (4-wk avg)</span>
    <span class="legend-item"><span class="swatch swatch-dash" style="background:${COLORS.good}"></span>R3/4 active reps</span>
  `;
}

// ---------- Monthly chart ----------
function renderMonthlyChart(cohort) {
  const rows = state.monthly[cohort] || [];
  const ctx = document.getElementById('monthly-chart');
  destroyChart('monthly');

  const labels = rows.map((r) => r.month_label);
  const sov = rows.map((r) => r.total_sov);
  const share34 = rows.map((r) => r.share_3_4);

  state.charts.monthly = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Monthly SOV',
          data: sov,
          backgroundColor: 'rgba(45,98,196,0.55)',
          borderColor: COLORS.neutral,
          borderWidth: 1,
          yAxisID: 'y1',
          order: 2,
        },
        {
          type: 'line',
          label: 'R3/4 contact share',
          data: share34,
          borderColor: COLORS.good,
          backgroundColor: COLORS.good,
          borderWidth: 2,
          tension: 0.25,
          yAxisID: 'y2',
          pointRadius: 2,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          align: 'center',
          labels: { color: COLORS.inkMuted, padding: 16, boxWidth: 12 },
        },
        tooltip: {
          backgroundColor: '#fff',
          titleColor: COLORS.ink,
          bodyColor: COLORS.ink,
          borderColor: COLORS.line,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.type === 'bar') return `SOV: ${fmtMoneyExact(ctx.parsed.y)}`;
              return `R3/4 share: ${(ctx.parsed.y * 100).toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: COLORS.inkMuted, maxRotation: 0 }, grid: { display: false } },
        y1: {
          position: 'left',
          ticks: { color: COLORS.inkMuted, callback: (v) => fmtMoney(v) },
          grid: { color: COLORS.line },
        },
        y2: {
          position: 'right',
          min: 0,
          max: 1,
          ticks: { color: COLORS.good, callback: (v) => Math.round(v * 100) + '%' },
          grid: { display: false },
        },
      },
    },
  });
}

// ---------- helpers ----------
function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    state.charts[key] = null;
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot();
