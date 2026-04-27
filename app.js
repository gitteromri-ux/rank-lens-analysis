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
let MONTHLY = {};
let CURRENT = "Overall";
let charts = { main: null, ts: null, bin: null, compare: null, monthly: null };

const fmtPct = (v, digits=1) => v == null ? "—" : `${(v*100).toFixed(digits)}%`;
const fmtInt = n => n == null ? "—" : Math.round(n).toLocaleString("en-US");
const fmtNum = (n, d=0) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

Chart.register(window['chartjs-plugin-annotation']);
Chart.defaults.font.family = "General Sans, Satoshi, -apple-system, BlinkMacSystemFont, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = COLORS.inkMuted;
Chart.defaults.borderColor = COLORS.line;

async function boot(){
  const [d, k, m] = await Promise.all([
    fetch("./data.json").then(r => r.json()),
    fetch("./kpis.json").then(r => r.json()),
    fetch("./monthly.json").then(r => r.json()).catch(() => ({}))
  ]);
  DATA = d; KPIS = k; MONTHLY = m;
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
  const isWeakSignal = Math.abs(d.spearman_r) < 0.15 || d.spearman_p > 0.10;
  const optLow  = d.optimal_low;
  const optHigh = d.optimal_high;

  if(isWeakSignal){
    document.getElementById("verOptimal").textContent = "Not identifiable";
    document.getElementById("verOptimalDetail").textContent = 
      `No statistically meaningful relationship in this school (ρ=${d.spearman_r.toFixed(2)}, p=${d.spearman_p.toFixed(2)}). Curve is flat within noise.`;
    document.getElementById("verBad").textContent = "—";
    document.getElementById("verBadDetail").textContent = 
      `No bad zone with the signal this weak — SOV doesn’t respond reliably to rank 3–4 share.`;
  } else {
    const optVal = (optLow != null && optHigh != null) ? `${fmtPct(optLow,0)}–${fmtPct(optHigh,0)}` : "—";
    document.getElementById("verOptimal").textContent = optVal;
    document.getElementById("verOptimalDetail").textContent = 
      (optLow != null)
        ? `SOV within 3% of peak when rank 3–4 share is in this band.`
        : "Not identifiable from current data.";

    const badTxt = buildBadText(d);
    document.getElementById("verBad").textContent = badTxt.value;
    document.getElementById("verBadDetail").textContent = badTxt.detail;
  }

  document.getElementById("verPeak").textContent = fmtNum(d.sov_peak, 0);
  document.getElementById("verPeakDetail").textContent = 
    `At ${fmtPct(d.optimal_center, 0)} share — vs ${fmtNum(d.sov_median, 0)} median.`;

  document.getElementById("verStat").textContent = `ρ = ${d.spearman_r.toFixed(2)}`;
  document.getElementById("verStatDetail").textContent = 
    `Spearman ${d.spearman_r.toFixed(2)}, Pearson ${d.pearson_r.toFixed(2)} (p=${d.pearson_p < 0.001 ? "<0.001" : d.pearson_p.toFixed(3)}) · n=${d.n_weeks}`;

  // Operating-point banner: where the call center actually runs vs. optimal
  renderOperatingBar(cat, d);

  // Main chart
  renderMainChart(cat, d);
  renderTSChart(cat, d);
  renderBinChart(cat, d);
  renderDailyScatter(cat, d);
  renderMonthly(cat);

  // Chart note
  document.getElementById("chartNote").textContent = chartNote(cat, d);
  document.getElementById("binNote").innerHTML = binNote(cat, d);
  document.getElementById("dailyNote").innerHTML = dailyNote(cat, d);

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

/* Narrates what happens BELOW the optimal range — the user's explicit question. */
function binNote(cat, d){
  const lo = d.optimal_low;
  const isWeak = Math.abs(d.spearman_r) < 0.15 || d.spearman_p > 0.10;
  if(isWeak){
    return `<b>No defensible optimal threshold</b> for this school (ρ=${d.spearman_r.toFixed(2)}, p=${d.spearman_p.toFixed(2)}). ` +
           `The histogram below shows mean SOV by rank 3–4 share bucket — bars are roughly flat across the observed range, ` +
           `which is consistent with SOV being insensitive to rank mix here.`;
  }
  if(lo == null) return `Below-optimal behaviour cannot be characterised for this school.`;

  const below = d.scatter.filter(p => p.x < lo);
  const withinOrAbove = d.scatter.filter(p => p.x >= lo);
  const total = d.scatter.length;

  const loPct = fmtPct(lo, 0);

  if(below.length === 0){
    return `<b>Below ${loPct}:</b> <span class="bin-note-val">0 of ${total} weeks</span>. ` +
           `The call-centre has never operated below the optimal-low threshold — ` +
           `so below-range buckets in the histogram are shown empty. The risk here is theoretical: ` +
           `every observed week sits at or above the optimal floor.`;
  }

  const meanBelow = below.reduce((a,p)=>a+p.y,0) / below.length;
  const meanIn = withinOrAbove.length ? withinOrAbove.reduce((a,p)=>a+p.y,0) / withinOrAbove.length : null;
  const delta = meanIn == null ? null : meanBelow - meanIn;
  const deltaTxt = delta == null ? "" :
    ` — that is <b>${delta >= 0 ? "+" : ""}${fmtNum(delta,0)}</b> vs. weeks in or above optimal (${fmtNum(meanIn,0)}).`;

  const direction = delta >= 0
    ? `Counter-intuitively, below-optimal weeks averaged <i>higher</i> SOV`
    : `As expected, below-optimal weeks averaged lower SOV`;

  return `<b>Below ${loPct}:</b> <span class="bin-note-val">${below.length} of ${total} weeks</span>, ` +
         `mean SOV <b>${fmtNum(meanBelow,0)}</b>${deltaTxt} ${direction}. ` +
         `The sample is thin, so treat the direction as indicative, not conclusive.`;
}

function buildInsight(cat, d){
  const sig = signalLabel(d.spearman_r, d.spearman_p);
  const tr = trendLabel(d.trend);
  const isWeak = Math.abs(d.spearman_r) < 0.15 || d.spearman_p > 0.10;
  let lede = "";

  if(isWeak){
    lede = `In ${cat === "Overall" ? "the blended call-center view" : cat}, the relationship between rank 3–4 share and SOV is <strong>not statistically meaningful</strong> (ρ = ${d.spearman_r.toFixed(2)}, p = ${d.spearman_p.toFixed(2)}). The smoothed curve is essentially flat across the observed range, and the apparent "peak" near <strong>${fmtPct(d.optimal_center,0)}</strong> is within noise. We can’t identify a defensible optimal band from this dataset — SOV in this school appears insensitive to which rank tier is doing the contacting.`;
  } else if(cat === "Overall"){
    lede = `Across the call center, SOV peaks near <strong>${fmtPct(d.optimal_center,0)}</strong> rank 3–4 share and degrades as that share climbs toward saturation. Chasing a higher rank 3–4 concentration actively hurts blended SOV.`;
  } else {
    lede = `<strong>Counterintuitively,</strong> SOV in ${cat} is <em>not</em> maximized by concentrating contacts with the top tier. The curve peaks around <strong>${fmtPct(d.optimal_center,0)}</strong> rank 3–4 share — a broader roster, including rank 1–2 reps, outperforms weeks when only top reps are active. The operational read: weeks where only top reps show up are often under-staffed weeks, and volume suffers.`;
  }

  const recLine = buildRecommendation(cat, d, isWeak);

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

function buildRecommendation(cat, d, isWeak){
  if(isWeak){
    return `<strong>Recommendation:</strong> Don’t over-read the curve here. With no statistically meaningful relationship in the data, optimising rank 3–4 share won’t reliably move SOV in this school — staffing decisions should be made on volume and capacity grounds rather than rank-mix targets. The lift, if any, is below the noise floor.`;
  }
  return `<strong>Target:</strong> Don't chase saturation. Operate at <strong>${fmtPct(d.optimal_low,0)}–${fmtPct(d.optimal_high,0)}</strong>. <em>Above ${fmtPct(d.bad_high_threshold||0.9,0)}</em>, SOV is pressured — usually a signal that volume has thinned. Ensure rank 1–2 reps are on the phones and contributing base load.`;
}

/* ─── OPERATING POINT BANNER ─── */

function renderOperatingBar(cat, d){
  const op = d.operating;
  const bar = document.getElementById('opBar');
  if(!op || op.current_share == null){
    if(bar) bar.style.display = 'none';
    return;
  }
  if(bar) bar.style.display = '';

  const cur = op.current_share;          // trailing 4-week mean share
  const med = op.all_time_share_p50;     // long-term median share
  const optLow = d.optimal_low;
  const optHigh = d.optimal_high;
  const badHigh = d.bad_high_threshold;

  // Position bands & markers as % of full 0–100% track
  const pct = v => `${Math.max(0, Math.min(100, v * 100))}%`;

  const bandOpt = document.getElementById('opBandOpt');
  if(optLow != null && optHigh != null){
    bandOpt.style.display = '';
    bandOpt.style.left = pct(optLow);
    bandOpt.style.width = `${(optHigh - optLow) * 100}%`;
  } else {
    bandOpt.style.display = 'none';
  }

  const bandBad = document.getElementById('opBandBad');
  if(badHigh != null){
    bandBad.style.display = '';
    bandBad.style.left = pct(badHigh);
    bandBad.style.width = `${(1 - badHigh) * 100}%`;
  } else {
    bandBad.style.display = 'none';
  }

  // Current marker (red dot, label above)
  const mkCur = document.getElementById('opMarkerCurrent');
  mkCur.style.left = pct(cur);
  document.getElementById('opMarkerLabelCurrent').textContent =
    `Current ${fmtPct(cur, 1)}`;

  // Long-term median marker (neutral tick, label below)
  const mkMed = document.getElementById('opMarkerMedian');
  if(med != null){
    mkMed.style.display = '';
    mkMed.style.left = pct(med);
    document.getElementById('opMarkerLabelMedian').textContent =
      `All-time median ${fmtPct(med, 0)}`;
  } else {
    mkMed.style.display = 'none';
  }

  // Headline copy
  const where = cat === 'Overall' ? 'The call center' : `${cat}`;
  const optTxt = (optLow != null && optHigh != null)
    ? `${fmtPct(optLow,0)}–${fmtPct(optHigh,0)}`
    : '—';
  const isWeakSignal = Math.abs(d.spearman_r) < 0.15 || d.spearman_p > 0.10;

  // Hide optimal band overlay when signal is weak — don’t pretend a noise-level peak is real
  if(isWeakSignal){
    bandOpt.style.display = 'none';
    bandBad.style.display = 'none';
  }

  let verdictWord = 'inside the optimal band';
  if(isWeakSignal){
    verdictWord = `— no defensible optimum in this school`;
  } else if(optHigh != null && cur > optHigh){
    const gap = (cur - optHigh) * 100;
    verdictWord = `${gap.toFixed(1)}pp <b>above</b> optimal`;
  } else if(optLow != null && cur < optLow){
    const gap = (optLow - cur) * 100;
    verdictWord = `${gap.toFixed(1)}pp <b>below</b> optimal`;
  }

  document.getElementById('opTitle').innerHTML =
    `${where} is operating at <b>${fmtPct(cur, 1)}</b> rank 3–4 share ${isWeakSignal ? verdictWord : '— ' + verdictWord + '.'}`;

  const weeks = op.current_weeks || 4;
  const endDate = op.current_week_end
    ? new Date(op.current_week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  document.getElementById('opSub').textContent = isWeakSignal
    ? `Trailing ${weeks}-week average through ${endDate}. No statistically meaningful optimal range identified.`
    : `Trailing ${weeks}-week average through ${endDate}. Optimal range: ${optTxt}.`;

  // Footer narrative
  let foot = '';
  if(isWeakSignal){
    foot = `The relationship between rank 3–4 share and SOV is too weak to act on in this school ` +
           `(ρ=${d.spearman_r.toFixed(2)}, p=${d.spearman_p.toFixed(2)}). ` +
           `The current operating point is shown for reference only. ` +
           `There is no green band because SOV does not reliably respond to rank-mix changes in this school.`;
  } else if(optHigh != null && cur > optHigh){
    foot = `The bar above shows where ${cat === 'Overall' ? 'the call center' : 'this school'} sits today (red dot) versus where SOV peaks (green band). ` +
           `To recover SOV, lower rank 3–4 share toward the <span class="opbar-good">${optTxt}</span> band — ` +
           `that means putting more rank 1–2 reps on the phones, not pulling top reps off them.`;
  } else if(optLow != null && cur < optLow){
    foot = `The current operating point sits below the optimal floor — push more rank 3–4 contacts up to the ` +
           `<span class="opbar-good">${optTxt}</span> band to reach peak SOV.`;
  } else {
    foot = `Currently inside the optimal band — hold this mix.`;
  }
  document.getElementById('opFoot').innerHTML = foot;
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
  const isWeakSignalChart = Math.abs(d.spearman_r) < 0.15 || d.spearman_p > 0.10;
  if(!isWeakSignalChart && d.optimal_low != null && d.optimal_high != null){
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
  if(!isWeakSignalChart && d.bad_low_threshold != null){
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
  if(!isWeakSignalChart && d.bad_high_threshold != null){
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
  // Current operating point — vertical line on the SOV response curve
  if(d.operating && d.operating.current_share != null){
    const cs = d.operating.current_share;
    annotations.currentOpLine = {
      type: 'line',
      xMin: cs, xMax: cs,
      borderColor: COLORS.bad,
      borderWidth: 2,
      borderDash: [6, 4],
      label: {
        display: true,
        content: `Current ${(cs*100).toFixed(1)}%`,
        position: 'start',
        backgroundColor: COLORS.bad,
        color: 'white',
        font: { size: 10, weight: '600', family: 'JetBrains Mono' },
        padding: { x: 6, y: 3 },
        yAdjust: -8
      }
    };
  }

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

  // Fixed 5%-wide buckets across the full 50–100% range for a clean histogram.
  // This makes below-optimal, within-optimal, and above-optimal territory directly comparable.
  const edges = [0.50,0.55,0.60,0.65,0.70,0.75,0.80,0.85,0.90,0.95,1.001];
  const buckets = [];
  for(let i=0;i<edges.length-1;i++){
    buckets.push({ lo: edges[i], hi: edges[i+1] });
  }

  // Compute stats for every bucket, keeping empty ones so the axis tells the full story.
  const bins = buckets.map(b => {
    const pts = d.scatter.filter(p => p.x >= b.lo && p.x < b.hi);
    const mean = pts.length ? pts.reduce((a,p)=>a+p.y,0)/pts.length : null;
    const center = (b.lo + b.hi) / 2;
    return { lo: b.lo, hi: b.hi, center, n: pts.length, sov_mean: mean };
  });

  const labels = bins.map(b => `${Math.round(b.lo*100)}–${Math.round(b.hi*100)}%`);
  const vals = bins.map(b => b.sov_mean);
  const counts = bins.map(b => b.n);

  // Color each bar by region.
  const colors = bins.map(b => {
    if(b.sov_mean == null) return 'rgba(138, 138, 145, 0.15)';  // unobserved
    const c = b.center;
    if(d.optimal_low != null && d.optimal_high != null && c >= d.optimal_low && c <= d.optimal_high) return COLORS.good;
    if(d.bad_low_threshold != null && c <= d.bad_low_threshold) return COLORS.bad;
    if(d.bad_high_threshold != null && c >= d.bad_high_threshold) return COLORS.bad;
    return COLORS.ink;
  });

  // Compute y-axis range across observed values
  const observed = bins.filter(b => b.sov_mean != null).map(b => b.sov_mean);
  const minObs = Math.min(...observed);
  const maxObs = Math.max(...observed);
  const pad = (maxObs - minObs) * 0.15;
  const yMin = Math.floor((minObs - pad) / 10) * 10;
  const yMax = Math.ceil((maxObs + pad) / 10) * 10;

  // For empty buckets, draw a short sentinel bar at the floor so below-optimal territory
  // is VISIBLY present in the chart rather than just blank space.
  const sentinelHeight = yMin + (yMax - yMin) * 0.06;
  const valsForDraw = bins.map(b => b.sov_mean == null ? sentinelHeight : b.sov_mean);

  // Build optimal-range band annotation based on bucket edges
  const optAnnotations = {};
  const isWeakBin = Math.abs(d.spearman_r) < 0.15 || d.spearman_p > 0.10;
  if(!isWeakBin && d.optimal_low != null && d.optimal_high != null){
    // Find bucket indices that fall within optimal
    let startIdx = -1, endIdx = -1;
    bins.forEach((b, i) => {
      if(b.center >= d.optimal_low && b.center <= d.optimal_high){
        if(startIdx === -1) startIdx = i;
        endIdx = i;
      }
    });
    if(startIdx !== -1){
      optAnnotations.optBand = {
        type: 'box',
        xMin: startIdx - 0.5,
        xMax: endIdx + 0.5,
        backgroundColor: 'rgba(42, 127, 82, 0.07)',
        borderColor: 'rgba(42, 127, 82, 0.35)',
        borderWidth: 1,
        borderDash: [4,4],
        label: {
          display: true,
          content: 'Optimal',
          position: 'start',
          color: COLORS.good,
          font: { size: 10, weight: '600', family: 'JetBrains Mono' },
          padding: 4,
          backgroundColor: 'transparent',
          yAdjust: -4
        }
      };
    }
  }
  optAnnotations.median = {
    type: 'line',
    yMin: d.sov_median, yMax: d.sov_median,
    borderColor: COLORS.inkSoft, borderWidth: 1, borderDash: [3,3],
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

  charts.bin = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Mean SOV',
        data: valsForDraw,
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
      layout: { padding: { top: 24 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: COLORS.ink,
          titleColor: 'white',
          bodyColor: 'white',
          padding: 12,
          callbacks: {
            title: (items) => `Rank 3–4 share ${items[0].label}`,
            label: (ctx) => {
              const n = counts[ctx.dataIndex];
              if(n === 0) return 'No weeks observed in this range';
              return [
                `Mean SOV: ${fmtNum(ctx.parsed.y,0)}`,
                `n = ${n} weeks`
              ];
            }
          }
        },
        annotation: { annotations: optAnnotations }
      },
      scales: {
        x: {
          ticks: { color: COLORS.inkMuted, font: { size: 11 } },
          grid: { display: false }
        },
        y: {
          beginAtZero: false,
          min: yMin,
          max: yMax,
          title: { display: true, text: 'Mean SOV per bucket', color: COLORS.inkMuted, font: { size: 11 } },
          ticks: { color: COLORS.inkMuted },
          grid: { color: COLORS.lineSoft, drawBorder: false }
        }
      }
    }
  });
}

/* ─── DAILY SCATTER ─── */

function lowess(points, bandwidth = 0.12){
  // Tricube-weighted local linear smoother. points sorted by x ascending.
  const sorted = [...points].sort((a,b) => a.x - b.x);
  const n = sorted.length;
  if(n < 5) return [];
  const xmin = sorted[0].x, xmax = sorted[n-1].x;
  const grid = [];
  const G = 60;
  for(let i = 0; i <= G; i++) grid.push(xmin + (xmax - xmin) * i / G);
  const out = [];
  for(const gx of grid){
    const span = bandwidth * (xmax - xmin);
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for(const p of sorted){
      const dist = Math.abs(p.x - gx);
      if(dist > span) continue;
      const u = dist / span;
      const w = Math.pow(1 - Math.pow(u, 3), 3);
      sw += w;
      swx += w * p.x;
      swy += w * p.y;
      swxx += w * p.x * p.x;
      swxy += w * p.x * p.y;
    }
    if(sw < 1e-6){ out.push({x: gx, y: null}); continue; }
    const xm = swx/sw, ym = swy/sw;
    const denom = swxx - sw*xm*xm;
    const slope = Math.abs(denom) < 1e-9 ? 0 : (swxy - sw*xm*ym) / denom;
    const y_pred = ym + slope * (gx - xm);
    out.push({x: gx, y: y_pred});
  }
  return out.filter(p => p.y != null);
}

function renderDailyScatter(cat, d){
  const ctx = document.getElementById("dailyScatter").getContext("2d");
  if(charts.daily) charts.daily.destroy();

  const pts = (d.daily_scatter || []).filter(p => p.y >= 0 && p.y < 5000 && p.c >= 10);
  if(pts.length === 0){
    charts.daily = null;
    return;
  }

  // LOWESS curve
  const smooth = lowess(pts, 0.15);

  // Optimal band annotation
  const annots = {};
  const isWeakDaily = Math.abs(d.spearman_r) < 0.15 || d.spearman_p > 0.10;
  if(!isWeakDaily && d.optimal_low != null && d.optimal_high != null){
    annots.optBand = {
      type: 'box', xMin: d.optimal_low, xMax: d.optimal_high,
      backgroundColor: 'rgba(42,127,82,0.07)', borderWidth: 0,
      label: { display: true, content: 'Optimal', position: { x: 'center', y: 'start' },
               color: COLORS.good, font: { size: 10, weight: 'bold' }, backgroundColor: 'transparent' }
    };
  }
  if(!isWeakDaily && d.bad_high_threshold != null){
    annots.badBand = {
      type: 'box', xMin: d.bad_high_threshold, xMax: 1.02,
      backgroundColor: 'rgba(178,59,46,0.05)', borderWidth: 0
    };
  }

  charts.daily = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Daily observation',
          data: pts,
          backgroundColor: 'rgba(45,98,196,0.45)',
          borderColor: 'rgba(45,98,196,0.9)',
          borderWidth: 0.5,
          pointRadius: pts.map(p => Math.max(2, Math.min(7, Math.sqrt(p.c) * 0.35))),
          pointHoverRadius: 6,
          order: 2
        },
        {
          label: 'LOWESS trend',
          data: smooth,
          type: 'line',
          borderColor: COLORS.ink,
          backgroundColor: COLORS.ink,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.4,
          fill: false,
          order: 1
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        annotation: { annotations: annots },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const p = ctx.raw;
              if(p.date){
                return [
                  `Date: ${p.date}`,
                  `Rank 3–4 share: ${(p.x*100).toFixed(1)}%`,
                  `Daily SOV: ${fmtNum(p.y, 0)}`,
                  `Contacted that day: ${fmtNum(p.c, 0)}`
                ];
              }
              return `Trend: ${fmtNum(p.y, 0)} at ${(p.x*100).toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          min: 0, max: 1.02,
          title: { display: true, text: 'Share of contacted from rank 3–4 reps', color: COLORS.inkMuted, font: { size: 11 } },
          ticks: { color: COLORS.inkMuted, callback: v => (v*100).toFixed(0) + '%' },
          grid: { color: COLORS.lineSoft, drawBorder: false }
        },
        y: {
          title: { display: true, text: 'Daily SOV (contacted-weighted)', color: COLORS.inkMuted, font: { size: 11 } },
          ticks: { color: COLORS.inkMuted },
          grid: { color: COLORS.lineSoft, drawBorder: false }
        }
      }
    }
  });
}

/* Narrative caption below the daily scatter. */
function dailyNote(cat, d){
  const pts = (d.daily_scatter || []).filter(p => p.y >= 0 && p.y < 5000 && p.c >= 10);
  if(!pts.length) return `No daily observations available.`;
  const lo = d.optimal_low, hi = d.optimal_high;

  const inOpt = pts.filter(p => lo != null && p.x >= lo && p.x <= hi);
  const above = pts.filter(p => hi != null && p.x > hi);
  const mean = arr => arr.length ? arr.reduce((a,p)=>a+p.y,0)/arr.length : null;

  const mIn = mean(inOpt), mAbove = mean(above);
  const delta = (mIn != null && mAbove != null) ? (mAbove - mIn) : null;

  return `Each point is one trading day. Dot size scales with that day's contacted volume; ` +
         `the dark line is a LOWESS local-trend fit. ` +
         `Across <b>${pts.length}</b> days, the <b>${pts.filter(p => p.c > 50).length}</b> high-volume days ` +
         `sit tightly around the optimal band. ` +
         (delta != null
           ? `Days in optimal averaged <b>${fmtNum(mIn,0)}</b> SOV vs <b>${fmtNum(mAbove,0)}</b> above optimal — a <b>${delta>=0?"+":""}${fmtNum(delta,0)}</b> gap.`
           : ``);
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

/* ===== Monthly contacted-mix vs total SOV ===== */
function renderMonthly(cat){
  const canvas = document.getElementById("monthlyChart");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  if(charts.monthly){ charts.monthly.destroy(); charts.monthly = null; }

  const rows = (MONTHLY && MONTHLY[cat]) ? MONTHLY[cat] : [];
  if(!rows.length){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = rows.map(r => r.month_label);
  const share12 = rows.map(r => r.share_1_2 == null ? 0 : r.share_1_2 * 100);
  const share34 = rows.map(r => r.share_3_4 == null ? 0 : r.share_3_4 * 100);
  const sov     = rows.map(r => r.total_sov);
  const contacted = rows.map(r => r.total_contacted);

  charts.monthly = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Rank 1–2 share",
          data: share12,
          backgroundColor: "rgba(42,127,82,0.85)",
          borderColor: COLORS.good,
          borderWidth: 0,
          stack: "mix",
          yAxisID: "yPct",
          order: 2
        },
        {
          type: "bar",
          label: "Rank 3–4 share",
          data: share34,
          backgroundColor: "rgba(178,59,46,0.85)",
          borderColor: COLORS.bad,
          borderWidth: 0,
          stack: "mix",
          yAxisID: "yPct",
          order: 2
        },
        {
          type: "line",
          label: "Total SOV",
          data: sov,
          borderColor: COLORS.amber,
          backgroundColor: COLORS.amber,
          borderWidth: 2.5,
          pointRadius: 3.5,
          pointHoverRadius: 5,
          pointBackgroundColor: COLORS.amber,
          pointBorderColor: "#fff",
          pointBorderWidth: 1.5,
          tension: 0.25,
          yAxisID: "ySov",
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(26, 26, 28, 0.95)",
          titleColor: "#fff",
          bodyColor: "#e7e6e2",
          padding: 10,
          cornerRadius: 4,
          displayColors: true,
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => {
              const i = ctx.dataIndex;
              if(ctx.dataset.label === "Total SOV"){
                return `Total SOV: ${fmtInt(sov[i])}  (${fmtInt(contacted[i])} contacted)`;
              }
              return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: COLORS.inkMuted, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 }
        },
        yPct: {
          type: "linear",
          position: "left",
          stacked: true,
          min: 0, max: 100,
          grid: { color: COLORS.lineSoft, drawBorder: false },
          ticks: { color: COLORS.inkMuted, callback: (v) => v + "%" },
          title: { display: true, text: "Contacted-share by rank bucket", color: COLORS.inkMuted, font: { size: 11 } }
        },
        ySov: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          grid: { display: false },
          ticks: { color: COLORS.amber, callback: (v) => fmtInt(v) },
          title: { display: true, text: "Total SOV (Course + Upsales)", color: COLORS.amber, font: { size: 11 } }
        }
      }
    }
  });
}

boot();
