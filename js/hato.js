import { 
    collection, addDoc, query, where, onSnapshot, serverTimestamp,
    doc, deleteDoc, updateDoc, getDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let ID_DISPOSITIVO = localStorage.getItem('elbalui_dispositivo_id');
if (!ID_DISPOSITIVO) {
    ID_DISPOSITIVO = 'DEV-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    localStorage.setItem('elbalui_dispositivo_id', ID_DISPOSITIVO);
}

// ==========================================
// 🕒 HELPER DE FECHA LOCAL VENEZUELA (VET)
// ==========================================
function fechaLocalISO(fechaObj = new Date()) {
    try {
        return fechaObj.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
    } catch (_) {
        const y = fechaObj.getFullYear();
        const m = String(fechaObj.getMonth() + 1).padStart(2, '0');
        const d = String(fechaObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
}
window.fechaLocalISO = fechaLocalISO;

function notificar(mensaje, tipo = 'exito') {
    const limpio = String(mensaje).replace(/^[✅❌⚠️ℹ️]\s*/u, '');
    if (typeof window.mostrarToast === 'function') {
        window.mostrarToast(limpio, tipo);
    } else {
        console.log(`[${tipo.toUpperCase()}] ${limpio}`);
    }
}

window.obtenerFincaActual = function() {
    if (window.fincaActual) return window.fincaActual;
    const tag = document.getElementById('finca-tag');
    if (!tag) return 'Agua Clara';
    if (tag.innerText.includes('CONSOLIDADO')) return 'Global';
    if (tag.innerText.includes('EL SUR')) return 'El Sur';
    return 'Agua Clara';
};

window.datosHatoCache = [];
window.catalogoLotesCache = [];
window.catalogoPotrerosMapaCache = [];
window.catalogoVacunasCache = [];
window.metricasHatoActual = {
    totalActivos: 0,
    mautes: 0,
    gestantes: 0,
    bajas: 0,
    muertes: 0,
    tasaMortalidad: 0,
    natalidad: 0,
    animalesAborto: 0,
    totalAbortos: 0,
    tasaAbortos: 0,
    gdpPromedio: 0
};

let unsubscribeHato = null;
let unsubscribeLotes = null;
let unsubscribeVacunas = null;
const confirmacionesPendientes = new Map();

function confirmarEnDosPasos(clave, mensajeAviso, ventanaMs = 3500) {
    const ahora = Date.now();
    const expira = confirmacionesPendientes.get(clave) || 0;
    if (ahora < expira) {
        confirmacionesPendientes.delete(clave);
        return true;
    }
    confirmacionesPendientes.set(clave, ahora + ventanaMs);
    notificar(mensajeAviso, 'info');
    return false;
}

function esperarDbHato(maxIntentos = 50) {
    return new Promise((resolve) => {
        if (window.db) return resolve(window.db);
        let intentos = 0;
        const timer = setInterval(() => {
            if (window.db || ++intentos >= maxIntentos) {
                clearInterval(timer);
                resolve(window.db || null);
            }
        }, 150);
    });
}

function refrescarKPIsGlobales() {
    if (typeof window.actualizarTodosLosKPIs === 'function') {
        window.actualizarTodosLosKPIs();
    }
}

// ==========================================
// 📜 HELPER DE BITÁCORA (ONLINE + COLA OFFLINE)
// ==========================================
function registrarBitacoraHato(finca, tipo, descripcion) {
    const fincaActiva = typeof window.obtenerFincaActual === 'function' ? window.obtenerFincaActual() : '';
    const fincaFinal = finca || (fincaActiva && fincaActiva !== 'Global' ? fincaActiva : 'Agua Clara');
    if (navigator.onLine && typeof window.registrarEnBitacora === 'function') {
        window.registrarEnBitacora(fincaFinal, tipo, descripcion);
    } else {
        const colaBitacora = JSON.parse(localStorage.getItem('elbalui_bitacora_offline') || '[]');
        colaBitacora.push({
            finca: fincaFinal,
            tipo,
            descripcion,
            esPrueba: Boolean(window.modoTestActivo)
        });
        localStorage.setItem('elbalui_bitacora_offline', JSON.stringify(colaBitacora));
    }
}

// ==========================================
// 🌐 MONITOREO DE CONEXIÓN A INTERNET
// ==========================================
function actualizarEstadoConexion() {
    const statusBar = document.getElementById('offline-status-bar');
    if (!statusBar) return;
    
    if (navigator.onLine) {
        statusBar.style.background = '#10b981';
        statusBar.innerText = '🟢 Conectado - Sincronizado en Nube (Starlink / Datos)';
    } else {
        statusBar.style.background = '#334155';
        statusBar.innerText = '⚠️ Modo Sin Conexión - Guardando en memoria local del dispositivo';
    }
}
window.addEventListener('online', actualizarEstadoConexion);
window.addEventListener('offline', actualizarEstadoConexion);
actualizarEstadoConexion();

// ==========================================
// 🏷️ ESTACIÓN DE CONTROL DE MANGA (SESIÓN & FAENA)
// ==========================================
window.faenaActualLista = [];
window.modoMangaActual = 'conteo'; 

window.cambiarModoManga = function(nuevoModo) {
    window.modoMangaActual = nuevoModo;
    const containerRafaga = document.getElementById('manga-container-rafaga');
    if (containerRafaga) {
        containerRafaga.style.display = (nuevoModo === 'rafaga') ? 'block' : 'none';
    }
};

window.reiniciarSesionManga = function() {
    if (window.faenaActualLista.length === 0) {
        notificar("La faena actual ya está en cero.", "info");
        return;
    }
    if (!confirmarEnDosPasos('reiniciar-manga', 'Toca de nuevo "Nueva Faena" para reiniciar el contador a cero.')) {
        return;
    }
    window.faenaActualLista = [];
    actualizarTableroManga();
    const banner = document.getElementById('manga-alerta-banner');
    if (banner) banner.style.display = 'none';
    notificar("Faena de manga reiniciada.", "info");
};

function reproducirAlertaAudio() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch (_) {}
}

function mostrarAlertaManga(mensaje, esError = true, htmlExtra = '') {
    const banner = document.getElementById('manga-alerta-banner');
    if (!banner) return;
    banner.style.background = esError ? '#fef2f2' : '#f0fdf4';
    banner.style.borderColor = esError ? '#ef4444' : '#22c55e';
    banner.style.color = esError ? '#991b1b' : '#15803d';
    banner.style.display = 'block';
    banner.innerHTML = `<div>${mensaje}</div>${htmlExtra}`;
    reproducirAlertaAudio();
}

window.vincularChipDesdeManga = async function(codigoRFID) {
    const inputArete = document.getElementById('manga-vincular-arete-input');
    const areteAsociar = inputArete ? inputArete.value.trim() : '';
    if (!areteAsociar) {
        notificar("Escribe el número de arete físico para vincular.", "error");
        return;
    }

    const modoTest = Boolean(window.modoTestActivo);
    const animalPorArete = window.datosHatoCache.find(a =>
        Boolean(a.esPrueba) === modoTest &&
        String(a.arete || '').trim().toLowerCase() === areteAsociar.toLowerCase()
    );

    if (!animalPorArete) {
        notificar(`Arete "${areteAsociar}" no encontrado en el inventario activo.`, "error");
        return;
    }

    try {
        await updateDoc(doc(window.db, "animales", animalPorArete.id), { chipRFID: codigoRFID });
        registrarBitacoraHato(
            animalPorArete.finca,
            'Manga',
            `Chip RFID (${codigoRFID}) vinculado al Arete #${animalPorArete.arete}`
        );
        mostrarAlertaManga(`✅ Chip ${codigoRFID} vinculado al Arete #${animalPorArete.arete}. Escanea de nuevo para procesar.`, false);
        notificar(`Chip vinculado al arete ${animalPorArete.arete}.`, "exito");
        const inputLector = document.getElementById('rfid-scanner-input');
        if (inputLector) inputLector.focus();
    } catch (err) {
        notificar("Error vinculando chip: " + err.message, "error");
    }
};

function actualizarTableroManga() {
    const contadorUi = document.getElementById('contador-lote-manga');
    const desgloseCatUi = document.getElementById('manga-desglose-categoria');
    const desgloseLoteUi = document.getElementById('manga-desglose-lote');
    const tablaFaenaUi = document.getElementById('manga-tabla-faena-body');

    if (!contadorUi) return;
    contadorUi.innerText = window.faenaActualLista.length;

    const conteoCat = {};
    const conteoLote = {};

    if (window.faenaActualLista.length === 0) {
        if (tablaFaenaUi) {
            tablaFaenaUi.innerHTML = `<tr><td colspan="6" style="padding: 15px; text-align: center; color: #94a3b8;">No se han pasado animales por la manga en esta sesión.</td></tr>`;
        }
        if (desgloseCatUi) desgloseCatUi.innerHTML = '<em>Sin lecturas aún.</em>';
        if (desgloseLoteUi) desgloseLoteUi.innerHTML = '<em>Sin lecturas aún.</em>';
        return;
    }

    if (tablaFaenaUi) {
        tablaFaenaUi.innerHTML = '';
        window.faenaActualLista.slice().reverse().forEach((item, index) => {
            const cat = item.categoria || 'N/D';
            const lote = item.lote || 'General';

            conteoCat[cat] = (conteoCat[cat] || 0) + 1;
            conteoLote[lote] = (conteoLote[lote] || 0) + 1;

            const idxInverso = window.faenaActualLista.length - index;

            tablaFaenaUi.innerHTML += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">${idxInverso}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>${item.arete}</strong></td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${cat}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${lote}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0369a1;">${item.accionAplicada}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                        <button onclick="abrirFicha('${item.id}')" style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 2px 6px; border-radius: 4px; cursor: pointer;">👁️</button>
                    </td>
                </tr>
            `;
        });
    } else {
        window.faenaActualLista.forEach((item) => {
            const cat = item.categoria || 'N/D';
            const lote = item.lote || 'General';
            conteoCat[cat] = (conteoCat[cat] || 0) + 1;
            conteoLote[lote] = (conteoLote[lote] || 0) + 1;
        });
    }

    if (desgloseCatUi) {
        desgloseCatUi.innerHTML = Object.entries(conteoCat).map(([c, n]) => `<div><strong>${c}:</strong> ${n}</div>`).join('');
    }
    if (desgloseLoteUi) {
        desgloseLoteUi.innerHTML = Object.entries(conteoLote).map(([l, n]) => `<div><strong>${l}:</strong> ${n}</div>`).join('');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const intervalID = setInterval(() => {
        const inputLector = document.getElementById('rfid-scanner-input');
        if (inputLector) {
            clearInterval(intervalID);
            inputLector.addEventListener('keypress', async function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    
                    const rawLectura = inputLector.value ? inputLector.value.trim() : '';
                    inputLector.value = ''; 
                    if (!rawLectura) return;

                    const codigoNorm = rawLectura.replace(/\s+/g, '').toLowerCase();
                    const codigoSinCeros = codigoNorm.replace(/^0+/, '');
                    const modoTest = Boolean(window.modoTestActivo);

                    const animalEncontrado = window.datosHatoCache.find(a => {
                        if (Boolean(a.esPrueba) !== modoTest) return false;
                        const chipDb = a.chipRFID ? String(a.chipRFID).replace(/\s+/g, '').toLowerCase() : '';
                        const chipSinCeros = chipDb.replace(/^0+/, '');
                        const areteDb = a.arete ? String(a.arete).replace(/\s+/g, '').toLowerCase() : '';
                        return (
                            (chipDb && (chipDb === codigoNorm || (codigoSinCeros && chipSinCeros === codigoSinCeros))) ||
                            (areteDb && areteDb === codigoNorm)
                        );
                    });

                    if (animalEncontrado) {
                        const yaPaso = window.faenaActualLista.some(item => item.id === animalEncontrado.id);
                        if (yaPaso) {
                            mostrarAlertaManga(`⚠️ ¡ATENCIÓN! Arete #${animalEncontrado.arete} YA FUE PROCESADO en esta faena.`);
                            return;
                        }

                        let accionRealizada = 'Conteo / Lectura de Manga';

                        if (window.modoMangaActual === 'rafaga') {
                            const vacunaSel = document.getElementById('manga-vacuna-rafaga').value;
                            if (!vacunaSel) {
                                mostrarAlertaManga("⚠️ Por favor seleccione una vacuna activa para el Modo Ráfaga.");
                                return;
                            }
                            accionRealizada = `💉 Vacunado: ${vacunaSel}`;
                            
                            try {
                                const hoy = fechaLocalISO();
                                const docRef = doc(window.db, "animales", animalEncontrado.id);
                                const historialEventos = [...(animalEncontrado.historialReproductivo || [])];
                                historialEventos.push({
                                    tipo: '💉 Vacunación Ráfaga',
                                    fecha: hoy, detalle: vacunaSel, dispositivo: ID_DISPOSITIVO
                                });
                                await updateDoc(docRef, {
                                    salud: `🟢 Sano (Vacunado: ${vacunaSel})`,
                                    historialReproductivo: historialEventos
                                });
                                registrarBitacoraHato(
                                    animalEncontrado.finca,
                                    'Manga',
                                    `Vacunación ráfaga (${vacunaSel}) aplicada a Arete #${animalEncontrado.arete} (${animalEncontrado.categoria})`
                                );
                            } catch (err) { console.error("Error aplicando ráfaga:", err); }
                        } else {
                            registrarBitacoraHato(
                                animalEncontrado.finca,
                                'Manga',
                                `Lectura/Conteo en manga: Arete #${animalEncontrado.arete} (${animalEncontrado.categoria} - Lote: ${animalEncontrado.lote || 'General'})`
                            );
                        }

                        window.faenaActualLista.push({
                            id: animalEncontrado.id,
                            arete: animalEncontrado.arete,
                            categoria: animalEncontrado.categoria,
                            lote: animalEncontrado.lote || 'General',
                            accionAplicada: accionRealizada
                        });

                        actualizarTableroManga();
                        mostrarAlertaManga(`✅ Registrado: Arete #${animalEncontrado.arete} (${animalEncontrado.categoria})`, false);

                        if (window.modoMangaActual === 'conteo') {
                            window.abrirFicha(animalEncontrado.id);
                        }
                    } else {
                        const codigoEsc = rawLectura.replace(/'/g, "\\'").replace(/"/g, '"');
                        const formVincular = `
                            <div style="margin-top:8px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                                <input type="text" id="manga-vincular-arete-input" placeholder="N° Arete físico a vincular..." style="padding:6px 10px; border-radius:6px; border:1px solid #cbd5e1; max-width:200px;">
                                <button type="button" onclick="window.vincularChipDesdeManga('${codigoEsc}')" style="background:#0f172a; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-weight:700; cursor:pointer;">🔗 Vincular Chip</button>
                            </div>
                        `;
                        mostrarAlertaManga(`📡 Chip No Registrado: ${rawLectura}`, true, formVincular);
                    }
                }
            });
        }
    }, 500);
});

