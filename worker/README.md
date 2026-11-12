# Worker de Métrica

Servidor chico en Cloudflare Workers. Cada función va en su ruta, así se pueden sumar otras (por ejemplo, conectar la web con iCloud) sin tocar las que ya andan:

- `GET /salud`: dice si está desplegado, con qué modelo y si la clave y el KV están cargados (`{ ok, modelo, clave, kv }`). No gasta nada.
- `GET /probar`: un pedido mínimo a OpenAI; dice `{ ok: true }` o el error de OpenAI tal cual (sin la clave). Tope de 30 por día. Los errores también quedan en Observability.
- `POST /web/...`: **Métrica web**, la web vinculada con el iPhone por un QR, como WhatsApp Web (`worker/src/enlace.js`, ver abajo).
- `POST /ia`: la IA de la libreta: elegís una frase y propone 3 o 4 alternativas relacionadas, con sus mismas rimas internas y finales (además, cambia palabras sueltas y revisa la letra entera). Desplegado en `https://metrica.emas1397.workers.dev` (la web usa `/ia` desde la 1.6.6).
- `POST /ia/cupo`: lo que queda de la cuota, sin gastar ni llamar al modelo (`{ quedan }` y `X-Metrica-Restantes`), con los mismos headers y la misma sesión que `/ia`. La web lo pide cada 8 s vinculada y el iPhone en cada vuelta de Métrica web, así los dos muestran lo mismo aunque se usen a la vez. Anota los paquetes nuevos (acción `cupo` de la cuota), porque la app cierra la transacción al ver los restantes.

## Cómo anda
1. La app arma el pedido con su propio motor (`fraseElegida` en `js/logica/ia.js`): el verso elegido, el anterior, la estrofa, sílabas, rima consonante y asonante de la última palabra y las rimas internas.
2. Lo manda por POST a `/ia`, con un id anónimo del teléfono en `X-Metrica-Id` y, si hay compras, los JWS de StoreKit 2 en `X-Metrica-JWS` (uno o varios `jwsRepresentation`, separados por coma).

   **Desde la web** (un navegador, que manda `Origin`), `/ia` exige además `Authorization: Bearer <espacio>.<token>` de una sesión de Métrica web que vale (el iPhone vinculado; si no, 401 `vincular`), y gasta con el id de la IA que el iPhone dejó al vincular o al sincronizar (`ia` en `/web/vincular` y `/web/guardar`), no con el que mande la web. Sin `Origin` (la app nativa) sigue como siempre: eso solo se cierra con App Attest.
3. El Worker revisa el origen (la web manda su `Origin`, que tiene que estar en `ORIGENES`; la app nativa no manda ninguno y pasa), que el pedido tenga la forma de siempre (`pedidoValido`), que la persona tenga cuota (KV `USO`) y que no se haya pasado el techo del día. `X-Metrica-Plan` y `X-Metrica-Extra` se ignoran. Arma el mensaje con `promptDeSugerencias` (`js/logica/ia-prompt.js`, el mismo archivo que usa la app y los tests) y llama a OpenAI con la clave guardada como secret. Así no sirve para pedirle cualquier otra cosa al modelo.
4. Devuelve `{ sugerencias: [...], quedan }` y el header `X-Metrica-Restantes` (lo que queda después de esa consulta). La app las valida y ordena con su motor (`validarSugerencias`): primero las que riman consonante, después asonante, después las de sílabas más parecidas.

Respuestas de error: 404 ruta que no existe, 402 sin cuota (con `X-Metrica-Restantes`), 401 JWS que no verifica o productId desconocido, 403 origen no permitido, 400 pedido raro, 502 falló el modelo, 503 se llegó al techo del día. Solo descuenta si salió bien. Una suscripción vencida no es un error: queda en el cupo gratis.

## Costos (estimado del 2026-11-02)
El modelo piensa antes de contestar y eso se cobra como salida: `ESFUERZO = "low"` en `wrangler.toml` (`reasoning_effort` de OpenAI) le pide que piense poco. Si alguna vez OpenAI no lo acepta para el modelo, el Worker da 502: dejarlo vacío.

