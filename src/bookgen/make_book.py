#!/usr/bin/env python3
"""Build a print-ready PDF from the design docs in ../../docs.

    pip install weasyprint markdown
    python3 src/bookgen/make_book.py [-o out.pdf] [--set argument|math|all]

Letter, duplex, mirrored margins with a ~2.2in outer column for handwritten
notes. Running head carries the current section on rectos and the document
title on versos, so a note can be cited as "6.3, p14".

Nothing here modifies the source documents. Code lines too wide for the text
column are re-wrapped at a comma for print only; see rewrap_code().
"""
import io, os, re, html, argparse, subprocess, datetime
import markdown
from weasyprint import HTML, CSS
from prerender import Prerenderer

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC  = os.path.join(REPO, "docs")

ALL = {
    "START-HERE.md": ("START HERE", "map",
        "Current state, settled decisions, open questions, and the doc map."),
    "specs/strategy.md": ("Strategy Layer", "normative",
        "Goals, candidates, marginal-time allocation, leases, state vs memory."),
    "specs/manager-contract.md": ("Manager Contract", "normative",
        "One controller: state envelope, health, candidates, lifecycle, watchdog."),
    "reference/rationale.md": ("Rationale", "reference",
        "Why the design is what it is. Arguments, rejected alternatives, corrections."),
    "specs/recipe-dsl.md": ("Recipe DSL", "normative",
        "The corp round-recipe engine: step kinds, degradation, the pure plan function."),
    "hwgw-batching-design.md": ("HWGW Batching", "reference",
        "The per-target hacking pipeline: timing model, sizing, prep, drain, leases."),
    "reference/mechanics.md": ("Game Mechanics", "reference",
        "Verified game facts with sources. Multipliers, install ledger, RAM, API drift."),
    "managers/corp.md": ("corp", "reference",
        "Corporation domain: cycle sync, Smart Supply, Market-TA2, round playbooks."),
}

SETS = {
    # the argument -- the layer that was just settled, in reading order
    "argument": ["START-HERE.md", "specs/strategy.md",
                 "specs/manager-contract.md", "reference/rationale.md"],
    # + the two documents with a derivation worth following by hand
    "math":     ["START-HERE.md", "specs/strategy.md", "specs/manager-contract.md",
                 "reference/rationale.md", "specs/recipe-dsl.md",
                 "hwgw-batching-design.md"],
    "all":      ["START-HERE.md", "specs/strategy.md", "specs/manager-contract.md",
                 "reference/rationale.md", "specs/recipe-dsl.md",
                 "hwgw-batching-design.md", "reference/mechanics.md",
                 "managers/corp.md"],
}

TITLES = {"argument": ("The Strategy<br>Layer",
                       "The four documents that carry the argument, in reading order. "
                       "Everything a decision rests on is here; the domain and lookup "
                       "docs are not."),
          "math":     ("The Strategy Layer<br>&amp; the Derivations",
                       "The argument, plus the two documents whose numbers are worth "
                       "checking by hand."),
          "all":      ("bitverse-scottnet<br>Design Set",
                       "Every design document in the repository, in reading order.")}

ap = argparse.ArgumentParser()
ap.add_argument("--set", default="argument", choices=sorted(SETS))
ap.add_argument("-o", "--out", default=None)
ap.add_argument("--inline-math", action="store_true",
                help="also treat $...$ as math. OFF by default: prose like "
                     "'$150b' and '$111 quadrillion' is indistinguishable from "
                     "an inline equation, and these documents are full of it.")
ap.add_argument("--no-figures", action="store_true",
                help="skip math and diagram pre-rendering entirely")
args_cli = ap.parse_args()

DOCS = [(p,) + ALL[p] for p in SETS[args_cli.set]]
OUT = args_cli.out or os.path.join(
    REPO, f"bitburner-design-{args_cli.set}.pdf")

pre = None if args_cli.no_figures else Prerenderer(
    os.path.join(REPO, ".bookgen-cache"), inline_math=args_cli.inline_math)

md = markdown.Markdown(extensions=["tables", "fenced_code", "sane_lists",
                                   "attr_list", "toc", "md_in_html"],
                       extension_configs={"toc": {"toc_depth": "2-2"}})

CODE_LIMIT = 83          # chars that fit the text column at 7.2pt DejaVu Sans Mono

def _wrap_line(line):
    """Break one over-long code line at a comma, indenting the continuation so
    the structure still reads. Print-only: the source files are untouched."""
    ind = re.match(r"[ \t]*", line).group(0)
    out, rest = [], line
    while len(rest) > CODE_LIMIT:
        cut = rest.rfind(", ", 0, CODE_LIMIT)
        if cut < len(ind) + 4:
            cut = rest.rfind(" ", 0, CODE_LIMIT)
            if cut < len(ind) + 4:
                break
        out.append(rest[:cut + 1])
        rest = ind + "  " + rest[cut + 2:]
    out.append(rest)
    return out

def rewrap_code(text):
    lines, incode, out = text.split("\n"), False, []
    for l in lines:
        if l.lstrip().startswith("```"):
            incode = not incode; out.append(l); continue
        out.extend(_wrap_line(l) if incode and len(l) > CODE_LIMIT else [l])
    return "\n".join(out)

