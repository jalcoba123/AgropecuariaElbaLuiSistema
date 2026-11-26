const COLECCION_LECHERIA = 'lecheria_ordenos';
const COLECCION_FINANZAS = 'finanzas_movimientos';
const COLECCION_PROY_LECHE = 'proyeccion_leche_5y';
const COLECCION_INVOICES_LECHE = 'lecheria_invoices';

const MODELO_BASE_5_ANOS = [
    { ano: '1er año', vacas: 40, diasLactancia: 180, promDiario: 3.0, valorLitro: 0.68 },
    { ano: '2do año', vacas: 44, diasLactancia: 180, promDiario: 5.0, valorLitro: 0.68 },
    { ano: '3er año', vacas: 48, diasLactancia: 180, promDiario: 6.0, valorLitro: 0.68 },
    { ano: '4to año', vacas: 52, diasLactancia: 180, promDiario: 6.0, valorLitro: 0.68 },
    { ano: '5to año', vacas: 56, diasLactancia: 180, promDiario: 6.0, valorLitro: 0.68 }
];

let ordenosCache = [];
let invoicesCache = [];
let proyeccionCache = MODELO_BASE_5_ANOS.map(item => ({ ...item }));
let unsubscribeLecheria = null;
let unsubscribeProyeccion = null;
let unsubscribeInvoices = null;
let invoiceSeleccionadoActual = null;

function obtenerFincaActiva() {
    return window.fincaActual || 'Agua Clara';
}

function obtenerFincaDestinoEscritura() {
    const actual = obtenerFincaActiva();
    return actual === 'Global' ? 'Agua Clara' : actual;
}

function escaparHTML(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"');
}

