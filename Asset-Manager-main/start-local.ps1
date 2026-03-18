#!/usr/bin/env powershell
# خطوات تشغيل النظام محليًا
# قم بتشغيل هذا الملف في PowerShell

Push-Location $PSScriptRoot

try {
    Write-Host "=== Starting Asset Manager ===" -ForegroundColor Green

    # 0. تحميل متغيرات البيئة من .env
    $envFile = Join-Path $PSScriptRoot ".env"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
                [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
            }
        }
        Write-Host "Loaded environment variables from .env" -ForegroundColor Cyan
    }

    # 1. التأكد من وجود PostgreSQL (مع حفظ البيانات)
    Write-Host "Checking database..." -ForegroundColor Yellow

    $running = docker ps -q --filter "name=^asset-manager-pg$"
    if ($running) {
        Write-Host "PostgreSQL container is already running" -ForegroundColor Green
    } else {
        $stopped = docker ps -aq --filter "name=^asset-manager-pg$"
        if ($stopped) {
            Write-Host "Restarting stopped PostgreSQL container..." -ForegroundColor Yellow
            docker start asset-manager-pg | Out-Null
        } else {
            Write-Host "Creating a new PostgreSQL container with persistent volume..." -ForegroundColor Yellow
            docker volume create asset-manager-pgdata 2>$null | Out-Null
            $dockerArgs = @(
                "run", "-d", "--name", "asset-manager-pg",
                "-e", "POSTGRES_USER=postgres",
                "-e", "POSTGRES_PASSWORD=postgres",
                "-e", "POSTGRES_DB=asset_manager",
                "-p", "55432:5432",
                "-v", "asset-manager-pgdata:/var/lib/postgresql/data",
                "postgres:16-alpine"
            )
            docker @dockerArgs | Out-Null
        }

        Write-Host "Waiting for PostgreSQL to become ready..." -ForegroundColor Yellow
        for ($i = 1; $i -le 30; $i++) {
            $ready = docker exec asset-manager-pg pg_isready -U postgres 2>$null
            if ($LASTEXITCODE -eq 0) {
                break
            }
            Start-Sleep -Seconds 1
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to start PostgreSQL. Check logs with: docker logs asset-manager-pg" -ForegroundColor Red
            exit 1
        }
        Write-Host "PostgreSQL is ready" -ForegroundColor Green
    }

    # 2. التأكد من تثبيت الاعتماديات
    if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) {
        Write-Host "Installing dependencies..." -ForegroundColor Yellow
        npm install
    }

    $drizzleKit = Join-Path $PSScriptRoot "node_modules\.bin\drizzle-kit.cmd"
    $tsx = Join-Path $PSScriptRoot "node_modules\.bin\tsx.cmd"

    if (-not (Test-Path $drizzleKit)) {
        Write-Host "Missing local drizzle-kit binary. Run npm install." -ForegroundColor Red
        exit 1
    }

    if (-not (Test-Path $tsx)) {
        Write-Host "Missing local tsx binary. Run npm install." -ForegroundColor Red
        exit 1
    }

    # 3. تعيين متغيرات البيئة اللازمة
    $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:55432/asset_manager"
    if (-not $env:SESSION_SECRET) {
        $env:SESSION_SECRET = "dev-local-secret-key-change-in-production"
    }
    $env:NODE_ENV = "development"

    # 4. دفع مخطط قاعدة البيانات
    Write-Host "Pushing database schema..." -ForegroundColor Yellow
    & $drizzleKit push --force

    # 5. تشغيل الخادم
    Write-Host ""
    Write-Host "=== Running app on http://localhost:5000 ===" -ForegroundColor Green
    & $tsx server/index.ts
}
finally {
    Pop-Location
}
