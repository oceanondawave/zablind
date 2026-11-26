import os
import sys
import shutil
import winreg
import subprocess
import time
import re
import json
import tempfile
import urllib.request
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

ZALO_COMPATIBLE_VERSION = "26.11.12"
ZALO_LEGACY_PAGE_URLS = [
    ("88362", "https://download.com.vn/download/zalo-83959?linkid=88362"),
    ("88286", "https://download.com.vn/download/zalo-83959?linkid=88286"),
]


def _parse_ver_tuple(ver_str):
    return tuple(int(x) for x in re.findall(r"\d+", str(ver_str or "")))


def has_asar_integrity_protection(zalo_exe_path):
    """Return True if Zalo.exe embeds Electron PE resource ELECTRONASAR (ASAR integrity lock)."""
    marker = "ELECTRONASAR".encode("utf-16le")
    try:
        chunk_size = 4 * 1024 * 1024
        overlap = len(marker) + 16
        prev = b""
        with open(zalo_exe_path, "rb") as f:
            while True:
                buf = f.read(chunk_size)
                if not buf:
                    break
                if marker in (prev + buf):
                    return True
                prev = buf[-overlap:] if len(buf) > overlap else buf
        return False
    except Exception:
        return False


def find_installed_zalo_state():
    """Inspect %LOCALAPPDATA%\\Programs\\Zalo and return (state, version_dir_name, exe_path)."""
    local_appdata = os.environ.get("LOCALAPPDATA") or os.path.join(os.environ.get("USERPROFILE", ""), "AppData", "Local")
    zalo_base = os.path.join(local_appdata, "Programs", "Zalo")
    if not os.path.isdir(zalo_base):
        return ("MISSING", None, None)

    subdirs = [d for d in os.listdir(zalo_base) if d.startswith("Zalo-") and os.path.isdir(os.path.join(zalo_base, d))]
    if not subdirs:
        return ("MISSING", None, None)

    subdirs.sort(key=lambda s: _parse_ver_tuple(s.replace("Zalo-", "")))
    latest_name = subdirs[-1]
    zalo_exe = os.path.join(zalo_base, latest_name, "Zalo.exe")
    if not os.path.exists(zalo_exe) or os.path.getsize(zalo_exe) == 0:
        return ("MISSING", None, None)

    if has_asar_integrity_protection(zalo_exe):
        return ("LOCKED", latest_name, zalo_exe)

    # Check if version is older than the pinned compatible version → upgrade to it
    ver_tuple = _parse_ver_tuple(latest_name.replace("Zalo-", ""))
    target_tuple = _parse_ver_tuple(ZALO_COMPATIBLE_VERSION)
    if ver_tuple and target_tuple and ver_tuple < target_tuple:
        return ("OUTDATED", latest_name, zalo_exe)

    return ("COMPATIBLE", latest_name, zalo_exe)


