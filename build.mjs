#!/usr/bin/env node
// Generador estático de la web de precios de gasolineras. Uso: node build.mjs
// Lee data/estaciones.json (lo crea scripts/descargar-precios.mjs a partir de los datos oficiales del Ministerio).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { quantiles, legend, spainMap, areaMap, histogram, bars, fuelIcon, cover, lineChart } from './src/graficos.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
if (process.env.SITE_DOMAIN) cfg.domain = process.env.SITE_DOMAIN;
const readJson = (f, d) => fs.existsSync(path.join(ROOT, f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')) : d;
const DATA = readJson('data/estaciones.json', null);
if (!DATA) { console.error('Falta data/estaciones.json: ejecuta node scripts/descargar-precios.mjs'); process.exit(1); }
const HIST = readJson('data/historico.json', []);
const TERR = readJson('data/territorio.json', { provincias: [], ccaa: {} });
const editorial = readJson('data/editorial.json', {});
const BASE = cfg.domain.replace(/\/$/, '');
const HOST = BASE.replace(/^https?:\/\//, '');
const YEAR = new Date().getFullYear();
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- utilidades
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugify = s => norm(s).replace(/&/g, ' y ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const pick = (arr, key) => arr[hash(key) % arr.length];
const write = (rel, content) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
const eur = v => v == null ? '—' : v.toFixed(3).replace('.', ',') + ' €';
const eur2 = v => v == null ? '—' : v.toFixed(3).replace('.', ',');
const cents = d => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d * 100).toFixed(1).replace('.', ',')} cént.`;
const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 1000) / 1000 : null;
const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'a', 'en', 'e', 'i', 'd', 'l']);
const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s\-/(])([\p{L}º])/gu, (m, a, b) => a + b.toUpperCase()).split(' ').map((w, i) => i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w).join(' ').replace(/\bS\/n\b/gi, 's/n').replace(/\bKm\b/g, 'km');
// "Palmas de Gran Canaria (Las)" -> "Las Palmas de Gran Canaria"
const fixName = s => String(s || '').replace(/^(.*?)\s*\((las|los|la|el|l'|o|a|as|os|es|sa|s')\)$/i, (m, n, art) => `${art.charAt(0).toUpperCase() + art.slice(1).toLowerCase()}${/'$/.test(art) ? '' : ' '}${n}`).trim();
const ASSET_V = hash(fs.readFileSync(path.join(ROOT, 'src/style.css'), 'utf8') + fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'src/graficos.mjs'), 'utf8')).toString(36);
const faqHtml = faq => `<div class="faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
const faqLd = faq => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });

// fecha de los precios: "14/11/2026 8:34:56"
const [fD, fT] = DATA.fecha.split(' ');
const [dd, mm, yyyy] = fD.split('/');
const PRICE_DATE = `${yyyy}-${mm}-${dd}`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const FECHA_TXT = `${+dd} de ${MESES[+mm - 1]} de ${yyyy}`;
const HORA_TXT = fT ? fT.split(':').slice(0, 2).map(x => x.padStart(2, '0')).join(':') : '';

// ---------------------------------------------------------------- combustibles y marcas
const FUEL = {
  g95: { name: 'Gasolina 95', slug: 'gasolina-95', short: 'G95' },
  ga: { name: 'Diésel (gasóleo A)', slug: 'diesel', short: 'Diésel' },
  g98: { name: 'Gasolina 98', slug: 'gasolina-98', short: 'G98' },
  gap: { name: 'Diésel premium', slug: 'diesel-premium', short: 'Diésel+' },
  glp: { name: 'GLP (autogás)', slug: 'glp', short: 'GLP' },
  g95e10: { name: 'Gasolina 95 E10', short: 'G95 E10' }, g95p: { name: 'Gasolina 95 premium', short: 'G95+' }, g98e10: { name: 'Gasolina 98 E10', short: 'G98 E10' },
  gb: { name: 'Gasóleo B (agrícola)', short: 'Gasóleo B' }, gnc: { name: 'Gas natural comprimido (GNC)', short: 'GNC' }, gnl: { name: 'Gas natural licuado (GNL)', short: 'GNL' },
  h2: { name: 'Hidrógeno', short: 'H2' }, adblue: { name: 'AdBlue', short: 'AdBlue' }, dr: { name: 'Diésel renovable (HVO)', short: 'HVO' }, gr: { name: 'Gasolina renovable', short: 'G. renov.' }
};
const MAIN = ['g95', 'ga', 'g98', 'glp'];
const low = k => FUEL[k].name.replace(/^.(?=[a-záéíóúñ])/, c => c.toLowerCase());
const BRANDS = [
  ['repsol', 'Repsol', /\bREPSOL\b/i], ['moeve', 'Moeve (Cepsa)', /\b(CEPSA|MOEVE)\b/i], ['bp', 'BP', /^\s*BP\b/i], ['galp', 'Galp', /\bGALP\b/i], ['shell', 'Shell', /\bSHELL\b/i],
  ['plenoil', 'Plenoil', /PLENOIL/i], ['plenergy', 'Plenergy', /PLENERGY/i], ['eni', 'Eni', /^\s*ENI\b|\bAGIP\b/i], ['beroil', 'Beroil', /BEROIL/i], ['molgas', 'Molgas', /MOLGAS/i], ['naturgy', 'Naturgy', /NATURGY/i], ['ballenoil', 'Ballenoil', /BALLENOIL/i], ['petroprix', 'Petroprix', /PETROPRIX/i], ['petronor', 'Petronor', /PETRONOR/i], ['campsa', 'Campsa', /\bCAMPSA\b/i],
  ['avia', 'Avia', /\bAVIA\b/i], ['disa', 'DISA', /\bDISA\b/i], ['carrefour', 'Carrefour', /CARREFOUR/i], ['alcampo', 'Alcampo', /ALCAMPO/i], ['eroski', 'Eroski', /EROSKI/i],
  ['eleclerc', 'E.Leclerc', /LECLERC/i], ['bonarea', 'bonÀrea', /BON\s*[AÀ]REA/i], ['esclatoil', 'Esclatoil', /ESCLATOIL/i], ['tamoil', 'Tamoil', /TAMOIL/i], ['meroil', 'Meroil', /MEROIL/i],
  ['gasexpress', 'Gasexpress', /GASEXPRESS/i], ['valcarce', 'Valcarce', /VALCARCE/i], ['petrocat', 'Petrocat', /PETROCAT/i], ['q8', 'Q8', /^\s*Q8\b/i], ['agla', 'Agla', /\bAGLA\b/i]
];
const brandOf = r => { for (const [slug, name, re] of BRANDS) if (re.test(r)) return { slug, name }; return null; };

// ---------------------------------------------------------------- datos
const PROV = Object.fromEntries(TERR.provincias.map(p => [p.id, p]));
const PROV_BY_SLUG = Object.fromEntries(TERR.provincias.map(p => [p.slug, p]));
const stations = DATA.estaciones.filter(e => PROV[e.idp]).map(e => {
  const b = brandOf(e.r);
  const rotulo = /^(n[º°]|\d|-|sin r[oó]tulo)/i.test(e.r) || !e.r ? 'Gasolinera' : titleCase(e.r);
  return { ...e, prov: PROV[e.idp], munName: fixName(e.mun), brand: b, name: b ? b.name : rotulo, addr: titleCase(e.d), locName: titleCase(fixName(e.loc)), h24: /24H/i.test(e.h) };
});
// municipios: slug único (si se repite el nombre en varias provincias se añade la provincia)
const munMap = new Map();
for (const e of stations) {
  const key = e.idp + '|' + e.munName;
  if (!munMap.has(key)) munMap.set(key, { name: e.munName, prov: e.prov, list: [] });
  munMap.get(key).list.push(e);
}
const nameCount = {};
for (const m of munMap.values()) nameCount[slugify(m.name)] = (nameCount[slugify(m.name)] || 0) + 1;
const MUNS = [...munMap.values()].map(m => ({ ...m, slug: nameCount[slugify(m.name)] > 1 ? `${slugify(m.name)}-${m.prov.slug}` : slugify(m.name) }));
for (const m of MUNS) for (const e of m.list) e.mun = m;
for (const e of stations) e.slug = `${e.id}-${slugify(e.name)}-${slugify(e.munName)}`.slice(0, 90);
const stats = list => Object.fromEntries(Object.keys(FUEL).map(k => { const v = list.map(e => e.p[k]).filter(Boolean); return [k, v.length ? { avg: avg(v), min: Math.min(...v), max: Math.max(...v), n: v.length } : null]; }));
for (const m of MUNS) m.st = stats(m.list);
const PROVS = TERR.provincias.map(p => { const list = stations.filter(e => e.idp === p.id); return { ...p, list, st: stats(list), muns: MUNS.filter(m => m.prov.id === p.id).sort((a, b) => b.list.length - a.list.length) }; }).filter(p => p.list.length);
const P = Object.fromEntries(PROVS.map(p => [p.id, p]));
const NAT = stats(stations);
const Q = Object.fromEntries(['g95', 'ga', 'g98', 'gap', 'glp'].map(k => [k, quantiles(stations.map(e => e.p[k]))]));
const cheapest = (list, k, n = 10) => list.filter(e => e.p[k]).sort((a, b) => a.p[k] - b.p[k]).slice(0, n);

// cercanía (rejilla de 0,1º para no comparar todas con todas)
const GRID = new Map();
const cell = (lat, lon) => `${Math.floor(lat * 10)}|${Math.floor(lon * 10)}`;
for (const e of stations) { const c = cell(e.lat, e.lon); if (!GRID.has(c)) GRID.set(c, []); GRID.get(c).push(e); }
const km = (a, b) => { const R = 6371, t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLo = (b.lon - a.lon) * t; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
function near(e, radius = 10) {
  const out = [], la = Math.floor(e.lat * 10), lo = Math.floor(e.lon * 10);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of GRID.get(`${la + i}|${lo + j}`) || []) { if (o === e) continue; const d = km(e, o); if (d <= radius) out.push([o, d]); }
  return out.sort((a, b) => a[1] - b[1]);
}

// ---------------------------------------------------------------- plantillas
const AD_SIZES = { top: 'ad-leader', inContent: 'ad-rect', sidebar: 'ad-side', bottom: 'ad-leader' };
function ad(slot) {
  const { client, slots, showPlaceholders } = cfg.adsense;
  if (client && slots[slot]) return `<div class="ad ${AD_SIZES[slot]}"><span class="ad-label">Publicidad</span><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(client)}" data-ad-slot="${esc(slots[slot])}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
  return showPlaceholders ? `<div class="ad ${AD_SIZES[slot]} ad-placeholder" aria-hidden="true"><span>Anuncio · ${slot}</span></div>` : '';
}
const updated = `<p class="updated">⏱ Precios oficiales actualizados el ${FECHA_TXT}${HORA_TXT ? ` a las ${HORA_TXT}` : ''}</p>`;
const priceCls = (v, s) => !v || !s ? '' : v <= s.avg - 0.02 ? ' cheap' : v >= s.avg + 0.02 ? ' dear' : '';
function stationTable(list, st, { showMun = false } = {}) {
  return `<div class="table-wrap"><table class="prices sortable"><thead><tr><th>Gasolinera</th>${MAIN.map(k => `<th data-sort="${k}" class="num">${FUEL[k].short}</th>`).join('')}<th>Horario</th></tr></thead><tbody>
${list.map(e => `<tr><td><a href="/gasolinera/${e.slug}/"><strong>${esc(e.name)}</strong></a><br><small>${esc(e.addr)}${showMun ? ` · ${esc(e.munName)}` : ''}</small></td>${MAIN.map(k => `<td class="num${priceCls(e.p[k], st[k])}" data-v="${e.p[k] || 99}">${eur2(e.p[k])}</td>`).join('')}<td><small>${e.h24 ? '<b class="h24">24 h</b>' : esc(e.h.slice(0, 40))}</small></td></tr>`).join('\n')}
</tbody></table></div>`;
}
function statCards(st, ref) {
  return `<div class="stats">${MAIN.filter(k => st[k]).map(k => `<div class="stat">${fuelIcon(k)}<span>${FUEL[k].name}</span><strong>${eur(st[k].avg)}</strong><small>media${ref && ref[k] ? ` · ${cents(st[k].avg - ref[k].avg)} vs. media nacional` : ''}</small><small>más barata: ${eur(st[k].min)}</small><small class="tank">Depósito de 50 l: <b>${(st[k].avg * 50).toFixed(2).replace('.', ',')} €</b></small></div>`).join('')}</div>`;
}
// mapa con selector de combustible (las imágenes se cargan solo al verse)
function mapBox(base, alt, [w, h] = [820, 671], cap = 'Cada punto es una zona con gasolineras; el color indica su precio medio comparado con el resto de España.', fuels = ['g95', 'ga']) {
  return `<figure class="mapbox" data-base="${base}"><div class="map-tabs" role="tablist">${fuels.map((k, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-k="${FUEL[k].slug}">${FUEL[k].short === 'Diésel' ? 'Diésel' : FUEL[k].name}</button>`).join('')}</div><img src="${base}-${FUEL[fuels[0]].slug}.svg" alt="${esc(alt)}" loading="lazy" width="${w}" height="${Math.round(h)}">${fuels.map((k, i) => legend(Q[k]).replace('<p class="map-legend"', `<p class="map-legend" data-k="${FUEL[k].slug}"${i ? ' hidden' : ''}`)).join('')}<figcaption class="muted">${cap}</figcaption></figure>`;
}

// evolución de una provincia frente a la media de España
const HP = HIST.filter(h => h.pr);
const provChange = (id, k, n) => { const last = HP.at(-1), ref = HP.filter(h => h.d <= addDays(last.d, -n)).at(-1); const a = last?.pr[id]?.[k], b = ref?.pr[id]?.[k]; return a && b ? a - b : null; };
function provEvol(p) {
  const pts = HP.filter(h => h.pr[p.id]).slice(-90);
  if (pts.length < 3) return '';
  const c7g = provChange(p.id, 0, 7), c7d = provChange(p.id, 1, 7), c30d = provChange(p.id, 1, 30);
  const s1 = [c7d != null ? `En la última semana el diésel ${Math.abs(c7d) < 0.0005 ? 'se ha mantenido estable' : c7d < 0 ? `ha bajado ${cents(-c7d).replace('+', '')}` : `ha subido ${cents(c7d).replace('+', '')}`} en ${p.name}` : '', c7g != null ? `la gasolina 95 ${Math.abs(c7g) < 0.0005 ? 'apenas se ha movido' : c7g < 0 ? `ha bajado ${cents(-c7g).replace('+', '')}` : `ha subido ${cents(c7g).replace('+', '')}`}` : ''].filter(Boolean).join(' y ');
  const txt = (s1 ? s1 + '.' : '') + (c30d != null ? ` En los últimos 30 días, el diésel acumula ${cents(c30d)} por litro.` : '');
  return `<h2>Evolución del precio en ${p.name}</h2><p>Precio medio diario de la gasolina 95 y el diésel en la provincia (línea continua) comparado con la media de España (línea discontinua). ${txt}</p>