GPT-6.1 Terra: USD 1 por millón de tokens de entrada y USD 5 de salida. Un pedido son unos 1.000 de entrada y 500 de salida: **USD 0,0035**. Con 20 gratis por mes, cada persona que las usa todas cuesta unos USD 0,07 por mes; con «Métrica + IA» (USD 2,99 por mes y 300 por mes; la letra entera gasta de 2 a 4, según sus versos), el peor caso son unos USD 1,05 por mes. El plan de Workers gratis alcanza para empezar (100 mil pedidos por día).

## Cuota
La compra no se cree por una cabecera. Cada JWS de `X-Metrica-JWS` se verifica en `worker/src/verificar.js`:

- `alg` ES256 y la firma cierra con la clave de la hoja.
- La cadena `x5c` (hoja e intermedias) llega hasta **Apple Root CA - G3**, embebida en `worker/src/raiz-apple.js`. Una raíz que venga dentro del JWS no alcanza.
- La hoja trae el OID `1.2.840.113635.100.6.11.1` (firma de compras) y cada intermedio el `1.2.840.113635.100.6.2.1`. Los certificados están vigentes.
- `bundleId` igual a `BUNDLE_ID`. `productId` conocido (`worker/src/cuota.js`). Si `revocationDate` está, no suma. La suscripción (`metrica.ia`) además pide `expiresDate` en el futuro.
- Sandbox y Production valen los dos (TestFlight firma igual, con la misma raíz).

Qué suma, una vez verificado:

| Compra | productId | Cuota |
| --- | --- | --- |
| Sin compra | — | `CUPO_GRATIS` (20) por mes, por `X-Metrica-Id`, y como mucho `TOPE_IP` (100) por mes en la misma IP |
| Sandbox (App Review, TestFlight) | cualquiera de los de arriba, con `environment: Sandbox` | La suscripción da 300 por mes por `originalTransactionId` (`cuota:mes:<aaaa-mm>:sandbox-sub:<originalTransactionId>`), y los paquetes y el regalo suman como en Production, una vez por `transactionId` (pedido de Swa, 2026-11-11: con 30 parecía que se perdían). Todo cuenta en `SANDBOX_TOPE_GLOBAL_DIA` (300) de todas las consultas Sandbox del día. Sin la suscripción, `SANDBOX_CONSULTAS_MES` (30) por mes y por recibo, con el tope por IP |
| Compra de prueba de TestFlight (simulada, sin productos en App Store Connect) | `X-Metrica-Simulada` (`metrica.ia` o `metrica.extras`) y `X-Metrica-Prueba` con el AppTransaction de StoreKit, firmado por Apple con `receiptType: Sandbox` | `metrica.ia`: 300 por mes y por `X-Metrica-Id`; `metrica.extras`: 100 de regalo por id, más el cupo gratis. Los paquetes de «Más IA» simulados van en `X-Metrica-Paquetes-Prueba` (`productId:idLocal`, hasta 20): cada id suma el paquete una sola vez. Cuenta en `SANDBOX_TOPE_GLOBAL_DIA`. En el App Store el AppTransaction dice Production y no vale |
| Métrica + | `metrica.extras` | 100 de regalo, una sola vez, no se renuevan con el mes |
| Métrica + IA | `metrica.ia` | 300 por mes (reemplaza a las 20, no se suman) |
| Más IA | `metrica.ia.mas`, `metrica.ia.mas5`, `metrica.ia.mas10`, `metrica.ia.mas30`, `metrica.ia.mas50` | 300, 800, 1.650, 5.000 y 8.500, una sola vez por `transactionId` |

