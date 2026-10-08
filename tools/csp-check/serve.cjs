const http=require('http'),fs=require('fs'),path=require('path');
const root=process.argv[2]; const v=JSON.parse(fs.readFileSync(process.argv[3]));
const hdr=v.headers[0].headers; const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4','.webp':'image/webp'};
http.createServer((q,r)=>{let p=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(root,'index.html');
for(const h of hdr) if(h.key!=='Strict-Transport-Security') r.setHeader(h.key,h.value);
r.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(r);}).listen(4180,()=>console.log('up'));
