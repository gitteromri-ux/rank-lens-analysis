/* Rank Lens — SOV Sweet-Spot Analysis */

const CATEGORY_ORDER = [
  "Overall",
  "Biblical Related",
  "Hebrew Related"
];

const COLORS = {
  ink: "#1a1a1c",
  inkMuted: "#5a5a60",
  inkSoft: "#8a8a91",
  line: "#e7e6e2",
  lineSoft: "#efeeea",
  good: "#2a7f52",
  bad: "#b23b2e",
  amber: "#b78a2a",
  neutral: "#2d62c4",
  violet: "#6c5ce7",
  teal: "#16a394"
};

const CATEGORY_COLORS = {
  "Overall": COLORS.ink,
  "Biblical Related": "#6c5ce7",
  "Hebrew Related": "#16a394"
};

let DATA = {};
let KPIS = {};
let CURRENT = "Overall";
let charts = { main: null, ts: null, bin: null, compare: null };

const fmtPct = (v, digits=1) => v == null ? "—" : `${(v*100).toFixed(digits)}%`;
const fmtInt = n => n == null ? "—" : Math.round(n).toLocaleString("en-US");
const fmtNum = (n, d=0) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

Chart.register(window['chartjs-plugin-annotation']);
Chart.defaults.font.family = "General Sans, Satoshi, -apple-system, BlinkMacSystemFont, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = COLORS.inkMuted;
Chart.defaults.borderColor = COLORS.line;

async function boot(){
  const [d, k] = await Promise.all([
    fetch("./data.json").then(r => r.json()),
    fetch("./kpis.json").then(r => r.json())
  ]);
  DATA = d; KPIS = k;
  renderHeader();
  renderTabs();
  renderCategory(CURRENT);
  renderCompare();
  renderMatrix();
}

function renderHeader(){
  const fmt = (s) => {
    const d = new Date(s);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };
  document.getElementById("metaRange").textContent = `${fmt(KPIS.date_range_start)} – ${fmt(KPIS.date_range_end)}`;
  document.getElementById("metaWeeks").textContent = `${KPIS.total_weeks} weeks`;
  document.getElementById("metaReps").textContent = `${KPIS.n_reps} reps`;

  document.getElementById("kpiWeeks").textContent = KPIS.total_weeks;
  document.getElementById("kpiContacted").textContent = fmtInt(KPIS.total_contacted);
  document.getElementById("kpiCats").textContent = KPIS.n_categories;
  document.getElementById("kpiSOV").textContent = fmtNum(KPIS.sov_median_overall, 0);
}

function renderTabs(){
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";
  CATEGORY_ORDER.forEach(cat => {
    if(!DATA[cat]) return;
    const btn = document.createElement("button");
    btn.className = "tab" + (cat === CURRENT ? " active" : "");
    btn.textContent = cat;
    btn.setAttribute("role", "tab");
    btn.addEventListener("click", () => {
      CURRENT = cat;
      [...tabs.children].forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      renderCategory(cat);
    });
    tabs.appendChild(btn);
  });
}

function signalLabel(r, p){
  const abs = Math.abs(r);
  if (abs > 0.5 && p < 0.01) return { label: "Strong", cls: "pill-strong" };
  if (abs > 0.2) return { label: "Directional", cls: "pill-dir" };
  return { label: "Weak", cls: "pill-weak" };
}
function trendLabel(trend){
  if(trend === "positive") return { label: "Positive", cls: "pill-pos", symbol: "↑" };
  if(trend === "negative") return { label: "Negative", cls: "pill-neg", symbol: "↓" };
  return { label: "Flat", cls: "pill-flat", symbol: "—" };
}

