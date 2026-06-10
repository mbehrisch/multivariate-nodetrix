// ============================================================
//  demo.js — Guided practice round before the real study
//
//  Flow:
//    1. Welcome modal
//    2. Interface tour  (3 spotlight + tooltip steps)
//    3. Encoding intro  (spotlight on legend, modality-specific)
//    4. Four demo tasks (TE1 → TS4 → TB1 → TA2)
//       • Pre-task guided steps (spotlight + tooltip)
//       • Actual task interaction (same UI as study.html)
//       • Post-task feedback modal (correct / wrong + explanation)
//    5. "You're ready" modal → link to study.html
// ============================================================

import { appState, svg, datasetSpec, width, height } from './main.js';
import { buildNodeLinkOnly }   from './building/nl-builder.js';
import { applyForceLayout }    from './building/force-layout.js';
import { setSimulationState }  from './utils.js';

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

import { applyEdgeTooltip } from './multivariate/baseline-edge.js';

// ── Synchronous setup ─────────────────────────────────────────
appState.visualizationMode = 'nodeLink';
svg.attr('id', 'study-svg');

// ── URL parameters ────────────────────────────────────────────
const _p          = new URLSearchParams(window.location.search);
const prolificPid = _p.get('PROLIFIC_PID') || 'PREVIEW';
const studyId     = _p.get('STUDY_ID')     || 'PREVIEW';
const sessionId   = _p.get('SESSION_ID')   || 'PREVIEW';
const modality    = _p.get('modality')     || 'categorical';
const order       = _p.get('order')        || '1';

// URL to redirect to after the demo is complete
const STUDY_URL = `study.html?modality=${encodeURIComponent(modality)}&order=${encodeURIComponent(order)}&PROLIFIC_PID=${encodeURIComponent(prolificPid)}&STUDY_ID=${encodeURIComponent(studyId)}&SESSION_ID=${encodeURIComponent(sessionId)}`;

// ── Layout constants (same as study.js) ───────────────────────
const STUDY_NODE_R    = 20;
const STUDY_CHARGE    = -250;
const STUDY_LINK_DIST = 70;

// ── Mutable state ─────────────────────────────────────────────
let demoTasks       = [];   // array of 4 task objects for this modality
let guideSteps      = [];   // flat array of all guide/task steps
let guideIndex      = 0;    // current position in guideSteps
let selectedAnswer  = null;
let selectedAnswers = [];
let activeFilter    = null; // tracks whether graph needs rebuilding

// ── Wait for graph ────────────────────────────────────────────
function waitForGraph() {
    return new Promise(resolve => {
        const poll = () => (appState.graph ? resolve() : requestAnimationFrame(poll));
        requestAnimationFrame(poll);
    });
}

// ── Dataset filter (same as study.js) ────────────────────────
function applyTaskFilter(graph, filter) {
    if (!filter) return graph;
    if (filter.type === 'deduplicate') {
        const g = graph.copy();
        const seen = new Set(), toRemove = [];
        g.forEachEdge((key, _a, source, target) => {
            const pair = source < target ? `${source}|${target}` : `${target}|${source}`;
            seen.has(pair) ? toRemove.push(key) : seen.add(pair);
        });
        toRemove.forEach(k => g.dropEdge(k));
        return g;
    }
    return graph;
}

// ── Build graph for a task ────────────────────────────────────
function rebuildForTask(task) {
    const filterKey = JSON.stringify(task.filter ?? null);
    if (filterKey === activeFilter) return; // already built with this filter
    activeFilter = filterKey;

    appState.graph = applyTaskFilter(appState._baseGraph, task.filter ?? null);
    if (appState.sim) appState.sim.stop();
    svg.selectAll('*').remove();

    const { nodes, links } = buildNodeLinkOnly();

    const PAD = 60;
    nodes.forEach(node => {
        node.x  = PAD + Math.random() * (width  - 2 * PAD);
        node.y  = PAD + Math.random() * (height - 2 * PAD);
        node.vx = 0; node.vy = 0;
    });
    applyForceLayout(nodes, links);

    appState.studyNodeR = STUDY_NODE_R;
    svg.selectAll('.node')
        .each(d => { d.r = STUDY_NODE_R; })
        .attr('r', STUDY_NODE_R)
        .on('mouseover', null).on('mousemove', null).on('mouseleave', null);

    if (appState.sim) {
        appState.sim.force('collide').radius(d => d.r + STUDY_NODE_R * 2);
        // Freeze nodes after layout settles
        appState.sim.on('end.demoFreeze', () => {
            svg.selectAll('.node').each(d => { d.fx = d.x; d.fy = d.y; });
            if (appState.sim) appState.sim.on('end.demoFreeze', null);
        });
    }

    setSimulationState({
        alphaTarget: 0.01, velocityDecay: 0.4,
        chargeStrength: STUDY_CHARGE, linkDistance: STUDY_LINK_DIST,
    });
    setTimeout(() => { if (appState.sim) appState.sim.alphaTarget(0); }, 1500);
}

