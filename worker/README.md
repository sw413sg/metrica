# Worker de «Mejorar frase» (Métrica IA)

Servidor chico en Cloudflare Workers para la función de IA de la libreta: elegís una frase y propone 3 o 4 mejores, basadas en el verso anterior y en sus rimas internas y finales. **Todavía no está desplegado**: mientras `ENDPOINT_IA` (en `js/logica/ia.js`) esté vacío, la app usa respuestas simuladas.

## Cómo anda
1. La app arma el pedido con su propio motor (`fraseElegida` en `js/logica/ia.js`): el verso elegido, el anterior, la estrofa, sílabas, rima consonante y asonante de la última palabra y las rimas internas.
2. Lo manda por POST a este Worker, con un id anónimo del teléfono en `X-Metrica-Id`.
3. El Worker revisa que el pedido tenga la forma de siempre (`pedidoValido`), que la persona tenga cupo este mes (KV `USO`) y que no se haya pasado el techo del día. Arma el mensaje con `promptDeSugerencias` (`js/logica/ia-prompt.js`, el mismo archivo que usa la app y los tests) y llama a OpenAI con la clave guardada como secret. Así no sirve para pedirle cualquier otra cosa al modelo.
4. Devuelve `{ sugerencias: [...], quedan }`. La app las valida y ordena con su motor (`validarSugerencias`): primero las que riman consonante, después asonante, después las de sílabas más parecidas.

Respuestas de error: 429 sin cupo, 403 origen no permitido, 400 pedido raro, 502 falló el modelo, 503 se llegó al techo del día. Solo cuenta el uso si salió bien.

## Costos (estimado del 2026-11-02)
GPT-6.1 Terra: USD 1 por millón de tokens de entrada y USD 5 de salida. Un pedido son unos 1.000 de entrada y 500 de salida: **USD 0,0035**. Con 20 gratis por mes, cada persona que las usa todas cuesta USD 0,07 por mes. Con «Métrica IA» (tentativo, USD 2,99 por mes y tope de 500), el peor caso son USD 1,75 por mes. El plan de Workers gratis alcanza para empezar (100 mil pedidos por día).

## Desplegar (cuando Swa lo decida)
Hace falta una cuenta de Cloudflare y una clave de OpenAI con saldo.

```sh
cd worker
npx wrangler login
npx wrangler kv namespace create USO        # copiar el id en wrangler.toml
npx wrangler secret put OPENAI_API_KEY      # pegar la clave (no va al repo)
npx wrangler deploy                         # da la dirección: https://metrica-ia.<cuenta>.workers.dev
```

Después, poner esa dirección en `ENDPOINT_IA` de `js/logica/ia.js` (o, para probar sin publicar, en `localStorage['metrica.ia-endpoint']` desde la consola de Safari) y subir la versión.

Para probarlo en la compu: `npx wrangler dev` y poner `http://localhost:8787` en `metrica.ia-endpoint` (sumando `http://localhost:8080` a `ORIGENES`).

## Lo que falta antes de cobrar
- **El plan:** hoy todos tienen `CUPO_GRATIS`. En la app nativa, la compra de «Métrica IA» (StoreKit 2, suscripción) manda el comprobante firmado (`jwsRepresentation` de la transacción) y el Worker lo verifica con la clave pública de Apple antes de usar `TOPE_PLAN`. En la web queda simulado.
- **El id anónimo** se puede borrar para tener 20 más. Para la app nativa, sumar App Attest (`DCAppAttestService`) o atar el cupo a la cuenta de iCloud; mientras tanto, el techo del día limita el gasto.
- **KV no cuenta exacto** si llegan dos pedidos al mismo tiempo (puede dejar pasar alguno de más). Si hace falta exacto, pasar el contador a un Durable Object.
- Confirmar el nombre exacto del modelo (`MODELO` en `wrangler.toml`) y si conviene la Responses API en vez de Chat Completions.
