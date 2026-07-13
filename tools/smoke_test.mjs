import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { io } from '../client/node_modules/socket.io-client/build/esm/index.js';

const root = resolve(import.meta.dirname, '..');
const port = 4187;
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await mkdtemp(join(tmpdir(), 'quiz-mvp-smoke-'));
const databasePath = join(tempDir, 'database.sqlite');
let serverProcess;

function startServer() {
  serverProcess = spawn(process.execPath, ['server/src/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: databasePath,
      JWT_SECRET: 'smoke-test-secret',
      CLIENT_ORIGIN: 'http://127.0.0.1:5173'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Smoke-test server did not start.');
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill('SIGTERM');
  await new Promise((resolveExit) => serverProcess.once('exit', resolveExit));
}

async function request(path, { method = 'GET', token, body, expectedStatus } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (expectedStatus) {
    assert.equal(response.status, expectedStatus, `${method} ${path}`);
  } else {
    assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

function connect(token) {
  return new Promise((resolveConnect, rejectConnect) => {
    const socket = io(baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false });
    socket.once('connect', () => resolveConnect(socket));
    socket.once('connect_error', rejectConnect);
  });
}

function emitAck(socket, event, payload, expectOk = true) {
  return new Promise((resolveAck, rejectAck) => {
    socket.emit(event, payload, (response) => {
      if (expectOk && !response?.ok) rejectAck(new Error(`${event}: ${response?.error || 'failed'}`));
      else resolveAck(response);
    });
  });
}

function once(socket, event) {
  return new Promise((resolveEvent) => socket.once(event, resolveEvent));
}

try {
  startServer();
  await waitForServer();

  const suffix = Date.now();
  const organizer = await request('/api/auth/register', {
    method: 'POST',
    body: { email: `organizer-${suffix}@test.local`, password: 'password123', role: 'organizer' }
  });
  const participantOne = await request('/api/auth/register', {
    method: 'POST',
    body: { email: `participant-one-${suffix}@test.local`, password: 'password123', role: 'participant' }
  });
  const participantTwo = await request('/api/auth/register', {
    method: 'POST',
    body: { email: `participant-two-${suffix}@test.local`, password: 'password123', role: 'participant' }
  });
  const outsider = await request('/api/auth/register', {
    method: 'POST',
    body: { email: `outsider-${suffix}@test.local`, password: 'password123', role: 'participant' }
  });

  const missingOrganizerName = await request('/api/quizzes', {
    method: 'POST',
    token: organizer.token,
    expectedStatus: 400,
    body: {
      title: 'Quiz without organizer name',
      questions: [{
        type: 'single',
        text: 'Question',
        answers: [{ text: 'Correct', isCorrect: true }, { text: 'Wrong', isCorrect: false }]
      }]
    }
  });
  assert.equal(missingOrganizerName.error, 'Укажите наименование организатора.');

  const quiz = await request('/api/quizzes', {
    method: 'POST',
    token: organizer.token,
    body: {
      organizerName: 'Smoke Test Organizer',
      title: 'Smoke quiz',
      description: 'Integration test',
      category: 'Test',
      timeLimitSec: 30,
      scoringMode: 'standard',
      questions: [
        {
          type: 'single',
          text: 'Select the correct option',
          imageUrl: 'https://example.test/question.png',
          points: 5,
          answers: [{ text: 'Wrong', isCorrect: false }, { text: 'Correct', isCorrect: true }]
        }
      ]
    }
  });
  await request(`/api/quizzes/${quiz.id}/publish`, { method: 'POST', token: organizer.token });
  const room = await request('/api/rooms', { method: 'POST', token: organizer.token, body: { quizId: quiz.id } });
  assert.equal(room.quiz.questions.length, 1, 'Room response must include questions for host controls.');

  const roomPayload = await request(`/api/rooms/${room.code}`, { token: participantOne.token });
  assert.equal(roomPayload.quiz.questions, undefined, 'Room API must not expose questions.');
  assert.equal(JSON.stringify(roomPayload).includes('isCorrect'), false, 'Room API leaked correct answers.');
  await request(`/api/rooms/${room.code}/results`, { token: participantOne.token, expectedStatus: 403 });

  let hostSocket = await connect(organizer.token);
  let participantOneSocket = await connect(participantOne.token);
  await emitAck(hostSocket, 'room:host-join', { roomId: room.id });
  await emitAck(participantOneSocket, 'room:join', { code: room.code, displayName: 'Player One' });
  await emitAck(hostSocket, 'quiz:start', { roomId: room.id });

  const firstQuestion = once(participantOneSocket, 'question:show');
  await emitAck(hostSocket, 'question:show', { roomId: room.id, questionIndex: 0 });
  const shown = await firstQuestion;
  assert.equal(shown.question.imageUrl, 'https://example.test/question.png');
  assert.equal(shown.question.answers.some((answer) => 'isCorrect' in answer), false);

  hostSocket.disconnect();
  participantOneSocket.disconnect();
  await stopServer();

  startServer();
  await waitForServer();
  hostSocket = await connect(organizer.token);
  participantOneSocket = await connect(participantOne.token);
  const restoredForHost = once(hostSocket, 'question:show');
  await emitAck(hostSocket, 'room:host-join', { roomId: room.id });
  await restoredForHost;
  const restoredForParticipant = once(participantOneSocket, 'question:show');
  await emitAck(participantOneSocket, 'room:join', { code: room.code, displayName: 'Player One' });
  const restored = await restoredForParticipant;
  assert.equal(restored.question.id, shown.question.id, 'Active question was not restored after restart.');

  const participantTwoSocket = await connect(participantTwo.token);
  const lateQuestion = once(participantTwoSocket, 'question:show');
  await emitAck(participantTwoSocket, 'room:join', { code: room.code, displayName: 'Player Two' });
  assert.equal((await lateQuestion).question.id, shown.question.id, 'Late participant did not receive current question.');

  const organizerAnswer = await emitAck(hostSocket, 'question:answer', {
    roomId: room.id,
    questionId: shown.question.id,
    answerPayload: shown.question.answers[1].id
  }, false);
  assert.equal(organizerAnswer.ok, false, 'Organizer must not be able to answer.');

  await emitAck(participantOneSocket, 'question:answer', {
    roomId: room.id,
    questionId: shown.question.id,
    answerPayload: shown.question.answers[1].id
  });
  const repeatedAnswer = await emitAck(participantOneSocket, 'question:answer', {
    roomId: room.id,
    questionId: shown.question.id,
    answerPayload: shown.question.answers[0].id
  }, false);
  assert.equal(repeatedAnswer.ok, false, 'A participant must not answer the same question twice.');
  await emitAck(participantTwoSocket, 'question:answer', {
    roomId: room.id,
    questionId: shown.question.id,
    answerPayload: shown.question.answers[0].id
  });
  await emitAck(hostSocket, 'quiz:finish', { roomId: room.id });

  const results = await request(`/api/rooms/${room.code}/results`, { token: participantOne.token });
  assert.equal(results.summary.participantCount, 2);
  assert.equal(results.leaderboard.some((item) => 'email' in item), false, 'Public results leaked participant email.');
  assert.equal(results.summary.winner.displayName, 'Player One');
  await request(`/api/rooms/${room.code}/results`, { token: outsider.token, expectedStatus: 403 });
  await request(`/api/rooms/${room.code}/export.csv`, { token: participantOne.token, expectedStatus: 403 });

  const originalText = quiz.questions[0].text;
  const editPayload = {
    ...quiz,
    title: 'Updated metadata',
    questions: [{ ...quiz.questions[0], text: 'This structural change must be ignored.' }]
  };
  const edited = await request(`/api/quizzes/${quiz.id}`, { method: 'PUT', token: organizer.token, body: editPayload });
  assert.equal(edited.structureLocked, true);
  assert.equal(edited.questions[0].text, originalText);
  await request(`/api/quizzes/${quiz.id}`, { method: 'DELETE', token: organizer.token, expectedStatus: 409 });

  const standaloneQuiz = await request('/api/quizzes', {
    method: 'POST',
    token: organizer.token,
    body: {
      organizerName: 'Public Test Organizer',
      title: 'Public standalone quiz',
      description: 'Self-paced integration test',
      category: 'Test',
      timeLimitSec: 30,
      scoringMode: 'standard',
      quizMode: 'asynchronous',
      accessMode: 'public',
      questions: [
        {
          type: 'single',
          text: 'Standalone question',
          imageUrl: '',
          points: 4,
          answers: [{ text: 'Correct', isCorrect: true }, { text: 'Wrong', isCorrect: false }]
        }
      ]
    }
  });
  await request(`/api/quizzes/${standaloneQuiz.id}/publish`, { method: 'POST', token: organizer.token });
  await request('/api/rooms', { method: 'POST', token: organizer.token, body: { quizId: standaloneQuiz.id }, expectedStatus: 400 });

  const publicCatalog = await request('/api/quizzes/public', { token: participantOne.token });
  const publicQuiz = publicCatalog.find((item) => item.id === standaloneQuiz.id);
  assert.ok(publicQuiz, 'Public standalone quiz is missing from catalog.');
  assert.equal(publicQuiz.organizerName, 'Public Test Organizer');
  assert.equal('organizerEmail' in publicQuiz, false, 'Public catalog must not expose organizer email.');
  assert.equal(publicCatalog.some((item) => item.id === quiz.id), false, 'Synchronous quiz leaked into standalone catalog.');

  const attempt = await request(`/api/quizzes/${standaloneQuiz.id}/attempts`, {
    method: 'POST',
    token: participantOne.token
  });
  const standaloneQuestion = await request(`/api/attempts/${attempt.room.code}/questions/0`, { token: participantOne.token });
  assert.equal(JSON.stringify(standaloneQuestion).includes('isCorrect'), false, 'Standalone question leaked correct answer.');
  const correctStandaloneAnswer = standaloneQuiz.questions[0].answers.find((answer) => answer.isCorrect);
  const standaloneResult = await request(`/api/attempts/${attempt.room.code}/answers`, {
    method: 'POST',
    token: participantOne.token,
    body: { questionId: standaloneQuestion.question.id, answerPayload: correctStandaloneAnswer.id }
  });
  assert.equal(standaloneResult.finished, true);
  assert.equal(standaloneResult.results.leaderboard[0].score, 4);

  hostSocket.disconnect();
  participantOneSocket.disconnect();
  participantTwoSocket.disconnect();
  console.log('Smoke test passed: synchronous rooms, standalone catalog, protected answers and saved history.');
} finally {
  await stopServer();
  await rm(tempDir, { recursive: true, force: true });
}
