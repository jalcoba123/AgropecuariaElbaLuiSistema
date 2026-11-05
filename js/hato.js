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

// 1. ELIMINAR ANIMAL
window.eliminarAnimal = async function(idDoc, arete) {
    if (!window.db) {
        alert("⚠️ Error: Conexión con Firestore no inicializada.");
        return;
    }
    const confirmacion = confirm(`¿Estás seguro de eliminar el animal con Arete "${arete}"?\nEsta acción lo borrará permanentemente de la base de datos.`);
    
    if (confirmacion) {
        try {
            await deleteDoc(doc(window.db, "animales", idDoc));
            alert("✅ Animal eliminado con éxito.");
        } catch (error) {
            alert("⚠️ Error al eliminar en Firestore: " + error.message);
        }
    }
};

// 2. REGISTRO DE ANIMALES
const formAnimal = document.getElementById('form-animal');
if (formAnimal) {
    formAnimal.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!window.db) {
            alert("⚠️ Error: Base de datos no conectada. Espera un segundo e intenta de nuevo.");
            return;
        }

        const fincaSelect = document.getElementById('a-finca-select');
        const fincaDestino = fincaSelect ? fincaSelect.value : 'Agua Clara';
        const btn = formAnimal.querySelector('button[type="submit"]');
        
        const pesoInput = document.getElementById('a-peso').value.trim();
        const pesoValor = pesoInput !== '' ? Number(pesoInput) : null;

        btn.innerText = "Guardando..."; 
        btn.disabled = true;

        try {
            await addDoc(collection(window.db, "animales"), {
                finca: fincaDestino,
                arete: document.getElementById('a-arete').value.trim(),
                categoria: document.getElementById('a-categoria').value,
                peso: pesoValor,
                padre: document.getElementById('a-padre').value.trim() || 'N/D',
                madre: document.getElementById('a-madre').value.trim() || 'N/D',
                estado: document.getElementById('a-estado').value,
                fechaRegistro: serverTimestamp()
            });

            alert("✅ ¡Animal registrado exitosamente!");
            formAnimal.reset();
            document.getElementById('modal-animal').style.display = 'none';

        } catch (err) {
            alert("⚠️ ERROR DE FIRESTORE AL GUARDAR:\n\n" + err.message);
            console.error("Error al guardar animal:", err);
        } finally {
            btn.innerText = "Guardar en Inventario"; 
            btn.disabled = false;
        }
    });
}

// 3. LECTURA EN TIEMPO REAL
window.cargarHato = function() {
    const tabla = document.getElementById('tabla-hato-body');
    if (!tabla || !window.db) return;

    const fincaActiva = obtenerFincaActual();
    let q = (fincaActiva === 'Global')
        ? query(collection(window.db, "animales"))
        : query(collection(window.db, "animales"), where("finca", "==", fincaActiva));

    onSnapshot(q, (snapshot) => {
        tabla.innerHTML = '';
        let total = 0, mautes = 0, gestantes = 0, becerros = 0;

        snapshot.forEach((documento) => {
            const a = documento.data();
            const idDoc = documento.id;
            total++;
            
            if (a.categoria === "Lote ElbaLui (Maute)") mautes++;
            if (a.categoria === "Becerro(a)") becerros++;
            if (a.estado === "Gestante") gestantes++;

            const textoPeso = (a.peso !== null && a.peso !== undefined && a.peso !== '') 
                ? `${a.peso} kg` 
                : `<span style="color: var(--text-muted); font-weight: normal;">S/P</span>`;

            tabla.innerHTML += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);"><strong>${a.arete}</strong></td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.categoria}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);"><span style="font-size: 0.75rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${a.finca || 'Agua Clara'}</span></td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.padre} / ${a.madre}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-weight: bold; color: var(--green-dark);">${textoPeso}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${a.estado}</td>
                    <td style="padding: 10px; border-bottom: 1px solid var(--border-light); text-align: center;">
                        <button onclick="eliminarAnimal('${idDoc}', '${a.arete}')" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;" title="Eliminar animal">🗑️</button>
                    </td>
                </tr>
            `;
        });

        // Contadores Módulo Hato
        if (document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = total;
        if (document.getElementById('kpi-mautes')) document.getElementById('kpi-mautes').innerText = mautes;
        if (document.getElementById('kpi-gestantes')) document.getElementById('kpi-gestantes').innerText = gestantes;

        // Contadores Dashboard
        if (document.getElementById('dash-total-hato')) document.getElementById('dash-total-hato').innerText = total;

        if (total === 0) {
            tabla.innerHTML = `<tr><td colspan="7" style="padding: 15px; text-align: center; color: var(--text-muted);">Sin animales registrados (${fincaActiva}).</td></tr>`;
        }
    }, (err) => console.error("Error leyendo Firestore:", err));
};
