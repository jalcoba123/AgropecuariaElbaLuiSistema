import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const COLECCION_ALIMENTACION = "alimentacion_asignaciones";
const COLECCION_FINANZAS = "finanzas_movimientos";

let asignacionesCache = [];

function esperarDb(maxIntentos = 60) {
    return new Promise((resolve) => {
        if (window.db) return resolve(window.db);
        let intentos = 0;
        const timer = setInterval(() => {
            if (window.db || ++intentos >= maxIntentos) {
                clearInterval(timer);
                resolve(window.db || null);
            }
        }, 150);
    });
}

function notificar(msg, tipo = "exito") {
    if (typeof window.mostrarToast === "function") {
        window.mostrarToast(msg, tipo);
    } else {
        console.log(`[${tipo.toUpperCase()}] ${msg}`);
    }
}

function getFincaActiva() {
    if (window.fincaActual) return window.fincaActual;
    const tag = document.getElementById("finca-tag");
    if (!tag) return "Agua Clara";
    if (tag.innerText.includes("CONSOLIDADO")) return "Global";
    if (tag.innerText.includes("EL SUR")) return "El Sur";
    return "Agua Clara";
}

function perteneceAFinca(item) {
    const finca = getFincaActiva();
    if (finca === "Global") return true;
    if (!item || !item.finca) return true;
    return item.finca === finca;
}

function incluyePorModoTest(item) {
    if (window.modoTestActivo) return true;
    return !item || item.esPrueba !== true;
}

function escaparHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function calcularDiasEntre(inicio, fin) {
    if (!inicio || !fin) return 1;
    const d1 = new Date(inicio + "T00:00:00");
    const d2 = new Date(fin + "T00:00:00");
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 1;
}

function sumarDiasIso(fechaIso, dias) {
    if (!fechaIso) return "";
    const d = new Date(fechaIso + "T00:00:00");
    d.setDate(d.getDate() + Math.max(0, Number(dias || 1) - 1));
    return d.toISOString().split("T")[0];
}

function estimarAnimalesPorDestino(destino) {
    const hato = Array.isArray(window.datosHatoCache) ? window.datosHatoCache : [];
    const activos = hato.filter(a =>
        a.estado !== "Baja (Vendido/Muerto)" &&
        Boolean(a.esPrueba) === Boolean(window.modoTestActivo) &&
        perteneceAFinca(a)
    );

    if (!destino) return 0;
    if (destino === "Cat:Levante / Mautes") {
        return activos.filter(a => a.categoria && (a.categoria.includes("Maut") || a.categoria === "Novilla")).length;
    }
    if (destino === "Cat:Becerros / Crías") {
        return activos.filter(a => a.categoria && a.categoria.includes("Becerr")).length;
    }
    if (destino === "Cat:Vacas Ordeño") {
        return activos.filter(a => a.categoria === "Vaca Ordeño").length;
    }
    if (destino === "Cat:Vacas Secas") {
        return activos.filter(a => a.categoria === "Vaca Seca / Escampa").length;
    }

    const nombreLote = destino.replace(/^Lote:/, "");
    return activos.filter(a => (a.lote || "General") === nombreLote).length;
}

