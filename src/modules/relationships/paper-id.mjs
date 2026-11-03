// Identifier normalization only; it does not authenticate a paper or change curve source validation.
export function normalizeDoi(value) {
  if(typeof value!=='string')return null;
  let token=value.trim().replace(/^doi\s*:\s*/i,'');
  if(/^https?:\/\//i.test(token)) {
    try {
      const url=new URL(token);
      if(!['doi.org','dx.doi.org'].includes(url.hostname.toLowerCase())||url.username||url.password||url.port)return null;
      token=decodeURIComponent(url.pathname.slice(1));
      if(token.endsWith('/'))token=token.slice(0,-1);
    } catch {return null;}
  }
  return /^10\.\d{4,9}\/[^\s?#]+$/i.test(token)?token.toLowerCase():null;
}
export function sameDoi(a,b) {
  const left=normalizeDoi(a),right=normalizeDoi(b);
  return left!==null&&right!==null&&left===right;
}
