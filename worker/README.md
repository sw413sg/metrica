# Worker de Métrica

Servidor chico en Cloudflare Workers. Cada función va en su ruta, así se pueden sumar otras (por ejemplo, conectar la web con iCloud) sin tocar las que ya andan:

- `GET /salud`: dice si está desplegado, con qué modelo y si la clave y el KV están cargados (`{ ok, modelo, clave, kv }`). No gasta nada.
- `GET /probar`: un pedido mínimo a OpenAI; dice `{ ok: true }` o el error de OpenAI tal cual (sin la clave). Tope de 30 por día. Los errores también quedan en Observability.
- `POST /ia`: la IA de la libreta: elegís una frase y propone 3 o 4 alternativas relacionadas, con sus mismas rimas internas y finales (además, cambia palabras sueltas y revisa la letra entera). Desplegado en `https://metrica.emas1397.workers.dev` (la web usa `/ia` desde la 1.6.6).

## Cómo anda
1. La app arma el pedido con su propio motor (`fraseElegida` en `js/logica/ia.js`): el verso elegido, el anterior, la estrofa, sílabas, rima consonante y asonante de la última palabra y las rimas internas.
2. Lo manda por POST a `/ia`, con un id anónimo del teléfono en `X-Metrica-Id`.
3. El Worker revisa el origen (la web manda su `Origin`, que tiene que estar en `ORIGENES`; la app nativa no manda ninguno y pasa), que el pedido tenga la forma de siempre (`pedidoValido`), que la persona tenga cupo este mes (KV `USO`) y que no se haya pasado el techo del día. Arma el mensaje con `promptDeSugerencias` (`js/logica/ia-prompt.js`, el mismo archivo que usa la app y los tests) y llama a OpenAI con la clave guardada como secret. Así no sirve para pedirle cualquier otra cosa al modelo.
4. Devuelve `{ sugerencias: [...], quedan }`. La app las valida y ordena con su motor (`validarSugerencias`): primero las que riman consonante, después asonante, después las de sílabas más parecidas.

Respuestas de error: 404 ruta que no existe, 429 sin cupo, 403 origen no permitido, 400 pedido raro, 502 falló el modelo, 503 se llegó al techo del día. Solo cuenta el uso si salió bien.

## Costos (estimado del 2026-11-02)
El modelo piensa antes de contestar y eso se cobra como salida: `ESFUERZO = "low"` en `wrangler.toml` (`reasoning_effort` de OpenAI) le pide que piense poco. Si alguna vez OpenAI no lo acepta para el modelo, el Worker da 502: dejarlo vacío.

GPT-6.1 Terra: USD 1 por millón de tokens de entrada y USD 5 de salida. Un pedido son unos 1.000 de entrada y 500 de salida: **USD 0,0035**. Con la cuota de 500 por mes para todos (la letra entera gasta 3), cada persona que la usa toda cuesta hasta USD 1,75 por mes. Con «Métrica IA» (tentativo, USD 2,99 por mes y tope de 500), el peor caso son USD 1,75 por mes. El plan de Workers gratis alcanza para empezar (100 mil pedidos por día).

## Desplegar
Se despliega solo desde GitHub con Workers Builds, sin instalar nada: cada vez que cambia `main`, Cloudflare corre `npx wrangler deploy` en la carpeta `worker` (el `import` de `../../js/logica/ia-prompt.js` anda porque baja el repo entero).

Una sola vez, en el panel de Cloudflare:
1. Workers & Pages › Create › Import a repository › `sw413sg/metrica`. Nombre `metrica`, carpeta (root directory) `worker`, el resto como viene.
2. El KV `USO` ya está creado («metrica-uso») y su `id` va en `wrangler.toml` (sin id, wrangler lo creaba en el primer despliegue pero en el segundo fallaba con «already exists»).
3. En el Worker › Settings › Variables and Secrets › Add: tipo **Secret**, nombre `OPENAI_API_KEY`, la clave de OpenAI. No va al repo ni al chat. Los secrets no se pisan con cada despliegue; las variables de `[vars]` sí (se cambian acá).
4. Abrir `https://metrica.<cuenta>.workers.dev/salud`: tiene que decir `"clave":true` y `"kv":true`. Después de un despliegue, Cloudflare puede tardar unos minutos en pasar el tráfico a la versión nueva (mientras, `/salud` responde la vieja).

Del lado de OpenAI: cargar saldo prepago con la recarga automática apagada (lo cargado es lo máximo que se puede gastar) y una clave de un proyecto «Métrica».

Después, poner `https://metrica.<cuenta>.workers.dev/ia` en `ENDPOINT_IA` de `js/logica/ia.js` y en `IA.swift` (o, para probar sin publicar, en `localStorage['metrica.ia-endpoint']` desde la consola de Safari) y subir la versión.

Con la terminal también se puede: `cd worker && npx wrangler login && npx wrangler secret put OPENAI_API_KEY && npx wrangler deploy`. Para probarlo en la compu: `npx wrangler dev` y poner `http://localhost:8787/ia` en `metrica.ia-endpoint` (sumando `http://localhost:8080` a `ORIGENES`).

## Lo que falta antes de cobrar
- **El plan:** hoy todos tienen `CUPO_GRATIS`. En la app nativa, la compra de «Métrica IA» (StoreKit 2, suscripción) manda el comprobante firmado (`jwsRepresentation` de la transacción) y el Worker lo verifica con la clave pública de Apple antes de usar `TOPE_PLAN`. En la web queda simulado.
- **El id anónimo** se puede borrar para tener 20 más. Para la app nativa, sumar App Attest (`DCAppAttestService`) o atar el cupo a la cuenta de iCloud; mientras tanto, el techo del día limita el gasto.
- **KV no cuenta exacto** si llegan dos pedidos al mismo tiempo (puede dejar pasar alguno de más). Si hace falta exacto, pasar el contador a un Durable Object.
- Confirmar el nombre exacto del modelo (`MODELO` en `wrangler.toml`) y si conviene la Responses API en vez de Chat Completions.
