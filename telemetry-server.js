#!/usr/bin/env node
/*
 * VKgram: приёмник анонимной телеметрии. Без зависимостей — только node,
 * живёт на сервере как systemd-сервис (vkgram-telemetry), nginx проксирует
 * на него /telemetry с сайта vkgram.defenders08.tech:
 *
 *   POST /telemetry        — пинг установки {id: uuid} (sendBeacon из приложения)
 *   GET  /telemetry/stats  — {total, active24h} для счётчика на странице входа
 *
 * Статистика — telemetry-data.json рядом со скриптом:
 *   {firstSeen: {id: ts}, lastSeen: {id: ts}} — firstSeen никогда не чистится
 *   (total = числу установок за всё время), lastSeen чистится от ID старше
 *   90 дней. Никаких других данных, кроме случайного ID, не приходит.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8123;
const HOST = '127.0.0.1';
const FILE = path.join(__dirname, 'telemetry-data.json');
const TTL = 90 * 24 * 3600 * 1000;

function readData() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch(err) {
    return {firstSeen: {}, lastSeen: {}};
  }
}

// атомарная запись, чтобы сервис не прочитал полфайла при перезаписи
function writeData(data) {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

function readBody(req, cb) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if(body.length > 1024) req.destroy(); // больше килобайта не присылают
  });
  req.on('end', () => cb(body));
}

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];

  if(req.method === 'POST' && url === '/telemetry') {
    readBody(req, (body) => {
      let id = null;
      try {
        const parsed = JSON.parse(body);
        if(typeof parsed.id === 'string' && parsed.id) id = parsed.id.slice(0, 64);
      } catch(err) {}
      if(!id) {
        res.writeHead(400).end();
        return;
      }
      const data = readData();
      const now = Date.now();
      if(!(id in data.firstSeen)) data.firstSeen[id] = now;
      data.lastSeen[id] = now;
      for(const key in data.lastSeen) {
        if(now - data.lastSeen[key] > TTL) delete data.lastSeen[key];
      }
      writeData(data);
      res.writeHead(204).end();
    });
    return;
  }

  if(req.method === 'GET' && url === '/telemetry/stats') {
    const data = readData();
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    let active24h = 0;
    for(const key in data.lastSeen) {
      if(data.lastSeen[key] >= dayAgo) active24h++;
    }
    // CORS: публичная статистика, её же берёт страница входа с дев-сервера
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({total: Object.keys(data.firstSeen).length, active24h}));
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, HOST, () => {
  console.log('vkgram-telemetry listening on', HOST + ':' + PORT);
});
