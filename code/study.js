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
const COMPLETION_URL = 'REPLACE_WITH_PROLIFIC_URL';

// ── Imports ──────────────────────────────────────────────────
import { appState, svg, datasetSpec } from './main.js';
import { buildNodeLinkOnly }          from './building/nl-builder.js';
import { applyForceLayout }           from './building/force-layout.js';
import { setSimulationState }         from './utils.js';

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
} from './multivariate/directional-edge.js';

// ── Synchronous setup (before main.js's fetch resolves) ──────
appState.visualizationMode = 'nodeLink';  // keeps buildEverything() in NL-only mode
svg.attr('id', 'study-svg');              // give the SVG the spec'd id

// ── URL parameters ────────────────────────────────────────────
const _p         = new URLSearchParams(window.location.search);
const prolificPid = _p.get('PROLIFIC_PID') || 'PREVIEW';
const studyId     = _p.get('STUDY_ID')     || 'PREVIEW';
const sessionId   = _p.get('SESSION_ID')   || 'PREVIEW';
const condition   = _p.get('condition')    || 'categorical';

const sessionData = {
    prolificPid,
    studyId,
    sessionId,
    condition,
    startTime: Date.now(),
};

// ── Mutable state ─────────────────────────────────────────────
let tasks            = [];
let currentTaskIndex = 0;
let taskStartTime    = null;
let selectedAnswer   = null;    // IATA string or MC option text
let activeCondition  = null;    // which encoding is currently applied to the canvas

// ── Logging ───────────────────────────────────────────────────
// All events go to console.log for now; Firebase writes are added later.
function logEvent(eventName, data) {
    console.log('[STUDY]', eventName, data);
}

// ── Wait for main.js to populate appState.graph ───────────────
// main.js loads sampled_data.json asynchronously; we poll via
// requestAnimationFrame so we don't block the browser.
function waitForGraph() {
    return new Promise(resolve => {
        const poll = () => (appState.graph ? resolve() : requestAnimationFrame(poll));
        requestAnimationFrame(poll);
    });
}

// ============================================================
//  Main async initialiser
// ============================================================
async function init() {
    logEvent('page_load', {
        prolificPid: sessionData.prolificPid,
        conditions:  'all',    // participant goes through every condition
        timestamp:   new Date().toISOString(),
    });

    // Load all tasks and wait for the graph in parallel
    const [tasksData] = await Promise.all([
        fetch('data/tasks.json').then(r => r.json()),
        waitForGraph(),
    ]);

    // All tasks in JSON order — no condition filter
    tasks = tasksData.tasks;

    // ── Clear whatever main.js rendered ───────────────────────
    if (appState.sim) appState.sim.stop();
    svg.selectAll('*').remove();

    // ── Wire up node-selection events from nl-builder.js ─────
    document.addEventListener('study:nodeSelected', onNodeSelected);

    // ── Start task flow (showTask handles first build) ────────
    if (tasks.length > 0) {
        showTask(0);
    } else {
        document.getElementById('task-description').textContent =
            'No tasks found in tasks.json.';
    }
}

// ============================================================
//  Edge encoding dispatcher
// ============================================================
function applyConditionEncoding(cond) {
    if (cond === 'categorical') {
        applyCategoricalColouring(datasetSpec.categoricalVar);
        applyCategoricalDashing(datasetSpec.categoricalVar);
        renderCategoricalLegend();

    } else if (cond === 'numerical') {
        applyNumericalColouring();
        applyNumericalThickness();
        renderNumericalLegend();

    } else if (cond === 'directional') {
        applyDirectionalGradient();
        applyDirectionalTaper();
        renderDirectionalLegend();
    }
}

// ── Tear down the canvas and rebuild with a new encoding ─────
function rebuildForCondition(cond) {
    if (appState.sim) appState.sim.stop();
    svg.selectAll('*').remove();

    const { nodes, links } = buildNodeLinkOnly();
    applyForceLayout(nodes, links);
    applyConditionEncoding(cond);

    setSimulationState({
        alphaTarget:    0.01,
        velocityDecay:  0.3,
        chargeStrength: -50,
        linkDistance:   30,
    });
    setTimeout(() => { if (appState.sim) appState.sim.alphaTarget(0); }, 1000);
}

