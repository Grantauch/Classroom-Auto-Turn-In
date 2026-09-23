$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$setup=Get-ChildItem (Join-Path $root 'dist') -Filter 'Classroom-Auto-Turn-In-Setup-0.9.26-*.exe' | Select-Object -First 1
if(-not $setup){ throw 'Installer EXE was not produced.' }

$productionTasks=@(
  'Classroom Auto Turn-In',
  'Classroom Auto Turn-In Retry 1',
  'Classroom Auto Turn-In Retry 2',
  'Classroom Auto Turn-In Retry 3',
  'Classroom Auto Turn-In Retry 4'
)
foreach($name in $productionTasks){
  if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){
    throw "Validation refused to run because a real Classroom Auto Turn-In scheduled task already exists: $name. This gate will not overwrite or delete production teacher tasks."
  }
}

# electron-builder installs per-user copies under the package name folder.
$installFolders=@('classroom-auto-turn-in','Classroom Auto Turn-In')
foreach($folder in $installFolders){
  $existingApp=Join-Path $env:LOCALAPPDATA ("Programs\$folder\Classroom Auto Turn-In.exe")
  if(Test-Path $existingApp){throw "Validation refused to run because Classroom Auto Turn-In is already installed at $existingApp. This gate will not overwrite a real teacher installation."}
}

$validationRoot=Join-Path $env:TEMP ("CATI-ReleaseValidation-"+[guid]::NewGuid().ToString('N'))
$userData=Join-Path $validationRoot 'userData'
$test1=Join-Path $validationRoot 'self-test-install.json'
$test2=Join-Path $validationRoot 'self-test-reinstall.json'
New-Item -ItemType Directory -Path $userData -Force | Out-Null
$installedByValidation=$false

