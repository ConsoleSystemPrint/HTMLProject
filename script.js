const POLLS_STORAGE_KEY = 'interactivePolls.polls';

const RESULTS_STORAGE_KEY = 'interactivePolls.results';
const USERS_STORAGE_KEY = 'interactivePolls.users';
const SESSION_STORAGE_KEY = 'interactivePolls.currentUser';
const COMMENTS_STORAGE_KEY = 'interactivePolls.comments';
const FAVORITES_STORAGE_KEY = 'interactivePolls.favorites';
const THEME_STORAGE_KEY = 'interactivePolls.theme';

const QUESTION_TYPES = {
  single: 'Один вариант',
  multiple: 'Несколько вариантов',
  text: 'Текстовый ответ',
  scale: 'Шкала 1-5',
  boolean: 'Да/нет'
};

const STATUS_META = {
  draft: { label: 'Черновик', className: 'badge-muted' },
  active: { label: 'Активен', className: 'badge-success' },
  closed: { label: 'Закрыт', className: 'badge-danger' }
};

const ROLE_META = {
  user: 'Пользователь',
  author: 'Автор опросов',
  admin: 'Администратор'
};

const defaultPolls = [
  {
    id: 'default-learning',
    title: 'Оценка учебного занятия',
    description: 'Короткий опрос для студентов после занятия или мастер-класса.',
    creatorEmail: null,
    status: 'active',
    startsAt: '',
    endsAt: '',
    settings: {
      audience: 'all',
      anonymous: true,
      linkOnly: false,
      singleAttempt: false
    },
    questions: [
      {
        text: 'Насколько понятным был материал?',
        type: 'single',
        options: ['Полностью понятным', 'В целом понятным', 'Были сложные моменты', 'Материал был непонятен']
      },
      {
        text: 'Какой формат работы был самым полезным?',
        type: 'multiple',
        options: ['Практика', 'Объяснение преподавателя', 'Самостоятельные задания', 'Обсуждение в группе']
      },
      {
        text: 'Оцените занятие по шкале от 1 до 5',
        type: 'scale',
        options: []
      }
    ]
  },
  {
    id: 'default-workplace',
    title: 'Командная обратная связь',
    description: 'Опрос помогает понять настроение команды и качество коммуникации.',
    creatorEmail: null,
    status: 'active',
    startsAt: '',
    endsAt: '',
    settings: {
      audience: 'all',
      anonymous: true,
      linkOnly: false,
      singleAttempt: false
    },
    questions: [
      {
        text: 'Как вы оцениваете текущую коммуникацию в команде?',
        type: 'single',
        options: ['Отлично', 'Хорошо', 'Средне', 'Требует улучшения']
      },
      {
        text: 'Какая тема сейчас требует большего внимания?',
        type: 'text',
        options: []
      },
      {
        text: 'Достаточно ли информации для выполнения задач?',
        type: 'boolean',
        options: []
      }
    ]
  }
];

let users = loadUsers();
let currentUser = loadCurrentUser();
let polls = loadPolls();
let results = loadResults();
let comments = loadComments();
let favorites = loadFavorites();
let currentTheme = readJson(THEME_STORAGE_KEY, 'light');
let builderQuestions = createInitialQuestions();
let activeQuiz = null;
let editingPollId = null;
let editingQuestionsLocked = false;
let publicPollShown = false;

const linkedPollId = new URLSearchParams(window.location.search).get('poll');

const sections = document.querySelectorAll('.section');
const navButtons = document.querySelectorAll('[data-section-target]');
const pollList = document.querySelector('#poll-list');
const catalogEmpty = document.querySelector('#catalog-empty');
const catalogDashboard = document.querySelector('#catalog-dashboard');
const catalogSearch = document.querySelector('#catalog-search');
const catalogFilter = document.querySelector('#catalog-filter');
const accountContent = document.querySelector('#account-content');
const builderForm = document.querySelector('#builder-form');
const editingPollInput = document.querySelector('#editing-poll-id');
const titleInput = document.querySelector('#poll-title');
const descriptionInput = document.querySelector('#poll-description');
const statusInput = document.querySelector('#poll-status');
const startsAtInput = document.querySelector('#poll-starts-at');
const endsAtInput = document.querySelector('#poll-ends-at');
const anonymousInput = document.querySelector('#poll-anonymous');
const linkOnlyInput = document.querySelector('#poll-link-only');
const createdLinkBox = document.querySelector('#created-link-box');
const createdLinkInput = document.querySelector('#created-link');
const copyCreatedLinkButton = document.querySelector('#copy-created-link');
const questionBuilderList = document.querySelector('#question-builder-list');
const formMessage = document.querySelector('#form-message');
const authForm = document.querySelector('#auth-form');
const authFields = document.querySelector('#auth-fields');
const authEmailInput = document.querySelector('#auth-email');
const authPasswordInput = document.querySelector('#auth-password');
const authMessage = document.querySelector('#auth-message');
const loginButton = document.querySelector('#login-button');
const registerButton = document.querySelector('#register-button');
const themeToggleButton = document.querySelector('#theme-toggle');
const logoutButton = document.querySelector('#logout-button');
const adminNavButton = document.querySelector('#admin-nav-button');
const adminContent = document.querySelector('#admin-content');
const quizTitle = document.querySelector('#quiz-title');
const quizDescription = document.querySelector('#quiz-description');
const quizProgressLabel = document.querySelector('#quiz-progress-label');
const quizProgressBar = document.querySelector('#quiz-progress-bar');
const quizSteps = document.querySelector('#quiz-steps');
const questionTitle = document.querySelector('#question-title');
const answerList = document.querySelector('#answer-list');
const quizMessage = document.querySelector('#quiz-message');
const previousQuestionButton = document.querySelector('#previous-question');
const nextQuestionButton = document.querySelector('#next-question');
const resultsList = document.querySelector('#results-list');
const resultsEmpty = document.querySelector('#results-empty');
const clearResultsButton = document.querySelector('#clear-results');
const exportResultsButton = document.querySelector('#export-results');
const showHistoryButton = document.querySelector('#show-history');
const historyPanel = document.querySelector('#history-panel');
const historyFilter = document.querySelector('#history-filter');
const historyUserFilter = document.querySelector('#history-user-filter');
const historyStatusFilter = document.querySelector('#history-status-filter');
const historyCounter = document.querySelector('#history-counter');
const historyList = document.querySelector('#history-list');
const historyEmpty = document.querySelector('#history-empty');
const previewDialog = document.querySelector('#preview-dialog');
const previewTitle = document.querySelector('#preview-title');
const previewBody = document.querySelector('#preview-body');
const closePreviewButton = document.querySelector('#close-preview');
const publicDialog = document.querySelector('#public-dialog');
const publicTitle = document.querySelector('#public-title');
const publicBody = document.querySelector('#public-body');
const closePublicButton = document.querySelector('#close-public');
const toastStack = document.querySelector('#toast-stack');
const questionTemplate = document.querySelector('#question-template');

function loadUsers() {
  const saved = readJson(USERS_STORAGE_KEY, []);
  const normalized = Array.isArray(saved) ? saved.map(normalizeUser) : [];
  if (normalized.length > 0 && !normalized.some((user) => user.role === 'admin')) {
    normalized[0].role = 'admin';
  }
  writeJson(USERS_STORAGE_KEY, normalized);
  return normalized;
}

function loadCurrentUser() {
  const email = readJson(SESSION_STORAGE_KEY, null);
  if (!email) {
    return null;
  }

  return users.find((user) => user.email === email) || null;
}

function loadPolls() {
  const saved = readJson(POLLS_STORAGE_KEY, null);
  if (!Array.isArray(saved) || saved.length === 0) {
    writeJson(POLLS_STORAGE_KEY, defaultPolls);
    return cloneData(defaultPolls);
  }

  const savedIds = new Set(saved.map((poll) => poll.id));
  const missingDefaults = defaultPolls.filter((poll) => !savedIds.has(poll.id));
  const merged = [...missingDefaults, ...saved].map(normalizePoll);
  writeJson(POLLS_STORAGE_KEY, merged);
  return merged;
}

function loadResults() {
  const saved = readJson(RESULTS_STORAGE_KEY, []);
  const normalized = Array.isArray(saved) ? saved.map(normalizeResult) : [];
  writeJson(RESULTS_STORAGE_KEY, normalized);
  return normalized;
}

function loadComments() {
  const saved = readJson(COMMENTS_STORAGE_KEY, []);
  return Array.isArray(saved) ? saved.map(normalizeComment) : [];
}

