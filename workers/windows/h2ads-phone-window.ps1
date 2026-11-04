param(
  [Parameter(Mandatory=$true)][int]$BrowserPid,
  [int]$InstanceId = 0,
  [string]$InstanceName = "H2ADS",
  [switch]$VisualSelfTest
)
# Native WinForms smartphone appearance around the REAL Chrome window.
# Keep Chromium top-level for native keyboard focus; phone is an owned overlay.
# Never inject browser code, traffic, network settings, profile or proxy.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class H2PhoneWindowNative {
  public delegate bool EnumWindowsDelegate(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsDelegate callback, IntPtr param);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hwnd, StringBuilder text, int capacity);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rectangle rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out Rectangle rect);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hwnd,int x,int y,int w,int h,bool repaint);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int w,int h,uint flags);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetParent(IntPtr child);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW", SetLastError=true)] public static extern IntPtr GetWindowLongPtr(IntPtr hwnd,int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] public static extern IntPtr SetWindowLongPtr(IntPtr hwnd,int index,IntPtr value);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int command);
  [DllImport("user32.dll")] public static extern bool ReleaseCapture();
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr SendMessage(IntPtr hwnd,int message,IntPtr wParam,IntPtr lParam);
  public const int WM_NCLBUTTONDOWN=0x00A1;
  public const int HTCAPTION=2;
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern int SetWindowRgn(IntPtr hwnd,IntPtr region,bool redraw);
  [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd,int attribute,ref int value,int size);
  // Keep Chrome as the REAL top-level HWND so Chromium receives WM_ACTIVATE
  // and routes keyboard input to its omnibox and editable webpage controls.
  // The phone is an OWNED overlay (above Chrome), with a transparent screen hole.
  // No SetParent, thread input injection, browser engine or profile changes.
  private static readonly Dictionary<IntPtr,long> ChromeOriginalStyles = new Dictionary<IntPtr,long>();
  public static bool HostChrome(IntPtr chrome,IntPtr frame) {
    if(chrome==IntPtr.Zero || frame==IntPtr.Zero || GetParent(chrome)==frame)return false;
    long style=GetWindowLongPtr(chrome,GWL_STYLE).ToInt64();
    if((style & WS_CHILD)!=0)return false;
    long borderless=(style & ~(WS_CHILD|WS_CAPTION|WS_THICKFRAME|WS_SYSMENU|WS_MINIMIZEBOX|WS_MAXIMIZEBOX)) | WS_POPUP;
    SetWindowLongPtr(chrome,GWL_STYLE,new IntPtr(borderless));
    // GWLP_HWNDPARENT on a top-level popup sets its OWNER, not its parent.
    // The PHONE is owned by Chrome: if the optional phone exits, Chrome
    // survives. An owned phone stays above Chrome without taking its focus.
    SetWindowLongPtr(frame,GWLP_HWNDPARENT,chrome);
    if(GetWindowLongPtr(frame,GWLP_HWNDPARENT)!=chrome) {
      SetWindowLongPtr(chrome,GWL_STYLE,new IntPtr(style));
      return false;
    }
    ChromeOriginalStyles[chrome]=style;
    return true;
  }
  public static bool FitHostedChrome(IntPtr chrome,IntPtr frame,int insetX,int insetTop,int insetBottom) {
    if(chrome==IntPtr.Zero || frame==IntPtr.Zero || GetWindowLongPtr(frame,GWLP_HWNDPARENT)!=chrome)return false;
    // Both windows stay in the same physical desktop coordinates. Do not
    // reparent cross-process Chromium or mutate its internal keyboard focus.
    Rectangle frameRect,chromeRect;
    if(!GetWindowRect(frame,out frameRect) || !GetWindowRect(chrome,out chromeRect))return false;
    int screenX=frameRect.Left+insetX,screenY=frameRect.Top+insetTop;
    int screenW=frameRect.Right-frameRect.Left-2*insetX;
    int screenH=frameRect.Bottom-frameRect.Top-insetTop-insetBottom;
    if(screenW<120 || screenH<160)return false;
    // The timer must NEVER send a Win32 frame reset while the user types.
    if(chromeRect.Left==screenX && chromeRect.Top==screenY &&
       chromeRect.Right-chromeRect.Left==screenW &&
       chromeRect.Bottom-chromeRect.Top==screenH)return true;
    return SetWindowPos(chrome,IntPtr.Zero,screenX,screenY,screenW,screenH,
      SWP_NOACTIVATE|SWP_NOZORDER|SWP_NOOWNERZORDER|SWP_NOSENDCHANGING);
  }
  public static void SetPhoneGroup(IntPtr chrome,IntPtr frame,int chromeX,int chromeY,int chromeW,int chromeH,int frameX,int frameY,int frameW,int frameH) {
    if(chrome==IntPtr.Zero || frame==IntPtr.Zero)return;
    MoveWindow(frame,frameX,frameY,frameW,frameH,true);
    FitHostedChrome(chrome,frame,chromeX,chromeY,Math.Max(0,frameH-chromeY-chromeH));
  }
  public static void DetachChromeVisual(IntPtr chrome,IntPtr frame) {
    if(chrome==IntPtr.Zero)return;
    if(frame!=IntPtr.Zero && GetWindowLongPtr(frame,GWLP_HWNDPARENT)==chrome)
      SetWindowLongPtr(frame,GWLP_HWNDPARENT,IntPtr.Zero);
    long original;
    if(ChromeOriginalStyles.TryGetValue(chrome,out original)) {
      SetWindowLongPtr(chrome,GWL_STYLE,new IntPtr(original));
      SetWindowPos(chrome,IntPtr.Zero,0,0,0,0,
        SWP_NOACTIVATE|SWP_NOZORDER|SWP_NOMOVE|SWP_NOSIZE|SWP_FRAMECHANGED);
      ChromeOriginalStyles.Remove(chrome);
    }
  }
  public static bool RoundChromeWindow(IntPtr hwnd,int w,int h) {
    if(hwnd==IntPtr.Zero || w<120 || h<160 || IsZoomed(hwnd)) return false;
    // IMPORTANT: The Chrome process and PowerShell can use DIFFERENT DPI units.
    // A Win32 region sized from this companion truncated Chrome at 175% scaling.
    // Remove any old hard clip; DWM draws corners without hiding browser pixels.
    SetWindowRgn(hwnd,IntPtr.Zero,true);
    try {
      int preference=2; // DWMWCP_ROUND: ask Windows 11 for native corners.
      return DwmSetWindowAttribute(hwnd,33,ref preference,4)==0;
    } catch {
      // Older Windows: keep Chrome rectangular and FULLY visible.
      return false;
    }
  }
  public static void RestoreChromeWindow(IntPtr hwnd) {
    if(hwnd==IntPtr.Zero)return;
    SetWindowRgn(hwnd,IntPtr.Zero,true);
    try {int preference=0;DwmSetWindowAttribute(hwnd,33,ref preference,4);}catch{}
  }
  [StructLayout(LayoutKind.Sequential)] public struct Rectangle {
    public int Left, Top, Right, Bottom;
  }
  public static IntPtr FindChromeWindow(int browserPid) {
    IntPtr found=IntPtr.Zero;
    EnumWindows((hwnd,param) => {
      if(!IsWindowVisible(hwnd))return true;
      uint pid;
      GetWindowThreadProcessId(hwnd,out pid);
      if(pid!=(uint)browserPid)return true;
      var name=new StringBuilder(128);
      GetClassName(hwnd,name,name.Capacity);
      if(!name.ToString().StartsWith("Chrome_WidgetWin_"))return true;
      found=hwnd; return false;
    },IntPtr.Zero);
    return found;
  }
  public const uint SWP_NOACTIVATE=0x0010;
  public const uint SWP_NOZORDER=0x0004;
  public const uint SWP_NOMOVE=0x0002;
  public const uint SWP_NOSIZE=0x0001;
  public const uint SWP_NOOWNERZORDER=0x0200;
  public const uint SWP_NOSENDCHANGING=0x0400;
  public const uint SWP_FRAMECHANGED=0x0020;
  public const int GWL_STYLE=-16;
  public const int GWLP_HWNDPARENT=-8;
  public const long WS_CHILD=0x40000000L;
  public const long WS_POPUP=0x80000000L;
  public const long WS_CAPTION=0x00C00000L;
  public const long WS_THICKFRAME=0x00040000L;
  public const long WS_SYSMENU=0x00080000L;
  public const long WS_MINIMIZEBOX=0x00020000L;
  public const long WS_MAXIMIZEBOX=0x00010000L;
}
// WinForms native phone chassis. Its screen cutout exposes the real Chrome window.
public sealed class H2PhoneDisplayForm : System.Windows.Forms.Form {
  public H2PhoneDisplayForm() {
    DoubleBuffered=true;
    SetStyle(System.Windows.Forms.ControlStyles.UserPaint |
      System.Windows.Forms.ControlStyles.AllPaintingInWmPaint |
      System.Windows.Forms.ControlStyles.OptimizedDoubleBuffer |
      System.Windows.Forms.ControlStyles.ResizeRedraw,true);
  }
  // This is only a cosmetic overlay. Showing it must not take keyboard focus
  // from the real top-level Chrome browser.
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override System.Windows.Forms.CreateParams CreateParams {
    get {
      var props=base.CreateParams;
      props.ExStyle |= 0x00000080; // TOOLWINDOW only; never WS_EX_NOACTIVATE
      return props;
    }
  }
  private static System.Drawing.Drawing2D.GraphicsPath Rounded(float x,float y,float w,float h,float radius) {
    float d=radius*2f;
    var p=new System.Drawing.Drawing2D.GraphicsPath();
    p.AddArc(x,y,d,d,180f,90f);
    p.AddArc(x+w-d,y,d,d,270f,90f);
    p.AddArc(x+w-d,y+h-d,d,d,0f,90f);
    p.AddArc(x,y+h-d,d,d,90f,90f);
    p.CloseFigure();
    return p;
  }
  protected override void OnResize(System.EventArgs e) {
    base.OnResize(e);
    if(Width<120 || Height<200)return;
    using(var outline=Rounded(0,0,Width-1,Height-1,46f)) {
      // A real Win32 hole, not an invisible control over Chrome. Clicks and
      // typing in the screen go directly to the top-level Chrome window.
      outline.FillMode=System.Drawing.Drawing2D.FillMode.Alternate;
      outline.AddRectangle(new System.Drawing.RectangleF(20f,84f,Width-40f,Height-146f));
      var old=Region;
      Region=new System.Drawing.Region(outline);
      if(old!=null)old.Dispose();
    }
    Invalidate();
  }
  protected override void OnPaint(System.Windows.Forms.PaintEventArgs e) {
    base.OnPaint(e);
    if(Width<120 || Height<200)return;
    var g=e.Graphics;
    g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
    float w=ClientSize.Width,h=ClientSize.Height;
    // One continuous phone chassis: coherent corner radii on every layer.
    // The browser's pixels are never painted over or masked by this form.
    using(var body=Rounded(0.7f,0.7f,w-1.4f,h-1.4f,45f))
    using(var metal=new System.Drawing.Drawing2D.LinearGradientBrush(
      new System.Drawing.RectangleF(0,0,w,h),
      System.Drawing.Color.FromArgb(48,51,58),
      System.Drawing.Color.FromArgb(3,4,7),0f)) {
      g.FillPath(metal,body);
    }
    using(var rim=Rounded(2f,2f,w-4f,h-4f,43f))
    using(var edge=new System.Drawing.Pen(System.Drawing.Color.FromArgb(32,35,42),1.7f)) {
      g.DrawPath(edge,rim);
    }
    using(var glass=Rounded(5f,5f,w-10f,h-10f,41f))
    using(var dark=new System.Drawing.Drawing2D.LinearGradientBrush(
      new System.Drawing.RectangleF(5,5,w-10,h-10),
      System.Drawing.Color.FromArgb(13,15,21),
      System.Drawing.Color.FromArgb(1,2,4),90f)) {
      g.FillPath(dark,glass);
    }
    using(var inside=Rounded(8f,8f,w-16f,h-16f,38f))
    using(var shine=new System.Drawing.Pen(System.Drawing.Color.FromArgb(78,82,92),1f)) {
      g.DrawPath(shine,inside);
    }
    // Internal screen recess exactly aligned with the real Chrome HWND.
    // The status bar and Chrome remain inside this phone-safe rounded area.
    using(var screen=Rounded(20f,84f,w-40f,h-146f,28f))
    using(var back=new System.Drawing.SolidBrush(System.Drawing.Color.FromArgb(1,5,12)))
    using(var outline=new System.Drawing.Pen(System.Drawing.Color.FromArgb(52,56,66),1.3f)) {
      g.FillPath(back,screen);
      g.DrawPath(outline,screen);
    }
    // Refined satin side edges and simulated volume/power hardware keys.
    using(var side=new System.Drawing.Pen(System.Drawing.Color.FromArgb(31,34,40),1f)) {
      g.DrawLine(side,9f,135f,9f,h-141f);
      g.DrawLine(side,w-9f,141f,w-9f,h-151f);
    }
    using(var shadow=new System.Drawing.SolidBrush(System.Drawing.Color.FromArgb(28,37,58)))
    using(var hardware=new System.Drawing.SolidBrush(System.Drawing.Color.FromArgb(70,74,84))) {
      g.FillRectangle(shadow,w-9f,173f,5f,82f);
      g.FillRectangle(hardware,w-7f,178f,2.5f,72f);
      g.FillRectangle(shadow,w-9f,289f,5f,61f);
      g.FillRectangle(hardware,w-7f,294f,2.5f,51f);
    }
  }
}
'@ -ReferencedAssemblies "System.Drawing","System.Windows.Forms"

