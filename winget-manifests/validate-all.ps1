# PowerShell script to validate all Otium Winget manifests locally
Write-Host "Validating XRTM8.OtiumReader manifest..." -ForegroundColor Cyan
winget validate --manifest "$PSScriptRoot\manifests\x\XRTM8\OtiumReader\1.5.0"
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ XRTM8.OtiumReader manifest is 100% valid." -ForegroundColor Green
} else {
    Write-Host "✗ XRTM8.OtiumReader validation failed." -ForegroundColor Red
}

Write-Host "`nValidating XRTM8.OtiumLink manifest..." -ForegroundColor Cyan
winget validate --manifest "$PSScriptRoot\manifests\x\XRTM8\OtiumLink\1.5.1"
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ XRTM8.OtiumLink manifest is 100% valid." -ForegroundColor Green
} else {
    Write-Host "✗ XRTM8.OtiumLink validation failed." -ForegroundColor Red
}
