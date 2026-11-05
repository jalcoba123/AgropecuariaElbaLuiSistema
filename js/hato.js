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
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

function obtenerFincaActual() {
    const tag = document.getElementById('finca-tag');
    if (!tag) return 'Agua Clara';
    if (tag.innerText.includes('CONSOLIDADO')) return 'Global';
    if (tag.innerText.includes('EL SUR')) return 'El Sur';
    return 'Agua Clara';
}

// 1. ELIMINAR ANIMAL
window.eliminarAnimal = async function(idDoc, arete) {
    if (confirm(`¿Eliminar permanentemente Arete "${arete}"?`)) {
        try {
            await deleteDoc(doc(window.db, "animales", idDoc));
        } catch (err) {
            alert("Error al eliminar: " + err.message);
        }
    }
};

// 2. MODAL DE NOVEDAD LIBRE
window.abrirModalNovedad = function(idDoc, arete, saludActual) {
    document.getElementById('n-id').value = idDoc;
    document.getElementById('n-arete-display').innerText = arete;
    document.getElementById('n-estado-salud').value = (saludActual && saludActual !== 'undefined' && saludActual !== '🟢 Sano') ? saludActual : "";
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

// 3. ABRIR EXPEDIENTE CLÍNICO (👁️)
window.abrirFicha = async function(idDoc) {
    if (!window.db) return alert("⚠️ Base de datos no inicializada.");

    try {
        const docRef = doc(window.db, "animales", idDoc);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) return alert("⚠️ Expediente no encontrado.");

        const a = docSnap.data();
        
        // Reset formularios
        document.getElementById('p-id-doc').value = idDoc;
        document.getElementById('form-nuevo-peso').style.display = 'none';
        document.getElementById('form-nuevo-repro').style.display = 'none';
        document.getElementById('form-nuevo-aborto').style.display = 'none';
        document.getElementById('form-cambio-categoria').style.display = 'none';
        
        // Asignar categoría actual si existe en las opciones, si no, dejar el default
        const selCat = document.getElementById('c-nueva-categoria');
        if (a.categoria && Array.from(selCat.options).some(opt => opt.value === a.categoria)) {
            selCat.value = a.categoria;
        }

        // Llenar Ficha
        document.getElementById('f-arete').innerText = a.arete || 'N/D';
        document.getElementById('f-categoria').innerText = a.categoria || 'N/D';
        document.getElementById('f-finca-tag').innerText = `FINCA: ${(a.finca || 'Agua Clara').toUpperCase()}`;
        document.getElementById('f-padre').innerText = a.padre || 'N/D';
        document.getElementById('f-madre').innerText = a.madre || 'N/D';
        document.getElementById('f-estado').innerText = a.estado || 'Activo';

        // Salud
        const historialSalud = document.getElementById('f-historial-salud');
        const saludActual = a.salud || "🟢 Sano";
        if (saludActual !== '🟢 Sano') {
            historialSalud.innerHTML = `🔴 <strong>Novedad Activa:</strong> ${saludActual}`;
            historialSalud.style.background = '#fff1f2';
            historialSalud.style.color = '#be123c';
            historialSalud.style.borderColor = '#fecdd3';
        } else {
            historialSalud.innerHTML = `🟢 Animal sano.`;
            historialSalud.style.background = '#ecfdf5';
            historialSalud.style.color = '#047857';
            historialSalud.style.borderColor = '#a7f3d0';
        }

        // Reproducción y Alerta de 2 Años
        const tbodyRepro = document.getElementById('f-tabla-repro');
        const alertaFertilidad = document.getElementById('f-alerta-fertilidad');
        alertaFertilidad.innerHTML = ''; 
        tbodyRepro.innerHTML = '';
        
        const historialRepro = a.historialReproductivo || [];
        let ultimaFechaClave = null; 

        if (historialRepro.length === 0) {
            tbodyRepro.innerHTML = `<tr><td colspan="3" style="padding: 10px; text-align: center; color: var(--text-muted);">Sin eventos reproductivos registrados.</td></tr>`;
        } else {
            historialRepro.forEach((ev) => {
                if (ev.tipo === 'Parto' || ev.tipo === 'Aborto') {
                    if (!ultimaFechaClave || new Date(ev.fecha) > new Date(ultimaFechaClave)) {
                        ultimaFechaClave = ev.fecha;
                    }
                }

                let detalle = ev.detalle || '-';
                if (ev.tipo === 'Palpación (+ Preñada)') {
                    detalle = `Tercio: <strong>${ev.tercio}</strong> | FEP: <strong style="color:var(--green-dark);">${ev.fep}</strong>`;
                } else if (ev.tipo === 'Aborto') {
                    detalle = `<span style="color:#dc2626; font-weight:bold;">⚠️ Aborto. Estatus cambió a Vacía.</span>`;
                }

                tbodyRepro.innerHTML += `
                    <tr>
                        <td style="padding: 6px; border-bottom: 1px solid var(--border-light); font-weight:bold;">${ev.tipo}</td>
                        <td style="padding: 6px; border-bottom: 1px solid var(--border-light);">${ev.fecha}</td>
                        <td style="padding: 6px; border-bottom: 1px solid var(--border-light);">${detalle}</td>
                    </tr>
                `;
            });
        }

        if (ultimaFechaClave && a.estado !== 'Gestante') {
            const diffDias = Math.floor((new Date() - new Date(ultimaFechaClave)) / (1000 * 60 * 60 * 24));
            if (diffDias >= 730) { 
                alertaFertilidad.innerHTML = `<div style="background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-weight: bold; font-size: 0.85rem;">⚠️ ALERTA DE FERTILIDAD: Este vientre lleva ${diffDias} días vacía desde su último parto/aborto. Revise el caso o considere descarte.</div>`;
            }
        }

        // Pesajes y GDP
        const tbodyPesajes = document.getElementById('f-tabla-pesajes');
        tbodyPesajes.innerHTML = '';
        const historialPesos = a.historialPesos || [];

        if (historialPesos.length === 0 && a.peso) {
            historialPesos.push({ fecha: 'Registro inicial', peso: a.peso });
        }

        if (historialPesos.length === 0) {
            tbodyPesajes.innerHTML = `<tr><td colspan="3" style="padding: 10px; text-align: center; color: var(--text-muted);">Sin pesajes.</td></tr>`;
        } else {
            for (let i = 0; i < historialPesos.length; i++) {
                const actual = historialPesos[i];
                let gdpTexto = '<span style="color: var(--text-muted);">-</span>';

                if (i > 0) {
                    const anterior = historialPesos[i - 1];
                    const diffKg = actual.peso - anterior.peso;
                    
                    if (anterior.fecha && actual.fecha && anterior.fecha !== 'Registro inicial' && actual.fecha !== 'Registro inicial') {
                        const d1 = new Date(anterior.fecha);
                        const d2 = new Date(actual.fecha);
                        const diffDias = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
                        const gdp = (diffKg / diffDias).toFixed(3);
                        gdpTexto = `<strong style="color: ${gdp >= 0 ? 'var(--green-dark)' : '#dc2626'};">${gdp > 0 ? '+' : ''}${gdp} kg/día</strong> (${diffKg > 0 ? '+' : ''}${diffKg} kg)`;
                    }
                }

                tbodyPesajes.innerHTML += `
                    <tr>
                        <td style="padding: 6px; border-bottom: 1px solid var(--border-light);">${actual.fecha || 'N/D'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid var(--border-light); font-weight: bold;">${actual.peso} kg</td>
                        <td style="padding: 6px; border-bottom: 1px solid var(--border-light);">${gdpTexto}</td>
                    </tr>
                `;
            }
        }

        document.getElementById('modal-ficha').style.display = 'flex';
    } catch (err) {
        alert("❌ Error: " + err.message);
        console.error(err);
    }
};