// ==========================================
// 🧭 CONTROL DE MINI-MENÚS HATO
// ==========================================
window.cambiarModuloHato = function(evento, idModulo) {
    const modulos = document.querySelectorAll('.modulo-hato');
    modulos.forEach(mod => mod.style.display = 'none');

    const botones = document.querySelectorAll('.tab-btn');
    botones.forEach(btn => {
        btn.style.background = 'white';
        btn.style.color = '#334155';
        btn.style.border = '1px solid #cbd5e1';
    });

    const destino = document.getElementById(idModulo);
    if (destino) destino.style.display = 'block';

    const btnActivo = evento.currentTarget;
    if (btnActivo) {
        btnActivo.style.background = '#0f172a';
        btnActivo.style.color = 'white';
        btnActivo.style.border = 'none';
    }

    if (idModulo === 'subtab-lector') {
        const inputLector = document.getElementById('rfid-scanner-input');
        if (inputLector) inputLector.focus();
    }
};

// ==========================================
// SELECCIÓN Y FILTROS EN TABLA
// ==========================================
window.toggleAllCheckboxes = function(source) {
    const checkboxes = document.querySelectorAll('.chk-animal');
    checkboxes.forEach(chk => {
        if (!chk.disabled && chk.closest('tr').style.display !== 'none') {
            chk.checked = source.checked;
        }
    });
};

window.aplicarFiltroHato = function() {
    const filtroSelect = document.getElementById('filtro-categoria');
    const filtroValor = filtroSelect ? filtroSelect.value : 'Todos';
    const inputBusqueda = document.getElementById('buscador-hato');
    const textoBusqueda = inputBusqueda ? inputBusqueda.value.toUpperCase() : "";
    const filas = document.querySelectorAll('#tabla-hato-body tr');
    const modoTest = Boolean(window.modoTestActivo);

    filas.forEach(fila => {
        if (!fila.hasAttribute('data-categoria')) return;

        const cat = fila.getAttribute('data-categoria');
        const estado = fila.getAttribute('data-estado');
        const arete = fila.getAttribute('data-arete').toUpperCase();
        const esPrueba = fila.getAttribute('data-prueba') === 'true';

        let mostrar = false;

        if (filtroValor === 'Pruebas') {
            mostrar = esPrueba;
        } else if (esPrueba === modoTest) {
            if (filtroValor === 'Todos' && estado !== 'Baja (Vendido/Muerto)') mostrar = true;
            else if (filtroValor === 'Bajas' && estado === 'Baja (Vendido/Muerto)') mostrar = true;
            else if (filtroValor === 'Becerros' && cat.includes('Becerr') && estado !== 'Baja (Vendido/Muerto)') mostrar = true;
            else if (filtroValor === 'Mautes' && cat.includes('Maut') && estado !== 'Baja (Vendido/Muerto)') mostrar = true;
            else if (filtroValor === 'Vacas' && cat.includes('Vaca') && estado !== 'Baja (Vendido/Muerto)') mostrar = true;
            else if (filtroValor === 'Gestantes' && estado === 'Gestante') mostrar = true;
        }

        if (mostrar && textoBusqueda !== "") {
            if (arete.indexOf(textoBusqueda) === -1) {
                mostrar = false;
            }
        }

        fila.style.display = mostrar ? '' : 'none';
        if (!mostrar) {
            const chk = fila.querySelector('.chk-animal');
            if (chk) chk.checked = false;
        }
    });
    
    const chkAll = document.getElementById('chk-all');
    if (chkAll) chkAll.checked = false;
};

// ==========================================
// 🚀 EXCEL CSV MASIVO
// ==========================================
window.exportarExcel = function(tablaId, nombreArchivo) {
    const tabla = document.getElementById(tablaId);
    if (!tabla) return;
    const filas = tabla.querySelectorAll('tr');
    const csv = [];
    
    for (let i = 0; i < filas.length; i++) {
        if (filas[i].style.display === "none") continue; 

        const fila = [];
        const columnas = filas[i].querySelectorAll('td, th');
        
        for (let j = 1; j < columnas.length - 1; j++) { 
            const texto = columnas[j].innerText.replace(/(\r\n|\n|\r)/gm, " - ");
            fila.push('"' + texto + '"');
        }
        if (fila.length > 0) {
            csv.push(fila.join(','));
        }
    }
    
    const csvString = csv.join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvString], { type: 'text/csv;charset=utf-8;' });
    const enlace = document.createElement("a");
    const url = URL.createObjectURL(blob);
    enlace.setAttribute("href", url);
    enlace.setAttribute("download", nombreArchivo + "_" + fechaLocalISO() + ".csv");
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    notificar("Archivo Excel/CSV descargado.", "exito");
};