// ── Apply encodings + render legend ───────────────────────────
function applyEncodings(task) {
    const enc    = new Set(task.encodings || []);
    const thresh = task.thresholds ?? [];
    const cond   = task.condition;

    if (cond === 'categorical') {
        if (enc.has('color'))   applyCategoricalColouring(datasetSpec.categoricalVar);
        if (enc.has('dashing')) applyCategoricalDashing(datasetSpec.categoricalVar);
        renderCategoricalLegend(task.encodings);
    } else if (cond === 'numerical') {
        if (enc.has('color'))     applyNumericalColouring();
        if (enc.has('thickness')) applyNumericalThickness();
        renderNumericalLegend(task.encodings, thresh);
    } else if (cond === 'directional') {
        if (enc.has('gradient')) applyDirectionalGradient();
        if (enc.has('taper'))    applyDirectionalTaper();
        if (enc.has('arrows'))   applyDirectionalArrows();
        renderDirectionalLegend(task.encodings);
    }
    if (enc.has('baseline')) applyEdgeTooltip(['route', cond === 'directional' ? 'route' : cond === 'numerical' ? 'distance' : 'country']);
}

// ── Highlight the start node ──────────────────────────────────
function highlightStartNode(iata) {
    if (!iata) return;
    svg.selectAll('.node').each(function (d) {
        if (d.IATA === iata) this.classList.add('node--start');
    });
}

function findNodeElement(nodeId) {
    let found = null;
    svg.selectAll('.node').each(function (d) { if (d.id === nodeId) found = this; });
    return found;
}

function clearHighlights() {
    document.querySelectorAll('.node--highlighted,.node--start,.node--answer-selected,.edge--highlighted,.neighbor--highlighted')
        .forEach(el => el.classList.remove('node--highlighted','node--start','node--answer-selected','edge--highlighted','neighbor--highlighted'));
}

function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────────────────────
//  STEP SEQUENCE BUILDER
// ─────────────────────────────────────────────────────────────
// Returns a flat array of step objects processed in order:
//  { type: 'modal'|'guide'|'task', ... }

