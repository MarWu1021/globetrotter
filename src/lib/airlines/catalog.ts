/** Curated public facts, not an exhaustive/real-time operator register.
 * Reference: public airline profiles linked below (names/IATA are factual identifiers).
 * Keep saved free-text historical airlines; never rewrite existing trip strings.
 * No paid API or third-party browser requests. */
export const AIRLINE_SOURCE='https://en.wikipedia.org/wiki/List_of_airlines'
export const AIRLINE_CATALOG_VERSION=1
export interface Airline {iata:string;name:string;zhTW:string;aliases:readonly string[];source:string}
const rows:readonly (readonly [string,string,string,string?])[]=[
 ['CI','China Airlines','中華航空','華航 中华航空'],['BR','EVA Air','長榮航空','长荣航空'],['JX','STARLUX Airlines','星宇航空'],['IT','Tigerair Taiwan','台灣虎航','臺灣虎航 台湾虎航'],
 ['NH','All Nippon Airways','全日本空輸','全日空 ANA'],['JL','Japan Airlines','日本航空','日航 JAL'],['MM','Peach Aviation','樂桃航空','乐桃航空'],['GK','Jetstar Japan','捷星日本航空'],['BC','Skymark Airlines','天馬航空'],['HD','Air Do','北海道國際航空'],['NU','Japan Transocean Air','日本越洋航空'],
 ['CX','Cathay Pacific','國泰航空','国泰航空'],['HX','Hong Kong Airlines','香港航空'],['UO','HK Express','香港快運航空'],['KE','Korean Air','大韓航空','大韩航空'],['OZ','Asiana Airlines','韓亞航空','韩亚航空'],['7C','Jeju Air','濟州航空','济州航空'],['TW','T\u0027way Air','德威航空'],['LJ','Jin Air','真航空'],['BX','Air Busan','釜山航空'],['RS','Air Seoul','首爾航空'],['ZE','Eastar Jet','易斯達航空'],
 ['SQ','Singapore Airlines','新加坡航空','新航'],['TR','Scoot','酷航'],['MH','Malaysia Airlines','馬來西亞航空','马来西亚航空 馬航'],['AK','AirAsia','亞洲航空','亚航 亞航'],['D7','AirAsia X','亞洲航空長途','亞航長途'],['TG','Thai Airways','泰國航空','泰航'],['FD','Thai AirAsia','泰國亞洲航空'],['XJ','Thai AirAsia X','泰國亞洲航空長途'],['VZ','Thai Vietjet Air','泰國越捷航空'],['VJ','Vietjet Air','越捷航空'],['VN','Vietnam Airlines','越南航空'],['QH','Bamboo Airways','越竹航空'],['GA','Garuda Indonesia','印尼航空'],['QG','Citilink','連城航空'],['ID','Batik Air','巴澤航空'],['OD','Batik Air Malaysia','馬來西亞巴澤航空'],['JT','Lion Air','獅子航空'],['PR','Philippine Airlines','菲律賓航空'],['5J','Cebu Pacific','宿霧太平洋航空'],
 ['QF','Qantas','澳洲航空'],['JQ','Jetstar Airways','捷星航空'],['NZ','Air New Zealand','紐西蘭航空'],['EK','Emirates','阿聯酋航空','阿联酋航空'],['EY','Etihad Airways','阿提哈德航空'],['QR','Qatar Airways','卡達航空','卡塔爾航空'],['TK','Turkish Airlines','土耳其航空'],
 ['LH','Lufthansa','漢莎航空','德國漢莎航空'],['LX','Swiss International Air Lines','瑞士國際航空'],['OS','Austrian Airlines','奧地利航空'],['AF','Air France','法國航空','法航'],['KL','KLM Royal Dutch Airlines','荷蘭皇家航空'],['BA','British Airways','英國航空','英航'],['IB','Iberia','西班牙國家航空'],['AY','Finnair','芬蘭航空'],['SK','Scandinavian Airlines','北歐航空','SAS'],['FI','Icelandair','冰島航空'],['TP','TAP Air Portugal','葡萄牙航空'],['A3','Aegean Airlines','愛琴海航空'],['OA','Olympic Air','奧林匹克航空'],['FR','Ryanair','瑞安航空'],['U2','easyJet','易捷航空'],['W6','Wizz Air','威茲航空'],['VY','Vueling','伏林航空'],['HV','Transavia','泛航航空'],['V7','Volotea','維羅提航空'],['DY','Norwegian Air Shuttle','挪威航空'],['PC','Pegasus Airlines','飛馬航空'],['XQ','SunExpress','太陽快運航空'],
 ['UA','United Airlines','聯合航空','美國聯合航空'],['DL','Delta Air Lines','達美航空'],['AA','American Airlines','美國航空'],['WN','Southwest Airlines','西南航空'],['AS','Alaska Airlines','阿拉斯加航空'],['B6','JetBlue','捷藍航空'],['AC','Air Canada','加拿大航空'],['WS','WestJet','西捷航空'],['LA','LATAM Airlines','南美航空'],['AV','Avianca','哥倫比亞航空'],['CM','Copa Airlines','巴拿馬航空'],['AM','Aeromexico','墨西哥航空'],
 ['CA','Air China','中國國際航空','中国国际航空 國航'],['MU','China Eastern Airlines','中國東方航空','中国东方航空 東航'],['CZ','China Southern Airlines','中國南方航空','中国南方航空 南航'],['MF','XiamenAir','廈門航空','厦门航空'],['HU','Hainan Airlines','海南航空'],['ZH','Shenzhen Airlines','深圳航空']
]
export const AIRLINES:readonly Airline[]=rows.map(([iata,name,zhTW,aliases=''])=>({iata,name,zhTW,aliases:aliases?aliases.split(' '):[],source:`https://en.wikipedia.org/wiki/${encodeURIComponent(name.replaceAll(' ','_'))}`}))
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g,' ')
export function searchAirlines(query:string,limit=8):readonly Airline[]{
 const q=normalize(query);if(!q || q.length>100)return []
 return AIRLINES.map(a=>({a,score:normalize(a.iata)===q?0:[a.name,a.zhTW,...a.aliases].some(v=>normalize(v).startsWith(q))?1:[a.iata,a.name,a.zhTW,...a.aliases].some(v=>normalize(v).includes(q))?2:3}))
  .filter(v=>v.score<3).sort((a,b)=>a.score-b.score||a.a.iata.localeCompare(b.a.iata)).slice(0,Math.min(12,Math.max(0,limit))).map(v=>v.a)
}
/** Keep the existing FlightDetails.airline string; code AND canonical name travel together. */
export const airlineValue=(a:Airline)=>`${a.iata} · ${a.name}`
