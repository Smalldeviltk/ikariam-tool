# Prompt — Quy trình review source (ikariam-tool)

Prompt chuẩn để review một thay đổi của ikariam-tool (TypeScript, hai userscript + extension Chrome, test bằng vitest/happy-dom), **trước** khi commit, trước khi build `dist/` cho người dùng cài, hoặc khi người dùng yêu cầu review.

> **Nguồn:** dựng lại từ bản review workflow của một project khác (SAMS — FastAPI + DB + React), bản người dùng đưa ở `sample/prompts/review-source-workflow.md` (thư mục `sample/` bị gitignore, có thể không còn). Giữ **cấu trúc** của bản đó (5 nguyên tắc → MAP → EXPAND → PASSES → PROVE → REFUTE → REPORT), bỏ hết phần của SAMS (DB, migration, seed, OpenAPI, 画面設計, FastAPI) và **xếp lại các pass theo số lỗi thật của project này** (mục ngay dưới). Hai lần review trước của project (§2.D ngày 25/09, §2.X ngày 04–05/10 trong `docs/improvement-plan.md`) chạy theo một bản trước của file đó (đường dẫn khi ấy `sample/prompt/review-source-workflow.md`); bản đó khác bản hiện tại thế nào thì chưa đối chiếu.

## Năm nguyên tắc — mọi thứ dưới đây chỉ là cách thực thi 5 câu này

1. **Đơn vị review là HÀNH VI trên game thật, không phải dòng diff.** Không hỏi "dòng này viết đúng chưa"; hỏi "chạy cái này trên trang Ikariam thật — town nào, tab nào, máy nào — thì cái gì đổi: hàng nào bị gửi, building nào bị bấm, key localStorage nào bị ghi, notepad nào bị đổi, ai đọc lại nó".
2. **Mọi finding phải có bằng chứng thi hành**: tiền đề đọc được ở `file` + symbol (hoặc `file:line` tại một commit đã ghi rõ) → trace thứ tự chạy thật → input/state cụ thể → vì sao sai. Không viết được trace thì chưa phải finding.
3. **Tự phản biện trước khi báo.** Một lượt riêng, đọc lại code với ý định **bác bỏ** finding của chính mình.
4. **"Chưa đo" không phải "sạch".** happy-dom **không có layout**, không có CSS của game, không có server game: mọi khẳng định về hiển thị, về phản hồi của game, về nhiều tab/nhiều máy mà không đo trên game thật thì nằm ở CHƯA ĐO.
5. **Tự review diff của chính mình là đọc để XÁC NHẬN ý định, không phải để tìm lỗi.** Phiên 21–23/11 có 12 lỗi của chính tôi và 1 defect lộ ra khi làm (bảng S3 dưới); hai lỗi layout trong đó đều có test xanh trước khi người dùng thấy hỏng trên game. Hai câu bắt buộc trước khi kết thúc: _"test mới này đã có bằng chứng ĐỎ chưa, hay chỉ thấy nó xanh?"_ và _"nếu diff này do người khác viết, câu đầu tiên tôi hỏi là gì?"_

## Vì sao các pass xếp theo thứ tự này — đếm trên chính project

Bốn nguồn, **mỗi nguồn một bảng, không cộng dồn** (các nguồn chồng nhau: `1baf274` trong S4 chính là các bản sửa của S2; mục của S1 có thể cũng nằm trong commit của S4). Phân loại là **của tôi**, mỗi mục xếp đúng **1 trục chính**. Mẫu nhỏ (13–21 mục mỗi nguồn): con số chỉ đủ để **xếp thứ tự pass**, không đủ để nói tỉ lệ chính xác.

**Trục:** A = hợp đồng với game & trạng thái trang (DOM, `ikariam.model` theo view, response AJAX, town hiện tại, token, chữ của game) · B = runner, thứ tự thi hành, ranh giới reload, nhánh lỗi · C = nhiều tab / nhiều máy (TabLock, mốc runner bận, notepad) · D = test có kiểm đúng cái nó nói không · E = UI/layout trong trang game · F = bảo mật / rò dữ liệu · G = build, bundle, strict ESM, nền tảng, công cụ đo · H = logic nghiệp vụ · I = chất lượng code, global rule, tài liệu.

| Nguồn                                                                              | Cách lấy lại đúng tập này                                               | A      | B   | C   | D     | E     | F   | G   | H   | I        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ | --- | --- | ----- | ----- | --- | --- | --- | -------- |
| **S1** README "Bugs introduced by this refactor" (16 dòng)                         | lệnh (1) dưới bảng                                                      | **9**  | 4   | 0   | 0     | 0     | 0   | 3   | 0   | 0        |
| **S2** Review toàn `src` 04–05/10 (plan §2.X: 17 mục + 3 "tìm thấy trong lúc sửa") | bảng §2.X phần 2 và phần 3                                              | 4      | 2   | 0   | 3     | 0     | 2   | 0   | 3   | **6**    |
| **S3** Phiên 21–23/11 (13 = 12 lỗi của chính tôi + 1 defect lộ ra khi làm)         | plan §2.AM phần 3, 4, 6 (6 mục) + phiên 23/11 chưa ghi vào plan (7 mục) | 0      | 1   | 1   | **4** | **3** | 0   | 2   | 1   | 1        |
| **S4** Commit sửa lỗi sau khi port (21; 1 là đợt review = S2)                      | lệnh (2) dưới bảng                                                      | **10** | 5   | 2   | 0     | 0     | 0   | 1   | 2   | (1 = S2) |

