$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$desktopFolder = [Environment]::GetFolderPath('Desktop')
$shortcutShell = New-Object -ComObject WScript.Shell
foreach ($entry in @(@{ Name='Quoridor AI'; Extra='' }, @{ Name='Quoridor AI Stop'; Extra=' -Stop' })) {
    $shortcut = $shortcutShell.CreateShortcut((Join-Path $desktopFolder ($entry.Name + '.lnk')))
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'play.ps1') + '"' + $entry.Extra
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.Description = 'Quoridor AI local play'
    $shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ', 24'
    $shortcut.Save()
    Write-Output (Join-Path $desktopFolder ($entry.Name + '.lnk'))
}
