# Pendientes para Swift

La app nativa se porta 1 a 1 en **[sw413sg/metrica-swift](https://github.com/sw413sg/metrica-swift)** (SwiftUI, iOS 17+).

**Regla:** los pedidos nuevos se siguen haciendo primero acá, en la web, como preview. Cada cambio que todavía no esté en Swift se anota en esta lista, en su sección, con el número de versión de la web (ej. «1.4.6: el baúl ordena por fecha»). Cuando se porta, se tacha o se borra de acá en el mismo cambio.

## Hecho en Swift
- Esqueleto: pestañas Letras, Rimas, Freestyle y Ajustes, colores de `estilos.css`, cajas de vidrio (Liquid Glass en iOS 26), datos del diccionario y CI.
- Rimas y Diccionario: buscador con la pista tipeada, consonante/asonante con «?», caja de 4 palabras (azar cada 6 s, búsqueda con `tituloBusqueda`, Sinónimos, Palabras simples), cajones Todas, relacionadas y guardadas, publicidad solo gratis, y el libro con definiciones, similares y sinónimos (metrica-swift #4).
- Lógica pura con tests (122 tests en verde): rimas, sílabas, ortografía, diccionario, secciones, sinónimos, relacionados, definiciones, consignas, letras, papelera, baúl, compra, apariencia, libreta y recientes.
- Baúl de frases (`BaulView`: anotar, filtros, tarjetas en columnas, editar en el lugar, menú de mantener apretado, lupa, pincel con tema, tamaño y separar, «‹ volver» con el nombre de la letra) y la hoja «¿Por dónde empiezo?» (`.porDondeEmpiezo`: pastillas, consigna, Desamor, anterior, refrescar, deslizar, «Al baúl», mandar a la nota, lista de categorías).
- Ajustes (apariencia, Efectos, Velocidad, Grabar, versión, licencias, versión gratis), Papelera, Importar de Google Keep y Exportar todo, con `keep.js` y `exportar.js` (metrica-swift #5).
- Letras y editor: grilla con tarjetas chicas y largas, «+», mover y tacho; editor con renglones, sílabas, rimas pintadas (finales, internas, multisilábicas, colores), palabra tocada, sugerencias (rimas → sinónimos → relacionados), partes, ruedita (tema, opacidad, texto, fuente, funciones, compartir, copiar, borrar), temas por letra con las ilustraciones y cambio claro/oscuro; cofre y «¿Por dónde empiezo?» conectados (metrica-swift #2 y #6).
- Freestyle y Grabar: aro con la palabra y la tónica, barrita, «después» / «y luego», bandeja (play, REC, duración, Ilimitado con Extras), Boombap/Trap/Acapella con los mp3 y Clásico sintetizado (AVAudioEngine), reproductor de beats, cajón del link (YouTube, SoundCloud, playlists, archivos del teléfono) con Recientes, reproductor de música en tres tamaños con marca y bucle que sigue al cambiar de sección, luces por mood, velocidad; Grabar con voiceProcessing, desfase, hoja «Grabaciones» con volúmenes y descarga; nota musical y Grabaciones conectadas en Letras y en el editor. Lógica `freestyle.js`, `musica.js`, `grabaciones.js` y `ambiente.js` con tests (metrica-swift #7).
- Métrica Extras con StoreKit 2 (`metrica.extras`, `Transaction.currentEntitlements`, archivo `.storekit`), paywall como `.sheet` desde los temas con candado y la publicidad, y letras y baúl sincronizados por iCloud con CKSyncEngine directo (metrica-swift #8).
- «Ilimitado» de Freestyle abre el paywall de StoreKit; Share Extension para pasar a Letras una nota compartida desde Keep (`notaCompartida`); avisos push de iCloud (`aps-environment`) (metrica-swift #10).
- Generales: gestos de los bordes (volver atrás y cambiar de sección), tab bar flotante, granulado del fondo, polvo del Boombap 1 detrás de las cajas de Rimas y las tarjetas de Letras cuando suena música (`PolvoMusica`) y el brillo animado que cruza las terminaciones violetas, la palabra tocada y el «+» (metrica-swift #12). `theme-color` no hace falta en nativo: la barra de estado toma el fondo sola.

## Falta portar

### Letras y editor
- Al arrastrar una tarjeta cerca del borde de arriba o de abajo, que la lista se desplace sola.
- Probar en el iPhone que el texto de la libreta quede centrado en su renglón con cada fuente (va con `baselineOffset`).
- 1.5.6: en la ruedita de la libreta, «Renglones», «Sílabas por verso» y «Rimas internas» pasan de «Funciones» a «Texto», entre los pasos (tamaño, separación de renglones y de letras) y la fuente, y las rimas internas pasan del menú a pasos de − y + a la derecha de la fila, como el tamaño: No, 2, 4 y 8 versos (`Stepper`; 1.5.8, no botones segmentados, que se confundían con la fuente; pedidos de Swa). «Renglones» sigue solo en pantallas chicas; en «Funciones» quedan Compartir y Copiar.

- 1.4.7: IA en la libreta (`js/logica/ia.js` e `ia-prompt.js`, pedido de Swa): seleccionar una frase muestra la estrellita arriba del teclado y abre la hoja de «¿Por dónde empiezo?» con el título «Sugerencias» y una frase por página con puntitos abajo (1.5.9, sin «N de 4»): 3 o 4 frases relacionadas con lo seleccionado y con sus propias rimas (1.4.8; sin pastillas ni sílabas; arriba la frase elegida en itálica y entre comillas, sin «En vez de» ni la línea de la rima, y los pedidos que quedan abajo de la caja con una barrita violeta (1.4.9); anterior, «Al baúl», refrescar y el ícono que la pone en la letra; como mucho 10 por día en cada letra; «Lo que cambiaría», hasta 2 y que rimen); tocar dos veces una palabra (el primer toque la deja violeta) muestra la estrellita arriba de ella (1.5.3; no en la barra), que abre una viñeta en ese lugar con flechas para pasar por las sugerencias, y tocarla la cambia en la letra (1.4.9); la estrellita de arriba abre «¿Por dónde empiezo?» con el selector Ideas / Sugerencias, que arranca en Ideas (1.5.0); en Sugerencias la IA lee la letra recién al tocar «Generar sugerencias con IA» y propone hasta 2 cambios (1.5.2), uno por página con puntitos (1.6.0), cada uno con el motivo, el verso «Ahora» (palabra tachada) y «Queda» (la nueva en violeta) y «Cambiar». Cupo de 20 gratis por mes y plan «Métrica IA» simulados (sin decidir). En Swift: el mismo Worker (`worker/`), con el comprobante de StoreKit para el plan y App Attest para el id.

### Freestyle y Grabar
- Descargar: en Swift baja M4A (AAC) en vez de MP3; si hace falta MP3, sumar un codificador.
- Probar en el iPhone: la «Salida» de Ajustes > Grabar con lo que suena en Freestyle, sincronía de la voz con YouTube y SoundCloud, voz con Bluetooth (`.allowBluetoothA2DP`) y que el teclado pause y retome YouTube.

### Ajustes, Papelera, Importar y Exportar
- Sin portar a propósito: la flecha de forzar actualización (en nativo actualiza el App Store) y «Versión anterior».

### Widgets
- 1.5.3: el widget «Baúl de frases» es para anotar rápido, no para leer el baúl (pedido de Swa): no muestra frases guardadas, todo el widget abre el baúl con el teclado listo, sin «Mostrar frases» ni «Solo las sin usar», y sus diseños pasan a Campo (un campo vacío con cursor), Botón (un «+» grande), Libreta (renglones vacíos) y Hoy (cuántas anotaste hoy, `frasesDeHoy`). El rectangular de la pantalla bloqueada dice «Anotá una frase…» en vez de la última frase.
- 1.5.5: Widgets (pedidos de Swa): el baúl no tiene campo con cursor, todos sus diseños son botones (Campo pasa a Cofre: el cofre y «+ Anotá una frase»; Libreta con renglones vacíos); Palabra del día Grande muestra una sola palabra, sin «rima con…»; «Mostrar contenido» de Seguí escribiendo es una pastilla «Contenido» con interruptor chico al lado del nombre del diseño (sin la nota de deslizar); la viñeta «Probá otro tamaño!» va abajo de la esquina con la puntita hacia ella.
- 1.5.7: Widgets (pedidos de Swa): sin «Deslizá para ver otro diseño»; la viñeta «Probá otro tamaño!» es chica, parpadea y va a la derecha de la esquina (en mediano y grande, abajo); Palabra del día sin el diseño Grande (era casi igual a Clásico) y Clásico chico es solo la palabra, grande y centrada, sin «rima con…»; las rimas del widget no repiten la misma palabra con y sin tilde; Racha Mes: las 6 semanas entran enteras (puntos de 10 en chico y 13 en mediano). Palabra del día suma el diseño Hoja (almanaque con el día en una franja violeta). La foto propia es una sola para todos los widgets: elegirla o ajustarla la pone de fondo en todos (`guardarFotoWidgets`).
- 1.5.3: la esquina para cambiar el tamaño en Ajustes > Widgets lleva el efecto de la palabra tocada y, hasta que se la toca una vez, una viñeta tenue «Probá otro tamaño!» (`esquinaUsada` en `metrica.widgets`).
- 1.5.3: Racha suma el diseño «Mes»: un punto por día del mes, de lunes a domingo, con hoy marcado y los días que faltan en contorno (`mesDeRacha`).
- 1.5.3: Seguí escribiendo muestra solo el título y un poco del comienzo (1, 2 o 3 renglones según el tamaño); los diseños pasan a Renglones, Título y Tarjeta (sale «Último verso»), y al lado del cambio de diseño va el switch «Mostrar contenido» (`mostrarContenido`), que apagado deja solo el título.
- 1.5.3: Palabra del día no separa ni marca sílabas (sale el diseño «Sílabas» y la tónica en violeta) y muestra solo rimas consonantes: sale el menú de Contenido consonantes/asonantes (`tipoRima`).
- Los toques de Freestyle y Grabar (widgets, control y Botón de acción) solo abren la pestaña: falta que arranquen la ronda o Acapella con el REC prendido cuando se porte Freestyle.
- Probar en el iPhone, con el App Group firmado, que los widgets se actualicen y que el control abra la acción.

### Métrica Extras y nube
- Probar en el iPhone, con la cuenta paga: compartir una nota desde Keep hacia Métrica (Share Extension) y que los cambios de iCloud lleguen por aviso push.

### Generales
- Ícono de la app y textos de App Store.
