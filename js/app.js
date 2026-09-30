/**
 * ==========================================
 * حلقة الشهيد بلال الخدري - التطبيق الرئيسي
 * ==========================================
 * app.js - Main Application Logic
 */

'use strict';

// Note: EssayAI engine is defined in js/db.js and available globally via window.EssayAI



// ============================================================
// STATE
// ============================================================
let currentExamData = null;    // exam being taken
let currentSession = null;     // { studentId, studentName, examId, answers, startTime }
let examTimerInterval = null;
let examQuestions = [];
let visibilityWarnings = 0;
let MAX_VISIBILITY_WARNINGS = 3;
let currentAdminResultId = null; // for admin detail view

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // تهيئة البيانات الأولية والنموذجية إن لم تكن موجودة
  DB.seedInitialData();

  // Check if admin is logged in from a previous session
  const adminSession = sessionStorage.getItem('blal_admin_session');
  if (adminSession === 'true') {
    showAdminDashboard();
    return;
  }

  // Check if student is in the middle of an exam
  const session = DB.getSession();
  if (session && session.inProgress) {
    resumeExamSession(session);
    return;
  }

  showPage('loginPage');
}

// ============================================================
// PAGE NAVIGATION
// ============================================================
function showPage(pageId) {
  const pages = [
    'loginPage', 'studentLoginPage', 'adminLoginPage',
    'adminDashboard', 'examPage', 'resultPage'
  ];
  pages.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== pageId);
  });
}

function showStudentLogin() {
  showPage('studentLoginPage');
  setTimeout(() => document.getElementById('studentNameInput')?.focus(), 100);
}

function showAdminLogin() {
  showPage('adminLoginPage');
  setTimeout(() => document.getElementById('adminPasswordInput')?.focus(), 100);
}

// ============================================================
// ADMIN LOGIN
// ============================================================
function handleAdminLogin() {
  const username = document.getElementById('adminUsernameInput').value.trim();
  const password = document.getElementById('adminPasswordInput').value.trim();
  const admin = DB.getAdmin();

  if (username === admin.username && password === admin.password) {
    sessionStorage.setItem('blal_admin_session', 'true');
    showAdminDashboard();
  } else {
    showMsg('adminLoginMsg', 'danger', '❌ اسم المستخدم أو كلمة المرور غير صحيحة.');
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const page = getActivePage();
    if (page === 'adminLoginPage') handleAdminLogin();
    if (page === 'studentLoginPage') handleStudentLogin();
  }
});

function getActivePage() {
  const pages = ['loginPage', 'studentLoginPage', 'adminLoginPage', 'adminDashboard', 'examPage', 'resultPage'];
  return pages.find(id => !document.getElementById(id)?.classList.contains('hidden')) || '';
}

function adminLogout() {
  sessionStorage.removeItem('blal_admin_session');
  showPage('loginPage');
}

// ============================================================
// STUDENT LOGIN
// ============================================================
function handleStudentLogin() {
  const name = document.getElementById('studentNameInput').value.trim();
  if (!name) { showMsg('studentLoginMsg', 'warning', '⚠️ يرجى كتابة اسمك الكامل.'); return; }

  const check = DB.canStudentTakeExam(name);

  if (!check.allowed) {
    if (check.reason === 'not_registered') {
      showMsg('studentLoginMsg', 'danger', '🚫 اسمك غير موجود في قائمة الطلاب المسجلين. يرجى التواصل مع المشرف.');
    } else if (check.reason === 'already_taken') {
      showMsg('studentLoginMsg', 'danger', '🔒 لقد أجريت هذا الاختبار مسبقاً. يرجى التواصل مع المشرف لإعادة الاختبار.');
    }
    return;
  }

  const exam = DB.getActiveExam();
  if (!exam) {
    showMsg('studentLoginMsg', 'warning', '📭 لا يوجد اختبار نشط حالياً. يرجى الانتظار.');
    return;
  }

  // Start exam
  startExam(check.student, exam);
}

// ============================================================
// EXAM SESSION
// ============================================================
function startExam(student, exam) {
  currentExamData = exam;
  const session = {
    sessionId: generateId(),
    studentId: student.id,
    studentName: student.name,
    examId: exam.id,
    answers: {},
    startTime: new Date().toISOString(),
    inProgress: true,
  };
  currentSession = session;
  DB.setSession(session);

  buildExamPage(exam, session);
  showPage('examPage');
  requestFullscreen();
  setupAntiCheat();
}

function resumeExamSession(session) {
  const exam = DB.getExamById(session.examId);
  if (!exam) { DB.clearSession(); showPage('loginPage'); return; }

  currentExamData = exam;
  currentSession = session;

  buildExamPage(exam, session, session.answers);
  showPage('examPage');
  requestFullscreen();
  setupAntiCheat();
  showToast('info', '🔄 تم استعادة جلسة الاختبار السابقة.');
}

function buildExamPage(exam, session, savedAnswers = {}) {
  document.getElementById('examNavTitle').textContent = exam.title;
  document.getElementById('examStudentName').textContent = '🎓 ' + session.studentName;

  examQuestions = exam.questions || [];

  let html = '';
  if (exam.instructions) {
    html += `<div class="alert alert-info" style="margin-bottom:1.5rem;">
      <span>📌</span>
      <div><strong>تعليمات الاختبار:</strong><br>${escapeHtml(exam.instructions)}</div>
    </div>`;
  }

  examQuestions.forEach((q, i) => {
    html += buildQuestionHTML(q, i, savedAnswers[q.id]);
  });

  document.getElementById('examQuestionsContainer').innerHTML = html;
  updateProgress();

  // Start timer
  const settings = DB.getSettings();
  if (settings.examDurationMinutes > 0) {
    startTimer(settings.examDurationMinutes * 60);
  } else if (exam.durationMinutes > 0) {
    startTimer(exam.durationMinutes * 60);
  } else {
    document.getElementById('examTimer').innerHTML = '⏱️ غير محدود';
  }

  // Restore saved answers in DOM
  Object.entries(savedAnswers).forEach(([qId, ans]) => {
    restoreAnswerInDOM(qId, ans);
  });
}

