# 日光小屋 · Sunroom v0.3.1

[在线体验](https://mikechengx.github.io/launch-jelly/sunroom.html?v=0.3.1) · [下载完整版本](https://github.com/mikechengx/launch-jelly/releases/tag/sunroom-v0.3.1)

一个支持精确尺寸、室内装修和空间检查的单文件 3D 新家布置工具。地砖与木地板按实际单块长宽裁切，颜色直接决定表面基色；纯白柜的板面、侧板与脚架统一刷白。支持墙面、门窗、40 种参数家具与居家工具、挂墙收纳、预算、方案保存及多视角 PNG 导出。

地面颜色在「室内装修 → 地面铺装」上方；点击整张「点此改色」卡打开原生选色器，也可直接点击常用色。手机版竖屏上下分区，横屏左侧预览、右侧独立滚动调整。

## 运行

直接打开仓库根目录的 `sunroom.html`，或访问上面的 HTTPS 链接。程序、材质与 HDR 均已内嵌，首次打开也不请求外部资源。优先 WebGPU，不可用时使用 WebGL2，再退回二维平面。

方案仅保存在当前浏览器、当前域名。本地版本与线上版本是独立存储；先下载 JSON 项目，再到新网址导入，即可继续原来的布置。

## 从源码构建

1. 从版本发布页下载 `sunroom-assets.zip`；解压得到的 `sunroom-assets` 目录改名为 `assets`，放在本目录。
2. 同时把原始 ZIP 放在本目录，改名为 `sunroom-cc0-assets.zip`，用于打包下载附件。
3. 在本目录执行 `npm ci`，Python 3 环境需安装 Pillow。
4. 执行 `node build.mjs`，生成仓库 `outputs/` 中的单文件网页和下载包。
5. 执行 `node --test tests/domain-test.mjs tests/floor-config-test.mjs tests/floor-geometry-test.mjs`，完成 74 项规则与几何检查。

`src/catalog.js` 是家具目录，`geometry.js` 生成几何，`floor-config.js` 校验铺装参数，`finishes.js` 定义家具饰面，`domain.js` 处理尺寸与空间分析，`main.js` 实现渲染、存储和导出，`ui.js` 与 CSS 管理交互界面。

## 素材和适用范围

素材包含 28 套 Poly Haven CC0 材质、4 份 HDR；运行版精选贴图及一份 HDR 内嵌于 HTML。来源和许可见 `LICENSES.txt`，JavaScript 依赖许可见 `THIRD_PARTY_LICENSES.txt`。家具、预算和收纳容量为品牌中立的方案示意，购买和安装前请核对实物与现场尺寸。
