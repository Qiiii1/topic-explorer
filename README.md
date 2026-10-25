# 有点想法 · 网页交互原型

[![Checks](https://github.com/Qiiii1/topic-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/Qiiii1/topic-explorer/actions/workflows/ci.yml)

从一个粗想法出发，沿场景、痛点、人群逐步细化；每个节点保留上层关联与理由。基于 Figma 低保真页 `352:2`，采用浅色 Apple 风格界面。

![选题探索画布](https://raw.githubusercontent.com/Qiiii1/topic-explorer/main/reference/v3-cards.png)

## 运行

需要 Node.js 22 或更新版本，推荐使用 `.nvmrc` 指定的 Node 22。项目没有第三方运行依赖。

```sh
git clone https://github.com/Qiiii1/topic-explorer.git
cd topic-explorer
npm ci
npm start
```

已经下载或解压代码时，在项目目录执行即可：

```sh
npm start
```

打开 http://127.0.0.1:4178 。请通过这个地址打开，直接双击 HTML 文件无法运行模型接口和模块。

## 配置真实 AI

点击右上角「连接 AI」，填写兼容 Chat Completions 的服务基础地址、模型名称和 API Key。例如填写服务商提供的 `https://…/v1` 基础地址；请求会发送到 `/chat/completions`。服务需要支持 JSON 输出格式。

通过页面填写的密钥仅保留在本地 Node 服务进程内存，关闭后清除；不会写入项目文件、分享链接或浏览器本地存储。当前配置由本机打开的原型页面共用。首页示例是静态预置内容，后续生成仍需连接真实模型。当前分支、项目背景和上游路径会发送到你配置的模型服务。

也可以使用环境变量，或复制 `.env.example` 为 `.env`，填入服务商提供的模型 ID 和密钥，再运行：

```sh
npm run start:env
```

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `PORT` | 本地网页端口 | `4178` |
| `TOPIC_AI_BASE_URL` | 模型 API 基础地址 | `https://api.deepseek.com` |
| `TOPIC_AI_MODEL` | 模型 ID，按服务商当前模型列表填写 | 空 |
| `TOPIC_AI_API_KEY` | 模型服务密钥 | 空 |

模型和密钥都填入后才会在启动时加载模型配置；留空可在网页中配置。`npm start` 使用系统环境变量，`npm run start:env` 额外读取本机 `.env`。`.env` 已被 Git 忽略，它包含手动保存的本地配置，请自行保管；仓库只提交不含密钥的示例文件。

服务固定监听本机 `127.0.0.1`。临时修改端口可以用 `npm start -- --port 4180`。该原型需要 Node 服务，不能只把 `app/` 放到 GitHub Pages 运行 AI 功能。

## 可以体验

- 新建探索、打开示例、导入 JSON 项目。
- 悬停卡片，在上方展开的场景 / 痛点 / 人群卡片中选择细化维度，数量 3、6、10；支持键盘和触屏，保留取消生成与错误反馈。
- 生成时先显示带扫光动效的占位卡片，完成后在来源周围展开候选；取消或失败会移除占位，保留已有内容。
- 自由拖拽、平移缩放、当前路径与理由、搜索、路径大纲、隐藏或聚焦分支。
- 拖动卡片时邻近卡片会连锁避让，整次位移支持一次撤销；选中方向后，上游链路显示加粗连线、方向箭头与流动提示。
- 底部手动创建独立卡片，通过「指定上层」确定归属。
- 拖动右侧连接点到另一张同类卡片，或在操作面板选择「关联同类卡片」，由 AI 提取交集。没有合理交集时保留原卡片。
- 星标收藏节点和全部上游路径的快照；拉动页面上方中央的绳子展示收藏，卡片随绳子降下，直接悬挂在变暗的画布上；点击收藏卡片会翻转、放大到中央，关闭时返回原位。支持复制与多选导出。
- 撤销与重做；浏览器自动保存；JSON、Markdown、PNG 导出与打印为 PDF。
- 分享链接包含当前项目副本。原型只在本机监听，跨设备接收者需要能够访问同一个服务；也可以交换 JSON 文件。

本版没有登录、云同步、多人实时协作、论文检索或研究创新性判断。生成结果作为待调研假设使用。

## 检查

```sh
npm run validate
```

测试覆盖独立卡片归属、循环防护、双来源路径、收藏快照、分支删除、3/6/10 张候选的环绕布局与局部连锁避让，以及请求转发格式、生成数量、接口配置清除、模型名称校验和密钥隔离。接口检查直接使用 Node 请求流与模拟响应，不监听测试端口、不调用外部模型。

推送到 `main` 或提交 Pull Request 后，[GitHub Actions](https://github.com/Qiiii1/topic-explorer/actions) 会在 Node 22、24 上检查语法、运行测试并检查打包内容，无需配置模型密钥。工作流采用 [GitHub 官方 Node.js 检查方式](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)。

开发时可以运行 `npm run dev`，服务端文件修改后会自动重启；进程内存中的模型配置也会清除。生成可分发的源码包可运行 `npm pack`；打包范围只包含应用、服务、测试、说明、许可证及配置示例，排除本地密钥和参考截图。该命令不发布到 npm。

参考截图及视觉说明在 `reference/`。图标使用 Figma 原稿导出的控件和 [Tabler Icons](https://tabler.io/icons)（MIT）；源文件随原型保留。

## License

MIT © 2026 Qiiii1
