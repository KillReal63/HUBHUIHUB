// Local UI preview with a synthetic authenticated session. Never deploy this server.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'dist');
http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');if(url.pathname==='/api/session'){res.setHeader('Content-Type','application/json');return res.end('{"authenticated":true}')}
 let name=decodeURIComponent(url.pathname);if(name==='/')name='/hub/index.html';else if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found')}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
}).listen(4176,'127.0.0.1',()=>console.log('Food preview: http://127.0.0.1:4176/food/'));
