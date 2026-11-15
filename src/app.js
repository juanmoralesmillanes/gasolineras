/* Buscador, ordenación de tablas, "cerca de mí", favoritas, menú y aviso de cookies. Sin dependencias. */
(() => {
  const $ = id => document.getElementById(id);
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = v => v ? v.toFixed(3).replace('.', ',') + ' €' : '—';
  let gasP; const gas = () => gasP ||= fetch('/data/gasolineras.json').then(r => r.json());

  // ------------------------------------------------ ordenar tablas por precio
  document.querySelectorAll('table.sortable th[data-sort]').forEach(th => {
    th.tabIndex = 0; th.title = 'Ordenar por precio';
    const sort = () => {
      const table = th.closest('table'), idx = [...th.parentNode.children].indexOf(th), tb = table.tBodies[0];
      const rows = [...tb.rows].sort((a, b) => parseFloat(a.cells[idx].dataset.v || 99) - parseFloat(b.cells[idx].dataset.v || 99));
      rows.forEach(r => tb.appendChild(r));
      table.querySelectorAll('th').forEach(x => x.classList.toggle('sorted', x === th));
    };
    th.addEventListener('click', sort); th.addEventListener('keydown', e => { if (e.key === 'Enter') sort(); });
  });

  // ------------------------------------------------ favoritas
  const favs = () => store.get('favs', []);
  const paint = () => { const f = favs(); document.querySelectorAll('[data-fav]').forEach(b => b.classList.toggle('on', f.includes(b.dataset.fav))); };
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-fav]'); if (!f) return;
    e.preventDefault(); const l = favs(), i = l.indexOf(f.dataset.fav); i >= 0 ? l.splice(i, 1) : l.unshift(f.dataset.fav); store.set('favs', l); paint();
  });
  paint();
  const row = (g, k, d) => `<tr><td><a href="/gasolinera/${esc(g[0])}/"><strong>${esc(g[1])}</strong></a><br><small>${esc(g[2])}${d != null ? ` · ${d.toFixed(1).replace('.', ',')} km` : ''}</small></td><td class="num">${eur(g[5])}</td><td class="num">${eur(g[6])}</td><td class="num">${eur(g[7])}</td><td class="num">${eur(g[8])}</td></tr>`;
  const table = rows => `<div class="table-wrap"><table class="prices"><thead><tr><th>Gasolinera</th><th class="num">G95</th><th class="num">Diésel</th><th class="num">G98</th><th class="num">GLP</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  if ($('favs')) gas().then(list => { const m = new Map(list.map(g => [g[0], g])); const items = favs().map(s => m.get(s)).filter(Boolean); $('favs').innerHTML = items.length ? table(items.map(g => row(g)).join('')) : ''; $('favs-empty').hidden = items.length > 0; });

  // ------------------------------------------------ buscador de municipios
  const q = new URLSearchParams(location.search).get('q') || '';
  document.querySelectorAll('input[name=q]').forEach(i => i.value = q);
  if ($('results') && q) fetch('/data/municipios.json').then(r => r.json()).then(list => {
    const t = norm(q).trim();
    const hits = list.filter(m => norm(m.n).includes(t) || norm(m.p).includes(t)).sort((a, b) => (norm(a.n).startsWith(t) ? 0 : 1) - (norm(b.n).startsWith(t) ? 0 : 1) || b.c - a.c);
    $('s-count').textContent = `${hits.length} municipio${hits.length === 1 ? '' : 's'} para «${q}»`;
    $('results').innerHTML = hits.slice(0, 80).map(m => `<li><a href="/gasolineras/${esc(m.s)}/"><strong>${esc(m.n)}</strong> <small>${esc(m.p)} · ${m.c} gasolinera${m.c === 1 ? '' : 's'}</small></a> <span>${m.d ? `Diésel desde ${eur(m.d)}` : ''}${m.g ? ` · G95 desde ${eur(m.g)}` : ''}</span></li>`).join('');
    if (hits.length === 1) location.href = `/gasolineras/${hits[0].s}/`;
  });

  // ------------------------------------------------ cerca de mí
  if ($('geo')) {
    let pos = null;
    const km = (a, b) => { const R = 6371, t = Math.PI / 180, dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
    const render = () => gas().then(list => {
      const k = +$('fuel').value, r = +$('radius').value;
      const hits = list.map(g => [g, km(pos, [g[3], g[4]])]).filter(([g, d]) => d <= r && g[k]).sort((a, b) => a[0][k] - b[0][k]).slice(0, 40);
      $('geo-msg').textContent = hits.length ? `${hits.length} gasolineras a menos de ${r} km, de la más barata a la más cara.` : `No hay gasolineras con ese combustible a menos de ${r} km. Prueba con un radio mayor.`;
      $('near-out').innerHTML = hits.length ? table(hits.map(([g, d]) => row(g, k, d)).join('')) : '';
    });
    $('geo').addEventListener('click', () => {
      if (!navigator.geolocation) { $('geo-msg').textContent = 'Tu navegador no permite obtener la ubicación.'; return; }
      $('geo-msg').textContent = 'Buscando tu ubicación…';
      navigator.geolocation.getCurrentPosition(p => { pos = [p.coords.latitude, p.coords.longitude]; render(); }, () => { $('geo-msg').textContent = 'No hemos podido obtener tu ubicación. Revisa los permisos del navegador o busca tu municipio.'; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    });
    ['fuel', 'radius'].forEach(id => $(id).addEventListener('change', () => pos && render()));
  }

  // ------------------------------------------------ aviso de cookies y Google Analytics
  if (window.GA_ID) {
    const KEY = 'consentimiento'; let loaded = false;
    const loadGA = () => { if (loaded) return; loaded = true; window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); }; gtag('js', new Date()); gtag('config', window.GA_ID, { anonymize_ip: true }); const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(window.GA_ID); document.head.appendChild(s); };
    const b = document.createElement('div'); b.className = 'cookie-banner'; b.hidden = true; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Aviso de cookies');
    b.innerHTML = '<p>Usamos cookies de Google Analytics para saber cuántas personas visitan la web. Solo se activan si las aceptas. <a href="/cookies/">Más información</a></p><div class="cookie-actions"><button type="button" class="btn ghost" data-c="no">Rechazar</button><button type="button" class="btn" data-c="si">Aceptar</button></div>';
    document.body.appendChild(b);
    b.addEventListener('click', e => { const x = e.target.closest('[data-c]'); if (!x) return; const ok = x.dataset.c === 'si', before = store.get(KEY, null); store.set(KEY, ok ? 'si' : 'no'); b.hidden = true; if (ok) loadGA(); else if (before === 'si') location.reload(); });
    document.addEventListener('click', e => { if (e.target.closest('[data-cookies]')) { e.preventDefault(); b.hidden = false; } });
    const c = store.get(KEY, null); if (c === 'si') loadGA(); else if (c === null) b.hidden = false;
  }

  // ------------------------------------------------ menú del móvil
  const top = document.querySelector('.top'), btn = document.querySelector('.menu-btn');
  const setMenu = open => { if (!top || !btn) return; top.classList.toggle('menu-open', open); btn.setAttribute('aria-expanded', String(open)); const t = btn.querySelector('.menu-txt'); if (t) t.textContent = open ? 'Cerrar' : 'Menú'; };
  btn?.addEventListener('click', () => setMenu(!top.classList.contains('menu-open')));
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
})();

// mapas: cambiar de combustible
document.addEventListener('click', ev => {
  const b = ev.target.closest('.map-tabs button'); if (!b) return;
  const f = b.closest('.mapbox');
  f.querySelectorAll('.map-tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  f.querySelector('img').src = `${f.dataset.base}-${b.dataset.k}.svg`;
  f.querySelectorAll('.map-legend').forEach(l => { l.hidden = l.dataset.k !== b.dataset.k; });
});