function loadFavorites() {
  const saved = readJson(FAVORITES_STORAGE_KEY, []);
  return Array.isArray(saved) ? saved : [];
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Не удалось сохранить данные в localStorage.', error);
  }
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePoll(poll) {
  return {
    ...poll,
    creatorEmail: poll.creatorEmail || null,
    status: poll.status || 'active',
    startsAt: poll.startsAt || '',
    endsAt: poll.endsAt || '',
    settings: {
      audience: poll.settings?.audience || 'all',
      anonymous: poll.settings?.anonymous !== false,
      linkOnly: poll.settings?.linkOnly === true,
      singleAttempt: poll.settings?.singleAttempt === true
    },
    questions: Array.isArray(poll.questions) ? poll.questions.map(normalizeQuestion) : []
  };
}

function normalizeUser(user) {
  return {
    ...user,
    role: user.role || 'author',
    status: user.status || 'active'
  };
}

function normalizeComment(comment) {
  return {
    id: comment.id || `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    pollId: comment.pollId,
    userEmail: comment.userEmail || null,
    text: comment.text || '',
    createdAt: comment.createdAt || new Date().toISOString()
  };
}

function normalizeQuestion(question) {
  const type = question.type && QUESTION_TYPES[question.type] ? question.type : 'single';
  const options = Array.isArray(question.options) ? question.options : [];

  return {
    text: question.text || '',
    type,
    options: needsOptions(type) ? options : []
  };
}

function normalizeResult(result) {
  const poll = polls?.find((item) => item.id === result.pollId);
  return {
    ...result,
    id: result.id || `result-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    pollTitle: result.pollTitle || poll?.title || 'Опрос удален',
    anonymous: result.anonymous !== false,
    userEmail: result.userEmail || null,
    completedAt: result.completedAt || new Date().toISOString(),
    answers: normalizeAnswers(result.answers, poll)
  };
}

function normalizeAnswers(answers, poll) {
  if (!poll || !Array.isArray(poll.questions)) {
    return Array.isArray(answers) ? answers : [];
  }

  if (!Array.isArray(answers)) {
    return poll.questions.map((question) => getEmptyAnswer(question.type));
  }

  return poll.questions.map((question, index) => {
    const answer = answers[index];
    if (question.type === 'multiple') {
      return Array.isArray(answer) ? answer : answer === null || answer === undefined ? [] : [answer];
    }
    if (question.type === 'text') {
      return answer === null || answer === undefined ? '' : String(answer);
    }
    if (question.type === 'boolean') {
      return typeof answer === 'boolean' ? answer : answer === 'true' ? true : answer === 'false' ? false : null;
    }
    if (question.type === 'scale') {
      return answer === null || answer === undefined ? null : Number(answer);
    }
    return answer === null || answer === undefined ? null : Number(answer);
  });
}

function createInitialQuestions() {
  return [
    {
      text: '',
      type: 'single',
      options: ['', '']
    }
  ];
}

function needsOptions(type) {
  return type === 'single' || type === 'multiple';
}

function getEmptyAnswer(type) {
  if (type === 'multiple') {
    return [];
  }
  if (type === 'text') {
    return '';
  }
  return null;
}

function showSection(sectionId) {
  if (sectionId === 'admin' && !isAdmin()) {
    notify('Админ-панель доступна только администратору.', 'error');
    sectionId = 'catalog';
  }

  sections.forEach((section) => {
    section.classList.toggle('is-visible', section.id === sectionId);
  });

  navButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.sectionTarget === sectionId);
  });

  if (sectionId === 'account') {
    renderAccount();
  }

  if (sectionId === 'admin') {
    renderAdmin();
  }
}

function renderAll() {
  applyTheme();
  renderAuth();
  renderCatalog();
  renderBuilder();
  renderAccount();
  renderAdmin();
  renderResults();
  if (linkedPollId && !publicPollShown) {
    const poll = polls.find((item) => item.id === linkedPollId);
    if (poll) {
      showPublicPoll(linkedPollId);
    }
  }
}

function renderAuth() {
  const isLoggedIn = Boolean(currentUser);
  adminNavButton.hidden = !isAdmin();
  authFields.hidden = isLoggedIn;
  loginButton.hidden = isLoggedIn;
  registerButton.hidden = isLoggedIn;
  logoutButton.hidden = !isLoggedIn;
  authMessage.classList.toggle('is-success', isLoggedIn);
  authMessage.textContent = isLoggedIn ? `Вы вошли как ${currentUser.email} (${ROLE_META[currentUser.role]})` : '';
  themeToggleButton.textContent = currentTheme === 'dark' ? 'Светлая тема' : 'Темная тема';
}

function renderCatalog() {
  const visiblePolls = getFilteredCatalogPolls();
  pollList.innerHTML = '';
  catalogEmpty.hidden = visiblePolls.length > 0;
  renderCatalogDashboard();

  visiblePolls.forEach((poll) => {
    pollList.append(createPollCard(poll, 'catalog'));
  });
}

function renderCatalogDashboard() {
  const visiblePolls = polls.filter((poll) => isPollVisibleInCatalog(poll));
  const activeCount = visiblePolls.filter((poll) => poll.status === 'active').length;
  const closedCount = visiblePolls.filter((poll) => poll.status === 'closed').length;
  const totalAttempts = results.length;
  const recent = results
    .slice()
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];

  catalogDashboard.innerHTML = `
    <article class="stat-card"><span>Опросов</span><strong>${visiblePolls.length}</strong></article>
    <article class="stat-card"><span>Активных</span><strong>${activeCount}</strong></article>
    <article class="stat-card"><span>Закрытых</span><strong>${closedCount}</strong></article>
    <article class="stat-card"><span>Прохождений</span><strong>${totalAttempts}</strong></article>
    <article class="stat-card wide-stat"><span>Последний ответ</span><strong>${recent ? formatDate(new Date(recent.completedAt)) : 'Нет данных'}</strong></article>
  `;
}

function getFilteredCatalogPolls() {
  const search = catalogSearch.value.trim().toLowerCase();
  const filter = catalogFilter.value;

  return polls
    .filter((poll) => isPollVisibleInCatalog(poll))
    .filter((poll) => !search || poll.title.toLowerCase().includes(search))
    .filter((poll) => {
      const settings = getPollSettings(poll);
      if (filter === 'mine') {
        return currentUser && poll.creatorEmail === currentUser.email;
      }
      if (filter === 'active') {
        return poll.status === 'active';
      }
      if (filter === 'closed') {
        return poll.status === 'closed';
      }
      if (filter === 'linkOnly') {
        return settings.linkOnly;
      }
      if (filter === 'authorized') {
        return settings.audience === 'authorized';
      }
      return true;
    });
}

function isPollVisibleInCatalog(poll) {
  const settings = getPollSettings(poll);
  const isOwner = currentUser && poll.creatorEmail === currentUser.email;
  const openedByLink = poll.id === linkedPollId;
  const draftAllowed = poll.status !== 'draft' || isOwner;
  const linkAllowed = !settings.linkOnly || openedByLink || isOwner;
  return draftAllowed && linkAllowed;
}

function createPollCard(poll, context) {
  const settings = getPollSettings(poll);
  const card = document.createElement('article');
  card.className = 'poll-card';
  const availability = getPollAvailability(poll);
  const isOwner = canManagePoll(poll);
  const isFavorite = currentUser && favorites.some((item) => item.userEmail === currentUser.email && item.pollId === poll.id);
  const commentCount = comments.filter((comment) => comment.pollId === poll.id).length;

  card.innerHTML = `
    <div>
      <div class="card-title-row">
        <h3>${escapeHtml(poll.title)}</h3>
        ${renderStatusBadge(poll.status)}
      </div>
      <p>${escapeHtml(poll.description || 'Описание не указано.')}</p>
      <div class="poll-meta">
        <span>${poll.questions.length} ${getPluralForm(poll.questions.length, ['вопрос', 'вопроса', 'вопросов'])}</span>
        <span>${getAttemptCount(poll.id)} ${getPluralForm(getAttemptCount(poll.id), ['прохождение', 'прохождения', 'прохождений'])}</span>
        ${settings.audience === 'authorized' ? '<span class="badge-warning">Требуется вход</span>' : '<span>Для всех</span>'}
        ${settings.anonymous ? '<span>Анонимный</span>' : '<span class="badge-warning">С указанием почты</span>'}
        ${settings.linkOnly ? '<span class="badge-muted">По ссылке</span>' : ''}
        ${settings.singleAttempt ? '<span class="badge-muted">Один раз</span>' : ''}
        <span>${commentCount} ${getPluralForm(commentCount, ['комментарий', 'комментария', 'комментариев'])}</span>
      </div>
      <p class="availability ${availability.canStart ? '' : 'is-blocked'}">${escapeHtml(availability.message)}</p>
    </div>
    <div class="poll-actions">
      <button class="primary-button" type="button" data-start-poll="${poll.id}">Пройти</button>
      <button class="secondary-button" type="button" data-public-poll="${poll.id}">Страница</button>
      <button class="ghost-button" type="button" data-toggle-favorite="${poll.id}">${isFavorite ? 'В избранном' : 'В избранное'}</button>
      <button class="ghost-button" type="button" data-comment-poll="${poll.id}">Комментарий</button>
      <button class="ghost-button" type="button" data-copy-poll-link="${poll.id}">Ссылка</button>
      ${isOwner ? `<button class="secondary-button" type="button" data-edit-poll="${poll.id}">Редактировать</button>` : ''}
      ${isOwner ? `<button class="secondary-button" type="button" data-toggle-status="${poll.id}">${poll.status === 'closed' ? 'Активировать' : 'Закрыть'}</button>` : ''}
      ${isOwner ? `<button class="ghost-button danger-action" type="button" data-delete-poll="${poll.id}">Удалить</button>` : ''}
    </div>
  `;

  if (context === 'account') {
    card.classList.add('compact-poll-card');
  }

  return card;
}

