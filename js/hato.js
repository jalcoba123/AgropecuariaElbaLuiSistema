// js/hato.js
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    onSnapshot, 
    serverTimestamp,
    doc,
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

function obtenerFincaActual() {
    const tag = document.getElementById('finca-tag');
    if (!tag) return 'Agua Clara';
    const txt = tag.innerText;
    if (txt.includes('CONSOLIDADO') || txt.includes('GLOBAL')) return 'Global';
    if (txt.includes('EL SUR')) return 'El Sur';
    return 'Agua Clara';
}

// 1. FUNCIÓN GLOBAL PARA ELIMINAR ANIMAL
window.eliminarAnimal = async function(idDoc, arete) {
    const confirmacion = confirm(`¿Estás seguro de eliminar el animal con Arete "${arete}"?\nEsta acción lo borrará permanentemente de la base de datos.`);
    
    if (confirmacion && window.db) {
        try {
            await deleteDoc(doc(window.db, "animales", idDoc));
        } catch (error) {
            alert("Error al eliminar el registro: " + error.message);
        }
    }
};

// 2. REGISTRO DE ANIMALES
const formAnimal = document.getElementById('form-animal');
if (formAnimal) {
    formAnimal.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fincaSelect = document.getElementById('a-finca-select');
        const fincaDestino = fincaSelect ? fincaSelect.value : 'Agua Clara';
        const btn = formAnimal.querySelector('button[type="submit"]');
        btn.innerText = "Guardando..."; btn.disabled = true;

        try {
            await addDoc(collection(window.db, "animales"), {
                finca: fincaDestino,
                arete: document.getElementById('a-arete').value.trim(),
                categoria: document.getElementById('a-categoria').value,
                peso: Number(document.getElementById('a-peso').value),
                padre: document.getElementById('a-padre').value.trim() || 'N/D',
                madre: document.getElementById('a-madre').value.trim() || 'N/D',
                estado: document.getElementById('a-estado').value,
                fechaRegistro: serverTimestamp()
            });

            formAnimal.reset();
            document.getElementById('modal-animal').style.display = 'none';
        } catch (err) {
            console.error("Error al guardar animal:", err);
            alert("Error al guardar en base de datos: " + err.message);
        } finally {
            btn.innerText = "Guardar en Inventario"; btn.disabled = false;
        }
    });
}

// 3. LECTURA EN TIEMPO REAL CON BOTÓN DE ELIMINACIÓN
window.cargarHato = function() {
    const tabla = document.getElementById('tabla-hato-body');
    if (!tabla || !window.db) return;

    const fincaActiva = obtenerFincaActual();
    let q = (fincaActiva === 'Global')
        ? query(collection(window.db, "animales"))
        : query(collection(window.db, "animales"), where("finca", "==", fincaActiva));

    onSnapshot(q, (snapshot) => {
        tabla.innerHTML = '';
        let total = 0, mautes = 0, gestantes = 0;

        snapshot.forEach((documento) => {
            const a = documento.data();
            const idDoc = documento.id; // ID único generado por Firebase
            total++;
            if (a.categoria === "Lote ElbaLui (Maute)") mautes++;
            if (a.estado === "Gestante") gestantes++;

            tabla.innerHTML += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);"><strong>${a.arete}</strong></td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.categoria}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);"><span style="font-size: 0.75rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${a.finca || 'Agua Clara'}</span></td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.padre} / ${a.madre}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-weight: bold; color: var(--green-dark);">${a.peso} kg</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.estado}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); text-align: center;">
                        <button onclick="eliminarAnimal('${idDoc}', '${a.arete}')" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;" title="Eliminar animal">🗑️</button>
                    </td>
                </tr>
            `;
        });

        // Contadores Hato
        if (document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = total;
        if (document.getElementById('kpi-mautes')) document.getElementById('kpi-mautes').innerText = mautes;
        if (document.getElementById('kpi-gestantes')) document.getElementById('kpi-gestantes').innerText = gestantes;

        // Contadores Dashboard
        if (document.getElementById('dash-total-hato')) document.getElementById('dash-total-hato').innerText = total;

        if (total === 0) {
            tabla.innerHTML = `<tr><td colspan="7" style="padding: 15px; text-align: center; color: var(--text-muted);">Sin animales registrados (${fincaActiva}).</td></tr>`;
        }
    }, (err) => console.error("Error leyendo Hato:", err));
};deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
