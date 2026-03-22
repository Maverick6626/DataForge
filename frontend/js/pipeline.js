/* Pages 2, 4, 5, 6 — Clean · Features · Models · Train */

// ══════════════════════════════════════════════════════════════════
// PAGE 2 — CLEAN
// ══════════════════════════════════════════════════════════════════
function initClean() {
  if (!S.sessionId) return;
  // Missing bars
  const mc  = Object.entries(S.missing).filter(([, v]) => v > 0);
  document.getElementById('missing-analysis').innerHTML = !mc.length
    ? `<div class="flex-center gap-8"><span class="badge badge-emerald">✓ No missing values</span></div>`
    : mc.map(([c, n]) => {
        const p   = (n / S.nRows * 100).toFixed(1);
        const col = p > 30 ? 'var(--rose)' : p > 10 ? 'var(--amber)' : 'var(--cyan)';
        return metricBar(c, `${n} (${p}%)`, col, parseFloat(p));
      }).join('');

  // Manual drop tags
  document.getElementById('manual-drop-list').innerHTML = S.columns.map(c => {
    const on = S.droppedCols.has(c);
    return `<span class="tag" style="${on ? 'border-color:var(--rose);background:var(--rose-pale);color:var(--rose)' : ''}cursor:pointer"
      onclick="toggleDrop('${c}')">${c}${on ? ' ✗' : ''}</span>`;
  }).join('');
}

function toggleDrop(c) {
  S.droppedCols.has(c) ? S.droppedCols.delete(c) : S.droppedCols.add(c);
  initClean();
}

