# 邮箱账号部署

前端继续使用 https://qiiii1.github.io/topic-explorer/ ，模型密钥继续保存在现有 Cloudflare Worker。Supabase 负责邮箱密码、验证邮件、找回密码和额度表。画布保存在浏览器；换浏览器登录只恢复账号和次数。

## 1. 创建 Supabase 项目

在 https://supabase.com/dashboard 创建 Free 项目，名称可用 `topic-explorer`。数据库密码自行保存，不提交到仓库或聊天。

Authentication → Sign In / Providers → Email：开启邮箱注册，保持 Confirm email 开启，密码至少 8 位。关闭匿名登录。URL Configuration：

| 配置 | 值 |
| --- | --- |
| Site URL | `https://qiiii1.github.io/topic-explorer/` |
| Redirect URLs | `https://qiiii1.github.io/topic-explorer/` |

测试本地真实登录时单独加精确的本地回跳地址，发布不使用通配符。PKCE 邮件链接需要在发起操作的浏览器打开；跨浏览器完成邮箱验证后可以回到原页面用密码登录。

## 2. 初始化额度表

在 SQL Editor 执行 [202611010001_accounts.sql](../supabase/migrations/202611010001_accounts.sql)。该脚本使用事务，可以再次运行；不会重置现有账号额度。

表开启 RLS，浏览器的 anon/authenticated 角色没有读写权限，也不能调用额度函数。仅 Worker 的服务密钥可调用 `topic_account`、`topic_reserve`、`topic_finish`。新账号首次访问账户接口时初始化 30 次，清理浏览器或重新登录不会重新赠送。

## 3. 配置 Cloudflare

在现有 `topic-explorer-api` → Settings → Variables and Secrets 添加：

| 名称 | 类型 | 来源 |
| --- | --- | --- |
| `SUPABASE_URL` | Variable | Supabase 项目 URL，如 `https://xxxxx.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Variable | Supabase Settings → API Keys 的 publishable key，`sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | **Secret** | 新建专供 Worker 使用的 secret key，`sb_secret_…` |

也支持旧版 anon / service_role 配对；新项目优先使用 publishable / secret。`TOPIC_AI_API_KEY` 保持为 Secret；不要复制到 Supabase、GitHub 前端或聊天里。

仓库的 `keep_vars: true` 保留控制台里添加的变量；密钥不进入构建产物。`/api/auth/config` 只返回 URL 和公开的 publishable key，服务密钥永不返回。

## 4. 配置发送邮件

Supabase Authentication → Email → SMTP Settings 配置发信服务。使用经过验证的发信地址和提供商给出的 SMTP host、port、username、password。发信密钥直接在 Supabase 填写。

Supabase 默认发信仅适合项目团队成员测试；普通用户注册、验证和找回密码需要自定义 SMTP。不要通过关闭邮箱验证绕过发信配置。现有个人域名可以仅用于验证发信身份，网站地址仍然使用 GitHub Pages。

官方说明：[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)、[回跳 URL](https://supabase.com/docs/guides/auth/redirect-urls)、[API keys](https://supabase.com/docs/guides/getting-started/api-keys)。

## 5. 发布顺序与验证

先完成数据库、邮件和 Worker 变量，再运行 `npm run cf:deploy` 发布账号后端。随后将账号分支合入 `main`，等待 Publish website 成功。先发布没有配置的账号后端会阻止生成。

`GET /api/status` 应返回 `authRequired: true` 和 `accountsReady: true`。GitHub Actions 的 Verify hosted API 手动运行时选中 `accounts_ready`，检查公开配置和未登录生成返回 401，不消耗模型额度。

最后在真实浏览器验证：注册 → 收邮件 → 验证 → 登录显示 30 次 → 生成 3 / 6 / 10 张分别扣 1 次 → 退出重登仍保留计数 → 找回密码 → 浏览器项目仍存在。实际邮件和生产数据库必须在平台配置完成后验证，本地测试不代替这一步。

## 管理账号

Supabase Authentication → Users 管理邮箱用户；数据库 Table Editor → `topic_accounts` 查看 `used`、`generation_limit`、`blocked`。将 `blocked` 设为 true 可暂停生成。仅停用 Auth 用户未必能立即撤销已经发出的访问令牌，暂停应同时设置 `blocked`。不要随意删除用户：删除会级联删除次数记录。

`topic_generation_requests` 不保存文本或卡片，只保存账号、随机请求 ID、输入哈希、状态及时间。pending 预占 180 秒，过期自动释放；成功只在数据库事务中扣一次。客户端失败重试沿用同一标识，成功后下一次主动生成使用新标识。

同一 Worker 实例会短暂缓存已完成结果以便网络重试；缓存失效后，重复标识返回 `REQUEST_COMPLETED`，不会再次生成或扣次。此时客户端会提示已完成，下一次主动生成是新的请求。项目结果没有云端恢复功能。

本地 `npm run validate` 执行真实 PostgreSQL（PGlite）迁移与权限/额度测试、API 到数据库的集成测试，以及 Cloudflare workerd 转发验证。PGlite 测试使用单连接队列；生产并发由 PostgreSQL 账号行锁和唯一键保证，发布后仍需用真实项目验证。
