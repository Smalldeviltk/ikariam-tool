# Kế hoạch cải thiện — UI và tính năng

> Trạng thái: **đang thực hiện.** Cập nhật 28/09/2026.
>
> Đã xong: Phase 1 trừ 1.4 (◐) · Phase 2 phần panel (2.1–2.5) · A, B, C.
> Còn lại: 1.4 · 2.6–2.8 (board, chờ câu hỏi 2) · D, H · toàn bộ E–T.
>
> **Đợt gần nhất (§2.E, 26–28/09):** Auto Build trên tài khoản thứ hai
> (`SClone1`, bật hiện toạ độ trong dropdown). Sáu lỗi, đều đã sửa: bốn lỗi
> đầu đã commit (`453482b`); nút trên board mở view town khác và nút Upgrade
> còn sót của công trình trước **chưa commit**. Auto Build hiện **cần board
> Empire Overview trên trang** — không có board thì đổi town bằng form, và
> form làm tải lại cả trang (chưa rõ vì sao).
>
> **⚠️ Mọi tính năng gửi hàng TỰ ĐỘNG đang hỏng.** Game đã đổi UI cảng biển
> sang `#js_transportPanel`; selector chọn town đích (`.cities.clearfix`) không
> còn khớp gì. Auto Wine và Transport timer không gửi được; gửi tay trong game
> thì vẫn chạy. Đừng bấm Start Timer cho tới khi sửa xong. Chi tiết và cách sửa
> ở §2.A.
>
> Đợt trước (§2.D, commit `1983f45`): review chất lượng code toàn bộ `src/`
> và sửa gần hết finding. Còn một finding 🔴 (tên tham số của `createPopup`)
> chờ code gốc của game; các điểm cố ý giữ, còn sót và cần thử trên game thật
> đều ghi ở §2.D.
>
> Đợt §2.C (đã commit): sửa header không cập nhật sau khi gửi tay, sửa
> nút trên board chuyển sai town, Auto Wine giữ lại 1 giờ tiêu thụ cho town
> nguồn và không gửi quá sức chứa kho. Lỗi "Auto Build mất queue" ghi ở đó đã
> tìm ra ở §2.E.
>
> Đợt trước nữa (§2.B): sửa Auto Build tiêu queue khi nâng cấp không thành, bỏ
> điều kiện tàu rảnh khỏi lúc nạp queue Auto Wine, và chặn vòng lặp vô hạn khi
> handler ném lỗi liên tục.
>
> Ký hiệu trong các bảng dưới: ✅ xong · ◐ xong một phần · ⬜ chưa làm ·
> ⏸ đang chờ quyết định.
>
> Tài liệu liên quan: [README.md](../README.md) cho cách build và lý do dự án
> có hình dạng hiện tại, [project-summary.md](../project-summary.md) cho những
> gì đợt refactor đã đổi và những gì còn chưa kiểm chứng.

Nguồn đối chiếu: `sample/IkaEasy-V4-by-RandGor-Chrome-Web-Store` (bản 4.0.0.5,
MV3, tác giả RandGor). Mọi khẳng định về nó đều kèm `file:dòng` để bạn đối chiếu
được, thay vì phải tin lời.

Danh sách tính năng ở mục 4 lấy từ `lang/en.js` — đó là danh sách tuỳ chọn
người dùng thấy được, tức là bề mặt tính năng thật của họ, không phải suy đoán
từ tên file.

---

## 1. Phát hiện chi phối tất cả phần còn lại

**IkaEasy không điều hướng. Nó gọi thẳng endpoint của game rồi đẩy response vào
parser của chính game.**

Đây không phải khác biệt bề mặt. Nó là gốc của hầu hết lỗi mà dự án này đã đuổi
suốt mấy lượt gần đây, và là điều kiện cần cho phần lớn tính năng ở mục 4.

### Họ làm thế nào

`js/helper/httpClient.js:21` — một hàm request duy nhất cho mọi thứ:

```js
ikariam(path, params) {
    params.actionRequest = Front.data.actionRequest;
    params.ajax = 1;
    $.ajax({
        url: `${path}?${$.param(params)}`,
        dataType: "json",
        success: (result) => { this.applyResponse(result); resolve(result); },
    });
}
```

`js/helper/httpClient.js:5` — mảng response được đưa thẳng cho parser lệnh của
game, nên mọi thành phần tiêu thụ đều cập nhật y như khi người chơi bấm chuột.

`js/data/city.js:52` — nạp toàn bộ dữ liệu một thành phố mà không rời trang:

```
GET /?view=townHall&cityId=<id>&position=0&backgroundView=city&currentCityId=<id>&actionRequest=<token>&ajax=1
```

`js/data/Manager.js:256` — quét toàn đế chế chỉ là một vòng lặp gọi hàm trên.

`js/page/modules/empire/resources.js:255` — `silentChangeCity(cityId)` đổi thành
phố **không click và không poll**: serialize `#changeCityForm`, ghi đè
`js_cityIdOnChange`, POST kèm `ajax=1`, rồi _xác nhận việc đổi từ chính response_
chứ không canh breadcrumb.

### Nếu áp dụng ở đây thì đổi gì

|                 | Hiện tại                                                                                                           | Với tầng AJAX                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `scanBuildings` | **~21 giây** cho 9 town (đo được, xem bên dưới), màn hình nhảy loạn, và phải từ chối chạy khi task runner đang bật | 9 request; ước lượng vài giây, người chơi không thấy gì |
| `gotoTown`      | click Build tab của board, không có thì click anchor dropdown, rồi poll `#js_cityBread`, timeout 15 giây sẽ throw  | POST form, đọc `selectedCityId` trả về                  |
| Kiểu hỏng       | `switchTown` trả false → `defer` vĩnh viễn; trang kẹt ở view mà `openPort` không tìm thấy `#position1`             | Không còn câu hỏi "đang ở view nào" để mà trả lời sai   |

**Con số 21 giây là đo, không phải đoán.** Lấy từ `ajaxTrace` trong capture của
bạn: sáu lần đổi town liên tiếp cách nhau 2468 / 1953 / 2366 / 1670 / 2210 /
3537 ms, trung bình 2367 ms → 9 town ≈ 21 s. Con số "vài giây" phía AJAX thì
**chưa đo** — đó là lý do có mục 1.1.

Bốn lỗi đã sửa trong phiên trước — `openPort` không thấy `#position1`, cái wait
sau submit timeout khiến lệnh gửi đã đi bị xếp lại hàng, scan bỏ sót town trong
im lặng, task không rời khỏi danh sách — **đều** là hệ quả của việc lái DOM.

### Rủi ro, nói thẳng

- **Xử lý `actionRequest`.** Token theo phiên, game xoay vòng nó; IkaEasy đọc
  lại từ mọi response (`updateActionRequest`). Làm sai thì request không có tác
  dụng mà cũng không báo lỗi.
- **Nhịp request.** Đây là tự động hoá game. Bắn một loạt request dễ bị để ý hơn
  là click. Phải tự giới hạn nhịp có chủ đích, không chạy nhanh hết mức.
- **Nó vẫn là thay đổi trạng thái.** `view=townHall&cityId=X` chọn thành phố đó
  ở phía server. Tương đương với click, không phải đọc suông.

---

## 2. Phase 1 — tầng truy cập dữ liệu qua AJAX

