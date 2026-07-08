# Our New Home - model catalog SYNC
# Drop files into (or delete them from) "assets\Extra Furniture\<Category folder>\",
# then double-click publish-models.bat. This script makes assets\models.json MATCH the
# folder exactly:
#   * new model files are ADDED
#   * files you deleted are REMOVED
#   * every item's CATEGORY always follows the folder it sits in (Art -> Art, etc.)
#   * your hand-tuned names & sizes are kept
# then it commits, pushes, waits for the GitHub Pages deploy and pings the app so both
# phones refresh by themselves (no need to press the refresh button).

param([switch]$NoPause, [switch]$DryRun)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$base         = Join-Path $PSScriptRoot 'assets\Extra Furniture'
$manifestPath = Join-Path $PSScriptRoot 'assets\models.json'
$pagesUrl     = 'https://drth7.github.io/our-new-home/assets/models.json'
$rtdb         = 'https://our-new-home-2f608-default-rtdb.firebaseio.com'
$maxMB        = 8    # GitHub Pages / practical model size limit

# folder name -> app category + fallback footprint (w x d x h, metres) + default flags for NEW files.
# lookups are case-insensitive; a folder named after any app category also just works.
$folderRules = @{
  'Sofa'     = @{ cat='Seating';  w=2.0;  d=0.95; h=0.85; seat=0.42; slots=2 }
  'Chair'    = @{ cat='Seating';  w=0.7;  d=0.7;  h=0.9;  seat=0.42 }
  'Seating'  = @{ cat='Seating';  w=0.9;  d=0.9;  h=0.9;  seat=0.42 }
  'Bed'      = @{ cat='Beds';     w=1.7;  d=2.1;  h=0.75; bed=$true; slots=2 }
  'Beds'     = @{ cat='Beds';     w=1.7;  d=2.1;  h=0.75; bed=$true; slots=2 }
  'Closets'  = @{ cat='Storage';  w=1.2;  d=0.6;  h=2.0 }
  'Storage'  = @{ cat='Storage';  w=1.0;  d=0.5;  h=1.2 }
  'Table'    = @{ cat='Tables';   w=1.2;  d=0.7;  h=0.7;  surface=$true }
  'Tables'   = @{ cat='Tables';   w=1.2;  d=0.7;  h=0.7;  surface=$true }
  'Kitchen'  = @{ cat='Kitchen';  w=0.7;  d=0.6;  h=0.9 }
  'Bathroom' = @{ cat='Bathroom'; w=0.6;  d=0.5;  h=0.9 }
  'Lamp'     = @{ cat='Decor';    w=0.4;  d=0.4;  h=1.4 }
  'Decor'    = @{ cat='Decor';    w=0.35; d=0.35; h=0.35 }
  'Art'      = @{ cat='Art';      w=0.7;  d=0.7;  h=1.65 }
  'TV'       = @{ cat='Storage';  w=1.3;  d=0.1;  h=0.75; wall=$true }
  'Extra'    = @{ cat='Fun';      w=0.8;  d=0.6;  h=0.9 }
  'Fun'      = @{ cat='Fun';      w=0.8;  d=0.6;  h=0.9 }
}
# any other folder name falls back to the Decor category.

function Get-Rule($folder){
  if ($folderRules.ContainsKey($folder)){ return $folderRules[$folder] }
  return @{ cat='Decor'; w=0.5; d=0.5; h=0.5 }
}
function New-Id($rel){
  # unique per FILE incl. its extension, so Foo.fbx and Foo.glb never collide
  'x_' + ($rel.ToLower() -replace '[^a-z0-9]','')
}
function Nice-Name($f){
  $n = [System.IO.Path]::GetFileNameWithoutExtension($f.Name) -replace '[_-]',' '
  $n = (Get-Culture).TextInfo.ToTitleCase($n.ToLower())
  if ($n.Length -gt 20){ $n = $n.Substring(0,20) }
  $n
}

# ---- read the existing manifest, keyed by file (keeps hand-tuned name/size/flags) ----
$existing = @{}
$order    = New-Object System.Collections.Generic.List[string]
if (Test-Path $manifestPath){
  foreach ($e in (Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json)){
    if (-not $existing.ContainsKey($e.file)){ $existing[$e.file] = $e; $order.Add($e.file) }
  }
}

# ---- model files on disk, minus git-ignored ones and anything too heavy for Pages ----
$allOnDisk = @(Get-ChildItem $base -Recurse -File -Include *.fbx,*.glb,*.gltf | Sort-Object FullName)
$ignored = @{}
if ($allOnDisk.Count){
  try{ (& git -C $PSScriptRoot check-ignore -- @($allOnDisk.FullName) 2>$null) | ForEach-Object { $ignored[$_] = $true } }catch{}
}
$diskFiles = [ordered]@{}   # rel path -> FileInfo
foreach ($f in $allOnDisk){
  if ($ignored.ContainsKey($f.FullName)){ Write-Host "  skip (gitignored): $($f.Name)" -ForegroundColor DarkGray; continue }
  if ($f.Length -gt ($maxMB * 1MB)){ Write-Host "  skip (>$maxMB MB): $($f.Name)" -ForegroundColor Yellow; continue }
  $rel = $f.FullName.Substring($base.Length + 1) -replace '\\','/'
  $diskFiles[$rel] = $f
}

