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
    updateDoc 
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

// 2. ABRIR MODAL DE NOVEDAD Y GUARDAR ESTADO
window.abrirModalNovedad = function(idDoc, arete, saludActual) {
    document.getElementById('n-id').value = idDoc;
    document.getElementById('n-arete-display').innerText = arete;
    document.getElementById('n-estado-salud').value = saludActual && saludActual !== 'undefined' ? saludActual : "🟢 Sano";
    document.getElementById('modal-novedad').style.display = 'flex';
};

const formNovedad = document.getElementById('form-novedad');
if (formNovedad) {
    formNovedad.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idDoc = document.getElementById('n-id').value;
        const nuevoEstado = document.getElementById('n-estado-salud').value;
        const btn = formNovedad.querySelector('button[type="submit"]');
        
        btn.innerText = "Actualizando..."; btn.disabled = true;
        try {
            // Actualiza solo el campo de salud
            await updateDoc(doc(window.db, "animales", idDoc), { salud: nuevoEstado });
            document.getElementById('modal-novedad').style.display = 'none';
        } catch (err) { alert("Error: " + err.message); } 
        finally { btn.innerText = "Actualizar Estado"; btn.disabled = false; }
    });
}

// 3. REGISTRO DE ANIMAL NUEVO
const formAnimal = document.getElementById('form-animal');
if (formAnimal) {
    formAnimal.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pesoInput = document.getElementById('a-peso').value.trim();
        const btn = formAnimal.querySelector('button[type="submit"]');
        btn.innerText = "Guardando..."; btn.disabled = true;

        try {
            await addDoc(collection(window.db, "animales"), {
                finca: document.getElementById('a-finca-select').value,
                arete: document.getElementById('a-arete').value.trim(),
                categoria: document.getElementById('a-categoria').value,
                peso: pesoInput !== '' ? Number(pesoInput) : null,
                padre: document.getElementById('a-padre').value.trim() || 'N/D',
                madre: document.getElementById('a-madre').value.trim() || 'N/D',
                estado: document.getElementById('a-estado').value,
                salud: "🟢 Sano", // Por defecto todos nacen o entran sanos
                fechaRegistro: serverTimestamp()
            });
            formAnimal.reset();
            document.getElementById('modal-animal').style.display = 'none';
        } catch (err) { alert("Error: " + err.message); } 
        finally { btn.innerText = "Guardar Animal"; btn.disabled = false; }
    });
}

// 4. LECTURA EN TIEMPO REAL (TABLA Y MONITOR CLÍNICO)
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
        
        // Diccionario para contar enfermedades
        let conteoSalud = {
            "🔴 Pata rota": 0, "🔴 Aborto": 0, "🟡 Mastitis": 0, 
            "🟠 En tiempo de retiro": 0, "🔴 Herida / Miasis": 0
        };

        snapshot.forEach((documento) => {
            const a = documento.data();
            const idDoc = documento.id;
            const saludActual = a.salud || "🟢 Sano"; // Si es viejo y no tiene estado, es Sano
            
            total++;
            if (a.categoria === "Lote ElbaLui (Maute)") mautes++;
            if (a.estado === "Gestante") gestantes++;
            if (conteoSalud[saludActual] !== undefined) conteoSalud[saludActual]++;

            const textoPeso = a.peso ? `${a.peso} kg` : `<span style="color:#94a3b8;">S/P</span>`;

            tabla.innerHTML += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);"><strong>${a.arete}</strong><br><span style="font-size: 0.7rem; color: #64748b;">${a.finca}</span></td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.categoria}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-weight: bold; color: var(--green-dark);">${textoPeso}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.estado}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-weight: 600;">${saludActual}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); text-align: center; white-space: nowrap;">
                        <!-- Botón Novedad 🏥 -->
                        <button onclick="abrirModalNovedad('${idDoc}', '${a.arete}', '${saludActual}')" style="background: #fef2f2; color: #be123c; border: 1px solid #fecdd3; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 5px;" title="Reportar Novedad">🏥</button>
                        <!-- Botón Eliminar 🗑️ -->
                        <button onclick="eliminarAnimal('${idDoc}', '${a.arete}')" style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 6px; cursor: pointer;" title="Eliminar">🗑️</button>
                    </td>
                </tr>
            `;
        });

        // Actualizar KPIs superiores
        if (document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = total;
        if (document.getElementById('kpi-mautes')) document.getElementById('kpi-mautes').innerText = mautes;
        if (document.getElementById('kpi-gestantes')) document.getElementById('kpi-gestantes').innerText = gestantes;

        // Renderizar el Monitor Global (Panel Rojo)
        let htmlAlertas = "";
        let animalesEnfermos = 0;
        
        for (const [enfermedad, cantidad] of Object.entries(conteoSalud)) {
            if (cantidad > 0) {
                htmlAlertas += `<span style="background: white; padding: 6px 12px; border-radius: 20px; border: 1px solid #fecdd3; color: #be123c; font-weight: 600; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#ffe4e6'" onmouseout="this.style.background='white'">${enfermedad}: ${cantidad}</span>`;
                animalesEnfermos += cantidad;
            }
        }

        if (animalesEnfermos === 0) {
            panelAlertas.innerHTML = `<span style="background: #ecfdf5; padding: 6px 12px; border-radius: 20px; border: 1px solid #a7f3d0; color: #047857; font-weight: 600;">🟢 Hato 100% Sano. Sin novedades.</span>`;
        } else {
            panelAlertas.innerHTML = htmlAlertas;
        }

        if (total === 0) tabla.innerHTML = `<tr><td colspan="6" style="padding: 15px; text-align: center; color: var(--text-muted);">Sin animales registrados (${fincaActiva}).</td></tr>`;
    }, (err) => console.error("Error Firestore:", err));
};
