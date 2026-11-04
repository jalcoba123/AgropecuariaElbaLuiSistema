import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBHKDSUWKYICbu6vJ1UKUuY8Y6tOfZkoKs",
    authDomain: "finca-agropecuaria-elbalui.firebaseapp.com",
    projectId: "finca-agropecuaria-elbalui",
    storageBucket: "finca-agropecuaria-elbalui.firebasestorage.app",
    messagingSenderId: "1047271470951",
    appId: "1:1047271470951:web:380ff8c667dd7eab2221c2",
    measurementId: "G-ND79ESF8FM"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentFinca = "Agua Clara";
let map = null;
let balanceChartInstance = null;

const fincasData = {
    "Agua Clara": {
        tag: "FINCA ACTIVA: AGUA CLARA",
        title: "Finca Agua Clara (Lechería Extensiva & Recría)",
        desc: "Manejo intensivo/extensivo, palma aceitera en establecimiento y áreas de siembra.",
        palma: "25 ha"
    },
    "El Sur": {
        tag: "FINCA ACTIVA: EL SUR",
        title: "Finca El Sur (Lote ElbaLui Mautes, Vacías, Preñadas & Ordeño)",
        desc: "Ganadería de carne, engorde y rotación de potreros extensivos.",
        palma: "0 ha"
    }
};

window.setFinca = function(fincaName) {
    currentFinca = fincaName;
    document.querySelectorAll('.finca-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(fincaName));
    });

    const data = fincasData[fincaName];
    document.getElementById('finca-tag').innerText = data.tag;
    document.getElementById('finca-title').innerText = data.title;
    document.getElementById('finca-desc').innerText = data.desc;
    document.getElementById('kpi-palma').innerText = data.palma;

    escucharDatosFirebase();
};

window.switchTab = function(tabName, element) {
    document.querySelectorAll('.cat-chip').forEach(chip => chip.classList.remove('active'));
    if(element) element.classList.add('active');

    document.querySelectorAll('.section-view').forEach(view => view.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if(tabName === 'potreros') {
        setTimeout(() => {
            if (!map) {
                map = L.map('map').setView([9.745, -63.180], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© OpenStreetMap'
                }).addTo(map);
                L.marker([9.745, -63.180]).addTo(map).bindPopup('<b>Finca ' + currentFinca + '</b><br>Centro operativo.').openPopup();
            } else {
                map.invalidateSize();
            }
        }, 250);
    }

    if(tabName === 'balance') {
        setTimeout(() => { if(balanceChartInstance) balanceChartInstance.update(); }, 200);
    }
};

window.openModal = function(modalId) { document.getElementById(modalId).style.display = 'flex'; };
window.closeModal = function(modalId) { document.getElementById(modalId).style.display = 'none'; };

window.guardarAnimal = async function(e) {
    e.preventDefault();
    try {
        await addDoc(collection(db, "animales"), {
            finca: currentFinca,
            arete: document.getElementById('input-arete').value,
            categoria: document.getElementById('input-categoria').value,
            padre: document.getElementById('input-padre').value || 'N/D',
            madre: document.getElementById('input-madre').value || 'N/D',
            peso: Number(document.getElementById('input-peso').value),
            estado: document.getElementById('input-estado').value,
            fechaRegistro: new Date().toISOString().split('T')[0]
        });
        alert("¡Animal registrado con éxito!");
        closeModal('animalModal');
        document.getElementById('animalForm').reset();
    } catch (error) { alert("Error al guardar en Firebase."); }
};

window.guardarOrdeno = async function(e) {
    e.preventDefault();
    try {
        await addDoc(collection(db, "ordeno_diario"), {
            finca: currentFinca,
            fecha: document.getElementById('ordeno-fecha').value,
            vacas: Number(document.getElementById('ordeno-vacas').value),
            litros: Number(document.getElementById('ordeno-litros').value),
            becerros: Number(document.getElementById('ordeno-becerros').value || 0),
            promedio: (Number(document.getElementById('ordeno-litros').value) / Number(document.getElementById('ordeno-vacas').value)).toFixed(2)
        });
        alert("¡Ordeño guardado!");
        document.getElementById('ordenoForm').reset();
    } catch(error) { alert("Error al guardar ordeño."); }
};

window.guardarPalma = async function(e) {
    e.preventDefault();
    try {
        await addDoc(collection(db, "produccion_palma"), {
            finca: currentFinca,
            fecha: document.getElementById('palma-fecha').value,
            racimos: Number(document.getElementById('palma-racimos').value),
            toneladas: Number(document.getElementById('palma-toneladas').value)
        });
        alert("¡Cosecha guardada!");
        document.getElementById('palmaForm').reset();
    } catch(error) { alert("Error al guardar palma."); }
};

