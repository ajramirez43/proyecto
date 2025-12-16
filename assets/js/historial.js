/* ==========================================
   1. CONFIGURACIÓN Y DATOS
   ========================================== */
const userProfile = {
    nombre: "Juan Pérez",
    esHipertenso: true,  
    esDiabetico: true,
    tienePulso: true,     
    tieneTermometro: true, 
    tieneOximetro: true
};

// --- NUEVO: LÍMITES DE SEGURIDAD (Igual que en Dashboard) ---
const LIMITES_VITALES = {
    temp: { min: 34.0, max: 43.0, nombre: "Temperatura" },
    sys:  { min: 50,  max: 250,  nombre: "Presión Sistólica" },
    dia:  { min: 30,  max: 150,  nombre: "Presión Diastólica" },
    pul:  { min: 30,  max: 220,  nombre: "Pulso" },
    glu:  { min: 20,  max: 600,  nombre: "Glucosa" },
    oxi:  { min: 50,  max: 100,  nombre: "Saturación de Oxígeno" }
};

// Leemos los datos del LocalStorage o iniciamos vacío
let historialGlobal = JSON.parse(localStorage.getItem('vitalSync_data')) || [];
let datosFiltrados = [];
let myChart = null;
let currentChartMode = 'BP';

/* ==========================================
   2. INICIALIZACIÓN
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    
    // Configuración de fechas: "Ayer" como máximo por defecto
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    // Función auxiliar para formato YYYY-MM-DD local
    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const yesterdayStr = formatDate(yesterday);
    const pastDate = new Date(yesterday);
    pastDate.setDate(yesterday.getDate() - 30); // 30 días atrás
    
    const inputInicio = document.getElementById('filtroInicio');
    const inputFin = document.getElementById('filtroFin');

    if(inputInicio && inputFin) {
        // Restricciones: No futuro
        inputInicio.max = yesterdayStr;
        inputFin.max = yesterdayStr;

        // Valores iniciales
        inputInicio.value = formatDate(pastDate);
        inputFin.value = yesterdayStr;

        // Listeners para validar rangos
        inputInicio.addEventListener('change', () => {
            if(inputInicio.value > inputFin.value) inputFin.value = inputInicio.value;
            aplicarFiltros(); // Auto-refrescar al cambiar fecha
        });
        inputFin.addEventListener('change', () => {
            if(inputFin.value < inputInicio.value) inputInicio.value = inputFin.value;
            aplicarFiltros(); // Auto-refrescar al cambiar fecha
        });
    }

    aplicarFiltros();
    configurarModal();
});

/* ==========================================
   3. LÓGICA DE FILTRADO
   ========================================== */
function aplicarFiltros() {
    const elInicio = document.getElementById('filtroInicio');
    const elFin = document.getElementById('filtroFin');
    
    if(!elInicio || !elFin) return;

    const strInicio = elInicio.value;
    const strFin = elFin.value;

    // Forzamos hora local para evitar problemas de zona horaria
    const fInicio = new Date(strInicio + "T00:00:00");
    const fFin = new Date(strFin + "T23:59:59");

    // Ordenar cronológicamente
    historialGlobal.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Filtrar
    datosFiltrados = historialGlobal.filter(d => {
        const fDato = new Date(d.fecha);
        return fDato >= fInicio && fDato <= fFin;
    });

    renderizarTabla();
    
    // Si la gráfica está visible, actualizarla
    const divGrafica = document.getElementById('vistaGrafica');
    if(divGrafica && !divGrafica.classList.contains('hidden')) {
        renderizarGrafica();
    }
}

/* ==========================================
   4. RENDERIZADO DE TABLA
   ========================================== */
