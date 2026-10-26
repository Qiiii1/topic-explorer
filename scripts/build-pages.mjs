import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function buildPages(output=resolve(root,'dist')){
  await mkdir(output,{recursive:true});
  await cp(resolve(root,'app'),output,{recursive:true});
  const file=resolve(output,'index.html');
  let html=await readFile(file,'utf8');
  html=html.replace('<meta name="theme-color"','<meta name="topic-runtime" content="static">\n  <meta name="theme-color"');
  html=html.replace(/<div id="app">[\s\S]*?<\/div>/,'<div id="app"><p style="padding:40px;font:16px -apple-system,sans-serif">正在载入有点想法…</p></div>');
  await writeFile(file,html);
  await writeFile(resolve(output,'.nojekyll'),'');
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(`GitHub Pages files: ${await buildPages()}`);
}
