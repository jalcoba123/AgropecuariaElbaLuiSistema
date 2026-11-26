import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const COLECCION_LOTES = "lotes_potreros";

let lotesCache = [];
let loteSeleccionadoId = null;

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

function mostrarAviso(msg, tipo = "exito") {
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

function incluyePorModoTest(item) {
    if (window.modoTestActivo) return true;
    return !item || item.esPrueba !== true;
}

function perteneceAFinca(item) {
    const finca = getFincaActiva();
    if (finca === "Global") return true;
    if (!item || !item.finca) return true;
    return item.finca === finca;
}

function escaparHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function badgeColorUso(uso) {
    if (uso === "Palma Aceitera") return "#15803d";
    if (uso === "Forraje Corte") return "#0369a1";
    if (uso === "Ciclo Corto") return "#b45309";
    return "#16a34a";
}

function sincronizarSelectoresAgro() {
    const selAgro = document.getElementById("agro-lote");
    if (!selAgro || selAgro.tagName !== "SELECT") return;

    const valorPrevio = selAgro.value;
    const activos = lotesCache.filter(l => l.estado !== "Subdividido");

    const opciones = [`<option value="">Seleccione potrero o bloque...</option>`];
    activos.forEach((l) => {
        const detalle = l.usoActual === "Palma Aceitera"
            ? `Palma ${l.coberturaVariedad || ""}`.trim()
            : (l.coberturaVariedad || l.usoActual || "Potrero");
        opciones.push(
            `<option value="${escaparHtml(l.codigo)}">${escaparHtml(l.codigo)} — ${escaparHtml(l.nombre || "")} (${escaparHtml(detalle)}, ${Number(l.hectareas || 0).toFixed(1)} ha)</option>`
        );
    });

    selAgro.innerHTML = opciones.join("");
    if (valorPrevio && Array.from(selAgro.options).some(o => o.value === valorPrevio)) {
        selAgro.value = valorPrevio;
    }
}

function renderizarMapaYLista() {
    const contenedorMapa = document.getElementById("mapa-potreros-grid");
    const tbodyLotes = document.getElementById("tbody-lotes-potreros");
    const filtroUso = document.getElementById("filtro-lote-uso")?.value || "Todos";
    const filtroEstado = document.getElementById("filtro-lote-estado")?.value || "Activo";

    const filtrados = lotesCache.filter((l) => {
        const okUso = filtroUso === "Todos" || l.usoActual === filtroUso;
        const okEstado = filtroEstado === "Todos" || (l.estado || "Activo") === filtroEstado;
        return okUso && okEstado;
    });

    if (contenedorMapa) {
        if (filtrados.length === 0) {
            contenedorMapa.innerHTML = `<div style="grid-column: 1 / -1; padding: 18px; text-align: center; color: #64748b; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">No hay potreros o bloques de palma para este filtro. Crea el primero arriba.</div>`;
        } else {
            contenedorMapa.innerHTML = filtrados.map((l) => {
                const esSub = (l.estado || "Activo") === "Subdividido";
                const color = esSub ? "#94a3b8" : badgeColorUso(l.usoActual);
                const seleccionada = l.id === loteSeleccionadoId;
                const infoPalma = l.usoActual === "Palma Aceitera"
                    ? `<div style="font-size:0.78rem; color:#166534; font-weight:600; margin-top:4px;">🌴 ${escaparHtml(l.coberturaVariedad || "Palma")} • Siembra ${escaparHtml(l.anioSiembra || "N/D")} • ${Number(l.numeroPalmas || 0)} palmas</div>`
                    : `<div style="font-size:0.78rem; color:#334155; margin-top:4px;">🌿 ${escaparHtml(l.coberturaVariedad || l.usoActual || "Pastoreo")}</div>`;

                return `
                    <div onclick="window.seleccionarLoteMapa('${escaparHtml(l.id)}')" style="
                        cursor:pointer;
                        border: 2px solid ${seleccionada ? "#0f172a" : color};
                        border-left: 6px solid ${color};
                        background: ${esSub ? "#f1f5f9" : "#ffffff"};
                        border-radius: 10px;
                        padding: 12px;
                        opacity: ${esSub ? "0.75" : "1"};
                        transition: transform 0.12s ease;
                    ">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                            <span style="font-weight:800; font-size:0.95rem; color:#0f172a;">${escaparHtml(l.codigo)}</span>
                            <span style="background:${color}18; color:${color}; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700;">${escaparHtml(l.usoActual || "Pastoreo")}</span>
                        </div>
                        <div style="font-size:0.84rem; font-weight:600; color:#1e293b; margin-top:4px;">${escaparHtml(l.nombre || l.codigo)}</div>
                        <div style="font-size:0.76rem; color:#64748b; margin-top:2px;">
                            ${escaparHtml(l.finca || "Agua Clara")} • <strong>${Number(l.hectareas || 0).toFixed(2)} ha</strong> • Estado: <strong>${escaparHtml(l.estado || "Activo")}</strong>
                        </div>
                        ${infoPalma}
                    </div>
                `;
            }).join("");
        }
    }

    if (tbodyLotes) {
        if (filtrados.length === 0) {
            tbodyLotes.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:14px; color:#64748b;">Sin registros de lotes/potreros.</td></tr>`;
        } else {
            tbodyLotes.innerHTML = filtrados.map((l) => {
                const esSub = (l.estado || "Activo") === "Subdividido";
                const detalleCobertura = l.usoActual === "Palma Aceitera"
                    ? `${l.coberturaVariedad || "Palma"} (${l.anioSiembra || "-"} / ${Number(l.numeroPalmas || 0)} plm)`
                    : (l.coberturaVariedad || "-");

                return `
                    <tr>
                        <td><strong>${escaparHtml(l.codigo)}</strong><br><span style="font-size:0.75rem; color:#64748b;">${escaparHtml(l.nombre || "")}</span></td>
                        <td>${escaparHtml(l.finca || "Agua Clara")}</td>
                        <td>${escaparHtml(l.usoActual || "Pastoreo")}</td>
                        <td>${escaparHtml(detalleCobertura)}</td>
                        <td><strong>${Number(l.hectareas || 0).toFixed(2)} ha</strong></td>
                        <td>${escaparHtml(l.estado || "Activo")}</td>
                        <td style="white-space:nowrap;">
                            ${!esSub ? `<button type="button" onclick="window.prepararSubdivision('${escaparHtml(l.id)}')" class="erp-btn-dark" style="padding:4px 8px; font-size:0.75rem; margin-right:4px;">✂️ Dividir</button>` : ""}
                            ${!esSub && l.usoActual !== "Palma Aceitera" ? `<button type="button" onclick="window.prepararConversionPalma('${escaparHtml(l.id)}')" class="erp-btn-primary" style="padding:4px 8px; font-size:0.75rem;">🌴 A Palma</button>` : ""}
                        </td>
                    </tr>
                `;
            }).join("");
        }
    }

    sincronizarSelectoresAgro();
}

window.cargarMapaYPotreros = async function() {
    const db = await esperarDb();
    if (!db) return;

    try {
        const snap = await getDocs(collection(db, COLECCION_LOTES));
        const lista = [];
        snap.forEach((docSnap) => {
            const data = docSnap.data();
            if (perteneceAFinca(data) && incluyePorModoTest(data)) {
                lista.push({ id: docSnap.id, ...data });
            }
        });

        lista.sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || "")));
        lotesCache = lista;
        renderizarMapaYLista();
    } catch (err) {
        console.error("Error cargando lotes_potreros:", err);
        mostrarAviso("Error cargando potreros: " + err.message, "error");
    }
};