# Phone appearance: no cross-process parent change; Chrome owns the cosmetic frame.
# Chrome process, cookies, proxy, profiles and browser commands stay intact.
function RGB([int]$r,[int]$g,[int]$b) { [System.Drawing.Color]::FromArgb($r,$g,$b) }
function Set-RoundedPanelRegion($control,[int]$radius) {
  $diameter=$radius*2
  $path=New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0,0,$diameter,$diameter,180,90)
  $path.AddArc(($control.Width-$diameter),0,$diameter,$diameter,270,90)
  $path.AddArc(($control.Width-$diameter),($control.Height-$diameter),$diameter,$diameter,0,90)
  $path.AddArc(0,($control.Height-$diameter),$diameter,$diameter,90,90)
  $path.CloseFigure()
  $old=$control.Region
  $control.Region=New-Object System.Drawing.Region($path)
  if($old -ne $null){$old.Dispose()}
  $path.Dispose()
}
# Chrome is per-monitor DPI-aware. Match its DPI context before creating the
# WinForms host, so parent and hosted child report compatible client geometry.
# If Windows disallows the change, FitHostedChrome still uses host client bounds.
try { [H2PhoneWindowNative]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch {}
# Visual self-test used only by the Windows CI, never by normal instances.
if($VisualSelfTest) {
  $preview=New-Object H2PhoneDisplayForm
  $bitmap=New-Object System.Drawing.Bitmap -ArgumentList 428,915
  try {
    $preview.Size=New-Object System.Drawing.Size -ArgumentList 428,915
    $preview.CreateControl()
    $preview.DrawToBitmap($bitmap,(New-Object System.Drawing.Rectangle -ArgumentList 0,0,428,915))
    if($bitmap.Width -ne 428 -or $bitmap.Height -ne 915){throw "Phone geometry invalid"}
    Write-Output "H2ADS: smartphone body painted in Windows PowerShell 5.1"
  } finally { $bitmap.Dispose();$preview.Dispose() }
  exit 0
}

$chrome=[IntPtr]::Zero
$deadline=[DateTime]::UtcNow.AddSeconds(22)
while($chrome -eq [IntPtr]::Zero -and [DateTime]::UtcNow -lt $deadline) {
  if(-not (Get-Process -Id $BrowserPid -ErrorAction SilentlyContinue)){exit 0}
  $chrome=[H2PhoneWindowNative]::FindChromeWindow($BrowserPid)
  if($chrome -eq [IntPtr]::Zero){Start-Sleep -Milliseconds 200}
}
if($chrome -eq [IntPtr]::Zero){exit 0}
$rect=New-Object H2PhoneWindowNative+Rectangle
if(-not [H2PhoneWindowNative]::GetWindowRect($chrome,[ref]$rect)){exit 0}
$desktop=[System.Windows.Forms.Screen]::FromHandle($chrome).WorkingArea
$bezel=20
$topPad=84
$bottomPad=62
$width=[Math]::Min(392,[Math]::Max(310,$desktop.Width-2*$bezel-12))
$height=[Math]::Min(780,[Math]::Max(400,$desktop.Height-$topPad-$bottomPad-12))
$targetX=[Math]::Max($desktop.Left+$bezel+6,[Math]::Min($rect.Left,$desktop.Right-$width-$bezel-6))
$targetY=[Math]::Max($desktop.Top+$topPad+6,[Math]::Min($rect.Top,$desktop.Bottom-$height-$bottomPad-6))
[H2PhoneWindowNative]::MoveWindow($chrome,$targetX,$targetY,$width,$height,$true)|Out-Null
[H2PhoneWindowNative]::RoundChromeWindow($chrome,$width,$height)|Out-Null
$script:roundedW=$width
$script:roundedH=$height

$frame=New-Object H2PhoneDisplayForm
$frame.FormBorderStyle=[System.Windows.Forms.FormBorderStyle]::None
$frame.ShowInTaskbar=$false
$frame.StartPosition=[System.Windows.Forms.FormStartPosition]::Manual
$frame.BackColor=RGB 10 14 25
$frame.ForeColor=RGB 243 248 255
$frame.TopMost=$false
$frame.AutoScaleMode=[System.Windows.Forms.AutoScaleMode]::None
$frame.Width=$width+2*$bezel
$frame.Height=$height+$topPad+$bottomPad
$frame.Text="H2ADS - Phone visual"
$frame.Location=New-Object System.Drawing.Point(($targetX-$bezel),($targetY-$topPad))
# One single radius comes from H2PhoneDisplayForm.OnResize.
# Do not reapply a competing PowerShell region (previously radius 30 vs 46).

# Manual stopwatch is independent of browser lifetime: store a UTC anchor,
# not a running process. Every instance has its OWN durable local state.
if($InstanceId -lt 1){throw "H2ADS: InstanceId ausente no cronometro."}
$script:watchFile=Join-Path (Join-Path $env:LOCALAPPDATA "H2AdsWorker\stopwatches") ("instance-{0}.json" -f $InstanceId)
$script:watchRunning=$false
$script:watchElapsedMs=[long]0
$script:watchStartedAtMs=[long]0
if(Test-Path -LiteralPath $script:watchFile) {
  try {
    $saved=Get-Content -LiteralPath $script:watchFile -Raw | ConvertFrom-Json
    $loadedElapsed=[long]$saved.elapsedMs
    $loadedStart=[long]$saved.startedAtMs
    if($loadedElapsed -lt 0 -or $loadedStart -lt 0){throw "invalid_stopwatch_state"}
    $script:watchElapsedMs=$loadedElapsed
    $script:watchStartedAtMs=$loadedStart
    $script:watchRunning=($saved.running -eq $true -and $loadedStart -gt 0)
  } catch {
    $script:watchRunning=$false
    $script:watchElapsedMs=[long]0
    $script:watchStartedAtMs=[long]0
  }
}
function Get-H2AdsWatchNowMs { return [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) }
function Get-H2AdsWatchElapsedMs {
  $base=[long]$script:watchElapsedMs
  if(-not $script:watchRunning){return $base}
  $delta=[long]((Get-H2AdsWatchNowMs)-$script:watchStartedAtMs)
  if($delta -lt 0){$delta=0}
  return [long]($base+$delta)
}
function Format-H2AdsWatchElapsed {
  $seconds=[long][Math]::Floor((Get-H2AdsWatchElapsedMs)/1000)
  $hours=[long][Math]::Floor($seconds/3600)
  $minutes=[int][Math]::Floor(($seconds%3600)/60)
  $remainder=[int]($seconds%60)
  return ('{0:00}:{1:00}:{2:00}' -f $hours,$minutes,$remainder)
}
function Save-H2AdsWatchState {
  $directory=[System.IO.Path]::GetDirectoryName($script:watchFile)
  if(-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $payload=[ordered]@{
    running=[bool]$script:watchRunning
    elapsedMs=[long]$script:watchElapsedMs
    startedAtMs=[long]$script:watchStartedAtMs
  } | ConvertTo-Json -Compress
  $temporary="$($script:watchFile).$PID.tmp"
  try {
    [System.IO.File]::WriteAllText($temporary,$payload,([System.Text.UTF8Encoding]::new($false)))
    if(Test-Path -LiteralPath $script:watchFile) {
      [System.IO.File]::Replace($temporary,$script:watchFile,$null)
    } else {
      [System.IO.File]::Move($temporary,$script:watchFile)
    }
  } finally {
    if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue}
  }
}
function Change-H2AdsWatch([string]$action) {
  $wasRunning=$script:watchRunning
  $oldElapsed=$script:watchElapsedMs
  $oldStart=$script:watchStartedAtMs
  try {
    if($action -eq "reset") {
      $script:watchRunning=$false
      $script:watchElapsedMs=[long]0
      $script:watchStartedAtMs=[long]0
    } elseif($script:watchRunning) {
      $script:watchElapsedMs=Get-H2AdsWatchElapsedMs
      $script:watchRunning=$false
      $script:watchStartedAtMs=[long]0
    } else {
      $script:watchStartedAtMs=Get-H2AdsWatchNowMs
      $script:watchRunning=$true
    }
    Save-H2AdsWatchState
  } catch {
    $script:watchRunning=$wasRunning
    $script:watchElapsedMs=$oldElapsed
    $script:watchStartedAtMs=$oldStart
    [System.Windows.Forms.MessageBox]::Show(
      "Nao foi possivel salvar o cronometro desta instancia.",
      "H2ADS - Cronometro",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )|Out-Null
  }
}
function Get-H2AdsWatchLayout([int]$width) {
  # The clock is drawn at X=20 with Segoe UI 11pt. Measure its actual
  # glyph width instead of using a fixed X that overlaps HH:mm at 175% DPI.
  $clockFont=New-Object System.Drawing.Font -ArgumentList "Segoe UI",11,([System.Drawing.FontStyle]::Bold)
  try {
    $clockWidth=[int][Math]::Ceiling(
      [System.Windows.Forms.TextRenderer]::MeasureText("23:59",$clockFont).Width
    )
  } finally { $clockFont.Dispose() }
  $toggleX=20+$clockWidth+10
  $textX=$toggleX+17
  # Leave room for the existing camera punch-hole and reset icon.
  $resetX=[int][Math]::Floor($width/2)-29
  if(($resetX-$textX) -ge 47) {
    return @{toggleX=$toggleX; textX=$textX; resetX=$resetX; y=17; textY=16; clockY=16; hitTop=11; hitBottom=43}
  }
  # On narrow phones, put the stopwatch below the clock rather than
  # overlapping the clock or camera. The top bar remains 52px tall.
  return @{toggleX=20; textX=37; resetX=([int][Math]::Floor($width/2)-29); y=29; textY=28; clockY=3; hitTop=25; hitBottom=51}
}

# Windows PowerShell 5.1 reads UTF-8 without BOM incorrectly.
# All icons are drawn as vector geometry, never font glyphs.
$script:battery=95
$script:wifiOn=$true
$status=New-Object System.Windows.Forms.Panel
$status.Height=52
$status.Width=$frame.Width-44
$status.Location=New-Object System.Drawing.Point(22,14)
$status.BackColor=RGB 7 8 11
$status.Cursor=[System.Windows.Forms.Cursors]::Hand
Set-RoundedPanelRegion $status 24
$status.add_Paint({
  param($sender,$e)
  $g=$e.Graphics
  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $w=$sender.ClientSize.Width
  $fg=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 242 247 255)
  $pen=New-Object System.Drawing.Pen -ArgumentList (RGB 242 247 255),2
  $font=New-Object System.Drawing.Font -ArgumentList "Segoe UI",11,([System.Drawing.FontStyle]::Bold)
  $small=New-Object System.Drawing.Font -ArgumentList "Segoe UI",9,([System.Drawing.FontStyle]::Bold)
  try {
    $watchLayout=Get-H2AdsWatchLayout ([int]$w)
    $g.DrawString([DateTime]::Now.ToString("HH:mm"),$font,$fg,20,$watchLayout.clockY)
    # Stopwatch controls are PAINTED into the existing status bar, not focusable
    # WinForms buttons. They never intercept the Chrome content or keyboard.
    $sx=[int]$watchLayout.toggleX
    $sy=[int]$watchLayout.y
    if($script:watchRunning) {
      $g.FillRectangle($fg,$sx,($sy+1),4,12)
      $g.FillRectangle($fg,($sx+7),($sy+1),4,12)
    } else {
      $g.DrawLine($pen,$sx,($sy+1),($sx+11),($sy+7))
      $g.DrawLine($pen,($sx+11),($sy+7),$sx,($sy+13))
      $g.DrawLine($pen,$sx,($sy+13),$sx,($sy+1))
    }
    $watchText=Format-H2AdsWatchElapsed
    $available=[float][Math]::Max(30,($watchLayout.resetX-$watchLayout.textX-7))
    $watchFont=$font
    $measured=$g.MeasureString($watchText,$font).Width
    if($measured -gt $available) {
      $watchSize=[float][Math]::Max(7,11*$available/$measured)
      $watchFont=New-Object System.Drawing.Font -ArgumentList "Segoe UI",$watchSize,([System.Drawing.FontStyle]::Bold)
    }
    try { $g.DrawString($watchText,$watchFont,$fg,$watchLayout.textX,$watchLayout.textY) }
    finally { if($watchFont -ne $font){$watchFont.Dispose()} }
    $rx=[int]$watchLayout.resetX
    $g.DrawArc($pen,$rx,($sy+1),13,13,40,285)
    $g.DrawLine($pen,($rx+11),($sy+1),($rx+14),($sy+5))
    $g.DrawLine($pen,($rx+11),($sy+1),($rx+8),($sy+5))
    # Discreet punch-hole camera.
    $ring=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 43 53 73)
    $lens=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 2 6 14)
    $g.FillEllipse($ring,($w/2-9),16,18,18)
    $g.FillEllipse($lens,($w/2-5),20,10,10)
    $ring.Dispose();$lens.Dispose()
    # Signal bars.
    for($i=0;$i -lt 4;$i++){ $sh=4+3*$i; $g.FillRectangle($fg,($w-181+5*$i),(33-$sh),3,$sh) }
    $g.DrawString("5G",$small,$fg,($w-157),21)
    # WiFi arcs (grey when switched off).
    if(-not $script:wifiOn){$pen.Color=RGB 101 115 140}
    $g.DrawArc($pen,($w-124),19,24,17,205,130)
    $g.DrawArc($pen,($w-119),25,14,10,205,130)
    $dot=New-Object System.Drawing.SolidBrush -ArgumentList $pen.Color
    $g.FillEllipse($dot,($w-114),34,4,4)
    $dot.Dispose()
    $pen.Color=RGB 242 247 255
    # Battery icon plus readable percentage.
    $bx=$w-84
    $g.DrawRectangle($pen,$bx,19,26,13)
    $g.FillRectangle($fg,($bx+27),23,3,5)
    $bc=if($script:battery -le 20){RGB 255 166 102}else{RGB 120 238 175}
    $fill=New-Object System.Drawing.SolidBrush -ArgumentList $bc
    $g.FillRectangle($fill,($bx+2),21,(22*$script:battery/100),9)
    $fill.Dispose()
    $g.DrawString(("$($script:battery)%"),$small,$fg,($w-49),19)
  } finally { $small.Dispose();$font.Dispose();$pen.Dispose();$fg.Dispose() }
})
# Drag the WHOLE smartphone by its top bar. Keep the far-right
# Wi-Fi and battery indicators clickable. Native caption drag moves Chrome
# with its WinForms parent and does not forward input to the browser.
$status.add_MouseDown({
  param($sender,$e)
  if($e.Button -ne [System.Windows.Forms.MouseButtons]::Left){return}
  $watchLayout=Get-H2AdsWatchLayout $status.ClientSize.Width
  $watchRow=$e.Y -ge $watchLayout.hitTop -and $e.Y -le $watchLayout.hitBottom
  $watchPlay=$e.X -ge ($watchLayout.toggleX-5) -and $e.X -le ($watchLayout.toggleX+15)
  $watchReset=$e.X -ge ($watchLayout.resetX-4) -and $e.X -le ($watchLayout.resetX+18)
  if($watchRow -and ($watchPlay -or $watchReset)){return}
  if($e.X -ge ($status.ClientSize.Width-135)){return}
  [H2PhoneWindowNative]::ReleaseCapture()|Out-Null
  [H2PhoneWindowNative]::SendMessage($frame.Handle,
    [H2PhoneWindowNative]::WM_NCLBUTTONDOWN,
    [IntPtr]([H2PhoneWindowNative]::HTCAPTION),[IntPtr]::Zero)|Out-Null
})
$status.add_MouseClick({
  param($sender,$e)
  if($e.Button -ne [System.Windows.Forms.MouseButtons]::Left){return}
  $watchLayout=Get-H2AdsWatchLayout $status.ClientSize.Width
  $watchRow=$e.Y -ge $watchLayout.hitTop -and $e.Y -le $watchLayout.hitBottom
  $watchPlay=$e.X -ge ($watchLayout.toggleX-5) -and $e.X -le ($watchLayout.toggleX+15)
  $watchReset=$e.X -ge ($watchLayout.resetX-4) -and $e.X -le ($watchLayout.resetX+18)
  if($watchRow -and $watchReset){
    Change-H2AdsWatch "reset"
    $status.Invalidate()
    return
  }
  if($watchRow -and $watchPlay){
    Change-H2AdsWatch "toggle"
    $status.Invalidate()
    return
  }
  if($e.X -ge ($status.Width-90)){ $script:battery=if($script:battery -ge 100){0}else{[Math]::Min(100,$script:battery+5)} }
  elseif($e.X -ge ($status.Width-130)){ $script:wifiOn=-not $script:wifiOn }
  $status.Invalidate()
})
$status.add_MouseWheel({
  param($sender,$e)
  $change=if($e.Delta -gt 0){5}else{-5}
  $script:battery=[Math]::Max(0,[Math]::Min(100,$script:battery+$change))
  $status.Invalidate()
})
$frame.Controls.Add($status)

