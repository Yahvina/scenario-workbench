// 下载辅助：三个导出面板共用一份，避免各自复制一遍 Blob 逻辑。
// 说明：这里只负责把已经生成好的文本交给浏览器，不生成任何内容，
// 所以不会在这里引入"凭空造数"的风险。
export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(filename, value) {
  downloadText(filename, JSON.stringify(value, null, 2), 'application/json;charset=utf-8');
}