function renderCategory(cat){
  const d = DATA[cat];
  if(!d) return;

  // Panel head
  document.getElementById("panelTitle").textContent = cat === "Overall" ? "All schools, blended" : cat;
  document.getElementById("panelSub").textContent = buildSub(cat, d);
  const sig = signalLabel(d.spearman_r, d.spearman_p);
  const tr = trendLabel(d.trend);
  const tag = document.getElementById("panelTag");
  tag.textContent = `${sig.label} · ${tr.label} trend`;
  tag.className = "panel-tag";

  // Verdicts
  const optLow  = d.optimal_low;
  const optHigh = d.optimal_high;
  const optVal = (optLow != null && optHigh != null) ? `${fmtPct(optLow,0)}–${fmtPct(optHigh,0)}` : "—";
  document.getElementById("verOptimal").textContent = optVal;
  document.getElementById("verOptimalDetail").textContent = 
    (optLow != null)
      ? `SOV within 3% of peak when rank 3–4 share is in this band.`
      : "Not identifiable from current data.";

  const badTxt = buildBadText(d);
  document.getElementById("verBad").textContent = badTxt.value;
  document.getElementById("verBadDetail").textContent = badTxt.detail;

  document.getElementById("verPeak").textContent = fmtNum(d.sov_peak, 0);
  document.getElementById("verPeakDetail").textContent = 
    `At ${fmtPct(d.optimal_center, 0)} share — vs ${fmtNum(d.sov_median, 0)} median.`;

  document.getElementById("verStat").textContent = `ρ = ${d.spearman_r.toFixed(2)}`;
  document.getElementById("verStatDetail").textContent = 
    `Spearman ${d.spearman_r.toFixed(2)}, Pearson ${d.pearson_r.toFixed(2)} (p=${d.pearson_p < 0.001 ? "<0.001" : d.pearson_p.toFixed(3)}) · n=${d.n_weeks}`;

  // Main chart
  renderMainChart(cat, d);
  renderTSChart(cat, d);
  renderBinChart(cat, d);

  // Chart note
  document.getElementById("chartNote").textContent = chartNote(cat, d);

  // Narrative
  document.getElementById("insightBox").innerHTML = buildInsight(cat, d);
}

function buildSub(cat, d){
  const where = cat === "Overall" ? "the call center" : `the ${cat} school`;
  return `Based on ${d.n_weeks} weekly observations, this chart shows how SOV in ${where} responds to the share of contacted leads handled by rank 3–4 reps.`;
}

function buildBadText(d){
  // Build the "SOV turns bad" copy based on thresholds
  const low = d.bad_low_threshold;
  const high = d.bad_high_threshold;
  if(low != null && high != null){
    return {
      value: `<${fmtPct(low,0)} or >${fmtPct(high,0)}`,
      detail: "SOV falls below the 25th-percentile at both extremes — avoid the tails."
    };
  }
  if(low != null){
    return {
      value: `Below ${fmtPct(low,0)}`,
      detail: "Under this share, SOV trends below the call-center median."
    };
  }
  if(high != null){
    return {
      value: `Above ${fmtPct(high,0)}`,
      detail: "Counterintuitive: SOV dips as rank 3–4 monopolize the contact volume."
    };
  }
  return { value: "Not visible", detail: "No statistically meaningful bad zone in observed range." };
}

function chartNote(cat, d){
  return `Smoothed curve fit with Gaussian kernel over ${d.n_weeks} weekly observations. ` +
         `Peak smoothed SOV ${fmtNum(d.sov_peak,0)} at rank 3–4 share ${fmtPct(d.optimal_center,1)}. ` +
         `95 % confidence ribbon shown in light grey.`;
}

