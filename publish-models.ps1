# Our New Home - model publisher
# Drop .fbx/.glb/.gltf files into "assets\Extra Furniture\<Category folder>\",
# then double-click publish-models.bat. This script:
#   1. finds new model files and adds them to assets\models.json (existing entries are kept untouched)
#   2. commits and pushes everything to GitHub
# After the Pages deploy (~1 min), press the little refresh button in the app's Add panel.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$base = Join-Path $PSScriptRoot 'assets\Extra Furniture'
$manifestPath = Join-Path $PSScriptRoot 'assets\models.json'

# folder name -> app category + sensible fallback footprint (w x d x h in metres) + flags
$folderRules = @{
  'Sofa'     = @{ cat='Seating';  w=2.0; d=0.95; h=0.85; seat=0.42; slots=2 }
  'Chair'    = @{ cat='Seating';  w=0.7; d=0.7;  h=0.9;  seat=0.42 }
  'Bed'      = @{ cat='Beds';     w=1.7; d=2.1;  h=0.75; bed=$true; slots=2 }
  'Closets'  = @{ cat='Storage';  w=1.2; d=0.6;  h=2.0 }
  'Table'    = @{ cat='Tables';   w=1.2; d=0.7;  h=0.7;  surface=$true }
  'Kitchen'  = @{ cat='Kitchen';  w=0.7; d=0.6;  h=0.9 }
  'Bathroom' = @{ cat='Bathroom'; w=0.6; d=0.5;  h=0.9 }
  'Lamp'     = @{ cat='Decor';    w=0.4; d=0.4;  h=1.4 }
  'Decor'    = @{ cat='Decor';    w=0.35; d=0.35; h=0.35 }
  'TV'       = @{ cat='Storage';  w=1.3; d=0.1;  h=0.75; wall=$true }
  'Extra'    = @{ cat='Fun';      w=0.8; d=0.6;  h=0.9 }
}
# any other folder name becomes its own hint: unknown folders land in Decor

$existing = @()
if (Test-Path $manifestPath){
  $existing = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
$known = @{}
foreach ($e in $existing){ $known[$e.file] = $true }

$files = Get-ChildItem $base -Recurse -File -Include *.fbx,*.glb,*.gltf | Sort-Object FullName
$out = New-Object System.Collections.Generic.List[object]
foreach ($e in $existing){ $out.Add($e) }

$added = 0
foreach ($f in $files){
  $rel = $f.FullName.Substring($base.Length + 1) -replace '\\','/'
  if ($known.ContainsKey($rel)){ continue }
  if ($f.Length -gt 8MB){ Write-Host "SKIPPED (too heavy, >8 MB): $rel" -ForegroundColor Yellow; continue }
  $folder = ($rel -split '/')[0]
  $rule = $folderRules[$folder]
  if (-not $rule){ $rule = @{ cat='Decor'; w=0.5; d=0.5; h=0.5 } }
  $nice = [System.IO.Path]::GetFileNameWithoutExtension($f.Name) -replace '[_-]',' '
  $nice = (Get-Culture).TextInfo.ToTitleCase($nice.ToLower())
  if ($nice.Length -gt 20){ $nice = $nice.Substring(0,20) }
  $id = 'x_' + (($rel.ToLower() -replace '[^a-z0-9]','') -replace '(fbx|glb|gltf)$','')
  $entry = [ordered]@{ id=$id; file=$rel; name=$nice; cat=$rule.cat; w=$rule.w; d=$rule.d; h=$rule.h }
  foreach ($k in 'seat','slots','bed','wall','surface'){ if ($rule.Contains($k)){ $entry[$k] = $rule[$k] } }
  $out.Add([pscustomobject]$entry)
  $added++
  Write-Host "NEW: $rel  ->  $($rule.cat)" -ForegroundColor Green
}

if ($added -eq 0){
  Write-Host "No new models found. Nothing to publish." -ForegroundColor Cyan
} else {
  $json = ConvertTo-Json $out -Depth 5
  [System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "models.json updated with $added new model(s)." -ForegroundColor Green
  git add "assets"
  git commit -m "Add $added new furniture model(s)"
  git push origin main
  Write-Host ""
  Write-Host "Pushed! Wait ~1 minute for GitHub Pages, then press the refresh" -ForegroundColor Cyan
  Write-Host "button in the app's Add panel - Miaad's device updates by itself." -ForegroundColor Cyan
}
Write-Host ""
Read-Host "Press Enter to close"
