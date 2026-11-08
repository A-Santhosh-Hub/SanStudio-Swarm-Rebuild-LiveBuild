"""SanStudio LiveBuild desktop app. Drop an HTML file; get it back with the LiveBuild intro."""
from __future__ import annotations

import ctypes
import os
import queue
import subprocess
import sys
import tkinter as tk
import traceback
import webbrowser
from ctypes import wintypes
from pathlib import Path
from tkinter import filedialog, font as tkfont, messagebox

import injector

APP_NAME = "SanStudio LiveBuild"
CREDIT_TEXT = "Developed by SanStudio"
CREDIT_URL = "https://a-santhosh-hub.github.io/in/"

BG = "#0B0E17"
CARD = "#141824"
CARD_HOVER = "#1A2030"
BORDER = "#252D42"
ACCENT = "#FF007F"
ACCENT_HOVER = "#FF3399"
TEXT = "#E8EDF5"
MUTED = "#8A97B3"
GOOD = "#22C55E"
WARN = "#F59E0B"
BAD = "#EF4444"
BLUE = "#4F8EF7"


class WindowsFileDrop:
    """Native Windows drag and drop, so the app needs nothing installed besides Python.

    The window callback runs inside Tk's own event loop, where calling Tk again corrupts its
    thread state and kills the process. So it only queues the paths; App polls the queue.
    """

    WM_DROPFILES = 0x0233
    GWLP_WNDPROC = -4
    GA_ROOT = 2
    MSGFLT_ALLOW = 1

    def __init__(self, widget: tk.Misc):
        self.dropped: queue.SimpleQueue[list[str]] = queue.SimpleQueue()
        LRESULT = ctypes.c_ssize_t
        self.WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
        self.user32 = ctypes.WinDLL("user32", use_last_error=True)
        self.shell32 = ctypes.WinDLL("shell32", use_last_error=True)
        u, s = self.user32, self.shell32
        u.GetAncestor.restype = wintypes.HWND
        u.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
        u.SetWindowLongPtrW.restype = ctypes.c_void_p
        u.SetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_void_p]
        u.CallWindowProcW.restype = LRESULT
        u.CallWindowProcW.argtypes = [ctypes.c_void_p, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
        u.ChangeWindowMessageFilterEx.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.DWORD, ctypes.c_void_p]
        s.DragAcceptFiles.argtypes = [wintypes.HWND, wintypes.BOOL]
        s.DragQueryFileW.restype = wintypes.UINT
        s.DragQueryFileW.argtypes = [wintypes.HANDLE, wintypes.UINT, wintypes.LPWSTR, wintypes.UINT]
        s.DragFinish.argtypes = [wintypes.HANDLE]

        self.hwnd = u.GetAncestor(widget.winfo_id(), self.GA_ROOT)
        # Allows drops from Explorer even if this app was started as administrator.
        for message in (self.WM_DROPFILES, 0x004A, 0x0049):
            u.ChangeWindowMessageFilterEx(self.hwnd, message, self.MSGFLT_ALLOW, None)
        s.DragAcceptFiles(self.hwnd, True)
        self._proc = self.WNDPROC(self._handle)  # kept referenced for the life of the window
        self._previous = u.SetWindowLongPtrW(self.hwnd, self.GWLP_WNDPROC, ctypes.cast(self._proc, ctypes.c_void_p))

    def _handle(self, hwnd, message, wparam, lparam):
        if message == self.WM_DROPFILES:
            files = []
            try:
                count = self.shell32.DragQueryFileW(wparam, 0xFFFFFFFF, None, 0)
                for index in range(count):
                    length = self.shell32.DragQueryFileW(wparam, index, None, 0)
                    buffer = ctypes.create_unicode_buffer(length + 1)
                    self.shell32.DragQueryFileW(wparam, index, buffer, length + 1)
                    files.append(buffer.value)
            finally:
                self.shell32.DragFinish(wparam)
            self.dropped.put(files)
            return 0
        return self.user32.CallWindowProcW(self._previous, hwnd, message, wparam, lparam)


