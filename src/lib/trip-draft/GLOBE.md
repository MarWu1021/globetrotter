# 階段 3B：地球選取與旅行預覽

所有內容仍為記憶體草稿，不讀寫既有旅行紀錄或新增永久保存。無 SQL、OAuth、Git 提交／推送或部署。

- 旅行編輯器按「在地球上選取機場」進入預覽。也可搜尋後按「在地球上查看」定位，不會直接加入。
- 地球機場點選只開確認卡，包含名稱、代碼、城市、國家；必須再按「確認加入機場」。搜尋、地球與插入位置共用同一份草稿。
- 選取期間暫停 Auto-spin（不修改使用者偏好），定位立即完成；定位機場按鈕優先於重疊標記。離開後恢復原本自動旋轉。
- 手機進入地球模式會關閉原有抽屜，既有資訊卡在選取期間隱藏（不清除開啟狀態），底部確認卡保留可拖曳／縮放的地球空間。「返回編輯器」保留欄位，「離開地球預覽」還原既有地球顏色與畫面。
- 原生編輯 modal 移到工作區根層，避免手機側欄隱藏時也把編輯器藏起來。
- `/api/airports/nearby` 只在啟用模式與手勢結束時依目前視角載入最多 32 筆可靠 ISO 機場；縮放調整間距。使用已選／搜尋／區域資料合併桌面最多 48、手機最多 16 個標記，優先目前定位的機場並消除近距離標記。被隱藏的機場可用搜尋定位，不代表刪除資料。
- 非 ISO、待核准特殊地區、停用或國家歷史異動未審核機場不加入可選標記，不猜國家，不改 VTZ／SVO／PBI 對照。
- 8px 以內單指才算點選；多指、移動或取消不開選取卡，旋轉不新增草稿。仍須獨立確認加入。
- `draftGlobePreview` 呼叫 2A `buildArcDescriptors(...,true)`，保留每段獨立 flightId。金色靜態虛線是球面示意預覽，不是即時飛機。只有 completed 呼叫既有足跡結果並以 2B 確認的 globeGeoIds 上色；其他狀態保留既有底色。
- 機場選取期間，飛機、ISS、日月維持顯示但暫停點擊，避免它們遮住機場觸控；離開模式恢復。
- 預覽期間不顯示既有國家狀態浮動提示，避免舊「尚未造訪」文字與未儲存預覽顏色混淆。
- 不使用 LiveFlight 作為使用者航班，不改平面地圖、原國家紀錄、機場來源或即時資料輪詢。

## Auto-spin 修正

原本 OrbitControls 的 change 事件每幀發生，連續重設 150ms 計時器，Auto-spin 使標記持續隱藏。改為只在 start/end 手勢期間隱藏、end 後恢復；切換模式／尺寸時也安排復原，不以持續 change 延長隱藏。

## 效能與限制

預覽點位合併為一批 GPU 幾何；原有圖層保持未合併，保留原有個別點選。預覽中的 HTML 機場按鈕提供觸控目標。編輯器開啟時暫停背景地球動畫。無航線動畫，曲線解析度 64；渲染高度使用角距離安全下限，端點高度 0.015，避免近對側長航線的 Bézier 曲線或管線厚度穿入球體，不改 2A 描述值。預覽限制 DPR 為 1，離開還原原引擎 DPR 上限 2；文字按鈕仍是清晰 DOM。

雲端 Chromium 使用軟體 WebGL，幀率不代表實際 iPhone GPU；不宣稱手機效能已達標。較密集地區以搜尋／定位補充點選，最多 48 個標記不是全球所有機場。真正 iPhone Safari（含雙指縮放、發熱與持續操作）仍需實機測試；本環境 WebKit 下載被網路政策阻擋。

## 驗證指令

`npm run test:trip-globe`、所有既有測試、TypeScript、ESLint、`npm run build`。啟動本機正式建置測試伺服器 `npm run start -- --hostname 127.0.0.1 --port 3005` 後，執行：

