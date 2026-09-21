import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import { buildTestApp, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform, type TestApp } from './helpers.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);
const CODE = 'syl-err3';
const as = (t?: string) => (t ? { authorization: `Bearer ${t}` } : {});
const post = (url: string, t?: string, payload: unknown = {}) => harness.app.inject({ method: 'POST', url, headers: as(t), payload: payload as never }) as Promise<LightMyRequestResponse>;
const login = (i: string, p: string) => post('/v1/auth/login', undefined, { institution_code: CODE, identifier: i, password: p });

describe('error debug3', () => {
  it('trace exception', async () => {
    const owner = await seedPlatformAccount('owner+syl-err3@nirvok.com');
    const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
    const prov = await provisionCollege(harness.app, platform, { code: CODE, adminEmail: 'a@syl-err3.edu' });
    await post('/v1/auth/accept-invite', undefined, { institution_code: CODE, token: prov.body.data.invitation.token, password: 'admin-strong-99' });
    const admin = (await login('a@syl-err3.edu', 'admin-strong-99')).json().data.access_token as string;

    const me = await harness.app.inject({ method: 'GET', url: '/v1/auth/me', headers: as(admin) });
    console.log('ME FULL', me.body);
    const meData = me.json().data;
    console.log('ME DATA', JSON.stringify(meData).slice(0, 800));

    const tenantId = meData.tenant_id ?? meData.tenantId ?? meData.institution?.id;
    const personId = meData.actor_id ?? meData.person?.id ?? meData.sub;
    console.log('TENANT', tenantId, 'PERSON', personId);
    assert.ok(true);
  });
});