# 公网入口安全加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan task by task. Keep changes in the current approved feature branch and have each task reviewed before proceeding.

**Goal:** 加固通过 HTTPS 反向代理公开访问的自托管实例，确保网关使用经过验证的客户端地址执行限额，并限制详细状态页访问。

**Architecture:** 在 `server/client-ip.mjs` 增加独立地址解析函数；网关的 WebSocket 限额、错误报告限额和 `/status` 访问控制共用该解析结果。部署文档说明本轮支持的受信代理边界。

**Tech Stack:** Node.js 22 ESM、内置 `node:test`、现有 `ws` 测试工具、Markdown 部署文档。

**Spec:** `docs/superpowers/specs/2026-10-20-public-edge-security-design.md`

## 全局约束

- 仅设置 `TRUST_PROXY=1` 时考虑 `X-Forwarded-For`；TCP 对端必须是 loopback 或以下本地/非公网网段：IPv4 `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`127.0.0.0/8`、`169.254.0.0/16`、`100.64.0.0/10`；IPv6 `::1/128`、`fc00::/7`、`fe80::/10`。
- 转发链只取最右侧地址，通过 `node:net` 地址校验；无效或缺失时回退到 TCP 对端，并将 IPv4-mapped IPv6 规范化为 IPv4。
- 反向代理须覆盖入站 `X-Forwarded-For` 并写入实际观察到的客户端地址。
- `/status` 对非 loopback 客户端返回 `404` 和空响应；`/healthz` 的响应字段和状态码保持不变。
- 公网代理地址不自动受信；反向代理自身须阻止公网访问 `/status`。
- 不更改游戏协议、玩法、会话身份、来源域名策略，也不新增依赖。

## Review Focus

1. 公网 TCP 对端即使带伪造转发头也不能指定限额身份；由 `client-ip.test.mjs` 中“公网对端忽略转发头”用例验证。
2. 可信代理的多段链不能采用可伪造的左侧值；由“可信代理采用最右侧合法地址”用例验证。
3. 无效、空白或格式错误的转发值不能变成限额键；由“无效转发地址回退到 TCP 对端”用例验证。
4. WebSocket 和报告限额必须按同一解析结果计数；分别由 `limits.test.mjs` 的同一网络拒绝用例和 `gateway.test.mjs` 的报告频率用例验证。
5. 公网转发身份不能读取 `/status`，且 `/healthz` 保持可用；由 `gateway.test.mjs` 的状态页访问用例验证。

## 实施任务

### 任务 1：新增可单测的客户端地址解析器

**文件：** 新增 `server/client-ip.mjs`、`test/client-ip.test.mjs`。

**步骤：**

1. 先在 `test/client-ip.test.mjs` 写解析器用例：不信任代理时忽略转发头；公网 TCP 对端忽略转发头；可信私网代理采用 XFF 最右侧合法地址；无效或缺失 XFF 回退到 TCP 对端；IPv4-mapped IPv6 规范化；loopback 识别覆盖 `127/8` 与 `::1`。
2. 运行 `node --test test/client-ip.test.mjs`，确认用例因解析器尚未实现而失败。
3. 在 `server/client-ip.mjs` 实现最小导出：`resolveClientIp(req, trustProxy)` 返回规范化 IP 或 `null`，`isLoopbackIp(ip)` 判断 loopback。用 Node 内置 `net.isIP` 校验地址，用 `net.BlockList` 判断上述网段；不解析左侧转发链项目。
4. 再运行 `node --test test/client-ip.test.mjs`，确认全部通过。
5. 执行 `git diff --check` 并提交：`feat: add validated client IP resolver`。

### 任务 2：让网关共用解析结果并收紧 `/status`

**文件：** 修改 `server/gateway.mjs`、`test/gateway.test.mjs`、`test/limits.test.mjs`。

**步骤：**

1. 先补集成用例：启用 `TRUST_PROXY=1` 后，带外部 XFF 的 `/status` 请求得到空 `404`，本机 `/status` 仍返回 JSON，`/healthz` 响应保持现有字段；来自同一最右侧 XFF 地址的 WebSocket 和错误报告请求按同一地址限额，即便链左侧值不同也不能绕过限制。
2. 分别运行新增用例所在测试文件，确认它们在修复前失败。
3. 在 `server/gateway.mjs` 用解析器替换原先未经校验的第一跳逻辑。保留 loopback 不参与 WebSocket 网络限额的现有规则；错误报告限额改用解析出的客户端地址；`/status` 先检查解析地址，仅 loopback 继续生成原状态 JSON，其他地址写入空 `404`。保持 `/healthz` 实现与响应不变。
4. 运行 `node --test test/client-ip.test.mjs test/limits.test.mjs test/gateway.test.mjs`，确认新旧相关用例通过。
5. 执行 `git diff --check` 并提交：`fix: enforce trusted proxy identity at public gateway`。

### 任务 3：更新公网自托管部署说明

**文件：** 修改 `docs/DEPLOY.md`、`SECURITY.md`。

**步骤：**

1. 更新 `TRUST_PROXY`、公网反向代理和状态页说明：代理必须覆盖入站 XFF；当前只信任 loopback/私网代理；网关端口限制为本机/私网可达；代理应屏蔽公网 `/status` 并转发 `/healthz`；详细状态仅从服务器本机查询。
2. 检查部署参数表、限流说明、状态页说明与安全策略没有互相矛盾，也没有继续声称采用 XFF 第一跳。
3. 执行 `git diff --check` 并提交：`docs: clarify public reverse proxy security`。

## 最终验证

在三个任务完成后运行：

```powershell
npm test
npm run lint
git diff --check
git status --short --branch
```

验收要求：新地址解析与网关行为用例通过；完整现有测试和 lint 通过；差异检查无空白错误；工作分支只包含本计划、已批准设计说明及本任务的代码和文档改动。若任何命令失败，先定位并修复本任务导致的问题，再重跑失败命令。
