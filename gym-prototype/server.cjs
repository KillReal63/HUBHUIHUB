const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'dist');
http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const files={'/gym/themes.css':['themes.css','text/css; charset=utf-8'],'/gym/themes.js':['themes.js','text/javascript; charset=utf-8'],'/gym/style.css':['style.css','text/css; charset=utf-8'],'/gym/app.js':['app.js','text/javascript; charset=utf-8']};let file=files[url.pathname];if(['/','/gym','/gym/','/gym/program','/gym/program/'].includes(url.pathname))file=['index.html','text/html; charset=utf-8'];if(!file){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-store'});fs.createReadStream(path.join(root,file[0])).pipe(res);}).listen(4182,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4182/gym'));
