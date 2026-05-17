/**
 * auth.js — HealthDoc Auth Module
 * - Injects login/register modal popup on every page
 * - Manages session via localStorage (token + user object)
 * - Transforms the navbar: hides Login when logged in, shows user avatar pill + dropdown
 */

(function () {
    'use strict';

    const API       = 'http://127.0.0.1:8000';
    const TOKEN_KEY = 'healthdoc_token';
    const USER_KEY  = 'healthdoc_user';

    // ── DEV DEFAULT: Auto-login as John Wick if no session exists ───────────────
    // This is a pre-seeded user in backend/database/. Remove this block in production.
    const DEV_TOKEN = 'jw-dev-token-healthdoc-2026';
    const DEV_USER  = { name: 'John Wick', email: 'john141@gmail.com' };

    if (!localStorage.getItem(TOKEN_KEY)) {
        localStorage.setItem(TOKEN_KEY, DEV_TOKEN);
        localStorage.setItem(USER_KEY, JSON.stringify(DEV_USER));
        console.info('[HealthDoc] Dev mode: auto-logged in as John Wick');
    }
    // ────────────────────────────────────────────────────────────────────────────

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
            showToast('Signed out. See you soon! 👋');
        },
        openModal: (tab) => openModal(tab || 'login'),
    };

    // ── Helpers ─────────────────────────────────────────────────────────────────
    function isInPages() {
        return window.location.pathname.includes('/pages/');
    }

    function dashHref() {
        return isInPages() ? 'InsightsDashboard.html' : 'pages/InsightsDashboard.html';
    }

    function initials(name) {
        return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    }

    // ── Modal HTML ──────────────────────────────────────────────────────────────
    function injectModal() {
        if (document.getElementById('auth-modal-overlay')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="auth-modal-overlay" class="auth-modal-overlay" role="dialog" aria-modal="true">
            <div class="auth-modal glass">
                <div class="auth-modal-header">
                    <div class="auth-logo">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                            <rect width="24" height="24" rx="6" fill="#00E87E"/>
                            <path d="M11 7v4H7v2h4v4h2v-4h4v-2h-4V7h-2z" fill="white"/>
                        </svg>
                        <span>HealthDoc</span>
                    </div>
                    <button class="auth-close-btn" id="auth-close-btn" aria-label="Close">
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                <div class="auth-tabs">
                    <button class="auth-tab active" id="tab-login">Sign In</button>
                    <button class="auth-tab" id="tab-register">Create Account</button>
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
                    <p class="auth-switch-text">No account? <button type="button" class="auth-switch-link" id="switch-to-register">Create one free →</button></p>
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
                        <label for="reg-password">Password <span style="font-weight:500;font-size:12px;color:var(--color-text-mutated)">(min 6 chars)</span></label>
                        <input type="password" id="reg-password" placeholder="••••••••" autocomplete="new-password" required minlength="6">
                    </div>
                    <div class="auth-error" id="register-error"></div>
                    <button type="submit" class="btn btn-primary auth-submit" id="register-submit">Create Account</button>
                    <p class="auth-switch-text">Already have an account? <button type="button" class="auth-switch-link" id="switch-to-login">Sign in →</button></p>
                </form>

                <div class="auth-privacy">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    Your health data stays local &amp; private
                </div>
            </div>
        </div>
        `);

        document.getElementById('auth-close-btn').addEventListener('click', closeModal);
        document.getElementById('auth-modal-overlay').addEventListener('click', e => { if (e.target.id === 'auth-modal-overlay') closeModal(); });
        document.getElementById('tab-login').addEventListener('click', () => switchTab('login'));
        document.getElementById('tab-register').addEventListener('click', () => switchTab('register'));
        document.getElementById('switch-to-register').addEventListener('click', () => switchTab('register'));
        document.getElementById('switch-to-login').addEventListener('click', () => switchTab('login'));
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('register-form').addEventListener('submit', handleRegister);
    }

    function openModal(tab = 'login') {
        if (!document.getElementById('auth-modal-overlay')) injectModal();
        switchTab(tab);
        requestAnimationFrame(() => document.getElementById('auth-modal-overlay').classList.add('visible'));
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
        const btn      = document.getElementById('login-submit');

        btn.textContent = 'Signing in…'; btn.disabled = true; errEl.textContent = '';
        try {
            const res  = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Login failed');
            saveSession(data.token, data.user);
            closeModal();
            updateNavbar();
            showToast(`Welcome back, ${data.user.name}! 👋`);
            // Reload InsightsDashboard if currently on it
            if (window.location.pathname.includes('InsightsDashboard')) window.location.reload();
        } catch (err) {
            errEl.textContent = err.message;
        } finally {
            btn.textContent = 'Sign In'; btn.disabled = false;
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const name     = document.getElementById('reg-name').value.trim();
        const email    = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const errEl    = document.getElementById('register-error');
        const btn      = document.getElementById('register-submit');

        btn.textContent = 'Creating account…'; btn.disabled = true; errEl.textContent = '';
        try {
            const res  = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Registration failed');
            saveSession(data.token, data.user);
            closeModal();
            updateNavbar();
            showToast(`Welcome to HealthDoc, ${data.user.name}! 🎉`);
            if (window.location.pathname.includes('InsightsDashboard')) window.location.reload();
        } catch (err) {
            errEl.textContent = err.message;
        } finally {
            btn.textContent = 'Create Account'; btn.disabled = false;
        }
    }

    function saveSession(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    // ── Navbar Transformation ───────────────────────────────────────────────────
    // When logged-in: replaces entire .nav-actions with avatar pill + sign-out
    // When logged-out: shows Login link + Get Started
    function updateNavbar() {
        const navActionsEls = document.querySelectorAll('.nav-actions');
        const user          = window.HealthDocAuth.getCurrentUser();
        const loggedIn      = window.HealthDocAuth.isLoggedIn();

        navActionsEls.forEach(el => {
            if (loggedIn && user) {
                el.innerHTML = `
                    <a href="${dashHref()}" class="nav-user-pill" id="nav-user-pill">
                        <span class="nav-user-avatar">${initials(user.name)}</span>
                        <span class="nav-user-name">${user.name.split(' ')[0]}</span>
                    </a>
                    <button class="nav-signout-btn" id="nav-signout-btn" title="Sign Out">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                        </svg>
                        Sign Out
                    </button>
                `;
                el.querySelector('#nav-signout-btn').addEventListener('click', () => window.HealthDocAuth.logout());
            } else {
                el.innerHTML = `
                    <a href="#" class="nav-login" id="nav-login-link">Login</a>
                    <a href="${dashHref()}" class="btn btn-primary">Get Started</a>
                `;
                el.querySelector('#nav-login-link').addEventListener('click', e => { e.preventDefault(); openModal('login'); });
            }
        });
    }

    // ── Toast ────────────────────────────────────────────────────────────────────
    function showToast(message) {
        const existing = document.getElementById('auth-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'auth-toast';
        toast.className = 'auth-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 400); }, 3500);
    }

    // ── Init ─────────────────────────────────────────────────────────────────────
    function init() {
        injectModal();
        updateNavbar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
