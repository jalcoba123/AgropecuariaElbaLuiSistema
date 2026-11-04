import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBHKDSUWKYICbu6vJ1UKUuY8Y6tOfZkoKs",
    authDomain: "finca-agropecuaria-elbalui.firebaseapp.com",
    projectId: "finca-agropecuaria-elbalui",
    storageBucket: "finca-agropecuaria-elbalui.firebasestorage.app",
    messagingSenderId: "1047271470951",
    appId: "1:1047271470951:web:380ff8c667dd7eab2221c2",
    measurementId: "G-ND79ESF8FM"
};

const app = initializeApp(firebaseConfig);

// Activa el modo Offline (Disco duro local en el teléfono)
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const auth = getAuth(app);

export { app, db, auth };