window.importarCSV = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fincaActiva = window.obtenerFincaActual();
    if (fincaActiva !== 'Agua Clara' && fincaActiva !== 'El Sur') {
        notificar("Selecciona Agua Clara o El Sur (no Consolidado) antes de importar un CSV.", "error");
        event.target.value = '';
        return;
    }
    const fincaDestino = fincaActiva;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        const lineas = text.split('\n');
        let contador = 0;
        const hoy = fechaLocalISO();
        
        const batch = writeBatch(window.db);
        
        for (let i = 1; i < lineas.length; i++) { 
            const fila = lineas[i].split(',');
            if (fila.length >= 2) {
                const arete = fila[0].replace(/['"]/g, '').trim();
                const cat = fila[1].replace(/['"]/g, '').trim();
                if (!arete || !cat) continue;
                
                const lote = fila[2] ? fila[2].replace(/['"]/g, '').trim() : 'General';
                const peso = fila[3] ? Number(fila[3].replace(/['"]/g, '').trim()) : null;

                const refNuevo = doc(collection(window.db, "animales"));
                batch.set(refNuevo, {
                    finca: fincaDestino,
                    arete: arete,
                    categoria: cat,
                    lote: lote,
                    peso: peso,
                    historialPesos: peso ? [{ fecha: hoy, peso: peso, dispositivo: ID_DISPOSITIVO }] : [],
                    historialReproductivo: [],
                    padre: 'N/D', madre: 'N/D',
                    estado: 'Activo/Creciendo',
                    salud: "🟢 Sano",
                    esPrueba: Boolean(window.modoTestActivo),
                    fechaRegistro: serverTimestamp()
                });
                contador++;
            }
        }
        if (contador > 0) {
            try {
                document.body.style.cursor = 'wait';
                await batch.commit();
                registrarBitacoraHato(
                    fincaDestino,
                    'Inventario',
                    `Importación masiva CSV (${fincaDestino}): ${contador} animales incorporados al inventario`
                );
                notificar(`Importación exitosa en ${fincaDestino}: ${contador} animales registrados.`, "exito");
            } catch (err) {
                notificar("Error al importar: " + err.message, "error");
            } finally {
                document.body.style.cursor = 'default';
            }
        }
    };
    reader.readAsText(file);
    event.target.value = '';
};

// ==========================================
// 🔄 SINCRONIZADOR DE SELECTORES (LOTES, POTREROS Y VACUNAS)
// ==========================================
async function cargarPotrerosActivosDesdeFirestore() {
    if (!window.db) return window.catalogoPotrerosMapaCache;
    try {
        const snap = await getDocs(collection(window.db, "lotes_potreros"));
        const fincaActiva = window.obtenerFincaActual();
        const modoTest = Boolean(window.modoTestActivo);
        const activos = [];

        snap.forEach((docSnap) => {
            const data = docSnap.data();
            const esSub = (data.estado || "Activo") === "Subdividido";
            const okFinca = fincaActiva === "Global" || !data.finca || data.finca === fincaActiva;
            const okTest = modoTest ? true : data.esPrueba !== true;
            if (!esSub && okFinca && okTest && data.codigo) {
                activos.push({
                    id: docSnap.id,
                    codigo: String(data.codigo).trim(),
                    nombre: data.nombre || "",
                    usoActual: data.usoActual || "Pastoreo",
                    hectareas: Number(data.hectareas || 0)
                });
            }
        });

        activos.sort((a, b) => a.codigo.localeCompare(b.codigo));
        window.catalogoPotrerosMapaCache = activos;
    } catch (_) {}
    return window.catalogoPotrerosMapaCache;
}

function renderizarSelectoresLotes() {
    const selectLote = document.getElementById('a-lote');
    const selectMasivoLote = document.getElementById('m-nuevo-lote-select');
    const selectFichaLote = document.getElementById('f-lote-select');

    const nombresUnicos = new Set();
    const opciones = [`<option value="General">👉 General / Sin Asignar</option>`];

    window.catalogoPotrerosMapaCache.forEach((p) => {
        if (!p.codigo || nombresUnicos.has(p.codigo)) return;
        nombresUnicos.add(p.codigo);
        const etiqueta = p.nombre
            ? `🌿 ${p.codigo} — ${p.nombre} (${p.hectareas.toFixed(1)} ha)`
            : `🌿 ${p.codigo} (${p.hectareas.toFixed(1)} ha)`;
        opciones.push(`<option value="${p.codigo.replace(/"/g, '"')}">${etiqueta}</option>`);
    });

    window.catalogoLotesCache.forEach((l) => {
        if (!l.nombre || nombresUnicos.has(l.nombre)) return;
        nombresUnicos.add(l.nombre);
        opciones.push(`<option value="${l.nombre.replace(/"/g, '"')}">${l.nombre}</option>`);
    });

    const opcionesHtml = opciones.join('');

    if (selectLote) {
        const prev = selectLote.value;
        selectLote.innerHTML = opcionesHtml;
        if (prev && Array.from(selectLote.options).some(o => o.value === prev)) selectLote.value = prev;
    }
    if (selectMasivoLote) {
        const prev = selectMasivoLote.value;
        selectMasivoLote.innerHTML = opcionesHtml;
        if (prev && Array.from(selectMasivoLote.options).some(o => o.value === prev)) selectMasivoLote.value = prev;
    }
    if (selectFichaLote) {
        const valorActual = selectFichaLote.value;
        selectFichaLote.innerHTML = opcionesHtml;
        if (valorActual) {
            if (!Array.from(selectFichaLote.options).some(o => o.value === valorActual)) {
                const opt = document.createElement('option');
                opt.value = valorActual;
                opt.textContent = valorActual;
                selectFichaLote.appendChild(opt);
            }
            selectFichaLote.value = valorActual;
        }
    }
}

async function refrescarSelectoresLotesCompletos() {
    await cargarPotrerosActivosDesdeFirestore();
    renderizarSelectoresLotes();
}

function renderizarSelectoresVacunas() {
    const selectMasivoVacunas = document.getElementById('m-vacuna-nombre');
    const selectRafagaVacunas = document.getElementById('manga-vacuna-rafaga');

    const opcionesVacunas = window.catalogoVacunasCache
        .map(v => `<option value="${v.nombre}">${v.nombre}</option>`)
        .join('');

    if (selectMasivoVacunas) {
        selectMasivoVacunas.innerHTML = '<option value="">Seleccione un tratamiento...</option>' + opcionesVacunas;
    }
    if (selectRafagaVacunas) {
        selectRafagaVacunas.innerHTML = '<option value="">Seleccione vacuna activa...</option>' + opcionesVacunas;
    }
}

// ==========================================
// ⚡ ACCIÓN MASIVA (VACUNAS, DESTETE Y LOTE)
// ==========================================
window.abrirModalMasivo = async function() {
    const seleccionados = document.querySelectorAll('.chk-animal:checked');
    if (seleccionados.length === 0) {
        notificar("Seleccione al menos un animal en la tabla.", "error");
        return;
    }

    document.getElementById('m-count').innerText = seleccionados.length;
    document.getElementById('form-masivo').reset();
    document.getElementById('m-tipo').value = 'Sanidad';
    document.getElementById('m-div-vacuna').style.display = 'block';
    document.getElementById('m-div-destete').style.display = 'none';
    const divLote = document.getElementById('m-div-lote');
    if (divLote) divLote.style.display = 'none';

    if (window.db && window.catalogoVacunasCache.length === 0) {
        try {
            const snapVac = await getDocs(collection(window.db, "config_vacunas"));
            window.catalogoVacunasCache = snapVac.docs.map(d => ({ id: d.id, nombre: d.data().nombre }));
        } catch (e) { console.error("Error leyendo vacunas:", e); }
    }
    if (window.db && window.catalogoLotesCache.length === 0) {
        try {
            const snapLot = await getDocs(collection(window.db, "config_lotes"));
            window.catalogoLotesCache = snapLot.docs.map(d => ({ id: d.id, nombre: d.data().nombre || 'Lote Sin Nombre' }));
        } catch (e) { console.error("Error leyendo lotes:", e); }
    }

    renderizarSelectoresVacunas();
    await refrescarSelectoresLotesCompletos();

    document.getElementById('modal-masivo').style.display = 'flex';
};

const formMasivo = document.getElementById('form-masivo');
if (formMasivo) {
    formMasivo.onsubmit = async (e) => {
        e.preventDefault();
        if (!window.db) return notificar("Base de datos no inicializada.", "error");

        const tipoAccion = document.getElementById('m-tipo').value;
        const seleccionados = Array.from(document.querySelectorAll('.chk-animal:checked'));
        if (seleccionados.length === 0) return notificar("No hay animales seleccionados.", "error");

        const btn = document.getElementById('btn-submit-masivo');
        const fincaActual = window.obtenerFincaActual();
        
        btn.innerText = "Procesando Lote...";
        btn.disabled = true;

        const batch = writeBatch(window.db);
        const hoy = fechaLocalISO();

        try {
            if (tipoAccion === 'Sanidad') {
                const vacunaStr = document.getElementById('m-vacuna-nombre').value.trim();
                if (!vacunaStr) throw new Error("Seleccione el nombre de la vacuna o tratamiento.");
                
                for (const chk of seleccionados) {
                    const idDoc = chk.value;
                    const docRef = doc(window.db, "animales", idDoc);
                    const animalCache = window.datosHatoCache.find(a => a.id === idDoc);
                    const historialRepro = animalCache ? [...(animalCache.historialReproductivo || [])] : [];

                    historialRepro.push({
                        tipo: '💉 Vacunación Masiva',
                        fecha: hoy,
                        detalle: vacunaStr,
                        dispositivo: ID_DISPOSITIVO
                    });

                    batch.update(docRef, { 
                        salud: `🟢 Sano (Vacunado: ${vacunaStr})`,
                        historialReproductivo: historialRepro
                    });
                }

                await batch.commit();
                registrarBitacoraHato(
                    fincaActual,
                    'Inventario',
                    `Vacunación masiva (${vacunaStr}) aplicada a ${seleccionados.length} animales`
                );
                notificar(`Vacunación (${vacunaStr}) aplicada a ${seleccionados.length} animales.`, "exito");
            } 
            else if (tipoAccion === 'Destete') {
                const pesoPromedio = Number(document.getElementById('m-destete-peso').value);
                if (!pesoPromedio || pesoPromedio <= 0) throw new Error("Ingrese el peso promedio del destete en Kg.");

                let destetadosCount = 0;

                for (const chk of seleccionados) {
                    const idDoc = chk.value;
                    const docRef = doc(window.db, "animales", idDoc);
                    const animalCache = window.datosHatoCache.find(a => a.id === idDoc);
                    
                    if (animalCache && animalCache.categoria && animalCache.categoria.includes("Becerr")) {
                        const nuevaCat = (animalCache.categoria === 'Becerra') ? 'Mauta' : 'Maute';
                        const historialPesos = animalCache ? [...(animalCache.historialPesos || [])] : [];
                        historialPesos.push({ fecha: hoy, peso: pesoPromedio, dispositivo: ID_DISPOSITIVO });
                        batch.update(docRef, {
                            categoria: nuevaCat,
                            peso: pesoPromedio,
                            historialPesos: historialPesos
                        });
                        destetadosCount++;
                    }
                }

                if (destetadosCount === 0) {
                    throw new Error("Ninguno de los seleccionados es Becerro o Becerra.");
                }

                await batch.commit();
                registrarBitacoraHato(
                    fincaActual,
                    'Inventario',
                    `Destete masivo ejecutado en ${destetadosCount} becerros (Peso prom: ${pesoPromedio} kg)`
                );
                notificar(`Destete completado en ${destetadosCount} animales.`, "exito");
            }
            else if (tipoAccion === 'MoverLote') {
                const nuevoLote = document.getElementById('m-nuevo-lote-select').value;
                if (!nuevoLote) throw new Error("Seleccione el lote o potrero de destino.");

                for (const chk of seleccionados) {
                    const docRef = doc(window.db, "animales", chk.value);
                    batch.update(docRef, { lote: nuevoLote });
                }

                await batch.commit();
                registrarBitacoraHato(
                    fincaActual,
                    'Inventario',
                    `Traslado masivo de ${seleccionados.length} animales al lote/potrero "${nuevoLote}"`
                );
                notificar(`${seleccionados.length} animales movidos a "${nuevoLote}".`, "exito");
            }

            document.getElementById('modal-masivo').style.display = 'none';
            const chkAll = document.getElementById('chk-all');
            if (chkAll) chkAll.checked = false;
            seleccionados.forEach(chk => { chk.checked = false; });

        } catch (err) {
            notificar(err.message, "error");
        } finally {
            btn.innerText = "Ejecutar Acción a Todos";
            btn.disabled = false;
        }
    };
}

// ==========================================
// FUNCIONES BASE (ELIMINAR, BAJA DIFERENCIADA, NOVEDAD)
// ==========================================
window.eliminarAnimal = async function(idDoc, arete) {
    if (!confirmarEnDosPasos(`del-animal-${idDoc}`, `⚠️ Toca de nuevo "Eliminar" para borrar permanentemente el Arete #${arete}.`)) {
        return;
    }
    try { 
        const animalCache = window.datosHatoCache.find(a => a.id === idDoc);
        const fincaAnimal = animalCache ? animalCache.finca : window.obtenerFincaActual();
        await deleteDoc(doc(window.db, "animales", idDoc)); 
        registrarBitacoraHato(
            fincaAnimal,
            'Inventario',
            `Eliminación permanente de registro: Arete #${arete}`
        );
        document.getElementById('modal-ficha').style.display = 'none';
        notificar(`Registro del arete #${arete} eliminado.`, "exito");
    } 
    catch (err) { notificar("Error al eliminar: " + err.message, "error"); }
};

window.mandarABaja = function(idDoc, arete) {
    const modalFicha = document.getElementById('modal-ficha');
    if (!modalFicha) return;

    let panelBaja = document.getElementById('panel-baja-inline');
    if (!panelBaja) {
        panelBaja = document.createElement('div');
        panelBaja.id = 'panel-baja-inline';
        panelBaja.style.cssText = 'background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; margin-bottom:12px;';
        const cuerpoModal = modalFicha.querySelector('.modal-content') || modalFicha.firstElementChild;
        if (cuerpoModal) cuerpoModal.insertBefore(panelBaja, cuerpoModal.children[1] || null);
    }

    const areteEsc = String(arete || '').replace(/'/g, "\\'");
    panelBaja.style.display = 'block';
    panelBaja.innerHTML = `
        <div style="font-weight:700; color:#991b1b; margin-bottom:8px;">☠️ Registrar Salida / Baja — Arete #${arete}</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
            <div>
                <label style="font-size:0.78rem; font-weight:600; color:#7f1d1d;">Tipo de Baja</label>
                <select id="baja-tipo-select" style="width:100%; padding:7px; border-radius:6px; border:1px solid #fca5a5;">
                    <option value="Venta">💵 Venta / Descarte Comercial</option>
                    <option value="Muerte">☠️ Muerte / Mortalidad</option>
                    <option value="Traslado">🚚 Traslado Externo</option>
                </select>
            </div>
            <div>
                <label style="font-size:0.78rem; font-weight:600; color:#7f1d1d;">Fecha</label>
                <input type="date" id="baja-fecha-input" value="${fechaLocalISO()}" style="width:100%; padding:7px; border-radius:6px; border:1px solid #fca5a5;">
            </div>
        </div>
        <div style="margin-bottom:8px;">
            <label style="font-size:0.78rem; font-weight:600; color:#7f1d1d;">Motivo / Detalle</label>
            <input type="text" id="baja-motivo-input" placeholder="Ej. Venta matadero 430 kg / Timpanismo / Mordedura..." style="width:100%; padding:7px; border-radius:6px; border:1px solid #fca5a5;">
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button type="button" onclick="document.getElementById('panel-baja-inline').style.display='none'" style="background:#fff; color:#475569; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; cursor:pointer;">Cancelar</button>
            <button type="button" onclick="window.confirmarBajaAnimal('${idDoc}', '${areteEsc}')" style="background:#dc2626; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:700; cursor:pointer;">Confirmar Baja</button>
        </div>
    `;
};

window.confirmarBajaAnimal = async function(idDoc, arete) {
    const tipoBaja = document.getElementById('baja-tipo-select')?.value || 'Venta';
    const fechaBaja = document.getElementById('baja-fecha-input')?.value || fechaLocalISO();
    const motivo = (document.getElementById('baja-motivo-input')?.value || '').trim();

    if (!motivo) {
        notificar("Escribe el motivo o detalle de la baja.", "error");
        return;
    }

    try {
        const docRef = doc(window.db, "animales", idDoc);
        const snap = await getDoc(docRef);
        const data = snap.exists() ? snap.data() : {};
        const fincaAnimal = data.finca || window.obtenerFincaActual();
        const historialRepro = [...(data.historialReproductivo || [])];

        historialRepro.push({
            tipo: tipoBaja === 'Muerte' ? '☠️ Baja por Muerte' : `📤 Baja (${tipoBaja})`,
            fecha: fechaBaja,
            detalle: motivo,
            dispositivo: ID_DISPOSITIVO
        });

        await updateDoc(docRef, { 
            estado: "Baja (Vendido/Muerto)",
            tipoBaja: tipoBaja,
            fechaBaja: fechaBaja,
            salud: tipoBaja === 'Muerte' ? `☠️ Muerte: ${motivo}` : `📤 ${tipoBaja}: ${motivo}`,
            historialReproductivo: historialRepro
        });

        registrarBitacoraHato(
            fincaAnimal,
            'Inventario',
            `Baja [${tipoBaja}] registrada para Arete #${arete} (${fechaBaja}). Motivo: ${motivo}`
        );

        const panelBaja = document.getElementById('panel-baja-inline');
        if (panelBaja) panelBaja.style.display = 'none';
        document.getElementById('modal-ficha').style.display = 'none';
        notificar(`Arete #${arete} registrado como baja (${tipoBaja}).`, "exito");
    } catch (err) {
        notificar("Error al dar de baja: " + err.message, "error");
    }
};

window.abrirModalNovedad = function(idDoc, arete, saludActual) {
    document.getElementById('n-id').value = idDoc;
    document.getElementById('n-arete-display').innerText = arete;
    document.getElementById('n-estado-salud').value = (saludActual && saludActual !== 'undefined' && !saludActual.includes('Sano')) ? saludActual : "";
    document.getElementById('modal-novedad').style.display = 'flex';
};

const formNovedad = document.getElementById('form-novedad');
if (formNovedad) {
    formNovedad.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idDoc = document.getElementById('n-id').value;
        const nuevoEstado = document.getElementById('n-estado-salud').value.trim();
        const btn = formNovedad.querySelector('button[type="submit"]');
        
        btn.innerText = "Guardando..."; btn.disabled = true;
        try {
            const docRef = doc(window.db, "animales", idDoc);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const historialRepro = [...(data.historialReproductivo || [])];
                historialRepro.push({
                    tipo: '🏥 Novedad Salud', fecha: fechaLocalISO(), detalle: nuevoEstado, dispositivo: ID_DISPOSITIVO
                });
                await updateDoc(docRef, { salud: nuevoEstado, historialReproductivo: historialRepro });
                registrarBitacoraHato(
                    data.finca,
                    'Inventario',
                    `Novedad médica en Arete #${data.arete}: ${nuevoEstado}`
                );
            }
            document.getElementById('modal-novedad').style.display = 'none';
            notificar("Novedad médica guardada.", "exito");
        } catch (err) { notificar("Error: " + err.message, "error"); } 
        finally { btn.innerText = "Guardar Novedad"; btn.disabled = false; }
    });
}

// ==========================================
// LECTURA EN TIEMPO REAL (INVENTARIO Y CÁLCULOS)
// ==========================================
window.cargarHato = function() {
    const tabla = document.getElementById('tabla-hato-body');
    const panelAlertas = document.getElementById('panel-alertas');
    if (!tabla || !window.db) return;

    if (window.cargarListaLotes) window.cargarListaLotes();
    if (window.cargarListaVacunas) window.cargarListaVacunas();
    refrescarSelectoresLotesCompletos();

    if (unsubscribeHato) {
        unsubscribeHato();
        unsubscribeHato = null;
    }

    const fincaActiva = window.obtenerFincaActual();
    const q = (fincaActiva === 'Global')
        ? query(collection(window.db, "animales"))
        : query(collection(window.db, "animales"), where("finca", "==", fincaActiva));

    unsubscribeHato = onSnapshot(q, (snapshot) => {
        tabla.innerHTML = '';
        window.datosHatoCache = []; 
        const conteoSalud = {};
        const hoy = new Date();
        let filasVisiblesCount = 0;

        snapshot.forEach((documento) => {
            const a = documento.data();
            const idDoc = documento.id;
            window.datosHatoCache.push({ id: idDoc, ...a }); 
            
            const saludActual = a.salud || "🟢 Sano";
            const esBaja = (a.estado === "Baja (Vendido/Muerto)");
            const esPrueba = Boolean(a.esPrueba);

            if (!esBaja && !esPrueba && !saludActual.includes("Sano")) {
                conteoSalud[saludActual] = (conteoSalud[saludActual] || 0) + 1;
            }

            if (esPrueba !== Boolean(window.modoTestActivo)) {
                return;
            }

            filasVisiblesCount++;
            const escapeStr = (val) => String(val || '').replace(/'/g, "\\'");
            const nombreLote = a.lote ? a.lote : 'General';
            const etiquetaFinca = a.finca || 'Sin finca';
            const badgeTest = esPrueba
                ? ' <span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700;">TEST</span>'
                : '';

            let textoTiempo = `<span style="color:#94a3b8;">-</span>`;
            
            if (a.estado === "Gestante" && a.historialReproductivo) {
                let ultimaFep = null;
                a.historialReproductivo.forEach(ev => {
                    if (ev.tipo === 'Palpación (+ Preñada)' && ev.fep !== '-') ultimaFep = ev.fep;
                });
                if (ultimaFep) {
                    const diasParaParto = Math.ceil((new Date(ultimaFep) - hoy) / (1000 * 60 * 60 * 24));
                    if (diasParaParto < 0) textoTiempo = `<strong style="color:#dc2626;">¡Parto Atrasado!</strong>`;
                    else if (diasParaParto <= 60) textoTiempo = `<strong style="color:#ca8a04;">Faltan ${diasParaParto} días</strong>`;
                    else textoTiempo = `Faltan ${diasParaParto} días`;
                }
            } 
            else if (a.categoria && (a.categoria.includes("Becerr") || a.categoria.includes("Maut"))) {
                let fechaNac = a.fechaNacimiento;
                if (!fechaNac && a.historialPesos && a.historialPesos.length > 0) {
                    fechaNac = a.historialPesos[0].fecha;
                }
                if (fechaNac && fechaNac !== 'Registro inicial') {
                    const meses = Math.floor((hoy - new Date(fechaNac)) / (1000 * 60 * 60 * 24 * 30));
                    textoTiempo = meses > 0 ? `${meses} meses` : `Recién nacido`;
                    if (a.categoria.includes("Becerr") && meses >= 8) textoTiempo = `<strong style="color:#ca8a04;">${meses} meses (Pto. Destete)</strong>`;
                }
            }

            tabla.innerHTML += `
                <tr data-arete="${escapeStr(a.arete)}" data-categoria="${escapeStr(a.categoria)}" data-estado="${escapeStr(a.estado)}" data-prueba="${esPrueba ? 'true' : 'false'}">
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); text-align: center;">
                        <input type="checkbox" class="chk-animal" value="${idDoc}">
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">
                        <strong>${a.arete}</strong>${badgeTest}<br>
                        <span style="font-size: 0.7rem; color: #64748b;">${etiquetaFinca} | <strong>Lote: ${nombreLote}</strong></span>
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.categoria || ''}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-size: 0.8rem;">${textoTiempo}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-weight: 600; color: ${esBaja ? '#475569' : 'inherit'};">${saludActual}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); text-align: center; white-space: nowrap;">
                        <button onclick="abrirFicha('${idDoc}')" style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 4px;" title="Ver Expediente">👁️</button>
                        <button onclick="abrirModalNovedad('${idDoc}', '${escapeStr(a.arete)}', '${escapeStr(saludActual)}')" style="background: #fef2f2; color: #be123c; border: 1px solid #fecdd3; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 4px;" title="Reportar Novedad">🏥</button>
                    </td>
                </tr>
            `;
        });

        window.aplicarFiltroHato();
        actualizarDashboard(window.datosHatoCache);
        refrescarKPIsGlobales();

        if (panelAlertas) {
            let htmlAlertas = "";
            let totalEnfermos = 0;
            for (const [enfermedad, cantidad] of Object.entries(conteoSalud)) {
                htmlAlertas += `<span style="background: white; padding: 6px 12px; border-radius: 20px; border: 1px solid #fecdd3; color: #be123c; font-weight: 600;">${enfermedad}: ${cantidad}</span>`;
                totalEnfermos += cantidad;
            }
            panelAlertas.innerHTML = totalEnfermos === 0
                ? `<span style="background: #ecfdf5; padding: 6px 12px; border-radius: 20px; border: 1px solid #a7f3d0; color: #047857; font-weight: 600;">🟢 Hato 100% Sano.</span>`
                : htmlAlertas;
        }

        if (filasVisiblesCount === 0) {
            tabla.innerHTML = `<tr><td colspan="6" style="padding: 15px; text-align: center; color: var(--text-muted);">Sin animales registrados en esta vista.</td></tr>`;
        }
    }, (err) => console.error("Error Firestore:", err));
};

// ==========================================
// EXPEDIENTE CLÍNICO INDIVIDUAL (👁️)
// ==========================================
window.abrirFicha = async function(idDoc) {
    if (!window.db) return notificar("Base de datos no inicializada.", "error");
    try {
        await refrescarSelectoresLotesCompletos();
        const docRef = doc(window.db, "animales", idDoc);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return notificar("Expediente no encontrado.", "error");
        const a = docSnap.data();

        const panelBaja = document.getElementById('panel-baja-inline');
        if (panelBaja) panelBaja.style.display = 'none';
        
        document.getElementById('p-id-doc').value = idDoc;
        document.getElementById('form-nuevo-repro').style.display = 'none';
        document.getElementById('form-cambio-categoria').style.display = 'none';
        document.getElementById('form-destete').style.display = 'none';
        const formLoteChip = document.getElementById('form-editar-lote-chip');
        if (formLoteChip) formLoteChip.style.display = 'none';
        
        document.getElementById('r-tipo').value = 'Palpación (+ Preñada)';
        document.getElementById('div-tercio').style.display = 'block';
        document.getElementById('div-parto-cria').style.display = 'none';

        const btnDestete = document.getElementById('btn-show-destete');
        if (a.categoria === 'Becerro' || a.categoria === 'Becerra') btnDestete.style.display = 'inline-block';
        else btnDestete.style.display = 'none';
        
        const selCat = document.getElementById('c-nueva-categoria');
        if (a.categoria && Array.from(selCat.options).some(opt => opt.value === a.categoria)) selCat.value = a.categoria;

        const loteActual = a.lote || 'General';
        const chipActual = a.chipRFID || '';

        document.getElementById('f-arete').innerText = a.arete || 'N/D';
        document.getElementById('f-categoria').innerText = a.categoria || 'N/D';
        document.getElementById('f-finca-tag').innerText = `FINCA: ${(a.finca || 'SIN FINCA').toUpperCase()}`;
        const fLoteEl = document.getElementById('f-lote');
        if (fLoteEl) fLoteEl.innerText = loteActual;
        const fChipEl = document.getElementById('f-chip-rfid');
        if (fChipEl) fChipEl.innerText = chipActual || 'Sin chip';
        document.getElementById('f-padre').innerText = a.padre || 'N/D';
        document.getElementById('f-madre').innerText = a.madre || 'N/D';
        document.getElementById('f-estado').innerText = a.estado || 'Activo';

        const selFLote = document.getElementById('f-lote-select');
        if (selFLote) {
            if (!Array.from(selFLote.options).some(o => o.value === loteActual)) {
                const opt = document.createElement('option');
                opt.value = loteActual;
                opt.textContent = loteActual;
                selFLote.appendChild(opt);
            }
            selFLote.value = loteActual;
        }
        const inpFChip = document.getElementById('f-chip-input');
        if (inpFChip) inpFChip.value = chipActual;

        const historialSalud = document.getElementById('f-historial-salud');
        const saludActual = a.salud || "🟢 Sano";
        if (!saludActual.includes('Sano')) {
            historialSalud.innerHTML = `🔴 <strong>Novedad / Baja:</strong> ${saludActual}`;
            historialSalud.style.background = '#fff1f2';
            historialSalud.style.color = '#be123c';
            historialSalud.style.borderColor = '#fecdd3';
        } else {
            historialSalud.innerHTML = `🟢 ${saludActual}`;
            historialSalud.style.background = '#ecfdf5';
            historialSalud.style.color = '#047857';
            historialSalud.style.borderColor = '#a7f3d0';
        }

        const tbodyRepro = document.getElementById('f-tabla-repro');
        const alertaRepro = document.getElementById('f-alerta-repro');
        alertaRepro.innerHTML = ''; 
        tbodyRepro.innerHTML = '';
        
        const historialRepro = a.historialReproductivo || [];
        let ultimaFechaClave = null; 
        let ultimaFep = null; 

        if (historialRepro.length === 0) tbodyRepro.innerHTML = `<tr><td colspan="3" style="padding: 10px; text-align: center; color: var(--text-muted);">Sin eventos.</td></tr>`;
        else {
            historialRepro.forEach((ev) => {
                if (ev.tipo === 'Parto' || ev.tipo === 'Aborto') {
                    if (!ultimaFechaClave || new Date(ev.fecha) > new Date(ultimaFechaClave)) ultimaFechaClave = ev.fecha;
                }
                if (ev.tipo === 'Palpación (+ Preñada)' && ev.fep !== '-') {
                    if (!ultimaFep || new Date(ev.fep) > new Date(ultimaFep)) ultimaFep = ev.fep;
                }

                let detalle = ev.detalle || '-';
                if (ev.tipo === 'Palpación (+ Preñada)') detalle = `Tercio: <strong>${ev.tercio}</strong> | FEP: <strong style="color:var(--green-dark);">${ev.fep}</strong>`;
                else if (ev.tipo === 'Aborto') detalle = `<span style="color:#dc2626; font-weight:bold;">⚠️ Aborto.</span>`;

                tbodyRepro.innerHTML += `<tr><td style="padding: 6px; border-bottom: 1px solid var(--border-light); font-weight:bold;">${ev.tipo}</td><td style="padding: 6px; border-bottom: 1px solid var(--border-light);">${ev.fecha}</td><td style="padding: 6px; border-bottom: 1px solid var(--border-light);">${detalle}</td></tr>`;
            });
        }

        if (ultimaFechaClave && a.estado !== 'Gestante' && a.estado !== 'Baja (Vendido/Muerto)' && a.categoria && a.categoria.includes("Vaca")) {
            const diffDias = Math.floor((new Date() - new Date(ultimaFechaClave)) / (1000 * 60 * 60 * 24));
            if (diffDias >= 730) alertaRepro.innerHTML += `<div style="background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; padding: 12px; border-radius: 8px; margin-bottom: 10px; font-weight: bold; font-size: 0.85rem;">⚠️ ALERTA INFERTILIDAD: ${diffDias} días vacía.</div>`;
        }
        if (a.estado === 'Gestante' && ultimaFep) {
            const diffDiasParto = Math.ceil((new Date(ultimaFep) - new Date()) / (1000 * 60 * 60 * 24));
            if (diffDiasParto <= 75 && diffDiasParto >= 0 && a.categoria === 'Vaca Ordeño') {
                alertaRepro.innerHTML += `<div style="background: #fef3c7; border: 1px solid #fde68a; color: #b45309; padding: 12px; border-radius: 8px; margin-bottom: 10px; font-weight: bold; font-size: 0.85rem;">⚠️ ALERTA SECADO: Faltan ~${diffDiasParto} días para parto. Secar Vaca.</div>`;
            }
        }

        const tbodyPesajes = document.getElementById('f-tabla-pesajes');
        tbodyPesajes.innerHTML = '';
        const historialPesos = a.historialPesos ? [...a.historialPesos] : [];
        if (historialPesos.length === 0 && a.peso) historialPesos.push({ fecha: 'Registro inicial', peso: a.peso });

        if (historialPesos.length === 0) tbodyPesajes.innerHTML = `<tr><td colspan="3" style="padding: 10px; text-align: center; color: var(--text-muted);">Sin pesajes.</td></tr>`;
        else {
            for (let i = 0; i < historialPesos.length; i++) {
                const actual = historialPesos[i];
                let gdpTexto = '<span style="color: var(--text-muted);">-</span>';
                if (i > 0) {
                    const anterior = historialPesos[i - 1];
                    const diffKg = actual.peso - anterior.peso;
                    if (anterior.fecha && actual.fecha && anterior.fecha !== 'Registro inicial' && actual.fecha !== 'Registro inicial') {
                        const diffDias = Math.max(1, Math.round((new Date(actual.fecha) - new Date(anterior.fecha)) / (1000 * 60 * 60 * 24)));
                        const gdp = (diffKg / diffDias).toFixed(3);
                        gdpTexto = `<strong style="color: ${gdp >= 0 ? 'var(--green-dark)' : '#dc2626'};">${gdp > 0 ? '+' : ''}${gdp} kg/día</strong>`;
                    }
                }
                tbodyPesajes.innerHTML += `<tr><td style="padding: 6px; border-bottom: 1px solid var(--border-light);">${actual.fecha || 'N/D'}</td><td style="padding: 6px; border-bottom: 1px solid var(--border-light); font-weight: bold;">${actual.peso} kg</td><td style="padding: 6px; border-bottom: 1px solid var(--border-light);">${gdpTexto}</td></tr>`;
            }
        }

        document.getElementById('modal-ficha').style.display = 'flex';
    } catch (err) { notificar("Error: " + err.message, "error"); }
};

// ==========================================
// FORMULARIOS DENTRO DE LA FICHA
// ==========================================
const formEditarLoteChip = document.getElementById('form-editar-lote-chip');
if (formEditarLoteChip) {
    formEditarLoteChip.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idDoc = document.getElementById('p-id-doc').value;
        const nuevoLote = (document.getElementById('f-lote-select')?.value || 'General').trim() || 'General';
        const nuevoChip = (document.getElementById('f-chip-input')?.value || '').trim();
        try {
            const animalCache = window.datosHatoCache.find(a => a.id === idDoc);
            await updateDoc(doc(window.db, "animales", idDoc), {
                lote: nuevoLote,
                chipRFID: nuevoChip
            });
            registrarBitacoraHato(
                animalCache ? animalCache.finca : window.obtenerFincaActual(),
                'Inventario',
                `Actualizado Arete #${animalCache ? animalCache.arete : idDoc}: Lote "${nuevoLote}"${nuevoChip ? `, Chip RFID: ${nuevoChip}` : ''}`
            );
            notificar("Lote y Chip RFID actualizados.", "exito");
            window.abrirFicha(idDoc);
        } catch (err) { notificar("Error: " + err.message, "error"); }
    });
}

const formCambioCategoria = document.getElementById('form-cambio-categoria');
if (formCambioCategoria) {
    formCambioCategoria.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idDoc = document.getElementById('p-id-doc').value;
        const nuevaCat = document.getElementById('c-nueva-categoria').value;
        try {
            const animalCache = window.datosHatoCache.find(a => a.id === idDoc);
            await updateDoc(doc(window.db, "animales", idDoc), { categoria: nuevaCat });
            registrarBitacoraHato(
                animalCache ? animalCache.finca : window.obtenerFincaActual(),
                'Inventario',
                `Cambio de categoría: Arete #${animalCache ? animalCache.arete : idDoc} pasó a ${nuevaCat}`
            );
            notificar("Categoría actualizada.", "exito");
            window.abrirFicha(idDoc);
        } catch (err) { notificar("Error: " + err.message, "error"); }
    });
}

const formNuevoRepro = document.getElementById('form-nuevo-repro');
if (formNuevoRepro) {
    formNuevoRepro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idDoc = document.getElementById('p-id-doc').value;
        const fecha = document.getElementById('r-fecha').value;
        const tipoEvento = document.getElementById('r-tipo').value;
        
        try {
            const docRef = doc(window.db, "animales", idDoc);
            const docSnap = await getDoc(docRef);
            const data = docSnap.data();
            const historialRepro = [...(data.historialReproductivo || [])];
            let fep = '-', nuevoEstado = data.estado, nuevaCat = data.categoria, detalle = '', tercioStr = '-';
            let logExtra = '';

            if (tipoEvento === 'Palpación (+ Preñada)') {
                nuevoEstado = 'Gestante';
                const tercio = document.getElementById('r-tercio').value;
                const d = new Date(fecha + 'T12:00:00');
                if (tercio === '1') { d.setDate(d.getDate() + 210); tercioStr = '1er Tercio'; }
                else if (tercio === '2') { d.setDate(d.getDate() + 120); tercioStr = '2do Tercio'; }
                else if (tercio === '3') { d.setDate(d.getDate() + 30); tercioStr = '3er Tercio'; }
                fep = fechaLocalISO(d);
                detalle = `Confirmada preñez en ${tercioStr}.`;
                logExtra = ` (${tercioStr}, FEP: ${fep})`;
            } 
            else if (tipoEvento === 'Palpación (- Vacía)') { nuevoEstado = 'Vacía'; detalle = 'Vacía.'; } 
            else if (tipoEvento === 'Aborto') { nuevoEstado = 'Vacía'; detalle = 'Aborto registrado.'; }
            else if (tipoEvento === 'Parto') {
                nuevoEstado = 'Vacía';
                if (data.categoria === 'Novilla' || data.categoria === 'Vaca Seca / Escampa') nuevaCat = 'Vaca Ordeño';
                detalle = 'Parto exitoso.';
                const areteCria = document.getElementById('r-cria-arete').value.trim();
                if (areteCria) {
                    const fincaCria = data.finca || (window.obtenerFincaActual() !== 'Global' ? window.obtenerFincaActual() : 'Agua Clara');
                    const sexoCria = document.getElementById('r-cria-sexo').value;
                    const pesoCria = document.getElementById('r-cria-peso').value ? Number(document.getElementById('r-cria-peso').value) : null;
                    detalle += ` Nacimiento Cría: ${areteCria}.`;
                    logExtra = ` - Cría registrada: Arete #${areteCria} (${sexoCria})`;
                    await addDoc(collection(window.db, "animales"), {
                        finca: fincaCria, arete: areteCria, categoria: sexoCria,
                        peso: pesoCria, fechaNacimiento: fecha, lote: data.lote || 'General',
                        historialPesos: pesoCria ? [{ fecha: fecha, peso: pesoCria, dispositivo: ID_DISPOSITIVO }] : [],
                        historialReproductivo: [], padre: 'N/D', madre: data.arete || 'N/D', estado: 'Activo/Creciendo', salud: "🟢 Sano",
                        esPrueba: Boolean(window.modoTestActivo), fechaRegistro: serverTimestamp()
                    });
                }
            }
            historialRepro.push({ tipo: tipoEvento, fecha: fecha, tercio: tercioStr, fep: fep, detalle: detalle, dispositivo: ID_DISPOSITIVO });
            await updateDoc(docRef, { estado: nuevoEstado, categoria: nuevaCat, historialReproductivo: historialRepro });
            registrarBitacoraHato(
                data.finca,
                'Inventario',
                `Evento reproductivo [${tipoEvento}] en Arete #${data.arete}${logExtra}`
            );
            document.getElementById('form-nuevo-repro').style.display = 'none';
            notificar("Evento guardado.", "exito");
            window.abrirFicha(idDoc);
        } catch (err) { notificar("Error: " + err.message, "error"); }
    });
}

