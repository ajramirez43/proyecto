/* ==========================================
   1. CONFIGURACIÓN Y DATOS
   ========================================== */
let historialSintomas = JSON.parse(localStorage.getItem('vitalSync_sintomas')) || [];
let datosFiltrados = [];
let myChart = null;

const sintomasPosibles = ["Dolor de Cabeza", "Mareo", "Fatiga", "Dolor Articular", "Náuseas", "Falta de Aire", "Inflamación", "Ardor de ojos", "Ansiedad", "Insomnio"];
const intensidades = ["Leve", "Moderado", "Intenso"];

/* ==========================================
   2. INICIALIZACIÓN
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    
    // Configurar fechas
    const today = new Date();
    // Ajuste zona horaria para obtener fecha local correcta
    const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const horaActual = `${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`;

    // Configurar Inputs Registro
    const inputReg = document.getElementById('fechaRegistro');
    const inputHora = document.getElementById('horaRegistro');
    if(inputReg) { inputReg.max = localToday; inputReg.value = localToday; }
    if(inputHora) { inputHora.value = horaActual; }

    // Configurar Filtros
    const fInicio = document.getElementById('filtroInicio');
    const fFin = document.getElementById('filtroFin');
    
    if(fInicio && fFin) {
        const primerDiaMes = new Date(today.getFullYear(), today.getMonth(), 1);
        const primerDiaStr = new Date(primerDiaMes.getTime() - (primerDiaMes.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        // RANGO INICIAL: 1ro del mes -> HOY
        fInicio.value = primerDiaStr;
        fFin.value = localToday;
        
        // BLOQUEO FUTURO: El máximo seleccionable es HOY
        fFin.max = localToday; 
        fInicio.max = localToday;

        fInicio.addEventListener('change', () => { 
            if(fInicio.value > fFin.value) fFin.value = fInicio.value; 
            aplicarFiltros();
        });
        fFin.addEventListener('change', () => { 
            if(fFin.value < fInicio.value) fInicio.value = fFin.value; 
            aplicarFiltros();
        });
    }

    aplicarFiltros();
});

/* ==========================================
   3. LÓGICA DE DATOS Y FILTRADO (CORREGIDO)
   ========================================== */
function aplicarFiltros() {
    const inicioVal = document.getElementById('filtroInicio').value;
    const finVal = document.getElementById('filtroFin').value;

    if (!inicioVal || !finVal) return;

    // Crear fechas con hora 00:00 y 23:59 para cubrir todo el día
    // IMPORTANTE: Usar "T00:00" para asegurar la zona horaria local del string
    const dInicio = new Date(inicioVal + "T00:00:00");
    const dFin = new Date(finVal + "T23:59:59");

    // Ordenar: Más reciente primero
    historialSintomas.sort((a, b) => {
        const dA = new Date(a.fecha + 'T' + (a.hora || '00:00'));
        const dB = new Date(b.fecha + 'T' + (b.hora || '00:00'));
        return dB - dA;
    });

    // FILTRO PRINCIPAL
    datosFiltrados = historialSintomas.filter(reg => {
        // Creamos la fecha del registro con una hora fija para comparar solo fechas
        const dReg = new Date(reg.fecha + "T12:00:00"); 
        
        // Comparamos timestamps o fechas completas
        return dReg >= dInicio && dReg <= dFin;
    });

    // Actualizar contador
    const countEl = document.getElementById('totalCount');
    if(countEl) countEl.innerText = datosFiltrados.length;
    
    // RENDERIZAR TODO
    renderizarGrafico();
    renderizarLista(); // Esto actualiza la lista de detalles
}

/* ==========================================
   4. RENDERIZADO (GRÁFICO 5 COLORES)
   ========================================== */
