const SUPABASE_URL = "https://bermpuavrkricfngfgjk.supabase.co/";
const SUPABASE_ANON_KEY = "sb_publishable_MDzS9aGj4E7QEFemXZZLDA_-7YkPC2z";

const sbClient = (typeof supabase !== "undefined" && SUPABASE_URL.startsWith("http"))
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true
        }
    })
    : null;

const STORAGE_KEYS = { theme: "notenapp_theme_v3" };
const SCOPED = { subjects: "notenapp_subjects_v3", archive: "notenapp_archive_v3", meta: "notenapp_meta_v3" };
let storageScope = "anon";
const skey = (k) => `${SCOPED[k]}:${storageScope}`;

function setStorageScope(userId) {
    storageScope = userId || "anon";
    // Einmalige Übernahme alter, ungetrennter Daten durch den ersten Login
    for (const k of Object.keys(SCOPED)) {
        const old = localStorage.getItem(SCOPED[k]);
        if (old !== null && localStorage.getItem(skey(k)) === null) localStorage.setItem(skey(k), old);
        localStorage.removeItem(SCOPED[k]);
    }
}

let uidSeq = 0;
function uid() { return Date.now() * 1000 + (uidSeq++ % 1000); }

const SUBJECT_PRESETS = [
    { name: "Religion", type: "neben", ratio: "1:1", notAdvancement: false, ratioLabel: "Nebenfach", icon: "R" },
    { name: "Deutsch", type: "haupt", ratio: "2:1", notAdvancement: false, ratioLabel: "Hauptfach · 2:1", icon: "D" },
    { name: "Englisch", type: "haupt", ratio: "2:1", notAdvancement: false, ratioLabel: "Hauptfach · 2:1", icon: "E" },
    { name: "Französisch", type: "haupt", ratio: "2:1", notAdvancement: false, ratioLabel: "Hauptfach · 2:1", icon: "F" },
    { name: "Mathe", type: "haupt", ratio: "2:1", notAdvancement: false, ratioLabel: "Hauptfach · 2:1", icon: "M" },
    { name: "Informatik", type: "neben", ratio: "1:1", notAdvancement: false, ratioLabel: "Nebenfach", icon: "I" },
    { name: "Physik", type: "haupt", ratio: "1:1", notAdvancement: false, ratioLabel: "Hauptfach · 1:1", icon: "P" },
    { name: "Chemie", type: "haupt", ratio: "1:1", notAdvancement: false, ratioLabel: "Hauptfach · 1:1", icon: "C" },
    { name: "Biologie", type: "neben", ratio: "1:1", notAdvancement: false, ratioLabel: "Nebenfach", icon: "B" },
    { name: "Geschichte", type: "neben", ratio: "1:1", notAdvancement: false, ratioLabel: "Nebenfach", icon: "G" },
    { name: "Geographie", type: "neben", ratio: "1:1", notAdvancement: false, ratioLabel: "Nebenfach", icon: "Geo" },
    { name: "Wirtschaft und Recht", type: "neben", ratio: "1:1", notAdvancement: false, ratioLabel: "Nebenfach", icon: "WR" },
    { name: "Politik und Gesellschaft", type: "neben", ratio: "1:1", notAdvancement: false, ratioLabel: "Nebenfach", icon: "PG" },
    { name: "Kunst", type: "neben", ratio: "1:1", notAdvancement: false, ratioLabel: "Nebenfach", icon: "K" },
    { name: "Musik", type: "neben", ratio: "1:1", notAdvancement: false, ratioLabel: "Nebenfach", icon: "Mu" },
    { name: "Sport", type: "neben", ratio: "1:1", notAdvancement: true, ratioLabel: "Nebenfach · Kein Vorrückungsfach", icon: "S" }
];

let subjects = [];
let currentUser = null;
let deferredInstallPrompt = null;

const SORT_KEY = "notenapp_sort_v1";
const SORT_MODES = ["manual", "name", "best", "worst", "haupt"];
let subjectSort = localStorage.getItem(SORT_KEY);
if (!SORT_MODES.includes(subjectSort)) subjectSort = "manual";
const openSubjects = new Set();   // aufgeklappte Fächer
const lastKind = new Map();       // zuletzt gewählte Art je Fach

function toTechnicalEmail(username) {
    const clean = String(username || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "_");
    return `${clean || "nutzer"}@notenapp.local`;
}

