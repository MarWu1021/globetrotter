# 英國平面地圖聚焦與測試診斷修復

2026-10-11（台灣時間）。基礎為 `work` / `9e11ff36d3e94db020f866c89f4bfbb0899d16e6`，保留開始時全部 76 個尚未提交檔案。

## 原因與證據範圍

- 原失敗紀錄顯示縮放停在約 1.7416，但沒有動畫中斷／尺寸追蹤；`base` 尚未建立時的診斷又拋出 TypeError，遮蔽最初的聚焦等待錯誤。
- 本次先修復診斷，再以原版本、相同資料與 1280／390／320px 重跑，原有 6 組英國 SVG／WebGL 檢查均通過。因此無法斷言上次確切由哪個事件觸發，也不能把延長等待當作修復。
- 查得並實際重現一項網站缺陷：地圖尺寸變更會重新執行旅行預覽 effect；即使沒有開啟預覽，它仍無條件 `svg.interrupt()`。國家聚焦 effect 只依賴 focusId，未依新尺寸重新定位，結果可能是中途縮放或沿用舊中心。
- 受控調查記錄包含實際 d3 interrupt 呼叫堆疊、尺寸、縮放及截圖。最初調查曾延長診斷動畫以觀察中斷順序；正式回歸測試使用原本 700ms 動畫，不改變時間或縮放值。
- 正式測試觀察 d3 寫入 `__zoom` 的事件，在仍有效的 transition 期間調整容器高度 6px。此為測試布局刺激，沒有替換網站的 zoom 函式或動畫 clock。測試要求到達 **2.5** 及新尺寸下的正確國家中心，並繼續驗證真實 SVG 內部像素與四個英國區域的 WebGL 像素。
- 與原始平面地圖檔案 SHA-256 完全相同的修復前隔離 build，在正式回歸測試中失敗：transition 狀態為 RUNNING（4）時觸發尺寸變更，實際捕捉到 `interrupt`；30 秒後 `__zoom.k` 仍為 2.3098638734，而實際 SVG CTM 比例為 1.0445600748。尺寸更新清掉待執行的 React transform 更新，兩者都未到達 2.5。證據：`/tmp/globetrotter-focus-baseline-proof.{json,png}`，不是刻意放慢的早期診斷案例。

這與先前 iPhone 回報的英國異色不是同一項已確認原因；原 iPhone 異色仍未在環境中重現，保留相關幾何、顏色與國家統計測試。

## 最小修復

1. 平面地圖 zoom effect 清理時中止所屬 transition，避免舊 viewport 的動畫繼續寫入。
2. 國家聚焦在地圖寬／高更新後依新投影重新執行。
3. 未處於預覽、亦無待還原預覽相機時，預覽 effect 直接返回，不中斷一般國家聚焦或使用者縮放。
4. 診斷探針各自捕捉錯誤；沒有合法座標時輸出原因。國家座標在聚焦等待前取得，失敗時可回報實際 CTM、命中區域與畫面位置。保留原始例外與失敗截圖。

沒有更動顏色、地理邊界、GB 國家計數、多航段模型、雲端 CRUD、Session、OAuth、localStorage 或 SQL。

## 檔案

- `src/components/flat-map.tsx`
- `scripts/test-uk-map-browser.mjs`
- `scripts/test-login-map.mjs`
- 新增 `scripts/browser-flat-diagnostics.mjs`
- 新增本文件

## 驗證

| 檢查 | 最終結果 |
| --- | --- |
| 全部自動化（含 SQL 靜態、兩項新增診斷測試） | 287／287 |
| 英國 SVG／WebGL 與聚焦途中尺寸變更 | 9／9 組 |
| 完整介面／旅行動畫 | 24／24 組 |
| 五語言排版與低效能降級 | 6／6 組 |
| 雲端 CRUD、地圖像素、重試／衝突、帳號隔離 | 39／39 組 |
| 登入／Session／PKCE／callback 取消／登出 | 33／33 組 |
| TypeScript、ESLint、五語言檢查、正式建置 | 全部通過 |

瀏覽器共 **111／111 組**，全部涵蓋 1280px 桌面、390px 與 320px；先前未完成的 320px 動畫完整通過。使用 production build，瀏覽器 build 的 `src` 全部檔案已逐一確認與工作目錄相同。沒有刪除原測試、放寬縮放／填色斷言或增加固定等候時間。

修正前正常場景重跑與受控缺陷重現分開記錄：前者 6／6 通過，後者按預期失敗，用以證明新測試可抓出舊版缺陷；後者不是現行修復版本的失敗。現行版本的 111 組完整回歸沒有失敗。

記錄：`/tmp/globetrotter-focus-{all-unit-final,i18n-final,types,lint-final,build,uk-accepted,animation,layout,cloud-browser,login-browser}.log`。

修正前證據：`/tmp/globetrotter-focus-baseline-proof.{json,png}`。修正後聚焦追蹤：`/tmp/globetrotter-uk-focus-{1280,390,320}-{826-eng,826-sco,826-wal,826-nir}.json`；平面／地球截圖：`/tmp/globetrotter-uk-{1280,390,320}-{flat,globe}.png`。儲存、退出與重新整理的截圖亦由雲端回歸測試產出於 `/tmp/d3-cloud-*`。

本次自動化阻擋已解除；提交、Preview 部署及正式雲端／實機驗收仍需下一次授權。

測試使用 production build、合成帳號與攔截的 API，SVG／WebGL 由 Chromium 真正渲染。沒有登入真實 Google 帳號、連線 Supabase、驗證實際 RLS 或使用真正 iPhone Safari。

最新 SQL 保持 SHA-256 `75e00f2c30aa407837d7cb5404992b7232bd4b7a451d2e1cf86fba069246174a`。沒有 commit、push、部署、Git 分支修改、Production／後台設定操作，沒有清除或匯入任何既有瀏覽器資料。

原 76 個檔案全部保留，其中 73 個內容完全未變；本次延伸 3 個原檔並新增 2 個檔案，現共 78 個未提交檔案。HEAD 與 GitHub work 均仍為 `9e11ff36d3e94db020f866c89f4bfbb0899d16e6`；遠端 main 為 `0132dfbcd4d201a2a63e2a373a000ca164a79eaa`，唯讀核對未變。沒有 staged 修改，`git diff --check` 通過。
