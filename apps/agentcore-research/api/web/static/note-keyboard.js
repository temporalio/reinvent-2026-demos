// Touch input follows the booth's QWERTY, number-row, and email punctuation layout.
(()=>{
  const input=document.getElementById('note');
  const pad=document.createElement('div');pad.className='note-keyboard touch-keyboard';pad.hidden=true;
  pad.setAttribute('aria-label','Approval note keyboard');
  let shifted=false;
  function key(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',action);return b}
  function type(value){if(input.value.length+value.length<=input.maxLength){input.value+=value;input.dispatchEvent(new Event('input',{bubbles:true}))}}
  function render(){pad.replaceChildren();for(const chars of ['1234567890','qwertyuiop','asdfghjkl','zxcvbnm','@.+_-']){const row=document.createElement('div');row.className='touch-keyboard-row';row.setAttribute('role','group');for(const ch of chars){const value=shifted?ch.toUpperCase():ch;row.append(key(value,()=>type(value)))}pad.append(row)}const row=document.createElement('div');row.className='touch-keyboard-row';row.setAttribute('role','group');row.append(key('Shift',()=>{shifted=!shifted;render()}),key('Space',()=>type(' ')),key('⌫',()=>{input.value=input.value.slice(0,-1)}),key('Done',()=>{pad.hidden=true;input.blur()}));pad.append(row)}
  input.inputMode='none';for(const event of ['focus','pointerdown','click'])input.addEventListener(event,()=>{pad.hidden=false});input.closest('label').after(pad);render();
})()
