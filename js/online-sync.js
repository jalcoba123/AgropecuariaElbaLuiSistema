(function () {
  const statusBar = document.getElementById('offline-status-bar');
  let hideTimer = null;

  function actualizarEstadoRed(mensajeOpcional, colorOpcional, autoOcultar = false) {
    if (!statusBar) return;
    clearTimeout(hideTimer);

    if (!navigator.onLine) {
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
        if (navigator.onLine) statusBar.style.display = 'none';
      }, 3500);
    }
  }

  window.addEventListener('online', () => {
    actualizarEstadoRed('🔄 Señal recuperada — Subiendo registros pendientes a Firestore...', '#0369a1', false);
    setTimeout(() => {
      if (navigator.onLine) {
        actualizarEstadoRed('🟢 Conectado — Todos los datos sincronizados en la nube', '#15803d', true);
      }
    }, 3000);
  });

  window.addEventListener('offline', () => actualizarEstadoRed());

  document.addEventListener('DOMContentLoaded', () => {
    actualizarEstadoRed(null, null, navigator.onLine);
  });
})();
