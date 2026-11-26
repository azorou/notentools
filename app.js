const STORAGE_KEYS = {
    subjects: "notenapp_subjects_v2",
    archive: "notenapp_archive_v2",
    theme: "notenapp_theme_v2"
};

const SUBJECT_PRESETS = [
    {
        name: "Mathematik",
        type: "haupt",
        ratio: "2:1",
        notAdvancement: false,
        ratioLabel: "Hauptfach · SA:Klein 2:1",
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h2m4 0h2M8 16h2m4 0h2"/></svg>`
    },
    {
        name: "Deutsch",
        type: "haupt",
        ratio: "1:1",
        notAdvancement: false,
        ratioLabel: "Hauptfach · SA:Klein 1:1",
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
    },
    {
        name: "Englisch",
        type: "haupt",
        ratio: "1:1",
        notAdvancement: false,
        ratioLabel: "Hauptfach · SA:Klein 1:1",
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`
    },
    {
        name: "Biologie",
        type: "neben",
        ratio: "1:1",
        notAdvancement: false,
        ratioLabel: "Nebenfach · Groß ×2 / Klein ×1",
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V8"/><path d="M5 12c0-4 3-7 7-7 4 0 7 3 7 7-3 0-5-1-7-3-2 2-4 3-7 3z"/></svg>`
    },
    {
        name: "Geschichte",
        type: "neben",
        ratio: "1:1",
        notAdvancement: false,
        ratioLabel: "Nebenfach · Groß ×2 / Klein ×1",
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`
    },
    {
        name: "Sport",
        type: "neben",
        ratio: "1:1",
        notAdvancement: true,
        ratioLabel: "Nebenfach · Kein Vorrückungsfach",
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>`
    }
];

let subjects = [];
let deferredInstallPrompt = null;

function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme) || "auto";
    document.documentElement.setAttribute("data-theme", saved);
    updateThemeBtn(saved);
}

function cycleTheme() {
    const order = ["auto", "light", "dark"];
    const cur = localStorage.getItem(STORAGE_KEYS.theme) || "auto";
    const next = order[(order.indexOf(cur) + 1) % order.length];
    localStorage.setItem(STORAGE_KEYS.theme, next);
    document.documentElement.setAttribute("data-theme", next);
    updateThemeBtn(next);
}

function updateThemeBtn(mode) {
    const btn = document.getElementById("themeBtn");
    if (!btn) return;
    btn.textContent = mode === "dark" ? "Dunkel" : (mode === "light" ? "Hell" : "Auto");
}

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById("installBtn");
    if (btn) btn.style.display = "inline-block";
});

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("installBtn");
    if (btn) {
        btn.addEventListener("click", async () => {
            if (!deferredInstallPrompt) return;
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            btn.style.display = "none";
        });
    }
});

