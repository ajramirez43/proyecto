import { db, collection, query, where, getDocs, updateDoc, doc, arrayUnion } from './firebase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar iconos de Lucide
    if (window.lucide) window.lucide.createIcons();

    const form = document.getElementById('cuidadorForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
});

async function handleFormSubmit(e) {
    e.preventDefault();

    // 1. Capturar todos los datos del formulario
    const cuidadorName = document.getElementById('cuidadorName').value.trim();
    const cuidadorEmail = document.getElementById('cuidadorEmail').value.trim();
    const cuidadorPhone = document.getElementById('cuidadorPhone').value.trim();
    const fullName = document.getElementById('pacienteName').value.trim();
    
    const btn = document.getElementById('btnConfirmar');
    const errorBox = document.getElementById('errorBox');
    const errorText = document.getElementById('errorText');
    const originalBtnHtml = btn.innerHTML;

    // UI: Carga
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Procesando...';
    if (window.lucide) window.lucide.createIcons();
    btn.disabled = true;
    errorBox.classList.add('hidden');

    if (!cuidadorName || !cuidadorEmail || !cuidadorPhone || !fullName) { 
        showError("Por favor, llena todos los campos del formulario.");
        restoreButton();
        return;
    }

    try {
        // 2. Buscar al paciente por nombre completo
        const usersRef = collection(db, "usuarios");
        const q = query(usersRef, where("fullName", "==", fullName)); 
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            showError("No se encontró ningún paciente con ese nombre. Verifica la ortografía.");
            return;
        }

        // Obtener la referencia del paciente
        const pacienteDoc = snapshot.docs[0];
        const pacienteUid = pacienteDoc.id;
        const pacienteDocRef = doc(db, "usuarios", pacienteUid);
        
        // 3. Preparar datos
        const emailLimpio = cuidadorEmail.toLowerCase();
        
        // *** CAMBIO CLAVE: Usamos el guion bajo (_) para evitar la anidación en Firestore ***
        const emailKey = emailLimpio.replace(/\./g, '_'); 
        
        const cuidadorData = {
            name: cuidadorName,
            phone: cuidadorPhone,
            email: emailLimpio, // Guardamos el email original dentro del objeto
            fechaAceptacion: new Date().toISOString()
        };
        
        // 4. ACTUALIZAR EL DOCUMENTO DEL PACIENTE
        await updateDoc(pacienteDocRef, {
            // A. Añadir el email sin modificar (limpio) a la lista simple
            cuidadores: arrayUnion(emailLimpio), 
            
            // B. Guardar el objeto completo del cuidador usando la clave plana con '_'
            [`cuidadoresDetalles.${emailKey}`]: cuidadorData
        });

        // 5. ÉXITO Y DETENCIÓN DEL FLUJO
        
        document.getElementById('cuidadorForm').style.display = 'none';

        Swal.fire({
            icon: 'success',
            title: '¡Invitación Aceptada!',
            text: `Ahora podrás recibir la información del paciente ${pacienteDoc.data().fullName}. Ya puedes cerrar esta ventana.`, 
            confirmButtonColor: '#4338ca',
            allowOutsideClick: false,
            showConfirmButton: true,
        });

    } catch (error) {
        console.error("Error al procesar la invitación:", error);
        
        let errorMessage = 'Ocurrió un error inesperado. Intenta de nuevo.';
        
        if (error.code === 'permission-denied' || error.message.includes('permission')) {
             errorMessage = 'Error de permisos. Asegúrate de que las reglas de Firestore estén PUBLICADAS correctamente.';
        }
        showError(errorMessage);

    } finally {
        restoreButton();
    }

    function showError(message) {
        errorText.innerText = message;
        errorBox.classList.remove('hidden');
    }

    function restoreButton() {
        btn.innerHTML = originalBtnHtml;
        if (window.lucide) window.lucide.createIcons();
        btn.disabled = false;
    }
}