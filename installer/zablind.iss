[Setup]
AppName=Bộ cài Zablind
AppVersion=b1.5
DiskSpanning=yes
PrivilegesRequired=admin
DefaultDirName={autopf}\Zablind
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=Zablind_b1.5
Compression=lzma
SolidCompression=yes

#define WatcherFileName "zablind_watcher.vbs"

[Languages]
Name: "vi"; MessagesFile: "compiler:Languages\Vietnamese.isl"

[Files]
Source: "app.asar"; DestDir: "{tmp}"; DestName: "patched.asar"; Flags: ignoreversion
Source: "huong_dan_zablind.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "Zablind Image.exe"; DestDir: "{app}"; Flags: ignoreversion nocompression

[Icons]
Name: "{group}\Zablind Installer"; Filename: "{app}\ZablindInstaller.exe"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueName: "ZablindWatcher"; ValueType: string; \
    ValueData: "wscript.exe ""{app}\{#WatcherFileName}"""; Flags: uninsdeletevalue

[UninstallDelete]
Type: files; Name: "{app}\*"
Type: files; Name: "{app}\{#WatcherFileName}"
Type: dirifempty; Name: "{app}"

[Code]
// --- Windows API for Centering Forms ---
const
  SM_CXSCREEN = 0;
  SM_CYSCREEN = 1;
function GetSystemMetrics(nIndex: Integer): Integer;
  external 'GetSystemMetrics@user32.dll stdcall';
  
var
  latestZaloPath: string;
  ResultCode: Integer;
  WasReinstall: Boolean;

// --- Custom Accessible Dialog Functions ---

// An accessible message box with a single "OK" button.
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
    OKButton.Caption := 'Đồng ý';
    OKButton.ModalResult := mrOk;
    OKButton.Default := True;
    OKButton.Cancel := True;
    
    Form.ActiveControl := MessageMemo;

    // ✅ ADD THIS LINE: Select all text to encourage the screen reader to read it all.
    MessageMemo.SelectAll;

    Form.ShowModal();
  finally
    Form.Free;
  end;
end;

// An accessible choice box with Vietnamese buttons that returns IDYES, IDNO, or IDCANCEL.
function AccessibleChoiceBox(Message, Title: string): Integer;
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
    YesButton.SetBounds(Form.ClientWidth - 270, Form.ClientHeight - 45, 75, 25);
    YesButton.Caption := 'Có';
    YesButton.ModalResult := mrYes;

    NoButton := TButton.Create(Form);
    NoButton.Parent := Form;
    NoButton.SetBounds(Form.ClientWidth - 185, Form.ClientHeight - 45, 75, 25);
    NoButton.Caption := 'Không';
    NoButton.ModalResult := mrNo;

    CancelButton := TButton.Create(Form);
    CancelButton.Parent := Form;
    CancelButton.SetBounds(Form.ClientWidth - 100, Form.ClientHeight - 45, 75, 25);
    CancelButton.Caption := 'Huỷ';
    CancelButton.ModalResult := mrCancel;
    CancelButton.Cancel := True;

    Form.ActiveControl := MessageMemo;

    // ✅ ADD THIS LINE: Select all text to encourage the screen reader to read it all.
    MessageMemo.SelectAll;

    ModalResultValue := Form.ShowModal();
    if ModalResultValue = mrYes then
      Result := IDYES
    else if ModalResultValue = mrNo then
      Result := IDNO
    else
      Result := IDCANCEL;

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
  // Kill Zalo, the watcher script (wscript.exe), and the image process.
  Exec('taskkill', '/F /IM Zalo.exe', '', SW_HIDE, ewNoWait, ResultCode);
  Exec('taskkill', '/F /IM Zablind Image.exe', '', SW_HIDE, ewNoWait, ResultCode);
  // This is a broad way to kill the script; it's generally safe here.
  Exec('taskkill', '/F /IM wscript.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// NEW: Procedure to create the VBS watcher script dynamically.
procedure CreateProcessWatcherScript;
var
  WatcherPath: string;
  ScriptLines: TStringList;
begin
  WatcherPath := ExpandConstant('{app}\{#WatcherFileName}');
  ScriptLines := TStringList.Create;
  try
    ScriptLines.Add('Dim zaloRunning, imageRunning');
    ScriptLines.Add('Set wmi = GetObject("winmgmts:\\.\root\cimv2")');
    ScriptLines.Add('Set shell = CreateObject("WScript.Shell")');
    ScriptLines.Add('');
    ScriptLines.Add('Do');
    ScriptLines.Add('    zaloRunning = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name = ''Zalo.exe''").Count > 0');
    ScriptLines.Add('    imageRunning = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name = ''Zablind Image.exe''").Count > 0');
    ScriptLines.Add('');
    ScriptLines.Add('    If zaloRunning AND NOT imageRunning Then');
    ScriptLines.Add('        shell.Run """' + ExpandConstant('{app}\Zablind Image.exe') + '""", 0, False');
    ScriptLines.Add('    ElseIf NOT zaloRunning AND imageRunning Then');
    ScriptLines.Add('        shell.Run "taskkill /F /IM ""Zablind Image.exe""", 0, True');
    ScriptLines.Add('    End If');
    ScriptLines.Add('');
    ScriptLines.Add('    WScript.Sleep(5000)'); // Check every 5 seconds
    ScriptLines.Add('Loop');
    
    ScriptLines.SaveToFile(WatcherPath);
  finally
    ScriptLines.Free;
  end;
end;

function InitializeSetup(): Boolean;
var
  appAsar, backupAsar, appPath: string;
  choice: Integer;
begin
  WasReinstall := False;
  latestZaloPath := GetZaloResourcePath('');
  appAsar := latestZaloPath + '\app.asar';
  backupAsar := latestZaloPath + '\app.asar.bak';

  if not DirExists(latestZaloPath) then
  begin
    AccessibleMessageBox('Không thể tìm thấy nơi cài đặt Zalo. Bạn phải tải và cài đặt Zalo trước.', 'Lỗi');
    Result := False;
    Exit;
  end;

  KillProcesses();

  if FileExists(backupAsar) then
  begin
    choice := AccessibleChoiceBox('Zablind đã được cài đặt trước đó. Hãy chọn một trong hai tuỳ chọn:' + #13#10#13#10 +
                                  '• Có = GỠ CÀI ĐẶT Zablind' + #13#10 +
                                  '• Không = CÀI ĐẶT LẠI hoặc CẬP NHẬT Zablind' + #13#10 +
                                  '• Huỷ = Thoát',
                                  'Lựa chọn hành động');
    if choice = IDYES then
    begin
      if DeleteFile(appAsar) then
      begin
        if RenameFile(backupAsar, appAsar) then
        begin
          RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'ZablindWatcher');
          appPath := ExpandConstant('{autopf}\Zablind');
          DeleteFile(appPath + '\{#WatcherFileName}');
          DeleteFile(appPath + '\Zablind Image.exe');
          DeleteFile(appPath + '\huong_dan_zablind.txt');
          AccessibleMessageBox('Zablind đã được gỡ cài đặt. Zalo đã được khôi phục lại như ban đầu. Bấm Tab rồi chọn Đồng ý để tắt thông báo này. Zablind rất buồn khi phải xa bạn, hẹn gặp lại!', 'Thông báo');
        end
        else
          AccessibleMessageBox('QUAN TRỌNG: Không thể sao lưu bản cài đặt mặc định của Zalo. Hãy cài đặt lại Zalo.', 'Lỗi nghiêm trọng');
      end
      else
        AccessibleMessageBox('Gỡ cài đặt thất bại. Không thể xoá bản cài đặt cũ.', 'Lỗi');
      
      Result := False;
    end
    else if choice = IDNO then
    begin
      WasReinstall := True;
      Result := True;
    end
    else
    begin
      Result := False;
    end;
  end
  else
  begin
    Result := True;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  appAsar, backupAsar, newAsar, zaloExePath: string;
