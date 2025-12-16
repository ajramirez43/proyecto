document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    const signupForm = document.getElementById('signupForm');
    
    if(signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('btnSignup');
            btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Registrando...';
            lucide.createIcons();
            btn.disabled = true;

            // CAPTURA COMPLETA DE REQUERIMIENTOS
            const userData = {
                nombre: document.getElementById('regName').value,
                edad: document.getElementById('regAge').value,
                email: document.getElementById('regEmail').value,
                
                // Condiciones (Obligatorias según selección)
                esHipertenso: document.getElementById('regHyper').checked,
                esDiabetico: document.getElementById('regDiab').checked,
                
                // Monitoreo Adicional (Seleccionado por usuario)
                tienePulso: document.getElementById('regPulse').checked,
                tieneTermometro: document.getElementById('regTemp').checked,
                tieneOximetro: document.getElementById('regOxi').checked,
                
                notas: "" 
            };

            // Regla de Negocio PDF: Si es Hipertenso, Pulso debería ser casi obligatorio, 
            // pero lo dejamos flexible según "Poder Editar".
            
            setTimeout(() => {
                // Guardar perfil completo para que Dashboard lo lea
                localStorage.setItem('vitalSync_userProfile', JSON.stringify(userData));

                Swal.fire({
                    icon: 'success',
                    title: '¡Cuenta Creada!',
                    text: 'Perfil configurado exitosamente.',
                    showConfirmButton: false,
                    timer: 2000
                }).then(() => {
                    window.location.href = 'dashboard.html';
                });
            }, 1500);
        });
    }
});