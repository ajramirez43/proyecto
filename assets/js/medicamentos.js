import { auth, db, doc, getDoc, addDoc, updateDoc, deleteDoc, collection, query, where, getDocs, onAuthStateChanged, signOut } from './firebase.js';

/* ==========================================
   1. CONFIGURACIÓN Y ESTADO GLOBAL (SOLO UI)
   ========================================== */
let userProfile = { nombre: "", email: "", esHipertenso: false, esDiabetico: false, cuidadores: [] };

const catalogoMedicamentos = {
    hipertension: ["Losartán", "Captopril", "Enalapril", "Telmisartán", "Amlodipino"],
    diabetes: ["Metformina", "Glibenclamida", "Insulina", "Sitagliptina"],
    comunes: ["Aspirina", "Paracetamol", "Omeprazol", "Atorvastatina", "Complejo B"]
};

// Variables de Estado
let currentUserUID = null;
let misMedicamentos = [];
let historialTomas = [];
let editId = null;

const iconMap = {
    'comida': '<i data-lucide="utensils" class="w-4 h-4 text-orange-500"></i> <span class="text-xs text-orange-600 font-bold">Con comida</span>',
    'ayunas': '<i data-lucide="sunrise" class="w-4 h-4 text-yellow-500"></i> <span class="text-xs text-yellow-600 font-bold">Ayunas</span>',
    'noche': '<i data-lucide="moon" class="w-4 h-4 text-indigo-500"></i> <span class="text-xs text-indigo-600 font-bold">Noche</span>',
    'indistinto': '<i data-lucide="sun" class="w-4 h-4 text-gray-400"></i> <span class="text-xs text-gray-500">Indistinto</span>'
};

// Configuracion de EmailJS (DEBE SER LA MISMA QUE EN OTROS SCRIPTS)
const EMAILJS_SERVICE_ID = 'service_n5s015a'; // ID de tu servicio
const EMAILJS_TEMPLATE_ID_STOCK = 'template_pjffnxi'; // ID de la plantilla de stock
const EMAILJS_PUBLIC_KEY = 'ZaH_8Sqag-sT0cbUT'; // Tu clave pública
const UMBRAL_STOCK_BAJO = 5;

if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}


/* ==========================================
   2. INICIALIZACIÓN
   ========================================== */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUID = user.uid;
        
        // 1. Cargar datos necesarios
        await cargarPerfilUsuario(user.uid);
        await cargarMedicamentosFirebase(user.uid);
        await cargarHistorialTomas(user.uid);
        
        // La verificación de stock ahora es manual (no se llama aquí)
        
        // 4. Inicializar UI
        lucide.createIcons();
        cargarOpcionesSelect();
    } else {
        window.location.href = 'index.html';
    }
});

/* ==========================================
   3. CARGA DE DATOS DESDE FIREBASE
   ========================================== */
async function cargarPerfilUsuario(uid) {
    try {
        const docSnap = await getDoc(doc(db, "usuarios", uid));
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Cargar también detalles de cuidadores confirmados
            const cuidadoresConfirmados = [];
            const detalles = data.cuidadoresDetalles || {};
            for(const key in detalles) {
                if (detalles[key].email && detalles[key].name) {
                    cuidadoresConfirmados.push({ email: detalles[key].email, nombre: detalles[key].name });
                }
            }

            userProfile = { 
                nombre: data.fullName, 
                email: data.email || auth.currentUser.email,
                esHipertenso: data.esHipertenso || false, 
                esDiabetico: data.esDiabetico || false,
                cuidadores: cuidadoresConfirmados,
                // Ya no necesitamos 'lastStockAlerts'
            };
        }
    } catch (e) { console.error("Error perfil:", e); }
}

async function cargarMedicamentosFirebase(uid) {
    try {
        const q = query(collection(db, "medicamentos"), where("uid", "==", uid));
        const snapshot = await getDocs(q);
        misMedicamentos = [];
        snapshot.forEach(doc => {
            misMedicamentos.push({ id: doc.id, ...doc.data() });
        });
        renderizarMedicamentos();
    } catch (e) { console.error("Error meds:", e); }
}

async function cargarHistorialTomas(uid) {
    try {
        const q = query(collection(db, "historial_tomas"), where("uid", "==", uid));
        const snapshot = await getDocs(q);
        historialTomas = [];
        snapshot.forEach(doc => {
            historialTomas.push({ id: doc.id, ...doc.data() });
        });
        historialTomas.sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
    } catch (e) { console.error("Error historial:", e); }
}

