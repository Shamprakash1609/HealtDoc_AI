document.addEventListener('DOMContentLoaded', () => {
    // ── Navbar Scroll Effect ──
    const navbar = document.getElementById('navbar');

    const handleScroll = () => {
        if (window.scrollY > 20) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // init

    // ── Scroll Reveal Animation ──
    // Using Intersection Observer to trigger animations when elements enter viewport
    const revealElements = document.querySelectorAll('.scroll-reveal');

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Optional: stop observing once revealed
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        threshold: 0.15, // Trigger when 15% of element is visible
        rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // ── Step Progress Animation (How It Works) ──
    const progressLine = document.getElementById('step-progress');
    const howItWorksSection = document.getElementById('how-it-works');

    if (progressLine && howItWorksSection) {
        const progressObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Animate the line width from 0 to 100%
                    setTimeout(() => {
                        progressLine.style.width = '100%';
                    }, 300);
                }
            });
        }, { threshold: 0.3 });

        progressObserver.observe(howItWorksSection);
    }

    // ── Set Current Year in Footer ──
    const yearEl = document.getElementById('year');
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }

    // ── Mobile Menu Stub (if needed) ──
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            // In a full implementation, this would toggle a mobile menu modal or expansion
            console.log('Mobile menu clicked');
        });
    }
});