function buildInsight(cat, d){
  const sig = signalLabel(d.spearman_r, d.spearman_p);
  const tr = trendLabel(d.trend);
  let lede = "";

  if(cat === "Overall"){
    lede = `Across the call center, SOV peaks near <strong>${fmtPct(d.optimal_center,0)}</strong> rank 3–4 share and degrades as that share climbs toward saturation. The pattern is consistent across both Hebrew and Biblical schools — chasing a higher rank 3–4 concentration actively hurts SOV.`;
  } else if(cat === "Biblical Related" || cat === "Hebrew Related"){
    lede = `<strong>Counterintuitively,</strong> SOV in ${cat} is <em>not</em> maximized by concentrating contacts with the top tier. The curve peaks around <strong>${fmtPct(d.optimal_center,0)}</strong> rank 3–4 share — a broader roster, including rank 1–2 reps, outperforms weeks when only top reps are active. The operational read: weeks where only top reps show up are often under-staffed weeks, and volume suffers.`;
  }

  const recLine = buildRecommendation(cat, d);

  return `
    <h4>What this school is telling you</h4>
    <p>${lede}</p>
    <p>${recLine}</p>
    <p style="font-size:13px; color: var(--ink-soft); border-top:1px solid var(--line); padding-top:12px; margin-top:14px;">
      Signal: <strong>${sig.label}</strong> · Trend: ${tr.label} · Typical share p25–p75: 
      ${fmtPct(d.share_p25,0)}–${fmtPct(d.share_p75,0)} · 
      Median SOV ${fmtNum(d.sov_median,0)} vs peak ${fmtNum(d.sov_peak,0)} (<strong>+${fmtNum(d.sov_peak - d.sov_median,0)}</strong>)
    </p>
  `;
}

function buildRecommendation(cat, d){
  const peakLift = d.sov_peak - d.sov_median;
  const pctLift = peakLift / d.sov_median * 100;

  if(cat === "Biblical Related" || cat === "Hebrew Related" || cat === "Overall"){
    return `<strong>Target:</strong> Don't chase saturation. Operate at <strong>${fmtPct(d.optimal_low,0)}–${fmtPct(d.optimal_high,0)}</strong>. <em>Above ${fmtPct(d.bad_high_threshold||0.9,0)}</em>, SOV is pressured — usually a signal that volume has thinned. Ensure rank 1–2 reps are on the phones and contributing base load.`;
  }
  return "";
}

/* ─── CHARTS ─── */