begin
  if CurStep = ssPostInstall then
  begin
    appAsar := latestZaloPath + '\app.asar';
    backupAsar := latestZaloPath + '\app.asar.bak';
    newAsar := ExpandConstant('{tmp}\patched.asar');

    if WasReinstall then
    begin
      if not DeleteFile(appAsar) then
      begin
        AccessibleMessageBox('Cập nhật thất bại. Không thể xoá bản cài đặt cũ.', 'Lỗi');
        Exit;
      end;
    end
    else
    begin
      if not RenameFile(appAsar, backupAsar) then
      begin
        AccessibleMessageBox('Cài đặt thất bại. Không thể sao lưu bản cài đặt mặc định.', 'Lỗi');
        Exit;
      end;
    end;

    if FileCopy(newAsar, appAsar, False) then
    begin
      CreateProcessWatcherScript();
      ShellExec('', 'wscript.exe', '"' + ExpandConstant('{app}\{#WatcherFileName}') + '"', '', SW_HIDE, ewNoWait, ResultCode);
      AccessibleMessageBox('Zablind đã được cài đặt hoặc cập nhật thành công. Hãy đọc mô tả được mở lên trong ứng dụng Notepad để biết cách sử dụng. Zalo sẽ được tự động mở lên. Bạn phải chờ ứng dụng Zablind Imager khởi động lên (sẽ có thông báo) thì mới sử dụng được tính năng mô tả hình ảnh. Bấm Tab rồi chọn Đồng ý để tắt thông báo này và quay lại bộ cài rồi bấm Hoàn thành để đóng bộ cài. Cảm ơn bạn vì đã chọn Zablind.', 'Thông báo');
      ShellExec('', 'notepad.exe', ExpandConstant('{app}\huong_dan_zablind.txt'), '', SW_SHOW, ewNoWait, ResultCode);
      
      zaloExePath := ExtractFilePath(ExtractFilePath(latestZaloPath)) + 'Zalo.exe';
      if FileExists(zaloExePath) then
        ShellExec('', zaloExePath, '', '', SW_SHOWNORMAL, ewNoWait, ResultCode)
      else
        AccessibleMessageBox('Không thể tìm thấy Zalo.exe để khởi chạy. Bạn phải khởi động Zalo thủ công.', 'Lỗi');
    end
    else
    begin
      AccessibleMessageBox('Cài đặt thất bại. Không thể sao chép bản cài đặt mới.', 'Lỗi');
      if FileExists(backupAsar) then
        RenameFile(backupAsar, appAsar);
    end;
  end;
end;