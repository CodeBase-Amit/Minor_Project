# Setup script for Code-Sync
Write-Host "Setting up Code-Sync..." -ForegroundColor Green

# Install root dependencies
Write-Host "Installing root dependencies..." -ForegroundColor Cyan
npm install

# Install client dependencies
Write-Host "Installing client dependencies..." -ForegroundColor Cyan
Set-Location -Path .\client\
npm install
Set-Location -Path ..

# Install server dependencies
Write-Host "Installing server dependencies..." -ForegroundColor Cyan
Set-Location -Path .\server\
npm install
Set-Location -Path ..

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the application, run:" -ForegroundColor Yellow
Write-Host "npm start" -ForegroundColor Yellow
Write-Host ""
Write-Host "Or to start just the server, run:" -ForegroundColor Yellow
Write-Host ".\start-server.ps1" -ForegroundColor Yellow 