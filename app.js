import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ==========================================================================
// FIREBASE CONFIGURATION
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDIucPhIp0gSLPcmCUTYrY7CJx5LYBzCQU",
  authDomain: "foro-ee8a5.firebaseapp.com",
  databaseURL: "https://foro-ee8a5-default-rtdb.firebaseio.com",
  projectId: "foro-ee8a5",
  storageBucket: "foro-ee8a5.firebasestorage.app",
  messagingSenderId: "548605948271",
  appId: "1:548605948271:web:6d903b2432429d7a04b89a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// ==========================================================================
// GLOBAL STATE & CONSTANTS
// ==========================================================================
let currentStep = 1;
const totalSteps = 5;
let studentName = "";
let examId = ""; // ID created upon submission
let answers = {};
let dbSubmissions = {}; // Realtime store for teacher panel
let selectedSubmissionId = null; // Currently viewed by teacher
const ADMIN_PASS = "profesor123";

// Answer Key for Auto-graded parts
const ANSWER_KEY = {
  q1: "b", // Identificar el problema
  q2: "c", // cout
  q3: "b", // cin
  q4: "c", // int
  q5: "c", // *
  q6: "d", // for
  q7: "B", // int edad; -> Variable
  q8: "A", // cout << "Hola"; -> Salida de datos
  q9: "C", // cin >> edad; -> Entrada de datos
  q10: "D", // if(edad >= 18) -> Condicional
  q15: "8",
  q16: "adulto",
  q17: "5"
};

// ==========================================================================
// INITIALIZATION & AUTHENTICATION
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Setup loading screen
  showLoading("Cargando base de datos...", true);
  
  // Authenticate anonymously
  signInAnonymously(auth)
    .then(() => {
      console.log("Authenticated anonymously in Firebase Auth.");
      showLoading("", false);
      checkExistingSession();
    })
    .catch((error) => {
      console.error("Firebase Anonymous Auth Error:", error);
      showLoading("Error al conectar", true);
      showToast("Error de conexión. Inténtalo recargando la página.", "error");
    });

  // Setup UI Listeners
  setupEventListeners();
});

// Check if student has an active session (draft in localStorage)
function checkExistingSession() {
  const savedName = localStorage.getItem("exam_student_name");
  const savedDraft = localStorage.getItem("exam_answers_draft");
  
  if (savedName) {
    studentName = savedName;
    document.getElementById("student-name").value = studentName;
    document.getElementById("student-badge-name").textContent = studentName;
    
    if (savedDraft) {
      try {
        answers = JSON.parse(savedDraft);
        restoreDraftAnswers();
      } catch (e) {
        console.error("Error parsing saved draft", e);
      }
    }
  }
}

// Restore saved form draft
function restoreDraftAnswers() {
  const form = document.getElementById("exam-form");
  Object.keys(answers).forEach((key) => {
    const value = answers[key];
    const elements = form.elements[key];
    
    if (elements) {
      if (elements.type === "radio" || (elements.length && elements[0].type === "radio")) {
        // Option Radio Tiles
        const radio = form.querySelector(`input[name="${key}"][value="${value}"]`);
        if (radio) radio.checked = true;
      } else {
        // Textareas, Text inputs, Selects
        elements.value = value;
      }
    }
  });
}

// Save draft answer on input change
function saveAnswerToDraft(name, value) {
  answers[name] = value;
  localStorage.setItem("exam_answers_draft", JSON.stringify(answers));
}

// Clear draft from LocalStorage
function clearLocalDraft() {
  localStorage.removeItem("exam_student_name");
  localStorage.removeItem("exam_answers_draft");
}

