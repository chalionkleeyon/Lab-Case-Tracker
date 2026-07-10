// ============================================================
// LAB CASE TRACKER — script.js
//
// STEP 1: Replace the URL below with YOUR deployed Apps Script URL.
//         It looks like: https://script.google.com/macros/s/AKfycb.../exec
// ============================================================

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzJ2dfBhHTMDmx17BGQ8DIk8OF6sniNWZn-HyIo4bBurpPEBXZ8ApCPq2tLZ9vItBM/exec";

// ============================================================
// Do not edit below this line unless you know what you're doing.
// ============================================================

let allCases = [];

// ---------- LOAD ----------

async function loadCases() {
    showLoader(true);
    hideError();

    // Guard: make sure URL was changed
    if (SCRIPT_URL === "PASTE_YOUR_APPS_SCRIPT_URL_HERE") {
        showError("Open script.js and replace PASTE_YOUR_APPS_SCRIPT_URL_HERE with your deployed Apps Script URL.");
        showLoader(false);
        return;
    }

    try {
        const res = await fetch(SCRIPT_URL);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        allCases = json.cases || [];
        buildFilters();
        render();
    } catch (err) {
        console.error("Load failed:", err);
        showError("Could not connect to Google Sheets. Make sure your Apps Script is deployed and the URL in script.js is correct.");
    }
    showLoader(false);
}


// ---------- RENDER BOARD ----------

function render() {
    const fd = document.getElementById("fltDoctor").value;
    const fl = document.getElementById("fltLab").value;
    const ft = document.getElementById("fltType").value;

    let cases = allCases.filter(c => {
        if (fd && c.doctor !== fd) return false;
        if (fl && c.lab !== fl) return false;
        if (ft && c.caseType !== ft) return false;
        return true;
    });

    // Sort: overdue first, then soonest due
    cases.sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return (a.daysUntilDue ?? 999) - (b.daysUntilDue ?? 999);
    });

    // Bucket by normalized status
    const buckets = { sent: [], atlab: [], received: [], seated: [] };
    cases.forEach(c => {
        const s = c.status.toLowerCase().replace(/\s+/g, "");
        if (s === "atlab")         buckets.atlab.push(c);
        else if (s === "received") buckets.received.push(c);
        else if (s === "seated")   buckets.seated.push(c);
        else                       buckets.sent.push(c);
    });

    fillCol("colSent",  buckets.sent,     "cntSent");
    fillCol("colAtLab", buckets.atlab,    "cntAtLab");
    fillCol("colRecv",  buckets.received, "cntRecv");
    fillCol("colSeat",  buckets.seated,   "cntSeat");

    // Stats — "open" = everything except Seated
    const open    = cases.filter(c => norm(c.status) !== "seated");
    const overdue = cases.filter(c => c.isOverdue);
    const soon    = cases.filter(c => !c.isOverdue && c.daysUntilDue != null && c.daysUntilDue >= 0 && c.daysUntilDue <= 7);
    const ready   = buckets.received;

    setText("statOpen",    open.length);
    setText("statOverdue", overdue.length);
    setText("statDueSoon", soon.length);
    setText("statReady",   ready.length);
}

function norm(s) { return (s || "").toLowerCase().replace(/\s+/g, ""); }

function fillCol(bodyId, cases, cntId) {
    const el = document.getElementById(bodyId);
    document.getElementById(cntId).textContent = cases.length;
    el.innerHTML = "";

    cases.forEach(c => {
        const card = document.createElement("div");
        card.className = "card" + (c.isOverdue ? " overdue" : "");

        let timeBadge = "";
        if (c.isOverdue) {
            timeBadge = `<span class="card-badge badge-overdue">${Math.abs(c.daysUntilDue)} day${Math.abs(c.daysUntilDue) !== 1 ? "s" : ""} overdue</span>`;
        } else if (c.daysUntilDue != null && c.daysUntilDue >= 0 && c.daysUntilDue <= 7) {
            const lbl = c.daysUntilDue === 0 ? "Due today"
                      : c.daysUntilDue === 1 ? "Due tomorrow"
                      : "Due in " + c.daysUntilDue + " days";
            timeBadge = `<span class="card-badge badge-duesoon">${lbl}</span>`;
        }

        const actions = buildActions(c);

        card.innerHTML =
            `<div class="card-patient">${esc(c.patient)}</div>` +
            `<div class="card-detail">` +
                `<span><strong>${esc(c.caseType)}</strong>${c.shade ? " &middot; Shade: " + esc(c.shade) : ""}</span>` +
                `<span>${esc(c.doctor)} &middot; ${esc(c.lab)}</span>` +
                `<span>Sent: ${c.dateSent}${c.dueDate ? " &middot; Due: " + c.dueDate : ""}</span>` +
                (c.dateReceived ? `<span>Received: ${c.dateReceived}</span>` : "") +
            `</div>` +
            timeBadge +
            (c.notes ? `<div class="card-notes">${esc(c.notes)}</div>` : "") +
            (actions ? `<div class="card-actions">${actions}</div>` : "");

        el.appendChild(card);
    });
}

