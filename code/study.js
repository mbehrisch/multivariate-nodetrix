// ============================================================
//  study.js — Participant-facing study interface controller
//
//  Architecture note
//  -----------------
//  Importing from main.js triggers its module evaluation:
//    • the <svg> is created inside #graph
//    • globals (appState, svg, …) are exported
//    • an async fetch for sampled_data.json is started
//
//  We set appState.visualizationMode = 'nodeLink' synchronously
//  so that when main.js's fetch resolves and calls
//  buildEverything(), it uses the node-link path instead of the
//  full NodeTrix path.  We then wait for appState.graph to be
//  populated, clear the canvas, and rebuild cleanly for the study.
// ============================================================

// ── Prolific completion URL (replace before going live) ──────
const COMPLETION_URL = 'https://app.prolific.com/submissions/complete?cc=C3OC2I8H';

// ── Imports ──────────────────────────────────────────────────
import { appState, svg, datasetSpec, width, height } from './main.js';
import { buildNodeLinkOnly }          from './building/nl-builder.js';
import { applyForceLayout }           from './building/force-layout.js';
import { setSimulationState, deriveOrder, buildConfidenceBlock, setConfidenceVisible } from './utils.js';

import {
    applyCategoricalColouring,
    applyCategoricalDashing,
    categoricalColorMap,
    categoricalDashMap,
} from './multivariate/categorical-edge.js';

import {
    applyNumericalColouring,
    applyNumericalThickness,
    defineNumericalMapping,
} from './multivariate/numerical-edge.js';

import {
    applyDirectionalGradient,
    applyDirectionalTaper,
    applyDirectionalArrows,
} from './multivariate/directional-edge.js';

import {
    applyEdgeTooltip,
    resetEdgeTooltip,
} from './multivariate/baseline-edge.js';

// ── Firebase ──────────────────────────────────────────────────
import { initializeApp }                        from 'firebase/app';
import { getFirestore, collection, addDoc, doc, runTransaction } from 'firebase/firestore';

// ── Synchronous setup (before main.js's fetch resolves) ──────
appState.visualizationMode = 'nodeLink';  // keeps buildEverything() in NL-only mode
svg.attr('id', 'study-svg');              // give the SVG the spec'd id

// ── URL parameters ────────────────────────────────────────────
const _p         = new URLSearchParams(window.location.search);
const prolificPid = _p.get('PROLIFIC_PID') || 'PREVIEW';
const studyId     = _p.get('STUDY_ID')     || 'PREVIEW';
const sessionId   = _p.get('SESSION_ID')   || 'PREVIEW';
// Modality is fixed: this is a single-modality (categorical) study, so it is
// hard-coded rather than read from the URL.
const modality    = 'categorical';
// Latin-Square order: 1–4. Assigned round-robin via a Firestore counter in
// init() (assignBalancedOrder) so the 4 orders fill evenly even at small N.
// This is a fallback value only — used before the assignment resolves and if
// Firestore is unreachable. Not read from the URL, so it can't be overridden.
let order         = String(deriveOrder(prolificPid));

// localStorage key for reload-resume (scoped to this participant)
const PROGRESS_KEY = `study_progress_${prolificPid}`;

const sessionData = {
    prolificPid,
    studyId,
    sessionId,
    modality,
    order,
    startTime: Date.now(),
};

// ── Encoding defaults (used when a task omits "encodings") ───
// Each key matches a task's "condition" value.
// The values list every encoding that is ON by default for that condition.
// "baseline" encoding = edge-hover tooltip (works with any condition).
const DEFAULT_ENCODINGS = {
    baseline:    ['baseline'],
    categorical: ['color', 'dashing'],
    numerical:   ['color', 'thickness'],
    directional: ['gradient', 'taper', 'arrows'],
};

// Return the active encoding list for a task.
// Falls back to DEFAULT_ENCODINGS if the task has no "encodings" field.
function getEncodings(task) {
    return task.encodings || DEFAULT_ENCODINGS[task.condition] || [];
}

// Return the edge-tooltip fields for the current task.
// Checks task.tooltipFields first so any task can override the default.
// Falls back to condition-derived defaults so tasks.json stays lean:
//   directional  → ['route']               (only source → target header)
//   categorical  → ['route', 'country']
//   numerical    → ['route', 'distance']
//   baseline     → ['all']
function getTooltipFields(task) {
    if (task.tooltipFields) return task.tooltipFields;
    switch (task.condition) {
        case 'directional':  return ['route'];
        case 'categorical':  return ['route', 'country'];
        case 'numerical':    return ['route', 'distance'];
        default:             return ['all'];
    }
}

// ── Mutable state ─────────────────────────────────────────────

let tasks            = [];
let currentTaskIndex = 0;
let taskStartTime    = null;
let selectedAnswer   = null;    // IATA string or MC option text (single-select tasks)
let selectedAnswers  = [];      // IATA array for select-nodes tasks
let selectedConfidence = null;  // 1–5 confidence rating for the current task
let activeCondition  = null;    // condition currently rendered on the canvas
let activeEncodings  = null;    // serialised encoding list for change-detection
let activeFilter     = null;    // serialised filter spec for change-detection

// ── Firebase initialisation ───────────────────────────────────
const firebaseConfig = {
    apiKey:            'AIzaSyBZxE7j3daMk405fI-HxfaGDCvZS2V-wyU',
    authDomain:        'edge-encoding-study.firebaseapp.com',
    projectId:         'edge-encoding-study',
    storageBucket:     'edge-encoding-study.firebasestorage.app',
    messagingSenderId: '382157431323',
    appId:             '1:382157431323:web:ddd6f62e9344f99bc10ebe',
};
const _firebaseApp = initializeApp(firebaseConfig);
const db           = getFirestore(_firebaseApp);

// ── Logging ───────────────────────────────────────────────────
// Schrijft elk event naar Firestore onder sessions/{prolificPid}/events.

// Mislukte writes gaan naar console.warn — de studie gaat door.
async function logEvent(eventName, data) {
    const payload = {
        event:      eventName,
        prolificPid,
        studyId,
        sessionId,
        order,
        ...data,
        serverTime: new Date().toISOString(),
    };
    console.log('[STUDY]', eventName, payload);   // altijd zichtbaar in DevTools

    try {
        await addDoc(collection(db, 'sessions', prolificPid, 'events'), payload);
    } catch (err) {
        console.warn('[STUDY] Firestore write failed:', err);
    }
}

