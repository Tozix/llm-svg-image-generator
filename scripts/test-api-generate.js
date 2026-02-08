#!/usr/bin/env node
/**
 * Тестовый скрипт генерации изображения через API.
 * Использование:
 *   node scripts/test-api-generate.js
 *   node scripts/test-api-generate.js "Другой промпт"
 *   node scripts/test-api-generate.js "Промпт" "акценты" plot_view
 *   BASE_URL=http://localhost:3000 API_USER=admin API_PASSWORD=admin node scripts/test-api-generate.js
 *
 * Переменные окружения:
 *   BASE_URL  — базовый URL API (по умолчанию http://localhost:3000)
 *   API_USER  — логин (по умолчанию admin)
 *   API_PASSWORD — пароль (по умолчанию admin)
 *   POLL_INTERVAL_MS — интервал опроса статуса в мс (по умолчанию 3000)
 */

const axios = require('axios');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_USER = process.env.API_USER || 'admin';
const API_PASSWORD = process.env.API_PASSWORD || 'admin';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10) || 3000;

const description = process.argv[2] || 'Киберпанк улица ночью с неоновыми вывесками';
const accents = process.argv[3] || 'дождь, летающие такси';
const type = process.argv[4] || 'plot_view';

async function request(method, path, body = null, token = null) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const config = { method, url, headers, validateStatus: () => true };
  if (body && (method === 'POST' || method === 'PUT')) config.data = body;
  const res = await axios(config);
  if (res.status < 200 || res.status >= 300) {
    const data = res.data || {};
    const e = new Error(data.message || data.error || `HTTP ${res.status}`);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return res.data;
}

async function main() {
  console.log('API base URL:', BASE_URL);
  console.log('Login:', API_USER);
  console.log('---');

  let token;
  try {
    const loginRes = await request('POST', '/auth/login', {
      username: API_USER,
      password: API_PASSWORD,
    });
    token = loginRes.access_token;
    if (!token) throw new Error('Нет access_token в ответе');
    console.log('Авторизация успешна.');
  } catch (e) {
    console.error('Ошибка входа:', e.message);
    if (e.data) console.error(e.data);
    process.exit(1);
  }

  const taskBody = {
    description,
    accents,
    type,
    composite: type === 'plot_view',
  };
  console.log('Создаю задачу:', JSON.stringify(taskBody, null, 2));

  let taskId;
  try {
    const createRes = await request('POST', '/tasks', taskBody, token);
    taskId = createRes.taskId;
    if (!taskId) throw new Error('Нет taskId в ответе');
    console.log('TaskId:', taskId);
  } catch (e) {
    console.error('Ошибка создания задачи:', e.message);
    if (e.data) console.error(e.data);
    process.exit(1);
  }

  console.log('Ожидаю завершения (опрос каждые', POLL_INTERVAL_MS / 1000, 'сек)...');
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let task;
    try {
      task = await request('GET', `/tasks/${taskId}`, null, token);
    } catch (e) {
      console.error('Ошибка опроса:', e.message);
      continue;
    }
    console.log('  Статус:', task.status, task.error ? `— ${task.error}` : '');
    if (task.status === 'completed') {
      const svgUrl = task.svgUrl || `${BASE_URL}/output/web/${taskId}.svg`;
      const pngUrl = task.pngUrl || `${BASE_URL}/output/web/${taskId}.png`;
      console.log('---');
      console.log('Готово.');
      console.log('SVG:', svgUrl);
      console.log('PNG:', pngUrl);
      console.log('Скачать: curl -o out.svg -H "Authorization: Bearer <token>"', svgUrl);
      console.log('         curl -o out.png -H "Authorization: Bearer <token>"', pngUrl);
      return;
    }
    if (task.status === 'failed') {
      console.error('Задача завершилась с ошибкой:', task.error || 'неизвестная ошибка');
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
