# 描述符 → 下游模型输入：实文件核对证据

本文件是平台侧的证据记录。所有路径、文件大小、单位字符串，均由本会话用真实命令列出、打开、读取表头得到。凡未核到的，写 `null` 并列入「本次没有核到的东西」，不做补全。

## 一、本次实际打开了什么

核查根目录：`C:\Users\guiqu\Desktop\下游模型\`

| 路径 | 内容 | 实测 |
| --- | --- | --- |
| `gcam-china-release/exe/` | 情景配置文件 | `configuration*.xml` 共 7 个；`gcam.exe` 3808256 字节；`configuration.xml` 12925 字节 |
| `gcam-china-release/input/gcamdata/xml/` | 编译后模型输入 | 304 个 XML |
| `gcam-china-release/input/gcamdata/inst/extdata/` | 第一层驱动假设数据 | 1112 个 CSV，合计 384221209 字节 |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/` | 中国省级专属数据 | 157 个 CSV |
| `gcam-china-release/input/policy/` | 政策文件 | 55 个文件 |
| `gcam-china-release/input/extra/` | 补充 XML | 5 个文件 |
| `cheer/CHEER-Clean/` | GAMS 演示包 | 39 个文件；`run.gms` 2933 字节；`参数说明.xlsx` 15406 字节 |
| `cheer/CHEER-P-demo/` | 分省演示包 | `parshock.gms` 2541 字节 |

逐条核到字节大小的关键数据文件（相对 `下游模型/`）：