Nền móng. Không chỉ để sửa lỗi: **kéo-thả, đồng bộ đế chế, tab Espionage và
cảnh báo đều cần nó.** Xây UI lên cơ chế điều hướng hiện tại là trang trí cho
một thứ ta đã biết là yếu.

| #   | Việc                                                                                                                                                    | Ở đâu                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1.1 ✅ | **Xác minh trước.** Một lệnh gọi tay trong crawler, bắn đúng một request `view=townHall&cityId=X&ajax=1` và dump shape response. Không bao giờ tự chạy. | `tools/collect-dom-report.js`               |
| 1.2 ✅ | `ikariamRequest(params)` — thêm `actionRequest` + `ajax=1`, throttle, timeout, trả về mảng đã parse                                                     | `src/core/ikariam/http.ts` _(mới)_          |
| 1.3 ✅ | `applyResponse(array)` — publish vào `events("ajaxResponse")` của Empire Overview; Send Resources dùng mảng trực tiếp                                   | `src/core/ikariam/http.ts`                  |
| 1.4 ◐ | `switchCity(cityId)` — serialize `#changeCityForm`, POST, xác nhận từ response. `gotoTown` thử cách này trước, giữ đường click làm dự phòng. **28/09:** `gotoTown` đã có đường form (`submitChangeCityForm`) nhưng xếp **thứ hai**, sau tên town trên board, vì gửi từ runner nó tải lại cả trang (§2.E). Phần "xác nhận từ response" chưa làm | `src/send-resources/navigation.ts`          |
| 1.5 ✅ | `syncAllTowns()` thay ruột `scanBuildings`; nút Scan giữ nguyên                                                                                         | `src/send-resources/features/auto-build.ts` |

### Đã làm tới đâu

1.2 và 1.3 nằm ở `src/core/ikariam/http.ts` (`ikariamRequest`, `fetchTown`,
`onResponse`), nối vào board qua `src/empire-overview/main.ts`. 1.5 nằm ở
`src/send-resources/features/sync-towns.ts`, được `scanBuildings` gọi làm
đường nhanh và tự lùi về cách đi bộ cũ khi lỗi.

**1.3 từng xanh trên giấy nhưng chết trong bản build, suốt nhiều đợt.** Hai
script là hai bundle riêng, mỗi bên mang một bản sao `http.ts` với module scope
riêng. Board đăng ký `onResponse` ở bản sao của nó, `fetchTown` lại được gọi từ
bản sao bên kia, nên mảng handler hai bên không bao giờ gặp nhau: scan nạp đủ 9
town và board không nghe thấy gì. Người chơi phải đi bộ từng town, đúng triệu
chứng đã báo.

Test cũ trong `startup.test.ts` vẫn xanh vì nó import cả hai đầu từ **một**
module registry. Giờ response đi qua DOM event `ika:ajaxResponse` trên
`document` — thứ hai bundle thật sự dùng chung — và cả `http.test.ts` lẫn
`startup.test.ts` đều dùng `vi.resetModules()` để dựng đúng hai bản sao.

**Bài học, không chỉ là một lỗi:** bất cứ thứ gì hai script cần chia sẻ đều phải
đi qua `document`, `window` hoặc `localStorage`. Biến ở tầng module thì không.

**1.4 chưa làm, và chưa có lý do nào được ghi lại.** `gotoTown` vẫn đang click
rồi poll breadcrumb. Đây là mục Phase 1 duy nhất còn thiếu; nó không chặn 1.5
(đo được: gọi `fetchTown` cho town khác **không** làm dịch `selectedCity` phía
client), nhưng vẫn là nguồn của kiểu hỏng "trang kẹt ở view sai" ở bảng trên.

**Cập nhật 25/09: 1.4 gấp hơn trước.** Đợt §2.C đo được trên game thật rằng
`click()` vào `<a>` trong dropdown **không** chuyển town. Đó lại chính là đường
dự phòng của `gotoTown` khi không có board Empire Overview
(`switchTown` trong `navigation.ts`) — tức là Send Resources chạy một mình
nhiều khả năng không đổi được town. Cách chuyển town đã chạy được trên game
thật là đặt `#js_cityIdOnChange` rồi `ajaxHandlerCallFromForm(#changeCityForm)`;
board giờ dùng đúng cách đó (`switchTownWithGameForm` trong `game-api.ts`).

**Cách kiểm chứng.** Trước và sau, so `empireStore.buildingsKnown` của cả 9 town
cùng thời gian thực tế (đã có baseline 21 s ở trên). Unit test phát lại một mảng
response đã ghi qua harness sẵn có trong `startup.test.ts` và
`send-resources.test.ts`.

### Số đo về rượu, ghi lại để khỏi đo lại

`ikariam.model.wineSpendings` là mức tiêu thụ **gộp** của tavern, **chưa trừ
Wine Press**. Đo hai lần, khớp cả hai:

| Town       | Tavern | `wineSpendings` | Press | Thực tế |
| ---------- | ------ | --------------- | ----- | ------- |
| W-Athens   | 35     | 584 = `wineUse[35]` | 40 | 350.4 |
| M-Syracuse | 42     | 933 = `wineUse[42]` | 40 | 559.8 ≈ 560 |

Press giảm 1% mỗi cấp. Board vốn đã trừ (`models/city.ts`), nhưng
`resource-production.ts` và town cache thì chưa — nên span trên city view hiện
số gộp, và Auto Wine ước lượng cao hơn thực tế 40%. Cả hai giờ dùng chung
`modelWineConsumption()`.

Press chỉ đọc được ở city view (`div[id^=position].building.vineyard`, tooltip
"Wine Press"). Ở view khác `modelWineConsumption()` trả `null` thay vì đoán —
không ghi còn hơn ghi sai 40%.

**Một giả thuyết đã bị bác bỏ, đừng đuổi lại:** số rượu sai **không** phải do
`$.extend(true, {}, dataSetForView, entry[1])` trong `game-api.ts` làm rò giá
trị của town hiện tại sang các town khác. Dump thật cho thấy mỗi town giữ một
con số riêng và đều đúng.

**1.1 là cổng chặn cứng.** Phiên trước đã mất ba lượt vì suy luận nghe hợp lý về
những thứ không quan sát được từ bên ngoài trang.

### 2.A Cảng biển đã đổi UI — mọi lệnh gửi đang hỏng

Selector chọn town đích trong `selectors.ts` là `dockCities:
".cities.clearfix > li > a"`, bê nguyên từ script cũ (`sample/Send
Resources.user.js:372`, `legacy/Send Resources V2.js:376`). Game không còn dựng
markup đó. Bản chụp từ trang thật:

```html
<div id="js_transportPanel" class="transportPanel variableMainBox">
  <div class="transportPanel_header variableMainHeader">Transport<div class="close"></div></div>
  <div class="variableMainContent">
    <div class="transportPanel_city" data-city-id="297035">
      <div class="transportPanel_cityName">M-Corinth</div>
      <div class="transportPanel_actions">
        <a class="transportPanel_actionIcon action_transport" title="Transport goods"
           href="?view=transport&destinationCityId=297035"></a>
```

Hậu quả, quan sát được trên game: `handleSendResource` mở panel rồi chờ 15 giây
một danh sách không tồn tại, ném lỗi, runner giữ task lại, một giây sau lặp —
panel tự bật tắt liên tục. Không có lệnh gửi nào từng chạy xong.

