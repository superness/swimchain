/**
 * Swimchain Website Interactive Elements
 * Implements the 8 WOW moments from WEBSITE_WOW_MOMENTS.md
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all interactive components
    initWaitingDemo();
    initInterfaceSwitcher();
    initDecayAnimation();
    initSmoothScrolling();
    initNavHighlight();
});

/**
 * WOW Moment 1: The Waiting Demo
 * Interactive 30-second posting experience with reflection prompts
 */
function initWaitingDemo() {
    const demoContainer = document.getElementById('posting-demo');
    if (!demoContainer) return;

    const inputState = demoContainer.querySelector('.demo-input-state');
    const waitingState = demoContainer.querySelector('.demo-waiting-state');
    const successState = demoContainer.querySelector('.demo-success-state');
    const cancelledState = demoContainer.querySelector('.demo-cancelled-state');

    const submitBtn = document.getElementById('demo-submit');
    const cancelBtn = document.getElementById('demo-cancel');
    const resetBtn = document.getElementById('demo-reset');
    const resetCancelledBtn = document.getElementById('demo-reset-cancelled');
    const progressFill = document.getElementById('progress-fill');
    const progressPercent = document.getElementById('progress-percent');
    const textarea = document.getElementById('demo-post');

    let progressInterval = null;
    let currentProgress = 0;
    const DEMO_DURATION = 10000; // 10 seconds for demo (30s would be too long)
    const UPDATE_INTERVAL = 100;

    function showState(state) {
        [inputState, waitingState, successState, cancelledState].forEach(s => {
            if (s) s.style.display = 'none';
        });
        if (state) state.style.display = 'block';
    }

    function startProgress() {
        currentProgress = 0;
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';

        progressInterval = setInterval(() => {
            currentProgress += (UPDATE_INTERVAL / DEMO_DURATION) * 100;
            if (currentProgress >= 100) {
                currentProgress = 100;
                clearInterval(progressInterval);
                progressInterval = null;
                // Success!
                setTimeout(() => showState(successState), 300);
            }
            progressFill.style.width = `${currentProgress}%`;
            progressPercent.textContent = `${Math.round(currentProgress)}%`;
        }, UPDATE_INTERVAL);
    }

    function stopProgress() {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
    }

    function reset() {
        stopProgress();
        currentProgress = 0;
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        showState(inputState);
    }

    // Event listeners
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            if (!textarea.value.trim()) {
                textarea.placeholder = 'Type something first...';
                textarea.focus();
                return;
            }
            showState(waitingState);
            startProgress();
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            stopProgress();
            showState(cancelledState);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', reset);
    }

    if (resetCancelledBtn) {
        resetCancelledBtn.addEventListener('click', reset);
    }
}

/**
 * WOW Moment 8: The Interface Switcher
 * Shows same content in different interface styles
 */
function initInterfaceSwitcher() {
    const tabs = document.querySelectorAll('.interface-tab');
    const displays = document.querySelectorAll('.interface-display');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const interfaceId = tab.dataset.interface;

            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update active display
            displays.forEach(d => d.classList.remove('active'));
            const targetDisplay = document.getElementById(`interface-${interfaceId}`);
            if (targetDisplay) {
                targetDisplay.classList.add('active');
            }
        });
    });
}

/**
 * WOW Moment 2: The Decay Visualization
 * Animated decay timeline
 */
function initDecayAnimation() {
    const decayTimeline = document.getElementById('decay-timeline');
    if (!decayTimeline) return;

    // Create intersection observer for animation trigger
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateDecay();
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    observer.observe(decayTimeline);

    function animateDecay() {
        const posts = decayTimeline.querySelectorAll('.decay-post');
        posts.forEach((post, index) => {
            setTimeout(() => {
                post.classList.add('animated');
                post.style.opacity = '1';
                post.style.transform = 'translateX(0)';
            }, index * 500);
        });
    }

    // Initially hide posts for animation
    const posts = decayTimeline.querySelectorAll('.decay-post');
    posts.forEach(post => {
        post.style.opacity = '0';
        post.style.transform = 'translateX(-20px)';
        post.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    });
}

/**
 * Smooth scrolling for anchor links
 */
function initSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;

            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const navHeight = document.querySelector('.nav')?.offsetHeight || 0;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Navigation highlight based on scroll position
 */
function initNavHighlight() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

    if (!sections.length || !navLinks.length) return;

    function highlightNav() {
        const scrollPos = window.scrollY + 100;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');

            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }

    window.addEventListener('scroll', highlightNav);
    highlightNav(); // Initial check
}

/**
 * Revival animation for decay demo
 * Pulses when engagement revives content
 */
function animateRevival() {
    const revivalAfter = document.querySelector('.revival-after .decay-bar');
    if (revivalAfter) {
        revivalAfter.classList.add('revived');
    }
}

/**
 * Typing effect for CLI mockup
 */
function initCLITyping() {
    const cliMockup = document.querySelector('.cli-mockup .cli-content');
    if (!cliMockup) return;

    // Could add typing animation here if desired
}

/**
 * Parallax effect for hero section
 */
