#!/usr/bin/env python3
"""Check the local preview; opt in to synthetic Workflow executions explicitly."""
import argparse
import http.cookiejar
import json
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPCookieProcessor
from uuid import uuid4

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url',default='http://localhost:15101')
parser.add_argument('--execute-synthetic',action='store_true',help='Create synthetic local orders/jobs/photos; no paid providers or real email.')
args=parser.parse_args()
url=urlsplit(args.url)
if url.scheme!='http' or url.hostname not in {'localhost','127.0.0.1','::1'} or url.username or url.password:
    parser.error('Only a loopback HTTP preview is supported')
opener=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(path,body=None,headers=None):
    data=json.dumps(body).encode() if body is not None else None
    with opener.open(Request(args.url.rstrip('/')+path,data=data,headers={'Content-Type':'application/json',**(headers or {})}),timeout=40) as response:
        value=response.read().decode()
        try:return json.loads(value)
        except json.JSONDecodeError:return value

def docker(*command):
    return subprocess.check_output(['docker','compose','-p','reinvent-2026-local','-f',str(ROOT/'tmp/local/compose.yaml'),'exec','-T',*command],text=True)

def wait_until(check,timeout=100):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if check():return
        time.sleep(1)
    raise AssertionError('Local operation did not complete before the smoke-test timeout')

config=request('/runtime-config.json')
assert config['mode']=='local','Refusing to test a hosted station'
catalog=json.loads((ROOT/'apps/launchpad/src/catalog.json').read_text())
for demo in catalog:
    if demo['id'] in config['availableDemos']:
        request(demo['path']);print(demo['id']+': route OK',flush=True)
request('/_temporal/primary/namespaces/default/workflows')
print('Temporal UI: route OK',flush=True)
if not args.execute_synthetic:raise SystemExit(0)
required={'tacos','money-transfer','data-pipeline','flight-simulator','photo-booth','no-roads','loan','agent-harness','agentic-sdlc'}
assert required.issubset(config['availableDemos']),'Run the full local profile for synthetic checks'
assert request('/loans/api/runtime')['execution_available'] is False
assert request('/travel-agent/api/local-preview')['preview'] is True
assert request('/agentic-sdlc/api/local-preview')['preview'] is True
assert request('/no-roads/api/runtime')['mode']=='native'
for path in ['/loans/apply/custom','/travel-agent/api/sessions','/agentic-sdlc/api/scenarios']:
    try:request(path,{})
    except HTTPError as error:assert error.code==503,(path,error.code)
    else:raise AssertionError('Provider action was unexpectedly enabled: '+path)
print('Provider-limited routes: explicit 503 guards OK',flush=True)
results={}
headers={'X-Session-Id':'smoke-'+uuid4().hex[:8]}
request('/dejavutacos/api/store/go-online',{},headers)
menu=request('/dejavutacos/api/menu');item=(menu if isinstance(menu,list) else menu['items'])[0]
order=request('/dejavutacos/api/orders',{'items':[{'menu_item_id':item['id'],'name':item['name'],'quantity':1,'price':item['price']}]},headers)
results['tacos']=order['workflow_id']
wait_until(lambda:order['order_id'] in json.dumps(request('/dejavutacos/api/store/orders',headers=headers)))
request('/dejavutacos/api/store/order-ready/'+order['order_id'],{},headers)
job=uuid4().hex[:6];request('/data-pipeline/run_job?scenario=HappyPath&job_id='+job);results['data-pipeline']='job-'+job
request('/banking/api/accounts')
transfer=request('/banking/api/transfers',{'from_account':'ACC-001','to_account':'ACC-002','amount':50});results['money-transfer']=transfer['workflow_id']
flight=request('/flightsim/api/flight/sessions',{'email':'preview@example.invalid','consent_text_version':'synthetic-test'})
results['flight-simulator']=flight['workflow_id'];request('/flightsim/api/flight/sessions/'+flight['session_id']+'/finish',{})
image=docker('photobooth-web','python','-c',"from PIL import Image; import io,base64; b=io.BytesIO(); Image.new('RGB',(128,128),'navy').save(b,'PNG'); print(base64.b64encode(b.getvalue()).decode())").strip()
photo=request('/photobooth/api/photobooth/sessions',{'image':image,'email':'preview@example.invalid','consent_text_version':'synthetic-test'})
assert photo['provider']=='mock';results['photo-booth']=photo['workflow_id']
roads=request('/no-roads/api/submit',{'name':'synthetic-'+uuid4().hex[:8]});results['no-roads']=roads['workflowId']
for name,workflow in results.items():
    def completed():
        desc=json.loads(docker('temporal','temporal','workflow','describe','--address','temporal:7233','--namespace','default','--workflow-id',workflow,'--output','json'))
        status=desc['workflowExecutionInfo']['status']
        assert status not in {'WORKFLOW_EXECUTION_STATUS_FAILED','WORKFLOW_EXECUTION_STATUS_CANCELED','WORKFLOW_EXECUTION_STATUS_TERMINATED','WORKFLOW_EXECUTION_STATUS_TIMED_OUT'},(name,status)
        return status=='WORKFLOW_EXECUTION_STATUS_COMPLETED'
    wait_until(completed)
    print(name+': real local Workflow COMPLETED',flush=True)
photo_status=request('/photobooth/api/photobooth/sessions/'+photo['session_id'])
assert photo_status['stage']=='done'
assert all(step['state']=='done' for step in photo_status['steps']),photo_status['steps']
media_check="from PIL import Image; from holodeck.config import settings; from pathlib import Path; d=settings.media_dir/'photobooth'/"+repr(photo['session_id'])+"; strip=Image.open(d/'strip.jpg'); animated=Image.open(d/'strip-animated.gif'); assert strip.height>2400; assert animated.n_frames>1; print('Photo strip dimensions and animated frames OK')"
print(docker('photobooth-web','python','-c',media_check).strip(),flush=True)
(ROOT/'tmp/local-smoke-results.json').write_text(json.dumps(results,indent=2)+'\n')
print('All six synthetic Workflow checks passed. Photo images were mocked; no email was sent.',flush=True)
