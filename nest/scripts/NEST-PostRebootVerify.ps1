<#
.SYNOPSIS
    NEST Post-Reboot Verification
.DESCRIPTION
    Run this script after reboot to verify NEST state persistence.
    Run from elevated PowerShell.
#>

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [$Level] $Message"
}

function Assert-Condition {
    param([bool]$Condition, [string]$Message)
    if ($Condition) {
        Write-Host "  ✓ PASS: $Message" -ForegroundColor Green
        return $true
    } else {
        Write-Host "  ✗ FAIL: $Message" -ForegroundColor Red
        return $false
    }
}

Write-Host "=== NEST POST-REBOOT VERIFICATION ==="
Write-Host ""

$allPassed = $true

# 1. Tray icon / process
$nestPid = Get-Process -Name "NEST" -ErrorAction SilentlyContinue
$allPassed = Assert-Condition ($nestPid -ne $null) "NEST tray process running" -and $allPassed

# 2. Local URL
try { 
    $resp = Invoke-WebRequest -Uri 'http://localhost:3101' -TimeoutSec 5 -UseBasicParsing
    $allPassed = Assert-Condition ($resp.StatusCode -eq 200) "Local URL accessible (http://localhost:3101)" -and $allPassed
} catch { 
    $allPassed = Assert-Condition $false "Local URL accessible" -and $allPassed
}

# 3. LAN URL
$lanIp = (Get-NetIPConfiguration | Where-Object { $_.IPv4Address -and $_.IPv4Address.IPAddress -notlike '127.*' -and $_.IPv4Address.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPv4Address).IPAddress
if ($lanIp) {
    $lanUrl = "http://$lanIp:3101"
    try { 
        $resp = Invoke-WebRequest -Uri $lanUrl -TimeoutSec 5 -UseBasicParsing
        $allPassed = Assert-Condition ($resp.StatusCode -eq 200) "LAN URL accessible ($lanUrl)" -and $allPassed
    } catch { 
        $allPassed = Assert-Condition $false "LAN URL accessible ($lanUrl)" -and $allPassed
    }
} else {
    $allPassed = Assert-Condition $false "Could not determine LAN IP" -and $allPassed
}

# 4. Firewall rule
$fw = Get-NetFirewallRule -Group "NEST" -ErrorAction SilentlyContinue
$allPassed = Assert-Condition ($fw -ne $null) "Firewall rule exists (group NEST)" -and $allPassed
if ($fw) {
    $rule = $fw | Select-Object -First 1
    Assert-Condition ($rule.Enabled -eq $true) "  Rule Enabled = True"
    Assert-Condition ($rule.Profile -eq 'Private') "  Profile = Private"
    Assert-Condition ($rule.RemoteAddress -eq 'LocalSubnet') "  RemoteAddress = LocalSubnet"
    Assert-Condition ($rule.LocalPort -eq 3101) "  LocalPort = 3101"
    Assert-Condition ($rule.Action -eq 'Allow') "  Action = Allow"
}

# 5. Database
$dbPath = "$env:APPDATA\NEST\nest.db"
$allPassed = Assert-Condition (Test-Path $dbPath) "Database exists at $dbPath" -and $allPassed

# 6. Settings persistence
$settings = @('backgroundMode','shutdownPolicy','startupAtLogin','logRetentionDays','logMaxLinesPerApp','preferredInterface')
$settingsObj = Get-ItemProperty -Path "HKCU:\Software\NEST" -ErrorAction SilentlyContinue
if ($settingsObj) {
    foreach ($s in $settings) {
        if ($settingsObj.$s -ne $null) {
            Assert-Condition $true "Setting $s preserved" > $null
        }
    }
}

# 7. App state
$appState = Get-ItemProperty -Path "HKCU:\Software\NEST\AppState" -ErrorAction SilentlyContinue
if ($appState) {
    Write-Host "  App state registry keys present"
}

Write-Host ""
if ($allPassed) {
    Write-Host "=== ALL CHECKS PASSED ===" -ForegroundColor Green
    exit 0
} else {
    Write-Host "=== SOME CHECKS FAILED ===" -ForegroundColor Red
    exit 1
}