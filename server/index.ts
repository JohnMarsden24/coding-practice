import './env';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app';
import { createClaude, models } from './claude';
import { openStore } from './db';

const store = openStore(process.env.DB_PATH || 'data/coding-practice.db');
const server = new Hono();
server.route('/', createApp({ store, claude: createClaude() }));

if (process.env.NODE_ENV === 'production') {
  server.use('/*', serveStatic({ root: './dist' }));
  server.get('*', serveStatic({ path: './dist/index.html' }));
}

const port = Number(process.env.PORT || 3001);
serve({ fetch: server.fetch, port }, () => {
  console.log(`Coding practice API on http://localhost:${port} (chat: ${models.chat}, problems and feedback: ${models.deep})`);
});
