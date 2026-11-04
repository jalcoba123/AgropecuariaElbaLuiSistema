// Variable global para saber en qué finca estamos
let currentFinca = "Agua Clara";

const fincasData = {
    "Agua Clara": {
        tag: "FINCA ACTIVA: AGUA CLARA",
        title: "Finca Agua Clara",
        desc: "Manejo intensivo/extensivo, palma aceitera en establecimiento y áreas de siembra."
    },
    "El Sur": {
        tag: "FINCA ACTIVA: EL SUR",
        title: "Finca El Sur",
        desc: "Ganadería de carne, engorde de mautes (Lote ElbaLui) y rotación de potreros extensivos."
    }
};

// Función para cambiar de Finca
window.setFinca = function(fincaName) {
    currentFinca = fincaName;
    document.querySelectorAll('.finca-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(fincaName));
    });

    const data = fincasData[fincaName];
    document.getElementById('finca-tag').innerText = data.tag;
    document.getElementById('finca-title').innerText = data.title;
    document.getElementById('finca-desc').innerText = data.desc;
};

// Función para cambiar de Pestaña (Módulos)
window.switchTab = function(tabName, element) {
    document.querySelectorAll('.cat-chip').forEach(chip => chip.classList.remove('active'));
    if(element) element.classList.add('active');

    document.querySelectorAll('.section-view').forEach(view => view.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
};