// 4. CAMBIAR CATEGORÍA (ASCENSO)
const formCambioCategoria = document.getElementById('form-cambio-categoria');
if (formCambioCategoria) {
    formCambioCategoria.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idDoc = document.getElementById('p-id-doc').value;
        const nuevaCat = document.getElementById('c-nueva-categoria').value;
        try {
            await updateDoc(doc(window.db, "animales", idDoc), { categoria: nuevaCat });
            alert("✅ Categoría / Etapa actualizada con éxito.");
            window.abrirFicha(idDoc);
        } catch (err) { alert("Error al actualizar categoría: " + err.message); }
    });
}

// 5. REGISTRAR EVENTO (PALPACIÓN / PARTO)
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
            
            let fep = '-';
            let nuevoEstado = data.estado;
            let detalle = '';
            let tercioStr = '-';

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
            else if (tipoEvento === 'Palpación (- Vacía)') {
                nuevoEstado = 'Vacía';
                detalle = 'La vaca se encontró vacía al palpar.';
            } 
            else if (tipoEvento === 'Parto') {
                nuevoEstado = 'Vacía'; 
                detalle = 'Parto exitoso registrado.';
            }

            historialRepro.push({
                tipo: tipoEvento,
                fecha: fecha,
                tercio: tercioStr,
                fep: fep,
                detalle: detalle
            });

            await updateDoc(docRef, { estado: nuevoEstado, historialReproductivo: historialRepro });
            document.getElementById('form-nuevo-repro').style.display = 'none';
            alert(`✅ Evento registrado. El estatus de la vaca cambió a: ${nuevoEstado}`);
            window.abrirFicha(idDoc);

        } catch (err) { alert("Error reproductivo: " + err.message); }
    });
}

