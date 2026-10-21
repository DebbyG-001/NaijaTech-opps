document.addEventListener('DOMContentLoaded', () => {
    // App State
    let opportunities = [];
    let currentCategory = 'all';
    let showBookmarksOnly = false;
    let searchQuery = '';
    // Bookmarks live in this browser only, keyed by URL so they survive server restarts
    const bookmarkedUrls = new Set(loadBookmarks());

    // DOM Elements
    const grid = document.getElementById('opportunities-grid');
    const searchInput = document.getElementById('search-input');
    const bookmarkToggleBtn = document.getElementById('bookmark-toggle-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-icon');
    
    
    // Details modal
    const detailsModal = document.getElementById('details-modal');

    // Toast container
    const toastContainer = document.getElementById('toast-container');

    // Check local storage for theme preference
    if (storageGet('theme') === 'light') {
        document.body.classList.add('light-mode');
        if (themeIcon) themeIcon.textContent = 'dark_mode';
    }

    // Category Color Mapping for dynamic border top and styling
    const categoryColors = {
        'Scholarship': '#10b981', // emerald
        'Internship': '#06b6d4',  // cyan
        'Competition': '#ec4899', // pink
        'Job': '#f59e0b'          // amber
    };

    // Load Initial Data
    fetchOpportunities();

    // Event Listeners
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            if (themeIcon) themeIcon.textContent = isLight ? 'dark_mode' : 'light_mode';
            storageSet('theme', isLight ? 'light' : 'dark');
            showToast(`Switched to ${isLight ? 'Light' : 'Dark'} Mode!`);
        });
    }

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderOpportunities();
    });

    bookmarkToggleBtn.addEventListener('click', () => {
        showBookmarksOnly = !showBookmarksOnly;
        if (showBookmarksOnly) {
            bookmarkToggleBtn.classList.add('active');
            bookmarkToggleBtn.style.background = 'rgba(244, 63, 94, 0.15)';
            bookmarkToggleBtn.style.borderColor = 'rgba(244, 63, 94, 0.3)';
            bookmarkToggleBtn.style.color = '#fb7185';
            bookmarkToggleBtn.innerHTML = '❤️ Bookmarks Active';
        } else {
            bookmarkToggleBtn.classList.remove('active');
            bookmarkToggleBtn.style.background = '';
            bookmarkToggleBtn.style.borderColor = '';
            bookmarkToggleBtn.style.color = '';
            bookmarkToggleBtn.innerHTML = '📂 View Bookmarks';
        }
        renderOpportunities();
    });

    refreshBtn.addEventListener('click', () => {
        const refreshIcon = refreshBtn.querySelector('i');
        refreshIcon.classList.add('spinning');
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<div class="loading-spinner"></div> Updating...';

        fetch('/api/opportunities/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(res => res.json())
        .then(data => {
            refreshIcon.classList.remove('spinning');
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="google-symbols">sync</i> Sync Opportunities';
            
            if (data.skipped) {
                showToast('Listings were synced recently. Check back in a few minutes!');
                fetchOpportunities();
            } else if (data.success) {
                showToast('Fetching the latest opportunities. New ones will appear in about a minute.');
                // The sync runs in the background on the server; reload when it's likely done
                setTimeout(fetchOpportunities, 30000);
                setTimeout(fetchOpportunities, 75000);
            } else {
                showToast(`Failed to sync: ${data.error}`, 'error');
            }
        })
        .catch(err => {
            refreshIcon.classList.remove('spinning');
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="google-symbols">sync</i> Sync Opportunities';
            showToast('Network error during sync.', 'error');
            console.error(err);
        });
    });

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            fetchOpportunities();
        });
    });

    // Close Modal Events
    document.getElementById('close-details').addEventListener('click', () => {
        detailsModal.classList.remove('active');
    });

    window.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
            detailsModal.classList.remove('active');
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            detailsModal.classList.remove('active');
        }
    });


    // Core Fetch Function
    function fetchOpportunities() {
        grid.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="width: 40px; height: 40px;"></div><p style="margin-top: 1rem;">Fetching opportunities...</p></div>';
        
        let url = '/api/opportunities';
        if (currentCategory !== 'all') {
            url += `?category=${encodeURIComponent(currentCategory)}`;
        }
        
        fetch(url)
            .then(res => res.json())
            .then(data => {
                opportunities = data;
                renderOpportunities();
            })
            .catch(err => {
                grid.innerHTML = '<div class="empty-state"><i class="google-symbols">error</i><h3>Network Error</h3><p>Could not connect to the database. Please verify your Flask backend is running.</p></div>';
                console.error(err);
            });
    }

    // Core Render Function
    function renderOpportunities() {
        grid.innerHTML = '';
        
        let filtered = opportunities;

        if (showBookmarksOnly) {
            filtered = filtered.filter(opp => bookmarkedUrls.has(opp.url));
        }

        // Front-end search filtering
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(opp =>
                opp.title.toLowerCase().includes(query) || 
                (opp.organization || '').toLowerCase().includes(query) || 
                (opp.description || '').toLowerCase().includes(query)
            );
        }

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="google-symbols">search_off</i>
                    <h3>No Opportunities Found</h3>
                    <p>Try refining your search query or switching filters.</p>
                </div>
            `;
            return;
        }

        filtered.forEach(opp => {
            const card = document.createElement('div');
            card.className = opp.is_expired ? 'opportunity-card is-expired' : 'opportunity-card';
            
            const color = categoryColors[opp.category] || '#64748b';
            card.style.setProperty('--category-color', color);
            
            const isBookmarked = bookmarkedUrls.has(opp.url);
            const isBookmarkedClass = isBookmarked ? 'active' : '';
            const bookmarkIcon = isBookmarked ? 'favorite' : 'favorite_border';

            // Listings come from third-party feeds, so every value is escaped before rendering
            card.innerHTML = `
                <div class="card-header">
                    <div class="card-tags">
                        <span class="category-tag">${escapeHtml(opp.category)}</span>
                        ${opp.region === 'nigeria' ? '<span class="nigeria-badge" title="For Nigerians or based in Nigeria"><i class="google-symbols">location_on</i> Nigeria</span>' : ''}
                        ${opp.is_verified ? '<span class="verified-badge" title="Apply link checked as genuine"><i class="google-symbols">verified</i> Verified</span>' : ''}
                        ${deadlineBadge(opp)}
                    </div>
                    <button class="bookmark-btn ${isBookmarkedClass}" title="Bookmark this opportunity">
                        <i class="google-symbols">${bookmarkIcon}</i>
                    </button>
                </div>
                <h4 class="card-title" title="${escapeHtml(opp.title)}">${escapeHtml(opp.title)}</h4>
                <div class="card-org">
                    <i class="google-symbols" style="font-size: 1.1rem; color: var(--text-muted);">corporate_fare</i>
                    <span>${escapeHtml(opp.organization || 'Global Sponsor')}</span>
                </div>
                <p class="card-body">${escapeHtml(opp.description)}</p>
                <div class="card-meta">
                    <div class="meta-item">
                        <i class="google-symbols" style="font-size: 1rem;">language</i>
                        <span>${escapeHtml(opp.source || 'Aggregator')}</span>
                    </div>
                    <div class="meta-item deadline">
                        <i class="google-symbols" style="font-size: 1rem; color: #fbbf24;">event</i>
                        <span>Deadline: ${escapeHtml(opp.deadline || 'Rolling')}</span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-primary details-btn" style="flex: 1; justify-content: center;">
                        <i class="google-symbols" style="font-size: 1rem;">info</i> View Details
                    </button>
                </div>
            `;
            
            // Attach Event Listeners to Card Buttons
            card.querySelector('.bookmark-btn').addEventListener('click', (e) => {
                toggleBookmark(opp.url, e.currentTarget);
            });
            
            card.querySelector('.details-btn').addEventListener('click', () => openDetails(opp));

            grid.appendChild(card);
        });
    }

    // "Deadline passed" for expired listings (the server hides them 3 days later),
    // "Closes today" / "N days left" when a deadline is within a week
    function deadlineBadge(opp) {
        if (opp.is_expired) {
            return '<span class="deadline-badge expired" title="This listing will be removed soon"><i class="google-symbols">event_busy</i> Deadline passed</span>';
        }
        if (opp.days_left !== null && opp.days_left !== undefined && opp.days_left <= 7) {
            const text = opp.days_left === 0 ? 'Closes today' : `${opp.days_left} day${opp.days_left === 1 ? '' : 's'} left`;
            return `<span class="deadline-badge soon"><i class="google-symbols">schedule</i> ${text}</span>`;
        }
        return '';
    }

    // Opportunity details popup
    function openDetails(opp) {
        document.getElementById('details-title').textContent = opp.title;

        const meta = [
            ['category', opp.category],
            ['corporate_fare', opp.organization || 'Global Sponsor'],
            ['event', `Deadline: ${opp.deadline || 'Rolling'}`],
        ];
        document.getElementById('details-meta').innerHTML =
            meta.map(([icon, text]) => `<span><i class="google-symbols" style="font-size: 1rem;">${icon}</i>${escapeHtml(text)}</span>`).join('') +
            (opp.region === 'nigeria' ? '<span class="nigeria-badge"><i class="google-symbols">location_on</i> Nigeria</span>' : '') +
            (opp.is_verified ? '<span class="verified-badge"><i class="google-symbols">verified</i> Verified</span>' : '') +
            deadlineBadge(opp);

        const section = (heading, items) => items && items.length ? `
            <div class="details-section">
                <h4>${heading}</h4>
                <ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
            </div>` : '';
        const hasDetails = (opp.eligibility || []).length || (opp.required_documents || []).length;

        document.getElementById('details-body').innerHTML = `
            <div class="details-section">
                <h4>About</h4>
                <p>${escapeHtml(opp.description || 'No summary available.')}</p>
            </div>
            ${section('Who can apply', opp.eligibility)}
            ${section('Required documents', opp.required_documents)}
            ${hasDetails ? '' : '<p class="details-section" style="color: var(--text-muted); font-size: 0.85rem;">See the full listing for eligibility and requirements.</p>'}
        `;

        const applyLink = document.getElementById('details-apply-link');
        const sourceLink = document.getElementById('details-source-link');
        applyLink.href = safeUrl(opp.apply_link || opp.url);
        sourceLink.href = safeUrl(opp.url);
        // Only show a separate "Full listing" button when it differs from the apply link
        sourceLink.style.display = opp.apply_link && opp.apply_link !== opp.url ? '' : 'none';

        detailsModal.classList.add('active');
    }

    // Toggle Bookmark (stored in this browser)
    function toggleBookmark(oppUrl, btnElement) {
        const icon = btnElement.querySelector('i');
        if (bookmarkedUrls.has(oppUrl)) {
            bookmarkedUrls.delete(oppUrl);
            btnElement.classList.remove('active');
            icon.textContent = 'favorite_border';
            showToast('Bookmark removed.');
            if (showBookmarksOnly) renderOpportunities();
        } else {
            bookmarkedUrls.add(oppUrl);
            btnElement.classList.add('active');
            icon.textContent = 'favorite';
            showToast('Opportunity bookmarked!');
        }
        storageSet('bookmarks', JSON.stringify([...bookmarkedUrls]));
    }

    function loadBookmarks() {
        try {
            const saved = JSON.parse(storageGet('bookmarks') || '[]');
            return Array.isArray(saved) ? saved : [];
        } catch (e) {
            return [];
        }
    }

    // localStorage can throw in private browsing or when site data is blocked
    function storageGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function storageSet(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* preference just won't persist */ }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Only allow http(s) links so a feed can't inject javascript: URLs
    function safeUrl(url) {
        try {
            const parsed = new URL(url, window.location.origin);
            return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
        } catch (e) {
            return '#';
        }
    }

    // Toast Alert Notification System
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = 'toast';
        if (type === 'error') {
            toast.style.background = '#ef4444'; // Red for error
        }
        
        const iconName = type === 'success' ? 'check_circle' : 'error';
        toast.innerHTML = `
            <i class="google-symbols" style="font-size: 1.25rem;">${iconName}</i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        // Remove toast after 3.5 seconds
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3500);
    }
});
