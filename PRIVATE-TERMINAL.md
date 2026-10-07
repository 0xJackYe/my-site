# 私有终端

线上入口：[个人网站](https://jack-ye-oxjackye.realjackye.chatgpt.site/)。点击左上角打码按钮后输入访问密码。

本仓库包含页面模板、余额回放与盈亏算法、1 BTC 里程碑、服务端密码验证、会话与限流逻辑。实际钱包地址、交易和余额快照封装在 `private/terminal.enc.json` 中，以 AES-256-GCM 加密。解密依赖仅保存在服务端的 `PRIVATE_ACCESS_CONFIG`；浏览器只在会话验证成功后收到 HTML。仓库没有真实密码、明文快照或解密配置。

## 构建与测试

使用 Node.js 22.13 或以上，执行 `npm ci`、`npm run build`。构建使用已加密的页面，不需要真实钱包数据或解密配置。

`node --test tools/bitcoin-balance-core.test.mjs tools/private-access.test.mjs tools/private-page.test.mjs` 可验证计算和访问控制。访问控制测试用 Python 3 标准库 SQLite 运行 SQL；测试密码与线上密码无关。没有本地真实快照时，相应的可选校验会跳过。

## 更新余额页面

在本地被 Git 忽略的 `outputs/` 放置余额和汇率输入文件，执行 `node tools/build-bitcoin-balance.mjs` 生成独立 HTML。将与线上一致的 `PRIVATE_ACCESS_CONFIG` 放进被忽略的 `.dev.vars`，再执行 `node tools/encrypt-private-page.mjs` 更新密文。仅提交更新后的密文和功能源码。

修改访问配置时必须重新加密页面，并同时更新服务端配置和部署；配置不匹配时页面会拒绝加载。不要公开 `.dev.vars`、`outputs/` 或包含这些文件的历史提交。

## 托管

完整网站需要 Cloudflare Worker 和 D1；D1 的声明与迁移在 `.openai/hosting.json` 和 `drizzle/`。生产访问配置由 Sites 管理。

GitHub Pages 只能提供静态文件，不能执行密码验证。Pages 工作流因此只发布跳转页，旧链接会进入上述完整网站，并保留查询参数与页面锚点。仓库内容不作为静态网站整体公开。
