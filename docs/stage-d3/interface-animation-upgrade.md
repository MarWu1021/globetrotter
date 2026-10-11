# 介面與旅行動畫升級

日期：2026-10-11（台灣時間）。基礎為 `work` / `9e11ff36d3e94db020f866c89f4bfbb0899d16e6` 及開始時全部 63 個未提交檔案；沒有刪除、重置或提交先前 D3 成果。

## 五項功能

1. **動態登入封面**：按需載入既有 react-globe.gl / Three.js，緩慢旋轉、三條低密度球面弧線、霧藍海洋與奶油白介面。封面沒有指標事件，不阻擋登入按鈕。減少動態效果、背景分頁、節省資料／低硬體能力、明顯更新延遲、WebGL context loss 或載入例外時使用靜態 SVG。
2. **新增旅行成功動畫**：只從雲端 `saveTrip` 成功回應建立動畫計畫；版本衝突、未收到確認、失敗及本機儲存分支均不會播放。新旅行成功後關閉編輯器、返回地球，等待 WebGL 就緒，依儲存回應的獨立航段逐段顯示並移動相機。每段約三秒；拖曳、略過、背景切換、減少動態效果或開啟另一趟旅行可中斷。確認後的國家顏色、統計及航線仍由既有 savedTripMap 計算；編輯／刪除不重播新增動畫，也不累加統計。
3. **毛玻璃卡片**：共用 CSS class 與 token，低對比陰影、近乎不透明背景，桌面 6px／手機 4px blur；沒有 backdrop-filter 時使用實色。減少動態效果時停用 blur。範圍限於登入卡、統計、國家資訊、通知及底部導覽等表面。
4. **國家聚焦與資訊**：實際 3D 國家點擊後平滑移動相機、短暫加深邊界，資訊面板列出已確認、與該區域相關的旅行，可開啟編輯。2D 保留適用的平面選取高亮與國家資訊。功能填色及統計不受選取影響。
5. **手機底部導覽**：地球、旅行紀錄、新增旅行、統計、設定；五語言、安全區域、44px 以上操作高度。編輯器、紀錄視窗、草稿預覽及搜尋抽屜開啟時隱藏導覽。新增旅行可恢復未儲存內容。國家資訊面板停在導覽上方，避免遮住國家儲存按鈕；桌面側欄保持原有操作。

## 重要修復與效能處理

- 實際瀏覽器測試發現初次載入 WebGL 比動畫計時晚，現在以 onGlobeReady 啟用逐段計時。
- 動畫時間的單幀推進有上限，避免卡頓後整段消失；React 航線進度更新約每 80ms 一次，不改動航班資料。
- three-globe 的 polygonsTransitionDuration 只處理高度，不處理填色。因此國家變色另以 Three.js Color.lerp 與 RAF 做 650ms 漸變，2D 使用 fill transition。只複製正在改色的 cap material，不污染套件共用材質；結束／中斷時還原並釋放複本，不覆蓋較新的渲染更新。MultiPolygon 依唯一區域 ID 判斷準備完成，並等候渲染器套用伺服器已確認的目標色；已是綠色的國家不重新變灰。
- 手機成功提示移到工具列下方；國家資訊面板保留底部導覽的空間。完整 CRUD 回歸曾揭露儲存國家按鈕被遮擋，因此修正面板位置。
- 登入封面與私人工作區分開掛載，不同時維持兩個地球 canvas。封面 DPR 限為 1，弧線只有三條、曲線密度 32；沒有一次載入全球機場標記。
- 移除／中斷時清除 RAF、timer、媒體／可見性事件及 context-loss 監聽，釋放自建 material；隱藏頁面停止動畫。更新延遲偵測為保守降級措施，不是 iPhone 實測 FPS 保證。

## 修改範圍

新增：

- `src/components/login-cover.tsx`、`login-globe.tsx`、`journey-notice.tsx`、`mobile-navigation.tsx`
- `src/lib/presentation/journey.ts`、`use-motion-policy.ts`、`country-fade.ts`
- `scripts/test-presentation.mjs`、`test-presentation-browser.mjs`、`test-presentation-layout.mjs`
- 本文件

延伸既有檔案：

