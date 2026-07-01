// Swimchain Forum Client - JavaScript

// Mock data
const spaces = [
    { id: 'rust-lang', name: 'rust-lang', icon: '🦀', posts: 892, newCount: 42 },
    { id: 'boston', name: 'boston', icon: '📍', posts: 345, newCount: 12 },
    { id: 'woodworking', name: 'woodworking', icon: '🪵', posts: 456, newCount: 8 },
    { id: 'fishing', name: 'fishing', icon: '🎣', posts: 123, newCount: 3 },
    { id: 'web-dev', name: 'web-dev', icon: '🌐', posts: 567, newCount: 18 },
    { id: 'self-hosting', name: 'self-hosting', icon: '🏠', posts: 234, newCount: 7 },
];

const threads = {
    'rust-lang': [
        {
            id: 1,
            title: 'Async traits finally stable!',
            author: 'cs1qab...3f2j',
            time: '2 hours ago',
            preview: 'Finally! After years of waiting, async traits are stable in Rust 1.75. Here\'s what this means for the ecosystem...',
            replies: 47,
            heat: 82,
            engagement: { current: 45, total: 60 },
            pinned: true
        },
        {
            id: 2,
            title: 'Performance tips for beginners',
            author: 'cs1qcd...8k2n',
            time: '4 hours ago',
            preview: 'A collection of patterns I\'ve learned while building async applications. Covers cancellation, timeouts, and...',
            replies: 23,
            heat: 71,
            engagement: { current: 38, total: 60 }
        },
        {
            id: 3,
            title: 'My first Rust CLI tool',
            author: 'cs1qef...1m3p',
            time: '6 hours ago',
            preview: 'Just finished building a command-line task manager. Here\'s what I learned about clap, error handling, and...',
            replies: 12,
            heat: 58,
            engagement: { current: 32, total: 60 }
        },
        {
            id: 4,
            title: 'Question about lifetimes',
            author: 'cs1qgh...4n5r',
            time: '12 hours ago',
            preview: 'I\'m confused about when to use \'a vs \'static. Can someone explain the difference in practical terms?',
            replies: 8,
            heat: 45,
            engagement: { current: 22, total: 60 }
        },
        {
            id: 5,
            title: 'Memory management patterns',
            author: 'cs1qij...6o7q',
            time: '1 day ago',
            preview: 'Exploring different approaches to memory management in systems programming with Rust...',
            replies: 5,
            heat: 28,
            engagement: { current: 15, total: 60 },
            decaying: true
        },
        {
            id: 6,
            title: 'Old thread about error handling',
            author: 'cs1qkl...8r9s',
            time: '5 days ago',
            preview: 'Discussion about anyhow vs thiserror and when to use each...',
            replies: 2,
            heat: 8,
            engagement: { current: 5, total: 60 },
            decaying: true
        }
    ]
};

const threadDetails = {
    1: {
        id: 1,
        title: 'Async traits finally stable!',
        author: 'cs1qab...3f2j',
        time: '2 hours ago',
        heat: 82,
        engagement: { current: 45, total: 60 },
        body: `Finally! After years of waiting, async traits are stable in Rust 1.75.

This is a huge milestone for the Rust ecosystem. Here's what this means:

1. **No more async-trait crate** - You can now write async fn in traits directly
2. **Better performance** - No more Box<dyn Future> overhead
3. **Cleaner code** - The syntax is now what you'd expect

Here's a simple example:

\`\`\`rust
trait Database {
    async fn get(&self, key: &str) -> Option<String>;
    async fn set(&self, key: &str, value: String);
}
\`\`\`

What are your thoughts? Anyone already migrating their crates?`,
        replies: [
            {
                id: 101,
                author: 'cs1qcd...8k2n',
                time: '1 hour ago',
                heat: 68,
                body: 'This is huge! I\'ve been waiting for this for my web server project. The async-trait crate was always a bit awkward.',
                replies: [
                    {
                        id: 102,
                        author: 'cs1qab...3f2j',
                        authorIsOP: true,
                        time: '45 min ago',
                        heat: 55,
                        body: 'Right? The ecosystem implications are massive. Tower and hyper are already updating.'
                    },
                    {
                        id: 103,
                        author: 'cs1qef...1m3p',
                        time: '30 min ago',
                        heat: 48,
                        body: 'Already seeing crates update. tokio merged support yesterday!'
                    }
                ]
            },
            {
                id: 104,
                author: 'cs1qgh...4n5r',
                time: '15 min ago',
                heat: 42,
                body: 'Anyone benchmarked the overhead compared to the old async-trait approach? Curious about the real-world performance difference.'
            }
        ]
    }
};

