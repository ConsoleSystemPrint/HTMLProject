import Database from 'better-sqlite3';

import { randomInt } from 'node:crypto';

const databasePath = process.env.DB_PATH || new URL('../database.sqlite', import.meta.url).pathname;
export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// таблицы базы данных
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('participant', 'organizer')),
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organizerId INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    timeLimitSec INTEGER NOT NULL DEFAULT 30,
    scoringMode TEXT NOT NULL DEFAULT 'standard',
    status TEXT NOT NULL DEFAULT 'draft',
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizerId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quizId INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('single', 'multiple', 'text', 'image')),
    text TEXT NOT NULL,
    imageUrl TEXT,
    orderIndex INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (quizId) REFERENCES quizzes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    questionId INTEGER NOT NULL,
    text TEXT NOT NULL,
    isCorrect INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (questionId) REFERENCES questions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quizId INTEGER NOT NULL,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'waiting',
    currentQuestionIndex INTEGER NOT NULL DEFAULT -1,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    currentQuestionEndsAt INTEGER,
    questionOpen INTEGER NOT NULL DEFAULT 0,
    startedAt TEXT,
    finishedAt TEXT,
    FOREIGN KEY (quizId) REFERENCES quizzes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS roomParticipants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    displayName TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    joinedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(roomId, userId),
    FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomId INTEGER NOT NULL,
    questionId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    answerPayload TEXT NOT NULL,
    isCorrect INTEGER NOT NULL DEFAULT 0,
    pointsEarned INTEGER NOT NULL DEFAULT 0,
    submittedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(roomId, questionId, userId),
    FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (questionId) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quizId, orderIndex);
  CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(questionId);
  CREATE INDEX IF NOT EXISTS idx_rooms_quiz ON rooms(quizId);
  CREATE INDEX IF NOT EXISTS idx_participants_room ON roomParticipants(roomId);
  CREATE INDEX IF NOT EXISTS idx_submissions_room_user ON submissions(roomId, userId);
