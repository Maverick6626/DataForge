/* Pages 7 & 8 — Results · Predict */

// ══════════════════════════════════════════════════════════════════
// PAGE 7 — RESULTS
// ══════════════════════════════════════════════════════════════════
function renderResults() {
  if (!S.results?.length) {
    document.getElementById('best-hero').innerHTML =
      `<div class="card-body"><p class="text-muted">No results yet — train models first.</p></div>`;
    return;
  }
  const results = S.results;
  const best    = results[0];
  const mk      = Object.keys(best.metrics || {});

  document.getElementById('dl-model-btn').disabled = false;

  // Hero card
  document.getElementById('best-hero').innerHTML = `
    <div class="card-header">
      <div class="card-title"><div class="card-icon">🏆</div>Best Model</div>
      <span class="badge badge-amber">Rank #1</span>
    </div>
    <div class="card-body">
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div>
          <div class="page-title" style="font-size:24px">${best.model}</div>
          <div class="text-sm text-muted mt-4">Best by ${mk[0] || 'score'}</div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          ${mk.slice(0, 3).map(k => `
            <div class="stat-card" style="min-width:110px;padding:10px 14px">
              <div class="stat-label">${k}</div>
              <div class="stat-value amber" style="font-size:18px">${fmtN(best.metrics[k])}</div>
            </div>`).join('')}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="text-xs text-muted">train time</div>
          <div class="text-amber text-mono" style="font-size:14px;font-weight:700">${best.train_time?.toFixed(2) || '—'}s</div>
        </div>
      </div>
    </div>`;

  // Leaderboard table
  document.getElementById('results-tbl').innerHTML = `
    <thead><tr><th>#</th><th>Model</th>${mk.map(k => `<th>${k}</th>`).join('')}<th>Time</th></tr></thead>
    <tbody>${results.map((r, i) => `
      <tr>
        <td style="color:${i === 0 ? 'var(--amber)' : 'var(--text-muted)'};font-weight:700">${i === 0 ? '🏆' : i + 1}</td>
        <td style="color:${i === 0 ? 'var(--amber)' : 'var(--text)'};font-weight:${i === 0 ? 700 : 400}">${r.model}</td>
        ${mk.map(k => `<td style="color:${i === 0 ? 'var(--amber)' : 'var(--text-2)'}">${fmtN(r.metrics?.[k])}</td>`).join('')}
        <td>${r.train_time?.toFixed(2) || '—'}s</td>
      </tr>`).join('')}
    </tbody>`;

  // Score comparison bar chart
  dc('score-chart');
  S.charts['score-chart'] = new Chart(
    document.getElementById('score-chart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: results.map(r => r.model),
        datasets: [{
          data: results.map(r => r.metrics?.[mk[0]] ?? 0),
          backgroundColor: results.map((_, i) => i === 0 ? 'rgba(245,166,35,0.7)' : 'rgba(34,211,238,0.3)'),
          borderColor:     results.map((_, i) => i === 0 ? '#f5a623' : '#22d3ee'),
          borderWidth: 2, borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {legend: {display: false}},
        scales: {
          x: {grid: {color: 'rgba(42,42,60,0.5)'}},
          y: {grid: {display: false}, ticks: {font: {size: 10}}},
        },
      },
    });

  // Feature importance chart
  const fi = best.feature_importance;
  dc('fi-chart');
  if (fi && Object.keys(fi).length) {
    document.getElementById('fi-model-name').textContent = best.model;
    const sorted = Object.entries(fi).sort(([, a], [, b]) => b - a).slice(0, 14);
    S.charts['fi-chart'] = new Chart(
      document.getElementById('fi-chart').getContext('2d'), {
        type: 'bar',
        data: {
          labels: sorted.map(([k]) => k),
          datasets: [{
            data: sorted.map(([, v]) => v),
            backgroundColor: 'rgba(245,166,35,0.5)',
            borderColor: '#f5a623', borderWidth: 2, borderRadius: 4,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: {legend: {display: false}},
          scales: {
            x: {grid: {color: 'rgba(42,42,60,0.5)'}},
            y: {grid: {display: false}, ticks: {font: {size: 10}}},
          },
        },
      });
  }

  // Detailed metrics bars
  document.getElementById('detail-metrics').innerHTML =
    Object.entries(best.metrics || {}).map(([k, v]) => {
      const p   = typeof v === 'number' ? Math.min(Math.abs(v), 1) * 100 : 50;
      const col = p > 80 ? 'var(--emerald)' : p > 50 ? 'var(--amber)' : 'var(--rose)';
      return metricBar(k, v, col, p);
    }).join('');
}

async function downloadDataset() {
  if (!S.sessionId) { toast("No session", "Load data first", "error"); return; }
  const url = `${API}/dataset/download/${S.sessionId}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `cleaned_${S.sessionId}.csv`;
  a.click();
  toast("Downloading", "Cleaned dataset as CSV", "success", 2000);
}

async function downloadModel() {
  if (!S.sessionId || !S.bestModel) { toast('No model', 'Train first', 'error'); return; }
  const url = `${API}/model/download/${S.sessionId}?model_name=${encodeURIComponent(S.bestModel)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `dataforge_${S.bestModel.replace(/ /g, '_')}.joblib`;
  a.click();
  toast('Downloading', S.bestModel, 'success', 2000);
}

function downloadReport() {
  if (!S.results) { toast('No results', 'Train first', 'error'); return; }
  const lines = [
    'DataForge — Training Report',
    '='.repeat(40),
    `Session:    ${S.sessionId}`,
    `Best Model: ${S.bestModel}`,
    `Task:       ${S.taskType || 'auto'}`,
    '',
    'Leaderboard:',
    ...S.results.map((r, i) =>
      `  #${i + 1}  ${r.model.padEnd(24)} ${Object.entries(r.metrics)
        .map(([k, v]) => `${k}=${fmtN(v)}`).join('  ')}  [${r.train_time?.toFixed(2)}s]`),
  ];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], {type: 'text/plain'}));
  a.download = 'ml_report.txt';
  a.click();
}

// ══════════════════════════════════════════════════════════════════
// PAGE 8 — PREDICT
// ══════════════════════════════════════════════════════════════════
function initPredict() {
  if (!S.results?.length) {
    document.getElementById('active-model-badge').textContent = 'No model trained';
    return;
  }
  const sel = document.getElementById('predict-model-sel');
  sel.innerHTML = S.results
    .map(r => `<option value="${r.model}" ${r.model === S.bestModel ? 'selected' : ''}>${r.model}</option>`)
    .join('');
  S.predictModel = S.bestModel;
  document.getElementById('active-model-badge').textContent = S.predictModel || 'None';
  sel.onchange = () => {
    S.predictModel = sel.value;
    document.getElementById('active-model-badge').textContent = sel.value;
  };
  _buildManualInputs('manual-inputs');
}

function _buildManualInputs(containerId, featureOverride, dtypeOverride) {
  const target = document.getElementById('target-col')?.value;
  const feats  = featureOverride || [...S.selectedFeatures].filter(f => f !== target);
  const dtypes = dtypeOverride || S.dtypes;
  document.getElementById(containerId).innerHTML = feats.map(f => {
    const dt    = dtypes[f] || 'object';
    const isNum = dt.match(/int|float/);
    return `<div class="form-group">
      <label>${f} <span class="text-muted" style="font-size:9px">${dt}</span></label>
      <input type="${isNum ? 'number' : 'text'}" id="${containerId}-${f}"
             placeholder="${isNum ? '0.0' : 'value'}" step="any">
    </div>`;
  }).join('');
}

async function predictManual() {
  if (!S.sessionId || !S.predictModel) { toast('No model', 'Train first', 'error'); return; }
  const target = document.getElementById('target-col')?.value;
  const feats  = [...S.selectedFeatures].filter(f => f !== target);
  const row    = {};
  feats.forEach(f => {
    const v  = document.getElementById('manual-inputs-' + f)?.value;
    row[f]   = S.dtypes[f]?.match(/int|float/) ? parseFloat(v) : v;
  });
  try {
    const r = await fetch(API + '/predict', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session_id: S.sessionId, data: [row], model_name: S.predictModel}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    _showPredictResult('manual-result', 'manual-result-card', d.predictions[0], S.predictModel, d.probabilities?.[0]);
  } catch (e) { toast('Prediction failed', e.message, 'error'); }
}

async function predictBatch(inp) {
  if (!inp.files[0] || !S.sessionId) return;
  const fd = new FormData();
  fd.append('file', inp.files[0]);
  fd.append('session_id', S.sessionId);
  if (S.predictModel) fd.append('model_name', S.predictModel);
  toast('Running batch…', '', 'info', 2000);
  try {
    const r    = await fetch(API + '/predict/batch', {method: 'POST', body: fd});
    const d    = await r.json();
    if (!r.ok) throw new Error(d.detail);
    const preds = d.predictions;
    const br    = document.getElementById('batch-result');
    br.classList.remove('hidden');
    br.innerHTML = `
      <div class="flex-between mb-12">
        <span class="badge badge-emerald">✓ ${preds.length} predictions</span>
        <button class="btn btn-secondary btn-sm" onclick="dlPreds(${JSON.stringify(preds)})">⬇ Download CSV</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Prediction</th></tr></thead>
          <tbody>${preds.slice(0, 30).map((p, i) => `<tr><td>${i + 1}</td><td>${p}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      ${preds.length > 30 ? `<p class="text-xs text-muted mt-8">Showing 30 of ${preds.length}</p>` : ''}`;
    toast('Batch complete', preds.length + ' predictions', 'success');
  } catch (e) { toast('Batch failed', e.message, 'error'); }
}

function dlPreds(preds) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['prediction\n' + preds.join('\n')], {type: 'text/csv'}));
  a.download = 'predictions.csv';
  a.click();
}

// Shared result renderer (used by predict + deploy pages)
function _showPredictResult(bodyId, cardId, pred, modelName, probs) {
  const probHtml = probs
    ? `<div class="mt-12"><div class="text-xs text-muted mb-8">Class Probabilities</div>
       ${Object.entries(probs).map(([c, p]) =>
         metricBar(c, (p * 100).toFixed(1) + '%', 'var(--cyan)', p * 100)
       ).join('')}</div>`
    : '';
  document.getElementById(cardId).classList.remove('hidden');
  document.getElementById(bodyId).innerHTML = `
    <div class="flex-center gap-16 flex-wrap">
      <div>
        <div class="stat-label">Prediction</div>
        <div class="stat-value emerald" style="font-size:36px;margin-top:6px">${pred}</div>
      </div>
      <span class="badge badge-amber">${modelName}</span>
    </div>${probHtml}`;
}