// ── Balanced (round-robin) Latin-square order assignment ──────
// A PID hash (deriveOrder) is uniform only in the limit; at N≈26 it skews the
// 4 orders badly (e.g. 9/2/8/7). Instead we hand out orders sequentially via a
// Firestore counter inside a transaction, so the orders fill evenly:
//   participant 1 → order 1, 2 → 2, 3 → 3, 4 → 4, 5 → 1, …
// The assignment is stored at assignments/{pid}, so a reload reuses it without
// advancing the counter. PREVIEW/testing and any Firestore error fall back to
// the PID hash so the study always runs (then it just isn't perfectly balanced).
async function assignBalancedOrder() {
    if (prolificPid === 'PREVIEW') return String(deriveOrder(prolificPid));

    const partRef    = doc(db, 'assignments', prolificPid);
    const counterRef = doc(db, 'assignments', '_counter');
    try {
        return await runTransaction(db, async tx => {
            const partSnap = await tx.get(partRef);
            if (partSnap.exists() && partSnap.data().order) {
                return String(partSnap.data().order);   // already assigned → stable
            }
            const counterSnap = await tx.get(counterRef);
            const count    = counterSnap.exists() ? (counterSnap.data().count || 0) : 0;
            const assigned = (count % 4) + 1;
            tx.set(counterRef, { count: count + 1 }, { merge: true });
            tx.set(partRef, {
                order:      assigned,
                prolificPid,
                assignedAt: new Date().toISOString(),
            });
            return String(assigned);
        });
    } catch (err) {
        console.warn('[STUDY] Order assignment failed — falling back to PID hash:', err);
        return String(deriveOrder(prolificPid));
    }
}

// ── Wait for main.js to populate appState.graph ───────────────
// main.js loads sampled_data.json asynchronously; we poll via
// requestAnimationFrame so we don't block the browser.
function waitForGraph() {
    return new Promise(resolve => {
        // setTimeout (not requestAnimationFrame) so init still completes if the
        // tab is backgrounded during load — rAF is paused in hidden tabs.
        const poll = () => (appState.graph ? resolve() : setTimeout(poll, 50));
        poll();
    });
}

// ============================================================
//  Main async initialiser
// ============================================================
async function init() {
    // Assign the balanced order BEFORE logging or building tasks, so every event
    // (incl. page_load) and the task sequence use the final assigned value.
    order = await assignBalancedOrder();
    sessionData.order = order;

    logEvent('page_load', {
        prolificPid: sessionData.prolificPid,
        modality:    sessionData.modality,  // between-subjects modality
        order:       sessionData.order,     // Latin-Square order (1–4)
        timestamp:   new Date().toISOString(),
    });

    // Load all tasks and wait for the graph in parallel
    const [tasksData] = await Promise.all([
        fetch('data/tasks.json').then(r => r.json()),
        waitForGraph(),
    ]);

    // Build 16-task list from the new conditions/latinSquare structure.
    // For each SV in the Latin Square order, add the 4 tasks in sequence TE1→TS4→TB1→TA2.
    // Falls back to the SV0→SV3 sequence if `order` somehow isn't a valid key.
    const svSequence = tasksData.latinSquare?.[order] ?? ['SV0','SV1','SV2','SV3'];
    tasks = svSequence.flatMap(sv => {
        const svData = tasksData.conditions?.[modality]?.[sv];
        if (!svData) return [];
        return ['TE1','TS4','TB1','TA2'].map(type => ({
            ...svData.tasks[type],
            encodings: svData.tasks[type].encodings ?? svData.encodings,
            sv,
            modality,
        }));
    });

    // ── Save original graph once so filters always start from full data ──
    appState._baseGraph = appState.graph;

    // ── Clear whatever main.js rendered ───────────────────────
    if (appState.sim) appState.sim.stop();
    svg.selectAll('*').remove();

    // ── Wire up node-selection events from nl-builder.js ─────
    document.addEventListener('study:nodeSelected', onNodeSelected);

    // ── Start task flow (showTask handles first build) ────────
    if (tasks.length > 0) {
        // Reload-resume: pick up where the participant left off if they refreshed.
        let resumeAt = 0;
        try {
            const saved = parseInt(localStorage.getItem(PROGRESS_KEY), 10);
            if (Number.isInteger(saved) && saved > 0 && saved < tasks.length) resumeAt = saved;
        } catch (_) {}
        showTask(resumeAt);
    } else {
        document.getElementById('task-description').textContent =
            'No tasks found in tasks.json.';
    }
}

// ============================================================
//  Edge encoding dispatcher
// ============================================================
// encodings is an array of string keys, e.g. ['color', 'dashing'].
// Only the listed encodings are applied; the rest are skipped.
// thresholds is an optional array of { value, direction, label } objects from
// the task definition.  Only the numerical legend uses them; other conditions
// ignore the parameter safely.
// tooltipFields controls which attributes appear in edge-hover tooltips when
// "baseline" is in encodings.  Derived by getTooltipFields(task) from the task's
// condition (or overridden per-task via task.tooltipFields in tasks.json).
function applyConditionEncoding(cond, encodings, thresholds = [], tooltipFields = ['all']) {
    const active = new Set(encodings);

    // SV0 (tooltip-only): the hover tooltip is the ONLY active channel — no
    // colour/dashing/thickness/gradient/taper/arrows. task.condition is always
    // the modality (categorical/numerical/directional), never 'baseline', so we
    // detect this from the encodings instead. Show a hover hint rather than the
    // empty (or misleading "Route Distance"/"Flight Direction") legend the
    // per-modality renderers would otherwise produce with no visual channel.
    const VISUAL_CHANNELS = ['color', 'dashing', 'thickness', 'gradient', 'taper', 'arrows'];
    const isTooltipOnly   = active.has('baseline') && !VISUAL_CHANNELS.some(c => active.has(c));

    if (isTooltipOnly) {
        document.getElementById('study-legend').innerHTML =
            '<p class="panel-label" style="margin-bottom:6px;">Route Information</p>' +
            '<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#333;">' +
              '<svg width="40" height="14" style="flex-shrink:0">' +
                '<line x1="2" y1="7" x2="38" y2="7" stroke="#999" stroke-width="2.5"/>' +
              '</svg>' +
              '<span>Hover over a route to show its information.</span>' +
            '</div>';

    } else if (cond === 'categorical') {
        if (active.has('color'))   applyCategoricalColouring(datasetSpec.categoricalVar);
        if (active.has('dashing')) applyCategoricalDashing(datasetSpec.categoricalVar);
        renderCategoricalLegend(encodings);
        // Snapshot colour/dash mappings as they appear (accumulate, never clear)
        // so the end-of-study rating samples have them even after a later
        // dashing-only block resets the live colour map.
        Object.assign(ratingEncSnapshot.color, categoricalColorMap);
        Object.assign(ratingEncSnapshot.dash,  categoricalDashMap);

    } else if (cond === 'numerical') {
        if (active.has('color'))     applyNumericalColouring();
        if (active.has('thickness')) applyNumericalThickness();
        renderNumericalLegend(encodings, thresholds);

    } else if (cond === 'directional') {
        if (active.has('gradient')) applyDirectionalGradient();
        if (active.has('taper'))    applyDirectionalTaper();
        if (active.has('arrows'))   applyDirectionalArrows();
        renderDirectionalLegend(encodings);
    }

    // ── Cross-cutting: "baseline" encoding adds edge-hover tooltips ──────────
    // Works alongside any condition — just include "baseline" in the encodings
    // array for the task.  Distinct from the "baseline" condition (SV0), which
    // controls which visual encoding is applied to the edges.
    if (active.has('baseline')) applyEdgeTooltip(tooltipFields);
}

