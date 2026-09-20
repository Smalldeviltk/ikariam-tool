# Kế hoạch cải thiện — UI và tính năng

> Trạng thái: **đang thực hiện.** Cập nhật 21/09/2026.
>
> Đã xong: Phase 1 trừ 1.4 · Phase 2 phần panel (2.1–2.5) · A, B, C.
> Còn lại: 1.4 · 2.6–2.8 (board, chờ câu hỏi 2) · D, H · toàn bộ E–R.
>
> Đợt gần nhất sửa hai lỗi đo được trên game thật: `wineSpendings` là số gộp
> chưa trừ Wine Press, và cây cầu của 1.3 nối hai bundle không dùng chung
> module nên scan không cập nhật được board. Chi tiết ở §2.
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
| 1.4 ⬜ | `switchCity(cityId)` — serialize `#changeCityForm`, POST, xác nhận từ response. `gotoTown` thử cách này trước, giữ đường click làm dự phòng             | `src/send-resources/navigation.ts`          |
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
✅ Phase 1   1.1, 1.2, 1.3, 1.5     nền móng AJAX
✅ Phase 2   2.1 → 2.5              cửa sổ dùng chung + panel
✅ Đợt rẻ    A, B, C                nút transport, xem queue, cảnh báo rượu

⬜ Còn lại, không chờ gì:  1.4, D, H, và nửa sau của 2.4
⏸ Chờ câu hỏi 2:          2.6, 2.7, 2.8   (đều ở board)
⏸ Chờ câu hỏi 3:          E, F, G, I, J, K, L, M, N, O, P, Q, R
```

Làm được ngay, không phụ thuộc gì: **1.4** (bỏ nốt việc lái DOM khi đổi town),
**D** (sọc kho đầy — thuần CSS), **H** (khoá đồng bộ đa tab — hiện **chưa có gì**
ngăn hai tab cùng lái một tài khoản và gửi trùng), và bổ sung số tàu rảnh +
action point vào dòng trạng thái cho trọn 2.4.

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