// State
let currentSpace = 'rust-lang';
let currentView = 'space'; // 'space' or 'thread'
let currentThread = null;

// DOM Elements
const spaceList = document.getElementById('spaceList');
const threadList = document.getElementById('threadList');
const spaceView = document.getElementById('spaceView');
const threadView = document.getElementById('threadView');
const threadContainer = document.getElementById('threadContainer');
const currentSpaceEl = document.getElementById('currentSpace');
const newPostBtn = document.getElementById('newPostBtn');
const newPostModal = document.getElementById('newPostModal');
const closeModal = document.getElementById('closeModal');
const submitPost = document.getElementById('submitPost');
const powOverlay = document.getElementById('powOverlay');
const powFill = document.getElementById('powFill');
const powTimeRemaining = document.getElementById('powTimeRemaining');
const cancelPow = document.getElementById('cancelPow');
const engageModal = document.getElementById('engageModal');
const closeEngageModal = document.getElementById('closeEngageModal');

// Initialize
function init() {
    renderSpaces();
    renderThreads(currentSpace);
    setupEventListeners();
    startDecaySimulation();
}

// Render functions
function renderSpaces() {
    spaceList.innerHTML = spaces.map(space => `
        <li class="space-item ${space.id === currentSpace ? 'active' : ''}" data-space="${space.id}">
            <span class="space-icon">${space.icon}</span>
            <span class="space-name">${space.name}</span>
            ${space.newCount > 0 ? `<span class="space-badge">${space.newCount}</span>` : ''}
        </li>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.space-item[data-space]').forEach(item => {
        item.addEventListener('click', () => {
            const spaceId = item.dataset.space;
            switchSpace(spaceId);
        });
    });
}

function renderThreads(spaceId) {
    const spaceThreads = threads[spaceId] || [];

    threadList.innerHTML = spaceThreads.map(thread => `
        <div class="thread-item ${thread.decaying ? 'decaying' : ''}" data-thread="${thread.id}">
            <div class="heat-indicator">
                <span class="heat-icon">${getHeatIcon(thread.heat)}</span>
                <div class="heat-bar">
                    <div class="heat-fill" style="height: ${thread.heat}%; background: ${getHeatColor(thread.heat)}"></div>
                </div>
                <span class="heat-percent">${thread.heat}%</span>
            </div>
            <div class="thread-content">
                <div class="thread-title">
                    ${thread.pinned ? '<span class="pin-badge">📌</span>' : ''}
                    ${thread.title}
                </div>
                <div class="thread-meta">
                    <span class="thread-author">${thread.author}</span>
                    <span>•</span>
                    <span>${thread.time}</span>
                </div>
                <div class="thread-preview">${thread.preview}</div>
            </div>
            <div class="thread-stats">
                <div class="stat-item">
                    <span>💬</span>
                    <span>${thread.replies} replies</span>
                </div>
                <div class="engagement-mini">
                    <span>⚡</span>
                    <div class="engagement-bar-mini">
                        <div class="engagement-fill-mini" style="width: ${(thread.engagement.current / thread.engagement.total) * 100}%"></div>
                    </div>
                    <span>${thread.engagement.current}s/${thread.engagement.total}s</span>
                </div>
            </div>
        </div>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.thread-item').forEach(item => {
        item.addEventListener('click', () => {
            const threadId = parseInt(item.dataset.thread);
            openThread(threadId);
        });
    });
}

