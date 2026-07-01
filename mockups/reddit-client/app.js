// Swimchain Reddit-Style Client - JavaScript

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    startDecaySimulation();
});

function setupEventListeners() {
    // Space selection
    document.querySelectorAll('.space-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.space-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Sort buttons
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Nav pills
    document.querySelectorAll('.nav-pill').forEach(pill => {
        pill.addEventListener('click', function() {
            document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Engage buttons
    document.querySelectorAll('.action-btn.engage').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            simulateEngage(this);
        });
    });

    // Post card click
    document.querySelectorAll('.post-card').forEach(card => {
        card.addEventListener('click', () => {
            alert('In a full client, this would open the thread view');
        });
    });

    // Create post button
    document.querySelector('.create-btn').addEventListener('click', () => {
        alert('In a full client, this would open a new post form with PoW');
    });
}

function simulateEngage(button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Mining...';

    let progress = 0;
    const interval = setInterval(() => {
        progress += 2;
        button.textContent = `Mining ${progress}%`;

        if (progress >= 100) {
            clearInterval(interval);
            button.textContent = 'Engaged!';
            button.style.background = 'var(--accent-success)';
            button.style.color = 'white';

            // Update the engagement bar
            const card = button.closest('.post-card');
            const fill = card.querySelector('.engagement-fill');
            const text = card.querySelector('.engagement-text');

            if (fill && text) {
                const currentWidth = parseFloat(fill.style.width) || 0;
                const newWidth = Math.min(currentWidth + 10, 100);
                fill.style.width = newWidth + '%';

                // Update text
                const currentSeconds = Math.floor((currentWidth / 100) * 60);
                const newSeconds = Math.floor((newWidth / 100) * 60);
                text.textContent = `${newSeconds}s/60s`;

                // Remove decaying state if fully engaged
                if (newWidth >= 100) {
                    card.classList.remove('decaying', 'severely-decaying');
                    const banner = card.querySelector('.decay-banner');
                    if (banner) banner.remove();
                }
            }

            setTimeout(() => {
                button.disabled = false;
                button.textContent = '+5s More';
                button.style.background = '';
                button.style.color = '';
            }, 2000);
        }
    }, 50);
}

function startDecaySimulation() {
    // Simulate decay over time (for demo)
    setInterval(() => {
        document.querySelectorAll('.heat-fill-vertical').forEach(fill => {
            const currentHeight = parseFloat(fill.style.height) || 0;
            if (currentHeight > 0) {
                const newHeight = Math.max(0, currentHeight - 0.1);
                fill.style.height = newHeight + '%';

                // Update value
                const meter = fill.closest('.heat-meter');
                const value = meter.querySelector('.heat-value');
                if (value) {
                    value.textContent = Math.round(newHeight) + '%';
                }

                // Update icon
                const icon = meter.querySelector('.heat-icon');
                if (icon) {
                    if (newHeight >= 80) icon.textContent = '🔥';
                    else if (newHeight >= 60) icon.textContent = '⚡';
                    else if (newHeight >= 40) icon.textContent = '💡';
                    else if (newHeight >= 20) icon.textContent = '⏳';
                    else if (newHeight >= 5) icon.textContent = '💤';
                    else icon.textContent = '💀';
                }
            }
        });
    }, 5000);
}
