# SVG Generator (Image Generation API)

Генерация детализированных SVG и растровых изображений по текстовому описанию с помощью LLM API. Реализовано как NestJS API с асинхронной очередью задач (worker threads), JWT-авторизацией и Swagger.

## Требования

- Node.js (рекомендуется 18+)
- Зависимости из `package.json`

## Установка

```bash
npm install
npm run build
```

Скопируйте переменные окружения:

```bash
cp .env.example .env
```

Отредактируйте `.env`: укажите `API_KEY`, при необходимости `API_ENDPOINT`, `MODEL`, а также `JWT_SECRET`, `API_USER` и `API_PASSWORD` для входа в API и веб-интерфейс.

## Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `PORT` | Порт HTTP-сервера | `3000` |
| `API_ENDPOINT` | URL API чат-завершений | (см. .env.example) |
| `API_KEY` | Ключ API (Bearer токен) | — |
| `MODEL` | Модель LLM | `qwen-max-latest` |
| `JWT_SECRET` | Секрет для подписи JWT | (задайте в production) |
| `API_USER` | Логин для входа в API | `admin` |
| `API_PASSWORD` | Пароль для входа в API | `admin` |
| `LOG_LEVEL` | Уровень логов: `debug` для подробного вывода | — |
| `DEBUG` | Включить debug-логи (`1` или `true`) | — |
| `MAX_CONCURRENT_JOBS` | Число воркеров (одновременных задач генерации) | `3` |
| `STREAM_ENABLED` | Стриминг ответа LLM (SSE) | `false` |
| `ENABLE_EXTENDED_DESCRIPTION` | Расширять описание через LLM | `false` |
| `MAX_VALIDATION_RETRIES` | Повторы при неполном/невалидном SVG | `3` |
| `COMPOSITE_SCENE` | Композитная генерация (разбиение сцены) | `false` |
| `GRID_COLS`, `GRID_ROWS` | Сетка для композитного режима | `16`, `12` |
| `COMPOSITE_CONCURRENCY` | Параллельные запросы фрагментов | `5` |
| `SCENE_WIDTH`, `SCENE_HEIGHT` | Размер сцены (256–2048) | `640`, `480` |
| `OBJECT_SIZE` | Сторона квадрата object/character (64–1024) | `256` |
| `MAP_WIDTH`, `MAP_HEIGHT` | Размер фрагмента карты | `512`, `512` |

## Запуск

### API и веб-интерфейс

```bash
npm start
# или в режиме разработки:
npm run start:dev
```

- Веб-интерфейс: http://localhost:3000  
- Swagger: http://localhost:3000/api-docs (подробное описание каждого эндпоинта, параметры, диапазоны значений, примеры)

Сначала войдите (логин/пароль из `API_USER`/`API_PASSWORD`), затем используйте разделы: **Генерация**, **Библиотека**, **Админка**. В админке можно редактировать промпты, параметры генерации по умолчанию и запускать тестовую генерацию. Запрос на генерацию создаёт задачу и возвращает `taskId`; клиент опрашивает статус (polling) и по готовности отображает SVG/PNG.

### Запуск в Docker

Соберите образ и запустите контейнер с переменными из `.env`:

```bash
cp .env.example .env
# отредактируйте .env: API_KEY, API_USER, API_PASSWORD, JWT_SECRET и др.
docker-compose up -d
```

Сервис слушает порт **3000**. Веб-интерфейс: http://localhost:3000. В контейнер монтируются каталоги `./output` (результаты генерации), `./config` (сохранённые параметры), `./prompts` и `./library` (редактирование на хосте). Для применения части параметров из админки может потребоваться перезапуск: `docker-compose restart`.

### CLI (консольная генерация без API)

После сборки:

```bash
npm run cli -- generate -d "Описание сцены" -a "акценты" -t plot_view -o ./output -n имя_файла
npm run cli -- batch -f test.json -o ./output/batch
npm run cli -- types
```

## API (кратко)

