// WhatsApp channel queue for the admin panel: builds ready-to-post messages and tracks
// which opportunities have been shared. Loaded after admin.js on the admin page.
document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('wa-card');
    if (!card) return;

    const siteUrl = card.dataset.siteUrl;
    const channelUrl = card.dataset.channelUrl;
    const list = document.getElementById('wa-list');
    const recentList = document.getElementById('wa-recent-list');
    let queue = [];
    const PAGE_SIZE = 10;
    let shownCount = PAGE_SIZE;

    const CATEGORY_EMOJI = { Scholarship: '🎓', Internship: '💼', Competition: '🏆', Job: '📢' };
    const CATEGORY_LABEL = { Scholarship: 'SCHOLARSHIP', Internship: 'INTERNSHIP', Competition: 'HACKATHON / COMPETITION', Job: 'TECH JOB' };

    loadQueue();
    // Refresh when the main listings change (approve, publish, sync)
    window.addEventListener('listings-changed', loadQueue);

    // ---- Message building ----
    // WhatsApp formatting: *bold*, _italic_. Asterisks/underscores in titles would break it.
    const plain = text => String(text || '').replace(/[*_~`]/g, '').trim();

    function deadlineLine(opp) {
        let line = `📅 Deadline: ${plain(opp.deadline) || 'Rolling'}`;
        if (opp.days_left !== null && opp.days_left !== undefined && opp.days_left >= 0 && opp.days_left <= 14) {
            line += opp.days_left === 0 ? ' (closes today!)' : ` (⏳ ${opp.days_left} day${opp.days_left === 1 ? '' : 's'} left)`;
        }
        return line;
    }

    function buildMessage(opp) {
        const lines = [
            `${CATEGORY_EMOJI[opp.category] || '📌'} *${CATEGORY_LABEL[opp.category] || 'OPPORTUNITY'}* 🇳🇬`,
            '',
            `*${plain(opp.title)}*${opp.is_verified ? ' ✅' : ''}`,
            `🏢 ${plain(opp.organization) || 'Global Sponsor'}`,
            deadlineLine(opp),
        ];
        if (opp.description) lines.push('', plain(opp.description));
        if (opp.eligibility && opp.eligibility.length) {
            lines.push('', '*Who can apply:*', ...opp.eligibility.slice(0, 5).map(e => `• ${plain(e)}`));
        }
        if (opp.required_documents && opp.required_documents.length) {
            lines.push('', `*Documents:* ${opp.required_documents.slice(0, 6).map(plain).join(', ')}`);
        }
        lines.push('', `👉 Apply: ${opp.apply_link || opp.url}`, '', `More opportunities: ${siteUrl}`);
        return lines.join('\n');
    }

    function buildDigest(items) {
        const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const lines = [`🇳🇬 *NaijaTech Opps: ${date}*`, '', `${items.length} opportunities for Nigerians in tech 👇`];
        items.forEach((opp, i) => {
            lines.push('', `${i + 1}. ${CATEGORY_EMOJI[opp.category] || '📌'} *${plain(opp.title)}*${opp.is_verified ? ' ✅' : ''}`,
                `   ${deadlineLine(opp)}`, `   👉 ${opp.apply_link || opp.url}`);
        });
        lines.push('', `See all opportunities: ${siteUrl}`);
        if (channelUrl) lines.push(`Share this channel: ${channelUrl}`);
        return lines.join('\n');
    }

    // ---- Data ----
    async function api(path, options = {}) {
        const res = await fetch(path, {
            ...options,
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        if (res.status === 401) {
            window.location.reload();
            throw new Error('Logged out');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
    }

    async function loadQueue() {
        try {
            const data = await api('/admin/api/whatsapp');
            queue = data.queue;
            renderQueue();
            renderRecent(data.recent);
        } catch (err) {
            list.innerHTML = `<p class="admin-error">${escapeHtml(err.message)}</p>`;
        }
    }

    async function mark(ids, action, message) {
        try {
            await api('/admin/api/whatsapp/mark', { method: 'POST', body: { ids, action } });
            if (message) toast(message);
            loadQueue();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    // ---- Rendering ----
    function renderQueue() {
        document.getElementById('wa-count').textContent = `(${queue.length} to share)`;
        if (!queue.length) {
            list.innerHTML = '<p class="admin-hint" style="padding: 1rem 0;">All caught up! New opportunities will appear here.</p>';
            return;
        }
        list.innerHTML = '';
        // Soonest deadlines first, so time-sensitive posts go out before they expire
        const ordered = [...queue].sort((a, b) => sortKey(a) - sortKey(b));
        ordered.slice(0, shownCount).forEach(opp => {
            const message = buildMessage(opp);
            const row = document.createElement('div');
            row.className = 'admin-item wa-item';
            row.innerHTML = `
                <div class="admin-item-main">
                    <div class="admin-item-title">${escapeHtml(CATEGORY_EMOJI[opp.category] || '')} ${escapeHtml(opp.title)}</div>
                    <div class="admin-item-meta">${escapeHtml(opp.source || '')} · Deadline: ${escapeHtml(opp.deadline || 'n/a')}</div>
                    <details class="wa-preview">
                        <summary>Preview message</summary>
                        <textarea class="search-input admin-input wa-text" rows="10"></textarea>
                    </details>
                </div>
                <div class="admin-item-actions">
                    <button class="btn btn-primary" data-action="copy"><i class="google-symbols">content_copy</i> Copy</button>
                    <a class="btn" data-action="open" target="_blank" rel="noopener noreferrer" title="Open WhatsApp with this message">
                        <i class="google-symbols">send</i></a>
                    <button class="btn" data-action="posted" title="Mark as posted"><i class="google-symbols">done</i> Posted</button>
                    <button class="btn" data-action="skip" title="Don't post this one">Skip</button>
                </div>
            `;
            const textarea = row.querySelector('.wa-text');
            textarea.value = message;
            // Edits in the preview are what gets copied/opened
            row.querySelector('[data-action="open"]').addEventListener('click', e => {
                e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(textarea.value)}`;
            });
            row.querySelector('[data-action="copy"]').addEventListener('click', async e => {
                const btn = e.currentTarget;
                if (await copy(textarea.value)) {
                    btn.innerHTML = '<i class="google-symbols">check</i> Copied';
                    setTimeout(() => { btn.innerHTML = '<i class="google-symbols">content_copy</i> Copy'; }, 2000);
                    toast('Copied! Paste it into the channel, then click "Posted".');
                }
            });
            row.querySelector('[data-action="posted"]').addEventListener('click', () => mark([opp.id], 'posted', 'Marked as posted.'));
            row.querySelector('[data-action="skip"]').addEventListener('click', () => mark([opp.id], 'skipped', 'Skipped.'));
            list.appendChild(row);
        });
        if (ordered.length > shownCount) {
            const more = document.createElement('button');
            more.className = 'btn';
            more.style.marginTop = '1rem';
            more.textContent = `Show ${Math.min(PAGE_SIZE, ordered.length - shownCount)} more (${ordered.length - shownCount} hidden)`;
            more.addEventListener('click', () => {
                shownCount += PAGE_SIZE;
                renderQueue();
            });
            list.appendChild(more);
        }
    }

    function renderRecent(items) {
        if (!items.length) {
            recentList.innerHTML = '<p class="admin-hint" style="padding: 0.75rem 0;">Nothing yet.</p>';
            return;
        }
        recentList.innerHTML = '';
        items.forEach(opp => {
            const row = document.createElement('div');
            row.className = 'admin-item';
            const when = opp.whatsapp_at ? new Date(opp.whatsapp_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
            row.innerHTML = `
                <div class="admin-item-main">
                    <div class="admin-item-title">${escapeHtml(opp.title)}</div>
                    <div class="admin-item-meta">${opp.whatsapp_status === 'posted' ? 'Posted' : 'Skipped'} · ${escapeHtml(when)}</div>
                </div>
                <div class="admin-item-actions"><button class="btn" data-action="undo">Undo</button></div>
            `;
            row.querySelector('[data-action="undo"]').addEventListener('click', () => mark([opp.id], 'undo', 'Back in the queue.'));
            recentList.appendChild(row);
        });
    }

    function sortKey(opp) {
        return opp.days_left === null || opp.days_left === undefined ? 9999 : opp.days_left;
    }

    // ---- Toolbar ----
    document.getElementById('wa-digest-btn').addEventListener('click', async () => {
        if (!queue.length) {
            toast('The queue is empty.', 'error');
            return;
        }
        const size = parseInt(document.getElementById('wa-digest-size').value, 10);
        const items = [...queue].sort((a, b) => sortKey(a) - sortKey(b)).slice(0, size);
        if (!(await copy(buildDigest(items)))) return;
        if (confirm(`Roundup of ${items.length} copied. Paste it into the channel.\n\nMark these ${items.length} as posted now?`)) {
            mark(items.map(o => o.id), 'posted', `${items.length} marked as posted.`);
        }
    });

    document.getElementById('wa-clear-btn').addEventListener('click', () => {
        if (!queue.length) return;
        if (confirm(`Mark all ${queue.length} opportunities in the queue as handled? Only opportunities added after this will appear.`)) {
            mark(queue.map(o => o.id), 'skipped', 'Backlog cleared.');
        }
    });

    // ---- Helpers ----
    async function copy(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            toast('Could not copy automatically. Open "Preview message" and copy it by hand.', 'error');
            return false;
        }
    }

    function toast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = 'toast';
        if (type === 'error') el.style.background = '#ef4444';
        const icon = document.createElement('i');
        icon.className = 'google-symbols';
        icon.style.fontSize = '1.25rem';
        icon.textContent = type === 'success' ? 'check_circle' : 'error';
        const text = document.createElement('span');
        text.textContent = message;
        el.append(icon, text);
        container.appendChild(el);
        setTimeout(() => {
            el.style.animation = 'slideIn 0.3s ease reverse forwards';
            setTimeout(() => el.remove(), 300);
        }, 3500);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
});