function extractUsernameFromEmail(email) {
    if (!email) return "Konto";
    return email.split("@")[0];
}

function showApp(userLabel) {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    document.getElementById("userBadge").textContent = `Konto: ${userLabel}`;
    const mu = document.getElementById("menuUser");
    if (mu) mu.textContent = userLabel;
    switchTab("subjects");
}

function showAuth() {
    document.getElementById("appShell").style.display = "none";
    document.getElementById("authScreen").style.display = "flex";
}

let authMode = "login";
let syncTimer = null;

function setAuthStatus(t) { document.getElementById("authStatus").textContent = t; }

function setAuthMode(mode) {
    authMode = mode;
    const reg = mode === "register";
    document.getElementById("authSubmitBtn").textContent = reg ? "Konto erstellen" : "Anmelden";
    document.getElementById("authPassword").autocomplete = reg ? "new-password" : "current-password";
    document.getElementById("authHint").hidden = !reg;
    ["login", "register"].forEach(m => {
        const b = document.getElementById("authTab-" + m);
        b.classList.toggle("active", m === mode);
        b.setAttribute("aria-pressed", m === mode ? "true" : "false");
    });
    setAuthStatus("");
}

function authErrorText(err) {
    const m = (err.message || "").toLowerCase();
    if (m.includes("invalid login")) return "Benutzername oder Passwort falsch.";
    if (m.includes("already registered")) return "Dieser Benutzername ist schon vergeben.";
    if (m.includes("at least")) return "Passwort zu kurz (mind. 6 Zeichen).";
    if (m.includes("rate limit")) return "Zu viele Versuche. Bitte kurz warten.";
    return "Fehlgeschlagen: " + err.message;
}

async function initAuthAndData() {
    if (!sbClient) {
        showAuth();
        setAuthStatus("Server nicht erreichbar. Bitte Verbindung prüfen und neu laden.");
        return;
    }
    // Einmalig registrieren; feuert auch INITIAL_SESSION. Kein await im Callback (Deadlock-Gefahr).
    sbClient.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => handleSession(session), 0);
    });
}

async function handleSession(session) {
    if (session && session.user) {
        if (currentUser && currentUser.id === session.user.id) return; // Token-Refresh
        currentUser = session.user;
        setStorageScope(currentUser.id);
        showApp(extractUsernameFromEmail(currentUser.email));
        await pullCloudState();
    } else {
        currentUser = null;
        setStorageScope(null);
        subjects = [];
        openSubjects.clear();
        lastKind.clear();
        renderSubjects();
        renderArchive();
        showAuth();
    }
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    if (!sbClient) return setAuthStatus("Server nicht erreichbar.");
    const username = document.getElementById("authUsername").value.trim();
    const password = document.getElementById("authPassword").value;
    const btn = document.getElementById("authSubmitBtn");
    if (!username || password.length < 6) return setAuthStatus("Benutzername und mind. 6 Zeichen Passwort nötig.");

    btn.disabled = true;
    setAuthStatus("Bitte warten …");
    const email = toTechnicalEmail(username);
    try {
        const res = authMode === "register"
            ? await sbClient.auth.signUp({ email, password })
            : await sbClient.auth.signInWithPassword({ email, password });
        if (res.error) setAuthStatus(authErrorText(res.error));
        else if (!res.data.session) setAuthStatus("Konto angelegt, aber Supabase verlangt noch eine E-Mail-Bestätigung (dort deaktivieren).");
        else { setAuthStatus(""); document.getElementById("authPassword").value = ""; }
    } catch (_) {
        setAuthStatus("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
        btn.disabled = false;
    }
}

async function handleLogout() {
    closeDialog("menuDialog");
    await flushCloudState();
    if (sbClient) await sbClient.auth.signOut();
}

// Lokal sofort speichern, Cloud entprellt
function pushCloudState() {
    localStorage.setItem(skey("subjects"), JSON.stringify(subjects));
    localStorage.setItem(skey("meta"), JSON.stringify({ modified: Date.now() }));
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flushCloudState, 800);
}

let syncErrorShown = false;
function notifySyncError() {
    if (syncErrorShown) return;
    syncErrorShown = true;
    toast("Synchronisierung fehlgeschlagen");
}

