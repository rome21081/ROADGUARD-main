'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'public');
fs.mkdirSync(output,{recursive:true});
fs.copyFileSync(path.join(root,'index.html'),path.join(output,'index.html'));
fs.cpSync(path.join(root,'Final Project 3rd Year'),path.join(output,'Final Project 3rd Year'),{recursive:true});
console.log('Built ROADGUARD static assets. News API runs separately as a Vercel Function.');
