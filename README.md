# 学习通网课

课伴（Keban）是学习通网页端的章节播放与 AI 测验助手。独立 Edge Manifest V3 扩展，使用你自己的 OpenAI 兼容 API，无运行时第三方依赖。

**当前版本：0.1.3-alpha.1，实验性预发布。** 22 项核心/后台测试和 24 项浏览器集成测试通过；已有用户在真实课程中试用并反馈基本可用，尚未覆盖不同学校、课程和全部题型。没有官方平台关联。使用前确认课程与平台允许相应自动操作。

[下载与版本说明](https://github.com/yaobinw096-dotcom/xuexitong-wangke/releases) · [问题反馈](https://github.com/yaobinw096-dotcom/xuexitong-wangke/issues) · [更新记录](CHANGELOG.md)

## 能做什么

- 自动播放 HTML 视频/音频，设置静音与 1–2 倍速，完成本节后点击下一节。
- 读取章节测验，调用自己的 AI，填写单选、多选、判断、填空和简答。
- 可开关自动提交；填写后回读可见选项和隐藏表单值，确认弹窗前再复核。
- 图片/特殊字体题可发送题目区域截图，需要视觉模型及前台课程页。
- 面板提供开始、暂停、答案理由与运行记录。暂停或题目/iframe 变化时丢弃旧答案。

默认启用自动填写和自动提交。已有答案可能被替换；可以关闭自动提交以便先核对。格式与页面回读检查不保证答案内容正确。

## 安装和使用

1. 从 [Releases](https://github.com/yaobinw096-dotcom/xuexitong-wangke/releases) 下载 `keban-edge-0.1.3-alpha.1.zip` 并解压，或者下载源码。打开 Edge 的 `edge://extensions`，开启“开发者模式”。
2. 点击“加载解压缩的扩展”。扩展 ZIP 选择含有 `manifest.json` 的目录；源码仓库选择 `extension/`。
3. 打开“课伴”设置，填写 API 地址、密钥、模型 ID，点击“保存并测试连接”，允许访问指定 API 主机。
4. 暂停同类自动操作扩展，刷新学习通章节页（路径包含 `/mycourse/studentstudy`）。点击工具栏的课伴图标，再点击“开始运行”。

API 地址填写服务商提供的基础地址，如 `https://api.example.com/v1`，也可以填写完整 `/chat/completions` 地址。扩展只会自动补 `/chat/completions`，不会自动补 `/v1`。本机服务支持 `http://localhost:端口/v1` 或 `http://127.0.0.1:端口/v1`，本机无密钥服务可留空密钥。需要非流式 Chat Completions 兼容接口，单次等待上限 25 秒。

图片题第一次使用前要点击工具栏图标取得当前页截图权限，保持课程页在前台。配置更改后暂停并重新开始。更新文件后，打开 `edge://extensions`，找到课伴卡片并点击圆形箭头“重新加载”；然后回到课程标签页刷新。课程浮层右上角的版本号应与扩展管理页一致；只刷新课程页可能仍在使用旧后台。[Edge 官方安装说明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)。

## 适用边界

仅在章节学习页运行；独立考试页、文档、直播、讨论、问卷、连线、分录、阅读理解等复杂任务需要手动完成。名词解释、论述、计算题按单个文本答案处理。常见视频弹题提供实验性支持。

同源 iframe 才能读取，富文本编辑器需要可编辑且能回读。图片题显示不全、编码未知、接口错误、答案格式错误、回读不一致或任务进度未确认时会停下。页面结构变化可能需要修改适配代码；倍速能否保持由播放器决定。

运行状态按标签页及课程保存；同一次浏览器会话刷新同一门课会继续，换课停止，关闭浏览器后需重新开始。暂停无法撤回已经发出的提交或 API 服务已处理的请求。状态说明及已验证范围见 [测试记录](docs/TESTING.md)。

## 常见问题

- **服务工作进程显示“不活动”**：后台空闲时可以休眠，收到消息会被唤醒；这不表示扩展被关闭。
- **更新后仍显示旧提示**：先点击扩展卡片上的“重新加载”，再刷新课程页；浮层版本号应为 `0.1.3-alpha.1`。
- **一个章节结束后停止**：先确认设置中开启“本节完成后切换下一节”。如果仍停止，记录浮层的具体提示，再通过 Issue 反馈。
- **接口测试失败**：核对基础地址、模型 ID、完整密钥及余额；密钥与账户页面不要贴进 Issue。
- **答案不准确**：API 返回格式正确与答案正确是两回事。可关闭自动提交，先人工核对。

## 数据和来源

API 密钥保存在本浏览器的扩展本地存储，不同步云端，没有额外应用层加密。题干、选项及可选截图会发给你配置的 API；费用由该服务商决定。完整截图只在内存中裁剪，不保存文件。没有共享题库、内置密钥或遥测。详见 [隐私说明](PRIVACY.md)。

代码独立编写，参考了公开项目及已安装扩展的行为分析。参考项目许可证、来源与复用边界见 [来源说明](NOTICE.md)。项目采用 [MIT](LICENSE) 许可证；许可证不代表平台或学校授权，也不保证兼容性。

## 开发与验证

需要 Node.js 22+；打包另需 Python 3.10+。扩展本身可直接加载，无需安装 Node 或 Python。

```sh
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
npm run package
```

默认使用 Playwright 自带 Chromium。Linux 可用 `npx playwright install --with-deps chromium` 安装依赖。需要测试已安装的浏览器时，将 `KEBAN_BROWSER_PATH` 环境变量设为其可执行文件完整路径；该浏览器是否允许侧载需按实际版本确认。[Playwright 扩展测试文档](https://playwright.dev/docs/chrome-extensions)。

测试仅使用合成课程与本机模拟 API，不需要真实账户或密钥。产物写入 `artifacts/`，打包文件写入 `dist/`，均被 Git 忽略。GitHub Actions 配置包含检查、测试和打包；首次推送后才能确认远程 CI 结果。

```text
extension/   可直接加载的扩展源码
tests/       核心、后台与浏览器集成测试
scripts/     公开文件检查和可重复打包
docs/        测试记录、发布复核与人工验收项
.github/     CI 与问题反馈模板
```

欢迎在确认未包含个人信息后提交最小复现，见 [贡献指南](CONTRIBUTING.md)。
