import { auth, db, doc, updateDoc, addDoc, collection, query, where, getDocs, onAuthStateChanged } from './firebase.js';

// === ESTADO GLOBAL ===
let misMedicamentosGlobal = [];
let alarmasMostradasHoy = new Set();
let isAlarmRinging = false;
let audioAlarma = new Audio("https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg");
audioAlarma.loop = true;

// Variables para el parpadeo del título
let titleInterval = null;
let originalTitle = document.title;

// === PERSISTENCIA ===
let alarmasPersistentes = JSON.parse(localStorage.getItem('vitalSync_alarmas_log')) || { dia: new Date().getDate(), horas: [] };
if (alarmasPersistentes.dia !== new Date().getDate()) {
    alarmasPersistentes = { dia: new Date().getDate(), horas: [] };
    localStorage.setItem('vitalSync_alarmas_log', JSON.stringify(alarmasPersistentes));
}
alarmasMostradasHoy = new Set(alarmasPersistentes.horas);

// === INICIO DE VIGILANCIA ===
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. Pedir permiso para Notificaciones (NUEVO)
        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        await cargarMedsParaAlarmas(user.uid);
        
        // El intervalo sigue corriendo aunque estés en otra pestaña
        // (Aunque el navegador lo haga más lento, al volver a revisar la hora detectará que ya pasó)
        setInterval(verificarAlarmasGlobal, 3000);
        
        document.body.addEventListener('click', desbloquearAudio, { once: true });
    }
});

function desbloquearAudio() {
    audioAlarma.volume = 0; 
    audioAlarma.play().then(() => { audioAlarma.pause(); audioAlarma.currentTime = 0; audioAlarma.volume = 1; }).catch(() => {});
}

async function cargarMedsParaAlarmas(uid) {
    try {
        const q = query(collection(db, "medicamentos"), where("uid", "==", uid));
        const snapshot = await getDocs(q);
        misMedicamentosGlobal = [];
        snapshot.forEach(doc => {
            misMedicamentosGlobal.push({ id: doc.id, ...doc.data() });
        });
        console.log("🔔 Sistema de Alarmas Global: Activo");
    } catch (e) { console.error("Error cargando alarmas:", e); }
}

// === LÓGICA DEL RELOJ ===
function verificarAlarmasGlobal() {
    if (isAlarmRinging) return;

    const now = new Date();
    const key = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}_${now.getDate()}`;
    const day = now.getDay();

    if(alarmasMostradasHoy.has(key)) return;

    const medsParaAhora = misMedicamentosGlobal.filter(m => {
        const diasOk = m.dias || [0,1,2,3,4,5,6];
        return m.horarios.some(h => h === key.split('_')[0]) && diasOk.includes(day);
    });

    if(medsParaAhora.length > 0) {
        marcarAlarmaComoSonada(key);
        
        // DETONAR TODO
        dispararAlarmaGlobal(medsParaAhora); // SweetAlert y Audio
        lanzarNotificacionSistema(medsParaAhora); // Burbuja de Windows/Android
        iniciarParpadeoTitulo(); // Pestaña loca
    }
}

function marcarAlarmaComoSonada(key) {
    alarmasMostradasHoy.add(key);
    const estado = { dia: new Date().getDate(), horas: Array.from(alarmasMostradasHoy) };
    localStorage.setItem('vitalSync_alarmas_log', JSON.stringify(estado));
}

// === NUEVO: NOTIFICACIÓN NATIVA (BURBUJA) ===
function lanzarNotificacionSistema(listaMeds) {
    // Si el usuario no está viendo la pestaña, le mandamos la burbuja
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        const nombres = listaMeds.map(m => m.nombre).join(', ');
        
        const notif = new Notification("💊 ¡Hora de Medicamentos!", {
            body: `Tienes pendiente tomar: ${nombres}`,
            icon: "https://cdn-icons-png.flaticon.com/512/822/822143.png", // Icono genérico de pastilla
            requireInteraction: true // La burbuja no se quita sola hasta que la toquen
        });

        // Si le dan clic a la burbuja, intentamos enfocar la ventana
        notif.onclick = function() {
            window.focus();
            notif.close();
        };
    }
}

// === NUEVO: PARPADEO DE TÍTULO ===
function iniciarParpadeoTitulo() {
    if(titleInterval) return;
    let switchTitle = true;
    titleInterval = setInterval(() => {
        document.title = switchTitle ? "🔴 ¡MEDICINAS! 🔴" : "🔔 Alerta VitalSync";
        switchTitle = !switchTitle;
    }, 1000);
}

function detenerParpadeoTitulo() {
    clearInterval(titleInterval);
    titleInterval = null;
    document.title = "VitalSync - Panel"; // O el título original si prefieres guardarlo
}

// === INTERFAZ DE ALARMA ===
function dispararAlarmaGlobal(listaMeds) {
    isAlarmRinging = true; 
    audioAlarma.volume = 1.0; 
    audioAlarma.play().catch(e => console.log("Audio bloqueado (interacción requerida)", e));

    let listaHTML = `<div style="text-align:left; background:#f8fafc; padding:10px; border-radius:10px;">`;
    listaMeds.forEach(m => {
        listaHTML += `
        <div style="margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:5px;">
            💊 <b>${m.nombre}</b> <span style="color:#64748b; font-size:0.9em">(${m.dosis})</span><br>
            <small style="color:#f59e0b;">${m.instruccion || 'Indistinto'}</small>
        </div>`;
    });
    listaHTML += `</div>`;

    Swal.fire({
        title: '⏰ ¡Es hora de tus medicinas!',
        html: listaHTML,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '✅ Listo, ya las tomé',
        cancelButtonText: '5 min más 💤',
        confirmButtonColor: "#4338ca",
        cancelButtonColor: "#64748b",
        allowOutsideClick: false,
        allowEscapeKey: false
    }).then(async (result) => {
        
        // AL CERRAR, DETENEMOS TODO EL RUIDO
        audioAlarma.pause(); 
        audioAlarma.currentTime = 0;
        isAlarmRinging = false;
        detenerParpadeoTitulo(); // <--- Detenemos el parpadeo

        if (result.isConfirmed) {
            Swal.fire({title: 'Procesando...', didOpen:()=>Swal.showLoading()});
            
            const nowISO = new Date().toISOString();
            const fechaLegible = new Date().toLocaleString();

            for(const m of listaMeds) {
                if(m.stock > 0) await updateDoc(doc(db, "medicamentos", m.id), { stock: m.stock - 1 });
                
                await addDoc(collection(db, "historial_tomas"), {
                    uid: auth.currentUser.uid,
                    medId: m.id,
                    nombre: m.nombre,
                    dosis: m.dosis,
                    fechaHora: fechaLegible,
                    fechaISO: nowISO,
                    estado: 'Tomada'
                });
            }
            await cargarMedsParaAlarmas(auth.currentUser.uid);
            Swal.fire("¡Excelente!", "Registrado correctamente.", "success");
            
            if(window.location.href.includes('medicamentos.html')) {
                setTimeout(() => window.location.reload(), 1000);
            }

        } else {
            Swal.fire("Posponiendo", "Te recordaré en 5 minutos.", "info");
            setTimeout(() => {
                dispararAlarmaGlobal(listaMeds);
                lanzarNotificacionSistema(listaMeds);
                iniciarParpadeoTitulo();
            }, 300000); 
        }
    });
}