// 6. REGISTRAR ABORTO
const formNuevoAborto = document.getElementById('form-nuevo-aborto');
if (formNuevoAborto) {
    formNuevoAborto.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idDoc = document.getElementById('p-id-doc').value;
        const fechaAborto = document.getElementById('ab-fecha').value;

        try {
            const docRef = doc(window.db, "animales", idDoc);
            const docSnap = await getDoc(docRef);
            const data = docSnap.data();

            let historialRepro = data.historialReproductivo || [];
            historialRepro.push({ tipo: 'Aborto', fecha: fechaAborto, detalle: 'Aborto registrado' });

            await updateDoc(docRef, {
                estado: 'Vacía',
                salud: '🔴 Aborto reciente (Aislar y testear)',
                historialReproductivo: historialRepro
            });

            document.getElementById('form-nuevo-aborto').style.display = 'none';
            alert("⚠️ Aborto registrado. Estatus cambió a 'Vacía'.");
            window.abrirFicha(idDoc);
        } catch (err) { alert("Error aborto: " + err.message); }
    });
}

// 7. REGISTRAR PESAJE
const formNuevoPeso = document.getElementById('form-nuevo-peso');
if (formNuevoPeso) {
    formNuevoPeso.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idDoc = document.getElementById('p-id-doc').value;
        const nuevoPeso = Number(document.getElementById('p-nuevo-peso').value);
        const nuevaFecha = document.getElementById('p-fecha').value;

        try {
            const docRef = doc(window.db, "animales", idDoc);
            const docSnap = await getDoc(docRef);
            const data = docSnap.data();
            let historialPesos = data.historialPesos || [];
            
            if (historialPesos.length === 0 && data.peso) historialPesos.push({ fecha: 'Registro inicial', peso: data.peso });
            historialPesos.push({ fecha: nuevaFecha, peso: nuevoPeso });

            await updateDoc(docRef, { peso: nuevoPeso, historialPesos: historialPesos });
            document.getElementById('form-nuevo-peso').style.display = 'none';
            window.abrirFicha(idDoc);
        } catch (err) { alert("Error pesaje: " + err.message); }
    });
}