$out     = New-Object System.Collections.Generic.List[object]
$added   = New-Object System.Collections.Generic.List[string]
$removed = New-Object System.Collections.Generic.List[string]
$usedIds = @{}

# 1) keep entries whose file still exists (original order); category always follows the folder
foreach ($rel in $order){
  if (-not $diskFiles.Contains($rel)){ $removed.Add($rel); continue }
  $e     = $existing[$rel]
  $rule  = Get-Rule (($rel -split '/')[0])
  $id    = "$($e.id)"
  if (-not $id -or $usedIds.ContainsKey($id)){ $id = New-Id $rel }   # heal any old duplicate id
  $usedIds[$id] = $true
  $entry = [ordered]@{ id=$id; file=$rel; name=$e.name; cat=$rule.cat; w=$e.w; d=$e.d; h=$e.h }
  foreach ($k in 'seat','slots','bed','wall','surface','stack','curtain'){
    if ($e.PSObject.Properties.Name -contains $k){ $entry[$k] = $e.$k }
  }
  $out.Add([pscustomobject]$entry)
}

# 2) add brand-new files
foreach ($rel in $diskFiles.Keys){
  if ($existing.ContainsKey($rel)){ continue }
  $f    = $diskFiles[$rel]
  $rule = Get-Rule (($rel -split '/')[0])
  $id   = New-Id $rel
  while ($usedIds.ContainsKey($id)){ $id = $id + 'x' }
  $usedIds[$id] = $true
  $entry = [ordered]@{ id=$id; file=$rel; name=(Nice-Name $f); cat=$rule.cat; w=$rule.w; d=$rule.d; h=$rule.h }
  foreach ($k in 'seat','slots','bed','wall','surface'){ if ($rule.Contains($k)){ $entry[$k] = $rule[$k] } }
  $out.Add([pscustomobject]$entry)
  $added.Add($rel)
}

# ---- serialise (always as a JSON array) ----
if ($out.Count -eq 0){ $json = '[]' }
elseif ($out.Count -eq 1){ $json = "[`n$(ConvertTo-Json $out[0] -Depth 5)`n]" }
else { $json = ConvertTo-Json $out -Depth 5 }

$prevJson = if (Test-Path $manifestPath){ Get-Content $manifestPath -Raw -Encoding UTF8 } else { '' }
$changed  = ($json.Trim() -ne $prevJson.Trim())

Write-Host ""
if (-not $changed){
  Write-Host "Catalog already in sync - nothing to publish." -ForegroundColor Cyan
} else {
  foreach ($r in $added){   Write-Host "  + $r" -ForegroundColor Green }
  foreach ($r in $removed){ Write-Host "  - $r" -ForegroundColor Red }
  Write-Host "models.json: +$($added.Count) added, -$($removed.Count) removed, $($out.Count) total." -ForegroundColor Green
  if ($DryRun){
    Write-Host "[DryRun] not writing / committing. Preview only." -ForegroundColor Magenta
    if (-not $NoPause){ Read-Host "Press Enter to close" }
    return
  }
  [System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))

  git add -A -- "assets"
  $staged = git status --porcelain -- "assets"
  if ($staged){
    git commit -m "Sync furniture catalog (+$($added.Count) / -$($removed.Count))" | Out-Null
    git push origin main
    Write-Host ""
    Write-Host "Pushed. Waiting for the GitHub Pages deploy..." -ForegroundColor Cyan

    # wait until Pages actually serves the new manifest, then ping the app to refresh
    $want = (($out | ForEach-Object { $_.file } | Sort-Object) -join '|')
    $live = $false
    for ($i = 0; $i -lt 50 -and -not $live; $i++){
      Start-Sleep -Seconds 3
      try{
        $rem = Invoke-RestMethod -Uri "$pagesUrl`?t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
        if ((($rem | ForEach-Object { $_.file } | Sort-Object) -join '|') -eq $want){ $live = $true }
      }catch{}
    }
    try{
      $ts   = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      $body = (@{ ts=$ts; by='update' } | ConvertTo-Json -Compress)
      Invoke-RestMethod -Method Put -Uri "$rtdb/room/catalog.json" -Body $body -ContentType 'application/json' | Out-Null
      if ($live){ Write-Host "Deploy is live - pinged the app; open phones refresh automatically." -ForegroundColor Green }
      else      { Write-Host "Pinged the app (deploy check timed out; a manual refresh may be needed shortly)." -ForegroundColor Yellow }
    }catch{ Write-Host "(couldn't ping the app - just tap the refresh button in the Add panel)" -ForegroundColor DarkGray }
  } else {
    Write-Host "Nothing staged for git - manifest already matched the repo." -ForegroundColor Cyan
  }
}

Write-Host ""
if (-not $NoPause){ Read-Host "Press Enter to close" }
