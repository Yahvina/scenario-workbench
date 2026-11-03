# 首轮冻结契约 1.0.0

冻结日期2026-11-02。范围：首轮描述符、时间路径、关系判断、求解输入/结果边界。运行时基础验证见src/core/contracts.mjs，尚未实现的算法边界不得伪装成可调用服务。

## 版本与公共记录

Project.schemaVersion=1，contractVersion="1.0.0"，revision是当前项目科学输入的本地修订号。保存格式改变要迁移；拒绝未知契约版本。每条data记录都有id:string、version:正整数、provenance:{origin:"fixture"|"user"|"import"|"ai",sourceId?,locator?}。

所有引用是ID数组，不能用中文名关联。provenance说明由谁写入；evidenceRefs说明依据，两者不可替代。基础验证覆盖ID、引用、分类无环和关键值；不是政策证据有效性认证。

## 项目与共享接口（已实现）

Project={schemaVersion,contractVersion,id,title,revision,view:{perspective:"public"|"expert",module,objectId:null|string},scope:{regionId:null|string,years:int[]},data,selection}。

scope.years是1900—2300的不重复整数；UI按升序保存。空数组合法，表示尚未指定。当前范围不满足运行要求时未来求解器返回缺口，不伪造年份。

data包含policies/taxonomy/descriptors/states/paths/judgments/evidence/mappings八个数组。

selection={nodeIds:分类节点ID[],descriptorIds:实际计算变量ID[],stateIds:用户关注的状态ID[],lockedStateIds:约束固定的状态ID[]}。stateIds不隐含锁定；lockedStateIds每变量最多一个。父子分类如何解析为变量由elements负责，store不代替其解析。descriptorIds必须由明确映射得到，不能把展开或搜索当作选择。

store.read返回副本；subscribe(project=>...)返回取消订阅函数。snapshot返回{schemaVersion,contractVersion,projectId,revision,scope,data,selection}；不包括UI状态和项目名称。isCurrent同时比较项目ID、修订号和输入内容，不是加密哈希或长期审计签名。

actions均返回{ok:true,projectId,revision,scientificChanged}或{ok:false,error:{code,message,recordIds,recoveryAction}}。失败不写入半份数据。

- updateProjectDetails({title,scope})：标题与范围原子保存。
- updateScope(scope)。
- selectElements({nodeIds?,descriptorIds?,stateIds?,lockedStateIds?})：补丁；elements要一次提交一致的分类/变量映射。
- replaceProject(Project)：原子验证/载入。跨表改动优先构造完整副本后使用该接口；单集合更新也必须保持引用有效。
- saveCollection({key,records})：完整替换一个集合，适合单集合内编辑。
- editPathPoint({pathId,pointIndex,point})：替换完整节点，增加路径版本。
- saveJudgment(Judgment)：按ID新增/替换。

只有scope/data/selection实际改变才递增revision。view/title不改变科学revision。基础store按全局revision保守失效，暂不实现分模块依赖图失效。

## 描述符模块（首轮必须遵守）

TaxonomyNode={id,label,kind:"category",parentIds:ID[],childIds:ID[],descriptorIds:ID[],evidenceRefs:ID[],version,provenance}。双向父子引用一致，无环；支持DAG，不限制固定深度。

descriptorIds仅表示该节点已有的直接、明确计算变量映射。没有映射的粗节点可以选择并标记“待配置”，不自动把后代变量塞进计算，也不伪造平均分。首轮不实现粗粒度聚合模型；希望纳入所有后代，提供独立的显式“选择后代变量”操作和预览，不能默默发生。

Descriptor={id,label,role:"input"|"outcome"|"context",stateIds:ID[],evidenceRefs:ID[],version,provenance}。role是描述角色，不代表已完成下游模型映射。

StateDefinition={id,descriptorId,label,range:null|{min:null|number,max:null|number,minInclusive:boolean,maxInclusive:boolean},unit:null|string,validYears:int[],scope:{regionId:null|string},evidenceRefs:ID[],version,provenance}。validYears空表示未声明，不等于永久有效；定性状态range=null，不强行排序。

## 时间路径

PolicyPath={id,descriptorId,unit:null|string,scope:{regionId:null|string},points:[{year:int,value:null|number,stateId:null|ID,origin:"source"|"user-assumption"|"interpolated",evidenceRefs:ID[]}],interpolation:"none"|"linear"|"step",evidenceRefs:ID[],version,provenance}。

