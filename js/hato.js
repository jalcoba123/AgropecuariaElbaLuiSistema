// js/hato.js
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    onSnapshot, 
    serverTimestamp,
    doc,
    deleteDoc,
    updateDoc,
    getDoc,
    getDocs,
    writeBatch
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
// 🏷️ LECTOR RFID (ESCANEO RÁPIDO EN MANGA)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Crear input invisible o visible para capturar el lector de chips por USB/Teclado
    const seccionHato = document.getElementById('tab-hato');
    if (seccionHato && !document.getElementById('rfid-scanner-input')) {
        const contenedorLector = document.createElement('div');
        contenedorLector.style.cssText = "background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 15px; border-radius: 8px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;";
        contenedorLector.innerHTML = `
            <span style="font-size: 1.2rem;">📡</span>
            <div style="flex: 1;">
                <strong style="font-size: 0.85rem; color: #166534;">Modo Lector RFID Activo:</strong>
                <p style="margin: 0; font-size: 0.75rem; color: #15803d;">Pase el bastón lector por el arete electrónico del animal en la manga.</p>
            </div>
            <input type="text" id="rfid-scanner-input" placeholder="Esperando lectura de chip..." autocomplete="off" style="padding: 6px 10px; border: 1px solid #86efac; border-radius: 6px; font-size: 0.85rem; width: 220px; background: white;">
        `;
        // Insertarlo arriba de la tabla de inventario
        const tablaCard = seccionHato.querySelector('.container div:last-child') || seccionHato.children[2];
        if (tablaCard) {
            tablaCard.parentNode.insertBefore(contenedorLector, tablaCard);
        }

        // Escuchar el evento de lectura del bastón (que envía los números y un Enter)
        const inputLector = document.getElementById('rfid-scanner-input');
        if (inputLector) {
            inputLector.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const codigoRFID = inputLector.value.trim();
                    inputLector.value = ''; // Limpiar para el siguiente animal

                    if (!codigoRFID) return;

                    // Buscar el animal en la caché local del hato
                    const animalEncontrado = window.datosHatoCache.find(a => 
                        (a.arete && a.arete.toLowerCase() === codigoRFID.toLowerCase()) || 
                        (a.chipRFID && a.chipRFID === codigoRFID)
                    );

                    if (animalEncontrado) {
                        alert(`✅ ¡Animal encontrado! Arete: ${animalEncontrado.arete}`);
                        window.abrirFicha(animalEncontrado.id);
                    } else {
                        alert(`⚠️ El chip leído (${codigoRFID}) no está registrado en el sistema. Verifique o registre el animal.`);
                    }
                }
            });
        }
    }
});


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
    document.getElementById('m-div-vacuna').style.display = 'none';
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
                if (!vacunaStr) throw new Error("Escriba el nombre de la vacuna o tratamiento.");
                
                for (let chk of seleccionados) {
                    const idDoc = chk.value;
                    const docRef = doc(window.db, "animales", idDoc);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        batch.update(docRef, { 
                            salud: `🟢 Sano (Vacunado: ${vacunaStr})`
                        });
                    }
                }
                await batch.commit();
                alert(`✅ Vacunación (${vacunaStr}) aplicada a${seleccionados.length} animales.`);
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

                            batch.update(docRef, {
                                categoria: nuevaCat,
                                peso: pesoPromedio,
                                historialPesos: historialPesos
                            });
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
    if (confirm(`¿Eliminar permanentemente Arete "${arete}"?`)) { try { await deleteDoc(doc(window.db, "animales", idDoc)); } catch (err) { alert("Error al eliminar: " + err.message); } } };  window.abrirModalNovedad = function(idDoc, arete, saludActual) { document.getElementById('n-id').value = idDoc; document.getElementById('n-arete-display').innerText = arete; document.getElementById('n-estado-salud').value = (saludActual && saludActual !== 'undefined' && !saludActual.includes('Sano')) ? saludActual : ""; document.getElementById('modal-novedad').style.display = 'flex'; };  const formNovedad = document.getElementById('form-novedad'); if (formNovedad) { formNovedad.addEventListener('submit', async (e) => { e.preventDefault(); const idDoc = document.getElementById('n-id').value; const nuevoEstado = document.getElementById('n-estado-salud').value.trim(); const btn = formNovedad.querySelector('button[type="submit"]');  btn.innerText = "Guardando..."; btn.disabled = true; try { await updateDoc(doc(window.db, "animales", idDoc), { salud: nuevoEstado }); document.getElementById('modal-novedad').style.display = 'none'; } catch (err) { alert("Error: " + err.message); } finally { btn.innerText = "Guardar Novedad"; btn.disabled = false; } }); }  // ========================================== // LECTURA EN TIEMPO REAL (INVENTARIO Y CÁLCULOS) // ========================================== window.cargarHato = function() { const tabla = document.getElementById('tabla-hato-body'); const panelAlertas = document.getElementById('panel-alertas'); if (!tabla \vert{}\vert{} !window.db) return;  const fincaActiva = obtenerFincaActual(); let q = (fincaActiva === 'Global') ? query(collection(window.db, "animales")) : query(collection(window.db, "animales"), where("finca", "==", fincaActiva));  onSnapshot(q, (snapshot) => { tabla.innerHTML = ''; window.datosHatoCache = []; let total = 0, mautes = 0, gestantes = 0; let conteoSalud = {}; const hoy = new Date();  snapshot.forEach((documento) => { const a = documento.data(); const idDoc = documento.id; window.datosHatoCache.push({ id: idDoc, ...a });  const saludActual = a.salud \vert{}\vert{} "🟢 Sano"; total++; if (a.categoria === "Maute" \vert{}\vert{} a.categoria === "Mauta" \vert{}\vert{} a.categoria === "Lote ElbaLui (Maute)") mautes++; if (a.estado === "Gestante") gestantes++; if (!saludActual.includes("Sano")) conteoSalud[saludActual] = (conteoSalud[saludActual] \vert{}\vert{} 0) + 1;  const textoPeso = a.peso ? `${a.peso} kg` : `<span style="color:#94a3b8;">S/P</span>`;
            const escapeStr = (val) => String(val || '').replace(/'/g, "\\'");

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
                    else textoTiempo = `Faltan ${diasParaParto} días`; } } else if (a.categoria.includes("Becerr") \vert{}\vert{} a.categoria.includes("Maut")) { let fechaNac = a.fechaNacimiento; if (!fechaNac && a.historialPesos && a.historialPesos.length > 0) { fechaNac = a.historialPesos[0].fecha; } if (fechaNac && fechaNac !== 'Registro inicial') { const meses = Math.floor((hoy - new Date(fechaNac)) / (1000 * 60 * 60 * 24 * 30)); textoTiempo = meses > 0 ? `${meses} meses` : `Recién nacido`;
                    if (a.categoria.includes("Becerr") && meses >= 8) textoTiempo = `<strong style="color:#ca8a04;">${meses} meses (Pto. Destete)</strong>`;
                }
            }

            tabla.innerHTML += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); text-align: center;">
                        <input type="checkbox" class="chk-animal" value="${idDoc}">
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);"><strong>${a.arete}</strong><br><span style="font-size: 0.7rem; color: #64748b;">${a.finca}</span></td>
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
            htmlAlertas += `<span style="background: white; padding: 6px 12px; border-radius: 20px; border: 1px solid #fecdd3; color: #be123c; font-weight: 600;">${enfermedad}:${cantidad}</span>`;
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
        document.getElementById('form-nuevo-peso').style.display = 'none';
        document.getElementById('form-nuevo-repro').style.display = 'none';
        document.getElementById('form-nuevo-aborto').style.display = 'none';
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
            historialSalud.innerHTML = `🔴 <strong>Novedad:</strong> ${saludActual}`; historialSalud.style.background = '#fff1f2'; historialSalud.style.color = '#be123c'; historialSalud.style.borderColor = '#fecdd3'; } else { historialSalud.innerHTML = `🟢 ${saludActual}`;
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
                tbodyPesajes.innerHTML += `<tr><td style="padding: 6px; border-bottom: 1px solid var(--border-light);">${actual.fecha || 'N/D'}</td><td style="padding: 6px; border-bottom: 1px solid var(--border-light); font-weight: bold