def slug(n, s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return f"d{n}-{s}"[:60]

docs_html, toc_items = [], []

for i, (path, title, kind, blurb) in enumerate(DOCS, 1):
    md.reset()
    text = io.open(f"{SRC}/{path}", encoding="utf-8").read()
    # strip the leading H1 -- we render our own with a stable id
    body = re.sub(r"\A#\s+.*?\n", "", text, count=1)
    if pre:
        body = pre.process(body)          # math + diagrams -> tokens, before Markdown
    body = rewrap_code(body)
    # give every h2 a deterministic id we can point the TOC at
    seen = []
    def h2id(m):
        s = slug(i, m.group(1)); seen.append((m.group(1), s))
        return f"## {m.group(1)} {{: #{s} }}\n"
    body = re.sub(r"^##\s+(.+?)\s*$", h2id, body, flags=re.M)
    inner = md.convert(body)
    if pre:
        inner = pre.splice(inner)         # tokens -> inline SVG, after Markdown
    # small tables are kept whole: a repeated <thead> whose first cell is
    # empty (several of these tables have one) reads as a broken header
    def tight(m):
        blk = m.group(0)
        return blk.replace("<table>", '<table class="tight">', 1) \
               if blk.count("<tr") <= 7 else blk
    inner = re.sub(r"<table>.*?</table>", tight, inner, flags=re.S)
    # long code blocks may split across pages rather than overflow
    inner = re.sub(r"<pre>(?=(?:(?!</pre>).)*?(?:\n.*?){24})",
                   '<pre class="long">', inner, flags=re.S)
    did = slug(i, title)
    docs_html.append(
        f'<section class="doc" id="{did}">\n<h1>{html.escape(title)}</h1>\n{inner}\n</section>')
    subs = "".join(
        f'<li><a href="#{sid}">{html.escape(re.sub(r"`", "", stitle))}</a></li>'
        for stitle, sid in seen)
    toc_items.append(
        f'<li><span class="d"><a href="#{did}">{html.escape(title)}</a></span>'
        f'<span class="tag {"ref" if kind=="reference" else ""}">{kind}</span>'
        f'<div class="blurb">{html.escape(blurb)}</div>'
        f'<ol>{subs}</ol></li>')

commit = subprocess.run(["git", "-C", REPO, "rev-parse", "--short", "HEAD"],
                        capture_output=True, text=True).stdout.strip() or "unknown"
branch = subprocess.run(["git", "-C", REPO, "rev-parse", "--abbrev-ref", "HEAD"],
                        capture_output=True, text=True).stdout.strip() or "unknown"
cover_title, cover_sub = TITLES[args_cli.set]
today = datetime.date.today().strftime("%-d %B %Y")

page = f"""<!doctype html><html><head><meta charset="utf-8"><title>Bitburner Design Review</title></head><body>

<section class="cover">
  <div class="eyebrow">bitverse-scottnet &middot; design review</div>
  <h1 class="title">{cover_title}</h1>
  <p class="sub">{cover_sub}</p>
  <div class="meta">
    <b>Source</b> &nbsp; git <code>{commit}</code>, branch <code>{branch}</code><br>
    <b>Built</b> &nbsp; {today}<br>
    <b>Contents</b> &nbsp; {' &middot; '.join(d[1] for d in DOCS[1:])}
  </div>
</section>

<section class="howto">
  <h2>Reading this printout</h2>
  <ul>
    <li><b>The wide margin is for you.</b> Pages are mirrored for double-sided printing, so the
        blank column always falls on the outer edge of the spread.</li>
    <li><b>Cite as &sect; then page</b> &mdash; &ldquo;&sect;6.3, p14&rdquo;. The running head on every
        right-hand page carries the current section; the left-hand page carries the document
        title. Section numbers are stable across edits in a way page numbers are not, so lead
        with the section.</li>
    <li><b>Two of these bind an implementation and two do not.</b> <i>Strategy Layer</i> and
        <i>Manager Contract</i> are normative &mdash; where code and the document disagree, the
        document wins until it is deliberately changed. <i>START HERE</i> and <i>Rationale</i>
        bind nothing.</li>
    <li><b>Precedence, highest first:</b> Strategy Layer, then Manager Contract, then the Recipe
        DSL (not printed here). Where two normative documents disagree, the higher one wins and
        the lower one is a bug to file.</li>
    <li><b>Rationale is the one written to be argued with.</b> It records why each choice was
        made and what was rejected. If a decision looks wrong, the counter-argument may already
        be in there &mdash; and if it is not, that is the note worth writing down.</li>
    <li><b>Not printed here:</b> {", ".join("<i>%s</i>" % ALL[p][0] for p in SETS["all"]
        if p not in SETS[args_cli.set]) or "nothing &mdash; this is the full set"}. Everything
        is in the repo under <code>docs/</code>.</li>
  </ul>
</section>

<section class="toc">
  <h2>Contents</h2>
  <ol>{''.join(toc_items)}</ol>
</section>

{''.join(docs_html)}
</body></html>"""

HTML(string=page, base_url=HERE).write_pdf(
    OUT, stylesheets=[CSS(filename=os.path.join(HERE, "book.css"))])
print("wrote", OUT)
