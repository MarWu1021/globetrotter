# 階段 2B：機場資料與國家對照

此模組為獨立純 TypeScript 資料層，尚未接上 React、地球／地圖、Zustand、localStorage 或任何雲端服務。既有 `transport-airports.ts` 的 1,175 個機場、五種語言 UI、旅行資料均保持原樣。不得直接把整份新機場 JSON 匯入現有 client component；未來應用伺服器搜尋或分批／動態載入。

## 資料來源與品質

- 免費 OurAirports 公共領域機場／國家資料：[官方資料與使用條款](https://ourairports.com/data/)、[官方 GitHub](https://github.com/davidmegginson/ourairports-data)。本環境官方網站回傳網路政策 403，改讀官方 GitHub 固定版本 CSV；本次未能重新開啟官方條款頁。
- 固定來源 commit：`56abe495bb3afcf8b5d8f01feec0f46ba4fd753f`，版本時間 `2026-10-09T01:53:12Z`。抓取時間、原始 URL、SHA-256 與選取規則存於 `src/data/airport-catalog/metadata.json`。`updatedAt` 是整份來源版本時間，**不是單一機場最後更新時間**。
- 86,226 筆原始資料，選取大型／中型機場、有定期服務或有 IATA 的 9,940 筆，不宣稱涵蓋所有小型機場。8 筆已關閉資料保留歷史參照，搜尋預設隱藏。
- 889 筆沒有 IATA、1,829 筆沒有 ICAO、404 筆沒有城市。缺漏明確存 `null`，不以 `ident`／GPS code 或英文名稱冒充 ICAO／城市。來源目前缺少的資料仍待可靠資料或人工確認，不能宣稱全欄位已補齊。
- 座標皆為有效有限數值；ID 唯一；此快照沒有重複非空 IATA／ICAO。函式仍防範未來代碼重用、重複名稱、身份衝突。
- 2 筆機場使用非 ISO 代碼：XK 的 BKPR、XP 的 XP-0003，不可自動轉成 ISO／歸到某國。國家來源另有 ZZ（未知），共 249 個 ISO + 3 個非 ISO 對照。
- 舊資料以 IATA **且座標相距 ≤ 1 公里**唯一匹配；1,172 筆可對照。VTZ、SVO 超出保守距離門檻；PBI 沒有同 IATA 候選（來源 `KPBI` 當前提供 `DJT`）。3 筆均保留待確認；不改寫舊資料，也不擅自認可來源代碼異動。

## 身份與安全更新

`id` 是以命名空間 URL 與 `ourairports:<來源數字 ID>` 產生的 UUIDv5，`sourceId` 保留 OurAirports 數字 ID 字串。IATA、ICAO、名稱都不是主鍵。

`reconcileAirportCatalog(previous,next)` 回傳更新計畫，不下載、不寫資料。代碼變更保留舊代碼 aliases 與來源修訂 history；來源移除仍保留舊記錄為 retired。拒絕重複來源／內部 ID、改換主鍵、倒退版本。國家變更另列 `changedCountryIds`，歷史國家不同時整合預設阻擋，需明確審核才能套用；不要直接覆寫已使用的主資料。日後如需讓既有航班永遠採當時機場位置／國家，應再設計逐筆版本參照，這次只提供歷史與審核防線。

## 國家與地球 ID

ISO 參考為 iso-codes 4.18.0-1 的 249 個 alpha-2／numeric code，與既有 country-info 的 ISO 集合完全核對。統計 ID `iso:<alpha-2>`；階段 2A 的國家欄位仍使用 alpha-2。

| 國家 | ISO / 統計 ID | 現有平面與地球 ID |
|---|---|---|
| 台灣 | TW / iso:TW | 158 |
| 阿聯酋 | AE / iso:AE | 784 |
| 希臘 | GR / iso:GR | 300 |

依 `geo.ts` **實際產生的幾何**建立 `flatGeoIds`、`globeGeoIds`（平面 252、地球 183）；`legacyGeoIds` 另包含舊紀錄可能使用的 ID。海外領地以自身 ISO 計算，不能使用旅遊警示的父國映射，例如 `fr-guf → GF`，不算 FR；法國科西嘉 `fr-cor → FR`，英國四構成區 → GB。ISO 特殊地區需 `approvedSpecialAreas` 明確審核才適配核心；XK／XP／ZZ 即使列入此清單仍拒絕。政策只回傳資料、不更新使用者偏好。

部分小島／地區沒有地球多邊形，保留空 `globeGeoIds`，統計身份和機場經緯度仍有效；不可借父國多邊形上色。未來 UI 必須提示無邊界／待確認狀態，這次不新增幾何或改地球畫面。

## API

- `resolveCountry`／`requireStatisticalCountry`：解析映射、阻擋未知與尚未核准地區；回傳副本。
- `legacyCountryMappings`：產生已審核的舊地圖 ID → ISO 對照，**不讀寫或匯入 localStorage**。
- `createAirportSearchIndex`：索引副本，國家名稱涵蓋 en、fr、es、de、zh-TW；預先快取國家文字。
- `searchAirports`：IATA 優先，接著 ICAO、來源 ident、歷史代碼、前綴及名稱／城市／國家關鍵字；大小寫、全形、拉丁重音正規化；最多 50 筆，預設 20 筆。繁中以國家名稱／別名及 14 個人工明確對應來源 ID 的常用機場名稱／城市支援，**未翻譯全球所有機場**，其他保留來源名稱。
- `resolveAirportCode`：代碼重用／多候選必須使用者選擇，不能默取第一筆；前端與地球點選未來一律傳穩定 ID，兩種選擇可混合，不以名稱判斷國家。
- `toCoreAirports`：驗證 ISO 與來源代碼一致、特殊地區政策及主資料，轉成階段 2A `Airport`。
- `deriveCatalogFootprint`：僅適配旅行引用的機場、保留手動 CountryRecord，再调用 2A 計算國家、機場、航線；另回傳正式弧線資料與統計國家映射。只有 completed 的旅行計入所有足跡與弧線；草稿／規劃／進行中不計入。
- 出發國綠、旅遊綠、轉機藍，綠優先、國家去重；機場依停留事件計次，不相加航班端點。沿用 2A 的旅行建構、編輯、合併／拆分及一致性檢查，不自動以機場代碼合併轉機。

## 離線重建與測試

`inventory-airports.mjs` 在記憶體編譯並讀取既有幾何與機場資料，只輸出 JSON；建議輸出到 `/tmp`。產生器只在明確執行時更新四個新快照，不碰舊 transport/localStorage。先取得固定 commit 的兩份 CSV，校驗 metadata 的 SHA-256；不需要付費 API 或應用程式啟動時連線。

```sh
node scripts/inventory-airports.mjs > /tmp/globetrotter-geo-inventory.json
python3 scripts/generate-airport-catalog.py \
  --airports /tmp/globetrotter-ourairports-airports.csv \
  --countries /tmp/globetrotter-ourairports-countries.csv \
  --iso /usr/share/iso-codes/json/iso_3166-1.json \
  --iso-reference-version 4.18.0-1 \
  --inventory /tmp/globetrotter-geo-inventory.json \
  --source-commit 56abe495bb3afcf8b5d8f01feec0f46ba4fd753f \
  --source-date 2026-10-09T01:53:12Z \
  --retrieved-at '<實際抓取時間 ISO 8601>'
npm run test:airport-data
npm run test:travel-core
npm run test:i18n
npx tsc --noEmit --incremental false
npm run lint
```

## 下一階段前需確認

1. 3 筆舊機場待確認對照、特殊地區統計政策、歷史國家異動的處理。
2. 決定伺服器搜尋／分區載入方案、機場標記密度与手機性能預算後，才接上 UI；目前未測新增資料的 iPhone 操作或 WebGL 性能。
3. Supabase schema、匯入與 Google OAuth 仍需另行授權；保留舊 localStorage，先備份與 dry-run 對照，採穩定 ID／冪等匯入，禁止整份覆蓋。

本階段不需要帳號金鑰、SQL、部署、付費或任何使用者手動雲端設定。
