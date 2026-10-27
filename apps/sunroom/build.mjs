/** Build a portable HTML file with no runtime network dependencies. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { zipSync, strToU8 } from 'fflate';
import { CATALOG } from './src/catalog.js';
import { BOARD_FINISHES } from './src/finishes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(HERE, '../../outputs');
const DOCS = path.join(OUTPUT, 'sunroom');
const SOURCE = path.join(HERE, 'assets');
const OPTIMIZED = path.join(HERE, 'assets-web');
const VERSION = 'Sunroom 0.3.1';
const digest = value => createHash('sha256').update(value).digest('hex');
const dataURL = async (filename, mime = 'image/jpeg') => `data:${mime};base64,${(await fs.readFile(filename)).toString('base64')}`;
const scriptSafe = text => text.replace(/<\/script/gi, '<\\/script');
const jsonSafe = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

await fs.mkdir(OUTPUT, { recursive: true });
await fs.mkdir(DOCS, { recursive: true });
const optimizerSummary = execFileSync('python3', [path.join(HERE, 'prepare-web-assets.py')], { encoding: 'utf8' }).trim();
console.log(optimizerSummary);
const [manifest, optimized] = await Promise.all([
  fs.readFile(path.join(SOURCE, 'manifest.json'), 'utf8').then(JSON.parse),
  fs.readFile(path.join(OPTIMIZED, 'manifest.json'), 'utf8').then(JSON.parse),
]);
const embedded = {
  name: manifest.name, version: manifest.version, license: manifest.license,
  sources: manifest.sources, integrationNotes: manifest.integrationNotes,
  materials: [], environments: [],
  delivery: { embeddedTextureMaxDimension: 512, roughnessMapsEmbedded: false,
    normalMapsEmbedded: true, lightingHDRsEmbedded: ['studio_small_08'],
    assetPackFilename: 'sunroom-assets.zip', noRuntimeNetworkRequired: true },
};
for (const source of manifest.materials) {
  const prepared = optimized.materials.find(v => v.id === source.id);
  if (!prepared?.maps.baseColor) throw new Error(`No optimized base colour: ${source.id}`);
  const material = { ...source, embeddedMaps: ['baseColor'], optimizedResolution: prepared.maps.baseColor.resolution,
    baseColorData: await dataURL(path.join(OPTIMIZED, prepared.maps.baseColor.path)) };
  if (prepared.maps.normal) {
    material.normalData = await dataURL(path.join(OPTIMIZED, prepared.maps.normal.path));
    material.embeddedMaps.push('normal');
  }
  embedded.materials.push(material);
}
for (const source of manifest.environments || []) {
  const environment = { ...source, embedded: false };
  if (source.id === 'studio_small_08') {
    environment.dataURI = await dataURL(path.join(SOURCE, source.path), 'image/vnd.radiance');
    environment.embedded = true;
  }
  embedded.environments.push(environment);
}

const result = await build({
  stdin: { contents: "import './src/main.js';\nimport './src/ui.js';", resolveDir: HERE, sourcefile: 'sunroom-entry.js', loader: 'js' },
  bundle: true, write: false, format: 'iife', platform: 'browser', target: ['es2022'],
  minify: true, legalComments: 'eof', metafile: true, sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
});
const js = result.outputFiles[0].text;
const [body, baseCSS, landscapeCSS, assetLicense] = await Promise.all([
  fs.readFile(path.join(HERE, 'src/ui.html'), 'utf8'),
  fs.readFile(path.join(HERE, 'src/ui.css'), 'utf8'),
  fs.readFile(path.join(HERE, 'src/landscape.css'), 'utf8'),
  fs.readFile(path.join(SOURCE, 'LICENSES.txt'), 'utf8'),
]);
const css = baseCSS + '\n' + landscapeCSS;
if (/<\/style/i.test(css)) throw new Error('CSS contains an unsafe closing style tag');
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#eeeee6">
<meta name="application-version" content="${VERSION}">
<meta name="sunroom-version" content="0.3.1">
<meta name="description" content="先量好房子，再安放生活。日光小屋：可量尺寸的 2D / 3D 租房与新家布置工具，离线编辑、空间分析、多视角导出。">
<title>Sunroom 日光小屋 · 让家，刚刚好</title>
<style>${css}</style>
</head>
<body>
${body}
<script>window.SUNROOM_ASSETS=${jsonSafe(embedded)};<\/script>
<script>${scriptSafe(js)}<\/script>
</body>
</html>
`;
if (/<(?:script|img|link)[^>]+(?:src|href)\s*=\s*["']https?:\/\//i.test(html)) throw new Error('Build contains a remote automatic resource');
let htmlBytes = Buffer.from(html);

const readme = `# 日光小屋 · Sunroom 0.3.1

打开 index.html（或独立的 sunroom.html）即可使用。程序、28 套精选材质的底色与法线贴图、柔光摄影棚 HDR 均已嵌入；首次打开也不需要网络。优先 WebGPU，设备不支持时尝试 WebGL2，再降级为可编辑二维平面。部分移动系统文件预览器不会运行网页脚本，需用浏览器打开；HTTPS 或本机 localhost 可提供完整的浏览器能力。

## 使用

1. 在「房屋硬件」中填写室内尺寸、墙高，添加门窗和窗台；可在平面模式拖动墙角调整轮廓。
2. 从 ${CATALOG.length} 种参数化家具与居家工具中选取模型，调整外形尺寸、颜色、材质和位置。柜体使用木纹饰面板、双饰面板或烤漆板，${BOARD_FINISHES.length} 种柜板饰面与 28 色配色可自由组合；毫米是数据单位，界面主要显示厘米。
3. 在「空间检查」中查看占地、通道、收纳估算、重叠与开启空间；查看实用规格建议和示意预算。
4. 保存不同方案，导出可继续编辑的 JSON 项目或俯视、立体、正面、侧面、人眼视图图片。

数据保存在当前浏览器本机，不会自动上传。请定期下载项目 JSON；清除浏览器数据会影响自动保存的内容。手机竖屏上方保留画布，下方切换工具；横屏左侧看房间、右侧独立滚动调整，工具面板可收起。地面颜色入口位于单块尺寸之前，整张「点此改色」卡可打开原生选色器，常用颜色直接点击生效。输入尺寸后再点规格按钮可连续操作。

## 装修与挂墙收纳

在「室内装修」中选择地砖或木地板，设置每块宽长、通铺/错缝/人字拼、哑光/柔光/亮光、接缝宽度和颜色。地面使用所选的直接基色，白色就是白色，不再叠加棕色纹理；木纹仅作为细微凹凸。地砖和地板都按输入的毫米尺寸真实裁切，平面图与立体图使用同一份铺贴轮廓。墙面质感、墙色和踢脚线也可独立修改。柜子选择纯白烤漆时，板面、柜体和脚架统一刷白，独立的金属把手保留；旧项目白色饰面也会迁移为纯白。

洞洞板、悬浮层板、壁柜、挂钩排、玄关钥匙架、壁挂收纳轨、免打孔置物架、毛巾杆、走线托盘支持选择墙面、沿墙位置和底部离地高度。立体和平面图中都能拖动，并保持贴墙；高处挂件不增加地面占地，空间检查考虑安装高度、门窗相交与物件重叠。免打孔为方案类别，实际承重与固定方式需核对墙面和商品规格。

移动推车、窄缝推车、洗衣篮可帮助布置小空间；建议区提供可一键试放的通用规格，均为品牌中立的参数模型。多视角导出清单包含安装高度、墙面和饰面名称。

## 材质与来源

28 套原始 1K CC0 材质与 4 个 HDR 探针另见 sunroom-assets.zip；原始来源、作者、物理覆盖尺寸、文件哈希见 manifest.json 与 LICENSES.txt。独立 HTML 使用最大边 512 的 JPEG 底色和 OpenGL 法线图，法线缩放后重新归一化并采用低色度损失编码。原始 roughness 文件保留在素材包中，预览版使用清单中的标量粗糙度。四个 HDR 中仅柔光摄影棚嵌入运行文件，其余三份保留在完整素材包，未用于首版自动照明。

素材为 Poly Haven 提供的 CC0 资源；Third-party JavaScript 许可证见 THIRD_PARTY_LICENSES.txt。CC0 授权针对素材，不自动授予本应用代码同样的许可。应用不代表素材提供方背书。

## 模拟边界

家具为通用参数模板，不代表具体在售品牌。自带价格为示意预算，非真实报价；收纳容量按模板比例估算。光影为太阳方向与室内几何的示意，未包含周边建筑，不能作为照度计算、施工图或结构改造依据。转角家具等按外包络保守估算使用空间；购买前请复核现场净尺寸、门洞和运输条件。
`;
const licenses = ['SUNROOM — BUNDLED JAVASCRIPT THIRD-PARTY LICENSES\n'];
for (const [name, license] of [
  ['three', 'LICENSE'], ['fflate', 'LICENSE'], ['polygon-clipping', 'LICENSE.md'], ['robust-predicates', 'LICENSE'], ['esbuild (build tool)', 'LICENSE.md'],
]) {
  const packageName = name.split(' ')[0];
  try {
    const text = await fs.readFile(path.join(HERE, 'node_modules', packageName, license), 'utf8');
    licenses.push(`\n${'='.repeat(72)}\n${name}\n${'='.repeat(72)}\n${text}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
// splaytree is MIT; the installed package ships its attribution in source headers.
for (const candidate of ['LICENSE', 'LICENSE.md', 'Readme.md', 'README.md']) {
  try {
    const text = await fs.readFile(path.join(HERE, 'node_modules/splaytree', candidate), 'utf8');
    if (/license/i.test(text)) { licenses.push(`\n${'='.repeat(72)}\nsplaytree\n${'='.repeat(72)}\n${text}`); break; }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const jsLicense = licenses.join('\n');
// The one-file download carries complete permission notices even when separated
// from its companion ZIP / README. Template contents are inert and escaped.
const escapedNotices = (jsLicense + '\n\n' + assetLicense).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const closingBody = html.lastIndexOf('</body>');
htmlBytes = Buffer.from(html.slice(0, closingBody) + `<template id="sunroom-license-notices">${escapedNotices}</template>\n` + html.slice(closingBody));
await Promise.all([
  fs.writeFile(path.join(OUTPUT, 'sunroom.html'), htmlBytes),
  fs.writeFile(path.join(DOCS, 'README.md'), readme),
  fs.copyFile(path.join(SOURCE, 'manifest.json'), path.join(DOCS, 'manifest.json')),
  fs.copyFile(path.join(OPTIMIZED, 'manifest.json'), path.join(DOCS, 'optimized-manifest.json')),
  fs.writeFile(path.join(DOCS, 'LICENSES.txt'), assetLicense),
  fs.writeFile(path.join(DOCS, 'THIRD_PARTY_LICENSES.txt'), jsLicense),
  fs.copyFile(path.join(HERE, 'sunroom-cc0-assets.zip'), path.join(OUTPUT, 'sunroom-assets.zip')),
  fs.writeFile(path.join(HERE, 'bundle-metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n'),
]);
const zip = zipSync({
  'index.html': htmlBytes,
  'README.md': strToU8(readme),
  'LICENSES.txt': strToU8(assetLicense),
  'THIRD_PARTY_LICENSES.txt': strToU8(jsLicense),
  'manifest.json': strToU8(JSON.stringify(manifest, null, 2) + '\n'),
}, { level: 6 });
await fs.writeFile(path.join(OUTPUT, 'sunroom-preview.zip'), zip);
const report = {
  version: VERSION, builtAt: new Date().toISOString(), file: 'outputs/sunroom.html',
  htmlBytes: htmlBytes.length, htmlSha256: digest(htmlBytes), bundleBytes: Buffer.byteLength(js),
  embeddedTextureBytes: optimized.totalBytes, materialCount: embedded.materials.length,
  embeddedNormals: embedded.materials.filter(m => m.normalData).length,
  furnitureCount: CATALOG.length, wallMountedCount: CATALOG.filter(m => m.mount === 'wall').length,
  cabinetFinishCount: BOARD_FINISHES.length,
  embeddedHDRs: embedded.environments.filter(e => e.embedded).map(e => e.id),
  originalAssetBytes: manifest.totalAssetBytes, zipBytes: zip.length,
  sourceFiles: Object.keys(result.metafile.inputs).length, noRuntimeNetworkRequired: true,
};
await fs.writeFile(path.join(HERE, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