window.seleccionarLoteMapa = function(id) {
    loteSeleccionadoId = id;
    const lote = lotesCache.find(item => item.id === id);
    const panel = document.getElementById("panel-lote-seleccionado");
    renderizarMapaYLista();

    if (!lote || !panel) return;

    panel.style.display = "block";
    document.getElementById("sel-lote-codigo").innerText = lote.codigo || "";
    document.getElementById("sel-lote-nombre").innerText = lote.nombre || lote.codigo || "";
    document.getElementById("sel-lote-detalle").innerText =
        `Finca: ${lote.finca || "Agua Clara"} | Área: ${Number(lote.hectareas || 0).toFixed(2)} ha | Uso: ${lote.usoActual || "Pastoreo"} | Estado: ${lote.estado || "Activo"}` +
        (lote.usoActual === "Palma Aceitera"
            ? ` | Variedad: ${lote.coberturaVariedad || "-"} | Siembra: ${lote.anioSiembra || "-"} | Palmas: ${Number(lote.numeroPalmas || 0)}`
            : "");
};

window.prepararSubdivision = function(id) {
    const lote = lotesCache.find(item => item.id === id);
    if (!lote) return;

    loteSeleccionadoId = id;
    const caja = document.getElementById("caja-subdividir-lote");
    if (!caja) return;

    caja.style.display = "block";
    document.getElementById("sub-padre-id").value = lote.id;
    document.getElementById("sub-padre-codigo").innerText = lote.codigo;
    document.getElementById("sub-padre-ha").innerText = Number(lote.hectareas || 0).toFixed(2);

    const mitad = Number(((Number(lote.hectareas || 0)) / 2).toFixed(2));
    document.getElementById("sub-h1-codigo").value = `${lote.codigo}a`;
    document.getElementById("sub-h1-ha").value = mitad > 0 ? mitad : 1;
    document.getElementById("sub-h2-codigo").value = `${lote.codigo}b`;
    document.getElementById("sub-h2-ha").value = mitad > 0 ? mitad : 1;
};

