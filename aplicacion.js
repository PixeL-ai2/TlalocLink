
const estadoConfiguracion = {
  idCanalThingSpeak: "2841092",
  claveLecturaThingSpeak: "TLALOC_DEMO_KEY",
  simulacionActiva: true,
  frecuenciaMuestreoMs: 2000,
  muestrasVisibles: 30,
  maximoHistorial: 80,
  umbralDeteccion: 0.50,
  fugaForzada: false,
  contadorEntradas: 1,
  totalRegistrosConsola: 0
};

// Variables físicas actuales de los sensores
const variablesFisicas = {
  turbiedad: 2.18,
  ph: 7.34,
  nivelTinaco: 82.0,
  nivelCisterna: 91.0,
  caudal: 11.6,
  consumoTotalM3: 0.384,
  bombaEncendida: false
};

// Historial temporal para series de tiempo
const historialSeries = {
  tiempos: [],
  turbiedad: [],
  ph: [],
  tinaco: [],
  cisterna: [],
  caudal: []
};

// Referencias a instancias de Chart.js
let referenciaGraficaHidraulica = null;
let referenciaGraficaCalidad = null;
let referenciaGraficaClusteres = null;
let temporizadorMuestreo = null;

// Acumuladores de la matriz de confusión
const datosMatriz = {
  vn: 1420,
  fp: 18,
  fn: 12,
  vp: 250
};

// Registro de filas para la tabla de vista previa
const registrosPreviosCsv = [];

window.addEventListener("DOMContentLoaded", function() {
  agregarRegistro("Inicializando plataforma TlalocLink [Prototipo v0.9.5-Alpha].");
  agregarRegistro("Canal ThingSpeak preconfigurado: #" + estadoConfiguracion.idCanalThingSpeak);

  precargarHistorial(30);

  construirGraficaHidraulica();
  construirGraficaCalidad();
  construirGraficaClusteres();

  actualizarPantallaMetricas();
  actualizarMatrizDiagnostico();
  iniciarCicloMuestreo();
  iniciarReloj();
});

function precargarHistorial(cantidad) {
  const ahora = Date.now() - (cantidad * estadoConfiguracion.frecuenciaMuestreoMs);
  for (let i = 0; i < cantidad; i++) {
    const marca = new Date(ahora + (i * estadoConfiguracion.frecuenciaMuestreoMs));
    const horaStr = marca.toTimeString().split(" ")[0];

    const turb = parseFloat((2.10 + Math.sin(i * 0.25) * 0.35 + (Math.random() - 0.5) * 0.1).toFixed(2));
    const phVal = parseFloat((7.30 + Math.cos(i * 0.2) * 0.12 + (Math.random() - 0.5) * 0.04).toFixed(2));
    const caud = parseFloat((10.5 + Math.sin(i * 0.3) * 3.5 + (Math.random() - 0.5) * 1.0).toFixed(1));
    const tin = parseFloat(Math.max(20, Math.min(100, 84 - (i * 0.07))).toFixed(1));
    const cis = parseFloat(Math.max(10, Math.min(100, 93 - (i * 0.04))).toFixed(1));

    historialSeries.tiempos.push(horaStr);
    historialSeries.turbiedad.push(turb);
    historialSeries.ph.push(phVal);
    historialSeries.tinaco.push(tin);
    historialSeries.cisterna.push(cis);
    historialSeries.caudal.push(caud);

    if (i === cantidad - 1) {
      variablesFisicas.turbiedad = turb;
      variablesFisicas.ph = phVal;
      variablesFisicas.nivelTinaco = tin;
      variablesFisicas.nivelCisterna = cis;
      variablesFisicas.caudal = caud;
    }
    estadoConfiguracion.contadorEntradas++;
  }
}

