# HTMLProject

Веб-приложения для создания и проведения интерактивных квизов. Организаторы создают квизы и запускают комнаты, а участники подключаются по коду, отвечают на вопросы и видят итоговую таблицу лидеров.

## Стек

React, Vite, Node.js, Express, Socket.IO, SQLite, JWT.

## Структура

- `client/` — React-интерфейс приложения.
- `server/` — REST API, Socket.IO и работа с SQLite.
- `tools/` — автоматический smoke-тест.
- `docs/` — пояснительные материалы проекта.
- `index.html`, `styles.css`, `script.js` — архив статического прототипа.

## Запуск

```bash
npm run install:all
npm run dev
```

После запуска сайт доступен по адресу [http://127.0.0.1:5173](http://127.0.0.1:5173).

Макеты: [Figma](https://www.figma.com/design/lLT6lRo2NY7EcxmLQPyaAw/HTMLProject).