async function flushCloudState() {
    clearTimeout(syncTimer);
    if (!sbClient || !currentUser || !currentUser.id) return;
    try {
        const { error } = await sbClient.from("user_noten_daten").upsert({
            user_id: currentUser.id,
            subjects,
            archive: getArchive(),
            updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });
        if (error) { console.warn("Cloud-Sync fehlgeschlagen:", error.message); notifySyncError(); }
        else syncErrorShown = false;
    } catch (e) { console.warn("Cloud-Sync offline:", e); }
}

function getLocalModified() {
    try { return JSON.parse(localStorage.getItem(skey("meta")) || "{}").modified || 0; }
    catch { return 0; }
}

async function pullCloudState() {
    loadSubjects();
    renderSubjects();
    renderArchive();
    if (!sbClient || !currentUser || !currentUser.id) return;
    try {
        const { data, error } = await sbClient.from("user_noten_daten")
            .select("subjects, archive, updated_at")
            .eq("user_id", currentUser.id)
            .maybeSingle();
        if (error) throw error;

        if (!data) { await flushCloudState(); return; }                       // neues Konto
        if (getLocalModified() > (Date.parse(data.updated_at) || 0)) {        // offline bearbeitet
            await flushCloudState();
            return;
        }
        if (Array.isArray(data.subjects)) {
            subjects = normalizeSubjects(data.subjects);
            localStorage.setItem(skey("subjects"), JSON.stringify(subjects));
        }
        if (Array.isArray(data.archive)) localStorage.setItem(skey("archive"), JSON.stringify(data.archive));
        renderSubjects();
        renderArchive();
    } catch (e) { console.warn("Cloud-Laden fehlgeschlagen:", e.message || e); }
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushCloudState(); });
window.addEventListener("online", flushCloudState);

// --- THEME ---
function initTheme() {
    setTheme(localStorage.getItem(STORAGE_KEYS.theme) || "auto");
}

function setTheme(mode) {
    localStorage.setItem(STORAGE_KEYS.theme, mode);
    document.documentElement.setAttribute("data-theme", mode);
    updateThemeBtn(mode);
}

