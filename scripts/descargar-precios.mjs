#!/usr/bin/env node
// Descarga los precios de todas las gasolineras de España del servicio REST oficial del
// Ministerio para la Transición Ecológica (Geoportal de Hidrocarburos) y guarda una versión
// compacta en data/estaciones.json. Además añade el resumen del día (medias nacionales y por provincia) a data/historico.json.
// Uso: node scripts/descargar-precios.mjs [archivo-local.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compact, daySummary, saveHistory } from './medias.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

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
  if ((raw.ListaEESSPrecio || []).length < 5000) throw new Error(`Respuesta sospechosa: solo ${(raw.ListaEESSPrecio || []).length} estaciones`);
  const out = compact(raw).filter(e => e.lat && e.lon);
  const fecha = raw.Fecha; // "14/11/2026 8:34:56"
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  // una gasolinera por línea: así git guarda solo las diferencias de cada día
  out.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(ROOT, 'data/estaciones.json'), `{"fecha":${JSON.stringify(fecha)},"estaciones":[\n${out.map(e => JSON.stringify(e)).join(',\n')}\n]}\n`);

  // histórico: medias nacionales y por provincia, y la más barata del día
  const [d, m, y] = fecha.split(' ')[0].split('/');
  const sum = daySummary(`${y}-${m}-${d}`, out);
  saveHistory(fs, path.join(ROOT, 'data/historico.json'), [sum]);
  const avg = sum;
  console.log(`✓ ${out.length} gasolineras · precios del ${fecha} · media G95 ${avg.g95} · diésel ${avg.ga}`);
}
main().catch(e => { console.error('✗ No se pudieron descargar los precios:', e.message); process.exit(1); });
