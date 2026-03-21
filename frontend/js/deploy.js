/* Page 9 — Deploy
   Features:
   - Create named deployments
   - Delete deployments
   - Open deployment as a standalone page in a new browser tab
   - Inline predict panel in current page
*/

function initDeploy() {
  if (!S.results?.length) return;
  document.getElementById('dep-model').innerHTML = S.results
    .map(r => `<option value="${r.model}" ${r.model === S.bestModel ? 'selected' : ''}>${r.model}</option>`)
    .join('');
  loadDeployments();
}

async function createDeployment() {
  const name = document.getElementById('dep-name').value.trim().replace(/\s+/g, '_');
  if (!name) { toast('Enter a deployment name', '', 'warn'); return; }
  if (!S.sessionId || !S.results?.length) { toast('No model trained', '', 'error'); return; }
  try {
    const r = await fetch(API + '/deploy', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        session_id:   S.sessionId,
        deploy_name:  name,
        model_name:   document.getElementById('dep-model').value,
        page_title:   document.getElementById('dep-title').value || 'ML Model',
        page_heading: document.getElementById('dep-heading').value || 'Predict',
        description:  document.getElementById('dep-desc').value,
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    toast('Deployment created', name, 'success');
    // Clear form
    document.getElementById('dep-name').value = '';
    document.getElementById('dep-desc').value = '';
    loadDeployments();
  } catch (e) { toast('Failed', e.message, 'error'); }
}

async function deleteDeployment(deployName) {
  if (!confirm(`Delete deployment "${deployName}"? This cannot be undone.`)) return;
  try {
    const r = await fetch(`${API}/deploy/${S.sessionId}/${deployName}`, {method: 'DELETE'});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    toast('Deleted', deployName, 'success', 2000);
    // Close inline panel if this was the active one
    if (S.activeDeploy?.deploy_name === deployName) {
      document.getElementById('deploy-predict-panel').classList.add('hidden');
      S.activeDeploy = null;
    }
    loadDeployments();
  } catch (e) { toast('Delete failed', e.message, 'error'); }
}

async function loadDeployments() {
  if (!S.sessionId) return;
  try {
    const r = await fetch(API + '/deploy/' + S.sessionId);
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    const el = document.getElementById('deployments-list');
    if (!d.deployments?.length) {
      el.innerHTML = `<p class="text-muted text-sm">No deployments yet.</p>`;
      return;
    }
    el.innerHTML = d.deployments.map(dep => `
      <div class="deploy-card" id="depcard-${dep.deploy_name}">
        <div class="flex-between">
          <div>
            <div style="font-family:var(--font-display);font-size:17px;font-weight:700;color:var(--text)">${dep.page_title || dep.deploy_name}</div>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-top:4px">
              ${dep.deploy_name} &middot; ${dep.model_name} &middot; ${dep.task || ''} &middot; ${dep.created_at}
            </div>
            ${dep.description ? `<div class="text-sm text-muted mt-4">${dep.description}</div>` : ''}
            <div class="flex-center gap-8 mt-8">
              ${Object.entries(dep.metrics || {}).slice(0, 3).map(([k, v]) =>
                `<span class="badge badge-amber">${k}: ${fmtN(v)}</span>`).join('')}
            </div>
          </div>
          <div class="flex-center gap-8" style="flex-shrink:0;margin-left:16px">
            <button class="btn btn-secondary btn-sm" onclick='openDeployPredict(${JSON.stringify(dep)})'>
              &#9654; Try inline
            </button>
            <button class="btn btn-cyan btn-sm" onclick='openDeployPage(${JSON.stringify(dep)})'>
              &#128279; Open page
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteDeployment('${dep.deploy_name}')">
              &#128465; Delete
            </button>
          </div>
        </div>
      </div>`).join('');
  } catch (e) { toast('Could not load deployments', e.message, 'error'); }
}

// ── Inline predict panel ──────────────────────────────────────────
function openDeployPredict(dep) {
  S.activeDeploy = dep;
  document.getElementById('dp-page-title').textContent  = dep.page_title || dep.deploy_name;
  document.getElementById('dp-heading-text').textContent = dep.page_heading || 'Predict';
  document.getElementById('dp-desc').textContent =
    dep.description || `Model: ${dep.model_name} · Task: ${dep.task}`;

  _buildManualInputs('dp-inputs', dep.features, dep.dtypes);

  document.getElementById('deploy-predict-panel').classList.remove('hidden');
  document.getElementById('dp-result-card').classList.add('hidden');
  document.getElementById('deploy-predict-panel').scrollIntoView({behavior: 'smooth'});
}

async function deployPredict() {
  const dep = S.activeDeploy;
  if (!dep) { toast('No deployment selected', '', 'error'); return; }
  const row = {};
  (dep.features || []).forEach(f => {
    const v = document.getElementById('dp-inputs-' + f)?.value;
    row[f]  = (dep.dtypes?.[f] || '').match(/int|float/) ? parseFloat(v) : v;
  });
  try {
    const r = await fetch(`${API}/deploy/${S.sessionId}/${dep.deploy_name}/predict`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session_id: S.sessionId, data: [row], model_name: dep.model_name}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    _showPredictResult('dp-result', 'dp-result-card', d.predictions[0], dep.model_name, d.probabilities?.[0]);
  } catch (e) { toast('Prediction failed', e.message, 'error'); }
}

// ── Standalone page in new tab ────────────────────────────────────
function openDeployPage(dep) {
  const html = _buildDeployPageHtml(dep);
  const blob = new Blob([html], {type: 'text/html'});
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Revoke after a short delay to allow the tab to load
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function _buildDeployPageHtml(dep) {
  const featureInputs = (dep.features || []).map(f => {
    const dt = (dep.dtypes || {})[f] || 'object';
    const isNum = dt.match(/int|float/);
    return `
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
        <label style="font-family:monospace;font-size:11px;color:#a8a8c0;letter-spacing:.06em">${f} <span style="color:#5a5a72">(${dt})</span></label>
        <input type="${isNum ? 'number' : 'text'}" id="sf-${f}"
               placeholder="${isNum ? '0.0' : 'value'}" step="any"
               style="background:#0c0c10;border:1px solid #2a2a3c;border-radius:8px;color:#e8e8f2;padding:9px 12px;font-size:14px;width:100%;outline:none;font-family:inherit"
               onfocus="this.style.borderColor='#f5a623'" onblur="this.style.borderColor='#2a2a3c'">
      </div>`;
  }).join('');

  const metricsHtml = Object.entries(dep.metrics || {}).slice(0,4).map(([k,v]) =>
    `<span style="background:rgba(245,166,35,0.12);border:1px solid rgba(245,166,35,0.2);color:#f5a623;
            padding:3px 10px;border-radius:100px;font-size:11px;font-family:monospace">${k}: ${typeof v==='number'?v.toFixed(4):v}</span>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${dep.page_title || dep.deploy_name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Instrument Sans',sans-serif;background:#0c0c10;color:#e8e8f2;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px}
    .card{background:#12121a;border:1px solid #2a2a3c;border-radius:16px;padding:36px;max-width:560px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.5)}
    h1{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;letter-spacing:-.03em;margin-bottom:6px}
    .sub{font-size:13px;color:#6868880;margin-bottom:6px}
    .desc{font-size:13px;color:#6b6b85;margin-bottom:20px;line-height:1.6}
    .metrics{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px}
    .divider{border:none;border-top:1px solid #2a2a3c;margin:20px 0}
    .btn{display:inline-flex;align-items:center;gap:8px;background:#f5a623;color:#0c0c10;border:none;
         border-radius:8px;padding:11px 24px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;
         width:100%;justify-content:center;margin-top:8px;transition:background .15s}
    .btn:hover{background:#f5b845}
    .btn:disabled{opacity:.4;cursor:not-allowed}
    .result{margin-top:24px;padding:20px;background:#16161f;border:1px solid rgba(52,211,153,.3);border-radius:12px;display:none}
    .result-label{font-family:monospace;font-size:11px;color:#6b6b85;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
    .result-val{font-family:'Syne',sans-serif;font-size:42px;font-weight:800;color:#34d399;letter-spacing:-.03em}
    .result-model{font-family:monospace;font-size:11px;color:#f5a623;margin-top:6px}
    .probs{margin-top:14px}
    .prob-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:12px;font-family:monospace}
    .prob-bar-track{flex:1;height:6px;background:#1e1e2a;border-radius:100px;overflow:hidden}
    .prob-bar-fill{height:100%;background:#22d3ee;border-radius:100px;transition:width .5s}
    .error-msg{color:#fb7185;font-size:13px;margin-top:12px;display:none}
    .spinner{width:18px;height:18px;border:2px solid rgba(245,166,35,.2);border-top-color:#f5a623;border-radius:50%;animation:spin .65s linear infinite;display:inline-block}
    @keyframes spin{to{transform:rotate(360deg)}}
    .spinner-wrap{display:none;align-items:center;justify-content:center;padding:16px}
  </style>
</head>
<body>
<div class="card">
  <div class="sub">DataForge Deployment &middot; ${dep.model_name} &middot; ${dep.task || ''}</div>
  <h1>${dep.page_title || dep.deploy_name}</h1>
  ${dep.description ? `<p class="desc">${dep.description}</p>` : ''}
  <div class="metrics">${metricsHtml}</div>
  <div class="divider"></div>
  <div id="inputs">${featureInputs}</div>
  <button class="btn" id="predict-btn" onclick="runPredict()">&#9654; ${dep.page_heading || 'Predict'}</button>
  <div class="spinner-wrap" id="spinner-wrap"><div class="spinner"></div></div>
  <div class="result" id="result-box">
    <div class="result-label">${dep.target || 'Prediction'}</div>
    <div class="result-val" id="result-val">—</div>
    <div class="result-model">Model: ${dep.model_name}</div>
    <div class="probs" id="prob-container"></div>
  </div>
  <div class="error-msg" id="error-msg"></div>
</div>
<script>
const API      = '${API}';
const SID      = '${S.sessionId}';
const DEP_NAME = '${dep.deploy_name}';
const FEATURES = ${JSON.stringify(dep.features || [])};
const DTYPES   = ${JSON.stringify(dep.dtypes   || {})};
const MODEL    = '${dep.model_name}';

async function runPredict() {
  const btn = document.getElementById('predict-btn');
  const spin = document.getElementById('spinner-wrap');
  const errEl = document.getElementById('error-msg');
  btn.disabled = true;
  spin.style.display = 'flex';
  errEl.style.display = 'none';
  document.getElementById('result-box').style.display = 'none';

  const row = {};
  FEATURES.forEach(f => {
    const v  = document.getElementById('sf-' + f)?.value;
    row[f]   = (DTYPES[f] || '').match(/int|float/) ? parseFloat(v) : v;
  });

  try {
    const r = await fetch(API + '/deploy/' + SID + '/' + DEP_NAME + '/predict', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session_id: SID, data: [row], model_name: MODEL}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);

    document.getElementById('result-val').textContent = d.predictions[0];
    document.getElementById('result-box').style.display = 'block';

    // Probabilities
    const pc = document.getElementById('prob-container');
    if (d.probabilities) {
      pc.innerHTML = Object.entries(d.probabilities[0]).map(([cls, p]) =>
        \`<div class="prob-row">
           <span style="min-width:80px;color:#a8a8c0">\${cls}</span>
           <div class="prob-bar-track"><div class="prob-bar-fill" style="width:\${(p*100).toFixed(1)}%"></div></div>
           <span style="min-width:42px;text-align:right;color:#e8e8f2">\${(p*100).toFixed(1)}%</span>
         </div>\`
      ).join('');
    } else {
      pc.innerHTML = '';
    }
  } catch (e) {
    errEl.textContent = 'Error: ' + e.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    spin.style.display = 'none';
  }
}
<\/script>
</body>
</html>`;
}