- **POST /auth/login** — вход, тело `{ "username", "password" }`, ответ `{ "access_token" }`. Дальше заголовок `Authorization: Bearer <token>`. Учётные данные задаются в env: `API_USER`, `API_PASSWORD`.
- **POST /tasks** — создать задачу генерации (тело: description, accents, type, composite, useLibrary, width, height, pixelScale, outputFormat, quality, backgroundColor, sceneView, mapBiome, mapEdges и др.). Ответ `201 { "taskId" }`.
- **GET /tasks/:id** — статус задачи: `pending` | `processing` | `completed` | `failed`; при `completed` в ответе есть `svgUrl`, `pngUrl`.
- **GET /tasks/:id/result** — JSON с `svgUrl`, `pngUrl` (если задача завершена).
- **GET /tasks/:id/svg**, **GET /tasks/:id/png** — скачивание файла.
- **GET /api/status** — статистика очереди (активные/ожидающие задачи), без авторизации.
- **GET /prompts** — список путей к файлам промптов. **GET /prompts/<path>** — содержимое, **PUT /prompts/<path>** — обновление (тело `{ "content": "..." }`).
- **GET /generation-params**, **PUT /generation-params** — чтение и обновление параметров генерации по умолчанию (сохраняются в config; для применения части параметров может потребоваться перезапуск).
- **GET /library**, **POST /library** — библиотека элементов (список, добавление).

Подробное описание работы с API и влияния настроек — в [docs/API.md](docs/API.md). Полные схемы и примеры — в Swagger (http://localhost:3000/api-docs).

### Настройки и их влияние

Переменные окружения задают размеры холста (`SCENE_WIDTH`, `SCENE_HEIGHT`, `OBJECT_SIZE`, `MAP_WIDTH`, `MAP_HEIGHT`), число воркеров (`MAX_CONCURRENT_JOBS`), режимы композитной генерации (`COMPOSITE_SCENE`, `GRID_COLS`, `GRID_ROWS`, `COMPOSITE_CONCURRENCY`), стриминг и расширение описания (`STREAM_ENABLED`, `ENABLE_EXTENDED_DESCRIPTION`), лимиты токенов и элементов SVG (`MAX_GENERATION_TOKENS`, `MAX_SVG_ELEMENTS`), повторы при невалидном SVG (`MAX_VALIDATION_RETRIES`) и т.д. Таблица и описание — в [docs/API.md](docs/API.md). Параметры из админки (PUT /generation-params) сохраняются в `config/generation-params.json` и задают значения по умолчанию для задач.

### Тестовый скрипт генерации через API

Запустите сервер (`npm start`), затем в другом терминале:

```bash
npm run test:api
# или с своими параметрами:
node scripts/test-api-generate.js "Огненный дракон в пещере" "чешуя, дым" mob
```

Переменные: `BASE_URL`, `API_USER`, `API_PASSWORD`, `POLL_INTERVAL_MS`. Скрипт выполняет вход, создаёт задачу, опрашивает статус до завершения и выводит ссылки на SVG/PNG.

## Структура проекта

- `src/main.ts` — точка входа NestJS, Swagger, глобальные pipe/interceptor
- `src/app.module.ts` — корневой модуль
- `src/config.ts`, `src/logger.ts` — конфигурация и логирование
- `src/generator.ts` — генерация SVG через LLM, композитный режим
- `src/auth/` — JWT, логин, Guard
- `src/tasks/` — TaskStore, TasksController (создание задачи, статус, результат)
- `src/workers/` — пул worker_threads, worker-runner (вызов генератора в отдельном потоке)
- `src/prompts-api/` — API промптов (GET/PUT)
- `src/generation-params/` — API параметров генерации
- `src/library-api/` — API библиотеки элементов
- `src/prompts/` — загрузчик шаблонов промптов (loader, types)
- `src/library.ts` — работа с библиотекой элементов (файлы, индекс)
- `src/cli.ts` — CLI (generate, batch, add-element, types)
- `public/` — статика веб-интерфейса (вход, генерация, библиотека, админка: промпты, параметры, тестовая генерация)

## Типы генерации

- **plot_view** — вид сцены из глаз игрока (сцена, композит доступен)
- **plot_map** — фрагмент карты вид сверху
- **mob**, **npc**, **player** — монстр, NPC, внешний вид игрока (квадрат)
- **object_detail** — крупный план объекта

Промпты подстраиваются под тип. Композитная генерация (разбиение сцены на элементы и сборка) доступна только для `plot_view`.
