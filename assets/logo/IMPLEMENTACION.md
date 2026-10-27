# Métrica · ícono (logo 4, onda M)

## Colores
- Fondo: degradado vertical #232326 → #141416 (Dark: #000000)
- Onda base: #e8eaed · Picos: #9d8bff (en fondo claro #3c4043 / #7b61ff)
- Tinted: base #8e8e93, picos #ffffff sobre negro (iOS lo tiñe)

## Glifo (grilla 1024)
- Trazo 56 px, puntas y uniones redondeadas, sin relleno, desplazado -22 px en Y.
- Recorrido: base y=600 (x 160→864), picos y≈376 en x=352 y x=672, valle y≈712 en x=512.
- Caja visual ≈ x132–892, y≈354–690 (ancho ≈74 %, centrado). Violeta solo en las dos crestas.
- Path: ver `glifo.svg` / `capa_glifo.svg`.

## Archivos
- `icono.svg` / `icono_1024_default.png`: cuadrado a sangre, SIN máscara (iOS pone el squircle). `icono_squircle.svg` es solo para presentación.
- `icono_1024_dark.png`, `icono_1024_tinted.png`
- `capa_fondo.svg`, `capa_glifo.svg`, `capa_glifo_1024.png` (glifo transparente, para Icon Composer)
- `wordmark.svg` (oscuro) y `wordmark_claro.svg`: texto en Inter 600. Antes de usarlo en producción, pasar el texto a contornos.
- `icono-180.png`, `icono-192.png`, `icono-512.png` (web/PWA)

## Xcode
1. Assets → AppIcon → Single Size (iOS 1024).
2. Appearances: Any, Dark, Tinted → cargar default, dark y tinted.
3. iOS 26 / Liquid Glass: en Icon Composer crear un .icon con una capa de fondo (capa_fondo.svg) y una de glifo (capa_glifo.svg). Ajustar el brillo y la sombra en la propia app. Agregar el .icon al target.

## Repo
- Los archivos de este paquete están en `assets/logo/` (el de tres barras, en `iconos/`, se borró).
- `manifest.webmanifest`: `icono-192.png` e `icono-512.png`, y el SVG. `index.html`: apple-touch-icon en `icono-180.png` y favicon en `icono.svg` (a 16 px el PNG queda borroso).
- El service worker precachea el SVG, el 180, el 192 y el 512. El wordmark no va en la interfaz: el texto sigue vivo y, antes de usarlo en producción, hay que pasarlo a contornos.
- No están en el repo: `gen.py`, las láminas jpg, `icono_squircle.svg` (solo presentación) ni `capa_glifo_1024.png` (el glifo transparente va en `capa_glifo.svg`).