const formDestete = document.getElementById('form-destete');
if (formDestete) {
    formDestete.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idDoc = document.getElementById('p-id-doc').value;
        const fechaDestete = document.getElementById('d-fecha').value;
        const pesoDestete = Number(document.getElementById('d-peso').value);
        try {
            const docRef = doc(window.db, "animales", idDoc);
            const docSnap = await getDoc(docRef);
            const data = docSnap.data();
            const nuevaCat = (data.categoria === 'Becerra') ? 'Mauta' : 'Maute';
            const historialPesos = [...(data.historialPesos || [])];
            historialPesos.push({ fecha: fechaDestete, peso: pesoDestete, dispositivo: ID_DISPOSITIVO });
            await updateDoc(docRef, { categoria: nuevaCat, peso: pesoDestete, historialPesos: historialPesos });
            if (data.madre && data.madre !== 'N/D') {
                const madreQuery = query(collection(window.db, "animales"), where("finca", "==", data.finca), where("arete", "==", data.madre));
                const madreSnapshot = await getDocs(madreQuery);
                if (!madreSnapshot.empty) {
                    const madreDoc = madreSnapshot.docs[0];
                    const madreHistorial = [...(madreDoc.data().historialReproductivo || [])];
                    madreHistorial.push({ tipo: '🏅 Destete Cría', fecha: fechaDestete, detalle: `Destetó a su cría con ${pesoDestete} Kg.`, dispositivo: ID_DISPOSITIVO });
                    await updateDoc(doc(window.db, "animales", madreDoc.id), { historialReproductivo: madreHistorial });
                }
            }
            registrarBitacoraHato(
                data.finca,
                'Inventario',
                `Destete individual: Arete #${data.arete} pasó a ${nuevaCat} con ${pesoDestete} kg`
            );
            notificar("Destete completado.", "exito");
            document.getElementById('form-destete').style.display = 'none';
            window.abrirFicha(idDoc);
        } catch (err) { notificar("Error: " + err.message, "error"); }
    });
}

