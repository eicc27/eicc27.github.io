# eicc27.github.io

GitHub Pages 个人主页初版。

## 设计调研与升级路线

- 参考站点拆解与页面升级路线：[`SHOPIFY_DESIGN_RESEARCH.md`](./SHOPIFY_DESIGN_RESEARCH.md)
- 当前确定的中长期方向：先把内容结构、媒体展示和交互节奏做好，再逐步接入 `Three.js` 做视觉增强层

## 当前内容

- 一页式首页结构
- 响应式布局，适配桌面端和移动端
- 基础滚动显隐动画
- 预留了关于我、项目、近况、联系方式几个板块
- 当前实现仍然是纯静态站点，后续会逐步升级为带更强作品展示能力的个人主页

## 你接下来最值得改的地方

1. 把首页标题和介绍文案改成你的真实信息。
2. 把三个项目卡片替换成你自己的仓库或作品。
3. 把邮箱按钮改成真实邮箱或其他联系方式。
4. 按照调研文档先重做 Hero 和 Projects，再决定 Three.js 场景的切入点。

## 本地预览

如果要在本地看效果，可以在仓库目录运行：

```powershell
python -m http.server 8000
```

然后打开 `http://localhost:8000`。

## 照片资产同步

`portraits/` 和 `scenery/` 根目录现在放原始照片；前端实际读取的是脚本生成出来的 `display/`、`thumbs/` 和 `photo-data.js`。

原图有增删、重命名之后，运行：

```powershell
python tools/generate_photo_assets.py
```

这个脚本会做三件事：

- 重建 `portraits/display` 和 `portraits/thumbs`
- 重建 `scenery/display` 和 `scenery/thumbs`
- 更新前端读取的 `photo-data.js`

## FITS 星图标注

仓库里新增了独立脚本，可以根据已解算的 FITS WCS 元数据产出两类结果：

- 调试用标注预览图与摘要 JSON
- 网页可直接读取的星图标注数据模块

首次使用如果本机还没有依赖，可以安装：

```powershell
python -m pip install astropy pillow
```

处理 `stars/` 目录下全部 FITS：

```powershell
python tools/annotate_fits_sky.py
```

生成给网页读取的标注数据模块：

```powershell
python tools/generate_astro_overlay_data.py
```

只处理指定文件，并把输出放到自定义目录：

```powershell
python tools/annotate_fits_sky.py stars/DSC02260.fits --output-dir stars/annotated
```

脚本输出内容：

- `*-annotated.png`：分块降采样后的标注预览图
- `*-summary.json`：识别到的恒星、星座、中心坐标与视场范围
- `summary-index.json`：本次批处理的汇总索引
- `stars/astro-annotations.json`：网页标注原始数据
- `stars/astro-annotations.js`：前端直接 `import` 的数据模块