window.prepararConversionPalma = function(id) {
    const lote = lotesCache.find(item => item.id === id);
    if (!lote) return;

    loteSeleccionadoId = id;
    const caja = document.getElementById("caja-convertir-palma");
    if (!caja) return;

    caja.style.display = "block";
    document.getElementById("conv-palma-id").value = lote.id;
    document.getElementById("conv-palma-codigo").innerText = lote.codigo;
    document.getElementById("conv-palma-anio").value = new Date().getFullYear();
    document.getElementById("conv-palma-variedad").value = "ASD Themba";
    document.getElementById("conv-palma-cantidad").value = Math.round((Number(lote.hectareas) || 1) * 143);
};

async function manejarCrearLote(e) {
    e.preventDefault();
    const db = await esperarDb();
    if (!db) return mostrarAviso("Firestore no disponible todavía.", "error");

    const codigo = document.getElementById("lote-codigo")?.value.trim();
    const nombre = document.getElementById("lote-nombre")?.value.trim();
    const hectareas = parseFloat(document.getElementById("lote-ha")?.value);
    const usoActual = document.getElementById("lote-uso")?.value || "Pastoreo";
    const coberturaVariedad = document.getElementById("lote-variedad")?.value.trim() || "";
    const anioSiembra = document.getElementById("lote-anio")?.value ? parseInt(document.getElementById("lote-anio").value, 10) : null;
    const numeroPalmas = document.getElementById("lote-palmas")?.value ? parseInt(document.getElementById("lote-palmas").value, 10) : null;

    const fincaActual = getFincaActiva();
    const finca = fincaActual === "Global" ? "Agua Clara" : fincaActual;

    if (!codigo || Number.isNaN(hectareas) || hectareas <= 0) {
        return mostrarAviso("Ingresa un código de lote y hectáreas válidas.", "error");
    }

    try {
        await addDoc(collection(db, COLECCION_LOTES), {
            codigo,
            nombre: nombre || codigo,
            finca,
            macroBloque: codigo.split(".")[0],
            parentId: null,
            rootId: null,
            hectareas,
            usoActual,
            coberturaVariedad,
            anioSiembra,
            numeroPalmas,
            estado: "Activo",
            esPrueba: Boolean(window.modoTestActivo),
            creadoEn: serverTimestamp(),
            actualizadoEn: serverTimestamp()
        });

        if (typeof window.registrarEnBitacora === "function") {
            await window.registrarEnBitacora(
                finca,
                "Agronomia",
                `Nuevo potrero/bloque creado: ${codigo} (${usoActual}, ${hectareas.toFixed(2)} ha${coberturaVariedad ? ", " + coberturaVariedad : ""})`
            );
        }

        document.getElementById("form-nuevo-lote-mapa")?.reset();
        mostrarAviso(`Potrero/bloque ${codigo} guardado en Firestore.`, "exito");
        await window.cargarMapaYPotreros();
    } catch (err) {
        console.error("Error guardando lote:", err);
        mostrarAviso("Error guardando lote: " + err.message, "error");
    }
}