function generarPasoSimulacion() {
  // Dinámica de Caudal
  if (estadoConfiguracion.fugaForzada) {
    variablesFisicas.caudal = parseFloat((26.5 + Math.random() * 4.5).toFixed(1));
  } else {
    const cambioCaudal = (Math.random() - 0.49) * 1.2;
    variablesFisicas.caudal = parseFloat(Math.max(0.0, Math.min(20.0, variablesFisicas.caudal + cambioCaudal)).toFixed(1));
  }

  // Dinámica de Tanques (Tinaco y Cisterna)
  const litrosConsumidos = variablesFisicas.caudal * (estadoConfiguracion.frecuenciaMuestreoMs / 60000);
  variablesFisicas.consumoTotalM3 += (litrosConsumidos / 1000);

  // Activación de bomba si el nivel del tinaco cae por debajo de 30%
  if (variablesFisicas.nivelTinaco < 30 && variablesFisicas.nivelCisterna > 20) {
    variablesFisicas.bombaEncendida = true;
  } else if (variablesFisicas.nivelTinaco > 90) {
    variablesFisicas.bombaEncendida = false;
  }

  if (variablesFisicas.bombaEncendida) {
    const litrosBombeo = 22.0 * (estadoConfiguracion.frecuenciaMuestreoMs / 60000);
    variablesFisicas.nivelTinaco += ((litrosBombeo / 1100) * 100);
    variablesFisicas.nivelCisterna -= ((litrosBombeo / 5000) * 100);
  }

  // Descenso de tinaco por consumo de flujo
  variablesFisicas.nivelTinaco -= ((litrosConsumidos / 1100) * 100);
  variablesFisicas.nivelTinaco = parseFloat(Math.max(5, Math.min(100, variablesFisicas.nivelTinaco)).toFixed(1));
  variablesFisicas.nivelCisterna = parseFloat(Math.max(2, Math.min(100, variablesFisicas.nivelCisterna)).toFixed(1));

  // Turbiedad y pH con ruido gaussiano leve
  const deltaTurb = (Math.random() - 0.5) * 0.08;
  variablesFisicas.turbiedad = parseFloat(Math.max(1.5, Math.min(4.8, variablesFisicas.turbiedad + deltaTurb)).toFixed(2));

  const deltaPh = (Math.random() - 0.5) * 0.03;
  variablesFisicas.ph = parseFloat(Math.max(7.0, Math.min(7.6, variablesFisicas.ph + deltaPh)).toFixed(2));

  // Actualizar Historial de Series
  const tiempoActual = new Date().toTimeString().split(" ")[0];
  historialSeries.tiempos.push(tiempoActual);
  historialSeries.turbiedad.push(variablesFisicas.turbiedad);
  historialSeries.ph.push(variablesFisicas.ph);
  historialSeries.tinaco.push(variablesFisicas.nivelTinaco);
  historialSeries.cisterna.push(variablesFisicas.nivelCisterna);
  historialSeries.caudal.push(variablesFisicas.caudal);

  if (historialSeries.tiempos.length > estadoConfiguracion.maximoHistorial) {
    historialSeries.tiempos.shift();
    historialSeries.turbiedad.shift();
    historialSeries.ph.shift();
    historialSeries.tinaco.shift();
    historialSeries.cisterna.shift();
    historialSeries.caudal.shift();
  }

  estadoConfiguracion.contadorEntradas++;

  // Añadir fila de vista previa
  agregarFilaTabla({
    fecha: new Date().toISOString().substring(11, 19),
    entrada: estadoConfiguracion.contadorEntradas,
    turbiedad: variablesFisicas.turbiedad,
    ph: variablesFisicas.ph,
    tinaco: variablesFisicas.nivelTinaco,
    cisterna: variablesFisicas.nivelCisterna,
    caudal: variablesFisicas.caudal,
    estado: "OK"
  });

  // Refrescar vistas
  actualizarPantallaMetricas();
  actualizarGraficas();
}