/* ==========================================
   4. RENDERIZADO UI (TARJETAS)
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

    misMedicamentos.forEach((med) => {
        med.horarios.sort();
        const siguienteToma = calcularSiguienteToma(med);
        const tagColorClass = med.tagColor || 'bg-gray-100';
        const diasTexto = (!med.dias || med.dias.length === 7) ? "Todos los días" : obtenerTextoDias(med.dias);
        const instruccionHtml = iconMap[med.instruccion || 'indistinto'];

        let stockHtml = '';
        const stockNum = parseInt(med.stock);
        if (stockNum === 0) stockHtml = `<span class="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold border border-red-700 shadow-sm whitespace-nowrap">🚫 AGOTADO</span>`;
        else if (stockNum <= UMBRAL_STOCK_BAJO) stockHtml = `<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold border border-red-200 animate-pulse whitespace-nowrap">¡Quedan ${stockNum}!</span>`;
        else stockHtml = `<span class="text-xs text-gray-400 font-medium whitespace-nowrap">Stock: ${stockNum}</span>`;

        const card = document.createElement('div');
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
                    <button onclick="window.editarMedicamento('${med.id}')" class="text-slate-300 hover:text-primary p-1.5 rounded hover:bg-slate-50"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button onclick="window.eliminarMedicamento('${med.id}')" class="text-slate-300 hover:text-red-500 p-1.5 rounded hover:bg-slate-50"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
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
                    ${med.horarios.map(h => `<span class="px-2 py-0.5 bg-white text-slate-500 text-[10px] rounded border border-slate-200 font-bold">${h}</span>`).join('')}
                </div>
            </div>
            ${med.tagTexto ? `<div class="mt-1 text-xs text-gray-400 italic border-t pt-2 truncate">Nota: ${med.tagTexto}</div>` : ''}
        `;
        contenedor.appendChild(card);
    });
    if(window.lucide) window.lucide.createIcons();
}

/* ==========================================
   5. AUXILIARES DE LÓGICA
   ========================================== */
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

// ==========================================
// 8. LÓGICA DE ALERTA DE STOCK MANUAL (NUEVO)
// ==========================================

function obtenerAlertasStock() {
    const alertas = [];
    misMedicamentos.forEach(med => {
        const stock = parseInt(med.stock);
        if (stock === 0) {
            alertas.push({ nombre: med.nombre, stock: 0, tipo: 'AGOTADO', mensaje: 'Se ha terminado completamente.' });
        } else if (stock <= UMBRAL_STOCK_BAJO) {
            alertas.push({ nombre: med.nombre, stock: stock, tipo: 'BAJO', mensaje: `Quedan solo ${stock} unidades.` });
        }
    });
    return alertas;
}

function generarTablaAlertasHTML(alertas) {
    let rowsHTML = alertas.map(a => {
        const color = a.tipo === 'AGOTADO' ? '#ef4444' : '#f59e0b'; // Rojo o Amarillo
        const bgColor = a.tipo === 'AGOTADO' ? '#fee2e2' : '#fffbe5'; // Fondo claro
        const icono = a.tipo === 'AGOTADO' ? '🚫' : '⚠️';

        return `
            <tr style="background-color: ${bgColor}; border-bottom: 1px solid #ddd;">
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #333;">${a.nombre}</td>
                <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: ${color};">${a.stock}</td>
                <td style="padding: 10px; border: 1px solid #ddd; color: ${color};">${icono} ${a.mensaje}</td>
            </tr>
        `;
    }).join('');

    return `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-family: Arial, sans-serif; font-size: 14px; border: 1px solid #ddd;">
            <thead>
                <tr>
                    <th style="padding: 12px; background-color: #fca5a5; color: #991b1b; font-weight: bold; text-align: left;">Medicamento</th>
                    <th style="padding: 12px; background-color: #fca5a5; color: #991b1b; font-weight: bold; text-align: center;">Stock</th>
                    <th style="padding: 12px; background-color: #fca5a5; color: #991b1b; font-weight: bold; text-align: left;">Estado</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHTML}
            </tbody>
        </table>
    `;
}

