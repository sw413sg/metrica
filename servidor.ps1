# Servidor local mínimo para ver Métrica en el navegador sin instalar nada.
# Lo arranca abrir-metrica.bat. Cerrá la ventana para apagarlo.
$raiz = [IO.Path]::GetFullPath($PSScriptRoot)
$tipos = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'
    '.webmanifest' = 'application/manifest+json'; '.json' = 'application/json'
    '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
    '.mp3' = 'audio/mpeg'
}

# Busca un puerto libre entre 8080 y 8099.
$servidor = $null
foreach ($puerto in 8080..8099) {
    $prueba = New-Object System.Net.HttpListener
    $prueba.Prefixes.Add("http://localhost:$puerto/")
    try { $prueba.Start(); $servidor = $prueba; break } catch { $prueba.Close() }
}
if (-not $servidor) { Write-Host 'No encontré un puerto libre entre 8080 y 8099.'; Read-Host 'Enter para salir'; exit 1 }

$direccion = "http://localhost:$puerto/"
Write-Host "Métrica está andando en $direccion"
Write-Host 'Cerrá esta ventana para apagarla.'
try { Start-Process $direccion } catch { }

while ($servidor.IsListening) {
    $contexto = $servidor.GetContext()
    $respuesta = $contexto.Response
    try {
        $ruta = [Uri]::UnescapeDataString($contexto.Request.Url.AbsolutePath).TrimStart('/')
        if ($ruta -eq '' -or $ruta.EndsWith('/')) { $ruta += 'index.html' }
        $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $ruta))
        if ($archivo.StartsWith($raiz, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $archivo -PathType Leaf)) {
            $bytes = [IO.File]::ReadAllBytes($archivo)
            $tipo = $tipos[[IO.Path]::GetExtension($archivo).ToLower()]
            if (-not $tipo) { $tipo = 'application/octet-stream' }
            $respuesta.ContentType = $tipo
            $respuesta.Headers.Add('Cache-Control', 'no-cache')
            $respuesta.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $respuesta.StatusCode = 404
        }
    } catch {
        $respuesta.StatusCode = 500
    } finally {
        $respuesta.Close()
    }
}
