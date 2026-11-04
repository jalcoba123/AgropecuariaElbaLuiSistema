// js/ui.js

// Exponer la función de cambio de pestañas al navegador
window.switchTab = function(tabId, element) {
    const sections = document.querySelectorAll('.section-view');
    sections.forEach(sec => sec.classList.remove('active'));

    const chips = document.querySelectorAll('.cat-chip');
    chips.forEach(chip => chip.classList.remove('active'));

    const activeSection = document.getElementById('tab-' + tabId);
    if (activeSection) {
        activeSection.classList.add('active');
    }

    if (element) {
        element.classList.add('active');
    }
};

// Exponer el conmutador de Finca (Agua Clara / El Sur)
window.setFinca = function(fincaNombre) {
    const tag = document.getElementById('finca-tag');
    const title = document.getElementById('finca-title');
    const desc = document.getElementById('finca-desc');
    const btns = document.querySelectorAll('.finca-btn');

    btns.forEach(btn => {
        if (btn.innerText.includes(fincaNombre)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    if (tag) tag.innerText = `FINCA ACTIVA: ${fincaNombre.toUpperCase()}`;
    if (title) title.innerText = `Finca ${fincaNombre}`;
    if (desc) {
        desc.innerText = fincaNombre === 'Agua Clara' 
            ? 'Manejo intensivo/extensivo, palma aceitera en establecimiento y áreas de siembra.'
            : 'Manejo extensivo de mautes de engorde (Lote ElbaLui) y potreros.';
    }
};
