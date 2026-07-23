# Build script for Swimchain Desktop App (Windows)
# Builds: Rust node, WASM, JS libraries, all clients, and Tauri desktop app

param(
    [switch]$SkipNode,        # Skip building sw.exe (use existing)
    [switch]$SkipWasm,        # Skip building WASM (use existing)
    [switch]$SkipClients,     # Skip building clients (use existing)
    [switch]$ClientsOnly,     # Only build clients
    [switch]$CheckPrereqs,    # Only check prerequisites
    [switch]$Force            # Continue on non-critical errors
)

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Colors for output
function Write-Step($msg) { Write-Host "`n$msg" -ForegroundColor Yellow }
function Write-Success($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warning($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Error($msg) { Write-Host "  [ERROR] $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor Cyan }

# Check prerequisites
function Check-Prerequisites {
    Write-Host "`n=== Checking Prerequisites ===" -ForegroundColor Cyan
    $allGood = $true

    # Rust/Cargo
    Write-Host "`nRust toolchain:" -ForegroundColor White
    if (Get-Command cargo -ErrorAction SilentlyContinue) {
        $cargoVersion = cargo --version
        Write-Success "cargo: $cargoVersion"
    } else {
        Write-Error "cargo not found. Install from https://rustup.rs"
        $allGood = $false
    }

    # Node.js/npm
    Write-Host "`nNode.js:" -ForegroundColor White
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $nodeVersion = node --version
        Write-Success "node: $nodeVersion"
    } else {
        Write-Error "node not found. Install from https://nodejs.org"
        $allGood = $false
    }
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        $npmVersion = npm --version
        Write-Success "npm: $npmVersion"
    } else {
        Write-Error "npm not found"
        $allGood = $false
    }

    # wasm-pack (for WASM build)
    Write-Host "`nWASM tooling:" -ForegroundColor White
    if (Get-Command wasm-pack -ErrorAction SilentlyContinue) {
        $wasmVersion = wasm-pack --version
        Write-Success "wasm-pack: $wasmVersion"
    } else {
        Write-Warning "wasm-pack not found. Install with: cargo install wasm-pack"
        Write-Info "WASM build will be skipped unless wasm-pack is installed"
    }

    # cmake (for aws-lc-sys in Rust build)
    Write-Host "`nNative build tools:" -ForegroundColor White
    if (Get-Command cmake -ErrorAction SilentlyContinue) {
        $cmakeVersion = cmake --version | Select-Object -First 1
        Write-Success "cmake: $cmakeVersion"
    } else {
        Write-Warning "cmake not found. Install from https://cmake.org or via: winget install cmake"
        Write-Info "Node binary (sw.exe) build may fail without cmake"
    }

    # NASM (for aws-lc-sys assembly)
    if (Get-Command nasm -ErrorAction SilentlyContinue) {
        $nasmVersion = nasm -v 2>&1 | Select-Object -First 1
        Write-Success "nasm: $nasmVersion"
    } else {
        Write-Warning "nasm not found. Install from https://nasm.us or via: winget install nasm"
        Write-Info "Node binary (sw.exe) build may fail without NASM"
    }

    # Visual Studio Build Tools
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vsPath = & $vsWhere -latest -property installationPath 2>$null
        if ($vsPath) {
            Write-Success "Visual Studio: $vsPath"
        }
    } else {
        Write-Warning "Visual Studio Build Tools not detected"
        Write-Info "Install 'Desktop development with C++' workload"
    }

    Write-Host ""
    return $allGood
}

