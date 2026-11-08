"""SanStudio LiveBuild: reads an HTML file and adds the LiveBuild intro to it.

No third-party packages. The original file is never modified.
"""
from __future__ import annotations

import codecs
import json
import os
import re
import tempfile
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

ENGINE_PATH = Path(__file__).with_name("live_build.js")

HEAD_START = "<!-- SANSTUDIO LIVEBUILD: head start -->"
HEAD_END = "<!-- SANSTUDIO LIVEBUILD: head end -->"
BODY_START = "<!-- SANSTUDIO LIVEBUILD: start -->"
BODY_END = "<!-- SANSTUDIO LIVEBUILD: end -->"
_OUR_BLOCKS = re.compile(
    "|".join(
        rf"[ \t]*{re.escape(a)}.*?{re.escape(b)}[ \t]*(?:\r?\n)?"
        for a, b in (
            (HEAD_START, HEAD_END),
            (BODY_START, BODY_END),
            # The hand-installed version used in the SanStudio portfolio.
            ("<!-- BUILD INTRO: start -->", "<!-- BUILD INTRO: end -->"),
        )
    ),
    re.DOTALL,
)

OUTPUT_SUFFIX = ".livebuild"
HTML_EXTENSIONS = {".html", ".htm", ".xhtml"}
OK, INFO, WARN = "ok", "info", "warn"


class LiveBuildError(Exception):
    """A problem to show the user in plain words."""


@dataclass
class Finding:
    level: str
    text: str


@dataclass
class Result:
    source: Path
    output: Path
    title: str
    elements: int
    findings: list[Finding] = field(default_factory=list)
    replaced_existing: bool = False


# --------------------------------------------------------------- reading


def decode_html(data: bytes) -> tuple[str, str]:
    """Return (text, encoding) using the BOM, then the declared charset, then UTF-8."""
    for bom, name in (
        (codecs.BOM_UTF8, "utf-8-sig"),
        (codecs.BOM_UTF16_LE, "utf-16"),
        (codecs.BOM_UTF16_BE, "utf-16"),
    ):
        if data.startswith(bom):
            return data.decode(name), name
    try:
        return data.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        pass
    # surrogateescape keeps any invalid byte exactly as it was, so the export never alters the page.
    match = re.search(rb"""<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)""", data[:4096], re.I)
    if match:
        declared = match.group(1).decode("ascii", "ignore")
        try:
            codecs.lookup(declared)
            return data.decode(declared, "surrogateescape"), declared
        except LookupError:
            pass
    return data.decode("cp1252", "surrogateescape"), "cp1252"


class _Scanner(HTMLParser):
    """Records where the real document tags are. Text inside scripts and comments is ignored."""

    def __init__(self, text: str):
        super().__init__(convert_charrefs=True)
        self._line_starts = [0]
        for match in re.finditer("\n", text):
            self._line_starts.append(match.end())
        self.head_close = self.body_open_end = self.body_close = self.html_close = None
        self.html_open_end = self.doctype_end = None
        self.elements = 0
        self.tags: dict[str, int] = {}
        self.names: set[str] = set()
        self.script_sources: list[str] = []
        self.asset_links: list[str] = []
        self.csp: str | None = None
        self.title = ""
        self.in_title = False
        self.body_text = 0
        self.has_frameset = False
        self.inline_script = ""
        self._in_script = False

    def _offset(self) -> int:
        line, column = self.getpos()
        return self._line_starts[line - 1] + column

    def handle_decl(self, decl):
        if self.doctype_end is None:
            self.doctype_end = self._offset() + len(decl) + 3  # "<!" + decl + ">"

    def handle_starttag(self, tag, attrs):
        self.elements += 1
        self.tags[tag] = self.tags.get(tag, 0) + 1
        values = {name: value or "" for name, value in attrs}
        end = self._offset() + len(self.get_starttag_text() or "")
        if tag == "html" and self.html_open_end is None:
            self.html_open_end = end
        elif tag == "body" and self.body_open_end is None:
            self.body_open_end = end
        elif tag == "frameset":
            self.has_frameset = True
        elif tag == "title" and not self.title:
            self.in_title = True
        elif tag == "script":
            self._in_script = True
            if values.get("src"):
                self.script_sources.append(values["src"])
        elif tag == "meta" and values.get("http-equiv", "").lower() == "content-security-policy":
            self.csp = values.get("content", "")
        if values.get("id"):
            self.names.add(values["id"].lower())
        self.names.update(values.get("class", "").lower().split())
        for key in ("src", "href", "poster"):
            if tag in ("img", "link", "video", "source", "script") and values.get(key):
                self.asset_links.append(values[key])
        for key in values:
            if key.startswith("data-"):
                self.names.add(key)

    def handle_endtag(self, tag):
        if tag == "head":
            self.head_close = self._offset()
        elif tag == "body":
            self.body_close = self._offset()
        elif tag == "html":
            self.html_close = self._offset()
        elif tag == "title":
            self.in_title = False
        elif tag == "script":
            self._in_script = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        elif self._in_script:
            self.inline_script += data
        elif self.body_open_end is not None:
            self.body_text += len(data.strip())