class FlatButton(tk.Label):
    def __init__(self, parent, text, command, primary=False):
        self.base = ACCENT if primary else CARD_HOVER
        self.hover = ACCENT_HOVER if primary else BORDER
        self.command = command
        self.enabled = True
        super().__init__(parent, text=text, bg=self.base, fg="#FFFFFF" if primary else TEXT, padx=14, pady=9,
                         cursor="hand2", font=("Segoe UI Semibold", 10))
        self.bind("<Enter>", lambda _: self.configure(bg=self.hover))
        self.bind("<Leave>", lambda _: self.configure(bg=self.base))
        self.bind("<Button-1>", lambda _: self.command())


class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.result: injector.Result | None = None
        root.title(APP_NAME)
        root.configure(bg=BG)
        self._set_size()
        root.report_callback_exception = self._on_crash
        self.once = tk.BooleanVar(value=False)
        self._build_ui()
        self.show_waiting()
        root.update_idletasks()
        self.drop = None
        if sys.platform == "win32":
            try:
                self.drop = WindowsFileDrop(root)
                self._poll_drops()
            except (OSError, AttributeError):
                self.zone_hint = "Click here to choose your HTML file"
                self._draw_zone()

    def _poll_drops(self):
        try:
            while True:
                self.handle_files(self.drop.dropped.get_nowait())
        except queue.Empty:
            pass
        self.root.after(80, self._poll_drops)

    # ------------------------------------------------------------------ layout

    def _set_size(self):
        root = self.root
        scale = root.winfo_fpixels("1i") / 96
        width = min(int(680 * scale), root.winfo_screenwidth() - 80)
        height = min(int(700 * scale), root.winfo_screenheight() - 120)
        root.minsize(int(560 * scale), int(560 * scale))
        root.geometry(f"{width}x{height}")
        # Some Windows setups resize a new window as it first appears, so ask again once it has.
        root.after(150, lambda: root.geometry(f"{width}x{height}"))

    def _build_ui(self):
        root = self.root
        header = tk.Frame(root, bg=BG)
        header.pack(fill="x", padx=24, pady=(20, 12))
        title = tk.Frame(header, bg=BG)
        title.pack(anchor="w")
        tk.Label(title, text="San", bg=BG, fg=TEXT, font=("Segoe UI Black", 19)).pack(side="left")
        tk.Label(title, text="Studio", bg=BG, fg=ACCENT, font=("Segoe UI Black", 19)).pack(side="left")
        tk.Label(title, text="  LiveBuild", bg=BG, fg=TEXT, font=("Segoe UI Light", 19)).pack(side="left")
        tk.Label(header, text="Add the live swarm-build intro to any website. Visitors don't need an extension.",
                 bg=BG, fg=MUTED, font=("Segoe UI", 10)).pack(anchor="w")

        # Footer first, so it keeps its place when the window is small.
        footer = tk.Frame(root, bg=BG)
        footer.pack(side="bottom", fill="x", padx=24, pady=(4, 14))
        link_font = tkfont.Font(family="Segoe UI", size=9)
        self.credit = tk.Label(footer, text=CREDIT_TEXT, bg=BG, fg=MUTED, cursor="hand2", font=link_font)
        self.credit.pack(side="right")
        self.credit.bind("<Button-1>", lambda _: webbrowser.open(CREDIT_URL))
        hover_font = tkfont.Font(family="Segoe UI", size=9, underline=True)
        self.credit.bind("<Enter>", lambda _: self.credit.configure(fg=ACCENT, font=hover_font))
        self.credit.bind("<Leave>", lambda _: self.credit.configure(fg=MUTED, font=link_font))
        tk.Checkbutton(footer, text="Play only once per browser tab", variable=self.once, bg=BG, fg=MUTED,
                       selectcolor=CARD, activebackground=BG, activeforeground=TEXT, bd=0, highlightthickness=0,
                       font=("Segoe UI", 9), cursor="hand2").pack(side="left")

        self.zone_hint = "or click to choose a file"
        self.zone_title = "Drop your HTML file here"
        self.zone = tk.Canvas(root, height=170, bg=BG, highlightthickness=0, cursor="hand2")
        self.zone.pack(fill="x", padx=24)
        self.zone.bind("<Configure>", lambda _: self._draw_zone())
        self.zone.bind("<Button-1>", lambda _: self.choose_file())
        self.zone.bind("<Enter>", lambda _: self._draw_zone(True))
        self.zone.bind("<Leave>", lambda _: self._draw_zone(False))

        self.actions = tk.Frame(root, bg=BG)
        self.actions.pack(side="bottom", fill="x", padx=24, pady=(8, 8))
        self.preview_button = FlatButton(self.actions, "Open preview", self.preview, primary=True)
        self.folder_button = FlatButton(self.actions, "Show in folder", self.show_folder)
        self.copy_button = FlatButton(self.actions, "Copy HTML", self.copy_html)
        self.save_button = FlatButton(self.actions, "Save as…", self.save_as)

        box = tk.Frame(root, bg=CARD, highlightbackground=BORDER, highlightthickness=1)
        box.pack(fill="both", expand=True, padx=24, pady=(14, 0))
        self.report = tk.Text(box, bg=CARD, fg=TEXT, bd=0, wrap="word", padx=14, pady=12, height=8,
                              font=("Segoe UI", 10), state="disabled", cursor="arrow", spacing3=5)
        self.report.pack(fill="both", expand=True)
        self.report.tag_configure("head", font=("Segoe UI Semibold", 11), foreground=TEXT, spacing3=8)
        self.report.tag_configure("path", foreground=BLUE, font=("Segoe UI", 9))
        self.report.tag_configure("muted", foreground=MUTED)
        for level, color in ((injector.OK, GOOD), (injector.INFO, BLUE), (injector.WARN, WARN), ("error", BAD)):
            self.report.tag_configure(level, foreground=color, lmargin2=20)

    def _draw_zone(self, hover=False):
        canvas = self.zone
        canvas.delete("all")
        width, height = canvas.winfo_width(), canvas.winfo_height()
        canvas.create_rectangle(1, 1, width - 2, height - 2, outline=ACCENT if hover else BORDER, width=2,
                                dash=(7, 5), fill=CARD_HOVER if hover else CARD)
        middle = width / 2
        canvas.create_polygon(middle - 12, 50, middle + 12, 50, middle + 12, 62, middle + 22, 62, middle, 84,
                              middle - 22, 62, middle - 12, 62, fill=ACCENT if hover else MUTED)
        canvas.create_text(middle, 106, text=self.zone_title, fill=TEXT, font=("Segoe UI Semibold", 13))
        canvas.create_text(middle, 132, text=self.zone_hint, fill=MUTED, font=("Segoe UI", 10))

    def _write(self, *parts):
        """parts are (text, tag) pairs."""
        self.report.configure(state="normal")
        self.report.delete("1.0", "end")
        for text, tag in parts:
            self.report.insert("end", text, tag)
        self.report.configure(state="disabled")

    def _set_actions(self, visible: bool):
        for button in (self.preview_button, self.folder_button, self.copy_button, self.save_button):
            button.pack_forget()
            if visible:
                button.pack(side="left", padx=(0, 8))

    def show_waiting(self):
        self.result = None
        self._set_actions(False)
        self._write(
            ("How it works\n", "head"),
            ("1.  Drop your website's HTML file above.\n", "muted"),
            ("2.  LiveBuild analyzes it and exports a new file next to it. Your original file isn't changed.\n", "muted"),
            ("3.  Check the preview, then upload the new file to your website.\n", "muted"),
        )

    # ----------------------------------------------------------------- actions

    def choose_file(self):
        path = filedialog.askopenfilename(title="Choose your HTML file",
                                          filetypes=[("HTML files", "*.html *.htm *.xhtml"), ("All files", "*.*")])
        if path:
            self.handle_files([path])

    def handle_files(self, files):
        if not files:
            return
        self.root.lift()
        self.run(files[0], extra=len(files) - 1)

    def run(self, path, extra=0, output=None):
        self._set_actions(False)
        self._write((f"Building {Path(path).name}…\n", "head"))
        self.root.update_idletasks()
        try:
            result = injector.process(path, once_per_tab=self.once.get(), output=output)
        except injector.LiveBuildError as problem:
            self._write(("Couldn't build this file\n", "head"), (f"✕  {problem}\n", "error"))
            return
        except PermissionError:
            self._write(("Couldn't save next to the original\n", "head"),
                        ("✕  That folder is read-only, or the file is open in another program. "
                         "Close it, or drop a copy of the file from another folder.\n", "error"))
            return
        except OSError as problem:
            self._write(("Couldn't read or save the file\n", "head"), (f"✕  {problem}\n", "error"))
            return
        self.result = result
        self._show_result(result, extra)

    def _show_result(self, result, extra):
        symbols = {injector.OK: "✓", injector.INFO: "•", injector.WARN: "!"}
        size = result.output.stat().st_size / 1024
        parts = [("Done: your intro is ready\n", "head"),
                 (f"✓  Analyzed “{result.title}” ({result.elements:,} elements)\n", injector.OK),
                 (f"✓  Exported {result.output.name} ({size:,.0f} KB)\n", injector.OK)]
        for finding in result.findings:
            parts.append((f"{symbols[finding.level]}  {finding.text}\n", finding.level))
        if extra:
            parts.append((f"!  Only the first file was built; {extra} other file(s) were ignored.\n", injector.WARN))
        parts.append((f"\n{result.output}\n", "path"))
        self._write(*parts)
        self._set_actions(True)

    def preview(self):
        if self.result:
            webbrowser.open(self.result.output.as_uri())

    def show_folder(self):
        if self.result:
            subprocess.Popen(["explorer", "/select,", str(self.result.output)])

    def copy_html(self):
        if self.result:
            self.root.clipboard_clear()
            text, _ = injector.decode_html(self.result.output.read_bytes())
            self.root.clipboard_append(text.encode("utf-16", "replace").decode("utf-16"))
            self.root.update()
            self.copy_button.configure(text="Copied ✓")
            self.root.after(1600, lambda: self.copy_button.configure(text="Copy HTML"))

    def save_as(self):
        if not self.result:
            return
        path = filedialog.asksaveasfilename(title="Save the exported file", defaultextension=".html",
                                            initialfile=self.result.output.name,
                                            filetypes=[("HTML files", "*.html")])
        if not path:
            return
        if Path(path).resolve() == self.result.source.resolve():
            messagebox.showwarning(APP_NAME, "That is your original file. Please choose a different name.")
            return
        data = self.result.output.read_bytes()
        Path(path).write_bytes(data)
        self.result.output = Path(path)
        self._write(("Saved\n", "head"), (f"✓  {path}\n", injector.OK),
                    ("Keep it in the same folder as your images and CSS so links still work.\n", "muted"))

    def _on_crash(self, kind, value, tb):
        log = Path(__file__).with_name("error_log.txt")
        details = "".join(traceback.format_exception(kind, value, tb))
        try:
            log.write_text(details, encoding="utf-8")
        except OSError:
            pass
        self._write(("Something went wrong\n", "head"), (f"✕  {value}\n", "error"), (f"Details saved to {log.name}\n", "muted"))


def main():
    if sys.platform == "win32":
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except (OSError, AttributeError):
            pass
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("SanStudio.LiveBuild")
    os.chdir(Path(__file__).parent)
    root = tk.Tk()
    app = App(root)
    if len(sys.argv) > 1:
        root.after(200, app.handle_files, sys.argv[1:])
    root.mainloop()


if __name__ == "__main__":
    main()
