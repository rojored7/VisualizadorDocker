/* ── State ── */
let currentTab = 'containers';
let containerFilter = 'all';
let stackFilter = 'all';
let volumeFilter = 'all';
let lastContainers = [];
let eventSource = null;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initFilters();
  initModal();
  initLogsPanel();
  connectSSE();
  loadImages();
  loadVolumes();
  loadSystem();
});

/* ── Tabs ── */
function initTabs() {
  document.querySelectorAll('.tabs__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs__btn').forEach((b) => b.classList.remove('tabs__btn--active'));
      document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('tab-content--active'));
      btn.classList.add('tabs__btn--active');
      const tab = btn.dataset.tab;
      document.getElementById(`tab-${tab}`).classList.add('tab-content--active');
      currentTab = tab;
      if (tab === 'images') loadImages();
      if (tab === 'volumes') loadVolumes();
      if (tab === 'system') loadSystem();
    });
  });
}

/* ── Filters ── */
function initFilters() {
  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('filter-btn--active'));
      btn.classList.add('filter-btn--active');
      containerFilter = btn.dataset.filter;
      renderContainers(lastContainers);
    });
  });

  document.querySelectorAll('[data-vfilter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-vfilter]').forEach((b) => b.classList.remove('filter-btn--active'));
      btn.classList.add('filter-btn--active');
      volumeFilter = btn.dataset.vfilter;
      loadVolumes();
    });
  });

  const stackSelect = document.getElementById('stackFilter');
  stackSelect.addEventListener('change', () => {
    stackFilter = stackSelect.value;
    renderContainers(lastContainers);
  });
}

/* ── SSE ── */
function connectSSE() {
  const statusEl = document.getElementById('connectionStatus');

  eventSource = new EventSource('/api/stats/stream');

  eventSource.onopen = () => {
    statusEl.textContent = 'Conectado';
    statusEl.className = 'header__status header__status--connected';
  };

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'connected') return;
    if (data.type === 'error') {
      statusEl.textContent = 'Error';
      statusEl.className = 'header__status header__status--error';
      return;
    }
    if (data.type === 'stats') {
      lastContainers = data.containers;
      updateSummary(data.summary);
      updateStackFilter(data.containers);
      renderContainers(data.containers);
    }
  };

  eventSource.onerror = () => {
    statusEl.textContent = 'Desconectado';
    statusEl.className = 'header__status header__status--error';
  };
}

/* ── Summary ── */
function updateSummary(summary) {
  document.getElementById('runningCount').textContent = summary.running;
  document.getElementById('stoppedCount').textContent = summary.stopped;
  document.getElementById('totalCpu').textContent = summary.totalCpuPercent.toFixed(1) + '%';
  document.getElementById('totalMem').textContent = summary.totalMemUsage.display;

  const memBar = document.getElementById('totalMemBar');
  const pct = summary.totalMemPercent;
  memBar.style.width = pct + '%';
  memBar.className = 'progress-bar__fill' +
    (pct > 80 ? ' progress-bar__fill--danger' : pct > 50 ? ' progress-bar__fill--warning' : '');
}

function updateStackFilter(containers) {
  const stacks = new Set();
  containers.forEach((c) => { if (c.stack) stacks.add(c.stack); });

  const select = document.getElementById('stackFilter');
  const current = select.value;
  const options = ['<option value="all">Todos los stacks</option>'];
  [...stacks].sort().forEach((s) => {
    options.push(`<option value="${s}"${s === current ? ' selected' : ''}>${s}</option>`);
  });
  select.innerHTML = options.join('');
}