function renderMainChart(cat, d){
  const ctx = document.getElementById("mainChart").getContext("2d");
  if(charts.main) charts.main.destroy();

  const scatter = d.scatter.map(p => ({ x: p.x, y: p.y, date: p.date }));
  const sx = d.smoothed_x;
  const sy = d.smoothed_y;
  const slo = d.smoothed_lo;
  const shi = d.smoothed_hi;

  const line = sx.map((x,i) => ({ x, y: sy[i] }));
  const hiLine = sx.map((x,i) => ({ x, y: shi[i] }));
  const loLine = sx.map((x,i) => ({ x, y: slo[i] }));

  // annotations
  const annotations = {};
  if(d.optimal_low != null && d.optimal_high != null){
    annotations.optBand = {
      type: 'box',
      xMin: d.optimal_low,
      xMax: d.optimal_high,
      backgroundColor: 'rgba(42, 127, 82, 0.09)',
      borderColor: 'rgba(42, 127, 82, 0.3)',
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        display: true,
        content: 'Optimal',
        position: 'start',
        color: COLORS.good,
        font: { size: 10, weight: '600', family: 'JetBrains Mono' },
        padding: 4,
        backgroundColor: 'transparent'
      }
    };
  }
  if(d.bad_low_threshold != null){
    annotations.badLow = {
      type: 'box',
      xMin: Math.max(0, d.share_min - 0.05),
      xMax: d.bad_low_threshold,
      backgroundColor: 'rgba(178, 59, 46, 0.08)',
      borderColor: 'transparent',
      label: { display: false }
    };
    annotations.badLowLine = {
      type: 'line',
      xMin: d.bad_low_threshold, xMax: d.bad_low_threshold,
      borderColor: COLORS.bad, borderWidth: 1, borderDash: [3,3]
    };
  }
  if(d.bad_high_threshold != null){
    annotations.badHigh = {
      type: 'box',
      xMin: d.bad_high_threshold,
      xMax: Math.min(1.02, d.share_max + 0.05),
      backgroundColor: 'rgba(178, 59, 46, 0.08)',
      borderColor: 'transparent',
      label: { display: false }
    };
    annotations.badHighLine = {
      type: 'line',
      xMin: d.bad_high_threshold, xMax: d.bad_high_threshold,
      borderColor: COLORS.bad, borderWidth: 1, borderDash: [3,3]
    };
  }
  annotations.peak = {
    type: 'point',
    xValue: d.optimal_center,
    yValue: d.sov_peak,
    backgroundColor: COLORS.ink,
    borderColor: 'white',
    borderWidth: 2,
    radius: 5
  };
  annotations.medianY = {
    type: 'line',
    yMin: d.sov_median, yMax: d.sov_median,
    borderColor: COLORS.inkSoft, borderWidth: 1, borderDash: [2,4],
    label: {
      display: true,
      content: `Median SOV ${fmtNum(d.sov_median,0)}`,
      position: 'end',
      color: COLORS.inkSoft,
      backgroundColor: 'rgba(255,255,255,0.9)',
      font: { size: 10, family: 'JetBrains Mono' },
      padding: { x: 6, y: 3 }
    }
  };

  charts.main = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'CI High',
          data: hiLine,
          type: 'line',
          borderColor: 'transparent',
          backgroundColor: 'rgba(26,26,28,0.06)',
          pointRadius: 0,
          fill: '+1',
          tension: 0.35,
          order: 4
        },
        {
          label: 'CI Low',
          data: loLine,
          type: 'line',
          borderColor: 'transparent',
          pointRadius: 0,
          fill: false,
          tension: 0.35,
          order: 5
        },
        {
          label: 'Smoothed SOV',
          data: line,
          type: 'line',
          borderColor: COLORS.ink,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.35,
          fill: false,
          order: 1
        },
        {
          label: 'Weekly observations',
          data: scatter,
          backgroundColor: 'rgba(45, 98, 196, 0.55)',
          borderColor: 'white',
          borderWidth: 1,
          pointRadius: 5,
          pointHoverRadius: 7,
          order: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: COLORS.ink,
          titleColor: 'white',
          bodyColor: 'white',
          padding: 12,
          displayColors: false,
          callbacks: {
            title: (items) => {
              const p = items[0].raw;
              return p.date ? new Date(p.date).toLocaleDateString('en-US', {year:'numeric', month:'short', day:'numeric'}) : '';
            },
            label: (item) => {
              const p = item.raw;
              if(item.dataset.label === 'Smoothed SOV') return `Curve: SOV ${fmtNum(p.y,0)} at ${fmtPct(p.x,1)}`;
              if(item.dataset.label === 'Weekly observations') return [
                `Rank 3–4 share: ${fmtPct(p.x,1)}`,
                `SOV (10-wk): ${fmtNum(p.y,0)}`
              ];
              return null;
            }
          }
        },
        annotation: { annotations }
      },
      scales: {
        x: {
          type: 'linear',
          min: Math.max(0, d.share_min - 0.03),
          max: Math.min(1.02, d.share_max + 0.03),
          title: { display: true, text: 'Share of contacted from rank 3–4 reps', color: COLORS.inkMuted, font: { size: 12 } },
          ticks: { callback: (v) => fmtPct(v,0), color: COLORS.inkMuted },
          grid: { color: COLORS.lineSoft, drawBorder: false }
        },
        y: {
          title: { display: true, text: 'SOV (10-week smoothed, contacted-weighted)', color: COLORS.inkMuted, font: { size: 12 } },
          ticks: { color: COLORS.inkMuted },
          grid: { color: COLORS.lineSoft, drawBorder: false }
        }
      }
    }
  });
}

function renderTSChart(cat, d){
  const ctx = document.getElementById("tsChart").getContext("2d");
  if(charts.ts) charts.ts.destroy();

  const ts = d.timeseries;
  const labels = ts.map(r => r.Date);
  const share = ts.map(r => r.rank34_share * 100);
  const sov = ts.map(r => r.sov_10wk_mean);

  charts.ts = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Rank 3–4 share (%)',
          data: share,
          borderColor: COLORS.neutral,
          backgroundColor: 'rgba(45, 98, 196, 0.06)',
          yAxisID: 'y1',
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.25,
          fill: true
        },
        {
          label: 'SOV (10-wk smoothed)',
          data: sov,
          borderColor: COLORS.amber,
          yAxisID: 'y2',
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: COLORS.ink,
          titleColor: 'white',
          bodyColor: 'white',
          padding: 12
        }
      },
      scales: {
        x: {
          ticks: {
            color: COLORS.inkMuted,
            maxTicksLimit: 8,
            callback: function(v){
              const label = this.getLabelForValue(v);
              return new Date(label).toLocaleDateString('en-US',{month:'short', year:'2-digit'});
            }
          },
          grid: { display: false }
        },
        y1: {
          position: 'left',
          title: { display: true, text: 'Rank 3–4 share (%)', color: COLORS.neutral, font: { size: 11 } },
          ticks: { color: COLORS.neutral, callback: v => `${v.toFixed(0)}%` },
          grid: { color: COLORS.lineSoft, drawBorder: false }
        },
        y2: {
          position: 'right',
          title: { display: true, text: 'SOV', color: COLORS.amber, font: { size: 11 } },
          ticks: { color: COLORS.amber },
          grid: { display: false }
        }
      }
    }
  });
}

