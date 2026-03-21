/* Page 1 — Data Import */

document.addEventListener('DOMContentLoaded', () => {
  checkApi();
  setInterval(checkApi, 15000);

  const dz = document.getElementById('drop-zone');
  const fi = document.getElementById('file-in');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
  });
  fi.addEventListener('change', e => { if (e.target.files[0]) uploadFile(e.target.files[0]); });
});

async function uploadFile(f) {
  if (!f.name.endsWith('.csv')) { toast('Wrong type', 'Upload a .csv file', 'error'); return; }
  const fd = new FormData(); fd.append('file', f);
  toast('Uploading…', f.name, 'info', 2000);
  try {
    const r = await fetch(API + '/upload', {method: 'POST', body: fd});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    onData(d);
  } catch (e) { toast('Upload failed', e.message, 'error'); }
}

async function loadPasted() {
  const raw = document.getElementById('csv-paste').value.trim();
  if (!raw) { toast('Nothing to load', 'Paste CSV first', 'warn'); return; }
  const fd = new FormData();
  fd.append('file', new Blob([raw], {type: 'text/csv'}), 'pasted.csv');
  try {
    const r = await fetch(API + '/upload', {method: 'POST', body: fd});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    onData(d);
  } catch (e) { toast('Failed', e.message, 'error'); }
}

async function loadSample(name) {
  toast('Loading…', name, 'info', 2000);
  try {
    const r = await fetch(API + '/sample/' + name, {method: 'POST'});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    onData(d);
  } catch (e) { toast('Failed', e.message, 'error'); }
}

function onData(d) {
  Object.assign(S, {
    sessionId: d.session_id, columns: d.columns, dtypes: d.dtypes,
    colKinds: d.col_kinds || {}, nRows: d.n_rows, missing: d.missing || {},
    selectedFeatures: new Set(d.columns),
  });

  const chip = document.getElementById('session-chip');
  chip.textContent = 'session:' + S.sessionId;
  chip.classList.remove('hidden');

  document.getElementById('stat-rows').textContent    = fmt(d.n_rows);
  document.getElementById('stat-cols').textContent    = d.n_cols;
  document.getElementById('stat-missing').textContent = d.total_missing_pct + '%';
  document.getElementById('stat-mem').textContent     = d.memory_mb + ' MB';
  document.getElementById('preview-total').textContent = fmt(d.n_rows) + ' rows';

  // Preview table
  document.getElementById('preview-tbl').innerHTML =
    `<thead><tr>${d.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
     <tbody>${(d.preview || []).map(row =>
       `<tr>${d.columns.map(c => {
         const v = row[c], nil = v === null || v === undefined;
         return `<td class="${nil ? 'null-val' : ''}">${nil ? 'null' : v}</td>`;
       }).join('')}</tr>`).join('')}</tbody>`;

  // Column tags
  document.getElementById('col-tags').innerHTML =
    d.columns.slice(0, 12).map(c => {
      const k = (d.col_kinds || {})[c] || 'categorical';
      const cls = k === 'categorical' ? 'categorical' : 'numeric';
      const label = k === 'categorical' ? 'CAT' : k === 'numeric_discrete' ? 'INT' : 'NUM';
      return `<span class="tag ${cls}">${c}<span class="type-badge">${label}</span></span>`;
    }).join('') +
    (d.columns.length > 12 ? `<span class="tag">+${d.columns.length - 12}</span>` : '');

  document.getElementById('import-ui').classList.add('hidden');
  document.getElementById('import-preview').classList.remove('hidden');
  refreshSessions();
  toast('Dataset loaded', `${fmt(d.n_rows)} rows · ${d.n_cols} columns`, 'success');
}

function resetImport() {
  document.getElementById('import-ui').classList.remove('hidden');
  document.getElementById('import-preview').classList.add('hidden');
  S.sessionId = null;
  document.getElementById('session-chip').classList.add('hidden');
}
