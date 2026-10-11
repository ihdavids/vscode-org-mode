#!/usr/bin/env node
// A finishing touch to the exported manual: the screenshots get a frame and a
// zoom cursor, and a click opens one full size (Esc or another click closes
// it). The orgs exporter has no #+HTML_HEAD, so it is added here.
//
//   node tools/docs/enhance.js docs/iorg.html

const fs = require('fs');
const file = process.argv[2];
const MARK = '<!-- iorg-enhance -->';
let html = fs.readFileSync(file, 'utf8');
if (html.indexOf(MARK) >= 0) {
    process.exit(0);
}
const add = `${MARK}
<style>
  .doc-body img[src^="./images/"] { border-radius: 6px; box-shadow: 0 2px 14px rgba(0,0,0,.35); cursor: zoom-in; }
  #iorg-zoom { position: fixed; inset: 0; background: rgba(0,0,0,.82); display: none; align-items: center;
               justify-content: center; z-index: 1000; cursor: zoom-out; padding: 24px; box-sizing: border-box; }
  #iorg-zoom.open { display: flex; }
  #iorg-zoom img { max-width: 100%; max-height: 100%; border-radius: 6px; box-shadow: 0 8px 40px rgba(0,0,0,.6); }
</style>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    var box = document.createElement('div');
    box.id = 'iorg-zoom';
    var big = document.createElement('img');
    box.appendChild(big);
    document.body.appendChild(box);
    var close = function () { box.classList.remove('open'); };
    box.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); } });
    document.querySelectorAll('img[src^="./images/"]').forEach(function (img) {
      img.title = 'Click to see it full size';
      img.addEventListener('click', function () { big.src = img.src; big.alt = img.alt; box.classList.add('open'); });
    });
  });
</script>
`;
html = html.replace(/<\/head>/i, add + '</head>');
fs.writeFileSync(file, html);
