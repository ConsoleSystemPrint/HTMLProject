import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { comparePassword, hashPassword, requireAuth, requireOrganizer, sanitizeUser, signUser } from './auth.js';
import { db, getCorrectAnswerSummary, getLeaderboard, getPublicQuizSummary, getQuizWithQuestions, getRoomByCode, getRoomResults, makeRoomCode, publicQuestion } from './db.js';
import { setupRealtime } from './realtime.js';
import { gradeAnswer, recalculateScore, validateAnswerPayload } from './scoring.js';

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const authRateLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, maxRequests: 30 });

// настраиваем http и websocket серверы
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 64 * 1024,
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true
  }
});

app.disable('x-powered-by');
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'quiz-realtime-server' });
});

// регистрация и вход пользователей
app.post('/api/auth/register', authRateLimit, (req, res) => {
  const { email, password, role } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');

  if (!normalizedEmail || !normalizedPassword || !['participant', 'organizer'].includes(role)) {
    return res.status(400).json({ error: 'Укажите email, пароль и роль.' });
  }
  if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254) {
    return res.status(400).json({ error: 'Укажите корректный email.' });
  }
  if (normalizedPassword.length < 8 || normalizedPassword.length > 72) {
    return res.status(400).json({ error: 'Пароль должен содержать от 8 до 72 символов.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'Пользователь уже зарегистрирован.' });
  }

  const result = db.prepare(`
    INSERT INTO users (email, passwordHash, role)
    VALUES (?, ?, ?)
  `).run(normalizedEmail, hashPassword(normalizedPassword), role);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ user: sanitizeUser(user), token: signUser(user) });
});

app.post('/api/auth/login', authRateLimit, (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  const user = normalizedEmail.length <= 254
    ? db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail)
    : null;

  if (!user || normalizedPassword.length > 72 || !comparePassword(normalizedPassword, user.passwordHash)) {
    return res.status(401).json({ error: 'Неверный email или пароль.' });
  }

  res.json({ user: sanitizeUser(user), token: signUser(user) });
});

// данные личного кабинета
app.get('/api/me', requireAuth, (req, res) => {
  const userId = req.user.id;
  const organized = db.prepare(`
    SELECT q.*,
      COUNT(DISTINCT r.id) AS roomsCount,
      COUNT(DISTINCT questions.id) AS questionsCount
    FROM quizzes q
    LEFT JOIN rooms r ON r.quizId = q.id
    LEFT JOIN questions ON questions.quizId = q.id
    WHERE q.organizerId = ?
    GROUP BY q.id
    ORDER BY q.createdAt DESC
  `).all(userId);

  const participated = db.prepare(`
    SELECT q.title, q.category, r.code, r.status, rp.score, rp.joinedAt
    FROM roomParticipants rp
    JOIN users u ON u.id = rp.userId
    JOIN rooms r ON r.id = rp.roomId
    JOIN quizzes q ON q.id = r.quizId
    WHERE rp.userId = ? AND u.role = 'participant'
    ORDER BY rp.joinedAt DESC
  `).all(userId);

  const hostedRooms = req.user.role === 'organizer'
    ? db.prepare(`
      SELECT
        r.id,
        r.code,
        r.status,
        r.startedAt,
        r.finishedAt,
        r.createdAt,
        q.title,
        q.category,
        COUNT(participantUsers.id) AS participantsCount,
        MAX(CASE WHEN participantUsers.id IS NOT NULL THEN rp.score END) AS bestScore
      FROM rooms r
      JOIN quizzes q ON q.id = r.quizId
      LEFT JOIN roomParticipants rp ON rp.roomId = r.id
      LEFT JOIN users participantUsers ON participantUsers.id = rp.userId AND participantUsers.role = 'participant'
      WHERE q.organizerId = ?
      GROUP BY r.id
      ORDER BY COALESCE(r.startedAt, r.createdAt) DESC
    `).all(userId)
    : [];

  res.json({ user: sanitizeUser(req.user), organized, participated, hostedRooms });
});

