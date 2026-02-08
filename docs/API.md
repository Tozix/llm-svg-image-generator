# Работа с API

Краткое руководство по использованию API генерации изображений. Полное описание эндпоинтов, схем и примеров — в Swagger UI: `http://localhost:3000/api-docs`.

## Авторизация

1. **Вход:** отправьте `POST /auth/login` с телом:
   ```json
   { "username": "логин", "password": "пароль" }
   ```
   Логин и пароль задаются на сервере переменными `API_USER` и `API_PASSWORD` (по умолчанию `admin`/`admin`).

2. Ответ при успехе: `{ "access_token": "JWT..." }`.

3. Дальше во всех запросах (кроме логина и `GET /api/status`) передавайте заголовок:
   ```
   Authorization: Bearer <access_token>
   ```

## Создание задачи генерации

**POST /tasks**

Тело запроса (обязательно поле `description`, остальное опционально):

| Поле | Тип | Описание |
|------|-----|----------|
| `description` | string | Текстовое описание изображения (обязательно). |
| `accents` | string | Дополнительные акценты/детали для промпта. |
| `type` | string | Тип: `mob`, `npc`, `player`, `plot_map`, `plot_view`, `object_detail`. По умолчанию `plot_view`. Влияет на размер холста и выбор промптов. |
| `composite` | boolean | Композитная генерация (только для `plot_view`): сцена разбивается на фрагменты, генерируются отдельно, собираются в один SVG. |
| `useLibrary` | boolean | Подставлять элементы из библиотеки при композитной генерации. |
| `sceneView` | string | Для `plot_view`: укажите `first_person` для вида от первого лица. |
| `mapBiome` | string | Для `plot_map`: биом фрагмента карты. |
| `mapEdges` | object | Для `plot_map`: границы N/S/E/W (`n`, `s`, `e`, `w`) для стыковки тайлов. |
| `width` | number | Ширина в пикселях (64–2048). Если не указано — из конфига по типу. |
| `height` | number | Высота в пикселях (64–2048). |
| `pixelScale` | number | Масштаб пикселей при рендере в растр (1–16). |
| `outputFormat` | string | Формат растра: `png`, `jpg`, `webp`. |
| `quality` | number | Качество для jpg/webp (1–100). |
| `backgroundColor` | string | Цвет фона в hex (например `#0a0a1a`). |

Ответ при успехе: **201** `{ "taskId": "uuid" }`.

## Опрос статуса и результат

- **GET /tasks/:id** — статус задачи. Поля: `status` (`pending` | `processing` | `completed` | `failed`), при `completed` — `svgUrl`, `pngUrl`; при `failed` — `error`.
- **GET /tasks/:id/result** — JSON с `svgUrl`, `pngUrl` (если задача завершена).
- **GET /tasks/:id/svg**, **GET /tasks/:id/png** — скачивание файла по URL (редирект или содержимое).

Рекомендуемый сценарий: после получения `taskId` опрашивать `GET /tasks/:id` с интервалом (например 3 с) до `status === 'completed'` или `'failed'`, затем отобразить или скачать по `svgUrl`/`pngUrl`.

## Промпты

- **GET /prompts** — список относительных путей к файлам промптов (например `system/pixelart.txt`, `types/plot_view.txt`).
- **GET /prompts/<path>** — содержимое файла. Ответ: `{ "name": "<path>", "content": "текст" }`. Путь — как в списке, слэши в URL как есть (например `/prompts/system/pixelart.txt`).
- **PUT /prompts/<path>** — обновить промпт. Тело: `{ "content": "новый текст" }`. Файл перезаписывается, кэш на сервере сбрасывается.

Все эндпоинты промптов требуют авторизации.

## Параметры генерации по умолчанию

