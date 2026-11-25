import {
    collection, addDoc, query, where, onSnapshot, serverTimestamp,
    doc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let ID_DISPOSITIVO = localStorage.getItem('elbalui_dispositivo_id');
if (!ID_DISPOSITIVO) {
    ID_DISPOSITIVO = 'DEV-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    localStorage.setItem('elbalui_dispositivo_id', ID_DISPOSITIVO);
}

function notificar(mensaje, tipo = 'exito') {
    const limpio = String(mensaje).replace(/^[✅❌⚠️ℹ️]\s*/u, '');
    if (typeof window.mostrarToast === 'function') {
        window.mostrarToast(limpio, tipo);
    } else {
        console.log(`[${tipo.toUpperCase()}] ${limpio}`);
    }
}

function obtenerFincaActiva() {
    if (typeof window.obtenerFincaActual === 'function') {
        return window.obtenerFincaActual();
    }
    const tag = document.getElementById('finca-tag');
    if (!tag) return 'Agua Clara';
    if (tag.innerText.includes('CONSOLIDADO')) return 'Global';
    if (tag.innerText.includes('EL SUR')) return 'El Sur';
    return 'Agua Clara';
}

function registrarBitacoraLecheria(finca, tipo, descripcion) {
    const fincaActiva = obtenerFincaActiva();
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

let unsubscribeOrdenos = null;
window.datosOrdenosCache = [];

// ==========================================
// 🥛 REGISTRO DE ORDEÑO (VACAS OPCIONALES)
// ==========================================
async function manejarSubmitOrdeno(e) {
    e.preventDefault();
    if (!window.db) {
        notificar("Base de datos no inicializada.", "error");
        return;
    }

    const fincaSelect = document.getElementById('l-finca-select');
    const fincaActiva = obtenerFincaActiva();
    const fincaVal = (fincaSelect && fincaSelect.value)
        ? fincaSelect.value
        : (fincaActiva !== 'Global' ? fincaActiva : 'Agua Clara');

    const fechaVal = document.getElementById('l-fecha')?.value || new Date().toISOString().split('T')[0];
    const litrosRaw = document.getElementById('l-litros')?.value ?? '';
    const litrosVal = Number(litrosRaw);

    if (litrosRaw === '' || isNaN(litrosVal) || litrosVal <= 0) {
        notificar("Ingrese una cantidad de litros válida mayor a 0.", "error");
        return;
    }

    // Cantidad de vacas opcional: vacío o <= 0 no bloquea el guardado
    const inputVacas = document.getElementById('l-vacas') || document.getElementById('l-vacas-ordeno');
    const vacasRaw = inputVacas?.value ?? '';
    const vacasParsed = String(vacasRaw).trim() !== '' ? Number(vacasRaw) : NaN;
    const vacasVal = (!isNaN(vacasParsed) && vacasParsed > 0) ? vacasParsed : null;

    const obsVal = (document.getElementById('l-obs')?.value || '').trim();

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
        btn.innerText = "Guardando...";
        btn.disabled = true;
    }

    const registroOrdeno = {
        finca: fincaVal,
        fecha: fechaVal,
        litros: litrosVal,
        vacasOrdeno: vacasVal,
        observaciones: obsVal,
        dispositivo: ID_DISPOSITIVO,
        esPrueba: Boolean(window.modoTestActivo),
        fechaRegistro: serverTimestamp()
    };

    try {
        try {
            await addDoc(collection(window.db, "ordenos"), registroOrdeno);
        } catch (firestoreErr) {
            if (!navigator.onLine) {
                const pendientes = JSON.parse(localStorage.getItem('elbalui_pendientes_offline') || '[]');
                pendientes.push({ _coleccion: 'ordenos', ...registroOrdeno });
                localStorage.setItem('elbalui_pendientes_offline', JSON.stringify(pendientes));
            } else {
                throw firestoreErr;
            }
        }

        const detalleVacas = vacasVal !== null ? ` | Vacas: ${vacasVal}` : ' | Vacas: N/D';
        registrarBitacoraLecheria(
            fincaVal,
            'Lechería',
            `Ordeño registrado (${fechaVal}): ${litrosVal} L${detalleVacas}${obsVal ? ' - ' + obsVal : ''}`
        );

        notificar(
            navigator.onLine
                ? `Ordeño de ${litrosVal} L guardado en ${fincaVal}.`
                : `Ordeño de ${litrosVal} L guardado sin conexión.`,
            "exito"
        );

        e.target.reset();
        const inputFecha = document.getElementById('l-fecha');
        if (inputFecha && !inputFecha.value) {
            inputFecha.value = new Date().toISOString().split('T')[0];
        }
    } catch (err) {
        notificar("Error al guardar ordeño: " + err.message, "error");
    } finally {
        if (btn) {
            btn.innerText = "Guardar Ordeño";
            btn.disabled = false;
        }
    }
}

// ==========================================
// 📊 CARGA EN TIEMPO REAL Y PROYECCIÓN
// ==========================================
window.cargarLecheria = function() {
    const tablaBody = document.getElementById('tabla-ordenos-body');
    if (!window.db) return;

    if (unsubscribeOrdenos) {
        unsubscribeOrdenos();
        unsubscribeOrdenos = null;
    }

    const fincaActiva = obtenerFincaActiva();
    const q = (fincaActiva === 'Global')
        ? query(collection(window.db, "ordenos"))
        : query(collection(window.db, "ordenos"), where("finca", "==", fincaActiva));

    unsubscribeOrdenos = onSnapshot(q, (snapshot) => {
        const registros = [];
        snapshot.forEach((docSnap) => {
            registros.push({ id: docSnap.id, ...docSnap.data() });
        });

        registros.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
        window.datosOrdenosCache = registros;

        const reales = registros.filter(r => !r.esPrueba);
        const totalLitros = reales.reduce((acc, r) => acc + (Number(r.litros) || 0), 0);

        const diasUnicos = new Set(reales.map(r => r.fecha).filter(Boolean));
        const numDias = Math.max(1, diasUnicos.size);
        const promedioLitrosDia = reales.length > 0 ? (totalLitros / numDias) : 0;

        const vacasReportadas = reales
            .map(r => Number(r.vacasOrdeno))
            .filter(v => !isNaN(v) && v > 0);

        const hatoActivo = Array.isArray(window.datosHatoCache)
            ? window.datosHatoCache.filter(a => !a.esPrueba && a.estado !== 'Baja (Vendido/Muerto)')
            : [];
        const vacasHatoCount = hatoActivo.filter(a => a.categoria === 'Vaca Ordeño').length;

        const promedioVacasRef = vacasReportadas.length > 0
            ? (vacasReportadas.reduce((a, b) => a + b, 0) / vacasReportadas.length)
            : vacasHatoCount;

        const promedioPorVaca = promedioVacasRef > 0 ? (promedioLitrosDia / promedioVacasRef) : 0;

        if (document.getElementById('lecheria-kpi-litros')) {
            document.getElementById('lecheria-kpi-litros').innerText = `${totalLitros.toFixed(1)} L`;
        }
        if (document.getElementById('lecheria-kpi-promedio-dia')) {
            document.getElementById('lecheria-kpi-promedio-dia').innerText = `${promedioLitrosDia.toFixed(1)} L/día`;
        }
        if (document.getElementById('lecheria-kpi-promedio-vaca')) {
            document.getElementById('lecheria-kpi-promedio-vaca').innerText = promedioVacasRef > 0
                ? `${promedioPorVaca.toFixed(2)} L/vaca`
                : 'N/D';
        }
        if (document.getElementById('lecheria-kpi-vacas')) {
            document.getElementById('lecheria-kpi-vacas').innerText = promedioVacasRef > 0
                ? `${Math.round(promedioVacasRef)}`
                : 'N/D';
        }

        if (tablaBody) {
            if (registros.length === 0) {
                tablaBody.innerHTML = `<tr><td colspan="6" style="padding: 15px; text-align: center; color: var(--text-muted);">Sin registros de ordeño.</td></tr>`;
            } else {
                tablaBody.innerHTML = '';
                registros.forEach((r) => {
                    const vacasTexto = (Number(r.vacasOrdeno) > 0)
                        ? Number(r.vacasOrdeno)
                        : '<span style="color:#94a3b8;">N/D</span>';
                    const badgeTest = r.esPrueba
                        ? ' <span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700;">TEST</span>'
                        : '';
                    tablaBody.innerHTML += `
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${r.fecha || '-'}</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${r.finca || 'Agua Clara'}${badgeTest}</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-light); font-weight: 700;">${Number(r.litros || 0).toFixed(1)} L</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${vacasTexto}</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-light);">${r.observaciones || '-'}</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-light); text-align: center;">
                                <button onclick="window.eliminarOrdeno('${r.id}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecdd3;padding:4px 8px;border-radius:6px;cursor:pointer;" title="Eliminar registro">🗑️</button>
                            </td>
                        </tr>
                    `;
                });
            }
        }

        if (typeof window.calcularProyeccionLecheria === 'function') {
            window.calcularProyeccionLecheria(promedioLitrosDia);
        }
    }, (err) => {
        console.error("Error cargando ordeños:", err);
    });
};

window.eliminarOrdeno = async function(idOrdeno) {
    if (!window.db || !idOrdeno) return;
    if (!confirm("¿Eliminar este registro de ordeño?")) return;
    try {
        await deleteDoc(doc(window.db, "ordenos", idOrdeno));
        notificar("Registro de ordeño eliminado.", "exito");
    } catch (err) {
        notificar("Error al eliminar ordeño: " + err.message, "error");
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const formOrdeno = document.getElementById('form-ordeno');
    if (formOrdeno) {
        formOrdeno.addEventListener('submit', manejarSubmitOrdeno);
    }
    const inputVacas = document.getElementById('l-vacas') || document.getElementById('l-vacas-ordeno');
    if (inputVacas) {
        inputVacas.required = false;
    }
    const inputFecha = document.getElementById('l-fecha');
    if (inputFecha && !inputFecha.value) {
        inputFecha.value = new Date().toISOString().split('T')[0];
    }
});
