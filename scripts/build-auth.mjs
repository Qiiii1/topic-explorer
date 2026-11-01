import {build} from 'esbuild';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),out=new URL('app/vendor/supabase/',root);
await mkdir(out,{recursive:true});
await build({stdin:{contents:"export {AuthClient} from '@supabase/auth-js';",resolveDir:fileURLToPath(root)},bundle:true,format:'esm',platform:'browser',target:['safari16','chrome110','firefox115'],minify:true,legalComments:'eof',outfile:fileURLToPath(new URL('auth.js',out))});
await copyFile(new URL('node_modules/@supabase/auth-js/LICENSE',root),new URL('LICENSE-auth-js',out));
await copyFile(new URL('node_modules/@supabase/auth-js/node_modules/tslib/LICENSE.txt',root),new URL('LICENSE-tslib',out));
await writeFile(new URL('README.md',out),'Official @supabase/auth-js 2.118.0, bundled locally with tslib 2.8.1.\nSource: https://github.com/supabase/supabase-js/tree/master/packages/core/auth-js\nRegenerate: npm run build:auth\n');
