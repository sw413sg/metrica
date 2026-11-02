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

## Falta portar

### Rimas y Diccionario
- Polvo del Boombap 1 detrás de las cajas si suena música (va con los efectos de partículas, en Generales).
- Brillo animado que cruza las terminaciones violetas (en Swift el degradé va quieto).

### Letras y editor
- Brillo animado que cruza la palabra tocada y el «+» (en Swift el degradé va quieto).
- Al arrastrar una tarjeta cerca del borde de arriba o de abajo, que la lista se desplace sola.
- Probar en el iPhone que el texto de la libreta quede centrado en su renglón con cada fuente (va con `baselineOffset`).

- 1.4.7: IA en la libreta (`js/logica/ia.js` e `ia-prompt.js`, pedido de Swa): seleccionar una frase muestra la estrellita arriba del teclado y abre la hoja de «¿Por dónde empiezo?» con «Alternativas de frase»: 3 o 4 frases relacionadas con lo seleccionado y con sus propias rimas (1.4.8; sin pastillas ni sílabas, «En vez de» arriba; anterior, «Al baúl», refrescar y el ícono que la pone en la letra; como mucho 10 por día en cada letra; «Lo que cambiaría», hasta 4 y que rimen); tocar una palabra suma la estrellita y abre una viñeta arriba de ella con flechas para cambiarla; la estrellita de arriba abre «¿Por dónde empiezo?» con el selector Sugerencias / Ideas (la IA lee la letra y propone cambios, con la palabra a corregir subrayada y la nueva al lado). Cupo de 20 gratis por mes y plan «Métrica IA» simulados (sin decidir). En Swift: el mismo Worker (`worker/`), con el comprobante de StoreKit para el plan y App Attest para el id.

### Freestyle y Grabar
- «Ilimitado» sin Extras: que abra el paywall de StoreKit (hoy muestra un aviso).
- Descargar: en Swift baja M4A (AAC) en vez de MP3; si hace falta MP3, sumar un codificador.
- Probar en el iPhone: la «Salida» de Ajustes > Grabar con lo que suena en Freestyle, sincronía de la voz con YouTube y SoundCloud, voz con Bluetooth (`.allowBluetoothA2DP`) y que el teclado pause y retome YouTube.

### Ajustes, Papelera, Importar y Exportar
- Sin portar a propósito: la flecha de forzar actualización (en nativo actualiza el App Store) y «Versión anterior».

### Widgets
- Los toques de Freestyle y Grabar (widgets, control y Botón de acción) solo abren la pestaña: falta que arranquen la ronda o Acapella con el REC prendido cuando se porte Freestyle.
- Probar en el iPhone, con el App Group firmado, que los widgets se actualicen y que el control abra la acción.

### Métrica Extras y nube
- Share Extension para recibir notas de Keep.
- iCloud: avisos push (CKSyncEngine con `aps-environment`) para que los cambios de otro dispositivo lleguen sin volver a abrir la app; hoy llegan al abrirla o al volver a ella.

### Generales
- Gestos de los bordes (volver atrás y cambiar de sección), tab bar flotante, granulado del fondo, `theme-color`.
- Efectos de partículas (`efectos.js`) en Rimas y Letras (en Freestyle ya están, `LucesFreestyle`).
- Ícono de la app y textos de App Store.
