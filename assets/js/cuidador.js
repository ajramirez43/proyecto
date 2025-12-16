// Datos iniciales
let cuidadores = JSON.parse(localStorage.getItem('vitalSync_cuidadores')) || [
    { id: 1, nombre: 'Contacto de Emergencia', email: 'emergencia@familia.com', iniciales: 'CE' }
];

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    renderizarCuidadores();
});

function renderizarCuidadores() {
    const contenedor = document.getElementById('caregiverList');
    const empty = document.getElementById('emptyState');
    contenedor.innerHTML = '';

    if (cuidadores.length === 0) {
        if(empty) empty.classList.remove('hidden');
        return;
    }
    if(empty) empty.classList.add('hidden');

    cuidadores.forEach(c => {
        const card = document.createElement('div');
        card.className = "bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 relative group hover:shadow-md transition-all";
        card.innerHTML = `
            <div class="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 shrink-0 border-2 border-white shadow-sm">
                <span class="font-bold text-xl">${c.iniciales}</span>
            </div>
            <div class="flex-1 overflow-hidden">
                <h3 class="font-bold text-lg text-slate-800 truncate">${c.nombre || 'Usuario'}</h3>
                <p class="text-sm text-gray-500 truncate mb-1">${c.email}</p>
                <span class="inline-flex items-center gap-1 bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Activo
                </span>
            </div>
            <button class="absolute top-4 right-4 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full p-2 transition-all opacity-0 group-hover:opacity-100" onclick="eliminar(${c.id})">
                <i data-lucide="trash-2" class="w-5 h-5"></i>
            </button>
        `;
        contenedor.appendChild(card);
    });
    lucide.createIcons();
}

// Hacemos las funciones globales para que el HTML pueda llamarlas con onclick
window.agregarCuidador = function() {
    Swal.fire({
        title: 'Invitar Nuevo Cuidador',
        text: 'Ingresa el correo electrónico de la persona.',
        input: 'email',
        inputPlaceholder: 'ejemplo@correo.com',
        showCancelButton: true,
        confirmButtonText: 'Enviar Invitación',
        confirmButtonColor: '#4338ca',
        cancelButtonText: 'Cancelar',
        cancelButtonColor: '#64748b',
        customClass: { popup: 'rounded-2xl' }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            const email = result.value;
            const iniciales = email.substring(0, 2).toUpperCase();
            
            cuidadores.push({
                id: Date.now(),
                nombre: 'Nuevo Cuidador',
                email: email,
                iniciales: iniciales
            });
            
            localStorage.setItem('vitalSync_cuidadores', JSON.stringify(cuidadores));
            renderizarCuidadores();

            Swal.fire({
                icon: 'success',
                title: 'Invitación enviada',
                text: `Hemos enviado un correo de acceso a ${email}`,
                confirmButtonColor: '#4338ca',
                timer: 2500
            });
        }
    });
};

window.eliminar = function(id) {
    Swal.fire({
        title: '¿Revocar acceso?',
        text: "Este usuario ya no podrá monitorear tu salud.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar acceso'
    }).then((result) => {
        if(result.isConfirmed) {
            cuidadores = cuidadores.filter(c => c.id !== id);
            localStorage.setItem('vitalSync_cuidadores', JSON.stringify(cuidadores));
            renderizarCuidadores();
            Swal.fire({title: 'Acceso revocado', icon: 'success', timer: 1500, showConfirmButton: false});
        }
    });
};