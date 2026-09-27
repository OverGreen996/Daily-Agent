$ErrorActionPreference='Stop'
$secretInput=Read-Host 'Paste your Tavily API key (hidden; Enter to cancel)' -AsSecureString
$secretPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretInput)
try {
 $searchKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)
 if ([string]::IsNullOrWhiteSpace($searchKey)) { Write-Output 'Cancelled. No changes.'; return }
 if ($searchKey -notmatch '^tvly-[A-Za-z0-9_-]{10,}$') {throw 'Unexpected API key format; nothing saved.'}
 $targetFile=Join-Path $PSScriptRoot 'daily-agent\.env.local'
 $existing=if(Test-Path -LiteralPath $targetFile){@(Get-Content -LiteralPath $targetFile | Where-Object {$_ -notmatch '^\s*(TAVILY_API_KEY|DAILY_SEARCH_PROVIDER|DAILY_SEARCH_MONTHLY_LIMIT)\s*='})}else{@()}
 $text=($existing+@('DAILY_SEARCH_PROVIDER=tavily',('TAVILY_API_KEY='+$searchKey),'DAILY_SEARCH_MONTHLY_LIMIT=900')) -join "`n"
 [IO.File]::WriteAllText($targetFile,$text+"`n",[Text.UTF8Encoding]::new($false))
 Write-Output 'Search configured locally. The key is saved in daily-agent/.env.local (excluded from Git).'
 Write-Output 'Basic search only; local cap: 900 API requests/month. No billing settings were changed.'
 Write-Output 'Restart Daily Agent with Stop-DailyAgent.ps1, then Start-DailyAgent.ps1.'
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)
 $searchKey=$null
 $text=$null
}
