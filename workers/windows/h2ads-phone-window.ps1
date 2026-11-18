param(
  [Parameter(Mandatory=$true)][int]$BrowserPid,
  [int]$InstanceId = 0,
  [string]$InstanceName = "H2ADS",
  [string]$RefreshPolicyPath = "",
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
using System.Windows.Automation;
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
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageTimeout(
    IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeoutMs, out IntPtr result);
  // Winuser.h: APPCOMMAND_BROWSER_REFRESH = 3; 15 is LAUNCH_MAIL and
  // incorrectly opens Outlook. Keep the symbolic name to prevent regression.
  private const int APPCOMMAND_BROWSER_REFRESH = 3;
  // Capture the selected tab's UIA RuntimeId, not its URL or page title.
  // This distinguishes two open tabs showing the same website.
  public static string SelectedChromeTabIdentity(IntPtr chrome) {
    if(chrome==IntPtr.Zero || !IsWindowVisible(chrome) || IsIconic(chrome))return null;
    try {
      var root=AutomationElement.FromHandle(chrome);
      if(root==null)return null;
      var condition=new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.TabItem);
      var tabs=root.FindAll(TreeScope.Descendants,condition);
      string selected=null;
      for(int i=0;i<tabs.Count;i++) {
        object pattern;
        if(!tabs[i].TryGetCurrentPattern(SelectionItemPattern.Pattern,out pattern))continue;
        if(!((SelectionItemPattern)pattern).Current.IsSelected)continue;
        int[] id=tabs[i].GetRuntimeId();
        if(id==null || id.Length==0 || selected!=null)return null;
        selected=string.Join(".",id);
      }
      return selected;
    } catch { return null; }
  }
  public static bool RefreshBrowserPage(IntPtr chrome) {
    if (chrome==IntPtr.Zero || !IsWindowVisible(chrome) || IsIconic(chrome)) return false;
    // WM_APPCOMMAND browser refresh. Never activate another app, synthesize
    // keyboard keys, modify browser settings, or steal Chrome input focus.
    IntPtr result;
    return SendMessageTimeout(chrome, 0x0319, chrome, new IntPtr(APPCOMMAND_BROWSER_REFRESH << 16),
      0x0002, 1000, out result) != IntPtr.Zero;
  }
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
// The native status is animated only when its visible values change.
// Default WinForms Panel paints directly to screen and visibly flickers when
// the PowerShell timer invalidates it repeatedly. Draw into a back buffer.
public sealed class H2PhoneStatusPanel : System.Windows.Forms.Panel {
  public H2PhoneStatusPanel() {
    SetStyle(System.Windows.Forms.ControlStyles.AllPaintingInWmPaint |
      System.Windows.Forms.ControlStyles.UserPaint |
      System.Windows.Forms.ControlStyles.OptimizedDoubleBuffer |
      System.Windows.Forms.ControlStyles.ResizeRedraw, true);
    DoubleBuffered=true;
  }
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
      outline.AddRectangle(new System.Drawing.RectangleF(20f,144f,Width-40f,Height-206f));
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
      System.Drawing.Color.FromArgb(28,32,39),
      System.Drawing.Color.FromArgb(3,4,7),0f)) {
      g.FillPath(metal,body);
    }
    using(var rim=Rounded(2f,2f,w-4f,h-4f,43f))
    using(var edge=new System.Drawing.Pen(System.Drawing.Color.FromArgb(112,119,132),2.8f)) {
      g.DrawPath(edge,rim);
    }
    // Delicate secondary graphite ring makes the casing visually thicker.
    using(var lip=Rounded(6f,6f,w-12f,h-12f,40f))
    using(var lipInk=new System.Drawing.Pen(System.Drawing.Color.FromArgb(17,20,25),3.4f)) {
      g.DrawPath(lipInk,lip);
    }
    using(var glass=Rounded(5f,5f,w-10f,h-10f,41f))
    using(var dark=new System.Drawing.Drawing2D.LinearGradientBrush(
      new System.Drawing.RectangleF(5,5,w-10,h-10),
      System.Drawing.Color.FromArgb(5,6,9),
      System.Drawing.Color.FromArgb(1,2,4),90f)) {
      g.FillPath(dark,glass);
    }
    using(var inside=Rounded(8f,8f,w-16f,h-16f,38f))
    using(var shine=new System.Drawing.Pen(System.Drawing.Color.FromArgb(78,82,92),1f)) {
      g.DrawPath(shine,inside);
    }
    // Internal screen recess exactly aligned with the real Chrome HWND.
    // The status bar and Chrome remain inside this phone-safe rounded area.
    using(var screen=Rounded(20f,144f,w-40f,h-206f,28f))
    using(var back=new System.Drawing.SolidBrush(System.Drawing.Color.FromArgb(1,5,12)))
    using(var outline=new System.Drawing.Pen(System.Drawing.Color.FromArgb(91,97,109),1.8f)) {
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
'@ -ReferencedAssemblies "System.Drawing","System.Windows.Forms","UIAutomationClient","UIAutomationTypes"

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
$topPad=144
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
$frame.BackColor=RGB 0 0 2
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
# AUTO is configured and activated DIRECTLY in this open phone instance.
# Existing ADM policy is only a fallback for older local preferences. Local
# settings are saved by InstanceId and never touch the Chrome/proxy profile.
$script:refreshEnabled=$false
$script:refreshSeconds=0
$script:refreshNextAtMs=[long]0
$script:refreshPolicyReadAtMs=[long]0
$script:refreshConfiguredLocally=$false
$script:refreshDialogOpen=$false
$script:refreshTabIdentity=$null
$script:refreshCycles=[long]0
$script:refreshToggleFile=Join-Path (Join-Path $env:LOCALAPPDATA "H2AdsWorker\stopwatches") ("instance-{0}-auto-refresh.json" -f $InstanceId)
if(Test-Path -LiteralPath $script:refreshToggleFile) {
  try {
    $saved=Get-Content -LiteralPath $script:refreshToggleFile -Raw | ConvertFrom-Json
    $script:refreshEnabled=($saved.enabled -eq $true)
    # The legacy file contained only "enabled". In that case the existing
    # remote policy can still seed the old configured interval once.
    if($null -ne $saved.intervalSeconds) {
      $rawSeconds=([string]$saved.intervalSeconds).Trim()
      if($rawSeconds -notmatch '^\d+$'){throw "invalid_auto_refresh_interval"}
      $localSeconds=[int]$rawSeconds
      if($localSeconds -ne 0 -and ($localSeconds -lt 30 -or $localSeconds -gt 86400)){
        throw "invalid_auto_refresh_interval"
      }
      $script:refreshSeconds=$localSeconds
      $script:refreshConfiguredLocally=$true
      if($localSeconds -eq 0){$script:refreshEnabled=$false}
      if($null -ne $saved.cycles) {
        $loadedCycles=[long]$saved.cycles
        if($loadedCycles -lt 0){throw "invalid_auto_refresh_cycles"}
        $script:refreshCycles=$loadedCycles
      }
    }
  } catch {
    # Invalid local settings never start background refreshes by accident.
    $script:refreshEnabled=$false
    $script:refreshSeconds=0
    $script:refreshConfiguredLocally=$false
    $script:refreshCycles=[long]0
  }
}
function Save-H2AdsRefreshToggle {
  $directory=[System.IO.Path]::GetDirectoryName($script:refreshToggleFile)
  if(-not (Test-Path -LiteralPath $directory)){
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  # Local override has priority over the read-only ADM fallback. Keep this
  # separate from the existing stopwatch JSON to protect that timer.
  $payload=([ordered]@{
    enabled=[bool]$script:refreshEnabled
    intervalSeconds=[int]$script:refreshSeconds
    cycles=[long]$script:refreshCycles
    source="instance-window"
  } | ConvertTo-Json -Compress)
  $temporary="$($script:refreshToggleFile).$PID.tmp"
  try {
    [System.IO.File]::WriteAllText($temporary,$payload,([System.Text.UTF8Encoding]::new($false)))
    if(Test-Path -LiteralPath $script:refreshToggleFile){
      try {
        [System.IO.File]::Replace($temporary,$script:refreshToggleFile,$null)
      } catch {
        [System.IO.File]::Copy($temporary,$script:refreshToggleFile,$true)
        [System.IO.File]::Delete($temporary)
      }
    } else {
      [System.IO.File]::Move($temporary,$script:refreshToggleFile)
    }
  } finally {
    if(Test-Path -LiteralPath $temporary){
      Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
  }
}
function Read-H2AdsRefreshPolicy {
  # A time edited inside the open phone must NOT be overwritten by the
  # background worker's 10-second ADM synchronization.
  if($script:refreshConfiguredLocally){return}
  if([string]::IsNullOrWhiteSpace($RefreshPolicyPath)){return}
  try {
    if(-not (Test-Path -LiteralPath $RefreshPolicyPath)){return}
    $policy=Get-Content -LiteralPath $RefreshPolicyPath -Raw | ConvertFrom-Json
    if([int]$policy.instanceId -ne $InstanceId){return}
    $seconds=[int]$policy.intervalSeconds
    if($seconds -ne 0 -and ($seconds -lt 30 -or $seconds -gt 86400)){return}
    if($seconds -ne $script:refreshSeconds){
      $script:refreshSeconds=$seconds
      $script:refreshNextAtMs=0
    }
    if($seconds -eq 0 -and $script:refreshEnabled){
      $script:refreshEnabled=$false
      # Do not persist a remote policy as a local override.
    }
  } catch {
    # Invalid/partial worker settings do not interrupt Chrome.
  }
}
function Set-H2AdsRefreshSettings([int]$seconds,[bool]$enabled) {
  if($seconds -ne 0 -and ($seconds -lt 30 -or $seconds -gt 86400)){return $false}
  # Bind to the selected Chrome tab at the EXACT moment of configuration.
  $tabId=$null
  if($seconds -gt 0){
    $tabId=[H2PhoneWindowNative]::SelectedChromeTabIdentity($chrome)
    if([string]::IsNullOrWhiteSpace($tabId)){
      [System.Windows.Forms.MessageBox]::Show(
        "Nao foi possivel identificar a aba selecionada do Chrome. Nada sera atualizado. Selecione a aba desejada e configure novamente.",
        "H2ADS - Selecao da aba",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      )|Out-Null
      return $false
    }
  }
  $oldSeconds=$script:refreshSeconds
  $oldEnabled=$script:refreshEnabled
  $oldLocal=$script:refreshConfiguredLocally
  $oldNext=$script:refreshNextAtMs
  $oldTab=$script:refreshTabIdentity
  $oldCycles=[long]$script:refreshCycles
  try {
    # A fresh AUTO session or DESATIVAR starts the cycle counter at zero.
    # Saving a paused interval preserves the accumulated cycles.
    if($enabled -or $seconds -eq 0){$script:refreshCycles=[long]0}
    $script:refreshTabIdentity=$tabId
    $script:refreshSeconds=$seconds
    $script:refreshEnabled=($enabled -and $seconds -gt 0)
    $script:refreshConfiguredLocally=$true
    $script:refreshNextAtMs=0
    Save-H2AdsRefreshToggle
    return $true
  } catch {
    $message=$_.Exception.Message
    $script:refreshSeconds=$oldSeconds
    $script:refreshEnabled=$oldEnabled
    $script:refreshConfiguredLocally=$oldLocal
    $script:refreshNextAtMs=$oldNext
    $script:refreshTabIdentity=$oldTab
    $script:refreshCycles=$oldCycles
    [System.Windows.Forms.MessageBox]::Show(
      ("Nao foi possivel salvar a atualizacao automatica desta instancia." + [Environment]::NewLine + $message),
      "H2ADS - Atualizacao automatica",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )|Out-Null
    return $false
  }
}
function Change-H2AdsRefresh {
  # The existing AUTO button now opens a native editor on THIS instance.
  # Do not add a fifth button to the cramped stopwatch row (min 310px).
  $dialog=New-Object System.Windows.Forms.Form
  $dialog.Text=("H2ADS - AUTO - " + $InstanceName)
  $dialog.FormBorderStyle=[System.Windows.Forms.FormBorderStyle]::FixedDialog
  $dialog.StartPosition=[System.Windows.Forms.FormStartPosition]::CenterParent
  $dialog.ShowInTaskbar=$false
  $dialog.MaximizeBox=$false
  $dialog.MinimizeBox=$false
  $dialog.AutoScaleMode=[System.Windows.Forms.AutoScaleMode]::None
  $dialog.ClientSize=[System.Drawing.Size]::new(410,218)
  $dialog.BackColor=RGB 13 18 28
  $dialog.ForeColor=RGB 245 248 255
  $dialog.Font=New-Object System.Drawing.Font -ArgumentList "Segoe UI",10
  $label=New-Object System.Windows.Forms.Label
  $label.Text="Atualizar esta pagina a cada (segundos)"
  $label.Location=[System.Drawing.Point]::new(15,18)
  $label.Size=[System.Drawing.Size]::new(374,27)
  $label.ForeColor=RGB 226 237 255
  $dialog.Controls.Add($label)
  $inputSeconds=New-Object System.Windows.Forms.NumericUpDown
  $inputSeconds.Minimum=[decimal]30
  $inputSeconds.Maximum=[decimal]86400
  $inputSeconds.Increment=[decimal]10
  $initialSeconds=if($script:refreshSeconds -ge 30){$script:refreshSeconds}else{60}
  $inputSeconds.Value=[decimal]$initialSeconds
  $inputSeconds.Location=[System.Drawing.Point]::new(15,49)
  $inputSeconds.Size=[System.Drawing.Size]::new(180,31)
  $inputSeconds.TextAlign=[System.Windows.Forms.HorizontalAlignment]::Center
  $dialog.Controls.Add($inputSeconds)
  $hint=New-Object System.Windows.Forms.Label
  $hint.Text="Somente a aba selecionada AGORA. Se mudar de aba, a recarga pausa."
  $hint.Location=[System.Drawing.Point]::new(15,87)
  $hint.Size=[System.Drawing.Size]::new(386,35)
  $hint.Font=New-Object System.Drawing.Font -ArgumentList "Segoe UI",8.5
  $hint.ForeColor=RGB 177 192 215
  $dialog.Controls.Add($hint)
  $current=New-Object System.Windows.Forms.Label
  $current.Text=if($script:refreshEnabled -and $script:refreshTabIdentity) {
    "Ativo: aba selecionada, a cada $($script:refreshSeconds) segundos."
  } elseif($script:refreshEnabled) {
    "Selecione novamente a aba e clique em SALVAR E INICIAR."
  } elseif($script:refreshSeconds -gt 0) {
    "Pausado: intervalo de $($script:refreshSeconds) segundos."
  } else {
    "Desativado. O navegador permanece sem recarga automatica."
  }
  $current.Location=[System.Drawing.Point]::new(15,122)
  $current.Size=[System.Drawing.Size]::new(385,25)
  $current.ForeColor=RGB 124 224 190
  $dialog.Controls.Add($current)
  $start=New-Object System.Windows.Forms.Button
  $start.Text="SALVAR E INICIAR"
  $start.Location=[System.Drawing.Point]::new(12,159)
  $start.Size=[System.Drawing.Size]::new(133,43)
  $start.BackColor=RGB 24 119 82
  $start.ForeColor=RGB 255 255 255
  $start.FlatStyle=[System.Windows.Forms.FlatStyle]::Flat
  $start.Add_Click({
    if(Set-H2AdsRefreshSettings ([int]$inputSeconds.Value) $true){
      $dialog.DialogResult=[System.Windows.Forms.DialogResult]::OK
      $dialog.Close()
    }
  }.GetNewClosure())
  $dialog.Controls.Add($start)
  $pause=New-Object System.Windows.Forms.Button
  $pause.Text="SALVAR PAUSADO"
  $pause.Location=[System.Drawing.Point]::new(151,159)
  $pause.Size=[System.Drawing.Size]::new(133,43)
  $pause.BackColor=RGB 45 76 118
  $pause.ForeColor=RGB 255 255 255
  $pause.FlatStyle=[System.Windows.Forms.FlatStyle]::Flat
  $pause.Add_Click({
    if(Set-H2AdsRefreshSettings ([int]$inputSeconds.Value) $false){
      $dialog.DialogResult=[System.Windows.Forms.DialogResult]::OK
      $dialog.Close()
    }
  }.GetNewClosure())
  $dialog.Controls.Add($pause)
  $disable=New-Object System.Windows.Forms.Button
  $disable.Text="DESATIVAR"
  $disable.Location=[System.Drawing.Point]::new(290,159)
  $disable.Size=[System.Drawing.Size]::new(108,43)
  $disable.BackColor=RGB 94 49 58
  $disable.ForeColor=RGB 255 255 255
  $disable.FlatStyle=[System.Windows.Forms.FlatStyle]::Flat
  $disable.Add_Click({
    if(Set-H2AdsRefreshSettings 0 $false){
      $dialog.DialogResult=[System.Windows.Forms.DialogResult]::OK
      $dialog.Close()
    }
  }.GetNewClosure())
  $dialog.Controls.Add($disable)
  $script:refreshDialogOpen=$true
  try {
    [void]$dialog.ShowDialog($frame)
  } finally {
    $script:refreshDialogOpen=$false
    $script:refreshNextAtMs=0
    $dialog.Dispose()
  }
}
function Tick-H2AdsRefresh([IntPtr]$chromeWindow) {
  if($script:refreshDialogOpen){$script:refreshNextAtMs=0;return}
  $now=Get-H2AdsWatchNowMs
  if(($now-$script:refreshPolicyReadAtMs) -ge 4000) {
    $script:refreshPolicyReadAtMs=$now
    Read-H2AdsRefreshPolicy
  }
  if(-not $script:refreshEnabled -or $script:refreshSeconds -eq 0) {
    $script:refreshNextAtMs=0;return
  }
  # Never automatically bind a saved timer to a different tab after restart.
  if([string]::IsNullOrWhiteSpace($script:refreshTabIdentity)){
    $script:refreshNextAtMs=0;return
  }
  if($script:refreshNextAtMs -eq 0) {
    $script:refreshNextAtMs=$now+[long]($script:refreshSeconds*1000);return
  }
  if($now -lt $script:refreshNextAtMs){return}
  # Never accumulate missed refreshes while minimized/closed and never
  # move focus away from the user's active text input.
  $script:refreshNextAtMs=$now+[long]($script:refreshSeconds*1000)
  if([H2PhoneWindowNative]::IsWindowVisible($chromeWindow) -and
     -not [H2PhoneWindowNative]::IsIconic($chromeWindow)){
    $currentlySelected=[H2PhoneWindowNative]::SelectedChromeTabIdentity($chromeWindow)
    if(-not [string]::IsNullOrWhiteSpace($currentlySelected) -and
       $currentlySelected -ceq $script:refreshTabIdentity){
      # Count only a browser refresh command accepted by Windows for
      # the configured, currently selected tab. A skipped tab adds zero.
      if([H2PhoneWindowNative]::RefreshBrowserPage($chromeWindow)) {
        if($script:refreshCycles -lt [long]::MaxValue){$script:refreshCycles++}
        try { Save-H2AdsRefreshToggle } catch {
          [Console]::Error.WriteLine("H2ADS: falha ao salvar contagem AUTO da instancia $InstanceId")
        }
      }
    }
    # A different active tab is never reloaded.
  }
}
# Visual readout only. The existing AUTO scheduler remains authoritative.
# "OFF" means disabled, "PAUSA" is a saved but inactive interval, and
# "ABA" requests selecting a target after restarting the local Chrome.
# Never query UI Automation inside the paint handler or touch the browser.
function Format-H2AdsRefreshRemaining {
  if(-not $script:refreshEnabled -or $script:refreshSeconds -le 0) {
    if($script:refreshSeconds -gt 0){return "PAUSA"}
    return "OFF"
  }
  if($script:refreshDialogOpen){return "PAUSA"}
  if([string]::IsNullOrWhiteSpace($script:refreshTabIdentity)){return "ABA"}
  $remainingMs=[long]($script:refreshSeconds*1000)
  if($script:refreshNextAtMs -gt 0) {
    $remainingMs=[long]($script:refreshNextAtMs-(Get-H2AdsWatchNowMs))
  }
  if($remainingMs -lt 0){$remainingMs=0}
  $remainingSeconds=[long][Math]::Ceiling($remainingMs/1000.0)
  $hours=[long][Math]::Floor($remainingSeconds/3600)
  $minutes=[int][Math]::Floor(($remainingSeconds%3600)/60)
  $seconds=[int]($remainingSeconds%60)
  if($hours -gt 0){return ('{0:00}:{1:00}:{2:00}' -f $hours,$minutes,$seconds)}
  return ('{0:00}:{1:00}' -f $minutes,$seconds)
}
Read-H2AdsRefreshPolicy

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
# The 500ms timer keeps the Chrome window aligned, but the top panel only
# needs repainting when the displayed clock / stopwatch / AUTO / cycles changes.
# An idle panel may therefore go minutes without a single invalidation.
function Get-H2AdsStatusSnapshot {
  $minute=[DateTime]::Now.ToString("HH:mm")
  $manualWatch=Format-H2AdsWatchElapsed
  $autoRemaining=Format-H2AdsRefreshRemaining
  return "$minute|$manualWatch|$autoRemaining|$($script:refreshCycles)|$($script:refreshEnabled)|$($script:refreshSeconds)|$($script:battery)|$($script:wifiOn)"
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
      # The atomic replace API fails on some Windows filesystem/ACL setups.
      # Overwrite fallback preserves the running timer's durable state.
      try {
        [System.IO.File]::Replace($temporary,$script:watchFile,$null)
      } catch {
        [System.IO.File]::Copy($temporary,$script:watchFile,$true)
        [System.IO.File]::Delete($temporary)
      }
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
    } elseif($action -eq "pause") {
      if(-not $script:watchRunning){return}
      $script:watchElapsedMs=Get-H2AdsWatchElapsedMs
      $script:watchRunning=$false
      $script:watchStartedAtMs=[long]0
    } elseif($action -eq "start") {
      if($script:watchRunning){return}
      $script:watchStartedAtMs=Get-H2AdsWatchNowMs
      $script:watchRunning=$true
    } else {throw "invalid_stopwatch_action"}
    Save-H2AdsWatchState
  } catch {
    $saveFailure=$_.Exception.Message
    $script:watchRunning=$wasRunning
    $script:watchElapsedMs=$oldElapsed
    $script:watchStartedAtMs=$oldStart
    [System.Windows.Forms.MessageBox]::Show(
      ("Nao foi possivel salvar o cronometro desta instancia." + [Environment]::NewLine + $saveFailure),
      "H2ADS - Cronometro",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )|Out-Null
  }
}
function Get-H2AdsWatchLayout([int]$width) {
  # First status row: clock, network and battery (unchanged).
  # Second row: manual stopwatch and its three independent actions.
  # Third row: AUTO, countdown, cycles -- 3 cards side by side.
  # Accommodates the minimum 310px Chrome width.
  $gap=6
  $actionW=[Math]::Max(49,[Math]::Min(65,[Math]::Floor(($width-115-2*$gap)/3)))
  $resetW=$actionW; $pauseW=$actionW; $startW=$actionW
  $resetX=$width-12-$resetW
  $pauseX=$resetX-$gap-$pauseW
  $startX=$pauseX-$gap-$startW
  $cardGap=7
  $cardW=[Math]::Floor(($width-24-2*$cardGap)/3)
  $autoX=12
  $timeX=$autoX+$cardW+$cardGap
  $cyclesX=$timeX+$cardW+$cardGap
  return @{
    clockY=6; textX=16; textY=46
    autoX=$autoX; autoW=$cardW
    timeX=$timeX; timeW=$cardW
    cyclesX=$cyclesX; cyclesW=($width-12-$cyclesX)
    startX=$startX; startW=$startW
    pauseX=$pauseX; pauseW=$pauseW
    resetX=$resetX; resetW=$resetW
    buttonY=43; buttonH=28; hitTop=42; hitBottom=73
    cardY=77; cardH=52; cardTop=76; cardBottom=131
  }
}
function New-H2AdsWatchButtonPath([single]$x,[single]$y,[single]$w,[single]$h) {
  $d=[single]14
  $path=New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($x,$y,$d,$d,180,90)
  $path.AddArc(($x+$w-$d),$y,$d,$d,270,90)
  $path.AddArc(($x+$w-$d),($y+$h-$d),$d,$d,0,90)
  $path.AddArc($x,($y+$h-$d),$d,$d,90,90)
  $path.CloseFigure()
  return $path
}

# Windows PowerShell 5.1 reads UTF-8 without BOM incorrectly.
# All icons are drawn as vector geometry, never font glyphs.
$script:battery=95
$script:wifiOn=$true
$status=New-Object H2PhoneStatusPanel
$status.Height=136
$status.Width=$frame.Width-44
$status.Location=New-Object System.Drawing.Point(22,8)
$status.BackColor=RGB 0 0 2
$status.Cursor=[System.Windows.Forms.Cursors]::Hand
$script:autoHelp=New-Object System.Windows.Forms.ToolTip
$script:autoHelp.SetToolTip($status,"AUTO: configurar a aba e o intervalo. TEMPO: proxima tentativa de atualizacao. CICLOS: comandos de atualizacao confirmados na instancia.")
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
    # Two clean black-glass status rows with subtle separation.
    $statusDivider=New-Object System.Drawing.Pen -ArgumentList (RGB 62 67 77),1.2
    try { $g.DrawLine($statusDivider,16,39,($w-16),39) } finally { $statusDivider.Dispose() }
    # The first row is reserved for time, camera and phone indicators.
    # Row 2: manual stopwatch with INICIAR, PAUSAR, ZERAR only.
    # Row 3: independent AUTO, TEMPO and CICLOS cards.
    $divider=New-Object System.Drawing.Pen -ArgumentList (RGB 26 29 35),1
    try { $g.DrawLine($divider,16,39,($w-16),39) } finally { $divider.Dispose() }
    $watchText=Format-H2AdsWatchElapsed
    $maxTextWidth=[single][Math]::Max(35,$watchLayout.startX-$watchLayout.textX-6)
    $watchFont=$font
    $measured=$g.MeasureString($watchText,$font).Width
    if($measured -gt $maxTextWidth) {
      $watchSize=[single][Math]::Max(7,11*$maxTextWidth/$measured)
      $watchFont=New-Object System.Drawing.Font -ArgumentList "Segoe UI",$watchSize,([System.Drawing.FontStyle]::Bold)
    }
    try { $g.DrawString($watchText,$watchFont,$fg,$watchLayout.textX,$watchLayout.textY) }
    finally { if($watchFont -ne $font){$watchFont.Dispose()} }

    $actionFont=New-Object System.Drawing.Font -ArgumentList "Segoe UI",8,([System.Drawing.FontStyle]::Bold)
    $align=New-Object System.Drawing.StringFormat
    $align.Alignment=[System.Drawing.StringAlignment]::Center
    $align.LineAlignment=[System.Drawing.StringAlignment]::Center
    $align.FormatFlags=[System.Drawing.StringFormatFlags]::NoWrap
    $align.Trimming=[System.Drawing.StringTrimming]::None
    $actions=@(
      @{x=$watchLayout.startX;w=$watchLayout.startW;label="INICIAR";color=(RGB 31 92 67)}
      @{x=$watchLayout.pauseX;w=$watchLayout.pauseW;label="PAUSAR";color=(RGB 45 76 118)}
      @{x=$watchLayout.resetX;w=$watchLayout.resetW;label="ZERAR";color=(RGB 46 52 65)}
    )
    try {
      foreach($item in $actions) {
        $fill=New-Object System.Drawing.SolidBrush -ArgumentList $item.color
        $path=New-H2AdsWatchButtonPath $item.x $watchLayout.buttonY $item.w $watchLayout.buttonH
        $rect=New-Object System.Drawing.RectangleF -ArgumentList $item.x,$watchLayout.buttonY,$item.w,$watchLayout.buttonH
        try {
          $g.FillPath($fill,$path)
          $measuredLabel=$g.MeasureString($item.label,$actionFont).Width
          $labelFont=$actionFont
          $usableW=[single]($item.w-8)
          if($measuredLabel -gt $usableW){
            $scaledSize=[single][Math]::Max(5.5,8*$usableW/$measuredLabel)
            $labelFont=New-Object System.Drawing.Font -ArgumentList "Segoe UI",$scaledSize,([System.Drawing.FontStyle]::Bold)
          }
          try {$g.DrawString($item.label,$labelFont,$fg,$rect,$align)}
          finally {if($labelFont -ne $actionFont){$labelFont.Dispose()}}
        } finally {$fill.Dispose();$path.Dispose()}
      }
    } finally {$actionFont.Dispose()}

    # Three separated horizontal cards, never stacked in the AUTO button.
    $autoColor=if($script:refreshEnabled -and $script:refreshSeconds -gt 0){RGB 28 130 84}else{RGB 55 62 75}
    $autoState=if($script:refreshEnabled){"LIGADO"}else{"OFF"}
    $cards=@(
      @{x=$watchLayout.autoX;w=$watchLayout.autoW;label="AUTO";value=$autoState;color=$autoColor}
      @{x=$watchLayout.timeX;w=$watchLayout.timeW;label="TEMPO";value=(Format-H2AdsRefreshRemaining);color=(RGB 35 61 91)}
      @{x=$watchLayout.cyclesX;w=$watchLayout.cyclesW;label="CICLOS";value=([string]$script:refreshCycles);color=(RGB 51 56 75)}
    )
    $cardLabelFont=New-Object System.Drawing.Font -ArgumentList "Segoe UI",8,([System.Drawing.FontStyle]::Bold)
    $cardValueFont=New-Object System.Drawing.Font -ArgumentList "Consolas",11,([System.Drawing.FontStyle]::Bold)
    try {
      foreach($card in $cards) {
        $fill=New-Object System.Drawing.SolidBrush -ArgumentList $card.color
        $path=New-H2AdsWatchButtonPath $card.x $watchLayout.cardY $card.w $watchLayout.cardH
        try {
          $g.FillPath($fill,$path)
          $labelRect=New-Object System.Drawing.RectangleF -ArgumentList $card.x,($watchLayout.cardY+5),$card.w,15
          $g.DrawString($card.label,$cardLabelFont,$fg,$labelRect,$align)
          $valueFont=$cardValueFont
          $maxValueW=[single]($card.w-8)
          $measuredValue=$g.MeasureString($card.value,$cardValueFont).Width
          if($measuredValue -gt $maxValueW) {
            $smallSize=[single][Math]::Max(6,11*$maxValueW/$measuredValue)
            $valueFont=New-Object System.Drawing.Font -ArgumentList "Consolas",$smallSize,([System.Drawing.FontStyle]::Bold)
          }
          $valueRect=New-Object System.Drawing.RectangleF -ArgumentList $card.x,($watchLayout.cardY+23),$card.w,21
          try {$g.DrawString($card.value,$valueFont,$fg,$valueRect,$align)}
          finally {if($valueFont -ne $cardValueFont){$valueFont.Dispose()}}
        } finally {$fill.Dispose();$path.Dispose()}
      }
    } finally {$cardLabelFont.Dispose();$cardValueFont.Dispose();$align.Dispose()}
    # Discreet punch-hole camera.
    $ring=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 39 43 52)
    $lens=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 0 1 4)
    $g.FillEllipse($ring,($w/2-9),16,18,18)
    $g.FillEllipse($lens,($w/2-5),20,10,10)
    $ring.Dispose();$lens.Dispose()
    # All first-row indicators share one optical baseline. In particular,
    # 5G and battery percentage must NOT spill into the stopwatch buttons.
    $indicatorTextY=8
    # Signal bars.
    for($i=0;$i -lt 4;$i++){ $sh=4+3*$i; $g.FillRectangle($fg,($w-181+5*$i),(29-$sh),3,$sh) }
    $g.DrawString("5G",$small,$fg,($w-157),$indicatorTextY)
    # WiFi arcs (grey when switched off).
    if(-not $script:wifiOn){$pen.Color=RGB 101 115 140}
    $g.DrawArc($pen,($w-124),14,24,17,205,130)
    $g.DrawArc($pen,($w-119),20,14,10,205,130)
    $dot=New-Object System.Drawing.SolidBrush -ArgumentList $pen.Color
    $g.FillEllipse($dot,($w-114),29,4,4)
    $dot.Dispose()
    $pen.Color=RGB 242 247 255
    # Battery icon plus readable percentage.
    $bx=$w-84
    $g.DrawRectangle($pen,$bx,14,26,13)
    $g.FillRectangle($fg,($bx+27),18,3,5)
    $bc=if($script:battery -le 20){RGB 255 166 102}else{RGB 120 238 175}
    $fill=New-Object System.Drawing.SolidBrush -ArgumentList $bc
    $g.FillRectangle($fill,($bx+2),16,(22*$script:battery/100),9)
    $fill.Dispose()
    $g.DrawString(("$($script:battery)%"),$small,$fg,($w-49),$indicatorTextY)
  } finally { $small.Dispose();$font.Dispose();$pen.Dispose();$fg.Dispose() }
})
# Drag the WHOLE smartphone by its top bar. Keep the far-right
# Wi-Fi and battery indicators clickable. Native caption drag moves Chrome
# with its WinForms parent and does not forward input to the browser.
$status.add_MouseDown({
  param($sender,$e)
  if($e.Button -ne [System.Windows.Forms.MouseButtons]::Left){return}
  $layout=Get-H2AdsWatchLayout $status.ClientSize.Width
  if($e.Y -ge $layout.hitTop -and $e.Y -le $layout.hitBottom -and
     $e.X -ge $layout.startX -and $e.X -le ($layout.resetX+$layout.resetW)){return}
  if($e.Y -ge $layout.cardTop -and $e.Y -le $layout.cardBottom){return}
  if($e.X -ge ($status.ClientSize.Width-135)){return}
  [H2PhoneWindowNative]::ReleaseCapture()|Out-Null
  [H2PhoneWindowNative]::SendMessage($frame.Handle,
    [H2PhoneWindowNative]::WM_NCLBUTTONDOWN,
    [IntPtr]([H2PhoneWindowNative]::HTCAPTION),[IntPtr]::Zero)|Out-Null
})
$status.add_MouseClick({
  param($sender,$e)
  if($e.Button -ne [System.Windows.Forms.MouseButtons]::Left){return}
  $layout=Get-H2AdsWatchLayout $status.ClientSize.Width
  if($e.Y -ge $layout.cardTop -and $e.Y -le $layout.cardBottom) {
    if($e.X -ge $layout.autoX -and $e.X -le ($layout.autoX+$layout.autoW)) {
      Change-H2AdsRefresh;$status.Invalidate();return
    }
    # TEMPO and CICLOS are read-only cards, never browser actions.
    return
  }
  if($e.Y -ge $layout.hitTop -and $e.Y -le $layout.hitBottom) {
    if($e.X -ge $layout.resetX -and $e.X -le ($layout.resetX+$layout.resetW)){
      Change-H2AdsWatch "reset";$status.Invalidate();return
    }
    if($e.X -ge $layout.pauseX -and $e.X -le ($layout.pauseX+$layout.pauseW)){
      Change-H2AdsWatch "pause";$status.Invalidate();return
    }
    if($e.X -ge $layout.startX -and $e.X -le ($layout.startX+$layout.startW)){
      Change-H2AdsWatch "start";$status.Invalidate();return
    }
  }
  if($e.Y -lt 40 -and $e.X -ge ($status.Width-90)){ $script:battery=if($script:battery -ge 100){0}else{[Math]::Min(100,$script:battery+5)} }
  elseif($e.Y -lt 40 -and $e.X -ge ($status.Width-130)){ $script:wifiOn=-not $script:wifiOn }
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
$footer.BackColor=RGB 0 0 2
Set-RoundedPanelRegion $footer 24
$footer.add_Paint({
  param($sender,$e)
  $g=$e.Graphics
  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $w=$sender.ClientSize.Width
  $pen=New-Object System.Drawing.Pen -ArgumentList (RGB 222 235 252),2.5
  $pill=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 222 235 252)
  try {
    # Refined top seam of the curved black-glass navigation footer.
    $seam=New-Object System.Drawing.Pen -ArgumentList (RGB 40 44 52),1
    try { $g.DrawLine($seam,18,2,($w-18),2) } finally { $seam.Dispose() }
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
  $status.Location=New-Object System.Drawing.Point(22,8)
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

# Compare the visible status content instead of flashing/repainting the entire
# cosmetic phone chassis every half second.
$script:lastStatusSnapshot=$null
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
    Tick-H2AdsRefresh $chrome
    $currentStatusSnapshot=Get-H2AdsStatusSnapshot
    if($script:lastStatusSnapshot -cne $currentStatusSnapshot) {
      $script:lastStatusSnapshot=$currentStatusSnapshot
      $status.Invalidate()
    }
    # The metal phone frame is STATIC: no frame-wide repaint on timer ticks.
    # It is repainted by WinForms automatically when resized or uncovered.
  } catch {}
})
$frame.add_FormClosed({
  $script:phoneChromeCoupled=$false
  $timer.Stop();$timer.Dispose()
  try { [H2PhoneWindowNative]::DetachChromeVisual($chrome,$frame.Handle) } catch {}
})
$timer.Start()
[System.Windows.Forms.Application]::Run($frame)