function buildQuestionHTML(q, index, savedAnswer) {
  const typeLabel = { mcq: 'اختيار من متعدد', tf: 'صح أو خطأ', fill: 'أكمل الفراغ', essay: 'سؤال مقالي' }[q.type] || q.type;
  const typeBg = { mcq: 'rgba(59,130,246,0.15)', tf: 'rgba(34,197,94,0.12)', fill: 'rgba(245,158,11,0.12)', essay: 'rgba(200,153,31,0.12)' }[q.type];
  const typeColor = { mcq: '#93c5fd', tf: '#86efac', fill: '#fcd34d', essay: '#fcd34d' }[q.type];

  let answerHTML = '';

  switch (q.type) {
    case 'mcq':
      answerHTML = `<div class="mcq-options" data-qid="${q.id}">`;
      (q.options || []).forEach((opt, oi) => {
        answerHTML += `
          <div class="option-item" onclick="selectMCQ('${q.id}', ${oi})" data-opt="${oi}" id="opt-${q.id}-${oi}">
            <div class="option-radio" id="radio-${q.id}-${oi}"></div>
            <span>${escapeHtml(opt)}</span>
          </div>`;
      });
      answerHTML += `</div>`;
      break;

    case 'tf':
      answerHTML = `
        <div class="tf-options">
          <button class="tf-btn" id="tf-${q.id}-true" onclick="selectTF('${q.id}', true)">
            ✅ صحيح
          </button>
          <button class="tf-btn" id="tf-${q.id}-false" onclick="selectTF('${q.id}', false)">
            ❌ خطأ
          </button>
        </div>`;
      break;

    case 'fill':
      answerHTML = `
        <input type="text" class="form-control" id="fill-${q.id}" 
               placeholder="اكتب إجابتك هنا..."
               oninput="saveFillAnswer('${q.id}', this.value)"
               autocomplete="off">`;
      break;

    case 'essay':
      answerHTML = `
        <textarea class="form-control" id="essay-${q.id}" rows="5"
                  placeholder="اكتب إجابتك التفصيلية هنا..."
                  oninput="saveEssayAnswer('${q.id}', this.value)"></textarea>
        <p style="color:var(--text-muted);font-size:0.8rem;margin-top:0.4rem;">💡 سيتم تصحيح هذا السؤال من قبل المشرف</p>`;
      break;
  }

  return `
    <div class="question-card" id="qcard-${q.id}" style="animation:fadeInPage 0.4s ease ${index * 0.05}s both;">
      <div style="display:flex;align-items:flex-start;gap:0.75rem;margin-bottom:1rem;">
        <div class="question-number">${index + 1}</div>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;flex-wrap:wrap;">
            <span style="background:${typeBg};color:${typeColor};padding:2px 10px;border-radius:100px;font-size:0.78rem;font-weight:700;">${typeLabel}</span>
            <span style="background:rgba(200,153,31,0.1);color:var(--secondary);padding:2px 10px;border-radius:100px;font-size:0.78rem;font-weight:700;">${q.score || 1} درجة</span>
          </div>
          <div style="font-size:1.05rem;font-weight:600;line-height:1.6;">${escapeHtml(q.text)}</div>
        </div>
      </div>
      <div class="q-answer-container">
        ${answerHTML}
      </div>
    </div>`;
}

function restoreAnswerInDOM(qId, answer) {
  const q = examQuestions.find(q => q.id === qId);
  if (!q) return;

  if (q.type === 'mcq' && answer !== undefined) {
    selectMCQ(qId, answer, true);
  } else if (q.type === 'tf' && answer !== undefined) {
    selectTF(qId, answer, true);
  } else if (q.type === 'fill') {
    const el = document.getElementById(`fill-${qId}`);
    if (el && answer) el.value = answer;
  } else if (q.type === 'essay') {
    const el = document.getElementById(`essay-${qId}`);
    if (el && answer) el.value = answer;
  }
}

// ============================================================
// ANSWER RECORDING
// ============================================================
function selectMCQ(qId, optIndex, silent = false) {
  // Clear previous
  const q = examQuestions.find(q => q.id === qId);
  if (!q) return;
  (q.options || []).forEach((_, oi) => {
    document.getElementById(`opt-${qId}-${oi}`)?.classList.remove('selected');
    const r = document.getElementById(`radio-${qId}-${oi}`);
    if (r) r.innerHTML = '';
  });
  // Select new
  document.getElementById(`opt-${qId}-${optIndex}`)?.classList.add('selected');
  const r = document.getElementById(`radio-${qId}-${optIndex}`);
  if (r) r.innerHTML = '<div style="width:10px;height:10px;background:#c8991f;border-radius:50%;"></div>';

  saveAnswer(qId, optIndex);
  if (!silent) updateProgress();
}

function selectTF(qId, value, silent = false) {
  const trueBtn = document.getElementById(`tf-${qId}-true`);
  const falseBtn = document.getElementById(`tf-${qId}-false`);
  if (trueBtn) { trueBtn.classList.remove('selected-true'); }
  if (falseBtn) { falseBtn.classList.remove('selected-false'); }

  if (value === true || value === 'true') {
    trueBtn?.classList.add('selected-true');
  } else {
    falseBtn?.classList.add('selected-false');
  }

  saveAnswer(qId, String(value));
  if (!silent) updateProgress();
}

function saveFillAnswer(qId, value) {
  saveAnswer(qId, value);
  updateProgress();
}

function saveEssayAnswer(qId, value) {
  saveAnswer(qId, value);
  updateProgress();
}

function saveAnswer(qId, value) {
  if (!currentSession) return;
  currentSession.answers[qId] = value;
  DB.setSession(currentSession);
}

function updateProgress() {
  if (!examQuestions.length) return;
  const answered = examQuestions.filter(q => {
    const a = currentSession?.answers[q.id];
    return a !== undefined && a !== '' && a !== null;
  }).length;
  const pct = Math.round((answered / examQuestions.length) * 100);
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressLabel').textContent = `${answered} من ${examQuestions.length} سؤال`;
}

// ============================================================
// TIMER
// ============================================================
function startTimer(totalSeconds) {
  let remaining = totalSeconds;
  updateTimerDisplay(remaining);

  examTimerInterval = setInterval(() => {
    remaining--;
    updateTimerDisplay(remaining);

    if (remaining <= 300) {
      document.getElementById('examTimer').classList.add('warning');
    }

    if (remaining <= 0) {
      clearInterval(examTimerInterval);
      showToast('error', '⏰ انتهى وقت الاختبار! سيتم إرسال إجاباتك تلقائياً.');
      setTimeout(() => submitExam(true), 2000);
    }
  }, 1000);
}

function updateTimerDisplay(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const display = h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`;
  document.getElementById('examTimer').innerHTML = `⏱️ ${display}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ============================================================
// ANTI-CHEAT
// ============================================================
function requestFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (fn) fn.call(el).catch(() => {});
}

function setupAntiCheat() {
  visibilityWarnings = 0;

  // Prevent right click
  document.addEventListener('contextmenu', preventDefault);
  // Prevent copy
  document.addEventListener('copy', preventDefault);
  // Prevent keyboard shortcuts
  document.addEventListener('keydown', blockShortcuts);

  // Visibility change (tab switch / minimize)
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Fullscreen change
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
}