function actualizarPantallaMetricas() {
  // 1. Turbiedad
  document.getElementById("valor-turbiedad").textContent = variablesFisicas.turbiedad.toFixed(2);
  const porcentajeTurbiedad = Math.min(100, (variablesFisicas.turbiedad / 10.0) * 100);
  document.getElementById("barra-turbiedad").style.width = porcentajeTurbiedad + "%";

  const insigniaTurb = document.getElementById("insignia-turbiedad");
  const tarjetaTurb = document.getElementById("tarjeta-turbiedad");
  if (variablesFisicas.turbiedad > 5.0) {
    insigniaTurb.textContent = "Alerta NOM-127";
    tarjetaTurb.classList.add("estado-alerta");
  } else {
    insigniaTurb.textContent = "Normal";
    tarjetaTurb.classList.remove("estado-alerta");
  }

  // 2. pH
  document.getElementById("valor-ph").textContent = variablesFisicas.ph.toFixed(2);
  const porcentajePh = ((variablesFisicas.ph / 14.0) * 100);
  document.getElementById("barra-ph").style.width = porcentajePh + "%";

  const insigniaPh = document.getElementById("insignia-ph");
  if (variablesFisicas.ph < 6.5) {
    insigniaPh.textContent = "Ácido";
  } else if (variablesFisicas.ph > 8.5) {
    insigniaPh.textContent = "Alcalino";
  } else {
    insigniaPh.textContent = "Neutro";
  }

  // 3. Niveles de Almacenamiento
  document.getElementById("texto-nivel-tinaco").textContent = variablesFisicas.nivelTinaco.toFixed(0) + "%";
  document.getElementById("barra-tinaco").style.width = variablesFisicas.nivelTinaco + "%";

  document.getElementById("texto-nivel-cisterna").textContent = variablesFisicas.nivelCisterna.toFixed(0) + "%";
  document.getElementById("barra-cisterna").style.width = variablesFisicas.nivelCisterna + "%";

  const litrosTinaco = Math.round((variablesFisicas.nivelTinaco / 100) * 1100);
  const litrosCisterna = Math.round((variablesFisicas.nivelCisterna / 100) * 5000);
  document.getElementById("texto-litros-totales").textContent = (litrosTinaco + litrosCisterna).toLocaleString() + " L";
  document.getElementById("texto-estado-bomba").textContent = variablesFisicas.bombaEncendida ? "Bombeando" : "En reposo";

  // 4. Caudal
  document.getElementById("valor-caudal").textContent = variablesFisicas.caudal.toFixed(1);
  const porcentajeCaudal = Math.min(100, (variablesFisicas.caudal / 30.0) * 100);
  document.getElementById("barra-caudal").style.width = porcentajeCaudal + "%";

  document.getElementById("texto-consumo-acumulado").textContent = variablesFisicas.consumoTotalM3.toFixed(2) + " m³";

  const tarjetaCaudal = document.getElementById("tarjeta-caudal");
  const insigniaCaudal = document.getElementById("insignia-caudal");
  if (variablesFisicas.caudal > 22.0) {
    insigniaCaudal.textContent = "Posible Fuga";
    tarjetaCaudal.classList.add("estado-alerta");
    document.getElementById("texto-tipo-flujo").textContent = "Sobreflujo Inusual";
  } else if (variablesFisicas.caudal < 1.0) {
    insigniaCaudal.textContent = "Sin Flujo";
    tarjetaCaudal.classList.remove("estado-alerta");
    document.getElementById("texto-tipo-flujo").textContent = "Régimen Basal";
  } else {
    insigniaCaudal.textContent = "Estable";
    tarjetaCaudal.classList.remove("estado-alerta");
    document.getElementById("texto-tipo-flujo").textContent = "Consumo Regular";
  }
}