window.abrirModalAlertaStock = function() {
    const alertas = obtenerAlertasStock();
    const alertSummaryDiv = document.getElementById('alertSummary');
    const cuidadoresContainer = document.getElementById('selectCuidadoresAlert');
    const btnEnviar = document.getElementById('btnEnviarAlertaStock');
    
    if (userProfile.cuidadores.length === 0) {
        Swal.fire('Advertencia', 'No tienes cuidadores confirmados para enviar alertas.', 'warning');
        return;
    }

    if (alertas.length === 0) {
        Swal.fire('Información', 'Todo el stock está por encima del umbral de alerta (5 unidades).', 'info');
        return;
    }

    // 1. Mostrar el resumen de las alertas
    let mensaje = 'Se detectaron los siguientes problemas de stock:';
    alertSummaryDiv.className = 'bg-amber-50 p-4 rounded-xl border border-amber-100 text-sm text-amber-800 flex flex-col gap-2';
    alertSummaryDiv.innerHTML = `<p class="font-bold flex items-center gap-2"><i data-lucide="bell" class="w-5 h-5 text-amber-600"></i> ${mensaje}</p> ${generarTablaAlertasHTML(alertas)}`;
    if(window.lucide) window.lucide.createIcons();


    // 2. Cargar las opciones de cuidadores
    let html = '';
    userProfile.cuidadores.forEach((c, index) => {
        html += `
            <div class="flex items-center p-2 rounded-lg bg-white border border-slate-200">
                <input type="checkbox" id="cuidadorAlert-${index}" value="${c.email}" data-name="${c.nombre}" class="text-red-600 focus:ring-red-600 rounded border-gray-300">
                <label for="cuidadorAlert-${index}" class="ml-3 text-sm font-medium text-slate-700 flex-1">${c.nombre} (${c.email})</label>
            </div>
        `;
    });
    cuidadoresContainer.innerHTML = html;

    // 3. Habilitar/deshabilitar el botón de envío
    cuidadoresContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const checked = Array.from(cuidadoresContainer.querySelectorAll('input[type="checkbox"]:checked'));
            btnEnviar.disabled = checked.length === 0;
        });
    });

    window.toggleModal('stockAlertModal', true);
    btnEnviar.disabled = true; 
}


window.enviarAlertaStockACuidadores = async function() {
    const btn = document.getElementById('btnEnviarAlertaStock');
    const cuidadoresContainer = document.getElementById('selectCuidadoresAlert');
    const checkedCheckboxes = Array.from(cuidadoresContainer.querySelectorAll('input[type="checkbox"]:checked'));
    
    if (checkedCheckboxes.length === 0) return;

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Enviando...';
    if (window.lucide) window.lucide.createIcons();
    
    window.toggleModal('stockAlertModal', false);

    try {
        const alertas = obtenerAlertasStock();
        const emailHTML = generarTablaAlertasHTML(alertas);
        const emailsEnviados = [];
        
        for (const cb of checkedCheckboxes) {
            const email = cb.value;
            const nombre = cb.dataset.name;

            const templateParams = {
                nombre_cuidador: nombre,
                nombre_paciente: userProfile.nombre,
                alerta_tabla_html: emailHTML, 
                email_paciente: userProfile.email,
                email_cuidador: email // Variable para el destinatario
            };

            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID_STOCK, templateParams);
            emailsEnviados.push(email);
        }

        Swal.fire({
            icon: 'success',
            title: 'Alerta Enviada',
            html: `La alerta de stock ha sido enviada a ${emailsEnviados.length} cuidador(es).`,
            confirmButtonColor: '#4338ca'
        });

    } catch (error) {
        console.error("Error general en el envío de alerta:", error);
        Swal.fire('Error', 'Ocurrió un error al enviar la alerta. Verifica la plantilla de EmailJS.', 'error');
    } finally {
        btn.innerHTML = originalText;
        if (window.lucide) window.lucide.createIcons();
        btn.disabled = false;
    }
}


/* ==========================================
   6. FORMULARIOS (ADD/EDIT/DELETE)
   ========================================== */