function Find-AppExe {
  foreach($folder in $installFolders){
    $expected=Join-Path $env:LOCALAPPDATA ("Programs\$folder\Classroom Auto Turn-In.exe")
    if(Test-Path $expected){return $expected}
  }
  $found=Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs') -Filter 'Classroom Auto Turn-In.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if($found){return $found.FullName}
  throw 'Installed Classroom Auto Turn-In.exe could not be located under LOCALAPPDATA\Programs. The installer is required to be current-user only.'
}
function Assert-PerUserInstall([string]$exe){
  $localPrograms=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs'))
  $actual=[IO.Path]::GetFullPath($exe)
  if(-not $actual.StartsWith($localPrograms,[StringComparison]::OrdinalIgnoreCase)){
    throw "Installer did not use the current-user LOCALAPPDATA Programs location: $actual"
  }
  foreach($pf in @($env:ProgramFiles,${env:ProgramFiles(x86)})){
    if($pf -and $actual.StartsWith([IO.Path]::GetFullPath($pf),[StringComparison]::OrdinalIgnoreCase)){
      throw "Installer unexpectedly used a per-machine Program Files location: $actual"
    }
  }
}
function Invoke-SetupInstall([string]$label){
  # Hosted Windows runners can occasionally terminate a freshly-created NSIS
  # launcher with STATUS_ACCESS_VIOLATION while security scanning releases it.
  # Retry only that exact pre-install status, never any other installer failure,
  # and never retry after a partial application executable appears.
  $maxAttempts=4
  for($attempt=1;$attempt -le $maxAttempts;$attempt++){
    $p=Start-Process -FilePath $setup.FullName -ArgumentList '/S' -PassThru -Wait
    if($p.ExitCode -eq 0){return}
    if($p.ExitCode -ne -1073741819 -or $attempt -ge $maxAttempts){
      throw "$label exited $($p.ExitCode)."
    }
    foreach($folder in $installFolders){
      $candidate=Join-Path $env:LOCALAPPDATA ("Programs\$folder\Classroom Auto Turn-In.exe")
      if(Test-Path $candidate){
        throw "$label exited $($p.ExitCode) after creating a partial application executable at $candidate; validation will not retry an ambiguous install."
      }
    }
    $delaySeconds=[Math]::Min(15,5*$attempt)
    Write-Warning "$label hit transient Windows status 0xC0000005 before installing (attempt $attempt of $maxAttempts); retrying after $delaySeconds second(s)."
    Start-Sleep -Seconds $delaySeconds
  }
}
function Wait-ForUninstallCompletion([string]$appExe,[string]$uninstallExe){
  # The NSIS launcher may exit before its child process has removed the final
  # files. Starting the installer during that handoff can crash the new NSIS
  # process, so require both installed executables to disappear first.
  $deadline=[DateTime]::UtcNow.AddSeconds(30)
  while([DateTime]::UtcNow -lt $deadline){
    if(-not (Test-Path $appExe) -and -not (Test-Path $uninstallExe)){
      Start-Sleep -Seconds 3
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Uninstaller returned but installed files were still present after 30 seconds: $appExe"
}
function Run-SelfTest([string]$exe,[string]$out,[string]$isolatedUserData){
  if(Test-Path $out){Remove-Item $out -Force}
  $args=@("--self-test-file=$out","--self-test-user-data=$isolatedUserData","--self-test-browser")
  $p=Start-Process -FilePath $exe -ArgumentList $args -PassThru -Wait
  if($p.ExitCode -ne 0){throw "Packaged self-test exited $($p.ExitCode)."}
  if(-not (Test-Path $out)){throw 'Packaged self-test result file was not created.'}
  $j=Get-Content $out -Raw | ConvertFrom-Json
  if(-not $j.ok -or -not $j.packaged){throw "Packaged self-test failed: $(Get-Content $out -Raw)"}
  if(-not $j.isolatedUserData){throw 'Packaged self-test did not confirm isolated userData mode.'}
  if([IO.Path]::GetFullPath([string]$j.userData) -ne [IO.Path]::GetFullPath($isolatedUserData)){throw 'Packaged self-test escaped the isolated userData directory.'}
  if(-not $j.checks.packagedBrowserLaunch){throw 'Installed packaged app did not launch Chrome/Edge through packaged Playwright.'}
  return $j
}

try {
  Write-Host 'Installing release candidate silently as current user...'
  Invoke-SetupInstall 'Installer'
  $installedByValidation=$true
  $appExe=Find-AppExe
  Assert-PerUserInstall $appExe
  $versionInfo=(Get-Item $appExe).VersionInfo
  if([string]$versionInfo.ProductName -ne 'Classroom Auto Turn-In'){throw "Installed EXE ProductName resource is wrong: $($versionInfo.ProductName)"}
  if([string]$versionInfo.FileDescription -ne 'Classroom Auto Turn-In'){throw "Installed EXE FileDescription resource is wrong: $($versionInfo.FileDescription)"}
  if(([string]$versionInfo.FileVersion) -notlike '0.9.26*'){throw "Installed EXE FileVersion resource is wrong: $($versionInfo.FileVersion)"}

  $first=Run-SelfTest $appExe $test1 $userData
  $marker=Join-Path $userData 'data\ci-preserve-marker.txt'
  New-Item -ItemType Directory -Path (Split-Path $marker) -Force | Out-Null
  Set-Content -Path $marker -Value 'preserve-me'

  # The validation gate intentionally does not create, replace, or delete real CATI
  # scheduled tasks. If any exist, the script refuses to run before installation.
  foreach($name in $productionTasks){
    if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){
      throw "Packaged self-test unexpectedly created a production scheduled task: $name"
    }
  }

  $uninstallExe=Get-ChildItem (Split-Path $appExe) -Filter 'Uninstall*.exe' -File | Select-Object -First 1
  if(-not $uninstallExe){throw 'Uninstaller was not installed.'}
  Write-Host 'Uninstalling while preserving isolated validation data...'
  $p=Start-Process -FilePath $uninstallExe.FullName -ArgumentList '/S' -PassThru -Wait
  if($p.ExitCode -ne 0){throw "Uninstaller exited $($p.ExitCode)."}
  Wait-ForUninstallCompletion $appExe $uninstallExe.FullName
  $installedByValidation=$false
  if(-not (Test-Path $marker)){throw 'Uninstaller deleted application data; teacher data must be preserved by default.'}

  Write-Host 'Reinstalling and rerunning packaged browser self-test...'
  Invoke-SetupInstall 'Reinstaller'
  $installedByValidation=$true
  $appExe=Find-AppExe
  Assert-PerUserInstall $appExe
  $versionInfo=(Get-Item $appExe).VersionInfo
  if([string]$versionInfo.ProductName -ne 'Classroom Auto Turn-In'){throw 'Reinstalled EXE lost its ProductName resource.'}
  if(([string]$versionInfo.FileVersion) -notlike '0.9.26*'){throw 'Reinstalled EXE lost its expected FileVersion resource.'}
  $second=Run-SelfTest $appExe $test2 $userData
  if(-not (Test-Path $marker)){throw 'Isolated application-data marker was not preserved through reinstall.'}
  foreach($name in $productionTasks){
    if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){
      throw "Validation unexpectedly changed production scheduler state: $name"
    }
  }
  Write-Host 'Isolated current-user install/uninstall/reinstall + packaged-browser validation passed.'
}
catch {
  if($installedByValidation){
    try {
      foreach($folder in $installFolders){
        $candidate=Join-Path $env:LOCALAPPDATA ("Programs\$folder")
        $cleanup=Get-ChildItem $candidate -Filter 'Uninstall*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if($cleanup){Start-Process -FilePath $cleanup.FullName -ArgumentList '/S' -Wait | Out-Null}
      }
    } catch { Write-Warning 'Validation failed and best-effort cleanup could not uninstall the validation copy.' }
  }
  throw
}
finally {
  if(Test-Path $validationRoot){Remove-Item $validationRoot -Recurse -Force -ErrorAction SilentlyContinue}
}
