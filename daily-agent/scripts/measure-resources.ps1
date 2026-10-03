param([int]$AgentProcessId, [switch]$IncludePetUI)
$ErrorActionPreference = 'Stop'
$projectRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $projectRoot 'Daily-SetupState.ps1')
$runtimeDir = Get-DailyRuntimePath $projectRoot
$roots = @($AgentProcessId, [int](Get-Content (Join-Path $runtimeDir 'ollama.pid')))
if ($IncludePetUI -and (Test-Path (Join-Path $runtimeDir 'pet.pid'))) { $roots += [int](Get-Content (Join-Path $runtimeDir 'pet.pid')) }
$allProcesses = @(Get-CimInstance Win32_Process)
$owned = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($rootId in $roots) { [void]$owned.Add($rootId) }
do {
  $added = $false
  foreach ($item in $allProcesses) {
    if ($item.ProcessId -ne $PID -and $owned.Contains([int]$item.ParentProcessId) -and !$owned.Contains([int]$item.ProcessId)) {
      [void]$owned.Add([int]$item.ProcessId); $added = $true
    }
  }
} while ($added)
$rows = @($allProcesses | Where-Object { $owned.Contains([int]$_.ProcessId) } | Select-Object ProcessId,ParentProcessId,Name,@{n='ramBytes';e={[long]$_.WorkingSetSize}})
@{ processes=$rows; totalRamBytes=($rows | Measure-Object ramBytes -Sum).Sum; includesPetUI=[bool]$IncludePetUI; excludes='Measurement helper; includes only specified Node, Ollama, watcher and optional Pet UI process trees' } | ConvertTo-Json -Depth 5
