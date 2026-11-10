import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc, getDoc, getDocs, writeBatch, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 🔥 1. INICIALIZAR FIREBASE AQUÍ MISMO
// ==========================================
const firebaseConfig = {
    apiKey: "TU_API_KEY_AQUI",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.appspot.com",
    messagingSenderId: "TUS_SENDER_ID",
    appId: "TU_APP_ID"
};

// Evitar inicializar dos veces si la página se recarga en caliente
if (!window.db) {
    const app = initializeApp(firebaseConfig);
    window.db = getFirestore(app);
    console.log("🔥 Firebase inicializado dentro de hato.js");
}

// ==========================================
// 🔧 2. CONFIGURACIÓN GLOBAL Y DISPOSITIVO
// ==========================================
let ID_DISPOSITIVO = localStorage.getItem('elbalui_dispositivo_id');
if (!ID_DISPOSITIVO) {
    ID_DISPOSITIVO = 'DEV-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    localStorage.setItem('elbalui_dispositivo_id', ID_DISPOSITIVO);
}

window.obtenerFincaActual = function() {
    const tag = document.getElementById('finca-tag');
    if (!tag) return 'Agua Clara';
    if (tag.innerText.includes('Global')) return 'Global';
    if (tag.innerText.includes('El Sur')) return 'El Sur';
    return 'Agua Clara';
}

window.animalesGlobal = [];

// ==========================================
// 🌐 3. MONITOREO DE CONEXIÓN A INTERNET
// ==========================================
function actualizarEstadoConexion() {
    const statusBar = document.getElementById('offline-status-bar');
    if (!statusBar) return;
    
    if (navigator.onLine) {
        statusBar.style.background = '#10b981';
        statusBar.innerText = '🟢 Conectado - Sincronizado en Nube (Starlink / Datos)';
    } else {
        statusBar.style.background = '#334155';
        statusBar.innerText = '⚠️ Modo Sin Conexión';
    }
}
window.addEventListener('online', actualizarEstadoConexion);
window.addEventListener('offline', actualizarEstadoConexion);
actualizarEstadoConexion();

// ==========================================
// 🧭 4. CONTROL DE MINI-MENÚS HATO
// ==========================================
window.cambiarModuloHato = function(evento, idModulo) {
    document.querySelectorAll('.modulo-hato').forEach(mod => mod.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'white';
        btn.style.color = '#334155';
        btn.style.border = '1px solid #cbd5e1';
    });

    document.getElementById(idModulo).style.display = 'block';
    const btnActivo = evento.currentTarget;
    btnActivo.classList.add('active');
    btnActivo.style.background = '#0f172a';
    btnActivo.style.color = 'white';
    btnActivo.style.border = 'none';

    if(idModulo === 'subtab-config') cargarConfiguracionHato();
    if(idModulo === 'subtab-lector') document.getElementById('rfid-scanner-input').focus();
};