function conectarCanalThingSpeak() {
  const entradaCanal = document.getElementById("campo-id-canal").value.trim();
  const entradaClave = document.getElementById("campo-clave-api").value.trim();

  if (!entradaCanal) {
    agregarRegistro("Atención: Ingrese un ID de Canal válido.", "AVISO");
    return;
  }

  estadoConfiguracion.idCanalThingSpeak = entradaCanal;
  estadoConfiguracion.claveLecturaThingSpeak = entradaClave;

  const textoEstado = document.getElementById("texto-estado-enlace");
  textoEstado.textContent = "Conectando #" + entradaCanal + "...";
  agregarRegistro("Intentando enlazar canal ThingSpeak #" + entradaCanal + " con clave proporcionada...");

  // Intento de consulta a la API REST de ThingSpeak
  const urlThingSpeak = `https://api.thingspeak.com/channels/${entradaCanal}/feeds.json?api_key=${entradaClave}&results=5`;

  fetch(urlThingSpeak)
    .then(respuesta => {
      if (!respuesta.ok) throw new Error("Respuesta no satisfactoria del servidor ThingSpeak");
      return respuesta.json();
    })
    .then(datos => {
      textoEstado.textContent = "Conectado (ThingSpeak API)";
      agregarRegistro("Canal ThingSpeak #" + entradaCanal + " enlazado con éxito vía API.");

      if (datos && datos.feeds && datos.feeds.length > 0) {
        const ultimoFeed = datos.feeds[datos.feeds.length - 1];
        if (ultimoFeed.field1) variablesFisicas.turbiedad = parseFloat(ultimoFeed.field1);
        if (ultimoFeed.field2) variablesFisicas.ph = parseFloat(ultimoFeed.field2);
        if (ultimoFeed.field3) variablesFisicas.nivelTinaco = parseFloat(ultimoFeed.field3);
        if (ultimoFeed.field4) variablesFisicas.nivelCisterna = parseFloat(ultimoFeed.field4);
        if (ultimoFeed.field5) variablesFisicas.caudal = parseFloat(ultimoFeed.field5);
        actualizarPantallaMetricas();
      }
    })
    .catch(error => {
      // Fallback transparente a modo simulación interactiva con el canal especificado
      textoEstado.textContent = "Conectado #" + entradaCanal + " (Simulación)";
      agregarRegistro("Canal #" + entradaCanal + " configurado en modo simulación interactiva.");
    });
}

function construirGraficaHidraulica() {
  const ctx = document.getElementById("grafica-hidraulica-lienzo").getContext("2d");
  const etiquetas = historialSeries.tiempos.slice(-estadoConfiguracion.muestrasVisibles);

  referenciaGraficaHidraulica = new Chart(ctx, {
    type: "line",
    data: {
      labels: etiquetas,
      datasets: [
        {
          label: "Tinaco (%)",
          data: historialSeries.tinaco.slice(-estadoConfiguracion.muestrasVisibles),
          borderColor: "#1b4965",
          backgroundColor: "rgba(27, 73, 101, 0.08)",
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          yAxisID: "yNivel"
        },
        {
          label: "Cisterna (%)",
          data: historialSeries.cisterna.slice(-estadoConfiguracion.muestrasVisibles),
          borderColor: "#61a5c2",
          borderDash: [4, 4],
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          yAxisID: "yNivel"
        },
        {
          label: "Caudal (L/min)",
          data: historialSeries.caudal.slice(-estadoConfiguracion.muestrasVisibles),
          borderColor: "#2c699a",
          backgroundColor: "rgba(44, 105, 154, 0.12)",
          borderWidth: 2,
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          yAxisID: "yCaudal"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          labels: { font: { family: "SF Mono, Consolas, monospace", size: 10 }, boxWidth: 10 }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(216, 229, 240, 0.5)" },
          ticks: { font: { family: "SF Mono, Consolas, monospace", size: 9 }, maxRotation: 0 }
        },
        yNivel: {
          type: "linear",
          position: "left",
          min: 0,
          max: 100,
          grid: { color: "rgba(216, 229, 240, 0.5)" },
          ticks: { font: { family: "SF Mono, Consolas, monospace", size: 9 } }
        },
        yCaudal: {
          type: "linear",
          position: "right",
          min: 0,
          max: 35,
          grid: { drawOnChartArea: false },
          ticks: { font: { family: "SF Mono, Consolas, monospace", size: 9 } }
        }
      }
    }
  });
}

