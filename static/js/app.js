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
    
    // Modal Elements
    const linkedinModal = document.getElementById('linkedin-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const postArea = document.getElementById('post-area');
    const copyPostBtn = document.getElementById('copy-post-btn');
    
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
                showToast(`Successfully retrieved ${data.new_count} new opportunities!`);
                fetchOpportunities();
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
    closeModalBtn.addEventListener('click', () => {
        linkedinModal.classList.remove('active');
    });

    window.addEventListener('click', (e) => {
        if (e.target === linkedinModal) {
            linkedinModal.classList.remove('active');
        }
    });

    // Copy Post to Clipboard
    copyPostBtn.addEventListener('click', () => {
        postArea.select();
        postArea.setSelectionRange(0, 99999); // For mobile devices
        
        navigator.clipboard.writeText(postArea.value)
            .then(() => {
                showToast('Post copied to clipboard!');
                copyPostBtn.innerHTML = '<i class="google-symbols">check</i> Copied!';
                copyPostBtn.style.background = '#10b981';
                setTimeout(() => {
                    copyPostBtn.innerHTML = '<i class="google-symbols">content_copy</i> Copy Draft';
                    copyPostBtn.style.background = '';
                }, 2000);
            })
            .catch(err => {
                showToast('Failed to copy text.', 'error');
                console.error(err);
            });
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
            card.className = 'opportunity-card';
            
            const color = categoryColors[opp.category] || '#64748b';
            card.style.setProperty('--category-color', color);
            
            const isBookmarked = bookmarkedUrls.has(opp.url);
            const isBookmarkedClass = isBookmarked ? 'active' : '';
            const bookmarkIcon = isBookmarked ? 'favorite' : 'favorite_border';

            // Listings come from third-party feeds, so every value is escaped before rendering
            card.innerHTML = `
                <div class="card-header">
                    <span class="category-tag">${escapeHtml(opp.category)}</span>
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
                    <a href="${escapeHtml(safeUrl(opp.url))}" target="_blank" rel="noopener noreferrer" class="btn" style="flex: 1.2;">
                        <i class="google-symbols" style="font-size: 1rem;">open_in_new</i> View Details
                    </a>
                    <button class="btn btn-primary linkedin-gen-btn" data-id="${opp.id}">
                        <i class="google-symbols" style="font-size: 1.1rem;">share</i> LinkedIn Post
                    </button>
                </div>
            `;
            
            // Attach Event Listeners to Card Buttons
            card.querySelector('.bookmark-btn').addEventListener('click', (e) => {
                toggleBookmark(opp.url, e.currentTarget);
            });
            
            card.querySelector('.linkedin-gen-btn').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const oppId = btn.dataset.id;
                generateLinkedInPost(oppId, btn);
            });

            grid.appendChild(card);
        });
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

    // Generate LinkedIn Post Draft
    function generateLinkedInPost(oppId, btnElement) {
        const originalContent = btnElement.innerHTML;
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loading-spinner" style="width: 14px; height: 14px;"></div> Generating...';

        fetch('/api/linkedin/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ opportunity_id: oppId })
        })
        .then(res => res.json())
        .then(data => {
            btnElement.disabled = false;
            btnElement.innerHTML = originalContent;
            
            if (data.success) {
                postArea.value = data.post;
                linkedinModal.classList.add('active');
            } else {
                showToast(`Generation failed: ${data.error}`, 'error');
            }
        })
        .catch(err => {
            btnElement.disabled = false;
            btnElement.innerHTML = originalContent;
            showToast('Failed to connect to generator api.', 'error');
            console.error(err);
        });
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