function buildActions(c) {
    const s = norm(c.status);
    if (s === "seated") return "";
    if (s === "received") return `<button class="btn btn-sm" onclick="moveCase(${c.row},'Seated')">Mark Seated</button>`;
    if (s === "atlab")    return `<button class="btn btn-sm" onclick="moveCase(${c.row},'Received')">Mark Received</button>`;
    // default (sent or blank)
    return `<button class="btn btn-sm" onclick="moveCase(${c.row},'At Lab')">Mark At Lab</button>`;
}


// ---------- MOVE STATUS ----------

async function moveCase(row, newStatus) {
    if (!confirm('Move this case to "' + newStatus + '"?')) return;
    showLoader(true);
    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ action: "updateStatus", row: row, status: newStatus })
        });
        await loadCases();
    } catch (err) {
        console.error("Update failed:", err);
        showError("Could not update the case. Try again.");
        showLoader(false);
    }
}


// ---------- ADD CASE ----------

function toggleForm() {
    const wrap = document.getElementById("formWrap");
    wrap.classList.toggle("hide");
    if (!wrap.classList.contains("hide")) {
        document.getElementById("inSent").valueAsDate = new Date();
        const due = new Date();
        due.setDate(due.getDate() + 14);
        document.getElementById("inDue").valueAsDate = due;
        document.getElementById("inPatient").focus();
    }
    document.getElementById("formMsg").textContent = "";
}

async function addCase() {
    const msg = document.getElementById("formMsg");
    msg.textContent = "";
    msg.className = "form-msg";

    const patient  = document.getElementById("inPatient").value.trim();
    const doctor   = document.getElementById("inDoctor").value.trim();
    const caseType = document.getElementById("inType").value;
    const shade    = document.getElementById("inShade").value.trim();
    const lab      = document.getElementById("inLab").value.trim();
    const dateSent = document.getElementById("inSent").value;
    const dueDate  = document.getElementById("inDue").value;
    const notes    = document.getElementById("inNotes").value.trim();

    if (!patient || !doctor || !lab || !dateSent || !dueDate) {
        msg.textContent = "Fill in Patient, Doctor, Lab, Date Sent, and Due Date.";
        msg.classList.add("err");
        return;
    }

    showLoader(true);
    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "addCase",
                patient, doctor, caseType, shade, lab, dateSent, dueDate, notes
            })
        });
        msg.textContent = "Case added!";
        msg.classList.add("ok");

        // Clear inputs
        document.getElementById("inPatient").value = "";
        document.getElementById("inDoctor").value  = "";
        document.getElementById("inShade").value   = "";
        document.getElementById("inLab").value     = "";
        document.getElementById("inNotes").value   = "";

        await loadCases();
    } catch (err) {
        console.error("Add failed:", err);
        msg.textContent = "Could not add the case. Try again.";
        msg.classList.add("err");
        showLoader(false);
    }
}


// ---------- FILTERS ----------

function buildFilters() {
    const docs  = [...new Set(allCases.map(c => c.doctor).filter(Boolean))].sort();
    const labs  = [...new Set(allCases.map(c => c.lab).filter(Boolean))].sort();
    const types = [...new Set(allCases.map(c => c.caseType).filter(Boolean))].sort();

    setOptions("fltDoctor", docs,  "All Doctors");
    setOptions("fltLab",    labs,  "All Labs");
    setOptions("fltType",   types, "All Types");
}

function setOptions(id, items, defaultLabel) {
    const el = document.getElementById(id);
    const cur = el.value;
    el.innerHTML = `<option value="">${defaultLabel}</option>`;
    items.forEach(v => {
        const o = document.createElement("option");
        o.value = o.textContent = v;
        if (v === cur) o.selected = true;
        el.appendChild(o);
    });
}


// ---------- HELPERS ----------

function setText(id, val) { document.getElementById(id).textContent = val; }

function showLoader(on) { document.getElementById("loader").classList.toggle("hide", !on); }

function showError(msg) {
    document.getElementById("errorMsg").textContent = msg;
    document.getElementById("errorBanner").classList.remove("hide");
}

function hideError() { document.getElementById("errorBanner").classList.add("hide"); }

function esc(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
}


// ---------- START ----------

loadCases();
