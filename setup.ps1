# VERIQAS — Windows setup script
# Run with: powershell -ExecutionPolicy Bypass -File setup.ps1

Write-Host ""
Write-Host "VERIQAS — Quantum Risk & Compliance Platform" -ForegroundColor White
Write-Host "────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not installed. Install Docker Desktop from https://docs.docker.com/desktop/windows/" -ForegroundColor Red
    exit 1
}

# Generate .env.docker if it doesn't exist
if (-not (Test-Path ".env.docker")) {
    Write-Host "Creating .env.docker from template..." -ForegroundColor Yellow
    Copy-Item ".env.docker.example" ".env.docker"

    # Generate random secrets
    $authSecret = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
    $dbPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object { [char]$_ })

    (Get-Content ".env.docker") `
        -replace "replace_with_output_of_openssl_rand_base64_32", $authSecret `
        -replace "change_me_before_deploy", $dbPassword |
        Set-Content ".env.docker"

    Write-Host "Secrets generated automatically." -ForegroundColor Green
} else {
    Write-Host ".env.docker already exists — skipping generation." -ForegroundColor Green
}

Write-Host ""
Write-Host "Building and starting VERIQAS (this takes a few minutes on first run)..."
Write-Host ""

docker compose up --build -d

Write-Host ""
Write-Host "VERIQAS is starting up." -ForegroundColor Green
Write-Host ""
Write-Host "  App:  http://localhost:4000"
Write-Host "  Logs: docker compose logs -f"
Write-Host "  Stop: docker compose down"
Write-Host ""
Write-Host "Allow ~30 seconds for the database migration to complete before opening the app."
Write-Host ""
