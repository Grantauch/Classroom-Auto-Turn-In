$ErrorActionPreference='Stop'
$productionTasks=@(
  'Classroom Auto Turn-In',
  'Classroom Auto Turn-In Retry 1',
  'Classroom Auto Turn-In Retry 2',
  'Classroom Auto Turn-In Retry 3',
  'Classroom Auto Turn-In Retry 4'
)
foreach($name in $productionTasks){
  if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){
    throw "Release validation refused to start because a real CATI scheduled task exists: $name"
  }
}
# electron-builder installs per-user copies under the package name folder.
foreach($folder in @('classroom-auto-turn-in','Classroom Auto Turn-In')){
  $installed=Join-Path $env:LOCALAPPDATA ("Programs\$folder\Classroom Auto Turn-In.exe")
  if(Test-Path $installed){
    throw "Release validation refused to start because Classroom Auto Turn-In is already installed at $installed"
  }
}
Write-Host 'Release-validation environment is isolated: no installed CATI app or production CATI scheduled tasks were found.'