function buildGuideSteps(tasks) {
    const steps = [];

    // ── 0. Welcome modal ──────────────────────────────────────
    steps.push({
        type: 'modal',
        id:   'welcome',
        render() {
            const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
            return `
              <span class="feedback-icon">👋</span>
              <h2>Welcome to the Practice Round</h2>
              <p>Before the real study begins, you will complete a <strong>short practice session</strong>
                 to get familiar with the interface.</p>
              <p>You will learn how to read the graph, use the legend, and answer the four types of tasks.
                 This practice uses the <strong>${cap(modality)}</strong> encoding.</p>
              <p>There are <strong>4 practice tasks</strong>. Take your time — there is no time limit on the practice.</p>
              <button class="demo-modal-btn" id="demo-action-btn">Start Practice →</button>`;
        },
    });

    // ── 1. Interface tour (3 guide steps) ─────────────────────
    steps.push({
        type: 'guide', target: 'graph',
        title: 'The Network Graph',
        text:  'Each circle represents an airport. Lines between circles are direct flight routes. You can click an airport to highlight it and its connections.',
    });
    steps.push({
        type: 'guide', target: 'task-description',
        title: 'The Task',
        text:  'Each task is shown here. Read it carefully. Some tasks ask you to select airports on the graph; others ask you to choose a multiple-choice answer.',
    });
    steps.push({
        type: 'guide', target: 'study-legend',
        title: 'The Legend',
        text:  'The legend explains the visual properties of the edges. You will use it to identify route characteristics when answering tasks.',
    });

    // ── 2. Encoding intro (modality-specific) ─────────────────
    const encIntroText = {
        categorical:
            'Edge <strong>colour</strong> and <strong>dash pattern</strong> both show which country\'s airline operates that route. Use either property to identify airline countries.',
        numerical:
            'Edge <strong>colour</strong> and <strong>thickness</strong> both show the route distance in kilometres. Thicker, warmer-coloured edges are longer routes.',
        directional:
            '<strong>Arrows</strong> point from the departure airport to the arrival airport. The <strong>gradient</strong> fades from green (departure) to blue (arrival). The <strong>taper</strong> is wide at the departure end and narrow at the arrival end.',
    };
    steps.push({
        type:          'guide',
        isEncodingIntro: true,
        target:        'study-legend',
        title:         'Edge Encoding',
        textHtml:      encIntroText[modality] || '',
    });

    // ── 3. Four demo tasks ─────────────────────────────────────
    const typeLabels = { TE1: 'Estimation', TS4: 'Structure', TB1: 'Browsing', TA2: 'Attribute' };
    const preStepsByType = {
        TE1: [
            { target: 'study-legend',
              title: 'Use the Legend',
              text:  'Look at the legend to understand what the edge properties represent. This will help you estimate quantities across the network.' },
            { target: 'answer-area',
              title: 'Multiple Choice',
              text:  'Click one of the options, then press Submit to confirm your answer.' },
        ],
        TS4: [
            { target: 'graph',
              title: 'Finding a Group',
              text:  'Look for a cluster of three airports that are all directly connected to each other. All edges between them should share the same visual property.' },
            { target: 'graph',
              title: 'Double-Click to Select',
              text:  'Double-click an airport to select it — it turns orange. Double-click it again to deselect. Select exactly 3 airports, then press Submit.' },
        ],
        TB1: [
            { target: 'graph',
              title: 'Your Starting Airport',
              text:  'The green airport is your starting point. Find it on the graph first — it is highlighted automatically.' },
            { target: 'study-legend',
              title: 'Follow the Encoding',
              text:  'Use the legend to identify which edges match the required airline / distance / direction for each hop.' },
            { target: 'answer-area',
              title: 'Select Both Airports',
              text:  'Double-click the airport you land on after each hop. You need to select 2 airports total — one per hop.' },
        ],
        TA2: [
            { target: 'graph',
              title: 'The Highlighted Airport',
              text:  'The green airport is the one you are being asked about. It is pre-highlighted so you can find it quickly.' },
            { target: 'study-legend',
              title: 'Count the Connections',
              text:  'Use the legend to identify which of its connected edges match the specified property, then count them.' },
            { target: 'answer-area',
              title: 'Choose Your Answer',
              text:  'Select the number or option that matches what you counted, then press Submit.' },
        ],
    };

    tasks.forEach((task, i) => {
        const typeKey  = task.type;
        const preSteps = preStepsByType[typeKey] || [];

        // Pre-task guide steps
        preSteps.forEach((ps, pi) => {
            steps.push({
                type:    'guide',
                target:  ps.target,
                title:   pi === 0
                    ? `Task ${i + 1} of 4 — ${typeLabels[typeKey] || typeKey}`
                    : ps.title,
                text: pi === 0
                    ? `${ps.text}`
                    : ps.text,
                ...(pi === 0 ? { taskIntroFor: task } : {}),
            });
        });

        // The actual task
        steps.push({ type: 'task', task, taskNum: i + 1 });
    });

    // ── 4. Done modal ──────────────────────────────────────────
    steps.push({
        type: 'modal',
        id:   'done',
        render() {
            return `
              <span class="feedback-icon">🎉</span>
              <h2>You're Ready!</h2>
              <p>Great work completing the practice round. You now know how to:</p>
              <ul style="text-align:left;font-size:15px;color:#444;line-height:1.8;padding-left:20px;">
                <li>Read the edge encoding from the legend</li>
                <li>Navigate the network by clicking and double-clicking airports</li>
                <li>Answer multiple-choice and node-selection tasks</li>
              </ul>
              <p>The <strong>real study</strong> has 16 tasks and works exactly the same way. Good luck!</p>
              <button class="demo-modal-btn" id="demo-action-btn">Start the Real Study →</button>`;
        },
    });

    return steps;
}