Không script nào trong `sample/` biết tới `transportPanel`, kể cả IkaEasy V4.
Tức là game đổi sau khi tất cả các script tham chiếu được viết; không có nguồn
nào để chép.

**Panel mới dễ dùng hơn cái cũ.** Nó định danh town bằng `data-city-id` tường
minh, thay vì bắt đếm vị trí trong danh sách. Cả `adjustDestinationIndex` — sinh
ra chỉ vì danh sách cảng bỏ qua town nguồn nên mọi chỉ số phía sau lệch một —
sẽ bị xoá cùng cả lớp lỗi của nó. Ánh xạ chỉ số dropdown → cityId đã có sẵn:
mỗi `<li>` trong dropdown mang `selectvalue` chính là cityId (xác nhận ở
`output5.json`: index 0 ↔ `selectvalue="297034"` ↔ W-Athens).

**Chưa sửa được vì còn thiếu số đo.** `portForm.present` là `false` ở cả 5 bản
capture hiện có, nghĩa là `#textfield_*`, `#submit` và `#slider_freighters_max`
**chưa từng được đối chiếu với game thật** — chúng cũng chép từ script cũ. Sửa
xong phần chọn town mà form gửi cũng đã đổi thì chỉ là dời chỗ hỏng.

Cần một capture ở hai màn: lúc `#js_transportPanel` đang mở, và sau khi bấm
`a.action_transport` để form gửi hiện ra.

**Cập nhật 27/09:** màn thứ nhất **đã có** (người dùng dán hai lần, ghi ở §2.E).
Chỉ còn thiếu form gửi. Crawler dò form bằng `#textfield_wine`, nên nếu form
đổi id thì nó báo "không có form" mà không nói gì thêm. Lệnh đã gửi người dùng
thay vào đó liệt kê mọi form, ô nhập và nút **đang hiện** — chạy sau khi bấm
"Transport goods", **không** bấm gửi:

```js
copy(JSON.stringify({ url: location.search, wineFieldForm: document.querySelector("#textfield_wine")?.form?.outerHTML?.slice(0, 20000) ?? null, visibleControls: [...document.querySelectorAll("form, input, select, button, a.button, [id^=slider], [id*=submit]")].filter(e => e.offsetParent !== null).map(e => ({ tag: e.tagName, id: e.id, name: e.getAttribute("name"), cls: String(e.className).slice(0, 80), type: e.type, value: e.value, text: (e.textContent || "").trim().slice(0, 40), form: e.form?.id })) }, null, 1))
```

Lưu ý khi sửa: `#js_transportPanel` có `.close` riêng và là `.close` đầu tiên
trong trang (§2.E lỗi 3). Đừng dùng lại kiểu "click `.close` đầu tiên" ở bất
cứ đâu trong luồng gửi hàng.

Khi có, sửa ở bốn chỗ:

| Chỗ | Việc |
| --- | ---- |
| `src/core/ikariam/selectors.ts` | bỏ `dockCities`, thêm nhóm `transportPanel` |
| `src/send-resources/navigation.ts` | `clickDestinationTown` theo cityId; xoá `adjustDestinationIndex`; truyền timeout tường minh thay vì để mặc định 15 s |
| `src/send-resources/features/send-resources.ts` | hai chỗ dùng `dockCities` — dòng 131 (đang ném lỗi) và dòng 175 (chờ sau submit, có `.catch` nên chỉ phí 5 s mỗi lần gửi) |
| `navigation.test.ts` | xoá 4 test của `adjustDestinationIndex`, thêm fixture `transportPanel` |

**Quyết định đã chốt:** thay hẳn, không giữ `.cities.clearfix` làm dự phòng.
Một nhánh dự phòng không ai kiểm chứng được thì không phải an toàn, chỉ là code
chết.

### 2.B Auto Build, Auto Wine và vòng lặp của runner

Ba lỗi sửa trong cùng đợt, đều có test chứng minh fail trên code cũ.

**Auto Build tiêu queue dù nâng cấp không thành.** `handleUpgradeBuilding` xoá
entry khỏi `listAutoBuild` và trả `done` ngay sau `button.click()`, không kiểm
tra gì. Game từ chối cú click khi town đang xây, entry vẫn mất. Ba nguyên nhân
cộng lại:

1. `gotoTown` chỉ đợi breadcrumb, mà breadcrumb và `#locations` là hai ajax box
   khác nhau — đọc slot ngay lúc breadcrumb đổi vẫn thấy town cũ. Thêm
   `TOWN_SETTLE_MS = 1200`, bằng `SCAN_SETTLE_MS` sẵn có và bằng 1000 ms mà bản
   gốc từng đợi.
2. Không kiểm lại ở thời điểm bấm. Mở building là một round trip; view lúc bấm
   đã khác view lúc kiểm.
3. Không xác nhận kết quả. Giờ đợi đúng slot `#position{N}` mang class
   `constructionSite` rồi mới xoá entry; không thấy thì giữ entry và trả
   `defer`.

**Auto Wine từ chối nạp queue khi không có tàu.** `enqueueWineRun` gọi
`getFreeShips()` và thoát trước khi push bất cứ gì. Kiểm tra này thừa:
`handleSendResource` đã trả `retry` khi không có tàu, tức task tự chờ hạm đội về.
Bỏ gate; nạp queue và gửi hàng là hai việc tách rời.

**Nút Start của Auto Wine không còn khởi động runner.** Trước đây nó gọi
`runner.start()` thẳng, bỏ qua `syncRunnerToFlags()` và không bật cờ nào — runner
chạy trong khi nút Transport vẫn ghi "Start Timer", và lần `syncRunnerToFlags()`
kế tiếp sẽ tắt nó. Đúng loại lỗi mà comment trên `syncRunnerToFlags` nói đã sửa,
sót lại ở đúng nút này. Giờ Start chỉ nạp queue.

**Handler ném lỗi mãi không có điểm dừng.** `TaskRunner` cố ý giữ task khi
handler throw, vì phần lớn throw là DOM chưa sẵn sàng. Đúng với DOM chậm, sai
với DOM sẽ không bao giờ tới — và §2.A là ca thứ hai. Thêm
`maxConsecutiveErrors` (mặc định 5): quá ngưỡng thì bỏ task, giống hệt đường
`failed` vốn có. Bộ đếm để trong bộ nhớ, reset khi reload, và bị xoá ngay khi
handler trả về bình thường.

**Đánh đổi cần biết:** với cảng biển đang hỏng, cap này khiến queue tự cạn thay
vì lặp vô hạn — mỗi task khoảng 80 giây (5 vòng × 16 giây) rồi biến mất. Các
task `sendResource` mất đi lấy lại được bằng cách bấm Start lần nữa. Config
Auto Build thì không mất: `cleanAutoBuildConfig` chỉ loại town có queue rỗng.

### 2.C Ba lỗi người dùng báo, và Auto Wine (25/09/2026)

Cả ba lỗi dưới đây đều **không nhìn thấy được từ console**: game không báo lỗi
nào. Lỗi 1 chỉ tìm ra nhờ thử tắt/bật từng phần trên trang thật, không phải
nhờ đọc code — đọc code đã dẫn sai hướng hai lần.

