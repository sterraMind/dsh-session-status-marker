<#
.SYNOPSIS
    Exercise the session-status-marker HTTP surface of a running DSH web host.

.DESCRIPTION
    Runs the integration loop against a live `dsh --profile <name> --no-open
    --port <port>` instance: unauthenticated rejection, argument validation,
    set/get/list round-trip, and clear. Every step prints a PASS/FAIL line and
    the script exits non-zero when any step fails.

    The token is never stored in this file: pass the one-time token printed by
    the host startup banner (`dsh web: http://127.0.0.1:<port>/?token=...`).

.PARAMETER BaseUrl
    Host root, e.g. http://127.0.0.1:3099

.PARAMETER Token
    One-time access token from the startup banner.

.PARAMETER SessionId
    Arbitrary session id used for the round-trip; the storage domain does not
    require the session to exist.

.EXAMPLE
    .\check-http.ps1 -BaseUrl http://127.0.0.1:3099 -Token $env:DSH_SMOKE_TOKEN -SessionId smoke-1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$Token,
    [string]$SessionId = 'smoke-session-1'
)

$ErrorActionPreference = 'Stop'
$failed = 0

function Report([string]$Name, [bool]$Ok, [string]$Detail) {
    if ($Ok) { Write-Output ("PASS  " + $Name + "  " + $Detail) }
    else { Write-Output ("FAIL  " + $Name + "  " + $Detail); $script:failed++ }
}

function Invoke-Raw([string]$Uri, [string]$Method = 'GET', [string]$Body = $null, [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null) {
    $params = @{ Uri = $Uri; Method = $Method; UseBasicParsing = $true; ErrorAction = 'Stop' }
    if ($null -ne $Session) { $params.WebSession = $Session }
    if ($null -ne $Body) {
        $params.Body = $Body
        $params.ContentType = 'application/json'
    }
    try {
        $response = Invoke-WebRequest @params
        return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = $response.Content; Threw = $false }
    }
    catch {
        $status = 0
        if ($null -ne $_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        return [pscustomobject]@{ Status = $status; Body = ''; Threw = $true }
    }
}

# Establish an authorised session by visiting the tokenised root first.
$root = Invoke-WebRequest -Uri ("$BaseUrl/?token=" + [uri]::EscapeDataString($Token)) -SessionVariable sess -UseBasicParsing
Report 'bootstrap' ($root.StatusCode -eq 200) ("index=" + $root.Content.Length + "B")

$state = "$BaseUrl/api/session-status-marker.state"
$list = "$BaseUrl/api/session-status-marker.list"
$mutate = "$BaseUrl/api/session-status-marker.mutate"

$anon = Invoke-Raw -Uri ($state + '?sessionId=' + [uri]::EscapeDataString($SessionId))
Report 'unauthenticated-401' ($anon.Status -eq 401) ("status=" + $anon.Status)

$missing = Invoke-Raw -Uri $state -Session $sess
Report 'missing-sessionId-400' ($missing.Status -eq 400) ("status=" + $missing.Status)

$setBody = '{"action":"set","sessionId":"' + $SessionId + '","status":"todo","source":"manual","note":"integration smoke"}'
$set = Invoke-Raw -Uri $mutate -Method POST -Body $setBody -Session $sess
Report 'set' ($set.Status -eq 200) ("status=" + $set.Status + " body=" + $set.Body)

$read = Invoke-Raw -Uri ($state + '?sessionId=' + [uri]::EscapeDataString($SessionId)) -Session $sess
$mark = $null
if ($read.Status -eq 200) { $mark = ($read.Body | ConvertFrom-Json).mark }
Report 'get-after-set' ($null -ne $mark -and $mark.status -eq 'todo' -and $mark.source -eq 'manual') ("status=" + $read.Status)

$all = Invoke-Raw -Uri $list -Session $sess
$found = $false
if ($all.Status -eq 200) {
    $found = @(($all.Body | ConvertFrom-Json).marks | Where-Object { $_.sessionId -eq $SessionId }).Count -ge 1
}
Report 'list-contains' ($all.Status -eq 200 -and $found) ("status=" + $all.Status)

$clear = Invoke-Raw -Uri $mutate -Method POST -Body ('{"action":"clear","sessionId":"' + $SessionId + '"}') -Session $sess
Report 'clear' ($clear.Status -eq 200) ("status=" + $clear.Status + " body=" + $clear.Body)

$after = Invoke-Raw -Uri ($state + '?sessionId=' + [uri]::EscapeDataString($SessionId)) -Session $sess
$afterMark = $null
if ($after.Status -eq 200) { $afterMark = ($after.Body | ConvertFrom-Json).mark }
Report 'get-after-clear' ($null -eq $afterMark) ("status=" + $after.Status)

if ($failed -gt 0) {
    Write-Output ("RESULT: " + $failed + " step(s) failed")
    exit 1
}
Write-Output 'RESULT: all steps passed'
exit 0