function teardownAntiCheat() {
  document.removeEventListener('contextmenu', preventDefault);
  document.removeEventListener('copy', preventDefault);
  document.removeEventListener('keydown', blockShortcuts);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
}

function preventDefault(e) { e.preventDefault(); }

function blockShortcuts(e) {
  // Block common cheating shortcuts
  const blocked = [
    e.ctrlKey && ['c','v','a','p','s','u','f5'].includes(e.key.toLowerCase()),
    e.key === 'F12',
    e.key === 'F11' && !document.fullscreenElement,
    e.altKey && e.key === 'Tab',
    e.metaKey,
  ];
  if (blocked.some(Boolean)) e.preventDefault();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    const settings = DB.getSettings();
    if (settings.autoSubmitOnExit && currentSession?.inProgress) {
      // Auto-submit after brief delay
      setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          submitExam(true);
        }
      }, 3000);
    }
  }
}

function handleFullscreenChange() {
  // Check if browser/platform supports fullscreen API (e.g. iOS Safari does not)
  const isSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  if (!isSupported) return;

  // Don't trigger if user is currently typing in input/textarea (mobile virtual keyboard)
  const activeEl = document.activeElement;
  const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
  if (isTyping) return;

  const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const banner = document.getElementById('fullscreenBanner');

  if (!isFullscreen && getActivePage() === 'examPage') {
    if (banner) banner.classList.remove('hidden');
    visibilityWarnings++;

    if (visibilityWarnings >= MAX_VISIBILITY_WARNINGS) {
      const settings = DB.getSettings();
      if (settings.autoSubmitOnExit) {
        showToast('error', '⚠️ تم اكتشاف خروجك من الشاشة الكاملة. سيتم إرسال الاختبار تلقائياً.');
        setTimeout(() => submitExam(true), 3000);
      }
    } else {
      showToast('error', `⚠️ تحذير ${visibilityWarnings}/${MAX_VISIBILITY_WARNINGS}: عد إلى وضع الشاشة الكاملة!`);
    }
  } else {
    if (banner) banner.classList.add('hidden');
  }
}