function renderizarTabla() {
    const tbody = document.getElementById('tBody');
    const theadRow = document.getElementById('headerTabla'); 
    const emptyState = document.getElementById('emptyState');
    const tableContainer = document.getElementById('tablaHistorial');
    
    if(!tbody) return;

    tbody.innerHTML = '';
    if(theadRow) theadRow.innerHTML = ''; 

    // Estado vacío
    if (datosFiltrados.length === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        if(tableContainer) tableContainer.classList.add('hidden');
        return;
    }
    if(emptyState) emptyState.classList.add('hidden');
    if(tableContainer) tableContainer.classList.remove('hidden');

    // --- A. CONSTRUIR ENCABEZADOS (HEADERS) ---
    let headersHTML = `
        <th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide w-32 whitespace-nowrap">Fecha</th>
        <th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide w-24 whitespace-nowrap">Hora</th>
    `;

    if (userProfile.esHipertenso) headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-center">Presión</th>`;
    if (userProfile.tienePulso)   headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-center">Pulso</th>`;
    if (userProfile.esDiabetico)  headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-center">Glucosa</th>`;
    if (userProfile.tieneTermometro) headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-center">Temp</th>`;
    if (userProfile.tieneOximetro)   headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-center">Sat. O2</th>`;
    
    headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-right w-20">Acción</th>`;

    if(theadRow) theadRow.innerHTML = headersHTML;

    // --- B. CONSTRUIR FILAS (ROWS) ---
    const datosParaTabla = [...datosFiltrados].reverse();

    datosParaTabla.forEach(d => {
        const date = new Date(d.fecha);
        const fechaStr = date.toLocaleDateString();
        const horaStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50 transition-colors group";

        let rowHTML = `
            <td class="p-4 font-medium text-slate-800 whitespace-nowrap">${fechaStr}</td>
            <td class="p-4 text-slate-500 font-medium whitespace-nowrap">${horaStr}</td>
        `;

        if (userProfile.esHipertenso) {
            rowHTML += `<td class="p-4 font-bold text-base text-center ${getColor('BP', d.sistolica, d.diastolica)}">
                ${d.sistolica ? d.sistolica + '/' + d.diastolica : '--'}
            </td>`;
        }
        if (userProfile.tienePulso) {
            rowHTML += `<td class="p-4 font-bold text-base text-center ${getColor('HR', d.pulso)}">${d.pulso || '--'}</td>`;
        }
        if (userProfile.esDiabetico) {
            rowHTML += `<td class="p-4 font-bold text-base text-center ${getColor('GLU', d.glucosa)}">${d.glucosa || '--'}</td>`;
        }
        if (userProfile.tieneTermometro) {
            rowHTML += `<td class="p-4 font-bold text-base text-center ${getColor('TEMP', d.temperatura)}">
                ${d.temperatura ? parseFloat(d.temperatura).toFixed(1) : '--'}
            </td>`;
        }
        if (userProfile.tieneOximetro) {
            rowHTML += `<td class="p-4 font-bold text-base text-center ${getColor('OXI', d.saturacion)}">${d.saturacion || '--'}</td>`;
        }

        rowHTML += `
            <td class="p-4 text-right">
                <button onclick="eliminarRegistroIndividual(${d.id})" class="text-slate-300 group-hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50" title="Eliminar registro">
                    <i data-lucide="trash" class="w-4 h-4"></i>
                </button>
            </td>
        `;

        tr.innerHTML = rowHTML;
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
}

// Helper de Colores
function getColor(tipo, val, valSec) {
    if (!val) return "text-slate-300";
    const v = parseFloat(val);
    let c = "text-green-600"; 
    if (tipo === 'BP') {
        const s = v; const d = parseFloat(valSec || 0);
        if (s>=130||d>=90) c="text-red-600"; else if((s>=120&&s<=129)||(d>=80&&d<=89)) c="text-yellow-500"; else if(s<110||d<70) c="text-blue-600";
    } else if (tipo === 'GLU') {
        if (v>=130) c="text-red-600"; else if(v>=100) c="text-yellow-500"; else if(v<70) c="text-blue-600";
    } else if (tipo === 'HR') {
        if (v>100) c="text-red-600"; else if(v>=90) c="text-yellow-500"; else if(v<60) c="text-blue-600";
    } else if (tipo === 'TEMP') {
        if (v>38) c="text-red-600"; else if(v>=37.5) c="text-yellow-500"; else if(v<36) c="text-blue-600";
    } else if (tipo === 'OXI') {
        if (v<90) c="text-red-600"; else if(v<=93) c="text-yellow-500";
    }
    return c;
}

/* ==========================================
   5. ELIMINAR REGISTRO
   ========================================== */
function eliminarRegistroIndividual(id) {
    Swal.fire({
        title: "¿Eliminar registro?",
        text: "Esta acción no se puede deshacer.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#ef4444",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar"
    }).then((result) => {
        if (result.isConfirmed) {
            historialGlobal = historialGlobal.filter(reg => reg.id !== id);
            localStorage.setItem('vitalSync_data', JSON.stringify(historialGlobal));
            aplicarFiltros();
            
            const Toast = Swal.mixin({
                toast: true, position: "top-end", showConfirmButton: false, timer: 2000,
                didOpen: (toast) => { toast.onmouseenter = Swal.stopTimer; toast.onmouseleave = Swal.resumeTimer; }
            });
            Toast.fire({ icon: "success", title: "Registro eliminado" });
        }
    });
}

/* ==========================================
   6. GRÁFICOS Y VISTAS
   ========================================== */
function cambiarVista(vista) {
    const btnT = document.getElementById('btnVistaTabla');
    const btnG = document.getElementById('btnVistaGrafica');
    const divT = document.getElementById('vistaTabla');
    const divG = document.getElementById('vistaGrafica');

    if (vista === 'tabla') {
        btnT.className = "active-tab px-6 py-2.5 rounded-lg text-sm font-bold flex gap-2 items-center shadow-sm";
        btnG.className = "inactive-tab px-6 py-2.5 rounded-lg text-sm font-bold flex gap-2 items-center hover:bg-white";
        divT.classList.remove('hidden');
        divG.classList.add('hidden');
    } else {
        btnG.className = "active-tab px-6 py-2.5 rounded-lg text-sm font-bold flex gap-2 items-center shadow-sm";
        btnT.className = "inactive-tab px-6 py-2.5 rounded-lg text-sm font-bold flex gap-2 items-center hover:bg-white";
        divG.classList.remove('hidden');
        divT.classList.add('hidden');
        generarPestañasGrafico();
        renderizarGrafica();
    }
}

function generarPestañasGrafico() {
    const container = document.getElementById('chartTabs');
    if(!container) return;
    container.innerHTML = '';
    const opts = [];
    if(userProfile.esHipertenso) opts.push({k:'BP', l:'Presión'});
    if(userProfile.tienePulso) opts.push({k:'HR', l:'Pulso'});
    if(userProfile.esDiabetico) opts.push({k:'GLU', l:'Glucosa'});
    if(userProfile.tieneTermometro) opts.push({k:'TEMP', l:'Temp'});
    if(userProfile.tieneOximetro) opts.push({k:'OXI', l:'Sat. O2'});
    
    if (!opts.find(o => o.k === currentChartMode) && opts.length > 0) currentChartMode = opts[0].k;

    opts.forEach(o => {
        const btn = document.createElement('button');
        btn.textContent = o.l;
        btn.className = `px-4 py-2 rounded-lg text-xs font-bold transition-all border ${currentChartMode === o.k ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`;
        btn.onclick = () => { currentChartMode = o.k; generarPestañasGrafico(); renderizarGrafica(); };
        container.appendChild(btn);
    });
}

function renderizarGrafica() {
    const canvas = document.getElementById('historyChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (datosFiltrados.length === 0) {
        if(myChart) myChart.destroy();
        return;
    }

    const labels = datosFiltrados.map(d => {
        const date = new Date(d.fecha);
        return `${date.getDate()}/${date.getMonth()+1} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    });

    let datasets = [];
    if (currentChartMode === 'BP') {
        datasets = [
            { label: 'Sistólica', data: datosFiltrados.map(d=>d.sistolica), borderColor: '#b91c1c', backgroundColor: 'rgba(185, 28, 28, 0.1)', fill: true, tension: 0.3 },
            { label: 'Diastólica', data: datosFiltrados.map(d=>d.diastolica), borderColor: '#f43f5e', borderDash: [5,5], tension: 0.3 }
        ];
    } else if (currentChartMode === 'GLU') {
        datasets = [{ label: 'Glucosa', data: datosFiltrados.map(d=>d.glucosa), borderColor: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.1)', fill: true, tension: 0.3 }];
    } else if (currentChartMode === 'HR') {
        datasets = [{ label: 'Pulso', data: datosFiltrados.map(d=>d.pulso), borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.3 }];
    } else if (currentChartMode === 'TEMP') {
        datasets = [{ label: 'Temp', data: datosFiltrados.map(d=>d.temperatura), borderColor: '#ea580c', backgroundColor: 'rgba(234, 88, 12, 0.1)', fill: true, tension: 0.3 }];
    } else if (currentChartMode === 'OXI') {
        datasets = [{ label: 'Sat O2', data: datosFiltrados.map(d=>d.saturacion), borderColor: '#0d9488', backgroundColor: 'rgba(13, 148, 136, 0.1)', fill: true, tension: 0.3 }];
    }

    if(myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
    });
}

/* ==========================================
   7. PDF Y SIMULACIÓN
   ========================================== */
function abrirOpcionesPDF() {
    let opcionesHTML = `<div class="text-left space-y-2">`;
    if(userProfile.esHipertenso) opcionesHTML += `<div><input type="checkbox" id="chkBP" value="BP" checked> <label>Gráfico Presión Arterial</label></div>`;
    if(userProfile.tienePulso) opcionesHTML += `<div><input type="checkbox" id="chkHR" value="HR"> <label>Gráfico Frecuencia Card.</label></div>`;
    if(userProfile.esDiabetico) opcionesHTML += `<div><input type="checkbox" id="chkGLU" value="GLU"> <label>Gráfico Glucosa</label></div>`;
    if(userProfile.tieneTermometro) opcionesHTML += `<div><input type="checkbox" id="chkTEMP" value="TEMP"> <label>Gráfico Temperatura</label></div>`;
    if(userProfile.tieneOximetro) opcionesHTML += `<div><input type="checkbox" id="chkOXI" value="OXI"> <label>Gráfico Saturación</label></div>`;
    opcionesHTML += `</div>`;

    Swal.fire({
        title: 'Opciones de PDF',
        html: `<p class="mb-4 text-sm text-gray-500">Selecciona qué gráficos incluir:</p>${opcionesHTML}`,
        showCancelButton: true,
        confirmButtonText: 'Generar PDF',
        confirmButtonColor: '#dc2626',
        preConfirm: () => {
            const selected = [];
            if(document.getElementById('chkBP')?.checked) selected.push('BP');
            if(document.getElementById('chkHR')?.checked) selected.push('HR');
            if(document.getElementById('chkGLU')?.checked) selected.push('GLU');
            if(document.getElementById('chkTEMP')?.checked) selected.push('TEMP');
            if(document.getElementById('chkOXI')?.checked) selected.push('OXI');
            return selected;
        }
    }).then((result) => {
        if (result.isConfirmed) generarPDF(result.value);
    });
}

async function generarPDF(graficosSeleccionados) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18); doc.text("Reporte Médico - VitalSync", 14, 20);
    doc.setFontSize(10); doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(`Paciente: ${userProfile.nombre}`, 14, 34);
    doc.text(`Periodo: ${document.getElementById('filtroInicio').value} al ${document.getElementById('filtroFin').value}`, 14, 40);

    // HEADERS DINÁMICOS PARA PDF
    let headers = ['Fecha', 'Hora'];
    if(userProfile.esHipertenso) headers.push('Presión');
    if(userProfile.tienePulso) headers.push('Pulso');
    if(userProfile.esDiabetico) headers.push('Glucosa');
    if(userProfile.tieneTermometro) headers.push('Temp');
    if(userProfile.tieneOximetro) headers.push('Sat O2');

    // DATOS DINÁMICOS PARA PDF
    const rows = [...datosFiltrados].reverse().map(d => {
        const dt = new Date(d.fecha);
        let row = [dt.toLocaleDateString(), dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})];
        if(userProfile.esHipertenso) row.push(d.sistolica ? `${d.sistolica}/${d.diastolica}` : '-');
        if(userProfile.tienePulso) row.push(d.pulso || '-');
        if(userProfile.esDiabetico) row.push(d.glucosa || '-');
        if(userProfile.tieneTermometro) row.push(d.temperatura || '-');
        if(userProfile.tieneOximetro) row.push(d.saturacion || '-');
        return row;
    });

    doc.autoTable({ head: [headers], body: rows, startY: 45, theme: 'grid', headStyles: { fillColor: [67, 56, 202] } });

    // GRÁFICOS
    let finalY = doc.lastAutoTable.finalY + 10;
    const canvas = document.getElementById('pdfCanvas');
    if(canvas) { 
        const ctx = canvas.getContext('2d');
        for (const tipo of graficosSeleccionados) {
            if (finalY + 90 > 280) { doc.addPage(); finalY = 20; }
            
            const labels = datosFiltrados.map(d => { const dt = new Date(d.fecha); return `${dt.getDate()}/${dt.getMonth()+1}`; });
            let datasets = [], titulo = "";
            
            if(tipo==='BP') { titulo="Presión"; datasets=[{label:'Sys', data:datosFiltrados.map(d=>d.sistolica), borderColor:'#b91c1c', fill:false}, {label:'Dia', data:datosFiltrados.map(d=>d.diastolica), borderColor:'#f43f5e', fill:false}]; }
            else if(tipo==='GLU') { titulo="Glucosa"; datasets=[{label:'Glu', data:datosFiltrados.map(d=>d.glucosa), borderColor:'#0284c7', fill:false}]; }
            else if(tipo==='HR') { titulo="Pulso"; datasets=[{label:'Pulso', data:datosFiltrados.map(d=>d.pulso), borderColor:'#6366f1', fill:false}]; }
            else if(tipo==='TEMP') { titulo="Temp"; datasets=[{label:'Temp', data:datosFiltrados.map(d=>d.temperatura), borderColor:'#ea580c', fill:false}]; }
            else if(tipo==='OXI') { titulo="Sat O2"; datasets=[{label:'Sat', data:datosFiltrados.map(d=>d.saturacion), borderColor:'#0d9488', fill:false}]; }

            const existingChart = Chart.getChart("pdfCanvas");
            if (existingChart) existingChart.destroy();

            new Chart(ctx, {
                type: 'line',
                data: { labels, datasets },
                options: { animation: false, responsive: false }
            });
            await new Promise(r => setTimeout(r, 100));
            const imgData = canvas.toDataURL('image/png');
            doc.setFontSize(12); doc.text(titulo, 14, finalY);
            doc.addImage(imgData, 'PNG', 14, finalY+5, 180, 80);
            finalY += 95;
        }
    }

    doc.save(`Reporte_VitalSync_${new Date().toISOString().slice(0,10)}.pdf`);
    Swal.fire("PDF Generado", "El reporte se ha descargado.", "success");
}

function simularDatosDiciembre() {
    Swal.fire({
        title: "¿Simular Diciembre?", text: "Se borrarán los datos y se crearán registros nuevos.", icon: "question", showCancelButton: true, confirmButtonText: "Sí"
    }).then((result) => {
        if (result.isConfirmed) {
            const nuevosDatos = [];
            const startDate = new Date(new Date().getFullYear(), 11, 1); 
            const endDate = new Date(); endDate.setDate(endDate.getDate() - 1); // Hasta ayer

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                for (let h of [9, 18]) { 
                    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'), hour=String(h).padStart(2,'0');
                    nuevosDatos.push({
                        id: Date.now() + Math.random(),
                        fecha: `${y}-${m}-${day}T${hour}:30:00`, 
                        sistolica: 110 + Math.floor(Math.random() * 30), diastolica: 70 + Math.floor(Math.random() * 20),
                        pulso: 65 + Math.floor(Math.random() * 20), glucosa: 80 + Math.floor(Math.random() * 60),
                        temperatura: (36.0 + Math.random()).toFixed(1), saturacion: 94 + Math.floor(Math.random() * 6)
                    });
                }
            }
            historialGlobal = nuevosDatos;
            localStorage.setItem('vitalSync_data', JSON.stringify(historialGlobal));
            aplicarFiltros();
            Swal.fire("Datos generados", "", "success");
        }
    });
}

function borrarDatos() {
    Swal.fire({ title: "¿Borrar todo?", icon: "warning", showCancelButton: true, confirmButtonColor: "#dc2626" }).then((r) => {
        if(r.isConfirmed) { localStorage.removeItem('vitalSync_data'); location.reload(); }
    });
}

/* ==========================================
   8. MODAL DE REGISTRO
   ========================================== */
function toggleModal(show) { const modal = document.getElementById('modal'); show ? modal.classList.remove('hidden') : modal.classList.add('hidden'); }

function abrirModalRetroactivo() {
    const inputFecha = document.getElementById('fechaRegistro');
    const now = new Date();
    
    // Calcular "Ayer"
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(23, 59);

    // Calcular "Hace 3 días" (o más si quieres permitir más historia)
    const minDate = new Date(now);
    minDate.setDate(now.getDate() - 30); // Ejemplo: Permitir hasta 30 días atrás
    minDate.setHours(0,0);

    const offset = now.getTimezoneOffset() * 60000;
    const maxStr = new Date(yesterday.getTime() - offset).toISOString().slice(0,16);
    const minStr = new Date(minDate.getTime() - offset).toISOString().slice(0,16);

    inputFecha.max = maxStr;
    inputFecha.min = minStr;
    inputFecha.value = maxStr;
    toggleModal(true);
}

function configurarModal() {
    const g = { bp: document.getElementById('group-bp'), pul: document.getElementById('group-pul'), glu: document.getElementById('group-glu'), temp: document.getElementById('group-temp'), oxi: document.getElementById('group-oxi') };
    const i = { sys: document.getElementById('sys'), dia: document.getElementById('dia'), pul: document.getElementById('pul'), glu: document.getElementById('glu') };
    
    if(!g.bp) return; // Seguridad si el modal no está en el HTML

    Object.values(g).forEach(el => el.classList.add('hidden'));
    if (userProfile.esHipertenso) { g.bp.classList.remove('hidden'); i.sys.required=true; i.dia.required=true; i.pul.required=true; }
    if (userProfile.tienePulso) g.pul.classList.remove('hidden');
    if (userProfile.esDiabetico) { g.glu.classList.remove('hidden'); i.glu.required=true; }
    if (userProfile.tieneTermometro) g.temp.classList.remove('hidden');
    if (userProfile.tieneOximetro) g.oxi.classList.remove('hidden');
}

// === EVENTO SUBMIT (CON VALIDACIÓN DE RANGOS) ===
document.getElementById('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fechaVal = document.getElementById('fechaRegistro').value;
    const inputDate = new Date(fechaVal);
    const now = new Date();
    
    // Validar NO HOY (Porque es Historial Retroactivo)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (inputDate >= startOfToday) {
        Swal.fire({icon: 'error', title: 'Fecha incorrecta', text: 'En Historial solo se registran días pasados. Usa el Dashboard para hoy.'}); 
        return;
    }

    // --- NUEVA VALIDACIÓN DE RANGOS ---
    const sysVal = document.getElementById('sys').value;
    const diaVal = document.getElementById('dia').value;
    const pulVal = document.getElementById('pul').value;
    const gluVal = document.getElementById('glu').value;
    const tempVal = document.getElementById('temp').value;
    const oxiVal = document.getElementById('oxi').value;

    const validarRango = (valor, codigo) => {
        if (!valor) return true; 
        const num = parseFloat(valor);
        const limite = LIMITES_VITALES[codigo];
        if (num < limite.min || num > limite.max) {
            Swal.fire({
                icon: 'warning',
                title: `${limite.nombre} fuera de rango`,
                text: `Has ingresado ${num}. El rango válido es entre ${limite.min} y ${limite.max}.`,
                confirmButtonColor: '#f59e0b'
            });
            return false;
        }
        return true;
    };

    // Ejecutar validaciones según perfil
    if (userProfile.esHipertenso) {
        if (!validarRango(sysVal, 'sys')) return;
        if (!validarRango(diaVal, 'dia')) return;
        if (Number(sysVal) > 0 && Number(diaVal) > 0 && Number(sysVal) <= Number(diaVal)) {
            Swal.fire({ icon: 'error', title: 'Error en Presión', text: 'La Sistólica (alta) debe ser mayor que la Diastólica (baja).', confirmButtonColor: '#4338ca' });
            return;
        }
    }
    if (userProfile.tienePulso && !validarRango(pulVal, 'pul')) return;
    if (userProfile.esDiabetico && !validarRango(gluVal, 'glu')) return;
    if (userProfile.tieneTermometro && !validarRango(tempVal, 'temp')) return;
    if (userProfile.tieneOximetro && !validarRango(oxiVal, 'oxi')) return;

    // Guardado de Datos
    const nuevo = {
        id: Date.now(), fecha: fechaVal,
        sistolica: sysVal ? Number(sysVal) : null,
        diastolica: diaVal ? Number(diaVal) : null,
        pulso: pulVal ? Number(pulVal) : null,
        glucosa: gluVal ? Number(gluVal) : null,
        temperatura: tempVal ? Number(tempVal) : null,
        saturacion: oxiVal ? Number(oxiVal) : null
    };

    historialGlobal.push(nuevo);
    localStorage.setItem('vitalSync_data', JSON.stringify(historialGlobal));
    aplicarFiltros(); 
    toggleModal(false); 
    e.target.reset();
    
    const Toast = Swal.mixin({
        toast: true, position: "top-end", showConfirmButton: false, timer: 3000,
        didOpen: (toast) => { toast.onmouseenter = Swal.stopTimer; toast.onmouseleave = Swal.resumeTimer; }
    });
    Toast.fire({ icon: "success", title: "Registro histórico agregado" });
});