$footer=New-Object System.Windows.Forms.Panel
$footer.Height=52
$footer.Width=$frame.Width-44
$footer.Location=New-Object System.Drawing.Point(22,($frame.Height-60))
$footer.BackColor=RGB 6 7 10
Set-RoundedPanelRegion $footer 24
$footer.add_Paint({
  param($sender,$e)
  $g=$e.Graphics
  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $w=$sender.ClientSize.Width
  $pen=New-Object System.Drawing.Pen -ArgumentList (RGB 222 235 252),2.5
  $pill=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 222 235 252)
  try {
    # Back, home gesture bar and recent-apps icons: decorative only.
    $x=[int]($w*0.24);$y=27
    $g.DrawLine($pen,($x+6),($y-9),($x-3),$y)
    $g.DrawLine($pen,($x-3),$y,($x+6),($y+9))
    $g.FillRectangle($pill,([int]($w/2)-28),25,56,4)
    $rx=[int]($w*0.76)-9
    $g.DrawRectangle($pen,$rx,18,18,18)
  } finally {$pill.Dispose();$pen.Dispose()}
})
$frame.Controls.Add($footer)

# The phone stays visually attached with a click-through screen. Chromium
# remains top-level for native typing, while the phone is an owned overlay.
# Only geometry and window chrome change: never proxy, profile or browser PID.
$frame.CreateControl()
if(-not [H2PhoneWindowNative]::HostChrome($chrome,$frame.Handle)){ throw "H2ADS: failed to host Chrome HWND inside phone" }
$script:phoneChromeCoupled=$true
[H2PhoneWindowNative]::SetPhoneGroup($chrome,$frame.Handle,$bezel,$topPad,$width,$height,($targetX-$bezel),($targetY-$topPad),($width+2*$bezel),($height+$topPad+$bottomPad))
# Keep browser and chassis as ONE visible moving/resizing phone, even during
# native caption dragging; do not steal input focus from Chrome.
$frame.add_Move({
  if($script:phoneChromeCoupled){
    [H2PhoneWindowNative]::FitHostedChrome($chrome,$frame.Handle,$bezel,$topPad,$bottomPad)|Out-Null
  }
})
$frame.add_SizeChanged({
  if($script:phoneChromeCoupled){
    [H2PhoneWindowNative]::FitHostedChrome($chrome,$frame.Handle,$bezel,$topPad,$bottomPad)|Out-Null
  }
})

