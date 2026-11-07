// js/hato.js
import { 
    collection, addDoc, query, where, onSnapshot, serverTimestamp,
    doc, deleteDoc, updateDoc, getDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

function obtenerFincaActual() {
    const tag = document.getElementById('finca-tag');
    if (!tag) return 'Agua Clara';
    if (tag.innerText.includes('CONSOLIDADO')) return 'Global';
    if (tag.innerText.includes('EL SUR')) return 'El Sur';
    return 'Agua Clara';
}

window.datosHatoCache = [];

// ==========================================
// 🏷️ LECTOR RFID (CONTROL DE LOTE + FICHA)
// ==========================================
window.animalesPasadosHoy = new Set(); // Memoria para el lote en la manga

document.addEventListener('DOMContentLoaded', () => {
    const intervalID = setInterval(() => {
        const inputLector = document.getElementById('rfid-scanner-input');
        if (inputLector) {
            clearInterval(intervalID);

            inputLector.addEventListener('keypress', async function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    
                    const codigoRFID = inputLector.value ? inputLector.value.trim().toLowerCase() : '';
                    inputLector.value = ''; // Limpieza segura

                    if (!codigoRFID) return;

                    console.log("📡 Chip escaneado en manga:", codigoRFID);

                    if (window.datosHatoCache && window.datosHatoCache.length > 0) {
                        const animalEncontrado = window.datosHatoCache.find(a => {
                            const chipDb = a.chipRFID ? String(a.chipRFID).trim().toLowerCase() : '';
                            const areteDb = a.arete ? String(a.arete).trim().toLowerCase() : '';
                            return (chipDb === codigoRFID) || (areteDb === codigoRFID);
                        });

                        if (animalEncontrado) {
                            window.animalesPasadosHoy.add(animalEncontrado.id);
                            
                            const totalPasados = window.animalesPasadosHoy.size;
                            const contadorUi = document.getElementById('contador-lote-manga');
                            if (contadorUi) contadorUi.innerText = totalPasados;

                            console.log(`✅ LOTE MANGA: Animal ${animalEncontrado.arete} registrado. Total pasados: ${totalPasados}`);

                            if (typeof window.abrirFicha === 'function') {
                                window.abrirFicha(animalEncontrado.id);
                            } else {
                                alert(`✅ Animal: Arete ${animalEncontrado.arete}\n📊 Lote actual en manga: ${totalPasados} animales.`);
                            }
                        } else {
                            const areteAsociar = prompt(`📡 ¡Chip nuevo detectado (${codigoRFID})!\n\nEste código no está registrado. Escriba el número de arete físico exacto:`);
                            
                            if (areteAsociar && areteAsociar.trim() !== '') {
                                const animalPorArete = window.datosHatoCache.find(a => 
                                    a.arete.trim().toLowerCase() === areteAsociar.trim().toLowerCase()
                                );

                                if (animalPorArete) {
                                    try {
                                        await updateDoc(doc(window.db, "animales", animalPorArete.id), {
                                            chipRFID: codigoRFID
                                        });
                                        alert(`✅ ¡Chip vinculado al arete ${animalPorArete.arete} con éxito!`);
                                        
                                        if (typeof window.cargarHato === 'function') window.cargarHato();

                                        window.animalesPasadosHoy.add(animalPorArete.id);
                                        const contadorUi = document.getElementById('contador-lote-manga');
                                        if (contadorUi) contadorUi.innerText = window.animalesPasadosHoy.size;

                                        window.abrirFicha(animalPorArete.id);
                                    } catch (err) { alert("❌ Error al guardar el chip: " + err.message); }
                                } else { alert(`⚠️ No se encontró ningún animal con el arete "${areteAsociar}" en esta finca.`); }
                            }
                        }
                    } else { alert("⚠️ Sincronizando datos del hato. Espere un segundo e intente de nuevo."); }
                }
            });
        }
    }, 500);
});

// ==========================================
// 🧭 CONTROL DE MINI-MENÚS (PESTAÑAS DEL HATO)
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

    document.getElementById(idModulo).style.display = 'block';

    const btnActivo = evento.currentTarget;
    btnActivo.style.background = '#0f172a';
    btnActivo.style.color = 'white';
    btnActivo.style.border = 'none';

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
        if(!chk.disabled && chk.closest('tr').style.display !== 'none') {
            chk.checked = source.checked;
        }
    });
};

