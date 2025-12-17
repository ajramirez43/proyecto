import { auth, db, doc, getDoc, updateDoc, onAuthStateChanged, arrayUnion, arrayRemove, signOut, deleteField } from './firebase.js';

let currentUserUID = null;
let cuidadores = []; 
let userProfileName = "Paciente"; 
let userProfileEmail = ""; 


/* ==========================================
   CONFIGURACIÓN DE CORREOS (EmailJS)
   ========================================== */
const EMAILJS_SERVICE_ID = 'service_uv9nabr'; 
const EMAILJS_TEMPLATE_ID_INVITE = 'INVITACION_CUIDADOR'; 
const EMAILJS_PUBLIC_KEY = 'E9boDbDZmeFuBrw4Y'; 

if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}


/* ==========================================
   1. LÓGICA DE FIREBASE Y CARGA (REESTRUCTURADA)
   ========================================== */

// En cuidador.js, reemplaza la función cargarCuidadores:

async function cargarCuidadores(uid) {
    try {
        const userDocRef = doc(db, "usuarios", uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const data = userDoc.data();
            userProfileName = data.fullName || "Paciente"; 
            userProfileEmail = data.email || auth.currentUser.email;
            
            const cuidadoresEmails = data.cuidadores || []; // Lista simple de emails
            const cuidadoresDetalles = data.cuidadoresDetalles || {}; // Mapa de detalles
            
            cuidadores = [];
            
            cuidadoresEmails.forEach(emailLimpio => {
                const keyPlana = emailLimpio.replace(/\./g, '_'); // Crear la clave que se usó para guardar
                const details = cuidadoresDetalles[keyPlana]; // Intentar leer con la clave plana

                if (details && details.name) { // Si hay detalles con nombre (Confirmado)
                    cuidadores.push({
                        id: emailLimpio, 
                        email: emailLimpio,
                        nombre: details.name,
                        telefono: details.phone || 'N/A',
                        iniciales: details.name.substring(0, 2).toUpperCase(),
                        status: 'CONFIRMADO'
                    });
                } else {
                    // Pendiente (solo existe en el array 'cuidadores', no en el mapa 'cuidadoresDetalles')
                    cuidadores.push({
                        id: emailLimpio, 
                        email: emailLimpio,
                        nombre: 'Invitación Pendiente',
                        telefono: 'Esperando confirmación',
                        iniciales: emailLimpio.substring(0, 2).toUpperCase(),
                        status: 'PENDIENTE'
                    });
                }
            });

            // Ordenar: Confirmados primero, luego Pendientes.
            cuidadores.sort((a, b) => {
                if (a.status === 'PENDIENTE' && b.status !== 'PENDIENTE') return 1;
                if (a.status !== 'PENDIENTE' && b.status === 'PENDIENTE') return -1;
                return a.nombre.localeCompare(b.nombre);
            });


            renderizarCuidadores(); 
        } else {
            cuidadores = [];
            renderizarCuidadores();
        }
    } catch (error) {
        console.error("Error al cargar cuidadores:", error);
        Swal.fire('Error', 'No se pudo cargar la lista de cuidadores.', 'error');
    }
}


async function agregarCuidadorFirebase(email) {
    if (!currentUserUID) return Swal.fire('Error', 'Sesión no activa.', 'error');
    
    const confirmationLink = `${window.location.origin}/views/confirmar_cuidador.html`;

    // 1. Enviar el correo de invitación
    try {
        if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
            const templateParams = {
                nombre_paciente: userProfileName,
                email_paciente: userProfileEmail,
                email_cuidador: email,
                link_confirmacion: confirmationLink 
            };

            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID_INVITE, templateParams); 
            
            Swal.fire({
                icon: 'success',
                title: 'Correo Enviado',
                text: `Se ha enviado la invitación por correo a ${email}. Deberá llenar un formulario de confirmación.`,
                timer: 3000,
                confirmButtonColor: '#4338ca'
            });
        } else {
             Swal.fire('Advertencia', 'El correo de invitación no se envió. Configura EMAILJS.', 'warning');
        }
    } catch (e) {
        console.error("Error al enviar correo:", e);
    }


    // 2. Actualizar Firestore: Agregamos el email al array para indicar que se envió la invitación.
    try {
        const userDocRef = doc(db, "usuarios", currentUserUID);
        
        await updateDoc(userDocRef, {
            cuidadores: arrayUnion(email)
        });

        // Recargamos la lista para mostrar la tarjeta de "Pendiente"
        await cargarCuidadores(currentUserUID);

    } catch (error) {
        console.error("Error al guardar en Firestore:", error);
        Swal.fire('Error', 'No se pudo guardar el cuidador en la base de datos.', 'error');
    }
}


// En tu archivo cuidador.js, reemplaza la función eliminarCuidadorFirebase por esta:

