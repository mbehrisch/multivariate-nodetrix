// ============================================================
//  export_firestore.mjs — Firestore → analysis-ready CSV
//
//  Reads every event document at  sessions/{prolificPid}/events/{autoId}
//  and writes ONE ROW PER answer_submitted event to a flat CSV, joined with:
//    • the matching task_start timestamp  (for an independent RT cross-check)
//    • the participant's page_load fields  (modality, order)
//    • study_complete presence             (completion flag)
//
//  SV (encoding level) and task_type are NOT logged as fields — they are parsed
//  from the taskId convention  T_{Modality}_{SV}_{TaskType}  (e.g. T_Cat_SV0_TE1).
//
//  Usage:
//    npm i -D firebase-admin
//    # generate a service-account key in the Firebase console and point to it:
//    export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/serviceAccount.json
//    node analysis/export_firestore.mjs            # writes analysis/study_data.csv
//
//  NOTE: the firebaseConfig in code/study.js is the public *client* config and
//  cannot be used here — a server-side service-account key is required.
// ============================================================

import admin from 'firebase-admin';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── Config ────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
const OUTPUT_CSV           = fileURLToPath(new URL('./study_data.csv', import.meta.url));
const EVENTS_GROUP         = 'events';   // collectionGroup name under sessions/{pid}
const MODALITY_MAP         = { Cat: 'categorical', Num: 'numerical', Dir: 'directional' };

// ── Init admin SDK ────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Helpers ───────────────────────────────────────────────────
// Parse "T_Cat_SV0_TE1" → { modality, sv, taskType }
function parseTaskId(taskId) {
    const m = /^T_([A-Za-z]+)_(SV\d)_(\w+)$/.exec(taskId || '');
    if (!m) return { modality: null, sv: null, taskType: null };
    return { modality: MODALITY_MAP[m[1]] ?? m[1], sv: m[2], taskType: m[3] };
}

// Best available timestamp for an event (logged ISO field, else serverTime)
function eventTime(ev) {
    const t = ev.timestamp || ev.serverTime;
    return t ? new Date(t).getTime() : NaN;
}

// CSV-escape a single cell
function csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = Array.isArray(v) ? v.join('|') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
    console.log('Reading events from Firestore…');
    const snap = await db.collectionGroup(EVENTS_GROUP).get();
    console.log(`  ${snap.size} event documents`);

    // Group events by participant
    const byPid = new Map();   // prolificPid → array of event objects
    snap.forEach(doc => {
        const ev  = doc.data();
        const pid = ev.prolificPid ?? 'UNKNOWN';
        if (!byPid.has(pid)) byPid.set(pid, []);
        byPid.get(pid).push(ev);
    });

    const rows = [];
    for (const [pid, events] of byPid) {
        const pageLoad  = events.find(e => e.event === 'page_load');
        const completed = events.some(e => e.event === 'study_complete');

        // Index task_start by taskId (keep the latest start if a task repeats)
        const startByTask = new Map();
        events.filter(e => e.event === 'task_start').forEach(e => {
            const prev = startByTask.get(e.taskId);
            if (!prev || eventTime(e) > eventTime(prev)) startByTask.set(e.taskId, e);
        });

        // Count node_highlighted per task
        const highlightsByTask = new Map();
        events.filter(e => e.event === 'node_highlighted').forEach(e => {
            highlightsByTask.set(e.taskId, (highlightsByTask.get(e.taskId) || 0) + 1);
        });

        // One row per answer_submitted; on reload duplicates, keep the LAST per taskId
        const answerByTask = new Map();
        events.filter(e => e.event === 'answer_submitted').forEach(e => {
            const prev = answerByTask.get(e.taskId);
            if (!prev || eventTime(e) > eventTime(prev)) answerByTask.set(e.taskId, e);
        });

        for (const [taskId, ans] of answerByTask) {
            const { modality, sv, taskType } = parseTaskId(taskId);
            const start    = startByTask.get(taskId);
            const startTs  = start ? eventTime(start) : NaN;
            const ansTs    = eventTime(ans);
            const rtDerived = Number.isFinite(startTs) && Number.isFinite(ansTs)
                ? ansTs - startTs : '';

            rows.push({
                participant:   pid,
                order:         pageLoad?.order ?? ans.order ?? '',
                modality:      pageLoad?.modality ?? modality ?? '',
                sv,
                task_type:     taskType,
                task_id:       taskId,
                answer_type:   ans.answerType ?? '',
                selected_answer: ans.selectedAnswer,                 // string or array
                is_correct:    ans.isCorrect === null ? '' : ans.isCorrect, // ''=ungraded
                rt_logged_ms:  ans.responseTimeMs ?? '',
                rt_derived_ms: rtDerived,
                n_highlights:  highlightsByTask.get(taskId) || 0,
                task_start_iso: start?.timestamp ?? start?.serverTime ?? '',
                answer_iso:    ans.serverTime ?? ans.timestamp ?? '',
                completed,
            });
        }
    }

    // Stable sort: participant, then SV order, then task type
    const SV_ORDER   = { SV0: 0, SV1: 1, SV2: 2, SV3: 3 };
    const TYPE_ORDER = { TE1: 0, TS4: 1, TB1: 2, TA2: 3 };
    rows.sort((a, b) =>
        String(a.participant).localeCompare(String(b.participant)) ||
        (SV_ORDER[a.sv] ?? 9)   - (SV_ORDER[b.sv] ?? 9) ||
        (TYPE_ORDER[a.task_type] ?? 9) - (TYPE_ORDER[b.task_type] ?? 9));

    const header = Object.keys(rows[0] ?? { participant: '' });
    const csv = [header.join(',')]
        .concat(rows.map(r => header.map(h => csvCell(r[h])).join(',')))
        .join('\n');

    writeFileSync(OUTPUT_CSV, csv + '\n', 'utf8');
    console.log(`Wrote ${rows.length} rows for ${byPid.size} participant(s) → ${OUTPUT_CSV}`);
}

main().catch(err => { console.error(err); process.exit(1); });