// создание и управление квизами
app.get('/api/quizzes', requireAuth, requireOrganizer, (req, res) => {
  const quizzes = db.prepare(`
    SELECT q.*, COUNT(questions.id) AS questionsCount
    FROM quizzes q
    LEFT JOIN questions ON questions.quizId = q.id
    WHERE q.organizerId = ?
    GROUP BY q.id
    ORDER BY q.createdAt DESC
  `).all(req.user.id);
  res.json(quizzes);
});

app.get('/api/quizzes/public', requireAuth, (req, res) => {
  const quizzes = db.prepare(`
    SELECT
      q.id,
      q.title,
      q.description,
      q.category,
      q.timeLimitSec,
      q.scoringMode,
      q.quizMode,
      q.accessMode,
      q.organizerName,
      COUNT(questions.id) AS questionsCount
    FROM quizzes q
    LEFT JOIN questions ON questions.quizId = q.id
    WHERE q.status = 'published'
      AND q.quizMode = 'asynchronous'
      AND q.accessMode = 'public'
    GROUP BY q.id
    ORDER BY q.createdAt DESC
  `).all();
  res.json(quizzes);
});

app.get('/api/quizzes/:id', requireAuth, requireOrganizer, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND organizerId = ?').get(req.params.id, req.user.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Квиз не найден.' });
  }
  const structureLocked = Boolean(db.prepare('SELECT 1 FROM rooms WHERE quizId = ? LIMIT 1').get(quiz.id));
  res.json({ ...getQuizWithQuestions(quiz.id), structureLocked });
});

app.post('/api/quizzes', requireAuth, requireOrganizer, (req, res) => {
  const payload = normalizeQuizPayload(req.body);
  const validationError = validateQuizPayload(payload);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const createQuiz = db.transaction(() => {
    const quizResult = db.prepare(`
      INSERT INTO quizzes (organizerId, title, description, category, timeLimitSec, scoringMode, status, quizMode, accessMode, organizerName)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, payload.title, payload.description, payload.category, payload.timeLimitSec, payload.scoringMode, 'draft', payload.quizMode, payload.accessMode, payload.organizerName);

    insertQuestions(quizResult.lastInsertRowid, payload.questions);
    return quizResult.lastInsertRowid;
  });

  const quizId = createQuiz();
  res.status(201).json(getQuizWithQuestions(quizId));
});

app.post('/api/quizzes/import-csv', requireAuth, requireOrganizer, (req, res) => {
  const payload = normalizeQuizPayload({
    ...(req.body && typeof req.body === 'object' ? req.body : {}),
    questions: parseQuestionsCsv(req.body?.csv)
  });

  const validationError = validateQuizPayload(payload);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const createQuiz = db.transaction(() => {
    const quizResult = db.prepare(`
      INSERT INTO quizzes (organizerId, title, description, category, timeLimitSec, scoringMode, status, quizMode, accessMode, organizerName)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, payload.title, payload.description, payload.category, payload.timeLimitSec, payload.scoringMode, 'draft', payload.quizMode, payload.accessMode, payload.organizerName);

    insertQuestions(quizResult.lastInsertRowid, payload.questions);
    return quizResult.lastInsertRowid;
  });

  const quizId = createQuiz();
  db.prepare("UPDATE quizzes SET status = 'published' WHERE id = ?").run(quizId);
  res.status(201).json(getQuizWithQuestions(quizId));
});