function renderStatusBadge(status) {
  const meta = STATUS_META[status] || STATUS_META.active;
  return `<span class="status-badge ${meta.className}">${meta.label}</span>`;
}

function getPollSettings(poll) {
  return normalizePoll(poll).settings;
}

function canManagePoll(poll) {
  return currentUser && (currentUser.role === 'admin' || poll.creatorEmail === currentUser.email);
}

function isAdmin() {
  return currentUser?.role === 'admin';
}

function renderBuilder() {
  questionBuilderList.innerHTML = '';

  builderQuestions.forEach((question, questionIndex) => {
    const fragment = questionTemplate.content.cloneNode(true);
    const editor = fragment.querySelector('.question-editor');
    const title = fragment.querySelector('h4');
    const typeInput = fragment.querySelector('.question-type');
    const questionInput = fragment.querySelector('.question-text');
    const optionsList = fragment.querySelector('.options-list');
    const removeQuestionButton = fragment.querySelector('.remove-question');
    const addOptionButton = fragment.querySelector('.add-option');

    editor.dataset.questionIndex = questionIndex;
    title.textContent = `Вопрос ${questionIndex + 1}`;
    typeInput.value = question.type;
    questionInput.value = question.text;
    removeQuestionButton.hidden = builderQuestions.length === 1 || editingQuestionsLocked;
    addOptionButton.hidden = !needsOptions(question.type);
    typeInput.disabled = editingQuestionsLocked;
    questionInput.disabled = editingQuestionsLocked;
    addOptionButton.disabled = editingQuestionsLocked;

    if (needsOptions(question.type)) {
      question.options.forEach((option, optionIndex) => {
        const row = document.createElement('div');
        row.className = 'option-row';
        row.dataset.optionIndex = optionIndex;
        row.innerHTML = `
          <label class="field">
            <span>Вариант ${optionIndex + 1}</span>
            <input class="option-text" type="text" value="${escapeAttribute(option)}" placeholder="Введите вариант ответа" ${editingQuestionsLocked ? 'disabled' : ''}>
          </label>
          <button class="ghost-button remove-option" type="button" ${question.options.length <= 2 || editingQuestionsLocked ? 'hidden' : ''}>Удалить</button>
        `;
        optionsList.append(row);
      });
    } else {
      const hint = document.createElement('p');
      hint.className = 'muted option-hint';
      hint.textContent = getQuestionTypeHint(question.type);
      optionsList.append(hint);
    }

    questionBuilderList.append(fragment);
  });
}

function getQuestionTypeHint(type) {
  if (type === 'text') {
    return 'Участник напишет ответ в текстовом поле.';
  }
  if (type === 'scale') {
    return 'Участник выберет оценку от 1 до 5.';
  }
  if (type === 'boolean') {
    return 'Участник выберет Да или Нет.';
  }
  return '';
}

function renderQuiz() {
  if (!activeQuiz) {
    return;
  }

  const { poll, currentIndex } = activeQuiz;
  const question = poll.questions[currentIndex];
  const progress = ((currentIndex + 1) / poll.questions.length) * 100;

  quizTitle.textContent = poll.title;
  quizDescription.textContent = poll.description || '';
  quizProgressLabel.textContent = `Вопрос ${currentIndex + 1} из ${poll.questions.length}`;
  quizProgressBar.style.width = `${progress}%`;
  questionTitle.textContent = question.text;
  quizMessage.textContent = '';
  quizMessage.classList.remove('is-success');
  previousQuestionButton.disabled = currentIndex === 0;
  nextQuestionButton.textContent = currentIndex === poll.questions.length - 1 ? 'Завершить' : 'Далее';

  quizSteps.innerHTML = '';
  poll.questions.forEach((item, index) => {
    const step = document.createElement('button');
    step.type = 'button';
    step.className = 'quiz-step';
    step.classList.toggle('is-current', index === currentIndex);
    step.classList.toggle('is-done', hasAnswer(activeQuiz.answers[index], item.type));
    step.textContent = index + 1;
    step.addEventListener('click', () => {
      if (saveCurrentAnswer(false)) {
        activeQuiz.currentIndex = index;
        renderQuiz();
      }
    });
    quizSteps.append(step);
  });

  answerList.innerHTML = '';
  renderQuestionInput(question, activeQuiz.answers[currentIndex]);
}

function renderQuestionInput(question, savedAnswer) {
  answerList.classList.remove('scale-list');

  if (question.type === 'single') {
    renderChoiceInputs(question, savedAnswer, 'radio');
    return;
  }

  if (question.type === 'multiple') {
    renderChoiceInputs(question, savedAnswer, 'checkbox');
    return;
  }

  if (question.type === 'text') {
    answerList.innerHTML = `
      <label class="field">
        <span>Ваш ответ</span>
        <textarea id="text-answer" rows="5" placeholder="Введите ответ">${escapeHtml(savedAnswer || '')}</textarea>
      </label>
    `;
    return;
  }

  if (question.type === 'scale') {
    const options = [1, 2, 3, 4, 5];
    answerList.classList.add('scale-list');
    options.forEach((value) => {
      const id = `scale-${value}`;
      const label = document.createElement('label');
      label.className = 'answer-option scale-option';
      label.innerHTML = `
        <input id="${id}" name="quiz-answer" type="radio" value="${value}" ${savedAnswer === value ? 'checked' : ''}>
        <span>${value}</span>
      `;
      answerList.append(label);
    });
    return;
  }

  if (question.type === 'boolean') {
    ['Да', 'Нет'].forEach((labelText, index) => {
      const value = index === 0;
      const label = document.createElement('label');
      label.className = 'answer-option';
      label.innerHTML = `
        <input name="quiz-answer" type="radio" value="${value}" ${savedAnswer === value ? 'checked' : ''}>
        <span>${labelText}</span>
      `;
      answerList.append(label);
    });
  }
}

function renderChoiceInputs(question, savedAnswer, inputType) {
  question.options.forEach((option, optionIndex) => {
    const answerId = `answer-${activeQuiz.currentIndex}-${optionIndex}`;
    const checked = inputType === 'checkbox'
      ? Array.isArray(savedAnswer) && savedAnswer.includes(optionIndex)
      : savedAnswer === optionIndex;
    const label = document.createElement('label');
    label.className = 'answer-option';
    label.setAttribute('for', answerId);
    label.innerHTML = `
      <input id="${answerId}" name="quiz-answer" type="${inputType}" value="${optionIndex}" ${checked ? 'checked' : ''}>
      <span>${escapeHtml(option)}</span>
    `;
    answerList.append(label);
  });
}