```bash
# (1) S1: số dòng của bảng trong README — ra 16
awk '/^### Bugs introduced by this refactor/{f=1;next} /^### The startup smoke test/{f=0} f && /^[|] `/' README.md | wc -l
# (2) S4: commit "fix" từ ngày bắt đầu sau port — ra 21. Phải ghi giờ: `--since=2026-09-21`
#     không có giờ thì git lấy giờ hiện tại của ngày đó và bỏ sót `edb962a`.
git log --since='2026-09-21 00:00' --format='%h %s' | grep -E '^[0-9a-f]+ fix'
```

Chi tiết phân loại để người sau kiểm lại:

- **S1** — A: `getSourceSupply` (so một giá trị với chính nó → lấy town trên màn hình), `recordCurrentTown` (tên từ breadcrumb, số từ model — cập nhật ở hai bước khác nhau), `setInputValue` (blur hai lần), `LanguageData` chỉ có `en`, `accountName` ném lúc khởi động, `readWineBoard` (hàng town chưa nạp hiện `"0.00"`), `getFreeShips` (model theo view báo 0 tàu), `#position1` chỉ có ở town view, subscriber `ajaxResponse` index thẳng vào response. B: `handleUpgradeBuilding` trả `retry` ghim queue, đọc số tàu trước khi điều hướng, chờ sau submit có thể ném (→ gửi lặp), `void scanBuildings()` nuốt rejection. G: ba module không ai import, gán vào getter trong strict ESM, IIFE mất `this` trong strict mode.
- **S2** — A: subscriber ném làm board ngừng nhận response; response fetch đổi "town hiện tại"; không có nút Submit vẫn tính đã gửi; tên town đọc bằng `innerHTML`. B: vòng reload qua lại khi hết action point; Start một vòng mất ở lần đổi town (cờ chỉ trong bộ nhớ). D: thiếu test; test để lại interval sau `vi.resetModules`; test escape xanh cả khi bỏ escape. F: token `actionRequest` lọt vào Bug Report; Import tin mọi thứ trong file (→ XSS). H: cảnh báo hết rượu sai cho town nguồn; Bug Report mất snapshot đầu; keep-alive bỏ phút :00. I: 39 tham chiếu mục plan trong comment/tên test (rule 11), `var`/`any`, code chết, chuỗi trạng thái, logic lặp, tài liệu cũ.
- **S3** — B: Crawl by id báo mọi lỗi là "selector sai". C (defect lộ ra khi làm, plan ghi là "Lỗi tìm thêm trong lúc làm", không phải lỗi của tôi): claim xong, đồng bộ đã hẹn ghi lại mục vừa claim lên notepad (§2.AM phần 3). D: spy `Storage.prototype` không bắt `localStorage` của happy-dom; `mockResolvedValueOnce` lọt sang test sau (§2.AM phần 4); bộ lọc `::` là code chết — làm hỏng không test nào đỏ; `mockImplementationOnce` lọt sang test sau. E: bỏ `<br/>` khi sheet của tool float mọi dòng → cột rộng 3.518 px; hàng flex đứng cạnh float của header popup → bảng bị ép 0 px; đổ lỗi `−` nằm trái `+` cho CSS của game trong khi rule `float: right` là của tool. G: đọc exit code của `tail` thay vì `tsc`; cả phiên chỉ chạy `tsc -p .`, quên `tsconfig.strict.json` (`npm run typecheck` chạy cả hai). H: đề xuất "level cao nhất" mà chưa thấy trường hợp xoá level thấp. I: doc comment bị đẩy lên trên hàm khác.
- **S4** — A: `8d0293d` token phiên mới, `cefcc92`, `3f8a51b`, `32fe3ba` cảng biển đổi UI, `c38dca4`, `453482b` tài khoản hiện toạ độ, `225f6ae`, `760b690`, `d41fe28`, `03d07fa`. B: `58c3da4`, `a62e8dd`, `24061f0`, `a7c088a` (xác nhận upgrade đã bắt đầu rồi mới bỏ mục queue), `1c0548c`. C: `94d359e` (claim trong notepad trước khi mở building), `1f7c0e7` (khoá runner một tab). G: `9c363f7` (manifest). H: `f1dba48`, `edb962a` (trừ wine press khỏi lượng rượu tiêu thụ).

**Ba kết luận:**

- **Trục A lớn nhất ở cả hai nguồn lỗi thật trong code đã viết (S1 — lỗi do refactor, bắt được ở review sau: 9/16; S4 — commit sửa lỗi: 10/20 sau khi bỏ commit của đợt review)** — game đổi UI, model chỉ đúng cho view đang mở, town trên màn hình khác town của dữ liệu. Diff nào chạm DOM/model/AJAX của game phải qua P2 kỹ nhất.
- **Trục I (chất lượng code) chỉ xuất hiện khi review được dặn soi nó (S2 6/20)** và không có mục nào loại này trong S1, S4. Giống kết luận của bản SAMS ⇒ đẩy xuống pass cuối.
- **Trục D + E chiếm 7/12 lỗi của chính tôi (S3)**: test xanh vì lý do sai, và layout không đo được trong happy-dom. Hai lỗi layout của S3 chỉ lộ ra khi người dùng thấy trên game, trong khi test của chúng đều xanh ⇒ P1 chạy trước tiên, P6 có bước đo bắt buộc trên game.

---

# Phase 0 — MAP (hiểu thay đổi; **cấm kết luận lỗi ở phase này**)

```bash
git fetch origin
git status --short                      # thay đổi chưa commit
git diff --stat HEAD                    # phạm vi chưa commit
git log --oneline origin/refactor..HEAD # commit chưa push (nhánh làm việc: refactor)
git diff --stat origin/dev...HEAD       # khi review cả nhánh trước khi gộp vào dev
```

