# Start Code-Sync Application
Write-Host "Starting Code-Sync application..." -ForegroundColor Green
Write-Host "This will start both the client and server."

# Function to check if Node.js is installed
function Test-NodeJS {
    try {
        $nodeVersion = node -v
        Write-Host "Node.js version: $nodeVersion" -ForegroundColor Cyan
        return $true
    }
    catch {
        Write-Host "Node.js is not installed or not in PATH." -ForegroundColor Red
        Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
        return $false
    }
}

# Check for Node.js
if (-not (Test-NodeJS)) {
    Write-Host "Exiting..." -ForegroundColor Red
    Exit 1
}

# Start the server in a new PowerShell window
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "Set-Location '$PWD\server'; npm run dev"

# Start the client in this window
Write-Host "Starting client..." -ForegroundColor Green
Set-Location -Path .\client\
npm run dev 