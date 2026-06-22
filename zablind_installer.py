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

def install_zablind():
    speak("Installing Zablind. Please wait a moment.")
    
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
        
        speak("Zablind installation completed successfully. The background service has been started.")
        
    except Exception as e:
        print(f"[INSTALLER] Fatal error: {e}")
        speak("Zablind installation failed. Please check system permissions.")
        sys.exit(1)

def uninstall_zablind():
    speak("Uninstalling Zablind. Please wait a moment.")
    
    try:
        # 1. Kill running processes
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
        try:
            key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
            winreg.DeleteValue(key, "ZablindCallHandler")
            winreg.CloseKey(key)
            print("[UNINSTALLER] Removed registry startup entry.")
        except Exception as reg_err:
            print(f"[UNINSTALLER] Startup registry key not found or error: {reg_err}")
            
        # 3. Restore Zalo original files (app.asar) from backup
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
        if local_appdata:
            target_dir = os.path.join(local_appdata, 'Programs', 'zablind_call')
            if os.path.exists(target_dir):
                try:
                    shutil.rmtree(target_dir)
                    print("[UNINSTALLER] Removed target folder.")
                except Exception as e:
                    print(f"[UNINSTALLER] Failed to delete target folder: {e}")
                    
        # 5. Restart Zalo clean if it exists
        if local_appdata:
            zalo_exe = os.path.join(local_appdata, 'Programs', 'Zalo', 'Zalo.exe')
            if os.path.exists(zalo_exe):
                print(f"[UNINSTALLER] Launching original Zalo: {zalo_exe}")
                subprocess.Popen([zalo_exe], cwd=os.path.dirname(zalo_exe))
                
        speak("Zablind has been uninstalled successfully. Zalo is restored to its original state.")
        
    except Exception as e:
        print(f"[UNINSTALLER] Fatal error during uninstall: {e}")
        speak("Failed to uninstall Zablind completely.")
        sys.exit(1)

def main():
    speak("Welcome to the Zablind Installer.")
    while True:
        print("\n===========================================")
        print("             ZABLIND INSTALLER             ")
        print("===========================================")
        print("  1. Install / Reinstall Zablind           ")
        print("  2. Uninstall Zablind                     ")
        print("  3. Exit                                  ")
        print("===========================================")
        
        # Verbose TTS feedback for accessibility
        speak("Option 1. Install or Reinstall Zablind.")
        speak("Option 2. Uninstall Zablind.")
        speak("Option 3. Exit.")
        speak("Please type 1, 2, or 3, then press Enter.")
        
        try:
            choice = input("Select an option (1-3): ").strip()
        except KeyboardInterrupt:
            choice = "3"
            
        if choice == "1":
            install_zablind()
            break
        elif choice == "2":
            uninstall_zablind()
            break
        elif choice == "3":
            speak("Exiting installer.")
            break
        else:
            speak("Invalid choice. Please select 1, 2, or 3.")

if __name__ == '__main__':
    main()
