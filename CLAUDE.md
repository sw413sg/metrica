# Métrica: guía para agentes

App: "Métrica" (en la tienda "Métrica: rimas y letras"), para escribir canciones. Repo: github.com/sw413sg/metrica (viene de Genwords).

## Meta
Convertir la web en "Métrica: rimas y letras", una app de iPhone para escribir canciones en español: primero como web app para probar todo, y cuando esté lista, pasarla 1 a 1 a SwiftUI para publicarla en App Store.

## Hoy
Esqueleto de la web app en `index.html` (pestañas Letras, Rimas, Palabras, Freestyle y Ajustes; estilos en `estilos.css` con colores y tipografía tipo Google Keep (grises neutros, tab bar flotante); el violeta (`--destacado`) es solo para lo especial: pestaña elegida, letra nueva, sílaba fuerte y Métrica Extras; interfaz en `js/app.js`). La lógica va en módulos puros en `js/logica/` con tests en `tests/` (`npm test`; los casos pendientes están marcados como `todo`). Prueba en navegador: `node verificar-app.cjs` (necesita playwright). En Windows, `abrir-metrica.bat` levanta un servidor local (`servidor.ps1`, sin instalar nada) y abre la app. Publicada en https://sw413sg.github.io/metrica/ (GitHub Pages desde `main`, sin Jekyll por `.nojekyll`). PWA: `manifest.webmanifest` y `sw.js` (subí `VERSION` al cambiar archivos; la app toma la versión nueva y se recarga sola; `tests/sw.test.js` avisa si falta un archivo en la caché). La versión anterior (generador de palabras al azar) quedó en `generador.html`. El buscador de rimas (consonante y asonante, `js/logica/rimas.js`) ya anda en la pestaña Rimas y en las sugerencias del editor (tocar una la agrega). El editor (fondo liso, renglones opcionales y suaves, sugerencias pegadas al teclado; tocar cualquier palabra muestra rimas para cambiarla; las palabras mal escritas o sin tilde no se marcan (pedido de Swa) pero riman, cuentan sílabas y sugieren como la palabra corregida, `js/logica/ortografia.js`; la ruedita abre los ajustes: sílabas, tema, tamaño, separación y fuente, `js/logica/libreta.js`; en Letras, mantener apretada una tarjeta y arrastrarla al tacho la borra; tocar un renglón vacío marca la parte: [Intro], [Estribillo]..., `js/logica/secciones.js`) cuenta las sílabas métricas de cada verso (`js/logica/silabas.js`, con sinalefa) y pinta del mismo color las palabras finales que riman. Las letras se guardan solas en localStorage y las palabras favoritas (estrella en Rimas, tocar la tarjeta en Palabras) se ven en Rimas sin búsqueda (`js/logica/sesiones.js`). Pago único simulado (paywall, temas de libreta y publicidad de prueba, ver Monetización). Freestyle: palabra nueva cada N compases con la sílaba tónica marcada, beat con BPM y timer de ronda (`js/logica/freestyle.js`); los beats se sintetizan con Web Audio en `js/beats.js`, sin archivos de audio (licencias en `beats/LICENCIA.md`). Diccionario propio: `palabras.js`, `palabras-simples.js` y `frecuencias.js` (para ordenar rimas), generados desde `diccionario/` con los scripts `.cjs` (ampliar-diccionario, agregar-formas, generar-palabras-simples, generar-frecuencias, verificar-diccionario, verificar-navegador). Respetá las licencias de `diccionario/`.

## Plan en dos etapas
1. **Web app para probar (ahora).** Mobile-first, a ancho de iPhone (~390x844), con estilo nativo de iOS (fuente del sistema, títulos grandes, listas agrupadas, tab bar, modo oscuro), instalable desde Safari con "Agregar a inicio" (PWA con manifest). HTML/CSS/JS simple, sin frameworks ni paso de build. Publicada en GitHub Pages.
2. **Cuando esté lista, pasarla 1 a 1 a SwiftUI** (iOS 17+), sin rediseñar. Por eso, en la web: separá la lógica (rimas, diccionario, sesiones) de la interfaz en módulos JS puros con tests, y usá componentes que tengan equivalente directo en SwiftUI.

## Qué sumar, en este orden
1. Rima real en español: consonante (igual desde la última vocal tónica) y asonante (solo vocales desde la tónica). Tené en cuenta acentos, diptongos/hiatos y palabras agudas, graves y esdrújulas. Con tests de casos difíciles. Mostrá primero las rimas más usadas (usá `diccionario/frecuencias-es.txt`).
2. Bloc para escribir la letra al lado de las palabras (que no sea solo un generador, para evitar rechazo de Apple por la regla 4.2), con:
   - sugerencias de rimas mientras se escribe,
   - las palabras que riman pintadas del mismo color,
   - el conteo de sílabas de cada verso (métricas: sinalefa incluida).
3. Favoritos y sesiones guardadas (por ahora en localStorage).
4. Modo freestyle: palabras con timer tipo batalla, beats con control de tempo (BPM) y la sílaba que cae en el tiempo fuerte del compás marcada. Los beats tienen que ser propios o con licencia que permita usarlos en una app comercial; anotá la licencia de cada uno en el repo.
5. Todo tiene que funcionar sin internet (en la web, con service worker y el diccionario local; nada de APIs externas).

## Monetización
Modelo: app gratis que funciona completa, más un pago único "Métrica Extras" (USD 4,99), sin suscripción. Lo decidió Swa (2026-10-21): el pago quita la publicidad y desbloquea los temas de la libreta y los widgets. Las funciones básicas (rimas incluidas) nunca se bloquean.

En la web está todo simulado: `js/logica/compra.js` (con tests) guarda la compra en localStorage y decide qué temas están disponibles y si se muestra publicidad; en SwiftUI pasa a StoreKit 2 (`Product.purchase()` y `Transaction.currentEntitlements`). El paywall es una hoja (`#paywall`, equivale a `.sheet`) que se abre desde Ajustes, desde un tema con candado (en la ruedita de la libreta) o desde el banner de publicidad. La publicidad es un espacio vacío de prueba (sin redes de anuncios) en Rimas y Palabras. Los widgets solo se muestran como vista previa en el paywall: se hacen de verdad con WidgetKit en la app nativa. En Ajustes, "Volver a la versión gratis" sirve para probar.

Referencia, Rhymer's Block (https://rhymersblock.net/proDetails): su Pro no bloquea las rimas; cobra por comodidad y diseño (sin publicidad, carpetas, todos los temas y fuentes, funciones futuras). En App Store: Pro anual de USD 19,99 a 39,99 o Pro Bundle de USD 9,99/6,99. Adapty (terceros, sin verificar) estima ~10 mil descargas y ~USD 10 mil por mes.

Descartado: red social para compartir letras.

## Reglas
- Trabajá en una rama nueva con pull request; nunca directo en `main` y nunca force-push.
- Cambios chicos y simples, sin abstracciones de más.
- Antes de dar algo por terminado, probalo de verdad (tests y abrir la página) y contá cómo lo probaste.
- Textos de la app en español rioplatense.
