// js/auth.js
import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');

console.log("✅ Módulo auth.js cargado e inicializado.");

// 1. Escuchar el estado de la sesión
onAuthStateChanged(auth, (user) => {
    console.log("Estado de sesión:", user ? `Activo (${user.email})` : "Sin sesión");
    if (user) {
        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';
    } else {
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
    }
});

// 2. Procesar el envío del formulario
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("👉 Procesando credenciales...");
        
        if (loginError) loginError.style.display = 'none';

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            console.log("¡Acceso concedido!");
            loginForm.reset();
        } catch (error) {
            console.error("❌ Error de autenticación:", error.code);
            if (loginError) {
                loginError.innerText = "Error: " + error.code;
                loginError.style.display = 'block';
            }
            alert("No se pudo ingresar: " + error.message);
        }
    });
} else {
    console.error("❌ No se encontró el elemento #login-form");
}

// 3. Botón de salida
if (btnLogout) {
    btnLogout.addEventListener('click', () => signOut(auth));
}