# Main build process
function Build-All {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  Swimchain Desktop App Builder" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    $prereqsOk = Check-Prerequisites
    if ($CheckPrereqs) {
        return
    }

    if (-not $prereqsOk -and -not $Force) {
        Write-Error "Prerequisites check failed. Use -Force to continue anyway."
        exit 1
    }

    $startTime = Get-Date

    # Step 1: Build Rust node binary
    if (-not $SkipNode -and -not $ClientsOnly) {
        Write-Step "Step 1: Building swimchain node (sw.exe)..."
        Set-Location $ProjectRoot
        $cargoOutput = cargo build --release --bin sw 2>&1 | Out-String

        $SwExe = Join-Path $ProjectRoot "target\release\sw.exe"
        if (Test-Path $SwExe) {
            # Copy to binaries folder
            $BinDir = Join-Path $ScriptDir "src-tauri\binaries"
            New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
            Copy-Item $SwExe (Join-Path $BinDir "sw.exe") -Force
            Write-Success "Built and copied sw.exe"
        } else {
            Write-Warning "Failed to build sw.exe:"
            Write-Host $cargoOutput -ForegroundColor Red
            Write-Info "Using existing binary if available."
        }
    } else {
        Write-Step "Step 1: Skipping node build (using existing sw.exe)"
    }

    # Step 2: Build WASM
    if (-not $SkipWasm -and -not $ClientsOnly) {
        Write-Step "Step 2: Building WASM module..."
        $WasmDir = Join-Path $ProjectRoot "swimchain-wasm"
        if ((Get-Command wasm-pack -ErrorAction SilentlyContinue) -and (Test-Path $WasmDir)) {
            Set-Location $WasmDir
            $wasmOutput = wasm-pack build --target web --release --out-dir ../swimchain-js/pkg 2>&1 | Out-String

            $WasmPkg = Join-Path $ProjectRoot "swimchain-js\pkg"
            if (Test-Path (Join-Path $WasmPkg "*.wasm")) {
                Write-Success "Built WASM module"
            } else {
                Write-Warning "WASM build failed:"
                Write-Host $wasmOutput -ForegroundColor Red
            }
        } else {
            Write-Warning "Skipping WASM build (wasm-pack not installed or dir missing)"
        }
    }

    # Step 3: Build swimchain-js
    if (-not $ClientsOnly) {
        Write-Step "Step 3: Building swimchain-js (@swimchain/core)..."
        $SwimchainJsDir = Join-Path $ProjectRoot "swimchain-js"
        if (Test-Path $SwimchainJsDir) {
            Set-Location $SwimchainJsDir
            $null = npm install 2>&1
            $buildOutput = npm run build:ts 2>&1 | Out-String
            if (Test-Path (Join-Path $SwimchainJsDir "dist")) {
                Write-Success "Built swimchain-js"
            } else {
                Write-Warning "swimchain-js build failed:"
                Write-Host $buildOutput -ForegroundColor Red
            }
        }
    }

    # Step 4: Build swimchain-react
    if (-not $ClientsOnly) {
        Write-Step "Step 4: Building swimchain-react (@swimchain/react)..."
        $SwimchainReactDir = Join-Path $ProjectRoot "swimchain-react"
        if (Test-Path $SwimchainReactDir) {
            Set-Location $SwimchainReactDir
            $null = npm install 2>&1
            $buildOutput = npm run build 2>&1 | Out-String
            if (Test-Path (Join-Path $SwimchainReactDir "dist")) {
                Write-Success "Built swimchain-react"
            } else {
                Write-Warning "swimchain-react build failed:"
                Write-Host $buildOutput -ForegroundColor Red
            }
        }
    }

    # Step 5: Build swimchain-frontend
    if (-not $ClientsOnly) {
        Write-Step "Step 5: Building swimchain-frontend (@swimchain/frontend)..."
        $SwimchainFrontendDir = Join-Path $ProjectRoot "swimchain-frontend"
        if (Test-Path $SwimchainFrontendDir) {
            Set-Location $SwimchainFrontendDir
            $null = npm install 2>&1
            $buildOutput = npx tsc 2>&1 | Out-String

            # Copy WASM files (Windows-compatible)
            $WasmSrc = Join-Path $SwimchainFrontendDir "src\wasm"
            $WasmDest = Join-Path $SwimchainFrontendDir "dist\wasm"
            New-Item -ItemType Directory -Force -Path $WasmDest | Out-Null
            if (Test-Path (Join-Path $WasmSrc "swimchain_wasm.js")) {
                Copy-Item (Join-Path $WasmSrc "swimchain_wasm.js") $WasmDest -Force
                Copy-Item (Join-Path $WasmSrc "swimchain_wasm.d.ts") $WasmDest -Force
                Copy-Item (Join-Path $WasmSrc "swimchain_wasm_bg.wasm") $WasmDest -Force
            }
            # Copy CSS
            $CssSrc = Join-Path $SwimchainFrontendDir "src\styles"
            $CssDest = Join-Path $SwimchainFrontendDir "dist\styles"
            if (Test-Path $CssSrc) {
                New-Item -ItemType Directory -Force -Path $CssDest | Out-Null
                Copy-Item (Join-Path $CssSrc "*") $CssDest -Force -Recurse
            }

            if (Test-Path (Join-Path $SwimchainFrontendDir "dist")) {
                Write-Success "Built swimchain-frontend"
            } else {
                Write-Warning "swimchain-frontend build failed:"
                Write-Host $buildOutput -ForegroundColor Red
            }
        }
    }

    # Step 6: Build all clients
    if (-not $SkipClients) {
        Write-Step "Step 6: Building clients..."
        $Clients = @("forum-client", "chat-client", "feed-client", "search-client", "wiki-client")
        $ClientsDir = Join-Path $ScriptDir "public\clients"
        New-Item -ItemType Directory -Force -Path $ClientsDir | Out-Null

        foreach ($Client in $Clients) {
            Write-Info "Building $Client..."
            $ClientDir = Join-Path $ProjectRoot $Client

            if (Test-Path $ClientDir) {
                Set-Location $ClientDir

                # Install deps (suppress npm warnings to stderr)
                $null = npm install 2>&1

                # Build (capture output, show only on failure)
                $buildOutput = npm run build 2>&1 | Out-String

                # Check if dist folder was created (build succeeded)
                $DistDir = Join-Path $ClientDir "dist"
                if (Test-Path $DistDir) {
                    # Copy to desktop-app public/clients
                    $DestDir = Join-Path $ClientsDir $Client
                    Remove-Item -Recurse -Force $DestDir -ErrorAction SilentlyContinue
                    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
                    Copy-Item -Recurse -Force (Join-Path $DistDir "*") $DestDir
                    Write-Success "Built and copied $Client"
                } else {
                    Write-Warning "$Client build failed:"
                    Write-Host $buildOutput -ForegroundColor Red
                }
            } else {
                Write-Warning "$Client directory not found, skipping"
            }
        }
    }

    if ($ClientsOnly) {
        Write-Host "`n=== Clients Build Complete ===" -ForegroundColor Green
        return
    }

    # Step 7: Build each launcher app (app-shell + its client) -> launcher-apps/<id>/<id>-app.exe
    Write-Step "Step 7: Building launcher apps (app-shell + clients)..."
    $shellWeb = "$ProjectRoot/launcher-apps/app-shell/web/client"
    $ShellExe = "$ProjectRoot/launcher-apps/app-shell/src-tauri/target/release/app-shell.exe"
    $ShellBuildRs = "$ProjectRoot/launcher-apps/app-shell/src-tauri/build.rs"
    foreach ($appId in @("feed", "chat", "forum", "search", "wiki", "trench")) {
        # The Trench's web client lives at trench-client/ui (the standalone game's UI,
        # reused as a launcher app) and needs TAURI_ENV_PLATFORM so Vite bakes the
        # relative asset base the packaged shell requires (see trench-client/ui/vite.config.ts).
        $clientDir = if ($appId -eq "trench") { "$ProjectRoot/trench-client/ui" } else { "$ProjectRoot/$appId-client" }
        if (-not (Test-Path $clientDir)) { Write-Warning "$appId client dir not found, skipping"; continue }
        Write-Info "  building $appId-app..."
        # 1. client web bundle
        Push-Location $clientDir
        if ($appId -eq "trench") { $env:TAURI_ENV_PLATFORM = "windows"; npm run build; Remove-Item Env:TAURI_ENV_PLATFORM -ErrorAction SilentlyContinue } else { npm run build }
        Pop-Location
        # 2. stage THIS client into the shell's embedded web/client
        Remove-Item -Recurse -Force $shellWeb -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Force $shellWeb | Out-Null
        Copy-Item -Recurse "$clientDir/dist/*" $shellWeb
        # 3. force a recompile (Tauri embeds frontendDist at compile time and won't
        #    rebuild on a web/-only change) so THIS exe carries THIS client, then build.
        Push-Location "$ProjectRoot/launcher-apps/app-shell/src-tauri"
        (Get-Item $ShellBuildRs).LastWriteTime = Get-Date
        cargo build --release
        Pop-Location
        # 4. place the exe next to its manifest as <id>-app.exe
        if (Test-Path $ShellExe) {
            Copy-Item $ShellExe "$ProjectRoot/launcher-apps/$appId/$appId-app.exe" -Force
            Write-Success "$appId-app.exe built"
        } else {
            Write-Warning "app-shell.exe not found; $appId-app.exe was not produced"
        }
    }
    # 5. stage the RUNTIME app files (manifest + exe + icon only, NOT the app-shell
    #    source) into an in-project `apps/` dir so tauri bundles them to
    #    resource_dir()/apps/<id>/. This is what the packaged launcher's list_apps /
    #    launch_app read in prod (resolve via apps_root -> resource_dir()/apps).
    $bundledApps = "$ProjectRoot/desktop-app/src-tauri/apps"
    Remove-Item -Recurse -Force $bundledApps -ErrorAction SilentlyContinue
    foreach ($appDir in Get-ChildItem "$ProjectRoot/launcher-apps" -Directory) {
        if ($appDir.Name -eq "app-shell") { continue }   # not an app, no app.json
        $manifest = Join-Path $appDir.FullName "app.json"
        if (-not (Test-Path $manifest)) { continue }
        $dest = Join-Path $bundledApps $appDir.Name
        New-Item -ItemType Directory -Force $dest | Out-Null
        Copy-Item $manifest $dest -Force
        Get-ChildItem $appDir.FullName -File | Where-Object { $_.Name -like "*-app.exe" -or $_.Name -like "*.png" -or $_.Name -like "*.ico" } |
            ForEach-Object { Copy-Item $_.FullName $dest -Force }
        Write-Success "staged app '$($appDir.Name)' for bundling"
    }

    # Step 8: Install desktop-app dependencies
    Write-Step "Step 8: Installing desktop-app dependencies..."
    Set-Location $ScriptDir
    npm install 2>&1 | Out-Null
    Write-Success "Dependencies installed"

    # Step 9: Build Vite frontend
    Write-Step "Step 9: Building desktop-app frontend..."
    $buildOutput = npm run build 2>&1 | Out-String
    if (Test-Path (Join-Path $ScriptDir "dist")) {
        Write-Success "Frontend built"
    } else {
        Write-Warning "Frontend build failed:"
        Write-Host $buildOutput -ForegroundColor Red
    }

    # Step 10: Build Tauri app
    Write-Step "Step 10: Building Tauri application..."
    $tauriOutput = npx tauri build 2>&1 | Out-String

    # Check for output files
    $BundleDir = Join-Path $ScriptDir "src-tauri\target\release\bundle"
    $ExeExists = Get-ChildItem -Path $BundleDir -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue
    if ($ExeExists) {
        Write-Success "Tauri build complete"
    } else {
        Write-Warning "Tauri build may have failed:"
        Write-Host $tauriOutput -ForegroundColor Red
    }

    # Summary
    $endTime = Get-Date
    $duration = $endTime - $startTime

    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "  Build Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`nDuration: $($duration.ToString('mm\:ss'))" -ForegroundColor White

    Write-Host "`nClients bundled:" -ForegroundColor Yellow
    $Clients | ForEach-Object { Write-Host "  - $_" -ForegroundColor Cyan }

    Write-Host "`nOutput files:" -ForegroundColor Yellow
    $BundleDir = Join-Path $ScriptDir "src-tauri\target\release\bundle"
    if (Test-Path $BundleDir) {
        Get-ChildItem -Path $BundleDir -Recurse -File |
            Where-Object { $_.Extension -in ".exe", ".msi" } |
            ForEach-Object { Write-Host "  $($_.FullName)" -ForegroundColor Cyan }
    }
}

# Run
Build-All
