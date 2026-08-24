"""Pre-render TeX math and diagram fences to inline SVG, for WeasyPrint.

WeasyPrint implements CSS Paged Media but has no MathML and no JavaScript, so
neither `$$...$$` nor a ```mermaid fence means anything to it. Both are turned
into self-contained SVG here, before the Markdown pass, and spliced back into
the HTML afterwards.

Two hazards this module exists to handle, both of which fail *silently*:

  * mermaid renders node labels as <foreignObject> (embedded HTML) unless
    `htmlLabels: false` is set at the ROOT of the config. Setting it only under
    `flowchart` does nothing. WeasyPrint drops foreignObject without an error,
    so the diagram arrives with boxes and arrows and no text at all.

  * Every embedded SVG carries its own ids -- mermaid's arrowhead markers,
    MathJax's glyph defs -- and they repeat across figures. Two SVGs in one
    HTML document then cross-wire through `url(#id)`. Ids are namespaced per
    figure here.

Rendering is cached by content hash under .bookgen-cache/, because each mermaid
render spawns a Chromium process.
"""
from __future__ import annotations
import hashlib, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
NODE_MODULES = os.path.join(HERE, "node_modules")

FIG_KINDS = {"mermaid": "mermaid", "dot": "dot", "graphviz": "dot"}

TOKEN = "BOOKGENxx{kind}xx{n:04d}xx"      # survives Markdown untouched
TOKEN_RE = re.compile(r"BOOKGENxx(FIG|EQN|IMATH)xx(\d{4})xx")