app.post('/api/quizzes/:id/duplicate', requireAuth, requireOrganizer, (req, res) => {
  const quiz = getQuizWithQuestions(req.params.id);
  if (!quiz || quiz.organizerId !== req.user.id) {
    return res.status(404).json({ error: 'Квиз не найден.' });
  }
  if (!quiz.organizerName) {
    return res.status(400).json({ error: 'Сначала укажите наименование организатора в исходном квизе.' });
  }

  const duplicateQuiz = db.transaction(() => {
    const quizResult = db.prepare(`
      INSERT INTO quizzes (organizerId, title, description, category, timeLimitSec, scoringMode, status, quizMode, accessMode, organizerName)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      `${quiz.title} (копия)`,
      quiz.description,
      quiz.category,
      quiz.timeLimitSec,
      quiz.scoringMode,
      'draft',
      quiz.quizMode,
      quiz.accessMode,
      quiz.organizerName
    );

    insertQuestions(quizResult.lastInsertRowid, quiz.questions.map((question) => ({
      ...question,
      answers: question.answers.map((answer) => ({ text: answer.text, isCorrect: Boolean(answer.isCorrect) }))
    })));
    return quizResult.lastInsertRowid;
  });

  res.status(201).json(getQuizWithQuestions(duplicateQuiz()));
});

app.put('/api/quizzes/:id', requireAuth, requireOrganizer, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND organizerId = ?').get(req.params.id, req.user.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Квиз не найден.' });
  }

  const payload = normalizeQuizPayload(req.body);
  const structureLocked = Boolean(db.prepare('SELECT 1 FROM rooms WHERE quizId = ? LIMIT 1').get(quiz.id));
  const validationError = validateQuizPayload(payload, { validateQuestions: !structureLocked });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  const updateQuiz = db.transaction(() => {
    db.prepare(`
      UPDATE quizzes
      SET title = ?, description = ?, category = ?, timeLimitSec = ?, scoringMode = ?, quizMode = ?, accessMode = ?, organizerName = ?
      WHERE id = ?
    `).run(payload.title, payload.description, payload.category, payload.timeLimitSec, payload.scoringMode, payload.quizMode, payload.accessMode, payload.organizerName, quiz.id);

    if (!structureLocked) {
      db.prepare('DELETE FROM questions WHERE quizId = ?').run(quiz.id);
      insertQuestions(quiz.id, payload.questions);
    }
  });

  updateQuiz();
  res.json({ ...getQuizWithQuestions(quiz.id), structureLocked });
});

app.post('/api/quizzes/:id/publish', requireAuth, requireOrganizer, (req, res) => {
  const quiz = getQuizWithQuestions(req.params.id);
  if (!quiz || quiz.organizerId !== req.user.id) {
    return res.status(404).json({ error: 'Квиз не найден.' });
  }
  const validationError = validateQuizPayload(normalizeQuizPayload(quiz));
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  db.prepare("UPDATE quizzes SET status = 'published' WHERE id = ?").run(quiz.id);
  res.json(getQuizWithQuestions(quiz.id));
});

app.delete('/api/quizzes/:id', requireAuth, requireOrganizer, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND organizerId = ?').get(req.params.id, req.user.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Квиз не найден.' });
  }

  if (db.prepare('SELECT 1 FROM rooms WHERE quizId = ? LIMIT 1').get(quiz.id)) {
    return res.status(409).json({ error: 'Квиз уже проводился. Удаление запрещено, чтобы сохранить историю результатов.' });
  }

  db.prepare('DELETE FROM quizzes WHERE id = ?').run(quiz.id);
  res.json({ ok: true });
});

// самостоятельное прохождение квиза
app.post('/api/quizzes/:id/attempts', requireAuth, (req, res) => {
  if (req.user.role !== 'participant') {
    return res.status(403).json({ error: 'Самостоятельные квизы проходят участники.' });
  }

  const quiz = db.prepare(`
    SELECT * FROM quizzes
    WHERE id = ? AND status = 'published' AND quizMode = 'asynchronous' AND accessMode = 'public'
  `).get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Публичный квиз не найден.' });
  }

  const code = createUniqueRoomCode();
  const createAttempt = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO rooms (quizId, code, status, startedAt)
      VALUES (?, ?, 'running', CURRENT_TIMESTAMP)
    `).run(quiz.id, code);
    db.prepare(`
      INSERT INTO roomParticipants (roomId, userId, displayName)
      VALUES (?, ?, ?)
    `).run(result.lastInsertRowid, req.user.id, req.user.email);
    return result.lastInsertRowid;
  });

  const roomId = createAttempt();
  res.status(201).json({
    room: db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId),
    quiz: getPublicQuizSummary(quiz.id)
  });
});