# The exposed bezel is the resize handle. The phone follows and resizes
# the same real Chrome window without changing its profile or focus.
function Set-PhoneChromeSize([int]$requestedWidth,[int]$requestedHeight) {
  $maxWidth=[Math]::Max(310,$desktop.Width-2*$bezel-12)
  $maxHeight=[Math]::Max(400,$desktop.Height-$topPad-$bottomPad-12)
  $newWidth=[Math]::Max(310,[Math]::Min($maxWidth,$requestedWidth))
  $newHeight=[Math]::Max(400,[Math]::Min($maxHeight,$requestedHeight))
  # Once Chrome is hosted, its window rect is in child/DPI coordinates.
  # The frame itself is the ONLY coordinate source for resizing.
  $newFrameX=$frame.Left
  $newFrameY=$frame.Top
  $newFrameW=$newWidth+(2*$bezel)
  $newFrameH=$newHeight+$topPad+$bottomPad
  [H2PhoneWindowNative]::SetPhoneGroup($chrome,$frame.Handle,$bezel,$topPad,$newWidth,$newHeight,$newFrameX,$newFrameY,$newFrameW,$newFrameH)
  [H2PhoneWindowNative]::RoundChromeWindow($chrome,$newWidth,$newHeight)|Out-Null
  $script:roundedW=$newWidth
  $script:roundedH=$newHeight
  $frame.Location=New-Object System.Drawing.Point($newFrameX,$newFrameY)
  $frame.Size=New-Object System.Drawing.Size(($newWidth+2*$bezel),($newHeight+$topPad+$bottomPad))
  $status.Width=$frame.Width-44
  $status.Location=New-Object System.Drawing.Point(22,14)
  Set-RoundedPanelRegion $status 24
  $footer.Width=$frame.Width-44
  $footer.Left=22
  $footer.Top=$frame.Height-60
  Set-RoundedPanelRegion $footer 24
  $status.Invalidate();$footer.Invalidate();$frame.Invalidate()
  [H2PhoneWindowNative]::SetWindowPos($frame.Handle,$chrome,$newFrameX,$newFrameY,$newFrameW,$newFrameH,
    [H2PhoneWindowNative]::SWP_NOACTIVATE -bor [H2PhoneWindowNative]::SWP_NOOWNERZORDER -bor [H2PhoneWindowNative]::SWP_NOSENDCHANGING)|Out-Null
}

