// Retain bookmarks from the original root-based trading desk.
if(location.pathname==='/'&&['#explore','#trade','#save','#portfolio','#transactions','#makers'].includes(location.hash)){
  const desk=new URL(document.querySelector('.hero-actions .button').href);
  desk.search=location.search;desk.hash=location.hash;location.replace(desk.href);
}
const content=[
  ['Buy the upside','If NEAR finishes above your chosen price.','Your payout depends on how far the final reference price is above the trade’s set price. At or below that price, this position pays nothing.','Any payout in NEAR, after the result is confirmed.','A payout is not the same as profit. Subtract what you paid and the fees.'],
  ['Choose capped exposure','Follow NEAR’s value, up to a limit.','At the final reference price, this position’s dollar value follows NEAR up to the trade’s cap. Above the cap, that dollar value stops rising. It is paid in NEAR.','A NEAR payout whose reference dollar value is capped.','This is not a put or a guaranteed dollar balance. If NEAR falls, the position’s dollar value falls too.'],
  ['Manage your position','Choose when to request an exit.','Ask for an offer to sell before the end date. If a buyer is available and you accept, sign the sale in your wallet. Otherwise, hold until the result is confirmed and claim any payout.','NEAR from a completed sale or a confirmed payout.','Early sales are not guaranteed. Missing price data can delay a payout, and withdrawing to your wallet is a separate action.']
];
for(const button of document.querySelectorAll('[data-step]'))button.addEventListener('click',()=>{
  const [kicker,title,copy,receive,risk]=content[Number(button.dataset.step)];
  for(const other of document.querySelectorAll('[data-step]')){const selected=other===button;other.classList.toggle('selected',selected);other.setAttribute('aria-pressed',String(selected));}
  for(const [id,text] of Object.entries({'step-kicker':kicker,'step-title':title,'step-copy':copy,'action-receive':receive,'action-risk':risk}))document.getElementById(id).textContent=text;
});

const payoffCopy={
  upside:['Upside payout in NEAR','Zero at or below the set price. Above it, the payout rises towards one unit of NEAR per unit of backing.','Pays above the set price. At or below it, the payout is zero.'],
  capped:['Capped-value payout in NEAR','One unit of NEAR per unit of backing at or below the cap. Above the cap, the NEAR amount decreases as the final reference price rises.','Below the cap, the NEAR amount stays constant while its dollar value falls with NEAR. Above it, the NEAR amount decreases.']
};
for(const button of document.querySelectorAll('[data-payoff]'))button.addEventListener('click',()=>{
  const selected=button.dataset.payoff;
  for(const other of document.querySelectorAll('[data-payoff]'))other.setAttribute('aria-pressed',String(other===button));
  for(const side of ['upside','capped'])document.getElementById(`${side}-curve`).setAttribute('visibility',side===selected?'visible':'hidden');
  const [title,description,explanation]=payoffCopy[selected];
  document.getElementById('plot-title').textContent=title;
  document.getElementById('plot-description').textContent=description;
  document.getElementById('payoff-explanation').textContent=explanation;
});
