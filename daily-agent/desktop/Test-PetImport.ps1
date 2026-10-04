param([string]$Atlas,[string]$OutputDirectory)
$ErrorActionPreference='Stop'
$project=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if(!$Atlas){$Atlas=Join-Path $PSScriptRoot 'assets\lumi\spritesheet.png'}
if(!$OutputDirectory){$OutputDirectory=Join-Path $project ('daily-agent\test-output\pet-import-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$exe=@(& (Join-Path $PSScriptRoot 'Build-Pet.ps1'))[-1]
$process=Start-Process -FilePath $exe -ArgumentList @(('"'+$project+'"'),'http://127.0.0.1:3293','--pet-import-test',('"'+$OutputDirectory+'"'),('"'+[IO.Path]::GetFullPath($Atlas)+'"')) -WindowStyle Hidden -Wait -PassThru
$report=Get-Content -LiteralPath (Join-Path $OutputDirectory 'pet-quick-import-test.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($process.ExitCode -ne 0 -or !$report.passed){throw ('PET quick import failed: '+$report.error)}
Write-Output ('PASS: '+$report.checks.Count+' checks; '+$OutputDirectory)
