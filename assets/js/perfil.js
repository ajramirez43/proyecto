document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // 1. Cargar datos del perfil existente
    const savedData = JSON.parse(localStorage.getItem('vitalSync_userProfile'));
    
    // Referencias a inputs
    const els = {
        name: document.getElementById('name'),
        age: document.getElementById('age'),
        hyp: document.getElementById('hyp'),
        diab: document.getElementById('diab'),
        pulse: document.getElementById('chkPulse'), // Nuevo
        temp: document.getElementById('chkTemp'),   // Nuevo
        oxi: document.getElementById('chkOxi'),     // Nuevo
        note: document.getElementById('note')
    };

    if (savedData) {
        if(els.name) els.name.value = savedData.nombre || '';
        if(els.age) els.age.value = savedData.edad || '';
        if(els.note) els.note.value = savedData.notas || '';
        
        // Cargar Checkboxes de Condiciones
        if(els.hyp) els.hyp.checked = savedData.esHipertenso || false;
        if(els.diab) els.diab.checked = savedData.esDiabetico || false;

        // Cargar Checkboxes de Monitoreo Adicional
        if(els.pulse) els.pulse.checked = savedData.tienePulso || false;
        if(els.temp) els.temp.checked = savedData.tieneTermometro || false;
        if(els.oxi) els.oxi.checked = savedData.tieneOximetro || false;

    } else {
        // Datos default demo
        if(els.name) els.name.value = "Juan Pérez";
        if(els.age) els.age.value = "65";
        if(els.pulse) els.pulse.checked = true;
    }

    // 2. Guardar Cambios
    const form = document.getElementById('profileForm');
    if(form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const btn = e.target.querySelector('button');
            const originalContent = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Guardando...';
            lucide.createIcons();

            // Objeto completo acorde al Dashboard
            const newData = {
                nombre: els.name.value,
                edad: els.age.value,
                notas: els.note.value,
                
                // Banderas de lógica
                esHipertenso: els.hyp.checked,
                esDiabetico: els.diab.checked,
                tienePulso: els.pulse.checked,
                tieneTermometro: els.temp.checked,
                tieneOximetro: els.oxi.checked
            };
            
            localStorage.setItem('vitalSync_userProfile', JSON.stringify(newData));

            setTimeout(() => {
                Swal.fire({
                    icon: 'success',
                    title: 'Perfil Actualizado',
                    text: 'Tus preferencias de monitoreo se han guardado.',
                    confirmButtonColor: '#4338ca',
                    timer: 2000,
                    showConfirmButton: false
                });
                btn.innerHTML = originalContent;
                lucide.createIcons();
            }, 800);
        });
    }
});