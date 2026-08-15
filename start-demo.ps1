# start-demo.ps1
# Run this from the project root (C:\Lumiq Bootcamp\claims deploy final)
# before any demo. It always tears down cleanly first, so you never
# hit "container name already in use" errors again.
#
# Usage:
#   .\start-demo.ps1            -> full stack (all services)
#   .\start-demo.ps1 -Light     -> just backend + mongo + prometheus + grafana
#
# If PowerShell blocks the script from running, first run this once:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

param(
    [switch]$Light
)

Write-Host "==> Cleaning up any old containers..." -ForegroundColor Cyan
docker compose down

Write-Host "==> Starting stack..." -ForegroundColor Cyan
if ($Light) {
    docker compose up --build -d backend mongo prometheus grafana
} else {
    docker compose up --build -d
}

Write-Host ""
Write-Host "==> Waiting a few seconds for containers to settle..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "==> Current container status:" -ForegroundColor Cyan
docker compose ps

Write-Host ""
Write-Host "Open these once containers show 'Up' / healthy:" -ForegroundColor Green
Write-Host "  API (gateway):  http://127.0.0.1:8080"
Write-Host "  Prometheus:     http://127.0.0.1:9090"
Write-Host "  Grafana:        http://127.0.0.1:3001  (admin / admin)"
Write-Host ""
Write-Host "To stop everything cleanly when you're done:" -ForegroundColor Yellow
Write-Host "  docker compose down"
