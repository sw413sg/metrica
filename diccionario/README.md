# Diccionario ampliado

`../palabras.js` contiene 58.086 entradas únicas: 10.910 del archivo original y 47.176 nuevas. Se quitó un punto y coma suelto y una entrada duplicada.

Fuente: RLA-ES, coordinado inicialmente por Santiago Bosio, versión 2.8, distribuido por wooorm/dictionaries.
- https://github.com/wooorm/dictionaries/tree/main/dictionaries/es
- https://github.com/sbosio/rla-es
- Descarga: 14 de septiembre de 2026.

Se incluyen las copias descargadas `es.dic`, `es.aff` y el aviso original `LICENCIA-RLA-ES.txt`. El diccionario fuente ofrece GPL 3 o posterior, LGPL 3 o posterior, o MPL 1.1 o posterior. La ampliación del diccionario se ofrece bajo MPL 2.0 (opción posterior a MPL 1.1); consultar `MPL-2.0.txt`. Esto corresponde a los datos incorporados, no cambia la licencia de la aplicación ni de las entradas preexistentes.

Transformación: quitar marcas Hunspell, normalizar Unicode NFC, incorporar solo nuevas entradas en minúsculas formadas por letras españolas, y eliminar duplicados exactos. No se expanden afijos. Los nombres propios y las expresiones preexistentes se conservan. La fuente puede incluir regionalismos, tecnicismos y vocabulario poco frecuente.

Para repetir la fusión, ejecutar `node ampliar-diccionario.cjs` desde esta carpeta o su carpeta superior indicando la ruta del script. Es idempotente y usa los archivos locales: la app no necesita conexión para cargar palabras. Los filtros y la interfaz no se modificaron.

## Formas conjugadas y plurales

Después de la fusión, `node agregar-formas.cjs` expande los sufijos de `es.aff` (verbos conjugados, pronombres pegados, plurales, femeninos, derivados) y suma a `../palabras.js` solo las formas que aparecen al menos 2 veces en `frecuencias-es.txt`: 138.828 formas nuevas, 196.914 palabras en total. Los prefijos no se expanden. Es idempotente; la misma licencia MPL 2.0 de la ampliación aplica a estas formas. `palabras-simples.js` no se regeneró.

## Modo Palabras simples

Selecciona las 20.000 palabras del diccionario con mayor frecuencia registrada en FrequencyWords (Hermit Dave), corpus OpenSubtitles 2018 en español. Es una aproximación basada en subtítulos, no una medida de dificultad ni una clasificación universal del español.

Fuente: https://github.com/hermitdave/FrequencyWords/blob/master/content/2018/es/es_full.txt
Licencia de los datos: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
Aviso original: `FrequencyWords-README.md`. Descargado el 14 de septiembre de 2026.
Transformación: intersección exacta con el diccionario local, solo letras minúsculas españolas, Unicode NFC, deduplicación y selección de las 20.000 coincidencias de mayor frecuencia (entre 39.840 coincidencias). `palabras-simples.js` se distribuye bajo CC BY-SA 4.0 con atribución a Hermit Dave / FrequencyWords y OpenSubtitles 2018.

Regenerar con `node generar-palabras-simples.cjs`. El botón empieza desactivado, conserva el filtro por terminación y la pausa manual. No requiere conexión.

## Frecuencias para ordenar rimas

`../frecuencias.js` tiene "palabra cantidad" para las 178.678 palabras de `palabras.js` que aparecen en `frecuencias-es.txt` (FrequencyWords, Hermit Dave, OpenSubtitles 2018). La app lo usa para mostrar primero las rimas más usadas; las palabras sin frecuencia van al final en orden alfabético. Se distribuye bajo CC BY-SA 4.0 con la misma atribución que `palabras-simples.js`.

Transformación: intersección exacta con el diccionario local, Unicode NFC, se conserva la primera aparición de cada palabra, ordenado de mayor a menor. Regenerar con `node generar-frecuencias.cjs` (hace falta cada vez que cambie `palabras.js`). No requiere conexión.

## Sinónimos

`../sinonimos.js` tiene los sinónimos que muestra el editor al tocar «Cambiar» sobre una palabra: 21.340 palabras, un grupo por significado. Sale de dos fuentes:

- Tesauro en español de LibreOffice: OpenThesaurus-es, de Marcelo Garrone, snapshot del 2012-01-11 (`th_es_v2.dat`, aviso original en `README_th_es.txt`). Licencia LGPL 2.1, texto en `LGPL-2.1.txt`. Descargado el 21 de octubre de 2026 de https://github.com/LibreOffice/dictionaries/tree/master/es. `sinonimos.js` es una conversión de ese archivo y se distribuye bajo la misma LGPL 2.1: cualquiera puede regenerarlo o reemplazarlo con el script.
- `sinonimos-rioplatenses.txt`: lista propia de Métrica (laburo, guita, pibe...), escrita para la app. Cada renglón es un grupo; sus palabras se sugieren entre sí y van antes que las del tesauro.