function cargarOpcionesSelect() {
    const select = document.getElementById('selectNombre');
    if(!select) return;
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

// FUNCIONES EXPUESTAS A WINDOW (Para que el HTML las vea)
window.verificarOtroNombre = (select) => { document.getElementById('inputOtroNombre').classList.toggle('hidden', select.value !== "OTRO"); if(select.value==="OTRO") document.getElementById('inputOtroNombre').focus(); }
window.verificarOtraDosis = (select) => { document.getElementById('inputOtraDosis').classList.toggle('hidden', select.value !== "OTRO"); if(select.value==="OTRO") document.getElementById('inputOtraDosis').focus(); }

window.agregarInputHorario = (valor = '') => {
    const div = document.createElement('div'); div.className = "flex gap-2 items-center mb-2";
    div.innerHTML = `<input type="time" value="${valor}" class="input-hora flex-1 border border-slate-300 rounded-xl p-2 text-center outline-none focus:border-primary bg-gray-50" required><button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 p-2 bg-red-50 rounded-lg transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>`;
    document.getElementById('contenedorHorarios').appendChild(div);
    if(window.lucide) window.lucide.createIcons();
}

window.abrirModalMedicamento = () => {
    editId = null; 
    document.getElementById('modalTitle').innerText = "Nuevo Tratamiento";
    document.getElementById('medForm').reset();
    document.getElementById('contenedorHorarios').innerHTML = '';
    document.getElementById('inputOtroNombre').classList.add('hidden');
    document.getElementById('inputOtraDosis').classList.add('hidden');
    document.querySelectorAll('input[name="diasSemana"]').forEach(chk => chk.checked = true);
    window.agregarInputHorario(); 
    window.toggleModal('medModal', true);
}

window.editarMedicamento = (id) => {
    editId = id; 
    const med = misMedicamentos.find(m => m.id === id);
    if(!med) return;

    document.getElementById('modalTitle').innerText = "Editar Tratamiento";
    document.getElementById('tagTexto').value = med.tagTexto;
    document.getElementById('stock').value = med.stock !== undefined ? med.stock : '';
    document.getElementById('instruccion').value = med.instruccion || 'indistinto';

    // Selects inteligentes
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
    med.horarios.forEach(h => window.agregarInputHorario(h));
    window.toggleModal('medModal', true);
}

window.toggleModal = (id, show) => { const m = document.getElementById(id); show ? m.classList.remove('hidden') : m.classList.add('hidden'); }

// GUARDAR (ADD/UPDATE)
document.getElementById('medForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!currentUserUID) return;

    let nombre = document.getElementById('selectNombre').value; if(nombre==="OTRO") nombre=document.getElementById('inputOtroNombre').value;
    let dosis = document.getElementById('selectDosis').value; if(dosis==="OTRO") dosis=document.getElementById('inputOtraDosis').value;
    if(!nombre || !dosis) return Swal.fire("Error", "Faltan datos", "warning");

    const horarios = Array.from(document.querySelectorAll('.input-hora')).map(i => i.value).filter(v => v !== "");
    if(!horarios.length) return Swal.fire("Error", "Falta horario", "warning");

    const dias = Array.from(document.querySelectorAll('input[name="diasSemana"]:checked')).map(c => parseInt(c.value));
    const diasFinal = dias.length > 0 ? dias : [0,1,2,3,4,5,6];

    const medData = {
        uid: currentUserUID,
        nombre, dosis, 
        tagTexto: document.getElementById('tagTexto').value, 
        tagColor: document.querySelector('input[name="colorTag"]:checked').value,
        horarios, dias: diasFinal,
        stock: parseInt(document.getElementById('stock').value) || 0,
        instruccion: document.getElementById('instruccion').value
    };

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerText = "Guardando...";

    try {
        if(editId) {
            await updateDoc(doc(db, "medicamentos", editId), medData);
        } else {
            await addDoc(collection(db, "medicamentos"), medData);
        }
        await cargarMedicamentosFirebase(currentUserUID);
        
        window.toggleModal('medModal', false);
        Swal.fire({ icon: 'success', title: 'Guardado', showConfirmButton: false, timer: 1500 });
    } catch(err) {
        console.error(err);
        Swal.fire("Error", "No se pudo guardar", "error");
    } finally {
        btn.disabled = false; btn.innerText = "Guardar Tratamiento";
    }
});

// BORRAR MEDICAMENTO
window.eliminarMedicamento = (id) => {
    Swal.fire({ title: "¿Eliminar?", icon: "warning", showCancelButton: true, confirmButtonColor: "#ef4444", confirmButtonText: "Sí" }).then(async (r) => {
        if(r.isConfirmed) {
            try {
                await deleteDoc(doc(db, "medicamentos", id));
                await cargarMedicamentosFirebase(currentUserUID);
                Swal.fire("Eliminado", "", "success");
            } catch(e) { Swal.fire("Error", "No se pudo eliminar", "error"); }
        }
    });
}

/* ==========================================
   7. BITÁCORA / HISTORIAL (VISUALIZACIÓN Y BORRADO)
   ========================================== */
window.abrirHistorial = () => {
    renderizarHistorial();
    window.toggleModal('historyModal', true);
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
        let colorEstado = 'bg-gray-100 text-gray-600';
        let iconEstado = '⏱️';
        if (log.estado === 'Tomada') { colorEstado = 'text-green-700 bg-green-50 border-green-200'; iconEstado = '✅'; } 
        else if (log.estado === 'Olvidada') { colorEstado = 'text-red-700 bg-red-50 border-red-200'; iconEstado = '❌'; }
        else if (log.estado === 'Recuperada') { colorEstado = 'text-amber-700 bg-amber-50 border-amber-200'; iconEstado = '⚠️✅'; }
        
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

window.borrarHistorial = () => {
    Swal.fire({
        title: '¿Borrar todo?',
        text: 'Se eliminará todo el historial de tomas.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sí, borrar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const promises = historialTomas.map(log => deleteDoc(doc(db, "historial_tomas", log.id)));
            await Promise.all(promises);
            await cargarHistorialTomas(currentUserUID);
            renderizarHistorial();
            Swal.fire('Borrado', '', 'success');
        }
    });
}

window.cerrarSesion = async () => {
    await signOut(auth);
    window.location.href = 'index.html';
};