function renderBinChart(cat, d){
  const ctx = document.getElementById("binChart").getContext("2d");
  if(charts.bin) charts.bin.destroy();

  // Always build bins from scatter for consistency across categories.
  // Adaptive edges based on data spread.
  const xs = d.scatter.map(p => p.x);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  // Choose edges that produce 4-7 bins with enough points each
  let edges;
  if(xmax - xmin > 0.5){
    edges = [0, 0.25, 0.5, 0.65, 0.75, 0.85, 0.95, 1.01];
  } else if(xmax - xmin > 0.3){
    edges = [0, 0.55, 0.65, 0.75, 0.85, 0.9, 0.95, 1.01];
  } else {
    edges = [0.65, 0.75, 0.8, 0.85, 0.9, 0.95, 1.01];
  }
  const buckets = [];
  for(let i=0;i<edges.length-1;i++){
    buckets.push({ lo: edges[i], hi: edges[i+1] });
  }
  let bins = buckets.map(b => {
    const pts = d.scatter.filter(p => p.x >= b.lo && p.x < b.hi);
    return {
      lo: b.lo, hi: b.hi,
      n: pts.length,
      share_center: pts.length ? pts.reduce((a,p)=>a+p.x,0)/pts.length : null,
      sov_mean: pts.length ? pts.reduce((a,p)=>a+p.y,0)/pts.length : null,
    };
  }).filter(b => b.n >= 2);

  const labels = bins.map(b => `${Math.round(b.lo*100)}–${Math.round(b.hi*100)}%`);
  const vals = bins.map(b => b.sov_mean);
  const counts = bins.map(b => b.n);

  // Identify bars inside/outside optimal
  const colors = bins.map(b => {
    const c = b.share_center;
    if(c == null) return COLORS.inkSoft;
    if(d.optimal_low != null && d.optimal_high != null && c >= d.optimal_low && c <= d.optimal_high) return COLORS.good;
    if(d.bad_low_threshold != null && c <= d.bad_low_threshold) return COLORS.bad;
    if(d.bad_high_threshold != null && c >= d.bad_high_threshold) return COLORS.bad;
    return COLORS.ink;
  });

  charts.bin = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Mean SOV',
        data: vals,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 'flex',
        maxBarThickness: 44
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: COLORS.ink,
          titleColor: 'white',
          bodyColor: 'white',
          padding: 12,
          callbacks: {
            label: (ctx) => [
              `Mean SOV: ${fmtNum(ctx.parsed.y,0)}`,
              `n = ${counts[ctx.dataIndex]} weeks`
            ]
          }
        },
        annotation: {
          annotations: {
            median: {
              type: 'line',
              yMin: d.sov_median, yMax: d.sov_median,
              borderColor: COLORS.inkSoft, borderWidth: 1, borderDash: [3,3]
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: COLORS.inkMuted },
          grid: { display: false }
        },
        y: {
          beginAtZero: false,
          title: { display: true, text: 'Mean SOV', color: COLORS.inkMuted, font: { size: 11 } },
          ticks: { color: COLORS.inkMuted },
          grid: { color: COLORS.lineSoft, drawBorder: false }
        }
      }
    }
  });
}

/* ─── COMPARE ─── */