function construirGraficaCalidad() {
  const ctx = document.getElementById("grafica-calidad-lienzo").getContext("2d");
  const etiquetas = historialSeries.tiempos.slice(-estadoConfiguracion.muestrasVisibles);

  referenciaGraficaCalidad = new Chart(ctx, {
    type: "line",
    data: {
      labels: etiquetas,
      datasets: [
        {
          label: "Turbiedad (NTU)",
          data: historialSeries.turbiedad.slice(-estadoConfiguracion.muestrasVisibles),
          borderColor: "#0f2744",
          backgroundColor: "rgba(15, 39, 68, 0.10)",
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          yAxisID: "yTurb"
        },
        {
          label: "pH",
          data: historialSeries.ph.slice(-estadoConfiguracion.muestrasVisibles),
          borderColor: "#468faf",
          borderWidth: 2,
          tension: 0.2,
          pointRadius: 0,
          yAxisID: "yPh"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          labels: { font: { family: "SF Mono, Consolas, monospace", size: 10 }, boxWidth: 10 }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(216, 229, 240, 0.5)" },
          ticks: { font: { family: "SF Mono, Consolas, monospace", size: 9 }, maxRotation: 0 }
        },
        yTurb: {
          type: "linear",
          position: "left",
          min: 0,
          max: 12,
          grid: { color: "rgba(216, 229, 240, 0.5)" },
          ticks: { font: { family: "SF Mono, Consolas, monospace", size: 9 } }
        },
        yPh: {
          type: "linear",
          position: "right",
          min: 5,
          max: 9,
          grid: { drawOnChartArea: false },
          ticks: { font: { family: "SF Mono, Consolas, monospace", size: 9 } }
        }
      }
    }
  });
}

function construirGraficaClusteres() {
  const ctx = document.getElementById("grafica-clusteres-lienzo").getContext("2d");

  const puntosReposo = [];
  const puntosConsumo = [];
  const puntosLlenado = [];
  const puntosFuga = [];

  for (let i = 0; i < 22; i++) {
    puntosReposo.push({ x: (Math.random() * 1.5).toFixed(1), y: ((Math.random() - 0.5) * 0.1).toFixed(2) });
    puntosConsumo.push({ x: (7.0 + Math.random() * 8.0).toFixed(1), y: (-0.3 - Math.random() * 0.7).toFixed(2) });
    puntosLlenado.push({ x: (18.0 + Math.random() * 6.0).toFixed(1), y: (1.2 + Math.random() * 1.2).toFixed(2) });
    puntosFuga.push({ x: (24.0 + Math.random() * 8.0).toFixed(1), y: (-1.8 - Math.random() * 1.2).toFixed(2) });
  }

  referenciaGraficaClusteres = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Reposo",
          data: puntosReposo,
          backgroundColor: "#2c699a",
          pointRadius: 4
        },
        {
          label: "Consumo",
          data: puntosConsumo,
          backgroundColor: "#1b4965",
          pointRadius: 4
        },
        {
          label: "Llenado",
          data: puntosLlenado,
          backgroundColor: "#61a5c2",
          pointRadius: 4
        },
        {
          label: "Fuga",
          data: puntosFuga,
          backgroundColor: "#0a192f",
          pointRadius: 5,
          pointStyle: "triangle"
        },
        {
          label: "Estado Actual",
          data: [{ x: variablesFisicas.caudal, y: -0.45 }],
          backgroundColor: "#ffffff",
          borderColor: "#0a192f",
          borderWidth: 2,
          pointRadius: 7,
          pointStyle: "rectRot"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          labels: { font: { family: "SF Mono, Consolas, monospace", size: 9 }, boxWidth: 8 }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 35,
          grid: { color: "rgba(216, 229, 240, 0.5)" },
          ticks: { font: { family: "SF Mono, Consolas, monospace", size: 9 } }
        },
        y: {
          min: -3.5,
          max: 3.0,
          grid: { color: "rgba(216, 229, 240, 0.5)" },
          ticks: { font: { family: "SF Mono, Consolas, monospace", size: 9 } }
        }
      }
    }
  });
}

function actualizarGraficas() {
  const cantidad = estadoConfiguracion.muestrasVisibles;
  const etiquetas = historialSeries.tiempos.slice(-cantidad);

  if (referenciaGraficaHidraulica) {
    referenciaGraficaHidraulica.data.labels = etiquetas;
    referenciaGraficaHidraulica.data.datasets[0].data = historialSeries.tinaco.slice(-cantidad);
    referenciaGraficaHidraulica.data.datasets[1].data = historialSeries.cisterna.slice(-cantidad);
    referenciaGraficaHidraulica.data.datasets[2].data = historialSeries.caudal.slice(-cantidad);
    referenciaGraficaHidraulica.update("none");
  }

  if (referenciaGraficaCalidad) {
    referenciaGraficaCalidad.data.labels = etiquetas;
    referenciaGraficaCalidad.data.datasets[0].data = historialSeries.turbiedad.slice(-cantidad);
    referenciaGraficaCalidad.data.datasets[1].data = historialSeries.ph.slice(-cantidad);
    referenciaGraficaCalidad.update("none");
  }

  if (referenciaGraficaClusteres) {
    const tasaNivel = variablesFisicas.bombaEncendida ? 1.5 : (-(variablesFisicas.caudal / 22.0));
    referenciaGraficaClusteres.data.datasets[4].data = [{
      x: variablesFisicas.caudal,
      y: parseFloat(tasaNivel.toFixed(2))
    }];
    referenciaGraficaClusteres.update("none");
  }
}