**Lỗi 1 — gửi tay xong, header không cập nhật tài nguyên và tàu rảnh.**
✅ Đã tìm ra, đã sửa, **chưa thử lại bằng bản build mới**.

- Tắt cả hai script thì header chạy đúng. Chỉ tắt Send Resources cũng chạy
  đúng → lỗi ở Send Resources.
- Gỡ bằng tay từng thứ Send Resources chèn vào trang: gỡ ô "Send Resources" ở
  menu trái của city (`.menu_slots`) là hết lỗi; gỡ các nút trong form gửi hàng
  thì không.
- Cơ chế: `ikariam.model.updateGlobalData` của game cập nhật menu trái
  (`updateCurrentCityLeftMenu` → `cityMenu.update`) **trước** khi vẽ lại
  header. Một ô không do game tự vẽ làm bước đó hỏng, nên header không bao giờ
  được vẽ lại. Thêm class `slot98` cho giống ô của game — không đủ.
- Sửa: `panel.ts` không chèn gì vào menu của game nữa. Panel mở bằng nút cố
  định ở góc dưới bên trái.

Hai chỗ sửa trong Empire Overview làm **trước** khi tìm ra nguyên nhân thật,
vẫn giữ vì đúng với game hiện tại:

- `main.ts` không còn thay `ikariam.controller.executeAjaxRequest`. Code gốc
  của game (người dùng dán từ console) giữ **một** `ajaxResponder` duy nhất và
  đưa mọi response sau vào `parseResponse` của nó; bản bọc cũ tạo responder mới
  mỗi lần và ghi đè lên cái của game. Board giờ nghe response qua sự kiện
  `ajaxSuccess` của jQuery **trên trang** (`observeGameResponses`), chạy sau
  khi game xử lý xong.
- `resource-production.ts`: bản bọc `model.updateGlobalData` giờ chuyển đủ tham
  số, trả về kết quả của game, và phần span của board không thể chặn hàm gốc.

**Lỗi 2 — nút trên board ("to Saw Mill", "to luxury good", nút level) chuyển
đúng dropdown nhưng công trình trên màn hình là của town cũ.**
✅ Đã sửa. Người dùng xác nhận đã sang đúng town; phần "dialog bị đóng vì trang
còn tải" đã sửa nhưng **chưa được xác nhận**. **Cập nhật 27/09:** dialog vẫn
không mở khi nút là của town khác — vì bước (1) dưới đây thực ra **tải lại cả
trang**, và bước (2) chết cùng trang cũ. Sửa ở §2.E, lỗi 5.

- `loadUrl` (`game-api.ts`) gửi `changeCurrentCity` qua ajax cùng lúc mở view
  đích. Đang ở city view mà nhảy sang city view của town khác thì
  `backgroundView` không được gửi, nên nền city không vẽ lại. Code này giống hệt
  script gốc — game đã đổi cách xử lý.
- Sửa: link mở **view** của town khác đi hai bước. (1) Chuyển town đúng cách
  dropdown của game làm: đặt `#js_cityIdOnChange` rồi
  `ajaxHandlerCallFromForm(#changeCityForm)` — cách IkaEasy V4 dùng. (2) Đợi
  breadcrumb đúng tên **và** game rảnh (`jQuery.active` = 0, `#loadingPreview`
  ẩn) liên tục 1200 ms, rồi mới mở view. Town không chuyển được sau 15 s thì
  tải lại cả trang. Link chỉ đổi town (tên town) giữ nguyên một request cũ.
- Đã thử và **không** chạy: `click()` vào `<a>` của dropdown không chuyển town.
  Bản đầu làm vậy và mọi nút trên board chờ đủ 15 s.

**Lỗi 3 — Auto Build mất queue khi town đang có công trình nâng cấp.**
✅ **Đã tìm ra 26/09 (§2.E, lỗi 1)**: không phải hai khả năng dưới đây, mà là
tên town trong dropdown có kèm toạ độ. Đoạn còn lại giữ nguyên để thấy lúc đó
đã nghi gì. ~~⏸ Chưa tìm ra.~~ Entry chỉ bị xoá khi slot đó mang `constructionSite`
(`auto-build.ts`), nên hai khả năng đang nghi: trang ở trạng thái lệch kiểu lỗi
2 làm bước kiểm tra đọc nhầm town, hoặc entry được lưu nhầm sang town khác khi
bấm **+** lúc breadcrumb đang sai (`addBuildingToQueue` lấy tên từ
breadcrumb). Cần log panel lúc xảy ra, và biết entry có hiện ở town khác không.
Lỗi 2 đã sửa có thể kéo theo hết lỗi này — thử lại trước khi đào tiếp.

**Auto Wine.**

- Reserve của town nguồn = **1 giờ tiêu thụ của chính nó** (`getSourceReserve`),
  thay cho 500 cố định; chưa biết tiêu thụ thì lùi về 500
  (`FALLBACK_WINE_RESERVE`). Town nguồn tự sản xuất rượu nên không tham gia chia
  đều — chỉ cần đủ cho tavern trong lúc chờ khai thác.
- Không gửi quá sức chứa kho của town nhận. Phần kho không nhận được **ở lại
  town nguồn**, không chia sang town khác, cộng vào `unused` để lượt sau chia.
  Town chưa biết sức chứa thì không giới hạn. Bảng xem trước đánh dấu
  "(storage full)" và ghi rõ town nào thấp hơn mức chung.
- Sức chứa đọc từ `ikariam.model.maxResources`, ghi vào town cache mỗi lần ghé
  town. Board không có con số này.
- **Sửa kèm:** `modelResource` tìm key `"wine"`, trong khi capture
  `output5.json` cho thấy `currentResources` của game thật chỉ có key số
  `"1"`–`"4"` và `"resource"` (theo `TradeGoodOrdinals` của IkaEasy: wine = 1).
  Nhiều khả năng town cache chưa từng ghi được rượu trên game thật. Giờ đọc
  theo tên trước, rồi theo key số. **Giá trị** của các key này chưa từng được
  capture.
- Làm tròn theo tàu và rượu tiêu hao lúc đang chở: ghi thành S và T ở §4.2,
  chưa làm.

### 2.D Review chất lượng code toàn bộ `src/` (25/09/2026) — phần còn lại

Review theo phần "chất lượng code" của `sample/prompt/review-source-workflow.md`,
chia ba vùng (`core` + `extension`, `send-resources`, `empire-overview`). Gần
hết finding đã sửa (commit `1983f45`); mục này chỉ ghi **những gì
chưa sửa được, cố ý giữ, hoặc sửa rồi nhưng cần thử trên game thật**, để lượt
sau khỏi soi lại từ đầu.

#### Chưa sửa được — thiếu dữ kiện

