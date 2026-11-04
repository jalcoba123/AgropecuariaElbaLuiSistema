// js/dashboard.js
import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function cargarDashboard() {
    // 1. Contar Hato Total en tiempo real
    onSnapshot(collection(db, "animales"), (snapshot) => {
        const total = snapshot.size;
        const el = document.getElementById('dash-total-hato');
        if (el) el.innerText = total;
    });

    // 2. Sumar Hectáreas de Palma en tiempo real
    onSnapshot(collection(db, "palma_lotes"), (snapshot) => {
        let totalHa = 0;
        snapshot.forEach(doc => {
            totalHa += Number(doc.data().hectareas || 0);
        });
        const el = document.getElementById('dash-palma-ha');
        if (el) el.innerText = `${totalHa} ha`;
    });
}

// Inicializar al cargar
setTimeout(cargarDashboard, 1000);
