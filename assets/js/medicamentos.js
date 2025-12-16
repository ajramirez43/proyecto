/* ==========================================
   1. CONFIGURACIÓN Y DATOS
   ========================================== */
const userProfile = { nombre: "Juan Pérez", esHipertenso: true, esDiabetico: true };

const catalogoMedicamentos = {
    hipertension: ["Losartán", "Captopril", "Enalapril", "Telmisartán", "Amlodipino"],
    diabetes: ["Metformina", "Glibenclamida", "Insulina", "Sitagliptina"],
    comunes: ["Aspirina", "Paracetamol", "Omeprazol", "Atorvastatina", "Complejo B"]
};

const datosDemoMeds = [
    { id: 101, nombre: "Losartán", dosis: "1 tableta", horarios: ["08:00", "20:00"], tagColor: "bg-red-500", tagTexto: "Caja blanca con rojo", dias: [0,1,2,3,4,5,6], stock: 20, instruccion: "ayunas" },
    { id: 102, nombre: "Metformina", dosis: "1 tableta", horarios: ["14:00"], tagColor: "bg-blue-600", tagTexto: "Frasco grande", dias: [0,1,2,3,4,5,6], stock: 60, instruccion: "comida" },
    { id: 103, nombre: "Aspirina", dosis: "1 tableta", horarios: ["12:00"], tagColor: "bg-yellow-400", tagTexto: "Blister", dias: [1,3,5], stock: 2, instruccion: "indistinto" } 
];

let misMedicamentos = JSON.parse(localStorage.getItem('vitalSync_meds')) || [];
if (misMedicamentos.length === 0) {
    misMedicamentos = datosDemoMeds;
    localStorage.setItem('vitalSync_meds', JSON.stringify(misMedicamentos));
}

let historialTomas = JSON.parse(localStorage.getItem('vitalSync_meds_history')) || [];
let alarmasMostradasHoy = new Set();
let editIndex = -1;
let isAlarmRinging = false;

const iconMap = {
    'comida': '<i data-lucide="utensils" class="w-4 h-4 text-orange-500"></i> <span class="text-xs text-orange-600 font-bold">Con comida</span>',
    'ayunas': '<i data-lucide="sunrise" class="w-4 h-4 text-yellow-500"></i> <span class="text-xs text-yellow-600 font-bold">Ayunas</span>',
    'noche': '<i data-lucide="moon" class="w-4 h-4 text-indigo-500"></i> <span class="text-xs text-indigo-600 font-bold">Noche</span>',
    'indistinto': '<i data-lucide="sun" class="w-4 h-4 text-gray-400"></i> <span class="text-xs text-gray-500">Indistinto</span>'
};

/* ==========================================
   2. INICIALIZACIÓN
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    renderizarMedicamentos();
    cargarOpcionesSelect();
    document.body.addEventListener('click', desbloquearAudio, { once: true });
    setInterval(verificarAlarmas, 1000);
});

function desbloquearAudio() {
    const audio = new Audio("https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg");
    audio.volume = 0; audio.play().catch(() => {});
}

/* ==========================================
   3. RENDERIZADO (TARJETA RESPONSIVA CORREGIDA)
   ========================================== */