- **GET /generation-params** — текущие значения (размеры холста, лимиты, формат вывода и т.д.). Секреты (API_KEY и т.п.) не возвращаются.
- **PUT /generation-params** — обновить параметры. Тело: объект с полями (например `sceneWidth`, `sceneHeight`, `objectSize`, `mapWidth`, `mapHeight`, `maxConcurrentJobs`, `compositeScene`, `gridCols`, `gridRows`, `compositeConcurrency`, `maxGenerationTokens`, `maxSvgElements`, `pixelScale`, `outputFormat`, `quality`, `backgroundColor`). Передавайте только нужные поля. Данные сохраняются в `config/generation-params.json`. При старте приложение читает этот файл и мержит значения с переменными окружения (env имеет приоритет); после перезапуска сохранённые в админке параметры применяются.

## Библиотека элементов

- **GET /library** — список элементов библиотеки (для подстановки в композитные сцены). Ответ: `{ "ok": true, "entries": [ ... ] }`.
- **POST /library** — добавить элемент. Тело: `{ "description": "описание элемента" }`. Сервер генерирует изображение и добавляет его в библиотеку.

Требуется авторизация.

## Статус очереди

- **GET /api/status** — статистика очереди (активные/ожидающие задачи). Доступно без авторизации.

---

# Настройки и их влияние

## Переменные окружения

| Переменная | Влияние |
|------------|---------|
| `PORT` | Порт HTTP-сервера (по умолчанию 3000). |
| `JWT_SECRET` | Секрет для подписи JWT. В production задать свой. |
| `API_USER`, `API_PASSWORD` | Учётные данные для входа в API и веб-интерфейс. |
| `API_ENDPOINT`, `API_KEY`, `MODEL` | Подключение к LLM API: URL, ключ, модель. |
| `MAX_CONCURRENT_JOBS` | Число одновременных задач генерации (размер очереди воркеров). |
| `STREAM_ENABLED` | Стриминг ответа LLM (SSE). Включение может изменить поведение таймаутов. |
| `ENABLE_EXTENDED_DESCRIPTION` | Расширять ли описание сцены дополнительным запросом к LLM перед генерацией. Увеличивает время и нагрузку. |
| `MAX_VALIDATION_RETRIES` | Сколько раз повторять запрос к LLM при неполном или невалидном SVG. |
| `MAX_GENERATION_TOKENS` | Лимит токенов на ответ при генерации SVG (меньше — быстрее, но SVG может обрезаться). |
| `MAX_SVG_ELEMENTS` | Максимум элементов в SVG (path, rect, circle и т.д.) — ограничивает сложность и время генерации. |
| `COMPOSITE_SCENE` | Включить композитную генерацию по умолчанию (разбиение сцены на фрагменты). |
| `GRID_COLS`, `GRID_ROWS` | Сетка для композитного режима (число ячеек по горизонтали и вертикали). |
| `COMPOSITE_CONCURRENCY` | Сколько фрагментов композитной сцены генерировать параллельно. |
| `SCENE_WIDTH`, `SCENE_HEIGHT` | Размер холста для режима сцены (plot_view). Диапазон 256–2048. |
| `OBJECT_SIZE` | Сторона квадрата для объект/персонаж (mob, npc, player, object_detail). 64–1024. |
| `MAP_WIDTH`, `MAP_HEIGHT` | Размер фрагмента карты (plot_map). 256–1024. |
| `LOG_LEVEL`, `DEBUG` | Уровень логирования (например `debug`) и включение отладочных логов. |

## Параметры из админки (generation-params)

Те же поля, что в **GET/PUT /generation-params**: `sceneWidth`, `sceneHeight`, `objectSize`, `mapWidth`, `mapHeight`, `maxConcurrentJobs`, `compositeScene`, `gridCols`, `gridRows`, `compositeConcurrency`, `maxGenerationTokens`, `maxSvgElements`, `pixelScale`, `outputFormat`, `quality`, `backgroundColor`. Они задают значения по умолчанию для новых задач. Приложение при старте читает `config/generation-params.json` и мержит эти значения с env (переменные окружения имеют приоритет); после перезапуска сохранённые в админке параметры применяются.