// ==========================================================================
// NAVIGATION & STEPPER LOGIC
// ==========================================================================
function setupEventListeners() {
  // Welcome Button Click
  document.getElementById("start-exam-btn").addEventListener("click", startExam);
  document.getElementById("student-name").addEventListener("keypress", (e) => {
    if (e.key === "Enter") startExam();
  });

  // Navigation Buttons
  document.getElementById("prev-btn").addEventListener("click", () => navigateStep(-1));
  document.getElementById("next-btn").addEventListener("click", () => navigateStep(1));
  document.getElementById("submit-btn").addEventListener("click", openConfirmModal);

  // Stepper Header Clicking (only allow moving to already unlocked/previous steps)
  document.querySelectorAll(".step").forEach((stepEl) => {
    stepEl.addEventListener("click", () => {
      const targetStep = parseInt(stepEl.getAttribute("data-step"));
      if (studentName && targetStep !== currentStep) {
        goToStep(targetStep);
      }
    });
  });

  // Monitor Form Inputs to Auto-Save drafts
  const form = document.getElementById("exam-form");
  form.addEventListener("input", (e) => {
    const target = e.target;
    if (target.name) {
      saveAnswerToDraft(target.name, target.value);
    }
  });

  // Admin access footer trigger
  document.getElementById("admin-trigger").addEventListener("click", openAdminModal);
  document.getElementById("close-admin-modal-btn").addEventListener("click", closeAdminModal);
  document.getElementById("cancel-admin-btn").addEventListener("click", closeAdminModal);
  document.getElementById("confirm-admin-btn").addEventListener("click", authenticateAdmin);
  document.getElementById("admin-password").addEventListener("keypress", (e) => {
    if (e.key === "Enter") authenticateAdmin();
  });

  // Submit confirmation modal triggers
  document.getElementById("cancel-submit-btn").addEventListener("click", closeConfirmModal);
  document.getElementById("confirm-submit-btn").addEventListener("click", submitExam);

  // Teacher panel listeners
  document.getElementById("logout-teacher-btn").addEventListener("click", logoutTeacher);
  document.getElementById("save-grades-btn").addEventListener("click", saveGrades);
  
  // Grading panel tab controls
  document.querySelectorAll(".g-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".g-tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".g-tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      document.getElementById(`g-tab-content-${tabId}`).classList.add("active");
    });
  });

  // Dynamically update new score preview in grading panel
  document.getElementById("grading-scores-form").addEventListener("input", calculateNewGradingScore);
}

function startExam() {
  const nameInput = document.getElementById("student-name").value.trim();
  const errorEl = document.getElementById("welcome-error");
  
  if (nameInput === "") {
    errorEl.style.display = "flex";
    return;
  }
  
  errorEl.style.display = "none";
  studentName = nameInput;
  localStorage.setItem("exam_student_name", studentName);
  
  // Update header UI
  document.getElementById("student-badge-name").textContent = studentName;
  
  // Switch screen
  switchScreen("welcome-screen", "exam-screen");
  goToStep(1);
  showToast(`¡Bienvenido, ${studentName}! Puedes comenzar tu examen.`, "success");
}

function navigateStep(direction) {
  const targetStep = currentStep + direction;
  if (targetStep >= 1 && targetStep <= totalSteps) {
    goToStep(targetStep);
  }
}

