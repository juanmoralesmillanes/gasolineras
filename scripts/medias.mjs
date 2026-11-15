// Cálculos compartidos por descargar-precios.mjs y historico-atras.mjs:
// convierte la respuesta del Ministerio en una lista compacta y resume un día del histórico.

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
const r3 = v => Math.round(v * 1000) / 1000;
const mean = v => v.length ? r3(v.reduce((a, b) => a + b, 0) / v.length) : null;

export function compact(raw) {
  const list = raw.ListaEESSPrecio || [];
  return list.map(e => {
    const p = {};
    for (const [k, f] of Object.entries(FUELS)) { const v = num(e[f]); if (v) p[k] = v; }
    return {
      id: e.IDEESS, r: (e['Rótulo'] || '').trim(), d: (e['Dirección'] || '').trim(), cp: e['C.P.'], loc: (e.Localidad || '').trim(),
      mun: (e.Municipio || '').trim(), idm: e.IDMunicipio, idp: e.IDProvincia, ccaa: e.IDCCAA,
      lat: coord(e.Latitud), lon: coord(e['Longitud (WGS84)']), h: (e.Horario || '').trim(), m: e.Margen, v: e['Tipo Venta'], p
    };
  }).filter(e => Object.keys(e.p).length);
}

// Resumen de un día: media nacional, media por provincia (G95 y diésel) y la gasolinera más barata
// de España para cada uno (id, precio, rótulo, municipio, provincia).
export function daySummary(day, out) {
  const s = { d: day };
  for (const k of ['g95', 'ga', 'g98', 'glp']) { const m = mean(out.map(e => e.p[k]).filter(Boolean)); if (m) s[k] = m; }
  const byProv = {};
  for (const e of out) { if (!e.idp) continue; (byProv[e.idp] ||= []).push(e); }
  s.pr = {};
  for (const [id, l] of Object.entries(byProv)) s.pr[id] = [mean(l.map(e => e.p.g95).filter(Boolean)), mean(l.map(e => e.p.ga).filter(Boolean))];
  s.min = {};
  for (const k of ['g95', 'ga']) {
    const b = out.filter(e => e.p[k] && e.v !== 'R').sort((a, b) => a.p[k] - b.p[k])[0];
    if (b) s.min[k] = [b.id, b.p[k], b.r, b.mun, b.idp];
  }
  return s;
}

export function saveHistory(fs, file, entries) {
  const hist = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  for (const s of entries) { const i = hist.findIndex(h => h.d === s.d); if (i >= 0) hist[i] = s; else hist.push(s); }
  hist.sort((a, b) => a.d.localeCompare(b.d));
  // un día por línea para que git guarde solo los cambios
  fs.writeFileSync(file, `[\n${hist.slice(-400).map(h => JSON.stringify(h)).join(',\n')}\n]\n`);
  return hist;
}