function renderizarMedicamentos() {
    const contenedor = document.getElementById('medList');
    const emptyState = document.getElementById('emptyState');
    contenedor.innerHTML = '';

    if (misMedicamentos.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    misMedicamentos.forEach((med, index) => {
        med.horarios.sort();
        const siguienteToma = calcularSiguienteToma(med);
        const tagColorClass = med.tagColor || 'bg-gray-100';
        const diasTexto = (!med.dias || med.dias.length === 7) ? "Todos los días" : obtenerTextoDias(med.dias);
        const instruccionHtml = iconMap[med.instruccion || 'indistinto'];

        let stockHtml = '';
        const stockNum = parseInt(med.stock);
        if (stockNum === 0) stockHtml = `<span class="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold border border-red-700 shadow-sm whitespace-nowrap">🚫 SIN MEDICAMENTOS</span>`;
        else if (stockNum < 5) stockHtml = `<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold border border-red-200 animate-pulse whitespace-nowrap">¡Quedan ${stockNum}!</span>`;
        else stockHtml = `<span class="text-xs text-gray-400 font-medium whitespace-nowrap">Stock: ${stockNum}</span>`;

        const card = document.createElement('div');
        // 'overflow-hidden' asegura que nada se salga del borde redondeado
        card.className = "bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative group hover:shadow-md transition-all flex flex-col gap-3 overflow-hidden";
        
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="${tagColorClass} w-12 h-12 rounded-xl flex items-center justify-center shadow-sm border-2 border-white shrink-0">
                        <i data-lucide="pill" class="w-6 h-6 text-white"></i>
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-bold text-lg text-slate-800 leading-tight truncate">${med.nombre}</h3>
                        <p class="text-sm text-gray-500 font-medium truncate">${med.dosis}</p>
                    </div>
                </div>
                <div class="flex gap-1 shrink-0">
                    <button onclick="editarMedicamento(${index})" class="text-slate-300 hover:text-primary p-1.5 rounded hover:bg-slate-50"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button onclick="eliminarMedicamento(${index})" class="text-slate-300 hover:text-red-500 p-1.5 rounded hover:bg-slate-50"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
            
            <div class="flex flex-wrap justify-between items-center gap-2">
                <div class="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-lg shrink-0">
                    ${instruccionHtml}
                </div>
                ${stockHtml}
            </div>

            <div class="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex justify-between items-center">
                <span class="text-xs font-bold text-indigo-600 uppercase shrink-0">Próxima</span>
                <span class="text-lg md:text-xl font-black text-indigo-700 flex items-center gap-1 truncate">
                    <i data-lucide="clock" class="w-4 h-4 opacity-70"></i> ${siguienteToma}
                </span>
            </div>

            <div class="flex justify-between items-start gap-2 pt-1">
                <div class="text-xs text-slate-400 font-medium flex items-center gap-1 mt-1 shrink-0">
                    <i data-lucide="calendar" class="w-3 h-3"></i> ${diasTexto}
                </div>
                
                <div class="flex flex-wrap justify-end gap-1 flex-1 min-w-0">
                    ${med.horarios.map(h => `
                        <span class="px-2 py-0.5 bg-white text-slate-500 text-[10px] rounded border border-slate-200 font-bold">
                            ${h}
                        </span>
                    `).join('')}
                </div>
            </div>
            
            ${med.tagTexto ? `<div class="mt-1 text-xs text-gray-400 italic border-t pt-2 truncate">Nota: ${med.tagTexto}</div>` : ''}
        `;
        contenedor.appendChild(card);
    });
    lucide.createIcons();
}

function calcularSiguienteToma(med) {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const currentDay = now.getDay(); 
    const mapDias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diasActivos = med.dias || [0,1,2,3,4,5,6];

    if (diasActivos.includes(currentDay)) {
        for (let h of med.horarios) {
            const [hh, mm] = h.split(':').map(Number);
            if ((hh * 60 + mm) > currentMins) return h; 
        }
    }
    for (let i = 1; i <= 7; i++) {
        const nextDayIndex = (currentDay + i) % 7;
        if (diasActivos.includes(nextDayIndex)) {
            const hora = med.horarios[0];
            if (i === 1) return `${hora} (Mañana)`;
            return `${hora} (El ${mapDias[nextDayIndex]})`;
        }
    }
    return "--";
}

function obtenerTextoDias(dias) {
    const map = {0:'D', 1:'L', 2:'M', 3:'M', 4:'J', 5:'V', 6:'S'};
    return dias.sort().map(d => map[d]).join(', ');
}

/* ==========================================
   4. MODAL Y SELECTS
   ========================================== */
function cargarOpcionesSelect() {
    const select = document.getElementById('selectNombre');
    select.innerHTML = '<option value="" disabled selected>Selecciona...</option>';
    const addGroup = (lbl, items) => {
        if(!items.length) return;
        const grp = document.createElement('optgroup'); grp.label = lbl;
        items.forEach(i => { const op = document.createElement('option'); op.value = i; op.textContent = i; grp.appendChild(op); });
        select.appendChild(grp);
    };
    if (userProfile.esHipertenso) addGroup("Hipertensión", catalogoMedicamentos.hipertension);
    if (userProfile.esDiabetico) addGroup("Diabetes", catalogoMedicamentos.diabetes);
    addGroup("Uso Común", catalogoMedicamentos.comunes);
    const optOtro = document.createElement('option'); optOtro.value = "OTRO"; optOtro.textContent = "➕ Otro..."; select.appendChild(optOtro);
}

function verificarOtroNombre(select) { document.getElementById('inputOtroNombre').classList.toggle('hidden', select.value !== "OTRO"); if(select.value==="OTRO") document.getElementById('inputOtroNombre').focus(); }
function verificarOtraDosis(select) { document.getElementById('inputOtraDosis').classList.toggle('hidden', select.value !== "OTRO"); if(select.value==="OTRO") document.getElementById('inputOtraDosis').focus(); }

function agregarInputHorario(valor = '') {
    const div = document.createElement('div'); div.className = "flex gap-2 items-center mb-2";
    div.innerHTML = `<input type="time" value="${valor}" class="input-hora flex-1 border border-slate-300 rounded-xl p-2 text-center outline-none focus:border-primary bg-gray-50" required><button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 p-2 bg-red-50 rounded-lg transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>`;
    document.getElementById('contenedorHorarios').appendChild(div);
    lucide.createIcons();
}

/* ==========================================
   5. GUARDAR Y EDITAR
   ========================================== */
function abrirModalMedicamento() {
    editIndex = -1; document.getElementById('modalTitle').innerText = "Nuevo Tratamiento";
    document.getElementById('medForm').reset();
    document.getElementById('contenedorHorarios').innerHTML = '';
    document.getElementById('inputOtroNombre').classList.add('hidden');
    document.getElementById('inputOtraDosis').classList.add('hidden');
    document.querySelectorAll('input[name="diasSemana"]').forEach(chk => chk.checked = true);
    agregarInputHorario(); toggleModal('medModal', true);
}

function editarMedicamento(index) {
    editIndex = index; const med = misMedicamentos[index];
    document.getElementById('modalTitle').innerText = "Editar Tratamiento";
    document.getElementById('tagTexto').value = med.tagTexto;
    document.getElementById('stock').value = med.stock !== undefined ? med.stock : '';
    document.getElementById('instruccion').value = med.instruccion || 'indistinto';

    const setSelect = (idSel, idInp, val) => {
        const s = document.getElementById(idSel), i = document.getElementById(idInp);
        let found = false;
        for(let x=0; x<s.options.length; x++) if(s.options[x].value === val) { s.selectedIndex=x; found=true; break; }
        if(found) i.classList.add('hidden'); else { s.value="OTRO"; i.value=val; i.classList.remove('hidden'); }
    };
    setSelect('selectNombre', 'inputOtroNombre', med.nombre);
    setSelect('selectDosis', 'inputOtraDosis', med.dosis);

    document.querySelectorAll('input[name="colorTag"]').forEach(r => { if(r.value === med.tagColor) r.checked = true; });
    const dias = med.dias || [];
    document.querySelectorAll('input[name="diasSemana"]').forEach(chk => { chk.checked = dias.includes(parseInt(chk.value)); });
    
    document.getElementById('contenedorHorarios').innerHTML = '';
    med.horarios.forEach(h => agregarInputHorario(h));
    toggleModal('medModal', true);
}

function toggleModal(id, show) { const m = document.getElementById(id); show ? m.classList.remove('hidden') : m.classList.add('hidden'); }

document.getElementById('medForm').addEventListener('submit', (e) => {
    e.preventDefault();
    let nombre = document.getElementById('selectNombre').value; if(nombre==="OTRO") nombre=document.getElementById('inputOtroNombre').value;
    let dosis = document.getElementById('selectDosis').value; if(dosis==="OTRO") dosis=document.getElementById('inputOtraDosis').value;
    if(!nombre || !dosis) return Swal.fire("Error", "Faltan datos", "warning");

    const horarios = Array.from(document.querySelectorAll('.input-hora')).map(i => i.value).filter(v => v !== "");
    if(!horarios.length) return Swal.fire("Error", "Falta horario", "warning");

    const dias = Array.from(document.querySelectorAll('input[name="diasSemana"]:checked')).map(c => parseInt(c.value));
    const diasFinal = dias.length > 0 ? dias : [0,1,2,3,4,5,6];

    const nombreNorm = nombre.trim().toLowerCase();
    const existe = misMedicamentos.some((m, idx) => (editIndex !== idx && m.nombre.trim().toLowerCase() === nombreNorm));
    if(existe) return Swal.fire("Duplicado", `Ya existe "${nombre}".`, "error");

    const medData = {
        id: (editIndex > -1) ? misMedicamentos[editIndex].id : Date.now() + Math.random(),
        nombre, dosis, 
        tagTexto: document.getElementById('tagTexto').value, 
        tagColor: document.querySelector('input[name="colorTag"]:checked').value,
        horarios, dias: diasFinal,
        stock: parseInt(document.getElementById('stock').value) || 0,
        instruccion: document.getElementById('instruccion').value
    };

    if(editIndex > -1) misMedicamentos[editIndex] = medData; else misMedicamentos.push(medData);
    localStorage.setItem('vitalSync_meds', JSON.stringify(misMedicamentos));
    renderizarMedicamentos(); toggleModal('medModal', false);
    Swal.fire({ icon: 'success', title: 'Guardado', showConfirmButton: false, timer: 1500 });
});

function eliminarMedicamento(index) {
    Swal.fire({ title: "¿Eliminar?", icon: "warning", showCancelButton: true, confirmButtonColor: "#ef4444", confirmButtonText: "Sí" }).then((r) => {
        if(r.isConfirmed) {
            misMedicamentos.splice(index, 1);
            localStorage.setItem('vitalSync_meds', JSON.stringify(misMedicamentos));
            renderizarMedicamentos();
            Swal.fire("Eliminado", "", "success");
        }
    });
}

/* ==========================================
   6. BITÁCORA (HISTORIAL DE TOMAS)
   ========================================== */
function abrirHistorial() {
    renderizarHistorial();
    toggleModal('historyModal', true);
}

function renderizarHistorial() {
    const tbody = document.getElementById('historyTableBody');
    const emptyMsg = document.getElementById('emptyHistory');
    tbody.innerHTML = '';

    if (historialTomas.length === 0) {
        emptyMsg.classList.remove('hidden');
        return;
    }
    emptyMsg.classList.add('hidden');

    const ordenados = [...historialTomas].reverse();

    ordenados.forEach(log => {
        const tr = document.createElement('tr');
        
        // Estilos según el estado
        let colorEstado = 'bg-gray-100 text-gray-600';
        let iconEstado = '⏱️';
        
        if (log.estado === 'Tomada') {
            colorEstado = 'text-green-700 bg-green-50 border-green-200';
            iconEstado = '✅';
        } else if (log.estado === 'Olvidada') {
            colorEstado = 'text-red-700 bg-red-50 border-red-200';
            iconEstado = '❌';
        } else if (log.estado === 'Recuperada') {
            // ESTADO NUEVO: Distintivo para la segunda toma
            colorEstado = 'text-amber-700 bg-amber-50 border-amber-200';
            iconEstado = '⚠️✅';
        }
        
        tr.innerHTML = `
            <td class="p-3 whitespace-nowrap text-slate-600 text-xs">${log.fechaHora}</td>
            <td class="p-3 font-medium text-slate-800 text-sm">${log.nombre}</td>
            <td class="p-3 text-slate-500 text-xs">${log.dosis}</td>
            <td class="p-3 text-right">
                <span class="${colorEstado} px-2 py-1 rounded-full text-[10px] font-bold border border-current shadow-sm">${iconEstado} ${log.estado}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Función que devuelve los IDs de los logs creados para poder actualizarlos luego
function registrarToma(listaMeds, estado) {
    const now = new Date();
    const fechaHora = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    const idsGenerados = [];

    listaMeds.forEach(med => {
        const idUnico = Date.now() + Math.random();
        historialTomas.push({
            idLog: idUnico, 
            medId: med.id, 
            nombre: med.nombre,
            dosis: med.dosis,
            fechaHora: fechaHora,
            estado: estado 
        });
        idsGenerados.push(idUnico);
    });
    
    localStorage.setItem('vitalSync_meds_history', JSON.stringify(historialTomas));
    if (!document.getElementById('historyModal').classList.contains('hidden')) renderizarHistorial();
    
    return idsGenerados; // Importante: Retornar los IDs
}

// Función para actualizar registros existentes en vez de crear nuevos
function actualizarEstadoHistorial(idsLogs, nuevoEstado) {
    let huboCambios = false;
    
    historialTomas = historialTomas.map(log => {
        if (idsLogs.includes(log.idLog)) {
            huboCambios = true;
            return { ...log, estado: nuevoEstado };
        }
        return log;
    });

    if (huboCambios) {
        localStorage.setItem('vitalSync_meds_history', JSON.stringify(historialTomas));
        if (!document.getElementById('historyModal').classList.contains('hidden')) renderizarHistorial();
    }
}

function borrarHistorial() {
    Swal.fire({
        title: '¿Borrar historial?',
        text: 'Se perderá el registro de cumplimiento.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sí, borrar'
    }).then((result) => {
        if (result.isConfirmed) {
            historialTomas = [];
            localStorage.removeItem('vitalSync_meds_history');
            renderizarHistorial();
            Swal.fire('Borrado', '', 'success');
        }
    });
}

/* ==========================================
   7. ALARMAS Y SEGURIDAD
   ========================================== */
function verificarAlarmas() {
    if (isAlarmRinging) return;

    const now = new Date();
    const key = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}_${now.getDate()}`;
    const day = now.getDay();

    if(alarmasMostradasHoy.has(key)) return;

    const medsParaAhora = misMedicamentos.filter(m => {
        const diasOk = m.dias || [0,1,2,3,4,5,6];
        return m.horarios.includes(key.split('_')[0]) && diasOk.includes(day);
    });

    if(medsParaAhora.length > 0) {
        alarmasMostradasHoy.add(key);
        dispararAlarmaGrupal(medsParaAhora, false); // false = es toma normal, no reintento
        if(alarmasMostradasHoy.size > 50) alarmasMostradasHoy.clear();
    }
}

// Parametro 'esReintento' para saber si marcar como "Recuperada"
// Parametro 'esReintento' para saber si marcar como "Recuperada"
function dispararAlarmaGrupal(listaMeds, esReintento = false) {
    isAlarmRinging = true; 
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg');
    audio.volume = 1.0; audio.loop = true; 
    const p = audio.play(); if(p !== undefined) p.catch(()=>{});

    // --- HTML OPTIMIZADO PARA MÓVIL ---
    let listaHTML = `<div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1 mt-4 text-left custom-scrollbar">`;
    
    listaMeds.forEach(m => {
        const instr = iconMap[m.instruccion || 'indistinto'];
        listaHTML += `
            <div class="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div class="${m.tagColor} w-8 h-8 rounded-full shrink-0 mt-1 shadow-sm border border-white"></div>
                
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-slate-800 text-sm truncate">${m.nombre}</p>
                    
                    <div class="flex flex-wrap items-center gap-2 mt-1">
                        <span class="text-xs text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 whitespace-nowrap">
                            ${m.dosis}
                        </span>
                        <div class="bg-white px-2 py-0.5 rounded border text-[10px] flex items-center gap-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                            ${instr}
                        </div>
                    </div>
                </div>
            </div>`;
    });
    listaHTML += `</div>`;

    const tituloAlerta = esReintento ? "⚠️ ¡Recuerda tus medicinas!" : "⏰ ¡Hora de medicinas!";
    const textoBoton = esReintento ? "✅ Listo, recuperadas" : "✅ Listo, tomadas";

    Swal.fire({
        title: `<span class="text-xl md:text-2xl">${tituloAlerta}</span>`,
        html: `<p class="text-sm md:text-base text-gray-600">Tienes <strong>${listaMeds.length}</strong> toma(s) pendiente(s):</p> ${listaHTML}`,
        confirmButtonText: textoBoton,
        confirmButtonColor: "#4338ca",
        allowOutsideClick: false,
        // --- AQUÍ ESTÁ LA MAGIA RESPONSIVA ---
        customClass: {
            popup: 'rounded-2xl w-[90%] md:w-full max-w-md p-4 md:p-6', // 90% ancho en móvil
            confirmButton: 'w-full rounded-xl py-3 text-lg font-bold shadow-lg' // Botón grande fácil de tocar
        }
        // Eliminamos width fijo y padding hardcoded
    }).then((result) => {
        if (result.isConfirmed) {
            audio.pause(); audio.currentTime = 0;
            isAlarmRinging = false;
            
            // 1. Descontar Stock
            listaMeds.forEach(m => {
                const idxReal = misMedicamentos.findIndex(x => x.id === m.id);
                if(idxReal !== -1 && misMedicamentos[idxReal].stock > 0) {
                    misMedicamentos[idxReal].stock--;
                }
            });
            localStorage.setItem('vitalSync_meds', JSON.stringify(misMedicamentos));
            renderizarMedicamentos();

            // 2. Registrar en Bitácora
            const estadoInicial = esReintento ? 'Recuperada' : 'Tomada';
            const idsLogs = registrarToma(listaMeds, estadoInicial);

            // 3. Programar Seguridad
            programarVerificacion(listaMeds, idsLogs, 300000); // 5 min
        }
    });
}

function programarVerificacion(listaMeds, idsLogs, tiempoEspera) {
    setTimeout(() => {
        if (isAlarmRinging || Swal.isVisible()) {
            console.log("Pantalla ocupada. Posponiendo recordatorio 1 min.");
            programarVerificacion(listaMeds, idsLogs, 60000);
            return;
        }

        // Crear lista de nombres para el texto
        const nombresMeds = listaMeds.map(m => m.nombre).join(', ');

        Swal.fire({
            title: '🛡️ Confirmación',
            text: `Hace 5 min confirmaste: ${nombresMeds}. ¿Seguro que ya las tomaste?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, correcto',
            cancelButtonText: '¡No! Olvidé',
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#ef4444',
            timer: 30000, 
            timerProgressBar: true,
            // --- ESTILO RESPONSIVO ---
            customClass: {
                popup: 'rounded-2xl w-[90%] max-w-sm p-4',
                title: 'text-xl font-bold',
                htmlContainer: 'text-sm text-gray-600',
                actions: 'flex-col-reverse gap-2 w-full', // Botones en columna en móvil
                confirmButton: 'w-full rounded-xl py-2',
                cancelButton: 'w-full rounded-xl py-2'
            }
        }).then((result) => {
            if (result.dismiss === Swal.DismissReason.cancel) {
                // 1. Restaurar Stock
                listaMeds.forEach(m => {
                    const idx = misMedicamentos.findIndex(x => x.id === m.id);
                    if(idx !== -1) misMedicamentos[idx].stock++;
                });
                localStorage.setItem('vitalSync_meds', JSON.stringify(misMedicamentos));
                renderizarMedicamentos();

                // 2. ACTUALIZAR Bitácora
                actualizarEstadoHistorial(idsLogs, 'Olvidada');

                // 3. Volver a sonar alarma
                dispararAlarmaGrupal(listaMeds, true); 
            }
        });
    }, tiempoEspera);
}