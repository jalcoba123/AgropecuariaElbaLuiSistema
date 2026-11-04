// js/dashboard.js
import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Escuchar los registros reales de animales en la base de datos
onSnapshot(collection(db, "animales"), (snapshot) => {
    const totalAnimales = snapshot.size;
    const elemHato = document.getElementById('dash-total-hato');
    if (elemHato) {
        elemHato.innerText = totalAnimales;
    }
});

// Escuchar los registros reales de hectáreas de palma
onSnapshot(collection(db, "palma_lotes"), (snapshot) => {
    let totalHa = 0;
    snapshot.forEach((doc) => {
        totalHa += Number(doc.data().hectareas || 0);
    });
    const elemPalma = document.getElementById('dash-palma-ha');
    if (elemPalma) {
        elemPalma.innerText = `${totalHa} ha`;
    }
});