function renderCompare(){
  const ctx = document.getElementById("compareChart").getContext("2d");
  if(charts.compare) charts.compare.destroy();

  const datasets = [];
  CATEGORY_ORDER.forEach(cat => {
    if(!DATA[cat]) return;
    const d = DATA[cat];
    const color = CATEGORY_COLORS[cat];
    datasets.push({
      label: cat,
      data: d.smoothed_x.map((x,i) => ({ x, y: d.smoothed_y[i] })).filter(p => p.y != null),
      borderColor: color,
      backgroundColor: color,
      borderWidth: cat === "Overall" ? 3 : 2,
      borderDash: cat === "Overall" ? [] : [],
      pointRadius: 0,
      tension: 0.3,
      fill: false,
      order: cat === "Overall" ? 0 : 1
    });
    // peak points
    datasets.push({
      label: `${cat} peak`,
      data: [{ x: d.optimal_center, y: d.sov_peak, cat }],
      type: 'scatter',
      backgroundColor: color,
      borderColor: 'white',
      borderWidth: 2,
      pointRadius: 6,
      showLine: false,
      hidden: false
    });
  });

  charts.compare = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          labels: {
            filter: (item) => !item.text.endsWith("peak"),
            color: COLORS.ink,
            font: { size: 12, family: 'General Sans', weight: '500' },
            boxWidth: 12,
            boxHeight: 3,
            padding: 16
          }
        },
        tooltip: {
          backgroundColor: COLORS.ink,
          titleColor: 'white',
          bodyColor: 'white',
          padding: 12,
          filter: (item) => !item.dataset.label.endsWith("peak") || item.raw.cat,
          callbacks: {
            title: (items) => {
              const it = items[0];
              if(it.dataset.label.endsWith("peak")) return `${it.raw.cat} — peak`;
              return it.dataset.label;
            },
            label: (item) => [
              `Share: ${fmtPct(item.parsed.x,1)}`,
              `SOV: ${fmtNum(item.parsed.y,0)}`
            ]
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0.55, max: 1.02,
          title: { display: true, text: 'Share of contacted from rank 3–4 reps', color: COLORS.inkMuted, font: { size: 12 } },
          ticks: { callback: v => fmtPct(v,0), color: COLORS.inkMuted },
          grid: { color: COLORS.lineSoft, drawBorder: false }
        },
        y: {
          title: { display: true, text: 'Smoothed SOV', color: COLORS.inkMuted, font: { size: 12 } },
          ticks: { color: COLORS.inkMuted },
          grid: { color: COLORS.lineSoft, drawBorder: false }
        }
      }
    }
  });
}

/* ─── MATRIX ─── */

function renderMatrix(){
  const body = document.getElementById("matrixBody");
  body.innerHTML = "";
  CATEGORY_ORDER.forEach(cat => {
    const d = DATA[cat]; if(!d) return;
    const optimal = (d.optimal_low != null && d.optimal_high != null) ? `${fmtPct(d.optimal_low,0)}–${fmtPct(d.optimal_high,0)}` : "—";
    const bad = (()=>{
      const parts = [];
      if(d.bad_low_threshold != null) parts.push(`< ${fmtPct(d.bad_low_threshold,0)}`);
      if(d.bad_high_threshold != null) parts.push(`> ${fmtPct(d.bad_high_threshold,0)}`);
      return parts.length ? parts.join(" or ") : "—";
    })();
    const sig = signalLabel(d.spearman_r, d.spearman_p);
    const tr = trendLabel(d.trend);
    const row = document.createElement("div");
    row.className = "matrix-row";
    row.innerHTML = `
      <div class="cat">${cat}</div>
      <div class="range">${optimal}</div>
      <div class="range">${bad}</div>
      <div><span class="pill ${tr.cls}">${tr.symbol} ${tr.label}</span></div>
      <div><span class="pill ${sig.cls}">${sig.label} · ρ=${d.spearman_r.toFixed(2)}</span></div>
      <div style="font-family: var(--font-mono); font-size: 13px; color: var(--ink-muted);">${d.n_weeks}</div>
    `;
    body.appendChild(row);
  });
}

boot();
