const COLECCION_AGRONOMIA = 'agronomia_labores';
const COLECCION_OPERACIONES = 'operaciones_equipos';
const COLECCION_FINANZAS_ERP = 'finanzas_movimientos';

let agronomiaCache = [];
let operacionesCache = [];
let finanzasCache = [];
let unsubAgro = null;
let unsubOp = null;
let unsubFin = null;

function obtenerFincaActiva() {
    return window.fincaActual || 'Agua Clara';
}

function obtenerFincaDestinoEscritura() {
    const actual = obtenerFincaActiva();
    return actual === 'Global' ? 'Agua Clara' : actual;
}

function escaparHTML(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatearMoneda(valor) {
    const num = Number(valor) || 0;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function filtrarPorFinca(lista) {
    const finca = obtenerFincaActiva();
    return lista.filter(item => {
        if (Boolean(item.esPrueba) !== Boolean(window.modoTestActivo)) return false;
        if (finca === 'Global') return true;
        return (item.finca || 'Agua Clara') === finca;
    });
}

function renderBadgeTest(item) {
    return item.esPrueba
        ? ' <span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">TEST</span>'
        : '';
}

function refrescarKPIsGlobales() {
    if (typeof window.actualizarTodosLosKPIs === 'function') {
        window.actualizarTodosLosKPIs();
    }
}

function inicializarFechasFormularios() {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${yyyy}-${mm}-${dd}`;

    ['agro-fecha', 'op-fecha', 'fin-fecha'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = fechaHoy;
    });
}

// --- PALMA & AGRONOMÍA ---
function renderizarAgronomia() {
    const tbody = document.getElementById('tbody-agronomia');
    if (!tbody) return;

    const lista = filtrarPorFinca(agronomiaCache);
    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#64748b;">No hay labores agronómicas registradas para ${escaparHTML(obtenerFincaActiva())}.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(reg => {
        const fincaPrefix = obtenerFincaActiva() === 'Global'
            ? `<strong>${escaparHTML(reg.finca || 'Agua Clara')}</strong> • `
            : '';
        return `
            <tr>
                <td>${escaparHTML(reg.fecha || '-')}</td>
                <td>${fincaPrefix}<strong>${escaparHTML(reg.cultivo || '-')}</strong>${renderBadgeTest(reg)}</td>
                <td>${escaparHTML(reg.lote || '-')}</td>
                <td>${escaparHTML(reg.labor || '-')}</td>
                <td>${Number(reg.cantidad) || 0}</td>
                <td>
                    <button type="button" class="erp-btn-del" onclick="window.eliminarRegistroERP('${COLECCION_AGRONOMIA}', '${escaparHTML(reg.id)}')">Borrar</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function manejarSubmitAgronomia(e) {
    e.preventDefault();
    if (!window.fbERP) return;

    const fecha = document.getElementById('agro-fecha')?.value;
    const cultivo = document.getElementById('agro-cultivo')?.value || '';
    const labor = document.getElementById('agro-labor')?.value || '';
    const lote = (document.getElementById('agro-lote')?.value || '').trim();
    const cantidad = Number(document.getElementById('agro-cantidad')?.value);

    if (!fecha || !lote || isNaN(cantidad) || cantidad <= 0) {
        if (window.mostrarToast) window.mostrarToast('Completa fecha, lote y una cantidad mayor a cero.', 'error');
        return;
    }

    const finca = obtenerFincaDestinoEscritura();

    try {
        const { db, collection, addDoc, serverTimestamp } = window.fbERP;
        await addDoc(collection(db, COLECCION_AGRONOMIA), {
            finca,
            fecha,
            cultivo,
            labor,
            lote,
            cantidad,
            esPrueba: Boolean(window.modoTestActivo),
            fechaCreacion: serverTimestamp()
        });

        if (window.registrarEnBitacora) {
            await window.registrarEnBitacora(
                finca,
                'Agronomia',
                `${labor} en ${cultivo} (Lote: ${lote}) — Cantidad: ${cantidad} (${fecha})`
            );
        }

        if (window.mostrarToast) window.mostrarToast('Labor agronómica registrada.', 'exito');
        document.getElementById('agro-lote').value = '';
        document.getElementById('agro-cantidad').value = '';
        refrescarKPIsGlobales();
    } catch (err) {
        console.error('Error guardando agronomía:', err);
        if (window.mostrarToast) window.mostrarToast('Error al guardar labor.', 'error');
    }
}

// --- OPERACIONES & ACTIVOS ---
function renderizarOperaciones() {
    const tbody = document.getElementById('tbody-operaciones');
    if (!tbody) return;

    const lista = filtrarPorFinca(operacionesCache);
    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#64748b;">No hay registros de maquinaria/activos para ${escaparHTML(obtenerFincaActiva())}.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(reg => {
        const fincaPrefix = obtenerFincaActiva() === 'Global'
            ? `<strong>${escaparHTML(reg.finca || 'Agua Clara')}</strong> • `
            : '';
        const horoIni = Number(reg.horoIni) || 0;
        const horoFin = Number(reg.horoFin) || 0;
        const horas = Math.max(0, horoFin - horoIni);

        return `
            <tr>
                <td>${escaparHTML(reg.fecha || '-')}</td>
                <td>${fincaPrefix}<strong>${escaparHTML(reg.equipo || '-')}</strong>${renderBadgeTest(reg)}</td>
                <td>${horoIni.toFixed(1)} → ${horoFin.toFixed(1)}</td>
                <td><strong>${horas.toFixed(1)} h</strong></td>
                <td>${(Number(reg.gasoil) || 0).toFixed(1)} L</td>
                <td>
                    <button type="button" class="erp-btn-del" onclick="window.eliminarRegistroERP('${COLECCION_OPERACIONES}', '${escaparHTML(reg.id)}')">Borrar</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function manejarSubmitOperaciones(e) {
    e.preventDefault();
    if (!window.fbERP) return;

    const fecha = document.getElementById('op-fecha')?.value;
    const equipo = (document.getElementById('op-equipo')?.value || '').trim();
    const horoIni = Number(document.getElementById('op-horo-ini')?.value);
    const horoFin = Number(document.getElementById('op-horo-fin')?.value);
    const gasoil = Number(document.getElementById('op-gasoil')?.value) || 0;

    if (!fecha || !equipo || isNaN(horoIni) || isNaN(horoFin)) {
        if (window.mostrarToast) window.mostrarToast('Completa equipo y horómetros.', 'error');
        return;
    }

    if (horoFin < horoIni) {
        if (window.mostrarToast) window.mostrarToast('El horómetro final no puede ser menor al inicial.', 'error');
        return;
    }

    const finca = obtenerFincaDestinoEscritura();
    const horasTrabajadas = horoFin - horoIni;

    try {
        const { db, collection, addDoc, serverTimestamp } = window.fbERP;
        await addDoc(collection(db, COLECCION_OPERACIONES), {
            finca,
            fecha,
            equipo,
            horoIni,
            horoFin,
            horasTrabajadas,
            gasoil,
            esPrueba: Boolean(window.modoTestActivo),
            fechaCreacion: serverTimestamp()
        });

        if (window.registrarEnBitacora) {
            await window.registrarEnBitacora(
                finca,
                'Maquinaria',
                `Uso de ${equipo}: ${horasTrabajadas.toFixed(1)} h (${horoIni}→${horoFin}), Combustible: ${gasoil.toFixed(1)} L (${fecha})`
            );
        }

        if (window.mostrarToast) window.mostrarToast('Uso de equipo registrado.', 'exito');
        document.getElementById('op-equipo').value = '';
        document.getElementById('op-horo-ini').value = '';
        document.getElementById('op-horo-fin').value = '';
        document.getElementById('op-gasoil').value = '0';
        refrescarKPIsGlobales();
    } catch (err) {
        console.error('Error guardando operación:', err);
        if (window.mostrarToast) window.mostrarToast('Error al guardar el registro.', 'error');
    }
}

// --- FINANZAS & COSTOS ---
function renderizarFinanzas() {
    const tbody = document.getElementById('tbody-finanzas');
    const kpiIng = document.getElementById('kpi-fin-ingresos');
    const kpiEgr = document.getElementById('kpi-fin-egresos');
    const kpiBal = document.getElementById('kpi-fin-balance');
    const kpiMargen = document.getElementById('kpi-fin-margen');

    const lista = filtrarPorFinca(finanzasCache);
    let totalIngresos = 0;
    let totalEgresos = 0;

    lista.forEach(reg => {
        const monto = Math.max(0, Number(reg.monto) || 0);
        if (reg.tipo === 'Egreso') {
            totalEgresos += monto;
        } else {
            totalIngresos += monto;
        }
    });

    const balance = totalIngresos - totalEgresos;
    const margenPct = totalIngresos > 0 ? (balance / totalIngresos) * 100 : 0;

    if (kpiIng) kpiIng.textContent = formatearMoneda(totalIngresos);
    if (kpiEgr) kpiEgr.textContent = formatearMoneda(totalEgresos);
    if (kpiBal) {
        kpiBal.textContent = formatearMoneda(balance);
        kpiBal.style.color = balance < 0 ? '#dc2626' : '#065f46';
    }
    if (kpiMargen) {
        kpiMargen.textContent = `${margenPct.toFixed(1)}%`;
        kpiMargen.style.color = margenPct < 0 ? '#dc2626' : '#1e40af';
    }

    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#64748b;">No hay movimientos financieros para ${escaparHTML(obtenerFincaActiva())}.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(reg => {
        const fincaPrefix = obtenerFincaActiva() === 'Global'
            ? `<strong>${escaparHTML(reg.finca || 'Agua Clara')}</strong> • `
            : '';
        const esEgreso = reg.tipo === 'Egreso';
        const colorMonto = esEgreso ? 'color:#dc2626; font-weight:700;' : 'color:#15803d; font-weight:700;';
        const signo = esEgreso ? '-' : '+';

        return `
            <tr>
                <td>${escaparHTML(reg.fecha || '-')}</td>
                <td>${escaparHTML(reg.tipo || 'Ingreso')}</td>
                <td>${fincaPrefix}${escaparHTML(reg.centro || '-')}${renderBadgeTest(reg)}</td>
                <td>${escaparHTML(reg.concepto || '-')}</td>
                <td style="${colorMonto}">${signo}${formatearMoneda(reg.monto)}</td>
                <td>
                    <button type="button" class="erp-btn-del" onclick="window.eliminarRegistroERP('${COLECCION_FINANZAS_ERP}', '${escaparHTML(reg.id)}')">Borrar</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function manejarSubmitFinanzas(e) {
    e.preventDefault();
    if (!window.fbERP) return;

    const fecha = document.getElementById('fin-fecha')?.value;
    const tipo = document.getElementById('fin-tipo')?.value || 'Ingreso';
    const centro = document.getElementById('fin-centro')?.value || 'Lechería';
    const concepto = (document.getElementById('fin-concepto')?.value || '').trim();
    const monto = Number(document.getElementById('fin-monto')?.value);

    if (!fecha || !concepto || isNaN(monto) || monto <= 0) {
        if (window.mostrarToast) window.mostrarToast('Completa fecha, concepto y monto válido.', 'error');
        return;
    }

    const finca = obtenerFincaDestinoEscritura();

    try {
        const { db, collection, addDoc, serverTimestamp } = window.fbERP;
        await addDoc(collection(db, COLECCION_FINANZAS_ERP), {
            finca,
            fecha,
            tipo,
            centro,
            concepto,
            monto,
            esPrueba: Boolean(window.modoTestActivo),
            origenModulo: 'finanzas',
            fechaCreacion: serverTimestamp()
        });

        if (window.mostrarToast) window.mostrarToast(`${tipo} registrado en Finanzas.`, 'exito');
        document.getElementById('fin-concepto').value = '';
        document.getElementById('fin-monto').value = '';
        refrescarKPIsGlobales();
    } catch (err) {
        console.error('Error guardando movimiento financiero:', err);
        if (window.mostrarToast) window.mostrarToast('Error al guardar movimiento.', 'error');
    }
}

window.eliminarRegistroERP = async function(coleccion, id) {
    if (!coleccion || !id || !window.fbERP) return;
    try {
        const { db, doc, deleteDoc } = window.fbERP;
        await deleteDoc(doc(db, coleccion, id));
        if (window.mostrarToast) window.mostrarToast('Registro eliminado.', 'info');
        refrescarKPIsGlobales();
    } catch (err) {
        console.error(`Error eliminando en ${coleccion}:`, err);
        if (window.mostrarToast) window.mostrarToast('No se pudo eliminar el registro.', 'error');
    }
};

function suscribirColeccionesERP() {
    if (!window.fbERP) return;
    const { db, collection, query, orderBy, onSnapshot } = window.fbERP;

    if (unsubAgro) unsubAgro();
    unsubAgro = onSnapshot(query(collection(db, COLECCION_AGRONOMIA), orderBy('fecha', 'desc')), snap => {
        agronomiaCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderizarAgronomia();
        refrescarKPIsGlobales();
    }, err => console.error('Error escuchando agronomía:', err));

    if (unsubOp) unsubOp();
    unsubOp = onSnapshot(query(collection(db, COLECCION_OPERACIONES), orderBy('fecha', 'desc')), snap => {
        operacionesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderizarOperaciones();
        refrescarKPIsGlobales();
    }, err => console.error('Error escuchando operaciones:', err));

    if (unsubFin) unsubFin();
    unsubFin = onSnapshot(query(collection(db, COLECCION_FINANZAS_ERP), orderBy('fecha', 'desc')), snap => {
        finanzasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderizarFinanzas();
        refrescarKPIsGlobales();
    }, err => console.error('Error escuchando finanzas:', err));
}

function enlazarFormulariosERP() {
    const fAgro = document.getElementById('form-agronomia');
    if (fAgro && !fAgro.dataset.bound) {
        fAgro.dataset.bound = '1';
        fAgro.addEventListener('submit', manejarSubmitAgronomia);
    }

    const fOp = document.getElementById('form-operaciones');
    if (fOp && !fOp.dataset.bound) {
        fOp.dataset.bound = '1';
        fOp.addEventListener('submit', manejarSubmitOperaciones);
    }

    const fFin = document.getElementById('form-finanzas');
    if (fFin && !fFin.dataset.bound) {
        fFin.dataset.bound = '1';
        fFin.addEventListener('submit', manejarSubmitFinanzas);
    }
}

window.cargarModulosERP = function() {
    inicializarFechasFormularios();
    enlazarFormulariosERP();
    suscribirColeccionesERP();
    renderizarAgronomia();
    renderizarOperaciones();
    renderizarFinanzas();
    refrescarKPIsGlobales();
};

window.addEventListener('fincaCambiada', () => {
    renderizarAgronomia();
    renderizarOperaciones();
    renderizarFinanzas();
    refrescarKPIsGlobales();
});

document.addEventListener('DOMContentLoaded', () => {
    inicializarFechasFormularios();
    enlazarFormulariosERP();
});