> 🔴 **Tiêu đề commit / tên mục plan không phải bằng chứng về nội dung.** Một commit `feat:` có thể chứa nhiều bản sửa (`e7f2acb` "… three review fixes", `fac13d6` "… fix lost and repeated shipments, Empire Overview subscriber errors"). Luôn đọc `--stat` và diff trước khi nói tính năng nào bị động tới.

Lập bảng **theo hành vi, không theo file** — mỗi dòng là một hành vi đổi:

| #   | Hành vi đổi | file + symbol | Loại | Ai/cái gì tiêu thụ nó |
| --- | ----------- | ------------- | ---- | --------------------- |

`Loại` chọn trong: `game-contract` (selector DOM, field của `ikariam.model`, response AJAX, URL/view, chữ của game) · `game-action` (bấm nút/gửi form làm đổi trạng thái game: gửi hàng, nâng cấp, capture) · `storage` (localStorage/sessionStorage/notepad) · `runner` (task, outcome, thứ tự) · `cross-tab/machine` · `UI` (dialog, panel, CSS) · `test` · `build/platform` · `docs`.

Bắt buộc liệt kê riêng, vì đây là chỗ hay bị bỏ:

- **Mọi hành động lên game** (submit form, bấm Upgrade, đổi town) — kèm: chạy ở town nào, sau khi xác nhận điều gì, nếu ném lỗi giữa chừng thì task còn trong queue không (→ chạy lại = gửi lặp).
- **Mọi key storage bị ghi hoặc xoá** — key nào (`KEY` trong `send-resources/state.ts`, key riêng của Empire Overview), theo account nào, có đi qua notepad không, có trong bảng phân loại export `core/data-transfer.ts` (`DataGroup`) không.
- **Mọi chỗ đổi town / reload trang** — đổi town là **reload cả trang**: mọi trạng thái chỉ nằm trong bộ nhớ mất ở đó.
- **Test thêm/sửa**: mỗi test **claim** kiểm gì (tên test, nguyên văn).
- **CSS / sheet** bị chạm: `ui/styles.ts`, các sheet `ensureStyle(...)`, style inline.

# Phase 1 — EXPAND (mở context NGOÀI diff; bắt buộc)

Với **mỗi dòng** ở bảng Phase 0:

1. **Caller/callee của symbol đổi** — `grep -rn "<tên>" src tools` rồi mở từng chỗ. Diff hiếm khi chứa thứ tự thi hành thật.
2. **Consumer** — quét **hết**, không chỉ thư mục đang sửa:
   - Hai bundle (`src/send-resources`, `src/empire-overview`) **chỉ chung nhau `document`, `window`, `localStorage`** — đổi một key, một id DOM, một class mà bundle kia đọc là phá nó mà không lỗi biên dịch nào.
   - `src/extension/` (content script chèn `page/*.js` vào trang; `view-guard.ts`), `tools/` (`collect-dom-report.js`, `wine-transport.js` đọc file crawl).
   - `core/data-transfer.ts` + test của nó: key mới chưa phân loại thì Export/Import xử lý sai.
   - `send-resources/queue-note.ts`: thứ gì vào notepad thì **sang máy khác**, kể cả việc **xoá**.
     🔴 **Cách phát ngôn bắt buộc:** "grep không thấy consumer" **≠** "an toàn để đổi". Viết: _"đã verify trong `src/` và `tools/` không ai đọc key này; bản cài cũ trên máy người dùng và notepad trên server vẫn còn dữ liệu cũ."_
3. **Sự thật đã đo về game** — `docs/session-handover.md` §2 "Measured facts about the live game" và §4 "Environment traps". Không suy diễn hành vi của game khi đã có số đo; chưa có số đo thì ghi CHƯA ĐO.
4. **Quyết định đã chốt** — handover §5 "Decisions already made — do not relitigate" và các mục "Cố ý giữ" trong plan (vd §2.D). Đề xuất ngược một quyết định đã chốt thì phải nói rõ là đang đề xuất đổi quyết định, không báo như defect.
5. **Test đang phủ hành vi đó** — có/không, phủ nhánh nào.
6. **Spec** — theo thứ tự ưu tiên dưới.

> ### 🔴 Nguồn spec — thứ tự ưu tiên
>
> 1. **Lời người dùng**, ghi nguyên văn trong plan ("**Người dùng yêu cầu:**", "**Người dùng báo:**", "Người dùng chọn") và câu trả lời của họ trong phiên.
> 2. **Hành vi đã đo trên game** — handover §2, Bug Report / file crawl người dùng gửi.
> 3. **Quyết định đã chốt** — handover §5, plan "Cố ý giữ".
> 4. **Script gốc** (`Send Resources V2.js`, `Quản lý Ika Perseus -VN- V2.js` — nằm ở gốc repo tới `888dc29`, đọc bằng `git show 888dc29~1:"Send Resources V2.js"`; `legacy/` chỉ là bản sao local, chưa từng được track) — chỉ khi ba nguồn trên im lặng.
>
> Không có tài liệu thiết kế chính thức: **không được** coi comment trong code là spec — comment có thể sai (S3: comment `BUILDING_LINE_STYLE` từng đổ cho CSS của game).

# Phase 2 — PASSES (chạy từng lượt RIÊNG, mỗi lượt một bộ câu hỏi)

Không gộp thành "review kỹ đi". Pass nào không liên quan diff thì **ghi rõ là bỏ**, không im lặng. Thứ tự là thứ tự ưu tiên theo bảng đầu file; P1 đứng trước P2 vì nếu test không kiểm được cái nó nói thì mọi câu "đã verify" ở các pass sau mất chỗ dựa.

