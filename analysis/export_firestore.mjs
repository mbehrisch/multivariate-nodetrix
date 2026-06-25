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

// firebase-admin v12+ exposes its API via modular subpath exports for ESM;
// the old default `import admin from 'firebase-admin'` no longer carries
// `.credential`/`.firestore`, so we import the pieces we need directly.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── Config ────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
const OUTPUT_CSV           = fileURLToPath(new URL('./study_data.csv', import.meta.url));
const OUTPUT_RATINGS_CSV   = fileURLToPath(new URL('./study_ratings.csv', import.meta.url));
const OUTPUT_SUMMARY_CSV   = fileURLToPath(new URL('./study_participants.csv', import.meta.url));
const EVENTS_GROUP         = 'events';   // collectionGroup name under sessions/{pid}
const MODALITY_MAP         = { Cat: 'categorical', Num: 'numerical', Dir: 'directional' };

// Participants dropped from every output. The first group are test/preview runs
// that are never real Prolific participants; the second group are researcher
// decided data-quality exclusions.
const EXCLUDE_PIDS = new Set([
    // test / preview runs
    'PREVIEW', 'UNKNOWN', 'TESTPID1', 'balancetest01',
    // data-quality exclusions
    '68d40e365640abed99e0ba51',   // incomplete (15/16 tasks)
    '6a0e1af66c5e0aa953d68cc4',
]);
// Answers faster than this (ms) are flagged as suspiciously quick in the summary.
const FAST_RT_MS   = 2000;
// Total tasks a complete session should contain (4 SVs × 4 task types).
const TOTAL_TASKS  = 16;

// ── Init admin SDK ────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

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

