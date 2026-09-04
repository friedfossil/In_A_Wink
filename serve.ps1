$port = 8080
$path = $PSScriptRoot
if (-not $path) { $path = (Get-Location).Path }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  👁️  WinkPass Local Server Running!" -ForegroundColor Green
Write-Host "  URL: http://localhost:$port/" -ForegroundColor Yellow
Write-Host "  Webcam access requires localhost (served automatically)." -ForegroundColor Gray
Write-Host "  Press Ctrl+C in this terminal to stop the server." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

Start-Process "http://localhost:$port/"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response
        
        $localPath = $req.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($localPath)) { $localPath = "index.html" }
        $filePath = Join-Path $path $localPath
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            switch ($ext) {
                ".html" { $res.ContentType = "text/html; charset=utf-8" }
                ".js"   { $res.ContentType = "application/javascript; charset=utf-8" }
                ".css"  { $res.ContentType = "text/css; charset=utf-8" }
                ".json" { $res.ContentType = "application/json; charset=utf-8" }
                ".svg"  { $res.ContentType = "image/svg+xml" }
                Default { $res.ContentType = "application/octet-stream" }
            }
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $res.OutputStream.Write($notFound, 0, $notFound.Length)
        }
        $res.Close()
    }
} finally {
    $listener.Stop()
}