def verify_vng_zalo_installer(exe_path):
    """Verify downloaded installer is large, VNG-signed (Authenticode Valid), and <= 26.11.12."""
    try:
        if not os.path.exists(exe_path) or os.path.getsize(exe_path) < 50 * 1024 * 1024:
            print("[INSTALLER] Downloaded Zalo setup size check failed.")
            return False

        env = os.environ.copy()
        env["ZB_CHECK_EXE"] = exe_path
        ps_cmd = (
            "$sig = Get-AuthenticodeSignature -LiteralPath $env:ZB_CHECK_EXE; "
            "$vi = (Get-Item -LiteralPath $env:ZB_CHECK_EXE).VersionInfo; "
            "@{ status = [string]$sig.Status; "
            "   subject = [string]($sig.SignerCertificate.Subject); "
            "   productVersion = [string]$vi.ProductVersion } | ConvertTo-Json -Compress"
        )
        res = subprocess.run(
            ["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=25,
            creationflags=0x08000000,
            env=env,
        )
        if res.returncode != 0 or not res.stdout.strip():
            print(f"[INSTALLER] Signature verification command failed: {res.stderr}")
            return False

        info = json.loads(res.stdout.strip())
        if info.get("status") != "Valid" or "VNG GROUP JSC" not in info.get("subject", ""):
            print(f"[INSTALLER] Invalid VNG signature: {info}")
            return False

        ver_tuple = _parse_ver_tuple(info.get("productVersion", ""))
        if not ver_tuple or ver_tuple[:3] > (26, 11, 12):
            print(f"[INSTALLER] Downloaded installer version unsupported: {info.get('productVersion')}")
            return False

        print(f"[INSTALLER] Verified VNG-signed Zalo setup v{info.get('productVersion')}")
        return True
    except Exception as e:
        print(f"[INSTALLER] Error verifying downloaded Zalo setup: {e}")
        return False


def resolve_compatible_zalo_download_url():
    """Fetch fresh direct installer URL for Zalo 26.11.12 (fallback 26.10.20) from download.com.vn."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    for link_id, page_url in ZALO_LEGACY_PAGE_URLS:
        try:
            req = urllib.request.Request(page_url, headers=headers)
            with urllib.request.urlopen(req, timeout=20) as resp:
                html = resp.read().decode("utf-8", "ignore")

            for m in re.finditer(r"<a[^>]+downloadurl=[\"']([^\"']+)[\"'][^>]*>", html, re.I):
                tag = m.group(0)
                if f'linkid="{link_id}"' in tag.lower() or f"linkid='{link_id}'" in tag.lower():
                    return m.group(1), page_url

            m_any = re.search(r"downloadurl=[\"'](https://[^\"']+)[\"']", html, re.I)
            if m_any:
                return m_any.group(1), page_url
        except Exception as e:
            print(f"[INSTALLER] Failed resolving download link ({link_id}): {e}")
    return None, None


def stop_zalo_and_handler_processes():
    zalo_names = ["zalo.exe", "zaloexecutable.exe", "zalocall.exe", "zalocap.exe", "zablindcallhandler.exe", "zablindcallhandler_x86.exe"]
    try:
        import psutil
        for proc in psutil.process_iter(["pid", "name"]):
            try:
                if proc.info["name"] and proc.info["name"].lower() in zalo_names:
                    proc.kill()
            except Exception:
                pass
    except Exception:
        for name in zalo_names:
            try:
                subprocess.run(f"taskkill /F /IM {name}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass


def download_and_install_compatible_zalo(status_callback):
    """Download VNG-signed Zalo 26.11.12 and silently install it into %LOCALAPPDATA%\\Programs\\Zalo."""
    cached_setup = os.path.join(tempfile.gettempdir(), f"ZaloSetup-{ZALO_COMPATIBLE_VERSION}-zablind.exe")

    if not verify_vng_zalo_installer(cached_setup):
        if os.path.exists(cached_setup):
            try:
                os.remove(cached_setup)
            except Exception:
                pass

        status_callback(f"Đang tìm liên kết tải Zalo {ZALO_COMPATIBLE_VERSION}...")
        dl_url, ref_url = resolve_compatible_zalo_download_url()
        if not dl_url:
            print("[INSTALLER] Could not resolve compatible Zalo download URL.")
            return False

        part_file = cached_setup + ".part"
        try:
            if os.path.exists(part_file):
                os.remove(part_file)
            status_callback(f"Đang tải Zalo {ZALO_COMPATIBLE_VERSION} (0%)...")
            req = urllib.request.Request(
                dl_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Referer": ref_url},
            )
            with urllib.request.urlopen(req, timeout=120) as resp, open(part_file, "wb") as out:
                total_hdr = resp.headers.get("Content-Length")
                total_bytes = int(total_hdr) if total_hdr and total_hdr.isdigit() else 0
                downloaded = 0
                last_milestone = 0
                while True:
                    chunk = resp.read(512 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    downloaded += len(chunk)
                    if total_bytes > 0:
                        pct = int(downloaded * 100 / total_bytes)
                        milestone = (pct // 25) * 25
                        if milestone >= 25 and milestone > last_milestone and milestone < 100:
                            last_milestone = milestone
                            status_callback(f"Đang tải Zalo {ZALO_COMPATIBLE_VERSION} ({milestone}%)...")
            if os.path.exists(cached_setup):
                os.remove(cached_setup)
            os.replace(part_file, cached_setup)
        except Exception as dl_err:
            print(f"[INSTALLER] Error downloading compatible Zalo: {dl_err}")
            try:
                if os.path.exists(part_file):
                    os.remove(part_file)
            except Exception:
                pass
            return False

        status_callback("Đang kiểm tra chữ ký an toàn của bộ cài Zalo...")
        if not verify_vng_zalo_installer(cached_setup):
            try:
                os.remove(cached_setup)
            except Exception:
                pass
            return False

    status_callback(f"Đang cài đặt Zalo {ZALO_COMPATIBLE_VERSION}...")
    stop_zalo_and_handler_processes()
    time.sleep(1.0)

    local_appdata = os.environ.get("LOCALAPPDATA") or os.path.join(os.environ.get("USERPROFILE", ""), "AppData", "Local")
    zalo_base = os.path.join(local_appdata, "Programs", "Zalo")
    updater_cache = os.path.join(local_appdata, "zalo-updater")

    # Remove incompatible/locked Zalo binary folder and cached updater while preserving user chat data
    for folder in (zalo_base, updater_cache):
        if os.path.exists(folder):
            try:
                shutil.rmtree(folder)
            except Exception as rm_err:
                print(f"[INSTALLER] Warning removing {folder}: {rm_err}")

    try:
        res = subprocess.run(
            [cached_setup, "/S"],
            creationflags=0x08000000,
            timeout=180,
        )
        print(f"[INSTALLER] Zalo setup finished with code {res.returncode}")
    except Exception as setup_err:
        print(f"[INSTALLER] Error running Zalo setup: {setup_err}")
        return False

    time.sleep(2.0)
    stop_zalo_and_handler_processes()
    time.sleep(1.0)

    state_after, ver_after, _ = find_installed_zalo_state()
    print(f"[INSTALLER] Zalo state after setup: {state_after}, version={ver_after}")
    return state_after == "COMPATIBLE"


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
        stop_zalo_and_handler_processes()
                
        time.sleep(1.5)

        # Ensure compatible Zalo (== 26.11.12 without ELECTRONASAR) is installed
        zalo_state, zalo_ver, _ = find_installed_zalo_state()
        if zalo_state in ("MISSING", "LOCKED", "OUTDATED"):
            if zalo_state == "MISSING":
                status_callback(f"Chưa có Zalo. Đang tải Zalo {ZALO_COMPATIBLE_VERSION}...")
            elif zalo_state == "LOCKED":
                status_callback(f"Zalo hiện tại đã khóa chỉnh sửa. Đang tải về Zalo {ZALO_COMPATIBLE_VERSION}...")
            else:
                status_callback(f"Zalo {zalo_ver} cũ hơn phiên bản hỗ trợ. Đang nâng lên Zalo {ZALO_COMPATIBLE_VERSION}...")
            if not download_and_install_compatible_zalo(status_callback):
                status_callback("Không thể tải hoặc cài Zalo tương thích!")
                return "ZALO_DOWNLOAD_FAILED"
        
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
            if res.returncode == 2:
                print(f"[INSTALLER] Zalo version has ELECTRONASAR integrity protection. stderr: {res.stderr}")
                status_callback("Phiên bản Zalo mới chưa hỗ trợ!")
                return "INTEGRITY_LOCKED"
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
    if success == "ZALO_DOWNLOAD_FAILED":
        set_status("Không thể tải tự động Zalo 26.11.12!")
        win32api.MessageBox(
            hwnd_main,
            "Không thể tự động tải hoặc cài đặt Zalo 26.11.12 tương thích.\n\nVui lòng kiểm tra kết nối mạng hoặc tải thủ công Zalo 26.11.12 theo liên kết trên trang chủ Zablind, cài đặt xong rồi mở lại bộ cài Zablind.",
            "Lỗi tải Zalo tương thích",
            win32con.MB_OK | win32con.MB_ICONERROR,
        )
    elif success == "INTEGRITY_LOCKED":
        set_status("Zalo phiên bản mới chưa hỗ trợ!")
        win32api.MessageBox(
            hwnd_main,
            "Phiên bản Zalo này (từ 26.11.20 trở lên) đã khóa tệp hệ thống nên Zablind chưa hỗ trợ trực tiếp.\n\nVui lòng cài bản Zalo cũ hơn (26.11.12 trở xuống) rồi cài lại Zablind.",
            "Không tương thích phiên bản Zalo",
            win32con.MB_OK | win32con.MB_ICONWARNING,
        )
    elif success:
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
    
    # Load and set application icon from executable resource 1 (favicon)
    hinstance = win32api.GetModuleHandle(None)
    try:
        wc.hIcon = win32gui.LoadIcon(hinstance, 1)
    except:
        wc.hIcon = win32gui.LoadIcon(0, win32con.IDI_APPLICATION)
    
    try:
        class_atom = win32gui.RegisterClass(wc)
    except:
        class_atom = "ZablindInstallerClass"
        
    # Center window on screen
    screen_w = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
    screen_h = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)
    width = 450
    height = 330
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
    
    # Create beautiful modern Segoe UI system fonts
    try:
        lf_normal = win32gui.LOGFONT()
        lf_normal.lfHeight = -13  # Segoe UI regular size
        lf_normal.lfWidth = 0
        lf_normal.lfEscapement = 0
        lf_normal.lfOrientation = 0
        lf_normal.lfWeight = 400
        lf_normal.lfItalic = 0
        lf_normal.lfUnderline = 0
        lf_normal.lfStrikeOut = 0
        lf_normal.lfCharSet = 1
        lf_normal.lfOutPrecision = 0
        lf_normal.lfClipPrecision = 0
        lf_normal.lfQuality = 5  # CLEARTYPE_QUALITY
        lf_normal.lfPitchAndFamily = 0
        lf_normal.lfFaceName = 'Segoe UI'
        hfont = win32gui.CreateFontIndirect(lf_normal)

        lf_title = win32gui.LOGFONT()
        lf_title.lfHeight = -17
        lf_title.lfWidth = 0
        lf_title.lfEscapement = 0
        lf_title.lfOrientation = 0
        lf_title.lfWeight = 700
        lf_title.lfItalic = 0
        lf_title.lfUnderline = 0
        lf_title.lfStrikeOut = 0
        lf_title.lfCharSet = 1
        lf_title.lfOutPrecision = 0
        lf_title.lfClipPrecision = 0
        lf_title.lfQuality = 5  # CLEARTYPE_QUALITY
        lf_title.lfPitchAndFamily = 0
        lf_title.lfFaceName = 'Segoe UI'
        hfont_title = win32gui.CreateFontIndirect(lf_title)
    except Exception as e:
        print(f"[FONT] Create font failed, falling back: {e}")
        hfont = win32gui.GetStockObject(17)
        hfont_title = hfont
    
    # 1. Title Label (using EDIT control with ES_READONLY to allow keyboard focus and reading)
    h_title = win32gui.CreateWindow(
        "EDIT", f"BỘ CÀI ĐẶT ZABLIND v{version}",
        win32con.WS_CHILD | win32con.WS_VISIBLE | win32con.WS_TABSTOP | win32con.ES_READONLY | win32con.ES_CENTER | win32con.ES_MULTILINE,
        10, 15, 410, 25, hwnd, 101, 0, None
    )
    win32gui.SendMessage(h_title, win32con.WM_SETFONT, hfont_title, True)
    
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
    
    # 5. Copyright Label (using EDIT control with ES_READONLY to allow keyboard focus and reading)
    import datetime
    current_year = datetime.date.today().year
    copyright_text = f"Minh Tri Nguyen © {current_year}"
    h_copy = win32gui.CreateWindow(
        "EDIT", copyright_text,
        win32con.WS_CHILD | win32con.WS_VISIBLE | win32con.WS_TABSTOP | win32con.ES_READONLY | win32con.ES_CENTER | win32con.ES_MULTILINE,
        10, 260, 410, 20, hwnd, 104, 0, None
    )
    win32gui.SendMessage(h_copy, win32con.WM_SETFONT, hfont, True)
    
    # Define exact Tab order including the text labels
    tab_order = [h_title, h_desc, hwnd_btn1, hwnd_btn2, hwnd_btn3, hwnd_status, h_copy]
    
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