// 8. REGISTRO NUEVO ANIMAL
const formAnimal = document.getElementById('form-animal');
if (formAnimal) {
    formAnimal.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pesoInput = document.getElementById('a-peso').value.trim();
        const pesoValor = pesoInput !== '' ? Number(pesoInput) : null;
        const btn = formAnimal.querySelector('button[type="submit"]');
        btn.innerText = "Guardando..."; btn.disabled = true;

        try {
            await addDoc(collection(window.db, "animales"), {
                finca: document.getElementById('a-finca-select').value,
                arete: document.getElementById('a-arete').value.trim(),
                categoria: document.getElementById('a-categoria').value,
                peso: pesoValor,
                historialPesos: pesoValor ? [{ fecha: 'Registro inicial', peso: pesoValor }] : [],
                historialReproductivo: [],
                padre: document.getElementById('a-padre').value.trim() || 'N/D',
                madre: document.getElementById('a-madre').value.trim() || 'N/D',
                estado: document.getElementById('a-estado').value,
                salud: "🟢 Sano",
                fechaRegistro: serverTimestamp()
            });
            formAnimal.reset();
            document.getElementById('modal-animal').style.display = 'none';
        } catch (err) { alert("Error: " + err.message); } 
        finally { btn.innerText = "Guardar Animal"; btn.disabled = false; }
    });
}

// 9. LECTURA EN TIEMPO REAL
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
        let total = 0, mautes = 0, gestantes = 0;
        let conteoSalud = {};

        snapshot.forEach((documento) => {
            const a = documento.data();
            const idDoc = documento.id;
            const saludActual = a.salud || "🟢 Sano";
            
            total++;
            // AHORA CUENTA MAUTES MACHOS, MAUTAS HEMBRAS, O SI TIENEN EL TEXTO VIEJO DE "Lote ElbaLui"
            if (a.categoria === "Maute" || a.categoria === "Mauta" || a.categoria === "Lote ElbaLui (Maute)") {
                mautes++;
            }
            if (a.estado === "Gestante") gestantes++;
            if (saludActual !== "🟢 Sano") conteoSalud[saludActual] = (conteoSalud[saludActual] || 0) + 1;

            const textoPeso = a.peso ? `${a.peso} kg` : `<span style="color:#94a3b8;">S/P</span>`;
            const escapeStr = (val) => String(val || '').replace(/'/g, "\\'");

            tabla.innerHTML += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);"><strong>${a.arete}</strong><br><span style="font-size: 0.7rem; color: #64748b;">${a.finca}</span></td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.categoria}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-weight: bold; color: var(--green-dark);">${textoPeso}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.estado}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-weight: 600;">${saludActual}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); text-align: center; white-space: nowrap;">
                        <button onclick="abrirFicha('${idDoc}')" style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 4px;" title="Ver Expediente">👁️</button>
                        <button onclick="abrirModalNovedad('${idDoc}', '${escapeStr(a.arete)}', '${escapeStr(saludActual)}')" style="background: #fef2f2; color: #be123c; border: 1px solid #fecdd3; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 4px;" title="Reportar Novedad">🏥</button>
                        <button onclick="eliminarAnimal('${idDoc}', '${escapeStr(a.arete)}')" style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 6px; cursor: pointer;" title="Eliminar">🗑️</button>
                    </td>
                </tr>
            `;
        });

        if (document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = total;
        if (document.getElementById('kpi-mautes')) document.getElementById('kpi-mautes').innerText = mautes;
        if (document.getElementById('kpi-gestantes')) document.getElementById('kpi-gestantes').innerText = gestantes;

        let htmlAlertas = "";
        let totalEnfermos = 0;
        for (const [enfermedad, cantidad] of Object.entries(conteoSalud)) {
            htmlAlertas += `<span style="background: white; padding: 6px 12px; border-radius: 20px; border: 1px solid #fecdd3; color: #be123c; font-weight: 600;">${enfermedad}: ${cantidad}</span>`;
            totalEnfermos += cantidad;
        }
        panelAlertas.innerHTML = totalEnfermos === 0 ? `<span style="background: #ecfdf5; padding: 6px 12px; border-radius: 20px; border: 1px solid #a7f3d0; color: #047857; font-weight: 600;">🟢 Hato 100% Sano. Sin novedades.</span>` : htmlAlertas;

        if (total === 0) tabla.innerHTML = `<tr><td colspan="6" style="padding: 15px; text-align: center; color: var(--text-muted);">Sin animales registrados (${fincaActiva}).</td></tr>`;
    }, (err) => console.error("Error Firestore:", err));
};
