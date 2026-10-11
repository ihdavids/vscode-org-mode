// The Pictures & Maths panel (src/media-panel.ts): draws what it is sent.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const items = document.getElementById('items');
    const where = document.getElementById('where');

    function item(m) {
        const fig = document.createElement('figure');
        fig.title = 'Line ' + (m.line + 1) + ' - click to go there';
        fig.addEventListener('click', () => vscode.postMessage({ command: 'goto', line: m.line }));
        if (m.kind === 'image') {
            if (m.src) {
                const img = document.createElement('img');
                img.src = m.src;
                img.alt = m.name;
                fig.appendChild(img);
            } else {
                fig.classList.add('missing');
                fig.textContent = 'No such image: ' + m.text;
            }
            const cap = document.createElement('figcaption');
            cap.textContent = m.name || m.text;
            fig.appendChild(cap);
        } else {
            fig.classList.add('math');
            try {
                if (!window.katex) {
                    throw new Error('KaTeX did not load (no network?)');
                }
                window.katex.render(m.text, fig, { displayMode: m.display, throwOnError: true });
            } catch (e) {
                fig.classList.add('error');
                fig.textContent = m.text + '\n\n' + e.message;
            }
        }
        return fig;
    }

    window.addEventListener('message', e => {
        if (e.data.command !== 'show') {
            return;
        }
        where.textContent = e.data.where;
        items.innerHTML = '';
        if (!e.data.items.length) {
            items.innerHTML = '<p class="empty">No pictures or maths here. Image links ([[./pic.png]]) and LaTeX ($x^2$, \\[ … \\]) in the subtree you are in show up here.</p>';
            return;
        }
        e.data.items.forEach(m => items.appendChild(item(m)));
    });
    vscode.postMessage({ command: 'ready' });
}());
