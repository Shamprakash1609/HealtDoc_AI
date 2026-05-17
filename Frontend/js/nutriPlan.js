/**
 * NutriPlan Calculator — HealthDoc AI
 * Pure vanilla JS: BMR (Mifflin-St Jeor) → TDEE → Goal Adjustment → Macros
 */

(function () {
    'use strict';

    // ── DOM References ──
    const ageInput       = document.getElementById('age-input');
    const genderSelect   = document.getElementById('gender-select');
    const weightInput    = document.getElementById('weight-input');
    const heightCmInput  = document.getElementById('height-cm-input');
    const heightFtInput  = document.getElementById('height-ft-input');
    const heightInInput  = document.getElementById('height-in-input');
    const activitySelect = document.getElementById('activity-select');
    const goalSelect     = document.getElementById('goal-select');
    const proteinSelect  = document.getElementById('protein-select');
    const dietSelect     = document.getElementById('diet-select');
    const fatCarbSlider  = document.getElementById('fat-carb-slider');
    const fatPctLabel    = document.getElementById('fat-pct-label');
    const carbPctLabel   = document.getElementById('carb-pct-label');

    // Weight unit toggle
    const weightKgBtn    = document.getElementById('weight-kg-btn');
    const weightLbsBtn   = document.getElementById('weight-lbs-btn');
    const weightUnitLabel = document.getElementById('weight-unit-label');

    // Height unit toggle
    const heightCmBtn     = document.getElementById('height-cm-btn');
    const heightFtinBtn   = document.getElementById('height-ftin-btn');
    const heightCmWrapper = document.getElementById('height-cm-wrapper');
    const heightFtinWrapper = document.getElementById('height-ftin-wrapper');

    // Result fields
    const caloriesResult  = document.getElementById('calories-result');
    const proteinResult   = document.getElementById('protein-result');
    const fatResult       = document.getElementById('fat-result');
    const carbResult      = document.getElementById('carb-result');
    const proteinPct      = document.getElementById('protein-pct');
    const fatPct          = document.getElementById('fat-pct');
    const carbPct         = document.getElementById('carb-pct');
    const proteinBar      = document.getElementById('protein-bar');
    const fatBar          = document.getElementById('fat-bar');
    const carbBar         = document.getElementById('carb-bar');
    const proteinBarVal   = document.getElementById('protein-bar-val');
    const fatBarVal       = document.getElementById('fat-bar-val');
    const carbBarVal      = document.getElementById('carb-bar-val');
    const weeklyChange    = document.getElementById('weekly-change');
    const weeklyDesc      = document.getElementById('weekly-desc');
    const bmrResult       = document.getElementById('bmr-result');
    const tdeeResult      = document.getElementById('tdee-result');
    const adjustmentResult = document.getElementById('adjustment-result');
    const fatCarbSliderGroup = document.getElementById('fat-carb-slider-group');

    // ── State ──
    let weightUnit = 'kg';
    let heightUnit = 'cm';

    // ── Unit Toggle Handlers ──

    weightKgBtn.addEventListener('click', () => {
        if (weightUnit === 'lbs') {
            const lbs = parseFloat(weightInput.value) || 0;
            weightInput.value = Math.round((lbs / 2.20462) * 10) / 10;
        }
        weightUnit = 'kg';
        weightKgBtn.classList.add('active');
        weightLbsBtn.classList.remove('active');
        weightUnitLabel.textContent = 'kg';
        calculate();
    });

    weightLbsBtn.addEventListener('click', () => {
        if (weightUnit === 'kg') {
            const kg = parseFloat(weightInput.value) || 0;
            weightInput.value = Math.round((kg * 2.20462) * 10) / 10;
        }
        weightUnit = 'lbs';
        weightLbsBtn.classList.add('active');
        weightKgBtn.classList.remove('active');
        weightUnitLabel.textContent = 'lbs';
        calculate();
    });

    heightCmBtn.addEventListener('click', () => {
        if (heightUnit === 'ftin') {
            const ft = parseFloat(heightFtInput.value) || 0;
            const inch = parseFloat(heightInInput.value) || 0;
            heightCmInput.value = Math.round(((ft * 12 + inch) * 2.54) * 10) / 10;
        }
        heightUnit = 'cm';
        heightCmBtn.classList.add('active');
        heightFtinBtn.classList.remove('active');
        heightCmWrapper.style.display = '';
        heightFtinWrapper.style.display = 'none';
        calculate();
    });

    heightFtinBtn.addEventListener('click', () => {
        if (heightUnit === 'cm') {
            const cm = parseFloat(heightCmInput.value) || 0;
            const totalInches = cm / 2.54;
            heightFtInput.value = Math.floor(totalInches / 12);
            heightInInput.value = Math.round(totalInches % 12);
        }
        heightUnit = 'ftin';
        heightFtinBtn.classList.add('active');
        heightCmBtn.classList.remove('active');
        heightCmWrapper.style.display = 'none';
        heightFtinWrapper.style.display = '';
        calculate();
    });

    // ── Diet Type → Lock/unlock fat-carb slider ──
    dietSelect.addEventListener('change', () => {
        const diet = dietSelect.value;
        const presets = { standard: 30, lowcarb: 45, keto: 65, highcarb: 20 };
        if (presets[diet] !== undefined) {
            fatCarbSlider.value = presets[diet];
            updateSliderLabels();
        }
        // Disable slider for keto (locked split)
        fatCarbSlider.disabled = diet === 'keto';
        calculate();
    });

    // ── Fat/Carb Slider ──
    fatCarbSlider.addEventListener('input', () => {
        updateSliderLabels();
        calculate();
    });

    function updateSliderLabels() {
        const fatPctVal = parseInt(fatCarbSlider.value);
        const carbPctVal = 100 - fatPctVal;
        fatPctLabel.textContent = `Fat: ${fatPctVal}%`;
        carbPctLabel.textContent = `Carbs: ${carbPctVal}%`;
    }

    // ── Core Calculation ──
    function getWeightKg() {
        const val = parseFloat(weightInput.value) || 70;
        return weightUnit === 'lbs' ? val / 2.20462 : val;
    }

    function getHeightCm() {
        if (heightUnit === 'cm') {
            return parseFloat(heightCmInput.value) || 175;
        } else {
            const ft = parseFloat(heightFtInput.value) || 5;
            const inch = parseFloat(heightInInput.value) || 9;
            return (ft * 12 + inch) * 2.54;
        }
    }

    function calculateBMR(weightKg, heightCm, age, gender) {
        // Mifflin-St Jeor equation
        if (gender === 'male') {
            return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
        } else {
            return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
        }
    }

    function calculate() {
        const weightKg  = getWeightKg();
        const heightCm  = getHeightCm();
        const age       = parseInt(ageInput.value) || 30;
        const gender    = genderSelect.value;
        const activity  = parseFloat(activitySelect.value) || 1.55;
        const goalPct   = parseFloat(goalSelect.value) || 0;
        const proteinGPerKg = parseFloat(proteinSelect.value) || 2.2;
        const fatSliderPct  = parseInt(fatCarbSlider.value) / 100;

        // 1. BMR
        const bmr = Math.round(calculateBMR(weightKg, heightCm, age, gender));

        // 2. TDEE
        const tdee = Math.round(bmr * activity);

        // 3. Goal Calories
        const adjustment = Math.round(tdee * goalPct);
        const targetCals = tdee + adjustment;

        // 4. Protein grams (fixed by body weight)
        const proteinG = Math.round(proteinGPerKg * weightKg);
        const proteinCals = proteinG * 4;

        // 5. Remaining cals for fat + carbs
        const remainingCals = targetCals - proteinCals;

        // 6. Fat & Carb from slider split (applied to remaining only)
        const fatCals  = Math.max(0, Math.round(remainingCals * fatSliderPct));
        const carbCals = Math.max(0, remainingCals - fatCals);

        const fatG  = Math.round(fatCals / 9);
        const carbG = Math.round(carbCals / 4);

        // 7. Actual percentages of total cals
        const totalCalsActual = proteinCals + fatCals + carbCals;
        const pPct = totalCalsActual > 0 ? Math.round((proteinCals / totalCalsActual) * 100) : 0;
        const fPct = totalCalsActual > 0 ? Math.round((fatCals / totalCalsActual) * 100) : 0;
        const cPct = 100 - pPct - fPct;

        // 8. Weekly weight change estimate
        // ~7700 kcal per kg of body fat
        const weeklyKg = (adjustment * 7) / 7700;
        const weeklyKgRounded = Math.abs(weeklyKg) < 0.01 ? 0 : Math.round(weeklyKg * 100) / 100;

        // ── Update DOM ──
        animateValue(caloriesResult, parseInt(caloriesResult.textContent) || 0, targetCals, 600);

        // Macros
        proteinResult.innerHTML = `${proteinG}<span class="macro-unit">g</span>`;
        fatResult.innerHTML     = `${fatG}<span class="macro-unit">g</span>`;
        carbResult.innerHTML    = `${carbG}<span class="macro-unit">g</span>`;
        proteinPct.textContent  = `${pPct}%`;
        fatPct.textContent      = `${fPct}%`;
        carbPct.textContent     = `${cPct}%`;

        // Progress bars
        proteinBar.style.width = `${pPct}%`;
        fatBar.style.width     = `${fPct}%`;
        carbBar.style.width    = `${cPct}%`;
        proteinBarVal.textContent = `${proteinG}g`;
        fatBarVal.textContent     = `${fatG}g`;
        carbBarVal.textContent    = `${carbG}g`;

        // Weekly change
        if (weeklyKgRounded === 0) {
            weeklyChange.textContent = '0 kg';
            weeklyDesc.textContent   = 'No change per week';
            weeklyChange.style.color = 'var(--color-text)';
        } else if (weeklyKgRounded > 0) {
            weeklyChange.textContent = `+${weeklyKgRounded} kg`;
            weeklyDesc.textContent   = `Estimated gain per week`;
            weeklyChange.style.color = 'var(--color-accent)';
        } else {
            weeklyChange.textContent = `${weeklyKgRounded} kg`;
            weeklyDesc.textContent   = `Estimated loss per week`;
            weeklyChange.style.color = 'var(--color-coral)';
        }

        // Breakdown
        bmrResult.textContent        = `${bmr.toLocaleString()} kcal`;
        tdeeResult.textContent       = `${tdee.toLocaleString()} kcal`;
        adjustmentResult.textContent = adjustment === 0
            ? '0 kcal'
            : `${adjustment > 0 ? '+' : ''}${adjustment.toLocaleString()} kcal`;
    }

    // ── Smooth number animation ──
    function animateValue(el, from, to, duration) {
        const start = performance.now();
        const range = to - from;
        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            el.textContent = Math.round(from + range * eased).toLocaleString();
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // ── Attach all input listeners ──
    const allInputs = [
        ageInput, genderSelect, weightInput, heightCmInput, heightFtInput,
        heightInInput, activitySelect, goalSelect, proteinSelect
    ];
    allInputs.forEach(el => el.addEventListener('input', calculate));
    allInputs.forEach(el => el.addEventListener('change', calculate));

    // ── Init ──
    updateSliderLabels();
    calculate();

})();
