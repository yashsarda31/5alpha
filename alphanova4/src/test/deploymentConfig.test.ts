import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe,expect,it } from 'vitest';

const config=JSON.parse(readFileSync(resolve(process.cwd(),'../vercel.json'),'utf8')) as {builds:Array<{src:string}>;routes:Array<{dest?:string}>};

describe('production replacement config',()=>{
  it('builds and serves AlphaNova4 without changing API routing',()=>{
    expect(config.builds.some((build)=>build.src==='alphanova4/package.json')).toBe(true);
    expect(config.builds.some((build)=>build.src==='web/package.json')).toBe(false);
    expect(config.routes[0]).toMatchObject({dest:'/api/main.py'});
    expect(config.routes.at(-1)?.dest).toBe('/alphanova4/index.html');
  });
});