function renderThread(threadId) {
    const thread = threadDetails[threadId];
    if (!thread) {
        threadContainer.innerHTML = '<p>Thread not found</p>';
        return;
    }

    const renderReplies = (replies, depth = 0) => {
        return replies.map(reply => `
            <div class="reply ${depth > 0 ? 'reply-chain' : ''}">
                <div class="post">
                    <div class="post-header">
                        <div class="post-author-info">
                            <span class="post-author">${reply.author}</span>
                            ${reply.authorIsOP ? '<span class="op-badge">OP</span>' : ''}
                            <span class="post-time">${reply.time}</span>
                        </div>
                        <div class="post-heat">
                            <div class="heat-display">
                                <span>${getHeatIcon(reply.heat)}</span>
                                <div class="heat-bar-inline">
                                    <div class="heat-fill-inline" style="width: ${reply.heat}%; background: ${getHeatColor(reply.heat)}"></div>
                                </div>
                                <span>${reply.heat}%</span>
                            </div>
                        </div>
                    </div>
                    <div class="post-body">${reply.body}</div>
                    <div class="post-footer">
                        <div class="post-actions">
                            <button class="action-btn">↩ Reply</button>
                        </div>
                    </div>
                </div>
                ${reply.replies ? renderReplies(reply.replies, depth + 1) : ''}
            </div>
        `).join('');
    };

    threadContainer.innerHTML = `
        <div class="thread-header">
            <button class="back-btn" id="backBtn">← Back to ${currentSpace}</button>
            ${thread.decaying ? '<div class="decay-warning">⚠️ This content is drifting away. Swim to keep it afloat.</div>' : ''}
            <h1 class="thread-main-title">${thread.title}</h1>
        </div>

        <div class="post op">
            <div class="post-header">
                <div class="post-author-info">
                    <span class="post-author">${thread.author}</span>
                    <span class="op-badge">OP</span>
                    <span class="post-time">${thread.time}</span>
                </div>
                <div class="post-heat">
                    <div class="heat-display">
                        <span>${getHeatIcon(thread.heat)}</span>
                        <div class="heat-bar-inline">
                            <div class="heat-fill-inline" style="width: ${thread.heat}%; background: ${getHeatColor(thread.heat)}"></div>
                        </div>
                        <span>${thread.heat}%</span>
                    </div>
                </div>
            </div>
            <div class="post-body">${formatBody(thread.body)}</div>
            <div class="post-footer">
                <div class="engagement-pool">
                    <div class="pool-bar">
                        <div class="pool-fill" style="width: ${(thread.engagement.current / thread.engagement.total) * 100}%"></div>
                    </div>
                    <span class="pool-text">${thread.engagement.current}s / ${thread.engagement.total}s buoyancy</span>
                    <button class="engage-btn-small" onclick="openEngageModal()">+5s</button>
                </div>
                <div class="post-actions">
                    <button class="action-btn">↩ Reply</button>
                    <button class="action-btn">🔗 Share</button>
                </div>
            </div>
        </div>

        <div class="replies-section">
            <div class="replies-header">
                <h2 class="replies-title">${thread.replies.length} Replies</h2>
                <div class="replies-sort">
                    <button class="sort-btn active">Newest</button>
                    <button class="sort-btn">Hottest</button>
                    <button class="sort-btn">Oldest</button>
                </div>
            </div>
            ${renderReplies(thread.replies)}
        </div>

        <div class="reply-form">
            <textarea class="reply-textarea" placeholder="Write a reply..."></textarea>
            <div class="reply-actions">
                <span class="pow-hint">~15s swim required for replies</span>
                <button class="action-btn primary" onclick="simulatePoW(15)">Reply</button>
            </div>
        </div>
    `;

    // Add back button handler
    document.getElementById('backBtn').addEventListener('click', closeThread);
}

// Helper functions
function getHeatIcon(heat) {
    if (heat >= 80) return '🔥';  // Hot - high buoyancy
    if (heat >= 60) return '⚡';  // Active swimming
    if (heat >= 40) return '💡';  // Treading water
    if (heat >= 20) return '⏳';  // Drifting
    return '💤';                  // Sinking
}

function getHeatColor(heat) {
    if (heat >= 80) return 'var(--heat-100)';
    if (heat >= 60) return 'var(--heat-80)';
    if (heat >= 40) return 'var(--heat-60)';
    if (heat >= 20) return 'var(--heat-40)';
    return 'var(--heat-20)';
}

