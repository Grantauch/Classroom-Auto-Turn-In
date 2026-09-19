'use strict';
// Mock Windows ScheduledTasks cmdlets for release checks. The functions shadow
// the real cmdlets inside a PowerShell process, keep their state in a JSON
// file, and then switch the session to Constrained Language Mode so the app's
// own scripts are proven to work where district policy locks PowerShell down.
// Never packaged into the teacher installer.
function buildPrelude(registryPath, { constrained = true } = {}) {
  const body = String.raw`
$ErrorActionPreference='Stop'
Import-Module Microsoft.PowerShell.Utility,Microsoft.PowerShell.Management
# The real ScheduledTasks module must never load inside a check.
$PSModuleAutoLoadingPreference='None'
$global:CatiRegistry='${registryPath.replace(/'/g, "''")}'
function Read-CatiTasks { $j=Get-Content -Raw -LiteralPath $global:CatiRegistry; $o=ConvertFrom-Json $j; $h=@{}; foreach($p in $o.PSObject.Properties){$h[$p.Name]=$p.Value}; return $h }
function Write-CatiTasks($h){ ($h | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $global:CatiRegistry -Encoding UTF8 }
function New-ScheduledTaskAction { [CmdletBinding()] param([Parameter(Mandatory)][string]$Execute,[string]$Argument) [pscustomobject]@{Execute=$Execute;Arguments=$Argument} }
function New-ScheduledTaskTrigger { [CmdletBinding()] param([switch]$Weekly,[int]$WeeksInterval=1,[System.DayOfWeek[]]$DaysOfWeek,[Parameter(Mandatory)][datetime]$At,[switch]$Once)
  if($Weekly -eq $Once){ throw 'exactly one of -Weekly or -Once is required' }
  $mask=0; foreach($d in @($DaysOfWeek)){ if($null -ne $d){ $mask = $mask -bor (1 -shl [int]$d) } }
  if($Weekly -and $mask -eq 0){ throw 'weekly trigger needs days' }
  [pscustomobject]@{Kind=$(if($Weekly){'Weekly'}else{'Once'});StartBoundary=('S|'+$At.ToString('yyyy-MM-ddTHH:mm:ss'));DaysOfWeek=$mask;WeeksInterval=$WeeksInterval} }
function New-ScheduledTaskPrincipal { [CmdletBinding()] param([Parameter(Mandatory)][string]$UserId,[ValidateSet('Interactive','S4U','Password')][string]$LogonType,[ValidateSet('Limited','Highest')][string]$RunLevel)
  if($UserId -notmatch '\S'){ throw 'empty user id' }
  [pscustomobject]@{UserId=$UserId;LogonType=$LogonType;RunLevel=$RunLevel} }
function New-ScheduledTaskSettingsSet { [CmdletBinding()] param([switch]$StartWhenAvailable,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,[timespan]$ExecutionTimeLimit,[ValidateSet('Parallel','Queue','IgnoreNew','StopExisting')][string]$MultipleInstances)
  [pscustomobject]@{StartWhenAvailable=[bool]$StartWhenAvailable;DisallowStartIfOnBatteries=-not $AllowStartIfOnBatteries;StopIfGoingOnBatteries=-not $DontStopIfGoingOnBatteries;ExecutionTimeLimitMinutes=$ExecutionTimeLimit.TotalMinutes;MultipleInstances=$MultipleInstances} }
function Register-ScheduledTask { [CmdletBinding()] param([Parameter(Mandatory)][string]$TaskName,$Action,$Trigger,$Principal,$Settings,[switch]$Force)
  $t=Read-CatiTasks
  if($t.ContainsKey($TaskName) -and -not $Force){ throw 'task exists' }
  $t[$TaskName]=[pscustomobject]@{TaskName=$TaskName;State='Ready';Actions=@($Action);Triggers=@($Trigger);Principal=$Principal;Settings=$Settings}
  Write-CatiTasks $t
  [pscustomobject]@{TaskName=$TaskName} }
function Get-ScheduledTask { [CmdletBinding()] param([string]$TaskName)
  $t=Read-CatiTasks
  if(-not $t.ContainsKey($TaskName)){ Write-Error "No MSFT_ScheduledTask objects found with property 'TaskName' equal to '$TaskName'."; return }
  $x=$t[$TaskName]; $tr=@($x.Triggers|ForEach-Object{[pscustomobject]@{StartBoundary=([string]$_.StartBoundary).Substring(2);DaysOfWeek=$_.DaysOfWeek}})
  [pscustomobject]@{TaskName=$x.TaskName;State=$x.State;Actions=@($x.Actions);Triggers=$tr} }
function Get-ScheduledTaskInfo { [CmdletBinding()] param([Parameter(Mandatory)][string]$TaskName)
  $t=Read-CatiTasks
  if(-not $t.ContainsKey($TaskName)){ throw "missing $TaskName" }
  [pscustomobject]@{NextRunTime=(Get-Date).AddHours(1);LastRunTime=(Get-Date '1999-11-30');LastTaskResult=267011;NumberOfMissedRuns=0} }
function Unregister-ScheduledTask { [CmdletBinding(SupportsShouldProcess)] param([Parameter(Mandatory)][string]$TaskName)
  $t=Read-CatiTasks
  if(-not $t.ContainsKey($TaskName)){ throw "missing $TaskName" }
  $t.Remove($TaskName); Write-CatiTasks $t }
if(-not $env:USERDOMAIN){ $env:USERDOMAIN='CATI-TEST' }
if(-not $env:USERNAME){ $env:USERNAME='teacher' }
$ExecutionContext.SessionState.LanguageMode='ConstrainedLanguage'
`;
  return constrained ? body : body.replace(/^\$ExecutionContext\.SessionState\.LanguageMode=.*$/m, '');
}
module.exports = { buildPrelude };
