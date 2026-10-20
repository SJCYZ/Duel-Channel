import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveClientIp, isLoopbackIp } from '../server/client-ip.mjs';

const request = (remoteAddress, forwardedFor) => ({
  socket: { remoteAddress },
  headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
});

test('ignores XFF when proxy trust is disabled', () => {
  assert.equal(resolveClientIp(request('203.0.113.8', '198.51.100.4'), false), '203.0.113.8');
});

test('ignores XFF from a public TCP peer', () => {
  assert.equal(resolveClientIp(request('203.0.113.8', '198.51.100.4'), true), '203.0.113.8');
});

test('uses the rightmost valid XFF address from a trusted private proxy', () => {
  assert.equal(resolveClientIp(request('10.2.3.4', '198.51.100.4, 192.0.2.9'), true), '192.0.2.9');
});

test('falls back to the TCP peer for missing or invalid XFF', () => {
  assert.equal(resolveClientIp(request('10.2.3.4'), true), '10.2.3.4');
  assert.equal(resolveClientIp(request('10.2.3.4', 'bad-address'), true), '10.2.3.4');
});

test('normalizes IPv4-mapped IPv6 addresses', () => {
  assert.equal(resolveClientIp(request('::ffff:192.0.2.7'), false), '192.0.2.7');
  assert.equal(resolveClientIp(request('10.0.0.1', '::ffff:c000:0207'), true), '192.0.2.7');
  assert.equal(resolveClientIp(request('0:0:0:0:0:ffff:192.0.2.7'), false), '192.0.2.7');
  assert.equal(resolveClientIp(request('0000:0000:0000:0000:0000:ffff:192.0.2.7'), false), '192.0.2.7');
  assert.equal(resolveClientIp(request('0:0:0:0:0:ffff:c000:0207'), false), '192.0.2.7');
  assert.equal(resolveClientIp(request('0000:0000:0000:0000:0000:ffff:c000:0207'), false), '192.0.2.7');
});

test('returns null for an invalid TCP peer', () => {
  assert.equal(resolveClientIp(request('not-an-ip'), false), null);
});

test('recognizes all IPv4 127/8 addresses and IPv6 loopback', () => {
  assert.equal(isLoopbackIp('127.42.1.9'), true);
  assert.equal(isLoopbackIp('::1'), true);
  assert.equal(isLoopbackIp('0:0:0:0:0:ffff:127.0.0.1'), true);
  assert.equal(isLoopbackIp('0000:0000:0000:0000:0000:ffff:127.0.0.1'), true);
  assert.equal(isLoopbackIp('10.0.0.1'), false);
  assert.equal(isLoopbackIp('invalid'), false);
});