// ── Dataset filter ────────────────────────────────────────────
// Returns either the original graph or a filtered copy, depending on the
// filter spec attached to the task.  The original graph is never mutated.
//
// Supported filter types:
//
//   { "type": "deduplicate" }
//     Reduces a dense bidirectional multigraph to at most one edge per
//     unordered node pair (keeps the first edge encountered per pair in
//     graphology insertion order, which preserves that edge's source/target
//     direction in the visualisation).  Reduces 1 227 → 205 edges for the
//     default dataset, making directional encodings unambiguous.
//
function applyTaskFilter(graph, filter) {
    if (!filter) return graph;

    if (filter.type === 'deduplicate') {
        const g = graph.copy();
        const seen      = new Set();
        const toRemove  = [];

        g.forEachEdge((key, _attrs, source, target) => {
            // Canonical pair key — smaller string ID first so A→B and B→A
            // map to the same entry regardless of iteration direction.
            const pair = source < target
                ? `${source}|${target}`
                : `${target}|${source}`;

            if (seen.has(pair)) {
                toRemove.push(key);   // duplicate direction or parallel edge
            } else {
                seen.add(pair);       // first occurrence: keep it
            }
        });

        toRemove.forEach(k => g.dropEdge(k));
        return g;
    }

    // Unknown filter type — fall back to full graph
    console.warn('[study] Unknown filter type:', filter.type);
    return graph;
}

// Study-specific layout constants (override the defaults from main.js / force-layout.js)
const STUDY_NODE_R       = 20;   // visual radius; main.js nodeSize = 10
const STUDY_CHARGE       = -250; // stronger repulsion → better spread
const STUDY_LINK_DIST    = 70;   // longer edges → nodes further apart

// ── Tear down the canvas and rebuild for a specific task ─────
function rebuildForTask(task) {
    const encodings = getEncodings(task);

    // Apply dataset filter (always derived from the saved original graph so
    // successive tasks don't chain-filter an already-filtered graph).
    appState.graph = applyTaskFilter(appState._baseGraph, task.filter ?? null);

    if (appState.sim) appState.sim.stop();
    svg.selectAll('*').remove();

    const { nodes, links } = buildNodeLinkOnly();

    // ── Randomise initial node positions ─────────────────────────────────────
    // nl-builder.js initialises every node at (x:0, y:0).  D3's force
    // simulation is fully deterministic given the same starting state, so
    // every rebuild would produce an identical layout.  Scattering nodes to
    // random positions inside the canvas before the simulation starts ensures
    // each task gets a genuinely different layout.
    // Set r BEFORE applyForceLayout so the tick-handler clamps to the right radius
    const PAD = STUDY_NODE_R * 3;
    nodes.forEach(node => {
        node.r  = STUDY_NODE_R;
        node.x  = PAD + Math.random() * (width  - 2 * PAD);
        node.y  = PAD + Math.random() * (height - 2 * PAD);
        node.vx = 0;
        node.vy = 0;
    });

    applyForceLayout(nodes, links);

    appState.studyNodeR = STUDY_NODE_R;
    svg.selectAll('.node')
        .attr('r', STUDY_NODE_R)
        .on('mouseover', null)
        .on('mousemove', null)
        .on('mouseleave', null);

    // Update the running collision force so nodes don't overlap
    if (appState.sim) {
        appState.sim.force('collide').radius(d => d.r * 3);
        appState.sim.on('end.studyFreeze', () => {
            svg.selectAll('.node').each(d => { d.fx = d.x; d.fy = d.y; });
            if (appState.sim) appState.sim.on('end.studyFreeze', null);
        });
    }

    applyConditionEncoding(task.condition, encodings, task.thresholds ?? [], getTooltipFields(task));

    // ── Pre-highlight candidate groups for TS4 tasks ─────────────────────────
    // Rings are added now and kept in sync via the simulation tick handler, so
    // they track node positions while the force layout is still settling.
    if (task.candidateGroups) {
        renderCandidateGroups(task.candidateGroups);
    }

    setSimulationState({
        alphaTarget:    0.01,
        velocityDecay:  0.4,
        chargeStrength: STUDY_CHARGE,
        linkDistance:   STUDY_LINK_DIST,
    });
    setTimeout(() => { if (appState.sim) appState.sim.alphaTarget(0); }, 3000);
}

// ── Find the SVG <circle> element for a given graphology node id ─────────────
function findNodeElement(nodeId) {
    let found = null;
    svg.selectAll('.node').each(function (d) {
        if (d.id === nodeId) found = this;
    });
    return found;
}