function cambiarCantidadMuestras(cantidad) {
  estadoConfiguracion.muestrasVisibles = cantidad;
  document.getElementById("boton-puntos-30").classList.toggle("activo", cantidad === 30);
  document.getElementById("boton-puntos-60").classList.toggle("activo", cantidad === 60);
  actualizarGraficas();
}

/* ==========================================================================
   MATRIZ DE CONFUSIÓN Y RENDIMIENTO
   ========================================================================== */
function cambiarSensibilidad(nuevoValor) {
  estadoConfiguracion.umbralDeteccion = parseFloat(nuevoValor);
  document.getElementById("texto-valor-sensibilidad").textContent = estadoConfiguracion.umbralDeteccion.toFixed(2);

  const factor = (0.50 / estadoConfiguracion.umbralDeteccion);
  datosMatriz.vp = Math.round(250 * Math.min(1.05, factor));
  datosMatriz.fn = Math.max(1, Math.round(12 / factor));
  datosMatriz.fp = Math.max(2, Math.round(18 * factor));
  datosMatriz.vn = Math.round(1420 - (datosMatriz.fp - 18));

  actualizarMatrizDiagnostico();
}

function actualizarMatrizDiagnostico() {
  const total = datosMatriz.vn + datosMatriz.fp + datosMatriz.fn + datosMatriz.vp;

  document.getElementById("conteo-vn").textContent = datosMatriz.vn;
  document.getElementById("conteo-fp").textContent = datosMatriz.fp;
  document.getElementById("conteo-fn").textContent = datosMatriz.fn;
  document.getElementById("conteo-vp").textContent = datosMatriz.vp;

  document.getElementById("porcentaje-vn").textContent = ((datosMatriz.vn / total) * 100).toFixed(1) + "%";
  document.getElementById("porcentaje-fp").textContent = ((datosMatriz.fp / total) * 100).toFixed(1) + "%";
  document.getElementById("porcentaje-fn").textContent = ((datosMatriz.fn / total) * 100).toFixed(1) + "%";
  document.getElementById("porcentaje-vp").textContent = ((datosMatriz.vp / total) * 100).toFixed(1) + "%";

  const exactitud = ((datosMatriz.vp + datosMatriz.vn) / total) * 100;
  const deteccion = (datosMatriz.vp / (datosMatriz.vp + datosMatriz.fn)) * 100;
  const precision = (datosMatriz.vp / (datosMatriz.vp + datosMatriz.fp)) * 100;

  document.getElementById("kpi-exactitud").textContent = exactitud.toFixed(1) + "%";
  document.getElementById("kpi-deteccion").textContent = deteccion.toFixed(1) + "%";
  document.getElementById("kpi-precision").textContent = precision.toFixed(1) + "%";
}

/* ==========================================================================
   CONTROL DEL SIMULADOR
   ========================================================================== */
function iniciarCicloMuestreo() {
  if (temporizadorMuestreo) clearInterval(temporizadorMuestreo);
  temporizadorMuestreo = setInterval(function() {
    if (estadoConfiguracion.simulacionActiva) {
      generarPasoSimulacion();
    }
  }, estadoConfiguracion.frecuenciaMuestreoMs);
}