// ==========================================
// 📡 5. LECTURA EN TIEMPO REAL (INVENTARIO)
// ==========================================
window.cargarHato = function() {
    const tabla = document.getElementById('tabla-hato-body');
    const panelAlertas = document.getElementById('panel-alertas');
    if (!tabla || !window.db) return;

    tabla.innerHTML = '<tr><td colspan="6" style="text-align:center;">Sincronizando rebaño en tiempo real...</td></tr>';
    const fincaActiva = window.obtenerFincaActual();
    
    let q = (fincaActiva === 'Global')
        ? query(collection(window.db, "animales"))
        : query(collection(window.db, "animales"), where("finca", "==", fincaActiva));

    onSnapshot(q, (snapshot) => {
        window.animalesGlobal = [];
        snapshot.forEach(doc => {
            window.animalesGlobal.push({ id: doc.id, ...doc.data() });
        });
        
        renderizarTablaHato(window.animalesGlobal);
        actualizarKpiHato(window.animalesGlobal);
        actualizarAlertasSanitarias(window.animalesGlobal);
        actualizarDashTorreControl(window.animalesGlobal);
        cargarSelectLotes(fincaActiva);
    }, (err) => {
        console.error("Error Firestore:", err);
        tabla.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Error conectando a BD: ${err.message}</td></tr>`;
    });
};

function renderizarTablaHato(animales) {
    const tbody = document.getElementById('tabla-hato-body');
    tbody.innerHTML = '';
    if (animales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay animales registrados.</td></tr>';
        return;
    }

    animales.forEach(a => {
        let badgeEstado = '🟢 Sano';
        if (a.novedadSalud && a.novedadSalud !== '🟢 Sano') badgeEstado = `🔴 ${a.novedadSalud}`;
        else if (a.salud && a.salud !== '🟢 Sano') badgeEstado = `🔴 ${a.salud}`;

        let tiempoTxt = '-';
        if (a.fechaNacimiento) {
            const meses = Math.floor((new Date() - new Date(a.fechaNacimiento)) / (1000 * 60 * 60 * 24 * 30));
            tiempoTxt = `${meses} meses`;
        }
        if (a.estado === 'Gestante') {
            tiempoTxt = `Gest. Tercio ${a.tercioGestacion || '?'}`;
        }

        const escapeStr = (val) => String(val || '').replace(/'/g, "\\'");
        const tr = document.createElement('tr');
        tr.style.background = a.estado === 'Baja (Vendido/Muerto)' ? '#f8fafc' : 'white';
        tr.style.color = a.estado === 'Baja (Vendido/Muerto)' ? '#94a3b8' : 'inherit';
        tr.setAttribute('data-arete', escapeStr(a.arete));
        tr.setAttribute('data-categoria', escapeStr(a.categoria));
        tr.setAttribute('data-estado', escapeStr(a.estado));

        tr.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" class="chk-animal" value="${a.id}"></td>
            <td><strong>${a.arete}</strong><br><span style="font-size: 0.75rem; color: #64748b;">📍 ${a.lote || 'General'}</span></td>
            <td>${a.categoria}</td>
            <td>${tiempoTxt}</td>
            <td style="font-weight: bold; cursor: pointer;" onclick="window.abrirModalNovedad('${a.id}', '${escapeStr(a.arete)}', '${escapeStr(badgeEstado)}')">${badgeEstado}</td>
            <td style="text-align: center;"><button onclick="window.verFichaAnimal('${a.id}')" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:bold;">📋 Ficha</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function actualizarKpiHato(animales) {
    const activos = animales.filter(a => a.estado !== 'Baja (Vendido/Muerto)');
    document.getElementById('kpi-total').innerText = activos.length;
    document.getElementById('kpi-mautes').innerText = activos.filter(a => ['Maute', 'Mauta'].includes(a.categoria)).length;
    document.getElementById('kpi-gestantes').innerText = activos.filter(a => a.estado === 'Gestante').length;
}

// ==========================================
// 🔍 6. FILTROS EN TABLA
// ==========================================
window.toggleAllCheckboxes = function(source) {
    document.querySelectorAll('.chk-animal').forEach(chk => {
        if(!chk.disabled && chk.closest('tr').style.display !== 'none') chk.checked = source.checked;
    });
};

window.aplicarFiltroHato = function() {
    const texto = document.getElementById('buscador-hato').value.toUpperCase();
    const catFiltro = document.getElementById('filtro-categoria').value;
    const filas = document.querySelectorAll('#tabla-hato-body tr');
    
    filas.forEach(fila => {
        if(!fila.hasAttribute('data-categoria')) return; 

        const cat = fila.getAttribute('data-categoria');
        const estado = fila.getAttribute('data-estado');
        const arete = fila.getAttribute('data-arete').toUpperCase();

        let mostrar = false;
        if (catFiltro === 'Todos' && estado !== 'Baja (Vendido/Muerto)') mostrar = true;
        else if (catFiltro === 'Bajas' && estado === 'Baja (Vendido/Muerto)') mostrar = true;
        else if (catFiltro === 'Becerros' && cat.includes('Becerr') && estado !== 'Baja (Vendido/Muerto)') mostrar = true;
        else if (catFiltro === 'Mautes' && cat.includes('Maut') && estado !== 'Baja (Vendido/Muerto)') mostrar = true;
        else if (catFiltro === 'Vacas' && cat.includes('Vaca') && estado !== 'Baja (Vendido/Muerto)') mostrar = true;
        else if (catFiltro === 'Gestantes' && estado === 'Gestante') mostrar = true;

        if (mostrar && texto !== "" && arete.indexOf(texto) === -1) mostrar = false;

        fila.style.display = mostrar ? '' : 'none';
        if(!mostrar) {
            const chk = fila.querySelector('.chk-animal');
            if(chk) chk.checked = false;
        }
    });
    const chkAll = document.getElementById('chk-all');
    if(chkAll) chkAll.checked = false;
};

// ==========================================
// 🗼 7. ALERTAS Y DASHBOARD (TORRE DE CONTROL)
// ==========================================
function actualizarAlertasSanitarias(animales) {
    const panel = document.getElementById('panel-alertas');
    const enfermos = animales.filter(a => a.estado !== 'Baja (Vendido/Muerto)' && ((a.novedadSalud && a.novedadSalud !== '🟢 Sano') || (a.salud && a.salud !== '🟢 Sano')));
    if (enfermos.length === 0) {
        panel.innerHTML = '<span style="color: #059669; font-weight: bold; background: #d1fae5; padding: 5px 10px; border-radius: 10px;">✅ Todos los animales activos están sanos.</span>';
        return;
    }
    panel.innerHTML = '';
    enfermos.forEach(a => {
        let mal = a.novedadSalud && a.novedadSalud !== '🟢 Sano' ? a.novedadSalud : a.salud;
        panel.innerHTML += `<span style="background: #fecdd3; color: #9f1239; padding: 5px 10px; border-radius: 10px; font-weight: bold; cursor: pointer;" onclick="window.verFichaAnimal('${a.id}')">${a.arete}: ${mal}</span>`;
    });
}

function actualizarDashTorreControl(animales) {
    const gestantes = animales.filter(a => a.estado === 'Gestante' && parseInt(a.tercioGestacion) >= 2);
    document.getElementById('dash-count-secado').innerText = gestantes.length;
    document.getElementById('dash-list-secado').innerHTML = gestantes.length > 0 
        ? gestantes.map(a => `<div style="padding: 5px 0; border-bottom: 1px solid #fef3c7;"><strong>${a.arete}</strong> - Tercio ${a.tercioGestacion}</div>`).join('') 
        : '<p style="color: var(--text-muted); font-style: italic;">No hay vientres en 2do o 3er tercio.</p>';

    const destetes = animales.filter(a => ['Becerro', 'Becerra'].includes(a.categoria) && a.fechaNacimiento && (Math.floor((new Date() - new Date(a.fechaNacimiento)) / (1000 * 60 * 60 * 24 * 30)) >= 6));
    document.getElementById('dash-count-destete').innerText = destetes.length;
    document.getElementById('dash-list-destete').innerHTML = destetes.length > 0 
        ? destetes.map(a => `<div style="padding: 5px 0; border-bottom: 1px solid #fef9c3;"><strong>${a.arete}</strong> - Listo para destete</div>`).join('') 
        : '<p style="color: var(--text-muted); font-style: italic;">No hay becerros en edad de destete (>6 meses).</p>';
}

// ==========================================
// 🏷️ 8. ESTACIÓN DE CONTROL DE MANGA (RFID)
// ==========================================
window.bufferManga = []; 

window.cambiarModoManga = function(modo) {
    document.getElementById('manga-container-rafaga').style.display = modo === 'rafaga' ? 'block' : 'none';
    if(modo === 'rafaga') cargarVacunasSelect('manga-vacuna-rafaga');
    document.getElementById('rfid-scanner-input').focus();
};

window.reiniciarSesionManga = function() {
    if (confirm("¿Reiniciar el contador y limpiar la tabla de faena? (Lo guardado en BD no se borra)")) {
        window.bufferManga = [];
        actualizarTablaFaenaManga();
        document.getElementById('manga-alerta-banner').style.display = 'none';
        document.getElementById('rfid-scanner-input').focus();
    }
};

function mostrarAlertaManga(mensaje, esError = true) {
    const banner = document.getElementById('manga-alerta-banner');
    banner.innerText = mensaje;
    banner.style.background = esError ? '#fef2f2' : '#f0fdf4';
    banner.style.color = esError ? '#991b1b' : '#15803d';
    banner.style.border = `2px solid ${esError ? '#ef4444' : '#22c55e'}`;
    banner.style.display = 'block';
    
    if(esError) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.3);
        } catch (e) {}
    }
    setTimeout(() => { banner.style.display = 'none'; }, 4000);
}

// LOOP LECTOR RFID
setInterval(() => {
    const inputLector = document.getElementById('rfid-scanner-input');
    if (inputLector && !inputLector.onkeypress) {
        inputLector.onkeypress = async function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const codigoRFID = inputLector.value.trim().toLowerCase();
                inputLector.value = ''; 
                if (!codigoRFID) return;

                const animal = window.animalesGlobal.find(a => 
                    (a.rfid && String(a.rfid).toLowerCase() === codigoRFID) || 
                    (a.arete && String(a.arete).toLowerCase() === codigoRFID) ||
                    (a.chipRFID && String(a.chipRFID).toLowerCase() === codigoRFID)
                );

                if (!animal) {
                    mostrarAlertaManga(`📡 Chip No Registrado: ${codigoRFID}`);
                    if (confirm(`El chip [${codigoRFID}] no está registrado.\n¿Deseas asignarlo a un arete existente en la BD?`)) {
                        const areteAsociar = prompt(`Ingresa el ARETE VISUAL para asociar el chip [${codigoRFID}]:`);
                        if (areteAsociar) {
                            const animalExistente = window.animalesGlobal.find(a => a.arete.toLowerCase() === areteAsociar.trim().toLowerCase());
                            if (animalExistente) {
                                try {
                                    await updateDoc(doc(window.db, "animales", animalExistente.id), { rfid: codigoRFID, chipRFID: codigoRFID });
                                    alert(`✅ Chip asociado al arete ${animalExistente.arete}.`);
                                } catch (err) { alert("Error vinculando: " + err.message); }
                            } else alert(`⚠️ Arete "${areteAsociar}" no encontrado.`);
                        }
                    }
                    return;
                }

                if (window.bufferManga.some(item => item.id === animal.id)) {
                    mostrarAlertaManga(`⚠️ Arete #${animal.arete} YA FUE PROCESADO hoy.`);
                    return;
                }

                const modo = document.getElementById('manga-modo-operacion').value;
                let accionTxt = "Conteo";

                if (modo === 'rafaga') {
                    const vacunaSel = document.getElementById('manga-vacuna-rafaga').value;
                    if (!vacunaSel) return mostrarAlertaManga("⚠️ MODO RÁFAGA: Selecciona tratamiento antes de escanear.");
                    accionTxt = `Vacunado: ${vacunaSel}`;
                    try {
                        const hoy = new Date().toISOString().split('T')[0];
                        await addDoc(collection(window.db, "animales", animal.id, "historial_reproductivo"), {
                            fecha: hoy, tipo: 'Sanidad', detalle: `Manga RFID: ${vacunaSel}`
                        });
                        await updateDoc(doc(window.db, "animales", animal.id), { novedadSalud: `🟢 Sano (Vac: ${vacunaSel})` });
                    } catch (err) { console.error("Error ráfaga:", err); }
                }

                window.bufferManga.push({ id: animal.id, arete: animal.arete, categoria: animal.categoria, lote: animal.lote || 'General', accion: accionTxt });
                actualizarTablaFaenaManga();
                mostrarAlertaManga(`✅ Registrado: #${animal.arete}`, false);

                if (modo === 'conteo') window.verFichaAnimal(animal.id);
            }
        };
    }
}, 500);

