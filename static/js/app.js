document.addEventListener('DOMContentLoaded', () => {
    // App State
    let opportunities = [];
    let currentCategory = 'all';
    let showBookmarksOnly = false;
    let searchQuery = '';

    // DOM Elements
    const grid = document.getElementById('opportunities-grid');
    const searchInput = document.getElementById('search-input');
    const bookmarkToggleBtn = document.getElementById('bookmark-toggle-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    // Modal Elements
    const linkedinModal = document.getElementById('linkedin-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const postArea = document.getElementById('post-area');
    const copyPostBtn = document.getElementById('copy-post-btn');
    
    // Toast container
    const toastContainer = document.getElementById('toast-container');

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
        fetchOpportunities();
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
            
            if (data.success) {
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
        
        let url = `/api/opportunities?bookmarks_only=${showBookmarksOnly}`;
        if (currentCategory !== 'all') {
            url += `&category=${currentCategory}`;
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
        
        // Front-end search filtering
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            filtered = opportunities.filter(opp => 
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
            
            const isBookmarkedClass = opp.is_bookmarked ? 'active' : '';
            const bookmarkIcon = opp.is_bookmarked ? 'favorite' : 'favorite_border';
            
            card.innerHTML = `
                <div class="card-header">
                    <span class="category-tag">${opp.category}</span>
                    <button class="bookmark-btn ${isBookmarkedClass}" data-id="${opp.id}" title="Bookmark this opportunity">
                        <i class="google-symbols">${bookmarkIcon}</i>
                    </button>
                </div>
                <h4 class="card-title" title="${opp.title}">${opp.title}</h4>
                <div class="card-org">
                    <i class="google-symbols" style="font-size: 1.1rem; color: var(--text-muted);">corporate_fare</i>
                    <span>${opp.organization || 'Global Sponsor'}</span>
                </div>
                <p class="card-body">${opp.description}</p>
                <div class="card-meta">
                    <div class="meta-item">
                        <i class="google-symbols" style="font-size: 1rem;">language</i>
                        <span>${opp.source || 'Aggregator'}</span>
                    </div>
                    <div class="meta-item deadline">
                        <i class="google-symbols" style="font-size: 1rem; color: #fbbf24;">event</i>
                        <span>Deadline: ${opp.deadline || 'Rolling'}</span>
                    </div>
                </div>
                <div class="card-actions">
                    <a href="${opp.url}" target="_blank" class="btn" style="flex: 1.2;">
                        <i class="google-symbols" style="font-size: 1rem;">open_in_new</i> View Details
                    </a>
                    <button class="btn btn-primary linkedin-gen-btn" data-id="${opp.id}">
                        <i class="google-symbols" style="font-size: 1.1rem;">share</i> LinkedIn Post
                    </button>
                </div>
            `;
            
            // Attach Event Listeners to Card Buttons
            card.querySelector('.bookmark-btn').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const oppId = btn.dataset.id;
                toggleBookmark(oppId, btn);
            });
            
            card.querySelector('.linkedin-gen-btn').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const oppId = btn.dataset.id;
                generateLinkedInPost(oppId, btn);
            });

            grid.appendChild(card);
        });
    }

    // Toggle Bookmark via Backend
    function toggleBookmark(oppId, btnElement) {
        fetch('/api/bookmarks/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ opportunity_id: oppId })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const icon = btnElement.querySelector('i');
                if (data.bookmarked) {
                    btnElement.classList.add('active');
                    icon.textContent = 'favorite';
                    showToast('Opportunity bookmarked!');
                } else {
                    btnElement.classList.remove('active');
                    icon.textContent = 'favorite_border';
                    showToast('Bookmark removed.');
                    
                    // If we are looking only at bookmarks, refetch
                    if (showBookmarksOnly) {
                        fetchOpportunities();
                    }
                }
                
                // Update local list object state without complete reload
                const opp = opportunities.find(o => o.id == oppId);
                if (opp) opp.is_bookmarked = data.bookmarked ? 1 : 0;
            }
        })
        .catch(err => {
            showToast('Could not save bookmark.', 'error');
            console.error(err);
        });
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
