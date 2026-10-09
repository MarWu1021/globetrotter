"""Offline, explicit regeneration. No network calls and no edits to the existing transport layer."""
import argparse, collections, csv, hashlib, io, json, math, pathlib, uuid

p = argparse.ArgumentParser()
p.add_argument('--airports', required=True)
p.add_argument('--countries', required=True)
p.add_argument('--iso', required=True, help='ISO 3166-1 reference JSON, iso-codes format')
p.add_argument('--iso-reference-version', required=True, help='Version of the supplied iso-codes reference')
p.add_argument('--inventory', required=True, help='Actual flat/globe IDs and legacy points from inventory-airports.mjs')
p.add_argument('--source-commit', required=True)
p.add_argument('--source-date', required=True)
p.add_argument('--retrieved-at', required=True)
a = p.parse_args()
if len(a.source_commit) != 40 or any(c not in '0123456789abcdef' for c in a.source_commit):
    raise ValueError('Expected pinned full source commit')
root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'src/data/airport-catalog'
raw = pathlib.Path(a.airports).read_bytes()
country_raw = pathlib.Path(a.countries).read_bytes()
rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
country_rows = list(csv.DictReader(io.StringIO(country_raw.decode('utf-8-sig'))))
iso_bytes = pathlib.Path(a.iso).read_bytes()
iso = {r['alpha_2']: r for r in json.loads(iso_bytes)['3166-1']}
info = json.loads((root / 'src/data/country-info.json').read_text())
assert set(iso) == {r['cca2'] for r in info.values()}, 'ISO reference and existing country metadata differ'
inventory = json.loads(pathlib.Path(a.inventory).read_text())
# This is an explicit map, NOT inferred from a territory's travel-advisory parent.
special_geos = {'fr-guf':'GF','fr-reu':'RE','fr-glp':'GP','fr-mtq':'MQ','fr-myt':'YT',
 'fr-cor':'FR','us-ak':'US','us-hi':'US','es-ic':'ES','es-ib':'ES','it-sic':'IT','it-sar':'IT',
 'pt-mad':'PT','pt-azo':'PT','826-eng':'GB','826-sco':'GB','826-wal':'GB','826-nir':'GB'}
geo_code = {id: r['cca2'] for id, r in info.items()} | special_geos
review = set('AX AS AI AQ AW BM BQ BV CC CK CW CX EH FK FO GF GG GI GL GP GS GU HK HM IM IO JE KY MF MO MP MQ MS NC NF NU PF PM PN PR PS RE SH SJ SX TC TF TK UM VG VI WF YT'.split())
source_names = {r['code']: r['name'] for r in country_rows}
mappings = []
for code, r in sorted(iso.items()):
    mappings.append({'isoCode':code,'sourceCode':code,'name':source_names.get(code,r['name']),
      'statisticalId':'iso:'+code,'numericCode':r['numeric'],
      'requiresReview':code in review,'classification':'special-area' if code in review else 'iso-country-or-area',
      'flatGeoIds':[f['id'] for f in inventory['flat'] if geo_code.get(f['id'])==code],
      'globeGeoIds':[f['id'] for f in inventory['globe'] if geo_code.get(f['id'])==code],
      'legacyGeoIds':[id for id, mapped in geo_code.items() if mapped==code]})
for code in sorted(set(source_names)-set(iso)):
    mappings.append({'isoCode':None,'sourceCode':code,'name':source_names[code],
      'statisticalId':None,'numericCode':None,'requiresReview':True,'classification':'non-iso-or-unassigned',
      'flatGeoIds':[],'globeGeoIds':[],'legacyGeoIds':[]})
