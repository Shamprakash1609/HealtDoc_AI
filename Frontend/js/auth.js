/**
 * auth.js — HealthDoc Auth Module
 * Injects a login/register modal into every page.
 * Manages session via localStorage.
 * Updates the navbar "Login" link based on auth state.
 */

(function () {
    'use strict';

    const API = 'http://127.0.0.1:8000';
    const TOKEN_KEY = 'healthdoc_token';
    const USER_KEY  = 'healthdoc_user';

    // ── Public API ──────────────────────────────────────────────────────────────
    window.HealthDocAuth = {
        getToken:       () => localStorage.getItem(TOKEN_KEY),
        isLoggedIn:     () => !!localStorage.getItem(TOKEN_KEY),
        getCurrentUser: () => {
            const raw = localStorage.getItem(USER_KEY);
            try { return raw ? JSON.parse(raw) : null; } catch { return null; }
        },
        logout: () => {
            const token = localStorage.getItem(TOKEN_KEY);
            if (token) {
                fetch(`${API}/auth/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                }).catch(() => {});
            }
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            updateNavbar();
        },
        openModal: () => openModal('login'),
    };

    // ── Modal HTML ──────────────────────────────────────────────────────────────
    function injectModal() {
        if (document.getElementById('auth-modal-overlay')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="auth-modal-overlay" class="auth-modal-overlay" role="dialog" aria-modal="true" aria-label="Authentication">
            <div class="auth-modal glass">
                <!-- Header -->
                <div class="auth-modal-header">
                    <div class="auth-logo">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                            <rect width="24" height="24" rx="6" fill="#00E87E"/>
                            <path d="M11 7v4H7v2h4v4h2v-4h4v-2h-4V7h-2z" fill="white"/>
                        </svg>
                        <span>HealthDoc</span>
                    </div>
                    <button class="auth-close-btn" id="auth-close-btn" aria-label="Close">
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                <!-- Tab Switcher -->
                <div class="auth-tabs">
                    <button class="auth-tab active" id="tab-login" data-tab="login">Sign In</button>
                    <button class="auth-tab" id="tab-register" data-tab="register">Create Account</button>
                </div>

                <!-- Login Form -->
                <form class="auth-form" id="login-form">
                    <div class="auth-field">
                        <label for="login-email">Email</label>
                        <input type="email" id="login-email" placeholder="your@email.com" autocomplete="email" required>
                    </div>
                    <div class="auth-field">
                        <label for="login-password">Password</label>
                        <input type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" required>
                    </div>
                    <div class="auth-error" id="login-error"></div>
                    <button type="submit" class="btn btn-primary auth-submit" id="login-submit">Sign In</button>
                </form>

                <!-- Register Form -->
                <form class="auth-form" id="register-form" style="display:none;">
                    <div class="auth-field">
                        <label for="reg-name">Full Name</label>
                        <input type="text" id="reg-name" placeholder="Jane Smith" autocomplete="name" required>
                    </div>
                    <div class="auth-field">
                        <label for="reg-email">Email</label>
                        <input type="email" id="reg-email" placeholder="your@email.com" autocomplete="email" required>
                    </div>
                    <div class="auth-field">
                        <label for="reg-password">Password <span style="font-weight:500;font-size:12px;color:var(--color-text-mutated)">(min 6 characters)</span></label>
                        <input type="password" id="reg-password" placeholder="••••••••" autocomplete="new-password" required minlength="6">
                    </div>
                    <div class="auth-error" id="register-error"></div>
                    <button type="submit" class="btn btn-primary auth-submit" id="register-submit">Create Account</button>
                </form>

                <p class="auth-disclaimer">Your health data stays local. Private by design.</p>
            </div>
        </div>
        `);

        // Bind events
        document.getElementById('auth-close-btn').addEventListener('click', closeModal);
        document.getElementById('auth-modal-overlay').addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
        document.getElementById('tab-login').addEventListener('click', () => switchTab('login'));
        document.getElementById('tab-register').addEventListener('click', () => switchTab('register'));
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('register-form').addEventListener('submit', handleRegister);
    }

    function openModal(tab = 'login') {
        const overlay = document.getElementById('auth-modal-overlay');
        if (!overlay) injectModal();
        switchTab(tab);
        requestAnimationFrame(() => {
            document.getElementById('auth-modal-overlay').classList.add('visible');
        });
    }

    function closeModal() {
        const overlay = document.getElementById('auth-modal-overlay');
        if (overlay) overlay.classList.remove('visible');
    }

    function switchTab(tab) {
        document.getElementById('login-form').style.display    = tab === 'login'    ? '' : 'none';
        document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
        document.getElementById('tab-login').classList.toggle('active', tab === 'login');
        document.getElementById('tab-register').classList.toggle('active', tab === 'register');
        document.getElementById('login-error').textContent = '';
        document.getElementById('register-error').textContent = '';
    }

    // ── API Calls ───────────────────────────────────────────────────────────────
    async function handleLogin(e) {
        e.preventDefault();
        const email    = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errEl    = document.getElementById('login-error');
        const submitBtn = document.getElementById('login-submit');

        submitBtn.textContent = 'Signing in…';
        submitBtn.disabled = true;
        errEl.textContent = '';

        try {
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Login failed');

            saveSession(data.token, data.user);
            closeModal();
            updateNavbar();
            showToast(`Welcome back, ${data.user.name}! 👋`);
        } catch (err) {
            errEl.textContent = err.message;
        } finally {
            submitBtn.textContent = 'Sign In';
            submitBtn.disabled = false;
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const name     = document.getElementById('reg-name').value.trim();
        const email    = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const errEl    = document.getElementById('register-error');
        const submitBtn = document.getElementById('register-submit');

        submitBtn.textContent = 'Creating account…';
        submitBtn.disabled = true;
        errEl.textContent = '';

        try {
            const res = await fetch(`${API}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Registration failed');

            saveSession(data.token, data.user);
            closeModal();
            updateNavbar();
            showToast(`Welcome to HealthDoc, ${data.user.name}! 🎉`);
        } catch (err) {
            errEl.textContent = err.message;
        } finally {
            submitBtn.textContent = 'Create Account';
            submitBtn.disabled = false;
        }
    }

    // ── Session Helpers ─────────────────────────────────────────────────────────
    function saveSession(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    // ── Navbar Update ───────────────────────────────────────────────────────────
    function updateNavbar() {
        // Find the "Login" link in the nav-actions div
        const loginLinks = document.querySelectorAll('.nav-login');
        const user = window.HealthDocAuth.getCurrentUser();

        loginLinks.forEach(link => {
            if (window.HealthDocAuth.isLoggedIn() && user) {
                link.textContent = user.name.split(' ')[0]; // First name
                link.style.color = 'var(--color-accent)';
                link.style.fontWeight = '700';
                link.href = '#';
                link.onclick = (e) => {
                    e.preventDefault();
                    showUserMenu(link);
                };
            } else {
                link.textContent = 'Login';
                link.style.color = '';
                link.style.fontWeight = '';
                link.href = '#';
                link.onclick = (e) => {
                    e.preventDefault();
                    openModal('login');
                };
            }
        });

        // Also update "Get Started" buttons if not logged in
        const getStartedBtns = document.querySelectorAll('a.btn-primary[href*="cta"]');
        if (window.HealthDocAuth.isLoggedIn()) {
            getStartedBtns.forEach(btn => {
                // Find the insights dashboard link (relative path-aware)
                const path = window.location.pathname;
                const isInPages = path.includes('/pages/');
                btn.href = isInPages ? 'InsightsDashboard.html' : 'pages/InsightsDashboard.html';
                btn.textContent = 'My Dashboard';
            });
        }
    }

    // ── User dropdown menu ──────────────────────────────────────────────────────
    function showUserMenu(anchor) {
        // Remove existing menu
        const existing = document.getElementById('user-menu');
        if (existing) { existing.remove(); return; }

        const user = window.HealthDocAuth.getCurrentUser();
        const isInPages = window.location.pathname.includes('/pages/');
        const dashHref = isInPages ? 'InsightsDashboard.html' : 'pages/InsightsDashboard.html';

        const menu = document.createElement('div');
        menu.id = 'user-menu';
        menu.className = 'user-menu glass';
        menu.innerHTML = `
            <div class="user-menu-header">
                <div class="user-avatar">${(user?.name || '?')[0].toUpperCase()}</div>
                <div>
                    <div class="user-menu-name">${user?.name || 'User'}</div>
                    <div class="user-menu-email">${user?.email || ''}</div>
                </div>
            </div>
            <hr class="user-menu-divider">
            <a href="${dashHref}" class="user-menu-item">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12 0a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>
                Insights Dashboard
            </a>
            <button class="user-menu-item logout-item" id="user-logout-btn">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                Sign Out
            </button>
        `;

        // Position below anchor
        const rect = anchor.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 8}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;
        document.body.appendChild(menu);

        menu.querySelector('#user-logout-btn').addEventListener('click', () => {
            window.HealthDocAuth.logout();
            menu.remove();
            showToast('Signed out. See you soon!');
        });

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function handler(e) {
                if (!menu.contains(e.target) && e.target !== anchor) {
                    menu.remove();
                    document.removeEventListener('click', handler);
                }
            });
        }, 0);
    }

    // ── Toast Notification ──────────────────────────────────────────────────────
    function showToast(message) {
        const existing = document.getElementById('auth-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'auth-toast';
        toast.className = 'auth-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    // ── Init ────────────────────────────────────────────────────────────────────
    function init() {
        injectModal();
        updateNavbar();

        // Wire existing "Login" nav links
        document.querySelectorAll('.nav-login').forEach(link => {
            link.addEventListener('click', function(e) {
                if (!window.HealthDocAuth.isLoggedIn()) {
                    e.preventDefault();
                    openModal('login');
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