function switchTab(tabName) {
    document.querySelectorAll(".tab-view").forEach(sec => sec.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("view-" + tabName)?.classList.add("active");
    document.querySelector(`.nav-btn[data-tab="${tabName}"]`)?.classList.add("active");
}

function esc(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function fmt(num, dec = 2) {
    if (typeof num !== "number" || isNaN(num)) return "–";
    return num.toFixed(dec).replace(".", ",");
}

function roundHalf(v) {
    return Math.round(v * 2) / 2;
}

function parseHalf(raw) {
    const s = String(raw ?? "").trim().replace(",", ".");
    if (!s) return NaN;
    const n = parseFloat(s);
    return isNaN(n) ? NaN : roundHalf(n);
}

function parseGradeToken(rawToken) {
    const m = String(rawToken ?? "").trim().match(/^([1-6])([+-])?$/);
    if (!m) return null;
    return { base: parseInt(m[1], 10), sign: m[2] || "", label: `${m[1]}${m[2] || ""}` };
}

function parseStrictDigits1to6(raw) {
    const res = [];
    for (const ch of String(raw || "")) {
        if (ch >= "1" && ch <= "6") res.push(parseInt(ch, 10));
    }
    return res;
}

function saveSubjects() {
    localStorage.setItem(STORAGE_KEYS.subjects, JSON.stringify(subjects));
}

function loadSubjects() {
    try { subjects = JSON.parse(localStorage.getItem(STORAGE_KEYS.subjects)) || []; }
    catch { subjects = []; }
}

function renderPresets() {
    const grid = document.getElementById("presetSubjectsGrid");
    if (!grid) return;
    grid.innerHTML = SUBJECT_PRESETS.map((p, idx) => `
        <button type="button" class="preset-card" onclick="addFromPreset(${idx})">
            <div class="preset-left">
                <span class="preset-icon">${p.icon}</span>
                <div style="min-width:0;">
                    <div class="preset-title">${esc(p.name)}</div>
                    <div class="preset-ratio">${esc(p.ratioLabel)}</div>
                </div>
            </div>
            <span style="font-size:0.85rem; font-weight:700; color:var(--primary);">+</span>
        </button>
    `).join("");
}

function addFromPreset(idx) {
    const p = SUBJECT_PRESETS[idx];
    if (!p) return;
    subjects.push({
        id: Date.now() + Math.random(),
        name: p.name,
        type: p.type,
        ratio: p.ratio,
        notAdvancement: p.notAdvancement,
        grades: []
    });
    saveSubjects();
    renderSubjects();
}

function toggleNewSubDefaults() {
    const type = document.getElementById("newSubType").value;
    document.getElementById("newSubRatio").disabled = (type !== "haupt");
}

function addSubject() {
    const nameInput = document.getElementById("newSubName");
    const name = nameInput.value.trim();
    if (!name) return;

    const type = document.getElementById("newSubType").value;
    const ratio = document.getElementById("newSubRatio").value;
    const notAdv = document.getElementById("newSubNotAdv").checked;

    subjects.push({
        id: Date.now() + Math.random(),
        name,
        type,
        ratio: type === "haupt" ? ratio : "1:1",
        notAdvancement: notAdv,
        grades: []
    });

    nameInput.value = "";
    document.getElementById("newSubNotAdv").checked = false;
    saveSubjects();
    renderSubjects();
}

function deleteSubject(subId) {
    subjects = subjects.filter(s => s.id !== subId);
    saveSubjects();
    renderSubjects();
}

function toggleSubjectNotAdv(subId) {
    const sub = subjects.find(s => s.id === subId);
    if (!sub) return;
    sub.notAdvancement = !sub.notAdvancement;
    saveSubjects();
    renderSubjects();
}

function updateSubjectRatio(subId, newRatio) {
    const sub = subjects.find(s => s.id === subId);
    if (!sub) return;
    sub.ratio = newRatio;
    saveSubjects();
    renderSubjects();
}

function addGradeToSubject(subId) {
    const sub = subjects.find(s => s.id === subId);
    if (!sub) return;

    const gInput = document.getElementById(`gradeInp-${subId}`);
    const kindSel = document.getElementById(`kindSel-${subId}`);
    const wInput = document.getElementById(`weightInp-${subId}`);

    const parsed = parseGradeToken(gInput.value);
    if (!parsed) return;

    const kind = kindSel.value;
    let w = parseFloat(String(wInput.value).replace(",", "."));
    if (isNaN(w) || w <= 0) w = kind === "klein" ? 1 : 2;

    sub.grades.push({
        id: Date.now() + Math.random(),
        base: parsed.base,
        sign: parsed.sign,
        label: parsed.label,
        kind,
        weight: w
    });

    gInput.value = "";
    saveSubjects();
    renderSubjects();
}

function updateGradeWeight(subId, gradeId, rawW) {
    const sub = subjects.find(s => s.id === subId);
    if (!sub) return;
    const g = sub.grades.find(x => x.id === gradeId);
    if (!g) return;
    const w = parseFloat(String(rawW).replace(",", "."));
    if (!isNaN(w) && w > 0) {
        g.weight = w;
        saveSubjects();
        renderSubjects();
    }
}

function removeGradeFromSubject(subId, gradeId) {
    const sub = subjects.find(s => s.id === subId);
    if (!sub) return;
    sub.grades = sub.grades.filter(x => x.id !== gradeId);
    saveSubjects();
    renderSubjects();
}

function calcSubjectAverage(sub) {
    if (!sub.grades || sub.grades.length === 0) return null;

    const weightedMean = (arr) => {
        let num = 0, den = 0;
        for (const x of arr) {
            num += x.base * x.weight;
            den += x.weight;
        }
        return den > 0 ? num / den : null;
    };

    if (sub.type === "haupt") {
        const saAvg = weightedMean(sub.grades.filter(g => g.kind === "sa"));
        const smAvg = weightedMean(sub.grades.filter(g => g.kind !== "sa"));
        if (saAvg !== null && smAvg !== null) {
            const [fSa, fSm] = sub.ratio === "2:1" ? [2, 1] : [1, 1];
            return (saAvg * fSa + smAvg * fSm) / (fSa + fSm);
        }
        return saAvg !== null ? saAvg : smAvg;
    }

    return weightedMean(sub.grades);
}

function renderSubjects() {
    const container = document.getElementById("subjectsContainer");
    const allAvgs = [];
    const advAvgs = [];

    if (!subjects.length) {
        container.innerHTML = `<div class="info-box">Wähle oben eine Vorlage oder lege ein Fach an.</div>`;
    } else {
        container.innerHTML = subjects.map(sub => {
            const avg = calcSubjectAverage(sub);
            if (avg !== null) {
                allAvgs.push(avg);
                if (!sub.notAdvancement) advAvgs.push(avg);
            }

            const kindOptions = sub.type === "haupt"
                ? `<option value="sa">Schulaufgabe</option><option value="klein">Kleiner LN</option>`
                : `<option value="gross">Großer LN</option><option value="klein">Kleiner LN</option>`;

            const defW = sub.type === "haupt" ? (sub.ratio === "2:1" ? 2 : 1) : 2;

            const pillsHtml = sub.grades.map(g => {
                const kTxt = g.kind === "sa" ? "SA" : (g.kind === "gross" ? "Groß" : "Klein");
                return `
                    <span class="grade-pill">
                        <strong>${esc(g.label)}</strong>
                        <span class="cat-mini">${kTxt} · ×${fmt(g.weight, 1)}</span>
                        <button type="button" class="del-x" onclick="removeGradeFromSubject(${sub.id}, ${g.id})">×</button>
                    </span>
                `;
            }).join("");

            const weightRows = sub.grades.map(g => `
                <tr>
                    <td><strong>${esc(g.label)}</strong></td>
                    <td>${g.kind === "sa" ? "SA" : (g.kind === "gross" ? "Großer LN" : "Kleiner LN")}</td>
                    <td><input type="number" class="inline-num" step="0.5" min="0.5" value="${g.weight}" onchange="updateGradeWeight(${sub.id}, ${g.id}, this.value)"></td>
                </tr>
            `).join("");

            return `
                <div class="subject-card">
                    <div class="subject-top">
                        <div>
                            <div class="subject-title-row">
                                <h3 class="subject-name">${esc(sub.name)}</h3>
                                <span class="tag">${sub.type === "haupt" ? "Hauptfach" : "Nebenfach"}</span>
                                ${sub.notAdvancement ? `<span class="tag muted-tag">Kein Vorrückungsfach</span>` : ""}
                            </div>
                            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:6px;">
                                <label class="checkbox-row">
                                    <input type="checkbox" ${sub.notAdvancement ? "checked" : ""} onchange="toggleSubjectNotAdv(${sub.id})">
                                    <span>Kein Vorrückungsfach</span>
                                </label>
                                ${sub.type === "haupt" ? `
                                    <select style="width:auto; padding:3px 7px; font-size:0.78rem;" onchange="updateSubjectRatio(${sub.id}, this.value)">
                                        <option value="2:1" ${sub.ratio === "2:1" ? "selected" : ""}>2 : 1</option>
                                        <option value="1:1" ${sub.ratio === "1:1" ? "selected" : ""}>1 : 1</option>
                                    </select>
                                ` : ""}
                                <button type="button" class="btn btn-sm btn-danger" onclick="deleteSubject(${sub.id})">Löschen</button>
                            </div>
                        </div>
                        <div class="subject-avg-num">${avg !== null ? fmt(avg, 2) : "–"}</div>
                    </div>

                    <div class="form-grid-4" style="margin-top:8px; margin-bottom:4px;">
                        <div>
                            <label for="gradeInp-${sub.id}">Note</label>
                            <input type="text" id="gradeInp-${sub.id}" placeholder="z.B. 2, 2+, 3-">
                        </div>
                        <div>
                            <label for="kindSel-${sub.id}">Art</label>
                            <select id="kindSel-${sub.id}">${kindOptions}</select>
                        </div>
                        <div>
                            <label for="weightInp-${sub.id}">Faktor</label>
                            <input type="number" id="weightInp-${sub.id}" step="0.5" min="0.5" value="${defW}">
                        </div>
                        <div>
                            <button type="button" class="btn btn-primary" style="width:100%;" onclick="addGradeToSubject(${sub.id})">Eintragen</button>
                        </div>
                    </div>

                    <div class="grade-chips">${pillsHtml}</div>

                    ${sub.grades.length > 0 ? `
                        <details class="sub-panel">
                            <summary><span>Gewichtung anpassen</span></summary>
                            <div class="sub-panel-body">
                                <div class="table-wrap">
                                    <table>
                                        <thead><tr><th>Note</th><th>Art</th><th>Faktor</th></tr></thead>
                                        <tbody>${weightRows}</tbody>
                                    </table>
                                </div>
                            </div>
                        </details>
                    ` : ""}
                </div>
            `;
        }).join("");
    }

    const allEl = document.getElementById("overallAvgAll");
    const allMeta = document.getElementById("overallMetaAll");
    const advEl = document.getElementById("overallAvgAdv");
    const advMeta = document.getElementById("overallMetaAdv");

    if (allAvgs.length > 0) {
        allEl.textContent = fmt(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length, 2);
        allMeta.textContent = `${allAvgs.length} Fächer`;
    } else {
        allEl.textContent = "–";
        allMeta.textContent = "Keine Noten";
    }

    if (advAvgs.length > 0) {
        advEl.textContent = fmt(advAvgs.reduce((a, b) => a + b, 0) / advAvgs.length, 2);
        advMeta.textContent = `${advAvgs.length} Fächer`;
    } else {
        advEl.textContent = "–";
        advMeta.textContent = "Keine Fächer";
    }
}

// --- VERTEILUNG ---
const distCats = ["open", "open", "open", "open", "open", "open"];
const distExact = [null, null, null, null, null, null];

function renderDistFilters() {
    const catG = document.getElementById("distCatGrid");
    const exG = document.getElementById("distExactGrid");
    if (!catG || !exG) return;

    catG.innerHTML = distCats.map((st, i) => {
        const lbl = st === "must" ? "≥1×" : (st === "none" ? "0×" : "?");
        const cls = st === "must" ? "cat-pill state-must" : (st === "none" ? "cat-pill state-none" : "cat-pill");
        return `<div class="${cls}" onclick="cycleDistCat(${i})">${i + 1}: ${lbl}</div>`;
    }).join("");

    exG.innerHTML = distExact.map((v, i) => `
        <div class="mini-exact">
            <label for="dex-${i}">${i + 1} genau</label>
            <input type="number" id="dex-${i}" min="0" max="60" step="1" value="${v ?? ""}" oninput="setDistExact(${i}, this.value)">
        </div>
    `).join("");
}

function cycleDistCat(i) {
    const order = ["open", "must", "none"];
    distCats[i] = order[(order.indexOf(distCats[i]) + 1) % 3];
    if (distCats[i] === "none" && distExact[i] > 0) distExact[i] = 0;
    renderDistFilters();
    runDistribution();
}

function setDistExact(i, raw) {
    const t = raw.trim();
    if (!t) distExact[i] = null;
    else {
        const n = parseInt(t, 10);
        distExact[i] = (!isNaN(n) && n >= 0) ? Math.floor(n) : null;
    }
    if (distExact[i] > 0 && distCats[i] === "none") {
        distCats[i] = "open";
        renderDistFilters();
    }
    runDistribution();
}

function applyDistPreset(p) {
    if (p === "all") {
        for (let i = 0; i < 6; i++) {
            if (distExact[i] === 0) distExact[i] = null;
            distCats[i] = "must";
        }
    } else if (p === "no6") {
        distCats[5] = "none"; distExact[5] = 0;
    } else if (p === "no56") {
        distCats[4] = "none"; distExact[4] = 0;
        distCats[5] = "none"; distExact[5] = 0;
    } else {
        for (let i = 0; i < 6; i++) { distCats[i] = "open"; distExact[i] = null; }
    }
    renderDistFilters();
    runDistribution();
}

const logFact = [0];
for (let i = 1; i <= 150; i++) logFact[i] = logFact[i - 1] + Math.log(i);

function normCDF(x) {
    const s = x < 0 ? -1 : 1;
    const ax = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * ax);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
    return 0.5 * (1 + s * erf);
}

function calibratedPrior(mean, sigma, mask) {
    const bounds = [-Infinity, 1.5, 2.5, 3.5, 4.5, 5.5, Infinity];
    const empW = [0.96, 1.04, 1.08, 1.02, 0.88, 0.58];
    const pForMu = (mu) => {
        const raw = [];
        let sum = 0;
        for (let g = 0; g < 6; g++) {
            if (!mask[g]) { raw.push(0); continue; }
            const pLow = bounds[g] === -Infinity ? 0 : normCDF((bounds[g] - mu) / sigma);
            const pHigh = bounds[g + 1] === Infinity ? 1 : normCDF((bounds[g + 1] - mu) / sigma);
            const p = Math.max(1e-7, (pHigh - pLow) * empW[g]);
            raw.push(p);
            sum += p;
        }
        return sum > 0 ? raw.map(x => x / sum) : mask.map(m => (m ? 1 : 0));
    };
    let lo = -1, hi = 8;
    for (let k = 0; k < 30; k++) {
        const mid = 0.5 * (lo + hi);
        let expM = 0;
        pForMu(mid).forEach((p, idx) => expM += (idx + 1) * p);
        if (expM < mean) lo = mid; else hi = mid;
    }
    return pForMu(0.5 * (lo + hi));
}

let distTimer = null;
function scheduleDist() {
    clearTimeout(distTimer);
    distTimer = setTimeout(runDistribution, 50);
}

function runDistribution() {
    const out = document.getElementById("distOutput");
    const sigma = parseFloat(document.getElementById("distSigma").value);
    document.getElementById("distSigmaVal").textContent = fmt(sigma);

    const N = parseInt(document.getElementById("distN").value, 10);
    const avgRaw = document.getElementById("distAvg").value.trim().replace(",", ".");
    const known = parseStrictDigits1to6(document.getElementById("distKnown").value);

    if (isNaN(N) || !avgRaw || isNaN(Number(avgRaw))) {
        out.innerHTML = `<div class="info-box">Anzahl der Arbeiten und Schnitt eingeben.</div>`;
        return;
    }
    if (N < 1 || N > 60) {
        out.innerHTML = `<div class="info-box err-box">1 bis 60 Arbeiten möglich.</div>`;
        return;
    }
    const targetAvg = parseFloat(avgRaw);
    if (targetAvg < 1 || targetAvg > 6) {
        out.innerHTML = `<div class="info-box err-box">Schnitt zwischen 1,0 und 6,0.</div>`;
        return;
    }
    if (known.length > N) {
        out.innerHTML = `<div class="info-box err-box">Mehr bekannte Noten als Arbeiten.</div>`;
        return;
    }

    const knownCounts = [0, 0, 0, 0, 0, 0];
    known.forEach(g => knownCounts[g - 1]++);

    const minCounts = [0, 0, 0, 0, 0, 0];
    const maxCounts = [N, N, N, N, N, N];
    const mask = [true, true, true, true, true, true];
    let fixedN = 0, fixedSum = 0;

    for (let g = 0; g < 6; g++) {
        if (distExact[g] !== null) {
            if (knownCounts[g] > distExact[g]) {
                out.innerHTML = `<div class="info-box err-box">Widerspruch bei Note ${g + 1}.</div>`;
                return;
            }
            minCounts[g] = distExact[g];
            maxCounts[g] = distExact[g];
            if (distExact[g] === 0) mask[g] = false;
        } else if (distCats[g] === "none") {
            if (knownCounts[g] > 0) {
                out.innerHTML = `<div class="info-box err-box">Widerspruch bei Note ${g + 1}.</div>`;
                return;
            }
            minCounts[g] = 0; maxCounts[g] = 0; mask[g] = false;
        } else {
            minCounts[g] = Math.max(knownCounts[g], distCats[g] === "must" ? 1 : 0);
            maxCounts[g] = N;
        }
        fixedN += minCounts[g];
        fixedSum += minCounts[g] * (g + 1);
    }

    if (fixedN > N) {
        out.innerHTML = `<div class="info-box err-box">Vorgaben überschreiten N.</div>`;
        return;
    }

    const dec = avgRaw.includes(".") ? Math.min(4, avgRaw.split(".")[1].length) : 0;
    let minSum, maxSum;
    if (dec === 0) {
        const ex = Math.round(targetAvg * N);
        if (Math.abs(ex / N - targetAvg) > 1e-6) {
            out.innerHTML = `<div class="info-box err-box">Schnitt nicht erreichbar.</div>`;
            return;
        }
        minSum = ex; maxSum = ex;
    } else {
        const tol = 0.5 * Math.pow(10, -dec);
        minSum = Math.ceil((targetAvg - tol) * N - 1e-9);
        maxSum = Math.floor((targetAvg + tol - 1e-9) * N);
    }

    const remN = N - fixedN;
    const remMinS = minSum - fixedSum;
    const remMaxS = maxSum - fixedSum;
    const flex = [];
    for (let g = 0; g < 6; g++) if (maxCounts[g] > minCounts[g]) flex.push(g + 1);

    if (remN === 0) {
        if (fixedSum < minSum || fixedSum > maxSum) {
            out.innerHTML = `<div class="info-box err-box">Schnitt passt nicht.</div>`;
            return;
        }
    } else if (flex.length === 0 || remMaxS < remN * flex[0] || remMinS > remN * flex[flex.length - 1]) {
        out.innerHTML = `<div class="info-box err-box">Keine Verteilung möglich.</div>`;
        return;
    }

    const probs = calibratedPrior(targetAvg, sigma, mask);
    const logP = probs.map(p => (p > 0 ? Math.log(p) : -Infinity));
    const targetVar = sigma * sigma;
    const candidates = [];
    const remC = [0, 0, 0, 0, 0, 0];

    const evalTotal = (tot) => {
        let sum = 0;
        for (let g = 0; g < 6; g++) sum += tot[g] * (g + 1);
        const avg = sum / N;
        let logM = logFact[N], vSum = 0, sSum = 0;
        for (let g = 0; g < 6; g++) {
            const c = tot[g];
            if (c > 0) {
                const d = (g + 1) - avg;
                vSum += c * d * d;
                sSum += c * d * d * d;
                logM -= logFact[c];
                if (isFinite(logP[g])) logM += c * logP[g];
            }
        }
        const v = vSum / N;
        const std = Math.sqrt(v);
        const skew = std > 1e-6 ? (sSum / N) / Math.pow(std, 3) : 0;
        const score = logM - Math.abs(v - targetVar) * N * 0.45 - Math.abs(avg - targetAvg) * N * 0.4;
        candidates.push({ counts: tot, avg, std, skew, score });
    };

    if (remN === 0) evalTotal([...minCounts]);
    else {
        const dfs = (pos, left, sMin, sMax) => {
            if (candidates.length >= 120000) return;
            const gr = flex[pos], idx = gr - 1, cap = maxCounts[idx] - minCounts[idx];
            if (pos === flex.length - 1) {
                if (left <= cap && left * gr >= sMin && left * gr <= sMax) {
                    remC[idx] = left;
                    evalTotal([
                        minCounts[0] + remC[0], minCounts[1] + remC[1], minCounts[2] + remC[2],
                        minCounts[3] + remC[3], minCounts[4] + remC[4], minCounts[5] + remC[5]
                    ]);
                }
                return;
            }
            const nextMin = flex[pos + 1], hiRem = flex[flex.length - 1];
            const minC = Math.max(0, Math.ceil((left * nextMin - sMax) / (nextMin - gr)));
            const maxC = Math.min(left, cap, Math.floor((left * hiRem - sMin) / (hiRem - gr)));
            for (let c = minC; c <= maxC; c++) {
                remC[idx] = c;
                dfs(pos + 1, left - c, sMin - c * gr, sMax - c * gr);
            }
        };
        dfs(0, remN, remMinS, remMaxS);
    }

    if (!candidates.length) {
        out.innerHTML = `<div class="info-box err-box">Keine Verteilung gefunden.</div>`;
        return;
    }

    candidates.sort((a, b) => b.score - a.score);
    const maxSc = candidates[0].score;
    let sumExp = 0;
    const wArr = new Float64Array(candidates.length);
    for (let i = 0; i < candidates.length; i++) {
        wArr[i] = Math.exp(candidates[i].score - maxSc);
        sumExp += wArr[i];
    }

    const skewF = document.getElementById("distSkewFilter").value;
    const spreadF = document.getElementById("distSpreadFilter").value;
    const filtered = [];
    for (let i = 0; i < candidates.length; i++) {
        const it = candidates[i];
        if (skewF === "light" && !(it.skew < -0.15)) continue;
        if (skewF === "heavy" && !(it.skew > 0.15)) continue;
        if (skewF === "balanced" && !(Math.abs(it.skew) <= 0.55)) continue;
        if (spreadF === "tight" && !(it.std <= 0.95)) continue;
        if (spreadF === "medium" && !(it.std >= 0.90 && it.std <= 1.35)) continue;
        if (spreadF === "wide" && !(it.std >= 1.25)) continue;
        filtered.push({ it, idx: i });
    }

    if (!filtered.length) {
        out.innerHTML = `<div class="info-box err-box">Keine Treffer für den Filter.</div>`;
        return;
    }

    const rowsHtml = filtered.slice(0, 10).map(({ it, idx }, r) => {
        const p = (wArr[idx] / sumExp) * 100;
        const seq = [];
        for (let g = 0; g < 6; g++) {
            const kC = knownCounts[g];
            const eC = it.counts[g] - kC;
            for (let k = 0; k < kC; k++) seq.push(`<span class="g-known">${g + 1}</span>`);
            for (let e = 0; e < eC; e++) seq.push(`<span class="g-est">${g + 1}</span>`);
        }
        return `
            <tr>
                <td>${r + 1}.</td>
                ${it.counts.map(c => `<td><strong>${c}</strong></td>`).join("")}
                <td class="seq-cell">${seq.join("")}</td>
                <td>${fmt(it.avg)}</td>
                <td>±${fmt(it.std)}</td>
                <td><strong>${fmt(p, 1)} %</strong></td>
            </tr>
        `;
    }).join("");

    out.innerHTML = `
        <div class="info-box">${filtered.length.toLocaleString("de-DE")} Treffer</div>
        <div class="table-wrap">
            <table>
                <thead><tr><th>#</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>Noten</th><th>Ø</th><th>Streuung</th><th>Anteil</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}

// --- PUNKTE-SCHLÜSSEL ---
const DEF_PCT = [92, 81, 67, 50, 30, 0];
let keyRows = [
    { grade: "1", pct: 92, pts: 0, locked: false },
    { grade: "2", pct: 81, pts: 0, locked: false },
    { grade: "3", pct: 67, pts: 0, locked: false },
    { grade: "4", pct: 50, pts: 0, locked: false },
    { grade: "5", pct: 30, pts: 0, locked: false },
    { grade: "6", pct: 0,  pts: 0, locked: true }
];

function syncKeyFromMax() {
    const maxP = parseHalf(document.getElementById("keyMaxPts").value);
    if (!isNaN(maxP) && maxP >= 0.5) {
        for (let i = 0; i < 6; i++) {
            keyRows[i].pts = Math.min(maxP, Math.max(0, roundHalf((keyRows[i].pct / 100) * maxP)));
        }
        for (let i = 1; i < 6; i++) {
            if (keyRows[i].pts > keyRows[i - 1].pts) keyRows[i].pts = keyRows[i - 1].pts;
        }
    }
    renderKeyTable();
}

function resetKeyTable() {
    for (let i = 0; i < 6; i++) {
        keyRows[i].pct = DEF_PCT[i];
        keyRows[i].locked = (i === 5);
    }
    syncKeyFromMax();
}

function editKeyPts(idx, raw) {
    const maxP = parseHalf(document.getElementById("keyMaxPts").value);
    const val = parseHalf(raw);
    if (isNaN(maxP) || maxP < 0.5 || isNaN(val)) return;

    const clamped = Math.min(maxP, Math.max(0, val));
    const delta = clamped - keyRows[idx].pts;
    keyRows[idx].pts = clamped;
    keyRows[idx].pct = (clamped / maxP) * 100;

    if (delta !== 0) {
        const free = [];
        for (let i = 0; i < 5; i++) if (i !== idx && !keyRows[i].locked) free.push(i);
        if (free.length) {
            const step = roundHalf(delta / free.length);
            free.forEach(u => {
                const nPts = Math.min(maxP, Math.max(0, roundHalf(keyRows[u].pts + step)));
                keyRows[u].pts = nPts;
                keyRows[u].pct = (nPts / maxP) * 100;
            });
        }
    }
    for (let i = 1; i < 6; i++) {
        if (keyRows[i].pts > keyRows[i - 1].pts) {
            keyRows[i].pts = keyRows[i - 1].pts;
            keyRows[i].pct = (keyRows[i].pts / maxP) * 100;
        }
    }
    keyRows[5].pts = 0; keyRows[5].pct = 0;
    renderKeyTable();
}

function editKeyPct(idx, raw) {
    const maxP = parseHalf(document.getElementById("keyMaxPts").value);
    const p = parseFloat(String(raw).replace(",", "."));
    if (isNaN(maxP) || maxP < 0.5 || isNaN(p)) return;
    editKeyPts(idx, roundHalf((Math.min(100, Math.max(0, p)) / 100) * maxP));
}

function toggleKeyLock(idx) {
    keyRows[idx].locked = !keyRows[idx].locked;
    renderKeyTable();
}

function renderKeyTable() {
    const maxP = parseHalf(document.getElementById("keyMaxPts").value);
    const gotP = parseHalf(document.getElementById("keyGotPts").value);
    const sumEl = document.getElementById("keySummary");
    const bodyEl = document.getElementById("keyTableBody");

    if (isNaN(maxP) || maxP < 0.5) {
        sumEl.innerHTML = "";
        bodyEl.innerHTML = "";
        return;
    }

    let hitIdx = -1;
    if (!isNaN(gotP) && gotP >= 0 && gotP <= maxP) {
        hitIdx = keyRows.findIndex(r => gotP >= r.pts - 1e-9);
        if (hitIdx === -1) hitIdx = 5;
        const pct = (gotP / maxP) * 100;
        const nextText = hitIdx > 0
            ? ` · ${fmt(Math.max(0, roundHalf(keyRows[hitIdx - 1].pts - gotP)), 1)} Pkt. bis Note ${keyRows[hitIdx - 1].grade}`
            : "";
        sumEl.innerHTML = `<div class="info-box" style="font-weight:600;">${fmt(gotP, 1)} / ${fmt(maxP, 1)} Pkt. (${fmt(pct, 1)} %) → Note ${keyRows[hitIdx].grade}${nextText}</div>`;
    } else {
        sumEl.innerHTML = "";
    }

    bodyEl.innerHTML = keyRows.map((r, i) => `
        <tr style="${i === hitIdx ? "background:var(--primary-soft);" : ""}">
            <td><strong>Note ${r.grade}</strong></td>
            <td><input type="number" class="inline-num" step="0.5" min="0" max="100" value="${r.pct.toFixed(1)}" onchange="editKeyPct(${i}, this.value)"> %</td>
            <td><input type="number" class="inline-num" step="0.5" min="0" max="${maxP}" value="${r.pts.toFixed(1)}" onchange="editKeyPts(${i}, this.value)"> Pkt.</td>
            <td><button type="button" class="btn btn-sm" onclick="toggleKeyLock(${i})">${r.locked ? "Fix" : "Auto"}</button></td>
        </tr>
    `).join("");
}

// --- VERGLEICH ---
function calcSeriesStats(arr) {
    if (!arr.length) return null;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    let v = 0, s = 0;
    arr.forEach(x => {
        const d = x - mean;
        v += d * d;
        s += d * d * d;
    });
    const std = Math.sqrt(v / arr.length);
    const skew = std > 1e-6 ? (s / arr.length) / Math.pow(std, 3) : 0;
    return { n: arr.length, mean, std, skew };
}

function updateComparison() {
    const a = calcSeriesStats(parseStrictDigits1to6(document.getElementById("cmpA").value));
    const b = calcSeriesStats(parseStrictDigits1to6(document.getElementById("cmpB").value));
    const out = document.getElementById("cmpOutput");
    if (!a && !b) { out.innerHTML = ""; return; }

    const diff = (a && b) ? `${b.mean - a.mean >= 0 ? "+" : ""}${fmt(b.mean - a.mean)}` : "–";
    out.innerHTML = `
        <div class="table-wrap">
            <table>
                <thead><tr><th>Wert</th><th>A</th><th>B</th><th>B−A</th></tr></thead>
                <tbody>
                    <tr><td>Anzahl</td><td>${a ? a.n : "–"}</td><td>${b ? b.n : "–"}</td><td>${(a && b) ? (b.n - a.n) : "–"}</td></tr>
                    <tr><td>Schnitt</td><td><strong>${a ? fmt(a.mean) : "–"}</strong></td><td><strong>${b ? fmt(b.mean) : "–"}</strong></td><td><strong>${diff}</strong></td></tr>
                    <tr><td>Streuung</td><td>${a ? "±" + fmt(a.std) : "–"}</td><td>${b ? "±" + fmt(b.std) : "–"}</td><td>${(a && b) ? fmt(b.std - a.std) : "–"}</td></tr>
                    <tr><td>Schiefe</td><td>${a ? fmt(a.skew) : "–"}</td><td>${b ? fmt(b.skew) : "–"}</td><td>${(a && b) ? fmt(b.skew - a.skew) : "–"}</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

// --- VERLAUF ---
function getArchive() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.archive)) || []; }
    catch { return []; }
}