app.get('/api/attempts/:code/questions/:index', requireAuth, (req, res) => {
  const context = getAttemptContext(req.params.code, req.user.id);
  if (!context) {
    return res.status(404).json({ error: 'Попытка не найдена.' });
  }
  if (context.room.status !== 'running') {
    return res.status(409).json({ error: 'Эта попытка уже завершена.' });
  }

  const questionIndex = Number(req.params.index);
  const answeredCount = db.prepare('SELECT COUNT(*) AS count FROM submissions WHERE roomId = ? AND userId = ?').get(context.room.id, req.user.id).count;
  if (!Number.isInteger(questionIndex) || questionIndex !== answeredCount) {
    return res.status(409).json({ error: 'Откройте следующий доступный вопрос.' });
  }

  const question = context.quiz.questions[questionIndex];
  if (!question) {
    return res.status(404).json({ error: 'Вопрос не найден.' });
  }
  res.json({ question: publicQuestion(question), questionIndex, totalQuestions: context.quiz.questions.length });
});

app.post('/api/attempts/:code/answers', requireAuth, (req, res) => {
  const context = getAttemptContext(req.params.code, req.user.id);
  if (!context) {
    return res.status(404).json({ error: 'Попытка не найдена.' });
  }
  if (context.room.status !== 'running') {
    return res.status(409).json({ error: 'Приём ответов завершён.' });
  }

  const answeredCount = db.prepare('SELECT COUNT(*) AS count FROM submissions WHERE roomId = ? AND userId = ?').get(context.room.id, req.user.id).count;
  const question = context.quiz.questions[answeredCount];
  if (!question || question.id !== Number(req.body?.questionId)) {
    return res.status(409).json({ error: 'Ответ относится не к текущему вопросу.' });
  }

  const answerPayload = req.body?.answerPayload;
  const answerError = validateAnswerPayload(question, question.answers, answerPayload);
  if (answerError) {
    return res.status(400).json({ error: answerError });
  }

  const result = gradeAnswer(question, question.answers, answerPayload);
  db.prepare(`
    INSERT INTO submissions (roomId, questionId, userId, answerPayload, isCorrect, pointsEarned)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(context.room.id, question.id, req.user.id, JSON.stringify(answerPayload), result.isCorrect ? 1 : 0, result.pointsEarned);
  recalculateScore(context.room.id, req.user.id);

  const nextIndex = answeredCount + 1;
  const finished = nextIndex >= context.quiz.questions.length;
  if (finished) {
    db.prepare(`
      UPDATE rooms SET status = 'finished', finishedAt = CURRENT_TIMESTAMP WHERE id = ?
    `).run(context.room.id);
  }

  res.json({
    ...result,
    correctAnswer: getCorrectAnswerSummary(question, question.answers),
    nextIndex,
    finished,
    results: finished ? getRoomResults(context.room.id) : null
  });
});

// комнаты для синхронного прохождения
app.post('/api/rooms', requireAuth, requireOrganizer, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND organizerId = ?').get(req.body?.quizId, req.user.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Квиз не найден.' });
  }
  if (quiz.quizMode !== 'synchronous') {
    return res.status(400).json({ error: 'Комнаты создаются только для синхронных квизов.' });
  }
  if (quiz.status !== 'published') {
    return res.status(400).json({ error: 'Сначала опубликуйте квиз.' });
  }

  const code = createUniqueRoomCode();

  const result = db.prepare(`
    INSERT INTO rooms (quizId, code, status)
    VALUES (?, ?, 'waiting')
  `).run(quiz.id, code);

  res.status(201).json({
    ...db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid),
    quiz: getQuizWithQuestions(quiz.id)
  });
});

app.get('/api/rooms/:code', requireAuth, (req, res) => {
  const room = getRoomByCode(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Комната не найдена.' });
  }
  const quiz = getPublicQuizSummary(room.quizId);
  res.json({ room, quiz, leaderboard: getLeaderboard(room.id) });
});

app.get('/api/rooms/:code/results', requireAuth, (req, res) => {
  const room = getRoomByCode(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Комната не найдена.' });
  }
  const isOrganizer = room.organizerId === req.user.id;
  const isParticipant = Boolean(db.prepare(
    'SELECT 1 FROM roomParticipants WHERE roomId = ? AND userId = ?'
  ).get(room.id, req.user.id));
  if (!isOrganizer && (!isParticipant || room.status !== 'finished')) {
    return res.status(403).json({ error: 'У вас нет доступа к результатам этой комнаты.' });
  }
  res.json(getRoomResults(room.id));
});

app.get('/api/rooms/:code/export.csv', requireAuth, (req, res) => {
  const room = getRoomByCode(req.params.code);
  if (!room) {
    return res.status(404).send('Комната не найдена.');
  }

  if (room.organizerId !== req.user.id) {
    return res.status(403).send('Экспорт доступен только организатору квиза.');
  }

  const results = getRoomResults(room.id);
  const privateLeaderboard = getLeaderboard(room.id, true);
  const rows = [
    ['Место', 'Псевдоним', 'Почта', 'Баллы', 'Комната', 'Квиз', 'Статус комнаты'],
    ...privateLeaderboard.map((item, index) => [
      index + 1,
      item.displayName,
      item.email,
      item.score,
      results.room.code,
      results.quiz.title,
      translateStatus(results.room.status)
    ])
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="quiz-${results.room.code}-results.csv"`);
  res.send(`\uFEFF${rows.map((row) => row.map(csvValue).join(';')).join('\n')}`);
});

