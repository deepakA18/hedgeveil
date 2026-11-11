import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeActions,matchActions} from '../../services/testnet/transactions.mjs';
test('binary artifact actions bind exact bytes and preserve existing JSON path',()=>{
 const args=Buffer.from([0,255,1,0,4]),e={type:'FunctionCall',method:'__fastdata_fastfs',args_base64:args.toString('base64'),gas:'1000000000',deposit:'0'};
 const actual=[{FunctionCall:{method_name:e.method,args:e.args_base64,gas:e.gas,deposit:e.deposit}}];
 matchActions(actual,[e]);assert.deepEqual(Buffer.from(nativeActions([e])[0].functionCall.args),args);
 actual[0].FunctionCall.args=Buffer.from([0,255,1,0,5]).toString('base64');assert.throws(()=>matchActions(actual,[e]),/ADMIN_TRANSACTION_MISMATCH/);
 for(const bad of [{...e,args:{}},{...e,args_base64:'invalid!'},{...e,args_base64:''}])assert.throws(()=>nativeActions([bad]),/ADMIN_RAW_ARGS/);
});