function goToStep(step) {
  // Validate steps bounds
  if (step < 1 || step > totalSteps) return;
  
  // Remove active classes
  document.querySelectorAll(".exam-section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
  
  // Update current step
  currentStep = step;
  
  // Activate target section and step header
  document.getElementById(`section-${step}`).classList.add("active");
  
  // Update stepper headers classes
  for (let i = 1; i <= totalSteps; i++) {
    const stepEl = document.querySelector(`.step[data-step="${i}"]`);
    if (i < step) {
      stepEl.className = "step done";
    } else if (i === step) {
      stepEl.className = "step active";
    } else {
      stepEl.className = "step";
    }
  }

  // Update Progress Bar Indicator
  const progressPercent = (step / totalSteps) * 100;
  document.getElementById("progress-indicator").style.width = `${progressPercent}%`;

  // Update navigation buttons states
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const submitBtn = document.getElementById("submit-btn");

  if (currentStep === 1) {
    prevBtn.disabled = true;
    prevBtn.classList.add("disabled");
  } else {
    prevBtn.disabled = false;
    prevBtn.classList.remove("disabled");
  }

  if (currentStep === totalSteps) {
    nextBtn.classList.add("hidden");
    submitBtn.classList.remove("hidden");
  } else {
    nextBtn.classList.remove("hidden");
    submitBtn.classList.add("hidden");
  }
  
  // Scroll to top of exam container
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ==========================================================================
// EXAM SUBMISSION & GRADING
// ==========================================================================
function openConfirmModal() {
  document.getElementById("confirm-submit-modal").classList.add("open");
}
function closeConfirmModal() {
  document.getElementById("confirm-submit-modal").classList.remove("open");
}

// Core function to grade student answers automatically
function calculateAutoScore() {
  let score = 0;
  
  // Read current answers
  const form = document.getElementById("exam-form");
  const formData = new FormData(form);
  
  // Section I (Q1-Q6)
  for (let i = 1; i <= 6; i++) {
    const key = `q${i}`;
    const ans = formData.get(key);
    if (ans === ANSWER_KEY[key]) {
      score += 1; // 1 point each
    }
  }
  
  // Section II (Q7-Q10)
  for (let i = 7; i <= 10; i++) {
    const key = `q${i}`;
    const ans = formData.get(key);
    if (ans === ANSWER_KEY[key]) {
      score += 2; // 2 points each
    }
  }

  // Section IV (Q15-Q17)
  for (let i = 15; i <= 17; i++) {
    const key = `q${i}`;
    const studentAns = (formData.get(key) || "").trim().toLowerCase();
    const expected = ANSWER_KEY[key];
    
    if (key === "q17") {
      // Allow numerical "5" or text "cinco"
      if (studentAns === "5" || studentAns === "cinco") {
        score += 2;
      }
    } else {
      if (studentAns === expected) {
        score += 2; // 2 points each
      }
    }
  }
  
  return score;
}

function submitExam() {
  closeConfirmModal();
  showLoading("Guardando examen en Firebase...", true);
  
  // Calculate automatic score
  const autoScore = calculateAutoScore();
  
  // Gather answers data
  const form = document.getElementById("exam-form");
  const formData = new FormData(form);
  const studentAnswers = {};
  
  // Capture all fields (1 to 20)
  for (let i = 1; i <= 20; i++) {
    const key = `q${i}`;
    studentAnswers[key] = formData.get(key) || "";
  }
  
  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
  });
  
  // Format submission key safely
  const cleanName = studentName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const submissionKey = `${cleanName}_${timestamp}`;
  
  // Submission payload
  const examPayload = {
    id: submissionKey,
    studentName: studentName,
    timestamp: timestamp,
    dateStr: dateStr,
    status: "Entregado", // "Entregado" / "Calificado"
    autoScore: autoScore,
    manualScore: 0,
    totalScoreRaw: autoScore, // Start with just automatic score
    finalGrade100: Math.round((autoScore / 58) * 100 * 100) / 100, // scaled to 100
    answers: studentAnswers
  };
  
  // Write to Firebase under /temporal
  set(ref(db, `temporal/${submissionKey}`), examPayload)
    .then(() => {
      // Clear drafts
      clearLocalDraft();
      
      // Update success page details
      document.getElementById("final-score-value").textContent = autoScore;
      document.getElementById("summary-student-name").textContent = studentName;
      document.getElementById("summary-date").textContent = dateStr;
      
      // Load celebration confetti script dynamically and fire confetti
      loadConfetti(() => {
        triggerConfettiAnimation();
      });
      
      // Switch screen
      showLoading("", false);
      switchScreen("exam-screen", "success-screen");
    })
    .catch((error) => {
      console.error("Firebase DB Write Error:", error);
      showLoading("", false);
      showToast("Error al guardar examen. Inténtalo de nuevo.", "error");
    });
}

// Load confetti library dynamically
function loadConfetti(callback) {
  if (window.confetti) {
    callback();
    return;
  }
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js";
  script.onload = callback;
  document.body.appendChild(script);
}

function triggerConfettiAnimation() {
  if (window.confetti) {
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      window.confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ["#00b4ff", "#7c3aed", "#00ff88"]
      });
      window.confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ["#00b4ff", "#7c3aed", "#00ff88"]
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }
}

// ==========================================================================
// ADMIN / TEACHER PORTAL LOGIC
// ==========================================================================
function openAdminModal() {
  document.getElementById("admin-password").value = "";
  document.getElementById("admin-error").style.display = "none";
  document.getElementById("admin-modal").classList.add("open");
  setTimeout(() => document.getElementById("admin-password").focus(), 100);
}
function closeAdminModal() {
  document.getElementById("admin-modal").classList.remove("open");
}