async function poblarSelectLotesAlimentacion() {
    const select = document.getElementById("alim-lote");
    if (!select) return;

    const prev = select.value;
    const gruposBase = [
        { val: "Cat:Levante / Mautes", label: "🐂 Grupo: Levante / Mautes y Novillas" },
        { val: "Cat:Becerros / Crías", label: "🐮 Grupo: Becerros y Becerras" },
        { val: "Cat:Vacas Ordeño", label: "🥛 Grupo: Vacas en Ordeño" },
        { val: "Cat:Vacas Secas", label: "🌿 Grupo: Vacas Secas / Escampa" }
    ];

    const lotesUnicos = new Map();

    if (Array.isArray(window.catalogoPotrerosMapaCache)) {
        window.catalogoPotrerosMapaCache.forEach((p) => {
            if (p.codigo) {
                lotesUnicos.set(`Lote:${p.codigo}`, `📍 Potrero/Bloque: ${p.codigo}${p.nombre ? " — " + p.nombre : ""}`);
            }
        });
    }

    if (Array.isArray(window.catalogoLotesCache)) {
        window.catalogoLotesCache.forEach((l) => {
            if (l.nombre && !lotesUnicos.has(`Lote:${l.nombre}`)) {
                lotesUnicos.set(`Lote:${l.nombre}`, `📍 Lote: ${l.nombre}`);
            }
        });
    }

    if (lotesUnicos.size === 0 && window.db) {
        try {
            const snap = await getDocs(collection(window.db, "lotes_potreros"));
            snap.forEach((d) => {
                const data = d.data();
                if ((data.estado || "Activo") !== "Subdividido" && perteneceAFinca(data) && incluyePorModoTest(data) && data.codigo) {
                    lotesUnicos.set(`Lote:${data.codigo}`, `📍 Potrero/Bloque: ${data.codigo}${data.nombre ? " — " + data.nombre : ""}`);
                }
            });
        } catch (_) {}
    }

    let html = `<optgroup label="Por Grupo / Etapa">` +
        gruposBase.map(g => `<option value="${escaparHtml(g.val)}">${escaparHtml(g.label)}</option>`).join("") +
        `</optgroup>`;

    if (lotesUnicos.size > 0) {
        html += `<optgroup label="Por Lote / Potrero Específico">` +
            Array.from(lotesUnicos.entries()).map(([val, lbl]) => `<option value="${escaparHtml(val)}">${escaparHtml(lbl)}</option>`).join("") +
            `</optgroup>`;
    }

    select.innerHTML = html;
    if (prev && Array.from(select.options).some(o => o.value === prev)) {
        select.value = prev;
    }

    actualizarPreviewAlimentacion();
}

function actualizarPreviewAlimentacion() {
    const sacos = parseFloat(document.getElementById("alim-sacos")?.value) || 0;
    const kgSaco = parseFloat(document.getElementById("alim-kg-saco")?.value) || 0;
    const inicio = document.getElementById("alim-fecha-inicio")?.value;
    const fin = document.getElementById("alim-fecha-fin")?.value;
    const costo = parseFloat(document.getElementById("alim-costo")?.value) || 0;
    const animales = parseInt(document.getElementById("alim-animales")?.value, 10) || 0;

    const kgTotales = sacos * kgSaco;
    const dias = calcularDiasEntre(inicio, fin);
    const kgDiaLote = dias > 0 ? kgTotales / dias : 0;
    const kgDiaAnimal = animales > 0 ? kgDiaLote / animales : 0;
    const costoDiaAnimal = (animales > 0 && dias > 0) ? costo / (animales * dias) : 0;

    const elPreview = document.getElementById("alim-preview-calculo");
    if (elPreview) {
        elPreview.innerHTML =
            `Total: <strong>${kgTotales.toFixed(1)} kg</strong> en <strong>${dias} días</strong> ` +
            `(${kgDiaLote.toFixed(1)} kg/día el lote` +
            `${animales > 0 ? ` • <strong>${kgDiaAnimal.toFixed(2)} kg/animal/día</strong> • <strong>$${costoDiaAnimal.toFixed(2)}/animal/día</strong>` : ""})`;
    }
}

function etiquetaDestinoLegible(destinoRaw) {
    if (!destinoRaw) return "General";
    return destinoRaw.replace(/^Cat:/, "").replace(/^Lote:/, "Lote: ");
}