// ==========================================
// REGISTRO DE NUEVO ANIMAL
// ==========================================
const formAnimal = document.getElementById('form-animal');
if (formAnimal) {
    formAnimal.onsubmit = async (e) => {
        e.preventDefault();

        if (!window.db) {
            notificar("Base de datos no inicializada.", "error");
            return;
        }

        const obtenerValor = (id) => {
            const elemento = document.getElementById(id);
            if (!elemento) {
                throw new Error(`Falta el campo visual con ID: "${id}".`);
            }
            return elemento.value;
        };

        const btn = formAnimal.querySelector('button[type="submit"]');
        if (btn) {
            btn.innerText = "Guardando...";
            btn.disabled = true;
        }

        try {
            let fincaVal = obtenerValor('a-finca-select');
            if (!fincaVal || fincaVal === 'Global') {
                const activa = window.obtenerFincaActual();
                fincaVal = (activa && activa !== 'Global') ? activa : 'Agua Clara';
            }

            const areteVal = obtenerValor('a-arete').trim();
            if (!areteVal) throw new Error("Ingrese el número de arete o ID.");

            const modoTest = Boolean(window.modoTestActivo);
            const duplicado = window.datosHatoCache.find(a =>
                Boolean(a.esPrueba) === modoTest &&
                a.finca === fincaVal &&
                a.estado !== 'Baja (Vendido/Muerto)' &&
                String(a.arete || '').trim().toLowerCase() === areteVal.toLowerCase()
            );
            if (duplicado) {
                throw new Error(`Ya existe un animal activo con el Arete #${areteVal} en ${fincaVal}.`);
            }

            const categoriaVal = obtenerValor('a-categoria');
            const nacimientoVal = obtenerValor('a-nacimiento') || null;
            const pesoInput = obtenerValor('a-peso').trim();
            const pesoValor = pesoInput !== '' ? Number(pesoInput) : null;
            const padreVal = obtenerValor('a-padre').trim() || 'N/D';
            const madreVal = obtenerValor('a-madre').trim() || 'N/D';
            const estadoVal = obtenerValor('a-estado');
            const chipRfidVal = (document.getElementById('a-chip-rfid')?.value || '').trim();

            const loteInput = document.getElementById('a-lote');
            const loteValor = (loteInput && loteInput.value.trim() !== '') ? loteInput.value.trim() : 'General';

            const nuevoAnimal = {
                finca: fincaVal,
                arete: areteVal,
                categoria: categoriaVal,
                lote: loteValor,
                chipRFID: chipRfidVal,
                peso: pesoValor,
                fechaNacimiento: nacimientoVal,
                historialPesos: pesoValor ? [{ fecha: fechaLocalISO(), peso: pesoValor, dispositivo: ID_DISPOSITIVO }] : [],
                historialReproductivo: [],
                padre: padreVal,
                madre: madreVal,
                estado: estadoVal,
                salud: "🟢 Sano",
                esPrueba: modoTest,
                fechaRegistro: serverTimestamp()
            };

            try {
                await addDoc(collection(window.db, "animales"), nuevoAnimal);
            } catch (firestoreErr) {
                if (!navigator.onLine) {
                    const pendientesOffline = JSON.parse(localStorage.getItem('elbalui_pendientes_offline') || '[]');
                    pendientesOffline.push(nuevoAnimal);
                    localStorage.setItem('elbalui_pendientes_offline', JSON.stringify(pendientesOffline));
                } else {
                    throw firestoreErr;
                }
            }

            registrarBitacoraHato(
                fincaVal,
                'Inventario',
                `Nuevo animal registrado: Arete #${areteVal} (${categoriaVal}) - Lote: ${loteValor}${pesoValor ? ' - Peso: ' + pesoValor + ' kg' : ''}`
            );

            notificar(
                navigator.onLine
                    ? `Animal #${areteVal} guardado correctamente.`
                    : `Animal #${areteVal} guardado sin conexión (pendiente de sincronizar).`,
                "exito"
            );
            formAnimal.reset();
            document.getElementById('modal-animal').style.display = 'none';

        } catch (err) {
            notificar(err.message, "error");
        } finally {
            if (btn) {
                btn.innerText = "Guardar Animal";
                btn.disabled = false;
            }
        }
    };
}