| 文件 | 字节 | 头部单位（原文） |
| --- | --- | --- |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/gdp_mil10usd_province.csv` | 48453 | million 2010 USD |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/population_thous_province.csv` | 47949 | 1000 persons |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/en_balance_Mtce_Yh_province.csv` | 14239556 | Mtce |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/IO_detailed_industry.csv` | 587290 | GJ/kg or GJ/GJ |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/detailed_industry_output.csv` | 445005 | Mt/EJ |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/ABSPI_intra_province_electricity_trade.csv` | 298729 | GWh |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/wind_potential_province.csv` | 1917 | Potential units: EJ; price units: $2007/kWh |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/solar_potential_province.csv` | 2268 | Potential units: EJ; price units: $2007/kWh |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/future_hydro_gen_EJ.csv` | 473 | EJ |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/CCS_provincial_data.csv` | 59698 | CO2-Mt,Cost-2005USD per t CO2 |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/CCS_provincial_data_add.csv` | 669 | C-Mt,Cost-1990USD per t C |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/water_km3_china_ind_Yh.csv` | 539 | km3 |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/electricity_water_coef_CHINA.csv` | 7755362 | m^3/GJ |
| `gcam-china-release/input/gcamdata/inst/extdata/gcam-china/province_names_mappings.csv` | 1965 | NA |
| `gcam-china-release/input/gcamdata/inst/extdata/aglu/A_resbio_curves.csv` | 378 | NA |
| `gcam-china-release/input/gcamdata/inst/extdata/energy/A23.globaltech_capital_adv.csv` | 2300 | 1975$/kW |

单位未被标出的文件：`province_decile_gdp_per_capita_projections.csv`（2937404 字节，Units: NA）、`urban_pop_share_province_Yh.csv`（16342 字节，Units: NA）、`NBS_CESY_material.csv`（927 字节）、`NBS_CESY_process.csv`（1394 字节）、`provinces_subregions.csv`（5862 字节）。

## 二、描述符逐条对照

| 编号 | 描述符 | 类别 | 模型 | 模型字段 / 文件 | 单位 | 置信 |
| --- | --- | --- | --- | --- | --- | --- |
| D01 | 经济增长速度 | input | both | `gcam-china/…/gdp_mil10usd_province.csv`；`IMF_growth_rates.csv` | million 2010 USD | verified-in-file |
| D02 | 产业结构 | parameter | both | `IO_detailed_industry.csv`；`detailed_industry_output.csv` | GJ/kg or GJ/GJ | verified-in-file |
| D03 | 人口空间分布与收缩态势 | input | both | `population_thous_province.csv`；`urban_pop_share_province_Yh.csv` | 1000 persons | verified-in-file |
| D04 | 一次能源结构 | result | both | `en_balance_Mtce_Yh_province.csv` | Mtce | verified-in-file |
| D05 | 区域电力互济强度 | parameter | GCAM-China | `ABSPI_intra_province_electricity_trade.csv`；`province_names_mappings.csv` | GWh | verified-in-file |
| D06 | 本地可再生能源开发规模 | parameter | both | `wind_potential_province.csv`；`solar_potential_province.csv`；`future_hydro_gen_EJ.csv` | EJ；$2007/kWh | verified-in-file |
| D07 | 终端电气化率 | result | both | 无对应文件 | null | documented-only |
| D08 | 钢铁工艺路线 | parameter | both | `input/extra/trade_iron_steel_China_offset.xml` | null | verified-in-file |
| D09 | CCUS 部署规模 | parameter | GCAM-China | `CCS_provincial_data.csv` 等 4 个 | CO2-Mt,Cost-2005USD per t CO2 | verified-in-file |
| D10 | 碳移除规模 | parameter | GCAM-China | `aglu/A_resbio_curves.csv` 等 3 个 | NA | documented-only |
| D11 | 用水总量与结构 | parameter | GCAM-China | `water_km3_china_ind_Yh.csv`；`electricity_water_coef_CHINA.csv` | km3；m^3/GJ | verified-in-file |
| D12 | 京津冀协同机制强度 | input | both | `province_names_mappings.csv`；`provinces_subregions.csv` | NA | verified-in-file |

分类口径：输入型 3 个（D01/D03/D12）、参数型 7 个、结果型 2 个（D04/D07），与源文档一致。
实测佐证：`province_names_mappings.csv` 共 33 个省级条目、6 个电网区；BJ / HE / TJ 三行 `grid.region` 均为 `North China Grid`。`configuration.xml` 的 `ScenarioComponents` 区块实测 115 条 `Value`，SSP1 配置 116 条、SSP2 配置 110 条，两者差异实测 21 个参数项。

## 三、本次没有核到的东西

1. **D07 终端电气化率没有任何对应输入文件。** 在 `gcam-china/` 157 个 CSV 中检索 `electrif`、`elec_share`、`terminal` 均为空。这只能证明该目录下无专用输入文件，不等于模型内部不存在该派生量。
2. **D10 碳移除只到目录级。** 源文档写的是「`extdata/aglu/` 土地利用数据、生物质潜力相关文件」，没有点名文件；`A_resbio_curves.csv` 头部单位即为 `NA`，造林减排成本曲线未在任何打开的文件中核到。
3. **D08 钢铁 BOF/EAF 的成本、效率、份额权重参数无独立文件。** 只核到贸易调整 XML 与投入产出系数文件。
4. **D05 电网间输电能力与输电成本参数无承载文件。** 只核到历史省间交易量。
5. **D06 地热资源潜力文件未找到。** `configuration_china_ssp1.xml` 中确有 `geo_tech_adv.xml` 引用，但该指令文件本身未打开。
6. **D11 分省取水约束或水价参数无承载文件。** 只核到历史取水量与耗电耗水系数。
7. **D09 潜力口径不一致。** `CCS_provincial_data.csv` 用 2005 USD，`CCS_provincial_data_add.csv` 用 1990 USD，两者换算关系未核。
8. **CHEER 无法运行。** GAMS 为商业软件需授权；本机未找到 `gams` 可执行文件，也未找到任何 `.lic` / `gamslice.txt`。CHEER 侧参数只能按源码与 `参数说明.xlsx` 阅读，未经运行验证。
9. **CHEER Python 版本缺失。** 源文档称官网提供 Python 与 GAMS 两版，但 `CHEER-Clean` 包内无 `.py` 文件。
10. **三处计数与源文档不一致。** `CHEER-Clean` 实测 39 个文件（源文档称 47 个）；`gcam-china/` 实测 157 个 CSV（源文档称 160 个）；`configuration.xml` 的 ScenarioComponents 实测 115 条、SSP1/SSP2 差异实测 21 项（源文档称 113 条与 23 项）。差异原因未追。
11. **单位核实范围有限。** 只打开并读取了本报告列出的一批 CSV 头部；未逐个打开全部 1112 个 CSV 的单位行。
12. **`USDA_GDP_MER.csv` 未找到。** 源文档 4.1 节点名的该文件在 `extdata/` 下不存在；只核到 `Maddison_population.csv`、`UN_popTot.csv`、`pwt91.csv`、`SSP_database_2024.csv.gz`。
13. **CHEER-P 侧字段只核到一个。** `parshock.gms` 中有 `tfp0`；`trend.gms` 不存在（实为 `trend.gdx` 等数据文件）。

## 四、这份映射的性质

**这是平台侧的推断映射，逐条对着真实模型文件核过，不是导师确认的参数表。** 分类（输入型 / 参数型 / 结果型）来自源文档作者依模型文档所作的判断，本会话只核了「文件是否存在、单位是否如此」，没有核「状态档位如何换算成模型取值」。未经导师逐条确认前，**不得以「已核对」的表述提交给导师**，也不得据此认为描述符已经可以直接写进模型输入。

机器可读版本见同目录 `mapping-evidence.json`。