- `src/components/login-screen.tsx`、`trip-draft-provider.tsx`、`trip-editor.tsx`
- `src/components/globe-view.tsx`、`flat-map.tsx`、`map-stage.tsx`
- `src/components/country-panel.tsx`、`sidebar.tsx`、`travel-workspace.tsx`
- `src/app/globals.css`、`src/lib/i18n.ts`、`package.json`
- `scripts/test-cloud-data-browser.mjs`（新旅行成功自動關閉編輯器；CRUD 回歸使用 reduced-motion，動畫另有專用測試）

沒有新增套件，沒有修改旅行模型、雲端 repository、SQL 草稿、Google OAuth、Session 或 RLS 設計。

## 驗證與限制

- 自動化：282/282 通過；TypeScript、ESLint、五語言、正式建置通過。
- 新動畫／互動：24 組，桌面、390px、320px；實際地球點擊、相機聚焦、逐段動畫、略過、context loss、未確認／衝突不播、減少動態效果與登出。
- 五語言排版／低效能降級：6 組；底部五按鈕邊界、設定及靜態登入仍可操作。
- 登入／Session 回歸：33 組；恢復、重新整理、取消 callback、PKCE、登出／上一頁及舊本機資料隔離。
- 英國 SVG／WebGL 視覺：6 組通過；四個組成區域的實際內部像素。原 iPhone 異色仍未重現，沒有宣稱找出完整根因。
- 完整雲端 CRUD：39 組全部通過；包含國家紀錄的儲存失敗／重試、五語言與舊本機資料隔離。
- 最後國家材質漸變修正後的 24 組動畫重跑全部通過；測試記錄實際 render 呼叫後的 cap material 色彩，確認曾繪製介於未到訪與尤加利綠之間的過渡色，並保留最終 SVG／WebGL 色彩驗證。成功提示沒有遮住語言工具按鈕。以上為 108 組瀏覽器情境，並非 108 項單一斷言。

測試替身模擬登入過期時，同步讓 Session 查詢回報未登入；context-loss 測試使用同一個瀏覽器步驟查找仍存在的 canvas 並送出事件，以免自然降級後操作已卸載元素。沒有刪除情境或放寬顏色像素判斷。

Auth／Supabase 使用合成帳號及模擬 API；SVG／WebGL 是 Chromium 真正繪圖。沒有執行 SQL，沒有真正 Supabase CRUD／RLS、Google 成功登入或 iPhone Safari／實機效能驗證。本次沒有清除、匯入或上傳舊 localStorage，也未更動 main、Production、後台設定、commit、push、部署或付費服務。

最終 Git 查核：仍為 `work` / `9e11ff36d3e94db020f866c89f4bfbb0899d16e6`，共 76 個未提交檔案（包含原有 D3 修改）；開始時 63 個檔案全部保留，52 個內容完全未變，沒有 staged 檔案，git diff --check 通過。SQL 草稿與本次開始時完全相同；未提交檔案的秘密金鑰格式掃描無命中。未進行遠端 Git 更新或查詢。

主要紀錄位於 `/tmp/ui-upgrade-material-{unit,browser,lint,build,ts}.log`、`/tmp/ui-upgrade-final-login.log`、`/tmp/ui-upgrade-final-uk.log`、`/tmp/ui-upgrade-accepted-cloud.log`、`/tmp/ui-upgrade-delivery-layout.log`、`/tmp/ui-upgrade-fade-i18n.log`。

截圖：`/tmp/globetrotter-upgrade-login-animated-{1280,390,320}.png`、`/tmp/globetrotter-upgrade-home-{1280,390,320}.png`、`/tmp/globetrotter-upgrade-saved-{1280,390,320}.png`。儲存截圖的相機曾為色彩取樣聚焦，並非首頁初始縮放。

## 下一步

程式驗證完成後，可交付 SQL 啟用與 Preview 準備的人工審核；不表示資料庫已啟用。需另行核准審查後 SQL／RLS 的實際驗證，以及 commit、push、既有專案的一般 Preview 部署。新 Preview 建立後再加入完整 `/auth/callback` allowlist，之後進行真正雲端與 iPhone Safari 驗收。現在不要求手機操作，也不自行執行上述步驟。
