# 階段 3A：暫存旅行編輯

基礎分支 work，commit `5c19134e9585edb3c38809b489cb0363d5235886`。

## 操作

桌面點側欄「建立旅行」；手機先開「搜尋與我的旅行」抽屜，再點「建立旅行」。編輯器在手機為全螢幕，桌面為置中 modal；採原生 dialog，支援鍵盤焦點限制與 Escape 關閉。按需載入編輯器，未開啟時不載入編輯元件。

搜尋代碼、名稱、城市或繁中別名（至少 2 字），每次最多 12 筆。可選擇加入位置，加入出發地、中途與目的地；以箭頭重排、按鈕移除。第一個出發國固定實際到訪，其他停留可選旅遊或僅轉機。每段日期、航空公司、航班編號及備註均可空白。

旅行狀態必須由使用者選擇，不因日期經過自動完成。只有 completed 顯示這趟旅行的國家／機場足跡；其他狀態維持 0，但仍顯示航段／停留事件數。此為**單趟旅行獨立預覽**，不宣稱是加到既有地圖後的淨增國家数；既有國家紀錄沒有傳入計算，也沒有上色。

## 資料安全

僅 React 元件記憶體狀態。關閉編輯器保留暫存內容，重新整理／離開頁面會丟失；清除按鈕只清除此草稿並要求確認。全程標示「預覽／尚未儲存」，沒有假裝儲存的按鈕。

草稿純函式不依賴 React、store、localStorage、Supabase。重用 2A buildTripFromRoute、2B toCoreAirports / deriveCatalogFootprint，不重寫統計；相鄰停留事件共用前後航班參照，轉機依事件計一次。

航段欄位以精確的出發／抵達**停留事件 ID 配對**保存，不以陣列索引或機場代碼猜測。編輯路線時未變更的相鄰配對保留欄位；新配對清空，避免航班資訊錯配。UI 明確提示這項行為；目前沒有跨編輯操作的撤銷／歷史暫存。

特殊地區、非 ISO 資料維持 2B 待確認政策，搜尋結果提示且不能加入；不自動核准或改國家統計。未修改機場快照、原本機場圖層或 VTZ／SVO／PBI 對照。

## 搜尋與效能

`/api/airports` GET 在有效搜尋時才動態載入伺服器機場快照並建立索引，最多回傳 12 筆候選與對应機場主資料。輸入 debounce 250ms，取消舊請求；錯誤可重試。9,940 筆主資料沒有打包進瀏覽器。此 API 無任何外部網路呼叫、資料寫入、帳號金鑰或付費 API。

第一次搜尋／重試仍需連線至網站的同源 API；離線時可編輯已選的機場，但新搜尋不保證可用。之後需確認離線搜尋是否必要，再設計有限快取或分區索引。

## 驗證

```sh
npm run test:trip-draft
npm run test:travel-core
npm run test:airport-data
npm run test:i18n
npx tsc --noEmit --incremental false
npm run lint
npm run build
npm run start -- --hostname 127.0.0.1 --port 3005
# 另一個雲端終端；使用環境既有 Playwright / Chromium，不新增應用依賴：
node scripts/test-trip-editor-browser.mjs
```

瀏覽器測試以獨立 context 注入測試用到訪、Wishlist、Blocked、筆記及評分，不接觸使用者實際瀏覽器。測試桌面 1440×1000、iPhone 尺寸 390×664、窄螢幕 320×640 的搜尋、多段編輯、完成狀態、顏色、選填資訊、原生 modal、橫向溢出、localStorage 位元組保持一致與刷新清除草稿。Chrome 的手機模擬不是 Safari；本環境 WebKit 下載被網路政策 403 阻擋，真正 iPhone Safari 仍待實機驗證。

階段 3B 的地球點選、飛行弧線渲染／預覽、機場密度控制與正式保存均未實作。沒有 commit、push、部署、SQL、OAuth 或付費設定。
