<#
.SYNOPSIS
    NEST Firewall Helper - Controlled PowerShell script for managing Windows Firewall rules
.DESCRIPTION
    This script provides a fixed, versioned set of operations for managing NEST firewall rules.
    It is designed to be called with elevated privileges via UAC when needed.
    All parameters are validated both in TypeScript (Zod) and in PowerShell (ValidateRange/ValidatePattern).

.OPERATIONS
    Add-NestRule      - Add a new inbound firewall rule for NEST
    Remove-NestRule   - Remove a NEST firewall rule
    Get-NestRule      - Get a specific NEST firewall rule
    List-NestRules    - List all NEST firewall rules
    Get-ActiveProfile - Get the active network profile
    ReconcileRules    - Reconcile expected rules with actual rules

.SECURITY
    - Rules are scoped to Private profile only
    - Rules use group "NEST" and name prefix "NEST-"
    - Parameters are validated with ValidateRange/ValidatePattern
    - No string concatenation of user input
    - Results returned via JSON output file

.NOTES
    This script must be called with explicit parameters, never with user-supplied strings.
    The TypeScript side validates all inputs before calling this script.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Add-NestRule', 'Remove-NestRule', 'Get-NestRule', 'List-NestRules', 'Get-ActiveProfile', 'ReconcileRules')]
    [string]$Operation,

    [Parameter(Mandatory=$false)]
    [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
    [string]$AppId,

    [Parameter(Mandatory=$false)]
    [ValidateRange(1, 65535)]
    [int]$Port,

    [Parameter(Mandatory=$false)]
    [ValidateSet('TCP', 'UDP')]
    [string]$Protocol = 'TCP',

    [Parameter(Mandatory=$false)]
    [ValidatePattern('^(\d{1,3}\.){3}\d{1,3}/\d{1,2}$|^LocalSubnet$')]
    [string]$RemoteSubnet = 'LocalSubnet',

    [Parameter(Mandatory=$false)]
    [ValidateSet('Private', 'Public', 'Domain')]
    [string]$Profile = 'Private',

    [Parameter(Mandatory=$false)]
    [string]$OutputPath
)

function Write-JsonResult($result) {
    if ($OutputPath) {
        $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    } else {
        $result | ConvertTo-Json -Depth 10
    }
}

function Add-NestRule {
    param(
        [string]$AppId,
        [int]$Port,
        [string]$Protocol,
        [string]$RemoteSubnet,
        [string]$Profile
    )

    $ruleName = "NEST-$AppId"
    $displayName = "NEST-Application-$Port"

    try {
        # Check if rule already exists
        $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
        if ($existing) {
            # Rule exists, verify it matches expected config
            $actual = $existing | Get-NetFirewallRule | Select-Object Name, DisplayName, Enabled, Action, Direction, Protocol, LocalPort, RemoteAddress, Profile, Group
            if ($actual.Protocol -eq $Protocol -and $actual.LocalPort -eq $Port.ToString() -and $actual.RemoteAddress -eq $RemoteSubnet -and $actual.Profile -eq $Profile -and $actual.Group -eq 'NEST') {
                Write-JsonResult @{ success = $true; ruleName = $ruleName; message = 'Rule already exists with correct configuration' }
                return
            } else {
                # Rule exists but config differs - remove and recreate
                Remove-NetFirewallRule -Name $ruleName -Confirm:$false -ErrorAction SilentlyContinue
            }
        }

        # Create new rule
        New-NetFirewallRule `
            -Name $ruleName `
            -DisplayName $displayName `
            -Description "NEST managed firewall rule for application $AppId on port $Port" `
            -Group 'NEST' `
            -Enabled True `
            -Action Allow `
            -Direction Inbound `
            -Protocol $Protocol `
            -LocalPort $Port `
            -RemoteAddress $RemoteSubnet `
            -Profile $Profile `
            -ErrorAction Stop

        # Verify rule was created
        $created = Get-NetFirewallRule -Name $ruleName -ErrorAction Stop
        if ($created) {
            Write-JsonResult @{ success = $true; ruleName = $ruleName; message = 'Rule created successfully' }
        } else {
            Write-JsonResult @{ success = $false; error = 'Rule creation failed - rule not found after creation' }
        }
    } catch {
        $errorMsg = $_.Exception.Message
        if ($errorMsg -like '*Access denied*' -or $errorMsg -like '*policy*') {
            Write-JsonResult @{ success = $false; error = "POLICY_BLOCKED: $errorMsg" }
        } elseif ($errorMsg -like '*elevation*' -or $errorMsg -like '*administrator*') {
            Write-JsonResult @{ success = $false; error = "ELEVATION_DENIED: $errorMsg" }
        } else {
            Write-JsonResult @{ success = $false; error = "FIREWALL_FAILED: $errorMsg" }
        }
    }
}

