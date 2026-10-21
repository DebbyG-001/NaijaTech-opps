document.addEventListener('DOMContentLoaded', () => {
    let currentStatus = 'pending';
    let listings = [];

    const $ = id => document.getElementById(id);
    const form = $('opp-form');
    const extractStatus = $('extract-status');
    const list = $('admin-list');
    const toastContainer = $('toast-container');

    // Match the visitor-facing site's theme choice
    try {
        if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
    } catch (e) { /* storage blocked */ }

    loadListings();

    // ---- API helper ----
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
        let data = {};
        try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
        if (!res.ok) {
            const error = new Error(data.error || `Request failed (${res.status})`);
            error.code = data.code;
            throw error;
        }
        return data;
    }

    // ---- Add from a link ----
    $('extract-btn').addEventListener('click', () => {
        const url = $('extract-url').value.trim();
        if (!url) {
            $('extract-url').focus();
            return;
        }
        runExtract({ url }, $('extract-btn'), 'Read link', 'Reading the page. This can take up to a minute...');
    });

    $('paste-btn').addEventListener('click', () => {
        const text = $('paste-text').value.trim();
        if (!text) {
            $('paste-text').focus();
            return;
        }
        runExtract({ url: $('extract-url').value.trim(), text }, $('paste-btn'), 'Read pasted text',
            'Reading the pasted text. This can take up to a minute...');
    });

    async function runExtract(body, btn, label, waitMessage) {
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner" style="width: 14px; height: 14px;"></div> Reading...';
        setStatus(waitMessage);
        try {
            const { draft } = await api('/admin/api/extract', { method: 'POST', body });
            fillForm(draft);
            if (body.text) $('paste-section').open = false;
            if (draft.existing) {
                setStatus(`This link is already on the site (${draft.existing.status}). Find it in the list below to edit it.`, 'warn');
            } else if (!draft.used_ai) {
                setStatus('AI is not configured, so only the page title and summary were filled in. Add the rest by hand.', 'warn');
            } else if (draft.open_to_nigerians === false) {
                setStatus('Done. Heads up: the page suggests this may NOT be open to Nigerians. Check before publishing.', 'warn');
            } else {
                setStatus('Done. Check the details below, then publish.');
            }
        } catch (err) {
            setStatus(err.message, err.code === 'login_required' ? 'warn' : 'error');
            if (err.code === 'login_required') {
                // Point the admin straight at the paste box
                $('paste-section').open = true;
                $('paste-text').focus();
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="google-symbols">auto_awesome</i> ${label}`;
        }
    }

    $('extract-url').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            $('extract-btn').click();
        }
    });

    $('manual-btn').addEventListener('click', () => {
        fillForm({ url: $('extract-url').value.trim(), category: 'Competition' });
        setStatus('');
    });

    $('cancel-btn').addEventListener('click', resetForm);

    form.addEventListener('submit', e => {
        e.preventDefault();
        saveForm('published');
    });
    $('save-pending-btn').addEventListener('click', () => saveForm('pending'));

    function fillForm(opp) {
        $('f-id').value = opp.id || '';
        $('f-source').value = opp.source || '';
        $('f-title').value = opp.title || '';
        $('f-category').value = opp.category || 'Competition';
        $('f-organization').value = opp.organization || '';
        $('f-deadline').value = opp.deadline || '';
        $('f-apply-link').value = opp.apply_link || '';
        $('f-url').value = opp.url || '';
        $('f-description').value = opp.description || '';
        $('f-eligibility').value = (opp.eligibility || []).join('\n');
        $('f-documents').value = (opp.required_documents || []).join('\n');
        $('f-verified').checked = !!opp.is_verified;
        $('publish-btn').innerHTML = opp.id
            ? '<i class="google-symbols">save</i> Save &amp; publish'
            : '<i class="google-symbols">publish</i> Publish';
        form.hidden = false;
        $('f-title').focus();
    }

    function resetForm() {
        form.reset();
        $('f-id').value = '';
        form.hidden = true;
        setStatus('');
        $('paste-text').value = '';
    }

    async function saveForm(status) {
        if (!form.reportValidity()) return;
        const id = $('f-id').value;
        const body = {
            title: $('f-title').value,
            category: $('f-category').value,
            organization: $('f-organization').value,
            deadline: $('f-deadline').value,
            apply_link: $('f-apply-link').value,
            url: $('f-url').value,
            description: $('f-description').value,
            eligibility: $('f-eligibility').value,
            required_documents: $('f-documents').value,
            is_verified: $('f-verified').checked,
            source: $('f-source').value || 'Admin',
            status,
        };
        try {
            if (id) {
                await api(`/admin/api/opportunities/${id}`, { method: 'PUT', body });
            } else {
                await api('/admin/api/opportunities', { method: 'POST', body });
            }
            showToast(status === 'published' ? 'Published! It is now live on the site.' : 'Saved for review.');
            resetForm();
            $('extract-url').value = '';
            loadListings();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    function setStatus(message, type = '') {
        extractStatus.textContent = message;
        extractStatus.className = `admin-status ${type}`;
    }

    // ---- Listings ----
    document.querySelectorAll('.filter-btn[data-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn[data-status]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentStatus = btn.dataset.status;
            renderListings();
        });
    });

    $('admin-search').addEventListener('input', renderListings);

    $('sync-btn').addEventListener('click', async () => {
        const btn = $('sync-btn');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner" style="width: 14px; height: 14px;"></div> Syncing...';
        try {
            const data = await api('/admin/api/sync', { method: 'POST' });
            if (data.busy) {
                showToast('A sync is already running. New listings will appear shortly.');
            } else {
                const apifyNote = data.apify_configured ? '' : ' (Apify not connected yet)';
                showToast(`Sync started${apifyNote}. The list refreshes in about a minute.`);
            }
            // The sync runs in the background on the server; reload when it's likely done
            setTimeout(loadListings, 30000);
            setTimeout(loadListings, 75000);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="google-symbols">sync</i> Sync now';
        }
    });

    async function loadListings() {
        try {
            listings = await api('/admin/api/opportunities');
            renderListings();
            // Lets the WhatsApp queue refresh after approvals, edits, and syncs
            window.dispatchEvent(new Event('listings-changed'));
        } catch (err) {
            list.innerHTML = `<p class="admin-error">${escapeHtml(err.message)}</p>`;
        }
    }

    function renderListings() {
        const pending = listings.filter(o => o.status === 'pending');
        const published = listings.filter(o => o.status !== 'pending');
        $('pending-count').textContent = `(${pending.length})`;
        $('published-count').textContent = `(${published.length})`;

        const query = $('admin-search').value.trim().toLowerCase();
        let shown = currentStatus === 'pending' ? pending : published;
        if (query) {
            shown = shown.filter(o =>
                o.title.toLowerCase().includes(query) ||
                (o.organization || '').toLowerCase().includes(query) ||
                (o.source || '').toLowerCase().includes(query));
        }

        if (!shown.length) {
            list.innerHTML = `<p class="admin-hint" style="padding: 1rem 0;">${
                currentStatus === 'pending' ? 'Nothing waiting for review.' : 'No published opportunities match.'}</p>`;
            return;
        }

        list.innerHTML = '';
        shown.forEach(opp => {
            const row = document.createElement('div');
            row.className = 'admin-item';
            const expiry = opp.is_hidden
                ? '<span class="deadline-badge expired">Expired, hidden from site</span>'
                : opp.is_expired ? '<span class="deadline-badge expired">Deadline passed</span>' : '';
            const extra = [
                opp.eligibility.length ? `${opp.eligibility.length} eligibility` : '',
                opp.required_documents.length ? `${opp.required_documents.length} documents` : '',
            ].filter(Boolean).join(' · ');
            row.innerHTML = `
                <div class="admin-item-main">
                    <div class="admin-item-title">
                        ${opp.is_verified ? '<span class="verified-badge" title="Verified"><i class="google-symbols">verified</i></span>' : ''}
                        <a href="${escapeHtml(safeUrl(opp.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(opp.title)}</a>
                        ${expiry}
                    </div>
                    <div class="admin-item-meta">
                        ${escapeHtml(opp.category)} · ${escapeHtml(opp.organization || 'Unknown org')} · ${escapeHtml(opp.source || '')}
                        · Deadline: ${escapeHtml(opp.deadline || 'n/a')}${extra ? ' · ' + escapeHtml(extra) : ''}
                    </div>
                </div>
                <div class="admin-item-actions">
                    ${opp.status === 'pending'
                        ? '<button class="btn btn-primary" data-action="approve">Approve</button>'
                        : '<button class="btn" data-action="unpublish">Unpublish</button>'}
                    <button class="btn" data-action="edit">Edit</button>
                    <button class="btn btn-danger" data-action="delete" title="Delete"><i class="google-symbols">delete</i></button>
                </div>
            `;
            row.querySelector('[data-action="edit"]').addEventListener('click', () => {
                fillForm(opp);
                setStatus(`Editing "${opp.title}"`);
                form.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
                if (!confirm(`Delete "${opp.title}"? This cannot be undone.`)) return;
                await runAction(() => api(`/admin/api/opportunities/${opp.id}`, { method: 'DELETE' }), 'Deleted.');
            });
            const statusBtn = row.querySelector('[data-action="approve"], [data-action="unpublish"]');
            statusBtn.addEventListener('click', async () => {
                const status = opp.status === 'pending' ? 'published' : 'pending';
                await runAction(() => api(`/admin/api/opportunities/${opp.id}/status`, { method: 'POST', body: { status } }),
                    status === 'published' ? 'Approved and live!' : 'Moved back to review.');
            });
            list.appendChild(row);
        });
    }

    async function runAction(fn, message) {
        try {
            await fn();
            showToast(message);
            loadListings();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    // ---- Helpers ----
    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeUrl(url) {
        try {
            const parsed = new URL(url, window.location.origin);
            return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
        } catch (e) {
            return '#';
        }
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = 'toast';
        if (type === 'error') toast.style.background = '#ef4444';
        const icon = document.createElement('i');
        icon.className = 'google-symbols';
        icon.style.fontSize = '1.25rem';
        icon.textContent = type === 'success' ? 'check_circle' : 'error';
        const text = document.createElement('span');
        text.textContent = message;
        toast.append(icon, text);
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
});