El regalo y los paquetes quedan en la clave `cuota:bolsa:<transactionId>` hasta que se gastan. No lleva vencimiento: si se borrara, el mismo JWS volvería a sumar. La suscripción va en `cuota:mes:<aaaa-mm>:sub:<originalTransactionId>`, así una renovación no reinicia el mes. El cupo gratis va en `cuota:mes:<aaaa-mm>:id:<id>`, el de Sandbox en `cuota:mes:<aaaa-mm>:sandbox:<originalTransactionId>`, el tope de IP (gratis y Sandbox) en `cuota:mes:<aaaa-mm>:ip:<ip>` y el tope global de Sandbox en `sandbox:dia:<aaaa-mm-dd>`. Primero se gasta el mes (se renueva) y después el regalo y los paquetes.

Esas claves no viven en el KV: las guarda el Durable Object `Cuota` (binding `CUOTA`), un solo objeto para todos. Leer, chequear y descontar es una transacción, así dos pedidos a la vez no se pisan la bolsa.

Hasta que la app mande `X-Metrica-JWS`, aunque tenga la suscripción cuenta como gratis: las cabeceras viejas ya no alcanzan. En la web sigue simulado.

`PRUEBA=si` junto con `RAIZ_DE_PRUEBA` cambia la raíz por una CA de los tests. No definirlo en Cloudflare.

## Desplegar
**Mergear a `main` despliega solo.** Workers Builds, en cada push a `main`, corre `npx wrangler deploy` en la carpeta `worker` (el `import` de `../../js/logica/ia-prompt.js` anda porque baja el repo entero). No hace falta correr wrangler a mano ni crear nada en el panel: con el merge alcanza (también aplica la migration del Durable Object), y el tráfico puede tardar unos minutos en pasar a la versión nueva.

KV: no hay que crear otro namespace. El binding `USO` (namespace «metrica-uso», id en `wrangler.toml`) queda para el contador de `/probar`.

Durable Object: tampoco se crea a mano en el panel. El `wrangler.toml` declara el binding `CUOTA` (clase `Cuota`) y la migration `v1` con `new_sqlite_classes`. **El deploy del merge a `main` aplica esa migration y deja el binding listo.** La instancia (`metrica-cuota`) nace sola en el primer pedido a `/ia`. Si el deploy dice que la migration ya existe, no hay que repetirla.

Una sola vez, en el panel de Cloudflare (ya hecho el 2026-11-09; se repite solo si se arma el Worker de cero):
1. Workers & Pages › Create › Import a repository › `sw413sg/metrica`. Nombre `metrica`, carpeta (root directory) `worker`, el resto como viene.
2. El KV `USO` ya está creado («metrica-uso») y su `id` va en `wrangler.toml` (sin id, wrangler lo creaba en el primer despliegue pero en el segundo fallaba con «already exists»).
3. En el Worker › Settings › Variables and Secrets › Add: tipo **Secret**, nombre `OPENAI_API_KEY`, la clave de OpenAI. No va al repo ni al chat. Los secrets no se pisan con cada despliegue; las variables de `[vars]` sí (se cambian acá). Al desplegar esta versión se van `PLAN_SIN_VERIFICAR` y `TOPE_PLAN`, y entran `BUNDLE_ID`, `TOPE_IP`, `SANDBOX_CONSULTAS_MES` y `SANDBOX_TOPE_GLOBAL_DIA`. El Durable Object `CUOTA` lo registra la migration del mismo deploy. Los contadores del mes arrancan de cero en ese primer deploy: el DO no lee el KV `USO`, así que quien ya gastó sus 20 gratis las vuelve a tener. No se arrastran los usos viejos.
4. `BUNDLE_ID` es `com.sw413sg.metrica` (el del target de Xcode).
5. Abrir `https://metrica.<cuenta>.workers.dev/salud`: tiene que decir `"clave":true`, `"kv":true` y `"cuota":true`. Después del merge a `main`, Cloudflare puede tardar unos minutos en pasar el tráfico a la versión nueva (mientras, `/salud` responde la vieja).

Del lado de OpenAI: cargar saldo prepago con la recarga automática apagada (lo cargado es lo máximo que se puede gastar) y una clave de un proyecto «Métrica».

