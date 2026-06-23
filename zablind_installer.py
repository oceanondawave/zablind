import os
import sys
import shutil
import winreg
import subprocess
import time
import win32gui
import win32con
import win32api
import threading
import win32com.client

# Global control handles
hwnd_main = None
hwnd_btn1 = None
hwnd_btn2 = None
hwnd_btn3 = None
hwnd_status = None
h_title = None
h_desc = None

# Tab navigation order
tab_order = []

# Store original window procedures for subclassed controls
orig_wndprocs = {}

def robust_copy_file(src, dst, max_retries=5, delay=0.5):
    for i in range(max_retries):
        try:
            if os.path.exists(dst):
                try: os.remove(dst)
                except: pass
            shutil.copy2(src, dst)
            return True
        except (PermissionError, OSError) as e:
            if i == max_retries - 1:
                raise e
            time.sleep(delay)

def robust_copy_tree(src, dst, max_retries=5, delay=0.5):
    for i in range(max_retries):
        try:
            if os.path.exists(dst):
                try: shutil.rmtree(dst)
                except: pass
            shutil.copytree(src, dst)
            return True
        except (PermissionError, OSError) as e:
            if i == max_retries - 1:
                raise e
            time.sleep(delay)

def install_zablind_core(status_callback):
    status_callback("Bắt đầu cài đặt...")
    try:
        base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        
        local_appdata = os.environ.get('LOCALAPPDATA')
        if not local_appdata:
            local_appdata = os.path.join(os.environ.get('USERPROFILE', ''), 'AppData', 'Local')
            
        target_dir = os.path.join(local_appdata, 'Programs', 'zablind_call')
        
        # Kill running processes
        status_callback("Đang dừng các ứng dụng liên quan...")
        zalo_names = ["zalo.exe", "zaloexecutable.exe", "zalocall.exe", "zablindcallhandler.exe", "zablindcallhandler_x86.exe"]
        try:
            import psutil
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    if proc.info['name'] and proc.info['name'].lower() in zalo_names:
                        proc.kill()
                except:
                    pass
        except:
            # Fallback to taskkill
            for name in zalo_names:
                try: subprocess.run(f"taskkill /F /IM {name}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except: pass
                
        time.sleep(1.5)
        
        # Recreate target folder
        status_callback("Đang chuẩn bị thư mục cài đặt...")
        if os.path.exists(target_dir):
            try: shutil.rmtree(target_dir)
            except: pass
        os.makedirs(target_dir, exist_ok=True)
        
        # Define source paths
        src_exe = os.path.join(base_path, 'ZablindCallHandler.exe')
        src_preload = os.path.join(base_path, 'preload-wrapper.js')
        src_popup = os.path.join(base_path, 'popup-viewer.html')
        src_zablind = os.path.join(base_path, 'zablind')
        
        # Copy files
        status_callback("Đang sao chép các tệp tin...")
        robust_copy_file(src_exe, os.path.join(target_dir, 'ZablindCallHandler.exe'))
        robust_copy_file(src_preload, os.path.join(target_dir, 'preload-wrapper.js'))
        robust_copy_file(src_popup, os.path.join(target_dir, 'popup-viewer.html'))
        robust_copy_tree(src_zablind, os.path.join(target_dir, 'zablind'))
        
        # Clean up legacy startup registry key if present (don't start with PC anymore)
        status_callback("Đang dọn dẹp hệ thống...")
        try:
            key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
            try:
                winreg.DeleteValue(key, "ZablindCallHandler")
                print("[INSTALLER] Removed legacy startup key.")
            except FileNotFoundError:
                pass
            winreg.CloseKey(key)
        except Exception as reg_err:
            print(f"[INSTALLER] Legacy registry clean error: {reg_err}")
            
        # Run Zalo patching once synchronously using the newly copied ZablindCallHandler.exe
        status_callback("Đang vá và khởi động lại Zalo...")
        installed_exe = os.path.join(target_dir, 'ZablindCallHandler.exe')
        try:
            print("[INSTALLER] Running initial patcher synchronously...")
            clean_env = os.environ.copy()
            for key in list(clean_env.keys()):
                k_upper = key.upper()
                if k_upper.startswith('_MEIPASS') or k_upper.startswith('_MEI') or k_upper.startswith('_PYI') or k_upper in ('TCL_LIBRARY', 'TK_LIBRARY'):
                    clean_env.pop(key, None)
            
            # Clean PATH variable from any _MEI temporary paths
            path_key = next((k for k in clean_env if k.upper() == 'PATH'), None)
            if path_key:
                path_val = clean_env[path_key]
                parts = path_val.split(os.pathsep)
                clean_parts = [p for p in parts if '_MEI' not in p]
                clean_env[path_key] = os.pathsep.join(clean_parts)
            res = subprocess.run(
                [installed_exe, "patch-once"],
                cwd=target_dir,
                creationflags=0x08000000, # CREATE_NO_WINDOW
                capture_output=True,
                text=True,
                timeout=45,
                env=clean_env
            )
            print(f"[INSTALLER] Patcher stdout: {res.stdout}")
            if res.returncode != 0:
                print(f"[INSTALLER] Patcher failed with returncode {res.returncode}. stderr: {res.stderr}")
                status_callback("Lỗi vá Zalo!")
                return False
        except Exception as patch_err:
            print(f"[INSTALLER] Failed to run patcher: {patch_err}")
            status_callback("Lỗi khởi chạy trình vá Zalo!")
            return False
            
        print("[INSTALLER] Installed files successfully.")
        return True
    except Exception as e:
        print(f"[INSTALLER] Fatal error: {e}")
        return False

def uninstall_zablind_core(status_callback):
    status_callback("Bắt đầu gỡ cài đặt...")
    
    try:
        # 1. Kill running processes
        status_callback("Đang dừng các ứng dụng liên quan...")
        zalo_names = ["zalo.exe", "zaloexecutable.exe", "zalocall.exe", "zablindcallhandler.exe", "zablindcallhandler_x86.exe"]
        try:
            import psutil
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    if proc.info['name'] and proc.info['name'].lower() in zalo_names:
                        proc.kill()
                except:
                    pass
        except:
            # Fallback to taskkill
            for name in zalo_names:
                try: subprocess.run(f"taskkill /F /IM {name}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except: pass
                
        time.sleep(1.5)
        
        # 2. Remove Startup Run registry key
        status_callback("Đang dọn dẹp hệ thống...")
        try:
            key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
            try:
                winreg.DeleteValue(key, "ZablindCallHandler")
                print("[UNINSTALLER] Removed registry startup entry.")
            except FileNotFoundError:
                pass
            winreg.CloseKey(key)
        except Exception as reg_err:
            print(f"[UNINSTALLER] Startup registry key error: {reg_err}")
            
        # 3. Restore Zalo original files (app.asar) from backup
        status_callback("Đang khôi phục các tệp tin gốc của Zalo...")
        local_appdata = os.environ.get('LOCALAPPDATA')
        if local_appdata:
            zalo_base = os.path.join(local_appdata, 'Programs', 'Zalo')
            if os.path.exists(zalo_base):
                subdirs = [d for d in os.listdir(zalo_base) if d.startswith('Zalo-')]
                for subdir in subdirs:
                    res_dir = os.path.join(zalo_base, subdir, 'resources')
                    if os.path.exists(res_dir):
                        active_asar = os.path.join(res_dir, 'app.asar')
                        backup_asar = os.path.join(res_dir, 'app.asar.bak')
                        active_unpacked = os.path.join(res_dir, 'app.asar.unpacked')
                        backup_unpacked = os.path.join(res_dir, 'app.asar.bak.unpacked')
                        
                        # Restore main asar
                        if os.path.exists(backup_asar):
                            try:
                                if os.path.exists(active_asar):
                                    os.remove(active_asar)
                                shutil.copy2(backup_asar, active_asar)
                                os.remove(backup_asar)
                                print(f"[UNINSTALLER] Restored app.asar backup in {subdir}")
                            except Exception as e:
                                print(f"[UNINSTALLER] Failed to restore app.asar in {subdir}: {e}")
                                
                        # Restore unpacked dir
                        if os.path.exists(backup_unpacked):
                            try:
                                if os.path.exists(active_unpacked):
                                    shutil.rmtree(active_unpacked)
                                shutil.copytree(backup_unpacked, active_unpacked)
                                shutil.rmtree(backup_unpacked)
                                print(f"[UNINSTALLER] Restored app.asar.unpacked backup in {subdir}")
                            except Exception as e:
                                print(f"[UNINSTALLER] Failed to restore app.asar.unpacked in {subdir}: {e}")
                                
        # 4. Remove target folder
        status_callback("Đang xóa thư mục cài đặt...")
        if local_appdata:
            target_dir = os.path.join(local_appdata, 'Programs', 'zablind_call')
            if os.path.exists(target_dir):
                try:
                    shutil.rmtree(target_dir)
                    print("[UNINSTALLER] Removed target folder.")
                except Exception as e:
                    print(f"[UNINSTALLER] Failed to delete target folder: {e}")
                    
        # 5. Restart Zalo clean if it exists
        status_callback("Đang khởi động lại Zalo...")
        if local_appdata:
            zalo_exe = os.path.join(local_appdata, 'Programs', 'Zalo', 'Zalo.exe')
            if os.path.exists(zalo_exe):
                print(f"[UNINSTALLER] Launching original Zalo: {zalo_exe}")
                clean_env = os.environ.copy()
                for key in list(clean_env.keys()):
                    k_upper = key.upper()
                    if k_upper.startswith('_MEIPASS') or k_upper.startswith('_MEI') or k_upper.startswith('_PYI') or k_upper in ('TCL_LIBRARY', 'TK_LIBRARY'):
                        clean_env.pop(key, None)
                
                # Clean PATH variable from any _MEI temporary paths
                path_key = next((k for k in clean_env if k.upper() == 'PATH'), None)
                if path_key:
                    path_val = clean_env[path_key]
                    parts = path_val.split(os.pathsep)
                    clean_parts = [p for p in parts if '_MEI' not in p]
                    clean_env[path_key] = os.pathsep.join(clean_parts)
                subprocess.Popen(
                    [zalo_exe],
                    cwd=os.path.dirname(zalo_exe),
                    creationflags=0x00000008 | 0x08000000, # DETACHED_PROCESS | CREATE_NO_WINDOW
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    env=clean_env
                )
                
        return True
    except Exception as e:
        print(f"[UNINSTALLER] Fatal error during uninstall: {e}")
        return False

speaker = None

def speak_accessible(text):
    global speaker
    if speaker is None:
        try:
            import accessible_output2.outputs.auto
            speaker = accessible_output2.outputs.auto.Auto()
        except Exception as e:
            print(f"[ACCESSIBLE] Error initializing accessible_output2 auto speaker: {e}")
            
    if speaker:
        try:
            speaker.speak(text)
            print(f"[ACCESSIBLE] Spoke: {text}")
            return True
        except Exception as e:
            print(f"[ACCESSIBLE] Error speaking via accessible_output2: {e}")

    # Try speaking using NVDA API
    try:
        nvda = win32com.client.Dispatch("nvdaController.controller")
        nvda.speakText(text)
        print(f"[ACCESSIBLE] Spoke via NVDA: {text}")
        return True
    except:
        pass

    # Try speaking using JAWS API
    try:
        jaws = win32com.client.Dispatch("JFWApi")
        jaws.SayString(text, True)
        print(f"[ACCESSIBLE] Spoke via JAWS: {text}")
        return True
    except:
        pass
        
    return False

def set_status(text):
    if hwnd_status:
        status_str = f"Trạng thái: {text}"
        win32gui.SetWindowText(hwnd_status, status_str)
        speak_accessible(status_str)
        try:
            if h_title:
                win32gui.SetFocus(h_title)
            win32gui.SetFocus(hwnd_status)
        except:
            pass

def disable_ui():
    if hwnd_btn1: win32gui.EnableWindow(hwnd_btn1, False)
    if hwnd_btn2: win32gui.EnableWindow(hwnd_btn2, False)
    if hwnd_btn3: win32gui.EnableWindow(hwnd_btn3, False)

def enable_ui():
    if hwnd_btn1: win32gui.EnableWindow(hwnd_btn1, True)
    if hwnd_btn2: win32gui.EnableWindow(hwnd_btn2, True)
    if hwnd_btn3: win32gui.EnableWindow(hwnd_btn3, True)

def run_install():
    disable_ui()
    success = install_zablind_core(set_status)
    enable_ui()
    if success:
        set_status("Cài đặt thành công!")
        win32api.MessageBox(hwnd_main, "Cài đặt Zablind thành công!", "Thông báo", win32con.MB_OK | win32con.MB_ICONINFORMATION)
    else:
        set_status("Cài đặt thất bại!")
        win32api.MessageBox(hwnd_main, "Cài đặt Zablind thất bại!", "Lỗi", win32con.MB_OK | win32con.MB_ICONERROR)
    if hwnd_btn3:
        win32gui.SetFocus(hwnd_btn3)

def run_uninstall():
    disable_ui()
    success = uninstall_zablind_core(set_status)
    enable_ui()
    if success:
        set_status("Gỡ cài đặt thành công!")
        win32api.MessageBox(hwnd_main, "Gỡ cài đặt Zablind thành công!", "Thông báo", win32con.MB_OK | win32con.MB_ICONINFORMATION)
    else:
        set_status("Gỡ cài đặt thất bại!")
        win32api.MessageBox(hwnd_main, "Gỡ cài đặt Zablind thất bại!", "Lỗi", win32con.MB_OK | win32con.MB_ICONERROR)
    if hwnd_btn3:
        win32gui.SetFocus(hwnd_btn3)

def button_subclass_proc(hwnd, msg, wparam, lparam):
    global hwnd_btn1, hwnd_btn2, hwnd_btn3, tab_order
    
    if msg == win32con.WM_KEYDOWN:
        vk = wparam
        if vk == win32con.VK_TAB:
            # Handle keyboard Tab navigation manually across all registered UI controls
            shift = (win32api.GetKeyState(win32con.VK_SHIFT) & 0x8000) != 0
            
            try:
                idx = tab_order.index(hwnd)
                if shift:
                    next_idx = (idx - 1) % len(tab_order)
                else:
                    next_idx = (idx + 1) % len(tab_order)
                next_hwnd = tab_order[next_idx]
                if next_hwnd:
                    win32gui.SetFocus(next_hwnd)
            except ValueError:
                pass
            return 0
            
        elif vk == win32con.VK_RETURN:
            # Simulate Enter key activation if focus is currently on one of the buttons
            control_id = 0
            if hwnd == hwnd_btn1: control_id = 201
            elif hwnd == hwnd_btn2: control_id = 202
            elif hwnd == hwnd_btn3: control_id = 203
            
            if control_id > 0:
                parent = win32gui.GetParent(hwnd)
                win32gui.PostMessage(parent, win32con.WM_COMMAND, control_id, hwnd)
            return 0
            
    orig = orig_wndprocs.get(hwnd)
    if orig:
        return win32gui.CallWindowProc(orig, hwnd, msg, wparam, lparam)
    return win32gui.DefWindowProc(hwnd, msg, wparam, lparam)

def wnd_proc(hwnd, msg, wparam, lparam):
    global hwnd_main, hwnd_btn1, hwnd_btn2, hwnd_btn3, hwnd_status, h_title, tab_order
    
    if msg == win32con.WM_COMMAND:
        control_id = win32api.LOWORD(wparam)
        if control_id == 201: # Install
            threading.Thread(target=run_install, daemon=True).start()
        elif control_id == 202: # Uninstall
            threading.Thread(target=run_uninstall, daemon=True).start()
        elif control_id == 203: # Exit
            win32gui.DestroyWindow(hwnd)
        return 0
        
    elif msg == win32con.WM_ACTIVATE:
        # Focus h_title on activation if no other valid control has focus
        state = win32api.LOWORD(wparam)
        if state != win32con.WA_INACTIVE:
            try:
                curr_focus = win32gui.GetFocus()
                if tab_order and (curr_focus not in tab_order):
                    if h_title:
                        win32gui.SetFocus(h_title)
            except Exception as focus_err:
                print(f"[INSTALLER] WM_ACTIVATE focus error: {focus_err}")
        return 0
        
    elif msg == win32con.WM_CTLCOLORSTATIC or msg == win32con.WM_CTLCOLOREDIT:
        # Style read-only edit controls to blend into parent face color perfectly
        win32gui.SetTextColor(wparam, win32api.GetSysColor(win32con.COLOR_WINDOWTEXT))
        win32gui.SetBkColor(wparam, win32api.GetSysColor(win32con.COLOR_BTNFACE))
        return win32gui.GetSysColorBrush(win32con.COLOR_BTNFACE)
        
    elif msg == win32con.WM_DESTROY:
        win32gui.PostQuitMessage(0)
        return 0
        
    return win32gui.DefWindowProc(hwnd, msg, wparam, lparam)

def get_zablind_version():
    try:
        base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        config_path = os.path.join(base_path, 'zablind', 'config.js')
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                content = f.read()
                import re
                m = re.search(r"version:\s*['\"]([^'\"]+)['\"]", content)
                if m:
                    return m.group(1)
    except Exception as e:
        print(f"[VERSION] Error reading version: {e}")
    return "2.0"

def main():
    global hwnd_main, hwnd_btn1, hwnd_btn2, hwnd_btn3, hwnd_status, h_title, h_desc, tab_order
    
    # Create a named mutex to ensure single instance
    import ctypes
    mutex_name = "Local\\ZablindInstallerMutex"
    try:
        global _installer_mutex
        _installer_mutex = ctypes.windll.kernel32.CreateMutexW(None, True, mutex_name)
        last_error = ctypes.windll.kernel32.GetLastError()
        if last_error == 183: # ERROR_ALREADY_EXISTS
            hwnd_existing = win32gui.FindWindow("ZablindInstallerClass", None)
            if hwnd_existing:
                win32gui.ShowWindow(hwnd_existing, win32con.SW_RESTORE)
                win32gui.SetForegroundWindow(hwnd_existing)
            sys.exit(0)
    except Exception as mutex_err:
        print(f"[MUTEX] Error checking single instance: {mutex_err}")
    
    wc = win32gui.WNDCLASS()
    wc.lpfnWndProc = wnd_proc
    wc.lpszClassName = "ZablindInstallerClass"
    wc.hbrBackground = win32con.COLOR_BTNFACE + 1
    wc.hCursor = win32gui.LoadCursor(0, win32con.IDC_ARROW)
    
    try:
        class_atom = win32gui.RegisterClass(wc)
    except:
        class_atom = "ZablindInstallerClass"
        
    # Center window on screen
    screen_w = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
    screen_h = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)
    width = 450
    height = 300
    x = (screen_w - width) // 2
    y = (screen_h - height) // 2
    
    version = get_zablind_version()
    
    hwnd = win32gui.CreateWindow(
        class_atom,
        f"Bộ cài đặt Zablind v{version}",
        win32con.WS_OVERLAPPED | win32con.WS_CAPTION | win32con.WS_SYSMENU | win32con.WS_MINIMIZEBOX,
        x, y, width, height,
        0, 0, 0, None
    )
    
    hwnd_main = hwnd
    hfont = win32gui.GetStockObject(17) # 17 is DEFAULT_GUI_FONT
    
    # 1. Title Label (using EDIT control with ES_READONLY to allow keyboard focus and reading)
    h_title = win32gui.CreateWindow(
        "EDIT", f"BỘ CÀI ĐẶT ZABLIND v{version}",
        win32con.WS_CHILD | win32con.WS_VISIBLE | win32con.WS_TABSTOP | win32con.ES_READONLY | win32con.ES_CENTER | win32con.ES_MULTILINE,
        10, 15, 410, 25, hwnd, 101, 0, None
    )
    win32gui.SendMessage(h_title, win32con.WM_SETFONT, hfont, True)
    
    # 2. Desc Label (using EDIT control with ES_READONLY)
    h_desc = win32gui.CreateWindow(
        "EDIT", "Vui lòng chọn một tùy chọn bên dưới:",
        win32con.WS_CHILD | win32con.WS_VISIBLE | win32con.WS_TABSTOP | win32con.ES_READONLY | win32con.ES_CENTER | win32con.ES_MULTILINE,
        10, 45, 410, 20, hwnd, 102, 0, None
    )
    win32gui.SendMessage(h_desc, win32con.WM_SETFONT, hfont, True)
    
    # 3. Buttons (native controls with keyboard Tab stops)
    hwnd_btn1 = win32gui.CreateWindow(
        "BUTTON", "1. Cài đặt / Cài đặt lại",
        win32con.WS_CHILD | win32con.WS_VISIBLE | win32con.WS_TABSTOP | win32con.BS_DEFPUSHBUTTON,
        100, 80, 230, 40, hwnd, 201, 0, None
    )
    win32gui.SendMessage(hwnd_btn1, win32con.WM_SETFONT, hfont, True)
    
    hwnd_btn2 = win32gui.CreateWindow(
        "BUTTON", "2. Gỡ cài đặt Zablind",
        win32con.WS_CHILD | win32con.WS_VISIBLE | win32con.WS_TABSTOP,
        100, 130, 230, 40, hwnd, 202, 0, None
    )
    win32gui.SendMessage(hwnd_btn2, win32con.WM_SETFONT, hfont, True)
    
    hwnd_btn3 = win32gui.CreateWindow(
        "BUTTON", "3. Thoát",
        win32con.WS_CHILD | win32con.WS_VISIBLE | win32con.WS_TABSTOP,
        100, 180, 230, 30, hwnd, 203, 0, None
    )
    win32gui.SendMessage(hwnd_btn3, win32con.WM_SETFONT, hfont, True)
    
    # 4. Status Label (using EDIT control with ES_READONLY)
    hwnd_status = win32gui.CreateWindow(
        "EDIT", "Trạng thái: Sẵn sàng",
        win32con.WS_CHILD | win32con.WS_VISIBLE | win32con.WS_TABSTOP | win32con.ES_READONLY | win32con.ES_CENTER | win32con.ES_MULTILINE,
        10, 230, 410, 20, hwnd, 103, 0, None
    )
    win32gui.SendMessage(hwnd_status, win32con.WM_SETFONT, hfont, True)
    
    # Define exact Tab order including the text labels
    tab_order = [h_title, h_desc, hwnd_btn1, hwnd_btn2, hwnd_btn3, hwnd_status]
    
    # Subclass all controls to route Tab / Shift+Tab keyboard navigation correctly
    for ctrl in tab_order:
        try:
            orig = win32gui.SetWindowLong(ctrl, win32con.GWL_WNDPROC, button_subclass_proc)
            orig_wndprocs[ctrl] = orig
        except Exception as subclass_err:
            print(f"[INSTALLER] Subclassing error: {subclass_err}")
            
    # Show main window
    win32gui.ShowWindow(hwnd, win32con.SW_SHOWNORMAL)
    win32gui.UpdateWindow(hwnd)
    
    # Bring the window to the foreground and activate it
    try:
        win32gui.SetForegroundWindow(hwnd)
        win32gui.SetActiveWindow(hwnd)
    except Exception as act_err:
        print(f"[INSTALLER] Foreground activation warning: {act_err}")
        
    # Initial keyboard focus on title text
    if h_title:
        try:
            win32gui.SetFocus(h_title)
        except Exception as focus_err:
            print(f"[INSTALLER] Initial SetFocus error: {focus_err}")
    
    # Message loop
    while True:
        rc, msg = win32gui.GetMessage(None, 0, 0)
        if not rc:
            break
        win32gui.TranslateMessage(msg)
        win32gui.DispatchMessage(msg)

if __name__ == '__main__':
    main()