```
node scripts/test-trip-globe-browser.mjs
node scripts/test-trip-editor-browser.mjs
```

瀏覽器使用獨立測試 context，不接觸使用者瀏覽器。即時飛機以測試資料驗證相容性，不代表外部即時服務已完成驗證。

## 階段 3C：獨立查看模式

手機查看模式的面板排在地圖下方，不覆蓋地球；選取模式維持確認卡。查看模式仍可自動旋轉，僅機場選取模式暫停 Auto-spin。

編輯器提供兩個操作：「查看旅行預覽」與「在地球上選取機場」。模式互斥；查看模式不產生機場確認卡，也不新增停留事件。查看模式保留目前地圖類型，可切換地球／平面地圖；切換只存於草稿 Context，不改既有持久化視圖偏好。

Provider 只計算一次 `draftGlobePreview`，兩個渲染器共用結果。`colors` 使用確認的 globeGeoIds，`flatColors` 使用 flatGeoIds；皆來自同一個 2A 足跡計算。地球提供示意弧線，平面地圖本階段只顯示國家顏色。未完成狀態沒有衍生國家顏色，原有到訪顏色仍保留。離開預覽／返回編輯器恢復原狀，記憶體草稿保留；單純關閉編輯器不代表保存或啟用預覽。

新增回歸驗證：`node scripts/test-trip-preview-browser.mjs`（本機正式建置伺服器啟動後）。涵蓋 TPE→KCZ、TPE→DXB→ATH、三種未完成狀態、兩種渲染器、退出恢復、草稿保留、防誤觸，以及 `globetrotter:v1` 逐字不變。Safari 實機效能與雙指縮放仍待驗證。

## Stage A: visible country preview regression

Reproduction on the production build: select Argentina from the existing country
search, create completed TPE → KCZ, open the travel preview, then switch to globe.
The legacy focus effect ran after the trip camera effect, showing Argentina while
Taiwan/Japan had correct green materials on the far side. The flat map retained
its previous Argentina zoom: Japan's path was outside the viewport despite a
green fill. This demonstrates a visibility failure, not an ISO mapping failure.

Preview now isolates the legacy focus and late geolocation camera updates, uses
a flat view fitted to the footprint countries (restoring the previous transform on exit), and offers
country buttons to view each footprint on the globe. Preview colors do not use
the legacy selected-country lightening. All buttons reuse existing locale keys.

Run `node scripts/test-trip-visual-browser.mjs` against a local production server
(default port 3005, overridable with TEST_URL). It uses a fresh browser context,
real search/editor/button actions, projected inland points, and screenshot pixel
assertions for green/blue WebGL and SVG output, plus exit restoration and unchanged
legacy data. React ref traversal is confined to the test; no production test
hooks are added. The renderer is briefly paused after rendered frames to capture
stable screenshots. Chromium software WebGL and iPhone-sized emulation are not
real iPhone Safari or hardware performance acceptance. No persistence or status
selector changes are included in this phase.

Country bounds determine preview framing instead of resetting to world zoom 1.
The desktop fit excludes the review controls: the three-country regression
placed Taiwan underneath that panel even with a correct SVG fill. The iPhone browser profile uses its native DPR; the application
retains its existing preview WebGL DPR cap. Desktop review controls sit at the
right edge so their expanded country list does not cover the focused country.

SVG pixel assertions wait for the existing 150ms CSS fill transition to finish
(computed color, not only the fill attribute) before capturing the painted result.

Mobile country buttons use names and color dots to preserve globe height; the
desktop retains the longer presence labels. Repeated buttons refocus after
manual camera movement without changing the draft. The screenshot regression
includes a real pointer drag before clicking the same country again. A separate
production-browser check with the legacy airport layer enabled retained visible
green Taiwan; that layer was not removed or rewritten.

The repeated-focus regression also measured residual OrbitControls damping:
TPE longitude 121.233 drifted to 113.592 after a drag and refocus. Preview jumps
flush the pending angular delta once, restoring enableDamping immediately;
ordinary drag/zoom and auto-spin configuration remain unchanged.
