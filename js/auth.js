import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');

// 1. Escuchar si el usuario ya está conectado
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginScreen.style.display = 'none';
        appContainer.style.display = 'block';
        console.log("Usuario autorizado:", user.email);
    } else {
        loginScreen.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

// 2. Iniciar Sesión
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.style.display = 'none'; 

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    signInWithEmailAndPassword(auth, email, password)
        .then(() => { loginForm.reset(); })
        .catch((error) => {
            console.error("Error de acceso:", error.code);
            loginError.style.display = 'block';
        });
});

// 3. Cerrar Sesión
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        signOut(auth).then(() => { console.log("Sesión cerrada"); });
    });
}