// ==========================================
// 📍 ADMINISTRACIÓN DE LOTES Y POTREROS
// ==========================================
window.cargarListaLotes = function() {
    const listaUI = document.getElementById('lista-lotes-ui');
    if (!listaUI || !window.db) return;

    if (unsubscribeLotes) {
        refrescarSelectoresLotesCompletos();
        return;
    }

    unsubscribeLotes = onSnapshot(query(collection(window.db, "config_lotes")), (snapshot) => {
        window.catalogoLotesCache = [];
        listaUI.innerHTML = `<li style="padding: 8px 5px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;"><span>👉 General / Sin Asignar</span></li>`;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const loteId = docSnap.id;
            const nombreLote = data.nombre || 'Lote Sin Nombre';
            window.catalogoLotesCache.push({ id: loteId, nombre: nombreLote });
            
            listaUI.innerHTML += `
                <li style="padding: 8px 5px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; color: var(--green-dark);">👉 ${nombreLote}</span>
                    <button onclick="window.eliminarLoteActivo('${loteId}', '${nombreLote.replace(/'/g, "\\'")}')" style="background: #fef2f2; color: #ef4444; border: 1px solid #fecdd3; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-weight: bold;" title="Borrar Lote">❌</button>
                </li>
            `;
        });
        refrescarSelectoresLotesCompletos();
    }, (err) => {
        unsubscribeLotes = null;
        console.error("Error cargando lotes:", err);
    });
};

