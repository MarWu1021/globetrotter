# D3：獨立登入頁面與英國地圖查核

查核日期：2026-10-11（台灣時間）。分支 `work`，HEAD `9e11ff36d3e94db020f866c89f4bfbb0899d16e6`。本次修改尚未提交；保留開始時全部 48 個 D3 未提交檔案，未重置、刪除或覆蓋先前成果。

## 登入與資料隔離

- 新增 `/login`：品牌、旅行視覺、五語言選單、Google 登入按鈕與設定／登入錯誤提示，沿用霧藍奶油白主題。
- 共用根層 AuthProvider。驗證完成以前只顯示載入畫面；未登入導向 `/login`，有效 Session 直接進入首頁，登出後返回登入頁。
- 保留 PKCE、伺服器 callback 授權碼交換、cookie Session 更新與伺服器端帳號驗證。callback 失敗回到同來源 `/login`；不接受任意外部返回網址。
- 私人工作區以已驗證使用者及 Session generation 隔離。pagehide 同步卸下私人畫面，pageshow 重新驗證，避免瀏覽器上一頁／下一頁恢復舊帳號畫面。
- 主畫面不會因缺少設定而退回舊 localStorage 旅行模式。舊測試旅行沒有被讀取、匯入、上傳或清除。
- Service Worker 升級快取版本，首頁、登入頁、OAuth callback、API、RSC 與導覽回應不進入應用程式快取；保留公開靜態資源快取。登入畫面本身不代替私人 API 的伺服器授權檢查。

## 英國查核結論與限制

平面地圖使用 world-atlas 50m，地球使用 110m，兩者均以既有 `subunits.json` 真實邊界取代英國父區域。實際 ID 為 `826-eng`、`826-sco`、`826-wal`、`826-nir`。邊界方向、內部點、面積及測試點的區域互斥性正常；沒有建立新地理邊界。

**確認並修正的問題是繁體中文名稱對照**：原本別名使用 `gb-*`，未對應實際四個 ID，因此名稱退回共同的 GB「英國」。現在搜尋及面板能辨識英格蘭、蘇格蘭、威爾斯與北愛爾蘭。國家統計仍以 GB 計一國；到訪綠色優先於轉機藍色。

**使用者原先 iPhone 的異色在目前 work、乾淨的模擬帳號中未重現，因此無法確定原畫面的真正成因，也不能宣稱已找到原異色的根因。** 目前兩種渲染元件共用既有 D3 色盤：到訪 `#6F9E91`、轉機 `#8BB6CE`、未到訪 `#D8E0E3`。沒有新增英格蘭專用填色，亦未更改地圖統計邏輯。

實際 SVG 與 Chromium 軟體 WebGL 畫面取樣確認四區均為未到訪灰色，涵蓋桌面、390px、320px。SVG 取樣先確認縮放／平移完成、內部點與實際命中區域；WebGL 等待相機、材質、尺寸及繪製完成後取樣。未使用固定延遲掩蓋繪製問題。

## 本次新增及延伸檔案

新增：

- `src/app/login/page.tsx`
- `src/components/login-screen.tsx`
- `src/components/auth-gate.tsx`
- `src/lib/auth/navigation.ts`
- `scripts/test-login-map.mjs`
- `scripts/test-login-browser.mjs`
- `scripts/test-uk-map-browser.mjs`
- 本審查文件

修改／延伸（既有 D3 改動仍保留）：

- `src/app/layout.tsx`：根層 AuthProvider。
- `src/components/auth-provider.tsx`：瀏覽器恢復前私人畫面隔離。
- `src/components/travel-workspace.tsx`：驗證後才掛載私人工作區。
- `src/components/sidebar.tsx`：國家搜尋固定、翻譯的 accessible label。
- `src/lib/auth/flow.ts`、`src/proxy.ts`：登入路由與 callback 失敗導向。
- `src/lib/i18n.ts`：五種語言登入文字。
- `src/lib/localized-country.ts`：實際 UK 區域 ID 的繁體中文名稱。
- `public/sw.js`、`scripts/test-auth-cache.mjs`：私人／導覽回應快取排除。
- `scripts/test-google-auth.mjs`、`scripts/test-google-auth-browser.mjs`、`scripts/test-cloud-data-browser.mjs`：新登入流程回歸。
- `package.json`：納入新自動化測試。