节点年份严格递增且唯一。stateId只能引用同一描述符的状态。none不自动填中间年；数值插值不自动推断定性状态或状态区间。用户拖动原文锚点应创建用户假设并保留原始出处，不能继续标source。本轮不实现滞后/跨期可达模型。

## 影响判断与评分矩阵

Judgment={id,sourceDescriptorId,targetDescriptorId,scope,validYears,directness,curveEncoding:null|object,entries:[{sourceStateId,targetStateId,score:null|integer(-3..3)}],alternatives:[],rationale:string,evidenceRefs:ID[],reviewStatus:"draft"|"reviewed"|"disputed",version,provenance}。

方向和强度证据未来可加directionEvidenceRefs、strengthEvidenceRefs；未提供时不得用共用evidenceRefs冒充两者均已核实。entries可保存不完整草案，但求解前须检查完整覆盖。0是没关系，null/缺行是未判；不适用不填0。当前基础验证不验证年份适用性/矩阵完整性，由矩阵准备与求解模块分别验证并报告。

MatrixSnapshot={version,descriptorIds,stateIdsByDescriptor,year,entries:[{sourceStateId,targetStateId,score,judgmentId}],coverage:{required,judged,missingPairs},evidenceRefs}。这是J1已实现的纯数据输出，由relationships/logic.mjs的buildMatrix准备。不得跨年份偷用不适用判断。

## 求解边界（冻结形状，S1已实现精确枚举）

RunInput={schemaVersion:1,contractVersion,projectId,revision,scope,year,activeDescriptorIds,stateDefinitions,matrix:MatrixSnapshot,lockedStateIds,method:"cib",engineVersion,solverConfig:{mode:"enumerate"|"sample",limit:null|int},seed:null|int}。传完整冻结副本，求解器不能读DOM或store当前值；契约验收要用独立手算例。

RunResult={id,inputSnapshot:RunInput,status:"completed"|"blocked"|"failed",space,checked,count,coverage,scenarios,truncated,sampled,balanceTrace,diagnostics,createdAt}。count是真实计数，不是截断列表长度；若采样，只报告已检查样本内发现数，不能冒充全空间计数。blocked时count=null，不能显示0个自洽。balanceTrace含逐变量各候选状态总影响及比较；方法公式与程序对应。

S1已按此边界生成RunInput/RunResult；基础快照仍只是ProjectInputSnapshot。未检验配置可保存；缺矩阵不能计算不影响保留方案。

S1实现细化：space={unconstrained:string,constrained:string,limit:number}使用十进制字符串保留精确空间；scenarios为descriptorId→stateId配置对象数组。仅enumerate，seed=null，sampled=false；取消为failed/CANCELLED/count=null。无合法输入的前置阻断仅导出私有封套RunInput=null/RunResult=null。会话结果与归档封套不写入Project，不改变1.0.0字段。外壳只读桥接readRunSummary(store)与subscribeRunSummary(listener)限应用集成使用，不是新增Project接口；更改仅触发摘要刷新，不修改科学输入。

## 模块挂载

src/modules/<id>/index.mjs导出mount(container,context)。可返回dispose函数，或{dispose,canLeave}。canLeave是同步boolean；有未保存输入可阻止导航/视角切换。离开时调用dispose，不能留下重复订阅或窗口监听。

context={store,actions,navigate(moduleId),notify(text),refresh(),contractVersion,persistenceState():{ok,error}}；workspace另有loadDemo/exportProject/captureSnapshot。模块只使用前一组公共接口，不读取workspace私有方法。store订阅不会自动重挂载模块；模块自己局部更新并清理订阅。切换视角会重新挂载，因此未提交输入要通过canLeave保护。浏览器保存失败不等于当前页面数据提交失败，使用persistenceState区分；框架提供常驻提示和离开提醒。

新增模块样式限定模块根类，例如.elements-module。不得修改body或通用h2。零外部依赖；构建器目前支持相对路径ESM命名导入与具名function/const/class导出，不支持动态import/default/export*，需要时提交构建变更提案。

## 来源与导出

Evidence={id,kind:"policy"|"paper"|"historical-data"|"expert"|"user-assumption"|"fixture",sourceId,locator,excerpt,reviewStatus,scope?,version,provenance}。

JSON备份保留项目原始状态与来源，本轮没有生成模型配置文件。未来导出文件必须携带范围、年份、数据/方法版本与结果状态，只有经过真实映射与导入验证才能标直接运行。

## 修改协议

1.0.0冻结后模块窗口只提案不改此文档或core。总控核对受影响模块、迁移和测试，再更新版本。初始草案中的尚未实现动作不属于已可调用API。