| Mức | Chỗ | Vấn đề | Cần gì |
| --- | --- | --- | --- |
| 🔴 | `src/core/ikariam/globals.ts` — `IkariamPageApi.createPopup` | Hai tham số cuối tên `arg4`, `arg5` — vi phạm quy tắc đặt tên. Chỗ gọi duy nhất (`send-resources/ui/dialogs.ts`, `openPopup`) truyền `"???", "class"`, chép y nguyên từ script gốc; IkaEasy V4 truyền `1` ở vị trí thứ 4. Không nguồn nào nói chúng là gì. | Tắt cả hai script, F5, chạy trong console `copy(ikariam.createPopup.toString())` và dán lại. Có code thì đặt tên theo ý nghĩa thật, và sửa luôn hai giá trị `"???"`/`"class"` nếu chúng vô nghĩa. |
| ⚠️ | `src/empire-overview/main.ts` — đầu ready handler | Điều kiện dừng script khi có "backup-lock timer" dùng `$("backupLockTimer")` — thiếu `#`/`.`, nên chưa bao giờ khớp và chưa bao giờ dừng gì. **Đã xoá** điều kiện (hành vi giữ y như trước) thay vì đoán selector, vì đoán sai sẽ làm script ngừng chạy trên trang vốn vẫn chạy. | Nếu muốn có lại điều kiện này: một capture của đúng trang có bộ đếm đó, để biết nó là id hay class và nằm trên view nào. |

#### Cố ý giữ — đã có quyết định

- **Style của code port Empire Overview** (11 file `/* eslint-disable */`, ~639
  `var`, ~62 `any`). Người dùng chọn chỉ dọn rác và đổi tên placeholder; đổi
  hàng loạt `var`→`let`/`const` dễ vỡ hoisting/closure trong callback jQuery mà
  test không bắt được. Code **mới** trong các file này đã dùng `const`/`let`.
- **Hàm dài không tách** — `registerUiActions` (`app.ts`, ~210 dòng),
  `handleSendResource`, `handleUpgradeBuilding`, `scanBuildings`. Người dùng
  chọn không tách; riêng `handleSendResource` đằng nào cũng phải viết lại khi
  sửa §2.A.
- **Ô số của form gửi hàng** (`transport-buttons.ts`, `applyTransportStep`)
  vẫn parse kiểu "chỉ lấy chữ số", không dùng `parseGameNumber`: đó là ô người
  chơi tự gõ, dấu `.`/`,`/khoảng trắng chỉ có thể là phân cách hàng nghìn.
  Lý do đã ghi ngay trong code.
- **Đường dẫn tới IkaEasy trong `sample/`** vẫn nằm trong comment (thư mục bị
  gitignore): đó là dự án bên thứ ba, người đọc tự lấy được; dòng "the original"
  thì README đã định nghĩa là `legacy/`.
- **`console.*` còn lại** đều có chủ ý: `logger.ts` in từng dòng log, các lệnh
  console trong `diagnostics.ts`/`app.ts` là để người dùng đọc bug report,
  `console.warn` ở `storage.ts`, `ship-capacity.ts`, `actions.ts`,
  `bug-report.ts` báo dữ liệu hỏng, và `empire.ts` chỉ in khi bật `debug`.
- **`.fullTable` có hai rule** trong `send-resources/ui/styles.ts` là cố ý: bảng
  queue trên panel dùng nó ngoài popup. Các rule chỉ dùng trong popup giữ bản
  gắn id popup (nặng hơn CSS popup của game) và bỏ bản trùng.

#### Còn sót khi gom chuỗi hiển thị (i18n) — nên làm lượt sau

- `send-resources/types.ts` — nhãn tài nguyên trong `RESOURCE_OPTIONS`
  (`"Wood"`, `"Wine"`, `"Marble"`, `"Crystal"`, `"Sulfur"`) chưa chuyển sang
  `send-resources/messages.ts`.
- `send-resources/features/wine-warning.ts` — `formatHours` viết thẳng đơn vị
  `"h"`, `"d"`, `"<1h"`, `"—"`.
- `send-resources/ui/queue-view.ts` — `describeTask` hiện tên tài nguyên dạng id
  nội bộ (`wood`, `glass`) thay vì nhãn cho người chơi.
- `send-resources/features/auto-build.ts` — `listBuildingsInCurrentTown` parse
  tooltip của game bằng chuỗi đã dịch `"Under construction"`: đổi ngôn ngữ giao
  diện game là hỏng. Nên dựa vào class `constructionSite` (đã dùng ngay dòng
  dưới) thay vì chữ.
- Bảng `Constant.LanguageData` của Empire Overview chỉ có `en`. Ba key mới
  (`toast_updated`, `toast_movementAdded`, `toast_remoteVersionUnreadable`) chỉ
  được thêm vào đó.
- `tools/collect-dom-report.js` viết thẳng key `"ikaAjaxTrace"`; trong `src/`
  giờ là `TRACE_STORAGE_KEY` (`empire-overview/ajax-trace.ts`). Crawler không
  nằm trong build nên không import được — đổi tên thì phải sửa cả hai.

#### Đã sửa nhưng đổi hành vi — cần thử trên game thật

| Thay đổi | Ở đâu | Thử gì |
| --- | --- | --- |
| Tên town trên breadcrumb đọc bằng `textContent` thay vì `innerHTML` | `core/ikariam/globals.ts` — `getCurrentTownName`, dùng chung cả hai script | Chuyển town bằng Auto Build, Scan và nút trên board; không còn chờ 15 s |
| Phím tắt dựa theo phím vật lý (`event.code`) thay vì `event.which` đã lỗi thời | `send-resources/app.ts` — `registerHotkeys` | Space mở/đóng panel, A, S, B vẫn đúng việc |
| `readNumberOrNull` trả `null` khi ô trống (trước: 0) và hiểu hậu tố `k` | `core/dom.ts` | Số tàu rảnh và action point trên panel vẫn đúng |
| Bug report đổi trường `jQuery` thành `pageJQuery` + `scriptJQuery`, và đọc model qua `window` của trang | `core/bug-report.ts`, `empire-overview/diagnostics.ts` | Bấm Bug Report: `hasIkariamModel` phải là `true` trên cả hai script |
| Chuyển town trên board chờ bằng `waitFor` của core (logic không đổi) | `empire-overview/game-api.ts` — `switchTownWithGameForm` | Các nút "to Saw Mill", nút level: sang đúng town, dialog không bị đóng |
| Toast "Updated: …" và "Could not read the remote version." lấy từ `LanguageData` | `empire-overview/game-api.ts`, `empire.ts` | Toast vẫn hiện đúng chữ |
| Bỏ các rule CSS trùng không gắn id popup | `send-resources/ui/styles.ts` | Ba hộp thoại Settings (Transport, Wine, Build) trông như cũ |

### 2.E Auto Build trên tài khoản thứ hai (26–28/09/2026)

Mọi lỗi dưới đây chỉ lộ ra trên tài khoản `SClone1` (ba town: W-Clone1
297124, M-Clone1 297155, S-Clone1 297348), vốn bật tuỳ chọn **hiện toạ độ**
trong dropdown chọn town. Tài khoản chính không bao giờ gặp lỗi nào trong số
này. Mỗi bản sửa đều có test viết trước và đã thấy đỏ trên code cũ.