// Median of a numeric array ('' when empty)
function median(arr) {
    if (!arr.length) return '';
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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
    const ratingRows = [];   // one row per participant × condition (end-of-study ratings)
    const summaryRows = [];  // one row per participant (approve/reject decision support)
    for (const [pid, events] of byPid) {
        if (EXCLUDE_PIDS.has(pid)) continue;   // drop test/preview runs from every output

        const pageLoad  = events.find(e => e.event === 'page_load');
        const completeEv = events.find(e => e.event === 'study_complete');
        const completed = !!completeEv;

        // End-of-study condition ratings (latest condition_ratings event wins)
        const ratingEv = events.filter(e => e.event === 'condition_ratings')
            .sort((a, b) => eventTime(a) - eventTime(b)).pop();
        if (ratingEv && ratingEv.ratings) {
            for (const [sv, r] of Object.entries(ratingEv.ratings)) {
                ratingRows.push({
                    participant: pid,
                    modality:    pageLoad?.modality ?? '',
                    sv,
                    readability: r?.readability ?? '',
                    preference:  r?.preference ?? '',
                });
            }
        }

        // ── Repair the categorical TS4 duplicate-id bug ─────────────────────
        // Before the tasks.json fix, every categorical TS4 trial was logged with
        // SV0's id (T_Cat_SV0_TS4), so SV1/SV2/SV3 structure trials collapsed.
        // The flow within each SV block is fixed (TE1 → TS4 → TB1 → TA2) and
        // TE1/TB1/TA2 carry the correct SV in their id, so a TS4 event belongs
        // to the SV of the most recent preceding non-TS4 event (that block's
        // TE1). Walk the session in time order and rewrite each TS4 event's
        // taskId to the correct SV-specific id. Idempotent for already-correct
        // data (numerical/directional, and any categorical logged post-fix).
        const timeSorted = [...events].sort((a, b) => eventTime(a) - eventTime(b));
        let lastSvSeen = null;
        for (const e of timeSorted) {
            const { sv, taskType } = parseTaskId(e.taskId);
            if (taskType && taskType !== 'TS4' && sv) { lastSvSeen = sv; continue; }
            if (taskType === 'TS4' && lastSvSeen) {
                const mPrefix = (e.taskId.match(/^T_([A-Za-z]+)_/) || [])[1] || 'Cat';
                e.taskId = `T_${mPrefix}_${lastSvSeen}_TS4`;   // mutate in place
            }
        }

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

        // ── Per-participant accumulators (for the summary file) ──────────────
        const rtList = [];               // best RT per task, ms
        let nCorrect = 0, nGraded = 0;   // graded = isCorrect not null (TS4 is null)
        let confSum  = 0, confN   = 0;
        let nFast    = 0;                 // answers under FAST_RT_MS
        let maxRt    = -1, maxRtTask = '';
        let lastAnsTs = NaN;

        for (const [taskId, ans] of answerByTask) {
            const { modality, sv, taskType } = parseTaskId(taskId);
            const start    = startByTask.get(taskId);
            const startTs  = start ? eventTime(start) : NaN;
            const ansTs    = eventTime(ans);
            const rtDerived = Number.isFinite(startTs) && Number.isFinite(ansTs)
                ? ansTs - startTs : '';

            // Best available RT: the logged value, else the derived one.
            const rtBest = Number.isFinite(+ans.responseTimeMs) ? +ans.responseTimeMs
                         : Number.isFinite(rtDerived) ? rtDerived : NaN;
            if (Number.isFinite(rtBest)) {
                rtList.push(rtBest);
                if (rtBest > maxRt) { maxRt = rtBest; maxRtTask = `${sv}/${taskType}`; }
                if (rtBest < FAST_RT_MS) nFast++;
            }
            if (ans.isCorrect === true)  { nGraded++; nCorrect++; }
            if (ans.isCorrect === false) { nGraded++; }
            if (Number.isFinite(+ans.confidence)) { confSum += +ans.confidence; confN++; }
            if (Number.isFinite(ansTs)) lastAnsTs = Math.max(lastAnsTs || 0, ansTs);

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
                confidence:    ans.confidence ?? '',                 // 1–5 Likert
                rt_logged_ms:  ans.responseTimeMs ?? '',
                rt_derived_ms: rtDerived,
                n_highlights:  highlightsByTask.get(taskId) || 0,
                task_start_iso: start?.timestamp ?? start?.serverTime ?? '',
                answer_iso:    ans.serverTime ?? ans.timestamp ?? '',
                completed,
            });
        }

        // ── One summary row per participant ─────────────────────────────────
        // total time: prefer the logged study_complete value, else page_load →
        // last answer (still meaningful for people who dropped out).
        const pageTs   = pageLoad ? eventTime(pageLoad) : NaN;
        const totalMs  = Number.isFinite(+completeEv?.totalTimeMs) ? +completeEv.totalTimeMs
                       : (Number.isFinite(pageTs) && Number.isFinite(lastAnsTs) ? lastAnsTs - pageTs : NaN);
        const medRt    = median(rtList);

        summaryRows.push({
            participant:     pid,
            order:           pageLoad?.order ?? '',
            modality:        pageLoad?.modality ?? '',
            completed,
            n_answered:      answerByTask.size,                          // out of TOTAL_TASKS
            missing_tasks:   TOTAL_TASKS - answerByTask.size,
            n_correct:       nGraded ? nCorrect : '',
            n_graded:        nGraded,                                    // TS4 tasks are ungraded
            accuracy:        nGraded ? +(nCorrect / nGraded).toFixed(2) : '',
            mean_confidence: confN  ? +(confSum / confN).toFixed(2) : '',
            total_time_min:  Number.isFinite(totalMs) ? +(totalMs / 60000).toFixed(1) : '',
            median_rt_s:     medRt === '' ? '' : +(medRt / 1000).toFixed(1),
            max_rt_s:        maxRt >= 0 ? +(maxRt / 1000).toFixed(1) : '',  // slowest single question
            slowest_task:    maxRtTask,
            n_fast_answers:  nFast,                                       // answers under FAST_RT_MS
        });
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
    console.log(`Wrote ${rows.length} trial rows for ${summaryRows.length} participant(s) → ${OUTPUT_CSV}`);

    // Second file: end-of-study condition ratings (long format)
    const rHeader = ['participant', 'modality', 'sv', 'readability', 'preference'];
    const rCsv = [rHeader.join(',')]
        .concat(ratingRows.map(r => rHeader.map(h => csvCell(r[h])).join(',')))
        .join('\n');
    writeFileSync(OUTPUT_RATINGS_CSV, rCsv + '\n', 'utf8');
    console.log(`Wrote ${ratingRows.length} condition-rating rows → ${OUTPUT_RATINGS_CSV}`);

    // Third file: per-participant summary for the approve/reject decision.
    summaryRows.sort((a, b) => String(a.participant).localeCompare(String(b.participant)));
    const sHeader = Object.keys(summaryRows[0] ?? { participant: '' });
    const sCsv = [sHeader.join(',')]
        .concat(summaryRows.map(r => sHeader.map(h => csvCell(r[h])).join(',')))
        .join('\n');
    writeFileSync(OUTPUT_SUMMARY_CSV, sCsv + '\n', 'utf8');
    console.log(`Wrote ${summaryRows.length} participant summary rows → ${OUTPUT_SUMMARY_CSV}`);

    // Also print it to the console so you can eyeball approve/reject at a glance.
    console.log('\nPer-participant summary:');
    console.table(summaryRows);
}

main().catch(err => { console.error(err); process.exit(1); });
