# 非零产出投入传递测试

`scripts/gcam_positive_output_smoke.py` 是独立Python3.10+标准库测试程序，运行本机已有的GCAM8.2与JRE。它生成合成的双地区、单钢铁工艺、两投入模型，检查覆盖系数是否实际传递到正产出下的物理投入。它不加载GCAM-China完整输入、不校准真实产业，也不计算政策效果。

## 运行

```powershell
python scripts/gcam_positive_output_smoke.py --gcam-exe "gcam.exe绝对路径" --java-home "JRE目录" --work-root "英文路径工作目录" --out-dir "新的结果目录"
```

默认全部为合成数值：原能源系数2 EJ/Mt、改后1.9，材料系数3 Mt/Mt；与任何地区真实能耗无关。若使用平台下载的CIB关联留档：

```powershell
python scripts/gcam_positive_output_smoke.py --gcam-exe "gcam.exe绝对路径" --java-home "JRE目录" --work-root "英文路径工作目录" --out-dir "新的结果目录" --case "steel-cib-case.engineering.json" --control-region CONTROL
```

关联模式需要Node22+及同目录的`check-steel-cib-case.mjs`和其源码依赖。程序先冻结输入JSON并用该工具核验，再提取原系数、改后系数和目标节点；**改后运行使用下载XML原字节，包括来源注记**。只是把该节点移入合成测试模型，不会运行留档对应的完整原模型。原始模型XML不在本次重新核验范围内。

当前只支持钢铁、2030新增技术、EJ/Mt单项能源系数，原系数须为正，改后系数须非负；材料名称`synthetic-material`保留给工程夹具。对照地区不得与目标相同。目标字段来自留档；节点名称不作为工作路径。

## 两组受控结构

|组别|固定服务需求|技术寿命|检查目的|
|---|---|---|---|
|replacement|每期1 Mt|5年|2030全产出由受影响批次提供；2035该批次已退出|
|coexistence|2030年前1 Mt，此后2 Mt|20年|2030与2035各有一半产出来自受影响批次|

寿命、需求、GDP1000、人口100、材料系数3、资源价格1等均为工程设定，不是采集或校准的地区数据。只有一个工艺，两个地区市场独立，资源无限且价格固定，无需求弹性或气候反馈。`fixed-final-demand/service`向钢铁市场增加给定需求；输入量定义参考[GCAM8.2需求文档](https://jgcri.github.io/gcam-doc/v8.2/inputs_demand.html)。

每组分别运行基线/改后，再分别读目标/对照地区，共8次原生运行。独立运行目录使用英文路径；结果目录可以为中文。不会覆盖已有结果目录，失败时不会报告passed，会保留失败记录及运行目录。

## 核对内容与推断范围

逐批次检查：物理投入 = 当前投入系数 × 该批次产出。再检查钢铁产出等于固定需求，逐批次投入之和等于市场投入需求；改前/改后总产出、批次产出和材料投入不变，对照地区能源投入不变，只有目标2030批次的系数变化。零产出不能通过这项验证。

在这些受控条件下：

`改后总投入 = 基线总投入 + (改后系数 − 原系数) × 受影响批次产出`

仅当基线各批次系数相同、产出权重不变时，总投入的相对降幅等于系数降幅乘受影响产出占比。合成默认例中，单批次占100%时降5%，占50%时降2.5%；这不是对完整行业模型或实际地区的普遍数值预测。

2035输出只检查指定技术寿命与固定需求下的存续边界；没有另求2035年的CIB结果，不构成跨期自洽或可达性证明。

验证读取debug.xml中的逐批次产出、current-coef、physical-demand及市场需求，不仅检查XML是否能解析。容差考虑原生debug输出的有效位数，采用相对5e-6、绝对1e-10。完整原始输入、日志、debug与汇总保存在新结果目录。`results.json`只有全部核对通过才写status=passed，fullGCAMChina与policyEffectEvaluated始终为false。

运行单元测试：

```powershell
python -m unittest discover -s tests -p "test_gcam_*.py" -v
```

这些测试检查生成器、手算批次汇总、读取器及反例；不冒充原生GCAM运行。真实原生验证需额外提供上述程序和JRE。

## 结果回到平台

新版同时生成`result-bundle.json`：包含精确报告文本及其哈希，关联模式另嵌入原CIB关联留档文本和文件哈希；逐年快照新增固定需求与市场投入需求。打开平台“保存与导出 → 导出、备份与恢复 → 原生投入传递结果（工程测试）”，选择该文件，重算对照摘要并查看、下载HTML。只核对包内一致性，不在浏览器重跑模型或认证原生程序。旧版缺少这些字段的results.json须重新生成，不能直接作为该结果包导入。

独立核验：`node scripts/check-steel-flow-result.mjs result-bundle.json`。格式、容差与边界见[结果包约定](STEEL_FLOW_RESULT_V1.md)。
