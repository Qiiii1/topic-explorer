import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function buildPages(output=resolve(root,'dist'),{apiBase=process.env.TOPIC_API_BASE_URL||''}={}){
  let base='';
  if(apiBase){const url=new URL(apiBase);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('TOPIC_API_BASE_URL 必须是 HTTPS 域名，不含路径、凭据或参数。');base=url.origin;}
  await rm(output,{recursive:true,force:true});
  await mkdir(output,{recursive:true});
  await cp(resolve(root,'app'),output,{recursive:true});
  // One release fingerprint covers CSS and the complete module graph.
  // Query the resources themselves, so cached CSS/modules cannot outlive a release.
  const assets=(await readdir(output,{recursive:true})).filter(file=>/\.(?:js|css)$/.test(file)).sort();
  const digest=createHash('sha256');
  for(const asset of assets){digest.update(asset);digest.update(await readFile(resolve(output,asset)));}
  const version=digest.digest('hex').slice(0,12);
  for(const asset of assets.filter(file=>file.endsWith('.js'))){
    const path=resolve(output,asset),source=await readFile(path,'utf8');
    await writeFile(path,source.replace(/(\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])(\.{1,2}\/[^'"]+\.js)\2/g,(_match,prefix,quote,url)=>prefix+quote+url+'?v='+version+quote));
  }
  const file=resolve(output,'index.html');
  let html=await readFile(file,'utf8');
  html=html.replace('<meta name="theme-color"',`<meta name="topic-runtime" content="hosted">\n  <meta name="topic-api-base" content="${base}">\n  <meta name="theme-color"`);
  html=html.replace(/<div id="app">[\s\S]*?<\/div>/,'<div id="app"><p style="padding:40px;font:16px -apple-system,sans-serif">正在载入有点想法…</p></div>');
  html=html.replace(/((?:src|href)=")([^"]+\.(?:css|js))(")/g,(_match,prefix,url,end)=>prefix+url+'?v='+version+end);
  await writeFile(file,html);
  await writeFile(resolve(output,'.nojekyll'),'');
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(`GitHub Pages files: ${await buildPages()}`);
}