function alternarSimulacion() {
  estadoConfiguracion.simulacionActiva = !estadoConfiguracion.simulacionActiva;
  const boton = document.getElementById("boton-alternar-simulacion");
  const punto = document.getElementById("punto-pulso-enlace");

  if (estadoConfiguracion.simulacionActiva) {
    boton.textContent = "Pausar";
    boton.classList.remove("activo");
    punto.style.backgroundColor = "var(--azul-acero)";
    agregarRegistro("Simulación reanudada.");
  } else {
    boton.textContent = "Reanudar";
    boton.classList.add("activo");
    punto.style.backgroundColor = "var(--texto-atenuado)";
    agregarRegistro("Simulación en pausa.");
  }
}

function inyectarEventoFuga() {
  estadoConfiguracion.fugaForzada = true;
  document.getElementById("boton-inyectar-fuga").classList.add("activo");
  agregarRegistro("Evento inyectado: incremento crítico de caudal por fuga simulada.", "AVISO");
  generarPasoSimulacion();
}

function restablecerValores() {
  estadoConfiguracion.fugaForzada = false;
  variablesFisicas.caudal = 11.4;
  variablesFisicas.turbiedad = 2.15;
  variablesFisicas.ph = 7.34;
  variablesFisicas.bombaEncendida = false;

  document.getElementById("boton-inyectar-fuga").classList.remove("activo");
  agregarRegistro("Valores hidráulicos restablecidos a régimen regular.");
  actualizarPantallaMetricas();
}

/* ==========================================================================
   IMPORTACIÓN Y DESCARGA CSV (THINGSPEAK)
   ========================================================================== */
function manejarArchivoCsv(evento) {
  const archivo = evento.target.files[0];
  if (!archivo) return;

  agregarRegistro("Leyendo archivo: " + archivo.name);
  document.getElementById("estado-lector-csv").textContent = "Leyendo " + archivo.name;

  const lector = new FileReader();
  lector.onload = function(e) {
    procesarTextoCsv(e.target.result);
  };
  lector.readAsText(archivo);
}

function procesarTextoCsv(texto) {
  const lineas = texto.split(/\r\n|\n/).filter(l => l.trim().length > 0);
  if (lineas.length < 2) {
    agregarRegistro("Archivo CSV sin contenido suficiente.", "AVISO");
    return;
  }

  const encabezados = lineas[0].split(",").map(c => c.trim().toLowerCase());
  const idxTurb = encabezados.findIndex(c => c === "field1");
  const idxPh = encabezados.findIndex(c => c === "field2");
  const idxTin = encabezados.findIndex(c => c === "field3");
  const idxCis = encabezados.findIndex(c => c === "field4");
  const idxCaud = encabezados.findIndex(c => c === "field5");

  let procesados = 0;
  for (let i = 1; i < lineas.length; i++) {
    const cols = lineas[i].split(",").map(c => c.trim());
    if (cols.length < 2) continue;

    const turb = idxTurb >= 0 && !isNaN(parseFloat(cols[idxTurb])) ? parseFloat(cols[idxTurb]) : 2.2;
    const phVal = idxPh >= 0 && !isNaN(parseFloat(cols[idxPh])) ? parseFloat(cols[idxPh]) : 7.3;
    const tin = idxTin >= 0 && !isNaN(parseFloat(cols[idxTin])) ? parseFloat(cols[idxTin]) : 80;
    const cis = idxCis >= 0 && !isNaN(parseFloat(cols[idxCis])) ? parseFloat(cols[idxCis]) : 90;
    const caud = idxCaud >= 0 && !isNaN(parseFloat(cols[idxCaud])) ? parseFloat(cols[idxCaud]) : 11;

    if (i === lineas.length - 1) {
      variablesFisicas.turbiedad = turb;
      variablesFisicas.ph = phVal;
      variablesFisicas.nivelTinaco = tin;
      variablesFisicas.nivelCisterna = cis;
      variablesFisicas.caudal = caud;
    }

    agregarFilaTabla({
      fecha: new Date().toISOString().substring(11, 19),
      entrada: 1000 + i,
      turbiedad: turb,
      ph: phVal,
      tinaco: tin,
      cisterna: cis,
      caudal: caud,
      estado: "CSV"
    });

    procesados++;
  }

  document.getElementById("estado-lector-csv").textContent = procesados + " registros cargados";
  agregarRegistro("Importación exitosa: " + procesados + " registros procesados desde CSV.");
  actualizarPantallaMetricas();
  actualizarGraficas();
}

