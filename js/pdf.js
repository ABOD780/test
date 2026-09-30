/**
 * حلقة الشهيد بلال الخدري - مولد PDF
 * PDF Generator using jsPDF (loaded via CDN)
 */

/**
 * توليد PDF لنتيجة الاختبار
 */
async function generateResultPDF(result, exam, student) {
  // Load jsPDF if not loaded
  if (typeof window.jspdf === 'undefined') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  }

  const { jsPDF } = window.jspdf;

  // Use A4, Arabic RTL
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;

  // ---- Load Arabic font (Amiri from Google) ----
  // We'll generate as HTML then convert to canvas approach
  // Since jsPDF Arabic support is complex, we'll use the HTML approach
  
  // Generate HTML and convert
  const htmlContent = buildResultHTML(result, exam, student);
  return { htmlContent, result, exam, student };
}

/**
 * بناء HTML لـ PDF النتيجة
 */
function buildResultHTML(result, exam, student) {
  const gradeInfo = result.gradeData;
  const percentage = gradeInfo.percentage;
  const grade = getGrade(percentage);

  let questionsHTML = '';
  
  (gradeInfo.details || []).forEach((d, i) => {
    const typeLabel = { mcq: 'اختيار من متعدد', tf: 'صح وخطأ', fill: 'إكمال فراغ', essay: 'مقالي' }[d.type] || d.type;
    let statusIcon = '';
    let statusClass = '';
    
    if (d.type === 'essay') {
      statusIcon = '📝';
      statusClass = 'pending';
    } else if (d.isCorrect) {
      statusIcon = '✅';
      statusClass = 'correct';
    } else {
      statusIcon = '❌';
      statusClass = 'wrong';
    }

    const studentAnswerText = d.type === 'tf'
      ? (d.studentAnswer === 'true' || d.studentAnswer === true ? 'صح ✓' : d.studentAnswer === 'false' || d.studentAnswer === false ? 'خطأ ✗' : 'لم يجب')
      : (d.studentAnswer ?? 'لم يجب');

    const correctAnswerText = d.type === 'tf'
      ? (d.correctAnswer === 'true' || d.correctAnswer === true ? 'صح ✓' : 'خطأ ✗')
      : (d.correctAnswer ?? '');

    questionsHTML += `
      <div class="q-row ${statusClass}">
        <div class="q-header">
          <span class="q-num">${i + 1}</span>
          <span class="q-type-label">${typeLabel}</span>
          <span class="q-score">${d.earnedPoints}/${d.score} درجة</span>
          <span class="q-status">${statusIcon}</span>
        </div>
        <div class="q-text">${escapeHtml(d.questionText)}</div>
        <div class="q-answers">
          <div class="q-answer student-answer">
            <strong>إجابة الطالب:</strong> ${escapeHtml(String(studentAnswerText))}
          </div>
          ${d.type === 'essay' && d.aiFeedback ? `<div class="q-answer" style="color:#6d28d9;background:#f5f3ff;padding:4px 8px;border-radius:4px;margin-top:4px;"><strong>🤖 تقييم الذكاء الاصطناعي:</strong> ${escapeHtml(d.aiFeedback)}</div>` : ''}
          ${d.type === 'essay' && d.correctAnswer ? `<div class="q-answer" style="color:#4b5563;margin-top:2px;"><strong>الإجابة النموذجية:</strong> ${escapeHtml(String(d.correctAnswer))}</div>` : ''}
          ${d.type !== 'essay' ? `<div class="q-answer correct-answer"><strong>الإجابة الصحيحة:</strong> ${escapeHtml(String(correctAnswerText))}</div>` : ''}
        </div>
      </div>
    `;
  });

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>نتيجة اختبار - ${escapeHtml(student.name)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Tajawal', sans-serif; direction: rtl; background: #fff; color: #111; padding: 20px; font-size: 13px; }
  
  .header { text-align: center; padding: 20px; border-bottom: 3px solid #1a6b3c; margin-bottom: 20px; }
  .logo-area { display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 15px; }
  .logo-circle { width: 70px; height: 70px; border-radius: 50%; background: linear-gradient(135deg, #1a6b3c, #c8991f); display: flex; align-items: center; justify-content: center; font-size: 30px; }
  .org-name { font-size: 22px; font-weight: 900; color: #1a6b3c; }
  .org-sub { font-size: 13px; color: #666; }
  .doc-title { font-size: 18px; font-weight: 900; color: #c8991f; margin-top: 10px; }
  
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
  .info-item { background: #f8f9fa; padding: 10px 14px; border-radius: 8px; border-right: 3px solid #1a6b3c; }
  .info-item label { font-size: 11px; color: #666; display: block; margin-bottom: 3px; }
  .info-item span { font-weight: 700; font-size: 14px; }
  
  .score-section { text-align: center; background: linear-gradient(135deg, #1a6b3c, #0f4a28); color: #fff; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
  .score-big { font-size: 48px; font-weight: 900; color: #f0c040; line-height: 1; }
  .score-sub { font-size: 16px; margin-top: 5px; opacity: 0.9; }
  .grade-badge { display: inline-block; padding: 5px 20px; border-radius: 100px; font-weight: 900; font-size: 16px; margin-top: 10px; }
  .grade-A { background: #22c55e; }
  .grade-B { background: #3b82f6; }
  .grade-C { background: #f59e0b; color: #111; }
  .grade-D { background: #ef4444; }
  .grade-F { background: #7f1d1d; }
  
  .questions-title { font-size: 16px; font-weight: 900; color: #1a6b3c; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  
  .q-row { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
  .q-row.correct { border-color: #22c55e; background: #f0fdf4; }
  .q-row.wrong { border-color: #ef4444; background: #fef2f2; }
  .q-row.pending { border-color: #f59e0b; background: #fffbeb; }
  
  .q-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .q-num { width: 26px; height: 26px; background: #1a6b3c; color: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 12px; flex-shrink: 0; }
  .q-type-label { background: #e5e7eb; padding: 2px 8px; border-radius: 100px; font-size: 11px; color: #374151; }
  .q-score { margin-right: auto; font-weight: 700; color: #1a6b3c; font-size: 12px; }
  .q-status { font-size: 16px; }
  .q-text { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #111; }
  .q-answers { font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
  .student-answer { color: #374151; }
  .correct-answer { color: #166534; }
  
  .footer { margin-top: 30px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 15px; color: #666; font-size: 11px; }
  
  @media print {
    body { padding: 10px; }
    .q-row { break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="logo-area">
    <div class="logo-circle">📖</div>
    <div>
      <div class="org-name">حلقة الشهيد بلال الخدري</div>
      <div class="org-sub">منصة الاختبارات الإلكترونية</div>
    </div>
  </div>
  <div class="doc-title">نتيجة الاختبار</div>
</div>

<div class="info-grid">
  <div class="info-item">
    <label>اسم الطالب</label>
    <span>${escapeHtml(student.name)}</span>
  </div>
  <div class="info-item">
    <label>أستاذ الحلقة</label>
    <span style="color:#1a6b3c;font-weight:700;">عبد الرحمن الشميري</span>
  </div>
  <div class="info-item">
    <label>عنوان الاختبار</label>
    <span>${escapeHtml(exam.title)}</span>
  </div>
  <div class="info-item">
    <label>تاريخ الاختبار</label>
    <span>${formatDate(result.submittedAt || result.startedAt)}</span>
  </div>
  <div class="info-item">
    <label>المادة</label>
    <span>${escapeHtml(exam.subject || '-')}</span>
  </div>
</div>

<div class="score-section">
  <div class="score-big">${gradeInfo.percentage}%</div>
  <div class="score-sub">${gradeInfo.earnedScore} / ${gradeInfo.totalScore} درجة</div>
  <div class="grade-badge grade-${grade.letter}">${grade.label}</div>
</div>

<div class="questions-title">تفاصيل الإجابات</div>
${questionsHTML}

<div class="footer">
  <p>حلقة الشهيد بلال الخدري &nbsp;|&nbsp; أستاذ الحلقة: <strong>عبد الرحمن الشميري</strong> &nbsp;|&nbsp; تصميم وبرمجة: <strong>عبد الرحمن الشميري</strong></p>
  <p style="margin-top:4px">تاريخ التقرير: ${formatDate(new Date().toISOString())}</p>
</div>

</body>
</html>`;
}

function getGrade(percentage) {
  if (percentage >= 90) return { letter: 'A', label: 'ممتاز 🌟' };
  if (percentage >= 80) return { letter: 'B', label: 'جيد جداً 👍' };
  if (percentage >= 70) return { letter: 'C', label: 'جيد ✓' };
  if (percentage >= 60) return { letter: 'D', label: 'مقبول' };
  return { letter: 'F', label: 'راسب ❌' };
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/**
 * طباعة / تنزيل PDF
 */
function printOrDownloadHTML(htmlContent, filename) {
  const win = window.open('', '_blank', 'width=900,height=800');
  if (!win) { alert('يرجى السماح للنوافذ المنبثقة'); return; }
  win.document.write(htmlContent);
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
  }, 500);
}

/**
 * تحميل HTML كملف
 */
function downloadHTMLAsFile(htmlContent, filename) {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'result.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
