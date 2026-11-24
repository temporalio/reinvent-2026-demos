import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const source=readFileSync(new URL('../public/booth/touch-keyboard.js',import.meta.url),'utf8')

// Small DOM harness: tests exercise the shipped keyboard and its emitted events.
function setup() {
  let document
  class DomEvent extends Event {
    constructor(type,options={}) {super(type,options);this.path=[]}
    composedPath(){return this.path}
  }
  class Element extends EventTarget {
    constructor(tag='div'){super();this.tagName=tag.toUpperCase();this.children=[];this.attributes=new Map();this.hidden=false;this.textContent='';this.disabled=false;this.readOnly=false;this.isContentEditable=false}
    append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
    replaceChildren(...nodes){this.children=[];this.append(...nodes)}
    setAttribute(k,v){this.attributes.set(k,String(v))}
    getAttribute(k){return this.attributes.get(k)??null}
    removeAttribute(k){this.attributes.delete(k)}
    get isConnected(){return this===document.documentElement || !!this.parent?.isConnected}
    closest(selector){
      if(selector.startsWith('[data-booth-keyboard'))return this.getAttribute('data-booth-keyboard')==='native'?this:this.parent?.closest(selector)||null
      return ['INPUT','TEXTAREA'].includes(this.tagName)||this.isContentEditable?this:this.parent?.closest(selector)||null
    }
    dispatchEvent(event){
      if(!event.path?.length)event.path=[this]
      const result=super.dispatchEvent(event)
      if(event.bubbles)document.dispatchEvent(event)
      return result
    }
  }
  class Input extends Element {
    constructor(){super('input');this.type='text';this.maxLength=-1;this._value='';this.selectionStart=0;this.selectionEnd=0;this.labels=[]}
    get value(){return this._value}
    set value(value){this._value=this.type==='number' && value!=='' && !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)?'':value;this.selectionStart=this.selectionEnd=this._value.length}
    setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b}
  }
  class Textarea extends Input {
    constructor(){super();this.tagName='TEXTAREA'}
    get value(){return this._value}
    set value(value){this._value=value;this.selectionStart=this.selectionEnd=value.length}
  }
  document=new EventTarget()
  document.documentElement=new Element('html')
  document.createElement=tag=>new Element(tag)
  const window={}
  const context={window,document,Element,HTMLInputElement:Input,HTMLTextAreaElement:Textarea,Event:DomEvent,InputEvent:DomEvent,MutationObserver:class{observe(){}}}
  vm.runInNewContext(source,context)
  const all=root=>[root,...root.children.flatMap(all)]
  const panel=()=>document.documentElement.children.find(e=>e.className.includes('booth-touch-keyboard'))
  const key=text=>{const button=all(panel()).find(e=>e.tagName==='BUTTON' && e.textContent===text);assert.ok(button,`Missing key ${text}`);button.dispatchEvent(new DomEvent('click'))}
  function focus(field){document.documentElement.append(field);document.activeElement=field;const event=new DomEvent('focusin');event.path=[field];document.dispatchEvent(event)}
  return {document,Input,Textarea,Element,focus,key,panel,all,window,context}
}

test('typing emits real input/change events, respects selection and max length',()=>{
  const h=setup(),field=new h.Input();field.value='abcd';field.maxLength=4;field.selectionStart=1;field.selectionEnd=3
  let inputs=0,changes=0;field.addEventListener('input',()=>inputs++);field.addEventListener('change',()=>changes++)
  h.focus(field);h.key('q');assert.equal(field.value,'aqd');assert.equal(inputs,1);assert.equal(changes,1)
  h.key('w');assert.equal(field.value,'aqwd');h.key('e');assert.equal(field.value,'aqwd')
  h.key('⌫');assert.equal(field.value,'aqd')
})

test('email punctuation, shift, clearing, and restored input mode',()=>{
  const h=setup(),field=new h.Input();field.type='email';field.setAttribute('inputmode','email');h.focus(field)
  for(const ch of ['a','+','_','@','.'])h.key(ch)
  assert.equal(field.value,'a+_@.');h.key('Shift');h.key('B');assert.equal(field.value,'a+_@.B')
  h.key('Clear');assert.equal(field.value,'');h.key('Done');assert.equal(h.panel().hidden,true);assert.equal(field.getAttribute('inputmode'),'email')
})

test('numeric entry preserves a partial decimal until the next digit',()=>{
  const h=setup(),field=new h.Input();field.type='number';h.focus(field)
  for(const ch of ['1','2','.','5'])h.key(ch)
  assert.equal(field.value,'12.5');h.key('⌫');assert.equal(field.value,'');h.key('7');assert.equal(field.value,'12.7');h.key('⌫');h.key('Done');assert.equal(field.value,'12')
})

test('multiline fields support a new line and password previews are masked',()=>{
  const h=setup(),field=new h.Textarea();h.focus(field);h.key('a');h.key('↵');h.key('b');assert.equal(field.value,'a\nb')
  const password=new h.Input();password.type='password';h.focus(password);h.key('a')
  const preview=h.all(h.panel()).find(e=>e.className.includes('booth-keyboard-value'));assert.equal(preview.textContent,'•')
})

test('existing native keyboards, read-only fields, and duplicate scripts are left alone',()=>{
  const h=setup(),field=new h.Input();field.setAttribute('data-booth-keyboard','native');h.focus(field);assert.equal(h.panel().hidden,true)
  const readonly=new h.Input();readonly.readOnly=true;h.focus(readonly);assert.equal(h.panel().hidden,true)
  vm.runInNewContext(source,h.context);assert.equal(h.document.documentElement.children.filter(e=>e.className?.includes('booth-touch-keyboard')).length,1)
})
