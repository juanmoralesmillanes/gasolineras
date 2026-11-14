# GasolinerasCercanas: precios de todas las gasolineras de España

Web estática con el precio de la gasolina y el diésel en todas las gasolineras de España: páginas por provincia, municipio, marca, combustible y una ficha para cada gasolinera. Usa la misma base que PonLaRadio y TDTenDirecto.

## Cómo funciona

1. **GitHub Actions** (`.github/workflows/actualizar-precios.yml`) descarga dos veces al día los precios oficiales del Ministerio para la Transición Ecológica y el Reto Demográfico (`scripts/descargar-precios.mjs`) y guarda `data/estaciones.json` y `data/historico.json`.
2. Al recibir ese commit, **Cloudflare Pages** ejecuta `node build.mjs` y publica la web (`dist/`).

## En tu ordenador

```
node scripts/descargar-precios.mjs   # descarga los precios (desde España funciona sin problema)
node build.mjs                       # genera dist/
npx serve dist                       # vista previa en http://localhost:3000
```

## Archivos

- `config.json`: nombre, dominio, AdSense, Analytics y datos del titular.
- `data/territorio.json`: provincias y comunidades.
- `data/guias/` y `data/blog/`: artículos en Markdown (los del blog con fecha futura se publican solos ese día).
- `src/`: estilos, JavaScript y logotipos.

## Datos

Los precios proceden del Geoportal de Hidrocarburos del Ministerio para la Transición Ecológica y el Reto Demográfico, publicados como datos abiertos y reutilizados conforme a la Ley 37/2007. La web cita la fuente y la fecha de actualización en todas las páginas.
