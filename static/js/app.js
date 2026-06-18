/**
 * BigQuery Release Notes Radar - Client App
 */

// Application State
const state = {
    allUpdates: [],
    filteredUpdates: [],
    selectedUpdate: null,
    currentFilter: 'all',
    searchQuery: '',
    lastUpdated: ''
};

// DOM Elements
const elements = {
    btnRefresh: document.getElementById('btn-refresh'),
    spinnerIcon: document.getElementById('spinner-icon'),
    lastUpdatedText: document.getElementById('last-updated-text'),
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    filterChipsContainer: document.getElementById('filter-chips-container'),
    feedContainer: document.getElementById('feed-container'),
    
    // Detail Panel
    emptyDetailState: document.getElementById('empty-detail-state'),
    detailContentWrapper: document.getElementById('detail-content-wrapper'),
    detailBadge: document.getElementById('detail-badge'),
    detailDate: document.getElementById('detail-date'),
    detailTitle: document.getElementById('detail-title'),
    detailBodyHtml: document.getElementById('detail-body-html'),
    
    // Tweet Composer
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCount: document.getElementById('char-count'),
    charCounter: document.getElementById('char-counter'),
    btnAutoDraft: document.getElementById('btn-auto-draft'),
    btnCopyTweet: document.getElementById('btn-copy-tweet'),
    btnTweet: document.getElementById('btn-tweet'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    fetchReleaseNotes(false);
    setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
    // Refresh feed
    elements.btnRefresh.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    // Local Search Input
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        elements.clearSearch.style.display = state.searchQuery ? 'block' : 'none';
        applyFiltersAndRender();
    });

    // Clear Search
    elements.clearSearch.addEventListener('click', () => {
        elements.searchInput.value = '';
        state.searchQuery = '';
        elements.clearSearch.style.display = 'none';
        applyFiltersAndRender();
        elements.searchInput.focus();
    });

    // Filter Chips Selection
    elements.filterChipsContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;

        // Update active class on chips
        document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        state.currentFilter = chip.dataset.type;
        applyFiltersAndRender();
    });

    // Tweet Textarea Input (Update char counts)
    elements.tweetTextarea.addEventListener('input', () => {
        updateCharacterCount();
    });

    // Auto draft tweet button
    elements.btnAutoDraft.addEventListener('click', () => {
        if (state.selectedUpdate) {
            draftTweet(state.selectedUpdate);
            showToast('🔄 Regenerated auto-draft!');
        }
    });

    // Copy tweet to clipboard
    elements.btnCopyTweet.addEventListener('click', () => {
        const text = elements.tweetTextarea.value;
        if (!text) return;

        navigator.clipboard.writeText(text)
            .then(() => {
                showToast('📋 Copied tweet to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                showToast('❌ Copy failed. Please copy manually.');
            });
    });

    // Tweet / X Post Button (Open Twitter Web Intent)
    elements.btnTweet.addEventListener('click', () => {
        const text = elements.tweetTextarea.value;
        if (!text) return;
        
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank', 'noopener,noreferrer');
        showToast('🚀 Opened Twitter / X composer!');
    });
}

// Fetch Release Notes API
function fetchReleaseNotes(forceRefresh = false) {
    // Show Loading state
    elements.spinnerIcon.classList.add('spinning');
    elements.btnRefresh.disabled = true;
    
    if (forceRefresh) {
        // Clear current feed list to show refresh action visually
        elements.feedContainer.innerHTML = `
            <div class="shimmer-placeholder">
                <div class="shimmer-card"></div>
                <div class="shimmer-card"></div>
                <div class="shimmer-card"></div>
            </div>
        `;
    }

    const url = `/api/release-notes${forceRefresh ? '?refresh=true' : ''}`;

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            state.allUpdates = data.updates || [];
            state.lastUpdated = data.last_updated || 'Unknown';
            
            elements.lastUpdatedText.textContent = `Sync: ${state.lastUpdated}`;
            
            applyFiltersAndRender();
            
            // If we have updates, auto-select the first one by default if nothing is selected
            if (state.filteredUpdates.length > 0 && !state.selectedUpdate) {
                selectUpdate(state.filteredUpdates[0]);
            }
            
            showToast(forceRefresh ? '⚡ Refreshed feed successfully!' : '✅ Connected and synced!');
        })
        .catch(err => {
            console.error('Error fetching release notes:', err);
            showToast('❌ Failed to fetch release notes.');
            
            elements.feedContainer.innerHTML = `
                <div class="no-results">
                    <h3>Failed to load release notes</h3>
                    <p>Please check your internet connection or backend server status.</p>
                    <button class="btn btn-secondary btn-sm" onclick="location.reload()" style="margin-top: 12px;">Retry Reload</button>
                </div>
            `;
        })
        .finally(() => {
            elements.spinnerIcon.classList.remove('spinning');
            elements.btnRefresh.disabled = false;
        });
}

