import os
import sys
import shutil
import winreg
import subprocess
import time

def speak(text):
    print(f"[INSTALLER] Speaking: {text}")
    try:
        import win32com.client
        sapi_voice = win32com.client.Dispatch("SAPI.SpVoice")
        sapi_voice.Speak(text)
    except Exception as e:
        print(f"[INSTALLER] TTS failed: {e}")

def main():
    speak("Bắt đầu cài đặt Zablind. Vui lòng đợi trong giây lát.")
    
    try:
        base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        
        local_appdata = os.environ.get('LOCALAPPDATA')
        if not local_appdata:
            local_appdata = os.path.join(os.environ.get('USERPROFILE', ''), 'AppData', 'Local')
            
        target_dir = os.path.join(local_appdata, 'Programs', 'zablind_call')
        
        # Kill running processes
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
        shutil.copy2(src_exe, os.path.join(target_dir, 'ZablindCallHandler.exe'))
        shutil.copy2(src_preload, os.path.join(target_dir, 'preload-wrapper.js'))
        shutil.copy2(src_popup, os.path.join(target_dir, 'popup-viewer.html'))
        shutil.copytree(src_zablind, os.path.join(target_dir, 'zablind'))
        
        # Register startup key
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        installed_exe = os.path.join(target_dir, 'ZablindCallHandler.exe')
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, "ZablindCallHandler", 0, winreg.REG_SZ, f'"{installed_exe}"')
        winreg.CloseKey(key)
        
        print("[INSTALLER] Installed files successfully.")
        
        # Spawn new call handler
        subprocess.Popen([installed_exe], cwd=target_dir)
        
        speak("Cài đặt Zablind hoàn tất. Dịch vụ đã khởi chạy thành công.")
        
    except Exception as e:
        print(f"[INSTALLER] Fatal error: {e}")
        speak("Cài đặt Zablind thất bại. Vui lòng kiểm tra lại quyền hạn của hệ thống.")
        sys.exit(1)

if __name__ == '__main__':
    main()
