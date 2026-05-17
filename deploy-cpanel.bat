@echo off
setlocal enabledelayedexpansion

echo [1/7] Building Next.js app...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Deployment package was not created.
  exit /b 1
)

echo [2/7] Cleaning old deploy package...
if exist "deploy-package" rmdir /s /q "deploy-package"
if exist "crypto-dashboard-deploy.zip" del /f /q "crypto-dashboard-deploy.zip"

echo [3/7] Creating deploy package folder...
mkdir "deploy-package"

echo [4/7] Copying standalone server files...
xcopy ".next\standalone\*" "deploy-package\" /E /I /Y >nul
if errorlevel 1 (
  echo.
  echo Failed to copy .next\standalone files.
  exit /b 1
)

echo [5/7] Copying Next static assets...
mkdir "deploy-package\.next" 2>nul
xcopy ".next\static" "deploy-package\.next\static\" /E /I /Y >nul
if errorlevel 1 (
  echo.
  echo Failed to copy .next\static files.
  exit /b 1
)

echo [6/7] Copying public folder if available...
if exist "public" (
  xcopy "public" "deploy-package\public\" /E /I /Y >nul
  if errorlevel 1 (
    echo.
    echo Failed to copy public folder.
    exit /b 1
  )
)

echo [7/7] Creating zip archive...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path 'deploy-package\*' -DestinationPath 'crypto-dashboard-deploy.zip' -Force"
if errorlevel 1 (
  echo.
  echo Failed to create crypto-dashboard-deploy.zip.
  exit /b 1
)

echo.
echo Done: crypto-dashboard-deploy.zip is ready for cPanel upload.
echo Startup file on cPanel: server.js
echo Run command on server: node server.js

endlocal
