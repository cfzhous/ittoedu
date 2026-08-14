[CmdletBinding()]
param(
  [string]$SourceRoot,
  [string]$DestinationRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Join-Path $projectRoot '.agents\skills'
}
if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
  if (-not [string]::IsNullOrWhiteSpace($env:COURSEWARE_SKILLS_DESTINATION)) {
    $DestinationRoot = $env:COURSEWARE_SKILLS_DESTINATION
  } else {
    $profileRoot = [Environment]::GetFolderPath('UserProfile')
    if ([string]::IsNullOrWhiteSpace($profileRoot)) {
      throw 'Cannot resolve the current user profile.'
    }
    $DestinationRoot = Join-Path $profileRoot '.agents\skills'
  }
}

$currentSkillNames = @('orchestrate-courseware', 'build-courseware-project')
$retiredSkillNames = @('build-project-v8-courseware', 'build-project-v7-courseware')

function Get-NormalizedPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $providerPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
  return [System.IO.Path]::GetFullPath($providerPath).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
}

function Test-PathInside {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )
  $separator = [System.IO.Path]::DirectorySeparatorChar
  return $Path.StartsWith($Root + $separator, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-PlainDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw "$Label is not a directory: $Path"
  }
  $linked = Get-ChildItem -LiteralPath $Path -Recurse -Force |
    Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 } |
    Select-Object -First 1
  $rootItem = Get-Item -LiteralPath $Path -Force
  if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or $null -ne $linked) {
    throw "$Label cannot contain linked entries: $Path"
  }
}

$source = Get-NormalizedPath -Path $SourceRoot
$destination = Get-NormalizedPath -Path $DestinationRoot
if ($source.Equals($destination, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'SourceRoot and DestinationRoot must be different directories.'
}
Assert-PlainDirectory -Path $source -Label 'Skill source root'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Assert-PlainDirectory -Path $destination -Label 'Skill destination root'

$transactionRoot = Get-NormalizedPath -Path (Join-Path $destination ('.ittoedu-skill-install-' + [Guid]::NewGuid().ToString('N')))
if (-not (Test-PathInside -Path $transactionRoot -Root $destination)) {
  throw 'Installer staging path escaped the destination root.'
}
New-Item -ItemType Directory -Path $transactionRoot | Out-Null

try {
  foreach ($name in $currentSkillNames) {
    $sourceSkill = Get-NormalizedPath -Path (Join-Path $source $name)
    if (-not (Test-PathInside -Path $sourceSkill -Root $source)) {
      throw "Skill source escaped SourceRoot: $name"
    }
    Assert-PlainDirectory -Path $sourceSkill -Label "Skill source '$name'"
    if (-not (Test-Path -LiteralPath (Join-Path $sourceSkill 'SKILL.md') -PathType Leaf)) {
      throw "Skill source has no SKILL.md: $name"
    }
    Copy-Item -LiteralPath $sourceSkill -Destination $transactionRoot -Recurse
  }

  foreach ($name in @($currentSkillNames) + @($retiredSkillNames)) {
    $target = Get-NormalizedPath -Path (Join-Path $destination $name)
    if (-not (Test-PathInside -Path $target -Root $destination)) {
      throw "Skill target escaped DestinationRoot: $name"
    }
    if (Test-Path -LiteralPath $target) {
      $targetItem = Get-Item -LiteralPath $target -Force
      if (($targetItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing to replace a linked Skill target: $target"
      }
      Remove-Item -LiteralPath $target -Recurse -Force
    }
  }

  foreach ($name in $currentSkillNames) {
    Move-Item -LiteralPath (Join-Path $transactionRoot $name) -Destination (Join-Path $destination $name)
  }
} finally {
  if (Test-Path -LiteralPath $transactionRoot) {
    Remove-Item -LiteralPath $transactionRoot -Recurse -Force
  }
}

Write-Output ('Installed: ' + ($currentSkillNames -join ', '))
Write-Output ('Removed retired Skill paths when present: ' + ($retiredSkillNames -join ', '))
Write-Output ('Destination: ' + $destination)
