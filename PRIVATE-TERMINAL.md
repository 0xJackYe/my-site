# 私有终端

公开网站已移除左上角的入口按钮，`index.html` 不再加载 `public/assets/private-entry.js`。终端的入口脚本、服务端验证与加密数据仍保留在仓库中，需要时可重新接入。

本仓库包含页面模板、余额回放与盈亏算法、1 BTC 里程碑、服务端密码验证、会话与限流逻辑。实际钱包地址、交易和余额快照封装在 `private/terminal.enc.json` 中，以 AES-256-GCM 加密。解密依赖仅保存在服务端的 `PRIVATE_ACCESS_CONFIG`；浏览器只在会话验证成功后收到 HTML。仓库没有真实密码、明文快照或解密配置。

## 构建与测试

使用 Node.js 22.13 或以上，执行 `npm ci`、`npm run build`。构建使用已加密的页面，不需要真实钱包数据或解密配置。

`node --test tools/bitcoin-balance-core.test.mjs tools/private-access.test.mjs tools/private-page.test.mjs` 可验证计算和访问控制。访问控制测试用 Python 3 标准库 SQLite 运行 SQL；测试密码与线上密码无关。没有本地真实快照时，相应的可选校验会跳过。

## 更新余额页面

在本地被 Git 忽略的 `outputs/` 放置余额和汇率输入文件，执行 `node tools/build-bitcoin-balance.mjs` 生成独立 HTML。将与线上一致的 `PRIVATE_ACCESS_CONFIG` 放进被忽略的 `.dev.vars`，再执行 `node tools/encrypt-private-page.mjs` 更新密文。仅提交更新后的密文和功能源码。

修改访问配置时必须重新加密页面，并同时更新服务端配置和部署；配置不匹配时页面会拒绝加载。不要公开 `.dev.vars`、`outputs/` 或包含这些文件的历史提交。

## 托管

Cloudflare Pages 提供个人网站的静态页面，`functions/private/[action].ts` 把两个受保护接口接到现有 Sites 服务。密码、会话和限流仍由 Sites 的 Worker 与 D1 验证，Pages 不保存密码或解密配置。D1 的声明与迁移在 `.openai/hosting.json` 和 `drizzle/`。生产访问配置由 Sites 管理。

GitHub Pages 只能提供静态文件，不能执行密码验证。公开网站不含终端入口后，GitHub Pages 工作流用 `tools/build-pages-site.mjs` 直接发布 `index.html` 与 `public/` 下的网站资源；仓库源码、加密数据、原始照片和入口脚本都不会被发布。
