(function () {
  let hideTimer = null;
  let syncTimer = null;

  function getStatusBar() {
    return document.getElementById('offline-status-bar');
  }

  function tienePendientesOffline() {
    try {
      const animales = JSON.parse(localStorage.getItem('elbalui_pendientes_offline') || '[]');
      const bitacora = JSON.parse(localStorage.getItem('elbalui_bitacora_offline') || '[]');
      return (Array.isArray(animales) && animales.length > 0) ||
             (Array.isArray(bitacora) && bitacora.length > 0);
    } catch (e) {
      return false;
    }
  }

  function actualizarEstadoRed(mensajeOpcional, colorOpcional, autoOcultar = false) {
    const statusBar = getStatusBar();
    if (!statusBar) return;

    clearTimeout(hideTimer);

    if (!navigator.onLine) {
      clearTimeout(syncTimer);
      statusBar.textContent = '🟠 Sin señal (Modo Offline) — Guardando en caché local del dispositivo';
      statusBar.style.backgroundColor = '#b45309';
      statusBar.style.color = '#ffffff';
      statusBar.style.display = 'block';
      return;
    }

    statusBar.textContent = mensajeOpcional || '🟢 Conectado — Sincronizado con la nube';
    statusBar.style.backgroundColor = colorOpcional || '#15803d';
    statusBar.style.color = '#ffffff';
    statusBar.style.display = 'block';

    if (autoOcultar) {
      hideTimer = setTimeout(() => {
        if (navigator.onLine && getStatusBar()) {
          getStatusBar().style.display = 'none';
        }
      }, 3500);
    }
  }

  window.addEventListener('online', () => {
    clearTimeout(syncTimer);
    if (tienePendientesOffline()) {
      actualizarEstadoRed('🔄 Señal recuperada — Subiendo registros pendientes a Firestore...', '#0369a1', false);
      syncTimer = setTimeout(() => {
        if (navigator.onLine) {
          actualizarEstadoRed('🟢 Conectado — Todos los datos sincronizados en la nube', '#15803d', true);
        }
      }, 3000);
    } else {
      actualizarEstadoRed('🟢 Conectado — Todos los datos sincronizados en la nube', '#15803d', true);
    }
  });

  window.addEventListener('offline', () => actualizarEstadoRed());

  document.addEventListener('DOMContentLoaded', () => {
    actualizarEstadoRed(null, null, navigator.onLine);
  });

  if (document.readyState !== 'loading') {
    actualizarEstadoRed(null, null, navigator.onLine);
  }
})();