| # | Người dùng thấy | Nguyên nhân | Sửa | Trạng thái |
| - | --------------- | ----------- | --- | ---------- |
| 1 | Mọi task Auto Build báo `Town "S-Clone1" not found`; task queue cạn, cấu hình Build vẫn còn | `title` trong dropdown là `"[42:97]  S-Clone1"`, còn breadcrumb và tên Auto Build lưu là `S-Clone1` | Lấy tên town từ model theo city id (`selectvalue` → `modelCityName`); `title` chỉ là dự phòng. Board chờ đúng tên đó khi đổi town bằng form | ✅ commit `453482b`, **đã thấy chạy** trên game |
| 2 | Xây xong hết thì trang tải lại liên tục, nút kẹt ở "Stop Timer" | Queue cạn → reload; cờ Build vẫn bật nên lần load sau cạn ngay, lại reload. Script gốc chặn bằng `isAutoReload`; bản port chỉ ghi cờ đó mà không bao giờ đọc | Khôi phục cơ chế của bản gốc (`loadedAfterRun` trong `app.ts`); tự tắt timer Build khi cấu hình rỗng (`hasConfiguredUpgrades`) | ✅ commit `453482b`, **đã thấy chạy** |
| 3 | Start Timer của Build cứ mở panel Transport | `closeGamePopup` click `.close` đầu tiên trong trang — chính là nút của `#js_transportPanel` đang ẩn; click nó làm panel **hiện ra** (đo bằng console) | Chỉ click `.close` đang hiển thị | ✅ commit `453482b`, chưa xác nhận trên game |
| 4 | Trang tải lại mỗi 1–2 s, bấm Stop Timer cũng không dừng | `gotoTown` đổi town bằng `#changeCityForm` trước tiên; gửi từ runner, form tải lại cả trang mà không tới town đích, và mỗi lần load lại bắt đầu đúng lần đổi town đó. Cờ Build trong storage vẫn `true` | Thứ tự mới: tên town trên board (đường của bản gốc) → form → `<a>` dropdown | ✅ commit `453482b`, chưa xác nhận trên game |
| 5 | Nút trên board: cùng town thì mở đúng dialog; town khác thì chỉ sang town đó, không mở dialog | Đổi town bằng form **tải lại cả trang** (người dùng xác nhận); phần chờ rồi mở view chết cùng trang cũ. Tải thẳng URL của view (`location.assign("?view=townHall&cityId=…&position=0")`) cũng chỉ sang town, không mở dialog — đã thử tay | `loadUrl` lưu view cần mở vào `sessionStorage` (`ika_pendingBoardView`) trước khi đổi town; `openPendingView()` mở nó khi board khởi động xong trên trang mới — chỉ khi đúng town và còn mới (30 s). Đổi town không reload thì callback cũ mở và xoá bản ghi | ✅ **chưa commit**, chưa xác nhận trên game |
| 6 | Log `Upgrade button points at position 4, expected 23 - ignoring` rồi hoãn "not enough resources?" dù đủ tài nguyên | Lấy nút `#js_buildingUpgradeButton` **đầu tiên**; đó thường là nút của công trình vừa mở trước, còn trên màn hình | Chờ (trong 15 s sẵn có) tới khi nút có `position=` đúng slot; nút của slot khác vẫn không bao giờ bị click | ✅ **chưa commit**, chưa xác nhận trên game |

**Đã đo được, ghi lại để khỏi đo lại:**

- Dropdown bật toạ độ: `<li selectvalue="297348" class="ownCity coords"><a title="[42:97]  S-Clone1">`
  — hai dấu cách sau ngoặc. Model giữ toạ độ ở field `coords` riêng.
- `#js_transportPanel` luôn có sẵn trong trang (ẩn), town đích là
  `div.transportPanel_city[data-city-id]`, nút gửi là `a.action_transport` với
  `onclick="ajaxHandlerCall(this.href);return false;"`. Đây là phần markup
  §2.A còn thiếu — **chọn town đích giờ đủ dữ liệu**; chỉ còn thiếu form gửi.
- Một dòng `Auto Build: queued N upgrades` trong log = một lần load trang (hoặc
  bấm Start). Hai dòng cách nhau vài giây = trang vừa tải lại.
- Console của người dùng có thể lọc mất `console.log`. Probe nên **trả về** kết
  quả, và đặt `await` phía trước khi phải chờ.

**Còn mở:**

- **Vì sao form đổi town tải lại cả trang.** Chưa biết. Cho tới khi biết, Send
  Resources không có board sẽ lại dùng form và có thể lặp reload. Đây là phần
  còn lại của 1.4 ("xác nhận từ response").
- **Town rảnh không bắt đầu khi town khác đang xây** — người dùng báo trước
  bản sửa lỗi 4, chưa thử lại. Queue có xoay vòng (town bận `defer` xuống
  cuối), nên nếu còn lỗi thì là bước kiểm tra "đang xây" đọc nhầm: nghi
  `TOWN_SETTLE_MS` 1200 ms quá ngắn, slot của town trước vẫn còn trên màn hình.
  Chưa đo.
- **Dialog mở quá sớm?** `openPendingView` chạy ngay khi board khởi động xong.
  Nếu game còn đang tải, dialog có thể mở rồi bị đóng — kiểu lỗi đã gặp 25/09.
  Nếu gặp: chờ game rảnh như `switchTownWithGameForm`.
- **C — log ai gọi `backToCity`:** đã đề xuất, chưa làm.

---

## 3. Phase 2 — UI

### Quyết định thiết kế: **không** gộp panel vào board

IkaEasy có một cửa sổ bốn tab (`tpl/dummy/empire/window.ejs`). Dự án này có hai
bề mặt riêng:

- **Board Empire Overview** — đã ổn: kéo được, có tab (Resource / Build / Army /
  Settings / Help), dùng CSS của chính game.
- **Panel Send Resources** — `div#userscript`, ghim cứng ở `top:45px; left:635px`,
  **12 nút** xếp một hàng, toàn bộ style viết inline
  (`src/send-resources/ui/panel.ts`).

Gộp lại sẽ khiến Send Resources phụ thuộc Empire Overview trở lại — đúng thứ mà
town cache được xây để gỡ bỏ. Thay vào đó: tách một widget cửa sổ dùng chung ra
`src/core/ui/` cho cả hai.

| #   | Việc                                                                                                                                                                                  | Lấy mẫu từ                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 2.1 ✅ | `createWindow({ title, width })` — header / body / footer, kéo được, ESC đóng, `max-height` theo viewport, append vào `#container`, dùng class của game (`table01 dotted`, `tabmenu`) | `js/helper/win.js`, `tpl/helper-win.ejs` |
| 2.2 ✅ | Thu panel còn một mục trong menu trái mở cửa sổ đó, thay vì 12 nút dán đè lên game                                                                                                    | `addToLeftMenu` trong `js/utils.js`      |
| 2.3 ✅ | Nhóm điều khiển theo tính năng — đã làm thành sáu nhóm **Wine** / **Transport** / **Build** / **Queue** / **Account** / **Data** — thay vì một hàng phẳng                                                                             | `tpl/dummy/empire/window.ejs`            |
| 2.4 ◐ | Dòng trạng thái sống: task đang chạy, độ dài queue, tàu rảnh, action point                                                                                                            | `#empire_sync` + overlay của tab         |
| 2.5 ✅ | Bỏ toạ độ pixel cứng; nhớ vị trí cửa sổ vào storage                                                                                                                                   | `settings.window`                        |
| 2.6 ⏸ | Overlay "đang đồng bộ" + icon refresh xoay, thay vì im lặng                                                                                                                           | `.empire-tab-overlay`                    |
| 2.7 ⏸ | Cập nhật bảng **tăng dần** thay vì vẽ lại toàn bộ mỗi vài giây (mất vị trí scroll, nháy)                                                                                              | CHANGELOG 4.0.0.0                        |
| 2.8 ⏸ | Tooltip dùng chung: tồn kho / trần kho / sản lượng / % — thay cho `data-tooltip="dynamic"` của game                                                                                   | `js/helper/tooltip.js`                   |