function initParallax() {
    const hero = document.querySelector('.hero');
    const ripples = document.querySelectorAll('.water-ripple');

    if (!hero || !ripples.length) return;

    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        if (scrolled < hero.offsetHeight) {
            ripples.forEach((ripple, index) => {
                const speed = 0.2 + (index * 0.1);
                ripple.style.transform = `translate(-50%, -50%) scale(${1 + scrolled * 0.001}) translateY(${scrolled * speed}px)`;
            });
        }
    });
}

/**
 * Animate numbers counting up
 * Used for statistics if any
 */
function animateNumber(element, target, duration = 2000) {
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        element.textContent = Math.round(current);
    }, 16);
}

/**
 * Intersection Observer for fade-in animations
 * DISABLED - this is a very Claude Code tell
 */
// function initFadeInAnimations() { ... }

// Add CSS for nav highlight only (no fade-in - too Claude)
const style = document.createElement('style');
style.textContent = `
    .nav-links a.active {
        color: var(--chlorine-teal) !important;
    }
`;
document.head.appendChild(style);

/**
 * Mobile menu toggle (if needed)
 */
function initMobileMenu() {
    const navContainer = document.querySelector('.nav-container');
    const navLinks = document.querySelector('.nav-links');

    // Create mobile menu button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'nav-mobile-btn';
    menuBtn.innerHTML = '&#9776;';
    menuBtn.style.display = 'none';
    menuBtn.style.background = 'none';
    menuBtn.style.border = 'none';
    menuBtn.style.color = 'var(--clean-white)';
    menuBtn.style.fontSize = '1.5rem';
    menuBtn.style.cursor = 'pointer';

    navContainer.appendChild(menuBtn);

    // Check if mobile
    function checkMobile() {
        if (window.innerWidth <= 768) {
            menuBtn.style.display = 'block';
            navLinks.style.display = navLinks.classList.contains('open') ? 'flex' : 'none';
            navLinks.style.flexDirection = 'column';
            navLinks.style.position = 'absolute';
            navLinks.style.top = '100%';
            navLinks.style.left = '0';
            navLinks.style.right = '0';
            navLinks.style.background = 'rgba(10, 22, 40, 0.98)';
            navLinks.style.padding = '1rem';
        } else {
            menuBtn.style.display = 'none';
            navLinks.style.display = 'flex';
            navLinks.style.flexDirection = 'row';
            navLinks.style.position = 'static';
            navLinks.style.background = 'none';
            navLinks.style.padding = '0';
        }
    }

    menuBtn.addEventListener('click', () => {
        navLinks.classList.toggle('open');
        checkMobile();
    });

    window.addEventListener('resize', checkMobile);
    checkMobile();
}

// Initialize mobile menu
document.addEventListener('DOMContentLoaded', initMobileMenu);

/**
 * Copy to clipboard for identity address
 */
function initCopyIdentity() {
    const identityAddress = document.querySelector('.identity-address');
    if (!identityAddress) return;

    identityAddress.style.cursor = 'pointer';
    identityAddress.title = 'Click to copy';

    identityAddress.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(identityAddress.textContent);
            const originalText = identityAddress.textContent;
            identityAddress.textContent = 'Copied!';
            setTimeout(() => {
                identityAddress.textContent = originalText;
            }, 1500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    });
}

document.addEventListener('DOMContentLoaded', initCopyIdentity);

/**
 * Animate the mesh diagram connections
 */
function initMeshAnimation() {
    const mesh = document.querySelector('.diagram-mesh');
    if (!mesh) return;

    const peers = mesh.querySelectorAll('.mesh-peer');
    const center = mesh.querySelector('.mesh-center');

    // Create SVG for connection lines
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    mesh.style.position = 'relative';
    mesh.insertBefore(svg, mesh.firstChild);

    function drawConnections() {
        svg.innerHTML = '';
        const centerRect = center.getBoundingClientRect();
        const meshRect = mesh.getBoundingClientRect();

        peers.forEach((peer, index) => {
            const peerRect = peer.getBoundingClientRect();
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');

            line.setAttribute('x1', centerRect.left - meshRect.left + centerRect.width / 2);
            line.setAttribute('y1', centerRect.top - meshRect.top + centerRect.height / 2);
            line.setAttribute('x2', peerRect.left - meshRect.left + peerRect.width / 2);
            line.setAttribute('y2', peerRect.top - meshRect.top + peerRect.height / 2);
            line.setAttribute('stroke', 'rgba(0, 180, 216, 0.3)');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '4,4');

            // Animate the line
            const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            animate.setAttribute('attributeName', 'stroke-dashoffset');
            animate.setAttribute('from', '0');
            animate.setAttribute('to', '-8');
            animate.setAttribute('dur', '1s');
            animate.setAttribute('repeatCount', 'indefinite');
            line.appendChild(animate);

            svg.appendChild(line);
        });
    }

    // Draw on load and resize
    setTimeout(drawConnections, 100);
    window.addEventListener('resize', drawConnections);
}

document.addEventListener('DOMContentLoaded', initMeshAnimation);

console.log('Swimchain website initialized');
