import { auth, db, doc, getDoc, addDoc, deleteDoc, collection, query, where, orderBy, getDocs, onAuthStateChanged, signOut } from './firebase.js';

/* ==========================================
   1. CONFIGURACIÓN Y DATOS
   ========================================== */
let historialSintomas = [];
let datosFiltrados = [];
let myChart = null;
let currentUserUID = null;
// Perfil y cuidadores
let userProfile = { nombre: "", email: "", cuidadores: [] }; 

const sintomasPosibles = ["Dolor de Cabeza", "Mareo", "Fatiga", "Dolor Articular", "Náuseas", "Falta de Aire", "Inflamación", "Ardor de ojos", "Ansiedad", "Insomnio"];
const intensidades = ["Leve", "Moderado", "Intenso"];

// CONFIGURACIÓN DE CORREOS
const EMAILJS_SERVICE_ID = 'service_n5s015a'; 
const EMAILJS_TEMPLATE_ID_SYMPTOM = 'template_cnzmfqs'; // (Usaremos 'ALERTA_EMERGENCIA' en el envío)
const EMAILJS_PUBLIC_KEY = 'ZaH_8Sqag-sT0cbUT'; 

// Inicializar EmailJS si la librería está disponible
if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}


/* ==========================================
   2. INICIALIZACIÓN
   ========================================== */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUID = user.uid;
        await cargarPerfilUsuario(user.uid); 
        lucide.createIcons();
        configurarFechasIniciales();
        await cargarSintomasFirebase(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

// Cargar perfil y cuidadores
async function cargarPerfilUsuario(uid) {
    try {
        const docSnap = await getDoc(doc(db, "usuarios", uid));
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Cargar cuidadores confirmados
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
                cuidadores: cuidadoresConfirmados,
            };
        }
    } catch (e) { console.error("Error perfil:", e); }
}

function configurarFechasIniciales() {
    const today = new Date();
    const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const horaActual = `${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`;

    const inputReg = document.getElementById('fechaRegistro');
    const inputHora = document.getElementById('horaRegistro');
    if(inputReg) { inputReg.max = localToday; inputReg.value = localToday; }
    if(inputHora) { inputHora.value = horaActual; }

    const fInicio = document.getElementById('filtroInicio');
    const fFin = document.getElementById('filtroFin');
    
    if(fInicio && fFin) {
        const primerDiaMes = new Date(today.getFullYear(), today.getMonth(), 1);
        const primerDiaStr = new Date(primerDiaMes.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        fInicio.value = primerDiaStr;
        fFin.value = localToday;
        
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
}

/* ==========================================
   3. CARGA DE DATOS (FIREBASE)
   ========================================== */
async function cargarSintomasFirebase(uid) {
    try {
        // CORRECCIÓN: Usamos 'timestamp' para ordenar (más reciente al inicio)
        const q = query(collection(db, "sintomas"), where("uid", "==", uid), orderBy("timestamp", "desc")); 
        const snapshot = await getDocs(q);
        historialSintomas = [];
        snapshot.forEach(doc => {
            historialSintomas.push({ id: doc.id, ...doc.data() });
        });
        aplicarFiltros();
    } catch (e) {
        console.error("Error cargando síntomas:", e);
    }
}

/* ==========================================
   4. LÓGICA DE FILTRADO
   ========================================== */
window.aplicarFiltros = aplicarFiltros; 

function aplicarFiltros() {
    const inicioVal = document.getElementById('filtroInicio').value;
    const finVal = document.getElementById('filtroFin').value;

    if (!inicioVal || !finVal) return;

    const dInicio = new Date(inicioVal + "T00:00:00");
    const dFin = new Date(finVal + "T23:59:59");

    datosFiltrados = historialSintomas.filter(reg => {
        const dReg = new Date(reg.fecha + "T12:00:00"); 
        return dReg >= dInicio && dReg <= dFin;
    });

    datosFiltrados.sort((a, b) => {
        const dA = new Date(a.fecha + 'T' + (a.hora || '00:00'));
        const dB = new Date(b.fecha + 'T' + (b.hora || '00:00'));
        return dB - dA;
    });

    const countEl = document.getElementById('totalCount');
    if(countEl) countEl.innerText = datosFiltrados.length;
    
    renderizarGrafico();
    renderizarLista();
}

/* ==========================================
   5. RENDERIZADO GRÁFICO Y LISTA
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

    const backgroundColors = sortedData.map(val => {
        if (val >= 10) return 'rgba(147, 51, 234, 0.85)'; 
        if (val >= 7)  return 'rgba(239, 68, 68, 0.85)';  
        if (val >= 5)  return 'rgba(249, 115, 22, 0.85)'; 
        if (val >= 3)  return 'rgba(234, 179, 8, 0.85)';  
        return 'rgba(16, 185, 129, 0.85)';               
    });

    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'bar', 
        data: {
            labels: sortedKeys,
            datasets: [{
                label: 'Ocurrencias',
                data: sortedData,
                backgroundColor: backgroundColors,
                borderWidth: 0,
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
        li.className = "bg-white border border-slate-100 p-4 rounded-xl shadow-sm hover:shadow-md transition-all relative";
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
            <button onclick="window.eliminarSintoma('${reg.id}')" class="absolute top-2 right-2 p-1 text-red-400 hover:text-red-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        `;
        list.appendChild(li);
    });
    lucide.createIcons();
}

// Función para eliminar síntoma (Expuesta al window)
window.eliminarSintoma = async (id) => {
    Swal.fire({
        title: '¿Eliminar registro?',
        text: "Este síntoma será eliminado permanentemente.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, "sintomas", id)); 
                await cargarSintomasFirebase(currentUserUID); 
                Swal.fire('Eliminado', 'Registro eliminado correctamente.', 'success');
            } catch (error) {
                console.error("Error eliminando síntoma:", error);
                Swal.fire('Error', 'No se pudo eliminar el registro.', 'error');
            }
        }
    });
};


/* ==========================================
   6. GUARDAR SÍNTOMA (MODIFICADO)
   ========================================== */
window.toggleOtroInput = (checkbox) => {
    const input = document.getElementById('inputOtroSintoma');
    if (checkbox.checked) { input.classList.remove('hidden'); input.focus(); } 
    else { input.classList.add('hidden'); input.value = ''; }
}

const formSintomas = document.getElementById('symptomForm');
if(formSintomas) {
    formSintomas.addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!currentUserUID) return;
        
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
            Swal.fire({icon: "warning", title: "Faltan datos", text: "Selecciona al menos un síntoma"});
            return;
        }

        const btn = formSintomas.querySelector('button[type="submit"]');
        btn.disabled = true; btn.innerText = "Guardando...";

        try {
            // Se usa timestamp ISO para garantizar el ordenamiento correcto en la alerta
            await addDoc(collection(db, "sintomas"), {
                uid: currentUserUID,
                fecha, hora, sintomas, intensidad, notas,
                timestamp: new Date().toISOString() 
            });

            await cargarSintomasFirebase(currentUserUID);
            
            e.target.reset();
            
            // Reset inputs
            const today = new Date();
            const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            const horaActual = `${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`;
            document.getElementById('fechaRegistro').value = localToday;
            document.getElementById('horaRegistro').value = horaActual;
            document.getElementById('inputOtroSintoma').classList.add('hidden');
            document.querySelector('input[name="intensidad"][value="Leve"]').checked = true; // Reset intensidad
            
            Swal.fire({ icon: 'success', title: 'Registrado', showConfirmButton: false, timer: 1500 });

        } catch (error) {
            console.error(error);
            Swal.fire("Error", "No se pudo guardar", "error");
        } finally {
            btn.disabled = false; btn.innerText = "Guardar";
        }
    });
}