async function manejarSubdivision(e) {
    e.preventDefault();
    const db = await esperarDb();
    if (!db) return;

    const padreId = document.getElementById("sub-padre-id")?.value;
    const padre = lotesCache.find(l => l.id === padreId);
    if (!padre) return mostrarAviso("Selecciona un potrero padre válido.", "error");

    const c1 = document.getElementById("sub-h1-codigo")?.value.trim();
    const ha1 = parseFloat(document.getElementById("sub-h1-ha")?.value);
    const c2 = document.getElementById("sub-h2-codigo")?.value.trim();
    const ha2 = parseFloat(document.getElementById("sub-h2-ha")?.value);

    if (!c1 || !c2 || Number.isNaN(ha1) || ha1 <= 0 || Number.isNaN(ha2) || ha2 <= 0) {
        return mostrarAviso("Completa los códigos y hectáreas de ambos sub-potreros.", "error");
    }

    try {
        const rootId = padre.rootId || padre.id;
        const baseHijo = {
            finca: padre.finca || "Agua Clara",
            macroBloque: padre.macroBloque || padre.codigo.split(".")[0],
            parentId: padre.id,
            rootId,
            usoActual: padre.usoActual || "Pastoreo",
            coberturaVariedad: padre.coberturaVariedad || "",
            anioSiembra: padre.anioSiembra || null,
            numeroPalmas: null,
            estado: "Activo",
            esPrueba: Boolean(window.modoTestActivo),
            creadoEn: serverTimestamp(),
            actualizadoEn: serverTimestamp()
        };

        const refH1 = await addDoc(collection(db, COLECCION_LOTES), {
            ...baseHijo,
            codigo: c1,
            nombre: `${padre.nombre || padre.codigo} (${c1})`,
            hectareas: ha1
        });

        const refH2 = await addDoc(collection(db, COLECCION_LOTES), {
            ...baseHijo,
            codigo: c2,
            nombre: `${padre.nombre || padre.codigo} (${c2})`,
            hectareas: ha2
        });

        await updateDoc(doc(db, COLECCION_LOTES, padre.id), {
            estado: "Subdividido",
            hijosIds: [refH1.id, refH2.id],
            subdivididoEn: serverTimestamp(),
            actualizadoEn: serverTimestamp()
        });

        if (typeof window.registrarEnBitacora === "function") {
            await window.registrarEnBitacora(
                padre.finca || "Agua Clara",
                "Agronomia",
                `Potrero ${padre.codigo} subdividido en ${c1} (${ha1.toFixed(2)} ha) y ${c2} (${ha2.toFixed(2)} ha)`
            );
        }

        document.getElementById("caja-subdividir-lote").style.display = "none";
        mostrarAviso(`Potrero ${padre.codigo} subdividido en ${c1} y ${c2}.`, "exito");
        await window.cargarMapaYPotreros();
    } catch (err) {
        console.error("Error subdividiendo potrero:", err);
        mostrarAviso("Error al subdividir: " + err.message, "error");
    }
}

async function manejarConversionPalma(e) {
    e.preventDefault();
    const db = await esperarDb();
    if (!db) return;

    const loteId = document.getElementById("conv-palma-id")?.value;
    const lote = lotesCache.find(l => l.id === loteId);
    if (!lote) return;

    const variedad = document.getElementById("conv-palma-variedad")?.value || "ASD Themba";
    const anio = parseInt(document.getElementById("conv-palma-anio")?.value, 10) || new Date().getFullYear();
    const cantidad = parseInt(document.getElementById("conv-palma-cantidad")?.value, 10) || 0;

    try {
        await updateDoc(doc(db, COLECCION_LOTES, lote.id), {
            usoActual: "Palma Aceitera",
            coberturaVariedad: variedad,
            anioSiembra: anio,
            numeroPalmas: cantidad,
            actualizadoEn: serverTimestamp()
        });

        if (typeof window.registrarEnBitacora === "function") {
            await window.registrarEnBitacora(
                lote.finca || "Agua Clara",
                "Agronomia",
                `Potrero ${lote.codigo} convertido a Palma Aceitera (${variedad}, siembra ${anio}, ${cantidad} palmas)`
            );
        }

        document.getElementById("caja-convertir-palma").style.display = "none";
        mostrarAviso(`Potrero ${lote.codigo} actualizado como Palma Aceitera.`, "exito");
        await window.cargarMapaYPotreros();
    } catch (err) {
        console.error("Error convirtiendo a palma:", err);
        mostrarAviso("Error al convertir a palma: " + err.message, "error");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("form-nuevo-lote-mapa")?.addEventListener("submit", manejarCrearLote);
    document.getElementById("form-subdividir-lote")?.addEventListener("submit", manejarSubdivision);
    document.getElementById("form-convertir-palma")?.addEventListener("submit", manejarConversionPalma);
    document.getElementById("filtro-lote-uso")?.addEventListener("change", renderizarMapaYLista);
    document.getElementById("filtro-lote-estado")?.addEventListener("change", renderizarMapaYLista);

    window.addEventListener("fincaCambiada", () => {
        loteSeleccionadoId = null;
        const panel = document.getElementById("panel-lote-seleccionado");
        if (panel) panel.style.display = "none";
        window.cargarMapaYPotreros();
    });

    window.cargarMapaYPotreros();
});
