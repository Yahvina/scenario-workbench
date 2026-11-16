# 独立CIB本地安装包

源目录为src/standalone-cib。`npm pack --ignore-scripts`生成cib-core-0.1.1.tgz，在其他项目通过 `npm install --offline --ignore-scripts --no-audit --no-fund /path/cib-core-0.1.1.tgz` 安装。支持ESM包名导入runCib/compareCib及cib-core命令。private/UNLICENSED保留，本轮未发布npm registry或决定再许可。

0.1.0缺main/exports，实际本地安装后包名导入失败；0.1.1补入口、bin和shebang。index.mjs与冻结0.1.0逐字节一致，不改变判定或评分。旧交付rc1保留；独立包版本不是应用版本或登记版本。已在含中文及空格的空白Windows项目实际安装tgz，包名导入、生成的命令入口、run/compare调用及四种教学CLI结果通过；未验证其他系统或Node版本矩阵。

大量解时应区分候选数与解释输出成本。全0矩阵中10000解的独立包紧凑JSON为72610144字节；100000候选独立包测试在550MiB工作集/900MiB可用内存保护下主动停止。同步接口没有中途取消，不保证候选数上限内都符合某个内存预算。

平台增量计算入口100000解全部保留，紧凑JSON为6731084字节；与独立包的解释粒度不同，不能作同任务性能排名。实际离线浏览器10000解计数、完整归档10000唯一成员、100条展示保留、12→36显示更多及390px窄屏通过；100000浏览器任务的取消返回failed/count=null/CANCELLED。界面全量运行只验到10000，不能把计算入口100000完成写成浏览器100000完成。

采样为每100毫秒，采样最高工作集不是真实峰值或硬件要求。完整研究报告、资源原记录、真实案例结构审查及原生模型材料留在本地交付中。未改平台算法、界面或契约。
