import os
import sys
import shutil
import winreg
import subprocess
import time
import tkinter as tk
from tkinter import ttk, messagebox
import threading

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
        shutil.copy2(src_exe, os.path.join(target_dir, 'ZablindCallHandler.exe'))
        shutil.copy2(src_preload, os.path.join(target_dir, 'preload-wrapper.js'))
        shutil.copy2(src_popup, os.path.join(target_dir, 'popup-viewer.html'))
        shutil.copytree(src_zablind, os.path.join(target_dir, 'zablind'))
        
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
                subprocess.Popen(
                    [zalo_exe],
                    cwd=os.path.dirname(zalo_exe),
                    creationflags=0x00000008 | 0x08000000, # DETACHED_PROCESS | CREATE_NO_WINDOW
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL
                )
                
        return True
    except Exception as e:
        print(f"[UNINSTALLER] Fatal error during uninstall: {e}")
        return False

class InstallerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Bộ cài đặt Zablind")
        self.root.geometry("450x320")
        self.root.resizable(False, False)
        
        # Center the window
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f'{width}x{height}+{x}+{y}')
        
        # Setup ttk style for screen reader accessibility and consistent fonts
        style = ttk.Style()
        try:
            if 'vista' in style.theme_names():
                style.theme_use('vista')
            elif 'xpnative' in style.theme_names():
                style.theme_use('xpnative')
        except:
            pass
            
        style.configure('TLabel', font=("Arial", 11))
        style.configure('Title.TLabel', font=("Arial", 15, "bold"), foreground="#2b6cb0")
        style.configure('Status.TLabel', font=("Arial", 11, "bold"), foreground="#4a5568")
        style.configure('TButton', font=("Arial", 11, "bold"))
        
        # UI Elements using native ttk widgets for MSAA screen reader support
        self.title_lbl = ttk.Label(root, text="BỘ CÀI ĐẶT ZABLIND", style="Title.TLabel", takefocus=True)
        self.title_lbl.pack(pady=15)
        
        self.desc_lbl = ttk.Label(root, text="Vui lòng chọn một tùy chọn bên dưới:", style="TLabel", takefocus=True)
        self.desc_lbl.pack(pady=5)
        
        btn_frame = ttk.Frame(root)
        btn_frame.pack(pady=15)
        
        self.btn_install = ttk.Button(btn_frame, text="1. Cài đặt / Cài đặt lại", style="TButton", command=self.start_install)
        self.btn_install.pack(pady=5)
        
        self.btn_uninstall = ttk.Button(btn_frame, text="2. Gỡ cài đặt Zablind", style="TButton", command=self.start_uninstall)
        self.btn_uninstall.pack(pady=5)
        
        self.btn_exit = ttk.Button(btn_frame, text="3. Thoát", style="TButton", command=self.exit_app)
        self.btn_exit.pack(pady=5)
        
        self.status_lbl = ttk.Label(root, text="Trạng thái: Sẵn sàng", style="Status.TLabel", takefocus=True)
        self.status_lbl.pack(pady=10)
        
        # Default focus on the title label to read context first, user can Tab through
        self.title_lbl.focus_set()
        
    def start_install(self):
        self.btn_install.config(state="disabled")
        self.btn_uninstall.config(state="disabled")
        self.btn_exit.config(state="disabled")
        self.status_lbl.config(text="Trạng thái: Đang cài đặt...")
        self.status_lbl.focus_set()
        threading.Thread(target=self.run_install_thread, daemon=True).start()
        
    def run_install_thread(self):
        try:
            success = install_zablind_core(self.update_status)
            if success:
                self.root.after(0, lambda: self.finish_task("Cài đặt thành công!", True))
            else:
                self.root.after(0, lambda: self.finish_task("Cài đặt thất bại!", False))
        except Exception as e:
            self.root.after(0, lambda: self.finish_task(f"Lỗi: {str(e)}", False))
            
    def start_uninstall(self):
        self.btn_install.config(state="disabled")
        self.btn_uninstall.config(state="disabled")
        self.btn_exit.config(state="disabled")
        self.status_lbl.config(text="Trạng thái: Đang gỡ cài đặt...")
        self.status_lbl.focus_set()
        threading.Thread(target=self.run_uninstall_thread, daemon=True).start()
        
    def run_uninstall_thread(self):
        try:
            success = uninstall_zablind_core(self.update_status)
            if success:
                self.root.after(0, lambda: self.finish_task("Gỡ cài đặt thành công!", True))
            else:
                self.root.after(0, lambda: self.finish_task("Gỡ cài đặt thất bại!", False))
        except Exception as e:
            self.root.after(0, lambda: self.finish_task(f"Lỗi: {str(e)}", False))
            
    def update_status(self, text):
        def update():
            self.status_lbl.config(text=f"Trạng thái: {text}")
            self.status_lbl.focus_set()
        self.root.after(0, update)
        
    def finish_task(self, text, is_success):
        self.status_lbl.config(text=f"Trạng thái: {text}")
        
        self.btn_install.config(state="normal")
        self.btn_uninstall.config(state="normal")
        self.btn_exit.config(state="normal")
        
        # Set focus to status label so screen reader announces final state
        self.status_lbl.focus_set()
        
        if is_success:
            messagebox.showinfo("Thông báo", text)
        else:
            messagebox.showerror("Lỗi", text)
        self.btn_exit.focus_set()
        
    def exit_app(self):
        self.root.destroy()

def main():
    root = tk.Tk()
    app = InstallerApp(root)
    root.mainloop()

if __name__ == '__main__':
    main()
