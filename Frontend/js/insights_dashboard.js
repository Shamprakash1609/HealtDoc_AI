/**
 * insights_dashboard.js — HealthDoc Insights Dashboard
 *
 * Checks auth state → fetches ALL user data from backend → renders:
 *   1. Stats row
 *   2. Health Risks grid (aggregated from all reports)
 *   3. EHR Records list (expandable, with full MedGemma AI summary)
 *   4. NutriPlan summary panel with macro bars
 */

(function () {
    'use strict';

    const API = 'http://127.0.0.1:8000';
    const $ = id => document.getElementById(id);
    const show = (id, display) => { const el = $(id); if (el) el.style.display = display || ''; };
    const hide = id => { const el = $(id); if (el) el.style.display = 'none'; };

    // ── Auth Check ──────────────────────────────────────────────────────────────
    function checkAuth() {
        const auth = window.HealthDocAuth;
        if (!auth || !auth.isLoggedIn()) {
            show('auth-gate', 'flex');
            hide('dashboard-main');
            bindGateButtons(auth);
            return false;
        }
        hide('auth-gate');
        show('dashboard-main', 'block');
        return true;
    }

    function bindGateButtons(auth) {
        const loginBtn    = $('gate-login-btn');
        const registerBtn = $('gate-register-btn');
        const open = () => window.HealthDocAuth && window.HealthDocAuth.openModal;
        if (loginBtn)    loginBtn.addEventListener('click',    () => open() && window.HealthDocAuth.openModal('login'));
        if (registerBtn) registerBtn.addEventListener('click', () => open() && window.HealthDocAuth.openModal('register'));
    }

    // ── Welcome Bar ─────────────────────────────────────────────────────────────
    function populateWelcome(user) {
        const hour      = new Date().getHours();
        const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const firstName = (user?.name || 'there').split(' ')[0];

        const heading = $('welcome-heading');
        if (heading) heading.textContent = `${greeting}, ${firstName} 👋`;

        const avatarEl = $('welcome-avatar');
        if (avatarEl) avatarEl.textContent = firstName[0]?.toUpperCase() || 'U';

        const dateEl = $('today-date');
        if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        const logoutBtn = $('dash-logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => { window.HealthDocAuth.logout(); window.location.reload(); });
    }

    // ── Stats ───────────────────────────────────────────────────────────────────
    function populateStats({ total_reports, total_risks, health_score, last_analysis }) {
        if ($('stat-reports-val')) $('stat-reports-val').textContent = total_reports ?? 0;
        if ($('stat-risks-val'))   $('stat-risks-val').textContent   = total_risks ?? 0;
        if ($('stat-health-val'))  $('stat-health-val').textContent  = `${health_score ?? 100}/100`;
        if ($('stat-last-val')) {
            $('stat-last-val').textContent = last_analysis
                ? new Date(last_analysis).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'Never';
        }
    }

    // ── Health Risks Grid ────────────────────────────────────────────────────────
    function populateRisks(records) {
        // Collect all risks from all records
        const allRisks = [];
        records.forEach(rec => {
            const risks = rec.risks || [];
            risks.forEach(r => {
                allRisks.push({
                    risk: typeof r === 'string' ? r : (r.risk || JSON.stringify(r)),
                    severity: r.severity || r.status || 'MEDIUM',
                    filename: rec.filename || 'Medical Report',
                    date: rec.saved_at,
                    source: rec.source,
                });
            });
        });

        const section = $('risks-section');
        const grid    = $('risks-grid');

        if (!allRisks.length || !section || !grid) {
            if (section) section.style.display = 'none';
            return;
        }

        section.style.display = '';
        grid.innerHTML = '';

        allRisks.forEach(item => {
            const high = item.severity === 'HIGH' || item.risk.toLowerCase().includes('critical') || item.risk.toLowerCase().includes('high');
            const low  = item.severity === 'LOW' || item.severity === 'NORMAL';
            const sevClass = high ? 'risk-high' : low ? 'risk-low' : 'risk-medium';
            const sevLabel = high ? 'High Priority' : low ? 'Monitored' : 'Review';
            const icon = item.source === 'image' ? '🩻' : '🧪';
            const dateStr = item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

            const card = document.createElement('div');
            card.className = `risk-flag-card ${sevClass}`;
            card.innerHTML = `
                <div class="risk-flag-top">
                    <span class="risk-sev-pill">${sevLabel}</span>
                    <span class="risk-source-icon">${icon}</span>
                </div>
                <div class="risk-flag-title">${item.risk}</div>
                <div class="risk-flag-meta">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    ${item.filename}${dateStr ? ` · ${dateStr}` : ''}
                </div>
            `;
            grid.appendChild(card);
        });
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
        records.forEach((rec, idx) => container.appendChild(createEHRCard(rec, idx)));
    }

    function createEHRCard(rec, idx) {
        const isImage    = rec.source === 'image';
        const risks      = rec.risks || [];
        const metrics    = rec.metrics || {};
        const riskCount  = risks.length;
        const findings   = rec.findings || [];

        const riskClass = riskCount === 0 ? 'risk-none' : riskCount <= 1 ? 'risk-low' : riskCount <= 2 ? 'risk-medium' : 'risk-high';
        const riskLabel = riskCount === 0 ? 'No Risks' : `${riskCount} Risk${riskCount > 1 ? 's' : ''}`;

        const dateStr = rec.saved_at
            ? new Date(rec.saved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Unknown date';

        const timeStr = rec.saved_at
            ? new Date(rec.saved_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : '';

        // Metrics grid (show all)
        const metricEntries = Object.entries(metrics);
        const metricsHTML = metricEntries.length ? `
            <div class="ehr-section-label">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                Biomarkers Extracted
            </div>
            <div class="ehr-metrics-grid">
                ${metricEntries.map(([key, info]) => `
                    <div class="ehr-metric-chip">
                        <div class="metric-name">${info.display || key}</div>
                        <div class="metric-val">${info.value} <span class="metric-unit">${info.unit || ''}</span></div>
                    </div>
                `).join('')}
            </div>` : '';

        // Risks block
        const risksHTML = risks.length ? `
            <div class="ehr-section-label" style="color:var(--color-coral);">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                Clinical Risk Flags
            </div>
            <div class="ehr-risks-list">
                ${risks.map(r => {
                    const label = typeof r === 'string' ? r : (r.risk || JSON.stringify(r));
                    const metric = typeof r === 'object' && r.metric ? `<span class="risk-metric-tag">${r.metric}: ${r.value} ${r.unit || ''}</span>` : '';
                    return `<div class="ehr-risk-item"><div class="ehr-risk-dot"></div><span>${label}</span>${metric}</div>`;
                }).join('')}
            </div>` : '';

        // Findings (images)
        const findingsHTML = findings.length ? `
            <div class="ehr-section-label" style="color:var(--color-purple);">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                Visual Findings
            </div>
            <div class="ehr-risks-list">
                ${findings.map(f => `<div class="ehr-risk-item"><div class="ehr-risk-dot" style="background:var(--color-purple)"></div><span>${f}</span></div>`).join('')}
            </div>` : '';

        // Diagnosis
        const diagHTML = rec.diagnosis ? `
            <div class="ehr-diagnosis-banner">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                <strong>Diagnosis:</strong> ${rec.diagnosis}
            </div>` : '';

        // MedGemma AI Summary (render markdown)
        const aiHTML = rec.explanation ? `
            <div class="ehr-section-label ai-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                MedGemma AI Analysis
            </div>
            <div class="ehr-ai-summary">
                ${(typeof marked !== 'undefined') ? marked.parse(rec.explanation) : rec.explanation.replace(/\n/g, '<br>')}
            </div>` : '';

        const div = document.createElement('div');
        div.className = 'ehr-card';
        div.id = `ehr-card-${idx}`;
        div.innerHTML = `
            <div class="ehr-card-header" onclick="window._toggleEHR(${idx})">
                <div class="ehr-type-badge ${isImage ? 'ehr-type-image' : 'ehr-type-report'}">
                    ${isImage ? '🩻' : '🧪'}
                </div>
                <div class="ehr-header-info">
                    <div class="ehr-filename">${rec.filename || 'Medical Report'}</div>
                    <div class="ehr-meta-row">
                        <span class="ehr-date">${dateStr}${timeStr ? ' · ' + timeStr : ''}</span>
                        <span class="ehr-type-tag">${isImage ? 'Medical Image' : 'Lab Report'}</span>
                    </div>
                </div>
                <span class="ehr-risk-pill ${riskClass}">${riskLabel}</span>
                <svg class="ehr-chevron" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                </svg>
            </div>
            <div class="ehr-card-body">
                ${diagHTML}
                ${metricsHTML}
                ${risksHTML}
                ${findingsHTML}
                ${aiHTML}
            </div>
        `;
        return div;
    }

    window._toggleEHR = function (idx) {
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

        const goalMap = {
            '0': 'Maintain Weight',
            '-0.1': 'Mild Cut (−10%)', '-0.2': 'Cut (−20%)', '-0.3': 'Aggressive Cut (−30%)',
            '0.1': 'Mild Bulk (+10%)', '0.2': 'Bulk (+20%)',
        };

        const goalLabel = goalMap[String(nutri.goal)] || nutri.goal || 'Maintain';
        const pPct      = nutri.protein_pct || 0;
        const fPct      = nutri.fat_pct || 0;
        const cPct      = nutri.carb_pct || 0;
        const updatedAt = nutri.updated_at
            ? new Date(nutri.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';

        const weeklyDir = nutri.weekly_change_kg > 0 ? '↑ Gaining' : nutri.weekly_change_kg < 0 ? '↓ Losing' : '= Maintaining';
        const weeklyColor = nutri.weekly_change_kg > 0 ? 'var(--color-accent)' : nutri.weekly_change_kg < 0 ? 'var(--color-coral)' : 'var(--color-text-mutated)';

        $('nutri-panel').innerHTML = `
            <div class="nutri-summary-card">

                <!-- Calorie hero -->
                <div class="nutri-hero">
                    <div class="nutri-hero-left">
                        <div class="nutri-hero-label">Daily Target</div>
                        <div class="nutri-hero-cal">${(nutri.calories || 0).toLocaleString()}<span class="nutri-hero-unit">kcal</span></div>
                        <div class="nutri-goal-pill">${goalLabel}</div>
                    </div>
                    <div class="nutri-hero-right">
                        <div class="nutri-ring-stack">
                            <div class="nutri-ring-item">
                                <div class="nutri-ring-val">${nutri.protein_g || 0}g</div>
                                <div class="nutri-ring-label">🥩 Protein</div>
                            </div>
                            <div class="nutri-ring-item">
                                <div class="nutri-ring-val">${nutri.fat_g || 0}g</div>
                                <div class="nutri-ring-label">🫒 Fat</div>
                            </div>
                            <div class="nutri-ring-item">
                                <div class="nutri-ring-val">${nutri.carb_g || 0}g</div>
                                <div class="nutri-ring-label">🌾 Carbs</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Macro Bars -->
                <div class="nutri-bars-section">
                    <div class="nutri-bar-row">
                        <span class="nutri-bar-label">🥩 Protein</span>
                        <div class="nutri-bar-track">
                            <div class="nutri-bar-fill n-protein" id="nd-pb" style="width:0%"></div>
                        </div>
                        <span class="nutri-bar-pct">${pPct}%</span>
                        <span class="nutri-bar-g">${nutri.protein_g || 0}g</span>
                    </div>
                    <div class="nutri-bar-row">
                        <span class="nutri-bar-label">🫒 Fat</span>
                        <div class="nutri-bar-track">
                            <div class="nutri-bar-fill n-fat" id="nd-fb" style="width:0%"></div>
                        </div>
                        <span class="nutri-bar-pct">${fPct}%</span>
                        <span class="nutri-bar-g">${nutri.fat_g || 0}g</span>
                    </div>
                    <div class="nutri-bar-row">
                        <span class="nutri-bar-label">🌾 Carbs</span>
                        <div class="nutri-bar-track">
                            <div class="nutri-bar-fill n-carb" id="nd-cb" style="width:0%"></div>
                        </div>
                        <span class="nutri-bar-pct">${cPct}%</span>
                        <span class="nutri-bar-g">${nutri.carb_g || 0}g</span>
                    </div>
                </div>

                <!-- Breakdown Stats -->
                <div class="nutri-breakdown-grid">
                    ${nutri.bmr  ? `<div class="nutri-breakdown-item"><div class="nbd-label">BMR</div><div class="nbd-val">🔥 ${nutri.bmr.toLocaleString()} kcal</div></div>` : ''}
                    ${nutri.tdee ? `<div class="nutri-breakdown-item"><div class="nbd-label">TDEE</div><div class="nbd-val">⚡ ${nutri.tdee.toLocaleString()} kcal</div></div>` : ''}
                    ${nutri.weight_kg ? `<div class="nutri-breakdown-item"><div class="nbd-label">Weight</div><div class="nbd-val">⚖️ ${nutri.weight_kg} kg</div></div>` : ''}
                    ${nutri.height_cm ? `<div class="nutri-breakdown-item"><div class="nbd-label">Height</div><div class="nbd-val">📏 ${nutri.height_cm} cm</div></div>` : ''}
                    ${nutri.gender ? `<div class="nutri-breakdown-item"><div class="nbd-label">Gender</div><div class="nbd-val">${nutri.gender === 'male' ? '♂️ Male' : '♀️ Female'}</div></div>` : ''}
                    ${nutri.diet_type ? `<div class="nutri-breakdown-item"><div class="nbd-label">Diet</div><div class="nbd-val">🍽 ${nutri.diet_type}</div></div>` : ''}
                </div>

                <!-- Weekly Change -->
                <div class="nutri-weekly-row" style="color:${weeklyColor}">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                    <strong>${weeklyDir}</strong> — ~${Math.abs(nutri.weekly_change_kg || 0)} kg/week
                </div>

                ${updatedAt ? `<div class="nutri-updated">⏱ Last saved: ${updatedAt}</div>` : ''}
            </div>
        `;

        // Animate bars
        setTimeout(() => {
            const pb = $('nd-pb'), fb = $('nd-fb'), cb = $('nd-cb');
            if (pb) pb.style.width = `${pPct}%`;
            if (fb) fb.style.width = `${fPct}%`;
            if (cb) cb.style.width = `${cPct}%`;
        }, 120);
    }

    // ── Main Load ────────────────────────────────────────────────────────────────
    async function loadDashboard() {
        const token = window.HealthDocAuth.getToken();
        const user  = window.HealthDocAuth.getCurrentUser();

        populateWelcome(user);

        try {
            // Fetch ALL EHR records + NutriPlan + dashboard summary in parallel
            const [dashRes, ehrRes] = await Promise.all([
                fetch(`${API}/user/dashboard`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API}/user/ehr`,       { headers: { 'Authorization': `Bearer ${token}` } }),
            ]);

            if (dashRes.status === 401 || ehrRes.status === 401) {
                window.HealthDocAuth.logout();
                window.location.reload();
                return;
            }

            const dashData = await dashRes.json();
            const ehrData  = ehrRes.ok ? await ehrRes.json() : { records: [] };

            const allRecords = ehrData.records || [];

            populateStats(dashData);
            populateRisks(allRecords);
            populateEHR(allRecords);
            populateNutri(dashData.nutri_data);

        } catch (err) {
            console.error('[Dashboard] Load failed:', err);
            hide('ehr-loading');
            hide('nutri-loading');
            const errMsg = `<div class="empty-state"><p style="color:var(--color-coral);">⚠️ Could not connect to backend at <strong>localhost:8000</strong>. Please start the server and refresh.</p></div>`;
            const ehrList = $('ehr-list');
            if (ehrList) { ehrList.innerHTML = errMsg; ehrList.style.display = ''; }
            show('nutri-empty');
        }
    }

    // ── Init ─────────────────────────────────────────────────────────────────────
    function init() {
        let attempts = 0;
        const check = setInterval(() => {
            attempts++;
            if (window.HealthDocAuth) {
                clearInterval(check);
                if (checkAuth()) {
                    loadDashboard();
                } else {
                    // Poll for login via modal
                    const poll = setInterval(() => {
                        if (window.HealthDocAuth && window.HealthDocAuth.isLoggedIn()) {
                            clearInterval(poll);
                            hide('auth-gate');
                            show('dashboard-main', 'block');
                            loadDashboard();
                        }
                    }, 600);
                }
            }
            if (attempts > 30) clearInterval(check);
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