function formatBody(body) {
    // Simple markdown-like formatting
    return body
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`{3}(\w+)?\n([\s\S]*?)`{3}/g, '<pre><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Navigation
function switchSpace(spaceId) {
    currentSpace = spaceId;
    currentView = 'space';

    // Update sidebar
    document.querySelectorAll('.space-item').forEach(item => {
        item.classList.toggle('active', item.dataset.space === spaceId);
    });

    // Update breadcrumb
    currentSpaceEl.textContent = spaceId;

    // Update space header
    const space = spaces.find(s => s.id === spaceId);
    if (space) {
        document.querySelector('.space-title').textContent = `${space.icon} ${space.name}`;
    }

    // Render threads
    renderThreads(spaceId);

    // Show space view
    spaceView.classList.remove('hidden');
    threadView.classList.add('hidden');
}

function openThread(threadId) {
    currentThread = threadId;
    currentView = 'thread';

    renderThread(threadId);

    spaceView.classList.add('hidden');
    threadView.classList.remove('hidden');
}

function closeThread() {
    currentThread = null;
    currentView = 'space';

    spaceView.classList.remove('hidden');
    threadView.classList.add('hidden');
}

// Event listeners
function setupEventListeners() {
    // New post modal
    newPostBtn.addEventListener('click', () => {
        newPostModal.classList.remove('hidden');
    });

    closeModal.addEventListener('click', () => {
        newPostModal.classList.add('hidden');
    });

    // Submit post with PoW
    submitPost.addEventListener('click', () => {
        const title = document.getElementById('postTitle').value;
        const content = document.getElementById('postContent').value;

        if (title && content) {
            newPostModal.classList.add('hidden');
            simulatePoW(30, () => {
                // Add new post (in real app, would broadcast to network)
                const newThread = {
                    id: Date.now(),
                    title: title,
                    author: 'cs1q9x7...2k4m',
                    time: 'just now',
                    preview: content.substring(0, 100) + '...',
                    replies: 0,
                    heat: 100,
                    engagement: { current: 0, total: 60 }
                };

                threads[currentSpace].unshift(newThread);
                renderThreads(currentSpace);

                // Clear form
                document.getElementById('postTitle').value = '';
                document.getElementById('postContent').value = '';
            });
        }
    });

    // Cancel PoW
    cancelPow.addEventListener('click', () => {
        powOverlay.classList.add('hidden');
        if (window.powInterval) {
            clearInterval(window.powInterval);
        }
    });

    // Close engage modal
    closeEngageModal.addEventListener('click', () => {
        engageModal.classList.add('hidden');
    });

    // Engage buttons
    document.querySelectorAll('.engage-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const seconds = parseInt(btn.dataset.seconds);
            engageModal.classList.add('hidden');
            simulatePoW(seconds);
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape to close modals
        if (e.key === 'Escape') {
            newPostModal.classList.add('hidden');
            engageModal.classList.add('hidden');
        }

        // 'n' for new post (when not in input)
        if (e.key === 'n' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            newPostModal.classList.remove('hidden');
        }

        // Backspace to go back (when not in input)
        if (e.key === 'Backspace' && !e.target.matches('input, textarea') && currentView === 'thread') {
            e.preventDefault();
            closeThread();
        }
    });

    // Click outside modal to close
    newPostModal.addEventListener('click', (e) => {
        if (e.target === newPostModal) {
            newPostModal.classList.add('hidden');
        }
    });

    engageModal.addEventListener('click', (e) => {
        if (e.target === engageModal) {
            engageModal.classList.add('hidden');
        }
    });
}

// Swimming simulation (PoW)
function simulatePoW(duration, callback) {
    powOverlay.classList.remove('hidden');
    powFill.style.width = '0%';

    const tips = [
        '🏊 Swimming is intentional. Take a moment to review your stroke.',
        '🏊 Every stroke takes effort - that prevents spam without lifeguards.',
        '🏊 Your effort keeps the pool healthy for everyone.',
        '🏊 Good time to double-check your message!',
        '🏊 Swimming ensures every stroke is valued equally.'
    ];
    document.getElementById('powTip').textContent = tips[Math.floor(Math.random() * tips.length)];

    let elapsed = 0;
    const interval = 100; // Update every 100ms

    window.powInterval = setInterval(() => {
        elapsed += interval;
        const progress = (elapsed / (duration * 1000)) * 100;
        const remaining = Math.ceil((duration * 1000 - elapsed) / 1000);

        powFill.style.width = `${Math.min(progress, 100)}%`;
        powTimeRemaining.textContent = `${remaining}s remaining`;

        if (elapsed >= duration * 1000) {
            clearInterval(window.powInterval);
            powOverlay.classList.add('hidden');

            if (callback) {
                callback();
            }
        }
    }, interval);
}

// Engage modal
function openEngageModal() {
    engageModal.classList.remove('hidden');
}

// Make it globally available
window.openEngageModal = openEngageModal;
window.simulatePoW = simulatePoW;

// Drift simulation (content drifts away without engagement)
function startDecaySimulation() {
    setInterval(() => {
        // Content gradually drifts downstream without swimmers
        Object.values(threads).forEach(spaceThreads => {
            spaceThreads.forEach(thread => {
                if (thread.heat > 0) {
                    thread.heat = Math.max(0, thread.heat - 0.1);

                    // Mark as drifting below threshold
                    if (thread.heat < 30 && !thread.pinned) {
                        thread.decaying = true; // drifting away
                    }
                }
            });
        });

        // Re-render if on lane view
        if (currentView === 'space') {
            renderThreads(currentSpace);
        }
    }, 10000); // Every 10 seconds for demo
}

// Initialize the app
init();
