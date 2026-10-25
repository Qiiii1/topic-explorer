// 本地 UI 验证专用：不连接外部服务，不接收真实密钥。
import http from 'node:http';
import {demoGenerate} from '../app/demo.js';
const server=http.createServer(async(req,res)=>{
  try{let body='';for await(const part of req)body+=part;const request=JSON.parse(body),content=request.messages.at(-1).content,index=content.indexOf('\n\n'),input=JSON.parse(content.slice(index+2));const result=demoGenerate(input);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));}
  catch{res.writeHead(400);res.end('{}');}
});
server.listen(4179,'127.0.0.1',()=>console.log('仅供本地交互验证的模拟模型：http://127.0.0.1:4179'));
