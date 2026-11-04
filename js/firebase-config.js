// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Credenciales reales de Agropecuaria ElbaLui
const firebaseConfig = {
  apiKey: "AIzaSyBHKDSUWKYICbu6vJ1UKUuY8Y6tOfZkoKs",
  authDomain: "finca-agropecuaria-elbalui.firebaseapp.com",
  projectId: "finca-agropecuaria-elbalui",
  storageBucket: "finca-agropecuaria-elbalui.firebasestorage.app",
  messagingSenderId: "1047271470951",
  appId: "1:1047271470951:web:380ff8c667dd7eab2221c2",
  measurementId: "G-ND79ESF8FM"
};

// Inicializar la aplicación
const app = initializeApp(firebaseConfig);

// Exportar base de datos y autenticación para el sistema ERP
export const db = getFirestore(app);
export const auth = getAuth(app);