Después, poner `https://metrica.<cuenta>.workers.dev/ia` en `ENDPOINT_IA` de `js/logica/ia.js` y en `IA.swift` (o, para probar sin publicar, en `localStorage['metrica.ia-endpoint']` desde la consola de Safari) y subir la versión.

Publicar es el merge a `main`. `cd worker && npx wrangler deploy` solo hace falta si se quiere subir sin ese merge. Para probarlo en la compu: `npx wrangler dev` y poner `http://localhost:8787/ia` en `metrica.ia-endpoint` (sumando `http://localhost:8080` a `ORIGENES`).

## Lo que falta antes de cobrar
- **El id anónimo** del cupo gratis se puede borrar para tener 20 más, hasta el tope de la IP. Para la app nativa, sumar App Attest (`DCAppAttestService`) o atar el cupo a la cuenta de iCloud; mientras tanto, el tope de la IP y el techo del día limitan el gasto. La cuota paga va por `transactionId` / `originalTransactionId`, no por el id del teléfono.
- La primera vez que un `transactionId` llega al servidor se acredita el paquete entero. Si en el teléfono ya se había gastado una parte (la cuota vieja era local), esa parte vuelve a estar disponible.
- Confirmar el nombre exacto del modelo (`MODELO` en `wrangler.toml`) y si conviene la Responses API en vez de Chat Completions.
- La app manda el país del iPhone en `X-Metrica-Pais` (código ISO): Métrica IA habla rioplatense solo con `AR`.

**Costo:** las instrucciones son siempre iguales y lo que cambia en cada pedido (los caminos al azar, los puntos de partida de las ideas, los renglones ya propuestos) va al final de la entrada, después de la letra. Con `prompt_cache_key` por persona, OpenAI reusa lo ya leído (instrucciones y letra, cuando pasan de unos 1.000 tokens) y lo cobra a una fracción del precio: sirve sobre todo al refrescar alternativas o tocar «¿Qué más cambiaría?» en la misma letra.

## Métrica web (vincular con QR)
La web (`metricarimas.com/app/`, `js/web.js`) y el iPhone (`EnlaceWeb.swift` en metrica-swift) se pasan letras, frases, carpetas y palabras guardadas por acá, **cifradas de punta a punta**: el Worker guarda bytes que no puede abrir.

1. La web pide un código (`/web/qr`, 30 por hora por IP) y muestra el QR `metrica-web:1:<código>:<clave pública ECDH P-256>`. El código vence a los 60 s y sirve una vez; después de 3, la web pide tocar «Cargar otro código».
2. El iPhone lo escanea y manda a `/web/vincular` su espacio, su token, su clave pública y la clave de sus datos cifrada con la clave compartida (HKDF-SHA256 del secreto ECDH, con el código de sal). El Worker crea la sesión de la web y lo deja en el buzón del código.
3. La web lo retira (`/web/qr/estado`) y desde ahí trae y manda con `Authorization: Bearer <espacio>.<token>` (`/web/traer`, `/web/guardar`). Cada registro llega como `{ c: HMAC del nombre, d: AES-GCM de {n, j} }`.
4. El iPhone ve las sesiones (`/web/sesiones`), cierra una (`/web/cerrar`) o borra todo (`/web/borrar`). La web cierra la suya con `/web/cerrar`.

Límites (pedido de Swa): gratis, una computadora a la vez y la sesión se cierra a los 3 días sin uso; con Métrica+, hasta 5 y 14 días (`PLANES_WEB`; el plan lo dice el iPhone al vincular). Un espacio sin uso en 30 días se borra entero (alarma del Durable Object). Solo se guardan hashes de los tokens.

Durable Objects: `ENLACES` (clase `Enlaces`, uno solo para los códigos) y `ESPACIO` (clase `Espacio`, uno por iPhone), con la migration `v2`. Como `CUOTA`, el deploy del merge a `main` los registra solos. `/salud` dice `"enlace": true` cuando están.
