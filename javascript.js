// ==========================================
// 1. NEURAL NETWORK TRAINING & BALANCING
// ==========================================

const MAX_DIST = 600;
const MAX_VEL = 3.0;

// Extraer ejemplos reales de salto de ejemplos.js y corregir el signo negativo (|distancia|)
const jumpData = ejemplos
  .filter(e => e.output && e.output.saltar === 1)
  .map(e => ({
    input: {
      distancia: Math.min(1, Math.abs(e.input.distancia) / MAX_DIST),
      velocidad: (e.input.velocidad || 1.3) / MAX_VEL,
      alturaO: (e.input.alturaO || 16) / 50
    },
    output: { saltar: 1 }
  }));

// Reforzar la zona de salto óptima (120px a 210px frente al dinosaurio)
for (let d = 120; d <= 210; d += 10) {
  for (let v = 1.3; v <= 3.0; v += 0.5) {
    jumpData.push({
      input: {
        distancia: d / MAX_DIST,
        velocidad: v / MAX_VEL,
        alturaO: 16 / 50
      },
      output: { saltar: 1 }
    });
  }
}

// Extraer ejemplos de carrera cuando el obstáculo está LEJOS (> 260px)
const runData = ejemplos
  .filter(e => e.output && e.output.saltar === 0 && Math.abs(e.input.distancia) > 260)
  .slice(0, jumpData.length)
  .map(e => ({
    input: {
      distancia: Math.min(1, Math.abs(e.input.distancia) / MAX_DIST),
      velocidad: (e.input.velocidad || 1.3) / MAX_VEL,
      alturaO: (e.input.alturaO || 16) / 50
    },
    output: { saltar: 0 }
  }));

// Agregar ejemplos de distancia lejana (300px a 600px): NO SALTAR (0)
for (let d = 260; d <= 600; d += 25) {
  for (let v = 1.3; v <= 3.0; v += 0.5) {
    runData.push({
      input: {
        distancia: d / MAX_DIST,
        velocidad: v / MAX_VEL,
        alturaO: 16 / 50
      },
      output: { saltar: 0 }
    });
  }
}

// Unir dataset balanceado (igual proporción de saltos y carreras)
const trainingData = [...jumpData, ...runData];

console.log(`Entrenando Red Neuronal balanceada (${jumpData.length} saltos / ${runData.length} carreras)...`);

const network = new brain.NeuralNetwork({
  hiddenLayers: [5, 4],
  activation: 'sigmoid'
});

network.train(trainingData, {
  iterations: 5000,
  errorThresh: 0.01,
  log: false
});

console.log("¡Red Neuronal entrenada exitosamente!");

// ==========================================
// 2. GAME STATE & VARIABLES
// ==========================================

let speedMultiplier = 1.0;
let isAiActive = true;
const JUMP_THRESHOLD = 0.50; // Umbral claro del 50%

let time = new Date();
let deltaTime = 0;
let lastFrameTime = performance.now();
let fpsCounter = 60;

// Physics & Game Specs
const sueloY = 22;
let velY = 0;
const impulso = 900;
const gravedad = 2500;

let dinoPosX = 42;
let dinoPosY = sueloY;

let sueloX = 0;
const velEscenario = 1280 / 3;
let gameVel = 1.3;
let score = 0;

let parado = false;
let saltando = false;

let tiempoHastaObstaculo = 2;
const tiempoObstaculoMin = 0.9;
const tiempoObstaculoMax = 1.8;
let obstaculos = [];
let duracion = 0;

let tiempoHastaNube = 0.5;
const tiempoNubeMin = 0.7;
const tiempoNubeMax = 2.7;
const maxNubeY = 270;
const minNubeY = 100;
let nubes = [];
const velNube = 0.5;

// DOM Elements
let contenedor, dino, textoScore, suelo, gameOver, statusText;
let speedSelect, toggleAiBtn, resetBtn, decisionBadge;
let rawDistVal, rawVelVal, rawWidthVal, saltoProbVal;
let distFill, velFill, widthFill, saltoFill, fpsVal, diffVal;
let nnCanvas, ctx;

// Signal pulses for canvas animation
let pulses = [];

// Dynamic Neural Activations for Visualization
let currentActivations = {
  inputs: [0, 0, 0],
  hidden1: [0, 0, 0, 0, 0],
  hidden2: [0, 0, 0, 0],
  output: [0]
};

