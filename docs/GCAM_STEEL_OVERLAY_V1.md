# 钢铁单项系数覆盖组件 v0.1.0

`scripts/gcam_steel_overlay.py` 是独立 Python 3.10+ 标准库组件。它在调用者提供的 GCAM XML 中定位一个钢铁投入系数，核对文件哈希、原值和单位，生成最小覆盖 XML 与审计 JSON。它不修改平台 Project 契约，也未接入平台页面。

目前仅支持显式 `testOnly: true` 的工程测试。组件不批准研究映射，不计算 CIB 自洽性，不生成行业综合能耗或工艺占比目标，也不自动运行 GCAM。

## 运行

```powershell
python scripts/gcam_steel_overlay.py --request request.json --out-dir new-output
python -m unittest discover -s tests -p test_gcam_steel_overlay.py -v
```

输出目录必须不存在。成功时同时交付 `overlay.xml` 与 `audit.json`；无效请求不留下结果目录，已有目录不覆盖。相对源文件路径按请求 JSON 所在目录解析，输出目录按调用时工作目录解析。双击平台离线 HTML 不需要 Python；该组件是另行运行的模型接口工具。

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
