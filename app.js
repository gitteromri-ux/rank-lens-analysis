/* Rank Lens — Top-Rep Productivity & Utilization
 * Corrected framing (v3 data):
 *   - Primary metric: TOTAL weekly SOV (not contacted-weighted rate)
 *   - Per-rank productivity gradient is the durable rep-level finding
 *   - r34 utilization (15–23%) is the lever, not the share
 *   - SOV/contact rate kept as a diagnostic, labeled mix-shift artifact
 */

const CATEGORY_ORDER = [
  "Overall",
  "Hebrew Related",
  "Biblical Related",
];

const COLORS = {
  ink:        "#1a1a1c",
  inkMuted:   "#5d5d63",
  inkSoft:    "#8a8a91",
  line:       "rgba(26,26,28,0.10)",
  lineSoft:   "rgba(26,26,28,0.06)",
  good:       "#2f7d4a",
  goodBg:     "rgba(47,125,74,0.10)",
  bad:        "#b44a3c",
  badBg:      "rgba(180,74,60,0.10)",
  amber:      "#b8870a",
  blue:       "#2d62c4",
  neutral:    "#8a8a91",
};

const CATEGORY_COLORS = {
  "Overall":          "#1a1a1c",
  "Hebrew Related":   "#2d62c4",
  "Biblical Related": "#b8870a",
};

let DATA = {};
let KPIS = {};
let MONTHLY = {};
let CURRENT = "Overall";
let charts = { main: null, ts: null, rate: null, daily: null, compare: null, monthly: null };

