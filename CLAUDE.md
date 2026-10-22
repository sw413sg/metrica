# Métrica: guía para agentes

App: "Métrica" (en la tienda "Métrica: rimas y letras"), para escribir canciones. Repo: github.com/sw413sg/metrica (viene de Genwords).

## Meta
Convertir la web en "Métrica: rimas y letras", una app de iPhone para escribir canciones en español: primero como web app para probar todo, y cuando esté lista, pasarla 1 a 1 a SwiftUI para publicarla en App Store.

## Hoy
Publicada en https://sw413sg.github.io/metrica/ (GitHub Pages desde `main`, sin Jekyll por `.nojekyll`). La interfaz está en `index.html`, `estilos.css` y `js/app.js`; la lógica, en módulos puros en `js/logica/` con tests en `tests/`.

- **Diseño general** (`estilos.css`): colores y tipografía tipo Google Keep, con grises neutros y tab bar flotante. Fondo liso con granulado al 5%, sin degradado (pedido de Swa); la libreta no lleva granulado. La franja de la hora en Safari usa el color promedio del fondo por `theme-color`. Botones, buscador y controles de vidrio de iOS 26, y listas como Ajustes de iOS (referencia: https://sw413sg.github.io/cumpleanos-prototipo/). El violeta (`--destacado`) es solo para lo especial: pestaña elegida, letra nueva, sílaba fuerte y Métrica Extras.
- **Letras**: la última letra va grande arriba y el resto de a dos. Mantener apretada una tarjeta y arrastrarla al tacho la borra, con confirmación. Se guardan solas en localStorage (`js/logica/sesiones.js`).
- **Editor de una letra**:
  - Fondo liso, gris oscuro `#2d2e32` en modo oscuro. Texto a 16px del borde, como Keep, y renglones de borde a borde, como un cuaderno (pedido de Swa). Al bajar, el título se va con el texto y arriba quedan solo los botones.
  - Cuenta las sílabas métricas de cada verso, con sinalefa (`js/logica/silabas.js`).
  - Pinta del mismo color la parte que rima de las palabras finales de cada verso, desde la sílaba tónica ("can**ción**", con `inicioTonica` de `js/logica/silabas.js`; ver "Pendiente"). Lo que va entre paréntesis, como "(nos)", es un agregado: no rima ni cuenta como última palabra. Si el verso entero va entre paréntesis, rima como cualquier otro.
  - Las sugerencias aparecen pegadas al teclado solo al tocar una palabra o un renglón vacío, no mientras se escribe (pedido de Swa). Tocar una palabra muestra rimas para cambiarla, y «Cambiar» alterna a sinónimos (`js/logica/sinonimos.js`).
  - Las palabras en inglés que se usan en letras (face, mail, babe...) riman y cuentan sílabas como suenan (`ANGLICISMOS` en `js/logica/rimas.js`) y no se corrigen.
  - Las palabras mal escritas o sin tilde no se marcan, pero riman, cuentan sílabas y sugieren como la palabra corregida (`js/logica/ortografia.js`).
  - Tocar un renglón vacío marca la parte: [Intro], [Estribillo]... (`js/logica/secciones.js`). La barra de sugerencias se va al cerrar el teclado o al deslizar la letra, y deslizar bastante (más de 150px) también cierra el teclado (pedidos de Swa).
  - La ruedita abre los ajustes: sílabas, tema, tamaño, separación de renglones y de letras (barras de 10 puntos imantados, pedido de Swa), rimas internas, fuente y, abajo de todo, borrar la letra con confirmación (`js/logica/libreta.js`).
  - La nota musical, solo en el editor, es una tarjeta de vidrio pegada abajo (16 px a los costados, 8 px arriba del safe area; se esconde con el teclado). Reproduce un link de YouTube o SoundCloud con play/pausa, ±10 s, una barra para buscar en el tema y cerrar (`js/logica/musica.js`). SoundCloud suena con el Widget API y el iframe fuera de vista (la tarjeta mide 92). YouTube usa el IFrame Player API: la política no deja ocultarlo, taparlo ni dejarlo sonando sin verse, y pide al menos 200×200. El video se ve a ese tamaño adentro de la tarjeta (252); plegarlo o cerrarlo lo pausa y deja la tarjeta en 144, con el botón «Mostrar video para reproducir». Sin reproducción en segundo plano.
- **Rimas** (juntó a la vieja pestaña Palabras; diseño `rimas_A`): buscador de vidrio y selector consonante/asonante. Arriba, 6 tarjetas fijas en grilla de 2×3 que cambian solas cada 6 s (al azar, o las rimas más usadas de la palabra buscada), con la sílaba que rima pintada (`.rima-*`, sin espacio adentro) y las sílabas contadas. El aviso dice «cambian cada 6 s». Abajo, la lista completa estilo Ajustes, con estrella. Sin búsqueda se ven las favoritas. La publicidad va entre las tarjetas y la lista, y solo en la versión gratis (`js/logica/compra.js`). Buscador en `js/logica/rimas.js`.
- **Freestyle** (diseño `freestyle_v2_A`, lógica en `js/logica/freestyle.js`): aro que se llena de violeta con la ronda (en SwiftUI, `Circle().trim`) y, adentro, la palabra a la sílaba tónica en violeta y los segundos que quedan. Debajo, «después» y «y luego». Sin la línea «Compás n de 8» ni el texto de «Tocá play». Bandeja horizontal: play, y la duración (1 min, 1:30, 2 min, y «Ilimitado» con la estrella de Extras; sin Extras no se elige y abre el paywall simulado). Sin link, chips de 2 géneros × 3 beats y un campo para pegar un link de YouTube o SoundCloud. Clásico se sintetiza en el navegador; Batería, Jazz, Grave y Seco son mp3 CC0 en `beats/` (ver `beats/CREDITS.md`), en loop y con la palabra cada 2 compases a su BPM. Con link, un solo play —el de la tarjeta— y el mismo reproductor de la libreta pegado abajo (`js/logica/musica.js`). Los beats propios se sintetizan con Web Audio en `js/beats.js`.
- **Ajustes**: apariencia claro, oscuro o sistema (`js/logica/apariencia.js`), aparte de los temas de cada libreta. Paywall y "Volver a la versión gratis" (ver Monetización).
- **PWA**: `manifest.webmanifest` y `sw.js`. Con cada cambio subí `VERSION` 0.1 (`metrica-0.2` -> `metrica-0.3`, pedido de Swa): es la versión que se ve en Ajustes, y la app la toma y se recarga sola. Al lado, la flecha que gira busca la versión nueva y, si hay, la baja y recarga (no borra la caché: así se trababa en el iPhone). `tests/sw.test.js` avisa si falta un archivo en la caché.
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
- [x] Consonante con fondo lleno y asonante con el mismo color pero más suave (`rimanConsonante` en `js/logica/rimas.js`).
- [x] Rimas internas (`rimasInternas` en `js/logica/rimas.js`): palabras del medio que riman con otra distinta a menos de 4 versos (ajustable en la ruedita: No, 2, 4 u 8). Para no pintar todo: sin átonas ni la misma palabra repetida, y las asonantes (más suaves) solo si las dos tienen más de una sílaba y la otra es la última de un verso ("temas" / "eterna") o ya rima consonante con alguna ("solo" se suma a "todos / modos"). También dos agudas sueltas en el medio si al menos una termina en consonante, y las de una sílaba también ("más" / "guardar", "agrandé" / "sed"; "ya" y "sé" no). Y una aguda que termina en vocal con una llana de esa vocal repetida ("encontré" / "protegerte": é / e-e), del mismo color. Pedidos de Swa. Ni las internas ni las multisilábicas cruzan de una estrofa a otra (renglón vacío).
- [x] Un color fijo para cada terminación en toda la letra, con 12 colores (`.rima-0` a `.rima-11` en `estilos.css`) en el orden en que aparecen, para que no se repitan.
- [x] Rimas multisilábicas (`rimasMultisilabicas` en `js/logica/silabas.js`): si las vocales de las sílabas de antes de la tónica también coinciden con otro verso del grupo, aunque sean de otras palabras, se pinta desde ahí ("se pasa **vo**lando" / "un tune **so**nando"), hasta 3 sílabas de más y solo contra versos a menos de 4 (en letras largas pintaba casi todo).

Pendiente: nada de la lista del lanzamiento.

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
