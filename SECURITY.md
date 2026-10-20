# 安全策略

联机服务器（`server/`）接受来自浏览器的 WebSocket 消息。如果你发现可以让服务器崩溃、绕过押注校验、冒充其他玩家、读取或写入服务器文件等问题，请**不要公开发 issue**，而是通过 GitHub 的 [私下报告漏洞](https://github.com/Cloudnyco/Duel-Channel/security/advisories/new) 告诉我们，附上复现步骤。

我们会尽快确认并修复，修复发布后再公开说明。

只支持 `main` 分支的最新提交。服务器默认只监听本机（`127.0.0.1`）。公网部署必须使用 HTTPS 反向代理，并将网关端口限制为本机或私网可达；不要直接将网关端口暴露到公网。若设置 `TRUST_PROXY=1`，网关只在 TCP 对端为 loopback 或私网地址时采用经过 IP 校验的 `X-Forwarded-For` 最右侧地址。反向代理必须覆盖客户端传入的 `X-Forwarded-For`，写入实际观察到的客户端地址，并屏蔽公网对 `/status` 的访问。公网健康检查使用 `/healthz`；详细状态仅从服务器本机直接查询。部署示例见 [docs/DEPLOY.md](docs/DEPLOY.md)。
