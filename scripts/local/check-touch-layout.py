#!/usr/bin/env python3
"""Exercise the local touchscreen layout with an installed agent-browser CLI."""
import argparse
import json
from pathlib import Path
import subprocess
import time
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url',default='http://localhost:15111')
parser.add_argument('--demos',default='money-transfer,tacos,data-pipeline,loan,no-roads,agent-harness,agentic-sdlc,flight-simulator,photo-booth')
parser.add_argument('--bottom-only',action='store_true',help='Inspect the shared stage before native app adapters are ready')
parser.add_argument('--with-code',action='store_true',help='Exercise all eight code-language buttons for every demo')
parser.add_argument('--width',type=int,default=1080)
parser.add_argument('--height',type=int,default=1920)
args=parser.parse_args()
url=urlsplit(args.url)
if url.scheme!='http' or url.hostname not in {'localhost','127.0.0.1'} or url.username or url.password:
    parser.error('Only a loopback HTTP demo preview is supported')
session='reinvent-touch-layout-check'
def browser(*command):
    result=subprocess.run(['agent-browser','--session',session,'--json',*command],capture_output=True,text=True,check=True)
    payload=json.loads(result.stdout)
    if not payload.get('success'):raise RuntimeError(payload.get('error'))
    return payload['data']
def evaluate(code):return browser('eval',code).get('result')
MEASURE=r'''(() => {
 const surface=document.querySelector('.station-surface'),stage=document.querySelector('.demo-stage');
 if(!surface||!stage)return null;
 const top=stage.querySelector('.stage-application'),bottom=stage.querySelector('.stage-information');
 const iframe=top?.querySelector('iframe'),doc=iframe?.contentDocument;
 if(doc?.documentElement.dataset.sharedStage==='true'&&doc.documentElement.dataset.boothFit!=='ready')return null;
 if(!top||!bottom||!doc?.body||doc.readyState!=='complete'||doc.location.href==='about:blank'||!doc.body.children.length||(doc.querySelector('#root')&&!doc.querySelector('#root').children.length))return null;
 const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
 const nested=[...doc.querySelectorAll('*')].filter(el=>{
  const r=el.getBoundingClientRect(),s=doc.defaultView.getComputedStyle(el);
  return r.height>60&&r.width>60&&s.display!=='none'&&s.visibility!=='hidden'&&/(auto|scroll)/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+3;
 }).map(el=>({tag:el.tagName,className:String(el.className).slice(0,100),extra:el.scrollHeight-el.clientHeight}));
 const clippedControls=[...doc.querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>{
  const r=el.getBoundingClientRect(),s=doc.defaultView.getComputedStyle(el);
  if(r.width<8||r.height<8||s.display==='none'||s.visibility==='hidden'||!el.checkVisibility())return false;
  if(r.top< -2||r.left< -2||r.right>doc.defaultView.innerWidth+2||r.bottom>doc.defaultView.innerHeight+2)return true;
  for(let parent=el.parentElement;parent&&parent!==doc.body;parent=parent.parentElement){
    const p=parent.getBoundingClientRect(),style=doc.defaultView.getComputedStyle(parent);
    if(/(hidden|clip|scroll|auto)/.test(style.overflowY)&&(r.top<p.top-2||r.bottom>p.bottom+2))return true;
  }
  return false;
 }).map(el=>({tag:el.tagName,label:(el.getAttribute('aria-label')||el.textContent||el.getAttribute('name')||'').trim().slice(0,70)}));
 return {clippedControls,surface:{height:surface.clientHeight,scrollHeight:surface.scrollHeight},stage:rect(stage),top:rect(top),bottom:rect(bottom),outerScroll:document.documentElement.scrollHeight>innerHeight+2,native:{height:doc.defaultView.innerHeight,scrollHeight:doc.documentElement.scrollHeight},nested};
})()'''
results=[]
try:
    browser('set','viewport',str(args.width),str(args.height))
    for demo in args.demos.split(','):
        browser('open',args.url.rstrip('/')+'/?station=1&demo='+demo)
        result=None
        for _ in range(30):
            result=evaluate(MEASURE)
            if result:break
            time.sleep(.2)
        if result:
            time.sleep(.5)
            result=evaluate(MEASURE) or result
        if not result:raise AssertionError(demo+': demo stage did not load')
        assert not result['outerScroll'],(demo,'outer document scrolls',result)
        assert result['surface']['scrollHeight']<=result['surface']['height']+2,(demo,'station surface scrolls',result)
        assert abs(result['top']['height']-result['bottom']['height'])<=1,(demo,'not an equal split',result)
        assert result['top']['y']>=result['stage']['y']-1
        assert result['bottom']['y']+result['bottom']['height']<=result['stage']['y']+result['stage']['height']+1
        if not args.bottom_only:
            assert result['native']['scrollHeight']<=result['native']['height']+3,(demo,'native document scrolls',result)
            assert not result['clippedControls'],(demo,'upper controls are clipped',result['clippedControls'])
            assert not result['nested'],(demo,'upper panel has nested scrolling',result['nested'])
        for label in ['Architecture','Business impact']:
            evaluate("[...document.querySelectorAll('.stage-tabs button')].find(button=>button.textContent==="+json.dumps(label)+").click()")
            panel=evaluate("(() => {const p=document.querySelector('.stage-tab-content:not([hidden])');return {height:p.clientHeight,scroll:p.scrollHeight};})()")
            assert panel['scroll']<=panel['height']+2,(demo,label,'information does not fit',panel)
        if args.with_code:
            evaluate("[...document.querySelectorAll('.stage-tabs button')].find(button=>button.textContent==='Workflow code').click()")
            ids=[]
            for _ in range(25):
                ids=evaluate("[...document.querySelectorAll('.sdk-selector button')].map(button=>button.dataset.sdk)")
                if len(ids)==8:break
                time.sleep(.2)
            assert len(ids)==8,(demo,'expected eight language controls',ids)
            examples=[]
            for sdk in ids:
                evaluate("document.querySelector('.sdk-selector button[data-sdk=\""+sdk+"\"]').click()")
                text=evaluate("document.querySelector('[data-testid=workflow-code]').textContent")
                assert 0<len(text.splitlines())<=45,(demo,sdk,'example size',len(text.splitlines()))
                examples.append(text)
            assert len(set(examples))==8,(demo,'SDK selection does not change the example')
        results.append({'demo':demo,**result})
        print(demo+': equal tracks; business/architecture fit'+('; native controls fit' if not args.bottom_only else ''),flush=True)
    target=ROOT/'tmp/touch-layout-results.json';target.parent.mkdir(exist_ok=True);target.write_text(json.dumps(results,indent=2)+'\n')
finally:
    browser('close')
