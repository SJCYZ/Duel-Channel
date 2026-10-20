# Task 1 实施报告：客户端地址解析器

## 结果

新增 `server/client-ip.mjs`，导出 `resolveClientIp(req, trustProxy)` 与 `isLoopbackIp(ip)`。解析器使用 `node:net` 的 `isIP` 和 `BlockList`，仅在 `trustProxy === true` 且 TCP 对端属于简报列出的 loopback、私网或共享地址网段时读取 XFF；只采用最右侧地址，校验失败时回退到 TCP 对端。IPv4-mapped IPv6 地址转换为 IPv4；无效 TCP 对端返回 `null`。Loopback 判定覆盖整个 IPv4 `127.0.0.0/8` 和 IPv6 `::1/128`。

新增 `test/client-ip.test.mjs`，覆盖禁用代理信任、公网 TCP 对端、可信私网代理、XFF 缺失/无效回退、压缩和展开形式的 IPv4-mapped IPv6、无效对端及 loopback 判定。

## 验证

- TDD RED：实现前运行 `node --test test/client-ip.test.mjs`，测试因待实现的模块不存在而失败。
- TDD GREEN：`node --test test/client-ip.test.mjs`，7/7 通过。
- 全套：`npm test`，68/68 通过，0 失败。
- `git diff --check`：通过。

## 范围与疑虑

仅新增解析器、其定向测试和本报告；未改动网关、代理配置或其他任务文件，也未新增依赖。无待解决疑虑。调用方应将明确的布尔 `true` 传给 `trustProxy` 才会启用代理信任。

## 提交

提交信息：`feat: add validated client IP resolver`

## Fix round 1：展开 mapped IPv6 点分尾部

### 变化

修正 IPv4-mapped IPv6 识别正则，使其同时接受压缩前缀 `::ffff:` 和完整展开前缀 `0:0:0:0:0:ffff:`，尾部为点分 IPv4 的形式。规范化后映射地址成为 IPv4，因此映射到 `127.0.0.1` 时 loopback 判定也走 IPv4 `127.0.0.0/8` 范围。

在 `test/client-ip.test.mjs` 增加完整展开点分尾部的规范化断言，以及完整展开 mapped loopback 判定断言。

### 验证记录

- RED：先添加回归断言，再运行 `node --test test/client-ip.test.mjs`。输出为 `tests 7`、`pass 6`、`fail 1`；`normalizes IPv4-mapped IPv6 addresses` 失败，实际值为 `0:0:0:0:0:ffff:192.0.2.7`，预期为 `192.0.2.7`。
- GREEN：修正后再次运行 `node --test test/client-ip.test.mjs`，输出为 `tests 7`、`pass 7`、`fail 0`。
- `git diff --check`：通过。