🔴 **Cổng chốt mỗi pass — chống "chạy cho có".** Mỗi pass **kết thúc bằng một danh sách candidate**, kể cả `0 candidate`, và **mỗi candidate được một lượt đọc code riêng**. Ghi dạng: `P3: 2 candidate → (1) …, (2) …` hoặc `P5: 0 candidate (diff không chạm storage dùng chung)`. Pass không có dòng này ⇒ coi như **chưa chạy**.

### P1 — Test validity (chạy TRƯỚC)

**Câu hỏi vàng: có implementation nào bị hỏng mà test này vẫn xanh không?**

1. Test **claim** kiểm gì (tên test, nguyên văn)?
2. Nó dựng state / inject lỗi ở **đúng chỗ nào**; production chạy theo **thứ tự nào**; chỗ inject xảy ra trước hay sau side effect đang assert?
3. Assertion có **pass được ngay cả khi hành vi hỏng** không? (Test escape của board xanh cả khi bỏ escape, vì `{2}` nằm trong thuộc tính — S2.)
4. **Giới hạn của happy-dom** — test có đang khẳng định thứ happy-dom không làm được không:
   - **không có layout**: `getBoundingClientRect` trả 0, không float/flex/table thật ⇒ test chỉ chốt được **chuỗi CSS / cấu trúc DOM**, không chốt được "nằm trên một hàng", "không che", "rộng bằng". Hai lỗi layout của S3 đều có test xanh;
   - `getComputedStyle`: chỉ tin những giá trị đã thấy đúng trong chính test đó (vd `float` lấy từ style inline); mức hỗ trợ đầy đủ chưa được đo;
   - `localStorage` của happy-dom không đi qua `Storage.prototype` ⇒ spy `vi.spyOn(localStorage, "setItem")`, không spy prototype (S3).
5. **Thứ bị stub**: `app.test.ts` mock `./ui/actions` với `installActionDispatcher: () => {}` ⇒ `button.click()` **không** tới handler; test gọi `actions["…"](element)` trực tiếp. Bằng chứng nút hoạt động thật là listener gắn ở `document` (`installActionDispatcher` trong `ui/actions.ts`), không phải test click. Tương tự: `scanBuildings`, `fetchTownSlots`, `fetchFortressView`, `downloadJson`… bị mock trong `app.test.ts` — test app không chạy code thật của chúng.
6. **Cô lập giữa các test**: `mockImplementationOnce` / `mockResolvedValueOnce` không dùng tới sẽ **lọt sang test sau** — `mockClear` không xoá chúng, cần `mockReset` (đã xảy ra 2 lần, S3). `vi.resetModules()` **không** dừng `setInterval` của module cũ (S2). Fake timer: code không `await` (nút gọi `void …`) cần `vi.advanceTimersByTimeAsync(0)` trước khi assert.
7. Nhánh **lỗi/âm** có test không: game trả lỗi, phần tử không có, town không có trong dropdown, storage rỗng, tab khác đang chạy, notepad đổi giữa chừng — liệt kê theo **từng hành vi** rồi đối chiếu.
8. **Tripwire — bắt buộc với mọi test MỚI**: sao lưu file vào scratchpad → phá **đúng** dòng mà test bảo vệ → test phải **đỏ** → khôi phục → `cmp` với bản sao lưu. Với test của một tính năng mới: đưa file production về bản cũ (`git show HEAD:<path> > <path>`, đã sao lưu trước) → test phải đỏ. Làm hỏng mà **không test nào đỏ** ⇒ hoặc test thiếu, hoặc đoạn code đó là code chết (bộ lọc `::` ở S3) — báo đúng loại nào. Test "chốt" mà không thể đỏ (vd giữ mục khi level `null`, §2.AM phần 3) thì ghi là chốt để rõ ràng, không tính là đã chứng minh.

### P2 — Hợp đồng với game & trạng thái trang (trục lớn nhất)

