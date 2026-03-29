/**
 * HealthDoc EpiForecast Simulation Engine
 * Upgraded with Social Distancing, Multi-Community Grids, Central Locations, and Quarantine zones.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ─── UI References ───
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    const toggleSimBtn = document.getElementById('toggle-sim-btn');
    const resetSimBtn = document.getElementById('reset-sim-btn');
    const dayCounterSpan = document.getElementById('day-counter');

    // Controls
    const inputs = {
        radius: document.getElementById('infectionRadius'),
        chance: document.getElementById('infectionChance'),
        duration: document.getElementById('infectionDuration'),
        initial: document.getElementById('initialInfection'),
        distancing: document.getElementById('distancingFactor'),
        compliance: document.getElementById('compliancePct'),
        central: document.getElementById('centralChance'),
        travel: document.getElementById('travelChance')
    };

    const vals = {
        radius: document.getElementById('val-infectionRadius'),
        chance: document.getElementById('val-infectionChance'),
        duration: document.getElementById('val-infectionDuration'),
        initial: document.getElementById('val-initialInfection'),
        distancing: document.getElementById('val-distancingFactor'),
        compliance: document.getElementById('val-compliancePct'),
        central: document.getElementById('val-centralChance'),
        travel: document.getElementById('val-travelChance')
    };

    // New Toggles
    const modeBtns = document.querySelectorAll('.mode-btn');
    const quarantineCheck = document.getElementById('quarantineCheck');
    const paramCentral = document.getElementById('param-central');
    const paramTravel = document.getElementById('param-travel');

    // Legend
    const pctRemoved = document.getElementById('pct-removed');
    const pctSusceptible = document.getElementById('pct-susceptible');
    const pctInfected = document.getElementById('pct-infected');

    // ─── Simulation Configuration & State ───
    let isPaused = false;
    let animationFrameId;
    let particles = [];
    let totalFrames = 0;
    const FRAMES_PER_DAY = 13.33;

    const COLORS = {
        SUSCEPTIBLE: '#2ABFFF', // Primary Blue
        INFECTED: '#FF7B72',    // Coral Accent
        REMOVED: '#9D4EDD',     // Purple
        INFECT_RADIUS: 'rgba(255, 123, 114, 0.2)',
        QUARANTINE: 'rgba(255, 123, 114, 0.05)',
        QUARANTINE_BORDER: 'rgba(255, 123, 114, 0.3)',
        GRID_LINE: 'rgba(255, 255, 255, 0.1)'
    };

    const PARTICLE_RENDER_RADIUS = 3;
    let simParams = {
        mode: 'simple', // simple, central, communities
        infectionRadiusParam: parseFloat(inputs.radius.value),
        dailyInfectionChance: parseFloat(inputs.chance.value) / 100,
        infectionDurationDays: parseInt(inputs.duration.value, 10),
        initialInfectionPercent: parseFloat(inputs.initial.value) / 100,
        distancingFactor: parseFloat(inputs.distancing.value),
        compliancePct: parseFloat(inputs.compliance.value) / 100,
        centralChance: parseFloat(inputs.central.value) / 100,
        travelChance: parseFloat(inputs.travel.value) / 100,
        quarantineEnabled: quarantineCheck.checked
    };

    // Tracking for Chart
    let historyData = {
        labels: [],
        susceptible: [],
        infected: [],
        removed: []
    };

    // ─── Slider Event Listeners ───
    function updateParamsFromUI() {
        Object.keys(inputs).forEach(key => {
            vals[key].textContent = inputs[key].value;
        });

        simParams.infectionRadiusParam = parseFloat(inputs.radius.value);
        simParams.dailyInfectionChance = parseFloat(inputs.chance.value) / 100;
        simParams.infectionDurationDays = parseInt(inputs.duration.value, 10);
        simParams.distancingFactor = parseFloat(inputs.distancing.value);
        simParams.compliancePct = parseFloat(inputs.compliance.value) / 100;
        simParams.centralChance = parseFloat(inputs.central.value) / 100;
        simParams.travelChance = parseFloat(inputs.travel.value) / 100;
        simParams.quarantineEnabled = quarantineCheck.checked;

        // Changing initial infection requires a hard reset
        if (simParams.initialInfectionPercent !== parseFloat(inputs.initial.value) / 100) {
            simParams.initialInfectionPercent = parseFloat(inputs.initial.value) / 100;
            initSimulation();
        }
    }

    Object.values(inputs).forEach(input => {
        input.addEventListener('input', updateParamsFromUI);
    });

    quarantineCheck.addEventListener('change', updateParamsFromUI);

    modeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            modeBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            simParams.mode = e.target.getAttribute('data-mode');

            // Toggle extra params visibility
            paramCentral.style.display = simParams.mode === 'central' ? 'flex' : 'none';
            paramTravel.style.display = simParams.mode === 'communities' ? 'flex' : 'none';

            initSimulation();
        });
    });

    // ─── Chart.js Setup ───
    const chartCtx = document.getElementById('epiChart').getContext('2d');
    const epiChart = new Chart(chartCtx, {
        type: 'line',
        data: {
            labels: historyData.labels,
            datasets: [
                {
                    label: 'Infected',
                    data: historyData.infected,
                    borderColor: COLORS.INFECTED,
                    backgroundColor: COLORS.INFECTED,
                    fill: true,
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'Susceptible',
                    data: historyData.susceptible,
                    borderColor: COLORS.SUSCEPTIBLE,
                    backgroundColor: COLORS.SUSCEPTIBLE,
                    fill: true,
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'Removed',
                    data: historyData.removed,
                    borderColor: COLORS.REMOVED,
                    backgroundColor: COLORS.REMOVED,
                    fill: true,
                    pointRadius: 0,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { display: false },
                y: {
                    stacked: true,
                    min: 0,
                    max: 100,
                    display: false
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            }
        }
    });

    function updateChart(sCount, iCount, rCount, day, totalCount) {
        if (Math.floor(day) > historyData.labels.length) {
            historyData.labels.push(Math.floor(day));
            historyData.susceptible.push(sCount);
            historyData.infected.push(iCount);
            historyData.removed.push(rCount);

            // Keep absolute scale synced
            epiChart.options.scales.y.max = totalCount;
            epiChart.update();
        }

        // Update Legend Percentages constantly
        const sp = ((sCount / totalCount) * 100).toFixed(1);
        const ip = ((iCount / totalCount) * 100).toFixed(1);
        const rp = ((rCount / totalCount) * 100).toFixed(1);

        pctSusceptible.textContent = `${sp}%`;
        pctInfected.textContent = `${ip}%`;
        pctRemoved.textContent = `${rp}%`;
    }

    // ─── Particle Physics Engine ───
    class Particle {
        constructor(x, y, state, isCompliant, gridX = 0, gridY = 0) {
            this.x = x;
            this.y = y;
            const angle = Math.random() * Math.PI * 2;
            this.speed = 1.0;
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;

            this.state = state; // 'S', 'I', 'R', 'Q' (Quarantined)
            this.infectionStartFrame = 0;
            this.isCompliant = isCompliant;

            // Grid specifics
            this.gridX = gridX;
            this.gridY = gridY;
            this.isTraveling = false;
        }

        update(canvasWidth, canvasHeight) {
            if (this.state === 'Q') {
                return; // Quarantined particles don't move inside their box bounds here, they just get stuck.
            }

            // 1. Determine local bounding box based on mode
            let minX = PARTICLE_RENDER_RADIUS;
            let maxX = canvasWidth - PARTICLE_RENDER_RADIUS;
            let minY = PARTICLE_RENDER_RADIUS;
            let maxY = canvasHeight - PARTICLE_RENDER_RADIUS;

            if (simParams.mode === 'communities' && !this.isTraveling) {
                const cw = canvasWidth / 3;
                const ch = canvasHeight / 3;
                minX = (this.gridX * cw) + PARTICLE_RENDER_RADIUS;
                maxX = ((this.gridX + 1) * cw) - PARTICLE_RENDER_RADIUS;
                minY = (this.gridY * ch) + PARTICLE_RENDER_RADIUS;
                maxY = ((this.gridY + 1) * ch) - PARTICLE_RENDER_RADIUS;
            }

            // 2. Communities: Chance to travel
            if (simParams.mode === 'communities' && !this.isTraveling) {
                const frameTravelChance = simParams.travelChance / FRAMES_PER_DAY;
                if (Math.random() < frameTravelChance) {
                    this.isTraveling = true;
                    // Pick new random grid diff from current
                    let newGX = this.gridX;
                    let newGY = this.gridY;
                    while (newGX === this.gridX && newGY === this.gridY) {
                        newGX = Math.floor(Math.random() * 3);
                        newGY = Math.floor(Math.random() * 3);
                    }
                    this.gridX = newGX;
                    this.gridY = newGY;

                    // Aim towards new grid center
                    const newCw = canvasWidth / 3;
                    const newCh = canvasHeight / 3;
                    const targetX = (this.gridX * newCw) + (newCw / 2);
                    const targetY = (this.gridY * newCh) + (newCh / 2);

                    const angle = Math.atan2(targetY - this.y, targetX - this.x);
                    this.vx = Math.cos(angle) * this.speed;
                    this.vy = Math.sin(angle) * this.speed;
                }
            }

            // If traveling, check if arrived at new grid
            if (this.isTraveling) {
                const cw = canvasWidth / 3;
                const ch = canvasHeight / 3;
                if (this.x >= this.gridX * cw && this.x <= (this.gridX + 1) * cw &&
                    this.y >= this.gridY * ch && this.y <= (this.gridY + 1) * ch) {
                    this.isTraveling = false; // Arrived
                }
            }

            // 3. Central Location: Chance to visit
            if (simParams.mode === 'central') {
                const frameCentralChance = simParams.centralChance / FRAMES_PER_DAY;
                if (Math.random() < frameCentralChance) {
                    // Aim towards center
                    const targetX = canvasWidth / 2;
                    const targetY = canvasHeight / 2;
                    const angle = Math.atan2(targetY - this.y, targetX - this.x);
                    this.vx = Math.cos(angle) * this.speed;
                    this.vy = Math.sin(angle) * this.speed;
                }
            }

            // 4. Move
            this.x += this.vx;
            this.y += this.vy;

            // 5. Bounce bounds
            if (this.x <= minX) { this.x = minX; this.vx *= -1; }
            if (this.x >= maxX) { this.x = maxX; this.vx *= -1; }
            if (this.y <= minY) { this.y = minY; this.vy *= -1; }
            if (this.y >= maxY) { this.y = maxY; this.vy *= -1; }

            // 6. Recovery & Quarantine Logic
            if (this.state === 'I') {
                const daysInfected = (totalFrames - this.infectionStartFrame) / FRAMES_PER_DAY;
                if (daysInfected >= simParams.infectionDurationDays) {
                    this.state = 'R';
                } else if (simParams.quarantineEnabled && daysInfected >= 10) {
                    // Quarantined after 10 days
                    this.state = 'Q';
                    // Move to Quarantine box (Bottom Right Corner visually 80x80 box)
                    this.x = canvasWidth - 10 - Math.random() * 60;
                    this.y = canvasHeight - 10 - Math.random() * 60;
                    // Stop velocity so it stays relatively put, relying on bounds later or just no update func calling.
                }
            }
        }

        draw(ctx, canvasWidth) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, PARTICLE_RENDER_RADIUS, 0, Math.PI * 2);

            if (this.state === 'S') ctx.fillStyle = COLORS.SUSCEPTIBLE;
            if (this.state === 'I') ctx.fillStyle = COLORS.INFECTED;
            if (this.state === 'R') ctx.fillStyle = COLORS.REMOVED;
            if (this.state === 'Q') ctx.fillStyle = COLORS.INFECTED; // Same visual virus color, different box

            ctx.fill();

            // Infection Ring
            if (this.state === 'I') {
                const pxRadius = Math.max(1, simParams.infectionRadiusParam * Math.min(canvasWidth, canvas.height));
                ctx.beginPath();
                ctx.arc(this.x, this.y, pxRadius, 0, Math.PI * 2);
                ctx.fillStyle = COLORS.INFECT_RADIUS;
                ctx.fill();
                ctx.strokeStyle = COLORS.INFECTED;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }
    }

    let totalParticleCount = 0;

    function initSimulation() {
        const wrapper = document.querySelector('.canvas-wrapper');
        // Fix for sometimes being small when toggling
        const computedStyle = getComputedStyle(wrapper);
        const w = parseInt(computedStyle.width) || wrapper.clientWidth;
        const h = parseInt(computedStyle.height) || wrapper.clientHeight;

        canvas.width = w > 0 ? w : 600;
        canvas.height = h > 0 ? h : 400;

        particles = [];
        totalFrames = 0;

        historyData.labels.length = 0;
        historyData.susceptible.length = 0;
        historyData.infected.length = 0;
        historyData.removed.length = 0;

        // Count logic based on mode
        let baseParticles = simParams.mode === 'communities' ? 450 : 250;
        totalParticleCount = baseParticles;
        const numInfected = Math.max(1, Math.floor(baseParticles * simParams.initialInfectionPercent));

        let initialS = baseParticles, initialI = 0, initialR = 0;

        for (let i = 0; i < baseParticles; i++) {
            let gridX = 0, gridY = 0;
            if (simParams.mode === 'communities') {
                // 9 grids
                const gridIndex = Math.floor(i / (baseParticles / 9));
                gridX = gridIndex % 3;
                gridY = Math.floor(gridIndex / 3);
            }

            // Distribute start positions
            const cw = simParams.mode === 'communities' ? canvas.width / 3 : canvas.width;
            const ch = simParams.mode === 'communities' ? canvas.height / 3 : canvas.height;

            const minX = (gridX * cw) + PARTICLE_RENDER_RADIUS;
            const minY = (gridY * ch) + PARTICLE_RENDER_RADIUS;

            const x = Math.random() * (cw - PARTICLE_RENDER_RADIUS * 2) + minX;
            const y = Math.random() * (ch - PARTICLE_RENDER_RADIUS * 2) + minY;

            const isCompliant = Math.random() < simParams.compliancePct;

            particles.push(new Particle(x, y, 'S', isCompliant, gridX, gridY));
        }

        // Randomly infect particles to avoid clumping
        while (initialI < numInfected) {
            let randIdx = Math.floor(Math.random() * baseParticles);
            if (particles[randIdx].state === 'S') {
                particles[randIdx].state = 'I';
                initialI++;
                initialS--;
            }
        }

        historyData.labels.push(0);
        historyData.susceptible.push(initialS);
        historyData.infected.push(initialI);
        historyData.removed.push(initialR);

        dayCounterSpan.textContent = "Day 0";
        epiChart.options.scales.y.max = totalParticleCount;
        epiChart.update();

        updateChart(initialS, initialI, initialR, 0, totalParticleCount);
    }

    // ─── Main Loop ───
    function simulationLoop() {
        if (!isPaused) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw Background Grids/Zones
            if (simParams.mode === 'communities') {
                ctx.strokeStyle = COLORS.GRID_LINE;
                ctx.lineWidth = 1;
                for (let i = 1; i < 3; i++) {
                    ctx.beginPath(); ctx.moveTo(i * canvas.width / 3, 0); ctx.lineTo(i * canvas.width / 3, canvas.height); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, i * canvas.height / 3); ctx.lineTo(canvas.width, i * canvas.height / 3); ctx.stroke();
                }
            } else if (simParams.mode === 'central') {
                ctx.strokeStyle = COLORS.GRID_LINE;
                ctx.lineWidth = 1;
                const r = Math.min(canvas.width, canvas.height) * 0.15;
                ctx.strokeRect(canvas.width / 2 - r, canvas.height / 2 - r, r * 2, r * 2);
            }

            if (simParams.quarantineEnabled) {
                ctx.fillStyle = COLORS.QUARANTINE;
                ctx.fillRect(canvas.width - 80, canvas.height - 80, 80, 80);
                ctx.strokeStyle = COLORS.QUARANTINE_BORDER;
                ctx.lineWidth = 2;
                ctx.strokeRect(canvas.width - 80, canvas.height - 80, 80, 80);
                ctx.fillStyle = COLORS.INFECTED;
                ctx.font = '10px Quicksand';
                ctx.textAlign = 'center';
                ctx.fillText('QUARANTINE', canvas.width - 40, canvas.height - 65);
            }


            let sCount = 0, iCount = 0, rCount = 0, qCount = 0;
            const pixelRadius = simParams.infectionRadiusParam * Math.min(canvas.width, canvas.height);
            const frameInfectionChance = simParams.dailyInfectionChance / FRAMES_PER_DAY;

            const distancingRadiusSq = (pixelRadius * 2) * (pixelRadius * 2);

            // Pass 1: Behavior & Spread
            for (let i = 0; i < particles.length; i++) {
                const p1 = particles[i];

                // Track states
                if (p1.state === 'S') sCount++;
                else if (p1.state === 'I') iCount++;
                else if (p1.state === 'R') rCount++;
                else if (p1.state === 'Q') { qCount++; iCount++; } // Q counts visually broadly as infected for area chart

                // Social Distancing and Infection Spreading
                if (p1.state !== 'Q') {
                    let repelX = 0;
                    let repelY = 0;
                    let nearCount = 0;

                    for (let j = 0; j < particles.length; j++) {
                        if (i === j) continue;
                        const p2 = particles[j];

                        if (p2.state === 'Q') continue; // Don't interact with quarantined objects

                        const dx = p1.x - p2.x;
                        const dy = p1.y - p2.y;
                        const distSq = dx * dx + dy * dy;

                        // Infection Logic
                        if (p1.state === 'I' && p2.state === 'S') {
                            if (distSq <= pixelRadius * pixelRadius) {
                                if (Math.random() < frameInfectionChance) {
                                    p2.state = 'I';
                                    p2.infectionStartFrame = totalFrames;
                                }
                            }
                        }

                        // Distancing Logic (p1 avoids p2)
                        // Social factor scales linearly from 0 to 1
                        if (p1.isCompliant && simParams.distancingFactor > 0) {
                            if (distSq < distancingRadiusSq && distSq > 0) {
                                const dist = Math.sqrt(distSq);
                                repelX += (dx / dist);
                                repelY += (dy / dist);
                                nearCount++;
                            }
                        }
                    }

                    // Apply Repulsion (Steering)
                    if (nearCount > 0) {
                        repelX = (repelX / nearCount) * simParams.distancingFactor * 2.0;
                        repelY = (repelY / nearCount) * simParams.distancingFactor * 2.0;

                        p1.vx += repelX;
                        p1.vy += repelY;

                        const mag = Math.sqrt(p1.vx * p1.vx + p1.vy * p1.vy);
                        if (mag > 0) {
                            p1.vx = (p1.vx / mag) * p1.speed;
                            p1.vy = (p1.vy / mag) * p1.speed;
                        }
                    }
                }

                p1.update(canvas.width, canvas.height);
            }

            // Pass 2: Rendering
            for (let p of particles) p.draw(ctx, canvas.width);

            totalFrames++;
            const currentDay = totalFrames / FRAMES_PER_DAY;
            dayCounterSpan.textContent = `Day ${Math.floor(currentDay)}`;

            // Note: iCount theoretically includes 'Q' to map visually to chart as infected
            updateChart(sCount, iCount, rCount, currentDay, totalParticleCount);
        }

        animationFrameId = requestAnimationFrame(simulationLoop);
    }

    // ─── Control Bindings ───
    toggleSimBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        toggleSimBtn.textContent = isPaused ? 'Resume' : 'Pause';
        if (isPaused) {
            toggleSimBtn.classList.replace('btn-primary', 'btn-secondary');
        } else {
            toggleSimBtn.classList.replace('btn-secondary', 'btn-primary');
        }
    });

    resetSimBtn.addEventListener('click', () => { initSimulation(); });

    window.addEventListener('resize', () => {
        const wrapper = document.querySelector('.canvas-wrapper');
        canvas.width = wrapper.clientWidth;
        canvas.height = wrapper.clientHeight;
    });

    // Start
    updateParamsFromUI();
    initSimulation();
    simulationLoop();
});
