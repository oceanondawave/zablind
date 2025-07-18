// ✅ Define constants at the very top
#define UseDefaultRegistry true
#define MyAppName "Zablind Patcher"
#define MyAppVersion "1.0" 
#define GitHubUser "oceanondawave"
#define GitHubRepo "zablind_demo_download"
#define AppAsarFile "app.asar"
#define GuideFile "huong_dan_zablind.txt"

[Setup]
AppId={{26D55B71-4479-4B5B-9B2F-65E8A83E5528}}
AppName={#MyAppName}
AppVersion=1.0-installer
PrivilegesRequired=admin
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=Zablind_Installer
Compression=lzma
SolidCompression=yes
ShowLanguageDialog=yes


[Languages]
Name: "vi"; MessagesFile: "compiler:Languages\Vietnamese.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
// English Translations
en.ZaloNotFound=Could not find the Zalo installation directory. You must install Zalo first.
en.ZaloNotFoundTitle=Error
en.AlreadyInstalled=Zablind Patcher is already installed.
en.UninstallOption=Do you want to UNINSTALL the existing version?
en.ActionChoiceTitle=Choose Action
en.UninstallSuccess=Zablind Patcher has been uninstalled. Zalo has been restored.
en.UninstallFailed=Uninstall failed. Could not delete the old patch.
en.RestoreFailed=CRITICAL ERROR: Could not restore Zalo's original file. Please reinstall Zalo.
en.UpdateAvailable=A new version (%1) is available. You are using version %2. Update now?
en.UpdateAvailableTitle=Update Available
en.LatestVersion=You already have the latest version (%1).
en.LatestVersionTitle=Information
en.DownloadAndInstall=The installer will download and install Zablind Patcher version %1.
en.DownloadAndInstallTitle=Begin Installation
en.ConnectionError=Could not connect to the update server. Please check your internet connection.
en.FileError=Error: Could not find core files on the GitHub release.
en.Downloading=Downloading required files...
en.Finalizing=Finalizing installation...

// Vietnamese Translations
vi.ZaloNotFound=Không thể tìm thấy nơi cài đặt Zalo. Bạn phải tải và cài đặt Zalo trước.
vi.ZaloNotFoundTitle=Lỗi
vi.AlreadyInstalled=Zablind Patcher đã được cài đặt.
vi.UninstallOption=Bạn có muốn GỠ CÀI ĐẶT phiên bản hiện tại không?
vi.ActionChoiceTitle=Lựa chọn hành động
vi.UninstallSuccess=Zablind Patcher đã được gỡ cài đặt. Zalo đã được khôi phục.
vi.UninstallFailed=Gỡ cài đặt thất bại. Không thể xoá bản vá cũ.
vi.RestoreFailed=LỖI NGHIÊM TRỌNG: Không thể khôi phục tệp gốc của Zalo. Hãy cài đặt lại Zalo.
vi.UpdateAvailable=Đã có phiên bản mới (%1). Bạn đang dùng bản %2. Cập nhật ngay?
vi.UpdateAvailableTitle=Có bản cập nhật
vi.LatestVersion=Bạn đã có phiên bản mới nhất (%1).
vi.LatestVersionTitle=Thông báo
vi.DownloadAndInstall=Bộ cài sẽ tải và cài đặt Zablind Patcher phiên bản %1.
vi.DownloadAndInstallTitle=Bắt đầu cài đặt
vi.ConnectionError=Không thể kết nối đến máy chủ cập nhật. Vui lòng kiểm tra mạng.
vi.FileError=Lỗi: Không tìm thấy các tệp lõi trên bản phát hành GitHub.
vi.Downloading=Đang tải về các tệp cần thiết...
vi.Finalizing=Đang hoàn tất cài đặt...

[Files]
// This section is intentionally empty. No DLLs are needed.

[UninstallDelete]
Type: files; Name: "{app}\uninstall.exe"
Type: files; Name: "{app}\uninstall.dat"
Type: filesandordirs; Name: "{app}"


[Registry]
Root: HKLM; Subkey: "Software\Wow6432Node\Zablind Patcher"; \
    ValueType: string; ValueName: "Version"; ValueData: "{#MyAppVersion}"; \
    Flags: uninsdeletekey

[Code]
// --- 1. CONSTANTS (must be first) ---
const
  SM_CXSCREEN = 0;
  SM_CYSCREEN = 1;

// --- 2. GLOBAL VARIABLES (must be second) ---
var
  LatestVersion: string;
  LatestReleaseJson: AnsiString;
  PerformInstall: Boolean;
  ResultCode: Integer;
  latestZaloPath: string;

// --- 3. FUNCTIONS and PROCEDURES (must be last) ---

// --- External DLL Imports ---
function GetSystemMetrics(nIndex: Integer): Integer;
  external 'GetSystemMetrics@user32.dll stdcall';

// --- PowerShell Download Function ---
function DownloadFilePS(const URL, FileName: string): Boolean;
var
  Command: string;
  ResultCode: Integer;
  ErrorLog: AnsiString; // Changed to AnsiString
  TempErrorFile: string;
begin
  TempErrorFile := ExpandConstant('{tmp}\ps_error.log');
  
  // Delete any existing error file
  if FileExists(TempErrorFile) then
    DeleteFile(TempErrorFile);

  Command :=
    '$ErrorActionPreference = ''Stop''; ' +
    '$ProgressPreference = ''SilentlyContinue''; ' +
    'try { ' +
    '  [Net.ServicePointManager]::SecurityProtocol = ' +
    '    [Net.SecurityProtocolType]::Tls12 -bor ' +
    '    [Net.SecurityProtocolType]::Tls13; ' +
    '  $client = New-Object System.Net.WebClient; ' +
    '  $client.Headers.Add(''User-Agent'', ''InnoSetup-Updater''); ' +
    '  $client.DownloadFile(''' + URL + ''', ''' + FileName + '''); ' +
    '  exit 0 ' +
    '} ' +
    'catch { ' +
    '  $_.Exception | Out-File -FilePath ''' + TempErrorFile + ''' -Encoding UTF8; ' +
    '  exit 1 ' +
    '}';

  Result := Exec('powershell.exe', 
               '-NoProfile -ExecutionPolicy Bypass -Command "' + Command + '"', 
               '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);

  // Check results and log details
  if not Result then
  begin
    Log('PowerShell download failed. Code: ' + IntToStr(ResultCode));
    
    // Read error details with proper AnsiString type
    if FileExists(TempErrorFile) then
    begin
      if LoadStringFromFile(TempErrorFile, ErrorLog) then
      begin
        Log('PowerShell error details:');
        Log(string(ErrorLog)); // Convert to string for logging
      end;
      DeleteFile(TempErrorFile);
    end
    else
    begin
      Log('No error details file found');
    end;
  end;
end;

// --- Custom Accessible Dialog Functions ---
procedure AccessibleMessageBox(Message, Title: string);
var
  Form: TSetupForm;
  MessageMemo: TMemo;
  OKButton: TButton;
begin
  Form := CreateCustomForm();
  try
    Form.Caption := Title;
    Form.SetBounds(0, 0, 400, 150);
    Form.Left := (GetSystemMetrics(SM_CXSCREEN) - Form.Width) div 2;
    Form.Top := (GetSystemMetrics(SM_CYSCREEN) - Form.Height) div 2;
    MessageMemo := TMemo.Create(Form);
    MessageMemo.Parent := Form;
    MessageMemo.SetBounds(15, 15, 370, 50);
    MessageMemo.Text := Message;
    MessageMemo.ReadOnly := True;
    MessageMemo.Color := Form.Color;
    MessageMemo.BorderStyle := bsNone;
    MessageMemo.WantTabs := False;
    OKButton := TButton.Create(Form);
    OKButton.Parent := Form;
    OKButton.SetBounds(Form.ClientWidth - 90, Form.ClientHeight - 40, 75, 25);
    OKButton.Caption := SetupMessage(msgButtonOK);
    OKButton.ModalResult := mrOk;
    OKButton.Default := True;
    OKButton.Cancel := True;
    Form.ActiveControl := MessageMemo;
    MessageMemo.SelectAll;
    Form.ShowModal();
  finally
    Form.Free;
  end;
end;

function AccessibleChoiceBox(Message, Title: string; UseCancel: Boolean): Integer;
var
  Form: TSetupForm;
  MessageMemo: TMemo;
  YesButton, NoButton, CancelButton: TButton;
  ModalResultValue: Integer;
begin
  Form := CreateCustomForm();
  try
    Form.Caption := Title;
    Form.SetBounds(0, 0, 400, 170);
    Form.Left := (GetSystemMetrics(SM_CXSCREEN) - Form.Width) div 2;
    Form.Top := (GetSystemMetrics(SM_CYSCREEN) - Form.Height) div 2;
    MessageMemo := TMemo.Create(Form);
    MessageMemo.Parent := Form;
    MessageMemo.SetBounds(15, 15, 370, 70);
    MessageMemo.Text := Message;
    MessageMemo.ReadOnly := True;
    MessageMemo.Color := Form.Color;
    MessageMemo.BorderStyle := bsNone;
    MessageMemo.WantTabs := False;
    YesButton := TButton.Create(Form);
    YesButton.Parent := Form;
    YesButton.Caption := SetupMessage(msgButtonYes);
    YesButton.ModalResult := mrYes;
    YesButton.Default := True;
    NoButton := TButton.Create(Form);
    NoButton.Parent := Form;
    NoButton.Caption := SetupMessage(msgButtonNo);
    NoButton.ModalResult := mrNo;
    if UseCancel then
    begin
      YesButton.SetBounds(Form.ClientWidth - 270, Form.ClientHeight - 45, 75, 25);
      NoButton.SetBounds(Form.ClientWidth - 185, Form.ClientHeight - 45, 75, 25);
      CancelButton := TButton.Create(Form);
      CancelButton.Parent := Form;
      CancelButton.SetBounds(Form.ClientWidth - 100, Form.ClientHeight - 45, 75, 25);
      CancelButton.Caption := SetupMessage(msgButtonCancel);
      CancelButton.ModalResult := mrCancel;
      CancelButton.Cancel := True;
    end
    else
    begin
      YesButton.SetBounds(Form.ClientWidth - 185, Form.ClientHeight - 45, 75, 25);
      NoButton.SetBounds(Form.ClientWidth - 100, Form.ClientHeight - 45, 75, 25);
      NoButton.Cancel := True;
    end;
    Form.ActiveControl := MessageMemo;
    MessageMemo.SelectAll;
    ModalResultValue := Form.ShowModal();
    case ModalResultValue of
      mrYes: Result := IDYES;
      mrNo: Result := IDNO;
    else
      Result := IDCANCEL;
    end;
  finally
    Form.Free;
  end;
end;

// --- Helper Functions ---
function CompareVersions(v1, v2: string): Integer;
var
  i1, i2: Integer;
  p1, p2: string;
begin
  while (v1 <> '') or (v2 <> '') do
  begin
    if Pos('.', v1) > 0 then begin
      p1 := Copy(v1, 1, Pos('.', v1)-1);
      Delete(v1, 1, Pos('.', v1));
    end else begin
      p1 := v1;
      v1 := '';
    end;
    if Pos('.', v2) > 0 then begin
      p2 := Copy(v2, 1, Pos('.', v2)-1);
      Delete(v2, 1, Pos('.', v2));
    end else begin
      p2 := v2;
      v2 := '';
    end;
    i1 := StrToIntDef(p1, 0);
    i2 := StrToIntDef(p2, 0);
    if i1 > i2 then begin Result := 1; Exit; end
    else if i1 < i2 then begin Result := -1; Exit; end;
  end;
  Result := 0;
end;

function GetZaloResourcePath(Default: string): string;
var
  baseDir, verStr, maxVer: string;
  findRes: Boolean;
  searchRec: TFindRec;
begin
  baseDir := ExpandConstant('{userappdata}\..\Local\Programs\Zalo');
  maxVer := '';
  latestZaloPath := '';
  findRes := FindFirst(baseDir + '\*', searchRec);
  while findRes do
  begin
    if (searchRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0 then
    begin
      if (searchRec.Name <> '.') and (searchRec.Name <> '..') and (Pos('Zalo-', searchRec.Name) = 1) then
      begin
        verStr := Copy(searchRec.Name, 6, Length(searchRec.Name));
        if (maxVer = '') or (CompareVersions(verStr, maxVer) > 0) then
        begin
          maxVer := verStr;
          latestZaloPath := baseDir + '\' + searchRec.Name + '\resources';
        end;
      end;
    end;
    findRes := FindNext(searchRec);
  end;
  FindClose(searchRec);
  Result := latestZaloPath;
end;

procedure KillProcesses;
begin
  Exec('taskkill', '/F /IM Zalo.exe', '', SW_HIDE, ewNoWait, ResultCode);
end;

// --- Update Functions ---
function GetJsonValue(Json, Key: string): string;
var
  P: Integer;
  ValueStart, ValueEnd: Integer;
  TempJson: string;
begin
  Result := '';
  P := Pos('"' + Key + '":', Json);
  if P > 0 then
  begin
    ValueStart := P + Length(Key) + 3;
    if Json[ValueStart] = '"' then
    begin
      ValueStart := ValueStart + 1;
      TempJson := Copy(Json, ValueStart, Length(Json));
      ValueEnd := Pos('"', TempJson);
      if ValueEnd > 0 then
      begin
        Result := Copy(TempJson, 1, ValueEnd - 1);
      end;
    end;
  end;
end;

function GetAssetURL(ReleaseJson, AssetName: string): string;
var
  AssetNamePos, UrlPos, UrlStart, UrlEnd: Integer;
  SearchStart: Integer;
  SubJson: string;
begin
  Result := '';

  // Match exactly as in GitHub JSON (no space after colon)
  AssetNamePos := Pos('"name":"' + AssetName + '"', ReleaseJson);

  if AssetNamePos = 0 then
  begin
    Log('Asset "' + AssetName + '" not found in JSON.');
    Exit;
  end;

  // Restrict search range to after found asset
  SearchStart := AssetNamePos;
  SubJson := Copy(ReleaseJson, SearchStart, Length(ReleaseJson) - SearchStart + 1);

  UrlPos := Pos('"browser_download_url":"', SubJson);
  if UrlPos = 0 then
  begin
    Log('browser_download_url not found for "' + AssetName + '".');
    Exit;
  end;

  UrlStart := UrlPos + Length('"browser_download_url":"');
  UrlEnd := Pos('"', Copy(SubJson, UrlStart, MaxInt));
  if UrlEnd = 0 then
  begin
    Log('Failed to find end of URL for "' + AssetName + '".');
    Exit;
  end;

  Result := Copy(SubJson, UrlStart, UrlEnd - 1);
  Log('Found asset "' + AssetName + '" URL: ' + Result);
end;

function GetInstalledVersion(): string;
var
  ver: string;
begin
  if RegQueryStringValue(HKLM, 'Software\Wow6432Node\Zablind Patcher', 'Version', ver) then
    Result := ver
  else
    Result := '';
end;

// --- Main Setup Logic ---
function InitializeSetup(): Boolean;
var
  InstalledVersion: string;
  GitHubApiURL: string;
  JsonPath: string;
  backupAsar: string;
begin
  PerformInstall := False;
  
  latestZaloPath := GetZaloResourcePath('');
  if not DirExists(latestZaloPath) then
  begin
    MsgBox(CustomMessage('ZaloNotFound'), mbError, MB_OK);
    Result := False;
    Exit;
  end;

  // Always use fresh version check
  GitHubApiURL := 'https://api.github.com/repos/{#GitHubUser}/{#GitHubRepo}/releases/latest?t=' + GetDateTimeString('yyyymmddhhnnss', '-', ':');
  JsonPath := ExpandConstant('{tmp}\release.json');
  
  if not DownloadFilePS(GitHubApiURL, JsonPath) then
  begin
    MsgBox(CustomMessage('ConnectionError'), mbError, MB_OK);
    Result := False; 
    Exit;
  end;
  
  if LoadStringFromFile(JsonPath, LatestReleaseJson) then
  begin
    // DEBUG: Log first 200 chars of JSON
    Log('GitHub Response: ' + Copy(LatestReleaseJson, 1, 200) + '...');
    
    LatestVersion := GetJsonValue(LatestReleaseJson, 'tag_name');
    InstalledVersion := GetInstalledVersion();
    
    // Verify assets exist before proceeding
    if (GetAssetURL(LatestReleaseJson, '{#AppAsarFile}') = '') or 
       (GetAssetURL(LatestReleaseJson, '{#GuideFile}') = '') then
    begin
      Log('Missing assets in release. Full JSON:');
      Log(LatestReleaseJson);
      MsgBox(CustomMessage('FileError'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
    
    if InstalledVersion = '' then
    begin
      MsgBox(FmtMessage(CustomMessage('DownloadAndInstall'), [LatestVersion]), mbInformation, MB_OK);
      PerformInstall := True;
    end
    else if CompareVersions(LatestVersion, InstalledVersion) > 0 then
    begin
      if MsgBox(FmtMessage(CustomMessage('UpdateAvailable'), [LatestVersion, InstalledVersion]), mbConfirmation, MB_YESNO) = IDYES then
      begin
        KillProcesses();
        DelTree(ExpandConstant('{app}'), True, True, True);
        PerformInstall := True;
      end;
    end
    else
    begin
      backupAsar := latestZaloPath + '\app.asar.bak';
      if FileExists(backupAsar) then
      begin 
        if MsgBox(CustomMessage('AlreadyInstalled') + #13#10 + CustomMessage('UninstallOption'), mbConfirmation, MB_YESNO) = IDYES then
        begin
          KillProcesses();
          if DeleteFile(latestZaloPath + '\app.asar') then
          begin
            if RenameFile(backupAsar, latestZaloPath + '\app.asar') then
              MsgBox(CustomMessage('UninstallSuccess'), mbInformation, MB_OK)
            else
              MsgBox(CustomMessage('RestoreFailed'), mbError, MB_OK);
          end
          else
            MsgBox(CustomMessage('UninstallFailed'), mbError, MB_OK);
        end;
      end
      else
      begin
        MsgBox(FmtMessage(CustomMessage('LatestVersion'), [InstalledVersion]), mbInformation, MB_OK);
      end;
    end;
  end
  else
  begin
    MsgBox(CustomMessage('ConnectionError'), mbError, MB_OK);
    Result := False;
    Exit;
  end;

  Result := PerformInstall;
end;

function InitializeUninstall(): Boolean;
begin
  KillProcesses();
  Result := True;
end;


procedure CurStepChanged(CurStep: TSetupStep);
var
  AppAsarURL, GuideURL, appAsar, backupAsar: string;
begin
  if (CurStep = ssInstall) and PerformInstall then
  begin
    WizardForm.ProgressGauge.Style := npbstMarquee; 
    
    AppAsarURL := GetAssetURL(LatestReleaseJson, '{#AppAsarFile}');
    GuideURL := GetAssetURL(LatestReleaseJson, '{#GuideFile}');
    
    if (AppAsarURL = '') or (GuideURL = '') then
    begin
      MsgBox(CustomMessage('FileError'), mbError, MB_OK);
      Exit;
    end;

    WizardForm.StatusLabel.Caption := CustomMessage('Downloading');
    DownloadFilePS(AppAsarURL, ExpandConstant('{tmp}\{#AppAsarFile}'));
    DownloadFilePS(GuideURL, ExpandConstant('{app}\{#GuideFile}'));
    
    WizardForm.StatusLabel.Caption := CustomMessage('Finalizing');
    
    KillProcesses();
    appAsar := latestZaloPath + '\app.asar';
    backupAsar := latestZaloPath + '\app.asar.bak';
    
    if not FileExists(backupAsar) then
    begin
      RenameFile(appAsar, backupAsar);
    end
    else
    begin
      DeleteFile(appAsar);
    end;
    
    FileCopy(ExpandConstant('{tmp}\{#AppAsarFile}'), appAsar, False);
    
    RegWriteStringValue(HKLM, 'Software\Wow6432Node\{#MyAppName}', 'Version', LatestVersion);
    
    WizardForm.ProgressGauge.Style := npbstNormal;
  end;
end;