window.aplicarFiltroHato = function() {
    const filtro = document.getElementById('filtro-categoria').value;
    const filas = document.querySelectorAll('#tabla-hato-body tr');
    
    filas.forEach(fila => {
        if(fila.cells.length < 2) return;
        const categoria = fila.cells[2].innerText;
        const estado = fila.cells[3].innerText;
        let mostrar = false;

        if (filtro === 'Todos') mostrar = true;
        else if (filtro === 'Becerros' && (categoria.includes('Becerr'))) mostrar = true;
        else if (filtro === 'Mautes' && (categoria.includes('Maut'))) mostrar = true;
        else if (filtro === 'Vacas' && (categoria.includes('Vaca'))) mostrar = true;
        else if (filtro === 'Gestantes' && estado === 'Gestante') mostrar = true;

        fila.style.display = mostrar ? '' : 'none';
        if(!mostrar) {
            const chk = fila.querySelector('.chk-animal');
            if(chk) chk.checked = false;
        }
    });
    document.getElementById('chk-all').checked = false;
};

// ==========================================
// ⚡ ACCIÓN MASIVA (VACUNAS Y DESTETE LOTE)
// ==========================================
window.abrirModalMasivo = function() {
    const seleccionados = document.querySelectorAll('.chk-animal:checked');
    if (seleccionados.length === 0) return alert("⚠️ Seleccione al menos un animal de la lista.");
    
    document.getElementById('m-count').innerText = seleccionados.length;
    document.getElementById('form-masivo').reset();
    document.getElementById('m-div-vacuna').style.display = 'block';
    document.getElementById('m-div-destete').style.display = 'none';
    document.getElementById('modal-masivo').style.display = 'flex';
};

const formMasivo = document.getElementById('form-masivo');
if (formMasivo) {
    formMasivo.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tipoAccion = document.getElementById('m-tipo').value;
        const seleccionados = document.querySelectorAll('.chk-animal:checked');
        const btn = document.getElementById('btn-submit-masivo');
        
        btn.innerText = "Procesando Lote..."; btn.disabled = true;
        const batch = writeBatch(window.db);
        const hoy = new Date().toISOString().split('T')[0];

        try {
            if (tipoAccion === 'Sanidad') {
                const vacunaStr = document.getElementById('m-vacuna-nombre').value.trim();
                if (!vacunaStr) throw new Error("Seleccione el nombre de la vacuna o tratamiento.");
                
                for (let chk of seleccionados) {
                    const idDoc = chk.value;
                    const docRef = doc(window.db, "animales", idDoc);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        batch.update(docRef, { salud: `🟢 Sano (Vacunado: ${vacunaStr})` });
                    }
                }
                await batch.commit();
                alert(`✅ Vacunación (${vacunaStr}) aplicada a ${seleccionados.length} animales.`);
            } 
            else if (tipoAccion === 'Destete') {
                const pesoPromedio = Number(document.getElementById('m-destete-peso').value);
                if (!pesoPromedio) throw new Error("Ingrese el peso promedio del destete.");

                for (let chk of seleccionados) {
                    const idDoc = chk.value;
                    const docRef = doc(window.db, "animales", idDoc);
                    const docSnap = await getDoc(docRef);
                    
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        if (data.categoria.includes("Becerr")) {
                            let nuevaCat = (data.categoria === 'Becerra') ? 'Mauta' : 'Maute';
                            let historialPesos = data.historialPesos || [];
                            historialPesos.push({ fecha: hoy, peso: pesoPromedio });
                            batch.update(docRef, { categoria: nuevaCat, peso: pesoPromedio, historialPesos: historialPesos });
                        }
                    }
                }
                await batch.commit();
                alert(`✅ Destete completado. Los becerros seleccionados han ascendido a Mautes.`);
            }

            document.getElementById('modal-masivo').style.display = 'none';
            document.getElementById('chk-all').checked = false;
        } catch (err) { alert("Error en Acción Masiva: " + err.message); } 
        finally { btn.innerText = "Ejecutar Acción a Todos"; btn.disabled = false; }
    });
}

