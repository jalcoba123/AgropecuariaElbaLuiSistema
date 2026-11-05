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
        await deleteDoc(doc(window.db, "animales", idDoc));
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

// 3. ABRIR EXPEDIENTE CLÍNICO & PESAJES (👁️)
window.abrirFicha = async function(idDoc) {
    document.getElementById('p-id-doc').value = idDoc;
    document.getElementById('form-nuevo-peso').style.display = 'none';

    try {
        const docRef = doc(window.db, "animales", idDoc);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            alert("No se encontró el expediente.");
            return;
        }

        const a = docSnap.data();
        document.getElementById('f-arete').innerText = a.arete;
        document.getElementById('f-categoria').innerText = a.categoria;
        document.getElementById('f-finca-tag').innerText = `FINCA: ${(a.finca || 'Agua Clara').toUpperCase()}`;
        document.getElementById('f-padre').innerText = a.padre || 'N/D';
        document.getElementById('f-madre').innerText = a.madre || 'N/D';
        document.getElementById('f-estado').innerText = a.estado;

        // Salud
        const historialSalud = document.getElementById('f-historial-salud');
        const saludActual = a.salud || "🟢 Sano";
        if (saludActual !== '🟢 Sano') {
            historialSalud.innerHTML = `🔴 <strong>Novedad Activa:</strong> ${saludActual}`;
            historialSalud.style.background = '#fff1f2';
            historialSalud.style.color = '#be123c';
            historialSalud.style.borderColor = '#fecdd3';
        } else {
            historialSalud.innerHTML = `🟢 Animal en condiciones óptimas (Sin novedades médicas).`;
            historialSalud.style.background = '#ecfdf5';
            historialSalud.style.color = '#047857';
            historialSalud.style.borderColor = '#a7f3d0';
        }

        // Renderizar Tabla de Pesajes y GDP
        const tbodyPesajes = document.getElementById('f-tabla-pesajes');
        tbodyPesajes.innerHTML = '';
        const historial = a.historialPesos || [];

        if (historial.length === 0 && a.peso) {
            // Si no hay historial pero tiene peso inicial guardado
            historial.push({ fecha: 'Registro inicial', peso: a.peso });
        }

        if (historial.length === 0) {
            tbodyPesajes.innerHTML = `<tr><td colspan="3" style="padding: 10px; text-align: center; color: var(--text-muted);">Sin pesajes registrados.</td></tr>`;
        } else {
            // Ordenar por fecha cronológica si es posible
            for (let i = 0; i < historial.length; i++) {
                const actual = historial[i];
                let gdpTexto = '<span style="color: var(--text-muted);">-</span>';

                if (i > 0) {
                    const anterior = historial[i - 1];
                    const diffKg = actual.peso - anterior.peso;
                    
                    if (anterior.fecha && actual.fecha && anterior.fecha !== 'Registro inicial' && actual.fecha !== 'Registro inicial') {
                        const d1 = new Date(anterior.fecha);
                        const d2 = new Date(actual.fecha);
                        const diffDias = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
                        const gdp = (diffKg / diffDias).toFixed(3);
                        gdpTexto = `<strong style="color: ${gdp >= 0 ? 'var(--green-dark)' : '#dc2626'};">${gdp > 0 ? '+' : ''}${gdp} kg/día</strong> (${diffKg > 0 ? '+' : ''}${diffKg} kg)`;
                    } else {
                        gdpTexto = `<span>${diffKg > 0 ? '+' : ''}${diffKg} kg desde inicio</span>`;
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
        alert("Error al abrir expediente: " + err.message);
    }
};

// Registrar un nuevo pesaje desde el expediente
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

            let historial = data.historialPesos || [];
            if (historial.length === 0 && data.peso) {
                historial.push({ fecha: 'Registro inicial', peso: data.peso });
            }

            historial.push({ fecha: nuevaFecha, peso: nuevoPeso });

            // Actualizar Firestore (guardar en el historial y actualizar el peso actual del animal)
            await updateDoc(docRef, {
                peso: nuevoPeso,
                historialPesos: historial
            });

            formNuevoPeso.reset();
            document.getElementById('form-nuevo-peso').style.display = 'none';
            alert("✅ Pesaje registrado con éxito.");
            window.abrirFicha(idDoc); // Refrescar el modal
        } catch (err) {
            alert("Error al registrar pesaje: " + err.message);
        }
    });
}

// 4. REGISTRO DE ANIMAL NUEVO
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

// 5. LECTURA EN TIEMPO REAL
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
            if (a.categoria === "Lote ElbaLui (Maute)") mautes++;
            if (a.estado === "Gestante") gestantes++;
            
            if (saludActual !== "🟢 Sano") {
                conteoSalud[saludActual] = (conteoSalud[saludActual] || 0) + 1;
            }

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
                        <!-- Botón Ficha (👁️) abre directo consultando Firestore -->
                        <button onclick="abrirFicha('${idDoc}')" style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 4px;" title="Ver Expediente">👁️</button>
                        <!-- Botón Novedad (🏥) -->
                        <button onclick="abrirModalNovedad('${idDoc}', '${escapeStr(a.arete)}', '${escapeStr(saludActual)}')" style="background: #fef2f2; color: #be123c; border: 1px solid #fecdd3; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 4px;" title="Reportar Novedad">🏥</button>
                        <!-- Botón Eliminar (🗑️) -->
                        <button onclick="eliminarAnimal('${idDoc}', '${escapeStr(a.arete)}')" style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 6px; cursor: pointer;" title="Eliminar">🗑️</button>
                    </td>
                </tr>
            `;
        });

        // Actualizar KPIs superiores
        if (document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = total;
        if (document.getElementById('kpi-mautes')) document.getElementById('kpi-mautes').innerText = mautes;
        if (document.getElementById('kpi-gestantes')) document.getElementById('kpi-gestantes').innerText = gestantes;

        // Renderizar Panel de Alertas Globales
        let htmlAlertas = "";
        let totalEnfermos = 0;
        
        for (const [enfermedad, cantidad] of Object.entries(conteoSalud)) {
            htmlAlertas += `<span style="background: white; padding: 6px 12px; border-radius: 20px; border: 1px solid #fecdd3; color: #be123c; font-weight: 600;">${enfermedad}: ${cantidad}</span>`;
            totalEnfermos += cantidad;
        }

        if (totalEnfermos === 0) {
            panelAlertas.innerHTML = `<span style="background: #ecfdf5; padding: 6px 12px; border-radius: 20px; border: 1px solid #a7f3d0; color: #047857; font-weight: 600;">🟢 Hato 100% Sano. Sin novedades.</span>`;
        } else {
            panelAlertas.innerHTML = htmlAlertas;
        }

        if (total === 0) tabla.innerHTML = `<tr><td colspan="6" style="padding: 15px; text-align: center; color: var(--text-muted);">Sin animales registrados (${fincaActiva}).</td></tr>`;
    }, (err) => console.error("Error Firestore:", err));
};