window.guardarTransaccion = async function(e) {
    e.preventDefault();
    try {
        await addDoc(collection(db, "finanzas"), {
            finca: currentFinca,
            fecha: document.getElementById('t-fecha').value,
            tipo: document.getElementById('t-tipo').value,
            categoria: document.getElementById('t-cat').value,
            monto: Number(document.getElementById('t-monto').value)
        });
        alert("¡Transacción registrada en el Balance!");
        closeModal('transaccionModal');
        document.getElementById('transaccionForm').reset();
    } catch(error) { alert("Error al guardar transacción."); }
};

window.guardarEvento = async function(e) {
    e.preventDefault();
    try {
        await addDoc(collection(db, "calendario"), {
            finca: currentFinca,
            fecha: document.getElementById('e-fecha').value,
            tipo: document.getElementById('e-tipo').value,
            descripcion: document.getElementById('e-desc').value,
            estado: "Pendiente"
        });
        alert("¡Evento programado en el calendario!");
        closeModal('eventoModal');
        document.getElementById('eventoForm').reset();
    } catch(error) { alert("Error al guardar evento."); }
};

function actualizarGraficaFinanciera(transacciones) {
    let totalIngresos = 0;
    let totalGastos = 0;
    let totalInversion = 0;

    transacciones.forEach(t => {
        if(t.tipo === "Ingreso") totalIngresos += t.monto;
        if(t.tipo === "Gasto") totalGastos += t.monto;
        if(t.tipo === "Inversión") totalInversion += t.monto;
    });

    const ctx = document.getElementById('balanceChart').getContext('2d');
    if(balanceChartInstance) {
        balanceChartInstance.destroy();
    }

    balanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Ingresos', 'Gastos', 'Inversiones'],
            datasets: [{
                label: 'Monto en ($)',
                data: [totalIngresos, totalGastos, totalInversion],
                backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function escucharDatosFirebase() {
    const qAnim = query(collection(db, "animales"), where("finca", "==", currentFinca));
    onSnapshot(qAnim, (snapshot) => {
        const tbody = document.getElementById('tabla-inventario-body');
        tbody.innerHTML = '';
        let totalHato = snapshot.docs.length;
        let gestantes = 0, ordeno = 0;

        document.getElementById('kpi-hato').innerText = totalHato;

        snapshot.forEach(doc => {
            const item = doc.data();
            if(item.estado === "Gestante") gestantes++;
            if(item.categoria === "Vaca Ordeño") ordeno++;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${item.arete}</strong></td>
                    <td>${item.categoria}</td>
                    <td>${item.padre} / ${item.madre}</td>
                    <td>${item.peso} kg</td>
                    <td>${item.estado}</td>
                    <td>${item.fechaRegistro}</td>
                </tr>
            `;
        });
        if(totalHato === 0) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">Sin animales registrados aún.</td></tr>`;
        document.getElementById('kpi-gestantes').innerText = gestantes;
        document.getElementById('kpi-ordeno').innerText = ordeno;
    });

    const qOrd = query(collection(db, "ordeno_diario"), where("finca", "==", currentFinca));
    onSnapshot(qOrd, (snapshot) => {
        const tbody = document.getElementById('tabla-ordeno-body');
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const item = doc.data();
            tbody.innerHTML += `<tr><td>${item.fecha}</td><td>${item.vacas}</td><td><strong>${item.litros} L</strong></td><td>${item.promedio} L/v</td><td>${item.becerros} aparte</td></tr>`;
        });
        if(snapshot.docs.length === 0) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">Sin registros lecheros.</td></tr>`;
    });

    const qCal = query(collection(db, "calendario"), where("finca", "==", currentFinca));
    onSnapshot(qCal, (snapshot) => {
        const tbody = document.getElementById('tabla-calendario-body');
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const item = doc.data();
            tbody.innerHTML += `<tr><td><strong>${item.fecha}</strong></td><td>${item.tipo}</td><td>${item.descripcion}</td><td><span style="color:var(--amber-text); font-weight:600;">${item.estado}</span></td></tr>`;
        });
        if(snapshot.docs.length === 0) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">Sin eventos programados en el calendario.</td></tr>`;
    });

    const qFin = query(collection(db, "finanzas"), where("finca", "==", currentFinca));
    onSnapshot(qFin, (snapshot) => {
        const tbody = document.getElementById('tabla-balance-body');
        tbody.innerHTML = '';
        let listaTransacciones = [];
        snapshot.forEach(doc => {
            const item = doc.data();
            listaTransacciones.push(item);
            tbody.innerHTML += `<tr><td>${item.fecha}</td><td>${item.tipo}</td><td>${item.categoria}</td><td><strong>$${item.monto.toFixed(2)}</strong></td><td>${item.finca}</td></tr>`;
        });
        if(snapshot.docs.length === 0) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">Sin transacciones contables registradas.</td></tr>`;
        
        actualizarGraficaFinanciera(listaTransacciones);
    });
}

window.addEventListener('DOMContentLoaded', () => { escucharDatosFirebase(); });
