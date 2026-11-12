import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

// Read-only design preview; wallet actions remain in the existing wallet desk.
const port=Number(process.env.HOMEPAGE_PORT||8795);
const assets=new Map([
    ['/', ['index.html','text/html']], ['/home',['index.html','text/html']], ['/home/',['index.html','text/html']],
    ['/home/style.css',['style.css','text/css']], ['/home/home.mjs',['home.mjs','text/javascript']],
    ['/home/sculpture.png',['sculpture.png','image/png']],
]);
const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
    const asset=assets.get(new URL(req.url,'http://127.0.0.1').pathname);
    if(!asset){res.writeHead(404);res.end('Not found');return;}
    try{
        let body=await readFile(new URL(`./public/home/${asset[0]}`,import.meta.url));
        if(asset[0]==='index.html')body=body.toString().replaceAll('__APP_URL__','http://127.0.0.1:8794/app#trade');
        res.writeHead(200,{'Content-Type':asset[1]});res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(500);res.end('Preview unavailable');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Homepage preview: http://127.0.0.1:${port}`));