function renderAccount() {
  if (!currentUser) {
    accountContent.innerHTML = `
      <div class="empty-state">
        <h3>Войдите в аккаунт</h3>
        <p>После входа здесь появятся созданные и пройденные вами опросы.</p>
      </div>
    `;
    return;
  }

  const myPolls = polls.filter((poll) => poll.creatorEmail === currentUser.email);
  const myResults = results.filter((result) => result.userEmail === currentUser.email);
  const myFavoritePollIds = favorites.filter((item) => item.userEmail === currentUser.email).map((item) => item.pollId);
  const myFavorites = polls.filter((poll) => myFavoritePollIds.includes(poll.id));
  const activeCount = myPolls.filter((poll) => poll.status === 'active').length;
  const closedCount = myPolls.filter((poll) => poll.status === 'closed').length;

  accountContent.innerHTML = `
    <div class="dashboard-grid">
      <article class="stat-card"><span>Создано</span><strong>${myPolls.length}</strong></article>
      <article class="stat-card"><span>Пройдено</span><strong>${myResults.length}</strong></article>
      <article class="stat-card"><span>Избранных</span><strong>${myFavorites.length}</strong></article>
      <article class="stat-card"><span>Активных</span><strong>${activeCount}</strong></article>
      <article class="stat-card"><span>Закрытых</span><strong>${closedCount}</strong></article>
    </div>
    <div class="data-panel">
      <button class="secondary-button" type="button" data-export-all>Скачать все данные</button>
      <label class="ghost-button import-label">
        Загрузить данные
        <input class="visually-hidden" id="import-data-input" type="file" accept="application/json">
      </label>
    </div>
    <div class="account-columns">
      <section>
        <h3>Мои опросы</h3>
        <div class="account-list" id="my-polls-list"></div>
      </section>
      <section>
        <h3>Мои прохождения</h3>
        <div class="account-list" id="my-results-list"></div>
      </section>
      <section>
        <h3>Избранное</h3>
        <div class="account-list" id="my-favorites-list"></div>
      </section>
    </div>
  `;

  const myPollsList = accountContent.querySelector('#my-polls-list');
  const myResultsList = accountContent.querySelector('#my-results-list');
  const myFavoritesList = accountContent.querySelector('#my-favorites-list');

  if (myPolls.length === 0) {
    myPollsList.innerHTML = '<div class="empty-state small-empty"><p>Вы пока не создали ни одного опроса.</p></div>';
  } else {
    myPolls.forEach((poll) => myPollsList.append(createPollCard(poll, 'account')));
  }

  if (myResults.length === 0) {
    myResultsList.innerHTML = '<div class="empty-state small-empty"><p>Вы пока не проходили неанонимные опросы.</p></div>';
  } else {
    myResults
      .slice()
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .forEach((result) => {
        const poll = polls.find((item) => item.id === result.pollId);
        const card = document.createElement('article');
        card.className = 'history-card';
        card.innerHTML = `
          <div class="history-card-head">
            <div>
              <h3>${escapeHtml(poll?.title || result.pollTitle || 'Опрос удален')}</h3>
              <p>${formatDate(new Date(result.completedAt))}</p>
            </div>
          </div>
        `;
        myResultsList.append(card);
      });
  }

  if (myFavorites.length === 0) {
    myFavoritesList.innerHTML = '<div class="empty-state small-empty"><p>В избранном пока пусто.</p></div>';
  } else {
    myFavorites.forEach((poll) => myFavoritesList.append(createPollCard(poll, 'account')));
  }
}