// приводим данные конструктора к единому виду
function normalizeQuizPayload(body) {
  const source = body && typeof body === 'object' ? body : {};
  const rawTimeLimit = Number(source.timeLimitSec || 30);
  return {
    title: String(source.title || '').trim(),
    description: String(source.description || '').trim(),
    category: String(source.category || 'Общее').trim(),
    timeLimitSec: Number.isFinite(rawTimeLimit) ? Math.max(5, Math.min(300, Math.round(rawTimeLimit))) : 30,
    scoringMode: ['standard', 'fast'].includes(source.scoringMode) ? source.scoringMode : 'standard',
    quizMode: ['synchronous', 'asynchronous'].includes(source.quizMode) ? source.quizMode : 'synchronous',
    accessMode: ['public', 'room'].includes(source.accessMode) ? source.accessMode : 'room',
    organizerName: String(source.organizerName || '').trim(),
    questions: Array.isArray(source.questions) ? source.questions.map(normalizeQuestionPayload).filter(Boolean) : []
  };
}

function validateQuizPayload(payload, { validateQuestions = true } = {}) {
  if (!payload.organizerName) return 'Укажите наименование организатора.';
  if (payload.organizerName.length > 100) return 'Наименование организатора слишком длинное.';
  if (!payload.title) return 'Укажите название квиза.';
  if (payload.title.length > 120) return 'Название квиза слишком длинное.';
  if (payload.description.length > 1000) return 'Описание квиза слишком длинное.';
  if (!payload.category || payload.category.length > 80) return 'Проверьте название категории.';
  if (!validateQuestions) return null;
  if (payload.questions.length === 0) return 'Добавьте хотя бы один вопрос.';
  if (payload.questions.length > 100) return 'В одном квизе может быть не больше 100 вопросов.';

  for (const [index, question] of payload.questions.entries()) {
    const number = index + 1;
    if (question.text.length > 500) return `Текст вопроса ${number} слишком длинный.`;
    if (question.imageUrl && !isSafeImageUrl(question.imageUrl)) return `Проверьте URL изображения в вопросе ${number}.`;
    if (question.type === 'image' && !question.imageUrl) return `Добавьте изображение к вопросу ${number}.`;
    if (question.answers.length > 20) return `В вопросе ${number} слишком много вариантов ответа.`;
    if (question.answers.some((answer) => !answer.text || answer.text.length > 300)) {
      return `Проверьте варианты ответа в вопросе ${number}.`;
    }

    const correctCount = question.answers.filter((answer) => answer.isCorrect).length;
    if (question.type === 'single' && (question.answers.length < 2 || correctCount !== 1)) {
      return `В вопросе ${number} задайте минимум два варианта и один верный ответ.`;
    }
    if (question.type === 'multiple' && (question.answers.length < 2 || correctCount < 1)) {
      return `В вопросе ${number} задайте минимум два варианта и верные ответы.`;
    }
    if ((question.type === 'text' || question.type === 'image') && correctCount !== 1) {
      return `В вопросе ${number} укажите один верный текстовый ответ.`;
    }
  }
  return null;
}

function createUniqueRoomCode() {
  let code = makeRoomCode();
  while (db.prepare('SELECT id FROM rooms WHERE code = ?').get(code)) {
    code = makeRoomCode();
  }
  return code;
}