function authenticateAdmin() {
  const pwdInput = document.getElementById("admin-password").value;
  const errorEl = document.getElementById("admin-error");
  
  if (pwdInput === ADMIN_PASS) {
    closeAdminModal();
    enterTeacherPanel();
  } else {
    errorEl.style.display = "block";
    document.getElementById("admin-password").focus();
  }
}

function enterTeacherPanel() {
  showLoading("Cargando Panel del Profesor...", true);
  
  // Query all submissions in /temporal
  const temporalRef = ref(db, "temporal");
  
  // Set up real-time listener for submissions list
  onValue(temporalRef, (snapshot) => {
    dbSubmissions = snapshot.val() || {};
    
    // Switch Screen to Teacher Panel
    const activeScreen = document.querySelector(".screen.active");
    if (activeScreen && activeScreen.id !== "teacher-screen") {
      switchScreen(activeScreen.id, "teacher-screen");
    }
    
    showLoading("", false);
    renderSubmissionsList();
    
    // Re-render detail view if active
    if (selectedSubmissionId && dbSubmissions[selectedSubmissionId]) {
      loadSubmissionDetails(selectedSubmissionId);
    }
  }, (error) => {
    console.error("Firebase read error:", error);
    showLoading("", false);
    showToast("Error al leer base de datos.", "error");
  });
}

function logoutTeacher() {
  switchScreen("teacher-screen", "welcome-screen");
  selectedSubmissionId = null;
  // Restore welcome fields
  document.getElementById("student-name").value = "";
  clearLocalDraft();
  studentName = "";
  showToast("Sesión de docente finalizada.", "info");
}

