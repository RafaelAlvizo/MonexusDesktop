$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cache = Join-Path $rootPath '.build-tools'
$release = Join-Path $rootPath 'release'
$output = Join-Path $release 'build'
$stage = Join-Path $output ('app-' + [guid]::NewGuid().ToString('N'))
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
New-Item -ItemType Directory -Force -Path $cache,$stage | Out-Null
$sdkZip = Join-Path $cache 'webview2.zip'
$sdk = Join-Path $cache 'webview2'
if (!(Test-Path $sdkZip)) {
    Invoke-WebRequest -UseBasicParsing 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.2365.46/microsoft.web.webview2.1.0.2365.46.nupkg' -OutFile $sdkZip
}
$hash = [Security.Cryptography.SHA256]::Create()
$stream = [IO.File]::OpenRead($sdkZip)
try { $digest = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','') } finally { $stream.Dispose(); $hash.Dispose() }
if ($digest -ne '1B0146D842344B8462520FB38AD8EFF46E52031C19B955376C227BEC619FAEFD') { throw 'WebView2 package checksum mismatch.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (!(Test-Path (Join-Path $sdk 'lib\net45\Microsoft.Web.WebView2.Core.dll'))) { [IO.Compression.ZipFile]::ExtractToDirectory($sdkZip,$sdk) }
foreach ($dll in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')) { Copy-Item (Join-Path $sdk "lib\net45\$dll") $stage }
Copy-Item (Join-Path $sdk 'runtimes\win-x64\native\WebView2Loader.dll') $stage
$license = Get-ChildItem -LiteralPath $sdk -Filter 'LICENSE*' -File | Select-Object -First 1
if ($license) { Copy-Item $license.FullName (Join-Path $stage 'WebView2-LICENSE.txt') }
Copy-Item (Join-Path $rootPath 'dist') (Join-Path $stage 'web') -Recurse
$fontLicense = Join-Path $rootPath 'node_modules\@fontsource-variable\inter\LICENSE'
if (Test-Path $fontLicense) { Copy-Item $fontLicense (Join-Path $stage 'Inter-LICENSE.txt') }
$icon = Join-Path $rootPath 'desktop\icons\icon.ico'
Copy-Item (Join-Path $rootPath 'desktop\icons\icon.png') (Join-Path $stage 'Monexus.png')
$baseArgs = @('/nologo','/target:winexe','/platform:x64','/optimize+',"/win32icon:$icon",'/r:System.dll','/r:System.Core.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll')
$winmd = Join-Path $env:WINDIR 'System32\WinMetadata'
$facade = Get-ChildItem (Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL\System.Runtime\*\System.Runtime.dll') | Select-Object -First 1
$releaseVersion = if ($env:MONEXUS_RELEASE_VERSION) { $env:MONEXUS_RELEASE_VERSION } else { (Get-Content (Join-Path $rootPath 'package.json') -Raw | ConvertFrom-Json).version }
if ($releaseVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version' }
$versionSource = Join-Path $output ('version-' + [guid]::NewGuid().ToString('N') + '.cs')
[IO.File]::WriteAllText($versionSource, ('internal static class BuildVersion { public const string Value = "' + $releaseVersion + '"; }'))
$hostArgs = @("/out:$stage\Monexus.exe",$versionSource,"/r:$stage\Microsoft.Web.WebView2.Core.dll","/r:$stage\Microsoft.Web.WebView2.WinForms.dll",'/r:System.Web.Extensions.dll',"/r:$framework\System.Runtime.WindowsRuntime.dll","/r:$($facade.FullName)","/r:$winmd\Windows.Foundation.winmd","/r:$winmd\Windows.UI.winmd","/r:$winmd\Windows.Data.winmd","$rootPath\desktop\Host.cs")
& $compiler @baseArgs @hostArgs
if ($LASTEXITCODE -ne 0) { throw 'Windows host compilation failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$payload = Join-Path $output ('payload-' + [guid]::NewGuid().ToString('N') + '.zip')
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$payload,[IO.Compression.CompressionLevel]::Optimal,$false)
$installer = Join-Path $release 'Monexus-Workspace-Setup-x64.exe'
$setupArgs = @("/out:$installer",$versionSource,'/r:System.Web.Extensions.dll',"/resource:$payload,payload",'/r:Microsoft.CSharp.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll',"$rootPath\desktop\Setup.cs")
& $compiler @baseArgs @setupArgs
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
Get-Item $installer | Select-Object FullName,Length