// ── Pre-highlight the named starting airport ──────────────────────────────────
// Uses class .node--start (defined in study.html) so the highlight survives
// single-clicks — nl-builder's clearAllHighlights() only removes .node--highlighted.
function highlightStartNode(iata) {
    if (!iata) return;
    // d spreads graph.getNodeAttributes(), so d.IATA is the airport code
    svg.selectAll('.node').each(function (d) {
        if (d.IATA === iata) this.classList.add('node--start');
    });
}

function capitalise(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================
//  Candidate-group highlighting (TS4 tasks)
// ============================================================
const CAND_CLASSES = ['node--cand-a', 'node--cand-b', 'node--cand-c'];

// Remove group colours from nodes and hide the panel legend.
function clearCandidateGroups() {
    svg.selectAll('.node--cand-a, .node--cand-b, .node--cand-c').each(function () {
        this.classList.remove('node--cand-a', 'node--cand-b', 'node--cand-c');
    });
    const panelEl = document.getElementById('candidate-group-legend');
    if (panelEl) { panelEl.innerHTML = ''; panelEl.style.display = 'none'; }
}

// Colour the candidate airport nodes (blue / red / green) so the three groups
// are visible on the graph. The left-panel "Candidate Groups" legend is
// intentionally omitted: the task text already says "three groups are
// highlighted" and never refers to them by name, so the swatches were just
// clutter. The node fill is set via CSS class — no SVG overlays.
function renderCandidateGroups(groups) {
    clearCandidateGroups();
    if (!groups || !groups.length) return;

    groups.forEach((group, gi) => {
        svg.selectAll('.node').each(function (d) {
            if (d.IATA && group.includes(d.IATA)) {
                this.classList.add(CAND_CLASSES[gi]);
            }
        });
    });
}

// ============================================================
//  Task flow
// ============================================================
function showTask(index) {
    currentTaskIndex = index;
    taskStartTime    = Date.now();
    selectedAnswer   = null;
    selectedAnswers  = [];
    selectedConfidence = null;

    // Persist progress so a browser refresh resumes on this task (see init()).
    try { localStorage.setItem(PROGRESS_KEY, String(index)); } catch (_) {}

    const task          = tasks[index];
    const taskEncodings = getEncodings(task);
    // Serialise for cheap comparison (order-insensitive)
    const encodingKey   = [...taskEncodings].sort().join(',');
    const filterKey     = JSON.stringify(task.filter ?? null);

    // ── Always clear candidate group rings before rendering the new task ───────
    clearCandidateGroups();

    // ── Rebuild when condition, encodings, OR filter changes ────
    // (also fires on the very first call, when all three are null)
    if (task.condition !== activeCondition ||
        encodingKey    !== activeEncodings ||
        filterKey      !== activeFilter) {
        activeCondition = task.condition;
        activeEncodings = encodingKey;
        activeFilter    = filterKey;
        rebuildForTask(task);   // includes applyConditionEncoding + candidate rings
    } else {
        // Same visualization (condition/encodings/filter unchanged) — no force-layout
        // rebuild needed, but we still re-render the legend because individual tasks
        // within the same SV block can have different thresholds
        // (e.g. TB1 shows "> 4000 km" while TE1 shows nothing).
        applyConditionEncoding(
            task.condition,
            getEncodings(task),
            task.thresholds ?? [],
            getTooltipFields(task),
        );
        // No simulation running for same-SV tasks — add candidate rings immediately.
        if (task.candidateGroups) {
            renderCandidateGroups(task.candidateGroups);
        }
    }

    renderTaskDescription(task);
    renderAnswerArea(task);
    renderProgressBar(index);

    // Clear all highlight classes left by the previous task
    svg.classed('has-highlight', false);
    document.querySelectorAll(
        '.node--highlighted, .node--start, .node--answer-selected, .edge--highlighted, .neighbor--highlighted'
    ).forEach(el => el.classList.remove(
        'node--highlighted', 'node--start', 'node--answer-selected',
        'edge--highlighted', 'neighbor--highlighted',
    ));

    // Pre-highlight the named starting airport so participants don't have to search for it
    if (task.startNode) highlightStartNode(task.startNode);

    logEvent('task_start', {
        taskId:          task.id,
        taskDescription: task.description,
        condition:       task.condition,
        timestamp:       new Date().toISOString(),
    });
}

// ── Render task description with colour-highlighted keywords ──
function renderTaskDescription(task) {
    // Escape first so we can safely inject <span> tags
    let html = escapeHtml(task.description);

    (task.colorKeywords || []).forEach(({ word, color }) => {
        const safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        html = html.replace(
            new RegExp(`(${safe})`, 'gi'),
            `<span style="color:${color};font-weight:600;">$1</span>`,
        );
    });

    document.getElementById('task-description').innerHTML = html;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Render answer area based on task type ─────────────────────
function renderAnswerArea(task) {
    const area = document.getElementById('answer-area');
    area.innerHTML = '';

    if (task.answerType === 'select-node') {
        // Show selected-node label; Submit gated by updateSubmitState().
        const display      = document.createElement('p');
        display.id         = 'selected-node-display';
        display.textContent = 'Selected: —';
        area.appendChild(display);

    } else if (task.answerType === 'select-nodes') {
        // Multi-node selection: participant double-clicks N airports.
        const required = task.requiredSelections ?? task.correctAnswers?.length ?? 2;

        const display      = document.createElement('p');
        display.id         = 'selected-nodes-display';
        display.textContent = 'Selected: —';

        const hint          = document.createElement('p');
        hint.className      = 'text-muted';
        hint.style.fontSize = '12px';
        hint.style.margin   = '0 0 8px';
        hint.textContent    =
            `Double-click ${required} airport${required !== 1 ? 's' : ''} to answer. ` +
            `Click again to deselect.`;

        area.appendChild(display);
        area.appendChild(hint);

    } else if (task.answerType === 'multiple-choice') {
        // Radio buttons; selecting one sets the answer and re-checks Submit.
        const form = document.createElement('form');
        form.id    = 'mc-form';

        (task.options || []).forEach((opt, i) => {
            const wrapper      = document.createElement('div');
            wrapper.className  = 'form-check';

            const input       = document.createElement('input');
            input.type        = 'radio';
            input.name        = 'mc-answer';
            input.id          = `mc-opt-${i}`;
            input.value       = opt;
            input.className   = 'form-check-input';
            input.addEventListener('change', () => {
                selectedAnswer = opt;
                updateSubmitState();
            });

            const lbl       = document.createElement('label');
            lbl.htmlFor     = `mc-opt-${i}`;
            lbl.textContent = opt;
            lbl.className   = 'form-check-label';

            wrapper.appendChild(input);
            wrapper.appendChild(lbl);
            form.appendChild(wrapper);
        });

        area.appendChild(form);
    }

    // ── Confidence rating (required for every task) ──────────────────────────
    area.appendChild(buildConfidenceBlock(value => {
        selectedConfidence = value;
        updateSubmitState();
    }));

    // ── Single Submit button, gated on BOTH a valid answer and confidence ────
    const btn       = document.createElement('button');
    btn.id          = 'submit-btn';
    btn.type        = 'button';
    btn.textContent = 'Submit';
    btn.disabled    = true;
    btn.className   = 'btn btn-primary w-100 mt-3';
    btn.addEventListener('click', submitAnswer);
    area.appendChild(btn);

    updateSubmitState();
}

// True once the participant has given a complete answer for this task.
function hasValidAnswer(task) {
    if (task.answerType === 'select-nodes') {
        const required = task.requiredSelections ?? task.correctAnswers?.length ?? 2;
        return selectedAnswers.length >= required;
    }
    return selectedAnswer != null;
}

// Enable Submit only when there's a valid answer AND a confidence rating.
function updateSubmitState() {
    const task = tasks[currentTaskIndex];
    const btn  = document.getElementById('submit-btn');
    if (!btn || !task) return;
    if (task.answerType === 'select-nodes') {
        const required = task.requiredSelections ?? task.correctAnswers?.length ?? 2;
        btn.textContent = `Submit (${selectedAnswers.length} / ${required})`;
    }
    // Reveal the confidence question only once a valid answer exists, so it
    // doesn't distract from the task itself; collapse again if the answer is
    // cleared (e.g. a node is deselected back below the required count).
    const valid = hasValidAnswer(task);
    setConfidenceVisible(valid);
    btn.disabled = !(valid && selectedConfidence != null);
}

// ── Progress bar: one coloured segment per task ───────────────
// done = green, current = orange, pending = grey
function renderProgressBar(currentIndex) {
    const bar = document.getElementById('study-progress-bar');
    bar.innerHTML = '';

    tasks.forEach((_, i) => {
        const seg = document.createElement('div');
        seg.className = 'progress-step';
        if      (i < currentIndex)  seg.classList.add('progress-step--done');
        else if (i === currentIndex) seg.classList.add('progress-step--current');
        bar.appendChild(seg);
    });

    // "Task 2 of 16 · Categorical"
    // All tasks in a session share one modality, so we use the session-level modality
    // variable rather than task.condition (which is always the same across the session).
    document.getElementById('task-progress').textContent =
        `Task ${currentIndex + 1} of ${tasks.length} · ${capitalise(modality)}`;
}

// ============================================================
//  Event handlers
// ============================================================

// Fired by nl-builder.js on double-click
function onNodeSelected(event) {
    const { nodeId, label } = event.detail;
    const task = tasks[currentTaskIndex];
    if (!task) return;

    // ── Multiple-choice: node double-clicks have no effect ───────────────────
    // The answer is selected via radio buttons; clicking nodes must not
    // accidentally enable the Submit button.
    if (task.answerType === 'multiple-choice') return;

    // ── select-nodes: toggle node in / out of the selection set ─────────────
    if (task.answerType === 'select-nodes') {
        const required = task.requiredSelections ?? task.correctAnswers?.length ?? 2;
        const idx      = selectedAnswers.indexOf(label);
        const nodeEl   = findNodeElement(nodeId);

        if (idx >= 0) {
            // Already in the set — remove it
            selectedAnswers.splice(idx, 1);
            if (nodeEl) nodeEl.classList.remove('node--answer-selected');
        } else if (selectedAnswers.length < required) {
            // Still room — add it
            selectedAnswers.push(label);
            if (nodeEl) nodeEl.classList.add('node--answer-selected');
        }
        // At capacity: silently ignore extra clicks (user must deselect first)

        const display = document.getElementById('selected-nodes-display');
        if (display) {
            display.textContent = selectedAnswers.length > 0
                ? `Selected: ${selectedAnswers.join(', ')}`
                : 'Selected: —';
        }
        updateSubmitState();

        logEvent('node_highlighted', {
            taskId:           task.id,
            nodeId,
            nodeLabel:        label,
            action:           idx >= 0 ? 'deselected' : 'selected',
            currentSelection: [...selectedAnswers],
            timestamp:        new Date().toISOString(),
        });
        return;
    }

    // ── select-node (default): single selection ──────────────────────────────
    selectedAnswer = label;

    logEvent('node_highlighted', {
        taskId:    task.id,
        nodeId,
        nodeLabel: label,
        timestamp: new Date().toISOString(),
    });

    const display = document.getElementById('selected-node-display');
    if (display) display.textContent = `Selected: ${label}`;

    updateSubmitState();
}

function submitAnswer() {
    const task           = tasks[currentTaskIndex];
    const responseTimeMs = Date.now() - taskStartTime;

    // Support both a single string ("correctAnswer") and an array
    // ("correctAnswers") so old and new task definitions both work.
    const correctSet = Array.isArray(task.correctAnswers)
        ? task.correctAnswers
        : [task.correctAnswer];

    // select-nodes: every chosen airport must appear in the correct set
    let submittedAnswer;
    let isCorrect;
    if (task.postHocCheck) {
        // TS4 / structure tasks have no ground-truth correctAnswers — grade
        // these manually in the post-processing script.  Log null so the
        // Python analysis can distinguish "not yet graded" from wrong (false).
        submittedAnswer = task.answerType === 'select-nodes'
            ? [...selectedAnswers]
            : selectedAnswer;
        isCorrect = null;
    } else if (task.answerType === 'select-nodes') {
        submittedAnswer = [...selectedAnswers];
        isCorrect = selectedAnswers.length > 0
            && selectedAnswers.every(a => correctSet.includes(a));
    } else {
        submittedAnswer = selectedAnswer;
        isCorrect = correctSet.includes(selectedAnswer);
    }

    logEvent('answer_submitted', {
        taskId:         task.id,
        answerType:     task.answerType,
        selectedAnswer: submittedAnswer,
        isCorrect,
        confidence:     selectedConfidence,   // 1–5 Likert
        responseTimeMs,
    });

    const nextIndex = currentTaskIndex + 1;

    if (nextIndex < tasks.length) {
        showTask(nextIndex);
    } else {
        // All tasks done → ask the participant to rate the 4 encodings, then finish.
        showConditionRatings();
    }
}

// Resolve when `p` settles OR after `ms`, whichever comes first, so a hung
// Firestore write can never strand the participant on the page — they still get
// their Prolific redirect. logEvent swallows its own errors, so this only guards
// against a write that never resolves at all.
function withTimeout(p, ms) {
    return Promise.race([p, new Promise(res => setTimeout(res, ms))]);
}

// Log completion and hand back to Prolific (called after the condition ratings).
// AWAITS the study_complete write (bounded) BEFORE navigating: the redirect used
// to fire while this write was still in flight, so page-unload aborted it and the
// timestamp was lost for ~1 in 9 completers.
async function completeStudy() {
    await withTimeout(logEvent('study_complete', {
        totalTimeMs:    Date.now() - sessionData.startTime,
        tasksCompleted: tasks.length,
        timestamp:      new Date().toISOString(),
    }), 8000);
    // Clear the resume marker so a later reload won't re-enter the study.
    try { localStorage.removeItem(PROGRESS_KEY); } catch (_) {}

    // Guard against the unset placeholder so we never navigate to a dead URL.
    if (!COMPLETION_URL || COMPLETION_URL === 'REPLACE_WITH_PROLIFIC_URL') {
        console.warn('[STUDY] COMPLETION_URL not set — staying on page.');
        document.body.innerHTML =
            '<div style="max-width:560px;margin:80px auto;font:16px/1.6 system-ui;text-align:center;">' +
            '<h2>Thank you!</h2><p>The study is complete. ' +
            '(Completion redirect is not configured yet.)</p></div>';
    } else {
        window.location.href = COMPLETION_URL;
    }
}

// ============================================================
//  End-of-study condition ratings
// ============================================================
// One scrollable page: each of the 4 encodings (SV0–SV3) shown with a visual
// example + two 5-point Likert questions (readability, preference). Participants
// never saw the "SV" labels, so the visual sample is what identifies each style.

// Accumulated colour/dash mappings captured during the study (see
// applyConditionEncoding). Survives later dashing-only blocks that reset the
// live categoricalColorMap, so the rating samples always have real values.
const ratingEncSnapshot = { color: {}, dash: {} };

// Up to 3 real airline countries from the captured mappings, so the rating
// samples use the EXACT colours/dash patterns participants saw.
function ratingSampleCountries() {
    const all = Object.keys(ratingEncSnapshot.color).length
        ? Object.keys(ratingEncSnapshot.color)
        : Object.keys(ratingEncSnapshot.dash);
    const preferred = all.filter(c => c !== 'Other');
    const pick = (preferred.length >= 3 ? preferred : all).slice(0, 3);
    return pick.length ? pick : ['France', 'China', 'United States'];
}

// One labelled mini sample edge styled by the active channel(s).
function ratingSampleEdge(country, useColor, useDash) {
    const color = useColor ? (ratingEncSnapshot.color[country] || '#555555') : '#555555';
    const dash  = useDash  ? (ratingEncSnapshot.dash[country]  || 'none')     : 'none';
    // 'butt' caps for dashed lines so the gaps stay visible (round caps fill
    // the small gaps and make all the patterns look solid).
    const cap   = (dash && dash !== 'none') ? 'butt' : 'round';
    return `<span class="rate-eg">
       <svg width="88" height="12" viewBox="0 0 88 12" xmlns="http://www.w3.org/2000/svg">
         <line x1="2" y1="6" x2="86" y2="6" stroke="${color}" stroke-width="4"
               stroke-dasharray="${dash}" stroke-linecap="${cap}"/>
       </svg><span class="rate-eg-lbl">${country}</span></span>`;
}

// Sample block per style: tooltip-only shows a neutral edge + a mock tooltip of
// what hovering reveals; the others show the 3 country samples in the channel(s).
function ratingSampleBlock(useColor, useDash, tooltipOnly) {
    if (tooltipOnly) {
        return `<span class="rate-eg">
           <svg width="88" height="12" viewBox="0 0 88 12" xmlns="http://www.w3.org/2000/svg">
             <line x1="2" y1="6" x2="86" y2="6" stroke="#999" stroke-width="4" stroke-linecap="round"/>
           </svg><span class="rate-eg-lbl">hover →</span></span>
           <span class="rate-tooltip-mock">
             <span class="ttl-route">DLA – SSG</span>
             <span class="ttl-country">Country: France</span>
           </span>`;
    }
    return ratingSampleCountries().map(c => ratingSampleEdge(c, useColor, useDash)).join('');
}

function ratingConditions() {
    return [
        { sv: 'SV0', label: 'Style A', desc: 'No colour or pattern, hover an edge to read it.',
          samples: ratingSampleBlock(false, false, true) },
        { sv: 'SV1', label: 'Style B', desc: 'Colour shows the airline country.',
          samples: ratingSampleBlock(true, false, false) },
        { sv: 'SV2', label: 'Style C', desc: 'Dash pattern shows the airline country.',
          samples: ratingSampleBlock(false, true, false) },
        { sv: 'SV3', label: 'Style D', desc: 'Colour + dash show the airline country.',
          samples: ratingSampleBlock(true, true, false) },
    ];
}

const RATING_ASPECTS = [
    { key: 'readability', q: 'Easy to read the routes?',     lo: 'Very hard', hi: 'Very easy' },
    { key: 'preference',  q: 'Pleasant to work with?',       lo: 'Not at all', hi: 'Very pleasant' },
];

function showConditionRatings() {
    const conditions = ratingConditions();
    // ratings[sv][aspect] = 1–5
    const ratings = {};
    conditions.forEach(c => { ratings[c.sv] = { readability: null, preference: null }; });
    const totalNeeded = conditions.length * RATING_ASPECTS.length;

    const overlay = document.createElement('div');
    overlay.id = 'ratings-overlay';

    const ratingRow = (sv, aspect) =>
        `<div class="rate-row">
           <span class="rate-q">${aspect.q}</span>
           <span class="rate-lo">${aspect.lo}</span>
           <span class="rate-scale" data-sv="${sv}" data-aspect="${aspect.key}">
             ${[1,2,3,4,5].map(n => `<button type="button" class="rate-btn" data-value="${n}">${n}</button>`).join('')}
           </span>
           <span class="rate-hi">${aspect.hi}</span>
         </div>`;

    const conditionBlock = c =>
        `<div class="rate-condition">
           <div class="rate-condition-head">
             <span class="rate-cname">${c.label}</span>
             <span class="rate-cdesc">${c.desc}</span>
           </div>
           <div class="rate-samples">${c.samples}</div>
           ${RATING_ASPECTS.map(a => ratingRow(c.sv, a)).join('')}
         </div>`;

    overlay.innerHTML =
        `<div class="ratings-card">
           <h2>Almost done, rate the visual styles</h2>
           <p>You saw flight routes drawn in four styles. The samples show the real
              colours / patterns you saw. Rate each style (all questions required).</p>
           ${conditions.map(conditionBlock).join('')}
           <button type="button" id="ratings-submit" class="btn btn-primary w-100" disabled>
             Finish</button>
         </div>`;

    document.body.appendChild(overlay);

    // Click handling via delegation
    overlay.addEventListener('click', e => {
        const btn = e.target.closest('.rate-btn');
        if (!btn) return;
        const scale  = btn.parentElement;
        const sv     = scale.dataset.sv;
        const aspect = scale.dataset.aspect;
        scale.querySelectorAll('.rate-btn').forEach(b => b.classList.remove('rate-btn--active'));
        btn.classList.add('rate-btn--active');
        ratings[sv][aspect] = Number(btn.dataset.value);

        const done = Object.values(ratings)
            .reduce((s, r) => s + (r.readability != null) + (r.preference != null), 0);
        document.getElementById('ratings-submit').disabled = done < totalNeeded;
    });

    document.getElementById('ratings-submit').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Saving…';   // anti double-click + feedback while writes flush
        // Await BOTH final writes before navigating. The redirect previously fired
        // while these were still in flight, so page-unload cancelled them and both
        // condition_ratings and study_complete were lost together.
        await withTimeout(logEvent('condition_ratings', { ratings, timestamp: new Date().toISOString() }), 8000);
        overlay.remove();
        await completeStudy();
    });
}