// ─────────────────────────────────────────────────────────────
//  SPOTLIGHT + TOOLTIP HELPERS
// ─────────────────────────────────────────────────────────────
const $spotlight = () => document.getElementById('demo-spotlight');
const $tooltip   = () => document.getElementById('demo-tooltip');

function showSpotlight(targetId) {
    const el = document.getElementById(targetId);
    const sp = $spotlight();
    if (!el) { sp.classList.add('hidden'); return; }

    const r   = el.getBoundingClientRect();
    const PAD = 10;
    sp.style.left   = `${r.left   - PAD}px`;
    sp.style.top    = `${r.top    - PAD}px`;
    sp.style.width  = `${r.width  + PAD * 2}px`;
    sp.style.height = `${r.height + PAD * 2}px`;
    sp.classList.remove('hidden');
}

function hideSpotlight() { $spotlight().classList.add('hidden'); }

function showTooltip(targetId, title, html, stepBadge) {
    const el  = document.getElementById(targetId);
    const tip = $tooltip();

    document.getElementById('demo-tooltip-title').textContent  = title;
    document.getElementById('demo-tooltip-text').innerHTML     = html;
    document.getElementById('demo-step-badge').textContent     = stepBadge || '';
    tip.classList.remove('hidden');

    // Position tooltip: prefer right of target; fall back to below
    if (!el) { tip.style.left = '50%'; tip.style.top = '50%'; return; }
    const r    = el.getBoundingClientRect();
    const tW   = 320, tH = 160; // approximate tooltip dims
    const vW   = window.innerWidth, vH = window.innerHeight;

    let left, top;
    if (r.right + tW + 16 < vW) {
        left = r.right + 16;
        top  = Math.max(16, Math.min(r.top, vH - tH - 16));
    } else if (r.left - tW - 16 > 0) {
        left = r.left - tW - 16;
        top  = Math.max(16, Math.min(r.top, vH - tH - 16));
    } else {
        left = Math.max(16, r.left);
        top  = r.bottom + 16 < vH ? r.bottom + 16 : r.top - tH - 16;
    }
    tip.style.left = `${left}px`;
    tip.style.top  = `${top}px`;
}

function hideTooltip() { $tooltip().classList.add('hidden'); }

// ─────────────────────────────────────────────────────────────
//  MODAL HELPER
// ─────────────────────────────────────────────────────────────
function showModal(step) {
    const modal = document.getElementById('demo-modal');
    const card  = document.getElementById('demo-modal-card');
    card.innerHTML = step.render();
    modal.classList.remove('hidden');

    document.getElementById('demo-action-btn').addEventListener('click', () => {
        modal.classList.add('hidden');
        advanceStep();
    });
}

