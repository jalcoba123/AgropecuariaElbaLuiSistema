function esperarFirebaseERP(maxIntentos = 40) {
  return new Promise((resolve, reject) => {
    let intentos = 0;
    const timer = setInterval(() => {
      if (window.fbERP && window.fbERP.db) {
        clearInterval(timer);
        resolve(window.fbERP);
      } else if (++intentos >= maxIntentos) {
        clearInterval(timer);
        reject(new Error('No se encontró window.fbERP. Verifica index.html.'));
      }
    }, 150);
  });
}

function obtenerFincaActiva() {
  return window.fincaActual || 'Agua Clara';
}

function perteneceAFinca(registroData, fincaActiva) {
  if (fincaActiva === 'Global') return true;
  return registroData.finca === fincaActiva;
}

function notificarERP(msg, tipo = 'exito') {
  if (typeof window.mostrarToast === 'function') {
    window.mostrarToast(msg, tipo);
  } else if (tipo === 'error') {
    console.error(msg);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  let fb;
  try {
    fb = await esperarFirebaseERP();
  } catch (err) {
    console.error(err.message);
    return;
  }

  const {
    db,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    limit,
    deleteDoc,
    doc,
    serverTimestamp
  } = fb;

  const hoyISO = new Date().toISOString().split('T')[0];
  ['lech-fecha', 'agro-fecha', 'op-fecha', 'fin-fecha'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = hoyISO;
  });

  // Selector de finca dentro de cada formulario cuando la vista está en Consolidado ('Global')
  const configuracionFormularios = [
    { formId: 'form-lecheria', selectId: 'erp-finca-lech' },
    { formId: 'form-agronomia', selectId: 'erp-finca-agro' },
    { formId: 'form-operaciones', selectId: 'erp-finca-op' },
    { formId: 'form-finanzas', selectId: 'erp-finca-fin' }
  ];

  configuracionFormularios.forEach(({ formId, selectId }) => {
    const formEl = document.getElementById(formId);
    if (!formEl) return;
    const sel = document.createElement('select');
    sel.id = selectId;
    sel.style.display = 'none';
    sel.innerHTML = `
      <option value="">Selecciona finca...</option>
      <option value="Agua Clara">Agua Clara</option>
      <option value="El Sur">El Sur</option>
    `;
    formEl.insertBefore(sel, formEl.lastElementChild);
  });

  function actualizarSelectoresFincaGlobal() {
    const esGlobal = obtenerFincaActiva() === 'Global';
    configuracionFormularios.forEach(({ selectId }) => {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      sel.style.display = esGlobal ? 'block' : 'none';
      sel.required = esGlobal;
      if (!esGlobal) sel.value = '';
    });
  }

  function resolverFincaParaGuardar(selectId) {
    const activa = obtenerFincaActiva();
    if (activa === 'Agua Clara' || activa === 'El Sur') {
      return activa;
    }
    const sel = document.getElementById(selectId);
    return sel ? sel.value : '';
  }

  const caches = {
    lecheria: [],
    agronomia: [],
    operaciones: [],
    finanzas: []
  };

  window.eliminarDocERP = async (coleccion, id) => {
    if (!confirm('¿Eliminar este registro de la base de datos?')) return;
    try {
      await deleteDoc(doc(db, coleccion, id));
      notificarERP('Registro eliminado.', 'exito');
    } catch (err) {
      console.error('Error eliminando documento ERP:', err);
      notificarERP('No se pudo eliminar el registro.', 'error');
    }
  };

  // --- 1. LECHERÍA & RACIONES ---
  function renderLecheria() {
    const tbody = document.getElementById('tbody-lecheria');
    if (!tbody) return;

    const fincaActiva = obtenerFincaActiva();
    const registros = caches.lecheria.filter((r) => perteneceAFinca(r.data, fincaActiva));

    tbody.innerHTML = '';
    let litrosHoy = 0;
    let vacasHoy = 0;
    let ingresoHoy = 0;

    if (registros.length === 0) {
      const contexto = fincaActiva === 'Global' ? 'el consolidado' : fincaActiva;
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:16px;">Sin registros de ordeño para ${contexto}.</td></tr>`;
    } else {
      registros.forEach(({ id, data: d }) => {
        const litros = Number(d.litros) || 0;
        const vacas = Number(d.vacas) || 0;
        const ingreso = Number(d.ingreso ?? litros * (Number(d.precio) || 0));
        const promedio = d.promedio != null ? Number(d.promedio) : (vacas > 0 ? litros / vacas : 0);

        if (d.fecha === hoyISO) {
          litrosHoy += litros;
          vacasHoy = Math.max(vacasHoy, vacas);
          ingresoHoy += ingreso;
        }

        const etiquetaFinca = fincaActiva === 'Global'
          ? ` <span style="font-size:0.75rem;color:#475569;">(${d.finca || 'Sin finca'})</span>`
          : '';

        tbody.innerHTML += `
          <tr>
            <td>${d.fecha || ''}${etiquetaFinca}</td>
            <td>${vacas}</td>
            <td><strong>${litros.toFixed(1)} L</strong></td>
            <td>${promedio.toFixed(2)} L</td>
            <td>${d.racion || ''}</td>
            <td style="color:#15803d;font-weight:700;">$${ingreso.toFixed(2)}</td>
            <td><button type="button" class="erp-btn-del" onclick="eliminarDocERP('lecheria_registros','${id}')">Eliminar</button></td>
          </tr>`;
      });
    }

    const kpiHoy = document.getElementById('kpi-leche-hoy');
    const kpiProm = document.getElementById('kpi-leche-promedio');
    const kpiIng = document.getElementById('kpi-leche-ingreso');
    if (kpiHoy) kpiHoy.textContent = `${litrosHoy.toFixed(1)} L`;
    if (kpiProm) kpiProm.textContent = vacasHoy > 0 ? `${(litrosHoy / vacasHoy).toFixed(1)} L` : '0.0 L';
    if (kpiIng) kpiIng.textContent = `$${ingresoHoy.toFixed(2)}`;
  }

  const formLecheria = document.getElementById('form-lecheria');
  if (formLecheria) {
    formLecheria.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fincaGuardada = resolverFincaParaGuardar('erp-finca-lech');
      if (!fincaGuardada) {
        notificarERP('Selecciona si el registro corresponde a Agua Clara o El Sur.', 'error');
        return;
      }

      const vacas = Number(document.getElementById('lech-vacas').value);
      const litros = Number(document.getElementById('lech-litros').value);
      const precio = Number(document.getElementById('lech-precio').value);

      if (vacas <= 0 || litros < 0) {
        notificarERP('Verifica la cantidad de vacas y litros.', 'error');
        return;
      }

      try {
        await addDoc(collection(db, 'lecheria_registros'), {
          finca: fincaGuardada,
          fecha: document.getElementById('lech-fecha').value,
          vacas,
          litros,
          precio,
          ingreso: Number((litros * precio).toFixed(2)),
          promedio: Number((litros / vacas).toFixed(2)),
          racion: document.getElementById('lech-racion').value,
          createdAt: serverTimestamp()
        });

        formLecheria.reset();
        document.getElementById('lech-fecha').value = hoyISO;
        document.getElementById('lech-precio').value = precio;
        actualizarSelectoresFincaGlobal();
        notificarERP(`Ordeño guardado en ${fincaGuardada}.`, 'exito');
      } catch (err) {
        console.error('Error guardando ordeño:', err);
        notificarERP('Error al guardar el registro de lechería.', 'error');
      }
    });

    const qLech = query(collection(db, 'lecheria_registros'), orderBy('fecha', 'desc'), limit(60));
    onSnapshot(qLech, (snap) => {
      caches.lecheria = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      renderLecheria();
    });
  }

  // --- 2. PALMA & AGRONOMÍA ---
  function renderAgronomia() {
    const tbody = document.getElementById('tbody-agronomia');
    if (!tbody) return;

    const fincaActiva = obtenerFincaActiva();
    const registros = caches.agronomia.filter((r) => perteneceAFinca(r.data, fincaActiva));

    tbody.innerHTML = '';
    if (registros.length === 0) {
      const contexto = fincaActiva === 'Global' ? 'el consolidado' : fincaActiva;
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#64748b;padding:16px;">Sin labores agronómicas para ${contexto}.</td></tr>`;
      return;
    }

    registros.forEach(({ id, data: d }) => {
      const etiquetaFinca = fincaActiva === 'Global'
        ? ` <span style="font-size:0.75rem;color:#475569;">(${d.finca || 'Sin finca'})</span>`
        : '';

      tbody.innerHTML += `
        <tr>
          <td>${d.fecha || ''}${etiquetaFinca}</td>
          <td><strong>${d.cultivo || ''}</strong></td>
          <td>${d.lote || ''}</td>
          <td>${d.labor || ''}</td>
          <td><strong>${d.cantidad ?? 0}</strong></td>
          <td><button type="button" class="erp-btn-del" onclick="eliminarDocERP('agronomia_registros','${id}')">Eliminar</button></td>
        </tr>`;
    });
  }

  const formAgro = document.getElementById('form-agronomia');
  if (formAgro) {
    formAgro.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fincaGuardada = resolverFincaParaGuardar('erp-finca-agro');
      if (!fincaGuardada) {
        notificarERP('Selecciona si el registro corresponde a Agua Clara o El Sur.', 'error');
        return;
      }

      try {
        await addDoc(collection(db, 'agronomia_registros'), {
          finca: fincaGuardada,
          fecha: document.getElementById('agro-fecha').value,
          cultivo: document.getElementById('agro-cultivo').value,
          labor: document.getElementById('agro-labor').value,
          lote: document.getElementById('agro-lote').value,
          cantidad: Number(document.getElementById('agro-cantidad').value),
          createdAt: serverTimestamp()
        });
        formAgro.reset();
        document.getElementById('agro-fecha').value = hoyISO;
        actualizarSelectoresFincaGlobal();
        notificarERP(`Labor agronómica registrada en ${fincaGuardada}.`, 'exito');
      } catch (err) {
        console.error('Error guardando agronomía:', err);
        notificarERP('Error al guardar la labor agronómica.', 'error');
      }
    });

    const qAgro = query(collection(db, 'agronomia_registros'), orderBy('fecha', 'desc'), limit(60));
    onSnapshot(qAgro, (snap) => {
      caches.agronomia = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      renderAgronomia();
    });
  }

  // --- 3. OPERACIONES & ACTIVOS ---
  function renderOperaciones() {
    const tbody = document.getElementById('tbody-operaciones');
    if (!tbody) return;

    const fincaActiva = obtenerFincaActiva();
    const registros = caches.operaciones.filter((r) => perteneceAFinca(r.data, fincaActiva));

    tbody.innerHTML = '';
    if (registros.length === 0) {
      const contexto = fincaActiva === 'Global' ? 'el consolidado' : fincaActiva;
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#64748b;padding:16px;">Sin registros de maquinaria/activos para ${contexto}.</td></tr>`;
      return;
    }

    registros.forEach(({ id, data: d }) => {
      const etiquetaFinca = fincaActiva === 'Global'
        ? ` <span style="font-size:0.75rem;color:#475569;">(${d.finca || 'Sin finca'})</span>`
        : '';

      tbody.innerHTML += `
        <tr>
          <td>${d.fecha || ''}${etiquetaFinca}</td>
          <td><strong>${d.equipo || ''}</strong></td>
          <td>${d.horometroIni ?? 0} → ${d.horometroFin ?? 0}</td>
          <td><strong>${d.horas ?? 0} h</strong></td>
          <td>${d.gasoil ?? 0} L</td>
          <td><button type="button" class="erp-btn-del" onclick="eliminarDocERP('operaciones_registros','${id}')">Eliminar</button></td>
        </tr>`;
    });
  }

  const formOp = document.getElementById('form-operaciones');
  if (formOp) {
    formOp.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fincaGuardada = resolverFincaParaGuardar('erp-finca-op');
      if (!fincaGuardada) {
        notificarERP('Selecciona si el registro corresponde a Agua Clara o El Sur.', 'error');
        return;
      }

      const ini = Number(document.getElementById('op-horo-ini').value);
      const fin = Number(document.getElementById('op-horo-fin').value);
      if (fin < ini) {
        notificarERP('El horómetro final no puede ser menor al inicial.', 'error');
        return;
      }

      try {
        await addDoc(collection(db, 'operaciones_registros'), {
          finca: fincaGuardada,
          fecha: document.getElementById('op-fecha').value,
          equipo: document.getElementById('op-equipo').value,
          horometroIni: ini,
          horometroFin: fin,
          horas: Number((fin - ini).toFixed(1)),
          gasoil: Number(document.getElementById('op-gasoil').value || 0),
          createdAt: serverTimestamp()
        });
        formOp.reset();
        document.getElementById('op-fecha').value = hoyISO;
        document.getElementById('op-gasoil').value = '0';
        actualizarSelectoresFincaGlobal();
        notificarERP(`Operación guardada en ${fincaGuardada}.`, 'exito');
      } catch (err) {
        console.error('Error guardando operación:', err);
        notificarERP('Error al guardar el registro de operaciones.', 'error');
      }
    });

    const qOp = query(collection(db, 'operaciones_registros'), orderBy('fecha', 'desc'), limit(60));
    onSnapshot(qOp, (snap) => {
      caches.operaciones = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      renderOperaciones();
    });
  }

  // --- 4. FINANZAS & COSTOS ---
  function renderFinanzas() {
    const tbody = document.getElementById('tbody-finanzas');
    if (!tbody) return;

    const fincaActiva = obtenerFincaActiva();
    const registros = caches.finanzas.filter((r) => perteneceAFinca(r.data, fincaActiva));

    tbody.innerHTML = '';
    let ingresos = 0;
    let egresos = 0;

    if (registros.length === 0) {
      const contexto = fincaActiva === 'Global' ? 'el consolidado' : fincaActiva;
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#64748b;padding:16px;">Sin movimientos financieros para ${contexto}.</td></tr>`;
    } else {
      registros.forEach(({ id, data: d }) => {
        const monto = Number(d.monto) || 0;
        if (d.tipo === 'Ingreso') ingresos += monto;
        else egresos += monto;

        const color = d.tipo === 'Ingreso' ? '#15803d' : '#dc2626';
        const etiquetaFinca = fincaActiva === 'Global'
          ? ` <span style="font-size:0.75rem;color:#475569;">(${d.finca || 'Sin finca'})</span>`
          : '';

        tbody.innerHTML += `
          <tr>
            <td>${d.fecha || ''}${etiquetaFinca}</td>
            <td style="color:${color};font-weight:700;">${d.tipo || ''}</td>
            <td>${d.centro || ''}</td>
            <td>${d.concepto || ''}</td>
            <td style="color:${color};font-weight:700;">$${monto.toFixed(2)}</td>
            <td><button type="button" class="erp-btn-del" onclick="eliminarDocERP('finanzas_movimientos','${id}')">Eliminar</button></td>
          </tr>`;
      });
    }

    const kpiIng = document.getElementById('kpi-fin-ingresos');
    const kpiEgr = document.getElementById('kpi-fin-egresos');
    const kpiBal = document.getElementById('kpi-fin-balance');
    if (kpiIng) kpiIng.textContent = `$${ingresos.toFixed(2)}`;
    if (kpiEgr) kpiEgr.textContent = `$${egresos.toFixed(2)}`;
    if (kpiBal) kpiBal.textContent = `$${(ingresos - egresos).toFixed(2)}`;
  }

  const formFin = document.getElementById('form-finanzas');
  if (formFin) {
    formFin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fincaGuardada = resolverFincaParaGuardar('erp-finca-fin');
      if (!fincaGuardada) {
        notificarERP('Selecciona si el registro corresponde a Agua Clara o El Sur.', 'error');
        return;
      }

      try {
        await addDoc(collection(db, 'finanzas_movimientos'), {
          finca: fincaGuardada,
          fecha: document.getElementById('fin-fecha').value,
          tipo: document.getElementById('fin-tipo').value,
          centro: document.getElementById('fin-centro').value,
          concepto: document.getElementById('fin-concepto').value,
          monto: Number(document.getElementById('fin-monto').value),
          createdAt: serverTimestamp()
        });
        formFin.reset();
        document.getElementById('fin-fecha').value = hoyISO;
        actualizarSelectoresFincaGlobal();
        notificarERP(`Movimiento registrado en ${fincaGuardada}.`, 'exito');
      } catch (err) {
        console.error('Error guardando finanza:', err);
        notificarERP('Error al guardar el movimiento financiero.', 'error');
      }
    });

    const qFin = query(collection(db, 'finanzas_movimientos'), orderBy('fecha', 'desc'), limit(80));
    onSnapshot(qFin, (snap) => {
      caches.finanzas = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      renderFinanzas();
    });
  }

  // --- SINCRONIZACIÓN CON CAMBIO DE FINCA Y NAVEGACIÓN ---
  window.cargarModulosERP = () => {
    actualizarSelectoresFincaGlobal();
    renderLecheria();
    renderAgronomia();
    renderOperaciones();
    renderFinanzas();
  };

  window.addEventListener('fincaCambiada', () => {
    window.cargarModulosERP();
  });

  window.cargarModulosERP();
});
