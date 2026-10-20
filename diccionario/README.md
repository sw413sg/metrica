# Diccionario ampliado

`../palabras.js` contiene 58.086 entradas únicas: 10.910 del archivo original y 47.176 nuevas. Se quitó un punto y coma suelto y una entrada duplicada.

Fuente: RLA-ES, coordinado inicialmente por Santiago Bosio, versión 2.8, distribuido por wooorm/dictionaries.
- https://github.com/wooorm/dictionaries/tree/main/dictionaries/es
- https://github.com/sbosio/rla-es
- Descarga: 14 de septiembre de 2026.

Se incluyen las copias descargadas `es.dic`, `es.aff` y el aviso original `LICENCIA-RLA-ES.txt`. El diccionario fuente ofrece GPL 3 o posterior, LGPL 3 o posterior, o MPL 1.1 o posterior. La ampliación del diccionario se ofrece bajo MPL 2.0 (opción posterior a MPL 1.1); consultar `MPL-2.0.txt`. Esto corresponde a los datos incorporados, no cambia la licencia de la aplicación ni de las entradas preexistentes.

Transformación: quitar marcas Hunspell, normalizar Unicode NFC, incorporar solo nuevas entradas en minúsculas formadas por letras españolas, y eliminar duplicados exactos. No se expanden afijos. Los nombres propios y las expresiones preexistentes se conservan. La fuente puede incluir regionalismos, tecnicismos y vocabulario poco frecuente.

Para repetir la fusión, ejecutar `node ampliar-diccionario.cjs` desde esta carpeta o su carpeta superior indicando la ruta del script. Es idempotente y usa los archivos locales: la app no necesita conexión para cargar palabras. Los filtros y la interfaz no se modificaron.

## Modo Palabras simples

Selecciona las 20.000 palabras del diccionario con mayor frecuencia registrada en FrequencyWords (Hermit Dave), corpus OpenSubtitles 2018 en español. Es una aproximación basada en subtítulos, no una medida de dificultad ni una clasificación universal del español.

Fuente: https://github.com/hermitdave/FrequencyWords/blob/master/content/2018/es/es_full.txt
Licencia de los datos: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
Aviso original: `FrequencyWords-README.md`. Descargado el 14 de septiembre de 2026.
Transformación: intersección exacta con el diccionario local, solo letras minúsculas españolas, Unicode NFC, deduplicación y selección de las 20.000 coincidencias de mayor frecuencia (entre 39.840 coincidencias). `palabras-simples.js` se distribuye bajo CC BY-SA 4.0 con atribución a Hermit Dave / FrequencyWords y OpenSubtitles 2018.

Regenerar con `node generar-palabras-simples.cjs`. El botón empieza desactivado, conserva el filtro por terminación y la pausa manual. No requiere conexión.

## Frecuencias para ordenar rimas

`../frecuencias.js` tiene "palabra cantidad" para las 39.850 palabras de `palabras.js` que aparecen en `frecuencias-es.txt` (FrequencyWords, Hermit Dave, OpenSubtitles 2018). La app lo usa para mostrar primero las rimas más usadas; las palabras sin frecuencia van al final en orden alfabético. Se distribuye bajo CC BY-SA 4.0 con la misma atribución que `palabras-simples.js`.

Transformación: intersección exacta con el diccionario local, Unicode NFC, se conserva la primera aparición de cada palabra, ordenado de mayor a menor. Regenerar con `node generar-frecuencias.cjs` (hace falta cada vez que cambie `palabras.js`). No requiere conexión.
