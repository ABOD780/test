/**
 * حلقة الشهيد بلال الخدري - نظام إدارة البيانات
 * Data Manager - LocalStorage Based
 */

const DB = {
  // ============ KEYS ============
  KEYS: {
    ADMIN: 'blal_admin',
    STUDENTS: 'blal_students',
    EXAMS: 'blal_exams',
    RESULTS: 'blal_results',
    SESSION: 'blal_session',
    SETTINGS: 'blal_settings',
  },

  // ============ HELPERS ============
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
  remove(key) {
    localStorage.removeItem(key);
  },

  // ============ ADMIN ============
  getAdmin() {
    return this.get(this.KEYS.ADMIN) || { username: 'admin', password: 'bilal2024' };
  },
  setAdmin(data) {
    this.set(this.KEYS.ADMIN, data);
  },

  // ============ STUDENTS ============
  getStudents() {
    return this.get(this.KEYS.STUDENTS) || [];
  },
  saveStudents(list) {
    this.set(this.KEYS.STUDENTS, list);
  },
  addStudent(name) {
    const students = this.getStudents();
    const existing = students.find(s => s.name.trim() === name.trim());
    if (existing) return null; // already exists
    const student = {
      id: Date.now().toString(),
      name: name.trim(),
      addedAt: new Date().toISOString(),
      examTaken: false,
      allowRetake: false,
    };
    students.push(student);
    this.saveStudents(students);
    return student;
  },
  updateStudent(id, updates) {
    const students = this.getStudents();
    const idx = students.findIndex(s => s.id === id);
    if (idx !== -1) {
      students[idx] = { ...students[idx], ...updates };
      this.saveStudents(students);
      return students[idx];
    }
    return null;
  },
  deleteStudent(id) {
    const students = this.getStudents().filter(s => s.id !== id);
    this.saveStudents(students);
  },
  findStudentByName(name) {
    return this.getStudents().find(s => s.name.trim().toLowerCase() === name.trim().toLowerCase()) || null;
  },
  canStudentTakeExam(name) {
    const student = this.findStudentByName(name);
    if (!student) return { allowed: false, reason: 'not_registered' };
    if (student.examTaken && !student.allowRetake) return { allowed: false, reason: 'already_taken', student };
    return { allowed: true, student };
  },
  markStudentExamTaken(studentId) {
    this.updateStudent(studentId, { examTaken: true, allowRetake: false, lastExamAt: new Date().toISOString() });
  },

  // ============ EXAMS ============
  getExams() {
    return this.get(this.KEYS.EXAMS) || [];
  },
  saveExams(list) {
    this.set(this.KEYS.EXAMS, list);
  },
  getActiveExam() {
    return this.getExams().find(e => e.active) || null;
  },
  getExamById(id) {
    return this.getExams().find(e => e.id === id) || null;
  },
  saveExam(exam) {
    const exams = this.getExams();
    const idx = exams.findIndex(e => e.id === exam.id);
    if (idx !== -1) {
      exams[idx] = exam;
    } else {
      exams.push(exam);
    }
    this.saveExams(exams);
    return exam;
  },
  deleteExam(id) {
    const exams = this.getExams().filter(e => e.id !== id);
    this.saveExams(exams);
  },
  setActiveExam(id) {
    const exams = this.getExams().map(e => ({ ...e, active: e.id === id }));
    this.saveExams(exams);
  },
  deactivateAllExams() {
    const exams = this.getExams().map(e => ({ ...e, active: false }));
    this.saveExams(exams);
  },

  // ============ RESULTS ============
  getResults() {
    return this.get(this.KEYS.RESULTS) || [];
  },
  saveResult(result) {
    const results = this.getResults();
    // Update or insert
    const idx = results.findIndex(r => r.id === result.id);
    if (idx !== -1) {
      results[idx] = result;
    } else {
      results.push(result);
    }
    this.set(this.KEYS.RESULTS, results);
    return result;
  },
  getResultsByExam(examId) {
    return this.getResults().filter(r => r.examId === examId);
  },
  getResultByStudent(studentId, examId) {
    return this.getResults().find(r => r.studentId === studentId && r.examId === examId) || null;
  },
  deleteResult(id) {
    const results = this.getResults().filter(r => r.id !== id);
    this.set(this.KEYS.RESULTS, results);
  },

  // ============ SESSION (current exam attempt) ============
  getSession() {
    return this.get(this.KEYS.SESSION);
  },
  setSession(data) {
    this.set(this.KEYS.SESSION, data);
  },
  clearSession() {
    this.remove(this.KEYS.SESSION);
  },

  // ============ SETTINGS ============
  getSettings() {
    return this.get(this.KEYS.SETTINGS) || {
      allowFullscreenExit: false,
      autoSubmitOnExit: true,
      showScoreImmediately: true,
      examDurationMinutes: 60,
    };
  },
  seedInitialData() {
    if (!this.getStudents().length) {
      this.saveStudents([
        { id: '1', name: 'محمد أحمد الخالدي', addedAt: new Date().toISOString(), examTaken: false, allowRetake: false },
        { id: '2', name: 'علي حسن الحميري', addedAt: new Date().toISOString(), examTaken: false, allowRetake: false },
        { id: '3', name: 'عبد الله إبراهيم', addedAt: new Date().toISOString(), examTaken: false, allowRetake: false },
      ]);
    }
    if (!this.getExams().length) {
      const sampleExam = {
        id: 'exam_sample_1',
        title: 'اختبار التجويد والقرآن الكريم - المستوى الأول',
        subject: 'التجويد وأحكام التلاوة',
        instructions: 'يرجى قراءة الأسئلة بعناية والإجابة بدقة. لا يسمح بمغادرة وضع ملء الشاشة أثناء الاختبار.',
        active: true,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        questions: [
          {
            id: 'q1',
            type: 'mcq',
            text: 'ما هو حكم النون الساكنة والتنوين في قوله تعالى: (مَن يَعْمَلْ)؟',
            score: 1,
            options: ['إظهار حلقي', 'إدغام بغنة', 'إقلاب', 'إخفاء حقيقي'],
            correctOption: 1,
          },
          {
            id: 'q2',
            type: 'tf',
            text: 'عدد حروف الإظهار الحلقي ستة أحرف مجموعة في أوائل كلمات: (أخي هاك علماً حازه غير خاسر).',
            score: 1,
            correctAnswer: 'true',
          },
          {
            id: 'q3',
            type: 'fill',
            text: 'الغنة صوت رخيم ومركب في جسم النون والميم يخرج من ........',
            score: 1,
            correctAnswer: 'الخيشوم',
          },
          {
            id: 'q4',
            type: 'essay',
            text: 'عرّف الإخلاص في طلب وحفظ القرآن الكريم، واذكر أثره على طالب الحلقة؟',
            score: 2,
            modelAnswer: 'الإخلاص هو ابتغاء مرضاة الله تعالى وحده دون رياء أو سمعة، وأثره على طالب الحلقة البركة في الحفظ والعمل بالقرآن الكريم ونيل الأجر والثواب والطمأنينة.',
            keywords: 'مرضاة الله, رياء, سمعة, البركة, الحفظ, الثواب, الطمأنينة',
          }
        ]
      };
      this.saveExam(sampleExam);
    }
  },
};