// ==========================================
// FUNCIONES BASE (ELIMINAR, NOVEDAD)
// ==========================================
window.eliminarAnimal = async function(idDoc, arete) {
    if (confirm(`¿Eliminar permanentemente Arete "${arete}"?`)) {
        try { 
            await deleteDoc(doc(window.db, "animales", idDoc)); 
            document.getElementById('modal-ficha').style.display = 'none';
        } 
        catch (err) { alert("Error al eliminar: " + err.message); }
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
            await updateDoc(doc(window.db, "animales", idDoc), { salud: nuevoEstado });
            document.getElementById('modal-novedad').style.display = 'none';
        } catch (err) { alert("Error: " + err.message); } 
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

    const fincaActiva = obtenerFincaActual();
    let q = (fincaActiva === 'Global')
        ? query(collection(window.db, "animales"))
        : query(collection(window.db, "animales"), where("finca", "==", fincaActiva));

    onSnapshot(q, (snapshot) => {
        tabla.innerHTML = '';
        window.datosHatoCache = []; 
        let total = 0, mautes = 0, gestantes = 0;
        let conteoSalud = {};
        const hoy = new Date();

        snapshot.forEach((documento) => {
            const a = documento.data();
            const idDoc = documento.id;
            window.datosHatoCache.push({ id: idDoc, ...a }); 
            
            const saludActual = a.salud || "🟢 Sano";
            total++;
            if (a.categoria === "Maute" || a.categoria === "Mauta" || a.categoria === "Lote ElbaLui (Maute)") mautes++;
            if (a.estado === "Gestante") gestantes++;
            if (!saludActual.includes("Sano")) conteoSalud[saludActual] = (conteoSalud[saludActual] || 0) + 1;

            const escapeStr = (val) => String(val || '').replace(/'/g, "\\'");
            const nombreLote = a.lote ? a.lote : 'General';

            let textoTiempo = `<span style="color:#94a3b8;">-</span>`;
            
            if (a.estado === "Gestante" && a.historialReproductivo) {
                let ultimaFep = null;
                a.historialReproductivo.forEach(ev => {
                    if(ev.tipo === 'Palpación (+ Preñada)' && ev.fep !== '-') ultimaFep = ev.fep;
                });
                if (ultimaFep) {
                    const diasParaParto = Math.ceil((new Date(ultimaFep) - hoy) / (1000 * 60 * 60 * 24));
                    if (diasParaParto < 0) textoTiempo = `<strong style="color:#dc2626;">¡Parto Atrasado!</strong>`;
                    else if (diasParaParto <= 60) textoTiempo = `<strong style="color:#ca8a04;">Faltan ${diasParaParto} días</strong>`;
                    else textoTiempo = `Faltan ${diasParaParto} días`;
                }
            } 
            else if (a.categoria.includes("Becerr") || a.categoria.includes("Maut")) {
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
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); text-align: center;">
                        <input type="checkbox" class="chk-animal" value="${idDoc}">
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">
                        <strong>${a.arete}</strong><br>
                        <span style="font-size: 0.7rem; color: #64748b;">${a.finca} | <strong>Lote: ${nombreLote}</strong></span>
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.categoria}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-size: 0.8rem;">${textoTiempo}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-weight: 600;">${saludActual}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); text-align: center; white-space: nowrap;">
                        <button onclick="abrirFicha('${idDoc}')" style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 4px;" title="Ver Expediente">👁️</button>
                        <button onclick="abrirModalNovedad('${idDoc}', '${escapeStr(a.arete)}', '${escapeStr(saludActual)}')" style="background: #fef2f2; color: #be123c; border: 1px solid #fecdd3; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 4px;" title="Reportar Novedad">🏥</button>
                    </td>
                </tr>
            `;
        });

        aplicarFiltroHato();
        actualizarDashboard(window.datosHatoCache);

        if (document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = total;
        if (document.getElementById('kpi-mautes')) document.getElementById('kpi-mautes').innerText = mautes;
        if (document.getElementById('kpi-gestantes')) document.getElementById('kpi-gestantes').innerText = gestantes;

        let htmlAlertas = "";
        let totalEnfermos = 0;
        for (const [enfermedad, cantidad] of Object.entries(conteoSalud)) {
            htmlAlertas += `<span style="background: white; padding: 6px 12px; border-radius: 20px; border: 1px solid #fecdd3; color: #be123c; font-weight: 600;">${enfermedad}: ${cantidad}</span>`;
            totalEnfermos += cantidad;
        }
        panelAlertas.innerHTML = totalEnfermos === 0 ? `<span style="background: #ecfdf5; padding: 6px 12px; border-radius: 20px; border: 1px solid #a7f3d0; color: #047857; font-weight: 600;">🟢 Hato 100% Sano.</span>` : htmlAlertas;

        if (total === 0) tabla.innerHTML = `<tr><td colspan="6" style="padding: 15px; text-align: center; color: var(--text-muted);">Sin animales registrados.</td></tr>`;
    }, (err) => console.error("Error Firestore:", err));
};

// ==========================================
// EXPEDIENTE CLÍNICO INDIVIDUAL (👁️)
// ==========================================
window.abrirFicha = async function(idDoc) {
    if (!window.db) return alert("⚠️ Base de datos no inicializada.");
    try {
        const docRef = doc(window.db, "animales", idDoc);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return alert("⚠️ Expediente no encontrado.");
        const a = docSnap.data();
        
        document.getElementById('p-id-doc').value = idDoc;
        document.getElementById('form-nuevo-repro').style.display = 'none';
        document.getElementById('form-cambio-categoria').style.display = 'none';
        document.getElementById('form-destete').style.display = 'none';
        
        document.getElementById('r-tipo').value = 'Palpación (+ Preñada)';
        document.getElementById('div-tercio').style.display = 'block';
        document.getElementById('div-parto-cria').style.display = 'none';

        const btnDestete = document.getElementById('btn-show-destete');
        if (a.categoria === 'Becerro' || a.categoria === 'Becerra') btnDestete.style.display = 'inline-block';
        else btnDestete.style.display = 'none';
        
        const selCat = document.getElementById('c-nueva-categoria');
        if (a.categoria && Array.from(selCat.options).some(opt => opt.value === a.categoria)) selCat.value = a.categoria;

        document.getElementById('f-arete').innerText = a.arete || 'N/D';
        document.getElementById('f-categoria').innerText = a.categoria || 'N/D';
        document.getElementById('f-finca-tag').innerText = `FINCA: ${(a.finca || 'Agua Clara').toUpperCase()}`;
        document.getElementById('f-padre').innerText = a.padre || 'N/D';
        document.getElementById('f-madre').innerText = a.madre || 'N/D';
        document.getElementById('f-estado').innerText = a.estado || 'Activo';

        const historialSalud = document.getElementById('f-historial-salud');
        const saludActual = a.salud || "🟢 Sano";
        if (!saludActual.includes('Sano')) {
            historialSalud.innerHTML = `🔴 <strong>Novedad:</strong> ${saludActual}`;
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

        if (ultimaFechaClave && a.estado !== 'Gestante' && a.categoria.includes("Vaca")) {
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
        const historialPesos = a.historialPesos || [];
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
    } catch (err) { alert("❌ Error: " + err.message); }
};

// ==========================================
// FORMULARIOS DENTRO DE LA FICHA
// ==========================================
const formCambioCategoria = document.getElementById('form-cambio-categoria');
if (formCambioCategoria) {
    formCambioCategoria.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await updateDoc(doc(window.db, "animales", document.getElementById('p-id-doc').value), { categoria: document.getElementById('c-nueva-categoria').value });
            alert("✅ Categoría actualizada."); window.abrirFicha(document.getElementById('p-id-doc').value);
        } catch (err) { alert("Error: " + err.message); }
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
            let historialRepro = data.historialReproductivo || [];
            let fep = '-', nuevoEstado = data.estado, nuevaCat = data.categoria, detalle = '', tercioStr = '-';

            if (tipoEvento === 'Palpación (+ Preñada)') {
                nuevoEstado = 'Gestante';
                const tercio = document.getElementById('r-tercio').value;
                const d = new Date(fecha);
                if (tercio === '1') { d.setDate(d.getDate() + 210); tercioStr = '1er Tercio'; }
                else if (tercio === '2') { d.setDate(d.getDate() + 120); tercioStr = '2do Tercio'; }
                else if (tercio === '3') { d.setDate(d.getDate() + 30); tercioStr = '3er Tercio'; }
                fep = d.toISOString().split('T')[0];
                detalle = `Confirmada preñez en ${tercioStr}.`;
            } 
            else if (tipoEvento === 'Palpación (- Vacía)') { nuevoEstado = 'Vacía'; detalle = 'Vacía.'; } 
            else if (tipoEvento === 'Parto') {
                nuevoEstado = 'Vacía';
                if (data.categoria === 'Novilla' || data.categoria === 'Vaca Seca / Escampa') nuevaCat = 'Vaca Ordeño';
                detalle = 'Parto exitoso.';
                const areteCria = document.getElementById('r-cria-arete').value.trim();
                if (areteCria) {
                    detalle += ` Nacimiento Cría: ${areteCria}.`;
                    await addDoc(collection(window.db, "animales"), {
                        finca: data.finca || 'Agua Clara', arete: areteCria, categoria: document.getElementById('r-cria-sexo').value,
                        peso: document.getElementById('r-cria-peso').value || null, fechaNacimiento: fecha,
                        historialPesos: document.getElementById('r-cria-peso').value ? [{ fecha: fecha, peso: document.getElementById('r-cria-peso').value }] : [],
                        historialReproductivo: [], padre: 'N/D', madre: data.arete || 'N/D', estado: 'Activo/Creciendo', salud: "🟢 Sano", fechaRegistro: serverTimestamp()
                    });
                }
            }
            historialRepro.push({ tipo: tipoEvento, fecha: fecha, tercio: tercioStr, fep: fep, detalle: detalle });
            await updateDoc(docRef, { estado: nuevoEstado, categoria: nuevaCat, historialReproductivo: historialRepro });
            document.getElementById('form-nuevo-repro').style.display = 'none'; alert(`✅ Evento guardado.`); window.abrirFicha(idDoc);
        } catch (err) { alert("Error: " + err.message); }
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
            let nuevaCat = (data.categoria === 'Becerra') ? 'Mauta' : 'Maute';
            let historialPesos = data.historialPesos || [];
            historialPesos.push({ fecha: fechaDestete, peso: pesoDestete });
            await updateDoc(docRef, { categoria: nuevaCat, peso: pesoDestete, historialPesos: historialPesos });
            if (data.madre && data.madre !== 'N/D') {
                const madreQuery = query(collection(window.db, "animales"), where("finca", "==", data.finca), where("arete", "==", data.madre));
                const madreSnapshot = await getDocs(madreQuery);
                if (!madreSnapshot.empty) {
                    const madreDoc = madreSnapshot.docs[0];
                    let madreHistorial = madreDoc.data().historialReproductivo || [];
                    madreHistorial.push({ tipo: '🏅 Destete Cría', fecha: fechaDestete, detalle: `Destetó a su cría con ${pesoDestete} Kg.` });
                    await updateDoc(doc(window.db, "animales", madreDoc.id), { historialReproductivo: madreHistorial });
                }
            }
            alert(`✅ Destete completado.`); document.getElementById('form-destete').style.display = 'none'; window.abrirFicha(idDoc);
        } catch (err) { alert("Error: " + err.message); }
    });
}

// ==========================================
// REGISTRO DE NUEVO ANIMAL (CON LOTE AUTOMATIZADO)
// ==========================================
const formAnimal = document.getElementById('form-animal');
if (formAnimal) {
    formAnimal.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!window.db || !window.auth.currentUser) {
            alert("⚠️ Sesión expirada o base de datos desconectada. Por favor, vuelva a iniciar sesión.");
            location.reload();
            return;
        }

        const btn = formAnimal.querySelector('button[type="submit"]');
        btn.innerText = "Guardando..."; 
        btn.disabled = true;

        try {
            const pesoInput = document.getElementById('a-peso').value.trim();
            const pesoValor = pesoInput !== '' ? Number(pesoInput) : null;
            const fechaNac = document.getElementById('a-nacimiento').value || null;
            
            const loteInput = document.getElementById('a-lote');
            const loteValor = (loteInput && loteInput.value.trim() !== '') ? loteInput.value.trim() : 'General';

            await addDoc(collection(window.db, "animales"), {
                finca: document.getElementById('a-finca-select').value,
                arete: document.getElementById('a-arete').value.trim(),
                categoria: document.getElementById('a-categoria').value,
                lote: loteValor, 
                peso: pesoValor,
                fechaNacimiento: fechaNac,
                historialPesos: pesoValor ? [{ fecha: new Date().toISOString().split('T')[0], peso: pesoValor }] : [],
                historialReproductivo: [],
                padre: document.getElementById('a-padre').value.trim() || 'N/D',
                madre: document.getElementById('a-madre').value.trim() || 'N/D',
                estado: document.getElementById('a-estado').value,
                salud: "🟢 Sano",
                fechaRegistro: serverTimestamp()
            });

            formAnimal.reset(); 
            document.getElementById('modal-animal').style.display = 'none';
            alert("✅ Animal guardado con éxito.");
        } catch (err) { 
            alert("❌ Error al guardar: " + err.message); 
        } finally { 
            btn.innerText = "Guardar Animal"; 
            btn.disabled = false; 
        }
    });
}

// ==========================================
// 📍 ADMINISTRACIÓN DE LOTES Y POTREROS
// ==========================================
window.cargarListaLotes = function() {
    const listaUI = document.getElementById('lista-lotes-ui');
    const selectLote = document.getElementById('a-lote');
    if (!listaUI || !selectLote || !window.db) return;

    onSnapshot(query(collection(window.db, "config_lotes")), (snapshot) => {
        listaUI.innerHTML = `<li style="padding: 8px 5px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;"><span>👉 General / Sin Asignar</span></li>`;
        selectLote.innerHTML = `<option value="General">👉 General / Sin Asignar</option>`;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const loteId = docSnap.id;
            const nombreLote = data.nombre || 'Lote Sin Nombre';
            
            listaUI.innerHTML += `
                <li style="padding: 8px 5px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; color: var(--green-dark);">👉 ${nombreLote}</span>
                    <button onclick="window.eliminarLoteActivo('${loteId}', '${nombreLote.replace(/'/g, "\\'")}')" style="background: #fef2f2; color: #ef4444; border: 1px solid #fecdd3; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-weight: bold;" title="Borrar Lote">❌</button>
                </li>
            `;
            selectLote.innerHTML += `<option value="${nombreLote}">${nombreLote}</option>`;
        });
    }, (err) => console.error("Error cargando lotes:", err));
};

window.agregarLoteNuevo = async function() {
    const inputLote = document.getElementById('input-nuevo-lote');
    const nombreLote = inputLote.value.trim();
    if (!nombreLote) return alert("⚠️ Escriba un nombre para el lote (Ej. Lote 100 Vacías).");
    
    try {
        await addDoc(collection(window.db, "config_lotes"), { nombre: nombreLote, fechaCreacion: serverTimestamp() });
        inputLote.value = ''; 
    } catch (err) { alert("❌ Error al crear lote: " + err.message); }
};

window.eliminarLoteActivo = async function(idLote, nombreLote) {
    if (confirm(`¿Estás seguro de eliminar el lote "${nombreLote}"?`)) {
        try { await deleteDoc(doc(window.db, "config_lotes", idLote)); } 
        catch (err) { alert("❌ Error al borrar el lote: " + err.message); }
    }
};

// ==========================================
// 💉 ADMINISTRACIÓN DE VACUNAS Y TRATAMIENTOS
// ==========================================
window.cargarListaVacunas = function() {
    const listaVacunasUI = document.getElementById('lista-vacunas-ui');
    const selectMasivoVacunas = document.getElementById('m-vacuna-nombre');
    if (!listaVacunasUI || !window.db) return;

    onSnapshot(query(collection(window.db, "config_vacunas")), (snapshot) => {
        listaVacunasUI.innerHTML = '';
        if(selectMasivoVacunas) selectMasivoVacunas.innerHTML = '<option value="">Seleccione un tratamiento...</option>';

        let hayVacunas = false;
        snapshot.forEach((docSnap) => {
            hayVacunas = true;
            const data = docSnap.data();
            const vacunaId = docSnap.id;
            const nombreVacuna = data.nombre;
            
            listaVacunasUI.innerHTML += `
                <li style="padding: 8px 5px; border-bottom: 1px solid #fef08a; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; color: #854d0e;">👉 ${nombreVacuna}</span>
                    <button onclick="window.eliminarVacunaActiva('${vacunaId}', '${nombreVacuna.replace(/'/g, "\\'")}')" style="background: #fef2f2; color: #ef4444; border: 1px solid #fecdd3; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-weight: bold;">❌</button>
                </li>
            `;
            if(selectMasivoVacunas) selectMasivoVacunas.innerHTML += `<option value="${nombreVacuna}">${nombreVacuna}</option>`;
        });

        if(!hayVacunas) listaVacunasUI.innerHTML = '<li style="padding: 5px 0; font-style: italic; color: #a16207;">No hay tratamientos registrados.</li>';
    });
};

window.agregarVacunaNueva = async function() {
    const inputVacuna = document.getElementById('input-nueva-vacuna');
    const nombreVacuna = inputVacuna.value.trim();
    if (!nombreVacuna) return alert("⚠️ Escriba el nombre de la vacuna/tratamiento.");
    try {
        await addDoc(collection(window.db, "config_vacunas"), { nombre: nombreVacuna });
        inputVacuna.value = ''; 
    } catch (err) { alert("❌ Error: " + err.message); }
};

window.eliminarVacunaActiva = async function(idVacuna, nombreVacuna) {
    if (confirm(`¿Eliminar el tratamiento "${nombreVacuna}" del catálogo?`)) {
        try { await deleteDoc(doc(window.db, "config_vacunas", idVacuna)); } 
        catch (err) { alert("❌ Error: " + err.message); }
    }
};

// ==========================================
// MOTOR DE TIEMPO Y TORRE DE CONTROL
// ==========================================
function actualizarDashboard(datosHato) {
    const listSecado = document.getElementById('dash-list-secado');
    const countSecado = document.getElementById('dash-count-secado');
    const listDestete = document.getElementById('dash-list-destete');
    const countDestete = document.getElementById('dash-count-destete');
    
    if(!listSecado || !listDestete) return;

    let htmlSecado = "";
    let htmlDestete = "";
    let numSecado = 0;
    let numDestete = 0;
    const hoy = new Date();

    datosHato.forEach(a => {
        if (a.estado === "Gestante" && a.historialReproductivo) {
            let ultimaFep = null;
            a.historialReproductivo.forEach(ev => {
                if(ev.tipo === 'Palpación (+ Preñada)' && ev.fep !== '-') ultimaFep = ev.fep;
            });
            if (ultimaFep) {
                const diasParaParto = Math.ceil((new Date(ultimaFep) - hoy) / (1000 * 60 * 60 * 24));
                if (diasParaParto <= 75) {
                    numSecado++;
                    let alertaStyle = diasParaParto < 0 ? "color:#dc2626; font-weight:bold;" : "color:#b45309; font-weight:bold;";
                    let mensaje = diasParaParto < 0 ? `¡Parto Atrasado por ${Math.abs(diasParaParto)} días!` : `Faltan ${diasParaParto} días para parto.`;
                    let badgeSecar = (diasParaParto <= 60 && a.categoria === 'Vaca Ordeño') ? `<span style="background:#ef4444; color:white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-left: 5px;">URGENTE SECAR</span>` : '';
                    
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

        if (a.categoria.includes("Becerr")) {
            let fechaNac = a.fechaNacimiento;
            if (!fechaNac && a.historialPesos && a.historialPesos.length > 0) fechaNac = a.historialPesos[0].fecha;
            
            if (fechaNac && fechaNac !== 'Registro inicial') {
                const meses = Math.floor((hoy - new Date(fechaNac)) / (1000 * 60 * 60 * 24 * 30));
                if (meses >= 7) {
                    numDestete++;
                    let color = meses >= 8 ? "#dc2626" : "#a16207"; 
                    htmlDestete += `
                        <div style="border-bottom: 1px solid var(--border-light); padding: 8px 0; display:flex; justify-content:space-between; align-items:center;">
                            <div><strong style="color:var(--text-dark);">${a.arete}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">Madre: ${a.madre}</span></div>
                            <div style="font-weight:bold; color:${color};">${meses} meses de edad</div>
                        </div>`;
                }
            }
        }
    });

    countSecado.innerText = numSecado;
    listSecado.innerHTML = numSecado > 0 ? htmlSecado : `<p style="color: var(--text-muted); font-style: italic; padding: 10px 0;">🟢 Ninguna vaca próxima a secado/parto.</p>`;
    
    countDestete.innerText = numDestete;
    listDestete.innerHTML = numDestete > 0 ? htmlDestete : `<p style="color: var(--text-muted); font-style: italic; padding: 10px 0;">🟢 Ningún becerro ha alcanzado la edad de destete aún.</p>`;
}

// ==========================================
// 🚀 INICIALIZACIÓN FINAL DEL ERP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const btnAddVacuna = document.getElementById('btn-add-vacuna');
    if (btnAddVacuna) {
        btnAddVacuna.onclick = window.agregarVacunaNueva;
    }

    setTimeout(() => {
        if (window.db) {
            if (window.cargarListaLotes) window.cargarListaLotes();
            if (window.cargarListaVacunas) window.cargarListaVacunas();
        }
    }, 1500); 
});
