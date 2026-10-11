// The chart of an org table, drawn as svg. The extension posts the data
// (src/tables/plotdata.ts) and posts it again whenever the table changes.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const NS = 'http://www.w3.org/2000/svg';

    // The reference categorical palette, in its fixed order, each hue stepped
    // for its surface. Validated for adjacent-pair colour vision separation.
    const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
    const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
    const isDark = () => document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
    const color = i => (isDark() ? DARK : LIGHT)[i % 8];

    const chart = document.getElementById('chart');
    const legend = document.getElementById('legend');
    const tip = document.getElementById('tip');
    const tableView = document.getElementById('table');
    const note = document.getElementById('note');
    let data = null;
    let showTable = false;

    function el(name, attrs, parent) {
        const e = document.createElementNS(NS, name);
        for (const k in attrs) {
            e.setAttribute(k, attrs[k]);
        }
        if (parent) {
            parent.appendChild(e);
        }
        return e;
    }

    // Round numbers for an axis: 1, 2 or 5 times a power of ten.
    function ticks(lo, hi, count) {
        if (lo === hi) {
            hi = lo + 1;
        }
        const raw = (hi - lo) / count;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw);
        const out = [];
        for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
            out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
        }
        return { ticks: out, lo: Math.min(lo, out[0]), hi: Math.max(hi, out[out.length - 1]) };
    }

    function fmt(v) {
        if (v === null || v === undefined) {
            return '–';
        }
        const a = Math.abs(v);
        if (a >= 1e6) {
            return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
        }
        if (a >= 1e4) {
            return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
        }
        return String(parseFloat(v.toPrecision(4)));
    }

    // A value as the table wrote it: times as h:mm, numbers shortened.
    function fmtValue(v) {
        if (v === null || v === undefined || data.yLabel !== 'hours') {
            return fmt(v);
        }
        const mins = Math.round(Math.abs(v) * 60);
        return (v < 0 ? '-' : '') + Math.floor(mins / 60) + ':' + String(mins % 60).padStart(2, '0');
    }

    function fmtX(i) {
        return data.x[i] || String(data.xv[i]);
    }

    // A bar with its far end rounded 4px and its baseline end square.
    function barPath(x, w, y0, y1) {
        const up = y1 < y0;
        const h = Math.abs(y1 - y0);
        const r = Math.min(4, w / 2, h);
        const top = up ? y1 : y0;
        const bot = up ? y0 : y1;
        if (up) {
            return `M${x},${bot}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bot}Z`;
        }
        return `M${x},${top}V${bot - r}Q${x},${bot} ${x + r},${bot}H${x + w - r}Q${x + w},${bot} ${x + w},${bot - r}V${top}Z`;
    }

    function render() {
        chart.innerHTML = '';
        legend.innerHTML = '';
        if (!data) {
            return;
        }
        document.getElementById('title').textContent = data.title;
        note.textContent = data.dropped ? `${data.dropped} more series not drawn: eight is as many as colour can tell apart.` : '';
        chart.style.display = showTable ? 'none' : '';
        tableView.style.display = showTable ? '' : 'none';
        drawTable();
        if (showTable) {
            return;
        }

        const S = data.series;
        if (S.length > 1) {
            S.forEach((s, i) => {
                const item = document.createElement('span');
                item.className = 'key';
                item.innerHTML = `<i style="background:${color(i)}"></i>`;
                item.appendChild(document.createTextNode(s.name));
                legend.appendChild(item);
            });
        }

        const W = Math.max(320, chart.clientWidth);
        const H = Math.max(240, Math.min(480, window.innerHeight - 140));
        const directLabels = data.kind !== 'bar' && S.length > 1 && S.length <= 4;
        const m = { top: data.yLabel ? 26 : 12, right: directLabels ? 96 : 16, bottom: 40, left: 56 };
        const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': data.title }, chart);
        const iw = W - m.left - m.right;
        const ih = H - m.top - m.bottom;
        const g = el('g', { transform: `translate(${m.left},${m.top})` }, svg);

        const all = [];
        S.forEach(s => s.values.forEach(v => { if (v !== null) { all.push(v); } }));
        let lo = Math.min.apply(null, all);
        let hi = Math.max.apply(null, all);
        if (data.kind === 'bar' || lo > 0 && lo < hi * 0.5) {
            lo = Math.min(0, lo);
        }
        hi = Math.max(hi, data.kind === 'bar' ? 0 : hi);
        const yt = ticks(lo, hi, Math.max(3, Math.floor(ih / 50)));
        const y = v => ih - (v - yt.lo) / (yt.hi - yt.lo) * ih;

        const n = data.x.length;
        let x, band = 0;
        if (data.xType === 'cat' || data.kind === 'bar') {
            band = iw / n;
            x = i => band * i + band / 2;
        } else {
            const xs = data.xv.filter(v => v !== null);
            const x0 = Math.min.apply(null, xs);
            const x1 = Math.max.apply(null, xs);
            x = i => data.xv[i] === null ? null : (x1 === x0 ? iw / 2 : (data.xv[i] - x0) / (x1 - x0) * iw);
        }

        // Grid and y axis: recessive.
        yt.ticks.forEach(v => {
            el('line', { x1: 0, x2: iw, y1: y(v), y2: y(v), class: v === 0 ? 'zero' : 'grid' }, g);
            el('text', { x: -8, y: y(v), class: 'axis', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, g).textContent = fmt(v);
        });
        if (data.yLabel) {
            el('text', { x: -m.left + 4, y: -m.top + 12, class: 'axis label' }, g).textContent = data.yLabel;
        }
        // X labels, thinned to what fits.
        const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 72))));
        for (let i = 0; i < n; i += every) {
            const xi = x(i);
            if (xi !== null) {
                const t = el('text', { x: xi, y: ih + 18, class: 'axis', 'text-anchor': 'middle' }, g);
                const label = fmtX(i);
                t.textContent = label.length > 14 ? label.slice(0, 13) + '…' : label;
            }
        }
        el('text', { x: iw / 2, y: ih + 36, class: 'axis label', 'text-anchor': 'middle' }, g).textContent = data.xLabel;

        if (data.kind === 'bar') {
            const group = Math.min(band * 0.8, 24 * S.length + 2 * (S.length - 1));
            const bw = Math.max(2, Math.min(24, (group - 2 * (S.length - 1)) / S.length));
            const y0 = y(Math.max(yt.lo, Math.min(0, yt.hi)));
            S.forEach((s, si) => s.values.forEach((v, i) => {
                if (v === null) {
                    return;
                }
                const bx = x(i) - group / 2 + si * (bw + 2);
                const bar = el('path', { d: barPath(bx, bw, y0, y(v)), fill: color(si), class: 'mark' }, g);
                const hit = el('rect', { x: bx - 2, y: 0, width: bw + 4, height: ih, class: 'hit' }, g);
                const show = e => tooltip(e, `<b>${esc(fmtX(i))}</b><br>${S.length > 1 ? swatch(si) + esc(s.name) + ': ' : ''}${fmtValue(v)}`, bar);
                hit.addEventListener('mousemove', show);
                hit.addEventListener('mouseleave', hide);
            }));
        } else {
            S.forEach((s, si) => {
                const pts = s.values.map((v, i) => v === null || x(i) === null ? null : [x(i), y(v)]);
                if (data.kind === 'line') {
                    let d = '';
                    let pen = false;
                    pts.forEach(p => {
                        if (!p) {
                            pen = false;
                            return;
                        }
                        d += (pen ? 'L' : 'M') + p[0] + ',' + p[1];
                        pen = true;
                    });
                    el('path', { d, class: 'line', stroke: color(si) }, g);
                }
                const marks = data.kind === 'scatter' || n <= 40;
                if (marks) {
                    pts.forEach(p => p && el('circle', { cx: p[0], cy: p[1], r: 4, fill: color(si), class: 'dot' }, g));
                }
                if (directLabels) {
                    const last = pts.map((p, i) => p ? i : -1).filter(i => i >= 0).pop();
                    if (last !== undefined) {
                        const t = el('text', { x: pts[last][0] + 8, y: pts[last][1], class: 'direct', 'dominant-baseline': 'middle' }, g);
                        t.textContent = s.name.length > 12 ? s.name.slice(0, 11) + '…' : s.name;
                    }
                }
            });
            // Crosshair: the nearest x, every series' value there.
            const cross = el('line', { y1: 0, y2: ih, class: 'cross', visibility: 'hidden' }, g);
            const hit = el('rect', { x: 0, y: 0, width: iw, height: ih, class: 'hit' }, g);
            hit.addEventListener('mousemove', e => {
                const px = e.offsetX - m.left;
                let best = -1, dist = Infinity;
                for (let i = 0; i < n; i++) {
                    const xi = x(i);
                    if (xi !== null && Math.abs(xi - px) < dist) {
                        dist = Math.abs(xi - px);
                        best = i;
                    }
                }
                if (best < 0) {
                    return;
                }
                cross.setAttribute('x1', x(best));
                cross.setAttribute('x2', x(best));
                cross.setAttribute('visibility', 'visible');
                const lines = S.map((s, si) => (S.length > 1 ? swatch(si) + esc(s.name) + ': ' : '') + fmtValue(s.values[best]));
                tooltip(e, `<b>${esc(fmtX(best))}</b><br>` + lines.join('<br>'));
            });
            hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); hide(); });
        }
    }

    const swatch = i => `<i class="sw" style="background:${color(i)}"></i>`;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

    let lit = null;
    function tooltip(e, html, mark) {
        tip.innerHTML = html;
        tip.style.display = 'block';
        const r = tip.getBoundingClientRect();
        let left = e.clientX + 14;
        if (left + r.width > window.innerWidth - 8) {
            left = e.clientX - r.width - 14;
        }
        tip.style.left = left + 'px';
        tip.style.top = Math.max(8, e.clientY - r.height - 10) + 'px';
        if (lit && lit !== mark) {
            lit.classList.remove('lit');
        }
        lit = mark || null;
        if (lit) {
            lit.classList.add('lit');
        }
    }

    function hide() {
        tip.style.display = 'none';
        if (lit) {
            lit.classList.remove('lit');
            lit = null;
        }
    }

    function drawTable() {
        const head = `<tr><th>${esc(data.xLabel)}</th>` + data.series.map(s => `<th>${esc(s.name)}</th>`).join('') + '</tr>';
        const rows = data.x.map((xv, i) => `<tr><td>${esc(xv)}</td>` + data.series.map(s => `<td class="num">${fmtValue(s.values[i])}</td>`).join('') + '</tr>');
        tableView.innerHTML = `<table>${head}${rows.join('')}</table>`;
    }

    document.getElementById('toggle').addEventListener('click', e => {
        showTable = !showTable;
        e.target.textContent = showTable ? 'Chart' : 'Table';
        render();
    });
    document.getElementById('save').addEventListener('click', () => {
        const svg = chart.querySelector('svg');
        if (!svg) {
            return;
        }
        // Styles in, so the file looks the same opened anywhere.
        const copy = svg.cloneNode(true);
        const style = document.createElementNS(NS, 'style');
        style.textContent = Array.from(document.styleSheets).map(sheet => {
            try {
                return Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
            } catch (err) {
                return '';
            }
        }).join('\n')
            // Outside vscode its colour variables mean nothing: write them out.
            .replace(/var\((--[\w-]+)(?:,\s*([^)]*))?\)/g, (_m, name, fallback) =>
                getComputedStyle(document.body).getPropertyValue(name).trim() || fallback || 'currentColor');
        copy.insertBefore(style, copy.firstChild);
        copy.setAttribute('xmlns', NS);
        vscode.postMessage({ command: 'save', svg: copy.outerHTML });
    });
    document.getElementById('goto').addEventListener('click', () => vscode.postMessage({ command: 'goto' }));

    window.addEventListener('message', e => {
        if (e.data.command === 'data') {
            data = e.data.data;
            document.getElementById('error').textContent = '';
            render();
        } else if (e.data.command === 'error') {
            document.getElementById('error').textContent = e.data.message;
        }
    });
    let resizing = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizing);
        resizing = setTimeout(render, 60);
    });
    // A theme change swaps the body's class: redraw in the other mode's steps.
    new MutationObserver(render).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    vscode.postMessage({ command: 'ready' });
}());