// Render Sidebar of exams
function renderSubmissionsList() {
  const container = document.getElementById("submissions-list");
  const countBadge = document.getElementById("submissions-count");
  
  const entries = Object.entries(dbSubmissions);
  countBadge.textContent = entries.length;
  
  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-sidebar-state">
        <i class="ti ti-notes-off" style="font-size: 24px;"></i>
        <p>No hay entregas registradas aún.</p>
      </div>
    `;
    return;
  }
  
  // Sort submissions by timestamp descending (newest first)
  entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
  
  container.innerHTML = entries.map(([key, sub]) => {
    const activeClass = selectedSubmissionId === key ? "active" : "";
    // CORREGIDO: Verificar que status existe, si no usar "Entregado"
    const statusText = sub.status || "Entregado";
    const statusClass = statusText === "Calificado" ? "calificado" : "entregado";
    // CORREGIDO: Asegurar que finalGrade100 existe
    const gradeDisplay = sub.finalGrade100 !== undefined ? sub.finalGrade100 : "0";
    
    return `
      <div class="sub-item ${activeClass}" onclick="selectSubmission('${key}')">
        <div class="sub-item-info">
          <span class="sub-student-name">${sub.studentName || "Sin nombre"}</span>
          <span class="sub-date">${sub.dateStr || new Date(sub.timestamp).toLocaleString()}</span>
          <span class="sub-status-tag ${statusClass}">${statusText}</span>
        </div>
        <div class="sub-grade-pill">${gradeDisplay}</div>
      </div>
    `;
  }).join("");
}

// Global scope binding for sidebar item click
window.selectSubmission = function(key) {
  selectedSubmissionId = key;
  renderSubmissionsList();
  loadSubmissionDetails(key);
};

// Global helper to fill points easily in panel
window.setPoints = function(inputId, value) {
  const input = document.getElementById(inputId);
  if (input) {
    input.value = value;
    calculateNewGradingScore();
  }
};

// Populate main Workspace panel with details of selected exam
function loadSubmissionDetails(key) {
  const sub = dbSubmissions[key];
  if (!sub) return;
  
  // Show detail view
  document.getElementById("grading-workspace").classList.add("hidden");
  document.getElementById("grading-detail").classList.remove("hidden");
  
  // Fill text fields
  document.getElementById("grade-student-name").textContent = sub.studentName;
  const safeDateStr = sub.dateStr || new Date(sub.timestamp).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  document.getElementById("grade-submission-date").innerHTML = `<i class="ti ti-calendar"></i> Entregado el ${safeDateStr} | ID: <code>${sub.id || key}</code>`;
  document.getElementById("grade-total-score").textContent = sub.finalGrade100;
  document.getElementById("grade-raw-score").textContent = `${sub.totalScoreRaw} / 58 pts brutos`;
  
  // Section Auto Scores details
  const autoS1 = calculateSection1AutoScore(sub.answers);
  const autoS2 = calculateSection2AutoScore(sub.answers);
  const autoS4 = calculateSection4AutoScore(sub.answers);
  
  document.getElementById("summary-section-1-score").textContent = `${autoS1} / 6 pts`;
  document.getElementById("summary-section-2-score").textContent = `${autoS2} / 8 pts`;
  document.getElementById("summary-section-4-score").textContent = `${autoS4} / 6 pts`;
  
  // Section III Explanations Detail Tab
  document.getElementById("ans-q11").textContent = sub.answers.q11 || "— Sin respuesta —";
  document.getElementById("ans-q12").textContent = sub.answers.q12 || "— Sin respuesta —";
  document.getElementById("ans-q13").textContent = sub.answers.q13 || "— Sin respuesta —";
  document.getElementById("ans-q14").textContent = sub.answers.q14 || "— Sin respuesta —";
  
  // Section V Programs Detail Tab
  document.getElementById("ans-q18").textContent = sub.answers.q18 || "// Sin respuesta";
  document.getElementById("ans-q19").textContent = sub.answers.q19 || "// Sin respuesta";
  document.getElementById("ans-q20").textContent = sub.answers.q20 || "// Sin respuesta";

  // Fill in Grading Form Panel Values
  document.getElementById("snippet-q11").textContent = `Respuesta: "${sub.answers.q11 || 'Sin respuesta'}"`;
  document.getElementById("snippet-q12").textContent = `Respuesta: "${sub.answers.q12 || 'Sin respuesta'}"`;
  document.getElementById("snippet-q13").textContent = `Respuesta: "${sub.answers.q13 || 'Sin respuesta'}"`;
  document.getElementById("snippet-q14").textContent = `Respuesta: "${sub.answers.q14 || 'Sin respuesta'}"`;
  
  document.getElementById("snippet-q18").value = sub.answers.q18 || "// Sin respuesta";
  document.getElementById("snippet-q19").value = sub.answers.q19 || "// Sin respuesta";
  document.getElementById("snippet-q20").value = sub.answers.q20 || "// Sin respuesta";
  
  // Load existing manual grades if already graded
  if (sub.status === "Calificado") {
    document.getElementById("score-q11").value = sub.manualGrades?.q11 ?? 0;
    document.getElementById("score-q12").value = sub.manualGrades?.q12 ?? 0;
    document.getElementById("score-q13").value = sub.manualGrades?.q13 ?? 0;
    document.getElementById("score-q14").value = sub.manualGrades?.q14 ?? 0;
    document.getElementById("score-q18").value = sub.manualGrades?.q18 ?? 0;
    document.getElementById("score-q19").value = sub.manualGrades?.q19 ?? 0;
    document.getElementById("score-q20").value = sub.manualGrades?.q20 ?? 0;
  } else {
    // Default to 0
    document.getElementById("score-q11").value = "";
    document.getElementById("score-q12").value = "";
    document.getElementById("score-q13").value = "";
    document.getElementById("score-q14").value = "";
    document.getElementById("score-q18").value = "";
    document.getElementById("score-q19").value = "";
    document.getElementById("score-q20").value = "";
  }
  
  // Initial compute for grading panel score display
  calculateNewGradingScore();
}

// Helpers to isolate scores per section in database object
function calculateSection1AutoScore(stAnswers) {
  let s = 0;
  for (let i = 1; i <= 6; i++) {
    if (stAnswers[`q${i}`] === ANSWER_KEY[`q${i}`]) s += 1;
  }
  return s;
}
function calculateSection2AutoScore(stAnswers) {
  let s = 0;
  for (let i = 7; i <= 10; i++) {
    if (stAnswers[`q${i}`] === ANSWER_KEY[`q${i}`]) s += 2;
  }
  return s;
}
function calculateSection4AutoScore(stAnswers) {
  let s = 0;
  for (let i = 15; i <= 17; i++) {
    const ans = (stAnswers[`q${i}`] || "").trim().toLowerCase();
    if (i === 17) {
      if (ans === "5" || ans === "cinco") s += 2;
    } else {
      if (ans === ANSWER_KEY[`q${i}`]) s += 2;
    }
  }
  return s;
}

// Compute cumulative score dynamically on teacher inputs
function calculateNewGradingScore() {
  if (!selectedSubmissionId || !dbSubmissions[selectedSubmissionId]) return;
  const sub = dbSubmissions[selectedSubmissionId];
  
  const autoScore = sub.autoScore;
  let manualSum = 0;
  
  // Section III
  manualSum += parseFloat(document.getElementById("score-q11").value) || 0;
  manualSum += parseFloat(document.getElementById("score-q12").value) || 0;
  manualSum += parseFloat(document.getElementById("score-q13").value) || 0;
  manualSum += parseFloat(document.getElementById("score-q14").value) || 0;
  
  // Section V
  manualSum += parseFloat(document.getElementById("score-q18").value) || 0;
  manualSum += parseFloat(document.getElementById("score-q19").value) || 0;
  manualSum += parseFloat(document.getElementById("score-q20").value) || 0;
  
  const rawTotal = autoScore + manualSum;
  const grade100 = Math.round((rawTotal / 58) * 100 * 100) / 100;
  
  document.getElementById("new-grade-display").textContent = `${grade100} / 100 (${rawTotal} / 58 pts)`;
}

// Save Manual Grades to Firebase
function saveGrades() {
  if (!selectedSubmissionId) return;
  
  showLoading("Guardando calificación...", true);
  
  const q11 = parseFloat(document.getElementById("score-q11").value) || 0;
  const q12 = parseFloat(document.getElementById("score-q12").value) || 0;
  const q13 = parseFloat(document.getElementById("score-q13").value) || 0;
  const q14 = parseFloat(document.getElementById("score-q14").value) || 0;
  const q18 = parseFloat(document.getElementById("score-q18").value) || 0;
  const q19 = parseFloat(document.getElementById("score-q19").value) || 0;
  const q20 = parseFloat(document.getElementById("score-q20").value) || 0;
  
  const manualScore = q11 + q12 + q13 + q14 + q18 + q19 + q20;
  const sub = dbSubmissions[selectedSubmissionId];
  const totalRaw = sub.autoScore + manualScore;
  const grade100 = Math.round((totalRaw / 58) * 100 * 100) / 100;
  
  const updatePayload = {
    manualScore: manualScore,
    totalScoreRaw: totalRaw,
    finalGrade100: grade100,
    status: "Calificado",
    manualGrades: { q11, q12, q13, q14, q18, q19, q20 }
  };
  
  // Update in Firebase Realtime Database
  update(ref(db, `temporal/${selectedSubmissionId}`), updatePayload)
    .then(() => {
      showLoading("", false);
      showToast("¡Calificación guardada y actualizada con éxito!", "success");
    })
    .catch((error) => {
      console.error("Firebase update error:", error);
      showLoading("", false);
      showToast("Error al actualizar la calificación.", "error");
    });
}

// ==========================================================================
// UTILITY HELPERS
// ==========================================================================
function switchScreen(fromId, toId) {
  const fromEl = document.getElementById(fromId);
  const toEl = document.getElementById(toId);
  
  if (fromEl) {
    fromEl.style.opacity = "0";
    setTimeout(() => {
      fromEl.classList.remove("active");
      if (toEl) {
        toEl.classList.add("active");
        setTimeout(() => {
          toEl.style.opacity = "1";
        }, 50);
      }
    }, 300);
  } else if (toEl) {
    toEl.classList.add("active");
    toEl.style.opacity = "1";
  }
}

function showLoading(text, show) {
  const overlay = document.getElementById("loading-overlay");
  const textEl = document.getElementById("loading-text");
  
  if (show) {
    if (textEl) textEl.textContent = text;
    if (overlay) overlay.classList.add("open");
  } else {
    if (overlay) overlay.classList.remove("open");
  }
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  
  toast.textContent = message;
  toast.className = `toast-alert show ${type}`;
  
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}