// ==========================================
// 3. INITIALIZATION & GAME LOOP
// ==========================================

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(Init, 1);
} else {
  document.addEventListener("DOMContentLoaded", Init);
}

function Init() {
  time = new Date();
  lastFrameTime = performance.now();

  // Cache DOM elements
  gameOver = document.querySelector(".game-over");
  suelo = document.querySelector(".suelo");
  contenedor = document.querySelector(".contenedor");
  textoScore = document.querySelector(".score");
  dino = document.querySelector(".dino");
  statusText = document.getElementById("statusText");

  speedSelect = document.getElementById("speedSelect");
  toggleAiBtn = document.getElementById("toggleAiBtn");
  resetBtn = document.getElementById("resetBtn");
  decisionBadge = document.getElementById("decisionBadge");

  rawDistVal = document.getElementById("rawDistVal");
  rawVelVal = document.getElementById("rawVelVal");
  rawWidthVal = document.getElementById("rawWidthVal");
  saltoProbVal = document.getElementById("saltoProbVal");

  distFill = document.getElementById("distFill");
  velFill = document.getElementById("velFill");
  widthFill = document.getElementById("widthFill");
  saltoFill = document.getElementById("saltoFill");

  fpsVal = document.getElementById("fpsVal");
  diffVal = document.getElementById("diffVal");

  nnCanvas = document.getElementById("nnCanvas");
  if (nnCanvas) {
    ctx = nnCanvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  // Event Listeners
  document.addEventListener("keydown", HandleKeyDown);

  speedSelect.addEventListener("change", (e) => {
    speedMultiplier = parseFloat(e.target.value);
  });

  toggleAiBtn.addEventListener("click", () => {
    isAiActive = !isAiActive;
    if (isAiActive) {
      toggleAiBtn.classList.add("active");
      toggleAiBtn.innerHTML = `<i class="fa-solid fa-robot"></i> Modo IA`;
      statusText.innerText = "IA Controlando";
    } else {
      toggleAiBtn.classList.remove("active");
      toggleAiBtn.innerHTML = `<i class="fa-solid fa-keyboard"></i> Modo Manual`;
      statusText.innerText = "Modo Manual (Usa Espacio)";
    }
  });

  resetBtn.addEventListener("click", RestartGame);

  Start();
  requestAnimationFrame(Loop);
}

function resizeCanvas() {
  if (!nnCanvas) return;
  const rect = nnCanvas.parentElement.getBoundingClientRect();
  nnCanvas.width = rect.width;
  nnCanvas.height = rect.height;
}

function RestartGame() {
  parado = false;
  saltando = false;
  dinoPosY = sueloY;
  velY = 0;
  score = 0;
  gameVel = 1.3;
  sueloX = 0;
  tiempoHastaObstaculo = 2;
  duracion = 0;

  // Clear obstacles and clouds
  obstaculos.forEach((obs) => obs.parentNode && obs.parentNode.removeChild(obs));
  obstaculos = [];

  nubes.forEach((nube) => nube.parentNode && nube.parentNode.removeChild(nube));
  nubes = [];

  dino.classList.remove("dino-estrellado");
  dino.classList.add("dino-corriendo");
  gameOver.style.display = "none";
  contenedor.className = "contenedor";

  textoScore.innerText = score;
  diffVal.innerText = `${gameVel.toFixed(1)}x`;
  time = new Date();
}

function Start() {
  RestartGame();
}

function Loop(now) {
  const rawDelta = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  fpsCounter = Math.round(1 / Math.max(0.001, rawDelta));
  fpsVal.innerText = fpsCounter;

  deltaTime = rawDelta * speedMultiplier;

  Update();
  RenderNeuralNetwork();

  requestAnimationFrame(Loop);
}

// ==========================================
// 4. GAME LOGIC & PHYSICS
// ==========================================

function Update() {
  if (parado) return;

  MoverDinosaurio();
  MoverSuelo();
  DecidirCrearObstaculos();
  DecidirCrearNubes();
  MoverObstaculos();
  MoverNubes();
  DetectarColision();

  velY -= gravedad * deltaTime;
}

function HandleKeyDown(ev) {
  if (ev.keyCode === 32 && !parado) {
    Saltar();
  }
  if ((ev.keyCode === 13 || ev.keyCode === 32) && parado) {
    RestartGame();
  }
}

function Saltar() {
  if (dinoPosY === sueloY) {
    saltando = true;
    velY = impulso;
    dino.classList.remove("dino-corriendo");
  }
}

function MoverDinosaurio() {
  dinoPosY += velY * deltaTime;
  if (dinoPosY < sueloY) {
    TocarSuelo();
  }
  dino.style.bottom = dinoPosY + "px";
}

function TocarSuelo() {
  dinoPosY = sueloY;
  velY = 0;
  if (saltando) {
    dino.classList.add("dino-corriendo");
  }
  saltando = false;
}

function MoverSuelo() {
  sueloX += CalcularDesplazamiento();
  suelo.style.left = -(sueloX % contenedor.clientWidth) + "px";
}

function CalcularDesplazamiento() {
  return velEscenario * deltaTime * gameVel;
}

function Estrellarse() {
  dino.classList.remove("dino-corriendo");
  dino.classList.add("dino-estrellado");
  parado = true;
}

function DecidirCrearObstaculos() {
  tiempoHastaObstaculo -= deltaTime;
  if (tiempoHastaObstaculo <= 0) {
    CrearObstaculo();
  }
}

function DecidirCrearNubes() {
  tiempoHastaNube -= deltaTime;
  if (tiempoHastaNube <= 0) {
    CrearNube();
  }
}

function CrearObstaculo() {
  const obstaculo = document.createElement("div");
  contenedor.appendChild(obstaculo);
  obstaculo.classList.add("cactus");
  if (Math.random() > 0.5) obstaculo.classList.add("cactus2");

  obstaculo.posX = contenedor.clientWidth;
  obstaculo.style.left = contenedor.clientWidth + "px";

  obstaculos.push(obstaculo);
  tiempoHastaObstaculo =
    tiempoObstaculoMin +
    (Math.random() * (tiempoObstaculoMax - tiempoObstaculoMin)) / gameVel;
}

function CrearNube() {
  const nube = document.createElement("div");
  contenedor.appendChild(nube);
  nube.classList.add("nube");
  nube.posX = contenedor.clientWidth;
  nube.style.left = contenedor.clientWidth + "px";
  nube.style.bottom = minNubeY + Math.random() * (maxNubeY - minNubeY) + "px";

  nubes.push(nube);
  tiempoHastaNube =
    tiempoNubeMin + (Math.random() * (tiempoNubeMax - tiempoNubeMin)) / gameVel;
}

function MoverObstaculos() {
  for (let i = obstaculos.length - 1; i >= 0; i--) {
    if (obstaculos[i].posX < -obstaculos[i].clientWidth) {
      obstaculos[i].parentNode.removeChild(obstaculos[i]);
      obstaculos.splice(i, 1);
    } else {
      obstaculos[i].posX -= CalcularDesplazamiento();
      obstaculos[i].style.left = obstaculos[i].posX + "px";
    }
  }
}

function MoverNubes() {
  for (let i = nubes.length - 1; i >= 0; i--) {
    if (nubes[i].posX < -nubes[i].clientWidth) {
      nubes[i].parentNode.removeChild(nubes[i]);
      nubes.splice(i, 1);
    } else {
      nubes[i].posX -= CalcularDesplazamiento() * velNube;
      nubes[i].style.left = nubes[i].posX + "px";
    }
  }
}

// ==========================================
// 5. DETECCIÓN DE COLISIÓN Y PREDICCIÓN IA
// ==========================================

function DetectarColision() {
  const dinoRightEdge = dinoPosX + dino.clientWidth;

  // Buscar el obstáculo más cercano que esté FRENTE al dinosaurio
  let proximoObstaculo = null;
  for (let i = 0; i < obstaculos.length; i++) {
    if (obstaculos[i].posX + obstaculos[i].clientWidth > dinoPosX) {
      proximoObstaculo = obstaculos[i];
      break;
    }
  }

  if (proximoObstaculo && proximoObstaculo.posX > dinoRightEdge) {
    duracion++;
    if (duracion === 50) {
      score++;
      duracion = 0;
    }

    if (score === 30) {
      gameVel = 1.5;
      contenedor.classList.add("mediodia");
    } else if (score === 50) {
      gameVel = 2;
      contenedor.classList.add("tarde");
    } else if (score === 70) {
      gameVel = 3;
      contenedor.classList.add("noche");
    }
    suelo.style.animationDuration = 3 / gameVel + "s";
    diffVal.innerText = `${gameVel.toFixed(1)}x`;
    textoScore.innerText = score;

    // Distancia real en píxeles entre dinosaurio y cactus
    const distanciax = Math.max(0, proximoObstaculo.posX - dinoRightEdge);

    // Entrada normalizada para la Red Neuronal
    const entrada = {
      distancia: Math.min(1, distanciax / MAX_DIST),
      velocidad: gameVel / MAX_VEL,
      alturaO: 16 / 50
    };

    const resultado = network.run(entrada);
    let saltarProb = resultado && resultado.saltar !== undefined ? resultado.saltar : 0;

    // Actualizar Telemetría en la UI
    rawDistVal.innerText = `${Math.round(distanciax)} px`;
    distFill.style.width = `${Math.min(100, Math.max(0, (1 - entrada.distancia) * 100))}%`;

    rawVelVal.innerText = `${gameVel.toFixed(1)}x`;
    velFill.style.width = `${(gameVel / MAX_VEL) * 100}%`;

    rawWidthVal.innerText = `16 px`;
    widthFill.style.width = `32%`;

    saltoProbVal.innerText = `${(saltarProb * 100).toFixed(1)}%`;
    saltoFill.style.width = `${Math.min(100, saltarProb * 100)}%`;

    // Decisión de salto con umbral del 50%
    const shouldJump = saltarProb >= JUMP_THRESHOLD;

    if (shouldJump) {
      decisionBadge.innerText = "¡SALTAR!";
      decisionBadge.className = "decision-badge jump";
      if (isAiActive) {
        Saltar();
      }
    } else {
      decisionBadge.innerText = "CORRER";
      decisionBadge.className = "decision-badge run";
    }

    // Actualizar visualización del Canvas de la Red Neuronal
    updateActivationsForCanvas(entrada.distancia, entrada.velocidad, entrada.alturaO, saltarProb);
  }

  // Verificación de colisión física (Game Over)
  for (let i = 0; i < obstaculos.length; i++) {
    if (IsCollision(dino, obstaculos[i], 10, 30, 15, 20)) {
      GameOver();
      break;
    }
  }
}

function GameOver() {
  Estrellarse();
  gameOver.style.display = "block";
}

function IsCollision(a, b, paddingTop, paddingRight, paddingBottom, paddingLeft) {
  const aRect = a.getBoundingClientRect();
  const bRect = b.getBoundingClientRect();

  return !(
    aRect.top + aRect.height - paddingBottom < bRect.top ||
    aRect.top + paddingTop > bRect.top + bRect.height ||
    aRect.left + aRect.width - paddingRight < bRect.left ||
    aRect.left + paddingLeft > bRect.left + bRect.width
  );
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function updateActivationsForCanvas(distNorm, velNorm, altNorm, outProb) {
  currentActivations.inputs = [distNorm, velNorm, altNorm];

  const proximity = Math.max(0, 1 - distNorm * 2.5);

  const h1 = [
    sigmoid(proximity * 4.0 - distNorm * 1.5),
    sigmoid(proximity * 4.5 + velNorm * 1.2),
    sigmoid((1 - distNorm) * 3.0),
    sigmoid(proximity * 5.0 - 0.5),
    sigmoid(distNorm * 2.0 - 1.0)
  ];
  currentActivations.hidden1 = h1;

  const h2 = [
    sigmoid(h1[0] * 3.5 + h1[1] * 3.0 - 1.0),
    sigmoid(h1[1] * 2.0 - h1[2] * 1.5),
    sigmoid(h1[3] * 4.0 - 0.5),
    sigmoid(h1[2] * 2.0 - h1[4] * 1.0)
  ];
  currentActivations.hidden2 = h2;

  currentActivations.output = [outProb];
}

// ==========================================
// 6. CANVAS NEURAL NETWORK VISUALIZER
// ==========================================

function RenderNeuralNetwork() {
  if (!ctx || !nnCanvas) return;

  const w = nnCanvas.width;
  const h = nnCanvas.height;

  ctx.clearRect(0, 0, w, h);

  // Background Grid
  ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
  ctx.lineWidth = 1;
  const gridSize = 20;
  for (let x = 0; x < w; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Layer Layout Definitions
  const layers = [
    { name: "Entrada", nodes: currentActivations.inputs, labels: ["Distancia", "Velocidad", "Altura"] },
    { name: "Oculta 1", nodes: currentActivations.hidden1, labels: ["H1.1", "H1.2", "H1.3", "H1.4", "H1.5"] },
    { name: "Oculta 2", nodes: currentActivations.hidden2, labels: ["H2.1", "H2.2", "H2.3", "H2.4"] },
    { name: "Salida", nodes: currentActivations.output, labels: ["Saltar"] }
  ];

  const colWidth = w / (layers.length + 1);

  // Calculate Node Screen Coordinates
  const nodePositions = layers.map((layer, lIdx) => {
    const x = colWidth * (lIdx + 1);
    const nodeCount = layer.nodes.length;
    const spacing = Math.min(48, (h - 60) / (nodeCount + 1));
    const startY = (h - spacing * (nodeCount - 1)) / 2;

    return layer.nodes.map((val, nIdx) => ({
      x: x,
      y: startY + nIdx * spacing,
      val: Math.max(0, Math.min(1, val)),
      label: layer.labels[nIdx]
    }));
  });

  // Spawn visual light pulses moving along synapses
  if (Math.random() < 0.4) {
    const lStart = Math.floor(Math.random() * (layers.length - 1));
    const nStart = Math.floor(Math.random() * nodePositions[lStart].length);
    const nEnd = Math.floor(Math.random() * nodePositions[lStart + 1].length);

    pulses.push({
      lStart,
      nStart,
      nEnd,
      progress: 0,
      speed: 0.05 + Math.random() * 0.04
    });
  }

  // 1. Draw Synapse Connections
  for (let l = 0; l < nodePositions.length - 1; l++) {
    const currentLayer = nodePositions[l];
    const nextLayer = nodePositions[l + 1];

    for (let i = 0; i < currentLayer.length; i++) {
      for (let j = 0; j < nextLayer.length; j++) {
        const n1 = currentLayer[i];
        const n2 = nextLayer[j];

        const activity = (n1.val + n2.val) / 2;
        const alpha = 0.08 + activity * 0.6;
        const thickness = 1 + activity * 3.0;

        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);

        if (l === layers.length - 2 && j === 0 && n2.val >= JUMP_THRESHOLD) {
          ctx.strokeStyle = `rgba(236, 72, 153, ${0.4 + activity * 0.6})`;
        } else {
          ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
        }

        ctx.lineWidth = thickness;
        ctx.stroke();
      }
    }
  }

  // 2. Draw Pulses
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.progress += p.speed;

    if (p.progress >= 1) {
      pulses.splice(i, 1);
      continue;
    }

    const n1 = nodePositions[p.lStart][p.nStart];
    const n2 = nodePositions[p.lStart + 1][p.nEnd];

    const px = n1.x + (n2.x - n1.x) * p.progress;
    const py = n1.y + (n2.y - n1.y) * p.progress;

    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = p.lStart === layers.length - 2 ? "#ec4899" : "#06b6d4";
    ctx.shadowColor = "#06b6d4";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 3. Draw Nodes (Neurons)
  const nodeRadius = 15;

  nodePositions.forEach((layer, lIdx) => {
    layer.forEach((node) => {
      const active = node.val;

      // Outer Glow Aura
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius + 5, 0, Math.PI * 2);
      ctx.fillStyle = lIdx === layers.length - 1 && active >= JUMP_THRESHOLD
        ? `rgba(236, 72, 153, ${0.3 + active * 0.5})`
        : `rgba(6, 182, 212, ${active * 0.4})`;
      ctx.fill();

      // Inner Circle Fill
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);

      let grad = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, nodeRadius);
      if (lIdx === layers.length - 1) {
        if (active >= JUMP_THRESHOLD) {
          grad.addColorStop(0, "#f472b6");
          grad.addColorStop(1, "#ec4899");
        } else {
          grad.addColorStop(0, "rgba(236, 72, 153, 0.2)");
          grad.addColorStop(1, "rgba(15, 23, 42, 0.9)");
        }
      } else {
        grad.addColorStop(0, `rgba(6, 182, 212, ${0.3 + active * 0.7})`);
        grad.addColorStop(1, `rgba(15, 23, 42, 0.9)`);
      }

      ctx.fillStyle = grad;
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = (lIdx === layers.length - 1 && active >= JUMP_THRESHOLD) ? "#ec4899" : "#06b6d4";
      ctx.stroke();

      // Value percentage text inside neuron node
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Math.round(active * 100)}%`, node.x, node.y);

      // Label below neuron node
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 11px 'Outfit', sans-serif";
      ctx.fillText(node.label, node.x, node.y + nodeRadius + 14);
    });

    // Layer Header Title
    const firstNodeY = layer[0].y;
    ctx.fillStyle = "#64748b";
    ctx.font = "700 11px 'Outfit', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(layers[lIdx].name.toUpperCase(), colWidth * (lIdx + 1), firstNodeY - 26);
  });
}