function saveFullSnapshot() {
    const inp = document.getElementById("archiveName");
    const title = inp.value.trim() || new Date().toLocaleDateString("de-DE");
    const snap = {
        id: Date.now(),
        title,
        subjects: JSON.parse(JSON.stringify(subjects)),
        dist: {
            n: document.getElementById("distN").value,
            avg: document.getElementById("distAvg").value,
            sigma: document.getElementById("distSigma").value,
            known: document.getElementById("distKnown").value
        },
        key: {
            maxPts: document.getElementById("keyMaxPts").value,
            gotPts: document.getElementById("keyGotPts").value,
            rows: JSON.parse(JSON.stringify(keyRows))
        }
    };
    const list = getArchive();
    list.unshift(snap);
    localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(list.slice(0, 25)));
    inp.value = "";
    renderArchive();
}

function loadSnapshot(id) {
    const snap = getArchive().find(x => x.id === id);
    if (!snap) return;

    if (Array.isArray(snap.subjects)) {
        subjects = JSON.parse(JSON.stringify(snap.subjects));
        saveSubjects();
        renderSubjects();
    }
    if (snap.dist) {
        document.getElementById("distN").value = snap.dist.n || "";
        document.getElementById("distAvg").value = snap.dist.avg || "";
        document.getElementById("distSigma").value = snap.dist.sigma || "1.00";
        document.getElementById("distKnown").value = snap.dist.known || "";
        runDistribution();
    }
    if (snap.key) {
        document.getElementById("keyMaxPts").value = snap.key.maxPts || "";
        document.getElementById("keyGotPts").value = snap.key.gotPts || "";
        if (Array.isArray(snap.key.rows) && snap.key.rows.length === 6) {
            keyRows = JSON.parse(JSON.stringify(snap.key.rows));
        }
        renderKeyTable();
    }
    switchTab("subjects");
}

function deleteSnapshot(id) {
    const next = getArchive().filter(x => x.id !== id);
    localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(next));
    renderArchive();
}

function renderArchive() {
    const list = getArchive();
    const el = document.getElementById("archiveList");
    if (!list.length) {
        el.innerHTML = `<div class="info-box">Noch nichts gespeichert.</div>`;
        return;
    }
    el.innerHTML = list.map(item => `
        <div class="archive-card">
            <div>
                <strong>${esc(item.title)}</strong>
                <div class="hint">${(item.subjects || []).length} Fächer</div>
            </div>
            <div style="display:flex; gap:6px;">
                <button type="button" class="btn btn-primary btn-sm" onclick="loadSnapshot(${item.id})">Laden</button>
                <button type="button" class="btn btn-sm btn-danger" onclick="deleteSnapshot(${item.id})">Löschen</button>
            </div>
        </div>
    `).join("");
}

initTheme();
renderPresets();
loadSubjects();
renderSubjects();
renderDistFilters();
runDistribution();
renderKeyTable();
updateComparison();
renderArchive();
