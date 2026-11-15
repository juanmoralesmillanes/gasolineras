#!/usr/bin/env node
// Rellena data/historico.json con los días anteriores usando el histórico oficial del Ministerio
// (servicio EstacionesTerrestresHist/{dd-mm-aaaa}). Solo descarga los días que faltan o que no
// tienen todavía las medias por provincia.
// Uso: node scripts/historico-atras.mjs [días=120]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compact, daySummary, saveHistory } from './medias.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/historico.json');
const BASE = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestresHist/';
const DAYS = Math.min(400, +process.argv[2] || 120);

const have = new Map((fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : []).map(h => [h.d, h]));
const todo = [];
for (let i = DAYS; i >= 1; i--) {
  const dt = new Date(Date.now() - i * 864e5);
  const day = dt.toISOString().slice(0, 10);
  if (have.get(day)?.pr) continue;
  todo.push(day);
}
console.log(`Días por rellenar: ${todo.length}`);
let ok = 0, fails = 0;
for (const day of todo) {
  const [y, m, d] = day.split('-');
  let raw = null;
  for (let t = 0; t < 3 && !raw; t++) {
    try {
      const r = await fetch(`${BASE}${d}-${m}-${y}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if ((j.ListaEESSPrecio || []).length < 5000) throw new Error(`solo ${(j.ListaEESSPrecio || []).length} estaciones`);
      raw = j;
    } catch (e) { console.log(`  ${day}: intento ${t + 1} fallido (${e.message})`); await new Promise(r => setTimeout(r, 5000)); }
  }
  if (!raw) { fails++; if (fails >= 5 && !ok) { console.error('✗ El servicio histórico no responde; se aborta.'); process.exit(1); } continue; }
  const s = daySummary(day, compact(raw));
  saveHistory(fs, FILE, [s]); // se guarda cada día por si el proceso se corta
  ok++;
  console.log(`✓ ${day}: G95 ${s.g95} · diésel ${s.ga}`);
}
console.log(`Hecho: ${ok} días añadidos, ${fails} sin datos.`);
