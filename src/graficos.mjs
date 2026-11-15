// Ilustraciones y gráficos SVG propios (sin imágenes de terceros).
// Todo se genera a partir de los datos oficiales de precios.

const f3 = v => v.toFixed(3).replace('.', ',');
const n1 = v => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- escala de color por precio
// 5 tramos según los quintiles nacionales: verde = barato, rojo = caro
export const COLORS = ['#0b8a4a', '#6cbf5a', '#f2c94c', '#f2994a', '#d64545'];
export function quantiles(values) {
  const v = values.filter(Boolean).sort((a, b) => a - b);
  const q = p => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return [q(0.2), q(0.4), q(0.6), q(0.8)];
}
export const colorOf = (v, q) => COLORS[q.findIndex(x => v <= x) === -1 ? 4 : q.findIndex(x => v <= x)];
export const legend = (q, label = 'Precio por litro') => `<p class="map-legend"><span>${label}:</span>${COLORS.map((c, i) => `<span><i style="background:${c}"></i>${i === 0 ? `hasta ${f3(q[0])}` : i === 4 ? `más de ${f3(q[3])}` : `${f3(q[i - 1])}–${f3(q[i])}`}</span>`).join('')}</p>`;

// ---------------------------------------------------------------- mapa de España (puntos agregados en una rejilla)
const PEN = { lon0: -9.6, lon1: 4.6, lat0: 35.1, lat1: 44.0 };
const CAN = { lon0: -18.3, lon1: -13.3, lat0: 27.5, lat1: 29.5 };
export function spainMap(list, k, q, { title = '' } = {}) {
  const kx = Math.cos(40 * Math.PI / 180), W = 820, s = W / ((PEN.lon1 - PEN.lon0) * kx), H = Math.round((PEN.lat1 - PEN.lat0) * s);
  const kc = Math.cos(28.5 * Math.PI / 180), cs = s * 0.68, cw = (CAN.lon1 - CAN.lon0) * kc * cs, ch = (CAN.lat1 - CAN.lat0) * cs, cx0 = W - cw - 16, cy0 = H - ch - 16;
  const cell = 0.12, cells = new Map();
  for (const e of list) {
    if (!e.p[k]) continue;
    const key = `${Math.floor(e.lat / cell)}|${Math.floor(e.lon / cell)}`;
    const c = cells.get(key) || { lat: 0, lon: 0, sum: 0, n: 0 };
    c.lat += e.lat; c.lon += e.lon; c.sum += e.p[k]; c.n++; cells.set(key, c);
  }
  const dots = [];
  for (const c of cells.values()) {
    const lat = c.lat / c.n, lon = c.lon / c.n, v = c.sum / c.n;
    let x, y;
    if (lat < 30) { x = cx0 + (lon - CAN.lon0) * kc * cs; y = cy0 + (CAN.lat1 - lat) * cs; }
    else { x = (lon - PEN.lon0) * kx * s; y = (PEN.lat1 - lat) * s; }
    const r = Math.min(7, 2.6 + Math.sqrt(c.n) * 0.9) * (lat < 30 ? 0.8 : 1);
    dots.push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="${colorOf(v, q)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><rect width="${W}" height="${H}" rx="18" fill="#eef4f0"/><rect x="${cx0 - 6}" y="${n1(cy0 - 6)}" width="${n1(cw + 12)}" height="${n1(ch + 12)}" rx="10" fill="none" stroke="#c9d6cd" stroke-dasharray="4 4"/><text x="${cx0}" y="${n1(cy0 - 12)}" font-family="system-ui,Arial,sans-serif" font-size="13" fill="#5d6676">Canarias</text><g fill-opacity=".85">${dots.join('')}</g></svg>`;
}

// mapa de una zona (provincia o alrededores de una gasolinera): un punto por gasolinera
export function areaMap(list, k, q, { W = 640, maxH = 520, highlight = null, link = false, label = '', labels = [] } = {}) {
  const pts = list.filter(e => e.p[k] && e.lat && e.lon);
  if (pts.length < 2) return '';
  let la0 = Math.min(...pts.map(e => e.lat)), la1 = Math.max(...pts.map(e => e.lat)), lo0 = Math.min(...pts.map(e => e.lon)), lo1 = Math.max(...pts.map(e => e.lon));
  const padLa = (la1 - la0) * 0.06 + 0.01, padLo = (lo1 - lo0) * 0.06 + 0.01; la0 -= padLa; la1 += padLa; lo0 -= padLo; lo1 += padLo;
  const kx = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
  let s = W / ((lo1 - lo0) * kx), H = (la1 - la0) * s;
  if (H > maxH) { s *= maxH / H; H = maxH; }
  const w = (lo1 - lo0) * kx * s, ox = (W - w) / 2;
  const X = e => n1(ox + (e.lon - lo0) * kx * s), Y = e => n1((la1 - e.lat) * s);
  const r = (pts.length > 400 ? 4 : pts.length > 120 ? 6 : 7) * (W >= 800 ? 1.2 : 1);
  const dot = e => {
    const c = `<circle cx="${X(e)}" cy="${Y(e)}" r="${r}" fill="${colorOf(e.p[k], q)}"><title>${e.name} · ${e.munName}: ${f3(e.p[k])} €</title></circle>`;
    return link ? `<a href="/gasolinera/${e.slug}/">${c}</a>` : c;
  };
  const hl = highlight ? `<circle cx="${X(highlight)}" cy="${Y(highlight)}" r="${r + 7}" fill="none" stroke="#10261b" stroke-width="3"/><circle cx="${X(highlight)}" cy="${Y(highlight)}" r="${r + 1}" fill="${highlight.p[k] ? colorOf(highlight.p[k], q) : '#10261b'}" stroke="#fff" stroke-width="2"/>` : '';
  const fs = W >= 800 ? 17 : 13;
  const placed = [];
  const lab = labels.map(l => {
    const x = X(l), y = n1(Y(l) - r - 6), half = l.name.length * fs * 0.3;
    if (placed.some(o => Math.abs(o.x - x) < o.half + half && Math.abs(o.y - y) < fs + 4)) return '';
    placed.push({ x, y, half });
    return `<text x="${x}" y="${y}" text-anchor="middle">${l.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
  }).join('');
  return `<svg class="map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${n1(H)}" role="img" aria-label="${label}"><rect width="${W}" height="${n1(H)}" rx="16" fill="#eef4f0"/><g fill-opacity=".9" stroke="#fff" stroke-width="1">${pts.filter(e => e !== highlight).map(dot).join('')}</g>${hl}${lab ? `<g font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="${fs}" font-weight="700" fill="#10261b" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${lab}</g>` : ''}</svg>`;
}

// ---------------------------------------------------------------- histograma de precios
export function histogram(list, k, q, { label = '', avgV = null } = {}) {
  const v = list.map(e => e.p[k]).filter(Boolean).sort((a, b) => a - b);
  if (v.length < 8) return '';
  const lo = Math.floor(v[Math.floor(v.length * 0.01)] * 100) / 100, hi = Math.ceil(v[Math.floor(v.length * 0.99)] * 100) / 100;
  const step = Math.max(0.01, Math.ceil((hi - lo) / 36 * 100) / 100), nb = Math.max(1, Math.round((hi - lo) / step) + 1);
  const bins = Array(nb).fill(0);
  for (const x of v) bins[Math.max(0, Math.min(nb - 1, Math.floor((x - lo) / step + 1e-9)))]++;
  const W = 760, H = 220, pl = 10, pr = 10, pt = 26, pb = 34, bw = (W - pl - pr) / nb, mx = Math.max(...bins);
  const bars = bins.map((c, i) => { const h = c / mx * (H - pt - pb); const mid = lo + step * (i + 0.5); return `<rect x="${n1(pl + i * bw + 1)}" y="${n1(H - pb - h)}" width="${n1(bw - 2)}" height="${n1(h)}" rx="2" fill="${colorOf(mid, q)}"><title>${f3(lo + step * i)}–${f3(lo + step * (i + 1))} €: ${c} gasolineras</title></rect>`; }).join('');
  const a = avgV ?? v.reduce((s, x) => s + x, 0) / v.length, ax = pl + (a - lo) / step * bw;
  const ticks = [0, Math.floor(nb / 2), nb - 1].map(i => `<text x="${n1(pl + i * bw + bw / 2)}" y="${H - 12}" text-anchor="middle" class="ax">${f3(lo + step * i)}</text>`).join('');
  return `<svg class="chart hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${bars}<line x1="${n1(ax)}" x2="${n1(ax)}" y1="${pt - 8}" y2="${H - pb}" stroke="#10261b" stroke-width="2" stroke-dasharray="5 4"/><text x="${n1(Math.min(W - 70, Math.max(70, ax)))}" y="${pt - 12}" text-anchor="middle" class="ax strong">media ${f3(a)} €</text>${ticks}</svg>`;
}

// ---------------------------------------------------------------- barras horizontales (HTML + CSS)
// items: [{label, href, v, hl}] · la escala empieza un poco por debajo del mínimo para que se vean las diferencias
export function bars(items, q, { fmt = v => f3(v) + ' €', note = true } = {}) {
  const vals = items.map(i => i.v).filter(Boolean);
  if (!vals.length) return '';
  const lo = Math.min(...vals) - Math.max((Math.max(...vals) - Math.min(...vals)) * 0.35, 0.08), hi = Math.max(...vals);
  return `<ul class="bars">${items.filter(i => i.v).map(i => `<li${i.hl ? ' class="hl"' : ''}><span class="b-l">${i.href ? `<a href="${i.href}">${i.label}</a>` : i.label}</span><span class="b-t"><i style="width:${Math.max(4, ((i.v - lo) / (hi - lo)) * 100).toFixed(1)}%;background:${q ? colorOf(i.v, q) : 'var(--accent)'}"></i></span><b>${fmt(i.v)}</b></li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------- iconos de combustible para las tarjetas
const FUEL_COL = { g95: '#0f9d58', ga: '#1a1f29', g98: '#2563eb', gap: '#6b4b00', glp: '#7c3aed' };
export const fuelIcon = k => `<svg class="f-ico" viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="6" width="18" height="28" rx="4" fill="${FUEL_COL[k] || '#0f9d58'}"/><rect x="10" y="10" width="12" height="8" rx="2" fill="#fff" opacity=".9"/><rect x="5" y="32" width="22" height="4" rx="2" fill="${FUEL_COL[k] || '#0f9d58'}"/><path d="M25 14h4q3 0 3 3v10q0 2.5 2 2.5t2-2.5V13l-4-4" fill="none" stroke="#ffb020" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------- portadas de guías y blog
const ICONS = {
  ahorro: `<ellipse cx="100" cy="112" rx="64" ry="48" fill="#ffb020"/><circle cx="148" cy="102" r="16" fill="#f59e0b"/><circle cx="144" cy="100" r="3" fill="#10261b"/><circle cx="152" cy="100" r="3" fill="#10261b"/><path d="M70 70 l12 -20 l12 22z" fill="#f59e0b"/><circle cx="118" cy="92" r="5" fill="#10261b"/><rect x="88" y="66" width="28" height="6" rx="3" fill="#10261b"/><rect x="62" y="150" width="14" height="22" rx="4" fill="#f59e0b"/><rect x="118" y="150" width="14" height="22" rx="4" fill="#f59e0b"/><circle cx="102" cy="30" r="18" fill="#ffd27a" stroke="#d98e00" stroke-width="4"/><text x="102" y="37" text-anchor="middle" font-size="20" font-weight="800" fill="#b45309" font-family="Arial,sans-serif">€</text>`,
  octanos: `<path d="M62 40 C40 78 26 100 26 120 a36 36 0 0 0 72 0 C98 100 84 78 62 40z" fill="#0f9d58"/><text x="62" y="132" text-anchor="middle" font-size="28" font-weight="800" fill="#fff" font-family="Arial,sans-serif">95</text><path d="M140 40 C118 78 104 100 104 120 a36 36 0 0 0 72 0 C176 100 162 78 140 40z" fill="#2563eb"/><text x="140" y="132" text-anchor="middle" font-size="28" font-weight="800" fill="#fff" font-family="Arial,sans-serif">98</text>`,
  lowcost: `<path d="M40 40 h70 l60 60 l-70 70 l-60 -60z" fill="#ffb020"/><circle cx="70" cy="70" r="10" fill="#10261b"/><text x="112" y="132" text-anchor="middle" font-size="46" font-weight="800" fill="#10261b" font-family="Arial,sans-serif" transform="rotate(-45 112 118)">−%</text>`,
  isla: `<circle cx="150" cy="48" r="24" fill="#ffb020"/><path d="M20 140 q30 -60 70 -70 q40 -6 60 30 q20 34 30 40z" fill="#0f9d58"/><path d="M60 100 l26 -40 l26 40z" fill="#0b7a43"/><path d="M10 160 q20 -10 40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#7cc4f5" stroke-width="7" stroke-linecap="round"/><path d="M10 182 q20 -10 40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#7cc4f5" stroke-width="7" stroke-linecap="round" opacity=".6"/>`,
  precio: `<circle cx="100" cy="100" r="70" fill="#e8fff2"/><path d="M100 100 L100 30 A70 70 0 0 1 166 122z" fill="#ffb020"/><path d="M100 100 L166 122 A70 70 0 0 1 60 157z" fill="#0f9d58"/><path d="M100 100 L60 157 A70 70 0 0 1 100 30z" fill="#2563eb"/><circle cx="100" cy="100" r="26" fill="#10261b"/><text x="100" y="108" text-anchor="middle" font-size="22" font-weight="800" fill="#fff" font-family="Arial,sans-serif">€</text>`,
  glp: `<rect x="56" y="44" width="88" height="128" rx="40" fill="#7c3aed"/><rect x="80" y="22" width="40" height="26" rx="6" fill="#a78bfa"/><rect x="72" y="92" width="56" height="30" rx="6" fill="#fff"/><text x="100" y="114" text-anchor="middle" font-size="20" font-weight="800" fill="#7c3aed" font-family="Arial,sans-serif">GLP</text>`,
  coche: `<path d="M14 120 q0-18 18-22 l26-6 l24-24 q6-6 16-6 h52 q10 0 16 8 l20 24 l2 0 q10 4 10 22 v8 q0 6-6 6 H20 q-6 0-6-6z" fill="#e5484d"/><path d="M90 70 h44 q6 0 10 5 l16 19 H72z" fill="#d7ecf7"/><circle cx="58" cy="134" r="16" fill="#1a1f29"/><circle cx="58" cy="134" r="7" fill="#c9d6cd"/><circle cx="160" cy="134" r="16" fill="#1a1f29"/><circle cx="160" cy="134" r="7" fill="#c9d6cd"/><rect x="40" y="20" width="44" height="34" rx="8" fill="#1a1f29"/><text x="62" y="44" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" font-family="Arial,sans-serif">D</text><rect x="120" y="20" width="44" height="34" rx="8" fill="#0f9d58"/><text x="142" y="44" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" font-family="Arial,sans-serif">G</text>`,
  reloj: `<circle cx="100" cy="100" r="72" fill="#fff" stroke="#ffb020" stroke-width="10"/><g stroke="#10261b" stroke-width="5" stroke-linecap="round"><path d="M100 100 V52"/><path d="M100 100 L132 118"/></g><circle cx="100" cy="100" r="7" fill="#10261b"/><text x="100" y="160" text-anchor="middle" font-size="22" font-weight="800" fill="#0f9d58" font-family="Arial,sans-serif">24 h</text>`,
  surtidor: `<rect x="50" y="34" width="72" height="128" rx="12" fill="#0f9d58"/><rect x="62" y="50" width="48" height="34" rx="6" fill="#e8fff2"/><rect x="40" y="156" width="92" height="16" rx="6" fill="#0b7a43"/><path d="M122 70 h18 q12 0 12 12 v52 q0 10 9 10 t9-10 V64 l-16-18" fill="none" stroke="#ffb020" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`
};
const ICON_FOR = [[/ahorr|truco|consum/, 'ahorro'], [/95|98|octan/, 'octanos'], [/canaria|ceuta|melilla/, 'isla'], [/low-?cost|automatic/, 'lowcost'], [/precio|calcula|impuest/, 'precio'], [/glp|autogas/, 'glp'], [/diesel|electric|hibrid/, 'coche'], [/24|horari|noche/, 'reloj']];
export const iconFor = slug => (ICON_FOR.find(([re]) => re.test(slug)) || [, 'surtidor'])[1];
const PALETTES = [['#10261b', '#1d3a2b'], ['#0b5d3a', '#0f9d58'], ['#1d3a2b', '#2b5a43'], ['#3a2a00', '#6b4b00']];
export function cover(slug, { icon = iconFor(slug) } = {}) {
  let h = 0; for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = PALETTES[h % PALETTES.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 280"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="640" height="280" fill="url(#g)"/><circle cx="${80 + h % 200}" cy="60" r="90" fill="#fff" opacity=".05"/><circle cx="560" cy="250" r="140" fill="#fff" opacity=".05"/><g stroke="#fff" stroke-opacity=".18" stroke-width="6" stroke-dasharray="30 24"><path d="M0 250 H640"/></g><g transform="translate(220 40)">${ICONS[icon]}</g></svg>`;
}

// ---------------------------------------------------------------- líneas de evolución
// series: [{ name, color, dash, pts: [[ 'aaaa-mm-dd', valor ], ...] }]
export function lineChart(series, { label = '', W = 760, H = 260 } = {}) {
  const all = series.flatMap(s => s.pts.filter(p => p[1]));
  const days = [...new Set(all.map(p => p[0]))].sort();
  if (days.length < 2) return '';
  const pad = { l: 46, r: 14, t: 14, b: 30 };
  let lo = Math.min(...all.map(p => p[1])), hi = Math.max(...all.map(p => p[1]));
  const span = Math.max(hi - lo, 0.04); lo -= span * 0.12; hi += span * 0.12;
  const idx = new Map(days.map((d, i) => [d, i]));
  const X = d => pad.l + idx.get(d) * (W - pad.l - pad.r) / (days.length - 1);
  const Y = v => pad.t + (hi - v) * (H - pad.t - pad.b) / (hi - lo);
  const ticks = [0, 0.5, 1].map(f => lo + (hi - lo) * (0.1 + f * 0.8)).map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${n1(Y(v))}" y2="${n1(Y(v))}" class="grid"/><text x="${pad.l - 6}" y="${n1(Y(v) + 4)}" text-anchor="end" class="ax">${v.toFixed(3).replace('.', ',')}</text>`).join('');
  const fd = d => d.slice(8, 10) + '/' + d.slice(5, 7);
  const xt = [days[0], days[Math.floor((days.length - 1) / 2)], days.at(-1)].map((d, i) => `<text x="${n1(X(d))}" y="${H - 8}" text-anchor="${['start', 'middle', 'end'][i]}" class="ax">${fd(d)}</text>`).join('');
  const lines = series.map(s => { const p = s.pts.filter(q => q[1]); if (!p.length) return ''; return `<path d="${p.map((q, i) => `${i ? 'L' : 'M'}${n1(X(q[0]))},${n1(Y(q[1]))}`).join('')}" stroke="${s.color}" stroke-width="${s.dash ? 2 : 2.8}" fill="none"${s.dash ? ' stroke-dasharray="6 5"' : ''} stroke-linejoin="round"/>${p.length <= 40 ? p.map(q => `<circle cx="${n1(X(q[0]))}" cy="${n1(Y(q[1]))}" r="${s.dash ? 0 : 2.6}" fill="${s.color}"><title>${fd(q[0])}: ${q[1].toFixed(3).replace('.', ',')} €</title></circle>`).join('') : ''}`; }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${ticks}${lines}${xt}</svg><p class="legend">${series.map(s => `<span style="color:${s.color}">${s.dash ? '╌╌' : '━━'} ${s.name}</span>`).join(' ')}</p>`;
}
