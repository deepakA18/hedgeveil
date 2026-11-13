import test from 'node:test';
import assert from 'node:assert/strict';
import {amountDisplay} from '../../apps/frontend/lib/amount-display.ts';
import {parseNear} from '../../packages/sdk/amounts.mjs';

test('summary formatting preserves exact amounts including sub-display units',()=>{
  for(const [exact,text] of [['0','0'],['0.000000000000000000000001','<0.0001'],['0.05','0.05'],['1234.56789','≈ 1,234.5678'],['1.00001','≈ 1'],['0.0001','0.0001']]){
    const atomic=parseNear(exact), result=amountDisplay(atomic);
    assert.deepEqual(result,{text,exact});
    assert.equal(parseNear(result.exact),atomic);
  }
  const max=((1n<<128n)-1n).toString(),result=amountDisplay(max);
  assert.equal(parseNear(result.exact),max);
});
test('missing or invalid amounts never become a displayed zero',()=>{
  for(const value of [undefined,null,0,'','-1','01','1.5','NaN','1e24',((1n<<128n)).toString()])
    assert.deepEqual(amountDisplay(value),{text:'—',exact:null});
});

test('backing display exposes six decimals without changing exact amounts',()=>{
  const result=amountDisplay(parseNear('3.895453888779752695'),6);
  assert.deepEqual(result,{text:'≈ 3.895453',exact:'3.895453888779752695'});
  assert.equal(amountDisplay(parseNear('0.0000001'),6).text,'<0.000001');
  assert.equal(amountDisplay(parseNear('4'),6).text,'4');
});