1. Diff đọc **selector / field / response** nào của game? Đã có ở `core/ikariam/selectors.ts` chưa; nếu thiếu thì có `reportSelectorMiss` để lần sau có bản ghi không, hay im lặng không làm gì?
2. **`ikariam.model` là theo view**: đọc từ city view có thể ra số của view đó (từng báo 0 tàu rảnh — S1). Đọc header/DOM hay model, cái nào đúng cho view đang mở?
3. **Hai nguồn cập nhật ở hai bước khác nhau** (breadcrumb vs model khi đổi view): đọc tên ở nguồn này, số ở nguồn kia = dữ liệu town này ghi vào town kia (S1).
4. **Town nào?** Hành động chạy ở town trên màn hình, town của task, hay town chọn trong dialog? Đổi town là **reload trang** ⇒ thao tác tiếp theo sau đổi town chạy trong một lần tải trang khác. Đọc town khác thì dùng request (`fetchTown`, `fetchTownSlots`…), không đổi town.
5. Response fetch (không phải trang đang xem) có bị xử lý như trang đang xem không — đổi "town hiện tại", chạy parser đọc DOM (S2)?
6. **Chữ của game** (tooltip, nhãn): phụ thuộc ngôn ngữ giao diện và ký tự đặc biệt (`&`, dấu backtick trong tên ``Forester`s House``) ⇒ đọc bằng `textContent`/`readTownName`, so tên sau khi `trim`, ưu tiên class/id hơn chữ.
7. **Token `actionRequest`**: mỗi lần ghi notepad, mỗi request của tool đều có thể đổi token; form đã mở với token cũ sẽ bị game từ chối (lỗi 29/10, §2.AF; `8d0293d`). Diff có thêm request/ghi notepad trong lúc một form của game đang mở không?
8. **Hành động lên game**: xác nhận thành công bằng gì (form biến mất? response? số trên trang?) — không có nút Submit mà vẫn tính "đã gửi" là lỗi thật (S2).

### P3 — Runner, thứ tự thi hành, ranh giới reload, nhánh lỗi

1. Outcome của task (`TaskResult` trong `core/task-queue.ts`: `done` · `progress` · `retry` · `defer` · `failed`) có đúng nghĩa không (đọc doc comment ngay trên type):
   - `retry` chặn **mọi task cùng loại** (giữ chỗ, chạy loại khác) và chỉ nhớ trong bộ nhớ — reload là mất. Trả `retry` cho trạng thái của **riêng một town** từng làm đứng mọi upgrade của town khác, có thể hàng giờ (S1); handler đã đổi town (đã reload) thì không được trả `retry`.
   - `defer` chỉ đưa task đó xuống cuối queue.
   - `failed` bỏ task, ghi log, `reportBug` (Bug Report); app còn gửi thông báo "task dropped".
2. **Side effect rồi mới ném**: sau khi đã submit mà còn chỗ có thể ném ⇒ task còn trong queue ⇒ **gửi lặp** (S1). Sau điểm "đã ghi thật lên game" không được có `throw`.
3. **Xác nhận trước khi tiêu thụ**: bỏ mục khỏi queue/danh sách đã lưu chỉ sau khi game xác nhận (`a7c088a`).
4. **Trạng thái chỉ trong bộ nhớ** qua một lần đổi town/reload: mất (S2: Start một vòng; vòng reload qua lại khi hết action point). Cần giữ thì `sessionStorage` (riêng tab) hoặc `localStorage` (theo account) — và khi đó sang P4.
5. **Promise bị bỏ rơi**: `void f()` mà `f` có thể reject ⇒ lỗi biến mất không dấu vết (S1 `scanBuildings`). Có `await` + catch, hoặc báo qua Bug Report / toast không?
6. **Nhánh lỗi báo đúng lý do chưa**: catch chung rồi đặt một câu "selector sai" cho mọi lỗi là báo sai (S3). Lỗi gốc (name, message, stack) có được giữ không.
7. Đọc số liệu **trước khi điều hướng** rồi dùng sau khi điều hướng = số cũ (S1).

### P4 — Blast radius của dữ liệu lưu (localStorage · sessionStorage · notepad)

Ít finding đếm được, nhưng hậu quả nặng nhất: xoá ở đây **lan sang máy khác** qua notepad và không lấy lại được.

1. Với **mỗi** lệnh ghi/xoá: key nào, account nào, chạm **những mục nào** — viết ra tập mục, không viết "mục của town này".
2. Có **scope theo account** chưa (`accountName`; key dạng `***<account>***…` của Empire Overview)?
3. Hàm tên "dọn"/"kiểm"/"tự xoá" (`removeCompletedUpgrades`, `cleanAutoBuildConfig`…) có **xoá dữ liệu người dùng vì một lần đọc sai** không? Với phần tự kiểm queue của Auto Build, người dùng đã chọn **mọi nghi ngờ giữ lại mục** (lựa chọn (c), §2.AM; `features/build-queue-validation.ts`) — dùng cùng thước đo đó cho code xoá dữ liệu khác, và hỏi người dùng nếu không chắc.
4. Thay đổi có vào notepad không (`queueChanged`, `saveAutoBuild` → listener) ⇒ **máy khác cũng mất/đổi**. Có cần hỏi người dùng (rule 12 với dữ liệu người dùng) hay đã được họ chấp nhận (ghi nguyên văn)?
5. Key **mới**: đã phân loại trong `core/data-transfer.ts` (`config` / `measurements` / `runtime` / `diagnostics`) và thêm vào test bảng export chưa?
6. Chạy 2 lần (2 tab, 2 lần tải trang) thì trạng thái có khác không?

### P5 — Nhiều tab, nhiều máy, timer

1. **Một runner mỗi account**: `TabLock` (`core/task-queue.ts`). Diff có đường nào chạy hành động game **ngoài** runner (nút, phím tắt, crawl) trong khi runner tab khác đang chạy không?
2. **Mốc runner bận** (`KEY.runnerBusy`, `markRunnerBusy` / `isRunnerBusyInAnyTab` trong `state.ts`): mốc hết hạn sau 2 phút; `pagehide` xoá mốc của tab mình. Task dài hơn 2 phút mất bảo vệ.
3. **Notepad** (`queue-note.ts`): merge ba chiều; `claim()` trước hành động và huỷ đồng bộ đang hẹn; đồng bộ chờ khi runner bận (`setChangeSyncHold`, `waitWhileHeld`). Đồng bộ **đã bắt đầu** thì vẫn chạy hết — race còn lại đã ghi ở §2.AM phần 7.
4. Timer/interval: có dừng khi tính năng tắt không; có tick hai lần do hai tab không.

### P6 — UI trong trang game

1. **Mọi dialog của tool dùng chung một popup** `#ikaMationTransporterDialog` (`DIALOG_ID`, `core/ikariam/selectors.ts`) — mở dialog này đóng/thay dialog kia. Công cụ cần đứng cạnh dialog khác phải là box riêng (Crawl by id).
2. **Trước khi đổ cho CSS của game, grep sheet của chính tool**: `ui/styles.ts`, mọi `ensureStyle(` sheet, style inline. Rule `#autoBuildTable span { float: left }` và `#autoBuildTable button { float: right }` của tool từng gây hai lỗi (cột 3.518 px; `−` nằm trái `+`), và lỗi sau tôi đã đổ cho CSS của game (S3).
3. Popup của game: khung `.popupMessage` chính là phần tử có id (selector **không có dấu cách**). Đã đo trên game: phần nội dung bắt đầu ngang đỉnh popup và hàng flex bị đẩy sang phải đúng 480 px (bằng độ rộng popup) ⇒ ở đầu popup có phần tử float rộng 480 px (suy ra là các mảnh header, **chưa đo trực tiếp**). Phần tử tạo BFC (flex, `overflow` khác `visible`) đứng **cạnh** float thay vì dưới — cần `clear: both`.
4. Bỏ/thêm `<br/>`, đổi `display`, `float`, `white-space: nowrap` trong bảng `display:block`/`max-content`: tính lại độ rộng trong đầu cho **n dòng**, không chỉ một dòng (24 dòng float không ngắt = 3.518 px).
5. **Layout chỉ được tính là ĐÃ ĐO khi đo trên game**: Crawl by id chế độ HTML (vị trí, style đã tính, rule khớp, sheet không đọc được) hoặc snippet console; còn lại ghi CHƯA ĐO kèm thứ cần đo.
6. Chuỗi người chơi thấy: nằm trong `send-resources/messages.ts` / `core/messages.ts` (tiếng Anh), không viết thẳng trong code; tên town/dữ liệu game chèn vào HTML phải qua `escapeHtml`.

### P7 — Bảo mật & dữ liệu riêng tư

1. File xuất ra (Bug Report, Crawl, Export) có chứa **token `actionRequest`** không — Bug Report thay token bằng `<actionRequest>` (`redactTokens`, `core/ikariam/http.ts`); file Crawl by id và file lỗi của crawl đi qua `crawlFileText` (`send-resources/diagnostics.ts`), lọc token của model, token mới nhất của tool và mọi input `name="actionRequest"`. File thành công của crawl Building/Wine/Pirate và file Export **không** đi qua bộ lọc đó — kiểm xem có đường nào đưa token vào chúng không. Lọc chỉ bằng regex thì **không** bắt được `value="…"` của input ẩn: cần tập token.
2. **Tên người chơi khác, token thật**: `sample/1`, `sample/2` chứa token sống và tên người chơi — **không gì từ đó vào test hay vào repo**. Fixture test phải tự dựng.
3. Import file (Export/Import, wine transport file): phân loại lại từng key, chỉ ghi giá trị hợp lệ, escape khi hiển thị (S2).
4. Chạy code người dùng gõ (Crawl by id chế độ JS — `AsyncFunction`): chỉ từ ô nhập của chính người dùng; CSP của trang có thể chặn ⇒ lỗi `compile` được ghi ra file.

### P8 — Build, bundle, nền tảng

1. Hai packaging: userscript và extension MV3 (`content.js` chèn `page/*.js` vào trang). Hai userscript **khác grant**: Send Resources `@grant none` (chạy trong ngữ cảnh trang, `build/vite.send-resources.ts`), Empire Overview có `GM_*` và `unsafeWindow` (`build/vite.empire-overview.ts`). Thứ chỉ chạy được ở một bên?
2. Bundle là **strict ESM**: gán vào getter, `this` trong hàm gọi trần, biến chưa khai báo — đều ném (S1).
3. Module mới có được import từ entry không (S1: ba module không ai import, Vite bỏ khỏi bundle).
4. **Build thử vào scratchpad, không ghi đè `dist/`** (`dist/` bị gitignore và có thể là bản duy nhất người dùng đang cài — hỏi trước khi build vào đó):
   ```bash
   npx vite build --config build/vite.send-resources.ts --outDir <scratchpad>/build-check --emptyOutDir
   npx vite build --config build/vite.empire-overview.ts --outDir <scratchpad>/build-check-empire --emptyOutDir
   grep -c '<chuỗi mới>' '<scratchpad>/build-check/Ikariam Send Resources.user.js'
   ```
   Chuỗi CSS dựng bằng template giữ nguyên `${DIALOG_ID}` trong bundle (đã thấy: `#${DIALOG_ID}.popupMessage,`), nên grep giá trị đã thay (`ikaMationTransporterDialog.popupMessage`) ra 0 — grep phần cố định hoặc chính text của template.
5. `dist/` người dùng đang cài có thay đổi này chưa — so thời gian file và grep, đừng đoán.

### P9 — Tài liệu

1. Plan (`docs/improvement-plan.md`, tiếng Việt) và handover (`docs/session-handover.md`, tiếng Anh) có mục cho thay đổi này chưa: yêu cầu nguyên văn, thay đổi kèm file, số test, số lần cố ý làm hỏng, lỗi của chính mình, CHƯA KIỂM CHỨNG, cần thử gì trên game.
2. Trạng thái commit trong tài liệu có còn đúng không ("chưa commit" mà đã commit — đã gặp ở §2.AL).
3. README / `project-summary.md` lệch hiện trạng thì ghi là lệch, không tự sửa nếu không được yêu cầu.
4. **Không chạy prettier trên `docs/`.**

### P10 — Code quality (chạy CUỐI, trọng số thấp nhất)

- **Vi phạm global rule = 🔴 bất kể code xung quanh:** identifier/comment/log/commit **tiếng Anh**; tên tự giải thích; **không** tham chiếu nội bộ (số mục plan `§2.X`, "plan item T", mã ticket) trong tên hoặc comment (S2: 39 chỗ). Đường dẫn file thật thì được. Không attribution Claude/Anthropic ở bất cứ đâu.
- Dùng lại helper có sẵn trước khi tự viết: `core/dom.ts` (`qs`, `qsa`, `escapeHtml`, `ensureStyle`, `removeElement`, `isTypingTarget`, `capVisibleRows`), `core/format.ts` (`errorMessage`, `formatInteger`), `readTownName`, `getTownNameFromList`, `timestampedFilename`, `downloadJson`.
- File mới / xoá file / cài package: chỉ khi người dùng đồng ý (global rule 6, 7).
- `npm run typecheck` sạch (**cả** `tsconfig.json` và `tsconfig.strict.json`); prettier sạch **trên các file `src` đã chạm**.

# Phase 3 — PROVE (mọi finding phải qua khuôn này mới được báo)

```text
Tiền đề    : những gì đọc được ở file + symbol (không suy diễn, không nhớ)
Trace      : thứ tự thi hành thật — A chạy trước B nên …
Kích hoạt  : input + state cụ thể (town nào, tab nào, máy nào, dữ liệu lưu nào, game trả gì)
Hậu quả    : kết quả sai cụ thể (hàng nào gửi lặp, upgrade nào mất, key nào bị xoá trên máy nào, người chơi thấy gì)
Sửa nhỏ nhất: đề xuất kèm code, và nói rõ nó làm test nào đổi
```

**Ví dụ đúng khuôn** (lỗi thật, S3, sửa trong phiên 23/11): _Tiền đề_ — sheet của tool có `#autoBuildTable span { float: left; width: 100% }` (`ui/styles.ts`); mỗi dòng building là một `<span>` con của `#tdListBuilding`. _Trace_ — thay đổi bỏ `<br/>` cuối mỗi dòng; khi bảng tính độ rộng max-content của ô, các span float không có chỗ ngắt được xếp nối nhau trên một hàng. _Kích hoạt_ — mở Auto Build Settings ở town có 24 building. _Hậu quả_ — ô List Building rộng 3.521 px (đo bằng snippet trên game), cột queue bị đẩy tới x = 4.162, ra ngoài khung cuộn 1.250 px. _Sửa_ — `float:none` cho dòng, rule float chỉ áp `td > span`; test chốt chuỗi CSS (không chốt được layout — ghi CHƯA ĐO tới khi đo lại trên game).

**Ví dụ SAI (không được báo):** "dialog này có vẻ sẽ tràn trên màn nhỏ" — không có số đo, không có trace.

# Phase 4 — REFUTE (lượt riêng: cố bác finding của chính mình)

Với **từng** finding, trả lời hết:

1. Code ở **chỗ khác** đã xử lý việc này chưa — bundle kia, `core/`, sheet của tool, runner (guard ở `mayRunQueue`, `TabLock`)?
2. **Game thật** có nói ngược lại không — handover §2, Bug Report, file crawl người dùng gửi?
3. Test hiện có **đã bắt được** cái này chưa? Nếu đã bắt thì nó không phải gap.
4. Đây là **quyết định đã chốt** (handover §5, plan "Cố ý giữ") hay là lỗi?
5. Đây có phải **lỗi đo của tôi** không — happy-dom không có layout; mock thay cho code thật; `-t` lọc không khớp test nào (**vitest exit 0, mọi test "skipped"** — đã đo); file test không tồn tại (exit 1, "No test files found"); đọc exit của `tail`/`grep` thay vì của lệnh chính; build cũ trong `dist/`; dữ liệu `sample/` cũ; chạy `tsc -p .` mà quên cấu hình strict?
6. Kịch bản kích hoạt có **thật sự tới được** không, hay bị chặn ở tầng trên (runner không chạy khi chưa bật timer, town không trong dropdown thì không chạy…)?
7. Nếu chỉ dựa vào "grep không thấy" thì phát ngôn đã đủ dè dặt chưa (Phase 1 mục 2)?

**Danh sách KHÔNG báo** (negative examples):

- Mọi thứ trong handover §5 và plan "Cố ý giữ", trừ khi có bằng chứng mới — khi đó báo là "đề xuất xem lại quyết định", không phải defect. Ví dụ: style của code port Empire Overview (`/* eslint-disable */`, `var`, `any`) — chỉ code **mới** phải dùng `const`/`let`; các hàm dài không tách (`registerUiActions`, `handleSendResource`, `handleUpgradeBuilding`, `scanBuildings`); `console.*` có chủ ý (logger, lệnh console của diagnostics, cảnh báo dữ liệu hỏng); `.fullTable` có hai rule.
- Style trùng với code xung quanh mà **không** vi phạm global rule.
- "Có thể refactor cho đẹp hơn" mà không chỉ ra hậu quả.
- Suy đoán về layout hay hiệu năng chưa đo.
- Hành vi giống script gốc mà người dùng chưa yêu cầu đổi.

**Quét theo LỚP trước khi kết luận xong:** mỗi finding là một **instance**; `grep` cả `src` + `tools` cho **cùng loại** rồi mới báo — `void <async>()` không catch, `innerHTML` đọc tên, `?.click()` coi như đã gửi, `retry` cho trạng thái kéo dài, key storage chưa phân loại, `mockClear` với giá trị `Once`, `span`/`button` bị rule float chung của dialog chạm, `querySelector` theo chữ hiển thị.

# Phase 5 — REPORT

**Ba phần cố định** (global rule 0): **ĐÃ XONG** (mỗi câu kèm lệnh + kết quả thật hoặc file + symbol) · **CHƯA XONG/STUCK** (nguyên nhân + đã thử gì + cần gì để đi tiếp) · **CHƯA ĐO** (trục không có phép đo nào — layout trên game, phản hồi của game, nhiều tab, nhiều máy, CSP, màn hình nhỏ).

- Mỗi finding: kết luận 1 dòng → vị trí → 5 mục Phase 3 → sửa nhỏ nhất. Cuối cùng đếm theo severity + phân loại theo pass.
- **Nêu rõ pass nào bỏ và vì sao.**
- **Defect của sản phẩm · coverage gap (sản phẩm đúng, thiếu test) · lỗi của chính tôi** — ba loại, tách riêng.
- Cấm câu không đo được: "đã kiểm tra kỹ", "đã đảm bảo", "không có vấn đề", "hoạt động tốt".
- Trả lời người dùng bằng **tiếng Việt**; không commit/push nếu lượt đó không yêu cầu.

**Severity:**

- 🔴 vi phạm global rule · token/dữ liệu người chơi lọt ra · mất hoặc sửa dữ liệu lưu của người dùng (nhất là lan qua notepad) · gửi hàng lặp/mất, nâng cấp sai building/sai town · hành động lên game khi người dùng không bật · test tuyên bố đã verify mà không có bằng chứng đỏ · tài liệu bắt buộc (plan/handover) chưa cập nhật.
- ⚠️ thiếu test nhánh lỗi · nhánh lỗi báo sai lý do · key chưa phân loại export · layout chưa đo trên game · thay đổi hành vi chưa ghi lại · trạng thái mất qua reload.
- 💡 naming/readability · refactor trùng lặp · tối ưu nhỏ.

**Tiêu chí duyệt:** không còn 🔴; mọi test mới có bằng chứng đỏ; `npm test` và `npm run typecheck` sạch với số file test đúng; hành vi UI có kế hoạch đo trên game; plan + handover có mục; **mọi pass đã chạy hoặc đã ghi rõ là bỏ**. Không chắc → hỏi người dùng.

---

## Phụ lục A — Bộ dụng cụ đo (chạy HẾT ngay vòng đầu)

| Dụng cụ                    | Lệnh/cách                                                                                                                               | Từng bắt được                                            | Pass    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------- |
| Suite đầy đủ               | `npx vitest run` — đối chiếu **số file test** (40 tại thời điểm viết) và số test với lần trước                                          | —                                                        | P1      |
| Typecheck cả hai cấu hình  | `npm run typecheck` (= `tsc --noEmit && tsc --noEmit -p tsconfig.strict.json`); đọc exit code **của chính lệnh**, không qua `\| tail`   | 3 import thừa bị che bởi exit của `tail` (S3)            | P10     |
| Tripwire                   | sao lưu → phá đúng dòng → test đỏ → khôi phục → `cmp`                                                                                   | code chết (`::`, S3); test escape xanh vì lý do sai (S2) | P1      |
| Code cũ → test mới phải đỏ | `git show HEAD:<path> > <path>` (sau khi sao lưu) → chạy test mới → khôi phục → `cmp`                                                   | —                                                        | P1      |
| Prettier                   | `npx prettier --check <các file src đã chạm>` — **không** chạy trên `docs/`                                                             | —                                                        | P10     |
| Build thử                  | `npx vite build --config build/vite.<bundle>.ts --outDir <scratchpad>/… --emptyOutDir` + grep bundle; không ghi đè `dist/` khi chưa hỏi | —                                                        | P8      |
| Đo layout trên game        | Crawl → "By id" → chế độ HTML với id/selector của dialog: vị trí, style đã tính, rule khớp, `unreadableSheets`; hoặc snippet console    | cột 3.521 px, hàng flex lệch +480 px (S3)                | P6      |
| Đọc giá trị trong trang    | Crawl by id chế độ JS (biểu thức hoặc thân hàm có `return`) — kết quả hoặc lỗi kèm `stage` ra file                                      | —                                                        | P2      |
| Bug Report                 | nút Bug Report trên panel: log, trace request (token đã thay), lỗi đã ghi                                                               | lỗi 29/10 token, 02/11 đổi town (§2.AF, §2.AH)           | P2 P3   |
| Grep sheet của tool        | `grep -rn "<selector>" src/send-resources/ui/styles.ts` + các `ensureStyle(`                                                            | float của chính tool (S3)                                | P6      |
| Quét theo LỚP              | `grep` cùng loại trong `src` + `tools`                                                                                                  | —                                                        | Phase 4 |

⚠️ `vitest run -t "<mẫu>"` khi mẫu **không khớp test nào** vẫn **exit 0** và báo mọi test "skipped" (đo 23/11/2026 trên `src/core/dom.test.ts`: `13 skipped`, exit 0) ⇒ luôn đọc số **passed**, không chỉ exit code. File test không tồn tại thì exit 1 ("No test files found").

## Phụ lục B — Fan-out nhiều agent: CHỈ khi đáng, và CHỈ khi người dùng đồng ý

**Global rule 13:** không tạo subagent/workflow khi người dùng chưa đồng ý — nói trước mỗi agent làm gì, vì sao, rồi chờ trả lời; đồng ý một lần không áp cho lần sau. Mặc định review **inline**: review là việc phụ thuộc chặt (code ↔ test ↔ game ↔ tài liệu) nên một context đọc-verify tại chỗ rẻ hơn và ít lỗi lan hơn.

Khi người dùng đã đồng ý fan-out (như review toàn `src` 04/10: 6 agent chỉ đọc), chia theo **pass**, rồi:

1. Mỗi agent được dặn đọc handover §2, §4, §5 để không báo lại quyết định đã chốt.
2. **Dedup + verify tận file + symbol ở một nơi.** Output agent là **input thô, có thể sai**.
3. Một lượt riêng chỉ làm Phase 4 (bác finding), không phải lượt đã tìm ra finding đó.

## Phụ lục C — Tham khảo ngoài

Chép từ bản gốc, **chưa mở lại link**; đọc để verify, không để tin:

- Semi-formal reasoning (Meta, arXiv 2603.01896) — gốc của Phase 3 (tiền đề → trace → kết luận chỉ từ bằng chứng).
- Multi-pass + negative examples (niteagent; Zylos convergence loops) — gốc của Phase 2, Phase 4 và Phụ lục B.
- Mutation testing / tautological test (Autonoma; CircleCI) — gốc của câu hỏi vàng ở P1 và tripwire.
