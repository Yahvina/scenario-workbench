# CIB算法规格与实现对照

结构化清单见[13项规格v2](ALGORITHM_CATALOG_V2.json)。这里的“规格”同时包含正式实现、受限实现、研究原型和未实现草案，不表示有13个可调用生产算法。Project契约仍为1.0.0，应用冻结基线仍为09e689a；本轮不修改应用功能或计分规则。

|能力|当前状态|实际模块入口|
|---|---|---|
|矩阵准备与缺分检查|正式实现|solver/engine.mjs：prepareRun、inspectInput；relationships/logic.mjs：buildMatrix|
|二档图形编码|受限实现|relationships/curve.mjs：prepareCurve、validateCurve、confirmCurve|
|精确枚举|正式实现|solver/engine.mjs：solve、createEnumeration|
|给定与锁定|正式实现|prepareRun的conditionedStateIds及项目lockedStateIds；语义分别保留|
|单情景支持分解释|正式实现|solver/engine.mjs：explain|
|单格/联合改分|正式实现|solver/score-sensitivity.mjs：compareScore、compareScores|
|逐格扫描|正式实现|solver/batch-sensitivity.mjs：planSensitivity、scanSensitivity|
|联合方案保存与重算|正式实现|solver/joint-plans.mjs：saveJointPlan、loadJointPlan、compareJointPlans及导入导出|
|安全上界剪枝|独立研究入口|独立CIB包pruned.mjs；未替换平台枚举|
|确定性后继|研究复现|作者R函数及独立研究脚本；traceSuccessor不是平台现有导出|
|随机转移|研究复现|局部Boltzmann研究核对；buildTransition不是平台现有导出|
|阈值触发多期矩阵|未实现草案|advanceWithMatrixSwitch不是平台现有导出|
|下游参数及结果留档|局部工程实现|exports/steel-overlay.mjs、steel-cib-link.mjs、steel-flow-result.mjs；不等于草案translateScenarioToModel已完成|

清单中productionExports给出实际文件和导出函数，tests定位对应测试；input/output/rule仍描述规格要求，研究原型条目不能直接当生产API调用。源码入口检查证明函数存在，测试只覆盖其明确输入，不能代替浏览器使用、实证有效性或方法原创性判断。

## 文献与已有工具的边界

支持分比较和精确枚举采用既有CIB方法；本项目的0=没关系、null=未判、允许并列最大保持不变。[Weimer-Jehle 2006](https://doi.org/10.1016/j.techfore.2005.06.005)

给定项继续影响其他因素、自身免检的语义已有直接先例。ScenarioWizard手册6.8描述强制状态及跳过其自身一致性检查；6.15.5支持两个情景列表及不同矩阵结果的比较。不能把给定免检或集合成员比较单独写成新算法。[官方手册](https://www.cross-impact.org/ressourcen/ScenarioWizardManual_en.pdf)

本轮官方软件页链接文字标5.32，直接下载PDF封面为5.33，故将两者分别记录，不推断安装包实际版本。官方软件页也已提供离线与网页版本。未安装运行该软件；文档未确认的功能不能记为不存在。[官方软件页](https://www.cross-impact.org/english/CIB_e_ScW.htm)

PyCIB作者说明覆盖不确定性、扰动稳健性及多期模拟。本次已实际执行其固定提交b3c3eece6d747819afb8041c3fd5df1ba861e2f0的确定性精确入口：17次选例及两因素有限空间59049次求解与参考集合一致。普通锁定使用AllowedStates；给定免检由明确适配层将指向给定因素的评分中和后再加约束，不称外部原生有同名接口。外部省略评分默认0与本项目null未判分开，适配层拒绝相关缺分。JuCIB/CrossImpactBalances.jl及Prophesy仍仅按文档核查；未作性能排名，也未验证PyCIB全部动态或概率功能。[PyCIB](https://github.com/ag-ross/PyCIB)、[JuCIB](https://github.com/IainDM/CrossImpactBalances)、[Prophesy](https://github.com/nmkearney/prophesy-cib)

CRISPA使用逻辑依赖，本文CIB使用促进/抑制评分，二者不能机械共用同一评分表；争议评分重算和替代矩阵已有明确讨论。[CRISPA原文](https://doi.org/10.1186/s40309-026-00277-9)

## 后续开发门槛

优先真实使用检验、正式研究输入与必要缺陷修复。只有研究主问题需要时才推进动态接口；先明确ruleId、更新/并列规则和评分尺度，再考虑封装。阈值切换须先有完整矩阵与可复跑数值例。模型接入须区分单参数合成工程运行、研究映射审定和完整模型验证。

可能的工作流价值在于冻结输入、争议评分、完整情景成员与参数留档的对应及可复跑性；它仍需与最近工具在相同任务下比较，并由真实参与者证据支持。工程验证本身不确立方法创新。

多描述符与异状态数的新增验证见[CIB独立包范围验证](CIB_PACKAGE_SCOPE_CHECK.md)。360组定种子输入及720次外部执行完整集合匹配，边界与性能解释分别限定。
