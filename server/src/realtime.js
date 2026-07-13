import {
  db,
  getCorrectAnswerSummary,
  getLeaderboard,
  getQuestionStats,
  getQuizWithQuestions,
  getRoomByCode,
  getRoomById,
  getRoomResults,
  publicQuestion
} from './db.js';
import { verifyToken } from './auth.js';
import { gradeAnswer, recalculateScore, validateAnswerPayload } from './scoring.js';

const activeTimers = new Map();
const activeQuestions = new Map();

// проверяем пользователя до подключения websocket
export function setupRealtime(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Требуется авторизация.'));
      }
      const payload = verifyToken(token);
      const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(payload.id);
      if (!user) {
        return next(new Error('Пользователь не найден.'));
      }
      socket.user = user;
      next();
    } catch {
      next(new Error('Недействительная сессия.'));
    }
  });

  // обрабатываем события комнаты и квиза
  io.on('connection', (socket) => {
    socket.on('room:host-join', (payload = {}, ack) => {
      try {
        const roomId = payload?.roomId;
        const room = getRoomById(roomId);
        if (!room || room.organizerId !== socket.user.id) {
          return ack?.({ ok: false, error: 'Комната недоступна.' });
        }

        socket.join(room.code);
        emitParticipantList(io, room);
        emitCurrentQuestion(io, socket, room);
        ack?.({ ok: true, room });
      } catch (error) {
        ack?.({ ok: false, error: error.message });
      }
    });

    socket.on('room:join', (payload = {}, ack) => {
      try {
        const { code, displayName } = payload || {};
        const room = getRoomByCode(code);
        if (!room) {
          return ack?.({ ok: false, error: 'Комната не найдена.' });
        }
        if (socket.user.role !== 'participant') {
          return ack?.({ ok: false, error: 'К комнате могут подключаться только участники.' });
        }
        if (room.status === 'finished') {
          return ack?.({ ok: false, error: 'Квиз уже завершен.' });
        }

        const requestedName = String(displayName || '').trim();
        if (requestedName.length > 50) {
          return ack?.({ ok: false, error: 'Псевдоним должен быть короче 50 символов.' });
        }
        const name = requestedName || socket.user.email;
        db.prepare(`
          INSERT INTO roomParticipants (roomId, userId, displayName)
          VALUES (?, ?, ?)
          ON CONFLICT(roomId, userId) DO UPDATE SET displayName = excluded.displayName
        `).run(room.id, socket.user.id, name);

        socket.join(room.code);
        emitParticipantList(io, room);
        io.to(room.code).emit('leaderboard:update', getLeaderboard(room.id));
        emitCurrentQuestion(io, socket, room);
        ack?.({ ok: true, room });
      } catch (error) {
        ack?.({ ok: false, error: error.message });
      }
    });

    socket.on('quiz:start', (payload = {}, ack) => {
      try {
        const roomId = payload?.roomId;
        const room = getRoomById(roomId);
        if (!room || room.organizerId !== socket.user.id) {
          return ack?.({ ok: false, error: 'Комната недоступна.' });
        }
        if (room.status === 'finished') {
          return ack?.({ ok: false, error: 'Квиз уже завершен.' });
        }

        db.prepare(`
          UPDATE rooms
          SET status = 'running', startedAt = COALESCE(startedAt, CURRENT_TIMESTAMP)
          WHERE id = ?
        `).run(room.id);
        io.to(room.code).emit('quiz:start', { roomId: room.id });
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: error.message });
      }
    });

    socket.on('question:show', (payload = {}, ack) => {
      try {
        const { roomId, questionIndex } = payload || {};
        const room = getRoomById(roomId);
        if (!room || room.organizerId !== socket.user.id) {
          return ack?.({ ok: false, error: 'Комната недоступна.' });
        }
        if (room.status === 'finished') {
          return ack?.({ ok: false, error: 'Квиз уже завершен.' });
        }

        showQuestion(io, room, Number(questionIndex));
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: error.message });
      }
    });

    socket.on('question:answer', (payload = {}, ack) => {
      try {
        const { roomId, questionId, answerPayload } = payload || {};
        const room = getRoomById(roomId);
        if (!room) {
          return ack?.({ ok: false, error: 'Комната не найдена.' });
        }

        if (socket.user.role !== 'participant') {
          return ack?.({ ok: false, error: 'Отвечать могут только участники.' });
        }
        const membership = db.prepare('SELECT 1 FROM roomParticipants WHERE roomId = ? AND userId = ?').get(room.id, socket.user.id);
        if (!membership) {
          return ack?.({ ok: false, error: 'Сначала подключитесь к комнате.' });
        }

        const active = ensureActiveQuestion(io, room);
        if (!active || active.questionId !== Number(questionId) || active.closed) {
          return ack?.({ ok: false, error: 'Ответы на этот вопрос сейчас закрыты.' });
        }

        const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
        const answers = db.prepare('SELECT * FROM answers WHERE questionId = ?').all(questionId);
        const answerError = validateAnswerPayload(question, answers, answerPayload);
        if (answerError) {
          return ack?.({ ok: false, error: answerError });
        }
        const existingSubmission = db.prepare(
          'SELECT 1 FROM submissions WHERE roomId = ? AND questionId = ? AND userId = ?'
        ).get(room.id, question.id, socket.user.id);
        if (existingSubmission) {
          return ack?.({ ok: false, error: 'Ответ на этот вопрос уже отправлен.' });
        }
        const result = gradeAnswer(question, answers, answerPayload, active);

        db.prepare(`
          INSERT INTO submissions (roomId, questionId, userId, answerPayload, isCorrect, pointsEarned)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(room.id, question.id, socket.user.id, JSON.stringify(answerPayload), result.isCorrect ? 1 : 0, result.pointsEarned);

        recalculateScore(room.id, socket.user.id);
        io.to(room.code).emit('leaderboard:update', getLeaderboard(room.id));
        ack?.({ ok: true, ...result });
      } catch (error) {
        ack?.({ ok: false, error: error.message });
      }
    });

    socket.on('question:close', (payload = {}, ack) => {
      try {
        const roomId = payload?.roomId;
        const room = getRoomById(roomId);
        if (!room || room.organizerId !== socket.user.id) {
          return ack?.({ ok: false, error: 'Комната недоступна.' });
        }

        closeQuestion(io, room);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: error.message });
      }
    });

    socket.on('quiz:finish', (payload = {}, ack) => {
      try {
        const roomId = payload?.roomId;
        const room = getRoomById(roomId);
        if (!room || room.organizerId !== socket.user.id) {
          return ack?.({ ok: false, error: 'Комната недоступна.' });
        }
        if (room.status === 'finished') {
          return ack?.({ ok: false, error: 'Квиз уже завершен.' });
        }

        closeQuestion(io, room);
        db.prepare(`
          UPDATE rooms
          SET status = 'finished', finishedAt = CURRENT_TIMESTAMP, questionOpen = 0, currentQuestionEndsAt = NULL
          WHERE id = ?
        `).run(room.id);
        io.to(room.code).emit('quiz:finish', getRoomResults(room.id));
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: error.message });
      }
    });
  });
}

// открываем вопрос и запускаем общий таймер
export function showQuestion(io, room, questionIndex) {
  const quiz = getQuizWithQuestions(room.quizId);
  const question = quiz.questions[questionIndex];
  if (!question) {
    throw new Error('Вопрос не найден.');
  }

  closeQuestion(io, room, false);
  const shownAt = Date.now();
  const endsAt = shownAt + quiz.timeLimitSec * 1000;
  db.prepare(`
    UPDATE rooms
    SET currentQuestionIndex = ?, status = ?, questionOpen = 1, currentQuestionEndsAt = ?
    WHERE id = ?
  `).run(questionIndex, 'running', endsAt, room.id);
  activeQuestions.set(room.id, {
    questionId: question.id,
    questionIndex,
    closed: false,
    shownAt,
    endsAt,
    timeLimitSec: quiz.timeLimitSec,
    scoringMode: quiz.scoringMode
  });

  io.to(room.code).emit('question:show', {
    question: publicQuestion(question),
    questionIndex,
    totalQuestions: quiz.questions.length,
    timeLimitSec: quiz.timeLimitSec,
    endsAt
  });

  const timer = setTimeout(() => closeQuestion(io, room), quiz.timeLimitSec * 1000);
  activeTimers.set(room.id, timer);
}

function closeQuestion(io, room, emit = true) {
  const timer = activeTimers.get(room.id);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(room.id);
  }

  const active = activeQuestions.get(room.id);
  activeQuestions.delete(room.id);

  db.prepare('UPDATE rooms SET questionOpen = 0, currentQuestionEndsAt = NULL WHERE id = ?').run(room.id);

  if (emit) {
    const question = active ? db.prepare('SELECT * FROM questions WHERE id = ?').get(active.questionId) : null;
    const answers = question ? db.prepare('SELECT * FROM answers WHERE questionId = ?').all(question.id) : [];
    io.to(room.code).emit('question:close', {
      leaderboard: getLeaderboard(room.id),
      correctAnswer: question ? getCorrectAnswerSummary(question, answers) : null,
      questionStats: question ? getQuestionStats(room.id, question.id) : null
    });
  }
}

function emitParticipantList(io, room) {
  const participants = db.prepare(`
    SELECT rp.userId, rp.displayName, rp.score
    FROM roomParticipants rp
    JOIN users u ON u.id = rp.userId
    WHERE rp.roomId = ? AND u.role = 'participant'
    ORDER BY rp.joinedAt ASC
  `).all(room.id);
  io.to(room.code).emit('room:participant-list', participants);
}

function ensureActiveQuestion(io, room) {
  const existing = activeQuestions.get(room.id);
  if (existing && !existing.closed) return existing;

  if (!room.questionOpen || !room.currentQuestionEndsAt || Number(room.currentQuestionEndsAt) <= Date.now()) {
    if (room.questionOpen) {
      db.prepare('UPDATE rooms SET questionOpen = 0, currentQuestionEndsAt = NULL WHERE id = ?').run(room.id);
    }
    return null;
  }

  const quiz = getQuizWithQuestions(room.quizId);
  const question = quiz?.questions[room.currentQuestionIndex];
  if (!question) return null;

  const active = {
    questionId: question.id,
    questionIndex: room.currentQuestionIndex,
    closed: false,
    shownAt: Number(room.currentQuestionEndsAt) - quiz.timeLimitSec * 1000,
    endsAt: Number(room.currentQuestionEndsAt),
    timeLimitSec: quiz.timeLimitSec,
    scoringMode: quiz.scoringMode
  };
  activeQuestions.set(room.id, active);

  const remainingMs = Math.max(1, active.endsAt - Date.now());
  const timer = setTimeout(() => closeQuestion(io, room), remainingMs);
  activeTimers.set(room.id, timer);
  return active;
}

// отправляем текущий вопрос после повторного подключения
function emitCurrentQuestion(io, socket, room) {
  const active = ensureActiveQuestion(io, room);
  if (!active) return;

  const quiz = getQuizWithQuestions(room.quizId);
  const question = quiz?.questions[active.questionIndex];
  if (!question) return;

  socket.emit('question:show', {
    question: publicQuestion(question),
    questionIndex: active.questionIndex,
    totalQuestions: quiz.questions.length,
    timeLimitSec: quiz.timeLimitSec,
    endsAt: active.endsAt
  });
}