### Đã làm tới đâu

2.1 ở `src/core/ui/window.ts` (kéo được, ESC đóng, nhớ vị trí). 2.2–2.3 và 2.5
ở `src/send-resources/ui/panel.ts`: một mục trong `.menu_slots` mở cửa sổ, sáu
nhóm **Wine / Transport / Build / Queue / Account / Data**, vị trí lưu theo tài
khoản.

**2.4 mới xong một nửa.** Footer đang có task đang chạy và độ dài queue
(`setTransferInfo`). **Chưa có số tàu rảnh và action point** như mục này viết.

**2.6–2.8 chưa động vì đều nằm ở board Empire Overview** — tức là bị chặn bởi
câu hỏi 2 ở mục 6, chưa phải vì khó.

**Cố ý không lấy:** templater EJS. Dự án đã có TypeScript và template literal;
thêm một engine template nữa chỉ tăng bề mặt bảo trì mà không được gì.

---

## 4. Phase 3 — đối chiếu tính năng

Bảng dưới là **toàn bộ** tuỳ chọn người dùng của IkaEasy V4 (`lang/en.js`,
dòng 103–153), đặt cạnh những gì dự án này đã có.

Cột **Build** cho biết tính năng chạy được ở đâu: `US` = userscript (Edge),
`EXT` = extension (Chrome), `cả hai`.

### 4.1 Đã có — không cần làm gì

| Tính năng IkaEasy               | Ở dự án này                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| Empire overview — Resources     | Tab Resource của board                                             |
| Empire overview — Buildings     | Tab Build                                                          |
| Empire overview — Military      | Tab Army                                                           |
| Hàng đợi xây dựng               | Auto Build + task queue (của ta còn bền hơn: retry/defer, lưu đĩa) |
| Chi tiết sản lượng trong thành  | `resource-production.ts` (các span `rp*` ở thanh trên)             |
| Tính hàng cho Barbarian Village | `barbarian.ts`                                                     |
| Ẩn quảng cáo / premium / ...    | Các setting của Empire Overview (`newsTicker`, `birdSwarm`, ...)   |
| Hotkey đổi thành phố            | `render.ts` (Shift+1..5, Q/W/E, Space)                             |
| Tự nhận daily bonus             | Setting `dailyBonus`                                               |

### 4.2 Nên thêm — xếp theo giá trị trên công sức

| #   | Tính năng                                                                                                                                                                                                                                                                                           | Build       | Cần gì trước |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------ |
| A ✅ | **Nút ±500 / +1k / +5k / +50k trên form transport.** Rẻ nhất trong bảng, dùng mỗi lần gửi tay. `tpl/transport-buttons.ejs`                                                                                                                                                                          | cả hai      | —            |
| B ✅ | **Xem và sửa queue.** `TaskQueue` đã có `removeById` / `replaceById` / `moveToBack` dựa trên id — đúng để sửa khi đang chạy. UI hiện tại là **một dòng text** (`describeCurrentTransfer`). Không xem được còn bao nhiêu lệnh, không xoá được lệnh sai, không đổi thứ tự. API có rồi, chỉ thiếu mặt. | cả hai      | —            |
| C ✅ | **Cảnh báo hết rượu.** `empireStore` đã mang `wineCurrent` + `wineConsumption` mọi town → "còn mấy giờ" là phép tính trên dữ liệu đang có. Tô đỏ town dưới ngưỡng.                                                                                                                                  | cả hai      | —            |
| D ⬜ | **Chỉ báo kho đầy.** Sọc chéo đỏ/cam trên progress bar khi chạm trần. Thuần CSS, bê gần nguyên từ `css/empire-resources.css`.                                                                                                                                                                       | cả hai      | —            |
| E ⬜ | **Nút nâng cấp nhanh ngay trong tab Build.** Ta có tab Build nhưng phải mở từng thành phố mới nâng được. `js/helper/buildingUpgrade.js` + `tpl/dummy/empire/other/building.ejs`                                                                                                                     | cả hai      | Phase 1      |
| F ⬜ | **Kéo-thả chuyển tài nguyên giữa các thành phố.** Kéo một dòng town thả lên town khác → mở form transport điền sẵn. `js/page/modules/empire/resources.js:220`                                                                                                                                       | cả hai      | Phase 1      |
| G ⬜ | **Kéo-thả điều quân / hạm đội.** Tương tự F nhưng cho tab Army.                                                                                                                                                                                                                                     | cả hai      | Phase 1, F   |
| H ⬜ | **Khoá đồng bộ giữa nhiều tab.** Hiện **chưa có gì** ngăn hai task runner ở hai tab cùng lái một tài khoản và gửi trùng. `js/helper/syncLock.js`                                                                                                                                                    | cả hai      | —            |
| I ⬜ | **Tab Espionage.** Số điệp viên rảnh theo thành phố, đang phái đi đâu, mục tiêu. Ta không có gì tương đương. `js/page/modules/empire/espionage.js`                                                                                                                                                  | cả hai      | Phase 1      |
| J ⬜ | **Thông báo desktop**: xây xong, sắp xong, transport đã tải / đã đến / đã về, tuyển quân xong. Đây là thứ biến script thành công cụ chạy nền thật sự.                                                                                                                                               | xem ghi chú | Phase 1      |
| K ⬜ | **Cấp công trình hiện ngay trên city view** — khỏi rê chuột từng cái. `option.city_details`                                                                                                                                                                                                         | cả hai      | —            |
| L ⬜ | **Chọn tàu chở tự động cho Barbarian Village.** Ta mới _hiển thị_ số tàu cần (và đang hard-code sức chứa 520); họ _chọn_ luôn, dùng đúng cấp nâng cấp Workshop.                                                                                                                                     | cả hai      | —            |
| M ⬜ | **Tìm đảo theo tham số ở world view.** `js/page/modules/worldmap-islandSearch.js`                                                                                                                                                                                                                   | cả hai      | —            |
| N ⬜ | **Chi tiết đảo ở island view** — action point, chủ tàu, thông tin thành phố/mỏ.                                                                                                                                                                                                                     | cả hai      | —            |
| O ⬜ | **Ghi chú (notes).** Lưu trong IndexedDB theo server. `js/page/modules/notes.js`                                                                                                                                                                                                                    | cả hai      | —            |
| P ⬜ | **Chặn phá nhầm thuộc địa không di dời được.** Một hộp xác nhận, tránh mất trắng một thành phố.                                                                                                                                                                                                     | cả hai      | —            |
| Q ⬜ | **Nút trả lời nhanh / xử lý hiệp ước trong Diplomacy.**                                                                                                                                                                                                                                             | cả hai      | —            |
| R ⬜ | **Kiểm tra bản mới.** Ta không có cơ chế cập nhật nào — Tampermonkey cần `@updateURL`/`@downloadURL`, extension cài tay thì không có gì.                                                                                                                                                            | cả hai      | —            |
| S ⬜ | **Auto Wine: làm tròn lượng gửi theo sức chứa tàu.** `distributeWine` chia tới từng đơn vị, nên một chuyến 621 rượu tốn 2 thương thuyền (620/tàu trên server đang test). Làm tròn theo bội số của `ship-capacity.ts` để đỡ tốn tàu, nhất là khi tàu rảnh đang thiếu; phần dư giữ lại town nguồn. | cả hai | 2.A |
| T ⬜ | **Auto Wine: tính rượu tiêu hao trong lúc chở.** Tới lúc hàng cập bến, town nhận đã uống thêm `consume × thời gian di chuyển`, nên mức giờ thực tế thấp hơn `targetHours`. Cần thời gian di chuyển giữa hai town — Send Resources hiện chưa đọc con số này ở đâu cả. | cả hai | 2.A |

