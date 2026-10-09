/** Curated Taiwan names keyed by provider ID, never by a reusable IATA code. */
export const airportChinese: Readonly<Record<string, { name: string; city: string; aliases: string[] }>> = {
  "5528": { name: "台灣桃園國際機場", city: "桃園", aliases: ["臺灣桃園國際機場", "桃園機場", "台北", "臺北"] },
  "5235": { name: "杜拜國際機場", city: "杜拜", aliases: ["迪拜國際機場", "迪拜"] },
  "4251": { name: "雅典國際機場", city: "斯帕塔－阿爾特米達", aliases: ["雅典", "雅典機場"] },
  "5531": { name: "成田國際機場", city: "成田", aliases: ["東京", "成田機場"] },
  "5627": { name: "東京羽田機場", city: "東京", aliases: ["羽田機場", "羽田"] },
  "5536": { name: "關西國際機場", city: "大阪", aliases: ["關西機場", "大阪機場"] },
  "26535": { name: "香港國際機場", city: "香港", aliases: ["赤鱲角機場"] },
  "5653": { name: "仁川國際機場", city: "首爾", aliases: ["仁川", "首爾機場"] },
  "5527": { name: "台北松山機場", city: "台北", aliases: ["臺北松山機場", "松山機場", "臺北"] },
  "5520": { name: "台中國際機場", city: "台中", aliases: ["臺中國際機場", "清泉崗", "臺中"] },
  "5516": { name: "高雄國際機場", city: "高雄", aliases: ["小港機場"] },
  "4185": { name: "巴黎戴高樂機場", city: "巴黎", aliases: ["戴高樂", "巴黎機場"] },
  "3878": { name: "舊金山國際機場", city: "舊金山", aliases: ["舊金山機場"] },
  "3632": { name: "洛杉磯國際機場", city: "洛杉磯", aliases: ["洛杉磯機場"] },
}
export const countryChineseAliases: Readonly<Record<string, string[]>> = {
  TW: ["台灣", "臺灣"], AE: ["阿聯酋", "阿拉伯聯合大公國", "阿拉伯聯合酋長國"],
  GR: ["希臘"], GB: ["英國"], US: ["美國"], HK: ["香港"], MO: ["澳門"],
}
