import { applyEdgeTooltip, resetEdgeTooltip } from '../multivariate/baseline-edge.js';

const tooltipButton = document.getElementById('edge-tooltip-button');

export function SetupBaselineOptions() {
    tooltipButton.checked = false;
    tooltipButton.addEventListener('change', toggleEdgeTooltip);
}

function toggleEdgeTooltip() {
    if (tooltipButton.checked) {
        applyEdgeTooltip();
    } else {
        resetEdgeTooltip();
    }
}
