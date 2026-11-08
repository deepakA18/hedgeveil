// IPC planner with no wallet key, network connection or withdrawal capability.
import {chooseRoll} from './planner.mjs';
process.on('message',({id,input})=>{try{process.send({id,result:chooseRoll(input),pid:process.pid});}catch(error){process.send({id,error:error.message});}});
process.on('disconnect',()=>process.exit(0));
