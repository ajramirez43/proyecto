import { auth, db, doc, getDoc, updateDoc, onAuthStateChanged, signOut } from './firebase.js';

let currentUserUID = null;

// Referencias a inputs para facilitar el código
const els = {
    name: document.getElementById('name'),
    age: document.getElementById('age'),
    email: document.getElementById('email'), // Es solo lectura (disabled)

    // Condiciones
    hyp: document.getElementById('hyp'),
    diab: document.getElementById('diab'),

    // Monitoreo Adicional
    pulse: document.getElementById('chkPulse'),
    temp: document.getElementById('chkTemp'),
    oxi: document.getElementById('chkOxi'),

    // Información Adicional
    emerName: document.getElementById('emerName'),
    emerPhone: document.getElementById('emerPhone'),
    note: document.getElementById('note'),
    
    // Botón
    btnSave: document.getElementById('btnSave')
};


/* ==========================================
   1. FUNCIONES PRINCIPALES
   ========================================== */

/**
 * Carga los datos del perfil del usuario logueado desde Firestore y llena el formulario.
 * @param {string} uid UID del usuario actual
 */
async function loadProfile(uid) {
    try {
        const userDocRef = doc(db, "usuarios", uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const data = userDoc.data();
            
            // Llenar campos
            if(els.name) els.name.value = data.fullName || '';
            if(els.age) els.age.value = data.age || '';
            if(els.email) els.email.value = data.email || 'N/A';
            
            // Llenar condiciones
            if(els.hyp) els.hyp.checked = data.esHipertenso || false;
            if(els.diab) els.diab.checked = data.esDiabetico || false;
            
            // Llenar dispositivos
            if(els.pulse) els.pulse.checked = data.tienePulso || false;
            if(els.temp) els.temp.checked = data.tieneTermometro || false;
            if(els.oxi) els.oxi.checked = data.tieneOximetro || false;

            // Llenar notas y emergencia
            if(els.emerName) els.emerName.value = data.emergencyName || '';
            if(els.emerPhone) els.emerPhone.value = data.emergencyPhone || '';
            if(els.note) els.note.value = data.medicalNotes || '';
            
            console.log("Perfil cargado exitosamente.");

        } else {
            console.error("No se encontró el documento de perfil del usuario.");
            Swal.fire('Error', 'No se pudo cargar tu perfil. Asegúrate de haberte registrado correctamente.', 'error');
        }
    } catch (error) {
        console.error("Error al cargar perfil:", error);
        Swal.fire('Error', 'Ocurrió un error de conexión al cargar tu perfil.', 'error');
    }
}

/**
 * Guarda los cambios del formulario en Firestore.
 * @param {Event} e Evento de submit del formulario.
 */
async function saveProfile(e) {
    e.preventDefault();

    if (!currentUserUID) {
        Swal.fire('Error', 'No hay sesión activa.', 'error');
        return;
    }

    const originalContent = els.btnSave.innerHTML;
    els.btnSave.disabled = true;
    els.btnSave.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Guardando...';
    if(window.lucide) window.lucide.createIcons();

    try {
        // Recolectar datos del formulario
        const updatedData = {
            fullName: els.name.value.trim(),
            age: parseInt(els.age.value),
            
            // Condiciones
            esHipertenso: els.hyp.checked,
            esDiabetico: els.diab.checked,

            // Dispositivos
            tienePulso: els.pulse.checked,
            tieneTermometro: els.temp.checked,
            tieneOximetro: els.oxi.checked,
            
            // Información Adicional
            emergencyName: els.emerName.value.trim(),
            emergencyPhone: els.emerPhone.value.trim(),
            medicalNotes: els.note.value.trim(),
        };

        // Actualizar documento en Firestore
        const userDocRef = doc(db, "usuarios", currentUserUID);
        await updateDoc(userDocRef, updatedData);

        Swal.fire({
            icon: 'success',
            title: 'Perfil Actualizado',
            text: 'Tus preferencias se han guardado.',
            timer: 1500,
            showConfirmButton: false
        });

    } catch (error) {
        console.error("Error al guardar perfil:", error);
        Swal.fire('Error', 'No se pudieron guardar los cambios: ' + error.message, 'error');
    } finally {
        els.btnSave.disabled = false;
        els.btnSave.innerHTML = originalContent;
        if(window.lucide) window.lucide.createIcons();
    }
}

/**
 * Cierra la sesión del usuario.
 */
window.cerrarSesion = async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        Swal.fire('Error', 'No se pudo cerrar la sesión.', 'error');
    }
}

/* ==========================================
   2. INICIALIZACIÓN
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Escuchar el estado de autenticación
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserUID = user.uid;
            loadProfile(user.uid);
            
            const form = document.getElementById('profileForm');
            if(form) {
                form.addEventListener('submit', saveProfile);
            }
            if(window.lucide) window.lucide.createIcons();

        } else {
            // No hay usuario, redirigir al login
            window.location.href = 'index.html';
        }
    });
});