import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './styles.css';

// настройки и подписи интерфейса
const API_URL = import.meta.env.VITE_API_URL || window.location.origin;
const STATUS_LABELS = {
  draft: 'Черновик',
  published: 'Опубликован',
  waiting: 'Ожидание',
  running: 'Идет',
  finished: 'Завершен'
};
const QUIZ_MODE_LABELS = {
  synchronous: 'Синхронный',
  asynchronous: 'Самостоятельный'
};
const ACCESS_MODE_LABELS = {
  public: 'Общий доступ',
  room: 'По коду комнаты'
};
const EMPTY_QUESTION = {
  type: 'single',
  text: '',
  imageUrl: '',
  points: 1,
  answers: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false }
  ]
};

// сессия, тема и текущий экран
function App() {
  const [token, setToken] = useState(localStorage.getItem('quizToken') || '');
  const [user, setUser] = useState(readStoredJson('quizUser'));
  const [view, setView] = useState(user ? 'dashboard' : 'auth');
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('quizTheme') === 'dark' ? 'dark' : 'light');
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [activeAttempt, setActiveAttempt] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('quizTheme', theme);
  }, [theme]);

  function saveSession(data) {
    localStorage.setItem('quizToken', data.token);
    localStorage.setItem('quizUser', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setView('dashboard');
  }

  function logout() {
    localStorage.removeItem('quizToken');
    localStorage.removeItem('quizUser');
    setToken('');
    setUser(null);
    setView('auth');
  }

  function notify(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <p className="eyebrow">
            Проект практики VK
            <span>Кормилец Вячеслав Александрович</span>
          </p>
          <h1>Веб-приложение для проведения интерактивных опросов</h1>
        </div>
        <div className="topbar-actions">
          {user && (
            <nav>
              <button onClick={() => setView('dashboard')}>{user.role === 'participant' ? 'Каталог' : 'Кабинет'}</button>
              {user.role === 'organizer' && <button onClick={() => { setEditingQuiz(null); setView('builder'); }}>Конструктор</button>}
              {user.role === 'organizer' && <button onClick={() => setView('host')}>Запуск комнаты</button>}
              <button onClick={() => setView('join')}>Подключиться</button>
              <button className="ghost" onClick={logout}>Выйти</button>
            </nav>
          )}
          <button
            className="theme-toggle"
            type="button"
            aria-label={theme === 'light' ? 'Включить темную тему' : 'Включить светлую тему'}
            title={theme === 'light' ? 'Светлая тема' : 'Темная тема'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            <span className={`theme-icon ${theme === 'light' ? 'sun' : 'moon'}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main>
        {!user && <AuthView onAuth={saveSession} notify={notify} />}
        {user && view === 'dashboard' && (
          <Dashboard
            token={token}
            user={user}
            notify={notify}
            onEditQuiz={(quiz) => {
              setEditingQuiz(quiz);
              setView('builder');
            }}
            onStartAttempt={(attempt) => {
              setActiveAttempt(attempt);
              setView('attempt');
            }}
          />
        )}
        {user && view === 'builder' && <QuizBuilder token={token} notify={notify} initialQuiz={editingQuiz} onResetEdit={() => setEditingQuiz(null)} />}
        {user && view === 'host' && <HostRoom token={token} notify={notify} />}
        {user && view === 'join' && <JoinRoom token={token} user={user} notify={notify} />}
        {user && view === 'attempt' && activeAttempt && (
          <SelfPacedQuiz token={token} attempt={activeAttempt} notify={notify} onExit={() => setView('dashboard')} />
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// регистрация и вход
function AuthView({ onAuth, notify }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', role: 'participant' });

  async function submit(event) {
    event.preventDefault();
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify(data.error || 'Ошибка авторизации');
        return;
      }
      onAuth(data);
    } catch {
      notify('Сервер недоступен. Проверьте, что backend запущен.');
    }
  }

  return (
    <section className="panel auth-panel">
      <div>
        <p className="eyebrow">Вход</p>
        <h2>{mode === 'login' ? 'Авторизация' : 'Регистрация'}</h2>
        <p>Войдите как участник или организатор, чтобы создавать и проходить квизы в реальном времени.</p>
      </div>
      <form onSubmit={submit}>
        <label>
          Почта
          <input type="email" required maxLength="254" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </label>
        <label>
          Пароль
          <input type="password" required minLength={mode === 'register' ? 8 : undefined} maxLength="72" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </label>
        {mode === 'register' && (
          <label>
            Роль
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="participant">Участник</option>
              <option value="organizer">Организатор</option>
            </select>
          </label>
        )}
        <button type="submit">{mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
        <button className="ghost" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Нужна регистрация' : 'Уже есть аккаунт'}
        </button>
      </form>
    </section>
  );
}

// личный кабинет и каталог
function Dashboard({ token, user, notify, onEditQuiz, onStartAttempt }) {
  const [profile, setProfile] = useState(null);
  const [publicQuizzes, setPublicQuizzes] = useState([]);
  const [filters, setFilters] = useState({ category: 'all', status: 'all' });
  const [roomResults, setRoomResults] = useState(null);

  useEffect(() => {
    api('/api/me', token).then(setProfile).catch((error) => notify(error.message));
    if (user.role === 'participant') {
      api('/api/quizzes/public', token).then(setPublicQuizzes).catch((error) => notify(error.message));
    }
  }, [token]);

  async function startAttempt(quizId) {
    try {
      const attempt = await api(`/api/quizzes/${quizId}/attempts`, token, { method: 'POST' });
      onStartAttempt(attempt);
    } catch (error) {
      notify(error.message);
    }
  }

  async function editQuiz(id) {
    try {
      const quiz = await api(`/api/quizzes/${id}`, token);
      onEditQuiz(quiz);
    } catch (error) {
      notify(error.message);
    }
  }

  async function deleteQuiz(id) {
    if (!window.confirm('Удалить квиз? Удаление доступно только для квизов, которые еще не проводились.')) return;
    try {
      await api(`/api/quizzes/${id}`, token, { method: 'DELETE' });
      notify('Квиз удален.');
      setProfile({
        ...profile,
        organized: profile.organized.filter((quiz) => quiz.id !== id)
      });
    } catch (error) {
      notify(error.message);
    }
  }

  async function duplicateQuiz(id) {
    try {
      const copy = await api(`/api/quizzes/${id}/duplicate`, token, { method: 'POST' });
      notify('Копия квиза создана.');
      setProfile({
        ...profile,
        organized: [{ ...copy, questionsCount: copy.questions.length, roomsCount: 0 }, ...profile.organized]
      });
    } catch (error) {
      notify(error.message);
    }
  }

  async function openRoomResults(code) {
    try {
      setRoomResults(await api(`/api/rooms/${code}/results`, token));
    } catch (error) {
      notify(error.message);
    }
  }

  if (!profile) {
    return <p>Загрузка...</p>;
  }

  const categories = ['all', ...new Set(profile.organized.map((quiz) => quiz.category))];
  const filteredQuizzes = profile.organized.filter((quiz) => {
    const matchesCategory = filters.category === 'all' || quiz.category === filters.category;
    const matchesStatus = filters.status === 'all' || quiz.status === filters.status;
    return matchesCategory && matchesStatus;
  });

  return (
    <section>
      <div className="dashboard">
        <Stat label="Роль" value={user.role === 'organizer' ? 'Организатор' : 'Участник'} />
        <Stat label={user.role === 'organizer' ? 'Создано' : 'Доступно'} value={user.role === 'organizer' ? profile.organized.length : publicQuizzes.length} />
        <Stat label="Участий" value={profile.participated.length} />
        {user.role === 'organizer' && <Stat label="Запусков" value={profile.hostedRooms.length} />}
      </div>
      {user.role === 'participant' && (
        <section className="panel catalog-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Общий доступ</p>
              <h2>Доступные квизы</h2>
            </div>
            <span className="muted">Проходите в удобном темпе</span>
          </div>
          {publicQuizzes.length === 0 && <p className="muted">Организаторы пока не опубликовали самостоятельные квизы.</p>}
          <div className="catalog-grid">
            {publicQuizzes.map((quiz) => (
              <article className="list-card" key={quiz.id}>
                <strong>{quiz.title}</strong>
                <span>{quiz.category} · {quiz.questionsCount} вопросов</span>
                <span>{quiz.description || 'Без описания'}</span>
                <span>Организатор: {quiz.organizerName || 'Организатор'}</span>
                <button type="button" onClick={() => startAttempt(quiz.id)}>Начать прохождение</button>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className={user.role === 'organizer' ? 'columns' : ''}>
        {user.role === 'organizer' && <div className="panel">
          <h2>{user.role === 'organizer' ? 'Созданные квизы' : 'Мои результаты'}</h2>
          {profile.organized.length > 0 && (
            <div className="toolbar">
              <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
                {categories.map((category) => <option key={category} value={category}>{category === 'all' ? 'Все категории' : category}</option>)}
              </select>
              <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                <option value="all">Все статусы</option>
                <option value="draft">Черновик</option>
                <option value="published">Опубликован</option>
              </select>
            </div>
          )}
          {profile.organized.length === 0 && user.role === 'organizer' && <p className="muted">Пока нет созданных квизов.</p>}
          {filteredQuizzes.map((quiz) => (
            <article className="list-card" key={quiz.id}>
              <strong>{quiz.title}</strong>
              <span>{quiz.category} · {quiz.questionsCount} вопросов · {STATUS_LABELS[quiz.status] || quiz.status}</span>
              <span>{QUIZ_MODE_LABELS[quiz.quizMode]} · {ACCESS_MODE_LABELS[quiz.accessMode]}</span>
              <div className="card-actions">
                <button className="ghost" type="button" onClick={() => editQuiz(quiz.id)}>Редактировать</button>
                <button className="ghost" type="button" onClick={() => duplicateQuiz(quiz.id)}>Копировать</button>
                <button className="danger" type="button" onClick={() => deleteQuiz(quiz.id)}>Удалить</button>
              </div>
            </article>
          ))}
          {profile.organized.length > 0 && filteredQuizzes.length === 0 && <p className="muted">По выбранным фильтрам квизов нет.</p>}
        </div>}
        <div className="panel">
          <h2>История участия</h2>
          {profile.participated.length === 0 && <p className="muted">Вы еще не участвовали в комнатах.</p>}
          {profile.participated.map((item) => (
            <article className="list-card" key={`${item.code}-${item.joinedAt}`}>
              <strong>{item.title}</strong>
              <span>Комната {item.code} · {item.score} баллов · {STATUS_LABELS[item.status] || item.status}</span>
            </article>
          ))}
        </div>
      </div>
      {user.role === 'organizer' && (
        <div className="panel block-panel">
          <h2>История проведенных комнат</h2>
          {profile.hostedRooms.length === 0 && <p className="muted">Комнаты еще не запускались.</p>}
          <div className="room-history">
            {profile.hostedRooms.map((room) => (
              <article className="list-card" key={room.id}>
                <strong>{room.title}</strong>
                <span>Комната {room.code} · {STATUS_LABELS[room.status] || room.status} · {room.participantsCount} участников · лучший балл {room.bestScore || 0}</span>
                <div className="card-actions">
                  <button className="ghost" type="button" onClick={() => openRoomResults(room.code)}>Открыть результаты</button>
                  <button className="ghost" type="button" onClick={() => exportRoomCsv(room.code, token)}>Скачать CSV</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {roomResults && (
        <div className="block-panel">
          <ResultsSummary results={roomResults} token={token} canExport />
          <QuestionStatsList stats={roomResults.questionStats} />
        </div>
      )}
    </section>
  );
}

function makeEmptyQuiz() {
  return {
    organizerName: '',
    title: '',
    description: '',
    category: 'Общее',
    timeLimitSec: 30,
    scoringMode: 'standard',
    quizMode: 'synchronous',
    accessMode: 'room',
    questions: [structuredClone(EMPTY_QUESTION)]
  };
}

function normalizeQuizForForm(quiz) {
  if (!quiz) return makeEmptyQuiz();
  return {
    id: quiz.id,
    structureLocked: Boolean(quiz.structureLocked),
    organizerName: quiz.organizerName || '',
    title: quiz.title || '',
    description: quiz.description || '',
    category: quiz.category || 'Общее',
    timeLimitSec: quiz.timeLimitSec || 30,
    scoringMode: quiz.scoringMode || 'standard',
    quizMode: quiz.quizMode || 'synchronous',
    accessMode: quiz.accessMode || 'room',
    questions: quiz.questions?.length ? quiz.questions.map((question) => ({
      type: question.type === 'image' ? 'text' : question.type,
      text: question.text,
      imageUrl: question.imageUrl || '',
      points: question.points || 1,
      answers: question.answers?.length ? question.answers.map((answer) => ({ text: answer.text, isCorrect: Boolean(answer.isCorrect) })) : structuredClone(EMPTY_QUESTION.answers)
    })) : [structuredClone(EMPTY_QUESTION)]
  };
}

// конструктор квиза
function QuizBuilder({ token, notify, initialQuiz, onResetEdit }) {
  const [quiz, setQuiz] = useState(normalizeQuizForForm(initialQuiz));
  const [csvImport, setCsvImport] = useState('');

  useEffect(() => {
    setQuiz(normalizeQuizForForm(initialQuiz));
  }, [initialQuiz]);

  function updateQuestion(index, patch) {
    setQuiz({
      ...quiz,
      questions: quiz.questions.map((question, currentIndex) => currentIndex === index ? { ...question, ...patch } : question)
    });
  }

  function updateAnswer(questionIndex, answerIndex, patch) {
    const questions = quiz.questions.map((question, currentIndex) => {
      if (currentIndex !== questionIndex) return question;
      return {
        ...question,
        answers: question.answers.map((answer, index) => index === answerIndex ? { ...answer, ...patch } : answer)
      };
    });
    setQuiz({ ...quiz, questions });
  }

  async function saveQuiz(event) {
    event.preventDefault();
    if (!quiz.organizerName.trim()) {
      notify('Укажите наименование организатора.');
      return;
    }
    try {
      const saved = await api(quiz.id ? `/api/quizzes/${quiz.id}` : '/api/quizzes', token, {
        method: quiz.id ? 'PUT' : 'POST',
        body: quiz
      });
      await api(`/api/quizzes/${saved.id}/publish`, token, { method: 'POST' });
      notify(quiz.id ? 'Квиз обновлен.' : 'Квиз создан и опубликован.');
      setQuiz(makeEmptyQuiz());
      onResetEdit?.();
    } catch (error) {
      notify(error.message);
    }
  }

  async function importCsv(event) {
    event.preventDefault();
    if (!quiz.organizerName.trim()) {
      notify('Укажите наименование организатора.');
      return;
    }
    try {
      const imported = await api('/api/quizzes/import-csv', token, {
        method: 'POST',
        body: { ...quiz, csv: csvImport }
      });
      notify(`Импортировано вопросов: ${imported.questions.length}.`);
      setCsvImport('');
      setQuiz(makeEmptyQuiz());
      onResetEdit?.();
    } catch (error) {
      notify(error.message);
    }
  }

  return (
    <form className="panel builder" onSubmit={saveQuiz}>
      <div className="section-head">
        <h2>{quiz.id ? 'Редактирование квиза' : 'Конструктор квиза'}</h2>
        {quiz.id && <button className="ghost" type="button" onClick={() => { setQuiz(makeEmptyQuiz()); onResetEdit?.(); }}>Новый квиз</button>}
      </div>
      <div className="form-grid">
        <label>
          Наименование организатора
          <input
            aria-required="true"
            value={quiz.organizerName}
            placeholder="Например, Учебный центр VK"
            onChange={(event) => setQuiz({ ...quiz, organizerName: event.target.value })}
          />
        </label>
        <label>Название<input value={quiz.title} onChange={(event) => setQuiz({ ...quiz, title: event.target.value })} /></label>
        <label>Категория<input value={quiz.category} onChange={(event) => setQuiz({ ...quiz, category: event.target.value })} /></label>
        <label>Время на вопрос, сек.<input type="number" value={quiz.timeLimitSec} onChange={(event) => setQuiz({ ...quiz, timeLimitSec: event.target.value })} /></label>
        <label>
          Подсчет баллов
          <select value={quiz.scoringMode} onChange={(event) => setQuiz({ ...quiz, scoringMode: event.target.value })}>
            <option value="standard">Стандартный</option>
            <option value="fast">Больше баллов за быстрый ответ</option>
          </select>
        </label>
        <label>
          Формат прохождения
          <select
            value={quiz.quizMode}
            onChange={(event) => {
              const quizMode = event.target.value;
              setQuiz({ ...quiz, quizMode, accessMode: quizMode === 'synchronous' ? 'room' : quiz.accessMode });
            }}
          >
            <option value="synchronous">Синхронный с организатором</option>
            <option value="asynchronous">Самостоятельный</option>
          </select>
        </label>
        <label>
          Доступ
          <select value={quiz.accessMode} disabled={quiz.quizMode === 'synchronous'} onChange={(event) => setQuiz({ ...quiz, accessMode: event.target.value })}>
            <option value="public">В общем каталоге для всех участников</option>
            <option value="room">Только по коду/ссылке</option>
          </select>
        </label>
        <label>Описание<textarea value={quiz.description} onChange={(event) => setQuiz({ ...quiz, description: event.target.value })} /></label>
      </div>
      {quiz.structureLocked && (
        <div className="feedback">
          <strong>Структура квиза заблокирована</strong>
          <span>Квиз уже проводился. Можно менять название, описание, категорию, время и правила, но вопросы сохранены без изменений для корректной истории.</span>
        </div>
      )}
      {!quiz.id && (
        <section className="import-box">
          <h2>Импорт вопросов из CSV</h2>
          <p className="muted">Формат строки: тип;текст;URL изображения;баллы;правильный ответ;вариант 1;вариант 2;вариант 3. Для нескольких правильных ответов используйте 1|3.</p>
          <textarea
            value={csvImport}
            onChange={(event) => setCsvImport(event.target.value)}
            placeholder={'single;Сколько будет 2+2?;;3;2;3;4;5\nmultiple;Выберите языки программирования;;2;1|3;JavaScript;HTML;Python'}
          />
          <button className="ghost" type="button" disabled={!csvImport.trim() || !quiz.title.trim()} onClick={importCsv}>Импортировать CSV как квиз</button>
        </section>
      )}
      <h2>Вопросы</h2>
      {quiz.questions.map((question, questionIndex) => (
        <article className="question-editor" key={questionIndex}>
          <div className="form-grid">
            <label>
              Тип
              <select disabled={quiz.structureLocked} value={question.type} onChange={(event) => updateQuestion(questionIndex, { type: event.target.value })}>
                <option value="single">Одиночный выбор</option>
                <option value="multiple">Множественный выбор</option>
                <option value="text">Текстовый ответ</option>
              </select>
            </label>
            <label>Баллы<input disabled={quiz.structureLocked} type="number" value={question.points} onChange={(event) => updateQuestion(questionIndex, { points: event.target.value })} /></label>
          </div>
          <label>Текст вопроса<input disabled={quiz.structureLocked} value={question.text} onChange={(event) => updateQuestion(questionIndex, { text: event.target.value })} /></label>
          <label>URL изображения (необязательно)<input disabled={quiz.structureLocked} value={question.imageUrl} onChange={(event) => updateQuestion(questionIndex, { imageUrl: event.target.value })} /></label>
          <div className="answers">
            {question.answers.map((answer, answerIndex) => (
              <div className="answer-row" key={answerIndex}>
                <input disabled={quiz.structureLocked} value={answer.text} placeholder="Вариант/правильный текст" onChange={(event) => updateAnswer(questionIndex, answerIndex, { text: event.target.value })} />
                <label className="inline"><input disabled={quiz.structureLocked} type="checkbox" checked={answer.isCorrect} onChange={(event) => updateAnswer(questionIndex, answerIndex, { isCorrect: event.target.checked })} /> верный</label>
              </div>
            ))}
            <button disabled={quiz.structureLocked} type="button" className="ghost" onClick={() => updateQuestion(questionIndex, { answers: [...question.answers, { text: '', isCorrect: false }] })}>Добавить ответ</button>
          </div>
        </article>
      ))}
      <button disabled={quiz.structureLocked} type="button" className="ghost" onClick={() => setQuiz({ ...quiz, questions: [...quiz.questions, structuredClone(EMPTY_QUESTION)] })}>Добавить вопрос</button>
      <button type="submit">{quiz.id ? 'Сохранить изменения' : 'Сохранить квиз'}</button>
    </form>
  );
}

// комната организатора
function HostRoom({ token, notify }) {
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState('');
  const [filters, setFilters] = useState({ category: 'all', status: 'published' });
  const [room, setRoom] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [autoMode, setAutoMode] = useState(false);
  const [state, setState] = useState({ participants: [], leaderboard: [], currentQuestion: null, questionStats: null, results: null, closed: false, roomStatus: 'waiting' });
  const socket = useMemo(() => token ? io(API_URL, { auth: { token } }) : null, [token]);

  useEffect(() => {
    api('/api/quizzes', token).then(setQuizzes).catch((error) => notify(error.message));
    return () => socket?.disconnect();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('room:participant-list', (participants) => setState((prev) => ({ ...prev, participants })));
    socket.on('leaderboard:update', (leaderboard) => setState((prev) => ({ ...prev, leaderboard })));
    socket.on('quiz:start', () => setState((prev) => ({ ...prev, roomStatus: 'running' })));
    socket.on('question:show', (payload) => {
      setQuestionIndex(payload.questionIndex);
      setState((prev) => ({ ...prev, currentQuestion: payload, questionStats: null, closed: false, roomStatus: 'running' }));
    });
    socket.on('question:close', (payload) => setState((prev) => ({ ...prev, closed: true, leaderboard: payload.leaderboard, questionStats: payload.questionStats })));
    socket.on('quiz:finish', (payload) => setState((prev) => ({ ...prev, closed: true, leaderboard: payload.leaderboard, results: payload, roomStatus: 'finished' })));
  }, [socket]);

  useEffect(() => {
    if (!socket || !room) return;
    const joinAsHost = () => {
      socket.emit('room:host-join', { roomId: room.id }, (response) => {
        if (!response?.ok) notify(response?.error || 'Не удалось восстановить комнату');
      });
    };
    if (socket.connected) joinAsHost();
    socket.on('connect', joinAsHost);
    return () => socket.off('connect', joinAsHost);
  }, [socket, room]);

  useEffect(() => {
    if (!autoMode || !room || !state.closed || state.roomStatus === 'finished') return;
    const nextIndex = questionIndex + 1;
    const total = room.quiz?.questions?.length || 0;
    const timer = setTimeout(() => {
      if (nextIndex < total) {
        emit('question:show', { questionIndex: nextIndex });
      } else {
        emit('quiz:finish');
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [autoMode, state.closed, questionIndex, room, state.roomStatus]);

  async function createRoom() {
    try {
      const created = await api('/api/rooms', token, { method: 'POST', body: { quizId: selectedQuiz } });
      setRoom(created);
      setQuestionIndex(0);
      setState({ participants: [], leaderboard: [], currentQuestion: null, questionStats: null, results: null, closed: false, roomStatus: 'waiting' });
    } catch (error) {
      notify(error.message);
    }
  }

  function emit(event, payload = {}) {
    socket.emit(event, { roomId: room.id, ...payload }, (response) => {
      if (!response?.ok) notify(response?.error || 'Ошибка комнаты');
    });
  }

  const categories = ['all', ...new Set(quizzes.map((quiz) => quiz.category))];
  const filteredQuizzes = quizzes.filter((quiz) => {
    const matchesCategory = filters.category === 'all' || quiz.category === filters.category;
    const matchesStatus = filters.status === 'all' || quiz.status === filters.status;
    return quiz.quizMode === 'synchronous' && matchesCategory && matchesStatus;
  });

  return (
    <section className="columns">
      <div className="panel">
        <h2>Запуск комнаты</h2>
        <div className="toolbar">
          <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
            {categories.map((category) => <option key={category} value={category}>{category === 'all' ? 'Все категории' : category}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="all">Все статусы</option>
            <option value="published">Опубликован</option>
            <option value="draft">Черновик</option>
          </select>
        </div>
        <label>Квиз
          <select value={selectedQuiz} onChange={(event) => setSelectedQuiz(event.target.value)}>
            <option value="">Выберите квиз</option>
            {filteredQuizzes.map((quiz) => <option value={quiz.id} key={quiz.id}>{quiz.title} · {quiz.category}</option>)}
          </select>
        </label>
        <button disabled={!selectedQuiz} onClick={createRoom}>Создать комнату</button>
        {room && (
          <RoomControl
            room={room}
            state={state}
            emit={emit}
            token={token}
            questionIndex={questionIndex}
            setQuestionIndex={setQuestionIndex}
            autoMode={autoMode}
            setAutoMode={setAutoMode}
          />
        )}
      </div>
      <div className="side-stack">
        <Leaderboard leaderboard={state.leaderboard} participants={state.participants} />
        {state.questionStats && <QuestionStats stats={state.questionStats} />}
        {state.results && <ResultsSummary results={state.results} token={token} canExport />}
      </div>
    </section>
  );
}

// управление квизом
function RoomControl({ room, state, emit, token, questionIndex, setQuestionIndex, autoMode, setAutoMode }) {
  const totalQuestions = room.quiz?.questions?.length || 0;
  return (
    <div className="room-control">
      <div className="room-code">{room.code}</div>
      <p>Передайте код участникам для подключения. Статус: {STATUS_LABELS[state.roomStatus] || state.roomStatus}</p>
      {state.roomStatus === 'waiting' && (
        <div className="waiting-box">
          <strong>{room.quiz.title}</strong>
          <span>{state.participants.length} участников подключено</span>
        </div>
      )}
      <label className="inline">
        <input type="checkbox" checked={autoMode} onChange={(event) => setAutoMode(event.target.checked)} />
        автоматический переход к следующему вопросу
      </label>
      <button disabled={state.roomStatus === 'finished'} onClick={() => emit('quiz:start')}>Запустить квиз</button>
      <div className="stepper">
        <button onClick={() => setQuestionIndex(Math.max(0, questionIndex - 1))}>-</button>
        <strong>Вопрос {questionIndex + 1} из {totalQuestions}</strong>
        <button onClick={() => setQuestionIndex(Math.min(totalQuestions - 1, questionIndex + 1))}>+</button>
      </div>
      <button disabled={state.roomStatus === 'finished'} onClick={() => emit('question:show', { questionIndex })}>Показать вопрос</button>
      <button disabled={state.roomStatus === 'finished'} className="ghost" onClick={() => emit('question:close')}>Закрыть ответы</button>
      <button disabled={state.roomStatus === 'finished'} className="danger" onClick={() => emit('quiz:finish')}>Завершить квиз</button>
      <button className="ghost" onClick={() => exportRoomCsv(room.code, token)}>Скачать CSV</button>
      {state.currentQuestion && <p className="muted">Сейчас показывается: {state.currentQuestion.question.text}</p>}
      {state.currentQuestion && !state.closed && <Timer endsAt={state.currentQuestion.endsAt} />}
    </div>
  );
}

// самостоятельное прохождение
function SelfPacedQuiz({ token, attempt, notify, onExit }) {
  const [questionPayload, setQuestionPayload] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [results, setResults] = useState(null);

  useEffect(() => {
    loadQuestion(0);
  }, [attempt.room.code]);

  async function loadQuestion(index) {
    try {
      const payload = await api(`/api/attempts/${attempt.room.code}/questions/${index}`, token);
      setQuestionPayload(payload);
      setQuestionIndex(index);
      setAnswer(payload.question.type === 'multiple' ? [] : '');
      setFeedback(null);
    } catch (error) {
      notify(error.message);
    }
  }

  async function submitAnswer() {
    try {
      const response = await api(`/api/attempts/${attempt.room.code}/answers`, token, {
        method: 'POST',
        body: { questionId: questionPayload.question.id, answerPayload: answer }
      });
      setFeedback({ answerResult: response, correctAnswer: response.correctAnswer, nextIndex: response.nextIndex });
      if (response.finished) {
        setResults(response.results);
      }
    } catch (error) {
      notify(error.message);
    }
  }

  if (results) {
    return (
      <section className="columns">
        <div className="panel">
          <p className="eyebrow">Самостоятельный квиз завершён</p>
          <h2>{attempt.quiz.title}</h2>
          <p>Все ответы сохранены. Результат появился в истории участия.</p>
          <button type="button" onClick={onExit}>Вернуться в каталог</button>
        </div>
        <ResultsSummary results={results} />
      </section>
    );
  }

  return (
    <section className="columns">
      <div className="panel self-paced-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Самостоятельное прохождение</p>
            <h2>{attempt.quiz.title}</h2>
          </div>
          {questionPayload && <strong>Вопрос {questionIndex + 1} из {questionPayload.totalQuestions}</strong>}
        </div>
        {questionPayload && (
          <>
            <div className="quiz-progress" aria-label={`Пройдено ${questionIndex} из ${questionPayload.totalQuestions}`}>
              <i style={{ width: `${(questionIndex / questionPayload.totalQuestions) * 100}%` }} />
            </div>
            <QuestionAnswer
              question={questionPayload.question}
              answer={answer}
              setAnswer={setAnswer}
              submitAnswer={submitAnswer}
              answered={Boolean(feedback)}
            />
          </>
        )}
        {feedback && (
          <>
            <AnswerFeedback feedback={feedback} />
            <button type="button" onClick={() => loadQuestion(feedback.nextIndex)}>Следующий вопрос</button>
          </>
        )}
      </div>
      <aside className="panel">
        <h2>Правила</h2>
        <p className="muted">Вопросы открываются по очереди. После отправки изменить ответ нельзя, но переходить дальше можно в удобном темпе.</p>
        <button className="ghost" type="button" onClick={onExit}>Выйти в каталог</button>
      </aside>
    </section>
  );
}

// подключение к комнате
function JoinRoom({ token, user, notify }) {
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [joinedName, setJoinedName] = useState('');
  const [room, setRoom] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState([]);
  const [answerResult, setAnswerResult] = useState(null);
  const answerResultRef = useRef(null);
  const [closedFeedback, setClosedFeedback] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [results, setResults] = useState(null);
  const [message, setMessage] = useState('Введите код комнаты для подключения.');
  const socket = useMemo(() => token ? io(API_URL, { auth: { token } }) : null, [token]);

  useEffect(() => {
    if (!socket) return;
    socket.on('quiz:start', () => {
      setMessage('Квиз начался. Ждите первый вопрос.');
      setResults(null);
    });
    socket.on('question:show', (payload) => {
      setQuestion(payload);
      setAnswer(payload.question.type === 'multiple' ? [] : '');
      setAnswerResult(null);
      answerResultRef.current = null;
      setClosedFeedback(null);
      setMessage(`Вопрос открыт. Время: ${payload.timeLimitSec} сек.`);
    });
    socket.on('question:close', (payload) => {
      setClosedFeedback({
        correctAnswer: payload.correctAnswer,
        answerResult: answerResultRef.current
      });
      setQuestion(null);
      setLeaderboard(payload.leaderboard);
      setMessage(answerResultRef.current ? 'Ответы закрыты. Проверьте правильный ответ.' : 'Ответы закрыты. Вы не отправили ответ на этот вопрос.');
    });
    socket.on('leaderboard:update', setLeaderboard);
    socket.on('quiz:finish', (payload) => {
      setQuestion(null);
      setLeaderboard(payload.leaderboard);
      setResults(payload);
      setMessage('Квиз завершен.');
    });
    return () => socket.disconnect();
  }, [socket]);

  useEffect(() => {
    if (!socket || !room || room.status === 'finished') return;
    const joinAsParticipant = () => {
      socket.emit('room:join', { code: room.code, displayName: joinedName }, (response) => {
        if (!response?.ok) notify(response?.error || 'Не удалось подключиться');
        else setMessage(room.status === 'waiting' ? 'Вы подключились. Ожидаем запуск квиза организатором.' : 'Вы подключились к активной комнате.');
      });
    };
    if (socket.connected) joinAsParticipant();
    socket.on('connect', joinAsParticipant);
    return () => socket.off('connect', joinAsParticipant);
  }, [socket, room, joinedName]);

  async function joinRoom() {
    try {
      const data = await api(`/api/rooms/${code}`, token);
      setRoom(data.room);
      setJoinedName(nickname.trim());
      setQuiz(data.quiz);
      setLeaderboard(data.leaderboard);
      setResults(null);
      setClosedFeedback(null);
      if (data.room.status === 'finished') {
        setResults(await api(`/api/rooms/${code}/results`, token));
        setMessage('Квиз завершен. Показаны сохраненные результаты.');
      }
    } catch (error) {
      notify(error.message);
    }
  }

  function submitAnswer() {
    socket.emit('question:answer', {
      roomId: room.id,
      questionId: question.question.id,
      answerPayload: answer
    }, (response) => {
      if (!response?.ok) notify(response?.error || 'Ответ не принят');
      else {
        setAnswerResult(response);
        answerResultRef.current = response;
        setMessage(response.isCorrect ? `Ответ принят. Верно! +${response.pointsEarned}` : 'Ответ принят.');
      }
    });
  }

  return (
    <section className="columns">
      <div className="panel">
        <h2>Подключение к квизу</h2>
        <div className="join-row">
          <input maxLength="6" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Код комнаты" />
          <button onClick={joinRoom}>Войти</button>
        </div>
        <label>
          Псевдоним для таблицы лидеров
          <input maxLength="50" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder={user.email} />
        </label>
        {room && !question && !results && (
          <div className="waiting-box">
            <strong>{quiz?.title || room.title}</strong>
            <span>Комната {room.code} · {STATUS_LABELS[room.status] || room.status}</span>
            <span>Участников в таблице: {leaderboard.length}</span>
          </div>
        )}
        <p className="muted">{message}</p>
        {question && (
          <>
            <Timer endsAt={question.endsAt} />
            <QuestionAnswer question={question.question} answer={answer} setAnswer={setAnswer} submitAnswer={submitAnswer} answered={Boolean(answerResult)} />
          </>
        )}
        {closedFeedback && <AnswerFeedback feedback={closedFeedback} />}
      </div>
      <div className="side-stack">
        <Leaderboard leaderboard={leaderboard} />
        {results && <ResultsSummary results={results} />}
      </div>
    </section>
  );
}

// форма ответа
function QuestionAnswer({ question, answer, setAnswer, submitAnswer, answered }) {
  const isMultiple = question.type === 'multiple';
  return (
    <article className="live-question">
      <p className="eyebrow">Текущий вопрос</p>
      <h2>{question.text}</h2>
      {question.imageUrl && <img src={question.imageUrl} alt="Изображение к вопросу" referrerPolicy="no-referrer" />}
      {(question.type === 'single' || question.type === 'multiple') && question.answers.map((item) => (
        <label className="choice" key={item.id}>
          <input
            type={isMultiple ? 'checkbox' : 'radio'}
            name="answer"
            value={item.id}
            checked={isMultiple ? answer.includes(item.id) : Number(answer) === item.id}
            onChange={(event) => {
              if (isMultiple) {
                setAnswer(event.target.checked ? [...answer, item.id] : answer.filter((id) => id !== item.id));
              } else {
                setAnswer(item.id);
              }
            }}
          />
          {item.text}
        </label>
      ))}
      {(question.type === 'text' || question.type === 'image') && <input maxLength="500" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Ваш ответ" />}
      <button disabled={answered} onClick={submitAnswer}>{answered ? 'Ответ отправлен' : 'Ответить'}</button>
    </article>
  );
}

function Timer({ endsAt }) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }, 300);
    return () => clearInterval(timer);
  }, [endsAt]);

  return (
    <div className={`timer ${remaining <= 5 ? 'timer-hot' : ''}`}>
      Осталось {remaining} сек.
    </div>
  );
}

function AnswerFeedback({ feedback }) {
  const result = feedback.answerResult;
  return (
    <article className="feedback">
      <strong>{result ? (result.isCorrect ? 'Ваш ответ верный' : 'Ваш ответ неверный') : 'Ответ не был отправлен'}</strong>
      {result && <span>{result.pointsEarned} баллов за вопрос</span>}
      <span>Правильный ответ: {formatCorrectAnswer(feedback.correctAnswer)}</span>
    </article>
  );
}

// итоги квиза
function ResultsSummary({ results, token, canExport = false }) {
  if (!results?.summary) return null;
  return (
    <aside className="panel results-panel">
      <h2>Итоги квиза</h2>
      <div className="summary-grid">
        <Stat label="Победитель" value={results.summary.winner?.displayName || 'Нет'} />
        <Stat label="Участников" value={results.summary.participantCount} />
        <Stat label="Средний балл" value={results.summary.averageScore} />
        <Stat label="Лучший балл" value={results.summary.bestScore} />
      </div>
      {canExport && <button className="ghost" onClick={() => exportRoomCsv(results.room.code, token)}>Скачать CSV</button>}
    </aside>
  );
}

function QuestionStats({ stats }) {
  const accuracy = stats.totalAnswers ? Math.round((stats.correctAnswers / stats.totalAnswers) * 100) : 0;
  return (
    <aside className="panel stats-panel">
      <h2>Статистика вопроса</h2>
      <p className="muted">{stats.text}</p>
      <div className="summary-grid compact">
        <Stat label="Ответов" value={stats.totalAnswers} />
        <Stat label="Верно" value={`${accuracy}%`} />
      </div>
      {stats.options.length > 0 && stats.options.map((option) => {
        const percent = stats.totalAnswers ? Math.round((option.count / stats.totalAnswers) * 100) : 0;
        return (
          <div className="option-stat" key={option.id}>
            <span>{option.text}{option.isCorrect ? ' · верный' : ''}</span>
            <div><i style={{ width: `${percent}%` }} /></div>
            <em>{option.count} / {percent}%</em>
          </div>
        );
      })}
      {stats.textAnswers.length > 0 && (
        <div className="text-answers">
          {stats.textAnswers.map((item, index) => (
            <span key={`${item.displayName}-${index}`}>{item.displayName}: {item.answer || 'без ответа'}</span>
          ))}
        </div>
      )}
    </aside>
  );
}

function QuestionStatsList({ stats = [] }) {
  if (!stats.length) return null;
  return (
    <div className="stats-list">
      <h2>Статистика по всем вопросам</h2>
      {stats.map((item) => <QuestionStats stats={item} key={item.questionId} />)}
    </div>
  );
}

function Leaderboard({ leaderboard = [], participants = [] }) {
  return (
    <aside className="panel leaderboard">
      <h2>Таблица лидеров</h2>
      {leaderboard.length === 0 && participants.length === 0 && <p className="muted">Пока нет участников.</p>}
      {(leaderboard.length ? leaderboard : participants).map((item, index) => (
        <div className="leader" key={item.userId}>
          <span>{index + 1}</span>
          <strong>{item.displayName || 'Участник'}</strong>
          <em>{item.score || 0} баллов</em>
        </div>
      ))}
    </aside>
  );
}

function Stat({ label, value }) {
  return <article className="stat"><span>{label}</span><strong>{value}</strong></article>;
}

function formatCorrectAnswer(correctAnswer) {
  if (!correctAnswer?.values?.length) return 'не задан';
  return correctAnswer.values.map((item) => item.text).join(', ');
}

async function exportRoomCsv(code, token) {
  const response = await fetch(`${API_URL}/api/rooms/${code}/export.csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) return;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `quiz-${code}-results.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readStoredJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

// запросы к backend
async function api(path, token, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Ошибка запроса');
  }
  return data;
}

// подключение React
createRoot(document.getElementById('root')).render(<App />);
