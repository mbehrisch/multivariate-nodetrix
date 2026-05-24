import * as d3 from 'd3';
import {
    applyDirectionalGradient, resetDirectionalGradient,
    applyDirectionalTaper, resetDirectionalTaper
} from '../multivariate/directional-edge.js';

const gradientButton = document.getElementById("directional-gradient-button");
const taperButton = document.getElementById("directional-taper-button");

export function SetupDirectionalOptions() {
    document.getElementById("directional-options-button")
        .addEventListener("click", toggleDirectionalOptions);
    document.getElementById("directional-options-button").checked = false;

    SetupDirectionalGradient();
    SetupDirectionalTaper();
}

function toggleDirectionalOptions() {
    const btn = document.getElementById("directional-options-button");
    d3.select("#directional-options-container")
        .style("display", btn.checked ? "block" : "none");
}

// ─── Gradient ─────────────────────────────────────────────────────────────────

function SetupDirectionalGradient() {
    gradientButton.checked = false;
    gradientButton.addEventListener("change", toggleDirectionalGradient);
    toggleDirectionalGradient();
}

function toggleDirectionalGradient() {
    const legendEl = d3.select("#directional-gradient-legend");
    if (gradientButton.checked) {
        applyDirectionalGradient();
        legendEl.style("display", "flex");
    } else {
        resetDirectionalGradient();
        legendEl.style("display", "none");
    }
}

// ─── Taper ────────────────────────────────────────────────────────────────────

function SetupDirectionalTaper() {
    taperButton.checked = false;
    taperButton.addEventListener("change", toggleDirectionalTaper);
    toggleDirectionalTaper();
}

function toggleDirectionalTaper() {
    const legendEl = d3.select("#directional-taper-legend");
    if (taperButton.checked) {
        applyDirectionalTaper();
        legendEl.style("display", "flex");
    } else {
        resetDirectionalTaper();
        legendEl.style("display", "none");
    }
}