$script:resizeMode=$null
$script:resizeStartX=0
$script:resizeStartY=0
$script:resizeStartW=0
$script:resizeStartH=0
$frame.add_MouseDown({
  param($sender,$e)
  if($e.Button -ne [System.Windows.Forms.MouseButtons]::Left){return}
  # The exposed upper bezel is also a drag handle; leave the resize
  # grip at the extreme right untouched.
  if($e.Y -lt $topPad -and $e.X -ge 10 -and $e.X -lt ($frame.ClientSize.Width-28)){
    [H2PhoneWindowNative]::ReleaseCapture()|Out-Null
    [H2PhoneWindowNative]::SendMessage($frame.Handle,
      [H2PhoneWindowNative]::WM_NCLBUTTONDOWN,
      [IntPtr]([H2PhoneWindowNative]::HTCAPTION),[IntPtr]::Zero)|Out-Null
    return
  }
  $right=$e.X -ge ($frame.ClientSize.Width-28)
  $bottom=$e.Y -ge ($frame.ClientSize.Height-28)
  if(-not $right -and -not $bottom){return}
  $script:resizeMode=if($right -and $bottom){"both"}elseif($right){"horizontal"}else{"vertical"}
  $script:resizeStartX=$e.X
  $script:resizeStartY=$e.Y
  $script:resizeStartW=$frame.Width
  $script:resizeStartH=$frame.Height
  $frame.Capture=$true
})
$frame.add_MouseMove({
  param($sender,$e)
  if($script:resizeMode -eq $null){
    $right=$e.X -ge ($frame.ClientSize.Width-28)
    $bottom=$e.Y -ge ($frame.ClientSize.Height-28)
    $frame.Cursor=if($right -and $bottom){[System.Windows.Forms.Cursors]::SizeNWSE}elseif($right){[System.Windows.Forms.Cursors]::SizeWE}elseif($bottom){[System.Windows.Forms.Cursors]::SizeNS}else{[System.Windows.Forms.Cursors]::Default}
    return
  }
  $frame.Cursor=if($script:resizeMode -eq "both"){[System.Windows.Forms.Cursors]::SizeNWSE}elseif($script:resizeMode -eq "horizontal"){[System.Windows.Forms.Cursors]::SizeWE}else{[System.Windows.Forms.Cursors]::SizeNS}
  $newW=$script:resizeStartW
  $newH=$script:resizeStartH
  if($script:resizeMode -eq "horizontal" -or $script:resizeMode -eq "both"){$newW=$script:resizeStartW+($e.X-$script:resizeStartX)}
  if($script:resizeMode -eq "vertical" -or $script:resizeMode -eq "both"){$newH=$script:resizeStartH+($e.Y-$script:resizeStartY)}
  Set-PhoneChromeSize ($newW-(2*$bezel)) ($newH-$topPad-$bottomPad)
})
$frame.add_MouseUp({
  param($sender,$e)
  $script:resizeMode=$null
  $frame.Capture=$false
})