window.agregarLoteNuevo = async function() {
    const inputLote = document.getElementById('input-nuevo-lote');
    const nombreLote = inputLote.value.trim();
    if (!nombreLote) return notificar("Escriba un nombre para el lote.", "error");
    
    try {
        await addDoc(collection(window.db, "config_lotes"), { nombre: nombreLote, fechaCreacion: serverTimestamp() });
        registrarBitacoraHato(
            window.obtenerFincaActual(),
            'Inventario',
            `Nuevo lote/potrero configurado: "${nombreLote}"`
        );
        inputLote.value = ''; 
        notificar(`Lote "${nombreLote}" creado.`, "exito");
    } catch (err) { notificar("Error al crear lote: " + err.message, "error"); }
};

window.eliminarLoteActivo = async function(idLote, nombreLote) {
    if (!confirmarEnDosPasos(`del-lote-${idLote}`, `Toca de nuevo ❌ para eliminar el lote "${nombreLote}".`)) {
        return;
    }
    try { 
        await deleteDoc(doc(window.db, "config_lotes", idLote)); 
        registrarBitacoraHato(
            window.obtenerFincaActual(),
            'Inventario',
            `Lote/potrero eliminado: "${nombreLote}"`
        );
        notificar(`Lote "${nombreLote}" eliminado.`, "exito");
    } 
    catch (err) { notificar("Error al borrar el lote: " + err.message, "error"); }
};

// ==========================================
// 💉 ADMINISTRACIÓN DE VACUNAS Y TRATAMIENTOS
// ==========================================
window.cargarListaVacunas = function() {
    const listaVacunasUI = document.getElementById('lista-vacunas-ui');
    if (!listaVacunasUI || !window.db) return;

    if (unsubscribeVacunas) {
        renderizarSelectoresVacunas();
        return;
    }

    unsubscribeVacunas = onSnapshot(query(collection(window.db, "config_vacunas")), (snapshot) => {
        window.catalogoVacunasCache = [];
        listaVacunasUI.innerHTML = '';

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const vacunaId = docSnap.id;
            const nombreVacuna = data.nombre;
            if (!nombreVacuna) return;

            window.catalogoVacunasCache.push({ id: vacunaId, nombre: nombreVacuna });
            
            listaVacunasUI.innerHTML += `
                <li style="padding: 8px 5px; border-bottom: 1px solid #fef08a; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; color: #854d0e;">👉 ${nombreVacuna}</span>
                    <button onclick="window.eliminarVacunaActiva('${vacunaId}', '${nombreVacuna.replace(/'/g, "\\'")}')" style="background: #fef2f2; color: #ef4444; border: 1px solid #fecdd3; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-weight: bold;">❌</button>
                </li>
            `;
        });

        if (window.catalogoVacunasCache.length === 0) {
            listaVacunasUI.innerHTML = '<li style="padding: 5px 0; font-style: italic; color: #a16207;">No hay tratamientos registrados.</li>';
        }
        renderizarSelectoresVacunas();
    }, (err) => {
        unsubscribeVacunas = null;
        console.error("Error cargando vacunas:", err);
    });
};

window.agregarVacunaNueva = async function() {
    const inputVacuna = document.getElementById('input-nueva-vacuna');
    const nombreVacuna = inputVacuna.value.trim();
    if (!nombreVacuna) return notificar("Escriba el nombre de la vacuna o tratamiento.", "error");
    try {
        await addDoc(collection(window.db, "config_vacunas"), { nombre: nombreVacuna });
        registrarBitacoraHato(
            window.obtenerFincaActual(),
            'Inventario',
            `Nuevo tratamiento sanitario añadido al catálogo: "${nombreVacuna}"`
        );
        inputVacuna.value = ''; 
        notificar(`Tratamiento "${nombreVacuna}" añadido.`, "exito");
    } catch (err) { notificar("Error: " + err.message, "error"); }
};

