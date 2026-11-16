# cib-core 0.1.1

Node 22+的ESM数值计算包，无运行依赖。0.1.1补齐本地安装入口与CLI，index.mjs计算代码逐字节沿用冻结0.1.0。此组件版本不是整个平台版本或软著登记版本。private/UNLICENSED继续保留；本地安装不等于已发布npm或授予再许可。

在本目录执行 `npm pack --ignore-scripts`，然后在自己的项目执行 `npm install --offline --ignore-scripts --no-audit --no-fund /path/cib-core-0.1.1.tgz`。路径有空格时加引号。不需要复制开发项目或手动设置导入路径。

```js
import { runCib, compareCib } from 'cib-core';
const input = {
  descriptors: [{id:'A',states:['0','1']},{id:'B',states:['0','1']}],
  blocks: [['A','B',[[1,-1],[-1,1]]],['B','A',[[1,-1],[-1,1]]]]
};
const result = runCib(input);
console.log(result.status, result.count); // completed, 2
```

命令行使用安装后生成的 `cib-core request.json`。请求格式是 `{ "action":"solve", "input": {...}, "options": {...} }`；compare另需change。成功（含完整零解）退出0；缺分/超限退出2且count为null；非法输入退出1。接口接受−3至+3整数或null；0表示没关系，null表示未判。mode=conditioned时fixed因素继续向外影响、自身免检，mode=locked仍接受自身判定。至少保留一个待判因素。

候选乘积上限100000。返回每个自洽配置及支持分解释，大量并列解会增加内存与JSON体积；本同步接口无中途取消功能。不要据一次运行推断硬件要求或现实概率。这里仅封装runCib/compareCib，不包含研究剪枝、多期动态、平台项目恢复或GCAM执行。
