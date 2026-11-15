# 统一交付候选与文件核验 v1

[统一操作说明](USER_MANUAL.html)作为当前操作口径，涵盖完整检验、给定/锁定、稳健性、三类独立备份以及模型工程接口。旧手册与旧验收保留其历史版本，不把旧失败状态或旧步骤直接移入当前说明。

交付候选用于固定一组可检查的文件，不等于正式登记版本或真实试用通过。当前应用包标识0.2.0、独立CIB计算包0.1.0；具体候选另用ID和哈希区分。真实试用、研究映射审定及软著权属不得由文件核验自动认定。

## 候选内容

- 离线平台、统一HTML手册和版本/限制说明。
- 独立算法代码、必需测试和测试数据；若裁剪研究脚本，明确裁剪范围，保持计算代码可追溯。
- 同一合成矩阵对应的平台项目、独立包请求及完整成员期望。两种格式显式转换，项目不是CLI请求，归档也不等于项目备份。
- 真实试用任务与空白记录工具；自动演练和真实参与者结果分开记录。
- 可选工程工具与明确标为合成的结果，保留未经审定的参数假设边界。
- 对应应用源码快照、逐文件版本清单和独立核验工具。

应用源码快照应核对冻结提交。Git可能规范化换行，使直接git archive后的构建与原离线文件只有换行差异；要承诺精确字节复现，应保留实际构建输入换行、记录与Git内容按LF归一后的对应关系，并在独立解压目录重建后比较SHA256。不能只比较行数便声称完全相同。

## release-manifest.json

独立于Project1.0.0，format=`scenario-workbench.delivery-candidate`、version=1。必需字段为candidateId、status=`technical-candidate`、applicationVersion、applicationSourceCommit、applicationSha256、coreVersion、coreEntrySha256、realUserTrialCompleted=false、researchMappingApproved=false及files。

files每项严格为`{path,bytes,sha256}`，列出清单自身以外的所有普通文件。平台固定路径“平台.html”和独立内核“cib-core/index.mjs”的哈希还须与顶层版本记录一致。清单最多1 MiB，条目最多4095，单文件最多64 MiB；拒绝重复、自引用、绝对路径、回退路径、Windows反斜线/盘符和符号链接，拒绝目录中清单外文件。

在交付根目录运行：

```powershell
node 核验工具/check-delivery.mjs .
```

源码目录中的对应命令是`node scripts/check-delivery.mjs 交付目录`。需要Node22以上，不安装第三方依赖、不写入候选目录；通过退出0，失败退出1。核验的是内容与清单的一致性，不认证发布者身份或研究有效性，哈希不是数字签名。核验日志、试用记录及用户导出的备份应保存在候选目录外。

首次封包后，记录ZIP及清单本身的SHA256在包外；不要把ZIP自身或其外部核验记录写入清单，避免循环。后续更改候选内容需建立新候选与新验收记录，保留旧候选用于对照。只有真实参与者试用、问题处理和项目审定完成后，才推进正式交付或登记冻结。
