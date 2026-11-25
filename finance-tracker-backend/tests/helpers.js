/**
 * tests/helpers.js — boots the real app against a throwaway MongoDB.
 *
 * Uses mongodb-memory-server. Locally it reuses an installed mongod when
 * MONGOMS_SYSTEM_BINARY is set (or one is found at the default Windows path);
 * in CI it downloads a binary once and caches it.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.FX_DISABLED = 'true';
process.env.PUSH_DISABLED = 'true';

const fs = require('fs');
const winMongod = 'C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe';
if (!process.env.MONGOMS_SYSTEM_BINARY && process.platform === 'win32' && fs.existsSync(winMongod)) {
  process.env.MONGOMS_SYSTEM_BINARY = winMongod;
}

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;

const setup = async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = require('../app');
  // Indexes (unique, TTL, partial) are part of the behaviour under test.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return app;
};

const teardown = async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
};

let seq = 0;
/** Registers a fresh user; returns { agent helpers, tokens, user }. */
const newUser = async (overrides = {}) => {
  seq += 1;
  const body = {
    username: `user${Date.now() % 1e6}${seq}`,
    email: `u${Date.now()}${seq}@example.test`,
    password: 'CorrectHorse9',
    ...overrides,
  };
  const res = await request(app).post('/api/v1/auth/register').send(body).expect(201);
  const auth = { Authorization: `Bearer ${res.body.accessToken}` };
  const api = {
    get: (url) => request(app).get(url).set(auth),
    post: (url, data) => request(app).post(url).set(auth).send(data),
    patch: (url, data) => request(app).patch(url).set(auth).send(data),
    del: (url, data) => request(app).delete(url).set(auth).send(data),
  };
  return { ...res.body, password: body.password, api };
};

module.exports = { setup, teardown, newUser, request: () => request(app) };
