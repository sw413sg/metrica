# Pendientes para Swift

La app nativa se porta 1 a 1 en **[sw413sg/metrica-swift](https://github.com/sw413sg/metrica-swift)** (SwiftUI, iOS 17+).

**Regla:** los pedidos nuevos se siguen haciendo primero acá, en la web, como preview. Cada cambio que todavía no esté en Swift se anota en esta lista, en su sección, con el número de versión de la web (ej. «1.4.6: el baúl ordena por fecha»). Cuando se porta, se tacha o se borra de acá en el mismo cambio.

## Hecho en Swift
- Esqueleto: pestañas Letras, Rimas, Freestyle y Ajustes, colores de `estilos.css`, cajas de vidrio (Liquid Glass en iOS 26), datos del diccionario y CI.
- Lógica pura con tests (122 tests en verde): rimas, sílabas, ortografía, diccionario, secciones, sinónimos, relacionados, definiciones, consignas, letras, papelera, baúl, compra, apariencia, libreta y recientes.
- Baúl de frases (`BaulView`: anotar, filtros, tarjetas en columnas, editar en el lugar, menú de mantener apretado, lupa, pincel con tema, tamaño y separar, «‹ volver» con el nombre de la letra) y la hoja «¿Por dónde empiezo?» (`.porDondeEmpiezo`: pastillas, consigna, Desamor, anterior, refrescar, deslizar, «Al baúl», mandar a la nota, lista de categorías).

## Falta portar

### Rimas y Diccionario
- Pantalla de Rimas: buscador con el texto tipeado, consonante/asonante con «?», caja «Terminaciones al azar» (2×2, cada 6 s, barrita), resultados con título armado (`tituloBusqueda`), «Sinónimos», «Palabras simples», cajones «Todas», «Palabras relacionadas» y «Palabras guardadas», polvo del Boombap 1 si suena música, publicidad (solo gratis).
- Diccionario: libro que cambia el modo, definición con categorías y acepciones, palabra corregida entre paréntesis, «Palabras similares» y «Sinónimos».

### Letras y editor
- Grilla de tarjetas (chicas y largas, `lugaresEnGrilla`), tarjeta «+», mantener apretada para mover o tirar al tacho.
- Editor: renglones, sílabas por verso, rimas pintadas (consonante/asonante, internas, multisilábicas, colores por terminación), palabra tocada con brillo violeta, barra de sugerencias (rimas → sinónimos → relacionados), partes ([Intro]...), ruedita de ajustes (tema, opacidad, texto, fuente, funciones, compartir, copiar, borrar).
- Temas de cada letra (`TEMAS`, ilustraciones de `fondos/*.svg`) y cambio de modo claro/oscuro.
- Nota musical: cajón de música en el editor.
- Conectar el cofre de Letras y del editor a `BaulView(volverA:)`, y la estrella y el botón «✦ ¿Por dónde empiezo?» de la letra vacía a `.porDondeEmpiezo` (las dos pantallas ya están; falta conectarlas desde Letras y el editor).

### Freestyle y Grabar
- Aro con la palabra y la sílaba tónica, barrita, «después» / «y luego», bandeja (play, REC, duración, Ilimitado con Extras), beats Boombap/Trap/Acapella, reproductor chico, cajón del link (YouTube, SoundCloud, playlists, archivos del teléfono), Recientes, luces por mood (`ambiente.js`), velocidad de cambio de palabras.
- Reproductor de música en tres tamaños, marca y bucle, sigue al cambiar de sección.
- Grabar: REC, voz con cancelación de eco (AVAudioEngine + voiceProcessing), desfase automático, hoja «Grabaciones», volúmenes, descargar MP3, micrófono y salida (AVAudioSession `.allowBluetoothA2DP`).
- Lógica sin portar: `freestyle.js`, `musica.js`, `grabaciones.js`, `ambiente.js`, `beats.js`.

### Ajustes, Papelera, Importar y Exportar
- Ajustes: apariencia (Sistema/Claro/Oscuro), Efectos, Velocidad, Grabar (micrófono y salida), versión, «Volver a la versión gratis», Acerca de y licencias.
- Papelera: cuadrados con días que quedan, ver en grande, restaurar, borrar definitivamente, borrar todo.
- Importar de Google Keep (`.fileImporter`, `keep.js`) y Exportar todo en .zip (menú compartir, `exportar.js`).
- Lógica sin portar: `keep.js`, `exportar.js`.

### Widgets
- WidgetKit: Baúl de frases, Palabra del día, Seguí escribiendo, Racha, Accesos rápidos; pantalla bloqueada; ControlWidget y Botón de acción; App Group compartido; foto con PhotosPicker.
- Pantalla de Ajustes > Widgets con la muestra.
- Lógica sin portar: `widgets.js`.

### Métrica Extras y nube
- StoreKit 2 (`Product.purchase()`, `Transaction.currentEntitlements`) en lugar de la compra simulada; paywall como `.sheet`.
- Sincronización de letras por iCloud con CloudKit directo (no SwiftData).
- Share Extension para recibir notas de Keep.

### Generales
- Gestos de los bordes (volver atrás y cambiar de sección), tab bar flotante, granulado del fondo, `theme-color`.
- Efectos de partículas (`efectos.js`) en Freestyle, Rimas y Letras.
- Ícono de la app y textos de App Store.