function renderizarGrafico() {
    const canvas = document.getElementById('symptomsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const conteo = {};
    datosFiltrados.forEach(reg => {
        reg.sintomas.forEach(s => { conteo[s] = (conteo[s] || 0) + 1; });
    });

    const sortedKeys = Object.keys(conteo).sort((a,b) => conteo[b] - conteo[a]);
    const sortedData = sortedKeys.map(k => conteo[k]);

    // GAMA DE COLORES (5 NIVELES)
    const backgroundColors = sortedData.map(val => {
        if (val >= 10) return 'rgba(147, 51, 234, 0.85)'; // Morado
        if (val >= 7)  return 'rgba(239, 68, 68, 0.85)';  // Rojo
        if (val >= 5)  return 'rgba(249, 115, 22, 0.85)'; // Naranja
        if (val >= 3)  return 'rgba(234, 179, 8, 0.85)';  // Amarillo
        return 'rgba(16, 185, 129, 0.85)';               // Verde
    });

    const borderColors = sortedData.map(val => {
        if (val >= 10) return 'rgba(107, 33, 168, 1)';
        if (val >= 7)  return 'rgba(185, 28, 28, 1)';
        if (val >= 5)  return 'rgba(194, 65, 12, 1)';
        if (val >= 3)  return 'rgba(161, 98, 7, 1)';
        return 'rgba(4, 120, 87, 1)';
    });

    if (myChart) myChart.destroy();

    if (sortedKeys.length === 0) {
        myChart = new Chart(ctx, { type: 'bar', data: { labels: [], datasets: [] } });
        return;
    }

    myChart = new Chart(ctx, {
        type: 'bar', 
        data: {
            labels: sortedKeys,
            datasets: [{
                label: 'Ocurrencias',
                data: sortedData,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 'flex',
                maxBarThickness: 35
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: '#f1f5f9' } },
                y: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderizarLista() {
    const list = document.getElementById('list');
    const empty = document.getElementById('emptyList');
    if(!list) return;
    
    list.innerHTML = '';

    if (datosFiltrados.length === 0) {
        if(empty) empty.classList.remove('hidden');
        return;
    }
    if(empty) empty.classList.add('hidden');

    datosFiltrados.forEach(reg => {
        let colorClass = 'bg-green-100 text-green-800 border-green-200';
        if(reg.intensidad === 'Moderado') colorClass = 'bg-yellow-100 text-yellow-800 border-yellow-200';
        if(reg.intensidad === 'Intenso') colorClass = 'bg-red-100 text-red-800 border-red-200';

        const dateObj = new Date(reg.fecha + "T12:00:00");
        const fechaStr = dateObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
        const horaStr = reg.hora || '--:--';

        const li = document.createElement('li');
        li.className = "bg-white border border-slate-100 p-4 rounded-xl shadow-sm hover:shadow-md transition-all";
        li.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex flex-col">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-xs font-bold text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                            <i data-lucide="calendar" class="w-3 h-3"></i> ${fechaStr}
                        </span>
                        <span class="text-xs font-bold text-indigo-500 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded">
                            <i data-lucide="clock" class="w-3 h-3"></i> ${horaStr}
                        </span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${reg.sintomas.map(s => `
                            <span class="px-2 py-1 bg-slate-100 text-slate-700 text-sm font-semibold rounded-md border border-slate-200 flex items-center gap-1">
                                ${s}
                            </span>
                        `).join('')}
                    </div>
                </div>
                <span class="${colorClass} px-3 py-1 rounded-full text-xs font-bold border shadow-sm shrink-0">
                    ${reg.intensidad}
                </span>
            </div>
            ${reg.notas ? `<div class="mt-3 pt-2 border-t border-slate-50 text-sm text-slate-500 italic flex gap-2 items-start"><i data-lucide="message-square" class="w-4 h-4 mt-0.5 opacity-50"></i> "${reg.notas}"</div>` : ''}
        `;
        list.appendChild(li);
    });
    lucide.createIcons();
}

/* ==========================================
   5. INTERACCIÓN Y GUARDADO
   ========================================== */
function toggleOtroInput(checkbox) {
    const input = document.getElementById('inputOtroSintoma');
    if (checkbox.checked) { input.classList.remove('hidden'); input.focus(); } 
    else { input.classList.add('hidden'); input.value = ''; }
}

const formSintomas = document.getElementById('symptomForm');
if(formSintomas) {
    formSintomas.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const fecha = document.getElementById('fechaRegistro').value;
        const hora = document.getElementById('horaRegistro').value;
        const chks = document.querySelectorAll('.chk:checked');
        const notas = document.getElementById('note').value;
        const intensidadInput = document.querySelector('input[name="intensidad"]:checked');
        const intensidad = intensidadInput ? intensidadInput.value : 'Leve';

        let sintomas = [];
        chks.forEach(chk => {
            if (chk.value === "OTRO") {
                const otroTexto = document.getElementById('inputOtroSintoma').value.trim();
                if (otroTexto) sintomas.push(otroTexto);
            } else {
                sintomas.push(chk.value);
            }
        });

        if (sintomas.length === 0) {
            Swal.fire({icon: "warning", title: "Faltan datos", text: "Selecciona o escribe al menos un síntoma", confirmButtonColor: "#4338ca"});
            return;
        }

        const nuevoRegistro = { id: Date.now(), fecha, hora, sintomas, intensidad, notas };

        historialSintomas.push(nuevoRegistro);
        localStorage.setItem('vitalSync_sintomas', JSON.stringify(historialSintomas));
        
        e.target.reset();
        
        // Reset inputs a HOY
        const today = new Date();
        const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const horaActual = `${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`;
        document.getElementById('fechaRegistro').value = localToday;
        document.getElementById('horaRegistro').value = horaActual;
        document.getElementById('inputOtroSintoma').classList.add('hidden');
        
        aplicarFiltros();
        Swal.fire({ icon: 'success', title: 'Registrado', showConfirmButton: false, timer: 1500 });
    });
}

/* ==========================================
   6. SIMULACIÓN (HASTA EL 31, PERO VISTA RESTRINGIDA)
   ========================================== */
function simularSintomas() {
    Swal.fire({
        title: "¿Simular Todo Diciembre?",
        text: "Se generarán datos para todo el mes, pero el calendario seguirá bloqueado hasta hoy.",
        icon: "info",
        showCancelButton: true,
        confirmButtonText: "Sí, simular",
        confirmButtonColor: "#4338ca"
    }).then((result) => {
        if (result.isConfirmed) {
            const nuevos = [];
            const year = new Date().getFullYear();
            const month = 11; // Dic
            const daysInMonth = 31;

            for (let day = 1; day <= daysInMonth; day++) {
                if (Math.random() > 0.2) {
                    const numSintomas = Math.floor(Math.random() * 4) + 1;
                    const sintomasDia = [];
                    const pool = [...sintomasPosibles];
                    
                    for(let i=0; i<numSintomas; i++) {
                        const randomIndex = Math.floor(Math.random() * pool.length);
                        sintomasDia.push(pool[randomIndex]);
                        pool.splice(randomIndex, 1);
                    }
                    
                    const randInt = Math.random();
                    let intensidad = "Leve";
                    if (randInt > 0.5) intensidad = "Moderado";
                    if (randInt > 0.8) intensidad = "Intenso";
                    
                    const fechaStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const horaRand = `${String(Math.floor(Math.random()*14)+8).padStart(2,'0')}:${String(Math.floor(Math.random()*59)).padStart(2,'0')}`;

                    nuevos.push({
                        id: Date.now() + Math.random(),
                        fecha: fechaStr, hora: horaRand,
                        sintomas: sintomasDia, intensidad, 
                        notas: Math.random() > 0.8 ? "Simulación." : ""
                    });
                }
            }
            
            historialSintomas = nuevos;
            localStorage.setItem('vitalSync_sintomas', JSON.stringify(historialSintomas));
            
            // === AQUÍ ESTÁ LA CORRECCIÓN ===
            // NO desbloqueamos el max date a futuro.
            const today = new Date();
            const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            
            // Aseguramos que el filtro visual llegue SOLO hasta HOY
            const fFin = document.getElementById('filtroFin');
            const fInicio = document.getElementById('filtroInicio');
            
            fFin.max = localToday;
            fInicio.max = localToday;
            fFin.value = localToday; // Ver datos hasta hoy
            
            aplicarFiltros();
            Swal.fire("¡Listo!", "Datos generados. Visualizando hasta hoy.", "success");
        }
    });
}