// ============================================================
// AI ESSAY & SEARCH-MATCH AUTO-GRADER
// ============================================================
/**
 * محرك الذكاء الاصطناعي ومطابقة البحث لتصحيح الأسئلة المقالية تلقائياً
 * يحلل النصوص ويطابق الكلمات المفتاحية والعبارات الدلالية ويحاكي مطابقة نتائج البحث
 */
const EssayAI = {
  STOPWORDS_AR: new Set([
    'في','من','إلى','على','عن','مع','هو','هي','هم','هن','نحن','أنا','أنت',
    'هذا','هذه','ذلك','تلك','الذي','التي','الذين','اللواتي','كان','كانت',
    'يكون','تكون','لا','لم','لن','قد','قال','قالت','بعد','قبل','عند',
    'حتى','إن','أن','لأن','حيث','كيف','ما','من','أو','و','ف','ثم','بل',
    'لكن','إلا','إذا','لو','لولا','إنما','إذ','ذا','ها','أي','أيا',
    'به','بها','لها','له','منه','منها','عليه','عليها','فيه','فيها',
    'كل','بعض','جميع','غير','سوى','فقط','أيضا','أيضاً','جداً','جدا'
  ]),

  normalize(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')   // إزالة التشكيل والتطويل
      .replace(/[أإآءؤئ]/g, 'ا')                    // توحيد الهمزات
      .replace(/[ة]/g, 'ه')                          // توحيد التاء المربوطة
      .replace(/[ى]/g, 'ي')                          // توحيد الياء
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
      .toLowerCase()
      .trim();
  },

  stem(word) {
    if (!word || word.length <= 3) return word;
    let w = word;
    // إزالة السوابق الشائعة (ال التعريف، الواو، الفاء)
    if (w.startsWith('ال') && w.length > 4) w = w.slice(2);
    else if ((w.startsWith('و') || w.startsWith('ف') || w.startsWith('ب') || w.startsWith('ل')) && w.length > 4) {
      w = w.slice(1);
      if (w.startsWith('ال') && w.length > 4) w = w.slice(2);
    }
    return w;
  },

  tokenize(text) {
    const cleaned = this.normalize(text);
    if (!cleaned) return [];
    return cleaned
      .split(/\s+/)
      .filter(w => w.length > 1 && !this.STOPWORDS_AR.has(w))
      .map(w => this.stem(w));
  },

  // استخراج العبارات الثنائية (Bigrams) لمطابقة العبارات التامة مثل محرك البحث
  extractNgrams(text, n = 2) {
    const words = this.normalize(text).split(/\s+/).filter(w => w.length > 1 && !this.STOPWORDS_AR.has(w));
    const ngrams = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  },

  jaccardSimilarity(tokensA, tokensB) {
    if (!tokensA.length || !tokensB.length) return 0;
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    let intersection = 0;
    setA.forEach(w => { if (setB.has(w)) intersection++; });
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  },

  coverageScore(studentTokens, modelTokens) {
    if (!modelTokens.length) return 0;
    const studentSet = new Set(studentTokens);
    let covered = 0;
    modelTokens.forEach(w => { if (studentSet.has(w)) covered++; });
    return covered / modelTokens.length;
  },

  keywordsScore(studentText, keywordsStr) {
    if (!keywordsStr || typeof keywordsStr !== 'string') return 1;
    const keywords = keywordsStr.split(/[,،\n]+/).map(k => this.normalize(k)).filter(k => k.length > 1);
    if (!keywords.length) return 1;
    const normStudent = this.normalize(studentText);
    let matched = 0;
    keywords.forEach(kw => {
      const stemKw = this.stem(kw);
      if (normStudent.includes(kw) || normStudent.includes(stemKw)) matched++;
    });
    return matched / keywords.length;
  },

  phraseMatchScore(studentText, modelText) {
    const modelBigrams = this.extractNgrams(modelText, 2);
    if (!modelBigrams.length) return 0;
    const normStudent = this.normalize(studentText);
    let matches = 0;
    modelBigrams.forEach(bg => {
      if (normStudent.includes(bg)) matches++;
    });
    return Math.min(matches / Math.max(modelBigrams.length, 1), 1);
  },

  /**
   * التصحيح التلقائي بالذكاء الاصطناعي ومطابقة البحث
   */
  grade(studentAnswer, modelAnswer, maxScore = 1, keywords = '') {
    if (!studentAnswer || studentAnswer.trim().length < 3) {
      return { score: 0, percentage: 0, feedback: 'لم يقدم الطالب إجابة مكتوبة.' };
    }

    // إذا لم توجد إجابة نموذجية، تُمنح نسبة بناءً على حجم واكتمال الإجابة
    if (!modelAnswer || modelAnswer.trim().length < 2) {
      const wordsCount = studentAnswer.trim().split(/\s+/).length;
      const pct = wordsCount >= 10 ? 80 : wordsCount >= 5 ? 60 : 40;
      const earned = parseFloat(((pct / 100) * maxScore).toFixed(2));
      return {
        score: earned,
        percentage: pct,
        feedback: `🤖 تم قبول الإجابة وتقييمها تلقائياً بالذكاء الاصطناعي (${wordsCount} كلمة).`
      };
    }

    const studentTokens = this.tokenize(studentAnswer);
    const modelTokens   = this.tokenize(modelAnswer);

    const jaccard   = this.jaccardSimilarity(studentTokens, modelTokens);
    const coverage  = this.coverageScore(studentTokens, modelTokens);
    const phrase    = this.phraseMatchScore(studentAnswer, modelAnswer);
    const kwScore   = this.keywordsScore(studentAnswer, keywords);

    // الوزن المركب لمحاكاة مطابقة محرك البحث والذكاء الاصطناعي
    // 35% تغطية مفاهيم + 25% تشابه عام + 25% مطابقة عبارات دقيقة + 15% كلمات مفتاحية
    let composite = (coverage * 0.35) + (jaccard * 0.25) + (phrase * 0.25) + (kwScore * 0.15);

    // مرونة إضافية: إذا طابق عبارات تامة كالبحث في جوجل
    if (phrase >= 0.5 || coverage >= 0.6) {
      composite = Math.min(composite + 0.15, 1.0);
    }

    const clamped = Math.min(Math.max(composite, 0), 1);
    const percentage = Math.round(clamped * 100);
    const earnedScore = parseFloat((clamped * maxScore).toFixed(2));

    let feedback = '';
    if (percentage >= 85) {
      feedback = '🌟 إجابة ممتازة ومطابقة للمفاهيم الأساسية والبحث بدقة عالية.';
    } else if (percentage >= 65) {
      feedback = '✅ إجابة جيدة تغطي معظم عناصر السؤال المقالي.';
    } else if (percentage >= 45) {
      feedback = '⚠️ إجابة مقبولة تضمنت بعض النقاط الرئيسية ولكن تنقصها تفاصيل مهمة.';
    } else if (percentage >= 20) {
      feedback = '❌ إجابة ضعيفة وغير مكتملة، يرجى مراجعة الدرس.';
    } else {
      feedback = '❌ الإجابة لا تتوافق مع العناصر النموذجية المطلوبة.';
    }

    return { score: earnedScore, percentage, feedback };
  }
};

