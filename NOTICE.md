# 来源与许可

课伴的 MV3 扩展代码及简易书本图标在本项目中生成、编写。没有将大学搜题酱的发布 bundle、反编译切片、图标、账户数据或后台服务打包进本仓库。项目名称与页面说明不表示任何平台或原插件的关联、授权或认可。

## 行为和结构参考

- [March-OwO/Xuexitong-LLM-Assistant](https://github.com/March-OwO/Xuexitong-LLM-Assistant)：查阅公开题目结构与 DOM 选择器。查阅过的用户脚本 blob SHA 为 `48e1e04f2e7aff321575573cade74c148b8ea793`。原仓库许可证为 MIT，2026-10-24 重新读取确认。该脚本未作为运行时依赖，以下保留原版权与许可文本。
- [Dhfilex/chaoxing-autoplay](https://github.com/Dhfilex/chaoxing-autoplay)：考察过的候选，未复用代码。
- [chaolucky18/xuexitongScript](https://github.com/chaolucky18/xuexitongScript) 与 [sorbte/xuexitong](https://github.com/sorbte/xuexitong)：调试切章时查阅公开页面结构和导航说明，未复制其实现代码。
- 大学搜题酱 1.17.5：对用户已安装版本进行了静态行为分析，参考任务点标记、正常播放、章节导航及确认弹窗。没有声称“洁净室重写”；私有分析快照和反编译文件未公开。
- 扩展 API 依据 [Chrome 内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[可选权限](https://developer.chrome.com/docs/extensions/reference/api/permissions)、[存储](https://developer.chrome.com/docs/extensions/reference/api/storage)及 [Edge 本地加载](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)文档。
- 视频停滞检测查阅 [hls.js 播放停滞文档](https://github.com/video-dev/hls.js/blob/master/docs/API.md)与 [MDN play()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)；仅参考状态检测思路，未复制实现或引入依赖，没有采用其跳过缓冲间隙或移动播放位置的做法。

只查阅这些来源不能构成全面的知识产权检索或法律保证。MIT 许可仅覆盖本项目有权许可的内容，不赋予平台服务、商标或第三方素材的权利。

## 参考项目 MIT 许可原文

来源：[LICENSE](https://github.com/March-OwO/Xuexitong-LLM-Assistant/blob/main/LICENSE)。

```text
MIT License

Copyright (c) 2026 March

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 开发依赖

Playwright / playwright-core 仅供测试，Apache-2.0，精确版本见 `package-lock.json`。安装包不包含这些包或浏览器二进制。源码仓库使用 Node 和 Python 标准库做检查与打包。