def scan(text: str) -> _Scanner:
    scanner = _Scanner(text)
    scanner.feed(text)
    scanner.close()
    return scanner


# -------------------------------------------------------------- analysing


def _is_relative(link: str) -> bool:
    return not re.match(r"^(?:[a-z][a-z0-9+.-]*:|//|#)", link.strip(), re.I)


def analyze(page: _Scanner) -> list[Finding]:
    """Tell the user what was found and how LiveBuild will deal with it."""
    found: list[Finding] = []
    sources = " ".join(page.script_sources).lower()
    code = page.inline_script.lower()
    names = page.names

    def uses(*needles: str) -> bool:
        return any(n in sources or n in code for n in needles)

    loaders = sorted(
        (n for n in names if re.search(r"preload|loader|splash", n)),
        key=lambda n: (not n.startswith("preload"), n),
    )
    if loaders:
        found.append(Finding(OK, f"Preloader found ({loaders[0]}): the intro starts when it lifts."))
    if "data-aos" in names or uses("aos.js", "aos.init"):
        found.append(Finding(OK, "AOS scroll animations: captured in their finished state."))
    if "wow" in names or uses("wow.js", "wow.min.js"):
        found.append(Finding(OK, "WOW scroll animations: captured in their finished state."))
    if uses("scrollreveal"):
        found.append(Finding(OK, "ScrollReveal animations: captured in their finished state."))
    if uses("swiper", "slick", "owl.carousel"):
        found.append(Finding(OK, "Slider: the visible slides are rebuilt."))

    counts = page.tags
    if counts.get("video"):
        found.append(Finding(INFO, f"{counts['video']} video(s): play muted during the build, or show their poster image."))
    if counts.get("iframe"):
        found.append(Finding(INFO, f"{counts['iframe']} iframe(s) such as maps or YouTube: shown as a labelled box during the build."))
    if counts.get("canvas"):
        found.append(Finding(INFO, f"{counts['canvas']} canvas animation(s): shown as a still image, or left blank if 3D, during the build."))
    if counts.get("model-viewer"):
        found.append(Finding(INFO, "3D model viewer: shown as a still image during the build."))

    if uses("gsap", "scrolltrigger"):
        found.append(Finding(WARN, "GSAP found: elements it animates in may look different on the canvas. Check the preview."))
    if uses("lenis"):
        found.append(Finding(WARN, "Lenis smooth scrolling found: scrolling may feel different during the build. Check the preview."))
    if uses("locomotive", "fullpage", "smooth-scrollbar"):
        found.append(Finding(WARN, "A custom scroll library was found: only part of the page may build. Check the preview."))

    if any(re.search(r"/src/main\.|\.jsx|\.tsx", src, re.I) for src in page.script_sources):
        found.append(Finding(WARN, "This looks like unbuilt React/Vue source. Run your build first and use the built index.html."))
    elif page.body_text < 40 and (page.script_sources or page.inline_script):
        found.append(Finding(INFO, "The page is drawn by JavaScript: it will be captured once it has loaded."))

    if page.csp is not None:
        policy = page.csp.lower()
        directive = re.search(r"script-src[^;]*", policy) or re.search(r"default-src[^;]*", policy)
        if directive and "'unsafe-inline'" not in directive.group(0):
            found.append(Finding(WARN, "This page's security policy (CSP) blocks inline scripts, so the intro won't play. The site itself still works."))

    relative = sum(1 for link in page.asset_links if _is_relative(link))
    if relative:
        found.append(Finding(INFO, f"{relative} local file link(s) such as images or CSS: keep the exported file in the same folder."))
    return found


# --------------------------------------------------------------- building


def _head_snippet(once_per_tab: bool) -> str:
    # Decides whether to play, and hides the page's content until the canvas is up,
    # without hiding anything named like a preloader. If the main script never runs,
    # DOMContentLoaded shows the page again.
    once = "true" if once_per_tab else "false"
    return (
        f"{HEAD_START}\n"
        '<style>html.lb-pending body>*:not([id*="load" i]):not([class*="load" i]):not([id*="splash" i])'
        ':not([class*="splash" i]):not([id*="spinner" i]):not([class*="spinner" i]){opacity:0!important}</style>\n'
        "<script>(function(){var seen=false;"
        f"if({once}){{try{{seen=sessionStorage.getItem('livebuild-seen')==='1'}}catch(e){{}}}}"
        "if(/[?&]nointro\\b/.test(location.search)||location.hash.length>1||seen||window.top!==window.self"
        "||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches))return;"
        "window.__liveBuildPlay=true;var r=document.documentElement;r.classList.add('lb-pending');"
        "document.addEventListener('DOMContentLoaded',function(){if(!window.__liveBuildMounted)r.classList.remove('lb-pending')});"
        "})();</script>\n"
        f"{HEAD_END}"
    )


