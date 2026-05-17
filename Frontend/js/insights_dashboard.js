/**
 * insights_dashboard.js — HealthDoc Insights Dashboard
 * Checks auth, fetches /user/dashboard, and renders all sections.
 */

(function () {
    'use strict';

    const API = 'http://127.0.0.1:8000';

    // ── DOM helpers ─────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const show = id => { const el = $(id); if (el) el.style.display = ''; };
    const hide = id => { const el = $(id); if (el) el.style.display = 'none'; };

    // ── Auth Check ──────────────────────────────────────────────────────────────
    function checkAuth() {
        // Wait for auth.js to initialise
        const auth = window.HealthDocAuth;
        if (!auth || !auth.isLoggedIn()) {
            show('auth-gate');
            hide('dashboard-main');
            bindGateButtons();
            return false;
        }
        hide('auth-gate');
        show('dashboard-main');
        return true;
    }

    function bindGateButtons() {
        const loginBtn    = $('gate-login-btn');
        const registerBtn = $('gate-register-btn');
        if (loginBtn)    loginBtn.addEventListener('click', () => window.HealthDocAuth.openModal('login'));
        if (registerBtn) registerBtn.addEventListener('click', () => window.HealthDocAuth.openModal('register'));
    }

    // ── Welcome Section ─────────────────────────────────────────────────────────
    function populateWelcome(user) {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const firstName = (user?.name || 'there').split(' ')[0];

        const heading = $('welcome-heading');
        if (heading) heading.textContent = `${greeting}, ${firstName} 👋`;

        const dateEl = $('today-date');
        if (dateEl) {
            dateEl.textContent = new Date().toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
        }

        // Logout button
        const logoutBtn = $('dash-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.HealthDocAuth.logout();
                window.location.reload();
            });
        }
    }

    // ── Stats Row ───────────────────────────────────────────────────────────────
    function populateStats(data) {
        const reports     = $('stat-reports-val');
        const risks       = $('stat-risks-val');
        const healthScore = $('stat-health-val');
        const lastDate    = $('stat-last-val');

        if (reports)     reports.textContent     = data.total_reports ?? '0';
        if (risks)       risks.textContent       = data.total_risks ?? '0';
        if (healthScore) healthScore.textContent = `${data.health_score ?? 100}/100`;
        if (lastDate) {
            if (data.last_analysis) {
                const d = new Date(data.last_analysis);
                lastDate.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            } else {
                lastDate.textContent = 'Never';
            }
        }
    }

    // ── EHR Records ─────────────────────────────────────────────────────────────
    function populateEHR(records) {
        hide('ehr-loading');

        if (!records || records.length === 0) {
            hide('ehr-list');
            show('ehr-empty');
            return;
        }

        hide('ehr-empty');
        show('ehr-list');

        const container = $('ehr-list');
        container.innerHTML = '';

        records.forEach((rec, idx) => {
            const card = createEHRCard(rec, idx);
            container.appendChild(card);
        });
    }

    function createEHRCard(rec, idx) {
        const div = document.createElement('div');
        div.className = 'ehr-card';
        div.id = `ehr-card-${idx}`;

        const risks     = rec.risks || [];
        const metrics   = rec.metrics || {};
        const riskCount = risks.length;
        const isImage   = rec.source === 'image';

        // Risk badge
        let riskClass = 'risk-none';
        let riskLabel = 'No Risks';
        if (riskCount === 1) { riskClass = 'risk-low';    riskLabel = '1 Risk'; }
        if (riskCount === 2) { riskClass = 'risk-medium'; riskLabel = '2 Risks'; }
        if (riskCount >= 3)  { riskClass = 'risk-high';   riskLabel = `${riskCount} Risks`; }

        const savedDate = rec.saved_at
            ? new Date(rec.saved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Unknown date';

        // Metrics preview (first 4)
        const metricEntries = Object.entries(metrics).slice(0, 4);
        const metricsHTML = metricEntries.length
            ? `<div class="ehr-metrics-grid">${metricEntries.map(([key, info]) => `
                <div class="ehr-metric-chip">
                    <strong>${info.display || key}</strong>
                    ${info.value} ${info.unit || ''}
                </div>`).join('')}</div>`
            : '';

        // Risks list
        const risksHTML = risks.length
            ? `<div style="margin-bottom:10px; font-size:13px; font-weight:700; color:var(--color-text);">Risk Flags</div>
               <div class="ehr-risks-list">${risks.map(r => `
                <div class="ehr-risk-item">
                    <div class="ehr-risk-dot"></div>
                    <span>${typeof r === 'string' ? r : (r.risk || JSON.stringify(r))}</span>
                </div>`).join('')}</div>`
            : '';

        // Explanation snippet
        const expText = rec.explanation
            ? `<div class="ehr-explanation">${rec.explanation.slice(0, 400)}${rec.explanation.length > 400 ? '…' : ''}</div>`
            : '';

        // Image findings
        const findingsHTML = isImage && rec.findings && rec.findings.length
            ? `<div style="margin-bottom:10px; font-size:13px; font-weight:700; color:var(--color-text);">Findings</div>
               <div class="ehr-risks-list">${rec.findings.map(f => `
                <div class="ehr-risk-item"><div class="ehr-risk-dot" style="background:var(--color-purple)"></div><span>${f}</span></div>`).join('')}</div>`
            : '';

        div.innerHTML = `
            <div class="ehr-card-header" onclick="toggleEHRCard(${idx})">
                <div class="ehr-card-meta">
                    <div class="ehr-type-badge ${isImage ? 'ehr-type-image' : 'ehr-type-report'}">
                        ${isImage ? '🩻' : '🧪'}
                    </div>
                    <div>
                        <div class="ehr-filename">${rec.filename || 'Medical Report'}</div>
                        <div class="ehr-date">${savedDate}</div>
                    </div>
                </div>
                <span class="ehr-risk-pill ${riskClass}">${riskLabel}</span>
                <svg class="ehr-chevron" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                </svg>
            </div>
            <div class="ehr-card-body">
                ${rec.diagnosis ? `<div style="padding:12px; background:rgba(157,78,221,0.06); border:1px solid rgba(157,78,221,0.15); border-radius:10px; margin-bottom:12px; font-size:13px; font-weight:700; color:var(--color-purple);">🔬 Diagnosis: ${rec.diagnosis}</div>` : ''}
                ${metricsHTML}
                ${risksHTML}
                ${findingsHTML}
                ${expText}
            </div>
        `;

        return div;
    }

    // Expose toggle function globally (called from inline onclick)
    window.toggleEHRCard = function (idx) {
        const card = document.getElementById(`ehr-card-${idx}`);
        if (card) card.classList.toggle('expanded');
    };

    // ── NutriPlan Panel ─────────────────────────────────────────────────────────
    function populateNutri(nutri) {
        hide('nutri-loading');

        if (!nutri) {
            hide('nutri-panel');
            show('nutri-empty');
            return;
        }

        hide('nutri-empty');
        show('nutri-panel');

        const panel = $('nutri-panel');

        const goalMap = {
            '0': 'Maintain Weight',
            '-0.1': 'Mild Cut (−10%)', '-0.2': 'Cut (−20%)', '-0.3': 'Aggressive Cut (−30%)',
            '0.1': 'Mild Bulk (+10%)', '0.2': 'Bulk (+20%)',
        };

        const goalLabel  = goalMap[String(nutri.goal)] || nutri.goal || 'Maintain';
        const updatedAt  = nutri.updated_at
            ? new Date(nutri.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';

        const proteinPct = nutri.protein_pct || 0;
        const fatPct     = nutri.fat_pct || 0;
        const carbPct    = nutri.carb_pct || 0;

        panel.innerHTML = `
            <div class="nutri-summary-card">
                <div class="nutri-calories-row">
                    <div>
                        <div class="nutri-cal-label">Daily Calories</div>
                        <div class="nutri-cal-value">${(nutri.calories || 0).toLocaleString()}<span class="nutri-cal-unit">kcal</span></div>
                    </div>
                    <span class="nutri-goal-pill">${goalLabel}</span>
                </div>

                <div class="nutri-macros-grid">
                    <div class="nutri-macro-chip">
                        <div class="nutri-macro-emoji">🥩</div>
                        <div class="nutri-macro-val">${nutri.protein_g || 0}g</div>
                        <div class="nutri-macro-name">Protein</div>
                    </div>
                    <div class="nutri-macro-chip">
                        <div class="nutri-macro-emoji">🫒</div>
                        <div class="nutri-macro-val">${nutri.fat_g || 0}g</div>
                        <div class="nutri-macro-name">Fat</div>
                    </div>
                    <div class="nutri-macro-chip">
                        <div class="nutri-macro-emoji">🌾</div>
                        <div class="nutri-macro-val">${nutri.carb_g || 0}g</div>
                        <div class="nutri-macro-name">Carbs</div>
                    </div>
                </div>

                <div>
                    <div class="nutri-bar-row">
                        <span class="nutri-bar-label">Protein</span>
                        <div class="nutri-bar-track"><div class="nutri-bar-fill n-protein" id="nd-protein-bar" style="width:0%"></div></div>
                        <span class="nutri-bar-val">${proteinPct}%</span>
                    </div>
                    <div class="nutri-bar-row">
                        <span class="nutri-bar-label">Fat</span>
                        <div class="nutri-bar-track"><div class="nutri-bar-fill n-fat" id="nd-fat-bar" style="width:0%"></div></div>
                        <span class="nutri-bar-val">${fatPct}%</span>
                    </div>
                    <div class="nutri-bar-row">
                        <span class="nutri-bar-label">Carbs</span>
                        <div class="nutri-bar-track"><div class="nutri-bar-fill n-carb" id="nd-carb-bar" style="width:0%"></div></div>
                        <span class="nutri-bar-val">${carbPct}%</span>
                    </div>
                </div>

                <div class="nutri-meta-row">
                    ${nutri.weight_kg ? `<span class="nutri-meta-chip">⚖️ ${nutri.weight_kg} kg</span>` : ''}
                    ${nutri.height_cm ? `<span class="nutri-meta-chip">📏 ${nutri.height_cm} cm</span>` : ''}
                    ${nutri.gender    ? `<span class="nutri-meta-chip">${nutri.gender === 'male' ? '♂' : '♀'} ${nutri.gender}</span>` : ''}
                    ${nutri.bmr       ? `<span class="nutri-meta-chip">🔥 BMR: ${nutri.bmr} kcal</span>` : ''}
                    ${nutri.tdee      ? `<span class="nutri-meta-chip">⚡ TDEE: ${nutri.tdee} kcal</span>` : ''}
                </div>
                ${updatedAt ? `<div class="nutri-updated">Last updated: ${updatedAt}</div>` : ''}
            </div>
        `;

        // Animate bars after render
        setTimeout(() => {
            const pb = document.getElementById('nd-protein-bar');
            const fb = document.getElementById('nd-fat-bar');
            const cb = document.getElementById('nd-carb-bar');
            if (pb) pb.style.width = `${proteinPct}%`;
            if (fb) fb.style.width = `${fatPct}%`;
            if (cb) cb.style.width = `${carbPct}%`;
        }, 100);
    }

    // ── Main Fetch ──────────────────────────────────────────────────────────────
    async function loadDashboard() {
        const token = window.HealthDocAuth.getToken();
        const user  = window.HealthDocAuth.getCurrentUser();

        populateWelcome(user);

        try {
            const res = await fetch(`${API}/user/dashboard`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.status === 401) {
                // Token expired — clear and reload
                window.HealthDocAuth.logout();
                window.location.reload();
                return;
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            populateStats(data);
            populateEHR(data.recent_records || []);
            populateNutri(data.nutri_data);

        } catch (err) {
            console.error('[Dashboard] Failed to load data:', err);
            hide('ehr-loading');
            hide('nutri-loading');
            $('ehr-list') && ($('ehr-list').innerHTML = '<div class="empty-state"><p>Unable to connect to the backend. Ensure the server is running at <strong>localhost:8000</strong>.</p></div>');
            show('ehr-list');
        }
    }

    // ── Init ────────────────────────────────────────────────────────────────────
    function init() {
        // auth.js may have already run (included before this script).
        // Poll briefly to ensure HealthDocAuth is ready.
        let attempts = 0;
        const check = setInterval(() => {
            attempts++;
            if (window.HealthDocAuth) {
                clearInterval(check);
                if (checkAuth()) {
                    loadDashboard();
                } else {
                    // When user logs in via the modal, re-check and load
                    const interval = setInterval(() => {
                        if (window.HealthDocAuth.isLoggedIn()) {
                            clearInterval(interval);
                            checkAuth();
                            loadDashboard();
                        }
                    }, 500);
                }
            }
            if (attempts > 20) clearInterval(check);
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
