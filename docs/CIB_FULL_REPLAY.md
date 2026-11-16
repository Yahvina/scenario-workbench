# 历史全量重算与平台对照

本轮验证基于固定0.1.0独立包及冻结的平台计算代码，不修改Project契约、评分或生产算法。

## 重算历史研究

`node scripts/replay-cib-studies.mjs historical-core current-core report-directory`

历史目录需包含 `index.mjs`、`tests/reference.mjs`、`examples/oil-price.json`、`paired-policy-results.json`、`sensitivity-results.json`；当前目录需包含固定包的 `index.mjs`。脚本针对原404次油价扰动及8452组条件配对重算，并校验每行摘要。合计161次基线及17308次变体，共17469次求解。

`python scripts/verify-cib-studies.py report-directory`

Python仅用标准库，独立重新生成80张定种子矩阵，枚举合法扰动目录，并核对全部17469次完整解集。本轮全部匹配：油价106次解集改变、其中4次同数异解；条件配对仅S0改变488组、仅S1改变473组、均改变42组、均不变7449组。

历史逐行文件只有摘要，不能宣称与旧完整集合逐成员匹配。本轮是历史摘要与重算一致，以及新完整集合在两个实现间一致；不增加独立现实样本，不赋予发生概率或因果含义。原始研究输入及具体复跑ZIP留在研究交付材料中，不由本文件自动发布。

## 核对平台项目准备与求解

`node scripts/check-cib-platform-parity.mjs platform-repo core-directory requests-file report-directory`

请求文件格式为 `{ "requests": [{ "id": "...", "input": { "descriptors": [], "blocks": [] }, "options": {}, "expectedConfigurations": [] }] }`。此脚本针对前一轮固定360组研究输入，亦含该输入结构的代表项目和边界检查；依赖仓库的tests/solver-browser-fixtures.cjs，不能省略测试夹具目录。不是任意数据格式转换器。

通过validateProject、prepareRun、solve核对72张矩阵形成的360组完整成员。`displayLimit=0`、`keepLimit=100000`保证比较完整保留集合。另选六种状态结构各一项目，经固定离线平台真实文件导入、条件设置、运行和下载核对；六个界面项目通过不等于360次界面验收，真实参与者仍0。

七项平台边界明确保留一处输入覆盖区别：普通锁定下，独立包只需所选来源状态行，平台当前仍要求锁定来源全部行；非选中行缺分时平台阻断。给定免检下两者均可忽略非选中来源行和给定目标入边。完整评分下集合匹配不表示部分评分输入的接受范围相同。未通过补0或修改评分来消除区别；准备阶段阻断不是零解。