records, rejected = [], []
seen = set()
for r in rows:
    if not (r['type'] in ('large_airport','medium_airport') or r['scheduled_service']=='yes' or r['iata_code']):
        continue
    try:
        if not r['id'].isdigit() or r['id'] in seen: raise ValueError('Invalid/duplicate source ID')
        seen.add(r['id'])
        lat, lng = float(r['latitude_deg']), float(r['longitude_deg'])
        if not math.isfinite(lat) or not math.isfinite(lng) or abs(lat)>90 or abs(lng)>180:
            raise ValueError('Invalid coordinates')
        if not r['name'].strip(): raise ValueError('Missing name')
        records.append({'id':str(uuid.uuid5(uuid.NAMESPACE_URL,'ourairports:'+r['id'])),
          'source':'ourairports','sourceId':r['id'],'ident':r['ident'],
          'iata':r['iata_code'] or None,'icao':r['icao_code'] or None,'name':r['name'],
          'city':r['municipality'] or None,'latitude':lat,'longitude':lng,
          'sourceCountryCode':r['iso_country'],'isoCountryCode':r['iso_country'] if r['iso_country'] in iso else None,
          'type':r['type'],'scheduledService':r['scheduled_service']=='yes','closed':r['type']=='closed',
          'retired':False,'updatedAt':a.source_date,'aliases':[], 'history':[],
          'keywords':r['keywords'],'wikipedia':r['wikipedia_link'] or None})
    except ValueError as e:
        rejected.append({'sourceId':r['id'],'reason':str(e)})
records.sort(key=lambda r:int(r['sourceId']))
# Legacy reconciliation uses code plus coordinate proximity, never country/name guessing.
legacy_results=[]
for old in inventory['legacy']:
    code_matches=[r for r in records if r['iata']==old.get('code')]
    def distance(r):
        rad=math.pi/180
        h=math.sin((r['latitude']-old['lat'])*rad/2)**2+math.cos(old['lat']*rad)*math.cos(r['latitude']*rad)*math.sin((r['longitude']-old['lng'])*rad/2)**2
        return 12742*math.asin(math.sqrt(min(1,max(0,h))))
    candidates=[r for r in code_matches if distance(r)<=1]
    legacy_results.append({'legacyCode':old.get('code'),'legacyName':old['name'],
      'status':'matched' if len(candidates)==1 else 'needs-review','airportId':candidates[0]['id'] if len(candidates)==1 else None,
      'candidateIds':[r['id'] for r in code_matches]})
metadata={'schemaVersion':1,'provider':'OurAirports','repository':'https://github.com/davidmegginson/ourairports-data',
 'sourceCommit':a.source_commit,'sourceUpdatedAt':a.source_date,'retrievedAt':a.retrieved_at,
 'airportsUrl':f'https://raw.githubusercontent.com/davidmegginson/ourairports-data/{a.source_commit}/airports.csv',
 'countriesUrl':f'https://raw.githubusercontent.com/davidmegginson/ourairports-data/{a.source_commit}/countries.csv',
 'airportsSha256':hashlib.sha256(raw).hexdigest(),'countriesSha256':hashlib.sha256(country_raw).hexdigest(),
 'isoReferenceSha256':hashlib.sha256(iso_bytes).hexdigest(),'license':'OurAirports public-domain data',
 'licenseUrl':'https://ourairports.com/data/','selection':'large or medium airport, scheduled service, or any IATA code',
 'rawRows':len(rows),'selectedRows':len(records),'rejectedRows':rejected,
 'missingIata':sum(not r['iata'] for r in records),'missingIcao':sum(not r['icao'] for r in records),
 'missingCity':sum(not r['city'] for r in records),'nonIsoRows':sum(r['isoCountryCode'] is None for r in records),
 'isoReference':{'package':'iso-codes','version':a.iso_reference_version,'codes':len(iso),
    'source':'https://salsa.debian.org/iso-codes-team/iso-codes'},
 'countryMappingRows':len(mappings),'selectedTypes':dict(collections.Counter(r['type'] for r in records)),
 'duplicateCodes':{field:{code:n for code,n in collections.Counter(r[field] for r in records if r[field]).items() if n>1}
    for field in ['iata','icao']},
 'closedRows':sum(r['closed'] for r in records),'legacyRows':len(legacy_results),
 'legacyMatched':sum(r['status']=='matched' for r in legacy_results),
 'unmappedGeoIds':{view:[f['id'] for f in inventory[view] if f['id'] not in geo_code] for view in ['flat','globe']}}
out.mkdir(parents=True,exist_ok=True)
for name,value in [('airports.json',records),('countries.json',mappings),('metadata.json',metadata),('legacy-audit.json',legacy_results)]:
    (out/name).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps(metadata,ensure_ascii=False,indent=2))