const fmtPct = (v, digits=1) => v == null ? "—" : `${(v*100).toFixed(digits)}%`;
const fmtInt = n => n == null ? "—" : Math.round(n).toLocaleString("en-US");
const fmtNum = (n, d=0) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMoney = n => n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
const fmtMoneyShort = n => {
  if(n == null) return "—";
  if(Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(2)}M`;
  if(Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};

Chart.register(window['chartjs-plugin-annotation']);

Chart.defaults.font.family = "'General Sans', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = COLORS.inkMuted;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.titleFont = { family: "'General Sans', sans-serif", weight: '600', size: 12 };
Chart.defaults.plugins.tooltip.bodyFont = { family: "'JetBrains Mono', monospace", size: 11 };
Chart.defaults.plugins.tooltip.backgroundColor = "#1a1a1c";
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 6;

/* ------------- header & tabs ------------- */

function renderHeader(){
  document.getElementById("metaRange").textContent =
    `${KPIS.date_range_start} → ${KPIS.date_range_end}`;
  document.getElementById("metaWeeks").textContent = `${KPIS.total_weeks} weeks`;
  document.getElementById("metaReps").textContent = `${KPIS.n_reps} reps`;

  document.getElementById("kpiWeeks").textContent = fmtInt(KPIS.total_weeks);
  document.getElementById("kpiContacted").textContent = fmtInt(KPIS.total_contacted);
  document.getElementById("kpiCats").textContent = KPIS.n_categories;
  const prod = KPIS.rank4_to_rank1_productivity;
  document.getElementById("kpiProd").textContent = prod ? `${prod.toFixed(2)}×` : "—";
}

function renderTabs(){
  const wrap = document.getElementById("tabs");
  wrap.innerHTML = "";
  CATEGORY_ORDER.forEach(cat => {
    if(!DATA[cat]) return;
    const t = document.createElement("button");
    t.className = "tab" + (cat === CURRENT ? " active" : "");
    t.textContent = cat;
    t.dataset.cat = cat;
    t.onclick = () => {
      CURRENT = cat;
      [...wrap.children].forEach(c => c.classList.toggle("active", c.dataset.cat === cat));
      renderCategory(cat);
    };
    wrap.appendChild(t);
  });
}

function signalLabel(r, p){
  const ar = Math.abs(r);
  if(ar > 0.5 && p < 0.01) return { label: "Strong", cls: "pill-strong" };
  if(ar > 0.2) return { label: "Directional", cls: "pill-dir" };
  if(p < 0.05) return { label: "Marginal", cls: "pill-dir" };
  return { label: "Not significant", cls: "pill-weak" };
}

/* ------------- category render ------------- */

function renderCategory(cat){
  const d = DATA[cat];
  if(!d) return;

  const where = cat === "Overall" ? "the call center as a whole" : cat;

  document.getElementById("panelTitle").textContent =
    cat === "Overall" ? "Across the entire call center" : cat;

  document.getElementById("panelSub").textContent =
    `Based on ${d.n_weeks} weekly observations, this view tracks total weekly SOV for ${where} alongside the durable per-rank productivity gradient and how much of the available top-rep roster is actually active week to week.`;

  document.getElementById("panelTag").textContent = `${d.n_weeks} weeks`;

  // verdict cards
  renderVerdictCards(cat, d);

  // operating-point bar (now utilization)
  renderUtilizationBar(cat, d);

  // primary chart: TOTAL SOV vs share
  renderMainChart(cat, d);

  // per-rank table
  renderRankTable(cat, d);

  // time-series + per-contact rate (artifact)
  renderTSChart(cat, d);
  renderRateChart(cat, d);

  // notes
  document.getElementById("chartNote").textContent = chartNote(cat, d);
  document.getElementById("rateNote").textContent = rateNote(cat, d);

  // daily scatter
  renderDailyScatter(cat, d);

  // monthly chart
  renderMonthly(cat);

  // narrative
  renderInsight(cat, d);
}

/* ------------- verdict cards ------------- */

function renderVerdictCards(cat, d){
  const prod = d.productivity || {};
  const op = d.operating || {};
  const sTot = d.spearman_total || {};
  const sRep = d.spearman_r34reps || {};

  // Top-rep productivity
  document.getElementById("verProd").textContent =
    prod.ratio_r4_to_r1 ? `${prod.ratio_r4_to_r1.toFixed(2)}×` : "—";
  document.getElementById("verProdDetail").textContent =
    prod.spc_rank4 && prod.spc_rank1
      ? `Rank 4: $${prod.spc_rank4.toFixed(0)}/contact · Rank 1: $${prod.spc_rank1.toFixed(0)}/contact`
      : "—";

  // Top-rep utilization
  document.getElementById("verUtil").textContent =
    op.r34_utilization != null ? fmtPct(op.r34_utilization, 0) : "—";
  document.getElementById("verUtilDetail").textContent =
    op.current_r34_reps && op.roster_r34
      ? `${op.current_r34_reps.toFixed(1)} active per week · roster of ${op.roster_r34} top reps`
      : "—";

  // Total weekly SOV (current)
  document.getElementById("verSOV").textContent = fmtMoneyShort(op.current_total_sov);
  document.getElementById("verSOVDetail").textContent =
    op.current_total_contacted
      ? `Most recent week ending ${op.current_week_end} · ${fmtInt(op.current_total_contacted)} contacted`
      : "—";

  // Statistical signal — for r34 share vs TOTAL SOV (the headline test)
  const sig = signalLabel(sTot.r ?? 0, sTot.p ?? 1);
  const verStat = document.getElementById("verStat");
  verStat.textContent = sig.label;
  verStat.style.fontSize = "26px";
  document.getElementById("verStatDetail").textContent =
    `r34 share vs total SOV: ρ = ${(sTot.r ?? 0).toFixed(2)} (p = ${formatP(sTot.p)})`;
}

function formatP(p){
  if(p == null) return "—";
  if(p < 0.001) return "<0.001";
  if(p < 0.01) return p.toFixed(3);
  return p.toFixed(2);
}

/* ------------- utilization bar (replaces operating bar) ------------- */

function renderUtilizationBar(cat, d){
  const op = d.operating || {};
  const util = op.r34_utilization;
  const active = op.current_r34_reps;
  const roster = op.roster_r34;

  document.getElementById("opTitle").textContent =
    util != null ? `${(util*100).toFixed(0)}% of available top reps are active in any given week` : "—";

  document.getElementById("opSub").textContent =
    active && roster
      ? `Average of ${active.toFixed(1)} of ${roster} rank 3–4 reps active in the most recent 4 weeks. The gap is the lever.`
      : "—";

  // band: full track is "available headroom"; show current marker on it
  const opt = document.getElementById("opBandOpt");
  // Show "target zone" — anything above current as headroom for activation
  if(util != null){
    opt.style.left = `${util*100}%`;
    opt.style.width = `${(1 - util)*100}%`;
  }

  const cur = document.getElementById("opMarkerCurrent");
  if(util != null){
    cur.style.left = `${util*100}%`;
    document.getElementById("opMarkerLabelCurrent").textContent =
      `Current ${(util*100).toFixed(0)}%`;
  }

  // Hide median marker (not relevant here)
  const med = document.getElementById("opMarkerMedian");
  if(med) med.style.display = "none";

  // Foot text
  const headroom = util != null ? (roster - active) : null;
  const foot = document.getElementById("opFoot");
  if(headroom != null){
    foot.innerHTML = `<b>${headroom.toFixed(1)} top reps</b> of the roster are <em>not</em> on the phone in the average week. Activating even a portion of them is the highest-leverage move — top reps convert at <span class="opbar-good"><b>${(d.productivity?.ratio_r4_to_r1 ?? 1).toFixed(2)}×</b></span> the rate of rank-1 reps.`;
  } else {
    foot.textContent = "—";
  }
}

/* ------------- primary chart: total SOV vs share ------------- */

function renderMainChart(cat, d){
  const ctx = document.getElementById("mainChart");
  if(charts.main) charts.main.destroy();

  const scatter = (d.scatter || []).map(p => ({ x: p.x, y: p.y_total, date: p.date, contacted: p.contacted, r34_reps: p.r34_reps }));
  const curve = d.curve_total || { x: [], y: [], lo: [], hi: [] };

  const curveLine = curve.x.map((x, i) => ({ x, y: curve.y[i] }));
  const curveLo = curve.x.map((x, i) => ({ x, y: curve.lo[i] }));
  const curveHi = curve.x.map((x, i) => ({ x, y: curve.hi[i] }));

  charts.main = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "95% band — upper",
          data: curveHi,
          showLine: true,
          borderColor: "transparent",
          backgroundColor: "transparent",
          pointRadius: 0,
          fill: "+1",
          order: 5,
        },
        {
          label: "95% band — lower",
          data: curveLo,
          showLine: true,
          borderColor: "transparent",
          backgroundColor: "rgba(26,26,28,0.06)",
          pointRadius: 0,
          fill: false,
          order: 5,
        },
        {
          label: "Smoothed total SOV",
          data: curveLine,
          showLine: true,
          borderColor: COLORS.ink,
          backgroundColor: COLORS.ink,
          borderWidth: 2.2,
          pointRadius: 0,
          tension: 0.3,
          order: 1,
        },
        {
          label: "Weekly observation",
          data: scatter,
          backgroundColor: "rgba(45,98,196,0.55)",
          borderColor: "rgba(45,98,196,0.85)",
          borderWidth: 1,
          pointRadius: 4,
          pointHoverRadius: 6,
          order: 2,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      animation: { duration: 600 },
      scales: {
        x: {
          type: "linear",
          min: 0, max: 1,
          ticks: { callback: v => `${(v*100).toFixed(0)}%`, color: COLORS.inkSoft },
          grid:  { color: COLORS.lineSoft },
          title: { display: true, text: "Rank 3–4 share of contacted leads", color: COLORS.inkMuted, font: { size: 11, weight: '500' } },
        },
        y: {
          ticks: { callback: v => fmtMoneyShort(v), color: COLORS.inkSoft },
          grid:  { color: COLORS.lineSoft },
          title: { display: true, text: "Total weekly SOV", color: COLORS.inkMuted, font: { size: 11, weight: '500' } },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const p = ctx.raw;
              if(ctx.dataset.label === "Weekly observation"){
                return [
                  `Week of ${p.date}`,
                  `r34 share: ${(p.x*100).toFixed(1)}%`,
                  `Total SOV: ${fmtMoneyShort(p.y)}`,
                  `Contacted: ${fmtInt(p.contacted)}  ·  ${p.r34_reps ?? "—"} top reps`,
                ];
              }
              if(ctx.dataset.label === "Smoothed total SOV"){
                return [
                  `r34 share: ${(p.x*100).toFixed(1)}%`,
                  `Smoothed SOV: ${fmtMoneyShort(p.y)}`,
                ];
              }
              return null;
            },
          },
        },
      },
    },
  });
}

function chartNote(cat, d){
  const sTot = d.spearman_total || {};
  const sRep = d.spearman_r34reps || {};
  const r = sTot.r;
  const p = sTot.p;
  const dirWord = r == null ? "—"
                : Math.abs(r) < 0.1 ? "essentially flat"
                : r > 0 ? "slightly positive"
                : "slightly negative";

  return `Across ${d.n_weeks} weeks, total weekly SOV is ${dirWord} vs r34 share (Spearman ρ = ${(r ?? 0).toFixed(2)}, p = ${formatP(p)}). The relationship between number of top reps active and total SOV is materially stronger (ρ = ${(sRep.r ?? 0).toFixed(2)}, p = ${formatP(sRep.p)}) — the lever is reps activated, not the mix percentage.`;
}

function rateNote(cat, d){
  const sR = d.spearman_rate || {};
  return `SOV per contacted lead falls modestly as r34 share rises (ρ = ${(sR.r ?? 0).toFixed(2)}, p = ${formatP(sR.p)}). This is a mix-shift artifact: top reps in this dataset are typically assigned higher contact volumes, and a ratio with rising contacts in the denominator drops even when the numerator is also rising. Total SOV — shown above — is the metric that tracks revenue.`;
}

/* ------------- per-rank productivity table ------------- */

function renderRankTable(cat, d){
  const rows = d.per_rank || [];
  if(!rows.length){
    document.getElementById("rankTable").innerHTML = "";
    return;
  }
  const maxSpc = Math.max(...rows.map(r => r.sov_per_contact));
  const totContacted = rows.reduce((s, r) => s + r.contacted, 0);

  const head = `
    <div class="rt-row">
      <div class="rt-head">Rank</div>
      <div class="rt-head">SOV per contact</div>
      <div class="rt-head">Total contacted</div>
      <div class="rt-head">Total SOV</div>
      <div class="rt-head">Reps in tier</div>
    </div>`;

  const body = rows.map(r => {
    const pct = (r.sov_per_contact / maxSpc) * 100;
    return `
      <div class="rt-row">
        <div class="rt-rank">R${r.rank}</div>
        <div class="rt-cell">
          <div class="rt-bar-wrap">
            <div class="rt-bar-track">
              <div class="rt-bar rt-bar-r${r.rank}" style="width:${pct}%;"></div>
            </div>
            <div class="rt-bar-val">$${r.sov_per_contact.toFixed(0)}</div>
          </div>
        </div>
        <div class="rt-cell rt-num">${fmtInt(r.contacted)} (${((r.contacted/totContacted)*100).toFixed(1)}%)</div>
        <div class="rt-cell rt-num">${fmtMoneyShort(r.sov)}</div>
        <div class="rt-cell rt-num">${r.n_reps}</div>
      </div>`;
  }).join("");

  document.getElementById("rankTable").innerHTML = head + body;
}

/* ------------- weekly progression ------------- */

function renderTSChart(cat, d){
  const ctx = document.getElementById("tsChart");
  if(charts.ts) charts.ts.destroy();

  const ts = d.timeseries || [];
  const labels = ts.map(p => p.Date);
  const share  = ts.map(p => p.rank34_share * 100);
  const sov    = ts.map(p => p.total_sov_4wk);

  charts.ts = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: "line",
          label: "Rank 3–4 share (%)",
          data: share,
          yAxisID: "yShare",
          borderColor: COLORS.neutral,
          backgroundColor: "transparent",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.25,
          order: 2,
        },
        {
          type: "line",
          label: "Total SOV (4-wk)",
          data: sov,
          yAxisID: "ySov",
          borderColor: COLORS.amber,
          backgroundColor: "rgba(184,135,10,0.08)",
          borderWidth: 2.2,
          pointRadius: 0,
          tension: 0.25,
          fill: true,
          order: 1,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      animation: { duration: 600 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'category',
          ticks: {
            color: COLORS.inkSoft, maxRotation: 0, autoSkip: true, maxTicksLimit: 8,
            callback: function(value, index){
              const lbl = this.getLabelForValue ? this.getLabelForValue(value) : labels[index];
              if(!lbl) return "";
              const d = new Date(lbl);
              if(isNaN(d)) return lbl;
              return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            },
          },
          grid:  { color: COLORS.lineSoft },
        },
        yShare: {
          position: "left",
          min: 0, max: 100,
          ticks: { callback: v => `${v}%`, color: COLORS.inkSoft },
          grid:  { color: COLORS.lineSoft },
          title: { display: true, text: "r34 share", color: COLORS.inkMuted, font: { size: 10 } },
        },
        ySov: {
          position: "right",
          ticks: { callback: v => fmtMoneyShort(v), color: COLORS.inkSoft },
          grid:  { display: false },
          title: { display: true, text: "Total SOV", color: COLORS.inkMuted, font: { size: 10 } },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              if(ctx.dataset.yAxisID === 'yShare') return ` r34 share: ${ctx.parsed.y.toFixed(1)}%`;
              return ` Total SOV: ${fmtMoneyShort(ctx.parsed.y)}`;
            },
          },
        },
      },
    },
  });

}

/* ------------- per-contact rate chart (artifact) ------------- */

function renderRateChart(cat, d){
  const ctx = document.getElementById("rateChart");
  if(charts.rate) charts.rate.destroy();

  const scatter = (d.scatter || []).map(p => ({ x: p.x, y: p.y_rate, date: p.date }));
  const curve = d.curve_rate || { x: [], y: [] };
  const curveLine = curve.x.map((x, i) => ({ x, y: curve.y[i] }));

  charts.rate = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Smoothed SOV/contact",
          data: curveLine,
          showLine: true,
          borderColor: COLORS.bad,
          backgroundColor: COLORS.bad,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          borderDash: [4, 4],
          order: 1,
        },
        {
          label: "Weekly observation",
          data: scatter,
          backgroundColor: "rgba(138,138,145,0.45)",
          borderColor: "rgba(138,138,145,0.7)",
          borderWidth: 1,
          pointRadius: 3,
          pointHoverRadius: 5,
          order: 2,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      animation: { duration: 600 },
      scales: {
        x: {
          type: "linear", min: 0, max: 1,
          ticks: { callback: v => `${(v*100).toFixed(0)}%`, color: COLORS.inkSoft },
          grid: { color: COLORS.lineSoft },
          title: { display: true, text: "Rank 3–4 share", color: COLORS.inkMuted, font: { size: 10 } },
        },
        y: {
          ticks: { callback: v => `$${v.toFixed(0)}`, color: COLORS.inkSoft },
          grid:  { color: COLORS.lineSoft },
          title: { display: true, text: "SOV / contact", color: COLORS.inkMuted, font: { size: 10 } },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const p = ctx.raw;
              if(ctx.dataset.label === "Weekly observation"){
                return [`Week of ${p.date}`, `r34 share: ${(p.x*100).toFixed(1)}%`, `SOV/contact: $${p.y.toFixed(0)}`];
              }
              return [`r34 share: ${(p.x*100).toFixed(1)}%`, `Smoothed: $${p.y.toFixed(0)}`];
            },
          },
        },
      },
    },
  });
}

/* ------------- daily scatter ------------- */

function lowess(points, bandwidth = 0.12){
  if(!points.length) return [];
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const xs = sorted.map(p => p.x);
  const ys = sorted.map(p => p.y);
  const n = xs.length;
  const h = Math.max(2, Math.floor(n * bandwidth));
  const out = [];
  const STEP = Math.max(1, Math.floor(n / 200));
  for(let i = 0; i < n; i += STEP){
    const x0 = xs[i];
    const dists = xs.map(x => Math.abs(x - x0));
    const idx = dists.map((d, j) => [d, j]).sort((a, b) => a[0] - b[0]).slice(0, h);
    const maxD = idx[idx.length-1][0] || 1e-9;
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for(const [d, j] of idx){
      const u = d / maxD;
      const w = (1 - u**3)**3;
      sw += w; swx += w*xs[j]; swy += w*ys[j]; swxx += w*xs[j]*xs[j]; swxy += w*xs[j]*ys[j];
    }
    const denom = sw*swxx - swx*swx;
    let yhat;
    if(Math.abs(denom) < 1e-9){
      yhat = swy / sw;
    } else {
      const b = (sw*swxy - swx*swy) / denom;
      const a = (swy - b*swx) / sw;
      yhat = a + b*x0;
    }
    out.push({ x: x0, y: yhat });
  }
  return out;
}

function renderDailyScatter(cat, d){
  const ctx = document.getElementById("dailyScatter");
  if(charts.daily) charts.daily.destroy();

  const pts = (d.daily_scatter || []).filter(p => p.x != null && p.y != null);
  if(!pts.length){
    charts.daily = null;
    document.getElementById("dailyNote").textContent = "No daily-level data available.";
    return;
  }

  const trend = lowess(pts, 0.18);

  charts.daily = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Trend (LOWESS)",
          data: trend,
          showLine: true,
          borderColor: COLORS.ink,
          backgroundColor: COLORS.ink,
          borderWidth: 2.2,
          pointRadius: 0,
          tension: 0.25,
          order: 1,
        },
        {
          label: "Trading day",
          data: pts.map(p => ({ x: p.x, y: p.y, date: p.date, c: p.c })),
          backgroundColor: "rgba(45,98,196,0.4)",
          borderColor: "rgba(45,98,196,0.6)",
          borderWidth: 0.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          order: 2,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      animation: { duration: 600 },
      scales: {
        x: {
          type: "linear", min: 0, max: 1,
          ticks: { callback: v => `${(v*100).toFixed(0)}%`, color: COLORS.inkSoft },
          grid:  { color: COLORS.lineSoft },
          title: { display: true, text: "Rank 3–4 share of daily contacts", color: COLORS.inkMuted, font: { size: 11 } },
        },
        y: {
          ticks: { callback: v => fmtMoneyShort(v), color: COLORS.inkSoft },
          grid:  { color: COLORS.lineSoft },
          title: { display: true, text: "Daily total SOV", color: COLORS.inkMuted, font: { size: 11 } },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const p = ctx.raw;
              if(ctx.dataset.label === "Trading day"){
                return [
                  `${p.date}`,
                  `r34 share: ${(p.x*100).toFixed(1)}%`,
                  `SOV: ${fmtMoneyShort(p.y)}`,
                  `Contacted: ${fmtInt(p.c)}`,
                ];
              }
              return [`r34 share: ${(p.x*100).toFixed(1)}%`, `Trend: ${fmtMoneyShort(p.y)}`];
            },
          },
        },
      },
    },
  });

  document.getElementById("dailyNote").textContent =
    `${pts.length.toLocaleString()} trading days. The trend line shows that the day-to-day relationship between r34 share and total SOV is nearly flat — slight positive on busy days, slight dip when share approaches 100% (which mostly indicates rank 1–2 reps were absent, not that top reps did more).`;
}

/* ------------- comparison: per-rank productivity across schools ------------- */

function renderCompare(){
  const ctx = document.getElementById("compareChart");
  if(charts.compare) charts.compare.destroy();

  const cats = CATEGORY_ORDER.filter(c => DATA[c]);
  const datasets = cats.map((cat, idx) => {
    const rows = DATA[cat].per_rank || [];
    return {
      label: cat,
      data: rows.map(r => r.sov_per_contact),
      backgroundColor: CATEGORY_COLORS[cat],
      borderColor: CATEGORY_COLORS[cat],
      borderWidth: 0,
      borderRadius: 6,
      barPercentage: 0.8,
      categoryPercentage: 0.85,
    };
  });

  charts.compare = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Rank 1", "Rank 2", "Rank 3", "Rank 4"],
      datasets,
    },
    options: {
      maintainAspectRatio: false,
      animation: { duration: 600 },
      scales: {
        x: {
          ticks: { color: COLORS.inkSoft, font: { weight: '600' } },
          grid:  { display: false },
        },
        y: {
          ticks: { callback: v => `$${v}`, color: COLORS.inkSoft },
          grid:  { color: COLORS.lineSoft },
          title: { display: true, text: "SOV per contacted lead", color: COLORS.inkMuted, font: { size: 11 } },
        },
      },
      layout: { padding: { top: 8, right: 16, bottom: 4, left: 4 } },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'center',
          labels: {
            boxWidth: 12, boxHeight: 12,
            color: COLORS.inkMuted,
            font: { size: 12, weight: '500' },
            padding: 16,
            usePointStyle: false,
          },
        },
        tooltip: {
          callbacks: {
            label: c => ` ${c.dataset.label}: $${c.parsed.y.toFixed(0)}/contact`,
          },
        },
      },
    },
  });
}

function renderMatrix(){
  const body = document.getElementById("matrixBody");
  body.innerHTML = "";
  CATEGORY_ORDER.forEach(cat => {
    const d = DATA[cat];
    if(!d) return;
    const prod = d.productivity || {};
    const op = d.operating || {};
    const sTot = d.spearman_total || {};
    const sig = signalLabel(sTot.r ?? 0, sTot.p ?? 1);

    const rhoColor = (sTot.r ?? 0) > 0.05 ? "pill-pos" : (sTot.r ?? 0) < -0.05 ? "pill-neg" : "pill-flat";
    const rhoSign = (sTot.r ?? 0) >= 0 ? "+" : "";

    const row = document.createElement("div");
    row.className = "matrix-row";
    row.innerHTML = `
      <div class="cat" style="border-left:3px solid ${CATEGORY_COLORS[cat]}; padding-left:10px;">${cat}</div>
      <div class="range">$${(prod.spc_rank4 ?? 0).toFixed(0)}/contact</div>
      <div class="range">$${(prod.spc_rank1 ?? 0).toFixed(0)}/contact</div>
      <div><span class="pill pill-strong">${(prod.ratio_r4_to_r1 ?? 0).toFixed(2)}×</span></div>
      <div><span class="pill ${(op.r34_utilization ?? 0) < 0.25 ? 'pill-neg' : 'pill-flat'}">${fmtPct(op.r34_utilization, 0)}</span></div>
      <div><span class="pill ${rhoColor}">ρ=${rhoSign}${(sTot.r ?? 0).toFixed(2)}</span> <span class="pill ${sig.cls}">${sig.label}</span></div>
    `;
    body.appendChild(row);
  });
}

/* ------------- monthly chart ------------- */

function renderMonthly(cat){
  const monthly = MONTHLY[cat];
  if(!monthly || !monthly.length){
    if(charts.monthly){ charts.monthly.destroy(); charts.monthly = null; }
    return;
  }
  const ctx = document.getElementById("monthlyChart");
  if(charts.monthly){ charts.monthly.destroy(); charts.monthly = null; }

  const labels = monthly.map(m => m.month_label);
  const share12 = monthly.map(m => m.share_1_2 * 100);
  const share34 = monthly.map(m => m.share_3_4 * 100);
  const sov     = monthly.map(m => m.total_sov);

  charts.monthly = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Rank 1–2 share",
          data: share12,
          backgroundColor: COLORS.good,
          stack: "share",
          yAxisID: "yShare",
          borderRadius: 0,
          borderSkipped: false,
          order: 3,
        },
        {
          type: "bar",
          label: "Rank 3–4 share",
          data: share34,
          backgroundColor: COLORS.bad,
          stack: "share",
          yAxisID: "yShare",
          borderRadius: 0,
          borderSkipped: false,
          order: 3,
        },
        {
          type: "line",
          label: "Total SOV",
          data: sov,
          borderColor: COLORS.ink,
          backgroundColor: COLORS.ink,
          borderWidth: 2.4,
          tension: 0.25,
          pointRadius: 3,
          pointHoverRadius: 5,
          yAxisID: "ySov",
          order: 1,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      animation: { duration: 600 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          stacked: true,
          ticks: { color: COLORS.inkSoft, maxRotation: 45, minRotation: 45, font: { size: 10 } },
          grid:  { display: false },
        },
        yShare: {
          stacked: true,
          position: "left",
          min: 0, max: 100,
          ticks: { callback: v => `${v}%`, color: COLORS.inkSoft },
          grid:  { color: COLORS.lineSoft },
          title: { display: true, text: "Contacted-lead split", color: COLORS.inkMuted, font: { size: 11 } },
        },
        ySov: {
          position: "right",
          ticks: { callback: v => fmtMoneyShort(v), color: COLORS.inkSoft },
          grid:  { display: false },
          title: { display: true, text: "Total SOV", color: COLORS.inkMuted, font: { size: 11 } },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { boxWidth: 10, boxHeight: 10, color: COLORS.inkMuted, font: { size: 11, weight: '500' } },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              if(ctx.dataset.yAxisID === "yShare") return ` ${ctx.dataset.label}: ${v.toFixed(1)}%`;
              return ` Total SOV: ${fmtMoneyShort(v)}`;
            },
          },
        },
      },
    },
  });
}

/* ------------- narrative box ------------- */

function renderInsight(cat, d){
  const where = cat === "Overall" ? "the call center" : cat;
  const prod = d.productivity || {};
  const op = d.operating || {};
  const sTot = d.spearman_total || {};
  const sRep = d.spearman_r34reps || {};

  const r4_vs_r1 = prod.ratio_r4_to_r1 ? prod.ratio_r4_to_r1.toFixed(2) : "—";
  const top_vs_bot = prod.ratio_top_to_bottom ? prod.ratio_top_to_bottom.toFixed(2) : "—";
  const utilPct = op.r34_utilization != null ? `${(op.r34_utilization*100).toFixed(0)}%` : "—";
  const headroom = (op.roster_r34 != null && op.current_r34_reps != null)
    ? (op.roster_r34 - op.current_r34_reps).toFixed(1)
    : "—";

  const html = `
    <h4>What the data actually says about ${where}</h4>

    <p><strong>The productivity gradient is real.</strong>
       Rank 4 reps convert contacted leads into SOV at <strong>$${(prod.spc_rank4 ?? 0).toFixed(0)} per contact</strong>,
       versus <strong>$${(prod.spc_rank1 ?? 0).toFixed(0)} per contact</strong> for rank 1 reps —
       a <strong>${r4_vs_r1}×</strong> rep-level productivity advantage. Splitting the roster in half (top vs bottom),
       the gap is ${top_vs_bot}× per contact.</p>

    <p><strong>But total weekly SOV is uncorrelated with r34 share.</strong>
       The week-to-week correlation between rank-3–4 share of contacts and total SOV is
       ρ = ${(sTot.r ?? 0).toFixed(2)} (p = ${formatP(sTot.p)}). What <em>does</em> correlate with total SOV
       is the number of top reps actually active that week (ρ = ${(sRep.r ?? 0).toFixed(2)},
       p = ${formatP(sRep.p)}). Share is a ratio; <em>reps activated</em> is the lever.</p>

    <p><strong>Why the per-contact rate looked like a "negative response curve" before:</strong>
       a contacted-weighted ratio rises and falls with whoever is busy. When top reps are activated, they
       absorb extra contact volume and the ratio compresses — even though the total cash is climbing.
       The ratio chart above is preserved as a diagnostic, but it does not represent revenue.</p>

    <p><strong>The bottleneck is utilization, not mix.</strong>
       In the most recent four weeks, only <strong>${utilPct}</strong> of the available top-rep
       roster (${op.roster_r34 ?? "—"} reps total) is active in any given week. That leaves roughly
       <strong>${headroom} top reps</strong> on the bench in the average week. At a ${r4_vs_r1}× productivity multiple,
       activating even half of that bench is the highest-leverage move available — far higher leverage than
       attempting to "rebalance" the contacted-lead mix.</p>

    <p><strong>Recommendation.</strong>
       Stop optimizing for an r34 share target. Instead, set a top-rep <em>activation</em> target — e.g. a floor
       on the number of distinct rank 3–4 reps active per week — and route enough lead volume their way to
       sustain it. The data says SOV scales with how many top reps are on the phones, not with what fraction
       of the call center's contacts they're handling.</p>
  `;
  document.getElementById("insightBox").innerHTML = html;
}

/* ------------- bootstrap ------------- */

(async function init(){
  try {
    const [data, kpis, monthly] = await Promise.all([
      fetch("./data.json").then(r => r.json()),
      fetch("./kpis.json").then(r => r.json()),
      fetch("./monthly.json").then(r => r.json()).catch(() => ({})),
    ]);
    DATA = data; KPIS = kpis; MONTHLY = monthly || {};

    renderHeader();
    renderTabs();
    renderCategory(CURRENT);
    renderCompare();
    renderMatrix();
  } catch (err) {
    console.error("[rank-lens] init failed", err);
    document.body.insertAdjacentHTML("beforeend",
      `<pre style="color:#b44a3c;padding:24px;font-family:monospace;">Failed to load dashboard: ${err.message}</pre>`);
  }
})();
