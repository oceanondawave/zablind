import os
import sys
import shutil
import zipfile
import subprocess

def speak(text):
    try:
        # Avoid printing raw non-ascii to console to prevent UnicodeEncodeError
        print(f"[PACKER] Voice notification: {text.encode('ascii', errors='replace').decode('ascii')}")
    except:
        pass
    try:
        import win32com.client
        sapi_voice = win32com.client.Dispatch("SAPI.SpVoice")
        sapi_voice.Speak(text)
    except:
        pass

def main():
    print("==================================================")
    print("  ZABLIND RELEASE PACKAGER  ")
    print("==================================================")
    speak("Starting Zablind release packaging.")
    
    # Root directory
    root_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Build ZablindCallHandler.exe
    print("\n--- 1. Building ZablindCallHandler.exe ---")
    call_dir = os.path.join(root_dir, "zablind_call")
    pyinstaller_args = [
        "pyinstaller", "--onefile",
        "--name=ZablindCallHandler",
        "--hidden-import=psutil",
        "--hidden-import=comtypes",
        "--hidden-import=comtypes.client",
        "--hidden-import=comtypes.gen.UIAutomationClient",
        "--hidden-import=keyboard",
        "--hidden-import=win32com.client",
        "--hidden-import=win32gui",
        "--hidden-import=win32con",
        "--hidden-import=win32api",
        "--hidden-import=gtts",
        "--hidden-import=gtts.gtts",
        "--hidden-import=pygame",
        "--hidden-import=pygame.mixer",
        "--collect-all=psutil",
        "--collect-all=comtypes",
        "--collect-all=keyboard",
        "--collect-all=gtts",
        "--collect-all=pygame",
        "main.py"
    ]
    
    try:
        subprocess.run(pyinstaller_args, cwd=call_dir, check=True)
        print("[PACKER] Successfully built ZablindCallHandler.exe")
    except Exception as e:
        print(f"[ERROR] Failed to build ZablindCallHandler.exe: {e}")
        speak("Packaging failed. Could not compile Call Handler.")
        sys.exit(1)
        
    # Copy build artifacts to relevant locations
    dist_dir = os.path.join(call_dir, "dist")
    exe_file = os.path.join(dist_dir, "ZablindCallHandler.exe")
    
    shutil.copy2(exe_file, os.path.join(call_dir, "ZablindCallHandler.exe"))
    os.makedirs(os.path.join(root_dir, "zablind_main", "zablind", "bin"), exist_ok=True)
    shutil.copy2(exe_file, os.path.join(root_dir, "zablind_main", "zablind", "bin", "ZablindCallHandler.exe"))
    
    # 2. Build ZablindInstaller.exe
    print("\n--- 2. Building ZablindInstaller.exe ---")
    installer_args = [
        "pyinstaller", "--onefile",
        "--name=ZablindInstaller",
        "--add-data=zablind_call/ZablindCallHandler.exe;.",
        "--add-data=zablind_main/preload-wrapper.js;.",
        "--add-data=zablind_main/html/popup-viewer.html;.",
        "--add-data=zablind_main/zablind;zablind",
        "--hidden-import=psutil",
        "--collect-all=psutil",
        "zablind_installer.py"
    ]
    
    try:
        subprocess.run(installer_args, cwd=root_dir, check=True)
        shutil.copy2(os.path.join(root_dir, "dist", "ZablindInstaller.exe"), os.path.join(root_dir, "ZablindInstaller.exe"))
        print("[PACKER] Successfully built ZablindInstaller.exe")
    except Exception as e:
        print(f"[ERROR] Failed to build ZablindInstaller.exe: {e}")
        speak("Packaging failed. Could not compile installer.")
        sys.exit(1)
        
    # 3. Create zablind_release.zip
    print("\n--- 3. Packaging zablind_release.zip ---")
    zip_path = os.path.join(root_dir, "zablind_release.zip")
    if os.path.exists(zip_path):
        os.remove(zip_path)
        
    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add ZablindCallHandler.exe
            zipf.write(exe_file, "ZablindCallHandler.exe")
            # Add preload-wrapper.js
            zipf.write(os.path.join(root_dir, "zablind_main", "preload-wrapper.js"), "preload-wrapper.js")
            # Add popup-viewer.html
            zipf.write(os.path.join(root_dir, "zablind_main", "html", "popup-viewer.html"), "popup-viewer.html")
            
            # Add zablind/ folder contents recursively
            zablind_src = os.path.join(root_dir, "zablind_main", "zablind")
            for root, dirs, files in os.walk(zablind_src):
                # Skip bin/ directory inside zablind/ to avoid adding the duplicate exe
                if "bin" in dirs:
                    dirs.remove("bin")
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, zablind_src)
                    zipf.write(file_path, os.path.join("zablind", arcname))
                    
        print(f"[PACKER] Successfully created {zip_path}")
    except Exception as e:
        print(f"[ERROR] Failed to create release zip: {e}")
        speak("Packaging failed. Could not compress release files.")
        sys.exit(1)
        
    # 4. Clean up temporary build files
    print("\n--- 4. Cleaning up build artifacts ---")
    # Clean call handler build dirs
    for d in [os.path.join(call_dir, "build"), os.path.join(call_dir, "dist")]:
        if os.path.exists(d):
            shutil.rmtree(d)
    spec_call = os.path.join(call_dir, "ZablindCallHandler.spec")
    if os.path.exists(spec_call):
        os.remove(spec_call)
        
    # Clean installer build dirs
    for d in [os.path.join(root_dir, "build"), os.path.join(root_dir, "dist")]:
        if os.path.exists(d):
            shutil.rmtree(d)
    spec_inst = os.path.join(root_dir, "ZablindInstaller.spec")
    if os.path.exists(spec_inst):
        os.remove(spec_inst)
        
    speak("Zablind packaging completed successfully. Installer and update zip files are ready.")
    print("\n==================================================")
    print("Build finished successfully!")
    print("Files created:")
    print(f"  - {os.path.join(root_dir, 'ZablindInstaller.exe')} (Installer)")
    print(f"  - {os.path.join(root_dir, 'zablind_release.zip')} (Upload this to GitHub Releases!)")
    print("==================================================")

if __name__ == '__main__':
    main()
