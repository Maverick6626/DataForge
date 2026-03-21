/* Shared utilities */

// ── Formatting ────────────────────────────────────────────────────
const fmt  = n => n?.toLocaleString?.() ?? '—';
const fmtN = (n, d = 4) => typeof n === 'number' ? n.toFixed(d) : (n ?? '—');
const ts   = () => new Date().toLocaleTimeString('en', {hour12: false});

// ── Chart.js defaults ─────────────────────────────────────────────
Chart.defaults.color = '#a8a8c0';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 11;
const CC = ['#f5a623','#22d3ee','#34d399','#fb7185','#a78bfa','#f472b6','#60a5fa','#fbbf24'];

function dc(id) {
  if (S.charts[id]) { S.charts[id].destroy(); delete S.charts[id]; }
}

// ── Toast ─────────────────────────────────────────────────────────
function toast(title, msg = '', type = 'info', ms = 4000) {
  const icons = {success:'✓', error:'✗', warn:'⚠', info:'ℹ'};
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="toast-icon">${icons[type]||'ℹ'}</div>
    <div class="toast-body"><div class="toast-title">${title}</div>
    ${msg ? `<div class="toast-msg">${msg}</div>` : ''}</div>`;
  document.getElementById('toasts').prepend(el);
  setTimeout(() => el.remove(), ms);
}

// ── Console log ───────────────────────────────────────────────────
function addLog(el, msg, cls = 'info') {
  const s = document.createElement('span');
  s.className = `log ${cls}`;
  s.textContent = `[${ts()}] ${msg}`;
  el.appendChild(s);
  el.scrollTop = el.scrollHeight;
}

// ── Navigation ────────────────────────────────────────────────────
function goTo(page) {
  document.querySelectorAll('.page-view').forEach(p => {
    p.classList.add('hidden'); p.classList.remove('active');
  });
  document.querySelectorAll('.step-link').forEach(l => l.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.replace('hidden', 'active') ||
  document.getElementById('page-' + page)?.classList.add('active');
  document.getElementById('page-' + page)?.classList.remove('hidden');
  document.getElementById('nav-' + page)?.classList.add('active');
  document.getElementById('topbar-page').textContent = PAGE_TITLES[page] || page;

  const init = {
    clean:    initClean,
    eda:      initEda,
    features: initFeatures,
    model:    initModels,
    train:    initTrainSummary,
    results:  renderResults,
    predict:  initPredict,
    deploy:   initDeploy,
  };
  init[page]?.();
}

function resetAll() { if (confirm('Reset everything?')) location.reload(); }

// ── API health ────────────────────────────────────────────────────
async function checkApi() {
  try {
    const r = await fetch(API + '/health', {signal: AbortSignal.timeout(2500)});
    if (r.ok) {
      document.getElementById('api-dot').classList.add('live');
      document.getElementById('api-status').textContent = 'API Connected';
    }
  } catch {
    document.getElementById('api-status').textContent = 'API Offline';
  }
}

// ── Shared metric bar renderer ────────────────────────────────────
function metricBar(label, value, color = 'var(--amber)', pct = null) {
  const p = pct ?? Math.min(Math.abs(Number(value) || 0), 1) * 100;
  return `<div class="metric-bar">
    <span class="metric-bar-label">${label}</span>
    <div class="metric-bar-track"><div class="metric-bar-fill" style="width:${p}%;background:${color}"></div></div>
    <span class="metric-bar-val">${fmtN(value)}</span>
  </div>`;
}

// ── Multi-session bar ─────────────────────────────────────────────
async function refreshSessions() {
  try {
    const r = await fetch(API + '/sessions');
    const d = await r.json();
    S.allSessions = d.sessions || [];
    const bar = document.getElementById('session-bar');
    if (S.allSessions.length > 1) {
      bar.classList.remove('hidden');
      document.getElementById('session-bar-inner').innerHTML =
        `<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);margin-right:4px">SESSIONS:</span>` +
        S.allSessions.map(s => `
          <div class="session-pill ${s.session_id === S.sessionId ? 'active' : ''}"
               onclick="switchSession('${s.session_id}')">
            <div class="sp-dot"></div>${s.name || s.session_id}
            <span style="opacity:.5;margin-left:4px">${s.n_rows}r</span>
            ${s.best_model ? `<span class="badge badge-emerald" style="font-size:8px">${s.best_model}</span>` : ''}
          </div>`).join('');
    } else {
      bar.classList.add('hidden');
    }
  } catch {}
}

function switchSession(sid) {
  S.sessionId = sid;
  S.results = null; S.bestModel = null;
  document.getElementById('session-chip').textContent = 'session:' + sid;
  document.getElementById('session-chip').classList.remove('hidden');
  refreshSessions();
  toast('Switched session', sid, 'info', 2000);
}