SQL 草稿、旅行模型、雲端 repository、航空公司資料及上一階段配色成果未因本次登入／地圖查核被替換。

## 測試結果

| 項目 | 結果 | 驗證範圍 |
| --- | --- | --- |
| 自動化測試 | 262/262，0 失敗 | 保留原有測試，新增登入路由、快取、UK 邊界／顏色／名稱及 accessible label 回歸 |
| TypeScript、ESLint、五語言 | 通過 | 本機程式檢查 |
| 正式建置 | 通過 | 專案預設 Turbopack；測試副本亦以 Webpack 建置通過 |
| 登入瀏覽器情境 | 33 組通過 | 三尺寸各 11 組，載入、取消 callback、Session 恢復、登出／上一頁、五語言、舊資料隔離 |
| 雲端旅行 UI | 39 組通過 | 三尺寸 CRUD、重複／版本衝突、錯誤、航空公司、地圖／重整、帳號切換與舊資料隔離 |
| 額外雲端隔離測試 | 6 組通過 | 寫入前驗證、登出、延遲載入及手動國家儲存 |
| Google 流程回歸 | 30 項瀏覽器斷言通過 | 既有 Google 登入流程測試 |
| UK 視覺回歸 | 6 組通過 | 三尺寸各 SVG 與 WebGL，四個實際區域的內部像素 |

測試使用合成帳號與模擬 Auth／雲端 API；瀏覽器確實發出 PKCE 請求並執行取消 callback，SVG／WebGL 亦確實繪圖。**這不代表真正 Google 成功登入、Supabase CRUD／RLS 或 iPhone Safari 已實測通過。** 沒有連線執行資料庫 SQL，沒有要求測試帳號或手機操作。

舊的僅本機、免登入瀏覽器腳本並未全部重新執行；其入口已由產品要求改為必須登入。本次使用對應的新登入／雲端工作區回歸情境。

主要執行紀錄位於 `/tmp/d3-login-ready-{unit,browser,cloud,uk-complete,build}.log`。額外情境紀錄為 `/tmp/d3-login-verified-{owner,country,google}.log`；最後一次 sidebar accessible label 修改不涉及這些額外情境的 Auth／repository 邏輯。

截圖：

- `/tmp/globetrotter-login-1280.png`
- `/tmp/globetrotter-login-390.png`
- `/tmp/globetrotter-login-320.png`
- `/tmp/globetrotter-uk-{1280,390,320}-{flat,globe}.png`

UK 截圖為區域聚焦後的診斷畫面，並非首頁初始相機構圖。

## 進入真正 Preview 驗證的最少後續步驟

1. 使用者核准後才提交、推送及部署一般 Preview；本次沒有執行上述操作。
2. 若審核後的 SQL 尚未在 Supabase 啟用，需要使用者另行核准／執行並確認 RLS，才可真正雲端儲存。本次未查詢即時資料庫，不能確定其已啟用。
3. 新 Preview 產生後，將其完整 `/auth/callback` 加入 Supabase Redirect URLs；不需要重新建立 Google OAuth Client 或 Supabase 專案。既有 Preview 公開環境變數須保持配置。
4. 之後才驗收真正 Google 登入、Supabase 讀寫、跨裝置與 iPhone Safari，並比對原 UK 異色。

沒有更改 main、Production、Vercel 設定、OAuth 設定、Supabase 後台或 localStorage；沒有執行 SQL、commit、push、部署或付費操作。
