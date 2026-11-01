# GitHub Pages 网页 + Cloudflare AI 接口

网页继续使用 `https://qiiii1.github.io/topic-explorer/`，后端使用自己的 `https://topic-explorer-api.<account>.workers.dev`。不需要自有域名。API Key 只在 Cloudflare 的 Secret 中配置，GitHub 仓库和 Pages 构建都不接触这个值。

## 首次部署

1. 在本项目运行 `npm ci`，然后 `npx wrangler login`，登录自己的 Cloudflare 账号。
2. 运行 `npm run cf:deploy`，记下输出的 `https://…workers.dev` 地址。此时尚未配置 Key，生成接口会返回“暂未配置”。
3. 打开 Cloudflare Dashboard → Workers & Pages → `topic-explorer-api` → Settings → Variables and Secrets。添加类型为 **Secret** 的 `TOPIC_AI_API_KEY`，填入模型服务密钥并部署。不要把真实密钥放进仓库、构建变量、前端或聊天记录。也可交互运行 `npx wrangler secret put TOPIC_AI_API_KEY`，通过隐藏输入填写。
4. 在同一页面确认普通变量 `TOPIC_AI_BASE_URL` 和 `TOPIC_AI_MODEL`。默认是 `https://api.deepseek.com`、`deepseek-flash`；以自己服务商的实际模型 ID 为准。Key、地址、模型三项均有效后才能真实生成。
5. GitHub 仓库 Settings → Secrets and variables → Actions → **Variables**，添加 `TOPIC_API_BASE_URL`，值为上面的 Worker 域名，不带 `/api` 路径或任何密钥。
6. 将这版代码合入用于 Pages 的 `main` 后发布，或在当前分支手动运行 `Publish website` 工作流。网页仍然是 GitHub 域名。先确认 Worker 的 `/api/status` 返回 `mode: live`，再切换线上网页。

`TOPIC_WEB_ORIGINS` 是允许网页跨域调用的来源，默认 `https://qiiii1.github.io`。如果需要预览其他来源，使用逗号分隔；来源只包括协议和域名，不包括 `/topic-explorer/` 路径。CORS 不是用户身份验证，也不能阻止脚本直接调用 API。

## 本地验证

`npm run validate` 验证应用与托管接口，包含隔离的 Cloudflare workerd 运行时回归测试，外部模型请求由测试替身接管，不调用真实模型。`npm run cf:check` 只打包、不上传。`npm run cf:dev` 在 4183 端口运行 Worker；可使用被 Git 忽略的 `.dev.vars` 配置本机开发用的密钥和允许来源，不要提交这个文件。

`npm run build:pages` 只将公开的 `TOPIC_API_BASE_URL` 写入网页。地址为空时，网页仍保持托管模式并显示暂未连接，不要求访客输入密钥。原有 `npm start` 本地开发服务仍支持本机配置自己的模型。

GitHub 的 `Verify hosted API` 工作流检查公开状态和跨域预检，不调用模型。手动运行时勾选 `real_generation`，会用“钟”这个公开示例发起一次真实灵感生成，验证服务端密钥和模型协议；日志仅输出成功状态和卡片数量。仓库变量 `TOPIC_API_BASE_URL` 当前指向 `https://topic-explorer-api.topic-explorer-web-prototype.workers.dev`。

## 当前范围

这一步只接通服务端模型调用，支持最新版本的细化、组合、灵感方向、方案和子方案协议。网页不会向访客提供站点密钥的查看、更换或清除入口；服务端不会保存画布内容。当前没有登录系统和每账号 30 次额度，后续需要在 `/api/generate` 前接入账号验证与持久额度记录。取消或网络中断可能无法撤销已经发生的模型计费。

## 官方参考

- [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Wrangler 部署](https://developers.cloudflare.com/workers/wrangler/commands/#deploy)
- [GitHub Actions 配置变量](https://docs.github.com/en/actions/learn-github-actions/variables)
