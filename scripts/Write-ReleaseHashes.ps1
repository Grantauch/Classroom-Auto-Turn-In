$ErrorActionPreference='Stop'
$Root=Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Dist=Join-Path $Root 'dist'
$Files=Get-ChildItem $Dist -File | Where-Object { $_.Extension -in '.exe','.yml','.blockmap' -and $_.Name -ne 'builder-debug.yml' -and -not $_.Name.StartsWith('__') } | Sort-Object Name
if(-not $Files){ throw 'No release artifacts were found in dist.' }
$Lines=@()
foreach($File in $Files){
  $Hash=(Get-FileHash -Algorithm SHA256 -Path $File.FullName).Hash.ToLowerInvariant()
  $Lines += "$Hash  $($File.Name)"
}
$Out=Join-Path $Dist 'SHA256SUMS.txt'
$Lines | Set-Content -Encoding ASCII $Out
Write-Host "Wrote SHA-256 hashes for $($Files.Count) release artifacts."