// ============================================================
// SUBMIT EXAM
// ============================================================
function confirmSubmitExam() {
  const answered = examQuestions.filter(q => {
    const a = currentSession?.answers[q.id];
    return a !== undefined && a !== '' && a !== null;
  }).length;
  const unanswered = examQuestions.length - answered;

  document.getElementById('confirmSubmitInfo').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.5rem;">
      <div>✅ أجبت على: <strong style="color:var(--success)">${answered} سؤال</strong></div>
      ${unanswered > 0 ? `<div>⚠️ لم تجب على: <strong style="color:var(--warning)">${unanswered} سؤال</strong></div>` : ''}
    </div>`;

  openModal('confirmSubmitModal');
}

async function submitExam(auto = false) {
  closeModal('confirmSubmitModal');
  clearInterval(examTimerInterval);
  teardownAntiCheat();

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  if (!currentSession || !currentExamData) { showPage('loginPage'); return; }

  const gradeData = gradeExam(currentExamData, currentSession.answers);

  const result = {
    id: generateId(),
    examId: currentExamData.id,
    examTitle: currentExamData.title,
    studentId: currentSession.studentId,
    studentName: currentSession.studentName,
    answers: currentSession.answers,
    gradeData,
    startedAt: currentSession.startTime,
    submittedAt: new Date().toISOString(),
    autoSubmitted: auto,
    status: 'graded',           // الذكاء الاصطناعي يصحح المقالي تلقائياً
    aiGradedEssay: gradeData.hasEssay,
  };

  // Save result
  DB.saveResult(result);

  // Mark student as done
  DB.markStudentExamTaken(currentSession.studentId);

  // Clear session
  DB.clearSession();
  currentSession = null;

  // Show result
  showResultPage(result, currentExamData);
  currentExamData = null;
}

// ============================================================
// RESULT PAGE
// ============================================================
function showResultPage(result, exam) {
  const pct = result.gradeData.percentage;
  document.getElementById('resultStudentName').textContent = '🎓 ' + result.studentName;
  document.getElementById('resultPct').textContent = pct + '%';
  document.getElementById('resultScore').textContent = `${result.gradeData.earnedScore} / ${result.gradeData.totalScore}`;

  // Score circle
  const circle = document.getElementById('resultScoreCircle');
  circle.style.setProperty('--pct', `${pct * 3.6}deg`);

  // Grade badge
  const grade = getGrade(pct);
  document.getElementById('resultGradeBadge').innerHTML = `
    <span class="badge badge-${pct >= 60 ? 'success' : 'danger'}" style="font-size:1rem;padding:0.4rem 1.2rem;">
      ${grade.label}
    </span>`;

  // Details
  let detailsHTML = '';
  result.gradeData.details.forEach((d, i) => {
    const typeLabel = { mcq: 'اختيار', tf: 'صح/خطأ', fill: 'فراغ', essay: 'مقالي' }[d.type] || d.type;
    let statusHTML = '';
    if (d.type === 'essay') {
      const pct = d.aiFeedback ? (d.aiFeedback.match(/\((\d+)%\)/) || [])[1] : null;
      const pctColor = pct >= 65 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
      statusHTML = `<span class="badge" style="background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.3);">🤖 ذكاء اصطناعي</span>`;
    } else if (d.isCorrect) {
      statusHTML = '<span class="badge badge-success">✓ صحيح</span>';
    } else {
      statusHTML = '<span class="badge badge-danger">✗ خطأ</span>';
    }

    const saText = d.type === 'tf'
      ? (d.studentAnswer === 'true' ? '✅ صحيح' : d.studentAnswer === 'false' ? '❌ خطأ' : 'لم يجب')
      : (d.studentAnswer ?? '<em style="color:var(--text-muted)">لم يجب</em>');

    const caText = d.type === 'tf'
      ? (d.correctAnswer === 'true' || d.correctAnswer === true ? '✅ صحيح' : '❌ خطأ')
      : d.correctAnswer;

    detailsHTML += `
      <div class="question-card" style="margin-bottom:0.75rem;">
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem;flex-wrap:wrap;">
          <div class="question-number">${i + 1}</div>
          <span class="badge badge-info">${typeLabel}</span>
          ${statusHTML}
          <span style="margin-right:auto;color:var(--secondary);font-weight:700;font-size:0.85rem;">${d.earnedPoints}/${d.score}</span>
        </div>
        <div style="font-weight:600;margin-bottom:0.6rem;">${escapeHtml(d.questionText)}</div>
        <div style="font-size:0.88rem;color:var(--text-secondary);">
          <div>📝 إجابتك: <span style="color:${d.isCorrect ? 'var(--success)' : d.type === 'essay' ? '#a78bfa' : 'var(--danger)'}">${escapeHtml(String(saText))}</span></div>
          ${d.type === 'essay' && d.aiFeedback ? `
            <div style="margin-top:0.4rem;padding:0.5rem 0.75rem;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.25);border-radius:6px;font-size:0.83rem;color:#c4b5fd;">
              🤖 <strong>تصحيح الذكاء الاصطناعي ومطابقة البحث:</strong> ${escapeHtml(d.aiFeedback)}
            </div>` : ''}
          ${d.type === 'essay' && d.correctAnswer ? `
            <div style="margin-top:0.35rem;font-size:0.83rem;color:var(--text-muted);">
              💡 <strong>الإجابة النموذجية:</strong> <span style="color:var(--text-secondary);">${escapeHtml(String(d.correctAnswer))}</span>
            </div>` : ''}
          ${d.type !== 'essay' ? `<div>✅ الإجابة الصحيحة: <span style="color:var(--success)">${escapeHtml(String(caText ?? ''))}</span></div>` : ''}
        </div>
      </div>`;
  });

  document.getElementById('resultDetails').innerHTML = detailsHTML;

  // Store for PDF generation
  window._lastResult = result;
  window._lastExam = exam;

  showPage('resultPage');

  if (auto) {
    showToast('info', '📤 تم إرسال إجاباتك تلقائياً إلى لوحة التحكم.');
  }
}

async function downloadResult() {
  const result = window._lastResult;
  const exam = window._lastExam;
  if (!result || !exam) return;

  const student = DB.findStudentByName(result.studentName) || { name: result.studentName };
  const { htmlContent } = await generateResultPDF(result, exam, student);
  downloadHTMLAsFile(htmlContent, `نتيجة_${result.studentName}_${exam.title}.html`);
  showToast('success', '✅ تم تحميل ملف النتيجة بنجاح!');
}

async function printResult() {
  const result = window._lastResult;
  const exam = window._lastExam;
  if (!result || !exam) return;

  const student = DB.findStudentByName(result.studentName) || { name: result.studentName };
  const { htmlContent } = await generateResultPDF(result, exam, student);
  printOrDownloadHTML(htmlContent, `نتيجة_${result.studentName}`);
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
function showAdminDashboard() {
  showPage('adminDashboard');
  loadSettings();
  showAdminSection('overview');
}

function showAdminSection(section) {
  const sections = ['overview', 'exams', 'students', 'results', 'settings'];
  sections.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    const nav = document.getElementById(`nav-${s}`);
    if (el) el.classList.toggle('hidden', s !== section);
    if (nav) nav.classList.toggle('active', s === section);
  });

  if (section === 'overview') loadOverview();
  if (section === 'exams') loadExamsList();
  if (section === 'students') loadStudentsList();
  if (section === 'results') {
    populateResultsFilter();
    loadResults();
  }
}

// ---- Overview ----
function loadOverview() {
  const exams = DB.getExams();
  const students = DB.getStudents();
  const results = DB.getResults();

  document.getElementById('stat-exams').textContent = exams.length;
  document.getElementById('stat-students').textContent = students.length;
  document.getElementById('stat-results').textContent = results.length;

  const avg = results.length
    ? Math.round(results.reduce((a, r) => a + (r.gradeData?.percentage || 0), 0) / results.length)
    : '-';
  document.getElementById('stat-avg').textContent = avg !== '-' ? avg + '%' : '-';

  // Active exam
  const active = DB.getActiveExam();
  if (active) {
    document.getElementById('activeExamContent').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
        <div>
          <div style="font-weight:800;font-size:1.1rem;">${escapeHtml(active.title)}</div>
          <div style="color:var(--text-muted);font-size:0.85rem;">${escapeHtml(active.subject || '')} | ${active.questions?.length || 0} سؤال</div>
        </div>
        <div style="display:flex;gap:0.5rem;">
          <span class="badge badge-success">🟢 نشط</span>
          <button class="btn btn-sm btn-danger" onclick="deactivateExam()">إيقاف الاختبار</button>
        </div>
      </div>`;
  } else {
    document.getElementById('activeExamContent').innerHTML = `<p style="color:var(--text-muted)">لا يوجد اختبار نشط حالياً. <a href="#" onclick="showAdminSection('exams')" style="color:var(--secondary)">انقر هنا لتفعيل اختبار</a></p>`;
  }

  // Recent results
  const recent = [...results].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 5);
  if (recent.length) {
    document.getElementById('recentResultsWidget').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>الطالب</th><th>الاختبار</th><th>النتيجة</th><th>التاريخ</th><th>إجراء</th></tr></thead>
          <tbody>
            ${recent.map(r => `
              <tr>
                <td>${escapeHtml(r.studentName)}</td>
                <td>${escapeHtml(r.examTitle)}</td>
                <td><span class="badge badge-${r.gradeData?.percentage >= 60 ? 'success' : 'danger'}">${r.gradeData?.percentage || 0}%</span></td>
                <td style="font-size:0.8rem;color:var(--text-muted);">${formatDate(r.submittedAt)}</td>
                <td><button class="btn btn-sm btn-outline" onclick="viewResult('${r.id}')">عرض</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } else {
    document.getElementById('recentResultsWidget').innerHTML = `<p style="color:var(--text-muted)">لا توجد نتائج بعد.</p>`;
  }
}

// ---- Exams List ----
function loadExamsList() {
  const exams = DB.getExams();
  const container = document.getElementById('examsList');

  if (!exams.length) {
    container.innerHTML = `<p style="color:var(--text-muted)">لا توجد اختبارات بعد. ابدأ بإنشاء اختبار جديد.</p>`;
    return;
  }

  container.innerHTML = exams.map(exam => {
    const resultsCount = DB.getResultsByExam(exam.id).length;
    return `
      <div class="card" style="margin-bottom:1rem;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;flex-wrap:wrap;">
              <h3 style="font-size:1.1rem;">${escapeHtml(exam.title)}</h3>
              ${exam.active ? '<span class="badge badge-success">🟢 نشط</span>' : '<span class="badge badge-warning">⏸ معطل</span>'}
              ${exam.status === 'draft' ? '<span class="badge badge-info">مسودة</span>' : ''}
            </div>
            <div style="color:var(--text-muted);font-size:0.85rem;display:flex;gap:1rem;flex-wrap:wrap;">
              <span>📚 ${escapeHtml(exam.subject || 'غير محدد')}</span>
              <span>❓ ${exam.questions?.length || 0} سؤال</span>
              <span>📊 ${resultsCount} نتيجة</span>
              <span>📅 ${formatDate(exam.createdAt)}</span>
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            ${!exam.active
              ? `<button class="btn btn-sm btn-primary" onclick="activateExam('${exam.id}')">🟢 تفعيل</button>`
              : `<button class="btn btn-sm btn-danger" onclick="deactivateExam()">⏸ إيقاف</button>`}
            <button class="btn btn-sm btn-outline" onclick="editExam('${exam.id}')">✏️ تعديل</button>
            <button class="btn btn-sm btn-danger" onclick="deleteExam('${exam.id}')">🗑️ حذف</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ---- Students ----
function loadStudentsList() {
  const students = DB.getStudents();
  const container = document.getElementById('studentsList');

  if (!students.length) {
    container.innerHTML = `<p style="color:var(--text-muted)">لا يوجد طلاب مسجلون بعد.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>الاسم</th><th>تاريخ الإضافة</th><th>حالة الاختبار</th><th>آخر اختبار</th><th>إجراءات</th></tr>
        </thead>
        <tbody>
          ${students.map(s => `
            <tr>
              <td style="font-weight:700;">${escapeHtml(s.name)}</td>
              <td style="font-size:0.8rem;color:var(--text-muted);">${formatDate(s.addedAt)}</td>
              <td>
                ${s.examTaken
                  ? `<span class="badge badge-${s.allowRetake ? 'warning' : 'success'}">${s.allowRetake ? '🔄 يُسمح بإعادة' : '✅ أدّى الاختبار'}</span>`
                  : '<span class="badge badge-info">⏳ لم يؤدِّ بعد</span>'}
              </td>
              <td style="font-size:0.8rem;color:var(--text-muted);">${s.lastExamAt ? formatDate(s.lastExamAt) : '-'}</td>
              <td>
                <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                  ${s.examTaken && !s.allowRetake
                    ? `<button class="btn btn-sm btn-primary" onclick="allowRetake('${s.id}')">🔄 إعادة</button>`
                    : ''}
                  <button class="btn btn-sm btn-danger" onclick="deleteStudent('${s.id}')">🗑️</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function openAddStudentModal() {
  document.getElementById('newStudentName').value = '';
  openModal('addStudentModal');
  setTimeout(() => document.getElementById('newStudentName').focus(), 100);
}

function addStudent() {
  const name = document.getElementById('newStudentName').value.trim();
  if (!name) { showToast('error', 'يرجى كتابة اسم الطالب.'); return; }
  const result = DB.addStudent(name);
  if (!result) { showToast('error', '⚠️ الطالب موجود بالفعل.'); return; }
  closeModal('addStudentModal');
  loadStudentsList();
  showToast('success', `✅ تم إضافة الطالب: ${name}`);
}

function addBulkStudents() {
  const raw = document.getElementById('bulkStudentsInput').value.trim();
  if (!raw) return;
  const names = raw.split('\n').map(n => n.trim()).filter(Boolean);
  let added = 0;
  names.forEach(name => { if (DB.addStudent(name)) added++; });
  document.getElementById('bulkStudentsInput').value = '';
  loadStudentsList();
  showToast('success', `✅ تم إضافة ${added} طالب.`);
}

function deleteStudent(id) {
  if (!confirm('هل تريد حذف هذا الطالب؟')) return;
  DB.deleteStudent(id);
  loadStudentsList();
  showToast('success', '🗑️ تم حذف الطالب.');
}

function allowRetake(studentId) {
  DB.updateStudent(studentId, { allowRetake: true });
  loadStudentsList();
  showToast('success', '🔄 تم السماح بإعادة الاختبار.');
}

// ---- Results ----
function populateResultsFilter() {
  const sel = document.getElementById('resultsFilterExam');
  sel.innerHTML = '<option value="">جميع الاختبارات</option>';
  DB.getExams().forEach(e => {
    sel.innerHTML += `<option value="${e.id}">${escapeHtml(e.title)}</option>`;
  });
}

function loadResults() {
  const filterExam = document.getElementById('resultsFilterExam')?.value;
  let results = DB.getResults();
  if (filterExam) results = results.filter(r => r.examId === filterExam);
  results.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  const container = document.getElementById('resultsList');

  if (!results.length) {
    container.innerHTML = `<p style="color:var(--text-muted)">لا توجد نتائج.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>الطالب</th><th>الاختبار</th><th>الدرجة</th><th>النسبة</th><th>الحالة</th><th>التاريخ</th><th>إجراءات</th></tr>
        </thead>
        <tbody>
          ${results.map(r => `
            <tr>
              <td style="font-weight:700;">${escapeHtml(r.studentName)}</td>
              <td>${escapeHtml(r.examTitle)}</td>
              <td style="font-weight:700;">${r.gradeData?.earnedScore || 0} / ${r.gradeData?.totalScore || 0}</td>
              <td><span class="badge badge-${(r.gradeData?.percentage || 0) >= 60 ? 'success' : 'danger'}">${r.gradeData?.percentage || 0}%</span></td>
              <td>${r.autoSubmitted ? '<span class="badge badge-warning">تلقائي</span>' : '<span class="badge badge-primary">يدوي</span>'}</td>
              <td style="font-size:0.8rem;color:var(--text-muted);">${formatDate(r.submittedAt)}</td>
              <td>
                <div style="display:flex;gap:0.4rem;">
                  <button class="btn btn-sm btn-outline" onclick="viewResult('${r.id}')">👁️ عرض</button>
                  ${r.gradeData?.hasEssay ? `<button class="btn btn-sm btn-primary" onclick="gradeEssay('${r.id}')">✏️ تصحيح</button>` : ''}
                  <button class="btn btn-sm btn-danger" onclick="deleteResult('${r.id}')">🗑️</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function viewResult(resultId) {
  const result = DB.getResults().find(r => r.id === resultId);
  if (!result) return;
  const exam = DB.getExamById(result.examId) || { title: result.examTitle, questions: [] };
  currentAdminResultId = resultId;

  document.getElementById('resultDetailTitle').textContent = `📋 نتيجة: ${result.studentName}`;

  let detailsHTML = `
    <div class="card" style="margin-bottom:1rem;text-align:center;">
      <div style="font-size:2.5rem;font-weight:900;color:var(--secondary);">${result.gradeData?.percentage || 0}%</div>
      <div style="color:var(--text-muted);">${result.gradeData?.earnedScore || 0} / ${result.gradeData?.totalScore || 0} درجة</div>
      <div style="margin-top:0.5rem;">${getGrade(result.gradeData?.percentage || 0).label}</div>
    </div>
    <div style="margin-bottom:1rem;font-size:0.85rem;color:var(--text-muted);display:flex;gap:1rem;flex-wrap:wrap;">
      <span>📅 ${formatDate(result.submittedAt)}</span>
      ${result.autoSubmitted ? '<span class="badge badge-warning">إرسال تلقائي</span>' : ''}
    </div>`;

  (result.gradeData?.details || []).forEach((d, i) => {
    const saText = d.type === 'tf'
      ? (d.studentAnswer === 'true' ? '✅ صحيح' : d.studentAnswer === 'false' ? '❌ خطأ' : 'لم يجب')
      : (d.studentAnswer ?? 'لم يجب');

    const statusIcon = d.type === 'essay' ? '📝' : d.isCorrect ? '✅' : '❌';

    detailsHTML += `
      <div class="question-card" style="margin-bottom:0.5rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;flex-wrap:wrap;">
          <span class="question-number">${i + 1}</span>
          <span style="font-size:0.9rem;">${statusIcon}</span>
          <span class="badge badge-gold">${d.earnedPoints}/${d.score}</span>
          ${d.type === 'essay' ? '<span class="badge" style="background:rgba(139,92,246,0.15);color:#a78bfa;">🤖 ذكاء اصطناعي</span>' : ''}
        </div>
        <div style="font-size:0.9rem;font-weight:600;margin-bottom:0.4rem;">${escapeHtml(d.questionText)}</div>
        <div style="font-size:0.85rem;color:var(--text-secondary);">إجابة الطالب: <strong>${escapeHtml(String(saText))}</strong></div>
        ${d.type === 'essay' && d.aiFeedback ? `<div style="font-size:0.83rem;color:#a78bfa;margin-top:3px;padding:3px 6px;background:rgba(139,92,246,0.08);border-radius:4px;">🤖 تقييم الذكاء الاصطناعي: <strong>${escapeHtml(d.aiFeedback)}</strong></div>` : ''}
        ${d.type === 'essay' && d.correctAnswer ? `<div style="font-size:0.83rem;color:var(--text-muted);margin-top:2px;">💡 الإجابة النموذجية: ${escapeHtml(String(d.correctAnswer))}</div>` : ''}
        ${d.type !== 'essay' ? `<div style="font-size:0.85rem;color:var(--success);">الصحيحة: <strong>${escapeHtml(String(d.correctAnswer ?? ''))}</strong></div>` : ''}
      </div>`;
  });

  document.getElementById('resultDetailContent').innerHTML = detailsHTML;
  openModal('resultDetailModal');
}

async function downloadResultFromAdmin() {
  if (!currentAdminResultId) return;
  const result = DB.getResults().find(r => r.id === currentAdminResultId);
  if (!result) return;
  const exam = DB.getExamById(result.examId) || { title: result.examTitle, questions: [] };
  const student = { name: result.studentName };
  const { htmlContent } = await generateResultPDF(result, exam, student);
  downloadHTMLAsFile(htmlContent, `نتيجة_${result.studentName}_${exam.title}.html`);
  showToast('success', '✅ تم تحميل ملف النتيجة.');
}

function deleteResult(id) {
  if (!confirm('هل تريد حذف هذه النتيجة؟')) return;
  DB.deleteResult(id);
  loadResults();
  showToast('success', '🗑️ تم حذف النتيجة.');
}

function exportResults() {
  const results = DB.getResults();
  if (!results.length) { showToast('error', 'لا توجد نتائج للتصدير.'); return; }

  const csv = [
    ['الطالب', 'الاختبار', 'الدرجة', 'النسبة', 'التاريخ'].join(','),
    ...results.map(r =>
      [`"${r.studentName}"`, `"${r.examTitle}"`,
       `${r.gradeData?.earnedScore}/${r.gradeData?.totalScore}`,
       `${r.gradeData?.percentage}%`,
       formatDate(r.submittedAt)].join(',')
    )
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'نتائج_الاختبار.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('success', '✅ تم تصدير النتائج.');
}

function gradeEssay(resultId) {
  const result = DB.getResults().find(r => r.id === resultId);
  if (!result) return;

  const essayDetails = (result.gradeData?.details || []).filter(d => d.type === 'essay');
  if (!essayDetails.length) return;

  let html = `<p style="color:var(--text-muted);margin-bottom:1rem;">قم بإدخال درجة كل سؤال مقالي:</p>`;
  essayDetails.forEach((d, i) => {
    html += `
      <div class="question-card" style="margin-bottom:1rem;">
        <div style="font-weight:700;margin-bottom:0.5rem;">${i + 1}. ${escapeHtml(d.questionText)}</div>
        <div style="background:rgba(255,255,255,0.04);padding:0.75rem;border-radius:var(--radius-sm);margin-bottom:0.75rem;font-size:0.9rem;">
          <strong>إجابة الطالب:</strong><br>${escapeHtml(String(d.studentAnswer || 'لم يجب'))}
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <label class="form-label" style="margin:0;white-space:nowrap;">الدرجة (من ${d.score}):</label>
          <input type="number" class="form-control" style="max-width:100px;" 
                 id="essay-grade-${d.questionId}" 
                 min="0" max="${d.score}" value="${d.earnedPoints}" step="0.5">
        </div>
      </div>`;
  });

  html += `
    <div style="display:flex;gap:1rem;justify-content:flex-end;margin-top:1rem;">
      <button class="btn btn-outline" onclick="closeModal('essayGradeModal')">إلغاء</button>
      <button class="btn btn-gold" onclick="saveEssayGrades('${resultId}')">💾 حفظ الدرجات</button>
    </div>`;

  document.getElementById('essayGradeContent').innerHTML = html;
  openModal('essayGradeModal');
}

function saveEssayGrades(resultId) {
  const result = DB.getResults().find(r => r.id === resultId);
  if (!result) return;

  let totalEarned = 0;
  result.gradeData.details.forEach(d => {
    if (d.type === 'essay') {
      const input = document.getElementById(`essay-grade-${d.questionId}`);
      const pts = parseFloat(input?.value || 0);
      d.earnedPoints = Math.min(Math.max(0, pts), d.score);
      d.isCorrect = d.earnedPoints > 0;
    }
    totalEarned += d.earnedPoints;
  });

  result.gradeData.earnedScore = totalEarned;
  result.gradeData.percentage = Math.round((totalEarned / result.gradeData.totalScore) * 100);
  result.status = 'graded';

  DB.saveResult(result);
  closeModal('essayGradeModal');
  loadResults();
  showToast('success', '✅ تم حفظ درجات الأسئلة المقالية.');
}

// ---- Exam Management ----
function activateExam(id) {
  DB.setActiveExam(id);
  loadExamsList();
  loadOverview();
  showToast('success', '🟢 تم تفعيل الاختبار.');
}

function deactivateExam() {
  DB.deactivateAllExams();
  loadExamsList();
  loadOverview();
  showToast('info', '⏸ تم إيقاف الاختبار النشط.');
}

function deleteExam(id) {
  if (!confirm('هل تريد حذف هذا الاختبار؟ ستُحذف جميع نتائجه أيضاً.')) return;
  DB.deleteExam(id);
  loadExamsList();
  showToast('success', '🗑️ تم حذف الاختبار.');
}

function editExam(id) {
  const exam = DB.getExamById(id);
  if (!exam) return;
  openCreateExamModal(exam);
}

// ---- Settings ----
function loadSettings() {
  const s = DB.getSettings();
  document.getElementById('settingDuration').value = s.examDurationMinutes || 0;
  document.getElementById('settingAutoSubmit').checked = s.autoSubmitOnExit !== false;
  document.getElementById('settingShowScore').checked = s.showScoreImmediately !== false;
}

function saveSettings() {
  const settings = {
    examDurationMinutes: parseInt(document.getElementById('settingDuration').value) || 0,
    autoSubmitOnExit: document.getElementById('settingAutoSubmit').checked,
    showScoreImmediately: document.getElementById('settingShowScore').checked,
  };
  DB.saveSettings(settings);

  // Change admin password if provided
  const newPwd = document.getElementById('newAdminPassword').value.trim();
  const confirmPwd = document.getElementById('confirmAdminPassword').value.trim();
  if (newPwd) {
    if (newPwd !== confirmPwd) { showToast('error', '❌ كلمتا المرور غير متطابقتين.'); return; }
    if (newPwd.length < 6) { showToast('error', '❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل.'); return; }
    const admin = DB.getAdmin();
    DB.setAdmin({ ...admin, password: newPwd });
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('confirmAdminPassword').value = '';
  }

  showToast('success', '💾 تم حفظ الإعدادات بنجاح.');
}

// ============================================================
// EXAM BUILDER
// ============================================================
let builderQuestions = [];
let editingExamId = null;

function openCreateExamModal(existingExam = null) {
  builderQuestions = [];
  editingExamId = null;

  document.getElementById('examTitle').value = '';
  document.getElementById('examSubject').value = '';
  document.getElementById('examInstructions').value = '';
  document.getElementById('questionsList').innerHTML = '';
  document.getElementById('editingExamId').value = '';
  document.getElementById('examModalTitle').textContent = '📝 إنشاء اختبار جديد';
  document.getElementById('noQuestionsMsg').classList.remove('hidden');

  if (existingExam) {
    editingExamId = existingExam.id;
    document.getElementById('editingExamId').value = existingExam.id;
    document.getElementById('examTitle').value = existingExam.title || '';
    document.getElementById('examSubject').value = existingExam.subject || '';
    document.getElementById('examInstructions').value = existingExam.instructions || '';
    document.getElementById('examModalTitle').textContent = '✏️ تعديل الاختبار';

    builderQuestions = (existingExam.questions || []).map(q => ({ ...q }));
    renderAllQuestions();
  }

  openModal('createExamModal');
}

function addQuestion(type) {
  const q = {
    id: generateId(),
    type,
    text: '',
    score: 1,
    options: type === 'mcq' ? ['', '', '', ''] : undefined,
    correctOption: type === 'mcq' ? 0 : undefined,
    correctAnswer: type === 'tf' ? 'true' : (type === 'fill' ? '' : undefined),
    modelAnswer: type === 'essay' ? '' : undefined,
    keywords: type === 'essay' ? '' : undefined,
  };
  builderQuestions.push(q);
  document.getElementById('noQuestionsMsg').classList.add('hidden');
  renderAllQuestions();

  // Scroll to new question
  setTimeout(() => {
    const el = document.getElementById(`bq-${q.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function renderAllQuestions() {
  const container = document.getElementById('questionsList');
  if (!builderQuestions.length) {
    document.getElementById('noQuestionsMsg').classList.remove('hidden');
    container.innerHTML = '';
    return;
  }
  document.getElementById('noQuestionsMsg').classList.add('hidden');
  container.innerHTML = builderQuestions.map((q, i) => buildQuestionBuilderHTML(q, i)).join('');
}

function buildQuestionBuilderHTML(q, index) {
  const typeLabel = { mcq: '🔵 اختيار من متعدد', tf: '🟢 صح أو خطأ', fill: '🟡 إكمال فراغ', essay: '🟠 مقالي' }[q.type];
  const typeBg = { mcq: 'rgba(59,130,246,0.1)', tf: 'rgba(34,197,94,0.1)', fill: 'rgba(245,158,11,0.1)', essay: 'rgba(200,153,31,0.1)' }[q.type];

  let specificHTML = '';

  switch (q.type) {
    case 'mcq':
      specificHTML = `
        <div style="margin-top:0.75rem;">
          <label class="form-label">الخيارات (اختر الصحيح بالنقر على ✓):</label>
          ${(q.options || ['', '', '', '']).map((opt, oi) => `
            <div class="option-input-row" id="mcq-opt-row-${q.id}-${oi}">
              <span style="font-weight:700;color:var(--text-muted);min-width:20px;">${oi + 1}.</span>
              <input type="text" class="form-control" value="${escapeHtmlAttr(opt)}"
                     placeholder="الخيار ${oi + 1}" 
                     oninput="updateOption('${q.id}', ${oi}, this.value)">
              <button class="btn btn-sm ${q.correctOption === oi ? 'btn-primary' : 'btn-outline'}"
                      onclick="setCorrectOption('${q.id}', ${oi})"
                      title="تعيين كإجابة صحيحة">
                ${q.correctOption === oi ? '✓ صحيح' : '○'}
              </button>
              <button class="btn btn-icon btn-danger btn-sm" onclick="removeOption('${q.id}', ${oi})" ${(q.options || []).length <= 2 ? 'disabled' : ''}>✕</button>
            </div>`).join('')}
          <button class="btn btn-sm btn-outline" onclick="addOption('${q.id}')" style="margin-top:0.5rem;">+ إضافة خيار</button>
        </div>`;
      break;

    case 'tf':
      specificHTML = `
        <div style="margin-top:0.75rem;">
          <label class="form-label">الإجابة الصحيحة:</label>
          <div style="display:flex;gap:0.75rem;">
            <button class="btn btn-sm ${q.correctAnswer === 'true' ? 'btn-primary' : 'btn-outline'}"
                    onclick="setTFAnswer('${q.id}', 'true')">✅ صحيح</button>
            <button class="btn btn-sm ${q.correctAnswer === 'false' ? 'btn-primary' : 'btn-outline'}"
                    onclick="setTFAnswer('${q.id}', 'false')">❌ خطأ</button>
          </div>
        </div>`;
      break;

    case 'fill':
      specificHTML = `
        <div style="margin-top:0.75rem;">
          <label class="form-label">الإجابة الصحيحة (الكلمة المطلوبة):</label>
          <input type="text" class="form-control" value="${escapeHtmlAttr(q.correctAnswer || '')}"
                 placeholder="الإجابة النموذجية"
                 oninput="setFillAnswer('${q.id}', this.value)">
        </div>`;
      break;

    case 'essay':
      specificHTML = `
        <div style="margin-top:0.75rem;">
          <div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.25);border-radius:8px;padding:0.75rem;margin-bottom:0.75rem;">
            <div style="color:#c4b5fd;font-weight:700;font-size:0.88rem;margin-bottom:0.3rem;display:flex;align-items:center;gap:0.4rem;">
              <span>🤖</span> تصحيح ذكي تلقائي بالذكاء الاصطناعي ومطابقة محركات البحث
            </div>
            <div style="color:var(--text-secondary);font-size:0.8rem;line-height:1.4;">
              سيقوم النظام بتحليل إجابة الطالب آلياً ومقارنتها بالإجابة النموذجية والكلمات المفتاحية واحتساب الدرجة فورياً دون الحاجة لتصحيح يدوي.
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0.75rem;">
            <label class="form-label">الإجابة النموذجية أو عناصر الإجابة المطلوبة (مرجع الذكاء الاصطناعي) *</label>
            <textarea class="form-control" rows="3" placeholder="اكتب الإجابة النموذجية أو العناصر التي يجب أن تتضمنها إجابة الطالب..."
                      oninput="setModelAnswer('${q.id}', this.value)">${escapeHtml(q.modelAnswer || '')}</textarea>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">الكلمات والمفاهيم المفتاحية (اختياري - مفصولة بفواصل)</label>
            <input type="text" class="form-control" value="${escapeHtmlAttr(q.keywords || '')}"
                   placeholder="مثال: الإخلاص, الطمأنينة, الخشوع"
                   oninput="setKeywords('${q.id}', this.value)">
          </div>
        </div>`;
      break;
  }

  return `
    <div class="question-card" id="bq-${q.id}" style="border:2px solid ${typeBg};animation:fadeInPage 0.3s ease;">
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;">
        <div class="question-number">${index + 1}</div>
        <span style="background:${typeBg};padding:3px 10px;border-radius:100px;font-size:0.8rem;font-weight:700;">${typeLabel}</span>
        <div style="display:flex;align-items:center;gap:0.4rem;margin-right:auto;">
          <label class="form-label" style="margin:0;font-size:0.85rem;">الدرجة:</label>
          <input type="number" style="width:70px;" class="form-control" value="${q.score || 1}" min="0.5" step="0.5"
                 oninput="setQuestionScore('${q.id}', this.value)">
        </div>
        <button class="btn btn-sm btn-danger btn-icon" onclick="removeQuestion('${q.id}')">🗑️</button>
      </div>

      <div class="form-group">
        <label class="form-label">نص السؤال *</label>
        <textarea class="form-control" rows="2" placeholder="اكتب السؤال هنا..."
                  oninput="setQuestionText('${q.id}', this.value)">${escapeHtml(q.text || '')}</textarea>
      </div>

      ${specificHTML}
    </div>`;
}

function escapeHtmlAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Question Builder Actions
function setQuestionText(qId, val) {
  const q = builderQuestions.find(q => q.id === qId);
  if (q) q.text = val;
}

function setQuestionScore(qId, val) {
  const q = builderQuestions.find(q => q.id === qId);
  if (q) q.score = parseFloat(val) || 1;
}

function updateOption(qId, optIndex, val) {
  const q = builderQuestions.find(q => q.id === qId);
  if (q && q.options) q.options[optIndex] = val;
}

function setCorrectOption(qId, optIndex) {
  const q = builderQuestions.find(q => q.id === qId);
  if (q) { q.correctOption = optIndex; renderAllQuestions(); }
}

function addOption(qId) {
  const q = builderQuestions.find(q => q.id === qId);
  if (q && q.options && q.options.length < 6) {
    q.options.push('');
    renderAllQuestions();
  }
}

function removeOption(qId, optIndex) {
  const q = builderQuestions.find(q => q.id === qId);
  if (q && q.options && q.options.length > 2) {
    q.options.splice(optIndex, 1);
    if (q.correctOption >= q.options.length) q.correctOption = 0;
    renderAllQuestions();
  }
}

function setTFAnswer(qId, val) {
  const q = builderQuestions.find(q => q.id === qId);
  if (q) { q.correctAnswer = val; renderAllQuestions(); }
}

function setFillAnswer(qId, val) {
  const q = builderQuestions.find(q => q.id === qId);
  if (q) q.correctAnswer = val;
}

function setModelAnswer(qId, val) {
  const q = builderQuestions.find(q => q.id === qId);
  if (q) q.modelAnswer = val;
}

function setKeywords(qId, val) {
  const q = builderQuestions.find(q => q.id === qId);
  if (q) q.keywords = val;
}

function removeQuestion(qId) {
  builderQuestions = builderQuestions.filter(q => q.id !== qId);
  renderAllQuestions();
}

function saveExam(activate = false) {
  const title = document.getElementById('examTitle').value.trim();
  const subject = document.getElementById('examSubject').value.trim();
  const instructions = document.getElementById('examInstructions').value.trim();

  if (!title) { showToast('error', '⚠️ يرجى كتابة عنوان الاختبار.'); return; }
  if (!builderQuestions.length) { showToast('error', '⚠️ يرجى إضافة سؤال واحد على الأقل.'); return; }

  // Validate questions
  for (let i = 0; i < builderQuestions.length; i++) {
    const q = builderQuestions[i];
    if (!q.text.trim()) { showToast('error', `⚠️ السؤال ${i + 1} لا يحتوي على نص.`); return; }
    if (q.type === 'mcq') {
      const filled = q.options.filter(o => o.trim()).length;
      if (filled < 2) { showToast('error', `⚠️ السؤال ${i + 1}: يجب أن يكون هناك خياران على الأقل.`); return; }
    }
  }

  const existingId = document.getElementById('editingExamId').value;
  const examId = existingId || generateId();

  if (activate) DB.deactivateAllExams();

  const exam = {
    id: examId,
    title,
    subject,
    instructions,
    questions: builderQuestions,
    active: activate,
    status: activate ? 'active' : 'draft',
    createdAt: existingId ? (DB.getExamById(existingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  DB.saveExam(exam);
  closeModal('createExamModal');
  loadExamsList();
  showToast('success', `✅ ${activate ? 'تم حفظ وتفعيل' : 'تم حفظ'} الاختبار: ${title}`);
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(type, message) {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function showMsg(containerId, type, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  setTimeout(() => el.innerHTML = '', 5000);
}

// ============================================================
// ENTER KEY ON STUDENT NAME
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const studentInput = document.getElementById('studentNameInput');
  if (studentInput) {
    studentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleStudentLogin();
    });
  }
  const adminPwd = document.getElementById('adminPasswordInput');
  if (adminPwd) {
    adminPwd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAdminLogin();
    });
  }
});
