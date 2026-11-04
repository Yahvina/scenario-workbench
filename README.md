# 情景研判平台 · Scenario Workbench

用交叉影响平衡（CIB）方法组织政策情景，查看因素之间的影响，并检验情景是否自洽。

## 在线打开工作台

**[点击直接打开情景工作台](https://yahvina.github.io/scenario-workbench/)**

## 离线使用

**[下载离线工作台](https://github.com/Yahvina/scenario-workbench/raw/refs/heads/main/docs/index.html)**

下载后双击 `index.html`，用浏览器打开即可。若链接显示文本，可到 [工作台文件页](docs/index.html) 点击右上角的 **Download raw file**，然后打开下载的文件。离线使用无需安装 Node.js。

当前公开下载版为 **P4 方案与历史版**，对应源码基线 `85ef6d9`。双视角共用数据，可选择描述符、编辑实施路径、填写关系并运行精确 CIB。可显式保存命名方案及检算归档，也可导出备份。历史归档按当时输入查看。

## 仓库导航

| 入口 | 内容 |
| --- | --- |
| [产品说明](PRODUCT.md) | 功能与方法边界 |
| [界面设计](DESIGN.md) | 双视角与视觉规范 |
| [源码](src/) | 模块和数据契约 |
| [测试](tests/) | 回归与浏览器验证 |
| [构建脚本](scripts/) | 本地构建与启动 |

## 从源码运行

使用 Node.js 22 或以上。

```sh
npm test
npm run build
npm start
```

打开 [本地开发入口](http://127.0.0.1:4173)。单文件构建位于 `dist/scenario-workbench.html`。

CIB 检验离散状态组合的自洽性。0 表示没关系，空白表示未判断。公开版本支持有限二档图形编码，精确枚举上限为 100000 个组合。仓库为清理后的源码发布镜像，许可证待选。