/* ── Render Containers ── */
function renderContainers(containers) {
  let filtered = containers;

  if (containerFilter === 'running') {
    filtered = filtered.filter((c) => c.state === 'running');
  } else if (containerFilter === 'stopped') {
    filtered = filtered.filter((c) => c.state !== 'running');
  }

  if (stackFilter !== 'all') {
    filtered = filtered.filter((c) => c.stack === stackFilter);
  }

  filtered.sort((a, b) => {
    if (a.state === 'running' && b.state !== 'running') return -1;
    if (a.state !== 'running' && b.state === 'running') return 1;
    const memA = a.memUsage ? a.memUsage.bytes : 0;
    const memB = b.memUsage ? b.memUsage.bytes : 0;
    return memB - memA;
  });

  const grid = document.getElementById('containerGrid');
  grid.innerHTML = filtered.map((c) => containerCard(c)).join('');

  grid.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', handleContainerAction);
  });
}

function containerCard(c) {
  const isRunning = c.state === 'running';
  const stateClass = isRunning ? 'running' : c.state === 'created' ? 'created' : 'exited';
  const memMb = c.memUsage ? c.memUsage.mb : 0;
  const isDanger = memMb > 1024 || (c.cpuPercent && c.cpuPercent > 10);
  const cardClass = isDanger ? 'card card--danger' : 'card';

  const memPct = c.memPercent || 0;
  const memColor = memPct > 80 ? 'var(--red)' : memPct > 50 ? 'var(--yellow)' : 'var(--green)';

  const roleName = c.role ? c.role.role : c.description || '';
  const roleTip = c.role ? c.role.tip : '';

  let urlsHtml = '';
  if (c.urls && c.urls.length > 0) {
    const urlItems = c.urls.map((u) => {
      if (u.url) {
        return `<a class="card__url-link" href="${esc(u.url)}" target="_blank" rel="noopener" title="${esc(u.tip || '')}">${esc(u.url)}<span class="card__url-badge">${esc(u.label)}</span></a>`;
      }
      return `<span class="card__url-service" title="${esc(u.tip || '')}">:${u.port} ${esc(u.label)}</span>`;
    });
    urlsHtml = `<div class="card__urls">${urlItems.join('')}</div>`;
  } else if (isRunning) {
    urlsHtml = '<div class="card__urls"><span class="card__url-none">Sin puertos expuestos</span></div>';
  }

  return `
    <div class="${cardClass}" data-id="${c.id}">
      <div class="card__header">
        <span class="card__name">${esc(c.name)}</span>
        <span class="card__state card__state--${stateClass}">${c.state}</span>
      </div>
      <div class="card__role" title="${esc(roleTip)}">${esc(roleName)}</div>
      <div class="card__meta">${c.stack ? 'Stack: ' + esc(c.stack) + ' | ' : ''}${esc(c.image)}</div>
      ${urlsHtml}
      ${isRunning ? `
        <div class="card__stats">
          <div class="card__stat">
            <span class="card__stat-label">CPU</span>
            <span class="card__stat-value">${c.cpuPercent != null ? c.cpuPercent.toFixed(1) + '%' : '-'}</span>
          </div>
          <div class="card__stat">
            <span class="card__stat-label">RAM</span>
            <span class="card__stat-value">${c.memUsage ? c.memUsage.display : '-'}</span>
          </div>
        </div>
        <div class="card__mem-bar">
          <div class="card__mem-fill" style="width:${memPct}%;background:${memColor}"></div>
        </div>
      ` : ''}
      <div class="card__actions" style="margin-top:10px">
        ${isRunning
          ? `<button class="btn" data-action="stop" data-id="${c.id}">Stop</button>
             <button class="btn" data-action="restart" data-id="${c.id}">Restart</button>`
          : `<button class="btn btn--success" data-action="start" data-id="${c.id}">Start</button>`}
        <button class="btn" data-action="logs" data-id="${c.id}">Logs</button>
        <button class="btn" data-action="impact" data-id="${c.id}">Impacto</button>
        ${!isRunning ? `<button class="btn btn--danger" data-action="remove" data-id="${c.id}">Eliminar</button>` : ''}
      </div>
    </div>
  `;
}

