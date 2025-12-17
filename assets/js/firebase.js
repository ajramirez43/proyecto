/* ========================================================
   ARCHIVO: assets/js/firebase.js
   DESCRIPCIÓN: Conexión principal con Google Firebase
   ======================================================== */

// 1. Importamos las librerías necesarias desde los servidores de Google
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, deleteDoc, getDocs, updateDoc, query, where, orderBy, limit, arrayUnion, arrayRemove, deleteField } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

    
// 2. TU CONFIGURACIÓN (Pega aquí lo que copiaste de la consola de Firebase)
// No borres las comillas ni las llaves.
  const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: ""
  };


// 3. Inicializamos la conexión
const app = initializeApp(firebaseConfig);

// 4. Preparamos los servicios para usarlos en toda la app
const auth = getAuth(app);      // Para Login/Registro
const db = getFirestore(app);   // Para Base de Datos

// 5. Exportamos las funciones para que 'registro.html' y 'dashboard.html' las puedan usar
export { auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, collection, doc, setDoc, addDoc, getDoc, deleteDoc, getDocs, updateDoc, query, where, orderBy, limit, arrayUnion, arrayRemove, deleteField };