/* ==========================================
   7. LÓGICA DE ALERTA DE EMERGENCIA (NUEVO)
   ========================================== */

// Función expuesta al HTML para abrir el modal de confirmación
window.abrirModalAlertaSintomas = function() {
    // NOTA: Se mantiene este nombre de función para el botón en el HTML.

    if (userProfile.cuidadores.length === 0) {
        Swal.fire('Error', 'No tienes cuidadores confirmados para enviar una alerta de emergencia.', 'error');
        return;
    }
    
    // Función toggleModal asumida globalmente
    const toggleModal = (id, show) => { 
        const m = document.getElementById(id); 
        if(m) show ? m.classList.remove('hidden') : m.classList.add('hidden'); 
    };

    document.getElementById('totalCuidadoresText').innerText = `${userProfile.cuidadores.length} cuidadores`;
    document.getElementById('mensajeEmergencia').value = ''; // Limpiar mensaje
    toggleModal('symptomAlertModal', true);
}


// Función expuesta al HTML para enviar la alerta masiva
window.enviarAlertaEmergencia = async function() {
    const btn = document.getElementById('btnEnviarEmergencia');
    const mensaje = document.getElementById('mensajeEmergencia').value.trim() || 'El paciente necesita ser contactado urgentemente.';
    
    if (userProfile.cuidadores.length === 0) return;

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Enviando...';
    if (window.lucide) window.lucide.createIcons();
    
    // Función toggleModal asumida globalmente
    const toggleModal = (id, show) => { 
        const m = document.getElementById(id); 
        if(m) show ? m.classList.remove('hidden') : m.classList.add('hidden'); 
    };
    toggleModal('symptomAlertModal', false);
    
    const emailsEnviados = [];

    try {
        for (const cuidador of userProfile.cuidadores) {
            const templateParams = {
                nombre_cuidador: cuidador.nombre,
                nombre_paciente: userProfile.nombre,
                mensaje_personalizado: mensaje, // Mensaje del paciente o default
                
                // Variables para el Asunto y Destinatario
                email_cuidador: cuidador.email
            };

            // NOTA: Se usa la plantilla 'ALERTA_EMERGENCIA'
            await emailjs.send(EMAILJS_SERVICE_ID, 'template_cnzmfqs', templateParams); 
            emailsEnviados.push(cuidador.email);
        }

        Swal.fire({
            icon: 'success',
            title: 'Alerta de Emergencia Enviada',
            html: `La solicitud de apoyo ha sido enviada a ${emailsEnviados.length} cuidador(es).`,
            confirmButtonColor: '#ef4444'
        });

    } catch (error) {
        console.error("Error general en el envío de alerta de emergencia:", error);
        Swal.fire('Error', 'Ocurrió un error al enviar la alerta. Verifica la plantilla de EmailJS ("ALERTA_EMERGENCIA").', 'error');
    } finally {
        btn.innerHTML = originalText;
        if (window.lucide) window.lucide.createIcons();
        btn.disabled = false;
    }
}


window.cerrarSesion = async () => {
    await signOut(auth);
    window.location.href = 'index.html';
};