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
    $userProfile = [Environment]::GetFolderPath('UserProfile')
    if ([string]::IsNullOrWhiteSpace($userProfile)) {
      throw 'Cannot resolve the current user profile for Skill installation.'
    }
    $DestinationRoot = Join-Path $userProfile '.agents\skills'
  }
}

$skillNames = @(
  'orchestrate-courseware',
  'build-project-v7-courseware'
)
$manifestFileName = '.html-courseware-editor-managed-skills.json'
$sourceId = 'html-courseware-editor'

function Get-NormalizedPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $providerPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
  $fullPath = [System.IO.Path]::GetFullPath($providerPath)
  $pathRoot = [System.IO.Path]::GetPathRoot($fullPath)
  if ($fullPath.Length -gt $pathRoot.Length) {
    return $fullPath.TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  }
  return $fullPath
}

function Get-DirectorySignature {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    return $null
  }

  $root = (Resolve-Path -LiteralPath $Path).Path.TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $entries = foreach ($file in Get-ChildItem -LiteralPath $root -File -Recurse -Force | Sort-Object FullName) {
    $relativePath = $file.FullName.Substring($root.Length) -replace '^[\\/]+', ''
    $relativePath = $relativePath.Replace('\', '/')
    $stream = [System.IO.File]::OpenRead($file.FullName)
    try {
      $sha256 = [System.Security.Cryptography.SHA256]::Create()
      try {
        $hashBytes = $sha256.ComputeHash($stream)
        $hash = [System.BitConverter]::ToString($hashBytes).Replace('-', '')
      } finally {
        $sha256.Dispose()
      }
    } finally {
      $stream.Dispose()
    }
    '{0}`t{1}`t{2}' -f $relativePath, $file.Length, $hash
  }

  return [string]::Join("`n", @($entries))
}

function Remove-InstallerDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

$sourceRootPath = Get-NormalizedPath -Path $SourceRoot
$destinationRootPath = Get-NormalizedPath -Path $DestinationRoot
$separator = [System.IO.Path]::DirectorySeparatorChar

if (-not (Test-Path -LiteralPath $sourceRootPath -PathType Container)) {
  throw "Repository Skill directory not found: $sourceRootPath"
}

if ($destinationRootPath -eq [System.IO.Path]::GetPathRoot($destinationRootPath)) {
  throw 'The user Skill destination cannot be a drive root.'
}

if (
  $destinationRootPath.Equals($sourceRootPath, [System.StringComparison]::OrdinalIgnoreCase) -or
  $destinationRootPath.StartsWith($sourceRootPath + $separator, [System.StringComparison]::OrdinalIgnoreCase)
) {
  throw 'The user Skill destination cannot be the repository Skill directory or one of its children.'
}

New-Item -ItemType Directory -Path $destinationRootPath -Force | Out-Null

$manifestPath = Join-Path $destinationRootPath $manifestFileName
$managedSkillNames = @()
if (Test-Path -LiteralPath $manifestPath) {
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Managed Skill manifest path is not a file: $manifestPath"
  }
  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1 -or $manifest.source -ne $sourceId) {
      throw 'Unexpected manifest owner or schema.'
    }
    $managedSkillNames = @($manifest.skills | ForEach-Object { [string]$_ })
  } catch {
    throw "Managed Skill manifest is invalid; inspect it before retrying: $manifestPath"
  }
}

$sourceSignatures = @{}
foreach ($skillName in $skillNames) {
  $sourceSkillPath = Join-Path $sourceRootPath $skillName
  $sourceSkillEntry = Join-Path $sourceSkillPath 'SKILL.md'
  if (-not (Test-Path -LiteralPath $sourceSkillEntry -PathType Leaf)) {
    throw "Skill source is incomplete: $sourceSkillEntry"
  }

  $sourceSignatures[$skillName] = Get-DirectorySignature -Path $sourceSkillPath
  $targetSkillPath = Join-Path $destinationRootPath $skillName
  if (-not (Test-Path -LiteralPath $targetSkillPath)) {
    continue
  }

  $targetItem = Get-Item -LiteralPath $targetSkillPath -Force
  if (-not $targetItem.PSIsContainer) {
    throw "Skill destination is not a directory: $targetSkillPath"
  }
  if (($targetItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing to replace a linked Skill directory: $targetSkillPath"
  }

  $isManaged = $managedSkillNames -contains $skillName
  $matchesSource = (Get-DirectorySignature -Path $targetSkillPath) -ceq $sourceSignatures[$skillName]
  if (-not $isManaged -and -not $matchesSource) {
    throw "Refusing to overwrite an unmanaged Skill with the same name: $targetSkillPath"
  }
}

$installed = @()
$unchanged = @()
foreach ($skillName in $skillNames) {
  $sourceSkillPath = Join-Path $sourceRootPath $skillName
  $targetSkillPath = Join-Path $destinationRootPath $skillName

  if (
    (Test-Path -LiteralPath $targetSkillPath -PathType Container) -and
    (Get-DirectorySignature -Path $targetSkillPath) -ceq $sourceSignatures[$skillName]
  ) {
    $unchanged += $skillName
    continue
  }

  $operationId = [Guid]::NewGuid().ToString('N')
  $stagedSkillPath = Join-Path $destinationRootPath ('.{0}.install-{1}' -f $skillName, $operationId)
  $backupSkillPath = Join-Path $destinationRootPath ('.{0}.backup-{1}' -f $skillName, $operationId)

  try {
    Copy-Item -LiteralPath $sourceSkillPath -Destination $stagedSkillPath -Recurse -Force
    if ((Get-DirectorySignature -Path $stagedSkillPath) -cne $sourceSignatures[$skillName]) {
      throw "Staged Skill verification failed: $skillName"
    }

    if (Test-Path -LiteralPath $targetSkillPath) {
      Move-Item -LiteralPath $targetSkillPath -Destination $backupSkillPath
    }

    try {
      Move-Item -LiteralPath $stagedSkillPath -Destination $targetSkillPath
    } catch {
      if (
        -not (Test-Path -LiteralPath $targetSkillPath) -and
        (Test-Path -LiteralPath $backupSkillPath)
      ) {
        Move-Item -LiteralPath $backupSkillPath -Destination $targetSkillPath
      }
      throw
    }

    Remove-InstallerDirectory -Path $backupSkillPath
    $installed += $skillName
  } finally {
    Remove-InstallerDirectory -Path $stagedSkillPath
  }
}

$manifest = [ordered]@{
  schemaVersion = 1
  source = $sourceId
  skills = $skillNames
}
$manifestJson = ($manifest | ConvertTo-Json -Depth 3) + [Environment]::NewLine
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8WithoutBom)

if ($installed.Count -gt 0) {
  Write-Output ('[Courseware Skills] Installed/updated: ' + ($installed -join ', '))
}
if ($unchanged.Count -gt 0) {
  Write-Output ('[Courseware Skills] Already current: ' + ($unchanged -join ', '))
}
Write-Output ("[Courseware Skills] User scope: $destinationRootPath")
