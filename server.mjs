import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// 只做静态文件服务：项目没有内置的模型接口，也没有任何服务端密钥。
// 浏览器里的页面会直接调用使用者自己在“API 配置”里填写的接口。
const directory = resolve(dirname(fileURLToPath(import.meta.url)), 'app');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export function createStaticServer(root = directory) {
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    let requested;
    try {
      requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      return res.end('Bad request');
    }
    const file = resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    let data;
    try {
      data = await readFile(file);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('页面不存在');
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf('--port');
  const port = Number(flag >= 0 ? process.argv[flag + 1] : process.env.PORT || 4178);
  const server = createStaticServer();
  server.listen(port, '127.0.0.1', () => {
    console.log('');
    console.log('  有点想法 · 选题与灵感画布');
    console.log(`  服务地址：http://127.0.0.1:${port}`);
    console.log('  请用浏览器打开上面的地址（或用「启动.command」自动打开）。');
    console.log('  首次使用请点右上角「API 配置」，填入自己的模型接口。');
    console.log('  关闭这个窗口（或按 Ctrl+C）即可停止。');
    console.log('');
  });
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.error(`端口 ${port} 已被占用。可以关闭占用它的程序，或用 npm start -- --port 5180 换一个端口。`);
      process.exit(1);
    }
    throw error;
  });
}
