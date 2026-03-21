/* Page 3 — EDA
   Tabs: Overview | Risks | Column Drill-down | 2-Column Compare | Correlations
   Column drill-down: treat-as override toggles numeric vs categorical rendering
   Comparison: full multi-chart coverage for num×num, cat×num, cat×cat
*/

let _edaData = null;

// ── Tab switching ─────────────────────────────────────────────────
function edaTab(name) {
  document.querySelectorAll('.eda-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.eda-panel').forEach(p => p.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('eda-' + name)?.classList.add('active');
}

// ── Chart scale defaults ──────────────────────────────────────────
const SCALES = {
  xy: {
    x: {grid: {color: 'rgba(42,42,60,.5)'}},
    y: {grid: {color: 'rgba(42,42,60,.5)'}},
  },
  xOnly: {
    x: {grid: {display: false}},
    y: {grid: {color: 'rgba(42,42,60,.5)'}},
  },
  yOnly: {
    x: {grid: {color: 'rgba(42,42,60,.5)'}},
    y: {grid: {display: false}, ticks: {font: {size: 10}}},
  },
};
function mkChart(id, type, data, options = {}) {
  dc(id);
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  S.charts[id] = new Chart(ctx, {
    type,
    data,
    options: {responsive: true, maintainAspectRatio: false, ...options},
  });
}

// ── Main init ─────────────────────────────────────────────────────
async function initEda() {
  if (!S.sessionId) return;
  try {
    const r = await fetch(API + '/eda', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session_id: S.sessionId}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    _edaData = d;

    const numC = d.num_cols?.length || 0, catC = d.cat_cols?.length || 0;
    document.getElementById('eda-stats').innerHTML = `
      <div class="stat-card"><div class="stat-label">Rows</div><div class="stat-value amber">${fmt(d.n_rows)}</div></div>
      <div class="stat-card"><div class="stat-label">Columns</div><div class="stat-value">${d.n_cols}</div></div>
      <div class="stat-card"><div class="stat-label">Numeric</div><div class="stat-value cyan">${numC}</div></div>
      <div class="stat-card"><div class="stat-label">Categorical</div><div class="stat-value emerald">${catC}</div></div>`;

    _renderOverview(d);
    renderRisks(d.risks || []);
    _populateColumnSelectors();
    renderCorr(d.correlations || {});
  } catch (e) { toast('EDA failed', e.message, 'error'); }
}

// ── Overview tab ──────────────────────────────────────────────────
function _renderOverview(d) {
  mkChart('type-chart', 'doughnut',
    { labels: ['Numeric', 'Categorical'],
      datasets: [{data: [d.num_cols?.length||0, d.cat_cols?.length||0],
                  backgroundColor: ['#22d3ee', '#f5a623'], borderWidth: 0, hoverOffset: 6}] },
    { plugins: {legend: {position: 'bottom', labels: {color: '#a8a8c0', padding: 14}}} }
  );

  const mc = Object.entries(d.missing || {}).filter(([, v]) => v > 0);
  document.getElementById('miss-heatmap').innerHTML = !mc.length
    ? `<span class="badge badge-emerald">No missing values</span>`
    : mc.map(([c, n]) => {
        const p = (n / d.n_rows * 100).toFixed(1);
        const col = p > 30 ? 'var(--rose)' : p > 10 ? 'var(--amber)' : 'var(--cyan)';
        return metricBar(c, p + '%', col, parseFloat(p));
      }).join('');

  if (d.stats && Object.keys(d.stats).length) {
    const cols = Object.keys(d.stats);
    const rows = ['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max'];
    document.getElementById('stats-tbl').innerHTML =
      `<thead><tr><th>Stat</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
       <tbody>${rows.map(row =>
         `<tr><td style="color:var(--text-2)">${row}</td>${cols.map(col =>
           `<td>${fmtN(d.stats[col]?.[row], 3)}</td>`).join('')}</tr>`
       ).join('')}</tbody>`;
  }
}

// ── Risks tab ─────────────────────────────────────────────────────
function renderRisks(risks) {
  const icons = {error: '&#128308;', warn: '&#128993;', info: '&#128309;'};
  const counts = {error: 0, warn: 0, info: 0};
  risks.forEach(r => counts[r.level] = (counts[r.level] || 0) + 1);
  document.getElementById('risk-summary').textContent =
    `${counts.error} errors · ${counts.warn} warnings · ${counts.info} info`;
  document.getElementById('risks-list').innerHTML = !risks.length
    ? `<div class="flex-center gap-8"><span class="badge badge-emerald">No issues detected</span></div>`
    : risks.map(r => `
        <div class="risk-item ${r.level}">
          <div style="font-size:16px;flex-shrink:0">${icons[r.level]}</div>
          <div>
            <div class="risk-col">${r.col || 'DATASET'}</div>
            <div class="risk-title">${r.issue}</div>
            <div class="risk-detail">${r.detail}</div>
          </div>
        </div>`).join('');
}

// ── Column selectors ──────────────────────────────────────────────
function _populateColumnSelectors() {
  const opts = S.columns.map(c => `<option value="${c}">${c}</option>`).join('');
  ['drill-col', 'cmp-a', 'cmp-b'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
  const b = document.getElementById('cmp-b');
  if (b && S.columns.length > 1) b.selectedIndex = 1;
}

// ── Column drill-down ─────────────────────────────────────────────
async function drillColumn() {
  const col = document.getElementById('drill-col').value;
  const treatAs = document.getElementById('drill-treat-as').value;
  if (!col || !S.sessionId) return;
  try {
    const r = await fetch(API + '/eda/column', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session_id: S.sessionId, column: col, treat_as: treatAs}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    _renderColumnProfile(d);
  } catch (e) { toast('Column drill-down failed', e.message, 'error'); }
}

function _renderColumnProfile(d) {
  const el = document.getElementById('drill-result');
  const overrideNote = d.treat_as_override
    ? `<div style="color:var(--amber);font-size:12px;margin-bottom:12px;padding:8px 12px;background:rgba(245,166,35,0.06);border-radius:6px;border-left:3px solid var(--amber)">
         Displaying as <strong>${d.kind}</strong> (user override)
       </div>` : '';

  const header = overrideNote + `
    <div class="grid-4 mb-16">
      <div class="stat-card"><div class="stat-label">Kind</div><div class="stat-value" style="font-size:13px">${d.kind}</div></div>
      <div class="stat-card"><div class="stat-label">Unique Values</div><div class="stat-value cyan">${fmt(d.n_unique)}</div></div>
      <div class="stat-card"><div class="stat-label">Missing</div><div class="stat-value ${d.pct_missing > 20 ? 'rose' : ''}">${d.pct_missing}%</div></div>
      <div class="stat-card"><div class="stat-label">Dtype</div><div class="stat-value" style="font-size:13px;font-family:var(--font-mono)">${d.dtype}</div></div>
    </div>`;

  if (d.kind === 'numeric_continuous') _renderNumericProfile(el, d, header);
  else if (d.kind === 'numeric_discrete') _renderDiscreteProfile(el, d, header);
  else _renderCategoricalProfile(el, d, header);
}

function _renderNumericProfile(el, d, header) {
  el.innerHTML = header + `
    <div class="grid-2">
      <div>
        <div class="text-xs text-muted mb-8">Percentile distribution</div>
        ${metricBar('Min',    d.min, 'var(--cyan)',    0)}
        ${metricBar('P25',    d.p25, 'var(--text-2)', 25)}
        ${metricBar('Median', d.p50, 'var(--emerald)',50)}
        ${metricBar('P75',    d.p75, 'var(--amber)',  75)}
        ${metricBar('Max',    d.max, 'var(--rose)',   100)}
        <div class="grid-2 mt-12">
          <div class="stat-card"><div class="stat-label">Mean</div><div class="stat-value" style="font-size:18px">${fmtN(d.mean,3)}</div></div>
          <div class="stat-card"><div class="stat-label">Std Dev</div><div class="stat-value" style="font-size:18px">${fmtN(d.std,3)}</div></div>
          <div class="stat-card"><div class="stat-label">Skewness</div><div class="stat-value ${Math.abs(d.skewness||0)>2?'rose':''}" style="font-size:18px">${fmtN(d.skewness,3)}</div></div>
          <div class="stat-card"><div class="stat-label">Kurtosis</div><div class="stat-value" style="font-size:18px">${fmtN(d.kurtosis,3)}</div></div>
        </div>
        <div class="stat-card mt-8"><div class="stat-label">Outliers (IQR rule)</div><div class="stat-value ${(d.outlier_count||0)>0?'amber':''}" style="font-size:20px">${d.outlier_count||0}</div></div>
      </div>
      <div>
        <div class="text-xs text-muted mb-4">Histogram</div>
        <div style="height:160px"><canvas id="drill-hist"></canvas></div>
        <div class="text-xs text-muted mb-4 mt-12">Box plot (IQR)</div>
        <div style="height:70px"><canvas id="drill-box"></canvas></div>
      </div>
    </div>`;

  if (d.histogram?.counts) {
    const labels = d.histogram.edges.slice(0,-1).map((e,i) => ((e+d.histogram.edges[i+1])/2).toFixed(2));
    mkChart('drill-hist', 'bar',
      {labels, datasets: [{data: d.histogram.counts, backgroundColor: 'rgba(245,166,35,0.55)', borderColor: '#f5a623', borderWidth: 1}]},
      {plugins: {legend: {display: false}}, scales: {...SCALES.xy, x: {...SCALES.xy.x, ticks: {maxTicksLimit: 8}}}}
    );
  }
  // Box plot via floating bar
  mkChart('drill-box', 'bar',
    { labels: [d.col || ''],
      datasets: [
        {data: [[d.min, d.p25]], backgroundColor: 'transparent', borderColor: '#22d3ee', borderWidth: 2, borderSkipped: false},
        {data: [[d.p25, d.p75]], backgroundColor: 'rgba(245,166,35,0.35)', borderColor: '#f5a623', borderWidth: 2, borderSkipped: false},
        {data: [[d.p75, d.max]], backgroundColor: 'transparent', borderColor: '#22d3ee', borderWidth: 2, borderSkipped: false},
      ] },
    { indexAxis: 'y', plugins: {legend: {display: false}}, scales: SCALES.xy }
  );
}

function _renderDiscreteProfile(el, d, header) {
  const vc = d.value_counts || {};
  const entries = Object.entries(vc).slice(0, 20);
  const total = entries.reduce((s, [,v]) => s + v, 0);
  el.innerHTML = header + `
    <div style="color:var(--amber);font-size:12px;margin-bottom:12px;padding:8px 12px;background:rgba(245,166,35,0.06);border-radius:6px;border-left:3px solid var(--amber)">
      ${d.n_unique} unique integer values — may be a categorical label (0/1/2…) encoded as a number.
      Use the "Treat as" selector to change if needed.
    </div>
    <div class="grid-2">
      <div>
        <div class="text-xs text-muted mb-8">Value counts</div>
        ${entries.map(([k, v]) => {
          const pct = (v / total * 100).toFixed(1);
          return metricBar(String(k), `${v} (${pct}%)`, 'var(--amber)', parseFloat(pct));
        }).join('')}
      </div>
      <div>
        <div class="text-xs text-muted mb-4">Bar chart</div>
        <div style="height:200px"><canvas id="drill-disc-bar"></canvas></div>
        <div class="text-xs text-muted mb-4 mt-10">Pie chart</div>
        <div style="height:150px"><canvas id="drill-disc-pie"></canvas></div>
      </div>
    </div>`;

  mkChart('drill-disc-bar', 'bar',
    { labels: entries.map(([k]) => String(k)),
      datasets: [{data: entries.map(([,v]) => v), backgroundColor: CC.map(c=>c+'88'), borderColor: CC, borderWidth: 2}] },
    { plugins: {legend: {display: false}}, scales: SCALES.xOnly }
  );
  mkChart('drill-disc-pie', 'pie',
    { labels: entries.map(([k]) => String(k)),
      datasets: [{data: entries.map(([,v]) => v), backgroundColor: CC, borderWidth: 0}] },
    { plugins: {legend: {position: 'right', labels: {color:'#a8a8c0', boxWidth:10, padding:8, font:{size:10}}}} }
  );
}

function _renderCategoricalProfile(el, d, header) {
  const tv = d.top_values || {}, tvp = d.top_values_pct || {};
  const entries = Object.entries(tv).slice(0, 15);
  el.innerHTML = header + `
    <div class="grid-2">
      <div>
        <div class="text-xs text-muted mb-8">Top values by frequency</div>
        ${entries.map(([k]) => metricBar(String(k), tvp[k]+'%', 'var(--cyan)', parseFloat(tvp[k]||0))).join('')}
      </div>
      <div>
        <div class="text-xs text-muted mb-4">Frequency bar chart</div>
        <div style="height:200px"><canvas id="drill-cat-bar"></canvas></div>
        <div class="text-xs text-muted mb-4 mt-10">Pie chart</div>
        <div style="height:150px"><canvas id="drill-cat-pie"></canvas></div>
      </div>
    </div>`;

  mkChart('drill-cat-bar', 'bar',
    { labels: entries.map(([k]) => String(k).length>14 ? k.slice(0,13)+'…' : k),
      datasets: [{data: entries.map(([,v]) => v), backgroundColor: 'rgba(34,211,238,0.5)', borderColor: '#22d3ee', borderWidth: 1}] },
    { indexAxis: 'y', plugins: {legend: {display: false}}, scales: SCALES.yOnly }
  );
  mkChart('drill-cat-pie', 'pie',
    { labels: entries.map(([k]) => String(k)),
      datasets: [{data: entries.map(([,v]) => v), backgroundColor: CC, borderWidth: 0}] },
    { plugins: {legend: {position: 'right', labels: {color:'#a8a8c0', boxWidth:10, padding:8, font:{size:10}}}} }
  );
}

// ─────────────────────────────────────────────────────────────────
// TWO-COLUMN COMPARISON
// All three pair types get MULTIPLE charts side by side
// ─────────────────────────────────────────────────────────────────
async function runCompare() {
  const a = document.getElementById('cmp-a').value;
  const b = document.getElementById('cmp-b').value;
  const ta = document.getElementById('cmp-treat-a').value;
  const tb = document.getElementById('cmp-treat-b').value;
  if (!a || !b || a === b) { toast('Pick two different columns', '', 'warn'); return; }
  try {
    const r = await fetch(API + '/eda/compare', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session_id: S.sessionId, col_a: a, col_b: b, treat_a_as: ta, treat_b_as: tb}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    _renderComparison(d, a, b);
  } catch (e) { toast('Compare failed', e.message, 'error'); }
}

function _renderComparison(d, a, b) {
  const el = document.getElementById('compare-result');

  if (d.kind === 'numeric_numeric') {
    _cmpNumNum(el, d, a, b);
  } else if (d.kind === 'categorical_numeric' || d.kind === 'numeric_categorical') {
    _cmpCatNum(el, d, a, b);
  } else {
    _cmpCatCat(el, d, a, b);
  }
}

// ── num × num: scatter + hexbin-style density + regression line ───
function _cmpNumNum(el, d, a, b) {
  const corr  = d.correlation;
  const corrColor = Math.abs(corr)>0.7 ? 'var(--emerald)' : Math.abs(corr)>0.4 ? 'var(--amber)' : 'var(--text)';
  const strength  = Math.abs(corr)>0.7 ? 'Strong' : Math.abs(corr)>0.4 ? 'Moderate' : 'Weak';

  el.innerHTML = `
    <div class="grid-4 mb-16">
      <div class="stat-card"><div class="stat-label">Pearson r</div><div class="stat-value" style="color:${corrColor};font-size:24px">${fmtN(corr,4)}</div><div class="text-xs text-muted mt-4">${strength} ${corr>0?'positive':'negative'}</div></div>
      <div class="stat-card"><div class="stat-label">Spearman &#961;</div><div class="stat-value" style="font-size:24px">${fmtN(d.spearman,4)}</div><div class="text-xs text-muted mt-4">Rank correlation</div></div>
      <div class="stat-card"><div class="stat-label">r&#178; (linear)</div><div class="stat-value" style="font-size:24px">${fmtN(corr*corr,4)}</div><div class="text-xs text-muted mt-4">Variance explained</div></div>
      <div class="stat-card"><div class="stat-label">Points shown</div><div class="stat-value" style="font-size:24px">${d.scatter?.x?.length||0}</div><div class="text-xs text-muted mt-4">of total</div></div>
    </div>
    <div class="grid-2">
      <div>
        <div class="text-xs text-muted mb-4">Scatter plot with regression line</div>
        <div style="height:280px"><canvas id="cmp-scatter"></canvas></div>
      </div>
      <div>
        <div class="text-xs text-muted mb-4">Distribution of ${a} (histogram)</div>
        <div style="height:130px"><canvas id="cmp-hist-a"></canvas></div>
        <div class="text-xs text-muted mb-4 mt-8">Distribution of ${b} (histogram)</div>
        <div style="height:130px"><canvas id="cmp-hist-b"></canvas></div>
      </div>
    </div>`;

  const xs = d.scatter.x, ys = d.scatter.y;

  // Regression line points
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const n = xs.length;
  const sumX = xs.reduce((s,v)=>s+v,0), sumY = ys.reduce((s,v)=>s+v,0);
  const sumXY = xs.reduce((s,v,i)=>s+v*ys[i],0), sumX2 = xs.reduce((s,v)=>s+v*v,0);
  const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
  const intercept = (sumY - slope*sumX) / n;
  const regLine = [{x:xMin, y:slope*xMin+intercept}, {x:xMax, y:slope*xMax+intercept}];

  mkChart('cmp-scatter', 'scatter',
    { datasets: [
        {label: 'Data', data: xs.map((x,i)=>({x,y:ys[i]})), backgroundColor:'rgba(245,166,35,0.3)', borderColor:'#f5a623', pointRadius:2.5},
        {label: 'Trend', data: regLine, type:'line', borderColor:'rgba(52,211,153,0.8)', borderWidth:2, pointRadius:0, fill:false},
      ] },
    { plugins: {legend:{display:false}},
      scales: {
        x: {title:{display:true,text:a,color:'#a8a8c0'}, grid:{color:'rgba(42,42,60,.5)'}},
        y: {title:{display:true,text:b,color:'#a8a8c0'}, grid:{color:'rgba(42,42,60,.5)'}},
      } }
  );

  // Mini histograms
  function histData(vals, bins=15) {
    const min=Math.min(...vals), max=Math.max(...vals), w=(max-min)/bins;
    const counts=new Array(bins).fill(0);
    vals.forEach(v=>{const i=Math.min(Math.floor((v-min)/w),bins-1); counts[i]++;});
    return {counts, labels: Array.from({length:bins},(_,i)=>(min+i*w+w/2).toFixed(2))};
  }
  const ha = histData(xs), hb = histData(ys);
  mkChart('cmp-hist-a','bar',
    {labels:ha.labels, datasets:[{data:ha.counts,backgroundColor:'rgba(245,166,35,0.5)',borderColor:'#f5a623',borderWidth:1}]},
    {plugins:{legend:{display:false}}, scales:{x:{grid:{display:false},ticks:{maxTicksLimit:5}}, y:{grid:{color:'rgba(42,42,60,.5)'}}}}
  );
  mkChart('cmp-hist-b','bar',
    {labels:hb.labels, datasets:[{data:hb.counts,backgroundColor:'rgba(34,211,238,0.45)',borderColor:'#22d3ee',borderWidth:1}]},
    {plugins:{legend:{display:false}}, scales:{x:{grid:{display:false},ticks:{maxTicksLimit:5}}, y:{grid:{color:'rgba(42,42,60,.5)'}}}}
  );
}

// ── cat × num: mean bar + box-style per group + count bar + violin-style ──
function _cmpCatNum(el, d, a, b) {
  const numCol = d.kind === 'categorical_numeric' ? b : a;
  const catCol = d.kind === 'categorical_numeric' ? a : b;
  const groups = d.groups || {};
  const labels = Object.keys(groups).slice(0, 15);
  const means  = labels.map(g => groups[g].mean  || 0);
  const stds   = labels.map(g => groups[g].std   || 0);
  const counts = labels.map(g => groups[g].count || 0);

  // Error bars as ± std using custom plugin workaround via floating bars
  const errBars = labels.map((g,i) => [means[i]-stds[i], means[i]+stds[i]]);

  el.innerHTML = `
    <div class="text-xs text-muted mb-12">
      Distribution of <strong>${numCol}</strong> grouped by <strong>${catCol}</strong>
      — ${labels.length} group${labels.length!==1?'s':''}
    </div>
    <div class="grid-2 mb-16">
      <div class="stat-card">
        <div class="stat-label">Group with highest mean</div>
        <div class="stat-value" style="font-size:16px">${labels[means.indexOf(Math.max(...means))]||'—'}</div>
        <div class="text-xs text-muted mt-4">${fmtN(Math.max(...means),3)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Group with lowest mean</div>
        <div class="stat-value" style="font-size:16px">${labels[means.indexOf(Math.min(...means))]||'—'}</div>
        <div class="text-xs text-muted mt-4">${fmtN(Math.min(...means),3)}</div>
      </div>
    </div>
    <div class="grid-2">
      <div>
        <div class="text-xs text-muted mb-4">Mean per group (bar chart)</div>
        <div style="height:230px"><canvas id="cmp-grp-mean"></canvas></div>
        <div class="text-xs text-muted mb-4 mt-10">Mean ± 1 Std Dev (range bars)</div>
        <div style="height:100px"><canvas id="cmp-grp-err"></canvas></div>
      </div>
      <div>
        <div class="text-xs text-muted mb-4">Sample count per group</div>
        <div style="height:160px"><canvas id="cmp-grp-count"></canvas></div>
        <div class="text-xs text-muted mb-4 mt-10">Proportion of total samples (%)</div>
        <div style="height:160px"><canvas id="cmp-grp-pct"></canvas></div>
      </div>
    </div>
    <div class="mt-16">
      <div class="text-xs text-muted mb-8">Group means — quick reference</div>
      ${labels.map((g,i) => metricBar(g, fmtN(means[i],3), CC[i%CC.length], null)).join('')}
    </div>`;

  mkChart('cmp-grp-mean', 'bar',
    { labels,
      datasets: [{label:'Mean', data:means, backgroundColor:CC.map(c=>c+'99'), borderColor:CC, borderWidth:2}] },
    { plugins:{legend:{display:false}}, scales:SCALES.xOnly }
  );

  // ± std as floating bar
  mkChart('cmp-grp-err', 'bar',
    { labels,
      datasets: [{data:errBars, backgroundColor:'rgba(245,166,35,0.25)', borderColor:'#f5a623', borderWidth:2, borderSkipped:false}] },
    { indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{grid:{color:'rgba(42,42,60,.5)'}}, y:{grid:{display:false}}} }
  );

  const total = counts.reduce((s,v)=>s+v,0);
  const pcts  = counts.map(c => (c/total*100).toFixed(1));
  mkChart('cmp-grp-count', 'bar',
    { labels,
      datasets: [{label:'Count', data:counts, backgroundColor:'rgba(34,211,238,0.4)', borderColor:'#22d3ee', borderWidth:1}] },
    { plugins:{legend:{display:false}}, scales:SCALES.xOnly }
  );
  mkChart('cmp-grp-pct', 'pie',
    { labels,
      datasets: [{data:pcts, backgroundColor:CC.map(c=>c+'cc'), borderWidth:0}] },
    { plugins:{legend:{position:'right', labels:{color:'#a8a8c0', boxWidth:10, padding:6, font:{size:10}}}} }
  );
}

// ── cat × cat: stacked bar + grouped bar + normalised % bar + heatmap ──
function _cmpCatCat(el, d, a, b) {
  const ct      = d.crosstab || {};
  const rowKeys = Object.keys(ct).slice(0, 12);
  const colKeys = rowKeys.length ? Object.keys(ct[rowKeys[0]]).slice(0, 10) : [];

  // Row totals for normalisation
  const rowTotals = rowKeys.map(r => colKeys.reduce((s,c)=>s+(ct[r]?.[c]||0),0));

  el.innerHTML = `
    <div class="text-xs text-muted mb-12">
      Cross-tabulation: <strong>${a}</strong> (rows) &#215; <strong>${b}</strong> (columns)
      — ${rowKeys.length} &#215; ${colKeys.length} table
    </div>
    <div class="grid-2 mb-16">
      <div>
        <div class="text-xs text-muted mb-4">Stacked bar (counts)</div>
        <div style="height:230px"><canvas id="cmp-ct-stacked"></canvas></div>
      </div>
      <div>
        <div class="text-xs text-muted mb-4">Grouped bar (counts)</div>
        <div style="height:230px"><canvas id="cmp-ct-grouped"></canvas></div>
      </div>
    </div>
    <div class="grid-2">
      <div>
        <div class="text-xs text-muted mb-4">100% normalised bar (row proportions)</div>
        <div style="height:230px"><canvas id="cmp-ct-norm"></canvas></div>
      </div>
      <div>
        <div class="text-xs text-muted mb-4">Frequency table</div>
        <div style="overflow-x:auto;max-height:230px">
          <table class="data-table" style="border:none">
            <thead><tr><th>${a} / ${b}</th>${colKeys.map(k=>`<th>${k}</th>`).join('')}<th>Total</th></tr></thead>
            <tbody>${rowKeys.map((r,ri)=>`
              <tr>
                <td style="color:var(--text-2)">${r}</td>
                ${colKeys.map(c=>`<td>${ct[r]?.[c]||0}</td>`).join('')}
                <td style="color:var(--amber);font-weight:600">${rowTotals[ri]}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  const datasets = colKeys.map((ck,i) => ({
    label: ck,
    data: rowKeys.map(rk => ct[rk]?.[ck]||0),
    backgroundColor: CC[i%CC.length]+'99',
    borderColor: CC[i%CC.length],
    borderWidth: 1,
  }));

  // Stacked
  mkChart('cmp-ct-stacked', 'bar',
    {labels: rowKeys, datasets},
    { plugins:{legend:{position:'bottom',labels:{color:'#a8a8c0',boxWidth:10,padding:8,font:{size:10}}}},
      scales:{x:{stacked:true,grid:{display:false}}, y:{stacked:true,grid:{color:'rgba(42,42,60,.5)'}}} }
  );
  // Grouped
  mkChart('cmp-ct-grouped', 'bar',
    {labels: rowKeys, datasets: datasets.map(ds => ({...ds}))},
    { plugins:{legend:{position:'bottom',labels:{color:'#a8a8c0',boxWidth:10,padding:8,font:{size:10}}}},
      scales:{x:{grid:{display:false}}, y:{grid:{color:'rgba(42,42,60,.5)'}}} }
  );
  // Normalised
  const normDatasets = colKeys.map((ck,i) => ({
    label: ck,
    data: rowKeys.map((rk,ri) => rowTotals[ri] ? ((ct[rk]?.[ck]||0) / rowTotals[ri] * 100).toFixed(1) : 0),
    backgroundColor: CC[i%CC.length]+'99',
    borderColor: CC[i%CC.length],
    borderWidth: 1,
  }));
  mkChart('cmp-ct-norm', 'bar',
    {labels: rowKeys, datasets: normDatasets},
    { plugins:{legend:{position:'bottom',labels:{color:'#a8a8c0',boxWidth:10,padding:8,font:{size:10}}}},
      scales:{x:{stacked:true,grid:{display:false}}, y:{stacked:true,grid:{color:'rgba(42,42,60,.5)'},max:100,ticks:{callback:v=>v+'%'}}} }
  );
}

// ── Correlations tab ──────────────────────────────────────────────
function renderCorr(corr) {
  const el   = document.getElementById('corr-matrix');
  const cols = Object.keys(corr);
  if (!cols.length) { el.innerHTML = '<p class="text-muted text-sm">No numeric columns to correlate.</p>'; return; }

  const cellBg = v => {
    if (v === null || v === undefined) return 'rgba(42,42,60,0.3)';
    const a = Math.abs(v);
    return v > 0 ? `rgba(245,166,35,${a*0.85})` : `rgba(34,211,238,${a*0.85})`;
  };

  el.innerHTML = `<table style="border-collapse:collapse">
    <thead><tr>
      <th style="padding:4px 8px"></th>
      ${cols.map(c => `<th title="${c}" style="padding:4px 6px;color:var(--text-muted);font-size:10px;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.length>9?c.slice(0,8)+'…':c}</th>`).join('')}
    </tr></thead>
    <tbody>${cols.map(r =>
      `<tr>
        <td title="${r}" style="padding:4px 8px;color:var(--text-muted);font-size:10px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis">${r.length>11?r.slice(0,10)+'…':r}</td>
        ${cols.map(c => {
          const v  = corr[r]?.[c];
          const bg = cellBg(v);
          const fg = Math.abs(v||0) > 0.5 ? 'var(--ink)' : 'var(--text)';
          return `<td style="padding:2px"><div class="corr-cell" style="background:${bg};color:${fg}">${v!==null&&v!==undefined?fmtN(v,2):'—'}</div></td>`;
        }).join('')}
      </tr>`
    ).join('')}</tbody>
  </table>`;
}