// ============================================================
//  Legend renderers
// ============================================================

// ── Categorical legend ────────────────────────────────────────
// Shows colour swatches, dash patterns, or both depending on
// which encodings are active for the current task.
function renderCategoricalLegend(encodings) {
    const el         = document.getElementById('study-legend');
    const categories = Object.keys(categoricalColorMap);
    if (!categories.length) { el.innerHTML = ''; return; }

    const showColor  = encodings.includes('color');
    const showDash   = encodings.includes('dashing');

    let html = '<p class="panel-label" style="margin-bottom:6px;">Airline Country of Origin</p>';
    html += '<ul class="study-legend-list">';

    categories.forEach(cat => {
        // No color → neutral grey; no dashing → solid line
        const color    = showColor ? (categoricalColorMap[cat] || '#999') : '#555';
        const dash     = showDash  ? (categoricalDashMap[cat]  || 'none') : 'none';
        const dashAttr = dash !== 'none' ? `stroke-dasharray="${dash}"` : '';

        html += `
          <li>
            <svg width="40" height="14" style="flex-shrink:0">
              <line x1="2" y1="7" x2="38" y2="7"
                    stroke="${color}" stroke-width="2.5" ${dashAttr}/>
            </svg>
            <span>${cat}</span>
          </li>`;
    });

    html += '</ul>';
    el.innerHTML = html;
}