function hideModal() {
    document.getElementById('demo-modal').classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────
//  FEEDBACK MODAL
// ─────────────────────────────────────────────────────────────
function showFeedback(task, isCorrect) {
    const modal = document.getElementById('demo-modal');
    const card  = document.getElementById('demo-modal-card');

    // demoAnyCorrect: treat any non-empty answer as correct for demo purposes
    const effectivelyCorrect = task.demoAnyCorrect || isCorrect === true;

    const icon     = effectivelyCorrect ? '✅' : '💡';
    const hClass   = effectivelyCorrect ? 'correct-header' : 'incorrect-header';
    const headline = effectivelyCorrect ? 'Well done!' : 'Not quite — here\'s the answer:';
    const btnClass = effectivelyCorrect ? 'demo-modal-btn correct-btn' : 'demo-modal-btn';
    const btnLabel = guideIndex < guideSteps.length - 1 ? 'Next practice task →' : 'Continue →';

    card.innerHTML = `
      <span class="feedback-icon">${icon}</span>
      <h2 class="${hClass}">${headline}</h2>
      <p>${escapeHtml(task.explanation || '')}</p>
      <button class="${btnClass}" id="demo-action-btn">${btnLabel}</button>`;

    modal.classList.remove('hidden');
    document.getElementById('demo-action-btn').addEventListener('click', () => {
        hideModal();
        advanceStep();
    });
}

// ─────────────────────────────────────────────────────────────
//  STEP RUNNER
// ─────────────────────────────────────────────────────────────
let guideStepCount = 0; // counts only 'guide' steps for the badge

function advanceStep() {
    guideIndex++;
    if (guideIndex < guideSteps.length) {
        runStep(guideSteps[guideIndex]);
    } else {
        // All steps done — go to the real study
        window.location.href = STUDY_URL;
    }
}

function runStep(step) {
    if (step.type === 'modal') {
        hideSpotlight(); hideTooltip();
        showModal(step);
        return;
    }

    if (step.type === 'guide') {
        guideStepCount++;

        // If this is the first pre-task step for a task, prepare the graph
        if (step.taskIntroFor) {
            const task = step.taskIntroFor;
            rebuildForTask(task);
            applyEncodings(task);
            clearHighlights();
            if (task.startNode) highlightStartNode(task.startNode);
            renderTaskDescription(task);
            const taskIdx = demoTasks.indexOf(task);
            renderProgressBar(taskIdx);
            document.getElementById('answer-area').innerHTML = '';
            document.getElementById('task-progress').textContent =
                `Practice task ${taskIdx + 1} of 4`;
        }

        // On encoding intro step, apply full encodings to the initial task
        if (step.isEncodingIntro && demoTasks.length > 0) {
            rebuildForTask(demoTasks[0]);
            applyEncodings(demoTasks[0]);
        }

        const badge = `Step ${guideStepCount}`;
        const html  = step.textHtml
            ? step.textHtml
            : escapeHtml(step.text || '');
        showSpotlight(step.target);
        showTooltip(step.target, step.title, html, badge);

        document.getElementById('demo-tooltip-btn').onclick = () => advanceStep();
        return;
    }

    if (step.type === 'task') {
        hideSpotlight(); hideTooltip();
        startDemoTask(step.task, step.taskNum);
    }
}

// ─────────────────────────────────────────────────────────────
//  TASK RUNNER
// ─────────────────────────────────────────────────────────────
function startDemoTask(task, taskNum) {
    selectedAnswer  = null;
    selectedAnswers = [];

    rebuildForTask(task);
    applyEncodings(task);
    clearHighlights();
    if (task.startNode) highlightStartNode(task.startNode);

    renderTaskDescription(task);
    renderAnswerArea(task);
    renderProgressBar(taskNum - 1);

    document.getElementById('task-progress').textContent =
        `Practice task ${taskNum} of 4`;
}

// ─────────────────────────────────────────────────────────────
//  ANSWER SUBMISSION
// ─────────────────────────────────────────────────────────────
function submitAnswer() {
    const task      = guideSteps[guideIndex].task;
    const correctSet = Array.isArray(task.correctAnswers)
        ? task.correctAnswers
        : [task.correctAnswer];

    let isCorrect;
    if (task.postHocCheck || task.demoAnyCorrect) {
        isCorrect = null; // show "well done" regardless
    } else if (task.answerType === 'select-nodes') {
        isCorrect = selectedAnswers.length > 0
            && selectedAnswers.every(a => correctSet.includes(a));
    } else if (task.answerType === 'select-node') {
        isCorrect = correctSet.includes(selectedAnswer);
    } else {
        isCorrect = correctSet.includes(selectedAnswer);
    }

    showFeedback(task, isCorrect);
}

// ─────────────────────────────────────────────────────────────
//  NODE SELECTION HANDLER
// ─────────────────────────────────────────────────────────────
function onNodeSelected(event) {
    const { nodeId, label } = event.detail;
    const step = guideSteps[guideIndex];
    if (!step || step.type !== 'task') return;
    const task = step.task;

    if (task.answerType === 'multiple-choice') return;

    if (task.answerType === 'select-nodes') {
        const required = task.requiredSelections ?? task.correctAnswers?.length ?? 2;
        const idx      = selectedAnswers.indexOf(label);
        const nodeEl   = findNodeElement(nodeId);
        if (idx >= 0) {
            selectedAnswers.splice(idx, 1);
            if (nodeEl) nodeEl.classList.remove('node--answer-selected');
        } else if (selectedAnswers.length < required) {
            selectedAnswers.push(label);
            if (nodeEl) nodeEl.classList.add('node--answer-selected');
        }
        const display = document.getElementById('selected-nodes-display');
        if (display) display.textContent = selectedAnswers.length > 0
            ? `Selected: ${selectedAnswers.join(', ')}` : 'Selected: —';
        const btn = document.getElementById('submit-btn');
        if (btn) {
            btn.disabled    = selectedAnswers.length < required;
            btn.textContent = `Submit (${selectedAnswers.length} / ${required})`;
        }
        return;
    }

    // select-node (single)
    selectedAnswer = label;
    const display = document.getElementById('selected-node-display');
    if (display) display.textContent = `Selected: ${label}`;
    const btn = document.getElementById('submit-btn');
    if (btn) btn.disabled = false;
}

// ─────────────────────────────────────────────────────────────
//  UI RENDERERS  (mirrors study.js)
// ─────────────────────────────────────────────────────────────
function renderTaskDescription(task) {
    let html = escapeHtml(task.description);
    (task.colorKeywords || []).forEach(({ word, color }) => {
        const safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        html = html.replace(new RegExp(`(${safe})`, 'gi'),
            `<span style="color:${color};font-weight:600;">$1</span>`);
    });
    document.getElementById('task-description').innerHTML = html;
}

function renderAnswerArea(task) {
    const area = document.getElementById('answer-area');
    area.innerHTML = '';

    if (task.answerType === 'select-node') {
        const display      = document.createElement('p');
        display.id         = 'selected-node-display';
        display.textContent = 'Selected: —';
        const btn = document.createElement('button');
        btn.id = 'submit-btn'; btn.textContent = 'Submit';
        btn.disabled = true; btn.className = 'btn btn-primary w-100 mt-2';
        btn.addEventListener('click', submitAnswer);
        area.appendChild(display); area.appendChild(btn);

    } else if (task.answerType === 'select-nodes') {
        const required = task.requiredSelections ?? task.correctAnswers?.length ?? 2;
        const display  = document.createElement('p');
        display.id     = 'selected-nodes-display'; display.textContent = 'Selected: —';
        const hint = document.createElement('p');
        hint.className = 'text-muted';
        hint.style.cssText = 'font-size:12px;margin:0 0 8px';
        hint.textContent = `Double-click ${required} airport${required !== 1 ? 's' : ''} to answer. Click again to deselect.`;
        const btn = document.createElement('button');
        btn.id = 'submit-btn'; btn.type = 'button';
        btn.textContent = `Submit (0 / ${required})`; btn.disabled = true;
        btn.className = 'btn btn-primary w-100 mt-2';
        btn.addEventListener('click', submitAnswer);
        area.appendChild(display); area.appendChild(hint); area.appendChild(btn);

    } else if (task.answerType === 'multiple-choice') {
        const form = document.createElement('form'); form.id = 'mc-form';
        (task.options || []).forEach((opt, i) => {
            const wrapper = document.createElement('div'); wrapper.className = 'form-check';
            const input   = document.createElement('input');
            input.type = 'radio'; input.name = 'mc-answer';
            input.id = `mc-opt-${i}`; input.value = opt; input.className = 'form-check-input';
            input.addEventListener('change', () => {
                selectedAnswer = opt;
                const b = document.getElementById('submit-btn');
                if (b) b.disabled = false;
            });
            const lbl = document.createElement('label');
            lbl.htmlFor = `mc-opt-${i}`; lbl.textContent = opt; lbl.className = 'form-check-label';
            wrapper.appendChild(input); wrapper.appendChild(lbl); form.appendChild(wrapper);
        });
        const btn = document.createElement('button');
        btn.id = 'submit-btn'; btn.type = 'button'; btn.textContent = 'Submit';
        btn.disabled = true; btn.className = 'btn btn-primary w-100 mt-3';
        btn.addEventListener('click', submitAnswer);
        area.appendChild(form); area.appendChild(btn);
    }
}

function renderProgressBar(activeIdx) {
    const bar = document.getElementById('study-progress-bar');
    bar.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const seg = document.createElement('div');
        seg.className = 'progress-step';
        if      (i < activeIdx)  seg.classList.add('progress-step--done');
        else if (i === activeIdx) seg.classList.add('progress-step--current');
        bar.appendChild(seg);
    }
}

