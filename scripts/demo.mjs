#!/usr/bin/env node
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [mode,name,...extra]=process.argv.slice(2);
if(extra.length||!['create','resume','inspect'].includes(mode)||!name){console.error('Usage: node scripts/demo.mjs create|resume|inspect <name>');process.exitCode=1;}
else if(mode==='inspect'){
    try{const {inspectWorkspace}=await import('../services/demo/workspace.mjs');const {directory,manifest}=await inspectWorkspace(name);console.log(JSON.stringify({directory,network:'sandbox',config:manifest.config,accounts:manifest.accounts,artifacts:manifest.artifacts},null,2));}
    catch{console.error('WORKSPACE_INCOMPLETE_OR_INVALID');process.exitCode=1;}
}else{
    const child=fork(fileURLToPath(new URL('../services/demo/runner.mjs',import.meta.url)),[mode,name],{execArgv:[],stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH,HOME:process.env.HOME}});
    let stopping=false;
    const stop=()=>{if(stopping)return;stopping=true;if(child.connected)child.send({type:'stop'});};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('disconnect',stop);
    process.on('message',m=>{if(m?.type==='stop')stop();});
    child.on('message',m=>{
        if(m.type==='ready')console.log(`Sandbox demo: ${m.url}\nRetained workspace: ${m.directory}\nGenerated test keys are stored privately in this ignored workspace. No public wallet or production mode.\nCtrl-C stops services; resume uses the same chain, accounts and journal.`);
        if(m.type==='stopped')console.log('Demo stopped. Retained state is ready for resume.');
        if(m.type==='error'){console.error(m.code);process.exitCode=1;}
        if(process.connected)process.send(m);
    });
    child.on('error',()=>{console.error('DEMO_PROCESS_FAILED');process.exitCode=1;});
    child.on('exit',(code,signal)=>{if(code||signal)process.exitCode=1;if(process.connected)process.disconnect();});
}
