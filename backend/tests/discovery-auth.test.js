// Route authorisation matrix for Discovery (BookOrbit idea, see
// "BookOrbit potential benefits for Crowdly.md"): every /library, /reading,
// /shelves and /me route must refuse a request without a session.
//
// Run against a running backend:  npm run test:discovery-auth
//   (BASE_URL defaults to http://localhost:4000)

import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const ID = '00000000-0000-4000-8000-000000000000';

const ROUTES = [
  ['GET', '/library/items'],
  ['POST', '/library/items'],
  ['PUT', `/library/items/${ID}/file`],
  ['GET', `/library/items/${ID}/file`],
  ['PATCH', `/library/items/${ID}`],
  ['DELETE', `/library/items/${ID}`],
  ['POST', `/library/items/${ID}/convert`],
  ['GET', `/reading/positions/${ID}`],
  ['PUT', `/reading/positions/${ID}`],
  ['POST', '/reading/sessions'],
  ['POST', '/reading/highlights/sync'],
  ['GET', '/shelves'],
  ['POST', '/shelves'],
  ['PUT', '/shelves/order'],
  ['GET', `/shelves/membership?type=story&id=${ID}`],
  ['PATCH', `/shelves/${ID}`],
  ['DELETE', `/shelves/${ID}`],
  ['GET', '/shelves/favorites/items'],
  ['GET', `/shelves/${ID}/items`],
  ['POST', `/shelves/${ID}/items`],
  ['DELETE', `/shelves/${ID}/items/${ID}`],
  ['PUT', `/shelves/${ID}/items/order`],
  ['PUT', '/me/story-status'],
  ['GET', '/discover/home'],
  ['PUT', `/library/items/${ID}/cover`],
  ['GET', `/library/items/${ID}/cover`],
];

for (const [method, path] of ROUTES) {
  test(`${method} ${path} requires a session`, async () => {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: 'crowdly_session=not-a-session' },
      body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
    });
    assert.equal(res.status, 401);
  });
}
