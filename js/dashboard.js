// js/dashboard.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function iniciarDashboard() {
    // Escuchar Hato en tiempo real
    onSnapshot(collection(db, "animales"), (snapshot) => {
        const elemHato = document.getElementById('dash-total-hato');
        if (elemHato) elemHato.innerText = snapshot.size;
    }, (error) => console.log("Dashboard Hato:", error.message));

    // Escuchar hectáreas de Palma en tiempo real
    onSnapshot(collection(db, "palma_lotes"), (snapshot) => {
        let totalHa = 0;
        snapshot.forEach((doc) => totalHa += Number(doc.data().hectareas || 0));
        const elemPalma = document.getElementById('dash-palma-ha');
        if (elemPalma) elemPalma.innerText = `${totalHa} ha`;
    }, (error) => console.log("Dashboard Palma:", error.message));
}

// Activar la lectura solo tras autenticar al usuario
onAuthStateChanged(auth, (user) => {
    if (user) {
        iniciarDashboard();
    }
});