async function eliminarCuidadorFirebase(email) {
    if (!currentUserUID) return Swal.fire('Error', 'Sesión no activa.', 'error');

    try {
        const userDocRef = doc(db, "usuarios", currentUserUID);
        
        // *** CAMBIO CLAVE: Usamos el email limpio y en minúsculas ***
        const mapKeyLimpia = email.toLowerCase();
        
        // Para la compatibilidad con registros antiguos que usaban '_'
        const mapKeyAntigua = email.toLowerCase().replace(/\./g, '_');


        // Eliminar del array simple
        await updateDoc(userDocRef, {
            cuidadores: arrayRemove(email)
        });
        
        // Intentar eliminar con la clave limpia (email@domain.com)
        await updateDoc(userDocRef, {
            [`cuidadoresDetalles.${mapKeyLimpia}`]: deleteField() 
        });

        // Si existe un registro antiguo, también intentamos borrarlo (es seguro hacerlo incluso si no existe)
        if (mapKeyLimpia !== mapKeyAntigua) {
             await updateDoc(userDocRef, {
                [`cuidadoresDetalles.${mapKeyAntigua}`]: deleteField() 
            });
        }
        
        await cargarCuidadores(currentUserUID);

        Swal.fire('¡Eliminado!', 'Acceso revocado correctamente.', 'success');

    } catch (error) {
        console.error("Error al eliminar cuidador:", error);
        Swal.fire('Error', 'No se pudo revocar el acceso.', 'error');
    }
}


/* ==========================================
   2. FUNCIONES DE UI (Renderizado de Tarjetas)
   ========================================== */

function renderizarCuidadores() {
    const contenedor = document.getElementById('caregiverList');
    const empty = document.getElementById('emptyState');
    if (!contenedor || !empty) return;

    contenedor.innerHTML = '';

    if (cuidadores.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    cuidadores.forEach(c => {
        const card = document.createElement('div');
        card.className = "bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 relative group hover:shadow-md transition-all";
        
        const isPending = c.status === 'PENDIENTE';
        const bgColor = isPending ? 'bg-slate-100 text-slate-600' : 'bg-green-100 text-green-600';
        
        // Contenido principal de la tarjeta
        card.innerHTML = `
            <div class="w-14 h-14 ${bgColor} rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm">
                <span class="font-bold text-xl">${c.iniciales}</span>
            </div>
            <div class="flex-1 overflow-hidden space-y-1">
                <h3 class="font-bold text-lg ${isPending ? 'text-slate-500 italic' : 'text-slate-800'}">${c.nombre}</h3>
                
                ${c.telefono && c.telefono !== 'N/A' && !isPending
                    ? `<p class="text-sm text-slate-600 flex items-center gap-1.5">
                        <i data-lucide="phone" class="w-4 h-4 text-primary"></i>
                        <span>${c.telefono}</span>
                       </p>` 
                    : ''}
                
                <p class="text-xs text-slate-500 truncate flex items-center gap-1.5">
                    <i data-lucide="mail" class="w-4 h-4"></i>
                    <span>${c.email}</span>
                </p>
            </div>
            <button onclick="window.eliminar('${c.email}')" 
                class="absolute top-2 right-2 p-2 bg-red-500/10 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                title="Revocar acceso">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>
        `;
        contenedor.appendChild(card);
    });
    
    if(window.lucide) window.lucide.createIcons();
}

// ... (Funciones auxiliares para el botón Invitar y Eliminar)
window.agregarCuidador = function() {
    Swal.fire({
        title: 'Invitar Cuidador',
        input: 'email',
        inputLabel: 'Correo Electrónico',
        inputPlaceholder: 'ejemplo@familiar.com',
        showCancelButton: true,
        confirmButtonText: 'Enviar Invitación',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#4338ca',
        inputValidator: (value) => {
            if (!value) return '¡Necesitas ingresar un correo!';
            if (cuidadores.some(c => c.email.toLowerCase() === value.toLowerCase())) return 'Este correo ya es cuidador.';
        }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            agregarCuidadorFirebase(result.value.trim().toLowerCase());
        }
    });
};

window.eliminar = function(email) {
    Swal.fire({
        title: '¿Revocar Acceso?',
        text: `El usuario con email ${email} ya no podrá monitorear tu salud.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, revocar acceso'
    }).then((result) => {
        if(result.isConfirmed) {
            eliminarCuidadorFirebase(email);
        }
    });
};

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
   3. INICIALIZACIÓN
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnInvitarCuidador');
    if (btn) {
        btn.addEventListener('click', window.agregarCuidador);
    }
    
    if(window.lucide) window.lucide.createIcons();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserUID = user.uid;
            cargarCuidadores(user.uid); 
        } else {
            window.location.href = 'index.html';
        }
    });
});