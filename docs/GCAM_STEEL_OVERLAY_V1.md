# 钢铁单项系数覆盖组件 v0.1.0

`scripts/gcam_steel_overlay.py` 是独立 Python 3.10+ 标准库组件。它在调用者提供的 GCAM XML 中定位一个钢铁投入系数，核对文件哈希、原值和单位，生成最小覆盖 XML 与审计 JSON。它不修改平台 Project 契约。

平台页面现已提供相同工程范围的浏览器入口：**保存与导出 → 导出、备份与恢复 → 钢铁系数覆盖（工程测试）**。浏览器侧使用本地XML解析与SHA256核对，不需要Python，也不上传文件。选择源文件、目标节点和可选单位证明，明确操作与数值并核对显示原值后，才生成可下载预览。

修改文件、目标或数值立即清除旧预览并禁用下载；迟到的文件读取/哈希结果不会覆盖新输入。离开该页面会清理所选文件和预览，不向项目、方案库或备份写入原始XML。请求JSON仅记录文件名，独立复跑时需与对应XML放在同一目录。

浏览器入口直接从当前所选文件建立版本哈希和显示原值，不等于与一份事先获批的研究基线比对。下载审计仍标明 `testOnly: true`、`researchMappingApproved: false`、`cibConsistencyEvaluated: false`、未执行模型。

现支持[可选CIB关联留档](STEEL_CIB_CASE_V1.md)：显式选择一个冻结完整组合并填写人工参数设定后，XML与核验记录带上来源哈希，关联容器保留完整冻结输入。此时 `cibConsistencyEvaluated: true` 仅表示所选组合已按冻结矩阵与条件复核；参数假设仍未审定，全空间解数、当前项目及完整模型不在此处重算。原参数请求v1不增加字段，独立Python组件保持兼容。

目前仅支持显式 `testOnly: true` 的工程测试。组件不批准研究映射，不计算 CIB 自洽性，不生成行业综合能耗或工艺占比目标，也不自动运行 GCAM。

## 运行

```powershell
python scripts/gcam_steel_overlay.py --request request.json --out-dir new-output
python -m unittest discover -s tests -p test_gcam_steel_overlay.py -v
```

输出目录必须不存在。成功时同时交付 `overlay.xml` 与 `audit.json`；无效请求不留下结果目录，已有目录不覆盖。相对源文件路径按请求 JSON 所在目录解析，输出目录按调用时工作目录解析。双击平台离线 HTML 不需要 Python；该组件是另行运行的模型接口工具。

浏览器生成的请求复用下述v1契约。两端的数值与结构含义一致；数字序列化可能不同，因此审计中的 `overlaySha256` 各自对应实际下载/写入的XML字节，不以跨端XML哈希相同为前提。浏览器验收命令为 `node tests/steel-overlay-browser.cjs`，需要开发环境提供Playwright模块与Chrome。默认由测试程序向浏览器提供本地源码资源，不验证HTTP服务；设置 `APP_URL` 可改验实际本机服务，同时始终验收 `dist/scenario-workbench.html` 离线入口。

## 请求 v1

```json
{
  "format": "gcam-steel-coefficient-overlay",
  "version": 1,
  "testOnly": true,
  "source": {"path": "steel.xml", "sha256": "<该文件的SHA256>"},
  "target": {
    "region": "TEST-REGION", "sector": "iron and steel",
    "subsector": "TEST-PROCESS", "technology": "TEST-TECHNOLOGY",
    "year": 2030, "input": "TEST-ELECTRICITY",
    "expectedBaseline": 2, "unit": "EJ/Mt"
  },
  "commodity": {
    "path": "electricity.xml", "sha256": "<该文件的SHA256>",
    "region": "TEST-REGION", "kind": "supplysector", "name": "TEST-ELECTRICITY"
  },
  "operation": {"kind": "coefficient-decrease-percent", "value": 5}
}
```

示例中的名称和数值仅为合成示意，源 XML 必须真实包含对应节点；占位哈希不能执行。所有列出的字段均必填，未知字段与重复 JSON 键拒绝。

定位层级固定为 `scenario/world/region/supplysector/subsector/stub-technology/period/minicam-energy-input/coefficient`。每一层都必须唯一存在，不插值、不补建缺失目标。钢铁输出单位必须显式为 Mt；商品证明来自匹配市场与投入名的 `supplysector` 或 `unlimited-resource`，输出单位仅接受 EJ 或 Mt，推导为 EJ/Mt 或 Mt/Mt，并与请求单位一致。成本、份额权重、效率字段、带 fillout 属性的系数及混合 coefficient/efficiency 目标均不在本版支持范围。

## 操作含义

以基准系数 c、请求数值 v 表示：

|kind|新系数|输入边界|
|---|---|---|
|set-coefficient|v|有限非负数，0可用|
|coefficient-multiplier|c×v|有限非负数，0可用|
|coefficient-decrease-percent|c×(1−v/100)|0≤v≤100；100明确写0|
|reciprocal-efficiency-increase-percent|c÷(1+v/100)|c>0，v为有限非负数；仅同一投入—产出基准的倒数效率|

空值、字符串数字、布尔值、非有限数和负数拒绝；不自动裁剪输入。原值与 `expectedBaseline` 必须数值相等，不容许隐式改基准。生成前后都核对源文件哈希，期间发生修改则不交付结果。

## 导入边界

覆盖文件必须在修改相同节点的全部基础组件之后加载。工具不检查完整配置、后续覆盖、其他基础文件中的单位或效率重定义，也不保证某份完整模型能够求解。先在单独运行目录核验，不替换原始输入。

`period year` 在这里定位某一技术 vintage，即某年新增技术的参数。同一批技术在后续年份继续运行时仍可能使用改后的系数；“只写一个2030节点”不表示“只有2030年度的总能耗改变”。其他时期新技术的插值、存量寿命、产量、需求与均衡响应另需检验。

系数和效率定义参照 [GCAM 8.2需求输入文档](https://jgcri.github.io/gcam-doc/v8.2/inputs_demand.html)。研究状态、阈值、统计口径与参数值仍需研究者和导师审定，工程成功不能替代这些判断。