async function runClean() {
  if (!S.sessionId) { toast('No data', 'Load first', 'error'); return; }
  const log = document.getElementById('clean-log');
  log.textContent = '';
  addLog(log, 'Starting…');
  try {
    const r = await fetch(API + '/clean', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        session_id:     S.sessionId,
        numeric_impute: document.getElementById('num-impute').value,
        cat_impute:     document.getElementById('cat-impute').value,
        outlier_method: document.getElementById('outlier-method').value,
        outlier_action: document.getElementById('outlier-action').value,
        drop_threshold: parseInt(document.getElementById('drop-thresh').value) / 100,
        drop_columns:   [...S.droppedCols],
        remove_duplicates: true,
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    d.steps.forEach(s => addLog(log, s.message, s.type));
    const newColSet = new Set(d.columns);
    S.columns = d.columns; S.nRows = d.n_rows; S.missing = {};
    // Remove any dropped columns from selectedFeatures so training doesn't send stale cols
    S.selectedFeatures = new Set([...S.selectedFeatures].filter(c => newColSet.has(c)));
    S.droppedCols.clear();
    toast('Clean complete', `${fmt(d.n_rows)} rows remaining`, 'success');
    setTimeout(() => goTo('eda'), 700);
  } catch (e) { addLog(log, 'Error: ' + e.message, 'error'); toast('Failed', e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════════
// PAGE 4 — FEATURES
// ══════════════════════════════════════════════════════════════════
function initFeatures() {
  if (!S.sessionId) return;
  document.getElementById('target-col').innerHTML =
    S.columns.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('feature-grid').innerHTML = S.columns.map(c => {
    const k = S.colKinds[c] || (S.dtypes[c]?.match(/int|float/) ? 'numeric_continuous' : 'categorical');
    const isOn = S.selectedFeatures.has(c);
    const typeStr = k === 'categorical' ? 'Categorical' : k === 'numeric_discrete' ? 'Numeric (discrete)' : 'Numeric';
    return `<label class="feature-card ${isOn ? 'selected' : ''}" id="fc-${c}" onclick="toggleFeat(event,'${c}')">
      <input type="checkbox" ${isOn ? 'checked' : ''} id="fi-${c}">
      <div class="feature-card-info">
        <div class="feature-card-name">${c}</div>
        <div class="feature-card-type">${typeStr} · ${S.dtypes[c] || ''}</div>
      </div>
    </label>`;
  }).join('');
  onTargetChange();
}

function toggleFeat(e, col) {
  e.preventDefault();
  const cb = document.getElementById('fi-' + col);
  const card = document.getElementById('fc-' + col);
  cb.checked = !cb.checked;
  card.classList.toggle('selected', cb.checked);
  cb.checked ? S.selectedFeatures.add(col) : S.selectedFeatures.delete(col);
}

function selectAllFeatures(on) {
  const target = document.getElementById('target-col')?.value;
  S.columns.forEach(c => {
    if (c === target) return;
    const cb = document.getElementById('fi-' + c);
    const card = document.getElementById('fc-' + c);
    if (!cb || !card) return;
    cb.checked = on;
    card.classList.toggle('selected', on);
    on ? S.selectedFeatures.add(c) : S.selectedFeatures.delete(c);
  });
}

function onTargetChange() {
  const target = document.getElementById('target-col')?.value;
  if (!target) return;

  // Dim the target column in the feature grid
  S.columns.forEach(c => {
    const cb   = document.getElementById('fi-' + c);
    const card = document.getElementById('fc-' + c);
    if (!cb || !card) return;
    if (c === target) {
      cb.checked = false; cb.disabled = true;
      card.classList.remove('selected');
      card.style.opacity = '0.35'; card.style.pointerEvents = 'none';
      S.selectedFeatures.delete(c);
    } else {
      cb.disabled = false; card.style.opacity = ''; card.style.pointerEvents = '';
    }
  });

  const sel = document.getElementById('task-type').value;
  if (sel !== 'auto') {
    S.taskType = sel;
    document.getElementById('task-hint').innerHTML =
      `<span class="${sel==='regression'?'text-cyan':'text-amber'}">${sel}</span>
       <span class="text-muted"> (manually set)</span>`;
    return;
  }

  // Ask backend to predict task type
  if (!S.sessionId) return;
  fetch(API + '/eda/detect_task', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({session_id: S.sessionId, target}),
  })
  .then(r => r.json())
  .then(d => {
    S.taskType = d.task;
    const col   = d.task === 'regression' ? 'text-cyan' : 'text-amber';
    const icon  = d.task === 'regression' ? '&#128200;' : '&#127991;';
    const badge = `<span class="${col}" style="font-weight:700">${d.task}</span>`;
    document.getElementById('task-hint').innerHTML =
      `${icon} Auto-detected: ${badge}
       <span class="text-muted" style="margin-left:6px">${d.reason}</span>`;
  })
  .catch(() => {
    S.taskType = null;
    document.getElementById('task-hint').textContent = 'Could not detect — will auto-detect during training.';
  });
}

// ══════════════════════════════════════════════════════════════════
// PAGE 5 — MODELS
// ══════════════════════════════════════════════════════════════════
function initModels() {
  const mdls = (S.taskType || '') === 'regression' ? REG_MODELS : CLF_MODELS;
  document.getElementById('model-grid').innerHTML = mdls.map(m => `
    <div class="model-card ${S.selectedModels.has(m.name) ? 'on' : ''}"
         id="mc-${m.name.replace(/\s/g,'_')}" onclick="toggleModel('${m.name}')">
      <div class="model-card-name">${m.name}</div>
      <div class="model-card-lib">${m.lib}</div>
      <div class="model-card-tags">${m.tags.map(t => `<span class="model-tag ${t}">${t}</span>`).join('')}</div>
    </div>`).join('');
}

function toggleModel(n) {
  const el = document.getElementById('mc-' + n.replace(/\s/g, '_'));
  if (!el) return;
  el.classList.toggle('on');
  el.classList.contains('on') ? S.selectedModels.add(n) : S.selectedModels.delete(n);
}

function selectAllModels(on) {
  const mdls = (S.taskType || '') === 'regression' ? REG_MODELS : CLF_MODELS;
  mdls.forEach(m => {
    const el = document.getElementById('mc-' + m.name.replace(/\s/g, '_'));
    if (!el) return;
    el.classList.toggle('on', on);
    on ? S.selectedModels.add(m.name) : S.selectedModels.delete(m.name);
  });
}

function setModelMode(mode) {
  S.modelMode = mode;
  document.getElementById('chip-auto').classList.toggle('on', mode === 'auto');
  document.getElementById('chip-manual').classList.toggle('on', mode === 'manual');
  document.getElementById('manual-section').classList.toggle('hidden', mode === 'auto');
  document.getElementById('mode-hint').textContent = mode === 'auto'
    ? 'AutoSelect trains every model and picks the best by CV score.'
    : 'Choose the exact models to train and compare.';
  if (mode === 'manual') initModels();
}

// ══════════════════════════════════════════════════════════════════
// PAGE 6 — TRAIN
// ══════════════════════════════════════════════════════════════════
function initTrainSummary() {
  if (!S.sessionId) return;
  const target = document.getElementById('target-col')?.value || '—';
  const feats  = [...S.selectedFeatures].filter(f => f !== target);
  document.getElementById('train-config-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Dataset</div><div class="stat-value" style="font-size:18px">${fmt(S.nRows)}×${S.columns.length}</div></div>
    <div class="stat-card"><div class="stat-label">Features</div><div class="stat-value amber">${feats.length}</div></div>
    <div class="stat-card"><div class="stat-label">Task</div><div class="stat-value" style="font-size:14px;text-transform:capitalize">${S.taskType || 'auto'}</div></div>
    <div class="stat-card"><div class="stat-label">Mode</div><div class="stat-value" style="font-size:14px;text-transform:capitalize">${S.modelMode}</div></div>`;
  document.getElementById('train-config-tbl').innerHTML = `<tbody>
    <tr><td class="text-muted" style="width:140px">Target</td><td>${target}</td></tr>
    <tr><td class="text-muted">Scaling</td><td>${document.getElementById('scaling')?.value || '—'}</td></tr>
    <tr><td class="text-muted">Encoding</td><td>${document.getElementById('encoding')?.value || '—'}</td></tr>
    <tr><td class="text-muted">Test Split</td><td>${(parseFloat(document.getElementById('test-size')?.value || '0.2') * 100).toFixed(0)}%</td></tr>
    <tr><td class="text-muted">CV</td><td>${document.getElementById('cv-folds')?.value || 'none'}</td></tr>
    <tr><td class="text-muted">Tuning</td><td>${document.getElementById('tuning')?.value || 'default'}</td></tr>
  </tbody>`;
}

let trainAbort = null;

async function startTraining() {
  if (!S.sessionId) { toast('No dataset', 'Load data first', 'error'); return; }
  const target = document.getElementById('target-col')?.value;
  const feats  = [...S.selectedFeatures].filter(f => f !== target);
  if (!feats.length) { toast('No features', 'Select at least one', 'error'); return; }

  const payload = {
    session_id: S.sessionId, target, features: feats,
    task_type:  document.getElementById('task-type')?.value || 'auto',
    scaling:    document.getElementById('scaling')?.value || 'standard',
    encoding:   document.getElementById('encoding')?.value || 'onehot',
    test_size:  parseFloat(document.getElementById('test-size')?.value || '0.2'),
    random_seed: parseInt(document.getElementById('rand-seed')?.value || '42'),
    model_mode:  S.modelMode,
    selected_models: S.modelMode === 'manual' ? [...S.selectedModels] : [],
    tuning:     document.getElementById('tuning')?.value || 'default',
    tuning_n:   parseInt(document.getElementById('tuning-n')?.value || '30'),
    scoring:    document.getElementById('scoring')?.value || 'auto',
    cv_folds:   document.getElementById('cv-folds')?.value || 'none',
    n_jobs:     parseInt(document.getElementById('n-jobs')?.value || '-1'),
  };

  const log  = document.getElementById('train-log');
  const btn  = document.getElementById('train-btn');
  const stop = document.getElementById('stop-btn');
  const spin = document.getElementById('train-spinner');
  log.textContent = '';
  btn.disabled = true; stop.classList.remove('hidden'); spin.classList.remove('hidden');
  _setProgress(0, 'Initialising…');
  addLog(log, 'Training started');
  trainAbort = new AbortController();

  try {
    const r = await fetch(API + '/train/stream', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload), signal: trainAbort.signal,
    });
    const reader = r.body.getReader();
    const dec    = new TextDecoder();
    let buf      = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      buf += dec.decode(value, {stream: true});
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'log') {
            addLog(log, ev.message, ev.level || 'info');
            if (ev.model) document.getElementById('console-model-name').textContent = ev.model;
          }
          if (ev.type === 'progress') _setProgress(ev.pct, ev.label);
          if (ev.type === 'done') {
            S.results = ev.results; S.bestModel = ev.best_model; S.predictModel = ev.best_model;
            _setProgress(100, 'Complete!');
            addLog(log, `Best: ${ev.best_model} · ${ev.best_score}`, 'success');
            toast('Training complete!', ev.best_model + ' is best', 'success', 5000);
            document.getElementById('nav-results').classList.add('done');
            refreshSessions();
            setTimeout(() => goTo('results'), 800);
          }
        } catch {}
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') { addLog(log, 'Error: ' + e.message, 'error'); toast('Failed', e.message, 'error'); }
  } finally {
    btn.disabled = false; stop.classList.add('hidden'); spin.classList.add('hidden');
  }
}

function stopTraining() { trainAbort?.abort(); toast('Stopped', '', 'warn'); }

function _setProgress(pct, label = '') {
  document.getElementById('train-progress').style.width = pct + '%';
  document.getElementById('progress-pct').textContent   = pct + '%';
  document.getElementById('progress-label').textContent = label;
}