// ── Numerical legend ──────────────────────────────────────────
// Shows the colour bar, the thickness scale, or both.
// When a task specifies thresholds (e.g. "longer than 4000 km"), the legend
// adds:
//   • a thin vertical tick line on the colour gradient at the exact position
//   • a red "> 4000 km" / "< 1000 km" label directly below the bar
//   • an example line in the thickness section drawn at the correct stroke width
//
// thresholds: array of { value: number, direction: 'gt'|'lt', label: string }
//   value     — distance in km (must fall within the scale domain)
//   direction — 'gt' renders ">", 'lt' renders "<" in the legend label
//   label     — human-readable text used for the thickness example label
function renderNumericalLegend(encodings, thresholds = []) {
    const el    = document.getElementById('study-legend');
    const scale = defineNumericalMapping();
    const [minVal, maxVal] = scale.domain();
    const midVal = Math.round((minVal + maxVal) / 2);

    const showColor     = encodings.includes('color');
    const showThickness = encodings.includes('thickness');
    const hasThresh     = thresholds.length > 0;

    // ── SVG height ────────────────────────────────────────────────────────────
    // colour section:    bar (12) + labels row (20)
    // thickness section: three lines + labels (30)
    // threshold section: always shown when hasThresh && any encoding active
    //                    4px gap + 22px per threshold entry
    const colorH     = showColor     ? 32 : 0;
    const thickBaseH = showThickness ? 30 : 0;
    const threshH    = hasThresh && (showColor || showThickness)
        ? (4 + thresholds.length * 22)
        : 0;
    const svgH    = colorH + thickBaseH + threshH;

    const colorY  = 0;
    const thickY  = colorH;

    // ── Helper: LINEAR normalised position on the x-axis [min, max] ──────────
    // The bar's x-axis is labelled linearly (min km … max km), so threshold
    // ticks sit at their linear fraction.  The COLOUR at each position is
    // determined by the log scale, which we represent faithfully with many stops.
    const norm = v => Math.max(0.01, Math.min(0.99, (v - minVal) / (maxVal - minVal)));

    // ── Multi-stop gradient that accurately reflects the log scale ────────────
    // d3.scaleSequentialLog is non-linear, so a 2-stop CSS gradient gives wrong
    // intermediate colours (e.g. 2000 km looks yellow in a 2-stop bar but the
    // scale actually maps it to medium blue).  32 stops make the bar match the
    // actual edge colours rendered by applyNumericalColouring().
    const N_STOPS = 32;
    let gradStops = '';
    for (let i = 0; i <= N_STOPS; i++) {
        const t     = i / N_STOPS;
        const value = minVal + t * (maxVal - minVal);   // linear in km along the bar
        gradStops  += `<stop offset="${(t * 100).toFixed(1)}%" stop-color="${scale(value)}"/>`;
    }

    let svgContent = `
      <defs>
        <linearGradient id="num-leg-grad" x1="0%" x2="100%">
          ${gradStops}
        </linearGradient>
      </defs>`;

    // ── Colour gradient section ───────────────────────────────────────────────
    if (showColor) {
        svgContent += `
        <rect x="0" y="${colorY}" width="280" height="12"
              fill="url(#num-leg-grad)" rx="2"/>`;

        // Threshold tick lines through the bar
        thresholds.forEach(th => {
            const x = norm(th.value) * 280;
            svgContent += `
        <line x1="${x.toFixed(1)}" y1="${colorY}"
              x2="${x.toFixed(1)}" y2="${colorY + 12}"
              stroke="rgba(255, 255, 255, 0.85)" stroke-width="1.5"/>`;
        });

        // Min / mid / max scale labels
        svgContent += `
        <text x="0"   y="${colorY + 26}" font-size="10" fill="#555">${Math.round(minVal).toLocaleString()} km</text>
        <text x="140" y="${colorY + 26}" font-size="10" fill="#555" text-anchor="middle">${midVal.toLocaleString()} km</text>
        <text x="280" y="${colorY + 26}" font-size="10" fill="#555" text-anchor="end">${Math.round(maxVal).toLocaleString()} km</text>`;

    }

    // ── Thickness section ─────────────────────────────────────────────────────
    // stroke-width values match strokeWidthScale.range([2, 8]) in numerical-edge.js
    if (showThickness) {
        svgContent += `
        <line x1="0"   y1="${thickY + 6}" x2="80"  y2="${thickY + 6}" stroke="#555" stroke-width="3"/>
        <line x1="100" y1="${thickY + 6}" x2="180" y2="${thickY + 6}" stroke="#555" stroke-width="6"/>
        <line x1="200" y1="${thickY + 6}" x2="280" y2="${thickY + 6}" stroke="#555" stroke-width="10"/>
        <text x="40"  y="${thickY + 20}" font-size="10" fill="#555" text-anchor="middle">short</text>
        <text x="140" y="${thickY + 20}" font-size="10" fill="#555" text-anchor="middle">medium</text>
        <text x="240" y="${thickY + 20}" font-size="10" fill="#555" text-anchor="middle">long</text>`;

    }

    // ── Threshold example lines ───────────────────────────────────────────────
    // Shown when there are thresholds AND at least one encoding is active.
    // color active    → stroke = scale(value)  so it matches actual edge colour
    // thickness active → stroke-width from range([2, 8])
    // Both together   → correct colour + correct width on the same line
    if (hasThresh && (showColor || showThickness)) {
        const exSectionY = colorH + thickBaseH + 4;   // 4px gap below last section
        thresholds.forEach((th, i) => {
            const sw     = showThickness
                ? (3 + norm(th.value) * 7).toFixed(1)
                : '3';
            const stroke = showColor ? scale(th.value) : '#333';
            const prefix = th.direction === 'gt' ? '>' : th.direction === 'lt' ? '<' : '|';
            const exY    = exSectionY + i * 22;
            svgContent += `
        <line x1="0" y1="${exY + 5}" x2="60" y2="${exY + 5}"
              stroke="${stroke}" stroke-width="${sw}"/>
        <text x="68" y="${exY + 9}" font-size="9" fill="#aa0000"
              font-weight="600">${prefix} ${th.value.toLocaleString()} km</text>`;
        });
    }

    el.innerHTML = `
      <p class="panel-label" style="margin-bottom:6px;">Route Distance (km)</p>
      <svg width="300" height="${svgH}" style="display:block">${svgContent}</svg>`;
}

