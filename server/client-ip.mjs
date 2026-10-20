import { BlockList, isIP } from 'node:net';

const trustedProxyPeers = new BlockList();
for (const subnet of [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['100.64.0.0', 10],
]) trustedProxyPeers.addSubnet(...subnet, 'ipv4');
for (const subnet of [['::1', 128], ['fc00::', 7], ['fe80::', 10]]) {
  trustedProxyPeers.addSubnet(...subnet, 'ipv6');
}

const loopbackAddresses = new BlockList();
loopbackAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
loopbackAddresses.addAddress('::1', 'ipv6');

function normalizeIp(ip) {
  const family = isIP(ip);
  if (!family) return null;
  if (family === 4) return ip;

  const mapped = ip.match(/^(?:::|0:0:0:0:0:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];

  const mappedHex = ip.match(/^(?:::|0:0:0:0:0:)ffff:([\da-f]{1,4}):([\da-f]{1,4})$/i);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return ip;
}

function isTrustedProxyIp(ip) {
  const family = isIP(ip) === 4 ? 'ipv4' : 'ipv6';
  return trustedProxyPeers.check(ip, family);
}

export function resolveClientIp(req, trustProxy) {
  const remoteAddress = normalizeIp(req?.socket?.remoteAddress ?? '');
  if (!remoteAddress) return null;

  if (trustProxy === true && isTrustedProxyIp(remoteAddress)) {
    const forwardedFor = req.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      const forwardedIp = normalizeIp(forwardedFor.split(',').at(-1).trim());
      if (forwardedIp) return forwardedIp;
    }
  }
  return remoteAddress;
}

export function isLoopbackIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  return loopbackAddresses.check(normalized, isIP(normalized) === 4 ? 'ipv4' : 'ipv6');
}