function formatearMoneda(valor) {
    const num = Number(valor) || 0;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatearLitros(valor, dec = 1) {
    const num = Number(valor) || 0;
    return `${num.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })} L`;
}

function formatearEntero(valor) {
    return (Math.round(Number(valor) || 0)).toLocaleString('en-US');
}

function obtenerFechaHoyISO() {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function inicializarFechaPorDefecto() {
    const fechaHoy = obtenerFechaHoyISO();
    const inputFecha = document.getElementById('lech-fecha');
    if (inputFecha && !inputFecha.value) {
        inputFecha.value = fechaHoy;
    }
    const inputVacas = document.getElementById('lech-vacas');
    if (inputVacas) {
        inputVacas.required = false;
    }
    const inputInvFecha = document.getElementById('inv-fecha');
    if (inputInvFecha && !inputInvFecha.value) {
        inputInvFecha.value = fechaHoy;
    }
}

function actualizarTituloFincaLecheria() {
    const titulo = document.getElementById('lech-titulo-finca');
    if (!titulo) return;
    const finca = obtenerFincaActiva();
    titulo.textContent = finca === 'Global'
        ? '🥛 Lechería & Raciones (Consolidado)'
        : `🥛 Lechería & Raciones (${finca})`;
}

window.cambiarSubtabLecheria = function(subtab) {
    const diarioDiv = document.getElementById('lech-subtab-diario');
    const proyDiv = document.getElementById('lech-subtab-proyeccion');
    const btnDiario = document.getElementById('btn-lech-subtab-diario');
    const btnProy = document.getElementById('btn-lech-subtab-proyeccion');

    const esProy = subtab === 'proyeccion';
    if (diarioDiv) diarioDiv.style.display = esProy ? 'none' : 'block';
    if (proyDiv) proyDiv.style.display = esProy ? 'block' : 'none';
    if (btnDiario) btnDiario.classList.toggle('active', !esProy);
    if (btnProy) btnProy.classList.toggle('active', esProy);

    if (esProy) {
        renderizarProyeccion5Anos();
    }
};

function calcularMetricasOrdeno(reg) {
    const vacas = Math.max(0, Number(reg.vacas) || 0);
    const litros = Math.max(0, Number(reg.litros) || 0);
    const precio = Math.max(0, Number(reg.precio) || 0);
    const costoRacion = Math.max(0, Number(reg.costoRacion) || 0);
    const promVaca = vacas > 0 ? litros / vacas : 0;
    const ingreso = litros * precio;
    const margen = ingreso - costoRacion;
    return { vacas, litros, precio, costoRacion, promVaca, ingreso, margen };
}

function filtrarOrdenosPorFinca() {
    const finca = obtenerFincaActiva();
    return ordenosCache.filter(item => {
        if (Boolean(item.esPrueba) !== Boolean(window.modoTestActivo)) return false;
        if (finca === 'Global') return true;
        return (item.finca || 'Agua Clara') === finca;
    });
}

function filtrarInvoicesPorFinca() {
    const finca = obtenerFincaActiva();
    return invoicesCache.filter(item => {
        if (Boolean(item.esPrueba) !== Boolean(window.modoTestActivo)) return false;
        if (finca === 'Global') return true;
        return (item.finca || 'Agua Clara') === finca;
    });
}

function renderizarAlertasYMetricas() {
    const listaFinca = filtrarOrdenosPorFinca();
    const kpiHoy = document.getElementById('kpi-leche-hoy');
    const kpiProm = document.getElementById('kpi-leche-promedio');
    const kpiIngreso = document.getElementById('kpi-leche-ingreso');
    const kpiMargen = document.getElementById('kpi-leche-margen');
    const panelAlertas = document.getElementById('lech-alertas-panel');

    if (listaFinca.length === 0) {
        if (kpiHoy) kpiHoy.textContent = '0.0 L';
        if (kpiProm) kpiProm.textContent = '0.0 L';
        if (kpiIngreso) kpiIngreso.textContent = '$0.00';
        if (kpiMargen) kpiMargen.textContent = '$0.00';
        if (panelAlertas) panelAlertas.innerHTML = '';
        return;
    }

    const fechaUltimo = listaFinca[0].fecha;
    const registrosDia = listaFinca.filter(r => r.fecha === fechaUltimo);

    let totalLitrosDia = 0;
    let totalVacasDia = 0;
    let totalIngresoDia = 0;
    let totalCostoRacionDia = 0;

    registrosDia.forEach(reg => {
        const m = calcularMetricasOrdeno(reg);
        totalLitrosDia += m.litros;
        totalVacasDia += m.vacas;
        totalIngresoDia += m.ingreso;
        totalCostoRacionDia += m.costoRacion;
    });

    const promVacaDia = totalVacasDia > 0 ? totalLitrosDia / totalVacasDia : 0;
    const margenDia = totalIngresoDia - totalCostoRacionDia;

    if (kpiHoy) kpiHoy.textContent = formatearLitros(totalLitrosDia, 1);
    if (kpiProm) kpiProm.textContent = totalVacasDia > 0 ? formatearLitros(promVacaDia, 1) : 'N/D';
    if (kpiIngreso) kpiIngreso.textContent = formatearMoneda(totalIngresoDia);
    if (kpiMargen) {
        kpiMargen.textContent = formatearMoneda(margenDia);
        kpiMargen.style.color = margenDia < 0 ? '#dc2626' : '#0f172a';
    }

    if (panelAlertas) {
        const alertas = [];
        if (promVacaDia > 0 && promVacaDia < 4.0) {
            alertas.push(`⚠️ Promedio bajo (${promVacaDia.toFixed(1)} L/vaca el ${escaparHTML(fechaUltimo)}): revisar oferta de Silo Cuba 22, melaza, nepe o gallinaza.`);
        }
        if (totalCostoRacionDia > 0 && margenDia < 0) {
            alertas.push(`🚨 Margen sobre ración negativo (${formatearMoneda(margenDia)}): el costo diario de suplementación supera el ingreso estimado del día.`);
        }
        panelAlertas.innerHTML = alertas.length
            ? `<div style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:0.75rem 1rem; border-radius:0.5rem; font-size:0.84rem; display:flex; flex-direction:column; gap:4px;">${alertas.map(a => `<div>${a}</div>`).join('')}</div>`
            : '';
    }
}

function renderizarTablaOrdenos() {
    const tbody = document.getElementById('tbody-lecheria');
    if (!tbody) return;

    const listaFinca = filtrarOrdenosPorFinca();
    if (listaFinca.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:#64748b;">No hay registros de ordeño para ${escaparHTML(obtenerFincaActiva())}.</td></tr>`;
        return;
    }

    tbody.innerHTML = listaFinca.map(reg => {
        const m = calcularMetricasOrdeno(reg);
        const fincaTag = obtenerFincaActiva() === 'Global'
            ? `<strong>${escaparHTML(reg.finca || 'Agua Clara')}</strong> • `
            : '';
        const badgeTest = reg.esPrueba
            ? ' <span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">TEST</span>'
            : '';
        const margenColor = m.margen < 0 ? 'color:#dc2626; font-weight:700;' : 'color:#15803d; font-weight:700;';
        const refBorrado = reg.ordenoRefId || reg.id;
        const vacasTxt = m.vacas > 0 ? formatearEntero(m.vacas) : '<span style="color:#94a3b8;">N/D</span>';
        const promTxt = m.vacas > 0 ? formatearLitros(m.promVaca, 1) : '<span style="color:#94a3b8;">N/D</span>';

        return `
            <tr>
                <td>${escaparHTML(reg.fecha || '-')}</td>
                <td>${fincaTag}${escaparHTML(reg.turno || 'Mañana')}${badgeTest}</td>
                <td>${vacasTxt}</td>
                <td><strong>${formatearLitros(m.litros, 1)}</strong></td>
                <td>${promTxt}</td>
                <td>${escaparHTML(reg.destino || 'Venta')}</td>
                <td>${escaparHTML(reg.racion || '-')}</td>
                <td>${formatearMoneda(m.ingreso)}</td>
                <td style="${margenColor}">${formatearMoneda(m.margen)}</td>
                <td>
                    <button type="button" class="erp-btn-del" onclick="window.eliminarOrdeno('${escaparHTML(reg.id)}', '${escaparHTML(refBorrado)}')">Borrar</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function sincronizarIngresoAFinanzas(datosOrdeno, metricas, ordenoRefId) {
    if (!window.fbERP || metricas.ingreso <= 0) return;
    if ((datosOrdeno.destino || 'Venta') !== 'Venta') return;

    try {
        const { db, collection, addDoc, serverTimestamp } = window.fbERP;
        await addDoc(collection(db, COLECCION_FINANZAS), {
            finca: datosOrdeno.finca,
            fecha: datosOrdeno.fecha,
            tipo: 'Ingreso',
            centro: 'Lechería',
            concepto: `Venta leche (${metricas.litros.toFixed(1)} L - ${datosOrdeno.turno})`,
            monto: Number(metricas.ingreso.toFixed(2)),
            esPrueba: Boolean(datosOrdeno.esPrueba),
            origenModulo: 'lecheria',
            ordenoId: ordenoRefId,
            fechaCreacion: serverTimestamp()
        });
        if (window.cargarModulosERP) window.cargarModulosERP();
    } catch (err) {
        console.error('Error sincronizando venta de leche a Finanzas:', err);
    }
}

async function manejarSubmitOrdeno(e) {
    e.preventDefault();
    if (!window.fbERP) {
        if (window.mostrarToast) window.mostrarToast('Conexión a base de datos no disponible.', 'error');
        return;
    }

    const fecha = document.getElementById('lech-fecha')?.value;
    const turno = document.getElementById('lech-turno')?.value || 'Mañana';
    const vacasRaw = document.getElementById('lech-vacas')?.value ?? '';
    const vacas = String(vacasRaw).trim() !== '' ? Math.max(0, Number(vacasRaw) || 0) : 0;
    const litros = Number(document.getElementById('lech-litros')?.value);
    const precio = Number(document.getElementById('lech-precio')?.value);
    const destino = document.getElementById('lech-destino')?.value || 'Venta';
    const racion = document.getElementById('lech-racion')?.value || 'Silo Cuba 22 + Melaza';
    const costoRacion = Number(document.getElementById('lech-costo-racion')?.value) || 0;
    const syncFinanzas = Boolean(document.getElementById('lech-sync-finanzas')?.checked);

    if (!fecha || isNaN(litros) || litros <= 0 || isNaN(precio) || precio < 0) {
        if (window.mostrarToast) window.mostrarToast('Verifica fecha, litros y precio.', 'error');
        return;
    }

    const finca = obtenerFincaDestinoEscritura();
    const ordenoRefId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nuevoRegistro = {
        finca,
        fecha,
        turno,
        vacas,
        litros,
        precio,
        destino,
        racion,
        costoRacion,
        syncFinanzas,
        esPrueba: Boolean(window.modoTestActivo),
        ordenoRefId
    };

    const metricas = calcularMetricasOrdeno(nuevoRegistro);

    try {
        const { db, collection, addDoc, serverTimestamp } = window.fbERP;
        await addDoc(collection(db, COLECCION_LECHERIA), {
            ...nuevoRegistro,
            fechaCreacion: serverTimestamp()
        });

        if (syncFinanzas) {
            await sincronizarIngresoAFinanzas(nuevoRegistro, metricas, ordenoRefId);
        }

        if (window.registrarEnBitacora) {
            const infoVacas = vacas > 0 ? ` en ${vacas} vacas (${metricas.promVaca.toFixed(1)} L/vaca)` : '';
            await window.registrarEnBitacora(
                finca,
                'Lecheria',
                `Ordeño ${turno} (${fecha}): ${litros.toFixed(1)} L${infoVacas} • Ración: ${racion}`
            );
        }

        if (window.mostrarToast) {
            window.mostrarToast(`Ordeño guardado (${litros.toFixed(1)} L).`, 'exito');
        }

        const litrosInput = document.getElementById('lech-litros');
        const costoInput = document.getElementById('lech-costo-racion');
        if (litrosInput) litrosInput.value = '';
        if (costoInput) costoInput.value = '0';
    } catch (err) {
        console.error('Error guardando ordeño:', err);
        if (window.mostrarToast) window.mostrarToast('Error al guardar el ordeño.', 'error');
    }
}

window.eliminarOrdeno = async function(id, ordenoRefId = '') {
    if (!id || !window.fbERP) return;
    try {
        const { db, doc, deleteDoc, collection, query, where, getDocs } = window.fbERP;
        const claves = Array.from(new Set([id, ordenoRefId].filter(Boolean)));

        for (const clave of claves) {
            const qFin = query(collection(db, COLECCION_FINANZAS), where('ordenoId', '==', clave));
            const snapFin = await getDocs(qFin);
            for (const d of snapFin.docs) {
                await deleteDoc(doc(db, COLECCION_FINANZAS, d.id));
            }
        }

        await deleteDoc(doc(db, COLECCION_LECHERIA, id));
        if (window.mostrarToast) window.mostrarToast('Registro de ordeño eliminado.', 'info');
        if (window.cargarModulosERP) window.cargarModulosERP();
    } catch (err) {
        console.error('Error eliminando ordeño:', err);
        if (window.mostrarToast) window.mostrarToast('No se pudo eliminar el registro.', 'error');
    }
};

// ==========================================
// 🧾 INVOICES DE LECHE (GENERADOR ERP)
// ==========================================
function generarNumeroInvoice() {
    const existentes = invoicesCache.length + 1;
    return `INV-${String(existentes).padStart(4, '0')}`;
}

function actualizarPreviewTotalInvoice() {
    const litros = Math.max(0, Number(document.getElementById('inv-litros')?.value) || 0);
    const precio = Math.max(0, Number(document.getElementById('inv-precio')?.value) || 0);
    const total = litros * precio;

    const previewTotal = document.getElementById('inv-total-preview');
    if (previewTotal) previewTotal.value = formatearMoneda(total);

    const previewCorr = document.getElementById('inv-correlativo-preview');
    if (previewCorr) previewCorr.textContent = `N° ${generarNumeroInvoice()}`;
}

function renderizarTablaInvoices() {
    const tbody = document.getElementById('tbody-invoices-leche');
    if (!tbody) return;

    actualizarPreviewTotalInvoice();
    const lista = filtrarInvoicesPorFinca();

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.25rem; color:#64748b;">No hay invoices emitidos para ${escaparHTML(obtenerFincaActiva())}.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(inv => {
        const badgeTest = inv.esPrueba
            ? ' <span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">TEST</span>'
            : '';
        const fincaTag = obtenerFincaActiva() === 'Global'
            ? `<div style="font-size:0.72rem; color:#64748b;">${escaparHTML(inv.finca || 'Agua Clara')}</div>`
            : '';
        const refBorrado = inv.invoiceRefId || inv.id;

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:8px;"><strong>${escaparHTML(inv.numero || 'INV-0001')}</strong>${badgeTest}${fincaTag}</td>
                <td style="padding:8px;">${escaparHTML(inv.fecha || '-')}</td>
                <td style="padding:8px;">${escaparHTML(inv.cliente || '-')}</td>
                <td style="padding:8px;">${formatearLitros(inv.litros, 1)}</td>
                <td style="padding:8px;">${formatearMoneda(inv.precio)}</td>
                <td style="padding:8px; color:#15803d; font-weight:700;">${formatearMoneda(inv.total)}</td>
                <td style="padding:8px; text-align:center; white-space:nowrap;">
                    <button type="button" onclick="window.verInvoice('${escaparHTML(inv.id)}')" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:4px 8px; border-radius:6px; cursor:pointer; margin-right:4px;" title="Ver / Imprimir Invoice">🧾 Ver</button>
                    <button type="button" class="erp-btn-del" onclick="window.eliminarInvoice('${escaparHTML(inv.id)}', '${escaparHTML(refBorrado)}')">Borrar</button>
                </td>
            </tr>
        `;
    }).join('');
}

window.verInvoice = function(id) {
    const inv = invoicesCache.find(item => item.id === id);
    if (!inv) return;
    invoiceSeleccionadoActual = inv;

    const elFinca = document.getElementById('prev-inv-finca');
    const elNumero = document.getElementById('prev-inv-numero');
    const elFecha = document.getElementById('prev-inv-fecha');
    const elCliente = document.getElementById('prev-inv-cliente');
    const elLitros = document.getElementById('prev-inv-litros');
    const elPrecio = document.getElementById('prev-inv-precio');
    const elSubtotal = document.getElementById('prev-inv-subtotal');
    const elTotal = document.getElementById('prev-inv-total');
    const elNotas = document.getElementById('prev-inv-notas');

    if (elFinca) elFinca.textContent = `Finca ${inv.finca || 'Agua Clara'} • Maturín, Monagas`;
    if (elNumero) elNumero.textContent = inv.numero || 'INV-0001';
    if (elFecha) elFecha.textContent = inv.fecha || '-';
    if (elCliente) elCliente.textContent = inv.cliente || '-';
    if (elLitros) elLitros.textContent = formatearLitros(inv.litros, 1);
    if (elPrecio) elPrecio.textContent = formatearMoneda(inv.precio);
    if (elSubtotal) elSubtotal.textContent = formatearMoneda(inv.total);
    if (elTotal) elTotal.textContent = formatearMoneda(inv.total);
    if (elNotas) elNotas.textContent = inv.notas ? `Nota: ${inv.notas}` : '';

    const modal = document.getElementById('modal-invoice-vista');
    if (modal) modal.style.display = 'flex';
};

window.copiarTextoInvoice = async function() {
    if (!invoiceSeleccionadoActual) return;
    const inv = invoiceSeleccionadoActual;
    const texto = [
        `🧾 *INVOICE ${inv.numero}* — Agropecuaria ElbaLui (${inv.finca || 'Agua Clara'})`,
        `📅 Fecha: ${inv.fecha}`,
        `👤 Cliente: ${inv.cliente}`,
        `🥛 Cantidad: ${Number(inv.litros || 0).toFixed(1)} L`,
        `💲 Precio/L: ${formatearMoneda(inv.precio)}`,
        `💰 *TOTAL A PAGAR: ${formatearMoneda(inv.total)}*`,
        inv.notas ? `📝 Nota: ${inv.notas}` : ''
    ].filter(Boolean).join('\n');

    try {
        await navigator.clipboard.writeText(texto);
        if (window.mostrarToast) window.mostrarToast('Invoice copiado para enviar por WhatsApp.', 'exito');
    } catch (e) {
        if (window.mostrarToast) window.mostrarToast('No se pudo copiar automáticamente.', 'error');
    }
};

window.imprimirInvoiceActual = function() {
    const area = document.getElementById('invoice-printable-area');
    if (!area) return;
    const ventana = window.open('', '_blank', 'width=700,height=650');
    if (!ventana) {
        window.print();
        return;
    }
    ventana.document.write(`
        <html>
            <head>
                <title>${escaparHTML(invoiceSeleccionadoActual?.numero || 'Invoice')} - Agropecuaria ElbaLui</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
                </style>
            </head>
            <body>
                ${area.innerHTML}
                <script>window.onload = function() { window.print(); };<\/script>
            </body>
        </html>
    `);
    ventana.document.close();
};

async function manejarSubmitInvoice(e) {
    e.preventDefault();
    if (!window.fbERP) {
        if (window.mostrarToast) window.mostrarToast('Conexión a base de datos no disponible.', 'error');
        return;
    }

    const fecha = document.getElementById('inv-fecha')?.value;
    const cliente = (document.getElementById('inv-cliente')?.value || '').trim();
    const litros = Number(document.getElementById('inv-litros')?.value);
    const precio = Number(document.getElementById('inv-precio')?.value);
    const notas = (document.getElementById('inv-notas')?.value || '').trim();
    const syncFinanzas = Boolean(document.getElementById('inv-sync-finanzas')?.checked);

    if (!fecha || !cliente || isNaN(litros) || litros <= 0 || isNaN(precio) || precio <= 0) {
        if (window.mostrarToast) window.mostrarToast('Completa fecha, cliente, litros y precio.', 'error');
        return;
    }

    const finca = obtenerFincaDestinoEscritura();
    const numero = generarNumeroInvoice();
    const total = Number((litros * precio).toFixed(2));
    const invoiceRefId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const nuevoInvoice = {
        finca,
        numero,
        fecha,
        cliente,
        litros,
        precio,
        total,
        notas,
        syncFinanzas,
        esPrueba: Boolean(window.modoTestActivo),
        invoiceRefId
    };

    try {
        const { db, collection, addDoc, serverTimestamp } = window.fbERP;
        const docRef = await addDoc(collection(db, COLECCION_INVOICES_LECHE), {
            ...nuevoInvoice,
            fechaCreacion: serverTimestamp()
        });

        if (syncFinanzas) {
            await addDoc(collection(db, COLECCION_FINANZAS), {
                finca,
                fecha,
                tipo: 'Ingreso',
                centro: 'Lechería',
                concepto: `Invoice ${numero} • ${cliente} (${litros.toFixed(1)} L)`,
                monto: total,
                esPrueba: Boolean(window.modoTestActivo),
                origenModulo: 'lecheria_invoice',
                invoiceId: invoiceRefId,
                fechaCreacion: serverTimestamp()
            });
            if (window.cargarModulosERP) window.cargarModulosERP();
        }

        if (window.registrarEnBitacora) {
            await window.registrarEnBitacora(
                finca,
                'Lecheria',
                `Invoice ${numero} emitido a ${cliente}: ${litros.toFixed(1)} L x ${formatearMoneda(precio)} = ${formatearMoneda(total)}`
            );
        }

        if (window.mostrarToast) {
            window.mostrarToast(`Invoice ${numero} emitido (${formatearMoneda(total)}).`, 'exito');
        }

        document.getElementById('inv-cliente').value = '';
        document.getElementById('inv-litros').value = '';
        document.getElementById('inv-notas').value = '';
        actualizarPreviewTotalInvoice();

        invoicesCache.unshift({ id: docRef.id, ...nuevoInvoice });
        window.verInvoice(docRef.id);
    } catch (err) {
        console.error('Error emitiendo invoice:', err);
        if (window.mostrarToast) window.mostrarToast('Error al emitir el invoice.', 'error');
    }
}

window.eliminarInvoice = async function(id, invoiceRefId = '') {
    if (!id || !window.fbERP) return;
    try {
        const { db, doc, deleteDoc, collection, query, where, getDocs } = window.fbERP;
        const claves = Array.from(new Set([id, invoiceRefId].filter(Boolean)));

        for (const clave of claves) {
            const qFin = query(collection(db, COLECCION_FINANZAS), where('invoiceId', '==', clave));
            const snapFin = await getDocs(qFin);
            for (const d of snapFin.docs) {
                await deleteDoc(doc(db, COLECCION_FINANZAS, d.id));
            }
        }

        await deleteDoc(doc(db, COLECCION_INVOICES_LECHE, id));
        if (window.mostrarToast) window.mostrarToast('Invoice eliminado.', 'info');
        if (window.cargarModulosERP) window.cargarModulosERP();
    } catch (err) {
        console.error('Error eliminando invoice:', err);
        if (window.mostrarToast) window.mostrarToast('No se pudo eliminar el invoice.', 'error');
    }
};

function suscribirInvoices() {
    if (!window.fbERP) return;
    if (unsubscribeInvoices) unsubscribeInvoices();

    const { db, collection, query, orderBy, onSnapshot } = window.fbERP;
    const q = query(collection(db, COLECCION_INVOICES_LECHE), orderBy('fecha', 'desc'));

    unsubscribeInvoices = onSnapshot(q, (snapshot) => {
        invoicesCache = [];
        snapshot.forEach(docSnap => {
            invoicesCache.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderizarTablaInvoices();
    }, (err) => {
        console.error('Error escuchando invoices:', err);
    });
}

// ==========================================
// 📈 PROYECCIÓN A 5 AÑOS
// ==========================================
function actualizarComparativaReal() {
    const el = document.getElementById('lech-comparativa-real');
    if (!el) return;

    const listaFinca = filtrarOrdenosPorFinca();
    if (listaFinca.length === 0) {
        el.textContent = 'Promedio real actual: sin ordeños registrados aún en la vista activa.';
        return;
    }

    let litrosSum = 0;
    let vacasSum = 0;
    listaFinca.forEach(r => {
        litrosSum += Number(r.litros) || 0;
        vacasSum += Number(r.vacas) || 0;
    });
    const promReal = vacasSum > 0 ? litrosSum / vacasSum : 0;
    el.textContent = vacasSum > 0
        ? `Promedio real registrado (${obtenerFincaActiva()}): ${promReal.toFixed(1)} L/vaca/día (${litrosSum.toFixed(1)} L acumulados en ${listaFinca.length} registros).`
        : `Producción real registrada (${obtenerFincaActiva()}): ${litrosSum.toFixed(1)} L acumulados en ${listaFinca.length} registros.`;
}

function renderizarProyeccion5Anos() {
    const tbody = document.getElementById('tbody-proyeccion-leche');
    if (!tbody) return;

    actualizarComparativaReal();

    let totalCiclo5y = 0;
    let totalIngreso5y = 0;

    const rowsHtml = proyeccionCache.map((fila, idx) => {
        const vacas = Math.max(0, Number(fila.vacas) || 0);
        const dias = Math.max(0, Number(fila.diasLactancia) || 0);
        const prom = Math.max(0, Number(fila.promDiario) || 0);
        const valorLitro = Math.max(0, Number(fila.valorLitro) || 0);

        const prodVacaCiclo = dias * prom;
        const totalProdLeche = vacas * prodVacaCiclo;
        const ingresosLeche = totalProdLeche * valorLitro;
        const ingresosMes = ingresosLeche / 12;

        totalCiclo5y += totalProdLeche;
        totalIngreso5y += ingresosLeche;

        return `
            <tr>
                <td><strong>${escaparHTML(fila.ano)}</strong></td>
                <td><input type="number" min="0" step="1" class="lech-proy-input" value="${vacas}" onchange="window.actualizarCampoProyeccion(${idx}, 'vacas', this.value)"></td>
                <td><input type="number" min="0" step="1" class="lech-proy-input" value="${dias}" onchange="window.actualizarCampoProyeccion(${idx}, 'diasLactancia', this.value)"></td>
                <td><input type="number" min="0" step="0.1" class="lech-proy-input" value="${prom}" onchange="window.actualizarCampoProyeccion(${idx}, 'promDiario', this.value)"></td>
                <td>${formatearLitros(prodVacaCiclo, 0)}</td>
                <td><strong>${formatearLitros(totalProdLeche, 0)}</strong></td>
                <td><input type="number" min="0" step="0.01" class="lech-proy-input" value="${valorLitro.toFixed(2)}" onchange="window.actualizarCampoProyeccion(${idx}, 'valorLitro', this.value)"></td>
                <td style="color:#15803d; font-weight:700;">${formatearMoneda(ingresosLeche)}</td>
                <td>${formatearMoneda(ingresosMes)}</td>
            </tr>
        `;
    }).join('');

    const totalRowHtml = `
        <tr style="background:#f1f5f9; font-weight:800;">
            <td colspan="5">TOTAL ACUMULADO (5 AÑOS)</td>
            <td>${formatearLitros(totalCiclo5y, 0)}</td>
            <td>-</td>
            <td style="color:#065f46;">${formatearMoneda(totalIngreso5y)}</td>
            <td>${formatearMoneda(totalIngreso5y / 60)}</td>
        </tr>
    `;

    tbody.innerHTML = rowsHtml + totalRowHtml;
}

window.actualizarCampoProyeccion = function(index, campo, valor) {
    if (!proyeccionCache[index]) return;
    proyeccionCache[index][campo] = Number(valor) || 0;
    renderizarProyeccion5Anos();
};

async function precargarVacasActivasEnProyeccion() {
    if (!window.fbERP) return;
    try {
        const { db, collection, getDocs } = window.fbERP;
        const snap = await getDocs(collection(db, 'animales'));
        const finca = obtenerFincaActiva();
        let vacasOrdeno = 0;
        let vientresTotales = 0;

        snap.forEach(docSnap => {
            const a = docSnap.data();
            if (a.esPrueba) return;
            if (a.estado === 'Baja (Vendido/Muerto)') return;
            if (finca !== 'Global' && a.finca && a.finca !== finca) return;
            if (a.categoria === 'Vaca Ordeño') vacasOrdeno++;
            if (['Vaca Ordeño', 'Vaca Seca / Escampa', 'Novilla'].includes(a.categoria)) vientresTotales++;
        });

        const base = vacasOrdeno > 0 ? vacasOrdeno : (vientresTotales > 0 ? Math.round(vientresTotales * 0.7) : 40);
        proyeccionCache = proyeccionCache.map((item, i) => ({
            ...item,
            vacas: Math.round(base * Math.pow(1.08, i))
        }));

        renderizarProyeccion5Anos();
        if (window.mostrarToast) {
            window.mostrarToast(`Proyección ajustada desde base de ${base} vacas.`, 'exito');
        }
    } catch (err) {
        console.error('Error precargando vacas activas:', err);
    }
}

async function guardarProyeccion5Anos() {
    if (!window.fbERP) return;
    const fincaDocId = obtenerFincaDestinoEscritura().toLowerCase().replace(/\s+/g, '_');
    try {
        const { db, doc, setDoc, serverTimestamp } = window.fbERP;
        if (typeof setDoc !== 'function') {
            if (window.mostrarToast) window.mostrarToast('Falta exportar setDoc en window.fbERP.', 'error');
            return;
        }
        await setDoc(doc(db, COLECCION_PROY_LECHE, fincaDocId), {
            finca: obtenerFincaDestinoEscritura(),
            filas: proyeccionCache,
            actualizadoEn: serverTimestamp()
        });
        if (window.mostrarToast) {
            window.mostrarToast(`Proyección a 5 años guardada (${obtenerFincaDestinoEscritura()}).`, 'exito');
        }
    } catch (err) {
        console.error('Error guardando proyección a 5 años:', err);
        if (window.mostrarToast) window.mostrarToast('No se pudo guardar la proyección.', 'error');
    }
}

function suscribirProyeccion5Anos() {
    if (!window.fbERP) return;
    if (unsubscribeProyeccion) unsubscribeProyeccion();

    const fincaDocId = obtenerFincaDestinoEscritura().toLowerCase().replace(/\s+/g, '_');
    const { db, doc, onSnapshot } = window.fbERP;

    unsubscribeProyeccion = onSnapshot(doc(db, COLECCION_PROY_LECHE, fincaDocId), (snap) => {
        if (snap.exists() && Array.isArray(snap.data().filas) && snap.data().filas.length === 5) {
            proyeccionCache = snap.data().filas.map(f => ({ ...f }));
        } else {
            proyeccionCache = MODELO_BASE_5_ANOS.map(item => ({ ...item }));
        }
        renderizarProyeccion5Anos();
    }, (err) => {
        console.error('Error escuchando proyección a 5 años:', err);
        renderizarProyeccion5Anos();
    });
}

function suscribirOrdenos() {
    if (!window.fbERP) return;
    if (unsubscribeLecheria) unsubscribeLecheria();

    const { db, collection, query, orderBy, onSnapshot } = window.fbERP;
    const q = query(collection(db, COLECCION_LECHERIA), orderBy('fecha', 'desc'));

    unsubscribeLecheria = onSnapshot(q, (snapshot) => {
        ordenosCache = [];
        snapshot.forEach(docSnap => {
            ordenosCache.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderizarAlertasYMetricas();
        renderizarTablaOrdenos();
        actualizarComparativaReal();
    }, (err) => {
        console.error('Error escuchando ordeños:', err);
    });
}

function enlazarEventosLecheria() {
    const form = document.getElementById('form-lecheria');
    if (form && !form.dataset.bound) {
        form.dataset.bound = '1';
        form.addEventListener('submit', manejarSubmitOrdeno);
    }

    const formInv = document.getElementById('form-invoice-leche');
    if (formInv && !formInv.dataset.bound) {
        formInv.dataset.bound = '1';
        formInv.addEventListener('submit', manejarSubmitInvoice);
    }

    const invLitros = document.getElementById('inv-litros');
    if (invLitros && !invLitros.dataset.bound) {
        invLitros.dataset.bound = '1';
        invLitros.addEventListener('input', actualizarPreviewTotalInvoice);
    }

    const invPrecio = document.getElementById('inv-precio');
    if (invPrecio && !invPrecio.dataset.bound) {
        invPrecio.dataset.bound = '1';
        invPrecio.addEventListener('input', actualizarPreviewTotalInvoice);
    }

    const btnCargarVacas = document.getElementById('btn-lech-cargar-vacas');
    if (btnCargarVacas && !btnCargarVacas.dataset.bound) {
        btnCargarVacas.dataset.bound = '1';
        btnCargarVacas.addEventListener('click', precargarVacasActivasEnProyeccion);
    }

    const btnRestaurar = document.getElementById('btn-lech-restaurar-base');
    if (btnRestaurar && !btnRestaurar.dataset.bound) {
        btnRestaurar.dataset.bound = '1';
        btnRestaurar.addEventListener('click', () => {
            proyeccionCache = MODELO_BASE_5_ANOS.map(item => ({ ...item }));
            renderizarProyeccion5Anos();
            if (window.mostrarToast) window.mostrarToast('Modelo base restaurado (3 → 5 → 6 L/día).', 'info');
        });
    }

    const btnGuardarProy = document.getElementById('btn-lech-guardar-proy');
    if (btnGuardarProy && !btnGuardarProy.dataset.bound) {
        btnGuardarProy.dataset.bound = '1';
        btnGuardarProy.addEventListener('click', guardarProyeccion5Anos);
    }
}

window.cargarLecheria = function() {
    inicializarFechaPorDefecto();
    actualizarTituloFincaLecheria();
    enlazarEventosLecheria();
    suscribirOrdenos();
    suscribirInvoices();
    suscribirProyeccion5Anos();
    renderizarAlertasYMetricas();
    renderizarTablaOrdenos();
    renderizarTablaInvoices();
    renderizarProyeccion5Anos();
};

window.addEventListener('fincaCambiada', () => {
    window.cargarLecheria();
});

document.addEventListener('DOMContentLoaded', () => {
    inicializarFechaPorDefecto();
    actualizarTituloFincaLecheria();
    enlazarEventosLecheria();
    actualizarPreviewTotalInvoice();
});