function renderAdmin() {
  if (!adminContent) {
    return;
  }

  if (!isAdmin()) {
    adminContent.innerHTML = `
      <div class="empty-state">
        <h3>Нет доступа</h3>
        <p>Админ-панель доступна только пользователю с ролью администратора.</p>
      </div>
    `;
    return;
  }

  adminContent.innerHTML = `
    <div class="dashboard-grid">
      <article class="stat-card"><span>Пользователей</span><strong>${users.length}</strong></article>
      <article class="stat-card"><span>Опросов</span><strong>${polls.length}</strong></article>
      <article class="stat-card"><span>Ответов</span><strong>${results.length}</strong></article>
      <article class="stat-card"><span>Комментариев</span><strong>${comments.length}</strong></article>
      <article class="stat-card"><span>Избранных</span><strong>${favorites.length}</strong></article>
    </div>
    <div class="admin-grid">
      <section class="admin-panel">
        <h3>Пользователи</h3>
        <div class="admin-list">
          ${users.map((user) => `
            <article class="admin-row">
              <div>
                <strong>${escapeHtml(user.email)}</strong>
                <p>${ROLE_META[user.role]} · ${user.status === 'blocked' ? 'Заблокирован' : 'Активен'}</p>
              </div>
              <div class="admin-actions">
                <select data-admin-role="${escapeAttribute(user.email)}" ${user.email === currentUser.email ? 'disabled' : ''}>
                  <option value="user" ${user.role === 'user' ? 'selected' : ''}>Пользователь</option>
                  <option value="author" ${user.role === 'author' ? 'selected' : ''}>Автор</option>
                  <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option>
                </select>
                <button class="ghost-button" type="button" data-toggle-user="${escapeAttribute(user.email)}" ${user.email === currentUser.email ? 'disabled' : ''}>${user.status === 'blocked' ? 'Разблокировать' : 'Блокировать'}</button>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
      <section class="admin-panel">
        <h3>Все опросы</h3>
        <div class="admin-list">
          ${polls.map((poll) => `
            <article class="admin-row">
              <div>
                <strong>${escapeHtml(poll.title)}</strong>
                <p>${STATUS_META[poll.status]?.label || 'Активен'} · Автор: ${escapeHtml(poll.creatorEmail || 'демо')}</p>
              </div>
              <div class="admin-actions">
                <button class="secondary-button" type="button" data-edit-poll="${poll.id}">Редактировать</button>
                <button class="ghost-button danger-action" type="button" data-admin-delete-poll="${poll.id}">Удалить</button>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    </div>
  `;
}

function renderResults() {
  resultsList.innerHTML = '';
  let renderedCards = 0;

  polls.forEach((poll) => {
    const pollResults = results.filter((result) => result.pollId === poll.id);
    if (pollResults.length === 0) {
      return;
    }

    const card = document.createElement('article');
    card.className = 'result-card';
    const lastCompleted = pollResults
      .map((result) => new Date(result.completedAt))
      .sort((a, b) => b - a)[0];

    card.innerHTML = `
      <div class="result-head">
        <div>
          <div class="card-title-row">
            <h3>${escapeHtml(poll.title)}</h3>
            ${renderStatusBadge(poll.status)}
          </div>
          <p>${pollResults.length} ${getPluralForm(pollResults.length, ['прохождение', 'прохождения', 'прохождений'])}, последний ответ: ${formatDate(lastCompleted)}</p>
        </div>
        <div class="summary-row">
          <span><strong>${poll.questions.length}</strong> ${getPluralForm(poll.questions.length, ['вопрос', 'вопроса', 'вопросов'])}</span>
        </div>
      </div>
    `;

    poll.questions.forEach((question, questionIndex) => {
      const questionBlock = document.createElement('div');
      questionBlock.className = 'question-result';
      questionBlock.innerHTML = `<h4>${escapeHtml(question.text)}</h4>`;
      renderQuestionResult(questionBlock, question, pollResults, questionIndex);
      card.append(questionBlock);
    });

    resultsList.append(card);
    renderedCards += 1;
  });

  resultsEmpty.hidden = renderedCards > 0;
  renderHistoryControls();
  renderHistory();
}

function renderQuestionResult(container, question, pollResults, questionIndex) {
  if (question.type === 'single' || question.type === 'multiple') {
    question.options.forEach((option, optionIndex) => {
      const count = pollResults.filter((result) => {
        const answer = result.answers[questionIndex];
        return Array.isArray(answer) ? answer.includes(optionIndex) : answer === optionIndex;
      }).length;
      const percent = Math.round((count / pollResults.length) * 100);
      container.append(createPercentRow(option, percent, `${count} ответов`));
    });
    return;
  }

  if (question.type === 'boolean') {
    const yesCount = pollResults.filter((result) => result.answers[questionIndex] === true).length;
    const noCount = pollResults.filter((result) => result.answers[questionIndex] === false).length;
    container.append(createPercentRow('Да', Math.round((yesCount / pollResults.length) * 100), `${yesCount} ответов`));
    container.append(createPercentRow('Нет', Math.round((noCount / pollResults.length) * 100), `${noCount} ответов`));
    return;
  }

  if (question.type === 'scale') {
    const values = pollResults
      .map((result) => Number(result.answers[questionIndex]))
      .filter((value) => Number.isFinite(value));
    const average = values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : '0';
    const summary = document.createElement('p');
    summary.className = 'result-average';
    summary.textContent = `Средняя оценка: ${average} из 5`;
    container.append(summary);
    [1, 2, 3, 4, 5].forEach((value) => {
      const count = values.filter((answer) => answer === value).length;
      const percent = values.length ? Math.round((count / values.length) * 100) : 0;
      container.append(createPercentRow(String(value), percent, `${count} ответов`));
    });
    return;
  }

  if (question.type === 'text') {
    const answers = pollResults
      .map((result) => result.answers[questionIndex])
      .filter((answer) => String(answer || '').trim());
    if (answers.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Текстовых ответов пока нет.';
      container.append(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'text-answer-list';
    answers.forEach((answer) => {
      const item = document.createElement('blockquote');
      item.textContent = answer;
      list.append(item);
    });
    container.append(list);
  }
}

function createPercentRow(label, percent, detail) {
  const row = document.createElement('div');
  row.className = 'result-option';
  row.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <div class="result-track" aria-label="${percent}%">
      <span style="width: ${percent}%"></span>
    </div>
    <strong>${percent}%</strong>
    <small>${escapeHtml(detail)}</small>
  `;
  return row;
}

function renderHistoryControls() {
  const selectedValue = historyFilter.value || 'all';
  const selectedUser = historyUserFilter.value || 'all';

  historyFilter.innerHTML = '<option value="all">Все опросы</option>';
  polls.forEach((poll) => {
    const option = document.createElement('option');
    option.value = poll.id;
    option.textContent = poll.title;
    historyFilter.append(option);
  });
  historyFilter.value = selectedValue === 'all' || polls.some((poll) => poll.id === selectedValue) ? selectedValue : 'all';

  const emails = getHistoryEmails(historyFilter.value);
  historyUserFilter.innerHTML = '<option value="all">Все пользователи</option>';
  emails.forEach((email) => {
    const option = document.createElement('option');
    option.value = email;
    option.textContent = email;
    historyUserFilter.append(option);
  });
  historyUserFilter.value = emails.includes(selectedUser) ? selectedUser : 'all';
  historyUserFilter.disabled = emails.length === 0;
}

function renderHistory() {
  historyList.innerHTML = '';

  const selectedPollId = historyFilter.value;
  const selectedUser = historyUserFilter.value;
  const selectedStatus = historyStatusFilter.value;
  const filteredResults = results
    .filter((result) => selectedPollId === 'all' || result.pollId === selectedPollId)
    .filter((result) => selectedUser === 'all' || result.userEmail === selectedUser)
    .filter((result) => {
      const poll = polls.find((item) => item.id === result.pollId);
      return selectedStatus === 'all' || poll?.status === selectedStatus;
    })
    .slice()
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  historyCounter.textContent = `${filteredResults.length} ${getPluralForm(filteredResults.length, ['прохождение', 'прохождения', 'прохождений'])}`;
  historyEmpty.hidden = filteredResults.length > 0;

  filteredResults.forEach((result, index) => {
    const poll = polls.find((item) => item.id === result.pollId);
    const card = document.createElement('article');
    card.className = 'history-card';
    const participant = result.anonymous ? 'Анонимный участник' : result.userEmail || 'Пользователь не найден';

    card.innerHTML = `
      <div class="history-card-head">
        <div>
          <h3>${escapeHtml(poll?.title || result.pollTitle || 'Опрос удален')}</h3>
          <p>${formatDate(new Date(result.completedAt))}</p>
        </div>
        <span>№ ${filteredResults.length - index}</span>
      </div>
      <p class="participant-label">${escapeHtml(participant)}</p>
    `;

    if (!poll) {
      const message = document.createElement('p');
      message.className = 'muted';
      message.textContent = 'Подробные ответы недоступны, потому что структура опроса не найдена.';
      card.append(message);
      historyList.append(card);
      return;
    }

    poll.questions.forEach((question, questionIndex) => {
      const item = document.createElement('div');
      item.className = 'history-answer';
      item.innerHTML = `
        <strong>${escapeHtml(question.text)}</strong>
        <span>${escapeHtml(formatAnswer(question, result.answers[questionIndex]))}</span>
      `;
      card.append(item);
    });

    historyList.append(card);
  });
}

function getHistoryEmails(selectedPollId) {
  const emails = results
    .filter((result) => selectedPollId === 'all' || result.pollId === selectedPollId)
    .filter((result) => !result.anonymous && result.userEmail)
    .map((result) => result.userEmail);

  return [...new Set(emails)].sort((a, b) => a.localeCompare(b));
}

function startPoll(pollId) {
  const poll = polls.find((item) => item.id === pollId);
  if (!poll) {
    return;
  }

  const access = getPollAvailability(poll);
  if (!access.canStart) {
    notify(access.message, 'error');
    return;
  }

  activeQuiz = {
    poll,
    currentIndex: 0,
    answers: poll.questions.map((question) => getEmptyAnswer(question.type))
  };

  showSection('taking');
  renderQuiz();
}

function getPollAvailability(poll) {
  const settings = getPollSettings(poll);
  const now = new Date();
  const isOwner = currentUser && poll.creatorEmail === currentUser.email;

  if (settings.linkOnly && poll.id !== linkedPollId && !isOwner) {
    return { canStart: false, message: 'Опрос доступен только по личной ссылке.' };
  }

  if (poll.status === 'draft') {
    return { canStart: false, message: 'Опрос находится в черновике.' };
  }

  if (poll.status === 'closed') {
    return { canStart: false, message: 'Опрос закрыт для прохождения.' };
  }

  if (poll.startsAt && new Date(poll.startsAt) > now) {
    return { canStart: false, message: `Опрос начнется ${formatDate(new Date(poll.startsAt))}.` };
  }

  if (poll.endsAt && new Date(poll.endsAt) < now) {
    return { canStart: false, message: 'Срок проведения опроса завершен.' };
  }

  if (settings.audience === 'authorized' && !currentUser) {
    return { canStart: false, message: 'Опрос доступен только авторизованным пользователям.' };
  }

  if (currentUser?.status === 'blocked') {
    return { canStart: false, message: 'Ваш аккаунт заблокирован.' };
  }

  if (!settings.anonymous && !currentUser) {
    return { canStart: false, message: 'Для неанонимного опроса нужно войти в аккаунт.' };
  }

  if (settings.singleAttempt && !currentUser) {
    return { canStart: false, message: 'Для ограничения повторного прохождения нужно войти в аккаунт.' };
  }

  if (settings.singleAttempt && currentUser && results.some((result) => result.pollId === poll.id && result.userEmail === currentUser.email)) {
    return { canStart: false, message: 'Вы уже проходили этот опрос.' };
  }

  return { canStart: true, message: 'Опрос можно пройти сейчас.' };
}

function saveCurrentAnswer(showMessage = true) {
  if (!activeQuiz) {
    return false;
  }

  const question = activeQuiz.poll.questions[activeQuiz.currentIndex];
  const answer = readAnswerFromForm(question);

  if (!hasAnswer(answer, question.type)) {
    if (showMessage) {
      quizMessage.textContent = 'Заполните ответ на вопрос.';
    }
    return false;
  }

  activeQuiz.answers[activeQuiz.currentIndex] = answer;
  return true;
}

function readAnswerFromForm(question) {
  if (question.type === 'multiple') {
    return [...answerList.querySelectorAll('input[name="quiz-answer"]:checked')].map((input) => Number(input.value));
  }

  if (question.type === 'text') {
    return answerList.querySelector('#text-answer')?.value.trim() || '';
  }

  const checked = answerList.querySelector('input[name="quiz-answer"]:checked');
  if (!checked) {
    return getEmptyAnswer(question.type);
  }

  if (question.type === 'boolean') {
    return checked.value === 'true';
  }

  return Number(checked.value);
}

function hasAnswer(answer, type) {
  if (type === 'multiple') {
    return Array.isArray(answer) && answer.length > 0;
  }
  if (type === 'text') {
    return Boolean(String(answer || '').trim());
  }
  return answer !== null && answer !== undefined && answer !== '';
}

function finishQuiz() {
  if (!activeQuiz) {
    return;
  }

  const settings = getPollSettings(activeQuiz.poll);
  results.push({
    id: `result-${Date.now()}`,
    pollId: activeQuiz.poll.id,
    pollTitle: activeQuiz.poll.title,
    anonymous: settings.anonymous,
    userEmail: settings.anonymous && !settings.singleAttempt ? null : currentUser.email,
    answers: activeQuiz.answers,
    completedAt: new Date().toISOString()
  });
  writeJson(RESULTS_STORAGE_KEY, results);

  activeQuiz = null;
  renderCatalog();
  renderAccount();
  renderResults();
  showSection('results');
}

function validateBuilder() {
  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const audience = builderForm.querySelector('input[name="poll-audience"]:checked')?.value || 'all';
  const anonymous = anonymousInput.checked;
  const linkOnly = linkOnlyInput.checked;
  const singleAttempt = document.querySelector('#poll-single-attempt').checked;
  const status = statusInput.value;
  const startsAt = startsAtInput.value;
  const endsAt = endsAtInput.value;
  const existingPoll = editingPollId ? polls.find((poll) => poll.id === editingPollId) : null;

  if (!existingPoll && currentUser && currentUser.role === 'user') {
    return { valid: false, message: 'Создавать опросы могут авторы и администраторы.' };
  }

  if (!title) {
    return { valid: false, message: 'Введите название опроса.' };
  }

  if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
    return { valid: false, message: 'Дата начала не может быть позже даты окончания.' };
  }

  const normalizedQuestions = editingQuestionsLocked && existingPoll
    ? existingPoll.questions
    : builderQuestions.map((question) => ({
      text: question.text.trim(),
      type: question.type,
      options: needsOptions(question.type) ? question.options.map((option) => option.trim()).filter(Boolean) : []
    }));

  if (normalizedQuestions.length === 0) {
    return { valid: false, message: 'Добавьте хотя бы один вопрос.' };
  }

  for (const question of normalizedQuestions) {
    if (!question.text) {
      return { valid: false, message: 'Заполните текст каждого вопроса.' };
    }

    if (needsOptions(question.type) && question.options.length < 2) {
      return { valid: false, message: 'Для вопросов с вариантами нужно минимум два варианта ответа.' };
    }
  }

  return {
    valid: true,
    poll: {
      id: existingPoll?.id || `custom-${Date.now()}`,
      title,
      description,
      creatorEmail: existingPoll?.creatorEmail || currentUser?.email || null,
      status,
      startsAt,
      endsAt,
      settings: {
        audience,
        anonymous,
        linkOnly,
        singleAttempt
      },
      questions: normalizedQuestions
    }
  };
}

function resetBuilder() {
  builderForm.reset();
  editingPollId = null;
  editingQuestionsLocked = false;
  editingPollInput.value = '';
  builderQuestions = createInitialQuestions();
  formMessage.textContent = '';
  formMessage.classList.remove('is-success');
  createdLinkBox.hidden = true;
  createdLinkInput.value = '';
  createdLinkInput.removeAttribute('value');
  renderBuilder();
}

function syncBuilderFromInputs() {
  questionBuilderList.querySelectorAll('.question-editor').forEach((editor) => {
    const questionIndex = Number(editor.dataset.questionIndex);
    const typeInput = editor.querySelector('.question-type');
    const questionInput = editor.querySelector('.question-text');
    builderQuestions[questionIndex].type = typeInput.value;
    builderQuestions[questionIndex].text = questionInput.value;

    if (!needsOptions(typeInput.value)) {
      builderQuestions[questionIndex].options = [];
      return;
    }

    builderQuestions[questionIndex].options = [...editor.querySelectorAll('.option-text')].map((input) => input.value);
  });
}

function beginEditPoll(pollId) {
  const poll = polls.find((item) => item.id === pollId);
  if (!poll || !canManagePoll(poll)) {
    notify('Редактировать можно только свои опросы или опросы в роли администратора.', 'error');
    return;
  }

  editingPollId = poll.id;
  editingPollInput.value = poll.id;
  editingQuestionsLocked = getAttemptCount(poll.id) > 0;
  titleInput.value = poll.title;
  descriptionInput.value = poll.description || '';
  statusInput.value = poll.status;
  startsAtInput.value = toDateTimeLocalValue(poll.startsAt);
  endsAtInput.value = toDateTimeLocalValue(poll.endsAt);
  builderForm.querySelector(`input[name="poll-audience"][value="${getPollSettings(poll).audience}"]`).checked = true;
  anonymousInput.checked = getPollSettings(poll).anonymous;
  linkOnlyInput.checked = getPollSettings(poll).linkOnly;
  document.querySelector('#poll-single-attempt').checked = getPollSettings(poll).singleAttempt;
  builderQuestions = cloneData(poll.questions);
  renderBuilder();
  createdLinkBox.hidden = true;
  formMessage.textContent = editingQuestionsLocked
    ? 'У опроса уже есть прохождения, поэтому структуру вопросов менять нельзя. Доступны название, описание, статус, даты и доступ.'
    : 'Редактирование опроса.';
  formMessage.classList.toggle('is-success', !editingQuestionsLocked);
  showSection('builder');
}

function deletePoll(pollId) {
  const poll = polls.find((item) => item.id === pollId);
  if (!poll || !canManagePoll(poll)) {
    notify('Удалять можно только свои опросы или опросы в роли администратора.', 'error');
    return;
  }

  const confirmed = window.confirm('Удалить опрос? История прохождений сохранится с пометкой "Опрос удален".');
  if (!confirmed) {
    return;
  }

  polls = polls.filter((item) => item.id !== pollId);
  writeJson(POLLS_STORAGE_KEY, polls);
  renderCatalog();
  renderAccount();
  renderResults();
}

function togglePollStatus(pollId) {
  const poll = polls.find((item) => item.id === pollId);
  if (!poll || !canManagePoll(poll)) {
    return;
  }

  poll.status = poll.status === 'closed' ? 'active' : 'closed';
  writeJson(POLLS_STORAGE_KEY, polls);
  renderCatalog();
  renderAccount();
  renderResults();
}

function setUserRole(email, role) {
  if (!isAdmin() || email === currentUser.email || !ROLE_META[role]) {
    return;
  }

  users = users.map((user) => user.email === email ? { ...user, role } : user);
  writeJson(USERS_STORAGE_KEY, users);
  notify('Роль пользователя обновлена.');
  renderAll();
}

function toggleUserStatus(email) {
  if (!isAdmin() || email === currentUser.email) {
    return;
  }

  users = users.map((user) => user.email === email
    ? { ...user, status: user.status === 'blocked' ? 'active' : 'blocked' }
    : user);
  writeJson(USERS_STORAGE_KEY, users);
  notify('Статус пользователя обновлен.');
  renderAll();
}

function previewCurrentPoll() {
  syncBuilderFromInputs();
  const title = titleInput.value.trim() || 'Новый опрос';
  const description = descriptionInput.value.trim() || 'Описание не указано.';
  previewTitle.textContent = title;
  previewBody.innerHTML = `
    <p class="muted">${escapeHtml(description)}</p>
    <div class="poll-meta">
      ${renderStatusBadge(statusInput.value)}
      <span>${anonymousInput.checked ? 'Анонимный' : 'С указанием почты'}</span>
      <span>${linkOnlyInput.checked ? 'По ссылке' : 'В каталоге'}</span>
    </div>
  `;

  builderQuestions.forEach((question, index) => {
    const item = document.createElement('article');
    item.className = 'preview-question';
    item.innerHTML = `
      <h3>${index + 1}. ${escapeHtml(question.text || 'Вопрос без текста')}</h3>
      <p class="muted">${QUESTION_TYPES[question.type]}</p>
    `;
    if (needsOptions(question.type)) {
      const list = document.createElement('ul');
      question.options.forEach((option) => {
        const li = document.createElement('li');
        li.textContent = option || 'Вариант без текста';
        list.append(li);
      });
      item.append(list);
    }
    previewBody.append(item);
  });

  if (previewDialog.showModal) {
    previewDialog.showModal();
  } else {
    previewDialog.setAttribute('open', '');
  }
}

function closePreview() {
  if (previewDialog.close) {
    previewDialog.close();
  } else {
    previewDialog.removeAttribute('open');
  }
}

function showPublicPoll(pollId) {
  const poll = polls.find((item) => item.id === pollId);
  if (!poll) {
    notify('Опрос не найден.', 'error');
    return;
  }

  publicPollShown = true;
  const link = buildPollLink(poll.id);
  publicTitle.textContent = poll.title;
  publicBody.innerHTML = `
    <p class="muted">${escapeHtml(poll.description || 'Описание не указано.')}</p>
    <div class="poll-meta">
      ${renderStatusBadge(poll.status)}
      <span>${getPollSettings(poll).anonymous ? 'Анонимный' : 'С указанием почты'}</span>
      <span>${getPollSettings(poll).singleAttempt ? 'Одно прохождение' : 'Можно проходить повторно'}</span>
    </div>
    <div class="public-link-box">
      <label class="field">
        <span>Ссылка</span>
        <input id="public-link" value="${escapeAttribute(link)}" readonly>
      </label>
      <button class="secondary-button" type="button" data-copy-public-link="${poll.id}">Скопировать</button>
    </div>
    <div class="qr-wrap">
      <div class="qr-code" aria-label="QR-код ссылки">${renderQrCode(link)}</div>
      <p class="muted">QR-код для быстрого доступа к странице опроса.</p>
    </div>
    <div class="public-comments">
      <h3>Комментарии</h3>
      <div class="comment-list">${renderComments(poll.id)}</div>
      <label class="field">
        <span>Новый комментарий</span>
        <textarea id="public-comment-text" rows="3" placeholder="Ваш комментарий"></textarea>
      </label>
      <button class="primary-button" type="button" data-add-public-comment="${poll.id}">Добавить комментарий</button>
    </div>
    <button class="primary-button" type="button" data-start-public-poll="${poll.id}">Пройти опрос</button>
  `;

  if (publicDialog.open) {
    return;
  }

  if (publicDialog.showModal) {
    publicDialog.showModal();
  } else {
    publicDialog.setAttribute('open', '');
  }
}

function closePublic() {
  if (publicDialog.close) {
    publicDialog.close();
  } else {
    publicDialog.removeAttribute('open');
  }
}

function renderComments(pollId) {
  const pollComments = comments
    .filter((comment) => comment.pollId === pollId)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!pollComments.length) {
    return '<p class="muted">Комментариев пока нет.</p>';
  }

  return pollComments.map((comment) => `
    <article class="comment-card">
      <strong>${escapeHtml(comment.userEmail || 'Гость')}</strong>
      <p>${escapeHtml(comment.text)}</p>
      <small>${formatDate(new Date(comment.createdAt))}</small>
    </article>
  `).join('');
}

function addComment(pollId, text) {
  const value = text.trim();
  if (!value) {
    notify('Введите текст комментария.', 'error');
    return;
  }

  comments.push({
    id: `comment-${Date.now()}`,
    pollId,
    userEmail: currentUser?.email || null,
    text: value,
    createdAt: new Date().toISOString()
  });
  writeJson(COMMENTS_STORAGE_KEY, comments);
  notify('Комментарий добавлен.');
  renderCatalog();
  renderAccount();
  renderAdmin();
  showPublicPoll(pollId);
}

function renderQrCode(value) {
  const size = 13;
  let seed = 0;
  for (let index = 0; index < value.length; index += 1) {
    seed = (seed * 31 + value.charCodeAt(index)) % 9973;
  }

  let html = '';
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const isFinder = (row < 4 && col < 4) || (row < 4 && col > 8) || (row > 8 && col < 4);
      const filled = isFinder || ((row * 17 + col * 31 + seed + row * col) % 5 < 2);
      html += `<span class="${filled ? 'is-filled' : ''}"></span>`;
    }
  }
  return html;
}

function toggleFavorite(pollId) {
  if (!currentUser) {
    notify('Войдите, чтобы добавлять опросы в избранное.', 'error');
    return;
  }

  const existingIndex = favorites.findIndex((item) => item.userEmail === currentUser.email && item.pollId === pollId);
  if (existingIndex >= 0) {
    favorites.splice(existingIndex, 1);
    notify('Опрос удален из избранного.');
  } else {
    favorites.push({ userEmail: currentUser.email, pollId });
    notify('Опрос добавлен в избранное.');
  }

  writeJson(FAVORITES_STORAGE_KEY, favorites);
  renderCatalog();
  renderAccount();
}

function exportAllData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    users,
    polls,
    results,
    comments,
    favorites,
    theme: currentTheme
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'interactive-polls-data.json';
  link.click();
  URL.revokeObjectURL(link.href);
  notify('Данные подготовлены для скачивания.');
}

function importAllData(file) {
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener('load', () => {
    try {
      const payload = JSON.parse(reader.result);
      users = Array.isArray(payload.users) ? payload.users.map(normalizeUser) : users;
      polls = Array.isArray(payload.polls) ? payload.polls.map(normalizePoll) : polls;
      results = Array.isArray(payload.results) ? payload.results.map(normalizeResult) : results;
      comments = Array.isArray(payload.comments) ? payload.comments.map(normalizeComment) : comments;
      favorites = Array.isArray(payload.favorites) ? payload.favorites : favorites;
      currentTheme = payload.theme === 'dark' ? 'dark' : 'light';
      currentUser = currentUser ? users.find((user) => user.email === currentUser.email) || null : null;
      writeJson(USERS_STORAGE_KEY, users);
      writeJson(POLLS_STORAGE_KEY, polls);
      writeJson(RESULTS_STORAGE_KEY, results);
      writeJson(COMMENTS_STORAGE_KEY, comments);
      writeJson(FAVORITES_STORAGE_KEY, favorites);
      writeJson(THEME_STORAGE_KEY, currentTheme);
      writeJson(SESSION_STORAGE_KEY, currentUser?.email || null);
      notify('Данные импортированы.');
      renderAll();
    } catch (error) {
      notify('Не удалось импортировать файл данных.', 'error');
    }
  });
  reader.readAsText(file);
}

function notify(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'is-error' : ''}`;
  toast.textContent = message;
  toastStack.append(toast);
  setTimeout(() => toast.remove(), 3600);
}

function applyTheme() {
  document.body.dataset.theme = currentTheme;
  themeToggleButton.textContent = currentTheme === 'dark' ? 'Светлая тема' : 'Темная тема';
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  writeJson(THEME_STORAGE_KEY, currentTheme);
  applyTheme();
}

function exportResultsCsv() {
  if (!results.length) {
    notify('Нет результатов для экспорта.', 'error');
    return;
  }

  const rows = [['Опрос', 'Статус', 'Участник', 'Дата', 'Вопрос', 'Ответ']];
  results.forEach((result) => {
    const poll = polls.find((item) => item.id === result.pollId);
    const questions = poll?.questions || [];
    if (!poll) {
      rows.push([
        result.pollTitle || 'Опрос удален',
        'Удален',
        result.anonymous ? 'Анонимно' : result.userEmail || '',
        formatDate(new Date(result.completedAt)),
        'Структура опроса недоступна',
        JSON.stringify(result.answers)
      ]);
      return;
    }

    questions.forEach((question, index) => {
      rows.push([
        poll?.title || result.pollTitle || 'Опрос удален',
        STATUS_META[poll?.status]?.label || 'Удален',
        result.anonymous ? 'Анонимно' : result.userEmail || '',
        formatDate(new Date(result.completedAt)),
        question.text,
        formatAnswer(question, result.answers[index])
      ]);
    });
  });

  const csv = rows.map((row) => row.map(escapeCsvCell).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'poll-results.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeCsvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function formatAnswer(question, answer) {
  if (question.type === 'multiple') {
    return Array.isArray(answer)
      ? answer.map((index) => question.options[index]).filter(Boolean).join(', ')
      : '';
  }
  if (question.type === 'single') {
    return question.options[answer] || '';
  }
  if (question.type === 'boolean') {
    return answer === true ? 'Да' : answer === false ? 'Нет' : '';
  }
  if (question.type === 'scale') {
    return answer ? `${answer} из 5` : '';
  }
  return answer || '';
}

function getAttemptCount(pollId) {
  return results.filter((result) => result.pollId === pollId).length;
}

function buildPollLink(pollId) {
  const url = new URL(window.location.href);
  url.searchParams.set('poll', pollId);
  return url.toString();
}

function copyText(value) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(value).catch(() => {});
  }
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function showAuthNotice(message, success) {
  authMessage.textContent = message;
  authMessage.classList.toggle('is-success', success);
}

function registerUser() {
  const email = normalizeEmail(authEmailInput.value);
  const password = authPasswordInput.value;

  if (!email || !password) {
    showAuthNotice('Введите почту и пароль.', false);
    return;
  }

  if (!isValidEmail(email)) {
    showAuthNotice('Введите корректную почту.', false);
    return;
  }

  if (password.length < 4) {
    showAuthNotice('Пароль должен быть не короче 4 символов.', false);
    return;
  }

  if (users.some((user) => user.email === email)) {
    showAuthNotice('Пользователь с такой почтой уже зарегистрирован.', false);
    return;
  }

  const user = {
    email,
    password,
    role: users.length === 0 ? 'admin' : 'author',
    status: 'active',
    createdAt: new Date().toISOString()
  };
  users.push(user);
  currentUser = user;
  writeJson(USERS_STORAGE_KEY, users);
  writeJson(SESSION_STORAGE_KEY, currentUser.email);
  authForm.reset();
  renderAll();
}

function loginUser() {
  const email = normalizeEmail(authEmailInput.value);
  const password = authPasswordInput.value;
  const user = users.find((item) => item.email === email && item.password === password);

  if (!user) {
    showAuthNotice('Неверная почта или пароль.', false);
    return;
  }

  if (user.status === 'blocked') {
    showAuthNotice('Пользователь заблокирован администратором.', false);
    return;
  }

  currentUser = user;
  writeJson(SESSION_STORAGE_KEY, currentUser.email);
  authForm.reset();
  renderAll();
}

function logoutUser() {
  currentUser = null;
  writeJson(SESSION_STORAGE_KEY, null);
  renderAll();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function toDateTimeLocalValue(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function getPluralForm(count, forms) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return forms[2];
  }

  if (lastDigit === 1) {
    return forms[0];
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return forms[1];
  }

  return forms[2];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.sectionTarget;
    activeQuiz = null;
    showSection(target);
  });
});

pollList.addEventListener('click', handlePollAction);
accountContent.addEventListener('click', handlePollAction);
adminContent.addEventListener('click', handlePollAction);
adminContent.addEventListener('change', (event) => {
  const roleSelect = event.target.closest('[data-admin-role]');
  if (roleSelect) {
    setUserRole(roleSelect.dataset.adminRole, roleSelect.value);
  }
});

adminContent.addEventListener('click', (event) => {
  const toggleButton = event.target.closest('[data-toggle-user]');
  if (toggleButton) {
    toggleUserStatus(toggleButton.dataset.toggleUser);
  }
});

accountContent.addEventListener('click', (event) => {
  if (event.target.closest('[data-export-all]')) {
    exportAllData();
  }
});

accountContent.addEventListener('change', (event) => {
  const input = event.target.closest('#import-data-input');
  if (input) {
    importAllData(input.files[0]);
    input.value = '';
  }
});

function handlePollAction(event) {
  const startButton = event.target.closest('[data-start-poll]');
  if (startButton) {
    startPoll(startButton.dataset.startPoll);
    return;
  }

  const copyButton = event.target.closest('[data-copy-poll-link]');
  if (copyButton) {
    const link = buildPollLink(copyButton.dataset.copyPollLink);
    copyText(link);
    notify('Ссылка скопирована.');
    return;
  }

  const publicButton = event.target.closest('[data-public-poll]');
  if (publicButton) {
    showPublicPoll(publicButton.dataset.publicPoll);
    return;
  }

  const favoriteButton = event.target.closest('[data-toggle-favorite]');
  if (favoriteButton) {
    toggleFavorite(favoriteButton.dataset.toggleFavorite);
    return;
  }

  const commentButton = event.target.closest('[data-comment-poll]');
  if (commentButton) {
    showPublicPoll(commentButton.dataset.commentPoll);
    return;
  }

  const editButton = event.target.closest('[data-edit-poll]');
  if (editButton) {
    beginEditPoll(editButton.dataset.editPoll);
    return;
  }

  const toggleButton = event.target.closest('[data-toggle-status]');
  if (toggleButton) {
    togglePollStatus(toggleButton.dataset.toggleStatus);
    return;
  }

  const deleteButton = event.target.closest('[data-delete-poll]');
  if (deleteButton) {
    deletePoll(deleteButton.dataset.deletePoll);
    return;
  }

  const adminDeleteButton = event.target.closest('[data-admin-delete-poll]');
  if (adminDeleteButton) {
    deletePoll(adminDeleteButton.dataset.adminDeletePoll);
  }
}

catalogSearch.addEventListener('input', renderCatalog);
catalogFilter.addEventListener('change', renderCatalog);

document.querySelector('#add-question').addEventListener('click', () => {
  if (editingQuestionsLocked) {
    return;
  }
  syncBuilderFromInputs();
  builderQuestions.push({ text: '', type: 'single', options: ['', ''] });
  renderBuilder();
});

document.querySelector('#reset-builder').addEventListener('click', resetBuilder);
document.querySelector('#preview-poll').addEventListener('click', previewCurrentPoll);
closePreviewButton.addEventListener('click', closePreview);
closePublicButton.addEventListener('click', closePublic);

publicBody.addEventListener('click', (event) => {
  const copyButton = event.target.closest('[data-copy-public-link]');
  if (copyButton) {
    copyText(buildPollLink(copyButton.dataset.copyPublicLink));
    notify('Ссылка скопирована.');
    return;
  }

  const startButton = event.target.closest('[data-start-public-poll]');
  if (startButton) {
    closePublic();
    startPoll(startButton.dataset.startPublicPoll);
    return;
  }

  const commentButton = event.target.closest('[data-add-public-comment]');
  if (commentButton) {
    const textarea = publicBody.querySelector('#public-comment-text');
    addComment(commentButton.dataset.addPublicComment, textarea?.value || '');
  }
});

questionBuilderList.addEventListener('input', (event) => {
  const editor = event.target.closest('.question-editor');
  if (!editor || editingQuestionsLocked) {
    return;
  }

  const questionIndex = Number(editor.dataset.questionIndex);
  if (event.target.classList.contains('question-text')) {
    builderQuestions[questionIndex].text = event.target.value;
  }

  if (event.target.classList.contains('option-text')) {
    const optionInputs = [...editor.querySelectorAll('.option-text')];
    builderQuestions[questionIndex].options = optionInputs.map((input) => input.value);
  }
});

questionBuilderList.addEventListener('change', (event) => {
  if (!event.target.classList.contains('question-type') || editingQuestionsLocked) {
    return;
  }

  const editor = event.target.closest('.question-editor');
  const questionIndex = Number(editor.dataset.questionIndex);
  const type = event.target.value;
  builderQuestions[questionIndex].type = type;
  builderQuestions[questionIndex].options = needsOptions(type) ? ['', ''] : [];
  renderBuilder();
});

questionBuilderList.addEventListener('click', (event) => {
  const editor = event.target.closest('.question-editor');
  if (!editor || editingQuestionsLocked) {
    return;
  }

  const questionIndex = Number(editor.dataset.questionIndex);

  if (event.target.classList.contains('add-option')) {
    syncBuilderFromInputs();
    builderQuestions[questionIndex].options.push('');
    renderBuilder();
  }

  if (event.target.classList.contains('remove-option')) {
    const optionRow = event.target.closest('.option-row');
    const optionIndex = Number(optionRow.dataset.optionIndex);
    syncBuilderFromInputs();
    builderQuestions[questionIndex].options.splice(optionIndex, 1);
    renderBuilder();
  }

  if (event.target.classList.contains('remove-question')) {
    syncBuilderFromInputs();
    builderQuestions.splice(questionIndex, 1);
    renderBuilder();
  }
});

builderForm.addEventListener('submit', (event) => {
  event.preventDefault();
  syncBuilderFromInputs();

  const validation = validateBuilder();
  if (!validation.valid) {
    formMessage.textContent = validation.message;
    formMessage.classList.remove('is-success');
    return;
  }

  const existingIndex = polls.findIndex((poll) => poll.id === validation.poll.id);
  if (existingIndex >= 0) {
    polls[existingIndex] = validation.poll;
  } else {
    polls.push(validation.poll);
  }

  writeJson(POLLS_STORAGE_KEY, polls);
  const savedLinkOnly = validation.poll.settings.linkOnly;
  const savedLink = buildPollLink(validation.poll.id);
  resetBuilder();

  if (savedLinkOnly) {
    formMessage.textContent = 'Опрос сохранен. Он скрыт из каталога и доступен только по ссылке ниже.';
    formMessage.classList.add('is-success');
    createdLinkInput.value = savedLink;
    createdLinkInput.setAttribute('value', savedLink);
    createdLinkBox.hidden = false;
  } else {
    formMessage.textContent = 'Опрос сохранен.';
    formMessage.classList.add('is-success');
    showSection('catalog');
  }

  renderCatalog();
  renderAccount();
  renderResults();
});

answerList.addEventListener('change', () => {
  quizMessage.textContent = '';
});

answerList.addEventListener('input', () => {
  quizMessage.textContent = '';
});

previousQuestionButton.addEventListener('click', () => {
  if (!activeQuiz) {
    return;
  }

  saveCurrentAnswer(false);
  activeQuiz.currentIndex -= 1;
  renderQuiz();
});

nextQuestionButton.addEventListener('click', () => {
  if (!saveCurrentAnswer()) {
    return;
  }

  if (activeQuiz.currentIndex === activeQuiz.poll.questions.length - 1) {
    finishQuiz();
    return;
  }

  activeQuiz.currentIndex += 1;
  renderQuiz();
});

document.querySelector('#close-quiz').addEventListener('click', () => {
  activeQuiz = null;
  showSection('catalog');
});

clearResultsButton.addEventListener('click', () => {
  if (!results.length) {
    return;
  }

  const confirmed = window.confirm('Удалить все сохраненные результаты опросов?');
  if (!confirmed) {
    return;
  }

  results = [];
  writeJson(RESULTS_STORAGE_KEY, results);
  renderCatalog();
  renderAccount();
  renderResults();
});

exportResultsButton.addEventListener('click', exportResultsCsv);

showHistoryButton.addEventListener('click', () => {
  const willShow = historyPanel.hidden;
  historyPanel.hidden = !willShow;
  showHistoryButton.setAttribute('aria-expanded', String(willShow));
  showHistoryButton.textContent = willShow ? 'Скрыть историю' : 'История прохождений';
  renderHistoryControls();
  renderHistory();
});

historyFilter.addEventListener('change', () => {
  renderHistoryControls();
  renderHistory();
});

historyUserFilter.addEventListener('change', renderHistory);
historyStatusFilter.addEventListener('change', renderHistory);

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loginUser();
});

registerButton.addEventListener('click', registerUser);
logoutButton.addEventListener('click', logoutUser);
themeToggleButton.addEventListener('click', toggleTheme);

copyCreatedLinkButton.addEventListener('click', () => {
  copyText(createdLinkInput.value);
  createdLinkInput.select();
});

renderAll();