class Prerenderer:
    def __init__(self, cache_dir, inline_math=False, quiet=False):
        self.cache = cache_dir
        self.inline_math = inline_math
        self.quiet = quiet
        self.repl: dict[str, str] = {}
        self.n = 0
        self.math_jobs: list[tuple[str, str, bool]] = []   # token, tex, display
        self.skipped: list[str] = []
        os.makedirs(self.cache, exist_ok=True)

    # ---------- utilities ----------

    def _note(self, msg):
        if not self.quiet:
            print(f"  bookgen: {msg}", file=sys.stderr)

    def _tok(self, kind):
        self.n += 1
        return TOKEN.format(kind=kind, n=self.n)

    def _cached(self, key, produce):
        h = hashlib.sha256(key.encode()).hexdigest()[:20]
        path = os.path.join(self.cache, h + ".svg")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return f.read()
        svg = produce()
        if svg:
            with open(path, "w", encoding="utf-8") as f:
                f.write(svg)
        return svg

    @staticmethod
    def _namespace_ids(svg, prefix):
        """Rewrite id="x" and every reference to it so two SVGs cannot collide.

        mermaid names its root <svg> `my-svg` on every single render, and its
        embedded <style> block scopes every rule to `#my-svg`. Renaming the id
        without renaming the CSS selectors leaves the rules matching nothing --
        which does not error, it just renders every node with the default black
        fill. So bare `#id` is rewritten too, restricted to ids that actually
        exist in this SVG: colour literals like `#eee` must not be touched.
        """
        ids = set(re.findall(r'\sid="([^"]+)"', svg))
        if not ids:
            return svg
        for i in sorted(ids, key=len, reverse=True):
            q = re.escape(i)
            svg = re.sub(rf'(\sid=")({q})(")', rf'\g<1>{prefix}-{i}\g<3>', svg)
            # url(#x), href="#x", and CSS selectors "#x" inside <style>
            svg = re.sub(rf'#{q}(?![-\w])', f'#{prefix}-{i}', svg)
        return svg

    @staticmethod
    def _fluid(svg):
        """Drop the root width/height so CSS, not mermaid, decides the size.

        The viewBox carries the aspect ratio. Left in place, the px width wins
        and a wide graph runs straight into the notes margin. Applied to
        diagrams only -- MathJax needs its ex-based width and height to size
        and sit on the baseline.
        """
        m = re.match(r"\s*<svg\b[^>]*>", svg)
        if not m:
            return svg
        tag = re.sub(r'\s(?:width|height)="[^"]*"', "", m.group(0))
        return tag + svg[m.end():]

    @staticmethod
    def _strip_xml_decl(svg):
        return re.sub(r"^\s*<\?xml[^>]*\?>\s*", "", svg).strip()

    # ---------- diagrams ----------

    def _render_mermaid(self, src):
        chrome = os.environ.get("PUPPETEER_EXECUTABLE_PATH")
        cfg = {
            "theme": "neutral",
            # ROOT level. Under "flowchart" alone this silently does nothing.
            "htmlLabels": False,
            "flowchart": {"htmlLabels": False, "useMaxWidth": False},
            "sequence": {"useMaxWidth": False},
            "themeVariables": {"fontFamily": "DejaVu Sans, Helvetica, sans-serif",
                               "fontSize": "15px"},
        }
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            i, o, c = (os.path.join(td, n) for n in ("in.mmd", "out.svg", "c.json"))
            open(i, "w", encoding="utf-8").write(src)
            json.dump(cfg, open(c, "w"))
            cmd = [os.path.join(NODE_MODULES, ".bin", "mmdc"),
                   "-i", i, "-o", o, "-c", c, "-b", "transparent"]
            if not os.path.exists(cmd[0]):
                cmd = ["npx", "--yes", "@mermaid-js/mermaid-cli"] + cmd[1:]
            env = dict(os.environ)
            pf = os.path.join(td, "p.json")
            json.dump({"args": ["--no-sandbox", "--disable-setuid-sandbox",
                                "--disable-dev-shm-usage"]}, open(pf, "w"))
            cmd += ["-p", pf]
            if chrome:
                env["PUPPETEER_EXECUTABLE_PATH"] = chrome
            r = subprocess.run(cmd, capture_output=True, text=True, env=env)
            if r.returncode or not os.path.exists(o):
                self.skipped.append("mermaid: " + (r.stderr.strip().splitlines() or ["failed"])[-1])
                return None
            return open(o, encoding="utf-8").read()

    def _render_dot(self, src):
        if not shutil.which("dot"):
            self.skipped.append("graphviz: `dot` not on PATH")
            return None
        r = subprocess.run(["dot", "-Tsvg"], input=src, capture_output=True, text=True)
        if r.returncode:
            self.skipped.append("graphviz: " + r.stderr.strip()[:120])
            return None
        return r.stdout

    # ---------- math ----------

    def _flush_math(self):
        """One node process for every equation in the document, not one each."""
        if not self.math_jobs:
            return
        script = os.path.join(HERE, "tex2svg.mjs")
        payload = json.dumps([{"tex": t, "display": d} for _, t, d in self.math_jobs])
        env = dict(os.environ, NODE_PATH=NODE_MODULES)
        try:
            r = subprocess.run(["node", script], input=payload,
                               capture_output=True, text=True, env=env)
        except FileNotFoundError:
            self.skipped.append("math: node not on PATH")
            r = None
        if r is None or r.returncode:
            why = "node missing" if r is None else (r.stderr.strip().splitlines() or ["failed"])[-1]
            self.skipped.append(f"math: {why}")
            for tok, tex, display in self.math_jobs:
                self.repl[tok] = self._math_fallback(tex, display)
            self.math_jobs.clear()
            return
        out = json.loads(r.stdout)
        for (tok, tex, display), svg in zip(self.math_jobs, out):
            if not svg:
                self.repl[tok] = self._math_fallback(tex, display)
                continue
            svg = self._namespace_ids(self._strip_xml_decl(svg), tok[-9:-2])
            self.repl[tok] = (f'<figure class="eqn">{svg}</figure>' if display
                              else f'<span class="imath">{svg}</span>')
        self.math_jobs.clear()

    @staticmethod
    def _math_fallback(tex, display):
        import html as H
        t = H.escape(tex)
        return (f'<pre class="math-fallback">{t}</pre>' if display
                else f'<code class="math-fallback">{t}</code>')

    # ---------- the pass ----------

    def process(self, text):
        # 1. diagram fences
        def fence(m):
            kind = FIG_KINDS[m.group(1).lower()]
            info, src = m.group(2) or "", m.group(3)
            cap = re.search(r'caption="([^"]*)"', info)
            tok = self._tok("FIG")
            svg = self._cached(kind + "\x00" + src,
                               lambda: (self._render_mermaid if kind == "mermaid"
                                        else self._render_dot)(src))
            if not svg:
                self.repl[tok] = f'<pre class="fig-fallback">{src}</pre>'
                return "\n\n" + tok + "\n\n"
            svg = self._namespace_ids(self._strip_xml_decl(svg), tok[-9:-2])
            svg = re.sub(r'(<svg\b[^>]*?)\sstyle="[^"]*"', r"\1", svg, count=1)
            svg = self._fluid(svg)
            caphtml = f"<figcaption>{cap.group(1)}</figcaption>" if cap else ""
            self.repl[tok] = f'<figure class="dia">{svg}{caphtml}</figure>'
            return "\n\n" + tok + "\n\n"

        text = re.sub(r"^```(mermaid|dot|graphviz)([^\n]*)\n(.*?)\n```\s*$",
                      fence, text, flags=re.M | re.S | re.I)

        # 2. mask remaining code so math never matches inside it
        masked, code = [], []
        def hide(m):
            code.append(m.group(0))
            return f"\x00CODE{len(code)-1}\x00"
        text = re.sub(r"^```.*?^```", hide, text, flags=re.M | re.S)
        text = re.sub(r"`[^`\n]+`", hide, text)

        # 3. display math -- always on; `$$` is unambiguous
        def dmath(m):
            tok = self._tok("EQN")
            self.math_jobs.append((tok, m.group(1).strip(), True))
            return "\n\n" + tok + "\n\n"
        text = re.sub(r"\$\$(.+?)\$\$", dmath, text, flags=re.S)

        # 4. inline math -- OPT-IN. "$150b" and "$111 quadrillion" are prose in
        #    these documents and a naive $...$ rule destroys them.
        if self.inline_math:
            def imath(m):
                tok = self._tok("IMATH")
                self.math_jobs.append((tok, m.group(1), False))
                return tok
            text = re.sub(r"(?<![\w$])\$(?!\s)([^\n$]{1,200}?)(?<!\s)\$(?![\w$])",
                          imath, text)

        for i, c in enumerate(code):
            text = text.replace(f"\x00CODE{i}\x00", c)

        self._flush_math()
        if self.skipped:
            for s in dict.fromkeys(self.skipped):
                self._note("SKIPPED -- " + s)
        return text

    def splice(self, html):
        """Put the SVG back after Markdown has run."""
        html = re.sub(r"<p>\s*(" + TOKEN_RE.pattern + r")\s*</p>",
                      lambda m: self.repl.get(m.group(1), m.group(0)), html)
        return TOKEN_RE.sub(lambda m: self.repl.get(m.group(0), m.group(0)), html)
