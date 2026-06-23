"""
Zablind Call Handler - Accept/Deny Zalo Calls
Monitors ZaloCall.exe and provides keyboard shortcuts to accept or deny calls.
Automatically focuses ZaloCall window when incoming call is detected.
"""

import sys
import traceback

def global_exception_handler(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    print("FATAL ERROR DURING STARTUP:", file=sys.stderr)
    traceback.print_exception(exc_type, exc_value, exc_traceback)
    print("\nPress Enter to exit...")
    try:
        input()
    except:
        pass

sys.excepthook = global_exception_handler

import time
import threading
import json
import os
import tempfile
import re
import subprocess
from typing import Optional, List, Tuple
import importlib

def get_clean_env():
    import os
    env = os.environ.copy()
    for key in list(env.keys()):
        k_upper = key.upper()
        if k_upper.startswith('_MEIPASS') or k_upper.startswith('_MEI') or k_upper.startswith('_PYI') or k_upper in ('TCL_LIBRARY', 'TK_LIBRARY'):
            try: del env[key]
            except: pass
            
    # Clean PATH variable from any _MEI temporary paths
    path_key = next((k for k in env if k.upper() == 'PATH'), None)
    if path_key:
        path_val = env[path_key]
        parts = path_val.split(os.pathsep)
        clean_parts = [p for p in parts if '_MEI' not in p]
        env[path_key] = os.pathsep.join(clean_parts)
        
    return env

def get_system_temp_dir():
    import os
    import tempfile
    user_profile = os.environ.get('USERPROFILE')
    if user_profile:
        real_temp = os.path.join(user_profile, 'AppData', 'Local', 'Temp')
        if os.path.isdir(real_temp):
            return real_temp
    return tempfile.gettempdir()

# ---- Auto Dependency Installer ----
def _ensure_dependencies():
    packages = {
        'comtypes': 'comtypes',
        'keyboard': 'keyboard',
        'win32gui': 'pywin32',
        'gtts': 'gtts',
        'pygame': 'pygame',
        'psutil': 'psutil'
    }
    missing_pip = []
    for mod, pip_name in packages.items():
        try:
            importlib.import_module(mod)
        except ImportError:
            if pip_name not in missing_pip:
                missing_pip.append(pip_name)
                
    if missing_pip:
        print(f"\n--- ZABLIND CALL MONITOR ---")
        print(f"First-time setup: Installing required libraries...")
        print(f"Packages: {', '.join(missing_pip)}")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", *missing_pip])
            print("\nInstallation complete! Starting application...\n")
            os.execl(sys.executable, sys.executable, *sys.argv)
        except Exception as e:
            print(f"\nFailed to auto-install! Error: {e}")
            print(f"Please install manually: pip install {' '.join(missing_pip)}")
            print("Press Enter to exit...")
            try: input() 
            except: pass
            sys.exit(1)

_ensure_dependencies()
# -----------------------------------

import queue
import ctypes

class Tee:
    def __init__(self, filename, stream):
        try:
            self.log = open(filename, "a", encoding="utf-8", buffering=1)
        except Exception:
            self.log = None
        self.stream = stream

    def write(self, data):
        if self.log:
            try:
                self.log.write(data)
            except:
                pass
        if self.stream is not None:
            try:
                self.stream.write(data)
            except:
                pass

    def flush(self):
        if self.log:
            try:
                self.log.flush()
            except:
                pass
        if self.stream is not None:
            try:
                if hasattr(self.stream, 'flush'):
                    self.stream.flush()
            except:
                pass

# Redirect stdout/stderr to a log file immediately to catch all outputs
try:
    log_path = "C:/Projects/zablind/zablind_call_handler.log"
    # Fallback to local appdata folder if C:/Projects is not writable/present
    try:
        with open(log_path, "a") as f:
            pass
    except:
        local_appdata = os.environ.get('LOCALAPPDATA')
        if local_appdata:
            log_path = os.path.join(local_appdata, "Programs", "zablind_call", "zablind_call_handler.log")
        else:
            log_path = os.path.join(tempfile.gettempdir(), "zablind_call_handler.log")

    sys.stdout = Tee(log_path, sys.stdout)
    sys.stderr = Tee(log_path, sys.stderr)
    print("\n" + "="*60)
    print(f"Zablind Call Handler starting at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)
except Exception as log_err:
    pass

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    print("Warning: 'psutil' not found. Using fallback process detection.")

PATCHING_IN_PROGRESS = False

from comtypes import client
from comtypes.client import GetModule
from ctypes import POINTER, c_long, c_wchar_p, windll, byref
from ctypes.wintypes import DWORD, HWND

# Windows UI Automation constants
UIA_CONDITION_TRUE = 1
UIA_CONDITION_FALSE = 2

# Import UI Automation types
try:
    import comtypes.gen.UIAutomationClient as UIA
except ImportError:
    # Generate types if not available (first run)
    import comtypes.client
    UIAutomation_tlb = "UIAutomationCore.dll"
    UIA = comtypes.client.GetModule(UIAutomation_tlb)

import keyboard
KEYBOARD_AVAILABLE = True

import win32com.client
TTS_AVAILABLE = True

from gtts import gTTS
import pygame
import io
import tempfile
GTTS_AVAILABLE = True

import win32gui
import win32con
import win32api
WIN32_AVAILABLE = True


class ZaloCallHandler:
    """Main class to handle Zalo call detection and keyboard shortcuts."""
    
    @property
    def automation(self):
        if not hasattr(self._thread_local, 'auto'):
            try:
                import pythoncom
                pythoncom.CoInitialize()
            except:
                pass
            try:
                import comtypes.client as client
                import comtypes.gen.UIAutomationClient as UIA
                self._thread_local.auto = client.CreateObject(
                    "{ff48dba4-60ef-4201-aa87-54103eef594e}",  # CLSID_CUIAutomation
                    interface=UIA.IUIAutomation
                )
            except Exception as e:
                print(f"Error initializing UI Automation in thread: {e}")
                self._thread_local.auto = None
        return self._thread_local.auto

    def __init__(self):
        self._thread_local = threading.local()
        self.zalocall_pid: Optional[int] = None
        self.root_element: Optional[UIA.IUIAutomationElement] = None
        self.monitoring: bool = False
        self.current_checkboxes: List[UIA.IUIAutomationElement] = []
        self.current_incoming_deny_btn: Optional[UIA.IUIAutomationElement] = None
        self.current_incoming_accept_btn: Optional[UIA.IUIAutomationElement] = None
        self.current_incoming_no_cam_btn: Optional[UIA.IUIAutomationElement] = None
        self.current_incoming_deny_point: Optional[Tuple[int, int]] = None
        self.current_incoming_accept_point: Optional[Tuple[int, int]] = None
        self.current_incoming_no_cam_point: Optional[Tuple[int, int]] = None
        self.current_incoming_deny_rel: Optional[Tuple[float, float]] = None
        self.current_incoming_accept_rel: Optional[Tuple[float, float]] = None
        self.current_incoming_no_cam_rel: Optional[Tuple[float, float]] = None
        self.incoming_audio_deny_point: Optional[Tuple[int, int]] = None
        self.incoming_audio_accept_point: Optional[Tuple[int, int]] = None
        self.incoming_audio_deny_rel: Optional[Tuple[float, float]] = None
        self.incoming_audio_accept_rel: Optional[Tuple[float, float]] = None
        self.incoming_video_deny_point: Optional[Tuple[int, int]] = None
        self.incoming_video_accept_point: Optional[Tuple[int, int]] = None
        self.incoming_video_deny_rel: Optional[Tuple[float, float]] = None
        self.incoming_video_accept_rel: Optional[Tuple[float, float]] = None
        self.zalocall_window_handle: Optional[int] = None
        self.incoming_call_detected: bool = False
        self.call_active: bool = False  # Track if call is active (after accepting)
        self.call_lock: threading.RLock = threading.RLock()
        self.last_action_time: float = 0.0
        self.action_cooldown: float = 0.5  # 0.5 seconds cooldown after action (reduced from 2s for responsiveness)
        self.active_call_checkboxes: List[UIA.IUIAutomationElement] = []  # Camera, End call buttons
        self.active_call_checkboxes_cached_at: float = 0.0
        self.active_camera_point: Optional[Tuple[int, int]] = None
        self.active_end_call_point: Optional[Tuple[int, int]] = None
        self.active_microphone_point: Optional[Tuple[int, int]] = None
        self.active_camera_rel: Optional[Tuple[float, float]] = None
        self.active_end_call_rel: Optional[Tuple[float, float]] = None
        self.active_microphone_rel: Optional[Tuple[float, float]] = None
        self.click_cache_version = 6
        self.click_cache_file = os.path.join(os.getenv("LOCALAPPDATA", tempfile.gettempdir()), "Zablind", "call_click_cache.json")
        self._load_click_cache()
        self.mouse_logging_enabled: bool = True  # Track mouse clicks to identify buttons
        self.last_click_time: float = 0.0
        self.call_type: Optional[str] = None  # "audio" or "video" - detected after accepting
        self.caller_name: Optional[str] = None  # Track the name of the caller
        self.action_in_progress: bool = False  # Prevent concurrent actions
        self.last_action_type: Optional[str] = None  # Track last action type for better debouncing
        self.last_camera_toggle_at: float = 0.0
        self.last_microphone_toggle_at: float = 0.0
        self.incoming_buttons_ready_announced: bool = False
        self.deny_suppress_active_until: float = 0.0
        self.pending_incoming_caller_name: Optional[str] = None
        self.pending_incoming_call_type: Optional[str] = None
        self.pending_incoming_until: float = 0.0
        self.pending_video_incoming_announced: bool = False
        # File-based IPC for instant outgoing call detection
        self.outgoing_call_type_file = os.path.join(get_system_temp_dir(), "zablind_outgoing_call_type.json")
        
        # Initialize speech queue and worker thread
        self.speech_queue = queue.Queue()
        self.speech_thread = threading.Thread(target=self._speech_worker, daemon=True)
        self.speech_thread.start()
        # Initialize action queue for thread-safe hotkey processing
        self.action_queue = queue.Queue()
        self.action_thread = threading.Thread(target=self._action_worker, daemon=True)
        self.action_thread.start()
        print("[TTS] Speech queue and background worker thread initialized")
        
        # Hotkey settings
        self.accept_hotkey = "a"
        self.accept_without_camera_hotkey = "ctrl+a"  # Accept video call without turning on camera
        self.deny_hotkey = "d"
        self.camera_toggle_hotkey = "c"
        self.end_call_hotkey = "e"
        self.microphone_toggle_hotkey = "m"
        self.hotkeys_registered = False
        
        # Toggle state tracking (simpler & more reliable than reading TogglePattern from ZaloCall)
        self.camera_on = True      # Assume camera starts ON in video calls
        self.microphone_on = True  # Assume mic starts ON in all calls
        self.incoming_check_cycles = 0  # Buffer cycles for Electron async element loading
        self._root_lookup_last_log: float = 0.0

    def _set_active_call_checkboxes(self, checkboxes: List[UIA.IUIAutomationElement]):
        self.active_call_checkboxes = list(checkboxes or [])
        self.active_call_checkboxes_cached_at = time.time() if self.active_call_checkboxes else 0.0
        if self.call_active and not self.incoming_call_detected:
            self._refresh_active_click_points(self.active_call_checkboxes)

    def _point_to_json(self, point: Optional[Tuple[int, int]]):
        return [int(point[0]), int(point[1])] if point else None

    def _point_from_json(self, value) -> Optional[Tuple[int, int]]:
        try:
            if isinstance(value, list) and len(value) == 2:
                return (int(value[0]), int(value[1]))
        except:
            pass
        return None

    def _rel_to_json(self, rel: Optional[Tuple[float, float]]):
        return [float(rel[0]), float(rel[1])] if rel else None

    def _rel_from_json(self, value) -> Optional[Tuple[float, float]]:
        try:
            if isinstance(value, list) and len(value) == 2:
                return (float(value[0]), float(value[1]))
        except:
            pass
        return None

    def _load_click_cache(self):
        try:
            if not os.path.exists(self.click_cache_file):
                return
            with open(self.click_cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("version") != self.click_cache_version:
                print("[CACHE] Ignoring old click cache version; controls will be relearned")
                return
            self.current_incoming_deny_point = self._point_from_json(data.get("incoming_deny"))
            self.current_incoming_accept_point = self._point_from_json(data.get("incoming_accept"))
            self.current_incoming_no_cam_point = self._point_from_json(data.get("incoming_no_cam"))
            self.current_incoming_deny_rel = self._rel_from_json(data.get("incoming_deny_rel"))
            self.current_incoming_accept_rel = self._rel_from_json(data.get("incoming_accept_rel"))
            self.current_incoming_no_cam_rel = self._rel_from_json(data.get("incoming_no_cam_rel"))
            self.incoming_audio_deny_point = self._point_from_json(data.get("incoming_audio_deny"))
            self.incoming_audio_accept_point = self._point_from_json(data.get("incoming_audio_accept"))
            self.incoming_audio_deny_rel = self._rel_from_json(data.get("incoming_audio_deny_rel"))
            self.incoming_audio_accept_rel = self._rel_from_json(data.get("incoming_audio_accept_rel"))
            self.incoming_video_deny_point = self._point_from_json(data.get("incoming_video_deny"))
            self.incoming_video_accept_point = self._point_from_json(data.get("incoming_video_accept"))
            self.incoming_video_deny_rel = self._rel_from_json(data.get("incoming_video_deny_rel"))
            self.incoming_video_accept_rel = self._rel_from_json(data.get("incoming_video_accept_rel"))
            self.active_camera_point = self._point_from_json(data.get("active_camera"))
            self.active_end_call_point = self._point_from_json(data.get("active_end_call"))
            self.active_microphone_point = self._point_from_json(data.get("active_microphone"))
            self.active_camera_rel = self._rel_from_json(data.get("active_camera_rel"))
            self.active_end_call_rel = self._rel_from_json(data.get("active_end_call_rel"))
            self.active_microphone_rel = self._rel_from_json(data.get("active_microphone_rel"))
            print(f"[CACHE] Loaded persistent click cache from {self.click_cache_file}")
        except Exception as e:
            print(f"[CACHE] Failed to load persistent click cache: {e}")

    def _save_click_cache(self):
        try:
            os.makedirs(os.path.dirname(self.click_cache_file), exist_ok=True)
            data = {
                "version": self.click_cache_version,
                "incoming_deny": self._point_to_json(self.current_incoming_deny_point),
                "incoming_accept": self._point_to_json(self.current_incoming_accept_point),
                "incoming_no_cam": self._point_to_json(self.current_incoming_no_cam_point),
                "incoming_deny_rel": self._rel_to_json(self.current_incoming_deny_rel),
                "incoming_accept_rel": self._rel_to_json(self.current_incoming_accept_rel),
                "incoming_no_cam_rel": self._rel_to_json(self.current_incoming_no_cam_rel),
                "incoming_audio_deny": self._point_to_json(self.incoming_audio_deny_point),
                "incoming_audio_accept": self._point_to_json(self.incoming_audio_accept_point),
                "incoming_audio_deny_rel": self._rel_to_json(self.incoming_audio_deny_rel),
                "incoming_audio_accept_rel": self._rel_to_json(self.incoming_audio_accept_rel),
                "incoming_video_deny": self._point_to_json(self.incoming_video_deny_point),
                "incoming_video_accept": self._point_to_json(self.incoming_video_accept_point),
                "incoming_video_deny_rel": self._rel_to_json(self.incoming_video_deny_rel),
                "incoming_video_accept_rel": self._rel_to_json(self.incoming_video_accept_rel),
                "active_camera": self._point_to_json(self.active_camera_point),
                "active_end_call": self._point_to_json(self.active_end_call_point),
                "active_microphone": self._point_to_json(self.active_microphone_point),
                "active_camera_rel": self._rel_to_json(self.active_camera_rel),
                "active_end_call_rel": self._rel_to_json(self.active_end_call_rel),
                "active_microphone_rel": self._rel_to_json(self.active_microphone_rel),
            }
            with open(self.click_cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f)
        except Exception as e:
            print(f"[CACHE] Failed to save persistent click cache: {e}")

    def _element_center_point(self, element) -> Optional[Tuple[int, int]]:
        try:
            rect = self._get_el_rect(element)
            if rect.right > rect.left and rect.bottom > rect.top:
                return (int((rect.left + rect.right) / 2), int((rect.top + rect.bottom) / 2))
        except:
            pass
        return None

    def _current_window_rect_tuple(self) -> Optional[Tuple[int, int, int, int]]:
        try:
            hwnd = self.zalocall_window_handle or self._find_zalocall_window_handle()
            if hwnd:
                left, top, right, bottom = win32gui.GetWindowRect(hwnd)
                if right > left and bottom > top:
                    return (int(left), int(top), int(right), int(bottom))
        except:
            pass
        try:
            root = self.root_element
            if root:
                rect = root.CurrentBoundingRectangle
                if rect.right > rect.left and rect.bottom > rect.top:
                    return (int(rect.left), int(rect.top), int(rect.right), int(rect.bottom))
        except:
            pass
        return None

    def _point_to_relative(self, point: Optional[Tuple[int, int]]) -> Optional[Tuple[float, float]]:
        if not point:
            return None
        rect = self._current_window_rect_tuple()
        if not rect:
            return None
        left, top, right, bottom = rect
        width = right - left
        height = bottom - top
        if width <= 0 or height <= 0:
            return None
        x, y = point
        return ((x - left) / width, (y - top) / height)

    def _relative_to_point(self, rel: Optional[Tuple[float, float]]) -> Optional[Tuple[int, int]]:
        if not rel:
            return None
        rect = self._current_window_rect_tuple()
        if not rect:
            return None
        left, top, right, bottom = rect
        width = right - left
        height = bottom - top
        if width <= 0 or height <= 0:
            return None
        rel_x, rel_y = rel
        if rel_x < -0.2 or rel_x > 1.2 or rel_y < -0.2 or rel_y > 1.2:
            return None
        return (int(left + rel_x * width), int(top + rel_y * height))

    def _resolve_cached_point(self, absolute_point: Optional[Tuple[int, int]], relative_point: Optional[Tuple[float, float]], label: str) -> Optional[Tuple[int, int]]:
        point = self._relative_to_point(relative_point)
        if point:
            print(f"[CACHE] Resolved {label} from relative cache at {point}")
            return point
        return absolute_point

    def _incoming_cache_type(self, no_cam_btn=None) -> Optional[str]:
        if self.call_type == "video" or no_cam_btn is not None:
            return "video"
        if self.call_type == "audio":
            return "audio"
        return None

    def _resolve_incoming_cached_point(self, action: str, label: str) -> Optional[Tuple[int, int]]:
        cache_type = self._incoming_cache_type()
        if cache_type == "video":
            if action == "accept":
                return self._resolve_cached_point(self.incoming_video_accept_point, self.incoming_video_accept_rel, label)
            if action == "deny":
                return self._resolve_cached_point(self.incoming_video_deny_point, self.incoming_video_deny_rel, label)
            return None
        if cache_type == "audio":
            if action == "accept":
                return self._resolve_cached_point(self.incoming_audio_accept_point, self.incoming_audio_accept_rel, label)
            if action == "deny":
                return self._resolve_cached_point(self.incoming_audio_deny_point, self.incoming_audio_deny_rel, label)
            return None
        return None

    def _set_incoming_controls(self, deny_btn=None, accept_btn=None, no_cam_btn=None):
        if self.call_active and not self.incoming_call_detected:
            print("[INCOMING CACHE] Skipping incoming cache update while active call is visible")
            return
        self.current_incoming_deny_btn = deny_btn
        self.current_incoming_accept_btn = accept_btn
        self.current_incoming_no_cam_btn = no_cam_btn
        changed = False
        deny_point = self._element_center_point(deny_btn) if deny_btn else None
        accept_point = self._element_center_point(accept_btn) if accept_btn else None
        no_cam_point = self._element_center_point(no_cam_btn) if no_cam_btn else None
        if deny_point:
            self.current_incoming_deny_point = deny_point
            self.current_incoming_deny_rel = self._point_to_relative(deny_point) or self.current_incoming_deny_rel
            changed = True
        if accept_point:
            self.current_incoming_accept_point = accept_point
            self.current_incoming_accept_rel = self._point_to_relative(accept_point) or self.current_incoming_accept_rel
            changed = True
        cache_type = self._incoming_cache_type(no_cam_btn)
        if cache_type == "audio":
            if deny_point:
                self.incoming_audio_deny_point = deny_point
                self.incoming_audio_deny_rel = self._point_to_relative(deny_point) or self.incoming_audio_deny_rel
                changed = True
            if accept_point:
                self.incoming_audio_accept_point = accept_point
                self.incoming_audio_accept_rel = self._point_to_relative(accept_point) or self.incoming_audio_accept_rel
                changed = True
        elif cache_type == "video":
            if deny_point:
                self.incoming_video_deny_point = deny_point
                self.incoming_video_deny_rel = self._point_to_relative(deny_point) or self.incoming_video_deny_rel
                changed = True
            if accept_point:
                self.incoming_video_accept_point = accept_point
                self.incoming_video_accept_rel = self._point_to_relative(accept_point) or self.incoming_video_accept_rel
                changed = True
        if no_cam_point:
            self.current_incoming_no_cam_point = no_cam_point
            self.current_incoming_no_cam_rel = self._point_to_relative(no_cam_point) or self.current_incoming_no_cam_rel
            changed = True
        if changed:
            self._save_click_cache()

    def _promote_current_incoming_cache(self, call_type: Optional[str]):
        """Copy the already-learned incoming accept/deny points into a typed cache."""
        if call_type not in ("audio", "video"):
            return
        changed = False
        if call_type == "audio":
            if self.current_incoming_deny_point:
                self.incoming_audio_deny_point = self.current_incoming_deny_point
                self.incoming_audio_deny_rel = self.current_incoming_deny_rel
                changed = True
            if self.current_incoming_accept_point:
                self.incoming_audio_accept_point = self.current_incoming_accept_point
                self.incoming_audio_accept_rel = self.current_incoming_accept_rel
                changed = True
        else:
            if self.current_incoming_deny_point:
                self.incoming_video_deny_point = self.current_incoming_deny_point
                self.incoming_video_deny_rel = self.current_incoming_deny_rel
                changed = True
            if self.current_incoming_accept_point:
                self.incoming_video_accept_point = self.current_incoming_accept_point
                self.incoming_video_accept_rel = self.current_incoming_accept_rel
                changed = True
        if changed:
            print(f"[INCOMING CACHE] Promoted current incoming controls to {call_type} cache")
            self._save_click_cache()

    def _announce_incoming_buttons_ready(self, call_type: Optional[str] = None):
        with self.call_lock:
            if self.incoming_buttons_ready_announced:
                return
            self.incoming_buttons_ready_announced = True
        self.speak("sẵn sàng", language="vi")

    def _remember_incoming_details(self, caller_name: Optional[str] = None, call_type: Optional[str] = None):
        with self.call_lock:
            if caller_name:
                self.pending_incoming_caller_name = caller_name
            if call_type:
                self.pending_incoming_call_type = call_type
            if caller_name or call_type:
                self.pending_incoming_until = time.time() + 12.0

    def _get_pending_incoming_details(self) -> Tuple[Optional[str], Optional[str]]:
        with self.call_lock:
            if time.time() > self.pending_incoming_until:
                return None, None
            return self.pending_incoming_caller_name, self.pending_incoming_call_type

    def _extract_caller_name_from_current_title(self) -> Optional[str]:
        try:
            hwnd = self.zalocall_window_handle or self._find_zalocall_window_handle()
            if hwnd and WIN32_AVAILABLE:
                title = win32gui.GetWindowText(hwnd) or ""
                name = self.extract_caller_name_from_title(title)
                if name:
                    print(f"[CALLER] Found caller name from window title: '{name}'")
                    return name
        except Exception as e:
            print(f"[CALLER] Title fallback failed: {e}")
        return None

    def _refresh_active_click_points(self, checkboxes: List[UIA.IUIAutomationElement]):
        if not checkboxes:
            return
        try:
            camera_btn, end_btn, mic_btn = self.classify_active_call_buttons(checkboxes)
            changed = False
            camera_point = self._element_center_point(camera_btn) if camera_btn else None
            end_point = self._element_center_point(end_btn) if end_btn else None
            mic_point = self._element_center_point(mic_btn) if mic_btn else None
            if camera_point:
                self.active_camera_point = camera_point
                self.active_camera_rel = self._point_to_relative(camera_point) or self.active_camera_rel
                changed = True
            if end_point:
                self.active_end_call_point = end_point
                self.active_end_call_rel = self._point_to_relative(end_point) or self.active_end_call_rel
                changed = True
            if mic_point:
                self.active_microphone_point = mic_point
                self.active_microphone_rel = self._point_to_relative(mic_point) or self.active_microphone_rel
                changed = True
            if changed:
                self._save_click_cache()
        except Exception as e:
            print(f"[ACTIVE CACHE] Failed to refresh click points: {e}")

    def click_point(self, point: Optional[Tuple[int, int]], label: str = "button") -> bool:
        """Click a cached screen coordinate without touching UIA."""
        if not point or not WIN32_AVAILABLE:
            return False
        try:
            x, y = point
            print(f"[CLICK] Cached {label} click at position ({x}, {y})")
            current_pos = win32gui.GetCursorPos()
            win32api.SetCursorPos((x, y))
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
            time.sleep(0.015)
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
            win32api.SetCursorPos(current_pos)
            return True
        except Exception as e:
            print(f"[ERROR] Cached click failed for {label}: {e}")
            return False

    def _process_action(self, action: str):
        print(f"[QUEUE] Processing action: {action}")
        if action == "accept":
            self.accept_call()
        elif action == "accept_without_camera":
            self.accept_call_without_camera()
        elif action == "deny":
            self.deny_call()
        elif action == "camera":
            self.toggle_camera()
        elif action == "microphone":
            self.toggle_microphone()
        elif action == "end_call":
            self.end_call()

    def _action_worker(self):
        import pythoncom
        pythoncom.CoInitialize()
        try:
            while True:
                action = self.action_queue.get()
                try:
                    self._process_action(action)
                except Exception as act_err:
                    print(f"[ERROR] Exception processing action {action}: {act_err}")
                    import traceback
                    traceback.print_exc()
                finally:
                    self.action_queue.task_done()
        finally:
            pythoncom.CoUninitialize()

    def _sync_active_states_async(self, announce: Optional[str] = None):
        """Refresh camera/mic state after a fast click without blocking hotkeys."""
        def sync_thread():
            import pythoncom
            pythoncom.CoInitialize()
            try:
                time.sleep(0.45)
                checkboxes = self.find_active_call_checkboxes()
                if not checkboxes:
                    checkboxes = self.find_call_checkboxes()
                if not checkboxes:
                    return

                with self.call_lock:
                    self._set_active_call_checkboxes(checkboxes)

                self.classify_active_call_buttons(checkboxes)
                print("[STATE] Refreshed active click points; keeping local camera/mic states")

            except Exception as e:
                print(f"[STATE] Background state sync failed: {e}")
            finally:
                pythoncom.CoUninitialize()

        threading.Thread(target=sync_thread, daemon=True).start()

    def _announce_media_state_async(self, media: str):
        """Read the actual post-click camera/microphone state and announce it."""
        def state_thread():
            import pythoncom
            pythoncom.CoInitialize()
            try:
                with self.call_lock:
                    expected_state = self.camera_on if media == "camera" else self.microphone_on
                for attempt in range(8):
                    time.sleep(0.025 if attempt == 0 else 0.035)

                    with self.call_lock:
                        checkboxes = list(self.active_call_checkboxes) if self.call_active and self.active_call_checkboxes else []

                    if not checkboxes or attempt >= 2:
                        fresh_checkboxes = self.find_active_call_checkboxes()
                        if not fresh_checkboxes:
                            fresh_checkboxes = self.find_call_checkboxes()
                        if fresh_checkboxes:
                            checkboxes = fresh_checkboxes

                    if not checkboxes:
                        continue

                    with self.call_lock:
                        self._set_active_call_checkboxes(checkboxes)

                    cam_btn, _, mic_btn = self.classify_active_call_buttons(checkboxes)
                    target = cam_btn if media == "camera" else mic_btn
                    if not target:
                        continue

                    state = self.get_checkbox_state(target)
                    if state is None:
                        continue
                    if state != expected_state and attempt < 2:
                        continue

                    if media == "camera":
                        self.camera_on = state
                        label = "camera"
                    else:
                        self.microphone_on = state
                        label = "micrô"
                    word = "bật" if state else "tắt"
                    print(f"[STATE] Actual {media}_on={state}")
                    self.speak(f"{label} {word}", language="vi", clear_pending=True)
                    return

                print(f"[STATE] Could not read actual {media} state after click")
            except Exception as e:
                print(f"[STATE] Actual {media} state read failed: {e}")
            finally:
                pythoncom.CoUninitialize()

        threading.Thread(target=state_thread, daemon=True).start()

    def _precache_no_cam_async(self):
        """Learn the no-camera click point during incoming video detection."""
        def precache_thread():
            import pythoncom
            pythoncom.CoInitialize()
            try:
                for attempt in range(5):
                    with self.call_lock:
                        if self.current_incoming_no_cam_point or self.current_incoming_no_cam_rel:
                            return
                    btn = self.find_incoming_no_cam_button_by_index()
                    if not btn:
                        btn = self.find_incoming_no_cam_raw_control_by_index()
                    if btn:
                        print(f"[NO CAM] Precached no-camera control on attempt {attempt + 1}")
                        return
                    time.sleep(0.05)
                print("[NO CAM] Precache did not find no-camera control")
            except Exception as e:
                print(f"[NO CAM] Precache failed: {e}")
            finally:
                pythoncom.CoUninitialize()

        threading.Thread(target=precache_thread, daemon=True).start()

    def _clear_action_queue(self):
        drained = 0
        while True:
            try:
                self.action_queue.get_nowait()
                self.action_queue.task_done()
                drained += 1
            except queue.Empty:
                break
        if drained:
            print(f"[QUEUE] Cleared {drained} stale queued action(s)")

    def _clear_speech_queue(self):
        drained = 0
        while True:
            try:
                self.speech_queue.get_nowait()
                self.speech_queue.task_done()
                drained += 1
            except queue.Empty:
                break
        if drained:
            print(f"[TTS] Cleared {drained} pending speech request(s)")

    def _enqueue_action(self, action: str):
        """Keep hotkeys responsive by avoiding stale action backlogs."""
        drained = 0
        while True:
            try:
                self.action_queue.get_nowait()
                self.action_queue.task_done()
                drained += 1
            except queue.Empty:
                break
        if drained:
            print(f"[QUEUE] Dropped {drained} stale pending action(s)")
        self.action_queue.put(action)

    def _reset_call_state(self, reset_process: bool = False, clear_actions: bool = False, reason: str = ""):
        if reason:
            print(f"[STATE] Resetting call state: {reason}")
        self.unregister_hotkeys()
        with self.call_lock:
            self.incoming_call_detected = False
            self.call_active = False
            self.call_type = None
            self.caller_name = None
            self.current_checkboxes = []
            self.current_incoming_deny_btn = None
            self.current_incoming_accept_btn = None
            self.current_incoming_no_cam_btn = None
            self._set_active_call_checkboxes([])
            self.camera_on = True
            self.microphone_on = True
            self.incoming_buttons_ready_announced = False
            self.pending_incoming_caller_name = None
            self.pending_incoming_call_type = None
            self.pending_incoming_until = 0.0
            self.pending_video_incoming_announced = False
            self.incoming_check_cycles = 0
        self.zalocall_window_handle = None
        self._active_query_counter = 0
        if reset_process:
            self.zalocall_pid = None
            self.zalocall_window_handle = None
        if clear_actions:
            self._clear_action_queue()

    def _ensure_zalocall_live(self) -> bool:
        if self.zalocall_pid and self.is_zalocall_running():
            return True
        self.zalocall_pid = None
        self.zalocall_window_handle = None
        return self.find_zalocall_process()

    def _wait_for_process_root(self, timeout: float = 3.0) -> Optional[UIA.IUIAutomationElement]:
        deadline = time.time() + timeout
        while time.time() < deadline:
            root = self.get_process_root_element()
            if root:
                return root
            time.sleep(0.05)
        return None

    def _is_pid_running(self, pid: Optional[int]) -> bool:
        if not pid:
            return False
        try:
            if PSUTIL_AVAILABLE:
                return psutil.pid_exists(pid)
            output = subprocess.check_output(f'tasklist /FI "PID eq {pid}" /FO CSV /NH', shell=True).decode('utf-8', errors='ignore')
            return str(pid) in output
        except:
            return False

    def _get_zalocall_related_pids(self) -> set:
        pids = set()
        if self.zalocall_pid:
            pids.add(self.zalocall_pid)
        if not PSUTIL_AVAILABLE:
            return pids
        try:
            if self.zalocall_pid and psutil.pid_exists(self.zalocall_pid):
                proc = psutil.Process(self.zalocall_pid)
                for child in proc.children(recursive=True):
                    try:
                        child_name = (child.name() or "").lower()
                    except Exception:
                        child_name = ""
                    if child_name == "zalocall.exe":
                        pids.add(child.pid)
            for proc in psutil.process_iter(["pid", "name"]):
                name = (proc.info.get("name") or "").lower()
                if name == "zalocall.exe":
                    pids.add(proc.info["pid"])
        except Exception:
            pass
        return pids

    def _find_zalocall_window_handle(self) -> Optional[int]:
        """Find the visible Zalo call window, allowing Electron's window PID to differ."""
        if not WIN32_AVAILABLE or not self.zalocall_pid:
            return None

        related_pids = self._get_zalocall_related_pids()
        candidates = []
        now = time.time()

        def add_candidate(hwnd, score, pid, title, class_name, rect):
            width = rect[2] - rect[0]
            height = rect[3] - rect[1]
            if width <= 80 or height <= 80:
                return
            if rect[0] <= -30000 or rect[1] <= -30000:
                return
            candidates.append((score, hwnd, pid, title, class_name, rect, width * height))

        try:
            foreground_hwnd = win32gui.GetForegroundWindow()
        except Exception:
            foreground_hwnd = None

        def enum_handler(hwnd, ctx):
            try:
                if not win32gui.IsWindowVisible(hwnd):
                    return True
                _, pid = win32api.GetWindowThreadProcessId(hwnd)
                title = win32gui.GetWindowText(hwnd) or ""
                class_name = win32gui.GetClassName(hwnd) or ""
                rect = win32gui.GetWindowRect(hwnd)

                proc_name = ""
                if PSUTIL_AVAILABLE:
                    try:
                        proc_name = (psutil.Process(pid).name() or "").lower()
                    except Exception:
                        proc_name = ""

                title_l = title.lower()
                class_l = class_name.lower()
                score = 0
                if pid == self.zalocall_pid:
                    score += 120
                if pid in related_pids:
                    score += 90
                if proc_name == "zalocall.exe":
                    score += 80
                if "zalo" in title_l or "zalo" in class_l:
                    score += 30
                if any(kw in title_l for kw in ["call", "cuoc goi", "goi", "gọi", "video", "audio", "thoai", "thoại"]):
                    score += 35
                if "chrome_widgetwin" in class_l or "electron" in class_l:
                    score += 15
                if foreground_hwnd and hwnd == foreground_hwnd:
                    score += 20

                if (pid in related_pids or proc_name == "zalocall.exe") and score >= 80:
                    add_candidate(hwnd, score, pid, title, class_name, rect)
            except Exception:
                pass
            return True

        try:
            win32gui.EnumWindows(enum_handler, None)
        except Exception as enum_err:
            print(f"[ROOT] Win32 EnumWindows failed: {enum_err}")
            return None

        if not candidates:
            if now - self._root_lookup_last_log > 2.0:
                self._root_lookup_last_log = now
                print(f"[ROOT] No visible ZaloCall window candidates for pid={self.zalocall_pid}, related_pids={sorted(related_pids)}")
            return None

        candidates.sort(key=lambda item: (item[0], item[6]), reverse=True)
        best_score, hwnd, pid, title, class_name, rect, _ = candidates[0]
        if now - self._root_lookup_last_log > 2.0:
            self._root_lookup_last_log = now
            print(f"[ROOT] Selected hwnd={hwnd} pid={pid} score={best_score} title='{title}' class='{class_name}' rect={rect}")
        return hwnd

    def _get_process_root_element_via_uia_desktop(self) -> Optional[UIA.IUIAutomationElement]:
        """Fallback root lookup through UIA when Electron owns no visible Win32 top-level window."""
        if not self.automation or not self.zalocall_pid:
            return None

        related_pids = self._get_zalocall_related_pids()
        root = None
        try:
            root = self.automation.GetRootElement()
        except Exception as root_err:
            print(f"[ROOT] UIA desktop root unavailable: {root_err}")
            return None

        candidates = []
        cache_request = None
        try:
            cache_request = self.automation.CreateCacheRequest()
            cache_request.AddProperty(UIA.UIA_ProcessIdPropertyId)
            cache_request.AddProperty(UIA.UIA_NamePropertyId)
            cache_request.AddProperty(UIA.UIA_ControlTypePropertyId)
            cache_request.AddProperty(UIA.UIA_BoundingRectanglePropertyId)
            cache_request.AddProperty(UIA.UIA_NativeWindowHandlePropertyId)
        except Exception:
            cache_request = None

        for pid in sorted(related_pids):
            try:
                condition = self.automation.CreatePropertyCondition(UIA.UIA_ProcessIdPropertyId, pid)
                try:
                    if cache_request:
                        arr = root.FindAllBuildCache(UIA.TreeScope_Children, condition, cache_request)
                    else:
                        arr = root.FindAll(UIA.TreeScope_Children, condition)
                except Exception:
                    arr = None

                if not arr or arr.Length == 0:
                    if cache_request:
                        arr = root.FindAllBuildCache(UIA.TreeScope_Descendants, condition, cache_request)
                    else:
                        arr = root.FindAll(UIA.TreeScope_Descendants, condition)

                if not arr:
                    continue

                for i in range(arr.Length):
                    try:
                        el = arr.GetElement(i)
                        rect = self._get_el_rect(el)
                        width = rect.right - rect.left
                        height = rect.bottom - rect.top
                        if width <= 20 or height <= 20:
                            continue
                        name = self._get_el_name(el)
                        control_type = self._get_el_control_type(el)
                        score = 0
                        if pid == self.zalocall_pid:
                            score += 100
                        if width > 80 and height > 80:
                            score += 40
                        if control_type == UIA.UIA_WindowControlTypeId:
                            score += 40
                        if any(kw in (name or "").lower() for kw in ["zalo", "call", "cuoc goi", "goi", "gọi", "video", "audio"]):
                            score += 30
                        candidates.append((score, width * height, el, pid, name, control_type, (rect.left, rect.top, rect.right, rect.bottom)))
                    except Exception:
                        pass
            except Exception as pid_err:
                print(f"[ROOT] UIA process lookup failed for pid={pid}: {pid_err}")

        if not candidates:
            now = time.time()
            if now - self._root_lookup_last_log > 2.0:
                self._root_lookup_last_log = now
                print(f"[ROOT] UIA desktop fallback found no elements for related_pids={sorted(related_pids)}")
            return None

        candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
        score, _, el, pid, name, control_type, rect = candidates[0]
        now = time.time()
        if now - self._root_lookup_last_log > 2.0:
            self._root_lookup_last_log = now
            print(f"[ROOT] UIA fallback selected pid={pid} score={score} type={control_type} name='{name}' rect={rect}")

        try:
            native_hwnd = el.CurrentNativeWindowHandle
            if native_hwnd:
                self.zalocall_window_handle = native_hwnd
        except Exception:
            pass

        return el

    def _get_el_name(self, el) -> str:
        try:
            return el.CachedName or ""
        except Exception:
            try:
                return el.CurrentName or ""
            except Exception:
                return ""

    def _get_el_auto_id(self, el) -> str:
        try:
            return el.CachedAutomationId or ""
        except Exception:
            try:
                return el.CurrentAutomationId or ""
            except Exception:
                return ""

    def _get_el_control_type(self, el) -> int:
        try:
            return el.CachedControlType
        except Exception:
            try:
                return el.CurrentControlType
            except Exception:
                return 0

    def _get_el_rect(self, el):
        try:
            return el.CachedBoundingRectangle
        except Exception:
            try:
                return el.CurrentBoundingRectangle
            except Exception:
                class FakeRect:
                    left = right = top = bottom = 0
                return FakeRect()

    def _get_el_is_enabled(self, el) -> bool:
        try:
            return el.CachedIsEnabled
        except Exception:
            try:
                return el.CurrentIsEnabled
            except Exception:
                return False

    def is_vietnamese_text(self, text: str) -> bool:
        """Detect if text contains Vietnamese characters or patterns."""
        if not text:
            return False
        
        text_lower = text.lower().strip()
        
        # 1. Quick check for Vietnamese characters with diacritics (100% Vietnamese)
        for char in text:
            code_point = ord(char)
            if (0x00C0 <= code_point <= 0x1EF9) or (0x1EA0 <= code_point <= 0x1EF9):
                return True
            if char in ['ă', 'â', 'ê', 'ô', 'ơ', 'ư', 'đ', 'Đ',
                         'Á', 'À', 'Ả', 'Ã', 'Ạ', 'Ă', 'Ắ', 'Ằ', 'Ẳ', 'Ẵ', 'Ặ',
                         'Â', 'Ấ', 'Ầ', 'Ẩ', 'Ẫ', 'Ậ', 'É', 'È', 'Ẻ', 'Ẽ', 'Ẹ',
                         'Ê', 'Ế', 'Ề', 'Ể', 'Ễ', 'Ệ', 'Í', 'Ì', 'Ỉ', 'Ĩ', 'Ị',
                         'Ó', 'Ò', 'Ỏ', 'Õ', 'Ọ', 'Ô', 'Ố', 'Ồ', 'Ổ', 'Ỗ', 'Ộ',
                         'Ơ', 'Ớ', 'Ờ', 'Ở', 'Ỡ', 'Ợ', 'Ú', 'Ù', 'Ủ', 'Ũ', 'Ụ',
                         'Ư', 'Ứ', 'Ừ', 'Ử', 'Ữ', 'Ự', 'Ý', 'Ỳ', 'Ỷ', 'Ỹ', 'Ỵ']:
                return True

        # 2. Check for common diacritic-less Vietnamese name words
        common_vn_names = {
            # Surnames
            'nguyen', 'tran', 'le', 'pham', 'hoang', 'huynh', 'phan', 'vu', 'vo', 'dang', 'bui', 'do', 'ho', 'ngo', 'duong', 'ly', 'lam', 'trinh', 'mai', 'dinh', 'quach', 'luong', 'phung', 'tong',
            # Middle / First names
            'van', 'thi', 'huu', 'duc', 'thanh', 'minh', 'anh', 'tuan', 'hai', 'son', 'dung', 'hung', 'trang', 'lan', 'phuong', 'nam', 'viet', 'quoc', 'hoai', 'thu', 'thuy', 'ngoc', 'kim', 'hong', 'quang', 'khanh', 'long', 'duy', 'linh', 'giang', 'yen', 'tuyet', 'oanh', 'vy', 'nhi', 'chau', 'cuong', 'dat', 'dong', 'ha', 'hiep', 'hieu', 'hoa', 'huy', 'khoa', 'lai', 'luan', 'phong', 'phuc', 'quan', 'quy', 'tai', 'thach', 'thao', 'thien', 'thinh', 'tien', 'toan', 'tri', 'trieu', 'trung', 'truong', 'tu', 'tuyen', 'uyen', 'xuan'
        }
        
        words = re.findall(r'\b[a-z]+\b', text_lower)
        for w in words:
            if w in common_vn_names:
                return True

        # 3. Check for Vietnamese-specific letter combinations/patterns
        vietnamese_patterns = [
            'ươ', 'ưa', 'ưi', 'ưu', 'ưo', 'ưe',
            'ươn', 'ương', 'ươm', 'ươp', 'ươc', 'ươt',
            'uong', 'uoi', 'uou', 'uoc', 'uot', 'uon', 'uom', 'uop',
            'phương', 'phuong', 'thương', 'thuong', 'hương', 'huong',
            'đông', 'dong', 'đức', 'duc', 'đăng', 'dang',
            'ăn', 'ân', 'ấn', 'ẩn', 'ằn', 'ẳn', 'ặn',
            'ê', 'ệ', 'ế', 'ề', 'ể', 'ễ',
            'ô', 'ộ', 'ố', 'ồ', 'ổ', 'ỗ',
            'ơ', 'ớ', 'ờ', 'ở', 'ỡ', 'ợ',
        ]
        for pattern in vietnamese_patterns:
            if pattern in text_lower:
                return True
        
        # 4. Check for Vietnamese phrases
        vietnamese_phrases = [
            'cuộc gọi', 'cuoc goi', 'gọi video', 'goi video', 'gọi đến', 'goi den',
            'em iu', 'em yêu', 'em yeu', 'iu em', 'yêu em', 'yeu em',
            'cuộc gọi video', 'cuoc goi video', 'cuộc gọi đến', 'cuoc goi den',
            'cuộc gọi audio', 'cuoc goi audio', 'cuộc gọi từ', 'cuoc goi tu'
        ]
        for phrase in vietnamese_phrases:
            if phrase in text_lower:
                return True
        
        # 5. Check for common words
        common_vietnamese_words = [
            'em', 'iu', 'yêu', 'yeu', 'cuộc', 'cuoc', 'gọi', 'goi', 'đến', 'den',
            'video', 'audio', 'anh', 'chị', 'bạn', 'ban', 'mình', 'minh'
        ]
        for word in common_vietnamese_words:
            if re.search(r'\b' + re.escape(word) + r'\b', text_lower):
                return True

        return False

    def get_checkbox_state(self, checkbox: UIA.IUIAutomationElement) -> Optional[bool]:
        """Get the true toggle state of a checkbox/button.
        Returns True for ON (active), False for OFF (inactive/muted), and None if undetermined.
        """
        # 1. Try checking name/automation ID text first (most reliable in Electron/Zalo)
        try:
            name = (self._get_el_name(checkbox) or "").lower()
            auto_id = (self._get_el_auto_id(checkbox) or "").lower()
            text = name + " " + auto_id
            if text.strip():
                print(f"[STATE] Checking accessible name/ID text: '{text}'")
                inactive_patterns = [
                    "unmute", "turn on camera", "turn on cam", "turn on microphone", "turn on mic",
                    "enable camera", "enable cam", "enable microphone", "enable mic", "start video",
                    "bat camera", "bat cam", "bat mic", "bat micro", "bat am thanh",
                    "mo camera", "mo cam", "mo mic", "mo micro",
                    "b\u1eadt camera", "b\u1eadt cam", "b\u1eadt mic", "b\u1eadt micro", "b\u1eadt \u00e2m thanh",
                    "m\u1edf camera", "m\u1edf cam", "m\u1edf mic", "m\u1edf micro",
                    "bo tat tieng", "b\u1ecf t\u1eaft ti\u1ebfng",
                ]
                if any(w in text for w in inactive_patterns):
                    print(f"[STATE] Text matches inactive (OFF) pattern")
                    return False
                # If name is "tắt camera/mic", it means the camera/mic is currently ON.
                active_patterns = [
                    "turn off camera", "turn off cam", "turn off microphone", "turn off mic",
                    "disable camera", "disable cam", "disable microphone", "disable mic", "stop video",
                    "tat camera", "tat cam", "tat mic", "tat micro", "tat am thanh",
                    "tắt camera", "tắt cam", "tắt mic", "tắt micro", "tắt âm thanh",
                    "mute microphone", "mute mic", "mute audio",
                ]
                if any(w in text for w in active_patterns) or re.search(r"(?<!un)\bmute\b", text):
                    print(f"[STATE] Text matches active (ON) pattern")
                    return True
                # If name is "bật camera/mic", it means the camera/mic is currently OFF.
                if any(w in text for w in ["bật camera", "bat camera", "bật mic", "bat mic", "unmute", "bật âm thanh", "bat am thanh"]):
                    print(f"[STATE] Text matches inactive (OFF) pattern")
                    return False
        except Exception as e:
            print(f"[STATE] Error checking name text: {e}")

        try:
            toggle_pattern = checkbox.GetCurrentPattern(UIA.UIA_TogglePatternId)
            if toggle_pattern:
                toggle_pattern = toggle_pattern.QueryInterface(UIA.IUIAutomationTogglePattern)
                state = toggle_pattern.CurrentToggleState
                print(f"[STATE] Current TogglePattern state: {state}")
                if state == 1 or state == 2:
                    return True
                if state == 0:
                    return False
        except Exception:
            pass

        try:
            legacy_pattern = checkbox.GetCurrentPattern(UIA.UIA_LegacyIAccessiblePatternId)
            if legacy_pattern:
                legacy_pattern = legacy_pattern.QueryInterface(UIA.IUIAutomationLegacyIAccessiblePattern)
                state = legacy_pattern.CurrentState
                print(f"[STATE] Current LegacyIAccessible state: {state}")
                STATE_SYSTEM_CHECKED = 0x00000010
                return bool(state & STATE_SYSTEM_CHECKED)
        except Exception:
            pass

        return None

        # 2. Try TogglePattern (Cached first, then Current)
        try:
            toggle_pattern = None
            try:
                toggle_pattern = checkbox.GetCachedPattern(UIA.UIA_TogglePatternId)
            except:
                pass
            if not toggle_pattern:
                try:
                    toggle_pattern = checkbox.GetCurrentPattern(UIA.UIA_TogglePatternId)
                except:
                    pass
            if toggle_pattern:
                toggle_pattern = toggle_pattern.QueryInterface(UIA.IUIAutomationTogglePattern)
                try:
                    state = toggle_pattern.CachedToggleState
                except Exception:
                    state = toggle_pattern.CurrentToggleState
                print(f"[STATE] TogglePattern state: {state}")
                # ToggleState: 1 = On/Checked, 2 = Indeterminate (often ON for camera), 0 = Off/Unchecked
                if state == 1 or state == 2:
                    return True
                elif state == 0:
                    return False
        except Exception as e:
            pass

        # 3. Try LegacyIAccessiblePattern (State property) (Cached first, then Current)
        try:
            legacy_pattern = None
            try:
                legacy_pattern = checkbox.GetCachedPattern(UIA.UIA_LegacyIAccessiblePatternId)
            except:
                pass
            if not legacy_pattern:
                try:
                    legacy_pattern = checkbox.GetCurrentPattern(UIA.UIA_LegacyIAccessiblePatternId)
                except:
                    pass
            if legacy_pattern:
                legacy_pattern = legacy_pattern.QueryInterface(UIA.IUIAutomationLegacyIAccessiblePattern)
                try:
                    state = legacy_pattern.CachedState
                except Exception:
                    state = legacy_pattern.CurrentState
                print(f"[STATE] LegacyIAccessible state: {state}")
                STATE_SYSTEM_CHECKED = 0x00000010
                if state & STATE_SYSTEM_CHECKED:
                    return True
                else:
                    return False
        except Exception as e:
            pass

        return None

    def get_female_voice(self, engine):
        """Get a female voice, avoiding male voices at all costs."""
        if not engine:
            return None
        
        try:
            voices = engine.GetVoices()
            male_indicators = ['male', 'david', 'mark', 'richard', 'james', 'george', 'paul']
            female_indicators = ['zira', 'hazel', 'female', 'woman', 'susan', 'linda']
            
            # First, try to find explicitly female voices
            for i in range(voices.Count):
                voice = voices.Item(i)
                voice_name = voice.GetDescription()
                voice_name_lower = voice_name.lower()
                
                # Skip if it's a male voice
                if any(male_indicator in voice_name_lower for male_indicator in male_indicators):
                    continue
                
                # Prefer explicitly female voices
                if any(indicator in voice_name_lower for indicator in female_indicators):
                    return voice
            
            # If no explicitly female voice found, try voices that are NOT male
            for i in range(voices.Count):
                voice = voices.Item(i)
                voice_name = voice.GetDescription()
                voice_name_lower = voice_name.lower()
                
                # Skip if it's a male voice
                if any(male_indicator in voice_name_lower for male_indicator in male_indicators):
                    continue
                
                # Prefer second voice (often female on Windows) or any non-male voice
                if i == 1 or 'english' in voice_name_lower or 'en-' in voice_name_lower:
                    return voice
            
            # Last resort: find ANY voice that's not male
            for i in range(voices.Count):
                voice = voices.Item(i)
                voice_name = voice.GetDescription()
                voice_name_lower = voice_name.lower()
                
                # Skip if it's a male voice
                if not any(male_indicator in voice_name_lower for male_indicator in male_indicators):
                    return voice
            
            return None
        except Exception as e:
            print(f"[TTS] Error getting female voice: {e}")
            return None
    
    def speak_gtts(self, text: str, lang: str = 'vi'):
        try:
            print(f"[gTTS] Speaking: '{text}'")
            if not pygame.mixer.get_init():
                pygame.mixer.init()
            else:
                try: pygame.mixer.music.stop()
                except: pass
            
            tts = gTTS(text=text, lang=lang)
            temp_dir = tempfile.gettempdir()
            temp_file = os.path.join(temp_dir, f"zablind_tts_{int(time.time()*1000)}.mp3")
            tts.save(temp_file)
            try:
                pygame.mixer.music.load(temp_file)
                pygame.mixer.music.play()
                while pygame.mixer.music.get_busy():
                    time.sleep(0.05)
                pygame.mixer.music.unload()
            finally:
                try: os.remove(temp_file)
                except: pass
            return True
        except Exception as e:
            print(f"[gTTS] Error speaking text: {e}")
            return False

    def speak(self, text: str, language: Optional[str] = None, clear_pending: bool = False):
        """Queue text-to-speech task.
        
        Args:
            text: Text to speak
            language: Optional language hint
            clear_pending: Drop queued speech before speaking this urgent message
        """
        if not text:
            return
        if clear_pending:
            self._clear_speech_queue()
        print(f"[TTS] Queueing speech request: '{text}' (lang={language})")
        self.speech_queue.put((text, language))

    def _speech_worker(self):
        """Worker thread for text-to-speech.
        Uses accessible_output2 to speak natively to NVDA, JAWS, or SAPI5 fallback.
        """
        import pythoncom
        pythoncom.CoInitialize()
        
        # Initialize accessible_output2
        speaker = None
        try:
            import accessible_output2.outputs.auto
            speaker = accessible_output2.outputs.auto.Auto()
            print(f"[TTS Worker] Initialized accessible_output2 auto speaker: {speaker}")
        except Exception as e:
            print(f"[TTS Worker] Error initializing accessible_output2: {e}")
            import traceback
            traceback.print_exc()
            
        print("[TTS Worker] Background thread started and ready.")
        
        while True:
            try:
                item = self.speech_queue.get()
                if item is None:
                    break
                text, language = item
                
                print(f"[TTS Worker] Speaking text: '{text}'")
                
                # Filter out pure UI button text
                ui_button_patterns = [
                    "trả lời không mở camera", "không mở camera", "không bật camera",
                    "chấp nhận", "từ chối", "bật camera", "tắt camera", "bật mic", "tắt mic", "kết thúc"
                ]
                text_lower = text.lower().strip()
                is_pure_button = (
                    any(text_lower == pattern for pattern in ui_button_patterns) or
                    (any(pattern in text_lower for pattern in ui_button_patterns) and
                     len(text_lower) < 30 and
                     'incoming' not in text_lower and 'call' not in text_lower and
                     'cuộc gọi' not in text_lower and 'cuoc goi' not in text_lower)
                )
                if is_pure_button:
                    print(f"[TTS Worker] Skipping pure UI button text: '{text}'")
                    self.speech_queue.task_done()
                    continue
                
                spoken = False
                
                # Check if we should use gTTS fallback for Vietnamese when only SAPI5 is available
                is_sapi = False
                if speaker:
                    try:
                        active_out = speaker.get_first_available_output()
                        if active_out and active_out.name == 'sapi5':
                            is_sapi = True
                    except:
                        pass
                
                # If it's Vietnamese and we would use SAPI5 (which doesn't speak Vietnamese), use gTTS instead!
                is_vietnamese = (language == 'vi')
                if not is_vietnamese:
                    # Simple character check for Vietnamese characters
                    vietnamese_chars = "áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ"
                    is_vietnamese = any(c in text_lower for c in vietnamese_chars)
                
                if is_sapi and is_vietnamese:
                    print(f"[TTS Worker] Using gTTS fallback for Vietnamese text: '{text}'")
                    spoken = self.speak_gtts(text, 'vi')
                
                if not spoken and speaker:
                    try:
                        # Speak text natively via screen reader or SAPI5 fallback
                        speaker.speak(text, interrupt=True)
                        spoken = True
                    except Exception as sp_err:
                        print(f"[TTS Worker] accessible_output2 speak failed: {sp_err}")
                
                # SAPI5 manual fallback as absolute last resort
                if not spoken:
                    try:
                        import win32com.client
                        sapi_voice = win32com.client.Dispatch("SAPI.SpVoice")
                        sapi_voice.Rate = 0
                        sapi_voice.Speak(text)
                    except Exception as sapi_err:
                        print(f"[TTS Worker] Manual SAPI5 fallback failed: {sapi_err}")
                
                self.speech_queue.task_done()
            except Exception as loop_err:
                print(f"[TTS Worker] Error in worker loop: {loop_err}")
                import traceback
                traceback.print_exc()
        
        pythoncom.CoUninitialize()
        
    def find_zalocall_process(self) -> bool:
        """Find the ZaloCall.exe process."""
        try:
            if PSUTIL_AVAILABLE:
                for proc in psutil.process_iter(['pid', 'name']):
                    if proc.info['name'] and proc.info['name'].lower() == 'zalocall.exe':
                        self.zalocall_pid = proc.info['pid']
                        print(f"Found ZaloCall.exe (PID: {self.zalocall_pid})")
                        return True
            else:
                output = subprocess.check_output('tasklist /FI "IMAGENAME eq zalocall.exe" /FO CSV /NH', shell=True).decode('utf-8', errors='ignore')
                if "zalocall.exe" in output.lower():
                    parts = output.strip().split(',')
                    if len(parts) >= 2:
                        self.zalocall_pid = int(parts[1].strip('"'))
                        print(f"Found ZaloCall.exe (PID: {self.zalocall_pid})")
                        return True
            return False
        except Exception as e:
            print(f"Error finding ZaloCall.exe process: {e}")
            return False
            
    def is_zalocall_running(self) -> bool:
        if not self.zalocall_pid:
            return False
        try:
            if PSUTIL_AVAILABLE:
                return psutil.pid_exists(self.zalocall_pid)
            else:
                output = subprocess.check_output(f'tasklist /FI "PID eq {self.zalocall_pid}" /FO CSV /NH', shell=True).decode('utf-8', errors='ignore')
                return str(self.zalocall_pid) in output
        except:
            return False
    
    def initialize_automation(self) -> bool:
        """Initialize UI Automation."""
        return self.automation is not None

    def extract_caller_name_from_title(self, title: str) -> Optional[str]:
        """Extract caller name from window title by removing call status/type keywords."""
        if not title:
            return None
        parts = [p.strip() for p in title.split('-')]
        exclude_keywords = [
            "zalo", "cuộc gọi", "cuoc goi", "gọi đến", "goi den", "video", "thoại", "thoai",
            "incoming", "call", "accept", "deny", "trả lời", "từ chối", "có hình", "co hinh"
        ]
        valid_parts = []
        for part in parts:
            part_lower = part.lower()
            if not any(kw in part_lower for kw in exclude_keywords) and len(part) > 0:
                valid_parts.append(part)
        if valid_parts:
            return valid_parts[0]
        return None
    
    def get_process_root_element(self) -> Optional[UIA.IUIAutomationElement]:
        """Get the root element for ZaloCall process.

        Prefer UI Automation process search. ZaloCall's visible Electron surface
        is not always owned by a normal visible Win32 top-level window, so Win32
        handle lookup is only a secondary optimization.
        """
        if not self.automation or not self.zalocall_pid:
            return None
            
        try:
            fallback_root = self._get_process_root_element_via_uia_desktop()
            if fallback_root:
                return fallback_root

            # 1. Check if we already have the window handle and it's valid
            hwnd_ok = False
            if self.zalocall_window_handle:
                try:
                    if win32gui.IsWindow(self.zalocall_window_handle) and win32gui.IsWindowVisible(self.zalocall_window_handle):
                        hwnd_ok = True
                except:
                    pass
            
            # 2. If not valid, search using fast Win32 API
            if not hwnd_ok:
                self.zalocall_window_handle = self._find_zalocall_window_handle()
                
                if self.zalocall_window_handle:
                    try:
                        if win32gui.IsWindow(self.zalocall_window_handle) and win32gui.IsWindowVisible(self.zalocall_window_handle):
                            hwnd_ok = True
                    except:
                        pass
            
            # 3. If we have a valid handle, use ElementFromHandle
            if hwnd_ok:
                try:
                    el = self.automation.ElementFromHandle(self.zalocall_window_handle)
                    if el:
                        # Extract title and detect call type/caller name
                        try:
                            title = el.CurrentName
                            if title and title.strip():
                                title_lower = title.lower()
                                if any(kw in title_lower for kw in ["video", "hình", "hinh"]):
                                    self.call_type = "video"
                                elif any(kw in title_lower for kw in ["thoại", "thoai", "audio", "voice"]):
                                    self.call_type = "audio"
                                if not self.caller_name:
                                    extracted_name = self.extract_caller_name_from_title(title)
                                    if extracted_name:
                                        self.caller_name = extracted_name
                        except:
                            pass
                        return el
                except Exception as uia_handle_err:
                    print(f"[ROOT] ElementFromHandle failed: {uia_handle_err}")
                    self.zalocall_window_handle = None
            return None
        except Exception as e:
            print(f"Error getting process root element: {e}")
            return None

    def check_if_call_is_active(self, checkboxes: List[UIA.IUIAutomationElement]) -> bool:
        """Determine if we are in an active call versus an incoming call.
        Active calls have camera/mic/end buttons and do not have accept/deny buttons.
        """
        with self.call_lock:
            if self.call_active:
                return True
            if self.incoming_call_detected:
                return False

        # No accessibility text scan here. Incoming popups expose accept/deny as
        # two checkboxes; active call rows expose at least three controls.
        return len(checkboxes or []) >= 3

        # 1. First check: inspect window title of the root element (extremely fast, < 1ms)
        try:
            root = self.get_process_root_element()
            if root:
                title = (root.CurrentName or "").lower()
                if any(kw in title for kw in ["gọi đến", "goi den", "incoming", "gọi đi", "goi di", "đang gọi", "dang goi", "đang đổ chuông", "dang do chuong", "đang kết nối", "dang ket noi"]):
                    print(f"[ACTIVE CHECK] Title '{title}' indicates incoming/ringing, call is not active.")
                    return False
                if any(kw in title for kw in ["cuộc gọi thoại", "cuoc goi thoai", "cuộc gọi video", "cuoc goi video", "đang trong cuộc gọi", "connected", "active"]):
                    print(f"[ACTIVE CHECK] Title '{title}' indicates active call.")
                    return True
        except Exception as title_err:
            pass

        # 2. Check if any checkbox/button has accept/deny in name or ID
        for cb in checkboxes:
            try:
                name = self._get_el_name(cb).lower()
                auto_id = self._get_el_auto_id(cb).lower()
                combined = f"{name} {auto_id}"
                if any(kw in combined for kw in ["accept", "deny", "reject", "chấp nhận", "từ chối", "trả lời"]):
                    return False
            except:
                pass
                
        # 3. Fallback: Check window elements text for call status keywords
        try:
            if root:
                elements = self.get_all_elements(root)
                has_incoming_text = False
                has_active_text = False
                for el in elements:
                    try:
                        name = self._get_el_name(el).lower()
                        if any(kw in name for kw in ["chấp nhận", "từ chối", "đang gọi", "gọi đến", "incoming", "accept", "deny", "reject", "trả lời"]):
                            has_incoming_text = True
                        if any(kw in name for kw in ["đang trong cuộc gọi", "kết nối", "cuộc gọi hoạt động", "connected", "active", "call time", "duration", "call duration"]):
                            has_active_text = True
                    except:
                        pass
                if has_incoming_text:
                    print("[ACTIVE CHECK] Found incoming text indicators, call is not active.")
                    return False
                if has_active_text:
                    print("[ACTIVE CHECK] Found active text indicators, call is active.")
                    return True
        except Exception as e:
            print(f"[ACTIVE CHECK] Error scanning elements: {e}")
            
        # 4. Fallback: if we don't see any incoming text/buttons, assume active call
        return True
    
    def get_all_elements(self, root: UIA.IUIAutomationElement) -> List[UIA.IUIAutomationElement]:
        """Collect all descendant elements of root using FindAllBuildCache with target conditions."""
        if not self.automation or not root:
            return []
        
        elements = []
        try:
            cond_button = self.automation.CreatePropertyCondition(
                UIA.UIA_ControlTypePropertyId,
                UIA.UIA_ButtonControlTypeId
            )
            cond_checkbox = self.automation.CreatePropertyCondition(
                UIA.UIA_ControlTypePropertyId,
                UIA.UIA_CheckBoxControlTypeId
            )
            cond_text = self.automation.CreatePropertyCondition(
                UIA.UIA_ControlTypePropertyId,
                UIA.UIA_TextControlTypeId
            )
            
            cond_or1 = self.automation.CreateOrCondition(cond_button, cond_checkbox)
            condition = self.automation.CreateOrCondition(cond_or1, cond_text)
            
            cache_request = self.automation.CreateCacheRequest()
            cache_request.AddProperty(UIA.UIA_ControlTypePropertyId)
            cache_request.AddProperty(UIA.UIA_NamePropertyId)
            cache_request.AddProperty(UIA.UIA_AutomationIdPropertyId)
            cache_request.AddProperty(UIA.UIA_BoundingRectanglePropertyId)
            
            arr = root.FindAllBuildCache(UIA.TreeScope_Descendants, condition, cache_request)
            if arr:
                for i in range(arr.Length):
                    try:
                        child = arr.GetElement(i)
                        ctrl_type = self._get_el_control_type(child)
                        name = self._get_el_name(child)
                        auto_id = self._get_el_auto_id(child)
                        is_useful = (
                            (name and name.strip()) or 
                            (auto_id and auto_id.strip()) or
                            ctrl_type in [UIA.UIA_ButtonControlTypeId, UIA.UIA_CheckBoxControlTypeId, UIA.UIA_TextControlTypeId]
                        )
                        if is_useful:
                            elements.append(child)
                    except:
                        pass
        except Exception as e:
            print(f"[UIA] get_all_elements FindAllBuildCache failed: {e}")
        return elements

    def get_interactive_elements(self, root: UIA.IUIAutomationElement) -> List[UIA.IUIAutomationElement]:
        """Collect CheckBox and Button controls under root using CacheRequest."""
        if not self.automation or not root:
            return []
        
        elements = []
        try:
            cond_button = self.automation.CreatePropertyCondition(
                UIA.UIA_ControlTypePropertyId,
                UIA.UIA_ButtonControlTypeId
            )
            cond_checkbox = self.automation.CreatePropertyCondition(
                UIA.UIA_ControlTypePropertyId,
                UIA.UIA_CheckBoxControlTypeId
            )
            condition = self.automation.CreateOrCondition(cond_button, cond_checkbox)
            
            cache_request = self.automation.CreateCacheRequest()
            cache_request.AddProperty(UIA.UIA_ControlTypePropertyId)
            cache_request.AddProperty(UIA.UIA_BoundingRectanglePropertyId)
            cache_request.AddProperty(UIA.UIA_IsEnabledPropertyId)
            cache_request.AddPattern(UIA.UIA_TogglePatternId)
            cache_request.AddPattern(UIA.UIA_LegacyIAccessiblePatternId)
            
            arr = root.FindAllBuildCache(UIA.TreeScope_Descendants, condition, cache_request)
            if arr:
                for i in range(arr.Length):
                    try:
                        child = arr.GetElement(i)
                        elements.append(child)
                    except:
                        pass
        except Exception as e:
            print(f"[UIA] get_interactive_elements BuildCache failed: {e}")
        return elements

    def get_call_control_cluster(self, checkboxes: List[UIA.IUIAutomationElement]) -> List[UIA.IUIAutomationElement]:
        """Group buttons by proximity to isolate central call controls."""
        if not checkboxes:
            return []
        # Sort by left coordinate
        sorted_cbs = []
        for cb in checkboxes:
            try:
                rect = self._get_el_rect(cb)
                if rect.right > rect.left and rect.bottom > rect.top:
                    sorted_cbs.append((rect.left, cb))
            except:
                pass
        if not sorted_cbs:
            return checkboxes
        sorted_cbs.sort(key=lambda x: x[0])
        # Build clusters
        clusters = []
        current_cluster = [sorted_cbs[0]]
        for item in sorted_cbs[1:]:
            left_val, cb = item
            prev_left, prev_cb = current_cluster[-1]
            try:
                prev_rect = self._get_el_rect(prev_cb)
                gap = left_val - prev_rect.right
                if gap < 200:
                    current_cluster.append(item)
                else:
                    clusters.append(current_cluster)
                    current_cluster = [item]
            except:
                current_cluster.append(item)
        clusters.append(current_cluster)
        
        try:
            root = self.get_process_root_element()
            if root:
                win_rect = root.CurrentBoundingRectangle
                win_center = (win_rect.left + win_rect.right) / 2
                best_cluster = None
                min_dist = float('inf')
                for cluster in clusters:
                    c_lefts = [x[0] for x in cluster]
                    c_rights = []
                    for x in cluster:
                        try:
                            c_rights.append(self._get_el_rect(x[1]).right)
                        except:
                            c_rights.append(x[0] + 50)
                    cluster_center = (min(c_lefts) + max(c_rights)) / 2
                    dist = abs(cluster_center - win_center)
                    size = len(cluster)
                    if size in [2, 3]:
                        dist -= 300
                    if dist < min_dist:
                        min_dist = dist
                        best_cluster = cluster
                if best_cluster:
                    result = [x[1] for x in best_cluster]
                    print(f"[CLUSTER] Selected central cluster of size {len(result)} out of {len(checkboxes)} buttons.")
                    return result
        except Exception as e:
            print(f"[CLUSTER] Error scoring clusters: {e}")
        clusters.sort(key=len, reverse=True)
        if clusters and len(clusters[0]) >= 2:
            return [x[1] for x in clusters[0]]
        return checkboxes

    def find_active_call_checkboxes(self) -> List[UIA.IUIAutomationElement]:
        """Find active call control buttons (camera, end call, microphone) - not accept/deny buttons."""
        if not self.automation:
            return []
        
        try:
            root = self.get_process_root_element()
            if not root:
                return []
            
            checkboxes = []
            elements = self.get_interactive_elements(root)
            for element in elements:
                try:
                    control_type = self._get_el_control_type(element)
                    if control_type in [UIA.UIA_CheckBoxControlTypeId, UIA.UIA_ButtonControlTypeId]:
                        # Filter out window controls by name
                        name = self._get_el_name(element).lower()
                        auto_id = self._get_el_auto_id(element).lower()
                        combined = f"{name} {auto_id}"
                        if any(kw in combined for kw in ["minimize", "maximize", "close", "restore", "thu nhỏ", "phóng to", "đóng"]):
                            continue
                            
                        # Filter out small dropdown/expand arrows (which are narrow, e.g. width=20, height=46)
                        rect = self._get_el_rect(element)
                        width = rect.right - rect.left
                        height = rect.bottom - rect.top
                        if width > 0 and height > 0:
                            aspect_ratio = width / height
                            if width < 35 or height < 32 or aspect_ratio < 0.8:
                                continue
                                
                        checkboxes.append(element)
                except:
                    pass
            
            # Sort strictly left-to-right
            try:
                checkboxes.sort(key=lambda cb: self._get_el_rect(cb).left)
            except Exception as sort_err:
                print(f"[ACTIVE CALL] Error sorting active checkboxes: {sort_err}")
                
            return checkboxes
        except Exception as e:
            print(f"Error finding active call checkboxes: {e}")
            return []

    def find_active_call_checkboxes(self) -> List[UIA.IUIAutomationElement]:
        """Find active call controls using geometry only."""
        if not self.automation:
            return []

        try:
            root = self.get_process_root_element()
            if not root:
                return []

            try:
                root_rect = root.CurrentBoundingRectangle
            except:
                root_rect = None

            controls = []
            for element in self.get_interactive_elements(root):
                try:
                    control_type = self._get_el_control_type(element)
                    if control_type not in [UIA.UIA_CheckBoxControlTypeId, UIA.UIA_ButtonControlTypeId]:
                        continue

                    rect = self._get_el_rect(element)
                    width = rect.right - rect.left
                    height = rect.bottom - rect.top
                    if width <= 0 or height <= 0:
                        continue
                    if root_rect and rect.top - root_rect.top < 80:
                        continue

                    aspect_ratio = width / height
                    if width < 35 or height < 32 or aspect_ratio < 0.8:
                        continue
                    if width > 260 or height > 180:
                        continue

                    controls.append(element)
                except:
                    pass

            try:
                controls.sort(key=lambda cb: self._get_el_rect(cb).left)
            except Exception as sort_err:
                print(f"[ACTIVE CALL] Error sorting active controls: {sort_err}")

            return controls
        except Exception as e:
            print(f"Error finding active call controls: {e}")
            return []

    
    def extract_caller_name_from_popup(self) -> Optional[str]:
        """Extract caller name from incoming call popup."""
        if not self.automation:
            return None
        try:
            root = self.get_process_root_element()
            if not root:
                return None
            
            call_keywords = [
                'zalo', 'incoming', 'call', 'audio', 'video', 'accept', 'deny', 'reject', 'hang up',
                'trả lời không mở camera', 'không mở camera', 'không bật camera',
                'chấp nhận', 'từ chối', 'bật camera', 'tắt camera', 'bật mic', 'tắt mic', 'kết thúc',
                'accept without camera', 'without camera', 'without turn on cam'
            ]
            
            elements = self.get_all_elements(root)
            for element in elements:
                try:
                    name = element.CurrentName or ""
                    if name and len(name.strip()) > 0:
                        cand_clean = name.strip()
                        cand_lower = cand_clean.lower()
                        
                        if not any(keyword in cand_lower for keyword in call_keywords):
                            is_button_text = any(btn_keyword in cand_lower for btn_keyword in [
                                'trả lời', 'không mở', 'không bật', 'chấp nhận', 'từ chối',
                                'accept', 'deny', 'reject', 'without camera', 'cuộc gọi', 'cuoc goi'
                            ])
                            if not is_button_text:
                                if cand_clean and not cand_clean.isspace():
                                    if len(cand_clean) < 100:
                                        print(f"[CALLER] Found potential caller name from UIA element: '{cand_clean}'")
                                        return cand_clean
                except:
                    pass
            print("[CALLER] Could not extract caller name from popup")
            return None
        except Exception as e:
            print(f"[CALLER] Error extracting caller name: {e}")
            return None

    def announce_incoming_call(self, caller_name: Optional[str], call_type: str):
        """Announce incoming call with caller name and call type.
        
        Args:
            caller_name: Name of the caller (None if not found)
            call_type: Type of call ('audio' or 'video')
        """
        vn_call_type = "thoại" if call_type == "audio" else "video"
        if not caller_name:
            announcement = f"Cuộc gọi {vn_call_type} đến"
            print(f"[ANNOUNCE] Spoken incoming call announcement: '{announcement}'")
            self.speak(announcement, language='vi')
            return
            
        announcement = f"Cuộc gọi {vn_call_type} đến từ {caller_name}"
        print(f"[ANNOUNCE] Spoken incoming call announcement: '{announcement}'")
        self.speak(announcement, language='vi')

    def _resolve_caller_name_async(self, call_type: str):
        """Resolve caller name after fast incoming detection without delaying hotkeys."""
        def resolve_thread():
            import pythoncom
            pythoncom.CoInitialize()
            try:
                detected_type = call_type
                caller_name = None
                for attempt in range(6):
                    time.sleep(0.12 if attempt == 0 else 0.18)
                    _, next_type, next_name = self.detect_incoming_call_details()
                    if next_type == "video":
                        detected_type = "video"
                    elif detected_type != "video" and next_type:
                        detected_type = next_type
                    if next_name:
                        caller_name = next_name
                    if caller_name and detected_type == "video":
                        break
                    with self.call_lock:
                        if self.last_action_type == "deny" or (not self.incoming_call_detected and not self.call_active):
                            break

                if detected_type == "video":
                    with self.call_lock:
                        if self.incoming_call_detected or self.call_active:
                            self.call_type = "video"
                            self._promote_current_incoming_cache("video")
                    self._precache_no_cam_async()
                if not caller_name:
                    caller_name = self.extract_caller_name_from_popup()
                if not caller_name:
                    caller_name = self._extract_caller_name_from_current_title()
                if caller_name or detected_type:
                    self._remember_incoming_details(caller_name, detected_type)
                if caller_name:
                    with self.call_lock:
                        call_still_relevant = (
                            self.incoming_call_detected or
                            (self.call_active and self.last_action_type in ["accept", "accept_without_camera"])
                        )
                        if self.last_action_type == "deny" or not call_still_relevant or self.caller_name:
                            return
                        self.caller_name = caller_name
                        if detected_type == "video":
                            self.call_type = "video"
                            self._promote_current_incoming_cache("video")
                    self.announce_incoming_call(caller_name, detected_type or call_type)
                    if detected_type == "video":
                        self._precache_no_cam_async()
            except Exception as e:
                print(f"[CALLER] Background caller-name resolve failed: {e}")
            finally:
                pythoncom.CoUninitialize()

        threading.Thread(target=resolve_thread, daemon=True).start()
    
    
    def detect_incoming_call_popup(self) -> bool:
        """Detect if there's an incoming call popup by searching for text patterns."""
        if not self.automation:
            return False
        try:
            root = self.get_process_root_element()
            if not root:
                return False
            
            incoming_patterns = ['accept', 'deny', 'reject', 'chấp nhận', 'từ chối', 'incoming', 'gọi đến', 'goi den', 'đang gọi', 'dang goi', 'trả lời', 'tra loi']
            exclude_patterns = ['zalo call', 'toggle', 'camera', 'microphone', 'end call', 'hang up']
            
            elements = self.get_all_elements(root)
            for element in elements:
                try:
                    name = element.CurrentName or ""
                    automation_id = element.CurrentAutomationId or ""
                    text_to_check = (name + " " + automation_id).lower()
                    
                    if any(exclude in text_to_check for exclude in exclude_patterns):
                        continue
                        
                    for pattern in incoming_patterns:
                        if pattern in text_to_check:
                            print(f"[DETECT] Found incoming call pattern: '{pattern}' in '{name}'")
                            return True
                except:
                    pass
            print("[DETECT] No incoming call popup detected by text search")
            return False
        except Exception as e:
            print(f"[DETECT] Error in detect_incoming_call_popup: {e}")
            return False

    def detect_incoming_call_type_instantly(self) -> str:
        """Detect call type instantly based on button/checkbox presence, completely bypassing text/UIA render delays.
        
        Returns 'video' if the 'Accept without camera' button or >= 3 buttons/checkboxes are present, otherwise 'audio'.
        """
        try:
            if not self.automation:
                return "audio"
            root = self.get_process_root_element()
            if not root:
                return "audio"
            
            # Use the optimized incoming button finder to check for presence of 3 elements or a button
            deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
            if no_cam_btn is not None:
                return "video"
        except Exception as e:
            print(f"[DETECT] Instant call type detection error: {e}")
            
        return "audio"

    def detect_call_type_from_popup(self) -> str:
        """Detect call type from incoming call popup."""
        try:
            call_type = self.detect_incoming_call_type_instantly()
            return call_type
        except:
            _, call_type, _ = self.detect_incoming_call_details()
            return call_type

    def detect_incoming_call_details(self) -> Tuple[bool, str, Optional[str]]:
        """Detect all details of an incoming call in a single fast pass."""
        if not self.automation:
            return False, "audio", None
        try:
            root = self.get_process_root_element()
            if not root:
                return False, "audio", None
            
            elements = self.get_all_elements(root)
            
            is_incoming = False
            call_type = "audio"
            caller_name = None
            
            # Keywords for call type description text
            video_desc_keywords = [
                "cuộc gọi video đến", "cuộc gọi video", "gọi video", "video call", "incoming video call",
                "cuộc gọi có hình đến", "cuộc gọi có hình", "có hình"
            ]
            audio_desc_keywords = [
                "cuộc gọi thoại đến", "cuộc gọi thoại", "gọi thoại", "voice call", "audio call",
                "incoming voice call", "incoming call", "incoming audio call"
            ]
            
            # 1. Look for the call type description element
            desc_element = None
            for element in elements:
                try:
                    if self._get_el_control_type(element) == UIA.UIA_TextControlTypeId:
                        name = (self._get_el_name(element) or "").strip().lower()
                        if not name:
                            continue
                            
                        # Check if it matches any desc keyword
                        is_video_desc = any(kw in name for kw in video_desc_keywords)
                        is_audio_desc = any(kw in name for kw in audio_desc_keywords)
                        
                        if is_video_desc or is_audio_desc:
                            is_incoming = True
                            call_type = "video" if is_video_desc else "audio"
                            desc_element = element
                            print(f"[DETECT] Found call type description: '{self._get_el_name(element)}' -> type={call_type}")
                            break
                except:
                    pass
            
            # 2. If description element is found, get the caller name from sibling
            if desc_element:
                try:
                    walker = self.automation.ControlViewWalker
                    parent = walker.GetParent(desc_element)
                    if parent:
                        siblings = self.get_children(parent)
                        for sibling in siblings:
                            try:
                                if self._get_el_control_type(sibling) == UIA.UIA_TextControlTypeId:
                                    sib_name = (self._get_el_name(sibling) or "").strip()
                                    # Ensure it's not the description element itself and doesn't contain system keywords
                                    if sib_name and sib_name != self._get_el_name(desc_element):
                                        sib_name_lower = sib_name.lower()
                                        if not any(kw in sib_name_lower for kw in [
                                            "zalo", "cuộc gọi", "cuoc goi", "gọi đến", "goi den", "video", "thoại", "thoai",
                                            "incoming", "call", "accept", "deny", "trả lời", "từ chối"
                                        ]):
                                            caller_name = sib_name
                                            print(f"[DETECT] Found caller name from sibling: '{caller_name}'")
                                            break
                            except:
                                pass
                except Exception as e:
                    print(f"[DETECT] Sibling search failed: {e}")
                    
            # 3. Fallback: if caller_name is still None, scan all Text elements in the window
            if is_incoming and not caller_name:
                exclude_keywords = [
                    "zalo", "cuộc gọi", "cuoc goi", "gọi đến", "goi den", "video", "thoại", "thoai",
                    "incoming", "call", "accept", "deny", "trả lời", "từ chối", "không mở camera",
                    "without camera", "open cam", "camera"
                ]
                for element in elements:
                    try:
                        if self._get_el_control_type(element) == UIA.UIA_TextControlTypeId:
                            name = (self._get_el_name(element) or "").strip()
                            if name:
                                name_lower = name.lower()
                                if not any(kw in name_lower for kw in exclude_keywords):
                                    if len(name) > 0 and len(name) < 100:
                                        caller_name = name
                                        print(f"[DETECT] Fallback found caller name: '{caller_name}'")
                                        break
                    except:
                        pass
            
            return is_incoming, call_type, caller_name
        except Exception as e:
            print(f"[DETECT] Error in single-pass detection: {e}")
            return False, "audio", None

    def find_accept_without_camera_button(self) -> Optional[UIA.IUIAutomationElement]:
        """Find the 'accept without camera' button by searching for Vietnamese or English text."""
        if not self.automation:
            return None
        try:
            root = self.get_process_root_element()
            if not root:
                return None
            
            search_patterns = [
                "accept without turn on cam",
                "accept without camera",
                "without turn on camera",
                "without camera",
                "without turn on cam",
                "trả lời không mở camera",
                "không mở camera",
                "không bật camera",
                "không bật",
                "không mở"
            ]
            
            elements = self.get_all_elements(root)
            found_text_element = None
            
            # Step 1: Find the text element
            for element in elements:
                try:
                    name = (element.CurrentName or "").strip()
                    auto_id = (element.CurrentAutomationId or "").strip()
                    combined = f"{name} {auto_id}".lower()
                    for pattern in search_patterns:
                        if pattern in combined:
                            found_text_element = element
                            print(f"[FIND] [OK] Found text element with pattern '{pattern}' in: '{name}'")
                            break
                    if found_text_element:
                        break
                except:
                    pass
            
            if not found_text_element:
                print(f"[FIND] Text element not found, searching for buttons directly...")
                for element in elements:
                    try:
                        control_type = element.CurrentControlType
                        if control_type in [UIA.UIA_ButtonControlTypeId, UIA.UIA_CheckBoxControlTypeId]:
                            name = (element.CurrentName or "").lower()
                            auto_id = (element.CurrentAutomationId or "").lower()
                            combined = f"{name} {auto_id}"
                            for pattern in search_patterns:
                                if pattern in combined:
                                    if "accept" in combined or "chấp nhận" in combined:
                                        if "without" not in combined and "không" not in combined:
                                            continue
                                    
                                    rect = element.CurrentBoundingRectangle
                                    if rect.right > rect.left and rect.bottom > rect.top:
                                        try:
                                            if element.GetCurrentPattern(UIA.UIA_InvokePatternId):
                                                print(f"[FIND] Found button directly: '{name}'")
                                                return element
                                        except:
                                            pass
                    except:
                        pass
                return None
                
            # Step 2: Walk up the tree from found text element to parent button/checkbox
            walker = self.automation.CreateTreeWalker(self.automation.CreateTrueCondition())
            current = found_text_element
            max_levels = 10
            for level in range(max_levels):
                try:
                    control_type = current.CurrentControlType
                    if control_type in [UIA.UIA_ButtonControlTypeId, UIA.UIA_CheckBoxControlTypeId]:
                        rect = current.CurrentBoundingRectangle
                        if rect.right > rect.left and rect.bottom > rect.top:
                            try:
                                if current.GetCurrentPattern(UIA.UIA_InvokePatternId):
                                    name = current.CurrentName or ""
                                    print(f"[FIND] [OK] Found parent button (level {level}): '{name}'")
                                    return current
                            except:
                                pass
                    
                    parent = walker.GetParentElement(current)
                    if not parent or parent == current:
                        break
                    current = parent
                except:
                    break
            
            return None
        except Exception as e:
            print(f"[FIND] Error finding 'accept without camera' button: {e}")
            return None

    def get_children(self, element) -> List[UIA.IUIAutomationElement]:
        """Get direct children of a UIA element using ControlViewWalker."""
        children = []
        try:
            walker = self.automation.ControlViewWalker
            child = walker.GetFirstChildElement(element)
            while child:
                children.append(child)
                child = walker.GetNextSiblingElement(child)
        except Exception as e:
            print(f"[UIA] Error getting children: {e}")
        return children

    def get_button_texts_fast(self, element) -> List[str]:
        """Get text content of direct children and grandchildren using ControlViewWalker."""
        texts = []
        try:
            walker = self.automation.ControlViewWalker
            child = walker.GetFirstChildElement(element)
            while child:
                try:
                    c_name = child.CurrentName
                    if c_name:
                        texts.append(c_name.strip())
                except:
                    pass
                try:
                    grandchild = walker.GetFirstChildElement(child)
                    while grandchild:
                        try:
                            gc_name = grandchild.CurrentName
                            if gc_name:
                                texts.append(gc_name.strip())
                        except:
                            pass
                        grandchild = walker.GetNextSiblingElement(grandchild)
                except:
                    pass
                child = walker.GetNextSiblingElement(child)
        except Exception as e:
            print(f"[UIA] get_button_texts_fast failed: {e}")
        return texts

    def is_accept_without_camera_button(self, element) -> bool:
        """Check if the element is the 'accept without camera' button by inspecting its texts."""
        try:
            if element.CurrentControlType not in [UIA.UIA_ButtonControlTypeId, UIA.UIA_CheckBoxControlTypeId]:
                return False
            
            name = element.CurrentName or ""
            texts = [name] + self.get_button_texts_fast(element)
            
            video_no_cam_keywords = [
                "trả lời không mở camera", "không mở camera", "không bật camera", "tắt camera", "không camera",
                "answer without camera", "accept without camera", "answer do not open cam", "without camera", "do not open camera", "without turn on cam",
                "accept without turn on camera", "without turn on camera", "accept without turn on cam", "without turn on cam"
            ]
            
            for text in texts:
                text_lower = text.lower()
                if any(kw in text_lower for kw in video_no_cam_keywords):
                    return True
        except:
            pass
        return False

    def _incoming_call_type_hint_from_root(self, root) -> Optional[str]:
        """Return 'video' or 'audio' when the incoming popup exposes a type label."""
        try:
            texts = []
            try:
                texts.append(root.CurrentName or "")
            except:
                pass
            for el in self.get_all_elements(root):
                try:
                    texts.append(self._get_el_name(el) or "")
                    texts.append(self._get_el_auto_id(el) or "")
                except:
                    pass
            joined = " ".join(t for t in texts if t).lower()
            if any(kw in joined for kw in ["incoming video", "video call", "gá»i video", "goi video", "cuá»™c gá»i video", "cuoc goi video"]):
                return "video"
            if any(kw in joined for kw in ["incoming audio", "audio call", "voice call", "gá»i thoáº¡i", "goi thoai", "cuá»™c gá»i thoáº¡i", "cuoc goi thoai"]):
                return "audio"
        except Exception as e:
            print(f"[INCOMING MAP] Error reading call type hint: {e}")
        return None

    def _map_incoming_controls_by_geometry(self, controls, root=None, allow_extra_no_cam: bool = False):
        """Map incoming popup controls by layout: bottom-row left is deny, bottom-row right is accept."""
        candidates = []
        seen = set()
        for ctrl in controls or []:
            try:
                rect = self._get_el_rect(ctrl)
                width = rect.right - rect.left
                height = rect.bottom - rect.top
                if width <= 20 or height <= 20 or width > 420 or height > 220:
                    continue
                key = (rect.left, rect.top, rect.right, rect.bottom)
                if key in seen:
                    continue
                seen.add(key)
                name = self._get_el_name(ctrl).lower()
                auto_id = self._get_el_auto_id(ctrl).lower()
                combined = f"{name} {auto_id}"
                if any(kw in combined for kw in ["minimize", "maximize", "restore", "thu nhá»", "phÃ³ng to"]):
                    continue
                candidates.append((rect.left, rect.top, rect.right, rect.bottom, ctrl, combined))
            except:
                pass

        if len(candidates) < 2:
            return None, None, None

        for left, top, right, bottom, ctrl, combined in candidates:
            print(f"[INCOMING MAP] Candidate at ({left},{top},{right},{bottom}) text='{combined.strip()}'")

        # Accept/deny are the two controls on the lowest row of the incoming popup.
        max_top = max(c[1] for c in candidates)
        bottom_row = [c for c in candidates if abs(c[1] - max_top) <= 120]
        if len(bottom_row) < 2:
            bottom_row = sorted(candidates, key=lambda c: (c[1], c[0]))[-2:]
        bottom_row.sort(key=lambda c: c[0])

        deny_btn = bottom_row[0][4]
        accept_btn = bottom_row[1][4]

        extra_controls = [c for c in candidates if c[4] not in [deny_btn, accept_btn]]
        no_cam_btn = None
        for c in candidates:
            if self.is_accept_without_camera_button(c[4]):
                no_cam_btn = c[4]
                break

        hint = self._incoming_call_type_hint_from_root(root) if root else None
        if not hint and self.call_type in ["audio", "video"]:
            hint = self.call_type

        if hint == "video" and len(candidates) == 2:
            pair = sorted(candidates, key=lambda c: c[0])
            no_cam_btn = pair[0][4]
            accept_btn = pair[1][4]
            print(f"[INCOMING MAP] Video pair result: no_cam=({pair[0][0]},{pair[0][1]}), accept=({pair[1][0]},{pair[1][1]})")
            return None, accept_btn, no_cam_btn

        if hint == "video" and len(candidates) >= 3:
            rows = []
            for cand in sorted(candidates, key=lambda c: c[1]):
                placed = False
                for row in rows:
                    if abs(cand[1] - row["top"]) <= 120:
                        row["items"].append(cand)
                        row["top"] = sum(item[1] for item in row["items"]) / len(row["items"])
                        placed = True
                        break
                if not placed:
                    rows.append({"top": cand[1], "items": [cand]})
            accept_rows = [row for row in rows if len(row["items"]) >= 2]
            deny_rows = [row for row in rows if len(row["items"]) == 1]
            if accept_rows:
                accept_row = max(accept_rows, key=lambda row: (len(row["items"]), row["top"]))
                pair = sorted(accept_row["items"], key=lambda c: c[0])[:2]
                no_cam_btn = pair[0][4]
                accept_btn = pair[1][4]
                if deny_rows:
                    deny_row = max(deny_rows, key=lambda row: row["top"])
                    deny_btn = deny_row["items"][0][4]
                print(f"[INCOMING MAP] Video row result: deny={'yes' if deny_btn else 'no'}, no_cam=({pair[0][0]},{pair[0][1]}), accept=({pair[1][0]},{pair[1][1]})")
                return deny_btn, accept_btn, no_cam_btn

        if not no_cam_btn and extra_controls and (hint == "video" or allow_extra_no_cam):
            # Zalo often exposes this anonymous control above/right of the accept row.
            extra_controls.sort(key=lambda c: (c[1], -c[0]))
            no_cam_btn = extra_controls[0][4]

        print(f"[INCOMING MAP] Geometry result: deny=({bottom_row[0][0]},{bottom_row[0][1]}), accept=({bottom_row[1][0]},{bottom_row[1][1]}), no_cam={'yes' if no_cam_btn else 'no'}, hint={hint}")
        return deny_btn, accept_btn, no_cam_btn

    def _map_incoming_controls_by_geometry(self, controls, root=None, allow_extra_no_cam: bool = False):
        """Map incoming popup controls by fixed Zalo UI indices, without text scanning."""
        checkboxes = []
        buttons = []
        seen = set()
        for ctrl in controls or []:
            try:
                ctrl_type = self._get_el_control_type(ctrl)
                rect = self._get_el_rect(ctrl)
                width = rect.right - rect.left
                height = rect.bottom - rect.top
                if width <= 20 or height <= 20 or width > 420 or height > 220:
                    continue
                key = (rect.left, rect.top, rect.right, rect.bottom, ctrl_type)
                if key in seen:
                    continue
                seen.add(key)
                if root:
                    try:
                        root_rect = self._get_el_rect(root)
                        root_height = root_rect.bottom - root_rect.top
                        if root_height > 0:
                            relative_y = ((rect.top + rect.bottom) / 2 - root_rect.top) / root_height
                            if relative_y < 0.12:
                                continue
                    except:
                        pass
                item = (rect.left, rect.top, rect.right, rect.bottom, ctrl)
                if ctrl_type == UIA.UIA_CheckBoxControlTypeId:
                    checkboxes.append(item)
                elif ctrl_type == UIA.UIA_ButtonControlTypeId:
                    buttons.append(item)
            except:
                pass

        # Zalo incoming popup index contract:
        #   CheckBox[0] = Deny
        #   CheckBox[1] = Accept normally
        #   Button[1]   = Accept without camera
        deny_btn = checkboxes[0][4] if len(checkboxes) >= 1 else None
        accept_btn = checkboxes[1][4] if len(checkboxes) >= 2 else None
        no_cam_btn = buttons[1][4] if len(buttons) >= 2 else None

        print(f"[INCOMING MAP] Index result: checkboxes={len(checkboxes)} buttons={len(buttons)} deny={'yes' if deny_btn else 'no'} accept={'yes' if accept_btn else 'no'} no_cam={'yes' if no_cam_btn else 'no'}")
        return deny_btn, accept_btn, no_cam_btn

    def find_incoming_call_buttons(self) -> Tuple[Optional[UIA.IUIAutomationElement], Optional[UIA.IUIAutomationElement], Optional[UIA.IUIAutomationElement]]:
        """Find the incoming call interactive buttons:
        Returns (deny_button, accept_button, accept_without_camera_button).
        """
        if not self.automation:
            return None, None, None
            
        try:
            root = self.get_process_root_element()
            if not root:
                self.root_element = None
                return None, None, None
                
            cond_checkbox = self.automation.CreatePropertyCondition(
                UIA.UIA_ControlTypePropertyId,
                UIA.UIA_CheckBoxControlTypeId
            )
            cond_button = self.automation.CreatePropertyCondition(
                UIA.UIA_ControlTypePropertyId,
                UIA.UIA_ButtonControlTypeId
            )
            condition = self.automation.CreateOrCondition(cond_checkbox, cond_button)
            
            cache_request = self.automation.CreateCacheRequest()
            cache_request.AddProperty(UIA.UIA_ControlTypePropertyId)
            cache_request.AddProperty(UIA.UIA_BoundingRectanglePropertyId)
            
            arr = root.FindAllBuildCache(UIA.TreeScope_Descendants, condition, cache_request)
            
            checkboxes = []
            buttons = []
            if arr:
                for i in range(arr.Length):
                    try:
                        el = arr.GetElement(i)
                        rect = self._get_el_rect(el)
                        width = rect.right - rect.left
                        height = rect.bottom - rect.top
                        if width > 20 and height > 20 and width <= 420 and height <= 220:
                            try:
                                root_rect = self._get_el_rect(root)
                                root_height = root_rect.bottom - root_rect.top
                                if root_height > 0:
                                    relative_y = ((rect.top + rect.bottom) / 2 - root_rect.top) / root_height
                                    if relative_y < 0.12:
                                        continue
                            except:
                                pass
                            ctrl_type = self._get_el_control_type(el)
                            if ctrl_type == UIA.UIA_CheckBoxControlTypeId:
                                checkboxes.append(el)
                            elif ctrl_type == UIA.UIA_ButtonControlTypeId:
                                buttons.append(el)
                    except:
                        pass
            
            if not checkboxes and not buttons:
                print("[FIND BUTTONS] Root element has no interactive elements - invalidating cache for retry")
                self.root_element = None
                return None, None, None

            # Incoming Zalo popup index contract. Do not inspect names/text here,
            # and do not sort: Zalo's exposed UIA order is the contract.
            deny_btn = checkboxes[0] if len(checkboxes) >= 1 else None
            accept_btn = checkboxes[1] if len(checkboxes) >= 2 else None
            no_cam_btn = buttons[1] if len(buttons) >= 2 else None
            print(f"[FIND BUTTONS] Index map: checkboxes={len(checkboxes)} buttons={len(buttons)} deny={'yes' if deny_btn else 'no'} accept={'yes' if accept_btn else 'no'} no_cam={'yes' if no_cam_btn else 'no'}")
            self._set_incoming_controls(deny_btn, accept_btn, no_cam_btn)
            return deny_btn, accept_btn, no_cam_btn
                        
            try:
                checkboxes.sort(key=lambda cb: (
                    self._get_el_rect(cb).top,
                    self._get_el_rect(cb).left
                ))
            except:
                pass
                
            deny_btn = None
            accept_btn = None
            if len(checkboxes) >= 2:
                for cb in checkboxes:
                    try:
                        name = self._get_el_name(cb).lower()
                        auto_id = self._get_el_auto_id(cb).lower()
                        combined = f"{name} {auto_id}"
                        if any(kw in combined for kw in ["deny", "reject", "từ chối", "tu choi"]):
                            deny_btn = cb
                        elif any(kw in combined for kw in ["accept", "answer", "chấp nhận", "chap nhan", "trả lời", "tra loi"]):
                            if not any(kw in combined for kw in ["without", "không", "khong"]):
                                accept_btn = cb
                    except:
                        pass
                
                if not deny_btn:
                    deny_btn = checkboxes[0]
                if not accept_btn:
                    accept_btn = checkboxes[1]
            elif len(checkboxes) == 1:
                cb = checkboxes[0]
                try:
                    name = self._get_el_name(cb).lower()
                    if any(kw in name for kw in ["deny", "reject", "từ chối"]):
                        deny_btn = cb
                    else:
                        accept_btn = cb
                except:
                    accept_btn = cb
                    
            no_cam_btn = None
            
            call_buttons = []
            if buttons:
                try:
                    root_rect = root.CurrentBoundingRectangle
                    for btn in buttons:
                        try:
                            name = self._get_el_name(btn).lower()
                            auto_id = self._get_el_auto_id(btn).lower()
                            combined = f"{name} {auto_id}"
                            if any(kw in combined for kw in ["minimize", "maximize", "close", "restore", "thu nhỏ", "phóng to", "đóng"]):
                                continue
                            
                            rect = self._get_el_rect(btn)
                            if rect.top - root_rect.top < 60:
                                continue
                                
                            # Filter out large layout panels / background elements
                            width = rect.right - rect.left
                            height = rect.bottom - rect.top
                            if width > 150 or height > 150:
                                continue
                                
                            call_buttons.append(btn)
                        except:
                            pass
                except Exception as filter_err:
                    print(f"[FILTER] Error filtering buttons: {filter_err}")
                    call_buttons = buttons
 
            if call_buttons:
                if self.call_type != "video":
                    self.call_type = "video"
                    print("[DETECT] Set call_type to video due to button presence in incoming call")
                try:
                    if len(call_buttons) >= 2:
                        no_cam_btn = call_buttons[1]
                        print(f"[DETECT] Mapped call_buttons[1] as 'Accept without camera' button: '{self._get_el_name(no_cam_btn) or 'button'}'")
                    else:
                        no_cam_btn = call_buttons[0]
                        print(f"[DETECT] Mapped call_buttons[0] as 'Accept without camera' button: '{self._get_el_name(no_cam_btn) or 'button'}'")
                except Exception as map_err:
                    no_cam_btn = None
                    print(f"[DETECT] ERROR mapping call button: {map_err}")
            elif len(checkboxes) >= 3:
                other_cbs = [cb for cb in checkboxes if cb not in [deny_btn, accept_btn]]
                if other_cbs:
                    no_cam_btn = other_cbs[0]
                    if self.call_type != "video":
                        self.call_type = "video"
                        print("[DETECT] Set call_type to video due to >= 3 checkboxes in incoming call")
                    print(f"[DETECT] Instantly mapped third checkbox as 'Accept without camera' button")

            geo_deny, geo_accept, geo_no_cam = self._map_incoming_controls_by_geometry(checkboxes + call_buttons, root)
            if geo_deny and geo_accept:
                deny_btn = geo_deny
                accept_btn = geo_accept
            if geo_no_cam:
                no_cam_btn = geo_no_cam
                if self.call_type != "video":
                    self.call_type = "video"
                    print("[DETECT] Set call_type to video due to geometric no-camera control")
            type_hint = self._incoming_call_type_hint_from_root(root)
            if type_hint == "audio" and no_cam_btn and not self.is_accept_without_camera_button(no_cam_btn):
                no_cam_btn = None
                self.call_type = "audio"
                print("[DETECT] Cleared anonymous no-camera candidate because popup says audio")

            return deny_btn, accept_btn, no_cam_btn
        except Exception as e:
            print(f"[ERROR] Error finding incoming buttons: {e}")
            raise e

    def find_incoming_no_cam_button_by_index(self) -> Optional[UIA.IUIAutomationElement]:
        """Find incoming video accept-without-camera using raw Button[1] only."""
        if not self.automation:
            return None

        try:
            root = self.get_process_root_element()
            if not root:
                self.root_element = None
                return None

            condition = self.automation.CreatePropertyCondition(
                UIA.UIA_ControlTypePropertyId,
                UIA.UIA_ButtonControlTypeId
            )
            cache_request = self.automation.CreateCacheRequest()
            cache_request.AddProperty(UIA.UIA_ControlTypePropertyId)
            cache_request.AddProperty(UIA.UIA_BoundingRectanglePropertyId)

            arr = root.FindAllBuildCache(UIA.TreeScope_Descendants, condition, cache_request)
            buttons = []
            if arr:
                for i in range(arr.Length):
                    try:
                        el = arr.GetElement(i)
                        rect = self._get_el_rect(el)
                        width = rect.right - rect.left
                        height = rect.bottom - rect.top
                        if width <= 0 or height <= 0:
                            continue
                        print(f"[NO CAM] Raw Button[{len(buttons)}] candidate rect=({rect.left},{rect.top},{rect.right},{rect.bottom})")
                        buttons.append(el)
                    except:
                        pass

            no_cam_btn = buttons[1] if len(buttons) >= 2 else None
            print(f"[NO CAM] Raw Button[1] map: buttons={len(buttons)} no_cam={'yes' if no_cam_btn else 'no'}")
            if no_cam_btn:
                with self.call_lock:
                    self._set_incoming_controls(
                        self.current_incoming_deny_btn,
                        self.current_incoming_accept_btn,
                        no_cam_btn
                    )
            return no_cam_btn
        except Exception as e:
            print(f"[NO CAM] Error finding raw Button[1]: {e}")
            self.root_element = None
            return None

    def find_incoming_no_cam_raw_control_by_index(self) -> Optional[UIA.IUIAutomationElement]:
        """Fallback for Zalo builds that do not expose the no-camera control as Button."""
        if not self.automation:
            return None

        try:
            root = self.get_process_root_element()
            if not root:
                self.root_element = None
                return None

            condition = self.automation.CreateTrueCondition()
            cache_request = self.automation.CreateCacheRequest()
            cache_request.AddProperty(UIA.UIA_ControlTypePropertyId)
            cache_request.AddProperty(UIA.UIA_BoundingRectanglePropertyId)

            arr = root.FindAllBuildCache(UIA.TreeScope_Descendants, condition, cache_request)
            controls = []
            if arr:
                try:
                    root_rect = self._get_el_rect(root)
                    root_area = max(1, (root_rect.right - root_rect.left) * (root_rect.bottom - root_rect.top))
                except:
                    root_area = 1

                for i in range(arr.Length):
                    try:
                        el = arr.GetElement(i)
                        ctrl_type = self._get_el_control_type(el)
                        if ctrl_type == UIA.UIA_CheckBoxControlTypeId:
                            continue
                        rect = self._get_el_rect(el)
                        width = rect.right - rect.left
                        height = rect.bottom - rect.top
                        if width <= 20 or height <= 20:
                            continue
                        area = width * height
                        if area >= root_area * 0.85:
                            continue
                        if width > 520 or height > 260:
                            continue
                        print(f"[NO CAM RAW] Candidate[{len(controls)}] type={ctrl_type} rect=({rect.left},{rect.top},{rect.right},{rect.bottom})")
                        controls.append(el)
                    except:
                        pass

            no_cam_ctrl = controls[1] if len(controls) >= 2 else None
            print(f"[NO CAM RAW] Raw non-checkbox index map: controls={len(controls)} no_cam={'yes' if no_cam_ctrl else 'no'}")
            if no_cam_ctrl:
                with self.call_lock:
                    self._set_incoming_controls(
                        self.current_incoming_deny_btn,
                        self.current_incoming_accept_btn,
                        no_cam_ctrl
                    )
            return no_cam_ctrl
        except Exception as e:
            print(f"[NO CAM RAW] Error finding raw non-checkbox control[1]: {e}")
            self.root_element = None
            return None

    def detect_call_type_before_accept(self, timeout_ms=500) -> str:
        """Wait/poll for call type to be determined before clicking accept.
        Returns 'video' or 'audio' (defaults to 'audio').
        """
        start_time = time.time()
        
        # 1. Fast path: if call type is already set, just wait for checkboxes to be loaded
        if self.call_type in ["audio", "video"]:
            deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
            if not (deny_btn and accept_btn):
                for _ in range(10):
                    time.sleep(0.02)
                    deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
                    if deny_btn and accept_btn:
                        break
            print(f"[DETECT-BEFORE-ACCEPT] Fast-path call_type='{self.call_type}' resolved in {int((time.time() - start_time)*1000)}ms")
            return self.call_type
            
        # 2. Wait until the interactive buttons are loaded (first check)
        checkboxes_loaded = False
        while time.time() - start_time < 0.4:
            deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
            if deny_btn and accept_btn:
                checkboxes_loaded = True
                break
            time.sleep(0.03)
            
        print(f"[DETECT-BEFORE-ACCEPT] Checkboxes loaded: {checkboxes_loaded} (elapsed: {int((time.time() - start_time)*1000)}ms)")
        
        # 3. Check window title or button presence to determine call type
        while time.time() - start_time < (timeout_ms / 1000.0):
            root = self.get_process_root_element()
            if root:
                try:
                    title = root.CurrentName
                    if title and title.strip():
                        title_lower = title.lower()
                        if any(kw in title_lower for kw in ["video", "hình", "hinh"]):
                            self.call_type = "video"
                            print(f"[DETECT-BEFORE-ACCEPT] Detected video from title: '{title}'")
                            return "video"
                        elif any(kw in title_lower for kw in ["thoại", "thoai", "audio", "voice"]):
                            self.call_type = "audio"
                            print(f"[DETECT-BEFORE-ACCEPT] Detected audio from title: '{title}'")
                            return "audio"
                except:
                    pass
            
            # Check button presence (if no_cam_btn exists, it's definitely video)
            deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
            if no_cam_btn:
                self.call_type = "video"
                print("[DETECT-BEFORE-ACCEPT] Detected video from button presence")
                return "video"
                
            time.sleep(0.03)
            
        print("[DETECT-BEFORE-ACCEPT] Timeout. Defaulting to audio.")
        return "audio"

    def find_call_checkboxes(self, include_all: bool = True) -> List[UIA.IUIAutomationElement]:
        """Find the call accept/deny checkboxes or active call checkboxes.
        
        Args:
            include_all: If True, finds all checkboxes. If False, only finds those with InvokePattern.
        """
        if not self.automation:
            return []
        
        try:
            root = self.get_process_root_element()
            if not root:
                return []
            
            checkboxes = []
            elements = self.get_interactive_elements(root)
            for element in elements:
                try:
                    if self._get_el_control_type(element) == UIA.UIA_CheckBoxControlTypeId:
                        rect = self._get_el_rect(element)
                        if rect.right > rect.left and rect.bottom > rect.top:
                            # Filter out large layout containers
                            if (rect.right - rect.left) > 250 or (rect.bottom - rect.top) > 150:
                                continue
                            checkboxes.append(element)
                except:
                    pass
            
            try:
                checkboxes.sort(key=lambda cb: (
                    self._get_el_rect(cb).top,
                    self._get_el_rect(cb).left
                ))
            except:
                pass
            
            return checkboxes

            deny_checkbox = None
            accept_checkbox = None
            
            if len(checkboxes) >= 2:
                for cb in checkboxes:
                    try:
                        name = self._get_el_name(cb)
                        name_lower = name.lower()
                        automation_id = self._get_el_auto_id(cb)
                        automation_id_lower = automation_id.lower()
                        
                        if any(kw in name_lower or kw in automation_id_lower for kw in ["deny", "reject", "từ chối", "tu choi"]):
                            deny_checkbox = cb
                            print(f"[IDENTIFY] Found Deny button by name/ID: '{name}' / '{automation_id}'")
                            continue
                        
                        if any(kw in name_lower or kw in automation_id_lower for kw in ["accept", "answer", "chấp nhận", "chap nhan", "trả lời", "tra loi"]):
                            if any(kw in name_lower or kw in automation_id_lower for kw in ["without", "không", "khong", "off", "cam"]):
                                continue
                            accept_checkbox = cb
                            print(f"[IDENTIFY] Found Accept button by name/ID: '{name}' / '{automation_id}'")
                            continue
                    except:
                        pass
                
                if not deny_checkbox or not accept_checkbox:
                    print("[WARNING] Could not identify buttons by name/ID, using position-based assumption")
                    print("[WARNING] Assuming: First checkbox = Deny, Second checkbox = Accept")
                    try:
                        deny_checkbox = checkboxes[0]
                        accept_checkbox = checkboxes[1]
                    except:
                        pass
                else:
                    other_checkboxes = [cb for cb in checkboxes if cb not in [deny_checkbox, accept_checkbox]]
                    checkboxes = [deny_checkbox, accept_checkbox] + other_checkboxes
            elif len(checkboxes) == 1:
                print("[WARNING] Only one checkbox found, cannot determine if Accept or Deny")
            else:
                checkboxes = []
            
            return checkboxes
        except Exception as e:
            print(f"Error finding checkboxes: {e}")
            return []
    
    def supports_toggle_pattern(self, element) -> bool:
        """Check if an element supports the TogglePattern (indicates Camera/Mic toggle)."""
        try:
            pattern = element.GetCachedPattern(UIA.UIA_TogglePatternId)
            if pattern:
                return True
        except:
            pass
        try:
            pattern = element.GetCurrentPattern(UIA.UIA_TogglePatternId)
            if pattern:
                return True
        except:
            pass
        # Name/ID text fallback
        try:
            name = (self._get_el_name(element) or "").lower()
            auto_id = (self._get_el_auto_id(element) or "").lower()
            text = f"{name} {auto_id}"
            if any(kw in text for kw in ["camera", "video", "cam", "mic", "micro", "âm thanh"]):
                return True
        except:
            pass
        return False

    def classify_active_call_buttons(self, checkboxes: List[UIA.IUIAutomationElement]) -> Tuple[Optional[UIA.IUIAutomationElement], Optional[UIA.IUIAutomationElement], Optional[UIA.IUIAutomationElement]]:
        """Classify buttons into (camera_btn, end_btn, mic_btn) using the precise index-based mapping of centered controls."""
        if not checkboxes:
            return None, None, None
            
        camera_btn = None
        end_btn = None
        mic_btn = None
        
        try:
            # 1. Sort strictly left-to-right first to establish global layout
            try:
                sorted_all = sorted(checkboxes, key=lambda cb: self._get_el_rect(cb).left)
            except Exception as sort_err:
                print(f"[CLASSIFY] Error sorting checkboxes: {sort_err}")
                sorted_all = checkboxes

            # 2. Filter buttons that are horizontally centered in the call window to discard side panels
            root = self.get_process_root_element()
            if root:
                try:
                    win_rect = root.CurrentBoundingRectangle
                    win_width = win_rect.right - win_rect.left
                    if win_width > 0:
                        centered_cbs = []
                        for cb in sorted_all:
                            try:
                                rect = self._get_el_rect(cb)
                                cb_center_x = (rect.left + rect.right) / 2
                                relative_x = (cb_center_x - win_rect.left) / win_width
                                if 0.25 <= relative_x <= 0.75:
                                    centered_cbs.append(cb)
                            except:
                                pass
                        if centered_cbs:
                            rows = []
                            for cb in sorted(centered_cbs, key=lambda item: self._get_el_rect(item).top):
                                rect = self._get_el_rect(cb)
                                placed = False
                                for row in rows:
                                    if abs(rect.top - row["top"]) <= 80:
                                        row["items"].append(cb)
                                        row["top"] = sum(self._get_el_rect(item).top for item in row["items"]) / len(row["items"])
                                        placed = True
                                        break
                                if not placed:
                                    rows.append({"top": rect.top, "items": [cb]})

                            if rows:
                                best_row = max(rows, key=lambda row: (len(row["items"]), row["top"]))
                                sorted_cbs = sorted(best_row["items"], key=lambda cb: self._get_el_rect(cb).left)
                                if len(sorted_cbs) != len(centered_cbs):
                                    print(f"[CLASSIFY] Selected bottom control row with {len(sorted_cbs)} button(s) from {len(centered_cbs)} centered candidate(s)")
                            else:
                                sorted_cbs = centered_cbs
                            print(f"[CLASSIFY] Using {len(sorted_cbs)} centered buttons out of {len(sorted_all)} total buttons")
                        else:
                            sorted_cbs = sorted_all
                    else:
                        sorted_cbs = sorted_all
                except Exception as bounds_err:
                    print(f"[CLASSIFY] Error filtering by window bounds: {bounds_err}")
                    sorted_cbs = sorted_all
            else:
                sorted_cbs = sorted_all

            n = len(sorted_cbs)
            print(f"[CLASSIFY] Final sorted buttons count = {n}")
            for i, cb in enumerate(sorted_cbs):
                try:
                    rect = self._get_el_rect(cb)
                    print(f"  [{i}]: left={rect.left}")
                except:
                    pass

            # Determine call type
            # Video calls typically have more controls in the centered row (>= 6)
            is_video = (self.call_type == "video")
            if not is_video and n >= 6:
                is_video = True

            # 3. Primary Source of Truth: User-defined index mapping of centered row
            if is_video:
                # Video Call:
                # Compact centered row:
                # 0: camera
                # 1: camera dropdown / don't care
                # 2: end call
                # 3: microphone
                # 4+: mic dropdown / other controls
                if n >= 5:
                    camera_btn = sorted_cbs[0]
                    end_btn = sorted_cbs[2]
                    mic_btn = sorted_cbs[3]
                elif n == 4:
                    camera_btn = sorted_cbs[0]
                    end_btn = sorted_cbs[2]
                    mic_btn = sorted_cbs[3]
                elif n == 3:
                    camera_btn = sorted_cbs[0]
                    end_btn = sorted_cbs[1]
                    mic_btn = sorted_cbs[2]
            else:
                # Audio Call:
                # 1: don't care (index 0)
                # 2: don't care / camera disabled (index 1)
                # 3: end call (index 2)
                # 4: mic (index 3)
                # 5: don't care / mic dropdown (index 4)
                if n >= 4:
                    end_btn = sorted_cbs[2]
                    mic_btn = sorted_cbs[3]
                elif n == 3:
                    end_btn = sorted_cbs[1]
                    mic_btn = sorted_cbs[2]
                elif n == 2:
                    end_btn = sorted_cbs[0]
                    mic_btn = sorted_cbs[1]

            print(f"[CLASSIFY] Result: Camera={camera_btn is not None}, EndCall={end_btn is not None}, Mic={mic_btn is not None}")
            return camera_btn, end_btn, mic_btn

            # 4. Fallback/Override by name text if present
            for cb in sorted_cbs:
                try:
                    name = (self._get_el_name(cb) or "").lower()
                    auto_id = (self._get_el_auto_id(cb) or "").lower()
                    text = f"{name} {auto_id}"
                    if text.strip():
                        if any(kw in text for kw in ["kết thúc", "end", "hang", "reject", "cancel", "cúp máy", "tắt cuộc gọi"]):
                            end_btn = cb
                            print(f"[CLASSIFY] Name override EndCall: '{name}'")
                        elif any(kw in text for kw in ["mic", "micro", "âm thanh", "mute"]):
                            mic_btn = cb
                            print(f"[CLASSIFY] Name override Mic: '{name}'")
                        elif any(kw in text for kw in ["camera", "video", "cam"]):
                            if is_video:
                                camera_btn = cb
                                print(f"[CLASSIFY] Name override Camera: '{name}'")
                except:
                    pass

        except Exception as e:
            print(f"[CLASSIFY] Error in classify_active_call_buttons: {e}")

        print(f"[CLASSIFY] Result: Camera={camera_btn is not None}, EndCall={end_btn is not None}, Mic={mic_btn is not None}")
        return camera_btn, end_btn, mic_btn

    def find_camera_checkbox(self, checkboxes: List[UIA.IUIAutomationElement]) -> Optional[UIA.IUIAutomationElement]:
        """Find the camera toggle checkbox from a list of checkboxes."""
        camera_btn, _, _ = self.classify_active_call_buttons(checkboxes)
        return camera_btn
    
    def find_end_call_checkbox(self, checkboxes: List[UIA.IUIAutomationElement]) -> Optional[UIA.IUIAutomationElement]:
        """Find the end call button or checkbox."""
        _, end_btn, _ = self.classify_active_call_buttons(checkboxes)
        return end_btn

    def find_microphone_checkbox(self, checkboxes: List[UIA.IUIAutomationElement]) -> Optional[UIA.IUIAutomationElement]:
        """Find the microphone toggle checkbox from a list of checkboxes."""
        _, _, mic_btn = self.classify_active_call_buttons(checkboxes)
        return mic_btn
    
    def set_checkbox_label(self, checkbox: UIA.IUIAutomationElement, label: str) -> bool:
        """Attempt to set an accessible label for a checkbox so screen readers can announce it.
        
        Uses IAccessible API to try to set the accName property. This may not work for external
        controls, but we attempt it anyway. Also logs what the screen reader should announce.
        """
        try:
            # Get current name and state
            current_name = checkbox.CurrentName or ""
            
            # Try to get toggle state
            toggle_state_str = ""
            try:
                toggle_pattern = checkbox.GetCurrentPattern(UIA.UIA_TogglePatternId)
                if toggle_pattern:
                    toggle_state = toggle_pattern.CurrentToggleState
                    # ToggleState: 0=Off, 1=On, 2=Indeterminate
                    if toggle_state == 1:
                        toggle_state_str = "on"
                    elif toggle_state == 0:
                        toggle_state_str = "off"
            except:
                pass
            
            # Try to get the native window handle and use IAccessible
            if WIN32_AVAILABLE:
                try:
                    # Get the element's window handle
                    native_window_handle = checkbox.CurrentNativeWindowHandle
                    if native_window_handle and native_window_handle != 0:
                        # Try to get IAccessible from window handle
                        self._set_accessible_name_iaccessible(native_window_handle, label)
                except:
                    pass
            
            # Also try to get child element handle if window handle not available
            try:
                # Get element's bounding rectangle and try to find child window
                rect = checkbox.CurrentBoundingRectangle
                center_x = int((rect.left + rect.right) / 2)
                center_y = int((rect.top + rect.bottom) / 2)
                
                # Try to get window from point
                if WIN32_AVAILABLE:
                    try:
                        hwnd = win32gui.WindowFromPoint((center_x, center_y))
                        if hwnd:
                            self._set_accessible_name_iaccessible(hwnd, label)
                    except:
                        pass
            except:
                pass
            
            # Log what screen reader should announce
            if toggle_state_str:
                announcement = f"{label}, {toggle_state_str}"
            else:
                announcement = f"{label}"
            
            print(f"[SCREEN READER] Attempting to set label: '{label}'")
            print(f"[SCREEN READER] Expected announcement: '{announcement}'")
            print(f"[SCREEN READER] Current name from UI Automation: '{current_name}'")
            return True
        except Exception as e:
            print(f"[WARNING] Could not set label for checkbox: {e}")
            return False
    
    def _set_accessible_name_iaccessible(self, hwnd: int, label: str) -> bool:
        """Try to set accessible name using IAccessible API.
        
        Note: This typically doesn't work for external application controls because
        accName is read-only. However, we attempt it in case the control supports it.
        
        For NVDA to read labels, the application (ZaloCall.exe) itself must provide
        proper accessible names. We cannot modify them from outside.
        """
        try:
            # Import oleacc for AccessibleObjectFromWindow
            try:
                oleacc = windll.oleacc
            except:
                # Not available, skip
                return False
            
            # Constants for AccessibleObjectFromWindow
            OBJID_CLIENT = 0xFFFFFFFC
            IID_IAccessible = "{618736e0-3c3d-11cf-810c-00aa00389b71}"
            
            # Get IAccessible interface using comtypes
            try:
                # Generate oleacc types if needed
                try:
                    GetModule("oleacc.dll")
                except:
                    pass
                
                from comtypes import GUID
                from comtypes import client as comclient
                
                iid_accessible = GUID(IID_IAccessible)
                
                # Get IAccessible from window
                try:
                    accessible = comclient.GetActiveObject("Accessibility.IAccessible", interface=hwnd)
                    # Try to set accName (this usually fails for external controls)
                    try:
                        accessible.put_accName(0, label)
                        print(f"[IAccessible] Successfully set accName to '{label}'")
                        return True
                    except:
                        pass
                except:
                    # Try direct AccessibleObjectFromWindow call
                    ptr = POINTER(c_long)()
                    result = oleacc.AccessibleObjectFromWindow(
                        HWND(hwnd),
                        DWORD(OBJID_CLIENT),
                        byref(iid_accessible),
                        byref(ptr)
                    )
                    if result == 0:  # S_OK
                        # Note: accName is read-only, so this likely won't work
                        print(f"[IAccessible] Retrieved interface (accName may be read-only)")
            except Exception as e:
                # IAccessible not available or failed
                pass
            
            # Since we can't modify external control names, log the attempt
            print(f"[NOTE] Cannot modify accessible name of external control.")
            print(f"[NOTE] NVDA will read whatever name ZaloCall.exe provides.")
            print(f"[NOTE] If NVDA reads nothing, ZaloCall.exe may not expose accessible names.")
            
            return False
        except Exception as e:
            # Silently fail - this is expected for external controls
            return False
    
    def _detect_call_type(self, checkboxes: List[UIA.IUIAutomationElement]) -> str:
        """Detect call type by checking camera button state, not by counting checkboxes.
        
        Audio calls: Camera button at index 1 is disabled
        Video calls: Camera button at index 2 is enabled
        """
        if not checkboxes or len(checkboxes) < 2:
            return "audio"  # Default to audio if unclear
        
        try:
            # Sort by position first
            sorted_checkboxes = sorted(checkboxes, key=lambda cb: (
                cb.CurrentBoundingRectangle.top,
                cb.CurrentBoundingRectangle.left
            ))
            
            # Log ALL buttons for debugging
            print(f"[DETECT] Analyzing {len(sorted_checkboxes)} button(s) for call type detection:")
            for i, cb in enumerate(sorted_checkboxes):
                try:
                    enabled = cb.CurrentIsEnabled
                    name = cb.CurrentName or "(no name)"
                    rect = cb.CurrentBoundingRectangle
                    has_toggle = False
                    try:
                        toggle_pattern = cb.GetCurrentPattern(UIA.UIA_TogglePatternId)
                        if toggle_pattern:
                            has_toggle = True
                    except:
                        pass
                    print(f"[DETECT]   Button {i}: enabled={enabled}, has_toggle={has_toggle}, name='{name}', pos=({rect.left}, {rect.top})")
                except Exception as e:
                    print(f"[DETECT]   Button {i}: Error reading properties: {e}")
            
            # PRIMARY METHOD: Check button count
            # Audio call has 3 buttons (Camera, End Call, Mic)
            # Video call has 4 or more buttons (Share Screen, Camera, End Call, Mic, etc.)
            if len(sorted_checkboxes) >= 4:
                print(f"[DETECT] Video call detected by count: {len(sorted_checkboxes)} buttons (expected >= 4)")
                return "video"
            else:
                print(f"[DETECT] Audio call detected by count: {len(sorted_checkboxes)} buttons (expected 3)")
                return "audio"
        except Exception as e:
            print(f"[DETECT] Error detecting call type: {e}")
            import traceback
            traceback.print_exc()
            return "audio"
    
    def focus_zalocall_window(self) -> bool:
        """Focus the ZaloCall window."""
        if not WIN32_AVAILABLE:
            return False
        
        try:
            if self.zalocall_window_handle:
                # Try using the stored handle
                try:
                    win32gui.ShowWindow(self.zalocall_window_handle, win32con.SW_RESTORE)
                    win32gui.SetForegroundWindow(self.zalocall_window_handle)
                    time.sleep(0.05)
                    return True
                except:
                    pass
            
            # Fallback: Find window by process
            hwnd = self._find_zalocall_window_handle()
            if hwnd:
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                win32gui.SetForegroundWindow(hwnd)
                self.zalocall_window_handle = hwnd
                time.sleep(0.05)
                return True
            return False
        except Exception as e:
            print(f"Error focusing ZaloCall window: {e}")
            return False
    
    def send_key_to_window(self, key: str) -> bool:
        """Send a keyboard key to the ZaloCall window."""
        if not WIN32_AVAILABLE or not self.zalocall_window_handle:
            return False
        
        try:
            # First, ensure window is focused
            self.focus_zalocall_window()
            time.sleep(0.1)
            
            # Map key names to virtual key codes
            vk_map = {
                'A': 0x41,
                'D': 0x44,
                'a': 0x41,
                'd': 0x44,
                'ENTER': 0x0D,
                'ESC': 0x1B,
            }
            
            # Convert key name to virtual key code
            if key.upper() in vk_map:
                vk_code = vk_map[key.upper()]
            else:
                # Try direct conversion
                vk_code = ord(key.upper()) if len(key) == 1 else 0
            
            if vk_code == 0:
                print(f"Unknown key: {key}")
                return False
            
            # Send key using SendMessage (more reliable for background windows)
            WM_KEYDOWN = 0x0100
            WM_KEYUP = 0x0101
            
            win32api.SendMessage(self.zalocall_window_handle, WM_KEYDOWN, vk_code, 0)
            time.sleep(0.05)
            win32api.SendMessage(self.zalocall_window_handle, WM_KEYUP, vk_code, 0)
            
            print(f"Sent key '{key}' to ZaloCall window")
            return True
        except Exception as e:
            print(f"Error sending key to window: {e}")
            return False
    
    def click_checkbox(self, checkbox: UIA.IUIAutomationElement):
        """Click a checkbox/button using physical mouse simulation with DPI awareness."""
        if not checkbox:
            return False

        if not WIN32_AVAILABLE:
            return False

        try:
            # Get checkbox position
            rect = self._get_el_rect(checkbox)
            if rect.left == 0 and rect.right == 0:
                try:
                    rect = checkbox.CurrentBoundingRectangle
                except Exception as live_rect_err:
                    print(f"[CLICK] Live CurrentBoundingRectangle fallback failed: {live_rect_err}")
                    return False
            x = int((rect.left + rect.right) / 2)
            y = int((rect.top + rect.bottom) / 2)
            
            print(f"[CLICK] Physical mouse click at position ({x}, {y})")
            
            # Save current cursor position
            current_pos = win32gui.GetCursorPos()
            
            # Move mouse to checkbox center
            win32api.SetCursorPos((x, y))
            time.sleep(0.003)  # short sleep for mouse settle

            # Short hold so Electron UI registers it without making hotkeys feel laggy.
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
            time.sleep(0.015)
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
            time.sleep(0.003)
            
            # Restore cursor position
            win32api.SetCursorPos(current_pos)
            return True
        except Exception as e:
            print(f"[ERROR] Mouse click failed: {e}")
            return False

    def accept_call(self):
        """Accept the incoming call using keyboard shortcut."""
        with self.call_lock:
            current_time = time.time()
            if self.last_action_type == "accept" and current_time - self.last_action_time < 0.35:
                return
            if self.action_in_progress:
                print("[SKIP] Another action is already in progress")
                return
            self.action_in_progress = True
            self.last_action_type = "accept"
            self.last_action_time = current_time
            self._set_active_call_checkboxes([])  # Clear active call buttons to avoid stale clicks
            
        try:
            print("[ACCEPT] Accepting call...")
            if not self._ensure_zalocall_live():
                print("[ACCEPT] No live ZaloCall.exe process found; skipping stale accept action")
                return

            deny_btn = accept_btn = no_cam_btn = None
            accept_point = None
            cached_accept_point = None
            with self.call_lock:
                deny_btn = self.current_incoming_deny_btn
                accept_btn = self.current_incoming_accept_btn
                no_cam_btn = self.current_incoming_no_cam_btn
                cached_accept_point = self._resolve_incoming_cached_point("accept", "accept")
                cached_incoming = list(self.current_checkboxes) if self.current_checkboxes else []
            if not (deny_btn and accept_btn) and cached_incoming:
                deny_btn = cached_incoming[0] if len(cached_incoming) >= 1 else None
                accept_btn = cached_incoming[1] if len(cached_incoming) >= 2 else None
                self._set_incoming_controls(deny_btn, accept_btn, no_cam_btn)
            if accept_btn:
                self._set_incoming_controls(deny_btn, accept_btn, no_cam_btn)
                accept_point = self._element_center_point(accept_btn) or cached_accept_point
            if deny_btn and accept_btn:
                print("[ACCEPT] Used cached incoming controls for instant accept")

            # Wait for buttons to load only if the monitor has not already cached them.
            if not (deny_btn and accept_btn):
                deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
                if accept_btn:
                    accept_point = self._element_center_point(accept_btn)
            if not accept_point:
                accept_point = cached_accept_point or self._resolve_incoming_cached_point("accept", "accept")
            if not ((deny_btn and accept_btn) or accept_point):
                print("[ACCEPT] Buttons not loaded yet. Waiting briefly...")
                for attempt in range(10):
                    time.sleep(0.03)
                    deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
                    accept_point = self._element_center_point(accept_btn) if accept_btn else None
                    if not accept_point:
                        accept_point = cached_accept_point or self._resolve_incoming_cached_point("accept", "accept")
                    if (deny_btn and accept_btn) or accept_point:
                        print(f"[ACCEPT] Buttons loaded on attempt {attempt + 1} ({(attempt+1)*100}ms)")
                        break
            
            # Determine call type
            is_video = (
                no_cam_btn is not None or
                self.call_type == "video"
            )
            self.call_type = "video" if is_video else "audio"
            
            if accept_btn or accept_point:
                print(f"[ACCEPT] Clicking Accept button... (is_video={is_video})")
                if not self.click_point(accept_point, "accept"):
                    self.click_checkbox(accept_btn)
                
                # State initialization
                self.camera_on = True if is_video else False
                self.microphone_on = True
                self.call_type = "video" if is_video else "audio"
                print(f"[ACCEPT] Initialized states: camera_on={self.camera_on}, microphone_on={self.microphone_on}, call_type={self.call_type}")
                
                vn_call_type = "thoại" if self.call_type == "audio" else "video"
                self.speak(f"Đã nhận cuộc gọi {vn_call_type}", language='vi')
                
                self.call_active = True
                self.incoming_call_detected = False
                
                # Update checkboxes in background thread
                def update_after_accept():
                    import pythoncom
                    pythoncom.CoInitialize()
                    try:
                        time.sleep(0.8)  # Wait for UI transition to complete
                        active_checkboxes = self.find_active_call_checkboxes()
                        if not active_checkboxes:
                            active_checkboxes = self.find_call_checkboxes()
                        if active_checkboxes and self.check_if_call_is_active(active_checkboxes):
                            with self.call_lock:
                                self._set_active_call_checkboxes(active_checkboxes)
                            self._sync_active_states_async()
                    except Exception as e:
                        print(f"[ERROR] update_after_accept failed: {e}")
                    finally:
                        pythoncom.CoUninitialize()
                threading.Thread(target=update_after_accept, daemon=True).start()
            else:
                # Fallback to generic find_call_checkboxes if buttons not found
                checkboxes = self.find_call_checkboxes()
                if checkboxes and len(checkboxes) >= 2:
                    print("[ACCEPT] Clicking Accept button (fallback checkbox 1)...")
                    self.focus_zalocall_window()
                    time.sleep(0.05)
                    self.click_checkbox(checkboxes[1])
                    self.camera_on = True if is_video else False
                    self.microphone_on = True
                    self.speak("Đã nhận cuộc gọi", language='vi')
                    self.call_active = True
                    self.incoming_call_detected = False
                elif checkboxes and len(checkboxes) == 1:
                    print("[ACCEPT] Clicking button (fallback checkbox 0)...")
                    self.focus_zalocall_window()
                    time.sleep(0.05)
                    self.click_checkbox(checkboxes[0])
                    self.camera_on = True if is_video else False
                    self.microphone_on = True
                    self.speak("Đã nhận cuộc gọi", language='vi')
                    self.call_active = True
                    self.incoming_call_detected = False
                else:
                    print("[ERROR] No checkboxes found to click")
        except Exception as e:
            print(f"[ERROR] Exception in accept_call: {e}")
        finally:
            with self.call_lock:
                self.action_in_progress = False
 
    def accept_call_without_camera(self):
        """Accept the incoming video call without turning on the camera."""
        with self.call_lock:
            current_time = time.time()
            if self.last_action_type == "accept_without_camera" and current_time - self.last_action_time < 0.35:
                return
            if self.action_in_progress:
                print("[SKIP] Another action is already in progress")
                return
            self.action_in_progress = True
            self.last_action_type = "accept_without_camera"
            self.last_action_time = current_time
            self._set_active_call_checkboxes([])  # Clear active call buttons to avoid stale clicks
            
        try:
            print("[ACCEPT WITHOUT CAMERA] Searching for 'Accept without camera' button...")
            if not self._ensure_zalocall_live():
                print("[ACCEPT WITHOUT CAMERA] No live ZaloCall.exe process found; skipping stale accept action")
                return

            no_cam_btn = None
            no_cam_point = None
            with self.call_lock:
                no_cam_btn = self.current_incoming_no_cam_btn
                no_cam_point = self._resolve_cached_point(self.current_incoming_no_cam_point, self.current_incoming_no_cam_rel, "accept without camera")

            if no_cam_point:
                print("[ACCEPT WITHOUT CAMERA] Using cached no-camera click point")
            elif no_cam_btn:
                print("[ACCEPT WITHOUT CAMERA] Using cached no-camera UIA button")
                self._set_incoming_controls(self.current_incoming_deny_btn, self.current_incoming_accept_btn, no_cam_btn)
                no_cam_point = self._element_center_point(no_cam_btn) or no_cam_point

            # First-call learn path: raw Button[1], no text, no checkbox mapping.
            if not (no_cam_btn or no_cam_point):
                no_cam_btn = self.find_incoming_no_cam_button_by_index()
                no_cam_point = self._element_center_point(no_cam_btn) if no_cam_btn else None
                if not no_cam_point:
                    no_cam_point = self._resolve_cached_point(self.current_incoming_no_cam_point, self.current_incoming_no_cam_rel, "accept without camera")
            if not (no_cam_btn or no_cam_point):
                no_cam_btn = self.find_incoming_no_cam_raw_control_by_index()
                no_cam_point = self._element_center_point(no_cam_btn) if no_cam_btn else None
                if not no_cam_point:
                    no_cam_point = self._resolve_cached_point(self.current_incoming_no_cam_point, self.current_incoming_no_cam_rel, "accept without camera")
            if not (no_cam_btn or no_cam_point):
                print("[ACCEPT WITHOUT CAMERA] Waiting briefly for no-camera raw control...")
                for attempt in range(5):
                    time.sleep(0.02)
                    no_cam_btn = self.find_incoming_no_cam_button_by_index()
                    no_cam_point = self._element_center_point(no_cam_btn) if no_cam_btn else None
                    if not no_cam_point:
                        no_cam_point = self._resolve_cached_point(self.current_incoming_no_cam_point, self.current_incoming_no_cam_rel, "accept without camera")
                    if not (no_cam_btn or no_cam_point):
                        no_cam_btn = self.find_incoming_no_cam_raw_control_by_index()
                        no_cam_point = self._element_center_point(no_cam_btn) if no_cam_btn else None
                        if not no_cam_point:
                            no_cam_point = self._resolve_cached_point(self.current_incoming_no_cam_point, self.current_incoming_no_cam_rel, "accept without camera")
                    if no_cam_btn or no_cam_point:
                        print(f"[ACCEPT WITHOUT CAMERA] No-camera control loaded on attempt {attempt + 1} ({(attempt+1)*20}ms)")
                        break
             
            if no_cam_btn or no_cam_point:
                print("[ACCEPT WITHOUT CAMERA] Clicking 'Accept without camera' button...")
                if not self.click_point(no_cam_point, "accept without camera"):
                    self.click_checkbox(no_cam_btn)
                
                # State initialization
                self.camera_on = False
                self.microphone_on = True
                self.call_type = "video"
                print(f"[ACCEPT WITHOUT CAMERA] Initialized states: camera_on={self.camera_on}, microphone_on={self.microphone_on}, call_type=video")
                
                self.speak("Đã nhận cuộc gọi video không bật camera", language='vi')
                
                self.call_active = True
                self.incoming_call_detected = False
                
                # Update checkboxes in background thread
                def update_after_accept():
                    import pythoncom
                    pythoncom.CoInitialize()
                    try:
                        time.sleep(0.8)  # Wait for UI transition to complete
                        active_checkboxes = self.find_active_call_checkboxes()
                        if not active_checkboxes:
                            active_checkboxes = self.find_call_checkboxes()
                        if active_checkboxes and self.check_if_call_is_active(active_checkboxes):
                            with self.call_lock:
                                self._set_active_call_checkboxes(active_checkboxes)
                                self.call_type = "video"
                            self._sync_active_states_async()
                    except Exception as e:
                        print(f"[ERROR] update_after_accept failed: {e}")
                    finally:
                        pythoncom.CoUninitialize()
                threading.Thread(target=update_after_accept, daemon=True).start()
            else:
                print("[ERROR] No raw Button[1] found for accept without camera")
                return
                print("[ACCEPT WITHOUT CAMERA] Button not found! Falling back to regular accept...")
                self.focus_zalocall_window()
                time.sleep(0.05)
                if accept_btn:
                    self.click_checkbox(accept_btn)
                    self.camera_on = False
                    self.microphone_on = True
                    self.call_type = "video"
                    print(f"[ACCEPT WITHOUT CAMERA] Fallback states: camera_on={self.camera_on}, microphone_on={self.microphone_on}")
                    self.speak("Đã nhận cuộc gọi", language='vi')
                    self.call_active = True
                    self.incoming_call_detected = False
                else:
                    # Fallback to checkboxes
                    checkboxes = self.find_call_checkboxes()
                    if checkboxes and len(checkboxes) >= 2:
                        self.click_checkbox(checkboxes[1])
                        self.camera_on = False
                        self.microphone_on = True
                        self.call_type = "video"
                        self.speak("Đã nhận cuộc gọi", language='vi')
                        self.call_active = True
                        self.incoming_call_detected = False
                    else:
                        print("[ERROR] No incoming call buttons found")
        except Exception as e:
            print(f"[ERROR] Exception in accept_call_without_camera: {e}")
        finally:
            with self.call_lock:
                self.action_in_progress = False

    def deny_call(self):
        """Deny the incoming call using keyboard shortcut."""
        with self.call_lock:
            current_time = time.time()
            if self.last_action_type == "deny" and current_time - self.last_action_time < 0.35:
                return
            if self.action_in_progress:
                print("[SKIP] Another action is already in progress")
                return
            self.action_in_progress = True
            self.last_action_type = "deny"
            self.last_action_time = current_time
            self.deny_suppress_active_until = current_time + 2.0
            
        try:
            print("[DENY] Denying call...")
            if not self._ensure_zalocall_live():
                print("[DENY] No live ZaloCall.exe process found; skipping stale deny action")
                return

            deny_btn = accept_btn = no_cam_btn = None
            deny_point = None
            cached_deny_point = None
            with self.call_lock:
                deny_btn = self.current_incoming_deny_btn
                accept_btn = self.current_incoming_accept_btn
                no_cam_btn = self.current_incoming_no_cam_btn
                cached_deny_point = self._resolve_incoming_cached_point("deny", "deny")
                cached_incoming = list(self.current_checkboxes) if self.current_checkboxes else []
            if not deny_btn and cached_incoming:
                deny_btn = cached_incoming[0] if len(cached_incoming) >= 1 else None
                accept_btn = cached_incoming[1] if len(cached_incoming) >= 2 else None
                self._set_incoming_controls(deny_btn, accept_btn, no_cam_btn)
            if deny_btn:
                self._set_incoming_controls(deny_btn, accept_btn, no_cam_btn)
                deny_point = self._element_center_point(deny_btn) or cached_deny_point
            if deny_btn:
                print("[DENY] Used cached incoming controls for instant deny")

            # Fresh scan only if the monitor has not cached the fixed-index controls yet.
            if not deny_btn:
                deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
                deny_point = self._element_center_point(deny_btn) if deny_btn else None
            if not deny_point:
                deny_point = cached_deny_point or self._resolve_incoming_cached_point("deny", "deny")
            if not (deny_btn or deny_point):
                print("[DENY] Buttons not loaded yet. Waiting briefly...")
                for attempt in range(10):
                    time.sleep(0.03)
                    deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
                    deny_point = self._element_center_point(deny_btn) if deny_btn else None
                    if not deny_point:
                        deny_point = cached_deny_point or self._resolve_incoming_cached_point("deny", "deny")
                    if deny_btn or deny_point:
                        print(f"[DENY] Buttons loaded on attempt {attempt + 1} ({(attempt+1)*100}ms)")
                        break
            
            if deny_btn or deny_point:
                print("[DENY] Clicking Deny button...")
                old_pid = self.zalocall_pid
                if not self.click_point(deny_point, "deny"):
                    self.click_checkbox(deny_btn)
                self._clear_speech_queue()
                self.speak("Đã từ chối cuộc gọi", language='vi')
                self._reset_call_state(reset_process=True, clear_actions=True, reason="deny clicked")
                self.start_ghost_window_reaper(old_pid)
            else:
                # Fallback to checkboxes
                checkboxes = self.find_call_checkboxes()
                if checkboxes and len(checkboxes) >= 1:
                    print("[DENY] Clicking Deny button (fallback checkbox 0)...")
                    self.focus_zalocall_window()
                    time.sleep(0.05)
                    old_pid = self.zalocall_pid
                    self.click_checkbox(checkboxes[0])
                    self._clear_speech_queue()
                    self.speak("Đã từ chối cuộc gọi", language='vi')
                    self._reset_call_state(reset_process=True, clear_actions=True, reason="deny fallback clicked")
                    self.start_ghost_window_reaper(old_pid)
                else:
                    print("[ERROR] No checkboxes found to click")
        except Exception as e:
            print(f"[ERROR] Exception in deny_call: {e}")
        finally:
            with self.call_lock:
                self.action_in_progress = False
    
    def toggle_camera(self):
        """Toggle camera on/off during active call."""
        with self.call_lock:
            current_time = time.time()
            if self.last_action_type == "camera" and current_time - self.last_action_time < 0.15:
                return
            if self.action_in_progress:
                return
            self.action_in_progress = True
            self.last_action_type = "camera"
            self.last_action_time = current_time
            
        try:
            if not self._ensure_zalocall_live():
                print("[CAMERA] No live ZaloCall.exe process found; skipping stale camera action")
                return
            with self.call_lock:
                camera_point = self._resolve_cached_point(self.active_camera_point, self.active_camera_rel, "camera")
            if self.click_point(camera_point, "camera"):
                self.camera_on = not self.camera_on
                self.last_camera_toggle_at = time.time()
                with self.call_lock:
                    self.call_type = "video"
                self._announce_media_state_async("camera")
                return

            # Use cached checkboxes first for instant response, fall back to fresh UIA scan
            with self.call_lock:
                all_checkboxes = list(self.active_call_checkboxes) if self.call_active and self.active_call_checkboxes else []
            
            if not all_checkboxes:
                all_checkboxes = self.find_active_call_checkboxes()
                if not all_checkboxes:
                    all_checkboxes = self.find_call_checkboxes()
            
            if not all_checkboxes:
                print("[CAMERA] Buttons not loaded yet. Waiting...")
                for attempt in range(10):
                    time.sleep(0.03)
                    all_checkboxes = self.find_active_call_checkboxes()
                    if not all_checkboxes:
                        all_checkboxes = self.find_call_checkboxes()
                    if all_checkboxes:
                        print(f"[CAMERA] Buttons loaded on attempt {attempt + 1}")
                        break
            
            if not all_checkboxes:
                print("[CAMERA] Timeout waiting for active buttons to load")
                return
            with self.call_lock:
                self._set_active_call_checkboxes(all_checkboxes)
            
            cam_btn = self.find_camera_checkbox(all_checkboxes)
            if cam_btn:
                self.click_checkbox(cam_btn)
                self.camera_on = not self.camera_on
                self.last_camera_toggle_at = time.time()
                with self.call_lock:
                    if self.call_type != "video":
                        self.call_type = "video"
                self._announce_media_state_async("camera")
        except Exception as e:
            print(f"[ERROR] Exception in toggle_camera: {e}")
        finally:
            with self.call_lock:
                self.action_in_progress = False

    def toggle_microphone(self):
        """Toggle microphone on/off during active call."""
        with self.call_lock:
            current_time = time.time()
            if self.last_action_type == "microphone" and current_time - self.last_action_time < 0.15:
                return
            if self.action_in_progress:
                return
            self.action_in_progress = True
            self.last_action_type = "microphone"
            self.last_action_time = current_time
            
        try:
            if not self._ensure_zalocall_live():
                print("[MICROPHONE] No live ZaloCall.exe process found; skipping stale microphone action")
                return
            with self.call_lock:
                microphone_point = self._resolve_cached_point(self.active_microphone_point, self.active_microphone_rel, "microphone")
            if self.click_point(microphone_point, "microphone"):
                self.microphone_on = not self.microphone_on
                self.last_microphone_toggle_at = time.time()
                self._announce_media_state_async("microphone")
                return

            # Use cached checkboxes first for instant response, fall back to fresh UIA scan
            with self.call_lock:
                all_checkboxes = list(self.active_call_checkboxes) if self.call_active and self.active_call_checkboxes else []
            
            if not all_checkboxes:
                all_checkboxes = self.find_active_call_checkboxes()
                if not all_checkboxes:
                    all_checkboxes = self.find_call_checkboxes()
            
            if not all_checkboxes:
                print("[MICROPHONE] Buttons not loaded yet. Waiting...")
                for attempt in range(10):
                    time.sleep(0.03)
                    all_checkboxes = self.find_active_call_checkboxes()
                    if not all_checkboxes:
                        all_checkboxes = self.find_call_checkboxes()
                    if all_checkboxes:
                        print(f"[MICROPHONE] Buttons loaded on attempt {attempt + 1}")
                        break
            
            if not all_checkboxes:
                print("[MICROPHONE] Timeout waiting for active buttons to load")
                return
            with self.call_lock:
                self._set_active_call_checkboxes(all_checkboxes)
            
            mic_btn = self.find_microphone_checkbox(all_checkboxes)
            if mic_btn:
                self.click_checkbox(mic_btn)
                self.microphone_on = not self.microphone_on
                self.last_microphone_toggle_at = time.time()
                self._announce_media_state_async("microphone")
        except Exception as e:
            print(f"[ERROR] Exception in toggle_microphone: {e}")
        finally:
            with self.call_lock:
                self.action_in_progress = False

    def kill_zalocall_process(self, pid: Optional[int] = None):
        """Forcefully terminate the ZaloCall.exe process."""
        target_pid = pid or self.zalocall_pid
        if not target_pid:
            return
        print(f"[PROCESS] Force terminating ZaloCall.exe (PID: {target_pid})...")
        try:
            if PSUTIL_AVAILABLE:
                import psutil
                try:
                    proc = psutil.Process(target_pid)
                    proc.kill()
                    print(f"[PROCESS] Terminated via psutil")
                except psutil.NoSuchProcess:
                    print(f"[PROCESS] Process already dead")
            else:
                subprocess.run(f"taskkill /F /PID {target_pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print(f"[PROCESS] Terminated via taskkill")
            if target_pid == self.zalocall_pid:
                self.zalocall_pid = None
            self.zalocall_window_handle = None
        except Exception as e:
            print(f"[PROCESS] Error terminating ZaloCall.exe: {e}")

    def start_ghost_window_reaper(self, pid: Optional[int] = None):
        """Start a background thread to check if ZaloCall.exe closed and terminate it if it hangs."""
        target_pid = pid or self.zalocall_pid
        def reaper_thread():
            time.sleep(1.5)  # Give it 1.5 seconds to close gracefully
            if self._is_pid_running(target_pid):
                print(f"[REAPER] ZaloCall.exe PID {target_pid} is still running after 1.5 seconds. Terminating ghost window...")
                self.kill_zalocall_process(target_pid)
                self._reset_call_state(clear_actions=True, reason="ghost process terminated")
                print("[REAPER] Reset call state after force terminating")
            else:
                print(f"[REAPER] ZaloCall.exe PID {target_pid} closed gracefully")
                self._clear_action_queue()

        thread = threading.Thread(target=reaper_thread, daemon=True)
        thread.start()
    
    def end_call(self):
        """End the active call."""
        with self.call_lock:
            current_time = time.time()
            if self.last_action_type == "end_call" and current_time - self.last_action_time < 0.35:
                return
            if self.action_in_progress:
                return
            self.action_in_progress = True
            self.last_action_type = "end_call"
            self.last_action_time = current_time
        
        try:
            if not self._ensure_zalocall_live():
                print("[END CALL] No live ZaloCall.exe process found; skipping stale end-call action")
                return
            with self.call_lock:
                end_point = self._resolve_cached_point(self.active_end_call_point, self.active_end_call_rel, "end call")
            if end_point:
                old_pid = self.zalocall_pid
                if self.click_point(end_point, "end call"):
                    self.speak("Đã gác máy", language='vi')
                    self._reset_call_state(reset_process=True, clear_actions=True, reason="end call clicked")
                    self.start_ghost_window_reaper(old_pid)
                    return

            # Use cached checkboxes first for instant response, fall back to fresh UIA scan
            with self.call_lock:
                all_checkboxes = list(self.active_call_checkboxes) if self.call_active and self.active_call_checkboxes else []
            
            if not all_checkboxes:
                all_checkboxes = self.find_active_call_checkboxes()
                if not all_checkboxes:
                    all_checkboxes = self.find_call_checkboxes()
            
            if not all_checkboxes:
                print("[END CALL] Buttons not loaded yet. Waiting...")
                for attempt in range(10):
                    time.sleep(0.03)
                    all_checkboxes = self.find_active_call_checkboxes()
                    if not all_checkboxes:
                        all_checkboxes = self.find_call_checkboxes()
                    if all_checkboxes:
                        print(f"[END CALL] Buttons loaded on attempt {attempt + 1}")
                        break
            
            if not all_checkboxes:
                print("[END CALL] Timeout waiting for active buttons to load")
                return
            with self.call_lock:
                self._set_active_call_checkboxes(all_checkboxes)
            
            end_btn = self.find_end_call_checkbox(all_checkboxes)
            if end_btn:
                old_pid = self.zalocall_pid
                self.click_checkbox(end_btn)
                self.speak("Đã gác máy", language='vi')
                self._reset_call_state(reset_process=True, clear_actions=True, reason="end call clicked")
                self.start_ghost_window_reaper(old_pid)
        except Exception as e:
            print(f"[ERROR] Exception in end_call: {e}")
        finally:
            with self.call_lock:
                self.action_in_progress = False
    
    def identify_clicked_checkbox(self, click_x: int, click_y: int) -> Optional[Tuple[int, UIA.IUIAutomationElement]]:
        """Identify which checkbox was clicked based on mouse position.
        
        Returns:
            Tuple of (index, checkbox) if found, None otherwise
        """
        all_checkboxes = self.current_checkboxes if self.incoming_call_detected else self.active_call_checkboxes
        if not all_checkboxes:
            all_checkboxes = self.find_call_checkboxes()
        
        for idx, cb in enumerate(all_checkboxes):
            try:
                rect = self._get_el_rect(cb)
                if (rect.left <= click_x <= rect.right and 
                    rect.top <= click_y <= rect.bottom):
                    name = self._get_el_name(cb)
                    automation_id = self._get_el_auto_id(cb)
                    print(f"\n{'='*60}")
                    print(f"[MOUSE CLICK DETECTED] You clicked on:")
                    print(f"  Checkbox Index: {idx}")
                    print(f"  Position: ({rect.left}, {rect.top}) to ({rect.right}, {rect.bottom})")
                    print(f"  Click Position: ({click_x}, {click_y})")
                    print(f"  Name: '{name}'")
                    print(f"  AutomationID: '{automation_id}'")
                    
                    name_lower = name.lower()
                    automation_id_lower = automation_id.lower()
                    
                    if self.incoming_call_detected:
                        if idx == 0:
                            print(f"  -> This is the DENY button (first checkbox)")
                        elif idx == 1:
                            print(f"  -> This is the ACCEPT button (second checkbox)")
                    elif self.call_active:
                        call_type = self.call_type or "audio"
                        print(f"  -> Call type: {call_type}")
                        
                        if call_type == "audio":
                            # Audio layout: Index 0 = Camera (disabled), Index 1 = End Call, Index 2 = Microphone
                            if idx == 0:
                                print(f"  -> This is the CAMERA button (disabled - index 0 - audio)")
                            elif idx == 1:
                                print(f"  -> This is the END CALL button (index 1 - audio)")
                            elif idx == 2:
                                print(f"  -> This is the MICROPHONE TOGGLE button (index 2 - audio)")
                            else:
                                print(f"  -> Unknown button at index {idx} (audio call)")
                        elif call_type == "video":
                            # Video layout: Index 0 = Share Screen, Index 1 = Camera, Index 2 = Microphone, Index 3 = End Call
                            if idx == 0:
                                print(f"  -> This is the SHARE SCREEN button (index 0 - video)")
                            elif idx == 1:
                                print(f"  -> This is the CAMERA TOGGLE button (index 1 - video)")
                            elif idx == 2:
                                print(f"  -> This is the MICROPHONE TOGGLE button (index 2 - video)")
                            elif idx == 3:
                                print(f"  -> This is the END CALL button (index 3 - video)")
                            else:
                                print(f"  -> Unknown button at index {idx} (video call)")
                        else:
                            if "camera" in name_lower or "video" in name_lower or "cam" in name_lower:
                                print(f"  -> This is likely the CAMERA toggle button (by name)")
                            elif "end" in name_lower or "hang" in name_lower or "close" in name_lower:
                                print(f"  -> This is likely the END CALL button (by name)")
                            else:
                                print(f"  -> During active call, this could be:")
                                print(f"     - Camera toggle (if index {idx})")
                                print(f"     - End call (if index {idx})")
                                print(f"     - Or another control button")
                    
                    print("=" * 60)
                    print()
                    
                    return (idx, cb)
            except:
                pass

    def on_mouse_click(self, event):
        """Callback for mouse click events to identify which button was clicked."""
        if not self.mouse_logging_enabled:
            return
        
        # Check if we're in a call state
        if not (self.incoming_call_detected or self.call_active):
            return
        
        # Rate limit to avoid spam
        current_time = time.time()
        if current_time - self.last_click_time < 0.5:
            return
        
        try:
            # Get click position
            click_x = event.x if hasattr(event, 'x') else event.x_screen
            click_y = event.y if hasattr(event, 'y') else event.y_screen
            
            # Get window position to convert to screen coordinates if needed
            if hasattr(event, 'x') and not hasattr(event, 'x_screen'):
                # Need to convert window coordinates to screen
                if self.zalocall_window_handle and WIN32_AVAILABLE:
                    try:
                        rect = win32gui.GetWindowRect(self.zalocall_window_handle)
                        click_x = rect[0] + event.x
                        click_y = rect[1] + event.y
                    except:
                        return
                else:
                    return
            
            self.last_click_time = current_time
            
            # Identify which checkbox was clicked
            self.identify_clicked_checkbox(click_x, click_y)
            
        except Exception as e:
            # Silent fail - don't spam errors
            pass
    
    def register_global_hotkeys(self):
        """Register hotkeys that should always remain active (e.g. manual update check)."""
        if not KEYBOARD_AVAILABLE:
            return
        try:
            try:
                keyboard.remove_hotkey("ctrl+shift+u")
            except:
                pass
            keyboard.add_hotkey("ctrl+shift+u", lambda: check_for_updates_manually(self))
            print("[OK] Global update hotkey registered.")
        except Exception as e:
            print(f"[ERROR] Failed to register global update hotkey: {e}")

    def register_hotkeys(self):
        """Register global keyboard hotkeys."""
        if not KEYBOARD_AVAILABLE:
            print("ERROR: 'keyboard' library not available. Cannot register hotkeys.")
            print("Please install: pip install keyboard")
            return False
        
        if getattr(self, 'hotkeys_registered', False):
            return True
        
        try:
            # Register hotkeys for incoming calls (enqueue to avoid COM STA thread marshaling issues)
            keyboard.add_hotkey(self.accept_hotkey, lambda: self._enqueue_action("accept"))
            keyboard.add_hotkey(self.accept_without_camera_hotkey, lambda: self._enqueue_action("accept_without_camera"))
            keyboard.add_hotkey("ctrl+shift+a", lambda: self._enqueue_action("accept_without_camera"))
            keyboard.add_hotkey(self.deny_hotkey, lambda: self._enqueue_action("deny"))
            
            # Register hotkeys for active calls
            keyboard.add_hotkey(self.camera_toggle_hotkey, lambda: self._enqueue_action("camera"))
            keyboard.add_hotkey(self.end_call_hotkey, lambda: self._enqueue_action("end_call"))
            keyboard.add_hotkey(self.microphone_toggle_hotkey, lambda: self._enqueue_action("microphone"))
            
            self.hotkeys_registered = True
            print("[OK] Hotkeys registered successfully.")
            return True
        except Exception as e:
            try:
                import traceback
                tb_str = traceback.format_exc()
                with open('C:/Projects/zablind/handler_hotkey_error.log', 'w', encoding='utf-8') as f:
                    f.write(f"Exception type: {type(e)}\nException: {str(e)}\nTraceback:\n{tb_str}\n")
            except Exception as log_err:
                pass
            print(f"ERROR: Failed to register hotkeys (logged to handler_hotkey_error.log): {e}")
            print("Note: Global hotkeys may require Administrator privileges on Windows.")
            print("Please try running as Administrator.")
            return False

    def unregister_hotkeys(self):
        """Unregister global keyboard hotkeys."""
        if not KEYBOARD_AVAILABLE:
            return
        if not getattr(self, 'hotkeys_registered', False):
            return
        try:
            keyboard.unhook_all_hotkeys()
            self.hotkeys_registered = False
            print("[OK] Hotkeys unregistered successfully.")
            # Re-register global hotkeys that should always remain active
            self.register_global_hotkeys()
        except Exception as e:
            print(f"[ERROR] Failed to unregister hotkeys: {e}")

    def monitor_calls(self):
        """Monitor for incoming calls and automatically focus window."""
        import pythoncom
        pythoncom.CoInitialize()
        try:
            self.monitoring = True
            last_checkbox_count = 0
            zero_button_count = 0  # Track consecutive cycles with 0 buttons
            ZERO_BUTTON_THRESHOLD = 3  # Require 3 consecutive cycles (1.5 seconds) before declaring call ended
            
            while self.monitoring:
                try:
                    # 1. Check if ZaloCall is running at all
                    was_running = (self.zalocall_pid is not None)
                    if was_running and not self.is_zalocall_running():
                        print("[MONITOR] Monitored ZaloCall.exe process has terminated - resetting all call states")
                        self._reset_call_state(reset_process=True, clear_actions=True, reason="monitored process terminated")

                    if not self.zalocall_pid:
                        self.find_zalocall_process()
                        if not self.zalocall_pid:
                            # Process is not running and we couldn't find a new one
                            time.sleep(0.05)
                            continue
                    
                    # Check if window exists
                    window_exists = False
                    if self.zalocall_window_handle:
                        if WIN32_AVAILABLE:
                            try:
                                window_exists = win32gui.IsWindow(self.zalocall_window_handle) and win32gui.IsWindowVisible(self.zalocall_window_handle)
                            except:
                                window_exists = False
                    
                    # Check for outgoing call type from file (instant detection for audio calls)
                    call_type_from_file = None
                    try:
                        if os.path.exists(self.outgoing_call_type_file):
                            with open(self.outgoing_call_type_file, 'r', encoding='utf-8') as f:
                                data = json.load(f)
                                call_type_from_file = data.get('callType')
                                file_timestamp = data.get('timestamp', 0)
                                # Only use if file was written recently (within last 10 seconds)
                                if call_type_from_file and (time.time() * 1000 - file_timestamp) < 10000:
                                    print(f"[FILE] [OK][OK][OK] Read call type from file: {call_type_from_file}")
                                    # Delete file after reading to avoid reuse
                                    try:
                                        os.remove(self.outgoing_call_type_file)
                                        print(f"[FILE] Deleted file after reading")
                                    except:
                                        pass
                                else:
                                    # File too old, ignore it
                                    call_type_from_file = None
                    except Exception as e:
                        print(f"[FILE] Error reading file: {e}")
                        call_type_from_file = None
                    
                    # Find checkboxes - if call is already active, call find_active_call_checkboxes directly
                    # Optimize: if window was previously detected but is no longer valid/visible, treat as 0 buttons
                    # Skip UIA query during the immediate 0.2s transition after accepting to let active UI render.
                    is_transitioning = (
                        self.call_active and 
                        self.last_action_type in ["accept", "accept_without_camera"] and 
                        time.time() - self.last_action_time < 0.2
                    )
                    
                    if (self.zalocall_window_handle and not window_exists) or is_transitioning:
                        checkboxes = []
                        current_count = 0
                    else:
                        query_uia = True
                        if self.call_active and self.active_call_checkboxes and window_exists:
                            # Only query UIA once every 15 cycles (1.5 seconds) to avoid CPU usage and COM thread blocking,
                            # EXCEPT during transition period (5 seconds after accept action) when we need high responsiveness
                            in_transition = (self.last_action_type in ["accept", "accept_without_camera"] and time.time() - self.last_action_time < 5.0)
                            if getattr(self, '_active_query_counter', 0) % 15 != 0 and not in_transition:
                                query_uia = False
                            self._active_query_counter = getattr(self, '_active_query_counter', 0) + 1
                        
                        if query_uia:
                            if self.call_active:
                                checkboxes = self.find_active_call_checkboxes()
                                # Verify these checkboxes are indeed active call checkboxes and not transition incoming ones
                                if checkboxes and not self.check_if_call_is_active(checkboxes):
                                    print("[MONITOR] Active call checkboxes failed active validation (detected incoming/transition state). Treating as empty.")
                                    checkboxes = []
                                current_count = len(checkboxes)
                            else:
                                checkboxes = self.find_call_checkboxes()
                                current_count = len(checkboxes)
                                # If we have 2+ buttons, it could be an active call - use filtered checkboxes to remove extra UI elements
                                if current_count >= 2:
                                    filtered_checkboxes = self.find_active_call_checkboxes()
                                    if filtered_checkboxes:
                                        if len(filtered_checkboxes) >= 2:
                                            # Filtered version found correct count - use it
                                            checkboxes = filtered_checkboxes
                                            current_count = len(checkboxes)
                                            print(f"[FILTER] Using filtered checkboxes: {current_count} buttons")
                                        else:
                                            print(f"[FILTER] Filtered checkboxes count ({len(filtered_checkboxes)}) less than 2, keeping original ({current_count})")
                        else:
                            # Use cached checkboxes
                            checkboxes = self.active_call_checkboxes
                            current_count = len(checkboxes)
                    
                    # Track consecutive cycles with 0 buttons
                    if current_count == 0:
                        zero_button_count += 1
                    else:
                        zero_button_count = 0  # Reset counter if buttons found
                    
                    # Detect incoming call by searching for text patterns (most reliable method).
                    is_new_incoming_call = False
                    detected_call_type = "audio"
                    detected_caller_name = None
                    
                    # Detect transition from 0 buttons to new buttons (call just appeared)
                    # ONLY run if a call is not already active to avoid transition glitches
                    if current_count > 0 and last_checkbox_count == 0 and not self.call_active:
                        deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
                        if deny_btn and accept_btn:
                            self.incoming_check_cycles = 0  # No need for text elements wait buffer!
                            is_new_incoming_call = True
                            detected_call_type = "video" if no_cam_btn else "audio"
                            detected_caller_name = None
                            print(f"[MONITOR] Instant incoming call detected by indices! Type: {detected_call_type}")
                        else:
                            self.incoming_check_cycles = 2
                            print(f"[MONITOR] Call appeared. Starting incoming call detection buffer (2 cycles)...")
                    
                    # Scan during the buffer period on every cycle until call is active or detected
                    if self.incoming_check_cycles > 0 and not self.incoming_call_detected and not self.call_active:
                        deny_btn, accept_btn, no_cam_btn = self.find_incoming_call_buttons()
                        if deny_btn and accept_btn:
                            is_new_incoming_call = True
                            self.incoming_check_cycles = 0  # Stop buffer immediately
                            detected_call_type = "video" if no_cam_btn else "audio"
                            detected_caller_name = None
                            print(f"[MONITOR] Incoming call confirmed by indices! Type: {detected_call_type}")
                        elif self.incoming_check_cycles == 1:
                            # Fallback: buffer period about to end, confirm generic incoming call
                            # If we have 4+ buttons, check if they are likely active call buttons (e.g. mic, end) to avoid false fallback
                            has_active_call_buttons = False
                            if current_count >= 4:
                                # Look for end call, mic, or camera toggle in names
                                for cb in checkboxes:
                                    try:
                                        name = (self._get_el_name(cb) or "").lower()
                                        auto_id = (self._get_el_auto_id(cb) or "").lower()
                                        combined = f"{name} {auto_id}"
                                        if any(kw in combined for kw in ["camera", "video", "cam", "mic", "micro", "kết thúc", "end", "hang"]):
                                            has_active_call_buttons = True
                                            break
                                    except:
                                        pass
                            
                            if has_active_call_buttons:
                                self.incoming_check_cycles = 0  # Stop buffer
                                print(f"[MONITOR] Buffer ended, active call detected by button signatures, skipping incoming fallback")
                            else:
                                is_new_incoming_call = True
                                detected_call_type = self.call_type
                                detected_caller_name = None
                                self.incoming_check_cycles = 0  # Stop buffer
                                print(f"[MONITOR] Incoming call confirmed via fallback! Type: {detected_call_type}")
                    
                    if self.incoming_check_cycles > 0:
                        self.incoming_check_cycles -= 1
                    
                    # CRITICAL: Never treat active call buttons as incoming
                    if self.check_if_call_is_active(checkboxes):
                        is_new_incoming_call = False

                    suppress_active_after_deny = (
                        self.last_action_type == "deny" and
                        time.time() < self.deny_suppress_active_until
                    )
                    
                    is_new_call = is_new_incoming_call
                    
                    if is_new_call:
                        # NEW CALL DETECTED
                        self.register_hotkeys()
                        print(f"\n{'='*60}")
                        print(f"[INCOMING CALL] Detected {current_count} button(s)")
                        print("=" * 60)
                        print()
                        
                        call_type = detected_call_type
                        caller_name = detected_caller_name or self.caller_name
                        
                        with self.call_lock:
                            self.incoming_call_detected = True
                            self.call_active = False  # Not active yet, just incoming
                            self.call_type = call_type  # Set call type from popup detection
                            self.caller_name = caller_name
                            print(f"[STATE] Set call_type = {call_type} from popup detection")
                            self.current_checkboxes = checkboxes
                            self._set_active_call_checkboxes([])  # Clear active call buttons
                        self._remember_incoming_details(caller_name, call_type)

                        # Announce/focus/log outside the state lock so hotkeys can fire immediately.
                        self._announce_incoming_buttons_ready(call_type)
                        if caller_name:
                            self.announce_incoming_call(caller_name, call_type)
                        else:
                            self._resolve_caller_name_async(call_type)
                        if call_type == "video":
                            self._precache_no_cam_async()
                        if self.focus_zalocall_window():
                            print("[AUTO-FOCUS] ZaloCall window focused")
                        else:
                            print("[WARNING] Could not focus ZaloCall window")

                        print()
                        print(f"Press {self.accept_hotkey.upper()} to ACCEPT or {self.deny_hotkey.upper()} to DENY")
                        if call_type == "video":
                            print(f"Press CTRL+A or CTRL+SHIFT+A to ACCEPT WITHOUT CAMERA (video calls only)")
                        print()
                        for i, cb in enumerate(checkboxes):
                            try:
                                rect = self._get_el_rect(cb)
                                action = "Deny" if i == 0 else ("Accept" if i == 1 else f"Button {i}")
                                print(f"  {action} button (index {i}) at ({rect.left}, {rect.top})")
                            except Exception as e:
                                print(f"  Button {i}: Error reading position: {e}")
                        print()
                    
                    # Check for active call state (after accepting, different checkboxes appear)
                    # Also detect if user manually clicked accept button (buttons exist but call_active not set)
                    # OR if buttons exist but no flags set (consecutive calls or manual clicks)
                    # OR if this is an outgoing call (user initiated from zablind)
                    # Active call detected (outgoing or already accepted incoming)
                    elif current_count >= 2 and not is_new_incoming_call and not suppress_active_after_deny and (self.call_active or self.check_if_call_is_active(checkboxes) or (not self.incoming_call_detected and self.incoming_check_cycles == 0)):
                        # ACTIVE CALL: outgoing or manually accepted incoming
                        self.register_hotkeys()
                        # Layout: 2 buttons = audio (mic, ^), 4 buttons = video (cam, ^, mic, ^)
                        with self.call_lock:
                            was_incoming_call = self.incoming_call_detected
                            
                            if not self.call_active:
                                print("[ACTIVE CALL] Detected active call from button count (outgoing or manual accept)")
                                self.call_active = True
                                self.incoming_call_detected = False
                                pending_name, pending_type = self._get_pending_incoming_details()
                                if pending_name and not self.caller_name:
                                    self.caller_name = pending_name
                                
                                # Initialize camera state
                                is_video = (call_type_from_file == "video" or pending_type == "video" or current_count >= 4 or self.call_type == "video")
                                if is_video:
                                    self.call_type = "video"
                                    if self.last_action_type == "accept_without_camera":
                                        self.camera_on = False
                                    else:
                                        self.camera_on = True
                                else:
                                    self.camera_on = False
                                self.microphone_on = True
                                vn_call_type = "thoại" if self.call_type == "audio" else "video"
                                if self.caller_name:
                                    announcement = f"Đã kết nối cuộc gọi {vn_call_type} với {self.caller_name}"
                                else:
                                    announcement = f"Đã kết nối cuộc gọi {vn_call_type}"
                                self.speak(announcement, language='vi')
                                
                                # Keep hotkey latency low: do not read slow Electron state here.
                                print(f"[ACTIVE CALL] Initial states: camera_on={self.camera_on}, microphone_on={self.microphone_on}")
                                if is_video and self.caller_name and not self.pending_video_incoming_announced:
                                    self.pending_video_incoming_announced = True
                                    self.announce_incoming_call(self.caller_name, "video")
                                

                            
                            # Detect or update call_type dynamically ONLY if it is not already set (keep existing call_type)
                            old_call_type = self.call_type
                            if call_type_from_file:
                                self.call_type = call_type_from_file
                            elif current_count >= 5 and self.call_type != "video":
                                self.call_type = "video"
                                print(f"[MONITOR] Corrected call_type to video based on active button count: {current_count}")
                            elif not self.call_type:
                                # Determine if it is a video call based on count of active buttons (>= 5 is video, since audio is <= 4)
                                if current_count >= 5:
                                    self.call_type = "video"
                                else:
                                    self.call_type = "audio"
                                print(f"[MONITOR] Dynamically set initial call_type to {self.call_type} based on button count: {current_count}")
                            
                            # Transition from audio to video (e.g. UIA loaded buttons after delay)
                            if old_call_type != "video" and self.call_type == "video":
                                print(f"[ACTIVE CALL] Transitioned/corrected call type: {old_call_type} -> {self.call_type}")
                                pending_name, _ = self._get_pending_incoming_details()
                                if pending_name and not self.caller_name:
                                    self.caller_name = pending_name
                                if self.caller_name and not self.pending_video_incoming_announced:
                                    self.pending_video_incoming_announced = True
                                    self.announce_incoming_call(self.caller_name, "video")
                                # If accepted without camera, keep camera off. Otherwise, set camera on.
                                if self.last_action_type != "accept_without_camera":
                                    self.camera_on = True
                                    print("[ACTIVE CALL] Initialized camera_on = True (regular accept)")
                            
                            # Update active call checkboxes
                            if len(self.active_call_checkboxes) != current_count:
                                self._set_active_call_checkboxes(checkboxes)
                                self._sync_active_states_async()
                                print(f"[ACTIVE CALL] Updated checkboxes: {current_count} buttons | call_type={self.call_type}")
                                for i, cb in enumerate(checkboxes):
                                    try:
                                        rect = self._get_el_rect(cb)
                                        print(f"  Button {i}: at ({rect.left}, {rect.top})")
                                    except:
                                        pass
                    
                    # Call ended (checkboxes disappeared for multiple consecutive cycles)
                    # Require ZERO_BUTTON_THRESHOLD consecutive cycles to avoid false positives
                    elif current_count == 0 and zero_button_count >= ZERO_BUTTON_THRESHOLD and (last_checkbox_count > 0 or self.call_active or self.incoming_call_detected):
                        # Grace period: do not reset call state if an action (accept/accept_without_camera) was performed very recently
                        # (e.g. within the last 5.0 seconds) to allow ZaloCall window transition
                        if self.last_action_type in ["accept", "accept_without_camera"] and time.time() - self.last_action_time < 5.0:
                            # Skip reset, keep waiting for active call window to load
                            pass
                        else:
                            print(f"[CALL END] Call ended or handled (confirmed after {zero_button_count} cycles) - resetting all state")
                            self._reset_call_state(reset_process=True, clear_actions=True, reason="call ended")
                            print("[STATE] All call state reset - ready for next call")
                            zero_button_count = 0  # Reset counter after state reset
                    # If buttons reappear after we thought call ended, re-detect as active call
                    elif current_count > 0 and not self.call_active and not self.incoming_call_detected and zero_button_count > 0:
                        print(f"[RECOVERY] Buttons reappeared after {zero_button_count} cycles - re-detecting call")
                        zero_button_count = 0  # Reset counter
                        # This will be handled by the active call detection logic below
                    
                    last_checkbox_count = current_count
                    
                    # Keep the button cache hot for low-latency hotkeys.
                    time.sleep(0.03)
                    
                except Exception as e:
                    print(f"[ERROR] Error in monitoring loop: {e}")
                    import traceback
                    traceback.print_exc()
                    # Reset state on error ONLY if no buttons found
                    # Don't reset if buttons exist - might be a temporary error
                    with self.call_lock:
                        if not checkboxes or len(checkboxes) == 0:
                            # No buttons found, reset state
                            if self.incoming_call_detected or self.call_active:
                                print("[STATE] Resetting state due to error (no buttons found)")
                                self._reset_call_state(clear_actions=True, reason="monitor error with no buttons")
                    time.sleep(1)
        finally:
            pythoncom.CoUninitialize()
    
    def monitor_mouse_clicks(self):
        """Monitor mouse clicks on ZaloCall window to identify buttons."""
        if not WIN32_AVAILABLE:
            return
        
        last_click_pos = None
        last_click_time = 0
        
        print("[MOUSE LOG] Mouse click monitoring active - click buttons to identify them")
        print()
        
        while self.monitoring:
            try:
                # Check if we're in a call state
                if not (self.incoming_call_detected or self.call_active):
                    time.sleep(0.5)
                    continue
                
                # Get current mouse state
                if win32api.GetAsyncKeyState(win32con.VK_LBUTTON) & 0x8000:
                    # Left button is down - check if it's a new click
                    current_time = time.time()
                    current_pos = win32gui.GetCursorPos()
                    
                    # Detect new click (button just pressed, not held)
                    if (current_pos != last_click_pos or 
                        current_time - last_click_time > 0.3):
                        
                        # Wait for button release
                        time.sleep(0.05)
                        
                        # Check if window is ZaloCall
                        if self.zalocall_window_handle:
                            try:
                                point_window = win32gui.WindowFromPoint(current_pos)
                                if point_window == self.zalocall_window_handle:
                                    # Click is on ZaloCall window
                                    click_x, click_y = current_pos
                                    
                                    # Small delay to ensure click completed
                                    time.sleep(0.1)
                                    
                                    # Identify which checkbox was clicked
                                    self.identify_clicked_checkbox(click_x, click_y)
                                    
                                    last_click_pos = current_pos
                                    last_click_time = current_time
                            except:
                                pass
                
                time.sleep(0.1)  # Check every 100ms
                
            except Exception as e:
                # Silent fail
                time.sleep(0.5)
    
    
    def stop(self):
        """Stop monitoring."""
        self.monitoring = False
        self.mouse_logging_enabled = False
        if KEYBOARD_AVAILABLE:
            try:
                keyboard.unhook_all_hotkeys()
            except:
                pass


# ==============================================================================
# ZABLIND AUTO-PATCHER, UPDATER, AND WATCHDOG IMPLEMENTATION
# ==============================================================================

import struct
import shutil
import urllib.request
import urllib.error
import zipfile

def stream_patch_asar(orig_asar, new_asar, files_to_patch, files_to_add, unpack_extensions=('.node', '.dll', '.exe')):
    """
    Native in-place streaming ASAR patcher.
    Streams unchanged files from original ASAR and injects modified/new files.
    Copies unpacked files to .unpacked directory.
    """
    orig_unpacked = orig_asar + ".unpacked"
    new_unpacked = new_asar + ".unpacked"
    
    if os.path.exists(new_unpacked):
        try: shutil.rmtree(new_unpacked)
        except: pass
    os.makedirs(new_unpacked, exist_ok=True)
    
    with open(orig_asar, 'rb') as f_in:
        f_in.read(8)
        u2, json_size = struct.unpack('<II', f_in.read(8))
        header = json.loads(f_in.read(json_size).decode('utf-8'))
        
        orig_header_size = (json_size + 8 + 3) & ~3
        orig_base_offset = 8 + orig_header_size
        
        file_actions = [] # list of (rel_path, action_type, action_arg, node_reference)
        
        # Make a copy of files_to_add because we will delete items from it
        files_to_add_remaining = dict(files_to_add)
        
        def process_node(node, current_path):
            if 'files' in node:
                for name, child in list(node['files'].items()):
                    process_node(child, os.path.join(current_path, name) if current_path else name)
            else:
                rel_path = current_path.replace('\\', '/')
                if rel_path in files_to_patch:
                    patched_content = files_to_patch[rel_path]
                    node['size'] = len(patched_content)
                    if 'integrity' in node:
                        del node['integrity']
                    file_actions.append((rel_path, 'patched', patched_content, node))
                elif rel_path in files_to_add_remaining:
                    content_or_path = files_to_add_remaining[rel_path]
                    is_unpacked = any(rel_path.lower().endswith(ext) for ext in unpack_extensions)
                    if 'integrity' in node:
                        del node['integrity']
                    if is_unpacked:
                        node['unpacked'] = True
                        node['size'] = os.path.getsize(content_or_path)
                        file_actions.append((rel_path, 'added_unpacked', content_or_path, node))
                    else:
                        node['size'] = len(content_or_path)
                        file_actions.append((rel_path, 'patched', content_or_path, node))
                    del files_to_add_remaining[rel_path]
                elif node.get('unpacked'):
                    file_actions.append((rel_path, 'original_unpacked', None, node))
                else:
                    file_actions.append((rel_path, 'original', (int(node['offset']), node['size']), node))
                    
        process_node(header, '')
        
        def add_file_to_header(tree, rel_path, content_or_path, is_unpacked):
            parts = rel_path.split('/')
            curr = tree
            for part in parts[:-1]:
                if 'files' not in curr:
                    curr['files'] = {}
                if part not in curr['files']:
                    curr['files'][part] = {'files': {}}
                curr = curr['files'][part]
            
            file_name = parts[-1]
            if 'files' not in curr:
                curr['files'] = {}
                
            node = {}
            if is_unpacked:
                node['unpacked'] = True
                node['size'] = os.path.getsize(content_or_path)
                file_actions.append((rel_path, 'added_unpacked', content_or_path, node))
            else:
                node['size'] = len(content_or_path)
                file_actions.append((rel_path, 'added', content_or_path, node))
                
            curr['files'][file_name] = node
            
        for rel_path, content in files_to_add_remaining.items():
            is_unpacked = any(rel_path.lower().endswith(ext) for ext in unpack_extensions)
            add_file_to_header(header, rel_path, content, is_unpacked)
            
        new_payload = bytearray()
        
        for rel_path, action, arg, node in file_actions:
            if action == 'original_unpacked':
                src = os.path.join(orig_unpacked, rel_path)
                dst = os.path.join(new_unpacked, rel_path)
                if os.path.exists(src):
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    shutil.copy2(src, dst)
            elif action == 'added_unpacked':
                src = arg
                dst = os.path.join(new_unpacked, rel_path)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)
            elif action == 'original':
                offset, size = arg
                f_in.seek(orig_base_offset + offset)
                data = f_in.read(size)
                new_offset = len(new_payload)
                new_payload.extend(data)
                node['offset'] = str(new_offset)
            elif action == 'patched':
                data = arg
                new_offset = len(new_payload)
                new_payload.extend(data)
                node['offset'] = str(new_offset)
            elif action == 'added':
                data = arg
                new_offset = len(new_payload)
                new_payload.extend(data)
                node['offset'] = str(new_offset)
                
        json_bytes = json.dumps(header, separators=(',', ':')).encode('utf-8')
        json_size = len(json_bytes)
        padding_size = (4 - (json_size % 4)) % 4
        json_bytes += b'\x00' * padding_size
        header_size = json_size + padding_size + 8
        
        with open(new_asar, 'wb') as f_out:
            f_out.write(struct.pack('<I', 4))
            f_out.write(struct.pack('<I', header_size))
            f_out.write(struct.pack('<I', header_size - 4))
            f_out.write(struct.pack('<I', json_size))
            f_out.write(json_bytes)
            f_out.write(new_payload)
            
    print(f"[PATCHER] Patched ASAR created successfully at: {new_asar}")


def read_file_from_asar(asar_path, target_rel_path):
    try:
        with open(asar_path, 'rb') as f:
            f.read(8)
            u2, json_size = struct.unpack('<II', f.read(8))
            header = json.loads(f.read(json_size).decode('utf-8'))
            
            header_size = (json_size + 8 + 3) & ~3
            base_offset = 8 + header_size
            
            parts = target_rel_path.replace('\\', '/').split('/')
            node = header
            for part in parts:
                if 'files' in node and part in node['files']:
                    node = node['files'][part]
                else:
                    return None
                    
            if 'offset' in node and 'size' in node:
                offset = int(node['offset'])
                size = node['size']
                f.seek(base_offset + offset)
                return f.read(size)
    except:
        pass
    return None


def backup_original_asar(resources_dir):
    active_asar = os.path.join(resources_dir, "app.asar")
    backup_asar = os.path.join(resources_dir, "app.asar.bak")
    active_unpacked = os.path.join(resources_dir, "app.asar.unpacked")
    backup_unpacked = os.path.join(resources_dir, "app.asar.bak.unpacked")
    
    if not os.path.exists(backup_asar) and os.path.exists(active_asar):
        print(f"[PATCHER] Backing up app.asar to app.asar.bak")
        shutil.copy2(active_asar, backup_asar)
        
    if not os.path.exists(backup_unpacked) and os.path.exists(active_unpacked):
        print(f"[PATCHER] Backing up app.asar.unpacked to app.asar.bak.unpacked")
        try: shutil.copytree(active_unpacked, backup_unpacked)
        except Exception as e: print(f"[PATCHER] Error backing up unpacked: {e}")


def kill_zalo_processes():
    print("[PATCHER] Killing all Zalo processes...")
    zalo_names = ["zalo.exe", "zaloexecutable.exe", "zalocall.exe"]
    killed_any = False
    if PSUTIL_AVAILABLE:
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                if proc.info['name'] and proc.info['name'].lower() in zalo_names:
                    proc.kill()
                    killed_any = True
            except:
                pass
    else:
        for name in zalo_names:
            try:
                subprocess.run(f'taskkill /F /IM {name}', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                killed_any = True
            except:
                pass
    if killed_any:
        time.sleep(1.5)


def find_zablind_assets():
    exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    possible_dirs = [
        exe_dir,
        os.path.join(exe_dir, ".."),
        "c:/Projects/zablind",
    ]
    
    for base in possible_dirs:
        zablind_dir = os.path.join(base, "zablind")
        preload = os.path.join(base, "preload-wrapper.js")
        popup = os.path.join(base, "popup-viewer.html")
        if os.path.isdir(zablind_dir) and os.path.exists(preload) and os.path.exists(popup):
            return base
            
    for base in possible_dirs:
        zablind_dir = os.path.join(base, "zablind_main", "zablind")
        preload = os.path.join(base, "zablind_main", "preload-wrapper.js")
        popup = os.path.join(base, "extracted", "pc-dist", "popup-viewer.html")
        if os.path.isdir(zablind_dir) and os.path.exists(preload) and os.path.exists(popup):
            return {
                'zablind': zablind_dir,
                'preload-wrapper.js': preload,
                'popup-viewer.html': popup
            }
    return None


def collect_zablind_assets(asset_source):
    files_to_add = {}
    if isinstance(asset_source, dict):
        zablind_dir = asset_source['zablind']
        preload_path = asset_source['preload-wrapper.js']
        popup_path = asset_source['popup-viewer.html']
    else:
        zablind_dir = os.path.join(asset_source, 'zablind')
        preload_path = os.path.join(asset_source, 'preload-wrapper.js')
        popup_path = os.path.join(asset_source, 'popup-viewer.html')
        
    with open(preload_path, 'rb') as f:
        files_to_add['main-dist/preload-wrapper.js'] = f.read()
    with open(popup_path, 'rb') as f:
        files_to_add['pc-dist/popup-viewer.html'] = f.read()
        
    for root, dirs, files in os.walk(zablind_dir):
        for file in files:
            full_path = os.path.join(root, file)
            rel = os.path.relpath(full_path, zablind_dir).replace('\\', '/')
            with open(full_path, 'rb') as f:
                files_to_add[f'main-dist/zablind/{rel}'] = f.read()
                
    files_to_add['main-dist/zablind/bin/ZablindCallHandler.exe'] = sys.executable
    return files_to_add


def get_local_version(assets_source):
    try:
        if isinstance(assets_source, dict):
            config_path = os.path.join(assets_source['zablind'], 'config.js')
        else:
            config_path = os.path.join(assets_source, 'zablind', 'config.js')
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                content = f.read()
            match = re.search(r"version:\s*['\"]([^'\"]+)['\"]", content)
            if match:
                return match.group(1)
    except Exception as e:
        print(f"[UPDATER] Error reading local version: {e}")
    return "2.0"


def get_latest_github_release():
    url = "https://api.github.com/repos/oceanondawave/zablind/releases/latest"
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZablindUpdater'}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            tag_name = data.get('tag_name', '')
            assets = data.get('assets', [])
            zip_url = None
            for asset in assets:
                if asset.get('name', '').endswith('.zip'):
                    zip_url = asset.get('browser_download_url')
                    break
            if not zip_url:
                zip_url = data.get('zipball_url')
            return tag_name, zip_url
    except Exception as e:
        print(f"[UPDATER] Error checking GitHub releases: {e}")
    return None, None


def is_new_version(local_v, remote_v):
    local_clean = re.sub(r'^[vV]', '', local_v).strip()
    remote_clean = re.sub(r'^[vV]', '', remote_v).strip()
    
    local_parts = [int(x) for x in re.findall(r'\d+', local_clean)]
    remote_parts = [int(x) for x in re.findall(r'\d+', remote_clean)]
    
    max_len = max(len(local_parts), len(remote_parts))
    local_parts += [0] * (max_len - len(local_parts))
    remote_parts += [0] * (max_len - len(remote_parts))
    
    return remote_parts > local_parts


def perform_self_update(zip_url, handler):
    exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    zip_path = os.path.join(tempfile.gettempdir(), "zablind_update.zip")
    
    try:
        handler.speak("Zablind đang tải bản cập nhật mới...", language="vi", clear_pending=True)
        print(f"[UPDATER] Downloading update from {zip_url}")
        
        req = urllib.request.Request(
            zip_url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZablindUpdater'}
        )
        with urllib.request.urlopen(req, timeout=30) as response, open(zip_path, 'wb') as out_file:
            out_file.write(response.read())
            
        print("[UPDATER] Download complete. Preparing files...")
        
        extract_temp = os.path.join(tempfile.gettempdir(), "zablind_extract")
        if os.path.exists(extract_temp):
            shutil.rmtree(extract_temp)
        os.makedirs(extract_temp)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_temp)
            
        items = os.listdir(extract_temp)
        source_dir = extract_temp
        if len(items) == 1 and os.path.isdir(os.path.join(extract_temp, items[0])):
            source_dir = os.path.join(extract_temp, items[0])
            
        # Check if the update contains ZablindCallHandler.exe
        has_binary = os.path.exists(os.path.join(source_dir, "ZablindCallHandler.exe")) or \
                     os.path.exists(os.path.join(source_dir, "ZablindCallHandler_x86.exe"))
                     
        if has_binary:
            print("[UPDATER] Detected binary update. Renaming running executable...")
            current_exe = os.path.abspath(sys.executable)
            old_exe = current_exe + ".old"
            if os.path.exists(old_exe):
                try: os.remove(old_exe)
                except: pass
                
            os.rename(current_exe, old_exe)
            print(f"[UPDATER] Renamed running exe to {old_exe}")
            
            print(f"[UPDATER] Copying all files from {source_dir} to {exe_dir}")
            for item in os.listdir(source_dir):
                src = os.path.join(source_dir, item)
                dst = os.path.join(exe_dir, item)
                if os.path.isdir(src):
                    if os.path.exists(dst):
                        try: shutil.rmtree(dst)
                        except: pass
                    try: shutil.copytree(src, dst)
                    except: pass
                else:
                    if os.path.exists(dst):
                        try: os.remove(dst)
                        except: pass
                    try: shutil.copy2(src, dst)
                    except: pass
            
            handler.speak("Cập nhật hoàn tất. Đang khởi động lại dịch vụ.", language="vi")
            print("[UPDATER] Update complete! Launching new executable...")
            subprocess.Popen([current_exe] + sys.argv[1:], cwd=exe_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, env=get_clean_env(), close_fds=True)
        else:
            print("[UPDATER] No binary found in update. Performing JS/Resource-only update...")
            
            if os.path.exists(os.path.join(source_dir, "zablind_main")):
                js_base = os.path.join(source_dir, "zablind_main")
            else:
                js_base = source_dir
                
            preload_src = os.path.join(js_base, "preload-wrapper.js")
            popup_src = os.path.join(js_base, "html", "popup-viewer.html")
            if not os.path.exists(popup_src):
                popup_src = os.path.join(js_base, "popup-viewer.html")
            zablind_src = os.path.join(js_base, "zablind")
            
            preload_dst = os.path.join(exe_dir, "preload-wrapper.js")
            popup_dst = os.path.join(exe_dir, "popup-viewer.html")
            zablind_dst = os.path.join(exe_dir, "zablind")
            
            if os.path.exists(preload_src):
                print(f"[UPDATER] Copying {preload_src} to {preload_dst}")
                try:
                    if os.path.exists(preload_dst):
                        os.remove(preload_dst)
                    shutil.copy2(preload_src, preload_dst)
                except Exception as e:
                    print(f"[UPDATER] Failed to copy preload-wrapper.js: {e}")
                    
            if os.path.exists(popup_src):
                print(f"[UPDATER] Copying {popup_src} to {popup_dst}")
                try:
                    if os.path.exists(popup_dst):
                        os.remove(popup_dst)
                    shutil.copy2(popup_src, popup_dst)
                except Exception as e:
                    print(f"[UPDATER] Failed to copy popup-viewer.html: {e}")
                    
            if os.path.exists(zablind_src):
                print(f"[UPDATER] Copying {zablind_src} to {zablind_dst}")
                try:
                    if os.path.exists(zablind_dst):
                        shutil.rmtree(zablind_dst)
                    shutil.copytree(zablind_src, zablind_dst)
                except Exception as e:
                    print(f"[UPDATER] Failed to copy zablind folder: {e}")
                    
            call_src = os.path.join(source_dir, "zablind_call")
            if os.path.exists(call_src):
                call_dst = os.path.join(exe_dir, "..", "zablind_call")
                if os.path.exists(os.path.dirname(call_dst)):
                    print(f"[UPDATER] Copying {call_src} to {call_dst}")
                    try:
                        for root, _, files in os.walk(call_src):
                            for file in files:
                                src_f = os.path.join(root, file)
                                rel_f = os.path.relpath(src_f, call_src)
                                dst_f = os.path.join(call_dst, rel_f)
                                os.makedirs(os.path.dirname(dst_f), exist_ok=True)
                                if os.path.exists(dst_f):
                                    os.remove(dst_f)
                                shutil.copy2(src_f, dst_f)
                    except Exception as e:
                        print(f"[UPDATER] Failed to copy zablind_call: {e}")
                        
            handler.speak("Cập nhật hoàn tất. Đang khởi động lại dịch vụ.", language="vi")
            print("[UPDATER] Update complete! Restarting executable...")
            current_exe = os.path.abspath(sys.executable)
            subprocess.Popen([current_exe] + sys.argv[1:], cwd=exe_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, env=get_clean_env(), close_fds=True)
            
        try: os.remove(zip_path)
        except: pass
        
        handler.stop()
        sys.exit(0)
        
    except Exception as update_err:
        print(f"[UPDATER] Self-update failed: {update_err}")
        traceback.print_exc()
        handler.speak("Cập nhật Zablind thất bại. Vui lòng thử lại sau.", language="vi")
        try:
            current_exe = os.path.abspath(sys.executable)
            old_exe = current_exe + ".old"
            if os.path.exists(old_exe) and not os.path.exists(current_exe):
                os.rename(old_exe, current_exe)
        except:
            pass


def cleanup_old_executable():
    exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    old_exe = os.path.join(exe_dir, "ZablindCallHandler.exe.old")
    old_exe_x86 = os.path.join(exe_dir, "ZablindCallHandler_x86.exe.old")
    for f in [old_exe, old_exe_x86]:
        if os.path.exists(f):
            try:
                os.remove(f)
                print(f"[UPDATER] Cleaned up old executable: {f}")
            except Exception as e:
                print(f"[UPDATER] Could not delete old executable {f}: {e}")


def register_startup():
    try:
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        try:
            winreg.DeleteValue(key, "ZablindCallHandler")
            print("[STARTUP] Cleaned up legacy startup registry key.")
        except FileNotFoundError:
            pass
        winreg.CloseKey(key)
    except Exception as e:
        print(f"[STARTUP] Error cleaning up startup key: {e}")


def run_zalo_patch(handler=None, is_patch_once=False):
    global PATCHING_IN_PROGRESS
    try:
        local_appdata = os.environ.get('LOCALAPPDATA')
        if not local_appdata:
            local_appdata = os.path.join(os.environ.get('USERPROFILE', ''), 'AppData', 'Local')
        zalo_dir = os.path.join(local_appdata, 'Programs', 'Zalo')
        if os.path.isdir(zalo_dir):
            subdirs = [d for d in os.listdir(zalo_dir) if d.startswith('Zalo-') and os.path.isdir(os.path.join(zalo_dir, d))]
            
            def version_key(version_str):
                v = version_str.replace('Zalo-', '')
                return [int(x) for x in re.findall(r'\d+', v)]
                
            if subdirs:
                subdirs.sort(key=version_key)
                latest_version_dir_name = subdirs[-1]
                latest_version_dir = os.path.join(zalo_dir, latest_version_dir_name)
                
                # 1. Clean up old version folders
                for old_dir_name in subdirs[:-1]:
                    old_dir = os.path.join(zalo_dir, old_dir_name)
                    print(f"[PATCHER] Cleaning up old Zalo directory: {old_dir}")
                    try:
                        shutil.rmtree(old_dir)
                    except Exception as cleanup_err:
                        print(f"[PATCHER] Failed to delete old Zalo directory {old_dir}: {cleanup_err}")
                        
                # 2. Check if latest folder is patched
                resources_dir = os.path.join(latest_version_dir, "resources")
                active_asar = os.path.join(resources_dir, "app.asar")
                backup_asar = os.path.join(resources_dir, "app.asar.bak")
                
                assets_source = find_zablind_assets()
                should_patch = False
                
                if os.path.exists(active_asar):
                    if not os.path.exists(backup_asar):
                        should_patch = True
                    elif assets_source:
                        # Already patched. Check version to see if we need to update/re-patch.
                        local_v = get_local_version(assets_source)
                        patched_config = read_file_from_asar(active_asar, "main-dist/zablind/config.js")
                        patched_v = None
                        if patched_config:
                            try:
                                content = patched_config.decode('utf-8', errors='ignore')
                                match = re.search(r"version:\s*['\"]([^'\"]+)['\"]", content)
                                if match:
                                    patched_v = match.group(1)
                            except Exception as e:
                                print(f"[PATCHER] Error reading patched config version: {e}")
                                
                        if not patched_v or patched_v != local_v:
                            print(f"[PATCHER] Detected version mismatch. Patched version: {patched_v}, Local version: {local_v}. Re-patching Zalo...")
                            should_patch = True
                            
                            # Restore clean backup before patching
                            try:
                                PATCHING_IN_PROGRESS = True
                                kill_zalo_processes()
                                if os.path.exists(backup_asar):
                                    if os.path.exists(active_asar):
                                        os.remove(active_asar)
                                    shutil.copy2(backup_asar, active_asar)
                                    
                                backup_unpacked = backup_asar + ".unpacked"
                                active_unpacked = active_asar + ".unpacked"
                                if os.path.exists(backup_unpacked):
                                    if os.path.exists(active_unpacked):
                                        shutil.rmtree(active_unpacked)
                                    shutil.copytree(backup_unpacked, active_unpacked)
                            except Exception as restore_err:
                                print(f"[PATCHER] Restore backup failed: {restore_err}")
                                
                if should_patch and assets_source:
                    PATCHING_IN_PROGRESS = True
                    if handler:
                        handler.speak("Zablind đang nâng cấp và vá Zalo. Vui lòng chờ trong giây lát.", language="vi", clear_pending=True)
                    kill_zalo_processes()
                    backup_original_asar(resources_dir)
                    
                    files_to_add = collect_zablind_assets(assets_source)
                    files_to_patch = {}
                    
                    original_main_js = read_file_from_asar(backup_asar, "main-dist/main.js")
                    if original_main_js:
                        main_js_str = original_main_js.decode('utf-8', errors='ignore')
                        if "preload-render.js" in main_js_str:
                            main_js_str = main_js_str.replace("preload-render.js", "preload-wrapper.js")
                        files_to_patch["main-dist/main.js"] = main_js_str.encode('utf-8')
                        
                    original_bootstrap = read_file_from_asar(backup_asar, "bootstrap.js")
                    if original_bootstrap:
                        bootstrap_str = original_bootstrap.decode('utf-8', errors='ignore')
                        if "zablind/modules/call-service.js" not in bootstrap_str:
                            patch_block = """function bootstrap() {
  try {
    require('./main-dist/zablind/modules/call-service.js');
  } catch (e) {
    console.error('Failed to load Zablind Call Service in main process:', e);
  }"""
                            bootstrap_str = bootstrap_str.replace("function bootstrap() {", patch_block, 1)
                        files_to_patch["bootstrap.js"] = bootstrap_str.encode('utf-8')
                        
                    temp_asar = os.path.join(tempfile.gettempdir(), "app.asar.patched")
                    if os.path.exists(temp_asar):
                        try: os.remove(temp_asar)
                        except: pass
                        
                    print(f"[PATCHER] Patching app.asar...")
                    stream_patch_asar(backup_asar, temp_asar, files_to_patch, files_to_add)
                    
                    active_unpacked = active_asar + ".unpacked"
                    if os.path.exists(active_asar):
                        os.remove(active_asar)
                    if os.path.exists(active_unpacked):
                        shutil.rmtree(active_unpacked)
                        
                    shutil.copy2(temp_asar, active_asar)
                    shutil.copytree(temp_asar + ".unpacked", active_unpacked)
                    
                    try:
                        os.remove(temp_asar)
                        shutil.rmtree(temp_asar + ".unpacked")
                    except:
                        pass
                        
                    if handler:
                        handler.speak("Đã vá Zalo thành công. Đang khởi động lại Zalo.", language="vi")
                        
                    root_dir = os.path.dirname(latest_version_dir)
                    root_zalo = os.path.join(root_dir, "Zalo.exe")
                    zalo_exe = os.path.join(latest_version_dir, "Zalo.exe")
                    if os.path.exists(root_zalo):
                        print(f"[PATCHER] Restarting Zalo via root launcher: {root_zalo}")
                        subprocess.Popen(root_zalo, cwd=root_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, env=get_clean_env(), close_fds=True)
                    elif os.path.exists(zalo_exe):
                        print(f"[PATCHER] Restarting Zalo via version-specific exe: {zalo_exe}")
                        subprocess.Popen(zalo_exe, cwd=latest_version_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, env=get_clean_env(), close_fds=True)
                    PATCHING_IN_PROGRESS = False
                    return True
                elif not should_patch:
                    print("[PATCHER] Zalo is already patched and up to date.")
                    # Restart Zalo as part of installation/reinstallation to ensure it starts cleanly
                    if is_patch_once:
                        PATCHING_IN_PROGRESS = True
                        kill_zalo_processes()
                        root_dir = os.path.dirname(latest_version_dir)
                        root_zalo = os.path.join(root_dir, "Zalo.exe")
                        zalo_exe = os.path.join(latest_version_dir, "Zalo.exe")
                        if os.path.exists(root_zalo):
                            print(f"[PATCHER] Restarting Zalo via root launcher: {root_zalo}")
                            subprocess.Popen(root_zalo, cwd=root_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, env=get_clean_env(), close_fds=True)
                        elif os.path.exists(zalo_exe):
                            print(f"[PATCHER] Restarting Zalo via version-specific exe: {zalo_exe}")
                            subprocess.Popen(zalo_exe, cwd=latest_version_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, env=get_clean_env(), close_fds=True)
                        PATCHING_IN_PROGRESS = False
                    return True
                else:
                    print("[PATCHER] Zablind assets not found! Cannot patch Zalo.")
                    return False
    except Exception as e:
        PATCHING_IN_PROGRESS = False
        print(f"[PATCHER] Error in run_zalo_patch: {e}")
        traceback.print_exc()
        return False

def start_zalo_patcher_thread(handler):
    def patcher_loop():
        time.sleep(2.0)
        while True:
            try:
                run_zalo_patch(handler, is_patch_once=False)
            except Exception as e:
                print(f"[PATCHER] Error in patcher loop: {e}")
            time.sleep(10.0)
            
    threading.Thread(target=patcher_loop, daemon=True).start()


def start_updater_thread(handler):
    def updater_job():
        time.sleep(5.0)
        while True:
            try:
                assets_source = find_zablind_assets()
                if not assets_source:
                    print("[UPDATER] Zablind assets not found, skipping update check.")
                else:
                    local_v = get_local_version(assets_source)
                    print(f"[UPDATER] Checking for updates. Local version: {local_v}")
                    remote_tag, zip_url = get_latest_github_release()
                    if remote_tag and zip_url:
                        print(f"[UPDATER] Latest remote version: {remote_tag}")
                        if is_new_version(local_v, remote_tag):
                            print(f"[UPDATER] New version available! Local: {local_v}, Remote: {remote_tag}")
                            perform_self_update(zip_url, handler)
                            break
                        else:
                            print("[UPDATER] Zablind is up to date.")
                    else:
                        print("[UPDATER] Could not fetch latest release info.")
            except Exception as err:
                print(f"[UPDATER] Error in update check: {err}")
            
            # Check again in 6 hours
            time.sleep(6 * 3600)
            
    threading.Thread(target=updater_job, daemon=True).start()


def check_for_updates_manually(handler):
    def job():
        handler.speak("Đang kiểm tra cập nhật Zablind...", language="vi", clear_pending=True)
        try:
            assets_source = find_zablind_assets()
            if not assets_source:
                handler.speak("Không tìm thấy các tệp tin Zablind trên máy tính này.", language="vi")
                return
            local_v = get_local_version(assets_source)
            print(f"[UPDATER] Manual check. Local version: {local_v}")
            remote_tag, zip_url = get_latest_github_release()
            if remote_tag and zip_url:
                print(f"[UPDATER] Latest remote version: {remote_tag}")
                if is_new_version(local_v, remote_tag):
                    handler.speak(f"Có phiên bản mới {remote_tag}. Bắt đầu cập nhật.", language="vi")
                    perform_self_update(zip_url, handler)
                else:
                    handler.speak("Zablind đã được cập nhật phiên bản mới nhất.", language="vi")
            else:
                handler.speak("Không thể kết nối tới máy chủ cập nhật.", language="vi")
        except Exception as e:
            print(f"[UPDATER] Manual update check error: {e}")
            handler.speak("Lỗi khi kiểm tra cập nhật.", language="vi")
            
    threading.Thread(target=job, daemon=True).start()


def start_watchdog_thread(handler):
    def watchdog_loop():
        zalo_was_running = False
        zalo_exe_name = "zalo.exe"
        temp_dir = get_system_temp_dir()
        heartbeat_file = os.path.join(temp_dir, "zablind_heartbeat.json")
        crash_log_file = "C:/Projects/zablind/zablind_crash.log"
        
        if not os.path.exists(os.path.dirname(crash_log_file)):
            crash_log_file = os.path.join(os.path.dirname(os.path.abspath(sys.executable)), "zablind_crash.log")
            
        print(f"[WATCHDOG] Started. Monitoring Zalo processes. Heartbeat path: {heartbeat_file}")
        
        while True:
            try:
                zalo_is_running = False
                zalo_pids = []
                if PSUTIL_AVAILABLE:
                    for proc in psutil.process_iter(['pid', 'name']):
                        try:
                            if proc.info['name'] and proc.info['name'].lower() == zalo_exe_name:
                                zalo_is_running = True
                                zalo_pids.append(proc.info['pid'])
                        except:
                            pass
                else:
                    try:
                        output = subprocess.check_output('tasklist /FI "IMAGENAME eq zalo.exe" /FO CSV /NH', shell=True).decode('utf-8', errors='ignore')
                        zalo_is_running = "zalo.exe" in output.lower()
                    except:
                        pass
                
                if zalo_is_running and not zalo_was_running:
                    print(f"[WATCHDOG] Zalo process start detected. Starting handshake verification...")
                    if os.path.exists(heartbeat_file):
                        try: os.remove(heartbeat_file)
                        except: pass
                        
                    handshake_success = False
                    start_time = time.time()
                    error_details = None
                    
                    while time.time() - start_time < 12.0:
                        if os.path.exists(heartbeat_file):
                            try:
                                with open(heartbeat_file, 'r', encoding='utf-8') as f:
                                    data = json.load(f)
                                if data.get('status') == 'ok':
                                    handshake_success = True
                                    print("[WATCHDOG] Handshake successful! Zablind loaded correctly inside Zalo.")
                                    break
                                elif data.get('status') == 'error':
                                    error_details = data
                                    print("[WATCHDOG] Handshake reports initialization error!")
                                    break
                            except:
                                pass
                        time.sleep(0.5)
                    if not handshake_success:
                        print("[WATCHDOG] Handshake failed or timed out!")
                        handler.speak("Cảnh báo. Zablind không tương thích với phiên bản Zalo này. Đã lưu nhật ký lỗi.", language="vi", clear_pending=True)
                        try:
                            zalo_version = "Unknown"
                            local_appdata = os.environ.get('LOCALAPPDATA')
                            if local_appdata:
                                zalo_dir = os.path.join(local_appdata, 'Programs', 'Zalo')
                                if os.path.exists(zalo_dir):
                                    subdirs = [d for d in os.listdir(zalo_dir) if d.startswith('Zalo-')]
                                    if subdirs:
                                        subdirs.sort()
                                        zalo_version = subdirs[-1]
                                        
                            report = []
                            report.append("="*60)
                            report.append(f"ZABLIND CRASH REPORT - {time.strftime('%Y-%m-%d %H:%M:%S')}")
                            report.append("="*60)
                            report.append(f"Zalo Version: {zalo_version}")
                            
                            assets_source = find_zablind_assets()
                            local_v = get_local_version(assets_source) if assets_source else "Unknown"
                            report.append(f"Zablind Version: {local_v}")
                            
                            if error_details:
                                report.append(f"Status: {error_details.get('status')}")
                                report.append(f"Error Message: {error_details.get('error')}")
                                report.append(f"Stack Trace:\n{error_details.get('stack')}")
                            else:
                                report.append("Status: Timeout (No heartbeat file generated or loading hung)")
                                report.append("Error Message: Zablind injection failed to load or DOMContentLoaded not fired.")
                            report.append("\n")
                            
                            with open(crash_log_file, "a", encoding="utf-8") as lf:
                                lf.write("\n".join(report))
                            print(f"[WATCHDOG] Crash report written to {crash_log_file}")
                        except Exception as crash_err:
                            print(f"[WATCHDOG] Failed to write crash log: {crash_err}")
                
                zalo_was_running = zalo_is_running
            except Exception as e:
                print(f"[WATCHDOG] Error in watchdog loop: {e}")
            time.sleep(2.0)
            
    threading.Thread(target=watchdog_loop, daemon=True).start()


def should_show_console():
    try:
        assets_source = find_zablind_assets()
        if assets_source:
            if isinstance(assets_source, dict):
                config_path = os.path.join(assets_source['zablind'], 'config.js')
            else:
                config_path = os.path.join(assets_source, 'zablind', 'config.js')
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                match = re.search(r"showCallHandlerConsole:\s*(true|false)", content)
                if match:
                    return match.group(1) == "true"
    except:
        pass
    return False


def main():
    """Main entry point."""
    if not should_show_console():
        try:
            import ctypes
            import win32gui
            import win32con
            hwnd = ctypes.windll.kernel32.GetConsoleWindow()
            if hwnd:
                win32gui.ShowWindow(hwnd, win32con.SW_HIDE)
        except:
            pass

    # Set Process DPI Awareness to avoid coordinate scaling issues with SetCursorPos
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(2) # PROCESS_PER_MONITOR_DPI_AWARE
        print("[INIT] Set Process DPI Awareness (Per Monitor DPI Aware)")
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
            print("[INIT] Set Process DPI Awareness (DPI Aware)")
        except Exception as dpi_err:
            print(f"[INIT] Could not set DPI awareness: {dpi_err}")
            
    # CRITICAL: Verify no tkinter/popup code is imported
    import sys
    import subprocess
    
    if "patch-once" in sys.argv:
        print("[PATCH-ONCE] Running Zalo patch once synchronously...")
        try:
            success = run_zalo_patch(is_patch_once=True)
            if success:
                print("[PATCH-ONCE] Patch applied successfully.")
                sys.exit(0)
            else:
                print("[PATCH-ONCE] Patching failed or not needed.")
                sys.exit(1)
        except Exception as patch_err:
            print(f"[PATCH-ONCE] Fatal error during patch: {patch_err}")
            sys.exit(1)
            
    # Named mutex for single-instance check (skip for patch-once utility)
    import ctypes
    mutex_name = "Local\\ZablindCallHandlerMutex"
    global _call_handler_mutex
    try:
        _call_handler_mutex = ctypes.windll.kernel32.CreateMutexW(None, True, mutex_name)
        last_error = ctypes.windll.kernel32.GetLastError()
        if last_error == 183: # ERROR_ALREADY_EXISTS
            print("Another instance of Zablind Call Handler is already running. Exiting.")
            sys.exit(0)
    except Exception as mutex_err:
        print(f"[MUTEX] Error checking single instance: {mutex_err}")

    parent_pid = None
    if len(sys.argv) > 1:
        try:
            parent_pid = int(sys.argv[1])
        except ValueError:
            pass
    import platform
    
    print("=" * 60)
    print("  Zablind Call Handler - Keyboard Shortcuts")
    print("=" * 60)
    print()
    print(f"Platform: {platform.system()} {platform.machine()}")
    print(f"Python: {sys.version.split()[0]} ({platform.architecture()[0]})")
    print()
    
    # Check if running on Windows
    if platform.system() != "Windows":
        print(f"ERROR: This script is Windows-only. Detected platform: {platform.system()}")
        print("This script requires Windows to access Windows UI Automation APIs.")
        print()
        input("Press Enter to exit...")
        sys.exit(1)
    
    if 'tkinter' in sys.modules or 'tk' in sys.modules:
        print("ERROR: tkinter detected in imports. This should not happen!")
        print("Please restart Python to clear any cached modules.")
        sys.exit(1)
    
    print("VERIFIED: This version has NO popup/tkinter code.")
    print()
    
    # Check dependencies
    if not KEYBOARD_AVAILABLE:
        print("ERROR: 'keyboard' library is required.")
        print("Please install it with: pip install keyboard")
        print()
        input("Press Enter to exit...")
        sys.exit(1)
    
    if not WIN32_AVAILABLE:
        print("ERROR: pywin32 is required.")
        print("Please install it with: pip install pywin32")
        print()
        input("Press Enter to exit...")
        sys.exit(1)
    
    handler = ZaloCallHandler()
    
    # Initialize background helper services
    cleanup_old_executable()
    register_startup()
    start_watchdog_thread(handler)
    start_updater_thread(handler)
    start_zalo_patcher_thread(handler)
    
    # Initialize UI Automation (required even if process not found yet)
    if not handler.initialize_automation():
        print("ERROR: Failed to initialize UI Automation.")
        print()
        input("Press Enter to exit...")
        sys.exit(1)
    
    # Using button count detection only (4 = audio, 5 = video)
    print("Call type detection: Using button count (4 = audio, 5 = video)")
    print()
    
    # Register hotkeys dynamically (skipped at startup to avoid screen reader issues when idle)
    # Hotkeys will be registered as soon as a call (incoming or active) is detected.
    handler.register_global_hotkeys()
    
    # Try to find ZaloCall process (but don't exit if not found - it only runs during calls)
    print("Looking for ZaloCall.exe process...")
    if handler.find_zalocall_process():
        print(f"[OK] ZaloCall.exe found (PID: {handler.zalocall_pid})")
    else:
        print("[INFO] ZaloCall.exe not currently running.")
        print("  (This is normal - ZaloCall.exe only runs when there's an incoming/active call)")
        print("  The application will monitor and automatically detect it when a call comes in.")
    
    print()
    print("=" * 60)
    print("Monitoring started. Waiting for incoming calls...")
    print("=" * 60)
    print()
    print("IMPORTANT: This version uses KEYBOARD SHORTCUTS only.")
    print("           NO popup windows will appear.")
    print()
    print("When an incoming call is detected:")
    print("  1. ZaloCall window will be automatically focused")
    print("  2. Use keyboard shortcuts:")
    print(f"     - {handler.accept_hotkey.upper()} to ACCEPT call")
    print(f"     - {handler.accept_without_camera_hotkey.upper()} to ACCEPT WITHOUT CAMERA (video calls only)")
    print(f"     - {handler.deny_hotkey.upper()} to DENY call")
    print()
    print("During active call:")
    print(f"  - {handler.camera_toggle_hotkey.upper()} to TOGGLE camera")
    print(f"  - {handler.microphone_toggle_hotkey.upper()} to TOGGLE microphone")
    print(f"  - {handler.end_call_hotkey.upper()} to END call")
    print()
    print("Press Ctrl+C to stop...")
    print()
    
    try:
        # Start monitoring in a separate thread
        monitor_thread = threading.Thread(target=handler.monitor_calls, daemon=True)
        monitor_thread.start()
        
        # Keep main thread alive
        zalo_exe_name = "zalo.exe"
        while True:
            time.sleep(1)
            zalo_exists = False
            try:
                if PSUTIL_AVAILABLE:
                    for proc in psutil.process_iter(['name']):
                        try:
                            if proc.info['name'] and proc.info['name'].lower() == zalo_exe_name:
                                zalo_exists = True
                                break
                        except:
                            pass
                else:
                    output = subprocess.check_output('tasklist /FI "IMAGENAME eq zalo.exe" /FO CSV /NH', shell=True).decode('utf-8', errors='ignore')
                    zalo_exists = "zalo.exe" in output.lower()
            except Exception as e:
                print(f"[WATCHDOG] Error checking zalo status: {e}")
                # Fallback to parent_exists if parent_pid is available, otherwise assume Zalo exists to avoid false-positive exit
                if parent_pid:
                    try:
                        if PSUTIL_AVAILABLE:
                            zalo_exists = psutil.pid_exists(parent_pid)
                        else:
                            output = subprocess.check_output(f'tasklist /FI "PID eq {parent_pid}" /FO CSV /NH', shell=True).decode('utf-8', errors='ignore')
                            zalo_exists = str(parent_pid) in output
                    except:
                        zalo_exists = False
                else:
                    zalo_exists = True
                
            if not zalo_exists and not PATCHING_IN_PROGRESS:
                print("No Zalo process is running. Stopping Call Handler...")
                handler.stop()
                sys.exit(0)
    except KeyboardInterrupt:
        print("\n\nStopping...")
        handler.stop()
        print("Stopped.")
        sys.exit(0)
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        handler.stop()
        print("\nPress Enter to exit...")
        try:
            input()
        except:
            pass
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        print("\nPress Enter to exit...")
        try:
            input()
        except:
            pass
        sys.exit(1)
