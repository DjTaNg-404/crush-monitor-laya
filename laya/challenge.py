import hashlib
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

import argparse
parser=argparse.ArgumentParser()
parser.add_argument("--language", choices=["zh", "en"], default="zh")
parser.add_argument("--url", default="http://127.0.0.1:3178")
args=parser.parse_args()
from urllib.parse import urlparse
if urlparse(args.url).hostname not in ("127.0.0.1", "localhost", "::1"):
    parser.error("Only loopback URLs are allowed")
root=Path("artifacts")
root.mkdir(exist_ok=True)
source=Path(__file__).parent / "fixtures" / f"challenge-{args.language}.json"
data=json.loads(source.read_text())
base=args.url.rstrip('/')
def request(path,body=None):
    req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=60) as r:
        return json.loads(r.read())

catalog=request('/api/laya/cases')
health=request('/api/laya/health')
rows=[]
groups={}
for case in data['cases']:
    started=time.perf_counter()
    try:
        output=request('/api/laya/analyze',case['request'])
        checks=[]
        for key,expected in case['expected'].items():
            a=output['answers'][key]
            top3=None
            if 'labels' in expected:
                predicted=a['choice']
                passed=predicted in expected['labels']
                ranked=sorted(a['probabilities'],key=a['probabilities'].get,reverse=True)
                top3=bool(set(ranked[:3]) & set(expected['labels']))
            elif 'boolean' in expected:
                predicted=a['noul']
                passed=(predicted>=.5)==expected['boolean']
            else:
                predicted=a['score']
                passed=expected['range'][0]<=predicted<=expected['range'][1]
            check={'question':key,'predicted':predicted,'expected':expected,'passed':passed,'top3Passed':top3}
            checks.append(check)
            group=groups.setdefault(key,{'total':0,'passed':0,'top3Passed':0})
            group['total']+=1;group['passed']+=int(passed);group['top3Passed']+=int(top3 or False)
        row={**case,'checks':checks,'output':output,'httpMs':round((time.perf_counter()-started)*1000,2)}
        print(case['id'],str(sum(c['passed'] for c in checks))+'/'+str(len(checks)),json.dumps({k:a.get('choice',a.get('score',a.get('noul'))) for k,a in output['answers'].items()},ensure_ascii=False),flush=True)
    except urllib.error.HTTPError as e:
        row={**case,'error':e.code,'detail':e.read().decode()}
        print(case['id'],'HTTP ERROR',row['detail'],flush=True)
    rows.append(row)

pairs={}
for row in rows:
    if 'pair' in row and 'output' in row:
        pairs.setdefault(row['pair']['group'],{})[row['pair']['kind']]=row['output']['answers']['quality']['score']
for pair in pairs.values():
    pair['difference']=round(pair['good']-pair['bad'],4)
    pair['orderedCorrectly']=pair['difference']>0
    pair['marginPassed']=pair['difference']>=data['expectedQualityPairMargin']
report={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'schema':catalog['schema'],'engine':health['engine'],'dataset':data['description'],'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'groups':groups,'qualityPairs':pairs,'errors':sum('error' in r for r in rows),'cases':rows}
(root/f'challenge-{args.language}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'groups':groups,'qualityPairs':pairs,'errors':report['errors']},ensure_ascii=False,indent=2))

if report["errors"]: raise SystemExit(1)