async function handleContainerAction(e) {
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;
  const btn = e.target;
  btn.disabled = true;

  try {
    switch (action) {
      case 'start':
        await API.containers.start(id);
        toast('Contenedor iniciado', 'success');
        break;
      case 'stop':
        await API.containers.stop(id);
        toast('Contenedor detenido', 'success');
        break;
      case 'restart':
        await API.containers.restart(id);
        toast('Contenedor reiniciado', 'success');
        break;
      case 'logs':
        await showLogs(id);
        break;
      case 'impact':
        await showContainerImpact(id);
        break;
      case 'remove':
        await showContainerImpact(id, true);
        break;
    }
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ── Images Tab ── */
async function loadImages() {
  try {
    const images = await API.images.list();

    const inUse = images.filter((i) => i.inUse);
    const totalSize = images.reduce((s, i) => s + i.size.bytes, 0);

    document.getElementById('imageCount').textContent = images.length;
    document.getElementById('imageInUse').textContent = inUse.length;
    document.getElementById('imageDisk').textContent = formatBytes(totalSize);

    images.sort((a, b) => b.size.bytes - a.size.bytes);

    const grid = document.getElementById('imageGrid');
    grid.innerHTML = images.map((img) => {
      const riskClass = img.inUse ? 'caution' : 'safe';
      const riskText = img.inUse ? 'EN USO' : 'Sin usar';

      return `
        <div class="card">
          <div class="card__header">
            <span class="card__name">${esc(img.name)}</span>
          </div>
          <div class="card__desc">${esc(img.description || '')}</div>
          <div class="card__size">${img.size.display}</div>
          <div class="card__usage">${img.containers.length} contenedor(es)</div>
          <span class="card__risk card__risk--${riskClass}">${riskText}</span>
          <div class="card__actions">
            <button class="btn" data-img-action="impact" data-id="${esc(img.id)}">Ver impacto</button>
            ${!img.inUse ? `<button class="btn btn--danger" data-img-action="remove" data-id="${esc(img.id)}">Eliminar</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-img-action]').forEach((btn) => {
      btn.addEventListener('click', handleImageAction);
    });

    document.getElementById('pruneImagesBtn').onclick = async () => {
      if (!confirm('Eliminar todas las imagenes sin usar?')) return;
      try {
        await API.system.prune('images');
        toast('Imagenes limpiadas', 'success');
        loadImages();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  } catch (err) {
    toast('Error cargando imagenes: ' + err.message, 'error');
  }
}

async function handleImageAction(e) {
  const action = e.target.dataset.imgAction;
  const id = e.target.dataset.id;
  e.target.disabled = true;

  try {
    if (action === 'impact') {
      await showImageImpact(id);
    } else if (action === 'remove') {
      await showImageImpact(id, true);
    }
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    e.target.disabled = false;
  }
}

/* ── Volumes Tab ── */
async function loadVolumes() {
  try {
    const volumes = await API.volumes.list();

    let filtered = volumes;
    if (volumeFilter === 'named') filtered = volumes.filter((v) => !v.isAnonymous);
    if (volumeFilter === 'anonymous') filtered = volumes.filter((v) => v.isAnonymous);
    if (volumeFilter === 'orphan') filtered = volumes.filter((v) => v.isOrphan);

    document.getElementById('volumeCount').textContent = volumes.length;
    document.getElementById('volumeOrphans').textContent = volumes.filter((v) => v.isOrphan).length;
    document.getElementById('volumeAnonymous').textContent = volumes.filter((v) => v.isAnonymous).length;

    filtered.sort((a, b) => {
      if (a.isOrphan && !b.isOrphan) return -1;
      if (!a.isOrphan && b.isOrphan) return 1;
      return a.name.localeCompare(b.name);
    });

    const grid = document.getElementById('volumeGrid');
    grid.innerHTML = filtered.map((v) => {
      const displayName = v.isAnonymous ? v.name.slice(0, 12) + '...' : v.name;
      const riskClass = v.isAnonymous && v.isOrphan ? 'safe' : v.dataRisk === 'high' ? 'danger' : v.dataRisk === 'medium' ? 'caution' : 'safe';
      const riskText = v.isAnonymous && v.isOrphan ? 'SEGURO eliminar' : v.isOrphan ? 'Huerfano' : `${v.usedBy.length} contenedor(es)`;

      return `
        <div class="card">
          <div class="card__header">
            <span class="card__name">${esc(displayName)}</span>
            ${v.isAnonymous ? '<span class="card__state card__state--exited">Anonimo</span>' : ''}
          </div>
          <div class="card__desc">${esc(v.dataType)}</div>
          <div class="card__meta">${v.isOrphan ? 'Sin montar - Huerfano' : 'Montado en ' + v.usedBy.map((u) => u.name).join(', ')}</div>
          <span class="card__risk card__risk--${riskClass}">${riskText}</span>
          <div class="card__actions" style="margin-top:8px">
            <button class="btn" data-vol-action="impact" data-name="${esc(v.name)}">Ver impacto</button>
            ${v.isOrphan ? `<button class="btn btn--danger" data-vol-action="remove" data-name="${esc(v.name)}">Eliminar</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-vol-action]').forEach((btn) => {
      btn.addEventListener('click', handleVolumeAction);
    });

    document.getElementById('pruneVolumesBtn').onclick = async () => {
      if (!confirm('Eliminar todos los volumenes huerfanos?')) return;
      try {
        await API.system.prune('volumes');
        toast('Volumenes limpiados', 'success');
        loadVolumes();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  } catch (err) {
    toast('Error cargando volumenes: ' + err.message, 'error');
  }
}

async function handleVolumeAction(e) {
  const action = e.target.dataset.volAction;
  const name = e.target.dataset.name;
  e.target.disabled = true;

  try {
    if (action === 'impact') {
      await showVolumeImpact(name);
    } else if (action === 'remove') {
      await showVolumeImpact(name, true);
    }
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    e.target.disabled = false;
  }
}

/* ── System Tab ── */
async function loadSystem() {
  try {
    const [df, preview] = await Promise.all([
      API.system.df(),
      API.system.prunePreview(),
    ]);

    const maxBytes = df.total.bytes || 1;

    const overview = document.getElementById('systemOverview');
    overview.innerHTML = `
      <div class="disk-section">
        <div class="disk-section__title">Uso de Disco Total: ${df.total.display}</div>
        ${diskRow('Imagenes', df.images.size.bytes, maxBytes, df.images.size.display, 'var(--accent)')}
        ${diskRow('Build Cache', df.buildCache.size.bytes, maxBytes, df.buildCache.size.display, 'var(--orange)')}
        ${diskRow('Volumenes', df.volumes.size.bytes, maxBytes, df.volumes.size.display, 'var(--green)')}
        ${diskRow('Contenedores', df.containers.size.bytes, maxBytes, df.containers.size.display, 'var(--yellow)')}
      </div>

      <div class="prune-section">
        <div class="prune-section__title">Preview de Limpieza</div>
        <div class="prune-item">
          <span>Contenedores detenidos</span>
          <span>${preview.containers.count} contenedores</span>
        </div>
        <div class="prune-item">
          <span>Imagenes sin usar</span>
          <span>${preview.images.count} (${preview.images.size.display})</span>
        </div>
        <div class="prune-item">
          <span>Volumenes huerfanos</span>
          <span>${preview.volumes.count} volumenes</span>
        </div>
        <div class="prune-item">
          <span>Build cache</span>
          <span>${df.buildCache.reclaimable.display}</span>
        </div>
        <div class="prune-total">
          <span>Total recuperable</span>
          <span>${df.totalReclaimable.display}</span>
        </div>
        <div class="prune-actions">
          <button class="btn btn--warning" id="pruneAllBtn">Ejecutar limpieza completa</button>
          <button class="btn" id="pruneCacheBtn">Solo build cache</button>
        </div>
      </div>
    `;

    document.getElementById('pruneAllBtn').onclick = async () => {
      if (!confirm('Esto eliminara contenedores detenidos, imagenes sin usar, volumenes huerfanos y build cache. Continuar?')) return;
      try {
        await API.system.prune('all');
        toast('Limpieza completa ejecutada', 'success');
        loadSystem();
        loadImages();
        loadVolumes();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    document.getElementById('pruneCacheBtn').onclick = async () => {
      if (!confirm('Eliminar todo el build cache?')) return;
      try {
        await API.system.prune('buildcache');
        toast('Build cache eliminado', 'success');
        loadSystem();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  } catch (err) {
    document.getElementById('systemOverview').innerHTML =
      `<div class="system-loading">Error: ${esc(err.message)}</div>`;
  }
}

function diskRow(label, bytes, maxBytes, display, color) {
  const pct = maxBytes > 0 ? (bytes / maxBytes) * 100 : 0;
  return `
    <div class="disk-row">
      <span class="disk-row__label">${label}</span>
      <div class="disk-row__bar">
        <div class="disk-row__fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="disk-row__value">${display}</span>
    </div>
  `;
}

/* ── Impact Modals ── */
function initModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
}

function openModal(title, bodyHtml, footerHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  document.getElementById('modalOverlay').classList.add('modal-overlay--visible');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('modal-overlay--visible');
}

async function showContainerImpact(id, withDelete = false) {
  const impact = await API.containers.impact(id);

  let body = `
    <div class="card__desc" style="margin-bottom:8px">${esc(impact.description)}</div>
    ${impact.stack ? `<div class="card__meta">Stack: ${esc(impact.stack)}</div>` : ''}
    <div style="margin:12px 0">
      <span class="card__risk card__risk--${riskClass(impact.riskLevel)}">${impact.riskLevel}</span>
    </div>
  `;

  if (impact.factors.length > 0) {
    body += impact.factors.map((f) => `
      <div class="impact-item">
        <div class="impact-dot impact-dot--${f.risk}"></div>
        <span>${esc(f.message)}</span>
      </div>
    `).join('');
  }

  if (impact.warnings.length > 0) {
    body += impact.warnings.map((w) => `
      <div class="impact-warning">${esc(w)}</div>
    `).join('');
  }

  if (impact.orphanVolumes.length > 0) {
    body += '<div style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary)">Volumenes que quedarian huerfanos:</div>';
    body += impact.orphanVolumes.map((v) => `
      <div class="impact-item">
        <div class="impact-dot impact-dot--${v.risk}"></div>
        <span>${esc(v.name)} (${esc(v.type)})</span>
      </div>
    `).join('');
  }

  let footer = '<button class="btn" onclick="closeModal()">Cerrar</button>';
  if (withDelete) {
    footer = `
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn--danger" onclick="doRemoveContainer('${id}')">Eliminar de todos modos</button>
    `;
  }

  openModal(`Impacto: ${impact.container.name}`, body, footer);
}

async function showImageImpact(id, withDelete = false) {
  const impact = await API.images.impact(id);

  let body = `
    <div class="card__desc" style="margin-bottom:8px">${esc(impact.description)}</div>
    <div class="card__size">${impact.image.size.display}</div>
    <div style="margin:12px 0">
      <span class="card__risk card__risk--${riskClass(impact.riskLevel)}">${impact.riskLevel}</span>
    </div>
  `;

  if (impact.factors.length > 0) {
    body += impact.factors.map((f) => `
      <div class="impact-item">
        <div class="impact-dot impact-dot--${f.risk}"></div>
        <span>${esc(f.message)}</span>
      </div>
    `).join('');
  }

  if (impact.dependentContainers.length > 0) {
    body += '<div style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary)">Contenedores dependientes:</div>';
    body += impact.dependentContainers.map((c) => `
      <div class="impact-item">
        <div class="impact-dot impact-dot--${c.state === 'running' ? 'high' : 'medium'}"></div>
        <span>${esc(c.name)} (${c.state})</span>
      </div>
    `).join('');
  }

  if (impact.warnings.length > 0) {
    body += impact.warnings.map((w) => `
      <div class="impact-warning">${esc(w)}</div>
    `).join('');
  }

  let footer = '<button class="btn" onclick="closeModal()">Cerrar</button>';
  if (withDelete && impact.riskLevel === 'SEGURO') {
    footer = `
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn--danger" onclick="doRemoveImage('${esc(id)}')">Eliminar</button>
    `;
  }

  openModal(`Impacto: ${impact.image.name}`, body, footer);
}

async function showVolumeImpact(name, withDelete = false) {
  const impact = await API.volumes.impact(name);

  let body = `
    <div class="card__desc" style="margin-bottom:8px">${esc(impact.dataType)}</div>
    <div class="card__meta">${impact.volume.isAnonymous ? 'Volumen anonimo' : 'Volumen nombrado'} | ${impact.volume.isOrphan ? 'Huerfano' : 'En uso'}</div>
    <div style="margin:12px 0">
      <span class="card__risk card__risk--${riskClass(impact.riskLevel)}">${impact.riskLevel}</span>
    </div>
  `;

  if (impact.factors.length > 0) {
    body += impact.factors.map((f) => `
      <div class="impact-item">
        <div class="impact-dot impact-dot--${f.risk}"></div>
        <span>${esc(f.message)}</span>
      </div>
    `).join('');
  }

  if (impact.usedBy.length > 0) {
    body += '<div style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary)">Contenedores que lo usan:</div>';
    body += impact.usedBy.map((c) => `
      <div class="impact-item">
        <div class="impact-dot impact-dot--${c.state === 'running' ? 'high' : 'medium'}"></div>
        <span>${esc(c.name)} (${c.state})</span>
      </div>
    `).join('');
  }

  if (impact.warnings.length > 0) {
    body += impact.warnings.map((w) => `
      <div class="impact-warning">${esc(w)}</div>
    `).join('');
  }

  let footer = '<button class="btn" onclick="closeModal()">Cerrar</button>';
  if (withDelete) {
    footer = `
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn--danger" onclick="doRemoveVolume('${esc(name)}')">Eliminar de todos modos</button>
    `;
  }

  openModal(`Impacto: ${name.length > 20 ? name.slice(0, 20) + '...' : name}`, body, footer);
}

/* ── Delete actions ── */
async function doRemoveContainer(id) {
  closeModal();
  try {
    await API.containers.remove(id, true);
    toast('Contenedor eliminado', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function doRemoveImage(id) {
  closeModal();
  try {
    await API.images.remove(id, true);
    toast('Imagen eliminada', 'success');
    loadImages();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function doRemoveVolume(name) {
  closeModal();
  try {
    await API.volumes.remove(name);
    toast('Volumen eliminado', 'success');
    loadVolumes();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ── Logs Panel ── */
function initLogsPanel() {
  document.getElementById('logsPanelClose').addEventListener('click', () => {
    document.getElementById('logsPanel').classList.remove('logs-panel--visible');
  });
}

async function showLogs(id) {
  const container = lastContainers.find((c) => c.id === id);
  const name = container ? container.name : id.slice(0, 12);

  document.getElementById('logsPanelTitle').textContent = `Logs: ${name}`;
  document.getElementById('logsPanelContent').textContent = 'Cargando...';
  document.getElementById('logsPanel').classList.add('logs-panel--visible');

  try {
    const data = await API.containers.logs(id);
    document.getElementById('logsPanelContent').textContent = data.logs.join('\n') || '(sin logs)';
    const content = document.getElementById('logsPanelContent');
    content.scrollTop = content.scrollHeight;
  } catch (err) {
    document.getElementById('logsPanelContent').textContent = 'Error: ' + err.message;
  }
}

/* ── Toast ── */
function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── Utilities ── */
function esc(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function riskClass(level) {
  if (level === 'PELIGROSO') return 'danger';
  if (level === 'PRECAUCION') return 'caution';
  return 'safe';
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(2) + ' GB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(1) + ' MB';
}