$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=500
$timer.add_Tick({
  try {
    if(-not (Get-Process -Id $BrowserPid -ErrorAction SilentlyContinue)) {
      $timer.Stop();$frame.Close();return
    }
    if(-not [H2PhoneWindowNative]::IsWindowVisible($chrome) -or
       [H2PhoneWindowNative]::IsIconic($chrome)){
      $frame.Hide();return
    }
    # When maximized, return Chrome to its normal square native window.
    if([H2PhoneWindowNative]::IsZoomed($chrome)){
      if($script:roundedW -gt 0){
        [H2PhoneWindowNative]::RestoreChromeWindow($chrome)
        $script:roundedW=0;$script:roundedH=0
      }
      $frame.Hide();return
    }
    # Phone geometry is authoritative: no cross-process parenting and no
    # 175%-DPI feedback loop. Only move Chrome when geometry actually changes.
    [H2PhoneWindowNative]::FitHostedChrome($chrome,$frame.Handle,$bezel,$topPad,$bottomPad)|Out-Null
    if(-not $frame.Visible){$frame.Show()}
    $status.Invalidate()
    $frame.Invalidate()
  } catch {}
})
$frame.add_FormClosed({
  $script:phoneChromeCoupled=$false
  $timer.Stop();$timer.Dispose()
  try { [H2PhoneWindowNative]::DetachChromeVisual($chrome,$frame.Handle) } catch {}
})
$timer.Start()
[System.Windows.Forms.Application]::Run($frame)