function updateThemeBtn(mode) {
    document.querySelectorAll("[data-theme-opt]").forEach(b => {
        const on = b.dataset.themeOpt === mode;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const dark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#111827" : "#ffffff");
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    updateThemeBtn(localStorage.getItem(STORAGE_KEYS.theme) || "auto");
});

// --- PWA INSTALL ---
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

// --- NAVIGATION ---
function switchTab(tabName) {
    document.querySelectorAll(".tab-view").forEach(sec => sec.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach(b => { b.classList.remove("active"); b.removeAttribute("aria-current"); });
    document.getElementById("view-" + tabName)?.classList.add("active");
    const btn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
    btn?.classList.add("active");
    btn?.setAttribute("aria-current", "page");
    window.scrollTo(0, 0);
}

function switchTool(name) {
    document.querySelectorAll(".tool-panel").forEach(p => { p.hidden = p.dataset.tool !== name; });
    document.querySelectorAll(".seg-btn[data-tool]").forEach(b => {
        const on = b.dataset.tool === name;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
    });
}

// --- DIALOGE & TOAST ---
function openDialog(id) {
    const d = document.getElementById(id);
    if (d && !d.open) d.showModal();
}

function closeDialog(id) {
    const d = document.getElementById(id);
    if (d && d.open) d.close();
}

// Klick auf den Hintergrund schließt das Dialogfenster
document.addEventListener("click", (e) => {
    if (e.target instanceof HTMLDialogElement) e.target.close();
});

let toastTimer = null;
function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

window.addEventListener("offline", () => toast("Offline – Änderungen werden lokal gespeichert"));
window.addEventListener("online", () => toast("Wieder online"));

// --- HILFSFUNKTIONEN ---
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
    const t = String(rawToken ?? "").trim().replace(/[−–—]/g, "-"); // iOS-Sonderstriche
    const m = t.match(/^([1-6])([+-])?$/);
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
    pushCloudState();
}

// Schützt die App vor kaputten oder fremden Daten (Cloud, Verlauf, localStorage)
function normalizeSubjects(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(s => s && typeof s === "object").map(s => {
        const type = s.type === "neben" ? "neben" : "haupt";
        const kinds = type === "haupt" ? ["sa", "klein"] : ["gross", "klein"];
        return {
            id: s.id ?? uid(),
            name: String(s.name ?? "Fach"),
            type,
            ratio: s.ratio === "2:1" ? "2:1" : "1:1",
            notAdvancement: !!s.notAdvancement,
            grades: (Array.isArray(s.grades) ? s.grades : [])
                .filter(g => g && Number.isInteger(g.base) && g.base >= 1 && g.base <= 6)
                .map(g => ({
                    id: g.id ?? uid(),
                    base: g.base,
                    sign: g.sign === "+" || g.sign === "-" ? g.sign : "",
                    label: String(g.label ?? g.base),
                    kind: kinds.includes(g.kind) ? g.kind : kinds[0],
                    weight: Number(g.weight) > 0 ? Number(g.weight) : 1
                }))
        };
    });
}

function loadSubjects() {
    try { subjects = normalizeSubjects(JSON.parse(localStorage.getItem(skey("subjects")))); }
    catch { subjects = []; }
}

// --- VORLAGEN & FÄCHER ---
function renderPresets() {
    const grid = document.getElementById("presetSubjectsGrid");
    if (!grid) return;
    const have = new Set(subjects.map(s => s.name.toLowerCase()));
    grid.innerHTML = SUBJECT_PRESETS.map((p, idx) => {
        const added = have.has(p.name.toLowerCase());
        return `
            <button type="button" class="preset-card${added ? " is-added" : ""}" ${added ? "disabled" : ""} onclick="addFromPreset(${idx})">
                <span class="preset-icon" aria-hidden="true">${esc(p.icon)}</span>
                <span class="preset-text">
                    <span class="preset-title">${esc(p.name)}</span>
                    <span class="preset-ratio">${esc(p.ratioLabel)}</span>
                </span>
                <span class="preset-add" aria-hidden="true">${added ? "✓" : "+"}</span>
                <span class="sr-only">${added ? "bereits angelegt" : "hinzufügen"}</span>
            </button>`;
    }).join("");
}

function addFromPreset(idx) {
    const p = SUBJECT_PRESETS[idx];
    if (!p) return;
    subjects.push({
        id: uid(),
        name: p.name,
        type: p.type,
        ratio: p.ratio,
        notAdvancement: p.notAdvancement,
        grades: []
    });
    saveSubjects();
    renderSubjects();
    toast(`${p.name} hinzugefügt`);
}

function toggleNewSubDefaults() {
    const type = document.getElementById("newSubType").value;
    document.getElementById("newSubRatio").disabled = (type !== "haupt");
}

function addSubject() {
    const nameInput = document.getElementById("newSubName");
    const name = nameInput.value.trim();
    if (!name) { nameInput.setAttribute("aria-invalid", "true"); nameInput.focus(); return; }
    nameInput.removeAttribute("aria-invalid");

    const type = document.getElementById("newSubType").value;
    const ratio = document.getElementById("newSubRatio").value;
    const notAdv = document.getElementById("newSubNotAdv").checked;

    const newSub = {
        id: uid(),
        name,
        type,
        ratio: type === "haupt" ? ratio : "1:1",
        notAdvancement: notAdv,
        grades: []
    };
    subjects.push(newSub);
    openSubjects.add(newSub.id);

    nameInput.value = "";
    document.getElementById("newSubNotAdv").checked = false;
    saveSubjects();
    renderSubjects();
    closeDialog("addSubjectDialog");
    toast(`${name} hinzugefügt`);
}

function deleteSubject(subId) {
    if (!confirm("Fach samt allen Noten löschen?")) return;
    openSubjects.delete(subId);
    lastKind.delete(subId);
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

function defaultWeight(sub, kind) {
    if (sub.type === "haupt") return 1;        // SA:Ex-Verhältnis steckt schon in sub.ratio
    return kind === "gross" ? 2 : 1;           // Nebenfach: großer LN doppelt
}

function onKindChange(subId) {
    const sub = subjects.find(s => s.id === subId);
    if (!sub) return;
    const kind = document.getElementById(`kindSel-${subId}`).value;
    lastKind.set(subId, kind);
    document.getElementById(`weightInp-${subId}`).value = defaultWeight(sub, kind);
}

function addGradeToSubject(subId) {
    const sub = subjects.find(s => s.id === subId);
    if (!sub) return;

    const gInput = document.getElementById(`gradeInp-${subId}`);
    const kindSel = document.getElementById(`kindSel-${subId}`);
    const wInput = document.getElementById(`weightInp-${subId}`);

    const parsed = parseGradeToken(gInput.value);
    if (!parsed) { gInput.setAttribute("aria-invalid", "true"); gInput.focus(); return; }
    gInput.removeAttribute("aria-invalid");

    const kind = kindSel.value;
    let w = parseFloat(String(wInput.value).replace(",", "."));
    if (isNaN(w) || w <= 0) w = defaultWeight(sub, kind);

    sub.grades.push({
        id: uid(),
        base: parsed.base,
        sign: parsed.sign,
        label: parsed.label,
        kind,
        weight: w
    });

    gInput.value = "";
    lastKind.set(subId, kind);
    openSubjects.add(subId);
    saveSubjects();
    renderSubjects();
    document.getElementById(`gradeInp-${subId}`)?.focus();   // direkt die nächste Note eintippen
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

const openWeightPanels = new Set();
function rememberPanel(subId, el) { el.open ? openWeightPanels.add(subId) : openWeightPanels.delete(subId); }

function setSubjectSort(value) {
    subjectSort = SORT_MODES.includes(value) ? value : "manual";
    localStorage.setItem(SORT_KEY, subjectSort);
    renderSubjects();
}

function getSortedSubjects() {
    const list = subjects.map((s, i) => ({ s, i, avg: calcSubjectAverage(s) }));
    const byAvg = (dir) => (a, b) => {
        if (a.avg === null && b.avg === null) return a.i - b.i;
        if (a.avg === null) return 1;
        if (b.avg === null) return -1;
        return dir * (a.avg - b.avg) || a.i - b.i;
    };
    if (subjectSort === "name") list.sort((a, b) => a.s.name.localeCompare(b.s.name, "de") || a.i - b.i);
    else if (subjectSort === "best") list.sort(byAvg(1));
    else if (subjectSort === "worst") list.sort(byAvg(-1));
    else if (subjectSort === "haupt") list.sort((a, b) => (a.s.type === "haupt" ? 0 : 1) - (b.s.type === "haupt" ? 0 : 1) || a.i - b.i);
    return list;
}

function moveSubject(subId, dir) {
    const i = subjects.findIndex(s => s.id === subId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= subjects.length) return;
    [subjects[i], subjects[j]] = [subjects[j], subjects[i]];
    saveSubjects();
    renderSubjects();
    document.getElementById(`subj-${subId}`)?.scrollIntoView({ block: "nearest" });
}

function toggleSubject(subId) {
    const card = document.getElementById(`subj-${subId}`);
    if (!card) return;
    const open = !openSubjects.has(subId);
    if (open) openSubjects.add(subId); else openSubjects.delete(subId);
    card.classList.toggle("is-open", open);
    card.querySelector(".subject-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    card.querySelector(".subject-body").hidden = !open;
    updateToggleAllBtn();
}

function toggleAllSubjects() {
    const allOpen = subjects.length > 0 && subjects.every(s => openSubjects.has(s.id));
    openSubjects.clear();
    if (!allOpen) subjects.forEach(s => openSubjects.add(s.id));
    renderSubjects();
}

function updateToggleAllBtn() {
    const btn = document.getElementById("toggleAllBtn");
    if (!btn) return;
    const allOpen = subjects.length > 0 && subjects.every(s => openSubjects.has(s.id));
    btn.textContent = allOpen ? "Alle zuklappen" : "Alle aufklappen";
}

function renderSubjects() {
    const container = document.getElementById("subjectsContainer");
    const allAvgs = [];
    const advAvgs = [];

    const toolbar = document.getElementById("subjectToolbar");
    if (toolbar) toolbar.hidden = subjects.length === 0;
    const sortSel = document.getElementById("subjectSort");
    if (sortSel) sortSel.value = subjectSort;

    if (!subjects.length) {
        container.innerHTML = `
            <div class="empty-state">
                <p><strong>Noch keine Fächer</strong></p>
                <p class="hint">Wähle Vorlagen oder lege ein eigenes Fach an.</p>
                <button type="button" class="btn btn-primary" onclick="openDialog('addSubjectDialog')">Fach hinzufügen</button>
            </div>`;
    } else {
        container.innerHTML = getSortedSubjects().map(({ s: sub, i: pos, avg }) => {
            if (avg !== null) {
                allAvgs.push(avg);
                if (!sub.notAdvancement) advAvgs.push(avg);
            }

            const isOpen = openSubjects.has(sub.id);
            const n = sub.grades.length;
            const kinds = sub.type === "haupt"
                ? [["sa", "Schulaufgabe"], ["klein", "Kleiner LN"]]
                : [["gross", "Großer LN"], ["klein", "Kleiner LN"]];
            const wanted = lastKind.get(sub.id);
            const curKind = kinds.some(k => k[0] === wanted) ? wanted : kinds[0][0];
            const kindOptions = kinds.map(([v, t]) => `<option value="${v}" ${v === curKind ? "selected" : ""}>${t}</option>`).join("");
            const defW = defaultWeight(sub, curKind);

            const pillsHtml = sub.grades.map(g => {
                const kTxt = g.kind === "sa" ? "SA" : (g.kind === "gross" ? "Groß" : "Klein");
                return `
                    <span class="grade-pill">
                        <strong>${esc(g.label)}</strong>
                        <span class="cat-mini">${kTxt} · ×${fmt(g.weight, 1)}</span>
                        <button type="button" class="del-x" aria-label="Note ${esc(g.label)} löschen" onclick="removeGradeFromSubject(${sub.id}, ${g.id})">×</button>
                    </span>`;
            }).join("");

            const weightRows = sub.grades.map(g => `
                <tr>
                    <td><strong>${esc(g.label)}</strong></td>
                    <td>${g.kind === "sa" ? "Schulaufgabe" : (g.kind === "gross" ? "Großer LN" : "Kleiner LN")}</td>
                    <td><input type="number" class="inline-num" aria-label="Faktor für Note ${esc(g.label)}" step="0.5" min="0.5" value="${g.weight}" onchange="updateGradeWeight(${sub.id}, ${g.id}, this.value)"></td>
                </tr>`).join("");

            const subLine = [
                sub.type === "haupt" ? `Hauptfach ${sub.ratio}` : "Nebenfach",
                `${n} ${n === 1 ? "Note" : "Noten"}`,
                sub.notAdvancement ? "nicht vorrückungsrelevant" : ""
            ].filter(Boolean).join(" · ");

            return `
                <article class="subject-card${isOpen ? " is-open" : ""}" id="subj-${sub.id}">
                    <h3 class="subject-head">
                        <button type="button" class="subject-toggle" aria-expanded="${isOpen}" aria-controls="subj-body-${sub.id}" onclick="toggleSubject(${sub.id})">
                            <span class="subject-info">
                                <span class="subject-name">${esc(sub.name)}</span>
                                <span class="subject-sub">${esc(subLine)}</span>
                            </span>
                            <span class="subject-avg-num"><span class="sr-only">Schnitt </span>${avg !== null ? fmt(avg, 2) : "–"}</span>
                            <span class="chevron" aria-hidden="true"></span>
                        </button>
                    </h3>

                    <div class="subject-body" id="subj-body-${sub.id}" ${isOpen ? "" : "hidden"}>
                        ${n ? `<div class="grade-chips">${pillsHtml}</div>` : `<p class="hint empty-hint">Noch keine Noten eingetragen.</p>`}

                        <div class="add-grade-row">
                            <div class="field">
                                <label for="gradeInp-${sub.id}">Note (1–6)</label>
                                <input type="text" id="gradeInp-${sub.id}" inputmode="text" autocomplete="off" autocapitalize="off" enterkeyhint="done" onkeydown="if(event.key==='Enter')addGradeToSubject(${sub.id})">
                            </div>
                            <div class="field">
                                <label for="kindSel-${sub.id}">Art</label>
                                <select id="kindSel-${sub.id}" onchange="onKindChange(${sub.id})">${kindOptions}</select>
                            </div>
                            <div class="field">
                                <label for="weightInp-${sub.id}">Faktor</label>
                                <input type="number" id="weightInp-${sub.id}" step="0.5" min="0.5" value="${defW}">
                            </div>
                            <button type="button" class="btn btn-primary add-btn" onclick="addGradeToSubject(${sub.id})" aria-label="Note zu ${esc(sub.name)} eintragen">Eintragen</button>
                        </div>

                        <details class="panel subject-settings" ${openWeightPanels.has(sub.id) ? "open" : ""} ontoggle="rememberPanel(${sub.id}, this)">
                            <summary>Einstellungen</summary>
                            <div class="panel-body">
                                <div class="setting-row">
                                    <label class="checkbox-row">
                                        <input type="checkbox" ${sub.notAdvancement ? "checked" : ""} onchange="toggleSubjectNotAdv(${sub.id})">
                                        <span>Kein Vorrückungsfach</span>
                                    </label>
                                </div>
                                ${sub.type === "haupt" ? `
                                    <div class="setting-row">
                                        <label for="ratio-${sub.id}">Verhältnis Schulaufgabe : kleiner LN</label>
                                        <select id="ratio-${sub.id}" onchange="updateSubjectRatio(${sub.id}, this.value)">
                                            <option value="2:1" ${sub.ratio === "2:1" ? "selected" : ""}>2 : 1</option>
                                            <option value="1:1" ${sub.ratio === "1:1" ? "selected" : ""}>1 : 1</option>
                                        </select>
                                    </div>` : ""}
                                ${n ? `
                                    <div class="setting-row">
                                        <span class="setting-label">Faktoren der Noten</span>
                                        <div class="table-wrap">
                                            <table>
                                                <thead><tr><th>Note</th><th>Art</th><th>Faktor</th></tr></thead>
                                                <tbody>${weightRows}</tbody>
                                            </table>
                                        </div>
                                    </div>` : ""}
                                ${subjectSort === "manual" && subjects.length > 1 ? `
                                    <div class="setting-row">
                                        <span class="setting-label">Reihenfolge</span>
                                        <div class="toolbar" style="margin-bottom:0;">
                                            <button type="button" class="btn btn-sm" ${pos > 0 ? "" : "disabled"} onclick="moveSubject(${sub.id}, -1)">↑ Nach oben</button>
                                            <button type="button" class="btn btn-sm" ${pos < subjects.length - 1 ? "" : "disabled"} onclick="moveSubject(${sub.id}, 1)">↓ Nach unten</button>
                                        </div>
                                    </div>` : ""}
                                <button type="button" class="btn btn-danger btn-block" onclick="deleteSubject(${sub.id})">Fach löschen</button>
                            </div>
                        </details>
                    </div>
                </article>`;
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

    renderPresets();
    updateToggleAllBtn();
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
        const txt = st === "must" ? "mindestens einmal" : (st === "none" ? "ausgeschlossen" : "offen");
        const cls = st === "must" ? "cat-pill state-must" : (st === "none" ? "cat-pill state-none" : "cat-pill");
        return `<button type="button" class="${cls}" onclick="cycleDistCat(${i})" aria-label="Note ${i + 1}: ${txt}">${i + 1}: ${lbl}</button>`;
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
    if (distCats[i] !== "none" && distExact[i] === 0) distExact[i] = null;   // sonst Widerspruch "≥1×" vs. "genau 0"
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
    distTimer = setTimeout(runDistribution, 150);
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
    let truncated = false;
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
            if (candidates.length >= 120000) { truncated = true; return; }
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
        if (skewF === "light" && !(it.skew > 0.15)) continue;
        if (skewF === "heavy" && !(it.skew < -0.15)) continue;
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

    const topP = (wArr[filtered[0].idx] / sumExp) * 100;
    const cardsHtml = filtered.slice(0, 10).map(({ it, idx }, r) => {
        const p = (wArr[idx] / sumExp) * 100;
        const seq = [];
        for (let g = 0; g < 6; g++) {
            const kC = knownCounts[g];
            const eC = it.counts[g] - kC;
            for (let k = 0; k < kC; k++) seq.push(`<span class="g-known">${g + 1}</span>`);
            for (let e = 0; e < eC; e++) seq.push(`<span class="g-est">${g + 1}</span>`);
        }
        const maxC = Math.max(...it.counts, 1);
        return `
            <li class="dist-card">
                <div class="dist-head">
                    <span class="dist-rank">${r + 1}</span>
                    <div class="dist-meta">
                        <strong>${fmt(p, 1)} %</strong>
                        <span>Ø ${fmt(it.avg)} · Streuung ±${fmt(it.std)}</span>
                    </div>
                </div>
                <div class="dist-bar" aria-hidden="true"><span style="width:${Math.max(2, Math.min(100, (p / topP) * 100)).toFixed(1)}%"></span></div>
                <div class="dist-counts">
                    ${it.counts.map((c, g) => `
                        <div class="dist-count${c === 0 ? " zero" : ""}">
                            <span class="dist-note"><span class="sr-only">Note </span>${g + 1}</span>
                            <strong>${c}×</strong>
                            <i style="width:${Math.round((c / maxC) * 100)}%"></i>
                        </div>`).join("")}
                </div>
                <div class="seq-line">${seq.join("")}</div>
            </li>`;
    }).join("");

    out.innerHTML = `
        <p class="result-summary">
            ${filtered.length.toLocaleString("de-DE")} Treffer${truncated ? " (Suche bei 120.000 Kandidaten abgebrochen, Ergebnis unvollständig)" : ""} · die 10 wahrscheinlichsten
            <span class="legend"><span class="g-known">1</span> = bekannte Note</span>
        </p>
        <ol class="dist-list">${cardsHtml}</ol>
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
        const nextLine = hitIdx > 0
            ? `Noch ${fmt(Math.max(0, roundHalf(keyRows[hitIdx - 1].pts - gotP)), 1)} Pkt. bis Note ${keyRows[hitIdx - 1].grade}`
            : "Beste Note erreicht";
        sumEl.innerHTML = `
            <div class="key-result">
                <div class="key-grade" aria-hidden="true">${keyRows[hitIdx].grade}</div>
                <div>
                    <strong>Note ${keyRows[hitIdx].grade}</strong>
                    <div class="hint">${fmt(gotP, 1)} / ${fmt(maxP, 1)} Pkt. (${fmt(pct, 1)} %)</div>
                    <div class="hint">${nextLine}</div>
                </div>
            </div>`;
    } else {
        sumEl.innerHTML = "";
    }

    bodyEl.innerHTML = keyRows.map((r, i) => `
        <tr style="${i === hitIdx ? "background:var(--primary-soft);" : ""}">
            <td><strong>Note ${r.grade}</strong></td>
            <td><input type="number" class="inline-num" aria-label="Prozent ab Note ${r.grade}" step="0.5" min="0" max="100" value="${r.pct.toFixed(1)}" onchange="editKeyPct(${i}, this.value)"> %</td>
            <td><input type="number" class="inline-num" aria-label="Punkte ab Note ${r.grade}" step="0.5" min="0" max="${maxP}" value="${r.pts.toFixed(1)}" onchange="editKeyPts(${i}, this.value)"> Pkt.</td>
            <td><button type="button" class="btn btn-sm" aria-pressed="${r.locked}" aria-label="Grenze für Note ${r.grade} fixieren" onclick="toggleKeyLock(${i})">${r.locked ? "Fix" : "Auto"}</button></td>
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
    try { return JSON.parse(localStorage.getItem(skey("archive"))) || []; }
    catch { return []; }
}

function setArchive(list) {
    localStorage.setItem(skey("archive"), JSON.stringify(list));
    pushCloudState();
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
    inp.value = "";
    setArchive(list.slice(0, 25));
    renderArchive();
    toast("Stand gespeichert");
}

function loadSnapshot(id) {
    const snap = getArchive().find(x => x.id === id);
    if (!snap) return;
    if (!confirm("Aktuelle Fächer werden durch diesen Stand ersetzt. Fortfahren?")) return;

    if (Array.isArray(snap.subjects)) {
        subjects = normalizeSubjects(JSON.parse(JSON.stringify(snap.subjects)));
        openSubjects.clear();
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
    toast("Stand geladen");
}

function deleteSnapshot(id) {
    if (!confirm("Gespeicherten Stand löschen?")) return;
    setArchive(getArchive().filter(x => x.id !== id));
    renderArchive();
}

function renderArchive() {
    const list = getArchive();
    const el = document.getElementById("archiveList");
    if (!list.length) {
        el.innerHTML = `<div class="empty-state"><p><strong>Noch nichts gespeichert</strong></p><p class="hint">Speichere oben den aktuellen Stand deiner Fächer.</p></div>`;
        return;
    }
    el.innerHTML = list.map(item => {
        const avgs = (item.subjects || []).map(s => calcSubjectAverage(s)).filter(a => a !== null);
        const avg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
        const date = new Date(item.id).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
        return `
            <div class="archive-card">
                <div class="archive-info">
                    <strong>${esc(item.title)}</strong>
                    <div class="hint">${date} · ${(item.subjects || []).length} Fächer${avg !== null ? " · Ø " + fmt(avg) : ""}</div>
                </div>
                <div class="archive-actions">
                    <button type="button" class="btn btn-primary btn-sm" onclick="loadSnapshot(${item.id})">Laden</button>
                    <button type="button" class="btn btn-sm btn-danger" onclick="deleteSnapshot(${item.id})">Löschen</button>
                </div>
            </div>`;
    }).join("");
}

// --- START ---
initTheme();
toggleNewSubDefaults();
renderPresets();
loadSubjects();
renderSubjects();
renderDistFilters();
runDistribution();
renderKeyTable();
updateComparison();
renderArchive();
initAuthAndData();