function getAttemptContext(code, userId) {
  const room = getRoomByCode(code);
  if (!room || room.quizMode !== 'asynchronous') return null;
  const participant = db.prepare('SELECT 1 FROM roomParticipants WHERE roomId = ? AND userId = ?').get(room.id, userId);
  if (!participant) return null;
  return { room, quiz: getQuizWithQuestions(room.quizId) };
}

function normalizeQuestionPayload(question, index) {
  if (!question?.text || !['single', 'multiple', 'text', 'image'].includes(question.type)) {
    return null;
  }

  const rawPoints = Number(question.points || 1);
  return {
    type: question.type,
    text: String(question.text).trim(),
    imageUrl: String(question.imageUrl || '').trim(),
    orderIndex: index,
    points: Number.isFinite(rawPoints) ? Math.max(1, Math.min(1000, Math.round(rawPoints))) : 1,
    answers: Array.isArray(question.answers)
      ? question.answers.map((answer) => ({
        text: String(answer?.text || '').trim(),
        isCorrect: Boolean(answer?.isCorrect)
      })).filter((answer) => answer.text)
      : []
  };
}

function insertQuestions(quizId, questions) {
  const insertQuestion = db.prepare(`
    INSERT INTO questions (quizId, type, text, imageUrl, orderIndex, points)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertAnswer = db.prepare(`
    INSERT INTO answers (questionId, text, isCorrect)
    VALUES (?, ?, ?)
  `);

  questions.forEach((question) => {
    const questionResult = insertQuestion.run(
      quizId,
      question.type,
      question.text,
      question.imageUrl,
      question.orderIndex,
      question.points
    );
    question.answers.forEach((answer) => {
      if (answer.text) {
        insertAnswer.run(questionResult.lastInsertRowid, String(answer.text), answer.isCorrect ? 1 : 0);
      }
    });
  });
}

function parseQuestionsCsv(csv) {
  return parseCsvRows(String(csv || ''))
    .filter((row) => row.some(Boolean))
    .map((row, index) => {
      const [typeRaw, textRaw, imageUrlRaw, pointsRaw, correctRaw, ...optionsRaw] = row;
      const type = ['single', 'multiple', 'text', 'image'].includes(typeRaw) ? typeRaw : 'single';
      const correctValues = String(correctRaw || '')
        .split('|')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const options = optionsRaw.filter(Boolean);

      if (type === 'text' || type === 'image') {
        return {
          type,
          text: textRaw || `Вопрос ${index + 1}`,
          imageUrl: imageUrlRaw || '',
          points: Number(pointsRaw || 1),
          answers: [{ text: correctRaw || '', isCorrect: true }]
        };
      }

      return {
        type,
        text: textRaw || `Вопрос ${index + 1}`,
        imageUrl: imageUrlRaw || '',
        points: Number(pointsRaw || 1),
        answers: options.map((option, optionIndex) => ({
          text: option,
          isCorrect: correctValues.includes(String(optionIndex + 1)) || correctValues.includes(option.trim().toLowerCase())
        }))
      };
    })
    .filter((question) => question.text && question.answers.length > 0);
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if ((char === ';' || char === ',') && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  rows.push(row);
  return rows;
}

function csvValue(value) {
  const text = String(value ?? '');
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function isSafeImageUrl(value) {
  if (value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createRateLimiter({ windowMs, maxRequests }) {
  const requests = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = requests.get(key);
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

    if (entry.count >= maxRequests) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Слишком много попыток. Повторите позже.' });
    }
    entry.count += 1;
    requests.set(key, entry);
    next();
  };
}

function translateStatus(status) {
  const statuses = {
    draft: 'Черновик',
    published: 'Опубликован',
    waiting: 'Ожидание',
    running: 'Идет',
    finished: 'Завершен'
  };
  return statuses[status] || status;
}

// возвращаем безопасную ошибку без деталей сервера
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  const status = error.type === 'entity.too.large' ? 413 : 500;
  return res.status(status).json({ error: status === 413 ? 'Запрос слишком большой.' : 'Внутренняя ошибка сервера.' });
});

setupRealtime(io);

// запускаем backend на локальном порту
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Quiz server listening on http://127.0.0.1:${PORT}`);
});