def _load_engine() -> str:
    if not ENGINE_PATH.is_file():
        raise LiveBuildError(f"The engine file is missing: {ENGINE_PATH.name}. Please copy the full LiveBuild folder.")
    engine = ENGINE_PATH.read_text(encoding="utf-8").rstrip()
    if re.search(r"</script|<!--", engine, re.I):
        raise LiveBuildError("The engine file is damaged and cannot be placed inside HTML.")
    # ASCII only, so the engine is safe in a page saved in any encoding.
    return re.sub(r"[^\x00-\x7f]", lambda m: f"\\u{ord(m.group(0)):04x}", engine)


def strip_livebuild(text: str) -> str:
    return _OUR_BLOCKS.sub("", text)


def build_html(text: str, once_per_tab: bool = False) -> tuple[str, _Scanner, bool]:
    """Return the new HTML, the scan of the clean page, and whether LiveBuild was already in it."""
    clean = strip_livebuild(text)
    replaced = clean != text
    page = scan(clean)
    if page.elements == 0:
        raise LiveBuildError("This file has no HTML tags, so there is nothing to rebuild.")
    if page.has_frameset:
        raise LiveBuildError("This page uses frames (<frameset>), which LiveBuild can't rebuild.")

    newline = "\r\n" if "\r\n" in clean else "\n"
    head = _head_snippet(once_per_tab).replace("\n", newline) + newline
    body = f"{BODY_START}\n<script>\n{_load_engine()}\n</script>\n{BODY_END}".replace("\n", newline) + newline

    if page.head_close is not None:
        head_at = page.head_close
    elif page.body_open_end is not None:
        body_tag = clean.rfind("<", 0, page.body_open_end)
        head_at = body_tag if body_tag >= 0 else page.body_open_end
    else:
        head_at = page.html_open_end or page.doctype_end or 0
    for candidate in (page.body_close, page.html_close):
        if candidate is not None:
            body_at = candidate
            break
    else:
        body_at = len(clean)

    if head_at > body_at:
        raise LiveBuildError("The page structure is too broken to place the intro safely.")
    built = clean[:head_at] + head + clean[head_at:body_at] + body + clean[body_at:]
    if strip_livebuild(built) != clean:
        raise LiveBuildError("Safety check failed: the export would have changed your page, so nothing was saved.")
    return built, page, replaced


def output_path_for(source: Path) -> Path:
    stem = source.stem
    if stem.endswith(OUTPUT_SUFFIX):
        return source
    return source.with_name(f"{stem}{OUTPUT_SUFFIX}{source.suffix}")


def find_html(path: Path) -> Path:
    """Accept a file, or a folder holding an index.html."""
    if path.is_dir():
        for name in ("index.html", "index.htm"):
            if (path / name).is_file():
                return path / name
        pages = sorted(p for p in path.iterdir() if p.suffix.lower() in HTML_EXTENSIONS)
        if len(pages) == 1:
            return pages[0]
        raise LiveBuildError("That folder has no index.html. Please drop the HTML file itself.")
    if not path.is_file():
        raise LiveBuildError(f"File not found: {path}")
    if path.suffix.lower() not in HTML_EXTENSIONS:
        raise LiveBuildError(f"'{path.name}' is not an HTML file. Please use a .html or .htm file.")
    return path


def write_output(output: Path, html: str, encoding: str) -> None:
    errors = "strict" if encoding.startswith("utf-16") else "surrogateescape"
    data = html.encode(encoding, errors)
    descriptor, temporary = tempfile.mkstemp(dir=output.parent, prefix=".livebuild-", suffix=".tmp")
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
        os.replace(temporary, output)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def process(path: str | Path, once_per_tab: bool = False, output: Path | None = None) -> Result:
    source = find_html(Path(path))
    text, encoding = decode_html(source.read_bytes())
    built, page, replaced = build_html(text, once_per_tab)
    target = output or output_path_for(source)
    write_output(target, built, encoding)
    findings = analyze(page)
    if replaced:
        findings.insert(0, Finding(OK, "An earlier LiveBuild intro was found and replaced."))
    return Result(
        source=source,
        output=target,
        title=" ".join(page.title.split()).encode("utf-8", "ignore").decode("utf-8") or source.name,
        elements=page.elements,
        findings=findings,
        replaced_existing=replaced,
    )


if __name__ == "__main__":
    import sys

    outcome = process(sys.argv[1], output=Path(sys.argv[2]) if len(sys.argv) > 2 else None)
    print(json.dumps({"output": str(outcome.output), "title": outcome.title, "elements": outcome.elements,
                      "findings": [f"{f.level}: {f.text}" for f in outcome.findings]}, indent=1))
