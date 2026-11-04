// js/auth.js
import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');

// Escuchar si hay sesión activa
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Sesión iniciada con éxito:", user.email);
        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';
    } else {
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
    }
});

// Enviar datos del formulario
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            alert("¡Acceso concedido!");
        } catch (error) {
            console.error("Error Auth detallado:", error);
            
            let mensaje = "Error: ";
            if (error.code === 'auth/unauthorized-domain') {
                mensaje = "Dominio no autorizado. Agrega sistema-rust-theta.vercel.app en Firebase Console.";
            } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                mensaje = "Correo o contraseña incorrectos.";
            } else if (error.code === 'auth/user-not-found') {
                mensaje = "El usuario no existe en Firebase.";
            } else {
                mensaje += error.message;
            }

            alert(mensaje);
            if (loginError) {
                loginError.innerText = mensaje;
                loginError.style.display = 'block';
            }
        }
    });
}

if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        signOut(auth);
    });
}