// Apply current Filters and Search queries
function applyFiltersAndRender() {
    state.filteredUpdates = state.allUpdates.filter(update => {
        // 1. Filter by Type chip
        const matchesType = (state.currentFilter === 'all') || (update.type === state.currentFilter);
        
        // 2. Filter by search query
        const matchesSearch = !state.searchQuery || 
            update.type.toLowerCase().includes(state.searchQuery) ||
            update.date.toLowerCase().includes(state.searchQuery) ||
            update.text.toLowerCase().includes(state.searchQuery);
            
        return matchesType && matchesSearch;
    });

    renderFeed();
}

// Render the Feed list
function renderFeed() {
    elements.feedContainer.innerHTML = '';

    if (state.filteredUpdates.length === 0) {
        elements.feedContainer.innerHTML = `
            <div class="no-results">
                <h3>No release notes match your filters</h3>
                <p>Try clearing your search query or selecting a different update type chip.</p>
            </div>
        `;
        return;
    }

    state.filteredUpdates.forEach(update => {
        const card = document.createElement('article');
        card.className = 'feed-card';
        card.dataset.id = update.id;
        
        // Apply type-specific colors to class lists dynamically
        const typeClass = `badge-${update.type.toLowerCase()}`;
        
        if (state.selectedUpdate && state.selectedUpdate.id === update.id) {
            card.classList.add('selected');
        }

        // Card HTML Structure
        card.innerHTML = `
            <div class="card-meta">
                <span class="type-badge ${typeClass}">${update.type}</span>
                <span class="date-text">${update.date}</span>
            </div>
            <p class="card-excerpt">${update.text}</p>
        `;

        card.addEventListener('click', () => {
            selectUpdate(update);
            
            // Highlight selected card and un-highlight others
            document.querySelectorAll('.feed-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        });

        elements.feedContainer.appendChild(card);
    });
}

// Select a specific release note update
function selectUpdate(update) {
    state.selectedUpdate = update;
    
    // Hide empty state and show content wrapper
    elements.emptyDetailState.style.display = 'none';
    elements.detailContentWrapper.style.display = 'flex';
    
    // Populate Detail Details
    elements.detailDate.textContent = update.date;
    
    // Clear and build type badge
    elements.detailBadge.className = 'type-badge';
    elements.detailBadge.textContent = update.type;
    elements.detailBadge.classList.add(`badge-${update.type.toLowerCase()}`);
    
    // Setup title
    elements.detailTitle.textContent = `${update.type} Update`;
    
    // Render content HTML safely
    elements.detailBodyHtml.innerHTML = update.body_html;
    
    // Create tweet draft automatically
    draftTweet(update);

    // Auto-scroll detail panel back to top
    elements.detailContentWrapper.parentElement.scrollTop = 0;
}

// Auto draft tweet template based on character limits
function draftTweet(update) {
    const header = `📢 BigQuery ${update.type} (${update.date}):\n\n`;
    const hashtags = `\n\n#BigQuery #GCP #GoogleCloud`;
    
    // Max characters available for description body
    const maxDescLength = 280 - header.length - hashtags.length - 5; // cushion for safety
    
    let bodyText = update.text;
    
    // If the text description exceeds the remaining characters limit, truncate it
    if (bodyText.length > maxDescLength) {
        bodyText = bodyText.substring(0, maxDescLength - 3) + '...';
    }
    
    const draft = `${header}${bodyText}${hashtags}`;
    
    elements.tweetTextarea.value = draft;
    updateCharacterCount();
}

// Update live character counts inside the Tweet Composer
function updateCharacterCount() {
    const text = elements.tweetTextarea.value;
    const length = text.length;
    
    elements.charCount.textContent = length;
    
    // Visual warning indicators based on character budget
    elements.charCounter.className = 'char-counter';
    if (length > 280) {
        elements.charCounter.classList.add('error');
    } else if (length > 250) {
        elements.charCounter.classList.add('warning');
    }
}

// Display Toast alert notifications
function showToast(message) {
    elements.toastMessage.textContent = message;
    elements.toast.style.display = 'flex';
    elements.toast.classList.add('show');
    
    // Auto hide after 3 seconds
    setTimeout(() => {
        elements.toast.classList.remove('show');
        setTimeout(() => {
            elements.toast.style.display = 'none';
        }, 300);
    }, 2700);
}
