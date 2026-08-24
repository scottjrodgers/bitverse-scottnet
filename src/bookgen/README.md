# bookgen

Builds a print-ready PDF from the Markdown in `docs/`.

```
pip install weasyprint markdown        # required
npm install                            # optional -- math and mermaid
brew install graphviz                  # optional -- ```dot fences

python3 src/bookgen/make_book.py --set argument
```

`--set argument` is the four documents that carry the design; `--set math` adds
the derivations; `--set all` takes everything. `-o` overrides the output path.

## What it does

Letter, duplex, **mirrored margins** — the ~2.2in notes column always lands on
the outer edge of the spread. Running heads carry the current section on rectos
and the document title on versos, so a margin note has a citable address:
"§6.3, p14". The contents page has real page numbers, computed at layout time
by `target-counter()`. A PDF outline is included for tablet reading.

The engine is WeasyPrint, chosen because it implements CSS Paged Media —
`@page :left/:right`, `string-set` running heads, `target-counter` — none of
which headless Chromium supports.

## Math and diagrams

WeasyPrint has no MathML and runs no JavaScript, so both are pre-rendered to
self-contained SVG by `prerender.py` before the Markdown pass:

| Source | Renderer | Notes |
|---|---|---|
| `$$ ... $$` | MathJax (`tex2svg.mjs`) | always on; numbered `(1)`, `(2)` per document |
| `$ ... $` | MathJax | **off by default** — see below |
| ` ```mermaid ` | `mmdc` (headless Chromium) | numbered `Fig. N` |
| ` ```dot ` / ` ```graphviz ` | `dot -Tsvg` | same |

Add a caption in the fence info string — other Markdown renderers ignore it:

    ```mermaid caption="Candidates go up, directives come down."

**Inline `$...$` is opt-in (`--inline-math`) and should stay that way here.**
These documents are full of prose like `$150b` and `$111 quadrillion`, which is
indistinguishable from an inline equation to any regex. The guard rules are
strict enough that both survive even with the flag on, but the safe default is
off.

If node, mermaid or graphviz is missing, the build still succeeds: the source is
printed in a red-ruled block and the reason is logged to stderr. **A missing
diagram must be visible, never silent.**

Renders are cached by content hash in `.bookgen-cache/` (gitignored) because
each mermaid diagram spawns a Chromium process. Delete it to force a rebuild.

## Three failure modes worth knowing

They all fail *quietly*, which is why they are handled here rather than left to
whoever hits them next.

1. **mermaid labels vanish.** By default mermaid renders node text inside
   `<foreignObject>` — embedded HTML — and WeasyPrint drops it without an
   error. You get boxes and arrows and no words. The fix is `htmlLabels: false`
   at the **root** of the mermaid config; setting it only under `flowchart`,
   which is where most examples put it, does nothing.

2. **Every diagram renders solid black.** mermaid names its root `<svg>`
   `my-svg` on *every* render and scopes its embedded stylesheet to `#my-svg`.
   Two diagrams in one document collide. Namespacing the ids fixes the
   collision but breaks those CSS selectors unless the `#my-svg` references
   inside `<style>` are rewritten too — and then everything falls back to the
   default black fill. `_namespace_ids()` rewrites both, restricted to ids that
   exist in that SVG so colour literals like `#eee` are left alone.

3. **A wide graph runs into the notes margin.** mermaid writes an explicit
   pixel `width` on the root element which beats `max-width` in CSS. Diagrams
   have width and height stripped and keep only `viewBox`, so the stylesheet
   decides. Add `class="wide"` handling in `book.css` if a diagram needs the
   full measure.

Inline math baselines need no work: MathJax stamps `vertical-align` in `ex`
units on the SVG and WeasyPrint honours it.

## Adapting this to another project

Change three things: the `ALL` map in `make_book.py` (path → title, status tag,
blurb), the `SETS`/`TITLES` beneath it, and `book.css`. Everything else — the
page geometry, the TOC, the pre-renderer, the code re-wrapping — is
domain-independent.

Sources are never modified. The one transformation is `rewrap_code()`, which
breaks over-long code lines at a comma with an aligned continuation, because
`white-space: pre-wrap` alone wraps to column zero and destroys the indentation.
