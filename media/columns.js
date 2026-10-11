// The column view's grid (src/columns.ts). Each cell is an input; a change is
// sent when you leave it or press Enter, Escape puts it back. The grid is
// redrawn whenever the file changes, keeping the cell you are in.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const grid = document.getElementById('grid');
    let data = null;

    function cell(row, col) {
        const td = document.createElement('td');
        const key = col.key;
        const value = row.values[key] || '';
        let input;
        if (key === 'TODO' || key === 'PRIORITY') {
            input = document.createElement('select');
            const options = key === 'TODO' ? [''].concat(data.todo, data.done) : ['', 'A', 'B', 'C'];
            if (options.indexOf(value) < 0) {
                options.push(value);
            }
            options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o;
                opt.textContent = o || '·';
                if (key === 'TODO' && data.done.indexOf(o) >= 0) {
                    opt.className = 'done';
                }
                input.appendChild(opt);
            });
            input.value = value;
            input.className = key === 'TODO' ? (data.done.indexOf(value) >= 0 ? 'state done' : value ? 'state todo' : 'state') : 'pri';
        } else {
            input = document.createElement('input');
            input.value = value;
            if (row.sums[key] !== undefined) {
                input.placeholder = row.sums[key];
                td.title = 'The total of what is under it: ' + row.sums[key];
                if (!value) {
                    td.classList.add('sum');
                }
            }
        }
        input.dataset.line = row.line;
        input.dataset.key = key;
        input.dataset.was = value;
        const send = () => {
            if (input.value !== input.dataset.was) {
                input.dataset.was = input.value;
                vscode.postMessage({ command: 'edit', line: row.line, text: row.text, key, value: input.value });
            }
        };
        input.addEventListener('change', send);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                send();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                input.value = input.dataset.was;
            }
        });
        if (key === 'ITEM') {
            // The heading: indented by its level, with a way to go to it.
            td.className = 'item';
            const wrap = document.createElement('div');
            wrap.className = 'item-wrap';
            wrap.style.paddingLeft = (row.level - 1) * 16 + 'px';
            const go = document.createElement('button');
            go.className = 'go';
            go.title = 'Go to it';
            go.textContent = '›';
            go.addEventListener('click', () => vscode.postMessage({ command: 'goto', line: row.line }));
            wrap.appendChild(go);
            wrap.appendChild(input);
            td.appendChild(wrap);
            return td;
        }
        td.appendChild(input);
        return td;
    }

    function render() {
        const active = document.activeElement;
        const focus = active && active.dataset && active.dataset.key ? { line: active.dataset.line, key: active.dataset.key } : null;
        document.getElementById('title').textContent = data.title;
        const table = document.createElement('table');
        const head = document.createElement('tr');
        data.columns.forEach(c => {
            const th = document.createElement('th');
            th.textContent = c.label;
            th.className = c.key === 'ITEM' ? 'item' : '';
            head.appendChild(th);
        });
        const thead = document.createElement('thead');
        thead.appendChild(head);
        table.appendChild(thead);
        const body = document.createElement('tbody');
        data.rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = 'level' + Math.min(r.level, 4);
            data.columns.forEach(c => tr.appendChild(cell(r, c)));
            body.appendChild(tr);
        });
        table.appendChild(body);
        grid.innerHTML = '';
        if (!data.rows.length) {
            grid.innerHTML = '<p class="empty">No headings in this file.</p>';
            return;
        }
        grid.appendChild(table);
        if (focus) {
            const again = grid.querySelector(`[data-line="${focus.line}"][data-key="${focus.key}"]`);
            if (again) {
                again.focus();
            }
        }
    }

    window.addEventListener('message', e => {
        if (e.data.command === 'data') {
            data = e.data;
            render();
        }
    });
    vscode.postMessage({ command: 'ready' });
}());