**Đã làm: A, B, C.**

- **A** — `src/send-resources/features/transport-buttons.ts`. Khác plan một
  điểm có chủ đích: các bước **không** cố định 500/1k/5k/50k mà là **bội số của
  sức chứa đo được** (`ship-capacity.ts`). Con số của IkaEasy là một/hai/mười/
  trăm tàu ở sức chứa gốc 500; nâng cấp cargo xong là chúng hết tròn. Trên server
  đang test, một thương thuyền chở 620 và một freighter 53.000.
- **B** — `src/send-resources/ui/queue-view.ts`. Mỗi dòng mang `id` của task
  (sửa theo danh tính, không theo vị trí), đánh dấu task đang chạy, có nút hoãn
  và xoá từng dòng.
- **C** — tính toán ở `features/wine-warning.ts`, hiển thị trong nhóm Wine của
  panel (`ui/panel.ts`). Khi chưa có số liệu nào thì nói thẳng là chưa có, thay
  vì báo mọi town đều ổn — hai chuyện đó không giống nhau.

**Ghi chú về J (thông báo).** Extension đã khai `"permissions": ["notifications", "alarms"]` nên làm được đầy đủ, kể cả khi tab game không ở trước mặt. Bản userscript chỉ dùng được `Notification` API của trang và cần người dùng cấp quyền — nhắc được khi tab còn mở, không nhắc được khi đã đóng. Nên coi đây là tính năng **ưu tiên cho bản extension**, userscript làm mức rút gọn.

### 4.3 Cố ý không lấy

| Tính năng                            | Vì sao                                                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anti-Captcha cho Pirate Fortress     | Captcha ở đó tồn tại chính là để chặn tự động hoá. Nối vào dịch vụ giải captcha trả phí để vượt qua là chuyện khác hẳn phần còn lại của dự án, và dễ dính án phạt tài khoản. Không khuyến nghị. |
| Cinema floating player               | Không liên quan tới quản lý đế chế.                                                                                                                                                             |
| Tích hợp IkaLogs                     | Dịch vụ bên thứ ba; đẩy dữ liệu trận đánh ra ngoài. Nếu muốn thì nên là quyết định riêng, không gộp vào đợt này.                                                                                |
| Templater EJS                        | Đã có TypeScript + template literal.                                                                                                                                                            |
| `chrome.storage` thay `localStorage` | Sẽ phá tính năng export/import và khiến hai bản build lệch nhau.                                                                                                                                |

---

## 5. Thứ tự đề xuất

```
🔴 TRƯỚC HẾT   §2.A                   cảng biển — mọi lệnh gửi đang hỏng

✅ Phase 1   1.1, 1.2, 1.3, 1.5     nền móng AJAX
✅ Phase 2   2.1 → 2.5              cửa sổ dùng chung + panel
✅ Đợt rẻ    A, B, C                nút transport, xem queue, cảnh báo rượu

⬜ Còn lại, không chờ gì:  1.4 (phần còn lại), D, H, nửa sau của 2.4, C (§2.E)
⏸ Chờ capture form gửi:   §2.A — markup chọn town đích đã có (§2.E)
⏸ Chờ người dùng thử lại: §2.E lỗi 3–6, và "town rảnh không bắt đầu"
⏸ Chờ code của game:      §2.D tham số `createPopup` (lệnh console ghi ở đó)
⬜ Lượt review sau:        §2.D chuỗi i18n còn sót, và thử trên game thật
⏸ Chờ câu hỏi 2:          2.6, 2.7, 2.8   (đều ở board)
⏸ Chờ câu hỏi 3:          E, F, G, I, J, K, L, M, N, O, P, Q, R
⬜ Ghi lại, chưa cần làm: S, T (Auto Wine)
```

**§2.A đi trước mọi thứ khác.** Thêm tính năng lên một tầng gửi hàng không chạy
được thì không đo được gì, và mọi thử nghiệm thủ công đều vướng phải nó.

Làm được ngay, không phụ thuộc gì: **1.4** (bỏ nốt việc lái DOM khi đổi town),
**D** (sọc kho đầy — thuần CSS), **H** (khoá đồng bộ đa tab — hiện **chưa có gì**
ngăn hai tab cùng lái một tài khoản và gửi trùng), và bổ sung số tàu rảnh +
action point vào dòng trạng thái cho trọn 2.4.

**Hai việc phát sinh, chưa xếp lịch:**

- **Runner chạy mọi loại task bất kể switch nào đang bật.** `syncRunnerToFlags`
  quyết định runner *có chạy không*, không quyết định nó *được chạy gì*. Bật
  Build Start Timer là chạy luôn cả shipment đang xếp hàng, trong khi nút
  Transport vẫn ghi "Start Timer". Comment ở `app.ts` liệt kê đúng triệu chứng
  này như một lỗi đã sửa — nhưng bản sửa chỉ đổi *ai được start runner*.
- **`onDrain` không reset `isAutoBuildStart`.** Khi queue cạn, `setAutoStart(false)`
  tắt cờ Transport nhưng cờ Build giữ nguyên `true` và nhãn nút không đổi. Nút
  Build ghi "Stop Timer" trong khi runner đã dừng, và phải bấm hai lần mới chạy
  lại được. **◐ 26/09:** sửa khi cấu hình Build rỗng (timer tự tắt, §2.E lỗi
  2). Còn việc trong cấu hình thì cờ cố ý giữ `true` để keep-alive chạy lượt
  sau, như bản gốc. Việc thứ nhất (runner chạy mọi loại task) vẫn còn — đã
  kiểm tra 26/09 và **không** phải nguyên nhân panel Transport tự mở.

---

## 6. Câu hỏi còn mở

1. ~~**Chạy 1.1 trước chứ?**~~ **Đã xong.** Probe chạy trên game thật cho kết
   quả: `Content-Type` là `text/html` nhưng body là JSON (nên không bao giờ
   được kiểm theo header), payload có mang `actionRequest`, và một request
   `fetchTown` mất 328–974 ms so với 2367 ms cho mỗi lần đổi town bằng cách đi
   bộ. 1.2 được viết dựa trên các số đo này.
2. **Phase 2 có bao gồm board Empire Overview không, hay chỉ panel Send
   Resources?** Board đã dùng jQuery UI tabs và kéo thả sẵn; đụng vào nó là đụng
   10.767 dòng code port cơ học, rủi ro cao hơn hẳn so với làm lại panel.
3. **Mục 4.2 lấy hết hay lấy một phần?** 18 mục là nhiều. Bạn đánh dấu mục nào
   cần, tôi làm theo thứ tự đó.
