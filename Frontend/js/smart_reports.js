const API_URL = 'http://127.0.0.1:8000';

// ── Drop Zone Logic ──
function setupDropZone(dropId, inputId, filenameId, btnId, isImage = false) {
    const drop = document.getElementById(dropId);
    const input = document.getElementById(inputId);
    const fname = document.getElementById(filenameId);
    const btn = document.getElementById(btnId);

    drop.addEventListener('click', () => input.click());

    drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('dragover');
    });

    drop.addEventListener('dragleave', () => {
        drop.classList.remove('dragover');
    });

    drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            onFileSelected(input, fname, btn, isImage);
        }
    });

    input.addEventListener('change', () => {
        onFileSelected(input, fname, btn, isImage);
    });
}

function onFileSelected(input, fname, btn, isImage) {
    if (input.files.length) {
        const file = input.files[0];

        if (isImage) {
            // Show image preview
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.getElementById('image-preview-img');
                img.src = e.target.result;
                document.getElementById('image-preview-container').classList.add('visible');
            };
            reader.readAsDataURL(file);
        } else {
            // Show filename 
            fname.textContent = file.name;
            fname.classList.add('visible');
        }

        btn.disabled = false;
    }
}

function showStatus(id, message, type) {
    const el = document.getElementById(id);
    el.textContent = message;
    el.className = `status-text visible ${type}`;
}

// ── Setup ──
setupDropZone('report-drop', 'report-file', 'report-filename', 'analyze-report-btn', false);
setupDropZone('image-drop', 'image-file', null, 'analyze-image-btn', true);

// ── Report Analysis ──
document.getElementById('analyze-report-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('report-file');
    if (!fileInput.files.length) return;

    const file = fileInput.files[0];
    const btn = document.getElementById('analyze-report-btn');
    const resultsPanel = document.getElementById('report-results');

    btn.disabled = true;
    btn.textContent = 'Processing...';
    resultsPanel.classList.remove('visible');
    showStatus('report-status', 'Uploading & Analyzing...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${API_URL}/medical/analyze-report`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Analysis failed');
        }

        const data = await res.json();
        renderReportDashboard(data);
        showStatus('report-status', 'Analysis Complete!', 'success');
        resultsPanel.classList.add('visible');

    } catch (error) {
        showStatus('report-status', `Failed: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Analyze Report';
    }
});

function renderReportDashboard(data) {
    // Top Bar Filename
    document.getElementById('report-dashboard-title').textContent = data.filename || 'Clinical Dashboard';

    // Metrics Grid
    const grid = document.getElementById('metrics-grid');
    grid.innerHTML = '';
    if (data.metrics && Object.keys(data.metrics).length > 0) {
        for (const [key, info] of Object.entries(data.metrics)) {
            const tile = document.createElement('div');
            tile.className = 'metric-card';
            tile.innerHTML = `
                <h4>${info.display || key}</h4>
                <div class="value">${info.value} <span class="unit">${info.unit || ''}</span></div>
            `;
            grid.appendChild(tile);
        }
    } else {
        grid.innerHTML = '<p>No structured metrics extracted.</p>';
    }

    // Risk List
    const riskList = document.getElementById('risk-list');
    riskList.innerHTML = '';
    if (data.risks && data.risks.length > 0) {
        data.risks.forEach(r => {
            let sevClass = 'severity-medium';
            if (r.status === 'HIGH' || r.severity === 'HIGH') sevClass = 'severity-high';
            if (r.status === 'NORMAL') sevClass = 'severity-low';

            const card = document.createElement('div');
            card.className = `alert-card ${sevClass}`;
            card.innerHTML = `
                <div>
                    <div class="risk-title">${r.risk || r}</div>
                    ${r.metric ? `<div class="risk-metric">${r.metric}: ${r.value} ${r.unit}</div>` : ''}
                </div>
                <div class="severity-pulse"></div>
            `;
            riskList.appendChild(card);
        });
    } else {
        riskList.innerHTML = '<p>No significant risks detected in this report.</p>';
    }

    // AI Explanation
    const expDiv = document.getElementById('report-explanation');
    expDiv.innerHTML = marked.parse(data.explanation || 'No AI summary provided.');
}

// ── Image Analysis ──
document.getElementById('analyze-image-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('image-file');
    if (!fileInput.files.length) return;

    const file = fileInput.files[0];
    const btn = document.getElementById('analyze-image-btn');
    const resultsPanel = document.getElementById('image-results');

    btn.disabled = true;
    btn.textContent = 'Analyzing...';
    resultsPanel.classList.remove('visible');
    showStatus('image-status', 'Running MedGemma Vision...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${API_URL}/medical/analyze-image`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Analysis failed');
        }

        const data = await res.json();

        // Handle Header
        if (data.diagnosis && data.diagnosis !== 'Not identified') {
            document.getElementById('diagnosis-header').innerHTML = `<div class="diagnosis-highlight">Diagnosis: ${data.diagnosis}</div>`;
        } else {
            document.getElementById('diagnosis-header').innerHTML = '';
        }

        // Handle Body (Use Analysis markdown if exists, otherwise fallback to HTML generation)
        const contentDiv = document.getElementById('image-analysis');
        if (data.analysis) {
            contentDiv.innerHTML = marked.parse(data.analysis);
        } else {
            let html = `<h2>Description</h2><p>${data.description}</p>`;
            if (data.findings && data.findings.length) {
                html += `<h2>Findings</h2><ul>`;
                data.findings.forEach(f => html += `<li>${f}</li>`);
                html += `</ul>`;
            }
            html += `<h2>Explanation</h2><p>${data.explanation}</p>`;
            html += `<h2>Medical Urgency</h2><p><strong>${data.importance}</strong></p>`;
            contentDiv.innerHTML = html;
        }

        showStatus('image-status', 'Vision Analysis Complete!', 'success');
        resultsPanel.classList.add('visible');

    } catch (error) {
        showStatus('image-status', `Failed: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Analyze Image';
    }
});