function actualizarTablaFaenaManga() {
    const tbody = document.getElementById('manga-tabla-faena-body');
    tbody.innerHTML = '';
    if (window.bufferManga.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Manga vacía.</td></tr>`;
        document.getElementById('contador-lote-manga').innerText = '0';
        document.getElementById('manga-desglose-categoria').innerHTML = '';
        document.getElementById('manga-desglose-lote').innerHTML = '';
        return;
    }

    let cCat = {}, cLote = {};
    window.bufferManga.slice().reverse().forEach((item, index) => {
        cCat[item.categoria] = (cCat[item.categoria] || 0) + 1;
        cLote[item.lote] = (cLote[item.lote] || 0) + 1;
        
        tbody.innerHTML += `
            <tr>
                <td>${window.bufferManga.length - index}</td>
                <td><strong>${item.arete}</strong></td><td>${item.categoria}</td><td>${item.lote}</td>
                <td><span style="background:#f0fdf4; color:#166534; padding:2px 6px; border-radius:4px; font-size:0.8rem;">${item.accion}</span></td>
                <td style="text-align:center;"><button onclick="window.verFichaAnimal('${item.id}')" style="background:#e0f2fe; border:1px solid #bae6fd; border-radius:4px; cursor:pointer;">👁️</button></td>
            </tr>
        `;
    });

    document.getElementById('contador-lote-manga').innerText = window.bufferManga.length;
    document.getElementById('manga-desglose-categoria').innerHTML = Object.entries(cCat).map(([k, v]) => `<div>${k}: <strong>${v}</strong></div>`).join('');
    document.getElementById('manga-desglose-lote').innerHTML = Object.entries(cLote).map(([k, v]) => `<div>${k}: <strong>${v}</strong></div>`).join('');
}

// ==========================================
// ⚙️ 9. CONFIGURACIÓN DE LOTES Y VACUNAS
// ==========================================
async function cargarConfiguracionHato() {
    try {
        const snapLotes = await getDocs(query(collection(window.db, "configuracion_lotes")));
        const ulLotes = document.getElementById('lista-lotes-ui');
        ulLotes.innerHTML = '';
        snapLotes.forEach(doc => {
            ulLotes.innerHTML += `<li style="padding:5px 0; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between;"><span>📍 ${doc.data().nombre}</span><button onclick="window.eliminarItemConfig('configuracion_lotes', '${doc.id}')" style="background:none; border:none; color:red; cursor:pointer;">❌</button></li>`;
        });

        const snapVacunas = await getDocs(query(collection(window.db, "configuracion_vacunas")));
        const ulVacunas = document.getElementById('lista-vacunas-ui');
        ulVacunas.innerHTML = '';
        snapVacunas.forEach(doc => {
            ulVacunas.innerHTML += `<li style="padding:5px 0; display:flex; justify-content:space-between;"><span>💉 ${doc.data().nombre}</span><button onclick="window.eliminarItemConfig('configuracion_vacunas', '${doc.id}')" style="background:none; border:none; color:red; cursor:pointer;">❌</button></li>`;
        });
    } catch (e) { console.error(e); }
}

window.agregarLoteNuevo = async function() {
    const input = document.getElementById('input-nuevo-lote');
    if(!input.value.trim()) return;
    await addDoc(collection(window.db, "configuracion_lotes"), { nombre: input.value.trim() });
    input.value = ''; cargarConfiguracionHato();
};

document.getElementById('btn-add-vacuna')?.addEventListener('click', async () => {
    const input = document.getElementById('input-nueva-vacuna');
    if(!input.value.trim()) return;
    await addDoc(collection(window.db, "configuracion_vacunas"), { nombre: input.value.trim() });
    input.value = ''; cargarConfiguracionHato();
});

window.eliminarItemConfig = async function(coleccion, id) {
    if(confirm("¿Eliminar este ítem?")) {
        await deleteDoc(doc(window.db, coleccion, id)); cargarConfiguracionHato();
    }
};

async function cargarSelectLotes(finca) {
    try {
        const snap = await getDocs(query(collection(window.db, "configuracion_lotes")));
        const select = document.getElementById('a-lote');
        if(select) {
            select.innerHTML = '<option value="General">👉 General / Sin Asignar</option>';
            snap.forEach(doc => select.innerHTML += `<option value="${doc.data().nombre}">${doc.data().nombre}</option>`);
        }
    } catch (e) {}
}
async function cargarVacunasSelect(selectId) {
    try {
        const snap = await getDocs(query(collection(window.db, "configuracion_vacunas")));
        const select = document.getElementById(selectId);
        if(select) {
            select.innerHTML = '<option value="">Seleccione un tratamiento...</option>';
            snap.forEach(doc => select.innerHTML += `<option value="${doc.data().nombre}">${doc.data().nombre}</option>`);
        }
    } catch (e) {}
}

// ==========================================
// ➕ 10. CREAR ANIMAL NUEVO Y BATCH
// ==========================================
document.getElementById('form-animal')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerText = "Guardando...";

    try {
        const docRef = await addDoc(collection(window.db, "animales"), {
            finca: document.getElementById('a-finca-select').value,
            arete: document.getElementById('a-arete').value.trim(),
            lote: document.getElementById('a-lote').value,
            categoria: document.getElementById('a-categoria').value,
            fechaNacimiento: document.getElementById('a-nacimiento').value || null,
            padre: document.getElementById('a-padre').value.trim() || null,
            madre: document.getElementById('a-madre').value.trim() || null,
            estado: document.getElementById('a-estado').value,
            novedadSalud: '🟢 Sano',
            tercioGestacion: null,
            fechaRegistro: serverTimestamp(),
            rfid: null
        });
        
        const peso = document.getElementById('a-peso').value;
        if(peso) {
            await addDoc(collection(window.db, "animales", docRef.id, "pesajes"), {
                fecha: new Date().toISOString().split('T')[0], peso: Number(peso), nota: 'Registro Inicial'
            });
        }
        document.getElementById('modal-animal').style.display = 'none'; e.target.reset();
        alert("✅ Animal guardado.");
    } catch (error) { alert("Error: " + error.message); }
    finally { btn.disabled = false; btn.innerText = "Guardar"; }
});

// ==========================================
// ⚡ 11. ACCIONES MASIVAS
// ==========================================
window.abrirModalMasivo = async function() {
    const seleccionados = document.querySelectorAll('.chk-animal:checked');
    if (seleccionados.length === 0) return alert("Selecciona al menos un animal.");
    document.getElementById('m-count').innerText = seleccionados.length;
    cargarVacunasSelect('m-vacuna-nombre');
    document.getElementById('modal-masivo').style.display = 'flex';
};

document.getElementById('form-masivo')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-masivo');
    const seleccionados = document.querySelectorAll('.chk-animal:checked');
    const tipoAccion = document.getElementById('m-tipo').value;
    const vacunaSelect = document.getElementById('m-vacuna-nombre').value;
    const destetePeso = document.getElementById('m-destete-peso').value;

    if (tipoAccion === 'Sanidad' && !vacunaSelect) return alert("Selecciona la vacuna.");
    if (tipoAccion === 'Destete' && !destetePeso) return alert("Ingresa el peso de destete.");

    btn.disabled = true; btn.innerText = "Procesando...";
    try {
        const batch = writeBatch(window.db);
        const hoy = new Date().toISOString().split('T')[0];

        for (const chk of seleccionados) {
            const idDoc = chk.value;
            const docRef = doc(window.db, "animales", idDoc);
            
            if (tipoAccion === 'Sanidad') {
                batch.set(doc(collection(window.db, "animales", idDoc, "historial_reproductivo")), { fecha: hoy, tipo: 'Sanidad', detalle: `Masiva: ${vacunaSelect}` });
                batch.update(docRef, { novedadSalud: `🟢 Sano (Vac: ${vacunaSelect})` });
            } 
            else if (tipoAccion === 'Destete') {
                const fila = chk.closest('tr');
                const catActual = fila.getAttribute('data-categoria');
                let nuevaCat = catActual === 'Becerro' ? 'Maute' : (catActual === 'Becerra' ? 'Mauta' : catActual);
                
                batch.update(docRef, { categoria: nuevaCat });
                batch.set(doc(collection(window.db, "animales", idDoc, "historial_reproductivo")), { fecha: hoy, tipo: 'Destete', detalle: `Peso prom: ${destetePeso}Kg` });
                batch.set(doc(collection(window.db, "animales", idDoc, "pesajes")), { fecha: hoy, peso: Number(destetePeso), nota: 'Destete Masivo' });
            }
        }
        await batch.commit();
        alert("✅ Acción masiva completada.");
        document.getElementById('modal-masivo').style.display = 'none';
        document.getElementById('chk-all').checked = false;
    } catch (error) { alert("Error: " + error.message); }
    finally { btn.disabled = false; btn.innerText = "Ejecutar a Todos"; }
});

// ==========================================
// 👁️ 12. EXPEDIENTE (FICHA)
// ==========================================
window.verFichaAnimal = async function(id) {
    document.getElementById('modal-ficha').style.display = 'flex';
    document.getElementById('p-id-doc').value = id;
    document.getElementById('form-nuevo-repro').style.display = 'none';
    document.getElementById('form-destete').style.display = 'none';
    document.getElementById('form-cambio-categoria').style.display = 'none';

    try {
        const docSnap = await getDoc(doc(window.db, "animales", id));
        const data = docSnap.data();

        document.getElementById('f-arete').innerText = data.arete;
        document.getElementById('f-finca-tag').innerText = `📍 ${data.finca} | Lote: ${data.lote || 'General'}`;
        document.getElementById('f-categoria').innerText = data.categoria;
        document.getElementById('f-estado').innerText = data.estado === 'Gestante' ? `Gestante (T${data.tercioGestacion})` : data.estado;
        document.getElementById('f-padre').innerText = data.padre || 'N/D';
        document.getElementById('f-madre').innerText = data.madre || 'N/D';
        
        const histSalud = document.getElementById('f-historial-salud');
        let sal = data.novedadSalud || data.salud || "🟢 Sano";
        if(sal && sal !== '🟢 Sano' && !sal.includes('🟢')) {
            histSalud.innerHTML = `🔴 Alerta: ${sal}`;
            histSalud.style.background = '#fecdd3'; histSalud.style.color = '#9f1239';
        } else {
            histSalud.innerHTML = `🟢 ${sal}`;
            histSalud.style.background = '#d1fae5'; histSalud.style.color = '#065f46';
        }

        document.getElementById('btn-show-destete').style.display = ['Becerro', 'Becerra'].includes(data.categoria) ? 'inline-block' : 'none';
        
        const tRepro = document.getElementById('f-tabla-repro'); const tPesajes = document.getElementById('f-tabla-pesajes');
        tRepro.innerHTML = ''; tPesajes.innerHTML = '';

        const snapR = await getDocs(query(collection(window.db, "animales", id, "historial_reproductivo"), orderBy("fecha", "desc")));
        snapR.forEach(doc => { tRepro.innerHTML += `<tr><td><strong>${doc.data().tipo}</strong></td><td>${doc.data().fecha}</td><td>${doc.data().detalle || ''}</td></tr>`; });

        const snapP = await getDocs(query(collection(window.db, "animales", id, "pesajes"), orderBy("fecha", "asc")));
        let lastPeso = 0, lastFecha = null;
        snapP.forEach(doc => {
            const d = doc.data(); let gdp = '-';
            if (lastPeso > 0 && lastFecha) {
                const dias = (new Date(d.fecha) - new Date(lastFecha)) / (1000*60*60*24);
                if (dias > 0) gdp = ((d.peso - lastPeso) / dias).toFixed(2) + ' kg/d';
            }
            tPesajes.innerHTML = `<tr><td>${d.fecha}</td><td><strong>${d.peso} kg</strong></td><td style="color:green;">${gdp}</td></tr>` + tPesajes.innerHTML;
            lastPeso = d.peso; lastFecha = d.fecha;
        });
    } catch (e) { console.error(e); }
};

document.getElementById('form-cambio-categoria')?.addEventListener('submit', async(e) => {
    e.preventDefault(); const id = document.getElementById('p-id-doc').value;
    await updateDoc(doc(window.db, "animales", id), { categoria: document.getElementById('c-nueva-categoria').value });
    window.verFichaAnimal(id);
});

document.getElementById('form-destete')?.addEventListener('submit', async(e) => {
    e.preventDefault(); const id = document.getElementById('p-id-doc').value;
    const catAc = document.getElementById('f-categoria').innerText;
    let nuevaCat = catAc === 'Becerro' ? 'Maute' : (catAc === 'Becerra' ? 'Mauta' : catAc);
    
    const dPeso = document.getElementById('d-peso').value, dFecha = document.getElementById('d-fecha').value;
    const batch = writeBatch(window.db);
    batch.update(doc(window.db, "animales", id), { categoria: nuevaCat });
    batch.set(doc(collection(window.db, "animales", id, "historial_reproductivo")), { fecha: dFecha, tipo: 'Destete', detalle: `Destetado a ${dPeso}Kg` });
    batch.set(doc(collection(window.db, "animales", id, "pesajes")), { fecha: dFecha, peso: Number(dPeso), nota: 'Destete' });
    await batch.commit(); window.verFichaAnimal(id);
});

document.getElementById('form-nuevo-repro')?.addEventListener('submit', async(e) => {
    e.preventDefault(); const id = document.getElementById('p-id-doc').value;
    const f = document.getElementById('r-fecha').value, tipo = document.getElementById('r-tipo').value;
    let detalle = "", updateData = {};

    if (tipo === 'Palpación (+ Preñada)') {
        updateData.estado = 'Gestante'; updateData.tercioGestacion = document.getElementById('r-tercio').value;
        detalle = `Tercio: ${updateData.tercioGestacion}`;
    } else if (tipo === 'Parto') {
        updateData.estado = 'Activo/Creciendo'; updateData.tercioGestacion = null; updateData.categoria = 'Vaca Ordeño';
        detalle = "Parto registrado.";
        const criaArete = document.getElementById('r-cria-arete').value;
        if(criaArete) {
            detalle += ` Cría: ${criaArete}`;
            const criaRef = await addDoc(collection(window.db, "animales"), {
                finca: document.getElementById('f-finca-tag').innerText.split('|')[0].replace('📍','').trim(),
                arete: criaArete, categoria: document.getElementById('r-cria-sexo').value, fechaNacimiento: f,
                madre: document.getElementById('f-arete').innerText, estado: 'Activo/Creciendo', novedadSalud: '🟢 Sano', lote: 'General'
            });
            const criaPeso = document.getElementById('r-cria-peso').value;
            if(criaPeso) await addDoc(collection(window.db, "animales", criaRef.id, "pesajes"), { fecha: f, peso: Number(criaPeso), nota: 'Nacimiento' });
            alert("Cría registrada.");
        }
    } else if (tipo === 'Aborto' || tipo === 'Palpación (- Vacía)') {
        updateData.estado = 'Vacía'; updateData.tercioGestacion = null;
    }

    const batch = writeBatch(window.db);
    batch.set(doc(collection(window.db, "animales", id, "historial_reproductivo")), { fecha: f, tipo: tipo, detalle: detalle });
    if (Object.keys(updateData).length > 0) batch.update(doc(window.db, "animales", id), updateData);
    await batch.commit(); document.getElementById('form-nuevo-repro').reset(); window.verFichaAnimal(id);
});

// ==========================================
// 🗑️ 13. BAJAS Y NOVEDADES 
// ==========================================
window.mandarABaja = async function(id, arete) {
    if(confirm(`¿Registrar BAJA para ${arete}?`)) {
        await updateDoc(doc(window.db, "animales", id), { estado: 'Baja (Vendido/Muerto)' });
        document.getElementById('modal-ficha').style.display = 'none';
    }
};

window.eliminarAnimal = async function(id, arete) {
    if(confirm(`¿ELIMINAR A ${arete} PERMANENTEMENTE?`)) {
        await deleteDoc(doc(window.db, "animales", id));
        document.getElementById('modal-ficha').style.display = 'none';
    }
};

window.abrirModalNovedad = function(id, arete, salud = '') {
    document.getElementById('modal-novedad').style.display = 'flex';
    document.getElementById('n-id').value = id;
    document.getElementById('n-arete-display').innerText = arete;
    document.getElementById('n-estado-salud').value = '';
};

document.getElementById('form-novedad')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('n-id').value;
    const estado = document.getElementById('n-estado-salud').value;
    
    await updateDoc(doc(window.db, "animales", id), { novedadSalud: estado });
    await addDoc(collection(window.db, "animales", id, "historial_reproductivo"), {
        fecha: new Date().toISOString().split('T')[0], tipo: 'Salud', detalle: `Reporte Sanitario: ${estado}`
    });
    document.getElementById('modal-novedad').style.display = 'none';
});

// ==========================================
// 📥 14. EXPORTAR / IMPORTAR CSV
// ==========================================
window.exportarExcel = function(tableID, filename = 'Data') {
    let html = document.getElementById(tableID).outerHTML.replace(/ /g, '%20');
    let a = document.createElement("a");
    a.href = 'data:application/vnd.ms-excel, ' + html;
    a.download = filename + '.xls';
    a.click();
};

window.importarCSV = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(evt) {
        const rows = evt.target.result.split('\n');
        let importados = 0; const batch = writeBatch(window.db);
        const fincaStr = document.getElementById('finca-tag').innerText;
        let fincaActual = fincaStr.includes('El Sur') ? 'El Sur' : 'Agua Clara';
        
        for(let i=1; i < rows.length; i++) {
            if(!rows[i].trim()) continue;
            const cols = rows[i].split(',');
            if(cols.length >= 2) {
                batch.set(doc(collection(window.db, "animales")), {
                    finca: fincaActual, arete: cols[0].trim(), categoria: cols[1].trim(),
                    lote: cols[2] ? cols[2].trim() : 'General', fechaNacimiento: cols[3] ? cols[3].trim() : null,
                    estado: 'Activo/Creciendo', novedadSalud: '🟢 Sano', fechaRegistro: serverTimestamp(), rfid: null
                });
                importados++;
            }
        }
        if(importados > 0) {
            await batch.commit();
            alert(`✅ ${importados} animales importados.`);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
};

// ==========================================
// 🚀 15. AUTO-ARRANQUE DE DATOS INICIALES
// ==========================================
setTimeout(() => {
    if (window.db && window.cargarHato) {
        console.log("Cargando base de datos inicial...");
        window.cargarHato();
    }
}, 500);