function renderizarTablaAlimentacion() {
    const tbody = document.getElementById("tbody-alimentacion");
    const filtroGrupo = document.getElementById("filtro-alim-grupo")?.value || "Todos";
    const filtroEstado = document.getElementById("filtro-alim-estado")?.value || "Todos";

    const hoyIso = new Date().toISOString().split("T")[0];

    const filtradas = asignacionesCache.filter((item) => {
        const estadoReal = item.estado === "Finalizada"
            ? "Finalizada"
            : (item.fechaFin && item.fechaFin < hoyIso ? "Vencida / Por cerrar" : "Activa");

        const okGrupo = filtroGrupo === "Todos" || item.loteDestino === filtroGrupo;
        const okEstado = filtroEstado === "Todos" ||
            (filtroEstado === "Activa" && estadoReal !== "Finalizada") ||
            (filtroEstado === "Finalizada" && estadoReal === "Finalizada");

        return okGrupo && okEstado;
    });

    // KPIs
    let gastoTotal = 0;
    let gastoLevante = 0;
    let gastoBecerros = 0;
    let tandasActivas = 0;

    asignacionesCache.forEach((item) => {
        const costo = Number(item.costoTotal || 0);
        gastoTotal += costo;
        if (item.loteDestino === "Cat:Levante / Mautes") gastoLevante += costo;
        if (item.loteDestino === "Cat:Becerros / Crías") gastoBecerros += costo;
        if (item.estado !== "Finalizada") tandasActivas++;
    });

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setTxt("kpi-alim-total", `$${gastoTotal.toFixed(2)}`);
    setTxt("kpi-alim-activas", String(tandasActivas));
    setTxt("kpi-alim-levante", `$${gastoLevante.toFixed(2)}`);
    setTxt("kpi-alim-becerros", `$${gastoBecerros.toFixed(2)}`);

    if (!tbody) return;

    if (filtradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:16px; color:#64748b;">No hay asignaciones de alimento registradas para este filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtradas.map((item) => {
        const dias = Number(item.diasDuracion || calcularDiasEntre(item.fechaInicio, item.fechaFin));
        const kgTot = Number(item.kgTotales || (Number(item.sacos || 0) * Number(item.kgPorSaco || 0)));
        const animales = Number(item.animalesEnLote || 0);
        const kgAnimalDia = (animales > 0 && dias > 0) ? (kgTot / dias / animales) : 0;
        const costo = Number(item.costoTotal || 0);

        const esFinalizada = item.estado === "Finalizada";
        const estaVencida = !esFinalizada && item.fechaFin && item.fechaFin < hoyIso;
        const badgeEstado = esFinalizada
            ? `<span style="background:#e2e8f0; color:#475569; padding:2px 8px; border-radius:999px; font-size:0.74rem; font-weight:700;">Finalizada</span>`
            : (estaVencida
                ? `<span style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:999px; font-size:0.74rem; font-weight:700;">Período cumplido</span>`
                : `<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:999px; font-size:0.74rem; font-weight:700;">Activa</span>`);

        return `
            <tr>
                <td>
                    <strong>${escaparHtml(etiquetaDestinoLegible(item.loteDestino))}</strong><br>
                    <span style="font-size:0.74rem; color:#64748b;">${escaparHtml(item.finca || "Agua Clara")}${animales > 0 ? ` • ${animales} cab.` : ""}</span>
                </td>
                <td>
                    <strong>${escaparHtml(item.producto || "Suplemento")}</strong>
                    ${item.observacion ? `<br><span style="font-size:0.74rem; color:#64748b;">${escaparHtml(item.observacion)}</span>` : ""}
                </td>
                <td>${Number(item.sacos || 0)} sacos × ${Number(item.kgPorSaco || 0)} kg<br><strong>(${kgTot.toFixed(1)} kg)</strong></td>
                <td style="white-space:nowrap;">${escaparHtml(item.fechaInicio || "-")} → ${escaparHtml(item.fechaFin || "-")}<br><span style="font-size:0.74rem; color:#64748b;">(${dias} días)</span></td>
                <td>${animales > 0 ? `<strong>${kgAnimalDia.toFixed(2)} kg/d</strong>` : "-"}</td>
                <td><strong>$${costo.toFixed(2)}</strong></td>
                <td>${badgeEstado}</td>
                <td style="white-space:nowrap;">
                    ${!esFinalizada ? `<button type="button" onclick="window.cerrarTandaAlimentacion('${escaparHtml(item.id)}')" class="erp-btn-dark" style="padding:4px 8px; font-size:0.75rem; margin-right:4px;" title="Marcar tanda como terminada">✓ Cerrar</button>` : ""}
                    <button type="button" onclick="window.eliminarTandaAlimentacion('${escaparHtml(item.id)}')" class="erp-btn-del" title="Eliminar registro">🗑️</button>
                </td>
            </tr>
        `;
    }).join("");
}

