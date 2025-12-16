document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    const loginForm = document.getElementById('loginForm');

    if(loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const pass = document.getElementById('pass').value;
            const btn = e.target.querySelector('button');
            const originalText = btn.innerHTML;

            // Validación simple
            if(email && pass.length >= 4) {
                // Estado de carga
                btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Validando...';
                lucide.createIcons();
                btn.disabled = true;

                setTimeout(() => {
                    // Éxito
                    const Toast = Swal.mixin({
                        toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, timerProgressBar: true
                    });
                    
                    Toast.fire({ icon: 'success', title: '¡Bienvenido de nuevo!' }).then(() => {
                        window.location.href = 'dashboard.html';
                    });
                }, 1500);

            } else {
                // Error
                Swal.fire({
                    icon: 'error',
                    title: 'Datos incorrectos',
                    text: 'Por favor revisa tu correo y contraseña.',
                    confirmButtonColor: '#4338ca',
                    confirmButtonText: 'Intentar de nuevo'
                });
            }
        });
    }
});