window.eliminarVacunaActiva = async function(idVacuna, nombreVacuna) {
    if (!confirmarEnDosPasos(`del-vac-${idVacuna}`, `Toca de nuevo ❌ para eliminar "${nombreVacuna}".`)) {
        return;
    }
    try { 
        await deleteDoc(doc(window.db, "config_vacunas", idVacuna)); 
        registrarBitacoraHato(
            window.obtenerFincaActual(),
            'Inventario',
            `Tratamiento sanitario eliminado del catálogo: "${nombreVacuna}"`
        );
        notificar(`Tratamiento "${nombreVacuna}" eliminado.`, "exito");
    } 
    catch (err) { notificar("Error: " + err.message, "error"); }
};

// ==========================================
// MOTOR DE TIEMPO Y TORRE DE CONTROL
// ==========================================
function actualizarDashboard(datosHato) {
    const listSecado = document.getElementById('dash-list-secado');
    const countSecado = document.getElementById('dash-count-secado');
    const listDestete = document.getElementById('dash-list-destete');
    const countDestete = document.getElementById('dash-count-destete');

    const kpiMort = document.getElementById('kpi-mortalidad');
    const kpiNat = document.getElementById('kpi-natalidad');
    const kpiGdp = document.getElementById('kpi-gdp-promedio');

    const fincaActiva = window.obtenerFincaActual();
    const reales = datosHato.filter(a => {
        if (a.esPrueba) return false;
        if (fincaActiva !== 'Global' && a.finca && a.finca !== fincaActiva) return false;
        return true;
    });

    const activos = reales.filter(a => a.estado !== 'Baja (Vendido/Muerto)');
    const bajas = reales.filter(a => a.estado === 'Baja (Vendido/Muerto)');
    const muertes = bajas.filter(a => {
        if (a.tipoBaja === 'Muerte') return true;
        if (a.tipoBaja === 'Venta' || a.tipoBaja === 'Traslado') return false;
        const txt = `${a.salud || ''} ${a.estado || ''}`.toLowerCase();
        return txt.includes('muert') || txt.includes('mortal') || txt.includes('muerte');
    });

    const baseMort = activos.length + muertes.length;
    const pctMort = baseMort > 0 ? (muertes.length / baseMort) * 100 : 0;

    const mautes = activos.filter(a => a.categoria && (a.categoria.includes('Maute') || a.categoria.includes('Mauta'))).length;
    const gestantes = activos.filter(a => a.estado === 'Gestante').length;

    const vientresActivos = activos.filter(a =>
        a.categoria && (a.categoria.includes('Vaca') || a.categoria === 'Novilla')
    ).length;
    const criasTotal = reales.filter(a => a.categoria && a.categoria.includes('Becerr')).length;
    const pctNat = vientresActivos > 0 ? (criasTotal / vientresActivos) * 100 : 0;

    let animalesAborto = 0;
    let totalAbortos = 0;
    reales.forEach(a => {
        const histRepro = a.historialReproductivo || [];
        const abortosAnimal = histRepro.filter(ev => ev.tipo === 'Aborto').length;
        if (abortosAnimal > 0) {
            animalesAborto++;
            totalAbortos += abortosAnimal;
        }
    });
    const pctAbortos = vientresActivos > 0 ? (animalesAborto / vientresActivos) * 100 : 0;

    let sumaGdp = 0;
    let countGdp = 0;
    reales.forEach(a => {
        const hist = a.historialPesos || [];
        for (let i = 1; i < hist.length; i++) {
            const ant = hist[i - 1];
            const act = hist[i];
            if (ant.fecha && act.fecha && ant.fecha !== 'Registro inicial' && act.fecha !== 'Registro inicial') {
                const dias = Math.max(1, Math.round((new Date(act.fecha) - new Date(ant.fecha)) / (1000 * 60 * 60 * 24)));
                const gdp = (Number(act.peso) - Number(ant.peso)) / dias;
                if (!isNaN(gdp)) {
                    sumaGdp += gdp;
                    countGdp++;
                }
            }
        }
    });
    const gdpProm = countGdp > 0 ? sumaGdp / countGdp : 0;

    window.metricasHatoActual = {
        totalActivos: activos.length,
        mautes,
        gestantes,
        bajas: bajas.length,
        muertes: muertes.length,
        tasaMortalidad: pctMort,
        natalidad: pctNat,
        animalesAborto,
        totalAbortos,
        tasaAbortos: pctAbortos,
        gdpPromedio: gdpProm
    };

    if (kpiMort) kpiMort.innerText = `${pctMort.toFixed(1)}%`;
    if (kpiNat) kpiNat.innerText = `${pctNat.toFixed(1)}%`;
    if (kpiGdp) kpiGdp.innerText = `${gdpProm >= 0 ? '' : '-'}${Math.abs(gdpProm).toFixed(3)} kg/d`;

    if (!listSecado || !listDestete) return;

    let htmlSecado = "";
    let htmlDestete = "";
    let numSecado = 0;
    let numDestete = 0;
    const hoy = new Date();

    reales.forEach(a => {
        if (a.estado === 'Baja (Vendido/Muerto)') return;

        if (a.estado === "Gestante" && a.historialReproductivo) {
            let ultimaFep = null;
            a.historialReproductivo.forEach(ev => {
                if (ev.tipo === 'Palpación (+ Preñada)' && ev.fep !== '-') ultimaFep = ev.fep;
            });
            if (ultimaFep) {
                const diasParaParto = Math.ceil((new Date(ultimaFep) - hoy) / (1000 * 60 * 60 * 24));
                if (diasParaParto <= 75) {
                    numSecado++;
                    const alertaStyle = diasParaParto < 0 ? "color:#dc2626; font-weight:bold;" : "color:#b45309; font-weight:bold;";
                    const mensaje = diasParaParto < 0 ? `¡Parto Atrasado por ${Math.abs(diasParaParto)} días!` : `Faltan ${diasParaParto} días para parto.`;
                    const badgeSecar = (diasParaParto <= 60 && a.categoria === 'Vaca Ordeño') ? `<span style="background:#ef4444; color:white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-left: 5px;">URGENTE SECAR</span>` : '';
                    
                    htmlSecado += `
                        <div style="border-bottom: 1px solid var(--border-light); padding: 8px 0; display:flex; justify-content:space-between; align-items:center;">
                            <div><strong style="color:var(--text-dark);">${a.arete}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(${a.categoria})</span></div>
                            <div style="text-align:right;">
                                <div style="${alertaStyle}">${mensaje}</div>
                                ${badgeSecar}
                            </div>
                        </div>`;
                }
            }
        }

        if (a.categoria && a.categoria.includes("Becerr")) {
            let fechaNac = a.fechaNacimiento;
            if (!fechaNac && a.historialPesos && a.historialPesos.length > 0) fechaNac = a.historialPesos[0].fecha;
            
            if (fechaNac && fechaNac !== 'Registro inicial') {
                const meses = Math.floor((hoy - new Date(fechaNac)) / (1000 * 60 * 60 * 24 * 30));
                if (meses >= 7) {
                    numDestete++;
                    const color = meses >= 8 ? "#dc2626" : "#a16207"; 
                    htmlDestete += `
                        <div style="border-bottom: 1px solid var(--border-light); padding: 8px 0; display:flex; justify-content:space-between; align-items:center;">
                            <div><strong style="color:var(--text-dark);">${a.arete}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">Madre: ${a.madre}</span></div>
                            <div style="font-weight:bold; color:${color};">${meses} meses de edad</div>
                        </div>`;
                }
            }
        }
    });

    if (countSecado) countSecado.innerText = numSecado;
    listSecado.innerHTML = numSecado > 0 ? htmlSecado : `<p style="color: var(--text-muted); font-style: italic; padding: 10px 0;">🟢 Ninguna vaca próxima a secado/parto.</p>`;
    
    if (countDestete) countDestete.innerText = numDestete;
    listDestete.innerHTML = numDestete > 0 ? htmlDestete : `<p style="color: var(--text-muted); font-style: italic; padding: 10px 0;">🟢 Ningún becerro ha alcanzado la edad de destete aún.</p>`;
}

// ==========================================
// 🚀 Sincronización automática al reconectar
// ==========================================
window.addEventListener('online', async () => {
    const pendientes = JSON.parse(localStorage.getItem('elbalui_pendientes_offline') || '[]');
    if (pendientes.length > 0 && window.db) {
        for (const animal of pendientes) {
            try {
                await addDoc(collection(window.db, "animales"), {
                    ...animal,
                    fechaRegistro: serverTimestamp()
                });
            } catch (e) { console.error("Error sincronizando:", e); }
        }
        localStorage.removeItem('elbalui_pendientes_offline');
        notificar("¡Datos locales sincronizados con la nube!", "exito");
    }

    const bitacoraPendiente = JSON.parse(localStorage.getItem('elbalui_bitacora_offline') || '[]');
    if (bitacoraPendiente.length > 0 && typeof window.registrarEnBitacora === 'function') {
        for (const item of bitacoraPendiente) {
            await window.registrarEnBitacora(item.finca, item.tipo, item.descripcion + ' [Sync Offline]');
        }
        localStorage.removeItem('elbalui_bitacora_offline');
    }
});

// ==========================================
// 🚀 INICIALIZACIÓN FINAL DEL ERP
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const btnAddVacuna = document.getElementById('btn-add-vacuna');
    if (btnAddVacuna) {
        btnAddVacuna.onclick = window.agregarVacunaNueva;
    }

    window.addEventListener('fincaCambiada', () => {
        refrescarSelectoresLotesCompletos();
    });

    window.addEventListener('kpisActualizados', () => {
        refrescarSelectoresLotesCompletos();
    });

    const db = await esperarDbHato();
    if (db) {
        if (window.cargarListaLotes) window.cargarListaLotes();
        if (window.cargarListaVacunas) window.cargarListaVacunas();
        await refrescarSelectoresLotesCompletos();
    }
});