window.cargarAlimentacion = async function() {
    const db = await esperarDb();
    if (!db) return;

    await poblarSelectLotesAlimentacion();

    try {
        const snap = await getDocs(collection(db, COLECCION_ALIMENTACION));
        const lista = [];
        snap.forEach((docSnap) => {
            const data = docSnap.data();
            if (perteneceAFinca(data) && incluyePorModoTest(data)) {
                lista.push({ id: docSnap.id, ...data });
            }
        });

        lista.sort((a, b) => String(b.fechaInicio || "").localeCompare(String(a.fechaInicio || "")));
        asignacionesCache = lista;
        renderizarTablaAlimentacion();
    } catch (err) {
        console.error("Error cargando alimentación:", err);
        notificar("Error cargando alimentación: " + err.message, "error");
    }
};

window.cerrarTandaAlimentacion = async function(id) {
    const db = await esperarDb();
    if (!db || !id) return;

    try {
        await updateDoc(doc(db, COLECCION_ALIMENTACION, id), {
            estado: "Finalizada",
            cerradoEn: serverTimestamp()
        });
        notificar("Tanda de alimentación marcada como finalizada.", "exito");
        await window.cargarAlimentacion();
    } catch (err) {
        notificar("Error al cerrar tanda: " + err.message, "error");
    }
};

window.eliminarTandaAlimentacion = async function(id) {
    const db = await esperarDb();
    if (!db || !id) return;
    if (!confirm("¿Eliminar este registro de asignación de alimento?")) return;

    try {
        await deleteDoc(doc(db, COLECCION_ALIMENTACION, id));
        notificar("Registro de alimentación eliminado.", "exito");
        await window.cargarAlimentacion();
    } catch (err) {
        notificar("Error al eliminar: " + err.message, "error");
    }
};

