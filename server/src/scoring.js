import { db } from './db.js';


// проверка формата ответа
export function validateAnswerPayload(question, answers, payload) {
  if (!question) return 'Вопрос не найден.';
  if (question.type === 'text' || question.type === 'image') {
    const text = String(payload || '').trim();
    return text && text.length <= 500 ? null : 'Введите ответ длиной до 500 символов.';
  }

  const values = Array.isArray(payload) ? payload : [payload];
  if (question.type === 'single' && values.length !== 1) return 'Выберите один вариант ответа.';
  if (values.length === 0 || values.length > 20) return 'Выберите вариант ответа.';

  const ids = values.map(Number);
  const allowedIds = new Set(answers.map((answer) => answer.id));
  if (ids.some((id) => !Number.isInteger(id) || !allowedIds.has(id)) || new Set(ids).size !== ids.length) {
    return 'Выбран недоступный вариант ответа.';
  }
  return null;
}

// проверка ответа и начисление баллов
export function gradeAnswer(question, answers, payload, timing = null) {
  const awardPoints = (isCorrect) => {
    if (!isCorrect) return 0;
    if (timing?.scoringMode !== 'fast') return question.points;
    const remainingMs = Math.max(0, timing.endsAt - Date.now());
    const ratio = Math.max(0, Math.min(1, remainingMs / (timing.timeLimitSec * 1000)));
    return Math.max(1, Math.ceil(question.points * (0.5 + ratio * 0.5)));
  };

  if (question.type === 'text' || question.type === 'image') {
    const correct = answers.find((answer) => answer.isCorrect);
    const isCorrect = Boolean(correct)
      && String(payload || '').trim().toLowerCase() === correct.text.trim().toLowerCase();
    return { isCorrect, pointsEarned: awardPoints(isCorrect) };
  }

  const correctIds = answers.filter((answer) => answer.isCorrect).map((answer) => answer.id).sort((a, b) => a - b);
  const givenIds = (Array.isArray(payload) ? payload : [payload]).map(Number).sort((a, b) => a - b);
  const isCorrect = correctIds.length === givenIds.length && correctIds.every((id, index) => id === givenIds[index]);
  return { isCorrect, pointsEarned: awardPoints(isCorrect) };
}

// пересчет общего балла
export function recalculateScore(roomId, userId) {
  const total = db.prepare(`
    SELECT COALESCE(SUM(pointsEarned), 0) AS score
    FROM submissions
    WHERE roomId = ? AND userId = ?
  `).get(roomId, userId).score;

  db.prepare('UPDATE roomParticipants SET score = ? WHERE roomId = ? AND userId = ?').run(total, roomId, userId);
}