// ─────────────────────────────────────────────────────────────
//  LEGEND RENDERERS  (mirrors study.js)
// ─────────────────────────────────────────────────────────────
function renderCategoricalLegend(encodings) {
    const el = document.getElementById('study-legend');
    const cats = Object.keys(categoricalColorMap);
    if (!cats.length) { el.innerHTML = ''; return; }
    const showColor = encodings.includes('color');
    const showDash  = encodings.includes('dashing');
    let html = '<p class="panel-label" style="margin-bottom:6px;">Airline Country of Origin</p>';
    html += '<ul class="study-legend-list">';
    cats.forEach(cat => {
        const color    = showColor ? (categoricalColorMap[cat] || '#999') : '#555';
        const dash     = showDash  ? (categoricalDashMap[cat]  || 'none') : 'none';
        const dashAttr = dash !== 'none' ? `stroke-dasharray="${dash}"` : '';
        html += `<li>
          <svg width="40" height="14" style="flex-shrink:0">
            <line x1="2" y1="7" x2="38" y2="7" stroke="${color}" stroke-width="2.5" ${dashAttr}/>
          </svg><span>${cat}</span></li>`;
    });
    html += '</ul>';
    el.innerHTML = html;
}

function renderNumericalLegend(encodings, thresholds = []) {
    const el    = document.getElementById('study-legend');
    const scale = defineNumericalMapping();
    const [minVal, maxVal] = scale.domain();
    const midVal = Math.round((minVal + maxVal) / 2);
    const showColor     = encodings.includes('color');
    const showThickness = encodings.includes('thickness');
    const hasThresh     = thresholds.length > 0;
    const colorH     = showColor     ? 32 : 0;
    const thickBaseH = showThickness ? 30 : 0;
    const threshH    = hasThresh && (showColor || showThickness) ? (4 + thresholds.length * 22) : 0;
    const svgH = colorH + thickBaseH + threshH;
    const norm = v => Math.max(0.01, Math.min(0.99, (v - minVal) / (maxVal - minVal)));
    const N_STOPS = 32;
    let gradStops = '';
    for (let i = 0; i <= N_STOPS; i++) {
        const t = i / N_STOPS;
        gradStops += `<stop offset="${(t*100).toFixed(1)}%" stop-color="${scale(minVal + t*(maxVal-minVal))}"/>`;
    }
    let svg2 = `<defs><linearGradient id="num-leg-grad" x1="0%" x2="100%">${gradStops}</linearGradient></defs>`;
    if (showColor) {
        svg2 += `<rect x="0" y="0" width="280" height="12" fill="url(#num-leg-grad)" rx="2"/>`;
        thresholds.forEach(th => {
            const x = norm(th.value) * 280;
            svg2 += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="12" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>`;
        });
        svg2 += `<text x="0" y="26" font-size="10" fill="#555">${Math.round(minVal).toLocaleString()} km</text>
                 <text x="140" y="26" font-size="10" fill="#555" text-anchor="middle">${midVal.toLocaleString()} km</text>
                 <text x="280" y="26" font-size="10" fill="#555" text-anchor="end">${Math.round(maxVal).toLocaleString()} km</text>`;
    }
    if (showThickness) {
        const ty = colorH;
        svg2 += `<line x1="0" y1="${ty+6}" x2="80" y2="${ty+6}" stroke="#555" stroke-width="3"/>
                 <line x1="100" y1="${ty+6}" x2="180" y2="${ty+6}" stroke="#555" stroke-width="6"/>
                 <line x1="200" y1="${ty+6}" x2="280" y2="${ty+6}" stroke="#555" stroke-width="10"/>
                 <text x="40" y="${ty+20}" font-size="10" fill="#555" text-anchor="middle">short</text>
                 <text x="140" y="${ty+20}" font-size="10" fill="#555" text-anchor="middle">medium</text>
                 <text x="240" y="${ty+20}" font-size="10" fill="#555" text-anchor="middle">long</text>`;
    }
    if (hasThresh && (showColor || showThickness)) {
        const exY0 = colorH + thickBaseH + 4;
        thresholds.forEach((th, i) => {
            const sw     = showThickness ? (3 + norm(th.value) * 7).toFixed(1) : '3';
            const stroke = showColor ? scale(th.value) : '#333';
            const prefix = th.direction === 'gt' ? '>' : th.direction === 'lt' ? '<' : '|';
            const ey     = exY0 + i * 22;
            svg2 += `<line x1="0" y1="${ey+5}" x2="60" y2="${ey+5}" stroke="${stroke}" stroke-width="${sw}"/>
                     <text x="68" y="${ey+9}" font-size="9" fill="#aa0000" font-weight="600">${prefix} ${th.value.toLocaleString()} km</text>`;
        });
    }
    el.innerHTML = `<p class="panel-label" style="margin-bottom:6px;">Route Distance (km)</p>
                    <svg width="300" height="${svgH}" style="display:block">${svg2}</svg>`;
}

function renderDirectionalLegend(encodings) {
    const showGradient = encodings.includes('gradient');
    const showTaper    = encodings.includes('taper');
    const showArrows   = encodings.includes('arrows');
    const rows = [showGradient, showTaper, showArrows].filter(Boolean).length;
    const svgHeight = rows * 28;
    let y = 14, svgC = `<defs>
      <linearGradient id="dir-leg-grad" gradientUnits="userSpaceOnUse" x1="4" y1="0" x2="160" y2="0">
        <stop offset="0%" stop-color="#2ca25f"/><stop offset="100%" stop-color="#2166ac"/>
      </linearGradient></defs>`;
    if (showGradient) {
        svgC += `<rect x="4" y="${y-3}" width="156" height="6" rx="2" fill="url(#dir-leg-grad)"/>
                 <text x="168" y="${y+4}" font-size="10" fill="#555">colour: source → target</text>`;
        y += 28;
    }
    if (showTaper) {
        const b=y-5,t=y+3;
        svgC += `<polygon points="4,${y} 160,${b} 160,${t}" fill="#444" opacity="0.75"/>
                 <text x="168" y="${y+2}" font-size="10" fill="#555">width: source → target</text>`;
        y += 28;
    }
    if (showArrows) {
        svgC += `<polygon points="160,${y} 145,${y-5} 145,${y+5}" fill="black" opacity="0.9"/>
                 <line x1="4" y1="${y}" x2="155" y2="${y}" stroke="#555" stroke-width="1.5"/>
                 <text x="168" y="${y+4}" font-size="10" fill="#555">arrow: points to target</text>`;
    }
    document.getElementById('study-legend').innerHTML =
        `<p class="panel-label" style="margin-bottom:6px;">Flight Direction</p>
         <svg width="300" height="${svgHeight}" style="display:block">${svgC}</svg>`;
}

// ─────────────────────────────────────────────────────────────
//  MAIN INIT
// ─────────────────────────────────────────────────────────────
async function init() {
    const [demoData] = await Promise.all([
        fetch('data/demo_tasks.json').then(r => r.json()),
        waitForGraph(),
    ]);

    demoTasks = demoData[modality] || [];
    if (!demoTasks.length) {
        document.getElementById('task-description').textContent =
            `No demo tasks found for modality: ${modality}`;
        return;
    }

    appState._baseGraph = appState.graph;

    // Stop whatever main.js rendered
    if (appState.sim) appState.sim.stop();
    svg.selectAll('*').remove();

    // Pre-build graph with the first task's filter
    // so the interface tour already shows the encoding
    rebuildForTask(demoTasks[0]);
    applyEncodings(demoTasks[0]);

    // Wire up node selection
    document.addEventListener('study:nodeSelected', onNodeSelected);

    // Build step sequence and start
    guideSteps = buildGuideSteps(demoTasks);
    guideIndex = 0;
    runStep(guideSteps[0]);
}

init().catch(err => console.error('[DEMO] Init error:', err));
