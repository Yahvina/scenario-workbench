# Scenario Workbench / 情景研判平台

模块化、离线优先的 CIB（Cross-Impact Balance）情景工作台。

当前公开候选对应本地已集成基线 de5f07b，包含描述符选择、政策实施路径、有向状态对评分和有限二档曲线编码。CIB 求解器仍在修复审查，未包含其开发分支。

需要 Node.js 22 或以上，无第三方运行时依赖。

```sh
npm test
npm run build
npm start
```

默认访问 http://127.0.0.1:4173；离线产物为 dist/scenario-workbench.html。浏览器测试另外需要自行配置 Playwright 与 Chrome，环境变量见相应脚本。

0 表示没关系，null 表示未判断；一致性不等于发生概率或政策绩效。测试与草案不是已核验的真实政策结论。

本发布候选只包含平台源码、测试及产品设计说明；不包含录音、论文全文、内部任务交接与本地 Git 历史。开源许可证将在正式公开前确认。