`);

// обновление структуры базы данных
try {
  db.prepare('ALTER TABLE rooms ADD COLUMN createdAt TEXT').run();
  db.prepare('UPDATE rooms SET createdAt = COALESCE(createdAt, startedAt, CURRENT_TIMESTAMP)').run();
} catch (error) {
  if (!String(error.message).includes('duplicate column name')) {
    throw error;
  }
}
db.prepare('UPDATE rooms SET createdAt = COALESCE(createdAt, startedAt, CURRENT_TIMESTAMP)').run();

for (const migration of [
  'ALTER TABLE rooms ADD COLUMN currentQuestionEndsAt INTEGER',
  'ALTER TABLE rooms ADD COLUMN questionOpen INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE quizzes ADD COLUMN quizMode TEXT NOT NULL DEFAULT 'synchronous'",
  "ALTER TABLE quizzes ADD COLUMN accessMode TEXT NOT NULL DEFAULT 'room'",
  "ALTER TABLE quizzes ADD COLUMN organizerName TEXT NOT NULL DEFAULT ''"
]) {
  try {
    db.prepare(migration).run();
  } catch (error) {
    if (!String(error.message).includes('duplicate column name')) {
      throw error;
    }
  }
}

export function getQuizWithQuestions(quizId) {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);

  if (!quiz) {
    return null;
  }

  const questions = db.prepare(`
    SELECT * FROM questions
    WHERE quizId = ?
    ORDER BY orderIndex ASC
  `).all(quizId);

  const answers = db.prepare(`
    SELECT answers.*
    FROM answers
    JOIN questions ON questions.id = answers.questionId
    WHERE questions.quizId = ?
    ORDER BY questions.orderIndex ASC, answers.id ASC
  `).all(quizId);
  const answersByQuestion = new Map();
  answers.forEach((answer) => {
    const items = answersByQuestion.get(answer.questionId) || [];
    items.push(answer);
    answersByQuestion.set(answer.questionId, items);
  });

  return {
    ...quiz,
    questions: questions.map((question) => ({
      ...question,
      answers: answersByQuestion.get(question.id) || []
    }))
  };
}

// публичные данные вопроса
export function publicQuestion(question) {
  return {
    id: question.id,
    type: question.type,
    text: question.text,
    imageUrl: question.imageUrl,
    orderIndex: question.orderIndex,
    points: question.points,
    answers: question.answers.map((answer) => ({
      id: answer.id,
      text: answer.text
    }))
  };
}

export function getPublicQuizSummary(quizId) {
  const quiz = db.prepare(`
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
      q.status,
      COUNT(questions.id) AS questionsCount
    FROM quizzes q
    LEFT JOIN questions ON questions.quizId = q.id
    WHERE q.id = ?
    GROUP BY q.id
  `).get(quizId);

  return quiz || null;
}

// email для экспорта организатора
export function getLeaderboard(roomId, includeEmail = false) {
  return db.prepare(`
    SELECT rp.userId, rp.displayName, rp.score${includeEmail ? ', u.email' : ''}
    FROM roomParticipants rp
    JOIN users u ON u.id = rp.userId
    WHERE rp.roomId = ? AND u.role = 'participant'
    ORDER BY rp.score DESC, rp.joinedAt ASC
  `).all(roomId);
}

export function getRoomResults(roomId) {
  const room = getRoomById(roomId);
  if (!room) return null;

  const quiz = getQuizWithQuestions(room.quizId);
  const leaderboard = getLeaderboard(roomId);
  const participantCount = leaderboard.length;
  const bestScore = leaderboard[0]?.score || 0;
  const averageScore = participantCount
    ? Math.round((leaderboard.reduce((sum, item) => sum + item.score, 0) / participantCount) * 10) / 10
    : 0;

  return {
    room,
    quiz,
    leaderboard,
    summary: {
      participantCount,
      bestScore,
      averageScore,
      winner: leaderboard[0] || null,
      questionsCount: quiz?.questions.length || 0
    },
    questionStats: quiz?.questions.map((question) => getQuestionStats(roomId, question.id)) || []
  };
}

export function getQuestionStats(roomId, questionId) {
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
  if (!question) return null;

  const answers = db.prepare('SELECT * FROM answers WHERE questionId = ? ORDER BY id ASC').all(questionId);
  const submissions = db.prepare(`
    SELECT s.*, rp.displayName
    FROM submissions s
    LEFT JOIN roomParticipants rp ON rp.roomId = s.roomId AND rp.userId = s.userId
    WHERE s.roomId = ? AND s.questionId = ?
    ORDER BY s.submittedAt ASC
  `).all(roomId, questionId);

  const optionCounts = answers.map((answer) => ({ id: answer.id, text: answer.text, count: 0, isCorrect: Boolean(answer.isCorrect) }));
  const textAnswers = [];

  submissions.forEach((submission) => {
    const payload = parsePayload(submission.answerPayload);
    if (question.type === 'single') {
      const item = optionCounts.find((answer) => answer.id === Number(payload));
      if (item) item.count += 1;
    } else if (question.type === 'multiple') {
      (Array.isArray(payload) ? payload : [payload]).forEach((id) => {
        const item = optionCounts.find((answer) => answer.id === Number(id));
        if (item) item.count += 1;
      });
    } else {
      textAnswers.push({
        displayName: submission.displayName || 'Участник',
        answer: String(payload || ''),
        isCorrect: Boolean(submission.isCorrect)
      });
    }
  });

  return {
    questionId: question.id,
    text: question.text,
    type: question.type,
    totalAnswers: submissions.length,
    correctAnswers: submissions.filter((submission) => submission.isCorrect).length,
    options: optionCounts,
    textAnswers,
    correctAnswer: getCorrectAnswerSummary(question, answers)
  };
}

export function getCorrectAnswerSummary(question, answers = []) {
  const correct = answers.filter((answer) => answer.isCorrect);
  return {
    questionId: question.id,
    type: question.type,
    values: correct.map((answer) => ({ id: answer.id, text: answer.text }))
  };
}

function parsePayload(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function getRoomByCode(code) {
  return db.prepare(`
    SELECT r.*, q.title, q.timeLimitSec, q.scoringMode, q.quizMode, q.accessMode, q.status AS quizStatus, q.organizerId
    FROM rooms r
    JOIN quizzes q ON q.id = r.quizId
    WHERE r.code = ?
  `).get(String(code).trim().toUpperCase());
}

export function getRoomById(roomId) {
  return db.prepare(`
    SELECT r.*, q.title, q.timeLimitSec, q.scoringMode, q.quizMode, q.accessMode, q.status AS quizStatus, q.organizerId
    FROM rooms r
    JOIN quizzes q ON q.id = r.quizId
    WHERE r.id = ?
  `).get(roomId);
}

export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}
