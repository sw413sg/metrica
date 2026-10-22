# Beats de Métrica

Los beats del modo freestyle no usan grabaciones ni samples de terceros.

| Beat | Origen | Licencia |
| --- | --- | --- |
| Boom bap | Patrón propio (`js/logica/freestyle.js`), sonidos sintetizados en el navegador (`js/beats.js`) | Propio de Métrica, se puede usar en la app comercial |
| Trap | Igual que Boom bap | Propio de Métrica |
| Metrónomo | Igual que Boom bap | Propio de Métrica |

El bombo es un oscilador senoidal con caída de tono, y la caja y el hi-hat son ruido blanco filtrado, generados con Web Audio en el momento. En SwiftUI se puede hacer lo mismo con AVAudioEngine.

Si se suma un beat grabado o de otra persona, agregá una fila con su autor, la fuente y una licencia que permita usarlo en una app comercial.

En Freestyle, sin link, se elige entre 2 géneros × 3 beats (`CATALOGO_BEATS` en `js/logica/freestyle.js`). Todavía no hay archivos: es un placeholder para definir con sadboy/Proshe. «Boom bap · Clásico» y «Trap · Clásico» usan los patrones sintetizados de arriba. Sucio y Jazz no suenan. No se bajan beats de terceros.
