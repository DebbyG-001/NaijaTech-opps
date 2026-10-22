// Reach panel for the admin page: stat tiles, two daily column charts, the most-clicked
// opportunities, and apply-click breakdowns. All labels are inserted with textContent.
document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('stats-card');
    if (!card) return;

    const REGION_LABEL = { nigeria: 'Nigeria', africa: 'Africa-wide', global: 'Global' };
    const fmt = n => Number(n).toLocaleString('en-NG');
    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const shortDay = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    document.getElementById('stats-refresh').addEventListener('click', load);
    load();

    async function load() {
        card.classList.add('is-loading');
        try {
            const res = await fetch('/admin/api/stats', { headers: { 'X-Requested-With': 'fetch' } });
            if (res.status === 401) {
                window.location.reload();
                return;
            }
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            render(await res.json());
        } catch (err) {
            const tiles = document.getElementById('stat-tiles');
            tiles.replaceChildren(el('p', 'admin-error', `Could not load stats: ${err.message}`));
        } finally {
            card.classList.remove('is-loading');
        }
    }

    function render(data) {
        const week = data.totals['7d'];
        const month = data.totals[`${data.days}d`];
        const waShare = week.visitors ? Math.round((week.whatsapp_visitors / week.visitors) * 100) : 0;
        renderTiles([
            { label: 'Visitors, last 7 days', value: fmt(week.visitors), sub: `${fmt(month.visitors)} in 30 days` },
            { label: 'Apply clicks, last 7 days', value: fmt(week.apply), sub: `${fmt(month.apply)} in 30 days` },
            { label: 'Details opened, last 7 days', value: fmt(week.details), sub: `${fmt(month.details)} in 30 days` },
            { label: 'From WhatsApp, last 7 days', value: `${waShare}%`, sub: `${fmt(week.whatsapp_visitors)} of ${fmt(week.visitors)} visitors` },
        ]);
        columnChart(document.getElementById('chart-visitors'), data.series, 'visitors', 'visitors');
        columnChart(document.getElementById('chart-apply'), data.series, 'apply', 'apply clicks');
        renderTop(data.top);
        barList(document.getElementById('stats-category'), Object.entries(data.apply_by_category));
        barList(document.getElementById('stats-region'),
            Object.entries(data.apply_by_region).map(([k, v]) => [REGION_LABEL[k] || k, v]));
    }

    function renderTiles(tiles) {
        const box = document.getElementById('stat-tiles');
        box.replaceChildren(...tiles.map(t => {
            const tile = el('div', 'stat-tile');
            tile.append(el('p', 'stat-label', t.label), el('p', 'stat-value', t.value), el('p', 'stat-sub', t.sub));
            return tile;
        }));
    }

    // Rounds a maximum up to 1, 2, or 5 × a power of ten so axis ticks are clean numbers
    function niceMax(value) {
        if (value <= 4) return 4;
        const power = 10 ** Math.floor(Math.log10(value));
        const step = [1, 2, 5, 10].find(s => s * power >= value);
        return step * power;
    }

    function columnChart(host, series, key, unit) {
        const values = series.map(d => d[key]);
        const max = niceMax(Math.max(...values, 0));
        host.replaceChildren();

        const plot = el('div', 'col-plot');
        [max, max / 2, 0].forEach(tick => {
            const line = el('div', 'col-grid');
            line.style.bottom = `${(tick / max) * 100}%`;
            line.append(el('span', 'col-tick', fmt(tick)));
            plot.append(line);
        });

        const tooltip = el('div', 'chart-tooltip');
        tooltip.hidden = true;
        const cols = el('div', 'col-columns');
        series.forEach(d => {
            const col = el('div', 'col-hit');
            col.tabIndex = 0;
            col.setAttribute('role', 'img');
            col.setAttribute('aria-label', `${shortDay(d.day)}: ${d[key]} ${unit}`);
            const bar = el('div', 'col-bar');
            bar.style.height = `${(d[key] / max) * 100}%`;
            col.append(bar);
            const show = () => {
                tooltip.replaceChildren(el('strong', null, fmt(d[key])), el('span', null, ` ${unit} · ${shortDay(d.day)}`));
                tooltip.hidden = false;
                const hostBox = host.getBoundingClientRect();
                const colBox = col.getBoundingClientRect();
                const left = colBox.left - hostBox.left + colBox.width / 2;
                tooltip.style.left = `${Math.min(Math.max(left, 70), hostBox.width - 70)}px`;
                col.classList.add('is-active');
            };
            const hide = () => {
                tooltip.hidden = true;
                col.classList.remove('is-active');
            };
            col.addEventListener('pointerenter', show);
            col.addEventListener('pointerleave', hide);
            col.addEventListener('focus', show);
            col.addEventListener('blur', hide);
            cols.append(col);
        });
        plot.append(cols);

        const axis = el('div', 'col-axis');
        const middle = series[Math.floor(series.length / 2)];
        [series[0], middle, series[series.length - 1]].forEach(d => axis.append(el('span', null, shortDay(d.day))));

        // The same numbers as a table, for screen readers and anyone who prefers figures
        const details = el('details', 'chart-table');
        details.append(el('summary', null, 'Show as table'));
        const table = el('table');
        const head = el('tr');
        head.append(el('th', null, 'Day'), el('th', null, unit[0].toUpperCase() + unit.slice(1)));
        table.append(head);
        [...series].reverse().forEach(d => {
            const row = el('tr');
            row.append(el('td', null, shortDay(d.day)), el('td', null, fmt(d[key])));
            table.append(row);
        });
        details.append(table);

        host.append(plot, axis, tooltip, details);
    }

    function renderTop(top) {
        const box = document.getElementById('stats-top');
        if (!top.length) {
            box.replaceChildren(el('p', 'admin-hint', 'No clicks yet. They appear here once visitors open or apply to listings.'));
            return;
        }
        const table = el('table', 'stats-table');
        const head = el('tr');
        head.append(el('th', null, 'Opportunity'), el('th', 'num', 'Opened'), el('th', 'num', 'Apply clicks'));
        table.append(head);
        top.forEach(o => {
            const row = el('tr');
            const name = el('td');
            name.append(el('span', 'stats-opp', o.title), el('span', 'stats-meta', `${o.category} · ${REGION_LABEL[o.region] || o.region}`));
            row.append(name, el('td', 'num', fmt(o.details)), el('td', 'num', fmt(o.apply)));
            table.append(row);
        });
        box.replaceChildren(table);
    }

    function barList(box, entries) {
        entries = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        if (!entries.length) {
            box.replaceChildren(el('p', 'admin-hint', 'No apply clicks yet.'));
            return;
        }
        const max = Math.max(...entries.map(([, v]) => v));
        box.replaceChildren(...entries.map(([label, value]) => {
            const row = el('div', 'bar-row');
            row.setAttribute('role', 'img');
            row.setAttribute('aria-label', `${label}: ${value} apply clicks`);
            const track = el('div', 'bar-track');
            const bar = el('div', 'bar-fill');
            bar.style.width = `${(value / max) * 100}%`;
            track.append(bar);
            row.append(el('span', 'bar-label', label), track, el('span', 'bar-value', fmt(value)));
            return row;
        }));
    }
});