Transformación: pasar de ISO-8859-1 a UTF-8 (NFC), quedarse solo con palabras sueltas (sin expresiones de varias palabras), sacar repetidos y la palabra misma, y ordenar cada grupo del tesauro de más usada a menos usada con `frecuencias.js`. Además, `textoFormasSinonimos` dice de qué palabra base sale cada forma ("lindas" → "lindo", "quería" → "querer"), con los sufijos de `es.aff` y solo para formas de `palabras.js`: 107.716 formas de 12.851 bases.

Regenerar con `node generar-sinonimos.cjs` (hace falta cada vez que cambien `palabras.js`, `frecuencias.js` o la lista rioplatense). No requiere conexión.

## Palabras relacionadas

`../relacionados.js` tiene las palabras relacionadas que muestra el editor al tocar «Cambiar» dos veces («Relacionados»): 19.151 palabras con hasta 20 relacionadas cada una («noche»: oscuridad, luna, madrugada, medianoche, crepúsculo...). Sale de dos fuentes:

- ConceptNet Numberbatch 19.08, de Luminoso Technologies y el proyecto ConceptNet (Robyn Speer y otros): vectores de palabras multilingües construidos con ConceptNet, Wiktionary, OpenSubtitles y otras fuentes. Licencia CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/. Descarga: https://conceptnet.s3.amazonaws.com/downloads/2019/numberbatch/numberbatch-19.08.txt.gz (3 GB, no se guarda en el repo), el 24 de octubre de 2026. Proyecto: https://github.com/commonsense/conceptnet-numberbatch. `relacionados.js` es una obra derivada y se distribuye bajo CC BY-SA 4.0 con esta atribución.
- `relacionados-propios.txt`: lista propia de Métrica con temas comunes en las letras (noche, amor, calle, barrio...). Cada renglón es "palabra: relacionadas" y van antes que las de Numberbatch.

Transformación: de los vectores en español (`/c/es/`) se toman los de las 60.000 palabras más usadas de `frecuencias.js`. Para cada una de las 20.000 más usadas se buscan las más parecidas por coseno (al menos 0,3), solo entre palabras base del diccionario (entradas de `es.dic` con banderas, sin las formas de `textoFormasSinonimos`), y se descartan las de la misma familia ("noches", "lunar": mismo comienzo) y las repetidas. Las búsquedas en plural usan las del singular.

Regenerar con `node generar-relacionados.cjs ruta/a/numberbatch-19.08.txt.gz` (tarda unos 3 minutos; hace falta si cambian `frecuencias.js`, `sinonimos.js` o la lista propia). La app no necesita conexión.

## Definiciones (modo Diccionario de Rimas)

`../definiciones.txt` tiene lo que muestra el libro de Rimas: 108.891 palabras con sus acepciones por categoría (sustantivo, verbo...) y 105.462 formas ("perros" → perro, "fuimos" → ir y ser). Sale del Wikcionario en español:

- Definiciones: autores del Wikcionario en español, https://es.wiktionary.org, bajo CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.es).
- Limpieza del Wikcionario: reader.dict (Mickaël Schoentgen y colaboradores), https://www.reader-dict.com.
- Archivo usado: `diccionario-es.dic` de https://github.com/jcordon5/diccionario-es-pocketbook (la última versión publicada, bajada el 1 de noviembre de 2026; 18 MB, no se guarda en el repo), que empaqueta el de reader.dict para PocketBook, con la misma licencia CC BY-SA 4.0.

`definiciones.txt` es una obra derivada y se distribuye bajo CC BY-SA 4.0 con esta atribución; la app muestra «Definiciones del Wikcionario (CC BY-SA 4.0)» debajo de cada una.

Transformación: de cada entrada se dejan la categoría y las acepciones numeradas (hasta 12 por categoría, cortadas a 400 caracteres), con su materia («Anatomía», «Música») aparte; se sacan la pronunciación, los sinónimos, los ejemplos y la etimología. De las formas sin definición propia quedan solo las que están en `palabras.js`. Unicode NFC, en minúscula.

Regenerar con `node generar-definiciones.cjs ruta/a/diccionario-es.dic` (unos 15 s). Si cambia `definiciones.txt`, subí `DICCIONARIO` en `sw.js` para que el teléfono baje el nuevo. La app no necesita conexión: el archivo queda en su propia caché.