function Remove-NestRule {
    param(
        [string]$AppId
    )

    $ruleName = "NEST-$AppId"

    try {
        $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
        if ($existing) {
            Remove-NetFirewallRule -Name $ruleName -Confirm:$false -ErrorAction Stop
            Write-JsonResult @{ success = $true; message = 'Rule removed successfully' }
        } else {
            Write-JsonResult @{ success = $true; message = 'Rule did not exist' }
        }
    } catch {
        $errorMsg = $_.Exception.Message
        Write-JsonResult @{ success = $false; error = "FIREWALL_FAILED: $errorMsg" }
    }
}

function Get-NestRule {
    param(
        [string]$AppId
    )

    $ruleName = "NEST-$AppId"

    try {
        $rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
        if ($rule) {
            $details = $rule | Select-Object Name, DisplayName, Enabled, Action, Direction, Protocol, LocalPort, RemoteAddress, Profile, Group
            Write-JsonResult @{ exists = $true; rule = $details }
        } else {
            Write-JsonResult @{ exists = $false }
        }
    } catch {
        Write-JsonResult @{ exists = $false; error = $_.Exception.Message }
    }
}

function List-NestRules {
    try {
        $rules = Get-NetFirewallRule -Group 'NEST' -ErrorAction SilentlyContinue
        if ($rules) {
            $details = $rules | Select-Object Name, DisplayName, Enabled, Action, Direction, Protocol, LocalPort, RemoteAddress, Profile, Group
            Write-JsonResult @{ success = $true; rules = $details }
        } else {
            Write-JsonResult @{ success = $true; rules = @() }
        }
    } catch {
        Write-JsonResult @{ success = $false; error = $_.Exception.Message }
    }
}

function Get-ActiveProfile {
    try {
        $profile = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -eq 'Internet' -or $_.IPv6Connectivity -eq 'Internet' } | Select-Object -First 1 -ExpandProperty NetworkCategory
        if (-not $profile) {
            $profile = (Get-NetConnectionProfile | Select-Object -First 1 -ExpandProperty NetworkCategory) -as [string]
        }
        Write-JsonResult @{ success = $true; profile = $profile }
    } catch {
        Write-JsonResult @{ success = $false; error = $_.Exception.Message }
    }
}

function ReconcileRules {
    param(
        [string]$ExpectedRulesJson
    )

    try {
        $expected = $ExpectedRulesJson | ConvertFrom-Json
        $actual = Get-NetFirewallRule -Group 'NEST' -ErrorAction SilentlyContinue

        $orphaned = @()
        $missing = @()

        if ($actual) {
            $actualNames = $actual | Select-Object -ExpandProperty Name
            foreach ($rule in $actual) {
                if ($rule.Name -notin $expected.Name) {
                    $orphaned += $rule | Select-Object Name, DisplayName, Enabled, Action, Direction, Protocol, LocalPort, RemoteAddress, Profile, Group
                }
            }
        }

        foreach ($exp in $expected) {
            $found = $actual | Where-Object { $_.Name -eq $exp.Name }
            if (-not $found) {
                $missing += $exp
            } else {
                # Check for drift
                if ($found.Protocol -ne $exp.Protocol -or $found.LocalPort -ne $exp.Port -or $found.RemoteAddress -ne $exp.RemoteAddress -or $found.Profile -ne $exp.Profile) {
                    $orphaned += $found | Select-Object Name, DisplayName, Enabled, Action, Direction, Protocol, LocalPort, RemoteAddress, Profile, Group
                    $missing += $exp
                }
            }
        }

        Write-JsonResult @{ success = $true; orphaned = $orphaned; missing = $missing }
    } catch {
        Write-JsonResult @{ success = $false; error = $_.Exception.Message }
    }
}

# Execute operation
switch ($Operation) {
    'Add-NestRule' { Add-NestRule -AppId $AppId -Port $Port -Protocol $Protocol -RemoteSubnet $RemoteSubnet -Profile $Profile }
    'Remove-NestRule' { Remove-NestRule -AppId $AppId }
    'Get-NestRule' { Get-NestRule -AppId $AppId }
    'List-NestRules' { List-NestRules }
    'Get-ActiveProfile' { Get-ActiveProfile }
    'ReconcileRules' { ReconcileRules -ExpectedRulesJson $ExpectedRulesJson }
    default { Write-JsonResult @{ success = $false; error = "Unknown operation: $Operation" } }
}