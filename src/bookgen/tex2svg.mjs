// Batch TeX -> standalone SVG. Reads [{tex, display}] on stdin, writes
// [svg|null] on stdout. One process per document, not one per equation:
// MathJax start-up dominates, and a document with thirty equations would
// otherwise pay it thirty times.
//
// fontCache 'local' keeps glyph <defs> inside each SVG so the result is
// self-contained -- WeasyPrint has no webfont access at render time. The ids
// those defs use repeat across equations, so prerender.py namespaces them.
import {mathjax} from 'mathjax-full/js/mathjax.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
import {AllPackages} from 'mathjax-full/js/input/tex/AllPackages.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', {
  InputJax:  new TeX({packages: AllPackages}),
  OutputJax: new SVG({fontCache: 'local'}),
});

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const jobs = JSON.parse(raw);
  const out = jobs.map(({tex, display}) => {
    try {
      return adaptor.innerHTML(doc.convert(tex, {display: display !== false}));
    } catch (e) {
      process.stderr.write(`tex2svg: ${e.message}\n`);
      return null;                       // caller falls back to showing source
    }
  });
  process.stdout.write(JSON.stringify(out));
});
