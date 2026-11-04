// js/auth.js
import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');

// 1. Escuchar el estado de autenticación
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Sesión activa detectada:", user.email);
        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';
    } else {
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
    }
});

// 2. Procesar inicio de sesión
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (loginError) loginError.style.display = 'none';

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                alert("¡Bienvenido! Acceso autorizado.");
                loginForm.reset();
            })
            .catch((error) => {
                console.error("Error Auth:", error.code);
                let mensaje = "Error de acceso: ";
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                    mensaje += "Correo o contraseña incorrectos.";
                } else if (error.code === 'auth/user-not-found') {
                    mensaje += "El correo no está registrado en Firebase.";
                } else {
                    mensaje += error.message;
                }
                alert(mensaje);
                if (loginError) {
                    loginError.innerText = mensaje;
                    loginError.style.display = 'block';
                }
            });
    });
}

// 3. Cerrar sesión
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        signOut(auth);
    });
}
