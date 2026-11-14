#!/usr/bin/env node
// Descarga los precios de todas las gasolineras de España del servicio REST oficial del
// Ministerio para la Transición Ecológica (Geoportal de Hidrocarburos) y guarda una versión
// compacta en data/estaciones.json. Además añade la media nacional del día a data/historico.json.
// Uso: node scripts/descargar-precios.mjs [archivo-local.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

// combustibles: clave corta -> nombre del campo en la API
export const FUELS = {
  g95: 'Precio Gasolina 95 E5',
  ga: 'Precio Gasoleo A',
  g98: 'Precio Gasolina 98 E5',
  gap: 'Precio Gasoleo Premium',
  g95e10: 'Precio Gasolina 95 E10',
  g95p: 'Precio Gasolina 95 E5 Premium',
  g98e10: 'Precio Gasolina 98 E10',
  gb: 'Precio Gasoleo B',
  glp: 'Precio Gases licuados del petróleo',
  gnc: 'Precio Gas Natural Comprimido',
  gnl: 'Precio Gas Natural Licuado',
  h2: 'Precio Hidrogeno',
  adblue: 'Precio Adblue',
  dr: 'Precio Diésel Renovable',
  gr: 'Precio Gasolina Renovable'
};
const coord = v => { const n = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(n) && n !== 0 ? Math.round(n * 1e5) / 1e5 : null; };
const num = v => { const n = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null; };

async function main() {
  let raw;
  if (process.argv[2]) raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  else {
    let last;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        raw = await r.json(); break;
      } catch (e) { last = e; await new Promise(ok => setTimeout(ok, 10000)); }
    }
    if (!raw) throw last;
  }
  const list = raw.ListaEESSPrecio || [];
  if (list.length < 5000) throw new Error(`Respuesta sospechosa: solo ${list.length} estaciones`);
  const out = list.map(e => {
    const p = {};
    for (const [k, f] of Object.entries(FUELS)) { const v = num(e[f]); if (v) p[k] = v; }
    return {
      id: e.IDEESS, r: (e['Rótulo'] || '').trim(), d: (e['Dirección'] || '').trim(), cp: e['C.P.'], loc: (e.Localidad || '').trim(),
      mun: (e.Municipio || '').trim(), idm: e.IDMunicipio, idp: e.IDProvincia, ccaa: e.IDCCAA,
      lat: coord(e.Latitud), lon: coord(e['Longitud (WGS84)']), h: (e.Horario || '').trim(), m: e.Margen, v: e['Tipo Venta'], p
    };
  }).filter(e => e.lat && e.lon && Object.keys(e.p).length);
  const fecha = raw.Fecha; // "14/11/2026 8:34:56"
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  // una gasolinera por línea: así git guarda solo las diferencias de cada día
  out.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(ROOT, 'data/estaciones.json'), `{"fecha":${JSON.stringify(fecha)},"estaciones":[\n${out.map(e => JSON.stringify(e)).join(',\n')}\n]}\n`);

  // histórico de medias nacionales (una entrada por día)
  const hf = path.join(ROOT, 'data/historico.json');
  const hist = fs.existsSync(hf) ? JSON.parse(fs.readFileSync(hf, 'utf8')) : [];
  const [d, m, y] = fecha.split(' ')[0].split('/');
  const day = `${y}-${m}-${d}`;
  const avg = {};
  for (const k of ['g95', 'ga', 'g98', 'glp']) { const v = out.map(e => e.p[k]).filter(Boolean); if (v.length) avg[k] = Math.round(v.reduce((a, b) => a + b, 0) / v.length * 1000) / 1000; }
  const i = hist.findIndex(h => h.d === day);
  if (i >= 0) hist[i] = { d: day, ...avg }; else hist.push({ d: day, ...avg });
  hist.sort((a, b) => a.d.localeCompare(b.d));
  fs.writeFileSync(hf, JSON.stringify(hist.slice(-400)));
  console.log(`✓ ${out.length} gasolineras · precios del ${fecha} · media G95 ${avg.g95} · diésel ${avg.ga}`);
}
main().catch(e => { console.error('✗ No se pudieron descargar los precios:', e.message); process.exit(1); });