${lineChart([{ name: `Gasolina 95 en ${p.name}`, color: '#0f9d58', pts: pts.map(h => [h.d, h.pr[p.id][0]]) }, { name: `Diésel en ${p.name}`, color: '#ff8a00', pts: pts.map(h => [h.d, h.pr[p.id][1]]) }, { name: 'Gasolina 95 en España', color: '#0f9d58', dash: true, pts: pts.map(h => [h.d, h.g95]) }, { name: 'Diésel en España', color: '#ff8a00', dash: true, pts: pts.map(h => [h.d, h.ga]) }], { label: `Evolución del precio de la gasolina en ${p.name}` })}`;
}

function layout({ title, description, canonical, body, jsonld = [], crumbs = [], noindex = false }) {
  const url = BASE + canonical;
  const bc = crumbs.length ? `<nav class="crumbs" aria-label="Migas de pan"><a href="/">Inicio</a>${crumbs.map(([n, h]) => h ? ` › <a href="${h}">${esc(n)}</a>` : ` › <span>${esc(n)}</span>`).join('')}</nav>` : '';
  if (crumbs.length) jsonld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Inicio', '/'], ...crumbs].map(([n, h], i) => ({ '@type': 'ListItem', position: i + 1, name: n, ...(h ? { item: BASE + h } : {}) })) });
  const adsHead = cfg.adsense.client ? `<meta name="google-adsense-account" content="${esc(cfg.adsense.client)}">\n<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(cfg.adsense.client)}" crossorigin="anonymous"></script>` : '';
  return `<!doctype html>
<html lang="${cfg.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(cfg.siteName)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}">
<meta name="theme-color" content="#10261b">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">
<meta property="og:image" content="${BASE}/og-image.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${BASE}/og-image.png">
<link rel="stylesheet" href="/assets/style.css?v=${ASSET_V}">
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
${adsHead}
</head>
<body>
<a class="skip" href="#main">Saltar al contenido</a>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="/" aria-label="${esc(cfg.siteName)}, inicio"><img class="brand-mark" src="/favicon.svg" width="32" height="32" alt=""><span>${cfg.brandHtml}</span></a>
    <form class="search" action="/buscar/" role="search"><input name="q" type="search" placeholder="Busca tu municipio…" aria-label="Buscar municipio"></form>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="main-nav"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg><span class="menu-txt">Menú</span></button>
    <nav class="main-nav" id="main-nav">
      <a href="/cerca/">Cerca de mí</a>
      <a href="/provincias/">Provincias</a>
      <details><summary>Combustibles</summary><div class="drop">${['g95', 'ga', 'g98', 'gap', 'glp'].map(k => `<a href="/combustible/${FUEL[k].slug}/">${FUEL[k].name}</a>`).join('')}</div></details>
      <a href="/marcas/">Marcas</a>
      <a href="/evolucion-precios/">Evolución</a>
      <a href="/guias/">Guías</a>
      <a href="/favoritas/">Mis gasolineras</a>
    </nav>
  </div>
</header>
<main id="main" class="wrap">
${bc}
${body}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div><strong>${esc(cfg.siteName)}</strong><p>${esc(cfg.tagline)}. Precios oficiales del Ministerio para la Transición Ecológica y el Reto Demográfico. Pueden variar a lo largo del día: confirma siempre el precio en el surtidor.</p></div>
    <div><h3>Provincias</h3>${['madrid', 'barcelona', 'valencia', 'sevilla', 'malaga', 'alicante', 'murcia', 'cadiz', 'a-coruna', 'bizkaia'].filter(s => PROV_BY_SLUG[s]).map(s => `<a href="/provincia/${s}/">Gasolineras en ${PROV_BY_SLUG[s].name}</a>`).join('')}<a href="/provincias/">Todas las provincias</a></div>
    <div><h3>Combustibles</h3>${['g95', 'ga', 'g98', 'gap', 'glp'].map(k => `<a href="/combustible/${FUEL[k].slug}/">Precio ${low(k)}</a>`).join('')}</div>
    <div><h3>Información</h3><a href="/calculadora-ahorro/">Calculadora de ahorro</a><a href="/evolucion-precios/">Evolución de precios</a><a href="/blog/">Blog e informes semanales</a><a href="/guias/">Guías</a><a href="/sobre-nosotros/">Sobre nosotros</a><a href="/contacto/">Contacto</a><a href="/aviso-legal/">Aviso legal</a><a href="/privacidad/">Política de privacidad</a><a href="/cookies/">Política de cookies</a>${cfg.analytics?.gaId ? '<a href="#" data-cookies>Preferencias de cookies</a>' : ''}</div>
  </div>
  <p class="wrap copy">© ${YEAR} ${esc(cfg.siteName)} · Fuente de los precios: Geoportal de Hidrocarburos, Ministerio para la Transición Ecológica y el Reto Demográfico.</p>
</footer>
${cfg.analytics?.gaId ? `<script>window.GA_ID=${JSON.stringify(cfg.analytics.gaId)};</script>` : ''}
<script src="/assets/app.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

// ---------------------------------------------------------------- Markdown sencillo (guías y blog)
function mdInline(t) {
  return t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => `<a href="${url}"${/^https?:/.test(url) ? ' rel="nofollow noopener" target="_blank"' : ''}>${txt}</a>`);
}
function md(src) {
  const out = []; let list = null, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${mdInline(para.join(' '))}</p>`); para = []; } if (list) { out.push(`<ul>${list.map(i => `<li>${mdInline(i)}</li>`).join('')}</ul>`); list = null; } };
  for (const line of src.split('\n')) {
    const l = line.trim(); let m;
    if (!l) { flush(); continue; }
    if ((m = l.match(/^(#{2,3})\s+(.*)/))) { flush(); out.push(`<h${m[1].length}>${mdInline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = l.match(/^[-*]\s+(.*)/))) { if (para.length) { out.push(`<p>${mdInline(para.join(' '))}</p>`); para = []; } (list ||= []).push(m[1]); continue; }
    if (list) flush();
    para.push(l);
  }
  flush(); return out.join('\n');
}
function readMdDir(dir, isBlog) {
  const D = path.join(ROOT, dir);
  if (!fs.existsSync(D)) return [];
  return fs.readdirSync(D).filter(f => isBlog ? /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f) : f.endsWith('.md')).sort().map(f => {
    const lines = fs.readFileSync(path.join(D, f), 'utf8').replace(/\r/g, '').split('\n');
    const title = lines.shift().replace(/^#\s*/, '').trim();
    const description = (lines[0] || '').startsWith('>') ? lines.shift().replace(/^>\s*/, '').trim() : '';
    return isBlog ? { slug: f.slice(11).replace(/\.md$/, ''), date: f.slice(0, 10), title, description, md: lines.join('\n').trim() }
      : { slug: f.replace(/^\d+-/, '').replace(/\.md$/, ''), title, description, md: lines.join('\n').trim() };
  });
}
const GUIDES = readMdDir('data/guias', false);
// ---------------------------------------------------------------- informes semanales automáticos (a partir del histórico)
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const mondayOf = d => addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
const fechaLarga = d => `${+d.slice(8, 10)} de ${MESES[+d.slice(5, 7) - 1]} de ${d.slice(0, 4)}`;
const rango = (a, b) => a.slice(0, 7) === b.slice(0, 7) ? `del ${+a.slice(8, 10)} al ${fechaLarga(b)}` : a.slice(0, 4) === b.slice(0, 4) ? `del ${fechaLarga(a).replace(/ de \d{4}$/, '')} al ${fechaLarga(b)}` : `del ${fechaLarga(a)} al ${fechaLarga(b)}`;
const mean = v => { v = v.filter(Boolean); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const pct = (a, b) => `${a >= b ? '+' : '−'}${Math.abs((a - b) / b * 100).toFixed(1).replace('.', ',')} %`;
const STATION_BY_ID = new Map(stations.map(e => [e.id, e]));
function weekStats(days) {
  const w = { days, g95: mean(days.map(h => h.g95)), ga: mean(days.map(h => h.ga)), pr: {} };
  for (const id of Object.keys(PROV)) {
    const g = mean(days.map(h => h.pr?.[id]?.[0])), d = mean(days.map(h => h.pr?.[id]?.[1]));
    if (g || d) w.pr[id] = [g, d];
  }
  return w;
}
function weeklyReports() {
  const byWeek = new Map();
  for (const h of HIST) { const m = mondayOf(h.d); if (!byWeek.has(m)) byWeek.set(m, []); byWeek.get(m).push(h); }
  const weeks = [...byWeek.keys()].sort();
  const out = [];
  for (let i = 1; i < weeks.length; i++) {
    const mon = weeks[i], sun = addDays(mon, 6), prevMon = weeks[i - 1];
    if (sun >= TODAY || addDays(prevMon, 7) !== mon) continue;
    const days = byWeek.get(mon), prevDays = byWeek.get(prevMon);
    if (days.length < 4 || prevDays.length < 3 || !days.some(h => h.pr)) continue;
    const W = weekStats(days), P = weekStats(prevDays);
    const key = 'sem' + mon;
    const verbo = (a, b, f) => { const o = hash(key) + (f === 'd' ? 1 : 0); return Math.abs(a - b) < 0.0005 ? ['se mantuvo prácticamente igual', 'apenas se movió'][o % 2] : a < b ? ['bajó', 'se abarató', 'cayó'][o % 3] : ['subió', 'se encareció', 'repuntó'][o % 3]; };
    const g = W.g95 - P.g95, d = W.ga - P.ga;
    const tit = Math.abs(g) < 0.0005 && Math.abs(d) < 0.0005 ? 'precios estables' : g < 0 && d < 0 ? 'bajan la gasolina y el diésel' : g > 0 && d > 0 ? 'suben la gasolina y el diésel' : g < 0 ? 'baja la gasolina y sube el diésel' : 'sube la gasolina y baja el diésel';
    const title = `Precio de la gasolina ${rango(mon, sun)}: ${tit}`;
    const description = `Informe semanal: la gasolina 95 ${verbo(W.g95, P.g95, 'g')} ${Math.abs(g) >= 0.0005 ? `${Math.abs(g * 100).toFixed(1).replace('.', ',')} céntimos` : ''} y el diésel ${verbo(W.ga, P.ga, 'd')} ${Math.abs(d) >= 0.0005 ? `${Math.abs(d * 100).toFixed(1).replace('.', ',')} céntimos` : ''}. Provincias donde más cambia y gasolinera más barata.`.replace(/\s+/g, ' ').replace(/ \./g, '.');
    // provincias: cambios y ranking
    const ch = k => Object.keys(W.pr).filter(id => W.pr[id][k] && P.pr[id]?.[k]).map(id => ({ id, p: PROV[id], v: W.pr[id][k], c: W.pr[id][k] - P.pr[id][k] }));
    const chG = ch(0), chD = ch(1);
    const lista = (arr, f) => `<ul class="near">${arr.map(x => `<li><a href="/provincia/${x.p.slug}/">${x.p.name}</a> <b>${eur(x.v)}</b> <small class="${x.c < 0 ? 'good' : 'bad'}">${cents(x.c)}</small></li>`).join('')}</ul>`;
    const bajD = chD.slice().sort((a, b) => a.c - b.c).slice(0, 5).filter(x => x.c < 0), subD = chD.slice().sort((a, b) => b.c - a.c).slice(0, 5).filter(x => x.c > 0);
    const bajG = chG.slice().sort((a, b) => a.c - b.c).slice(0, 5).filter(x => x.c < 0), subG = chG.slice().sort((a, b) => b.c - a.c).slice(0, 5).filter(x => x.c > 0);
    const rankG = chG.slice().sort((a, b) => a.v - b.v), rankD = chD.slice().sort((a, b) => a.v - b.v);
    // gasolinera más barata de la semana
    const mins = k => days.map(h => h.min?.[k]).filter(Boolean).sort((a, b) => a[1] - b[1])[0];
    const cheapTxt = k => { const m = mins(k); if (!m) return ''; const st = STATION_BY_ID.get(m[0]); const nom = st ? st.name : titleCase(m[2]) || 'Una gasolinera'; const mun = st ? st.munName : titleCase(fixName(m[3])); const prov = PROV[m[4]]?.name || ''; const link = st ? `<a href="/gasolinera/${st.slug}/">${esc(nom)}</a>` : esc(nom); return `${k === 'g95' ? 'Para gasolina 95' : 'Para diésel'}, el precio más bajo de la semana fue el de ${link}, en ${esc(mun)}${prov && prov !== mun ? ` (${prov})` : ''}: <strong>${eur(m[1])}</strong> por litro.`; };
    const ctx = HIST.filter(h => h.d > addDays(sun, -28) && h.d <= sun);
    const chart = lineChart([{ name: 'Gasolina 95', color: '#0f9d58', pts: ctx.map(h => [h.d, h.g95]) }, { name: 'Diésel', color: '#ff8a00', pts: ctx.map(h => [h.d, h.ga]) }], { label: 'Evolución del precio medio en las últimas cuatro semanas' });
    const tank = (W.g95 - P.g95) * 50;
    const intro = pick([
      `Esta semana, ${rango(mon, sun)}, la gasolina 95 ${verbo(W.g95, P.g95, 'g')} en España hasta un precio medio de <strong>${eur(W.g95)}</strong> por litro (${pct(W.g95, P.g95)} respecto a la semana anterior). El diésel ${verbo(W.ga, P.ga, 'd')} y se quedó en <strong>${eur(W.ga)}</strong> de media (${pct(W.ga, P.ga)}).`,
      `Resumen de la semana ${rango(mon, sun)}: el precio medio del diésel ${verbo(W.ga, P.ga, 'd')} hasta <strong>${eur(W.ga)}</strong> por litro (${cents(d)}), mientras que la gasolina 95 ${verbo(W.g95, P.g95, 'g')} y se situó en <strong>${eur(W.g95)}</strong> (${cents(g)}).`,
      `Repostar ${W.g95 < P.g95 && W.ga < P.ga ? 'salió algo más barato' : W.g95 > P.g95 && W.ga > P.ga ? 'salió algo más caro' : 'costó más o menos lo mismo'} esta semana, ${rango(mon, sun)}. La gasolina 95 marcó una media de <strong>${eur(W.g95)}</strong> por litro (${cents(g)} frente a la semana anterior) y el diésel, de <strong>${eur(W.ga)}</strong> (${cents(d)}).`
    ], key);
    const html = `<p>${intro} Son las medias de los precios que comunican cada día al Ministerio para la Transición Ecológica las ${stations.length.toLocaleString('es-ES')} gasolineras de España.</p>
<div class="table-wrap"><table class="prices"><thead><tr><th>Combustible</th><th class="num">Esta semana</th><th class="num">Semana anterior</th><th class="num">Cambio</th><th class="num">Depósito de 50 l</th></tr></thead><tbody>
<tr><td>Gasolina 95</td><td class="num"><strong>${eur(W.g95)}</strong></td><td class="num">${eur(P.g95)}</td><td class="num">${cents(g)}</td><td class="num">${(W.g95 * 50).toFixed(2).replace('.', ',')} €</td></tr>
<tr><td>Diésel</td><td class="num"><strong>${eur(W.ga)}</strong></td><td class="num">${eur(P.ga)}</td><td class="num">${cents(d)}</td><td class="num">${(W.ga * 50).toFixed(2).replace('.', ',')} €</td></tr>
</tbody></table></div>
<p>Para un depósito de 50 litros de gasolina 95, ${Math.abs(tank) < 0.05 ? 'la diferencia con la semana anterior es inapreciable' : `eso supone ${Math.abs(tank).toFixed(2).replace('.', ',')} € ${tank < 0 ? 'menos' : 'más'} que hace una semana`}.</p>
<h2>Evolución en las últimas cuatro semanas</h2>${chart}
<h2>Dónde más ha cambiado el precio</h2>
<div class="cols2"><div><h3>Diésel: mayores bajadas</h3>${bajD.length ? lista(bajD) : '<p>Ninguna provincia bajó el precio esta semana.</p>'}<h3>Diésel: mayores subidas</h3>${subD.length ? lista(subD) : '<p>Ninguna provincia subió el precio esta semana.</p>'}</div>
<div><h3>Gasolina 95: mayores bajadas</h3>${bajG.length ? lista(bajG) : '<p>Ninguna provincia bajó el precio esta semana.</p>'}<h3>Gasolina 95: mayores subidas</h3>${subG.length ? lista(subG) : '<p>Ninguna provincia subió el precio esta semana.</p>'}</div></div>
<h2>Provincias más baratas y más caras</h2>
<p>Con la media de toda la semana, ${rankG[0]?.p.name} fue la provincia con la gasolina 95 más barata (${eur(rankG[0]?.v)}) y ${rankG.at(-1)?.p.name}, la más cara (${eur(rankG.at(-1)?.v)}). En diésel, la más barata fue ${rankD[0]?.p.name} (${eur(rankD[0]?.v)}) y la más cara, ${rankD.at(-1)?.p.name} (${eur(rankD.at(-1)?.v)}).</p>
${bars(rankG.slice(0, 5).concat(rankG.slice(-3)).map(x => ({ label: x.p.name, href: `/provincia/${x.p.slug}/`, v: x.v })), Q.g95)}
<p class="muted">Gasolina 95: las cinco provincias más baratas y las tres más caras de la semana.</p>
<h2>La gasolinera más barata de la semana</h2>
<p>${cheapTxt('g95')} ${cheapTxt('ga')} ${pick(['Ojo: algunas de las más baratas son de venta restringida o están en Canarias, Ceuta y Melilla, con impuestos más bajos.', 'Recuerda que Canarias, Ceuta y Melilla tienen una fiscalidad distinta y suelen copar los primeros puestos.'], key)}</p>
<h2>Cómo ahorrar la próxima semana</h2>
<p>${pick(['Compara antes de repostar: dentro de una misma ciudad la diferencia entre gasolineras suele superar los diez céntimos por litro.', 'Las gasolineras automáticas y de bajo coste suelen estar entre las más baratas de cada municipio, sobre todo en los polígonos y a la salida de las ciudades.', 'Si tienes varias gasolineras en tu ruta habitual, guárdalas en Mis gasolineras y mira cuál está más barata antes de salir.'], key)} Con la <a href="/calculadora-ahorro/">calculadora de ahorro</a> puedes comprobar si te compensa desviarte hasta una gasolinera más barata, y en <a href="/cerca/">cerca de mí</a> ves las más baratas a tu alrededor.</p>`;
    out.push({ slug: `precio-gasolina-semana-${mon}`, date: addDays(sun, 1), title, description, html, report: true });
  }
  return out;
}
const BLOG = readMdDir('data/blog', true).concat(weeklyReports()).filter(b => b.date <= TODAY).sort((a, b) => b.date.localeCompare(a.date));
const guideLi = g => `<li><a href="/guias/${g.slug}/"><img class="g-cover" src="/img/guias/${g.slug}.svg" alt="" loading="lazy" width="640" height="280"><strong>${esc(g.title)}</strong><span>${esc(g.description)}</span></a></li>`;
const fmtFecha = d => new Date(d + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });

// ---------------------------------------------------------------- páginas
async function main() {
  console.log(`✓ ${stations.length} gasolineras, ${MUNS.length} municipios, ${PROVS.length} provincias · precios del ${DATA.fecha}`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const urls = [];
  const addUrl = (u, pr = '0.6') => urls.push([u, pr]);

  // assets
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  for (const f of ['style.css', 'app.js']) fs.copyFileSync(path.join(ROOT, 'src', f), path.join(OUT, 'assets', f));
  fs.copyFileSync(path.join(ROOT, 'src/_headers'), path.join(OUT, '_headers'));
  const BRAND = path.join(ROOT, 'src/brand');
  fs.copyFileSync(path.join(BRAND, 'icon.svg'), path.join(OUT, 'favicon.svg'));
  for (const f of ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'og-image.png']) if (fs.existsSync(path.join(BRAND, f))) fs.copyFileSync(path.join(BRAND, f), path.join(OUT, f));
  write('site.webmanifest', JSON.stringify({ name: cfg.siteName, short_name: cfg.siteName, start_url: '/', display: 'standalone', background_color: '#10261b', theme_color: '#10261b', lang: cfg.lang, icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }));
  // datos para el buscador y "cerca de mí"
  write('data/municipios.json', JSON.stringify(MUNS.map(m => ({ s: m.slug, n: m.name, p: m.prov.name, c: m.list.length, g: m.st.g95?.min || null, d: m.st.ga?.min || null }))));
  // ilustraciones y mapas (SVG propios)
  fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'src/img'))) fs.copyFileSync(path.join(ROOT, 'src/img', f), path.join(OUT, 'img', f));
  for (const k of ['g95', 'ga', 'g98', 'gap', 'glp']) write(`img/mapa-espana-${FUEL[k].slug}.svg`, spainMap(stations, k, Q[k], { title: `Mapa del precio de ${low(k)} en España` }));
  for (const p of PROVS) {
    for (const k of ['g95', 'ga']) {
      const labels = p.muns.slice(0, 7).map(m => ({ name: m.name, lat: m.list.reduce((a, e) => a + e.lat, 0) / m.list.length, lon: m.list.reduce((a, e) => a + e.lon, 0) / m.list.length }));
      const svg = areaMap(p.list, k, Q[k], { W: 820, maxH: 680, labels, label: `Mapa de gasolineras de ${p.name}` }).replace('<svg class="map" ', '<svg ');
      if (svg) { write(`img/mapas/${p.slug}-${FUEL[k].slug}.svg`, svg); p.mapDims = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number); }
    }
  }
  for (const g of GUIDES) write(`img/guias/${g.slug}.svg`, cover(g.slug));
  for (const b of BLOG) write(`img/blog/${b.slug}.svg`, cover(b.slug));
  write('data/gasolineras.json', JSON.stringify(stations.map(e => [e.slug, e.name, e.munName, Math.round(e.lat * 1e4) / 1e4, Math.round(e.lon * 1e4) / 1e4, e.p.g95 || 0, e.p.ga || 0, e.p.g98 || 0, e.p.glp || 0])));

  // ------------------------------------------------ inicio
  const provRank = k => PROVS.filter(p => p.st[k]).sort((a, b) => a.st[k].avg - b.st[k].avg);
  const homeFaq = [
    ['¿Cuál es el precio medio de la gasolina hoy en España?', `Según los datos oficiales del ${FECHA_TXT}, la gasolina 95 cuesta de media ${eur(NAT.g95?.avg)} por litro y el diésel ${eur(NAT.ga?.avg)} por litro en las ${stations.length.toLocaleString('es-ES')} gasolineras de España.`],
    ['¿Dónde está la gasolina más barata de España?', `Las provincias con la gasolina 95 más barata hoy son ${provRank('g95').slice(0, 3).map(p => p.name).join(', ')}. Canarias, Ceuta y Melilla tienen una fiscalidad distinta y suelen ser las más baratas.`],
    ['¿Cada cuánto se actualizan los precios?', 'Las gasolineras comunican sus precios al Ministerio para la Transición Ecológica cada vez que los cambian. Nosotros actualizamos la web todos los días con esos datos oficiales.'],
    ['¿Los precios de la web son exactos?', 'Son los precios oficiales comunicados por cada gasolinera, pero pueden cambiar a lo largo del día. El precio que vale es siempre el del surtidor.']
  ];
  write('index.html', layout({
    title: `Precio de la gasolina hoy: gasolineras más baratas de España | ${cfg.siteName}`,
    description: `Precio de la gasolina y el diésel hoy (${dd}/${mm}/${yyyy}) en las ${stations.length.toLocaleString('es-ES')} gasolineras de España. Encuentra la más barata de tu municipio.`,
    canonical: '/',
    body: `<section class="hero hero-img"><div><h1>Precio de la gasolina hoy en España</h1><p>Compara los precios oficiales de las ${stations.length.toLocaleString('es-ES')} gasolineras de España y encuentra la más barata de tu municipio. Gratis, sin registro y actualizado cada día.</p>
<form class="search big" action="/buscar/"><input name="q" type="search" placeholder="Escribe tu municipio: Sevilla, Getafe, Moraleja…" aria-label="Buscar municipio"></form>
<p class="hero-btns"><a class="btn" href="/cerca/">📍 Gasolineras más baratas cerca de mí</a> <a class="btn ghost" href="/calculadora-ahorro/">🧮 ¿Me compensa ir más lejos?</a></p></div><img class="hero-art" src="/img/hero.svg" alt="" width="640" height="400"></section>
${updated}
${statCards(NAT)}
${ad('top')}
<h2>Mapa del precio de la gasolina en España</h2>
<p>Así están hoy los precios en todo el país. Las zonas en verde son las más baratas y las rojas, las más caras. Canarias, Ceuta y Melilla tienen impuestos más bajos y casi siempre salen en verde; en la península, las gasolineras automáticas y las de los alrededores de las grandes ciudades suelen tirar los precios a la baja.</p>
${mapBox('/img/mapa-espana', 'Mapa de España con el precio medio de la gasolina por zonas')}
<h2>Provincias con la gasolina más barata hoy</h2>
<div class="cols2"><div><h3>Gasolina 95</h3>${bars(provRank('g95').slice(0, 10).map(p => ({ label: p.name, href: `/provincia/${p.slug}/`, v: p.st.g95.avg })), Q.g95)}</div>
<div><h3>Diésel</h3>${bars(provRank('ga').slice(0, 10).map(p => ({ label: p.name, href: `/provincia/${p.slug}/`, v: p.st.ga.avg })), Q.ga)}</div></div>
<h2>¿Cuánto cuesta la gasolina 95 en cada gasolinera?</h2>
<p>Este gráfico reparte las ${NAT.g95.n.toLocaleString('es-ES')} gasolineras que venden gasolina 95 según su precio. ${(() => { const v = stations.map(e => e.p.g95).filter(Boolean).sort((a, b) => a - b), d = v[Math.floor(v.length * 0.9)] - v[Math.floor(v.length * 0.1)]; return `Entre el 10\u00a0% de gasolineras más baratas y el 10\u00a0% más caras hay unos ${Math.round(d * 100)} céntimos por litro de diferencia: en un depósito de 50 litros son unos ${Math.round(d * 50)} euros, así que comparar antes de repostar sale a cuenta.`; })()}</p>
${histogram(stations, 'g95', Q.g95, { label: 'Distribución del precio de la gasolina 95 en España', avgV: NAT.g95.avg })}
<h2>Las 10 gasolineras más baratas de España hoy (diésel)</h2>
${stationTable(cheapest(stations, 'ga'), NAT, { showMun: true })}
${ad('inContent')}
<h2>Gasolineras por provincia</h2>
<ul class="chips">${PROVS.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')).map(p => `<li><a href="/provincia/${p.slug}/">${p.name} <small>${p.list.length}</small></a></li>`).join('')}</ul>
<h2>Las ciudades más buscadas</h2>
<ul class="chips">${MUNS.slice().sort((a, b) => b.list.length - a.list.length).slice(0, 24).map(m => `<li><a href="/gasolineras/${m.slug}/">${esc(m.name)}</a></li>`).join('')}</ul>
${GUIDES.length ? `<h2>Guías para ahorrar en combustible</h2><ul class="guides">${GUIDES.slice(0, 6).map(guideLi).join('')}</ul>` : ''}
<section class="prose"><h2>Preguntas frecuentes</h2>${faqHtml(homeFaq)}</section>
${ad('bottom')}`,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.siteName, url: BASE + '/', potentialAction: { '@type': 'SearchAction', target: BASE + '/buscar/?q={search_term_string}', 'query-input': 'required name=search_term_string' } }, faqLd(homeFaq)]
  }));
  addUrl('/', '1.0');

  // ------------------------------------------------ provincias
  write('provincias/index.html', layout({
    title: `Precio de la gasolina por provincias hoy | ${cfg.siteName}`,
    description: `Precio medio de la gasolina 95, el diésel y la gasolina 98 hoy en las 52 provincias de España, de la más barata a la más cara.`,
    canonical: '/provincias/', crumbs: [['Provincias', null]],
    body: `<h1>Precio de la gasolina por provincias</h1>${updated}${ad('top')}
<div class="table-wrap"><table class="prices sortable"><thead><tr><th>Provincia</th>${MAIN.map(k => `<th class="num" data-sort="${k}">${FUEL[k].short}</th>`).join('')}<th class="num">Gasolineras</th></tr></thead><tbody>
${PROVS.slice().sort((a, b) => (a.st.g95?.avg || 9) - (b.st.g95?.avg || 9)).map(p => `<tr><td><a href="/provincia/${p.slug}/"><strong>${p.name}</strong></a><br><small>${esc(TERR.ccaa[p.ccaa] || '')}</small></td>${MAIN.map(k => `<td class="num${priceCls(p.st[k]?.avg, NAT[k])}" data-v="${p.st[k]?.avg || 99}">${eur2(p.st[k]?.avg)}</td>`).join('')}<td class="num">${p.list.length}</td></tr>`).join('\n')}
</tbody></table></div>
<p class="muted">Precio medio por litro. En verde, provincias más baratas que la media nacional; en rojo, más caras.</p>${ad('bottom')}`
  }));
  addUrl('/provincias/', '0.9');
  for (const p of PROVS) {
    const muns = p.muns;
    const faq = [
      [`¿Cuál es la gasolinera más barata de ${p.name} hoy?`, (() => { const c = cheapest(p.list, 'ga', 1)[0], g = cheapest(p.list, 'g95', 1)[0]; return `Para diésel, ${c ? `${c.name} en ${c.munName} (${c.addr}), a ${eur(c.p.ga)}/l` : 'no hay datos'}. Para gasolina 95, ${g ? `${g.name} en ${g.munName}, a ${eur(g.p.g95)}/l` : 'no hay datos'}. Datos del ${FECHA_TXT}.`; })()],
      [`¿Cuánto cuesta la gasolina en ${p.name}?`, `El precio medio de la gasolina 95 en ${p.name} es de ${eur(p.st.g95?.avg)} por litro y el del diésel de ${eur(p.st.ga?.avg)}, ${p.st.g95 && NAT.g95 ? (p.st.g95.avg < NAT.g95.avg ? 'por debajo' : 'por encima') : ''} de la media de España.`],
      [`¿Cuántas gasolineras hay en ${p.name}?`, `Hay ${p.list.length} gasolineras en ${muns.length} municipios de la provincia, ${p.list.filter(e => e.h24).length} de ellas abiertas las 24 horas.`]
    ];
    const body = `<h1>Gasolineras más baratas de ${p.name} hoy</h1>
<p class="lead">Precios de la gasolina y el diésel en las ${p.list.length} gasolineras de la provincia de ${p.name}, ordenadas de la más barata a la más cara.</p>
${updated}${statCards(p.st, NAT)}${ad('top')}
${p.mapDims ? `<h2>Mapa de gasolineras de ${p.name}</h2><p>Cada punto es una gasolinera de la provincia. El color compara su precio con el de todas las gasolineras de España: en verde, las más baratas; en rojo, las más caras. Pulsa en un municipio de la tabla de abajo para ver sus precios uno a uno.</p>${mapBox(`/img/mapas/${p.slug}`, `Mapa de las gasolineras de ${p.name} coloreadas por precio`, p.mapDims, 'Cada punto es una gasolinera; el color indica su precio comparado con el resto de España. Los nombres marcan los municipios con más gasolineras.')}` : ''}
<h2>Las más baratas para diésel</h2>${stationTable(cheapest(p.list, 'ga'), p.st, { showMun: true })}
<h2>Las más baratas para gasolina 95</h2>${stationTable(cheapest(p.list, 'g95'), p.st, { showMun: true })}
${ad('inContent')}
${(() => { const h = histogram(p.list, 'ga', Q.ga, { label: `Distribución del precio del diésel en ${p.name}`, avgV: p.st.ga?.avg }); return h ? `<h2>Cómo se reparten los precios del diésel en ${p.name}</h2><p>Cada barra agrupa las gasolineras de la provincia con un precio parecido. Cuanto más a la izquierda, más barato. La línea discontinua marca el precio medio de ${p.name}, ${eur(p.st.ga.avg)} por litro.</p>${h}` : ''; })()}
${provEvol(p)}
<h2>Gasolineras por municipio</h2>
<div class="table-wrap"><table class="prices sortable"><thead><tr><th>Municipio</th><th class="num" data-sort="g95">G95 más barata</th><th class="num" data-sort="ga">Diésel más barato</th><th class="num">Gasolineras</th></tr></thead><tbody>
${muns.map(m => `<tr><td><a href="/gasolineras/${m.slug}/">${esc(m.name)}</a></td><td class="num" data-v="${m.st.g95?.min || 99}">${eur2(m.st.g95?.min)}</td><td class="num" data-v="${m.st.ga?.min || 99}">${eur2(m.st.ga?.min)}</td><td class="num">${m.list.length}</td></tr>`).join('')}
</tbody></table></div>
<section class="prose"><h2>Preguntas frecuentes</h2>${faqHtml(faq)}</section>${ad('bottom')}`;
    write(`provincia/${p.slug}/index.html`, layout({
      title: `Gasolineras más baratas de ${p.name} hoy: precio gasolina y diésel | ${cfg.siteName}`,
      description: `Precio de la gasolina hoy en ${p.name}: media ${eur(p.st.g95?.avg)} (G95) y ${eur(p.st.ga?.avg)} (diésel). Las ${p.list.length} gasolineras de la provincia, de la más barata a la más cara.`.slice(0, 158),
      canonical: `/provincia/${p.slug}/`, crumbs: [['Provincias', '/provincias/'], [p.name, null]], body, jsonld: [faqLd(faq)]
    }));
    addUrl(`/provincia/${p.slug}/`, '0.9');
  }

  // ------------------------------------------------ municipios
  for (const m of MUNS) {
    const p = P[m.prov.id];
    const list = m.list.slice().sort((a, b) => (a.p.ga || a.p.g95 || 9) - (b.p.ga || b.p.g95 || 9));
    const cg = cheapest(m.list, 'g95', 1)[0], cd = cheapest(m.list, 'ga', 1)[0];
    const n = m.list.length;
    const others = p.muns.filter(x => x !== m).slice(0, 18);
    const intro = n === 1
      ? `En ${m.name} (${p.name}) hay una gasolinera: ${m.list[0].name}, en ${m.list[0].addr}. Aquí tienes sus precios de hoy y las gasolineras más baratas de los municipios cercanos.`
      : pick([
        `Hay ${n} gasolineras en ${m.name} (${p.name}). Hoy la más barata para diésel es ${cd ? `${cd.name} (${cd.addr}), a ${eur(cd.p.ga)}/l` : '—'}, y para gasolina 95, ${cg ? `${cg.name}, a ${eur(cg.p.g95)}/l` : '—'}.`,
        `Compara los precios de las ${n} gasolineras de ${m.name}. ${cd ? `Repostar diésel en la más barata (${cd.name}) cuesta ${eur(cd.p.ga)} por litro` : ''}${cg ? `, y la gasolina 95 más barata está a ${eur(cg.p.g95)}` : ''}.`
      ], m.slug);
    const faq = [
      [`¿Cuál es la gasolinera más barata de ${m.name}?`, `Hoy, ${FECHA_TXT}, la más barata para diésel es ${cd ? `${cd.name} en ${cd.addr} (${eur(cd.p.ga)}/l)` : 'no hay datos'}; para gasolina 95, ${cg ? `${cg.name} en ${cg.addr} (${eur(cg.p.g95)}/l)` : 'no hay datos'}.`],
      [`¿Cuál es el precio medio de la gasolina en ${m.name}?`, `La gasolina 95 cuesta de media ${eur(m.st.g95?.avg)} por litro y el diésel ${eur(m.st.ga?.avg)}. En la provincia de ${p.name} la media es de ${eur(p.st.g95?.avg)} y ${eur(p.st.ga?.avg)}, respectivamente.`],
      [`¿Hay gasolineras abiertas 24 horas en ${m.name}?`, (() => { const h = m.list.filter(e => e.h24); return h.length ? `Sí, ${h.length === 1 ? 'una' : h.length}: ${h.slice(0, 3).map(e => `${e.name} (${e.addr})`).join(', ')}.` : `Según los horarios comunicados, ninguna gasolinera de ${m.name} abre las 24 horas. Consulta los horarios en la tabla.`; })()]
    ];
    const body = `<h1>Gasolineras en ${esc(m.name)}: precios de hoy</h1>
<p class="lead">${esc(intro)}</p>${updated}
${statCards(m.st, p.st).replace(/vs\. media nacional/g, `vs. media de ${esc(p.name)}`)}
${ad('top')}
${n >= 2 ? (() => { const k = m.st.ga && m.st.ga.n >= 2 ? 'ga' : 'g95'; const top = m.list.filter(e => e.p[k]).sort((a, b) => a.p[k] - b.p[k]).slice(0, 12); return `<h2>${low(k).replace(/^./, c => c.toUpperCase())} en ${esc(m.name)}, de más barata a más cara</h2>${bars(top.map(e => ({ label: `${esc(e.name)} <small>${esc(e.addr)}</small>`, href: `/gasolinera/${e.slug}/`, v: e.p[k] })), Q[k])}`; })() : ''}
${n >= 10 && n <= 150 ? `<h2>Mapa de gasolineras de ${esc(m.name)}</h2>${areaMap(m.list, m.st.ga ? 'ga' : 'g95', Q[m.st.ga ? 'ga' : 'g95'], { W: 760, maxH: 460, link: true, label: `Mapa de las gasolineras de ${m.name}` })}${legend(Q[m.st.ga ? 'ga' : 'g95'], `Precio del ${m.st.ga ? 'diésel' : 'gasolina 95'}`)}` : ''}
<h2>Todas las gasolineras de ${esc(m.name)}</h2>
<p class="muted">Pulsa en la cabecera de un combustible para ordenar por precio.</p>
${stationTable(list, m.st)}
${ad('inContent')}
<section class="prose"><h2>Preguntas frecuentes</h2>${faqHtml(faq)}</section>
${others.length ? `<h2>Otros municipios de ${p.name}</h2><ul class="chips">${others.map(x => `<li><a href="/gasolineras/${x.slug}/">${esc(x.name)}</a></li>`).join('')}<li><a href="/provincia/${p.slug}/"><strong>Toda la provincia →</strong></a></li></ul>` : ''}
${ad('bottom')}`;
    write(`gasolineras/${m.slug}/index.html`, layout({
      title: `Gasolineras en ${m.name}: precio gasolina y diésel hoy | ${cfg.siteName}`,
      description: `${n === 1 ? 'La gasolinera' : `Las ${n} gasolineras`} de ${m.name} (${p.name}) con sus precios de hoy.${cd ? ` Diésel desde ${eur(cd.p.ga)}` : ''}${cg ? `, gasolina 95 desde ${eur(cg.p.g95)}` : ''}.`.slice(0, 158),
      canonical: `/gasolineras/${m.slug}/`, crumbs: [[p.name, `/provincia/${p.slug}/`], [m.name, null]], body, jsonld: [faqLd(faq)]
    }));
    addUrl(`/gasolineras/${m.slug}/`, n > 3 ? '0.8' : '0.6');
  }

  // ------------------------------------------------ fichas de gasolinera
  for (const e of stations) {
    const m = e.mun, p = P[e.idp];
    const nearby = near(e).slice(0, 40);
    const cheaperNear = k => nearby.filter(([o]) => o.p[k] && e.p[k] && o.p[k] < e.p[k] - 0.005).sort((a, b) => a[0].p[k] - b[0].p[k]).slice(0, 5);
    const rankIn = k => e.p[k] ? m.list.filter(o => o.p[k]).sort((a, b) => a.p[k] - b.p[k]).indexOf(e) + 1 : 0;
    const fuels = Object.keys(FUEL).filter(k => e.p[k]);
    const verdict = (() => {
      const k = e.p.ga ? 'ga' : 'g95';
      if (!e.p[k] || !m.st[k]) return '';
      const d = e.p[k] - m.st[k].avg, r = rankIn(k), tot = m.st[k].n;
      if (tot === 1) return `Es la única gasolinera de ${m.name} con ${low(k)}. Respecto a la media de la provincia de ${p.name}, su precio está ${cents(e.p[k] - p.st[k].avg)} por litro.`;
      return `Para ${low(k)} es la ${r}.ª más barata de las ${tot} gasolineras de ${m.name}, ${Math.abs(d) < 0.005 ? 'en la media del municipio' : `${cents(d)} por litro ${d < 0 ? 'por debajo' : 'por encima'} de la media del municipio`}.`;
    })();
    const faq = [
      [`¿Cuánto cuesta la gasolina en ${e.name} de ${e.addr}?`, `Hoy, ${FECHA_TXT}: ${fuels.slice(0, 4).map(k => `${FUEL[k].name} ${eur(e.p[k])}/l`).join(', ')}.`],
      [`¿Cuál es el horario de la gasolinera ${e.name} en ${m.name}?`, e.h ? `El horario comunicado es: ${e.h}.${e.h24 ? ' Abre las 24 horas.' : ''}` : 'La gasolinera no ha comunicado su horario.'],
      [`¿Hay gasolineras más baratas cerca?`, (() => { const c = cheaperNear(e.p.ga ? 'ga' : 'g95')[0]; return c ? `Sí. ${c[0].name} en ${c[0].munName} (${c[0].addr}), a ${c[1].toFixed(1).replace('.', ',')} km, vende ${e.p.ga ? 'diésel' : 'gasolina 95'} a ${eur(c[0].p[e.p.ga ? 'ga' : 'g95'])}/l.` : 'En un radio de 10 km no hay ninguna gasolinera más barata para el combustible principal.'; })()]
    ];
    const near5 = k => cheaperNear(k).map(([o, d]) => `<li><a href="/gasolinera/${o.slug}/">${esc(o.name)}</a> · ${esc(o.munName)} <small>(${d.toFixed(1).replace('.', ',')} km)</small> <b>${eur(o.p[k])}</b> <small class="good">${cents(o.p[k] - e.p[k])}</small></li>`).join('');
    const body = `<article class="station">
<header class="st-head"><span class="logo lg" style="--h:${hash(e.name) % 360}">${esc(e.name.slice(0, 2).toUpperCase())}</span><div><h1>${esc(e.name)} en ${esc(m.name)}</h1><p class="muted">${esc(e.addr)} · ${esc(e.cp || '')} ${esc(e.locName)} (${esc(p.name)})</p></div><button class="btn ghost fav" type="button" data-fav="${esc(e.slug)}">♥ Guardar</button></header>
${updated}
<div class="table-wrap"><table class="prices"><thead><tr><th>Combustible</th><th class="num">Precio</th><th class="num">vs. media de ${esc(m.name)}</th><th class="num">vs. media de ${esc(p.name)}</th></tr></thead><tbody>
${fuels.map(k => `<tr><td>${FUEL[k].name}</td><td class="num"><strong>${eur(e.p[k])}</strong></td><td class="num">${m.st[k] && m.st[k].n > 1 ? cents(e.p[k] - m.st[k].avg) : '—'}</td><td class="num">${p.st[k] ? cents(e.p[k] - p.st[k].avg) : '—'}</td></tr>`).join('')}
</tbody></table></div>
${ad('top')}
<div class="st-grid"><div class="prose">
<h2>¿Es barata esta gasolinera?</h2><p>${esc(verdict)}</p>
${(() => { const k = e.p.ga ? 'ga' : e.p.g95 ? 'g95' : null; if (!k) return ''; const best = cheaperNear(k)[0]; return bars([{ label: '<strong>Esta gasolinera</strong>', v: e.p[k], hl: true }, ...(m.st[k] && m.st[k].n > 1 ? [{ label: `Media de ${esc(m.name)}`, v: m.st[k].avg }] : []), ...(p.st[k] ? [{ label: `Media de ${esc(p.name)}`, v: p.st[k].avg }] : []), { label: 'Media de España', v: NAT[k].avg }, ...(best ? [{ label: `Más barata a ${best[1].toFixed(1).replace('.', ',')} km`, href: `/gasolinera/${best[0].slug}/`, v: best[0].p[k] }] : [])], Q[k]) + `<p class="muted">Precio del ${k === 'ga' ? 'diésel' : 'gasolina 95'} por litro.</p>${best ? `<p><a class="btn ghost" href="/calculadora-ahorro/?a=${e.p[k]}&amp;b=${best[0].p[k]}&amp;km=${(best[1] * 2.6).toFixed(1)}">🧮 ¿Te compensa ir a la más barata? Calcúlalo</a></p>` : ''}`; })()}
${(() => { const k = e.p.ga ? 'ga' : 'g95'; const pts = [e, ...nearby.map(([o]) => o)]; const byMun = new Map(); for (const o of pts) { if (!byMun.has(o.munName)) byMun.set(o.munName, []); byMun.get(o.munName).push(o); } const labels = [...byMun].sort((a, b) => b[1].length - a[1].length).slice(0, 6).map(([name, l]) => ({ name, lat: l.reduce((a, o) => a + o.lat, 0) / l.length, lon: l.reduce((a, o) => a + o.lon, 0) / l.length })); return pts.length >= 3 ? `<h2>Gasolineras de la zona</h2><p>Esta gasolinera (marcada con un círculo) y las ${pts.length - 1} más cercanas en un radio de 10 km, coloreadas según su precio. Pasa el ratón o pulsa sobre un punto para ver la gasolinera.</p>${areaMap(pts, k, Q[k], { W: 640, maxH: 420, highlight: e, link: true, labels, label: 'Mapa de gasolineras cercanas' })}${legend(Q[k], k === 'ga' ? 'Precio del diésel' : 'Precio de la gasolina 95')}` : ''; })()}
${cheaperNear('ga').length ? `<h2>Diésel más barato cerca</h2><ul class="near">${near5('ga')}</ul>` : ''}
${cheaperNear('g95').length ? `<h2>Gasolina 95 más barata cerca</h2><ul class="near">${near5('g95')}</ul>` : ''}
${ad('inContent')}
<h2>Preguntas frecuentes</h2>${faqHtml(faq)}
</div><aside><dl class="facts">
<dt>Dirección</dt><dd>${esc(e.addr)}<br>${esc(e.cp || '')} ${esc(e.locName)}</dd>
<dt>Municipio</dt><dd><a href="/gasolineras/${m.slug}/">${esc(m.name)}</a></dd>
<dt>Provincia</dt><dd><a href="/provincia/${p.slug}/">${p.name}</a></dd>
<dt>Horario</dt><dd>${esc(e.h || 'No comunicado')}</dd>
${e.brand ? `<dt>Marca</dt><dd><a href="/marca/${e.brand.slug}/">${esc(e.brand.name)}</a></dd>` : ''}
<dt>Venta al público</dt><dd>${e.v === 'R' ? 'Restringida (solo socios o clientes)' : 'Sí'}</dd>
<dt>Cómo llegar</dt><dd><a href="https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}" rel="nofollow noopener" target="_blank">Abrir en el mapa ↗</a></dd>
</dl>${ad('sidebar')}</aside></div>
${ad('bottom')}</article>`;
    write(`gasolinera/${e.slug}/index.html`, layout({
      title: `${e.name} ${m.name} (${e.addr}): precio gasolina y diésel hoy | ${cfg.siteName}`.replace(/\s+/g, ' '),
      description: `Precios de hoy en la gasolinera ${e.name} de ${e.addr}, ${m.name}: ${fuels.slice(0, 3).map(k => `${FUEL[k].short} ${eur(e.p[k])}`).join(', ')}. Horario y gasolineras más baratas cerca.`.slice(0, 158),
      canonical: `/gasolinera/${e.slug}/`, crumbs: [[p.name, `/provincia/${p.slug}/`], [m.name, `/gasolineras/${m.slug}/`], [e.name, null]], body,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'GasStation', name: `${e.name} ${m.name}`, url: `${BASE}/gasolinera/${e.slug}/`, address: { '@type': 'PostalAddress', streetAddress: e.addr, postalCode: e.cp, addressLocality: e.locName, addressRegion: p.name, addressCountry: 'ES' }, geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lon }, ...(e.brand ? { brand: { '@type': 'Brand', name: e.brand.name } } : {}) }, faqLd(faq)]
    }));
    addUrl(`/gasolinera/${e.slug}/`, '0.5');
  }

  // ------------------------------------------------ combustibles
  for (const k of ['g95', 'ga', 'g98', 'gap', 'glp']) {
    const f = FUEL[k]; if (!NAT[k]) continue;
    const rank = provRank(k);
    const faq = [[`¿Cuál es el precio medio de ${low(k)} hoy?`, `${eur(NAT[k].avg)} por litro de media en las ${NAT[k].n.toLocaleString('es-ES')} gasolineras que lo venden, según los datos oficiales del ${FECHA_TXT}.`], [`¿Dónde es más barato?`, `Por provincias, en ${rank.slice(0, 3).map(p => `${p.name} (${eur(p.st[k].avg)})`).join(', ')}. La más cara es ${rank.at(-1).name} (${eur(rank.at(-1).st[k].avg)}).`]];
    write(`combustible/${f.slug}/index.html`, layout({
      title: `Precio ${low(k)} hoy en España: dónde es más barato | ${cfg.siteName}`,
      description: `Precio de ${low(k)} hoy: media de ${eur(NAT[k].avg)}/l en España. Ranking por provincias y las gasolineras más baratas.`,
      canonical: `/combustible/${f.slug}/`, crumbs: [['Combustibles', null], [f.name, null]],
      body: `<h1>Precio ${esc(low(k))} hoy</h1><p class="lead">Media nacional: <strong>${eur(NAT[k].avg)}</strong> por litro, con precios entre ${eur(NAT[k].min)} y ${eur(NAT[k].max)} en las ${NAT[k].n.toLocaleString('es-ES')} gasolineras que lo venden.</p>${updated}${ad('top')}
<h2>Mapa del precio de ${esc(low(k))} en España</h2><figure class="mapbox"><img src="/img/mapa-espana-${f.slug}.svg" alt="Mapa de España con el precio de ${esc(low(k))} por zonas" loading="lazy" width="820" height="671">${legend(Q[k])}</figure>
<h2>Las 20 gasolineras más baratas de España</h2>${stationTable(cheapest(stations, k, 20), NAT, { showMun: true })}
${ad('inContent')}
${(() => { const h = histogram(stations, k, Q[k], { label: `Distribución del precio de ${low(k)}`, avgV: NAT[k].avg }); return h ? `<h2>Cómo se reparten los precios</h2><p>Las ${NAT[k].n.toLocaleString('es-ES')} gasolineras que venden ${esc(low(k))}, agrupadas por precio. La línea discontinua es la media nacional.</p>${h}` : ''; })()}
<h2>Precio medio por provincia</h2>${bars(rank.map(p => ({ label: p.name, href: `/provincia/${p.slug}/`, v: p.st[k].avg })), Q[k])}
<section class="prose"><h2>Preguntas frecuentes</h2>${faqHtml(faq)}</section>${ad('bottom')}`,
      jsonld: [faqLd(faq)]
    }));
    addUrl(`/combustible/${f.slug}/`, '0.9');
  }

  // ------------------------------------------------ marcas
  const brandList = BRANDS.map(([slug, name]) => ({ slug, name, list: stations.filter(e => e.brand?.slug === slug) })).filter(b => b.list.length >= 5).map(b => ({ ...b, st: stats(b.list) }));
  const indep = stations.filter(e => !e.brand);
  write('marcas/index.html', layout({
    title: `Gasolineras por marca: Repsol, Moeve, BP, Galp, Plenoil… | ${cfg.siteName}`,
    description: 'Precio medio de la gasolina y el diésel por marca de gasolinera en España: Repsol, Moeve (Cepsa), BP, Galp, Shell, Plenoil, Ballenoil y más.',
    canonical: '/marcas/', crumbs: [['Marcas', null]],
    body: `<h1>Precio de la gasolina por marca</h1>${updated}${ad('top')}
<div class="table-wrap"><table class="prices sortable"><thead><tr><th>Marca</th>${MAIN.slice(0, 3).map(k => `<th class="num" data-sort="${k}">${FUEL[k].short}</th>`).join('')}<th class="num">Gasolineras</th></tr></thead><tbody>
${brandList.sort((a, b) => b.list.length - a.list.length).map(b => `<tr><td><a href="/marca/${b.slug}/"><strong>${esc(b.name)}</strong></a></td>${MAIN.slice(0, 3).map(k => `<td class="num${priceCls(b.st[k]?.avg, NAT[k])}" data-v="${b.st[k]?.avg || 99}">${eur2(b.st[k]?.avg)}</td>`).join('')}<td class="num">${b.list.length}</td></tr>`).join('')}
<tr><td><strong>Independientes y otras</strong></td>${MAIN.slice(0, 3).map(k => `<td class="num">${eur2(stats(indep)[k]?.avg)}</td>`).join('')}<td class="num">${indep.length}</td></tr>
</tbody></table></div>
<h2>Precio medio de la gasolina 95 por marca</h2>${bars(brandList.filter(b => b.st.g95).sort((a, b) => a.st.g95.avg - b.st.g95.avg).map(b => ({ label: esc(b.name), href: `/marca/${b.slug}/`, v: b.st.g95.avg })), Q.g95)}
<section class="prose"><p>Las gasolineras automáticas y de bajo coste, como Plenoil, Ballenoil o Petroprix, suelen tener precios por debajo de la media. Las grandes marcas compensan con programas de fidelización y descuentos con tarjeta o aplicación, que no se reflejan en el precio del surtidor.</p></section>${ad('bottom')}`
  }));
  addUrl('/marcas/', '0.8');
  for (const b of brandList) {
    const byProv = PROVS.map(p => ({ p, list: b.list.filter(e => e.idp === p.id) })).filter(x => x.list.length).sort((x, y) => y.list.length - x.list.length);
    write(`marca/${b.slug}/index.html`, layout({
      title: `Gasolineras ${b.name}: precios de hoy y la más barata | ${cfg.siteName}`,
      description: `Las ${b.list.length} gasolineras ${b.name} de España con sus precios de hoy. Media: ${eur(b.st.g95?.avg)} (G95) y ${eur(b.st.ga?.avg)} (diésel).`.slice(0, 158),
      canonical: `/marca/${b.slug}/`, crumbs: [['Marcas', '/marcas/'], [b.name, null]],
      body: `<h1>Gasolineras ${esc(b.name)}: precios de hoy</h1><p class="lead">${b.list.length} gasolineras ${esc(b.name)} en España. Precio medio de la marca comparado con la media nacional:</p>${updated}${statCards(b.st, NAT)}${ad('top')}
<h2>Las ${esc(b.name)} más baratas (diésel)</h2>${stationTable(cheapest(b.list, 'ga', 15), b.st, { showMun: true })}
${ad('inContent')}
<h2>Gasolineras ${esc(b.name)} por provincia</h2><ul class="chips">${byProv.map(x => `<li><a href="/provincia/${x.p.slug}/">${x.p.name} <small>${x.list.length}</small></a></li>`).join('')}</ul>${ad('bottom')}`
    }));
    addUrl(`/marca/${b.slug}/`, '0.7');
  }

  // ------------------------------------------------ evolución de precios (histórico)
  const H = HIST.slice(-120);
  const chart = lineChart([{ name: 'Gasolina 95', color: '#0f9d58', pts: H.map(h => [h.d, h.g95]) }, { name: 'Diésel', color: '#ff8a00', pts: H.map(h => [h.d, h.ga]) }, { name: 'Gasolina 98', color: '#2563eb', pts: H.map(h => [h.d, h.g98]) }], { label: 'Evolución del precio medio de la gasolina y el diésel en España' }) || '<p class="muted">El gráfico se irá completando día a día con los datos oficiales.</p>';
  const provTable = HP.length >= 2 ? `<h2>Cómo ha cambiado el precio en cada provincia</h2><p>Variación del precio medio en la última semana y en los últimos 30 días. Pulsa en la cabecera de una columna para ordenar.</p><div class="table-wrap"><table class="prices sortable"><thead><tr><th>Provincia</th><th class="num" data-sort="a">Diésel hoy</th><th class="num" data-sort="b">Diésel 7 días</th><th class="num" data-sort="c">Diésel 30 días</th><th class="num" data-sort="d">G95 7 días</th><th class="num" data-sort="e">G95 30 días</th></tr></thead><tbody>${PROVS.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')).map(p => { const v = [HP.at(-1).pr[p.id]?.[1], provChange(p.id, 1, 7), provChange(p.id, 1, 30), provChange(p.id, 0, 7), provChange(p.id, 0, 30)]; return `<tr><td><a href="/provincia/${p.slug}/">${p.name}</a></td>${v.map((x, i) => `<td class="num${i && x != null ? (x < -0.0005 ? ' cheap' : x > 0.0005 ? ' dear' : '') : ''}" data-v="${x ?? 99}">${x == null ? '—' : i ? cents(x) : eur2(x)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>` : '';
  const reports = BLOG.filter(b => b.report).slice(0, 4);
  write('evolucion-precios/index.html', layout({
    title: `Evolución del precio de la gasolina y el diésel en España | ${cfg.siteName}`,
    description: 'Gráfico con la evolución diaria del precio medio de la gasolina 95 y el diésel en España, con los datos oficiales del Ministerio.',
    canonical: '/evolucion-precios/', crumbs: [['Evolución de precios', null]],
    body: `<h1>Evolución del precio de la gasolina y el diésel</h1><p class="lead">Precio medio diario en España, calculado con los precios oficiales de todas las gasolineras.</p>${updated}${chart}${ad('top')}${provTable}
${reports.length ? `<h2>Informes semanales</h2><ul class="guides">${reports.map(b => `<li><a href="/blog/${b.slug}/"><strong>${esc(b.title)}</strong><span>${esc(b.description)}</span></a></li>`).join('')}</ul>` : ''}
<h2>Precio medio de los últimos 30 días</h2>
<div class="table-wrap"><table class="prices"><thead><tr><th>Fecha</th>${MAIN.map(k => `<th class="num">${FUEL[k].short}</th>`).join('')}</tr></thead><tbody>${HIST.slice(-30).reverse().map(h => `<tr><td>${h.d.split('-').reverse().join('/')}</td>${MAIN.map(k => `<td class="num">${eur2(h[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${ad('bottom')}`
  }));
  addUrl('/evolucion-precios/', '0.8');

  // ------------------------------------------------ cerca de mí
  write('cerca/index.html', layout({
    title: `Gasolineras más baratas cerca de mí ahora | ${cfg.siteName}`,
    description: 'Encuentra las gasolineras más baratas cerca de tu ubicación, ordenadas por precio o distancia, con los precios oficiales de hoy.',
    canonical: '/cerca/', crumbs: [['Cerca de mí', null]],
    body: `<h1>Gasolineras más baratas cerca de mí</h1><p class="lead">Pulsa el botón y te mostramos las gasolineras de tu alrededor ordenadas por precio. Tu ubicación no sale de tu dispositivo.</p>${updated}
<div class="near-ctl"><button class="btn big" type="button" id="geo">📍 Usar mi ubicación</button>
<label>Combustible <select id="fuel"><option value="5">Gasolina 95</option><option value="6" selected>Diésel</option><option value="7">Gasolina 98</option><option value="8">GLP</option></select></label>
<label>Radio <select id="radius"><option>5</option><option selected>10</option><option>20</option><option>50</option></select> km</label></div>
<p id="geo-msg" class="muted"></p><div id="near-out"></div>${ad('top')}
<section class="prose"><h2>Cómo funciona</h2><p>Tu navegador te pedirá permiso para usar tu ubicación. Con ella calculamos en tu propio dispositivo la distancia a cada gasolinera y te enseñamos las más baratas del radio que elijas. No guardamos ni enviamos tu posición.</p><p>Si prefieres no compartir la ubicación, <a href="/buscar/">busca tu municipio</a>.</p></section>`
  }));
  addUrl('/cerca/', '0.9');

  // ------------------------------------------------ calculadora: ¿me compensa ir a una gasolinera más barata?
  {
    const pr = NAT.ga.avg, cons = 6.5, L = 40;
    const kmMax = dif => dif * L / (cons / 100 * (pr - dif));
    const ej = [0.03, 0.05, 0.10, 0.15, 0.20].map(dif => `<tr><td>${Math.round(dif * 100)} céntimos</td><td class="num">${(dif * L).toFixed(2).replace('.', ',')} €</td><td class="num"><strong>${kmMax(dif).toFixed(0)} km</strong></td><td class="num">${(kmMax(dif) / 2).toFixed(0)} km</td></tr>`).join('');
    const faq = [
      ['¿Cuántos kilómetros merece la pena desviarse para repostar más barato?', `Depende de la diferencia de precio, de los litros que eches y de lo que gaste tu coche. Con un consumo de ${String(cons).replace('.', ',')} l/100 km y 40 litros, una diferencia de 10 céntimos compensa hasta unos ${kmMax(0.10).toFixed(0)} km extra entre ida y vuelta (unos ${(kmMax(0.10) / 2).toFixed(0)} km de distancia).`],
      ['¿Compensa ir a una gasolinera low cost que está lejos?', 'Si solo está a unos pocos kilómetros, casi siempre sí: la diferencia con las gasolineras de marca suele ser de 5 a 15 céntimos por litro. Si tienes que hacer un desvío largo solo para repostar, usa la calculadora para comprobarlo.'],
      ['¿La calculadora tiene en cuenta el tiempo?', 'No. Calcula solo el combustible que gastas en el desvío. Si además valoras tu tiempo, piensa que un desvío corto aprovechando un trayecto que ya ibas a hacer es lo que más compensa.']
    ];
    write('calculadora-ahorro/index.html', layout({
      title: `¿Me compensa ir a una gasolinera más barata? Calculadora | ${cfg.siteName}`,
      description: 'Calcula si te compensa desviarte hasta una gasolinera más barata: ahorro al repostar, gasto del desvío y los kilómetros máximos que merece la pena hacer.',
      canonical: '/calculadora-ahorro/', crumbs: [['Calculadora de ahorro', null]],
      body: `<h1>¿Me compensa ir a una gasolinera más barata?</h1>
<p class="lead">Una gasolinera más barata solo ahorra dinero si el combustible que gastas en llegar hasta ella cuesta menos que lo que ahorras al repostar. Mete tus datos y te lo calculamos al momento.</p>
<form id="calc" class="calc" onsubmit="return false">
<label>Precio en tu gasolinera habitual <span><input type="number" step="0.001" min="0" name="a" value="${pr.toFixed(3)}" inputmode="decimal"> €/l</span></label>
<label>Precio en la gasolinera más barata <span><input type="number" step="0.001" min="0" name="b" value="${(pr - 0.08).toFixed(3)}" inputmode="decimal"> €/l</span></label>
<label>Litros que vas a echar <span><input type="number" step="1" min="1" name="l" value="${L}" inputmode="numeric"> l</span></label>
<label>Kilómetros de más (ida y vuelta) <span><input type="number" step="0.5" min="0" name="km" value="8" inputmode="decimal"> km</span></label>
<label>Consumo de tu coche <span><input type="number" step="0.1" min="1" name="c" value="${cons}" inputmode="decimal"> l/100 km</span></label>
</form>
<div id="calc-out" class="calc-out" aria-live="polite"></div>
${ad('top')}
<section class="prose"><h2>Cómo se calcula</h2>
<p>El ahorro al repostar es la diferencia de precio por litro multiplicada por los litros que echas. El gasto del desvío son los kilómetros de más multiplicados por el consumo de tu coche y por el precio del combustible. Si el ahorro es mayor que el gasto, te compensa.</p>
<p>Por ejemplo, con el diésel a ${eur(pr)} de media, 40 litros y un coche que gasta ${String(cons).replace('.', ',')} litros a los 100 km, estos son los kilómetros de más que puedes hacer antes de perder dinero:</p></section>
<div class="table-wrap"><table class="prices"><thead><tr><th>Diferencia de precio</th><th class="num">Ahorro en 40 l</th><th class="num">Km de más (ida y vuelta)</th><th class="num">Distancia máxima</th></tr></thead><tbody>${ej}</tbody></table></div>
<section class="prose"><p>La conclusión es clara: <strong>casi siempre compensa ir a una gasolinera más barata que esté cerca</strong>, y en cambio no merece la pena hacer un viaje largo solo para ahorrar un par de céntimos. Lo ideal es repostar en la más barata que te pille de camino. Para encontrarla, usa <a href="/cerca/">gasolineras cerca de mí</a> o busca tu municipio.</p>
<h2>Preguntas frecuentes</h2>${faqHtml(faq)}</section>${ad('bottom')}`,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Calculadora de ahorro en gasolina', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, url: BASE + '/calculadora-ahorro/' }, faqLd(faq)]
    }));
    addUrl('/calculadora-ahorro/', '0.8');
  }

  // ------------------------------------------------ guías y blog
  write('guias/index.html', layout({ title: `Guías para ahorrar en gasolina | ${cfg.siteName}`, description: 'Guías prácticas para gastar menos en combustible: cuándo repostar, cómo conducir, descuentos y qué combustible elegir.', canonical: '/guias/', crumbs: [['Guías', null]], body: `<h1>Guías para ahorrar en combustible</h1>${ad('top')}<ul class="guides">${GUIDES.map(guideLi).join('')}</ul>${ad('bottom')}` }));
  addUrl('/guias/', '0.7');
  for (const g of GUIDES) {
    let n = 0; const html = md(g.md).replace(/<h2>/g, x => (++n === 2 ? ad('inContent') + x : x));
    write(`guias/${g.slug}/index.html`, layout({ title: `${g.title} | ${cfg.siteName}`, description: g.description.slice(0, 158), canonical: `/guias/${g.slug}/`, crumbs: [['Guías', '/guias/'], [g.title, null]], body: `<article class="prose guide"><h1>${esc(g.title)}</h1><p class="lead">${esc(g.description)}</p><img class="g-banner" src="/img/guias/${g.slug}.svg" alt="" width="640" height="280">${ad('top')}${html}</article><h2>Más guías</h2><ul class="guides">${GUIDES.filter(x => x !== g).slice(0, 4).map(guideLi).join('')}</ul>${ad('bottom')}`, jsonld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, author: { '@type': 'Organization', name: cfg.siteName }, mainEntityOfPage: `${BASE}/guias/${g.slug}/` }] }));
    addUrl(`/guias/${g.slug}/`, '0.7');
  }
  const blogLi = b => `<li><a href="/blog/${b.slug}/"><img class="g-cover" src="/img/blog/${b.slug}.svg" alt="" loading="lazy" width="640" height="280"><small class="muted">${fmtFecha(b.date)}</small><strong>${esc(b.title)}</strong><span>${esc(b.description)}</span></a></li>`;
  write('blog/index.html', layout({ title: `Blog: actualidad del precio de los carburantes | ${cfg.siteName}`, description: 'Noticias y análisis sobre el precio de la gasolina y el diésel en España.', canonical: '/blog/', crumbs: [['Blog', null]], body: `<h1>Blog</h1>${ad('top')}<ul class="guides">${BLOG.map(blogLi).join('')}</ul>${ad('bottom')}` }));
  addUrl('/blog/', '0.6');
  for (const b of BLOG) {
    write(`blog/${b.slug}/index.html`, layout({ title: `${b.title} | ${cfg.siteName}`, description: b.description.slice(0, 158), canonical: `/blog/${b.slug}/`, crumbs: [['Blog', '/blog/'], [b.title, null]], body: `<article class="prose guide"><h1>${esc(b.title)}</h1><p class="lead">${esc(b.description)}</p><p class="muted">Publicado el ${fmtFecha(b.date)}</p><img class="g-banner" src="/img/blog/${b.slug}.svg" alt="" width="640" height="280">${ad('top')}${b.html || md(b.md)}</article>${b.report ? `<h2>Informes anteriores</h2><ul class="guides">${BLOG.filter(x => x.report && x !== b).slice(0, 4).map(blogLi).join('')}</ul>` : ''}${ad('bottom')}`, jsonld: [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: b.title, datePublished: b.date, author: { '@type': 'Organization', name: cfg.siteName }, mainEntityOfPage: `${BASE}/blog/${b.slug}/` }] }));
    addUrl(`/blog/${b.slug}/`, '0.6');
  }

  // ------------------------------------------------ utilidades y legales
  write('buscar/index.html', layout({ title: `Buscar gasolineras por municipio | ${cfg.siteName}`, description: 'Busca tu municipio y compara los precios de sus gasolineras.', canonical: '/buscar/', noindex: true, crumbs: [['Buscar', null]], body: `<h1>Buscar municipio</h1><form class="search big" action="/buscar/"><input name="q" type="search" autofocus placeholder="Nombre del municipio"></form><p id="s-count" class="muted"></p><ul class="results" id="results"></ul>` }));
  write('favoritas/index.html', layout({ title: `Mis gasolineras | ${cfg.siteName}`, description: 'Tus gasolineras guardadas.', canonical: '/favoritas/', noindex: true, crumbs: [['Mis gasolineras', null]], body: `<h1>Mis gasolineras</h1><p class="muted">Se guardan en este dispositivo. Pulsa ♥ Guardar en cualquier gasolinera para añadirla.</p><div id="favs"></div><p id="favs-empty" class="empty" hidden>Todavía no has guardado ninguna gasolinera.</p>` }));
  write('404.html', layout({ title: `Página no encontrada | ${cfg.siteName}`, description: 'Página no encontrada', canonical: '/404.html', noindex: true, body: `<h1>No encontramos esta página</h1><p>Es posible que la gasolinera haya cerrado o cambiado de datos. Prueba a <a href="/buscar/">buscar tu municipio</a>.</p>` }));
  const legal = {
    'sobre-nosotros': ['Sobre nosotros', `<p>${esc(cfg.siteName)} es una web independiente para comparar el precio de la gasolina y el diésel en todas las gasolineras de España y ayudar a ahorrar en cada repostaje.</p><p>Los precios proceden de la información oficial que las propias gasolineras comunican al Ministerio para la Transición Ecológica y el Reto Demográfico, publicada como datos abiertos en el Geoportal de Hidrocarburos. Los actualizamos cada día. ${esc(cfg.siteName)} no está vinculada a ninguna administración ni a ninguna marca de carburantes.</p><p>Si detectas un error en una gasolinera, escríbenos a <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a>.</p>`],
    'contacto': ['Contacto', `<p>Puedes escribirnos a <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a> para sugerencias, errores en los datos o cualquier consulta.</p>`],
    'aviso-legal': ['Aviso legal', `<h2>Datos identificativos</h2><p>En cumplimiento del artículo 10 de la Ley 34/2002 (LSSI-CE):</p><ul><li><strong>Titular:</strong> ${esc(cfg.ownerName)}</li>${cfg.ownerNif ? `<li><strong>NIF:</strong> ${esc(cfg.ownerNif)}</li>` : ''}${cfg.ownerAddress ? `<li><strong>Domicilio:</strong> ${esc(cfg.ownerAddress)}</li>` : ''}<li><strong>Correo electrónico:</strong> <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a></li><li><strong>Sitio web:</strong> ${esc(HOST)}</li></ul><h2>Origen de los datos</h2><p>Los precios y datos de las estaciones de servicio proceden del Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Hidrocarburos), reutilizados conforme a la Ley 37/2007 sobre reutilización de la información del sector público. La fuente original no participa en esta web ni la patrocina. Los datos se muestran tal como se publican, con la fecha de su última actualización; los precios pueden cambiar a lo largo del día y el válido es siempre el del surtidor.</p><h2>Propiedad intelectual</h2><p>Los textos, el diseño y el código de este sitio son propiedad de su titular. Las marcas de las gasolineras pertenecen a sus respectivos propietarios.</p><h2>Responsabilidad</h2><p>El titular no se hace responsable de los errores que pudieran contener los datos oficiales ni de las decisiones tomadas a partir de ellos.</p><h2>Legislación aplicable</h2><p>Este aviso legal se rige por la legislación española.</p>`],
    'privacidad': ['Política de privacidad', `<p><strong>Responsable del tratamiento:</strong> ${esc(cfg.ownerName)}${cfg.ownerNif ? `, NIF ${esc(cfg.ownerNif)}` : ''}${cfg.ownerAddress ? `, ${esc(cfg.ownerAddress)}` : ''}. Contacto: ${esc(cfg.contactEmail)}.</p><p>No pedimos registro. Tus gasolineras favoritas se guardan solo en tu navegador.</p><p><strong>Ubicación.</strong> Si usas la función «Cerca de mí», tu posición se usa únicamente en tu dispositivo para calcular distancias. No se envía a ningún servidor ni se guarda.</p>${cfg.analytics?.gaId ? '<p><strong>Estadísticas.</strong> Si lo aceptas en el aviso de cookies, usamos Google Analytics (Google Ireland Ltd.) para saber cuántas personas visitan la web. Puedes cambiar tu elección desde «Preferencias de cookies» en el pie de página.</p>' : ''}<p><strong>Publicidad.</strong> Este sitio utiliza Google AdSense. Google y sus socios pueden usar cookies para mostrar anuncios basados en tus visitas a este y otros sitios. Puedes desactivar la publicidad personalizada en <a href="https://adssettings.google.com" rel="nofollow">la configuración de anuncios de Google</a>.</p><p>Puedes ejercer tus derechos de acceso, rectificación, supresión y oposición escribiendo a ${esc(cfg.contactEmail)}.</p>`],
    'cookies': ['Política de cookies', `<p>Las cookies son pequeños archivos que la web guarda en tu navegador.</p><ul><li><strong>Técnicas (sin consentimiento):</strong> guardamos en tu navegador tus gasolineras favoritas y tu elección sobre las cookies.</li>${cfg.analytics?.gaId ? '<li><strong>Analíticas (solo si las aceptas):</strong> Google Analytics usa las cookies <code>_ga</code> y <code>_ga_*</code> durante un máximo de 2 años.</li>' : ''}${cfg.adsense?.client ? '<li><strong>Publicitarias (solo si las aceptas):</strong> Google AdSense y sus socios usan cookies para mostrar anuncios y medir su rendimiento.</li>' : ''}</ul><p>Puedes cambiar tu elección desde «Preferencias de cookies» en el pie de página o borrar las cookies desde tu navegador.</p>`]
  };
  for (const [slug, [t, html]] of Object.entries(legal)) {
    write(`${slug}/index.html`, layout({ title: `${t} | ${cfg.siteName}`, description: `${t} de ${cfg.siteName}.`, canonical: `/${slug}/`, crumbs: [[t, null]], body: `<article class="prose"><h1>${t}</h1>${html}<p class="muted">Última actualización: ${esc(cfg.legalUpdated || TODAY)}</p></article>` }));
    addUrl(`/${slug}/`, '0.2');
  }

  // ------------------------------------------------ sitemap, robots, ads.txt, IndexNow
  const sm = urls.map(([u, p]) => `<url><loc>${BASE}${u}</loc><lastmod>${PRICE_DATE}</lastmod><priority>${p}</priority></url>`);
  const chunks = []; for (let i = 0; i < sm.length; i += 40000) chunks.push(sm.slice(i, i + 40000));
  chunks.forEach((c, i) => write(`sitemap-${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${c.join('\n')}\n</urlset>`));
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${chunks.map((c, i) => `<sitemap><loc>${BASE}/sitemap-${i + 1}.xml</loc><lastmod>${PRICE_DATE}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>`);
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /buscar/\nDisallow: /favoritas/\n\nSitemap: ${BASE}/sitemap.xml\n`);
  if (cfg.adsense.client) write('ads.txt', `google.com, ${cfg.adsense.client.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
  if (cfg.indexNowKey) {
    write(`${cfg.indexNowKey}.txt`, cfg.indexNowKey);
    // solo las páginas principales: los precios cambian cada día en todas, no tiene sentido avisar de miles de URLs
    if (process.env.CF_PAGES) await pingIndexNow(urls.filter(([, p]) => +p >= 0.8).map(([u]) => u).slice(0, 2000));
  }
  console.log(`✓ Web generada en dist/ (${urls.length} URLs)`);
}

async function pingIndexNow(list) {
  try {
    const k = await fetch(`${BASE}/${cfg.indexNowKey}.txt`, { signal: AbortSignal.timeout(15000) });
    if (!k.ok) return;
    const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host: HOST, key: cfg.indexNowKey, keyLocation: `${BASE}/${cfg.indexNowKey}.txt`, urlList: list.map(u => BASE + u) }), signal: AbortSignal.timeout(20000) });
    console.log(`✓ IndexNow: ${list.length} URLs (respuesta ${r.status})`);
  } catch (e) { console.log('· IndexNow no respondió:', e.message); }
}

main().catch(e => { console.error(e); process.exit(1); });