function agregarFilaTabla(fila) {
  registrosPreviosCsv.unshift(fila);
  if (registrosPreviosCsv.length > 4) {
    registrosPreviosCsv.pop();
  }

  const cuerpo = document.getElementById("cuerpo-tabla-csv");
  cuerpo.innerHTML = "";

  registrosPreviosCsv.forEach(reg => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${reg.fecha}</td>
      <td>#${reg.entrada}</td>
      <td>${parseFloat(reg.turbiedad).toFixed(2)}</td>
      <td>${parseFloat(reg.ph).toFixed(2)}</td>
      <td>${parseFloat(reg.tinaco).toFixed(1)}%</td>
      <td>${parseFloat(reg.cisterna).toFixed(1)}%</td>
      <td>${parseFloat(reg.caudal).toFixed(1)}</td>
      <td><span class="insignia-estado">${reg.estado}</span></td>
    `;
    cuerpo.appendChild(tr);
  });
}

function descargarCsvEjemplo() {
  let contenido = "created_at,entry_id,field1,field2,field3,field4,field5\r\n";
  const base = Date.now() - (30 * 15000);

  for (let i = 1; i <= 30; i++) {
    const fecha = new Date(base + (i * 15000)).toISOString();
    const turb = (2.1 + Math.sin(i * 0.2) * 0.4).toFixed(2);
    const phVal = (7.3 + Math.cos(i * 0.15) * 0.15).toFixed(2);
    const tin = (85 - (i * 0.1)).toFixed(1);
    const cis = (92 - (i * 0.05)).toFixed(1);
    const caud = (11.0 + Math.sin(i * 0.3) * 2.5).toFixed(1);
    contenido += `${fecha},${i},${turb},${phVal},${tin},${cis},${caud}\r\n`;
  }

  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const enlace = document.createElement("a");
  const url = URL.createObjectURL(blob);
  enlace.href = url;
  enlace.download = "thingspeak_canal_" + estadoConfiguracion.idCanalThingSpeak + ".csv";
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);

  agregarRegistro("Archivo CSV de muestra descargado.");
}

function cargarLoteDemostracion() {
  let demoCsv = "created_at,entry_id,field1,field2,field3,field4,field5\r\n";
  for (let i = 1; i <= 15; i++) {
    demoCsv += `2026-10-30T14:00:${i < 10 ? "0" + i : i}Z,${2000 + i},2.25,7.32,81.0,90.5,12.0\r\n`;
  }
  procesarTextoCsv(demoCsv);
}

/* ==========================================================================
   CONSOLA Y RELOJ
   ========================================================================== */
function agregarRegistro(mensaje, tipo = "INFO") {
  const contenedor = document.getElementById("contenedor-lineas-consola");
  if (!contenedor) return;

  estadoConfiguracion.totalRegistrosConsola++;
  const contador = document.getElementById("contador-eventos");
  if (contador) contador.textContent = estadoConfiguracion.totalRegistrosConsola + " entradas";

  const hora = new Date().toTimeString().split(" ")[0];
  const div = document.createElement("div");
  div.className = "linea-registro" + (tipo === "AVISO" ? " aviso" : "");
  div.innerHTML = `<span class="hora-tag">[${hora}]</span> ${mensaje}`;

  contenedor.appendChild(div);
  contenedor.scrollTop = contenedor.scrollHeight;

  while (contenedor.childNodes.length > 50) {
    contenedor.removeChild(contenedor.firstChild);
  }
}

function limpiarConsola() {
  const contenedor = document.getElementById("contenedor-lineas-consola");
  if (contenedor) contenedor.innerHTML = "";
  estadoConfiguracion.totalRegistrosConsola = 0;
  document.getElementById("contador-eventos").textContent = "0 entradas";
  agregarRegistro("Registro de eventos reiniciado.");
}

function iniciarReloj() {
  function reloj() {
    const ahora = new Date();
    const texto = ahora.toISOString().replace("T", " ").substring(0, 19) + " UTC";
    const el = document.getElementById("reloj-sistema-tiempo");
    if (el) el.innerHTML = `<span>${texto}</span>`;
  }
  reloj();
  setInterval(reloj, 1000);
}