function capitalise(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================
//  Task flow
// ============================================================
function showTask(index) {
    currentTaskIndex = index;
    taskStartTime    = Date.now();
    selectedAnswer   = null;

    const task = tasks[index];

    // ── Rebuild the visualisation when the condition changes ──
    // (also fires on the very first call, when activeCondition is null)
    if (task.condition !== activeCondition) {
        activeCondition = task.condition;
        rebuildForCondition(task.condition);
    }

    renderTaskDescription(task);
    renderAnswerArea(task);
    renderProgressBar(index);

    // Clear all highlight classes left by the previous task
    document.querySelectorAll('.node--highlighted, .edge--highlighted, .neighbor--highlighted')
        .forEach(el => el.classList.remove(
            'node--highlighted', 'edge--highlighted', 'neighbor--highlighted',
        ));

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
        // Show selected-node label + disabled Submit button.
        // Button is enabled when a node is double-clicked.
        const display      = document.createElement('p');
        display.id         = 'selected-node-display';
        display.textContent = 'Selected: —';

        const btn       = document.createElement('button');
        btn.id          = 'submit-btn';
        btn.textContent = 'Submit';
        btn.disabled    = true;
        btn.className   = 'btn btn-primary w-100 mt-2';
        btn.addEventListener('click', submitAnswer);

        area.appendChild(display);
        area.appendChild(btn);

    } else if (task.answerType === 'multiple-choice') {
        // Render radio buttons then a disabled Submit button.
        // Button is enabled when a radio is selected.
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
                const btn = document.getElementById('submit-btn');
                if (btn) btn.disabled = false;
            });

            const lbl       = document.createElement('label');
            lbl.htmlFor     = `mc-opt-${i}`;
            lbl.textContent = opt;
            lbl.className   = 'form-check-label';

            wrapper.appendChild(input);
            wrapper.appendChild(lbl);
            form.appendChild(wrapper);
        });

        const btn       = document.createElement('button');
        btn.id          = 'submit-btn';
        btn.type        = 'button';
        btn.textContent = 'Submit';
        btn.disabled    = true;
        btn.className   = 'btn btn-primary w-100 mt-3';
        btn.addEventListener('click', submitAnswer);

        area.appendChild(form);
        area.appendChild(btn);
    }
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

    // "Task 2 of 4 · Numerical"
    const task = tasks[currentIndex];
    document.getElementById('task-progress').textContent =
        `Task ${currentIndex + 1} of ${tasks.length} · ${capitalise(task.condition)}`;
}

// ============================================================
//  Event handlers
// ============================================================

// Fired by nl-builder.js on double-click
function onNodeSelected(event) {
    const { nodeId, label } = event.detail;
    selectedAnswer = label;

    logEvent('node_highlighted', {
        taskId:    tasks[currentTaskIndex]?.id,
        nodeId,
        nodeLabel: label,
        timestamp: new Date().toISOString(),
    });

    const display = document.getElementById('selected-node-display');
    if (display) display.textContent = `Selected: ${label}`;

    const btn = document.getElementById('submit-btn');
    if (btn) btn.disabled = false;
}

function submitAnswer() {
    const task           = tasks[currentTaskIndex];
    const responseTimeMs = Date.now() - taskStartTime;
    const isCorrect      = selectedAnswer === task.correctAnswer;

    logEvent('answer_submitted', {
        taskId:         task.id,
        answerType:     task.answerType,
        selectedAnswer,
        isCorrect,
        responseTimeMs,
    });

    const nextIndex = currentTaskIndex + 1;

    if (nextIndex < tasks.length) {
        showTask(nextIndex);
    } else {
        // All tasks done → log completion and redirect to Prolific
        logEvent('study_complete', {
            totalTimeMs:    Date.now() - sessionData.startTime,
            tasksCompleted: tasks.length,
            timestamp:      new Date().toISOString(),
        });
        window.location.href = COMPLETION_URL;
    }
}

