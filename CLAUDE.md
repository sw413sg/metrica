# Métrica: guía para agentes

App: "Métrica" (en la tienda "Métrica: rimas y letras"), para escribir canciones. Repo: github.com/sw413sg/metrica (viene de Genwords).

## Meta
Convertir la web en "Métrica: rimas y letras", una app de iPhone para escribir canciones en español: primero como web app para probar todo, y cuando esté lista, pasarla 1 a 1 a SwiftUI para publicarla en App Store.

## Hoy
Publicada en https://sw413sg.github.io/metrica/ (GitHub Pages desde `main`, sin Jekyll por `.nojekyll`). La interfaz está en `index.html`, `estilos.css` y `js/app.js`; la lógica, en módulos puros en `js/logica/` con tests en `tests/`.

- **Diseño general** (`estilos.css`): colores y tipografía tipo Google Keep, con grises neutros y tab bar flotante. Fondo liso con granulado al 5%, sin degradado (pedido de Swa); la libreta no lleva granulado. La franja de la hora en Safari usa el color promedio del fondo por `theme-color`. Botones, buscador y controles de vidrio de iOS 26, y listas como Ajustes de iOS (referencia: https://sw413sg.github.io/cumpleanos-prototipo/). El violeta (`--destacado`) es solo para lo especial: pestaña elegida, letra nueva, sílaba fuerte y Métrica Extras.
- **Letras**: la última letra va grande arriba y el resto de a dos. Mantener apretada una tarjeta y arrastrarla al tacho la borra, con confirmación. Se guardan solas en localStorage (`js/logica/sesiones.js`).
- **Editor de una letra**:
  - Fondo liso, gris oscuro `#2d2e32` en modo oscuro. Al bajar, el título se va con el texto y arriba quedan solo los botones.
  - Cuenta las sílabas métricas de cada verso, con sinalefa (`js/logica/silabas.js`).
  - Pinta del mismo color la parte que rima de las palabras finales de cada verso, desde la sílaba tónica ("can**ción**", con `inicioTonica` de `js/logica/silabas.js`; ver "Pendiente").
  - Las sugerencias aparecen pegadas al teclado solo al tocar una palabra o un renglón vacío, no mientras se escribe (pedido de Swa). Tocar una palabra muestra rimas para cambiarla, y «Cambiar» alterna a sinónimos (`js/logica/sinonimos.js`).
  - Las palabras mal escritas o sin tilde no se marcan, pero riman, cuentan sílabas y sugieren como la palabra corregida (`js/logica/ortografia.js`).
  - Tocar un renglón vacío marca la parte: [Intro], [Estribillo]... (`js/logica/secciones.js`).
  - La ruedita abre los ajustes: sílabas, tema, tamaño, separación de renglones y de letras, fuente y, abajo de todo, borrar la letra con confirmación (`js/logica/libreta.js`).
  - La nota musical reproduce un link de YouTube o SoundCloud en un banner abajo, con pausa, ±10 s, volumen y cerrar (`js/logica/musica.js`).
- **Rimas** (juntó a la vieja pestaña Palabras): 6 tarjetas que cambian solas, al azar o con las rimas más usadas de la palabra buscada, y abajo la lista completa. Buscador consonante y asonante en `js/logica/rimas.js`. Sin búsqueda se ven las palabras favoritas (estrella en la lista o tocar una tarjeta).
- **Freestyle** (`js/logica/freestyle.js`): palabra nueva cada 2 compases con la sílaba tónica marcada, beat con BPM (barra y botón para volver a 90) y aro de la ronda que se carga de violeta. Los beats se sintetizan con Web Audio en `js/beats.js`, sin archivos de audio (licencias en `beats/LICENCIA.md`).
- **Ajustes**: apariencia claro, oscuro o sistema (`js/logica/apariencia.js`), aparte de los temas de cada libreta. Paywall y "Volver a la versión gratis" (ver Monetización).
- **PWA**: `manifest.webmanifest` y `sw.js`. Subí `VERSION` al cambiar archivos; la app toma la versión nueva y se recarga sola. `tests/sw.test.js` avisa si falta un archivo en la caché.
- **Diccionario**: `palabras.js`, `palabras-simples.js`, `frecuencias.js` (para ordenar rimas) y `sinonimos.js` (tesauro de LibreOffice, LGPL 2.1, más una lista rioplatense propia), generados desde `diccionario/` con los scripts `.cjs`. Respetá las licencias de `diccionario/`.
- **Versión vieja**: el generador de palabras al azar quedó en `generador.html`.

Cómo probar: `npm test` (los casos pendientes están marcados como `todo`) y `node verificar-app.cjs` en navegador (necesita playwright). En Windows, `abrir-metrica.bat` levanta un servidor local (`servidor.ps1`, sin instalar nada) y abre la app.

## Plan en dos etapas
1. **Web app para probar (ahora).** Mobile-first, a ancho de iPhone (~390x844), con estilo nativo de iOS (fuente del sistema, títulos grandes, listas agrupadas, tab bar, modo oscuro), instalable desde Safari con "Agregar a inicio" (PWA con manifest). HTML/CSS/JS simple, sin frameworks ni paso de build. Publicada en GitHub Pages.
2. **Cuando esté lista, pasarla 1 a 1 a SwiftUI** (iOS 17+), sin rediseñar. Por eso, en la web: separá la lógica (rimas, diccionario, sesiones) de la interfaz en módulos JS puros con tests, y usá componentes que tengan equivalente directo en SwiftUI.

## Qué sumar
Hecho:
- [x] Rima real en español, consonante y asonante, con las más usadas primero.
- [x] Libreta para escribir la letra, con sugerencias de rimas, rimas pintadas y conteo de sílabas con sinalefa (evita el rechazo de Apple por la regla 4.2).
- [x] Favoritos y letras guardadas (en localStorage).
- [x] Modo freestyle con timer, beats con BPM y sílaba fuerte marcada. Los beats tienen que ser propios o con licencia para uso comercial, anotada en el repo.
- [x] Funciona sin internet, salvo la música de YouTube y SoundCloud.
- [x] Pintar solo la parte que rima, desde la sílaba tónica ("can**ción**", "ra**zón**"), no la palabra entera.

Pendiente, todo entra en el lanzamiento, en este orden:
1. Consonante con fondo lleno y asonante con el mismo color pero más suave.
2. Rimas internas: pintar también las palabras del medio que riman con otras cercanas, por defecto dentro de 4 versos y con la distancia ajustable. Cuidá que no quede todo pintado.
3. Un color fijo para cada terminación (por ejemplo, "-ón" siempre del mismo color en toda la letra), con una paleta amplia, para que no se repitan.
4. Rimas multisilábicas (más de una sílaba que rima, como "camino / destino").

## Internet y nube
- Todo funciona sin internet. Lo único que usa internet es la música de YouTube y SoundCloud: en la web y en la app nativa va con los reproductores oficiales, y sin conexión la app tiene que seguir andando sin errores.
- En la app nativa, las letras se sincronizan por iCloud, guardadas directo en CloudKit y no a través de SwiftData, por si después se hace la web.
- Importar desde Google Keep: compartiendo una nota hacia Métrica, o con el archivo de Google Takeout.
- Exportar: con el menú compartir de iOS.
- Descartado: sincronizar con Keep en las dos direcciones, porque no hay API oficial.
- Sin definir: una web conectada a la app.

## Monetización
Modelo: app gratis que funciona completa, más un pago único "Métrica Extras" (USD 4,99), sin suscripción. Lo decidió Swa (2026-10-21): el pago quita la publicidad y desbloquea los temas de la libreta y los widgets. Las funciones básicas (rimas incluidas) nunca se bloquean.

En la web está todo simulado: `js/logica/compra.js` (con tests) guarda la compra en localStorage y decide qué temas están disponibles y si se muestra publicidad; en SwiftUI pasa a StoreKit 2 (`Product.purchase()` y `Transaction.currentEntitlements`). El paywall es una hoja (`#paywall`, equivale a `.sheet`) que se abre desde Ajustes, desde un tema con candado (en la ruedita de la libreta) o desde el banner de publicidad. La publicidad es un espacio vacío de prueba (sin redes de anuncios) en Rimas. Los widgets solo se muestran como vista previa en el paywall: se hacen de verdad con WidgetKit en la app nativa. En Ajustes, "Volver a la versión gratis" sirve para probar.

Referencia, Rhymer's Block (https://rhymersblock.net/proDetails): su Pro no bloquea las rimas; cobra por comodidad y diseño (sin publicidad, carpetas, todos los temas y fuentes, funciones futuras). En App Store: Pro anual de USD 19,99 a 39,99 o Pro Bundle de USD 9,99/6,99. Adapty (terceros, sin verificar) estima ~10 mil descargas y ~USD 10 mil por mes.

Descartado: red social para compartir letras.

## Reglas
- Trabajá en una rama nueva con pull request; nunca directo en `main` y nunca force-push.
- Cambios chicos y simples, sin abstracciones de más.
- Antes de dar algo por terminado, probalo de verdad (tests y abrir la página) y contá cómo lo probaste.
- Textos de la app en español rioplatense.