// إتاحته عالمياً
if (typeof window !== 'undefined') {
  window.EssayAI = EssayAI;
}

/**
 * حساب نتيجة الاختبار
 * @param {Object} exam - بيانات الاختبار
 * @param {Object} answers - إجابات الطالب { questionId: answer }
 */
function gradeExam(exam, answers) {
  let totalScore = 0;
  let earnedScore = 0;
  const details = [];

  exam.questions.forEach(q => {
    totalScore += q.score || 1;
    const studentAnswer = answers[q.id];
    let isCorrect = false;
    let earnedPoints = 0;
    let aiFeedback = null;

    switch (q.type) {
      case 'mcq':
        isCorrect = studentAnswer !== undefined && studentAnswer === q.correctOption;
        earnedPoints = isCorrect ? (q.score || 1) : 0;
        break;
      case 'tf':
        isCorrect = studentAnswer !== undefined && String(studentAnswer) === String(q.correctAnswer);
        earnedPoints = isCorrect ? (q.score || 1) : 0;
        break;
      case 'fill':
        if (studentAnswer !== undefined && studentAnswer !== '') {
          const sa = studentAnswer.trim().toLowerCase();
          const ca = (q.correctAnswer || '').trim().toLowerCase();
          isCorrect = sa === ca;
          earnedPoints = isCorrect ? (q.score || 1) : 0;
        }
        break;
      case 'essay':
        // ---- التصحيح التلقائي بالذكاء الاصطناعي ومطابقة البحث ----
        if (studentAnswer && studentAnswer.trim().length >= 3) {
          const aiResult = EssayAI.grade(studentAnswer, q.modelAnswer || '', q.score || 1, q.keywords || '');
          earnedPoints = aiResult.score;
          isCorrect = aiResult.percentage >= 50;
          aiFeedback = `${aiResult.feedback} (${aiResult.percentage}%)`;
        } else {
          isCorrect = false;
          earnedPoints = 0;
          aiFeedback = 'لم يقدم الطالب إجابة مكتوبة.';
        }
        break;
    }

    earnedScore += earnedPoints;
    details.push({
      questionId: q.id,
      questionText: q.text,
      type: q.type,
      studentAnswer,
      correctAnswer: q.type === 'mcq'
        ? q.options?.[q.correctOption]
        : (q.type === 'essay' ? (q.modelAnswer || '') : q.correctAnswer),
      isCorrect,
      score: q.score || 1,
      earnedPoints,
      aiFeedback,        // تغذية راجعة من الذكاء الاصطناعي للمقالي
      aiGraded: q.type === 'essay',  // علامة: صُحِّح بالذكاء الاصطناعي
    });
  });

  return {
    totalScore,
    earnedScore,
    percentage: totalScore > 0 ? Math.round((earnedScore / totalScore) * 100) : 0,
    details,
    hasEssay: exam.questions.some(q => q.type === 'essay'),
    allAutoGraded: true,  // جميع الأسئلة صُحِّحت تلقائياً
  };
}


/**
 * تنسيق التاريخ بالعربية
 */
function formatDate(isoString) {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * إنشاء معرف فريد
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * تحويل الأرقام للعربية
 */
function toArabicNum(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}