// ── Directional legend ────────────────────────────────────────
// Shows only the rows that correspond to active encodings.
function renderDirectionalLegend(encodings) {
    const showGradient = encodings.includes('gradient');
    const showTaper    = encodings.includes('taper');
    const showArrows   = encodings.includes('arrows');

    const rowHeight = 28;
    const rows      = [showGradient, showTaper, showArrows].filter(Boolean).length;
    const svgHeight = rows * rowHeight;

    let y = 14;   // current y for each row's visual element
    // gradientUnits="userSpaceOnUse" with explicit x1/x2 avoids the zero-height
    // bounding-box problem that makes objectBoundingBox gradients invisible on
    // thin elements (lines).  A <rect> is used instead of <line> so that
    // fill-based gradients work reliably across all browsers.
    let svgContent = `
      <defs>
        <linearGradient id="dir-leg-grad" gradientUnits="userSpaceOnUse" x1="4" y1="0" x2="160" y2="0">
          <stop offset="0%"   stop-color="#2ca25f"/>
          <stop offset="100%" stop-color="#2166ac"/>
        </linearGradient>
      </defs>`;

    if (showGradient) {
        svgContent += `
        <rect x="4" y="${y - 3}" width="156" height="6" rx="2"
              fill="url(#dir-leg-grad)"/>
        <text x="168" y="${y + 4}" font-size="10" fill="#555">colour: source → target</text>`;
        y += rowHeight;
    }
    if (showTaper) {
        const b = y - 5, t = y + 3;
        svgContent += `
        <polygon points="4,${y} 160,${b} 160,${t}" fill="#444" opacity="0.75"/>
        <text x="168" y="${y + 2}" font-size="10" fill="#555">width: source → target</text>`;
        y += rowHeight;
    }
    if (showArrows) {
        svgContent += `
        <polygon points="160,${y} 145,${y - 5} 145,${y + 5}" fill="black" opacity="0.9"/>
        <line x1="4" y1="${y}" x2="155" y2="${y}" stroke="#555" stroke-width="1.5"/>
        <text x="168" y="${y + 4}" font-size="10" fill="#555">arrow: points to target</text>`;
        y += rowHeight;
    }

    document.getElementById('study-legend').innerHTML = `
      <p class="panel-label" style="margin-bottom:6px;">Flight Direction</p>
      <svg width="300" height="${svgHeight}" style="display:block">${svgContent}</svg>`;
}

// ============================================================
//  Boot
// ============================================================
init().catch(err => console.error('[STUDY] Initialisation error:', err));
