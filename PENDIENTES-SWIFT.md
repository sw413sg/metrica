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
- Métrica Extras con StoreKit 2 (`metrica.extras`, `Transaction.currentEntitlements`, archivo `.storekit`), paywall como `.sheet` desde los temas con candado y la publicidad, y letras y baúl sincronizados por iCloud con CKSyncEngine directo (metrica-swift #8).

## Falta portar

### Rimas y Diccionario
- Polvo del Boombap 1 detrás de las cajas si suena música (va con los efectos de partículas, en Generales).
- Brillo animado que cruza las terminaciones violetas (en Swift el degradé va quieto).

### Letras y editor
- Nota musical y grabaciones: los botones de Letras y del editor ya están, falta conectarlos al cajón de música y a la hoja «Grabaciones» (hilo de Freestyle).
- Brillo animado que cruza la palabra tocada y el «+» (en Swift el degradé va quieto).
- Al arrastrar una tarjeta cerca del borde de arriba o de abajo, que la lista se desplace sola.
- Probar en el iPhone que el texto de la libreta quede centrado en su renglón con cada fuente (va con `baselineOffset`).

### Freestyle y Grabar
- Aro con la palabra y la sílaba tónica, barrita, «después» / «y luego», bandeja (play, REC, duración, Ilimitado con Extras), beats Boombap/Trap/Acapella, reproductor chico, cajón del link (YouTube, SoundCloud, playlists, archivos del teléfono), Recientes, luces por mood (`ambiente.js`), velocidad de cambio de palabras.
- Reproductor de música en tres tamaños, marca y bucle, sigue al cambiar de sección.
- Grabar: REC, voz con cancelación de eco (AVAudioEngine + voiceProcessing), desfase automático, hoja «Grabaciones», volúmenes, descargar MP3, micrófono y salida (AVAudioSession `.allowBluetoothA2DP`).
- Lógica sin portar: `freestyle.js`, `musica.js`, `grabaciones.js`, `ambiente.js`, `beats.js`.

### Ajustes, Papelera, Importar y Exportar
- La pantalla de Ajustes > Widgets queda para el port de Widgets.
- Sin portar a propósito: la flecha de forzar actualización (en nativo actualiza el App Store) y «Versión anterior».

### Widgets
- WidgetKit: Baúl de frases, Palabra del día, Seguí escribiendo, Racha, Accesos rápidos; pantalla bloqueada; ControlWidget y Botón de acción; App Group compartido; foto con PhotosPicker.
- Pantalla de Ajustes > Widgets con la muestra.
- Lógica sin portar: `widgets.js`.

### Métrica Extras y nube
- Share Extension para recibir notas de Keep.
- iCloud: avisos push (CKSyncEngine con `aps-environment`) para que los cambios de otro dispositivo lleguen sin volver a abrir la app; hoy llegan al abrirla o al volver a ella.

### Generales
- Gestos de los bordes (volver atrás y cambiar de sección), tab bar flotante, granulado del fondo, `theme-color`.
- Efectos de partículas (`efectos.js`) en Freestyle, Rimas y Letras.
- Ícono de la app y textos de App Store.