// ============================================================
//  Legend renderers
// ============================================================

// Categorical: colour swatch + dash pattern per airline country
// categoricalColorMap and categoricalDashMap are live bindings
// populated by applyCategoricalColouring / applyCategoricalDashing.
function renderCategoricalLegend() {
    const el         = document.getElementById('study-legend');
    const categories = Object.keys(categoricalColorMap);
    if (!categories.length) { el.innerHTML = ''; return; }

    let html = '<p class="panel-label" style="margin-bottom:6px;">Airline Country of Origin</p>';
    html += '<ul class="study-legend-list">';

    categories.forEach(cat => {
        const color    = categoricalColorMap[cat] || '#999';
        const dash     = categoricalDashMap[cat]  || 'none';
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

// Numerical: colour gradient bar + three-step thickness scale
function renderNumericalLegend() {
    const el    = document.getElementById('study-legend');
    const scale = defineNumericalMapping();
    const [minVal, maxVal] = scale.domain();
    const midVal  = Math.round((minVal + maxVal) / 2);
    const colMin  = scale(minVal);
    const colMax  = scale(maxVal);

    el.innerHTML = `
      <p class="panel-label" style="margin-bottom:6px;">Route Distance (km)</p>
      <svg width="300" height="62" style="display:block">
        <defs>
          <linearGradient id="num-leg-grad" x1="0%" x2="100%">
            <stop offset="0%"   stop-color="${colMin}"/>
            <stop offset="100%" stop-color="${colMax}"/>
          </linearGradient>
        </defs>

        <!-- Colour bar -->
        <rect x="0" y="0" width="280" height="12"
              fill="url(#num-leg-grad)" rx="2"/>
        <text x="0"   y="26" font-size="10" fill="#555">${Math.round(minVal)} km</text>
        <text x="140" y="26" font-size="10" fill="#555" text-anchor="middle">${midVal} km</text>
        <text x="280" y="26" font-size="10" fill="#555" text-anchor="end">${Math.round(maxVal)} km</text>

        <!-- Thickness scale: thin / medium / thick sample lines -->
        <line x1="0"   y1="44" x2="80"  y2="44" stroke="#555" stroke-width="1"/>
        <line x1="100" y1="44" x2="180" y2="44" stroke="#555" stroke-width="3"/>
        <line x1="200" y1="44" x2="280" y2="44" stroke="#555" stroke-width="5"/>
        <text x="40"  y="58" font-size="10" fill="#555" text-anchor="middle">short</text>
        <text x="140" y="58" font-size="10" fill="#555" text-anchor="middle">medium</text>
        <text x="240" y="58" font-size="10" fill="#555" text-anchor="middle">long</text>
      </svg>`;
}

// Directional: gradient line + tapering polygon
function renderDirectionalLegend() {
    document.getElementById('study-legend').innerHTML = `
      <p class="panel-label" style="margin-bottom:6px;">Flight Direction</p>
      <svg width="300" height="56" style="display:block">
        <defs>
          <linearGradient id="dir-leg-grad" x1="0%" x2="100%">
            <stop offset="0%"   stop-color="#2ca25f"/>
            <stop offset="100%" stop-color="#2166ac"/>
          </linearGradient>
        </defs>

        <!-- Colour gradient row -->
        <line x1="4" y1="14" x2="160" y2="14"
              stroke="url(#dir-leg-grad)" stroke-width="3"/>
        <text x="168" y="18" font-size="10" fill="#555">colour: source → target</text>

        <!-- Tapering width row -->
        <polygon points="4,40 160,35 160,43" fill="#444" opacity="0.75"/>
        <text x="168" y="42" font-size="10" fill="#555">width: source → target</text>
      </svg>`;
}

// ============================================================
//  Boot
// ============================================================
init().catch(err => console.error('[STUDY] Initialisation error:', err));
