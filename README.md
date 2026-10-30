# Launch Jelly

A personal task board inside a springy island diorama. Finish your tasks and celebrate with a rocket launch.

**[Open Launch Jelly](https://mikechengx.github.io/launch-jelly/)** · [English](https://mikechengx.github.io/launch-jelly/?lang=en) · [中文](https://mikechengx.github.io/launch-jelly/?lang=zh)

## Use

Open `index.html` directly, or visit the site. No installation, account, external assets or runtime network requests are required. WebGPU is preferred, with WebGL2 and Canvas2D compatibility modes.

- Create tasks, edit labels and dates, track progress, and filter completed work.
- Launch after every task in a nonempty list is complete; optional automatic celebration.
- Local saving, JSON backup/import, undo and recent completed rounds.
- Springy jelly, interactive water, material controls, exploration and a guided presentation.
- Chinese/English interface; language preference is saved separately from task data.
- Phone portrait and landscape layouts.

Your tasks stay in your browser. They are not uploaded or synchronized. Export a backup before clearing browser data or changing browser/device.

## Source

Run `python3 source/build.py` to rebuild `index.html` from the preserved app, explicit translation dictionary, locale runtime and styles. This uses Python standard libraries only.

## Separate projects

This repository now contains Launch Jelly only. [Cyanland](https://github.com/mikechengx/cyanland) and [Sunroom](https://github.com/mikechengx/sunroom) have their own repositories and websites. The old HTML paths redirect to the new sites, retaining query parameters and fragments. Older combined-repository commits and releases remain available in history.

## 中文

**Launch Jelly · 发射果冻**：在果冻海岛上安排任务，完成这一轮清单，让火箭为你庆祝。支持任务标签、截止日期、完成百分比、JSON 备份、归档，以及果冻和海水互动。

右上角可切换中文与 English；界面切换不会翻译或改写你填写的任务。数据保存在当前浏览器，不会自动跨设备同步。

Cyanland 与 Sunroom 已独立发布。本仓库内保留旧链接跳转及历史版本。

## License / 开源许可

Original application code is released under the [MIT License](LICENSE).
Third-party components, if included, retain their own copyright notices and licenses.

原创应用代码采用 [MIT License](LICENSE)；第三方组件保留各自的版权声明与许可。