async function guardarAsignacionAlimentacion(e) {
    e.preventDefault();
    const db = await esperarDb();
    if (!db) return notificar("Firestore no disponible.", "error");

    const fincaActiva = getFincaActiva();
    const finca = fincaActiva === "Global" ? "Agua Clara" : fincaActiva;

    const loteDestino = document.getElementById("alim-lote")?.value || "Cat:Levante / Mautes";
    const producto = document.getElementById("alim-producto")?.value.trim();
    const sacos = parseFloat(document.getElementById("alim-sacos")?.value) || 0;
    const kgPorSaco = parseFloat(document.getElementById("alim-kg-saco")?.value) || 40;
    const fechaInicio = document.getElementById("alim-fecha-inicio")?.value;
    const fechaFin = document.getElementById("alim-fecha-fin")?.value;
    const animalesEnLote = parseInt(document.getElementById("alim-animales")?.value, 10) || 0;
    const costoTotal = parseFloat(document.getElementById("alim-costo")?.value) || 0;
    const observacion = document.getElementById("alim-obs")?.value.trim() || "";
    const enviarFinanzas = Boolean(document.getElementById("alim-sync-finanzas")?.checked);

    if (!producto || sacos <= 0 || !fechaInicio || !fechaFin) {
        return notificar("Completa el alimento, cantidad de sacos y fechas.", "error");
    }

    const kgTotales = sacos * kgPorSaco;
    const diasDuracion = calcularDiasEntre(fechaInicio, fechaFin);
    const destinoLegible = etiquetaDestinoLegible(loteDestino);

    try {
        await addDoc(collection(db, COLECCION_ALIMENTACION), {
            finca,
            loteDestino,
            producto,
            sacos,
            kgPorSaco,
            kgTotales,
            fechaInicio,
            fechaFin,
            diasDuracion,
            animalesEnLote,
            costoTotal,
            observacion,
            estado: "Activa",
            esPrueba: Boolean(window.modoTestActivo),
            creadoEn: serverTimestamp()
        });

        if (enviarFinanzas && costoTotal > 0) {
            const centroCosto = loteDestino === "Cat:Vacas Ordeño" ? "Lechería" : "Ganadería / Hato";
            await addDoc(collection(db, COLECCION_FINANZAS), {
                finca,
                fecha: fechaInicio,
                tipo: "Egreso",
                centroCosto,
                centro: centroCosto,
                concepto: `Alimento (${producto}: ${sacos} sacos) → ${destinoLegible}`,
                monto: costoTotal,
                esPrueba: Boolean(window.modoTestActivo),
                creadoEn: serverTimestamp()
            });
        }

        if (typeof window.registrarEnBitacora === "function") {
            await window.registrarEnBitacora(
                finca,
                "Inventario",
                `Asignación alimento: ${sacos} sacos (${kgTotales.toFixed(0)} kg) de ${producto} para ${destinoLegible} (${fechaInicio} al ${fechaFin} — $${costoTotal.toFixed(2)})`
            );
        }

        document.getElementById("form-alimentacion")?.reset();
        inicializarFechasFormulario();
        notificar(`Asignados ${sacos} sacos de ${producto} a ${destinoLegible}.`, "exito");
        await window.cargarAlimentacion();
        if (typeof window.actualizarTodosLosKPIs === "function") {
            window.actualizarTodosLosKPIs();
        }
    } catch (err) {
        console.error("Error guardando alimentación:", err);
        notificar("Error guardando asignación: " + err.message, "error");
    }
}

function inicializarFechasFormulario() {
    const hoy = new Date().toISOString().split("T")[0];
    const elIni = document.getElementById("alim-fecha-inicio");
    const elFin = document.getElementById("alim-fecha-fin");
    const elKg = document.getElementById("alim-kg-saco");
    if (elIni && !elIni.value) elIni.value = hoy;
    if (elFin && !elFin.value) elFin.value = sumarDiasIso(hoy, 15);
    if (elKg && !elKg.value) elKg.value = "40";

    const selLote = document.getElementById("alim-lote");
    const inpAnim = document.getElementById("alim-animales");
    if (selLote && inpAnim) {
        const est = estimarAnimalesPorDestino(selLote.value);
        if (est > 0) inpAnim.value = est;
    }
    actualizarPreviewAlimentacion();
}

document.addEventListener("DOMContentLoaded", () => {
    inicializarFechasFormulario();

    document.getElementById("form-alimentacion")?.addEventListener("submit", guardarAsignacionAlimentacion);

    document.getElementById("alim-lote")?.addEventListener("change", (e) => {
        const est = estimarAnimalesPorDestino(e.target.value);
        const inpAnim = document.getElementById("alim-animales");
        if (inpAnim && est > 0) inpAnim.value = est;
        actualizarPreviewAlimentacion();
    });

    ["alim-sacos", "alim-kg-saco", "alim-fecha-inicio", "alim-fecha-fin", "alim-costo", "alim-animales"].forEach((id) => {
        document.getElementById(id)?.addEventListener("input", actualizarPreviewAlimentacion);
    });

    document.getElementById("filtro-alim-grupo")?.addEventListener("change", renderizarTablaAlimentacion);
    document.getElementById("filtro-alim-estado")?.addEventListener("change", renderizarTablaAlimentacion);

    window.addEventListener("fincaCambiada", () => {
        window.cargarAlimentacion();
    });

    window.cargarAlimentacion();
});
