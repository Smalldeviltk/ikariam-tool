# Kế hoạch cải thiện — UI và tính năng

> Trạng thái: **đang thực hiện.** Cập nhật 04/10/2026, tối.
>
> Đã xong: Phase 1 · Phase 2 phần panel (2.1–2.5) và phần board (2.6, 2.8) ·
> A, B, C, D, E, H, J, K, S, T · R (mức tối thiểu) · U (thêm cấp > 50 từ
> s303) · **§2.A cảng biển** · §2.E → §2.W. **Người dùng thử trên game 04/10
> sáng: "tạm ok"** (§2.Q) — từ §2.R trở đi **chưa thử** như một lượt; riêng
> nút ▲ (E) người dùng đã bấm thử và báo lỗi, sửa ở §2.V. **Bản extension
> Chrome chưa từng load được** cho tới §2.W (manifest sai từ đầu) — mọi lần
> thử trên game tới nay là bản userscript.
> Còn lại: P, L (chờ capture) · 2.7 (chỉ làm khi có lỗi cụ thể) · V (◐) ·
> phần U còn thiếu số (§2.U phần 4) · R: kênh cập nhật riêng (chờ người
> dùng). **Không làm lúc này** (người dùng chọn 04/10): F, G, I, M, N, O, Q.
>
> Git (04/10 tối): `origin/refactor` ở `066eb44`; **16 commit chưa push** —
> `6ed66c6`, `c38dca4`, `b9f1d7a` (U + V), `4f9436c`, `3209964` (§2.K + §2.L),
> `7ed3a85`, `b45f792` (§2.M), `32fe3ba`, `ec3fdc4` (§2.N → §2.R), `b2e9084`
> (§2.S), `3f8a51b` (thay đổi `barbarian.ts` của người dùng, commit riêng
> theo yêu cầu), **`c78b49e` (§2.T + §2.U: 32 file trong `src/`, gồm 2 file
> mới `src/core/notifications.ts` + `notifications.test.ts`) và `0da427b`
> (hai tài liệu)**, **`cefcc92` (§2.V: `render.ts`, `startup.test.ts`),
> `9c363f7` (§2.W: `build/build-extension.mjs`) và commit tài liệu ngay sau
> đó** (04/10 tối, người dùng yêu cầu). Working tree sạch trừ các file của
> người dùng: `docs/wiki/s303/` (dữ liệu người dùng crawl), `.gitignore` và
> `docs/So_sanh_2_script_Ikariam.md` — không tự đưa vào commit. **`dist/`
> 04/10 21:21** từ working tree (khớp `9c363f7`), có §2.V (đã grep `quick upgrade refresh` trong cả
> `Ikariam Empire Overview -VN-.user.js` lẫn `extension/page/empire-overview.js`)
> và manifest đã sửa của §2.W (`exclude_globs`). `dist/extension/` do
> `npm run build:extension` trong phiên này build lại; hai userscript cũng
> mang giờ 21:21 nhưng lệnh đó không build userscript — người dùng đã build
> chúng. **Người dùng chưa cài lại / chưa load lại.**
>
> **Mới nhất (§2.W — 04/10 tối, commit `9c363f7`, chưa push):** Chrome từ chối load
> `dist/extension` — `Invalid value for 'content_scripts[0].exclude_matches[0]':
> Invalid host wildcard`. Pattern loại trừ diễn đàn
> `*://board.*.ikariam.gameforge.com/*` có `*` giữa tên host, match pattern
> của Chrome không cho; chuyển sang **`exclude_globs`**. Lỗi có từ commit dựng
> toolchain (`e551bb8`). Đã build lại; **chưa load lại trong Chrome**.
>
> **§2.V (04/10 tối, commit `cefcc92`, chưa push, có trong `dist/` 21:21,
> chưa thử trên game):** người dùng báo bấm ▲ trên board thì game nâng cấp (toast "Upgrade
> started"), nhưng ô vẫn hiện công trình rảnh, phải Scan hoặc sang town đó
> mới đúng. Sửa: nâng cấp thành công thì **tải lại town đó** (`fetchTown`,
> như Scan), nút ▲ khoá tới khi tải xong; tải lại lỗi thì ghi Bug Report,
> không báo nâng cấp hỏng.
>
> **§2.T, §2.U (04/10 chiều, commit `c78b49e`, docs `0da427b`, chưa push,
> chưa thử trên game):**
> trả lời câu hỏi 2 và 3 (§6); board có **chỉ báo đồng bộ** (2.6) và
> **tooltip trên số tồn kho** (2.8); **bỏ kiểm tra bản mới** trỏ nhầm sang
> script gốc (R); **cấp công trình hiện trên city view** (K); **thông báo
> desktop** 4 loại, mỗi loại một checkbox (J); **nút ▲ nâng cấp nhanh** trong
> tab Build, mỗi lần bấm lưu response của game cho Bug Report (E); và
> `Constant.BuildingData` thêm **704 cấp > 50** từ trang Help của s303 —
> thời gian × 2, chi phí ÷ 0,86 (U).
>
> **§2.S (04/10 trưa, commit `b2e9084`):** Auto Wine gửi theo **tàu nguyên**
> và tính **rượu uống trong lúc chở** (S, T); dòng trạng thái gọi tên task
> upgrade; cảng chỉ có ô đang xây thì hoãn thay vì ném lỗi; hàng tiêu đề
> đứng yên khi cuộn; mở panel là vẽ lại queue ngay. Kèm `3f8a51b`: Barbarian
> Village hiện số tàu + 1 như Barbarian Fleet.
>
> **§2.R (04/10, commit `32fe3ba`):** queue trong panel và bảng lệnh gửi
> của Transport Settings hiện **tối đa 10 hàng**, nhiều hơn thì cuộn; Auto
> Build Settings có lại **nút Close** (§2.P đã bỏ nó).
>
> **§2.Q (04/10):** người dùng thử trên game danh sách "cần thử"
> (§2.A, runner, mục menu, thời gian xây, §2.P, §2.E lỗi 3–6, §2.F → §2.L,
> U/V) và lỗi đổi town sang M-Eretria: **"cả 2 tạm ok"**.
>
> **Đợt §2.O + §2.P (03–04/10, commit `32fe3ba`, docs `ec3fdc4`):** từ hai file Bug
> Report: **runner không bỏ task lỗi vì `console.error` không phải hàm trên
> trang game** — đã sửa; câu lỗi "did not land" bỏ số giây; Bug Report kèm
> 200 dòng log; **sửa cảng biển §2.A** (mở form bằng
> `?view=transport&destinationCityId=<id>`, form và selector đều đã đo).
> Rồi bảy việc nhỏ: nhãn tài nguyên, bỏ nút Close, `needingShip` làm tròn
> lên, tháng = 30 ngày, ▶ theo task runner đang chạy, "Warning wine" mỗi
> town một lần, Space chỉ cho Empire Overview.
>
> **Đợt §2.N (03/10, commit `32fe3ba`, docs `ec3fdc4`):** nút **Bug Report** làm lại —
> luôn **lưu một file JSON** (không copy clipboard), kèm `gameData` (source
> `createPopup` và form gửi hàng nếu đang mở), lưu xong thì **xoá** lỗi đã
> ghi. Từ file đầu tiên: **§2.D xong** (`createPopup` đặt tên theo source
> của game), Empire Overview hết báo nhầm `[tên, null]`. Lỗi "đổi
> town sang M-Eretria không tới nơi" (§2.N phần 4): không gặp lại (§2.Q).
>
> **Đợt §2.M (03/10, commit `7ed3a85`, docs `b45f792`, chưa push):** Send Resources có **mục menu
> trái** như Empire Overview — đo được trên game rằng mục lạ có class
> **`expandable`** là thứ làm header ngừng cập nhật, mục kiểu IkaEasy (không
> `expandable`) thì không; nút góc chỉ còn là dự phòng. Panel nhớ đang mở
> hay đóng qua các lần tải trang, lần đầu thì mở. Thời gian nâng cấp trên
> board tính thêm **buff giảm thời gian xây của server** (nhập theo tài
> khoản trong bảng Account của Send Resources, sửa bằng ✎ / lưu bằng ✓) và
> **Chronos' Forge** (×0,8 mỗi cấp), làm tròn tới giây.
>
> **Đợt §2.L (02/10, commit `4f9436c` chung với §2.K, docs
> `3209964`, chưa push):** gửi hàng không chạy khi tồn
> kho ít hơn lượng còn phải gửi **và** ít hơn sức chứa 1 tàu (merchant ship,
> hoặc freighter khi hết merchant); Transport Settings nhận **0** như ô trống;
> mỗi Start Timer chỉ cho runner chạy **loại task của nó**; gom nốt chuỗi hiển
> thị còn sót ở §2.D; và **1.4** — đo được game tự reload khi đổi town, nên
> `gotoTown` giờ đổi town bằng form trước và chặn vòng lặp reload.
>
> **Đợt §2.K (02/10, commit `4f9436c`, docs `3209964`, chưa push):** nút ↑/↓
> đổi **một hàng** mỗi
> lần ở Queue, Transport Settings và Auto Build Settings; **Start** của Auto
> Wine làm trọn quy trình (Scan → Load → Save → nạp queue → bật Start Timer),
> còn **Save** trong Auto Wine Settings giờ nạp queue luôn.
>
> **Đợt U + V (30/09–01/10, commit `6ed66c6`, `c38dca4`, docs
> `b9f1d7a`):** wiki đã cũ, game đổi cả đường cong chi phí. `Constant.BuildingData`
> được nạp lại từ trang Help > building details của chính game (nút tạm **Crawl
> Building**, dữ liệu thô ở `docs/wiki/`): chi phí, thời gian (giờ là bảng
> giây), hiệu ứng, `maxLevel` logic. Công trình giảm giá có trần 50% (chi phí
> xây dựng tối đa 64% cùng research; Wine Press trên rượu Tavern). Còn thiếu: số
> cho cấp > 50 — **đã thêm 04/10 từ s303** (§2.U). Chi tiết: §4.2, ghi chú về U và về V.
>
> Đợt §2.J (29/09, commit `a62e8dd`): hết tàu rảnh thì lệnh gửi
> hàng giữ đầu queue và **chặn luôn các task upgrade** phía sau. Runner giờ
> chỉ chặn task **cùng loại** với task trả `retry`; upgrade chạy tiếp, lệnh
> gửi giữ thứ tự và được thử lại khi hết việc khác.
>
> **Đợt §2.I (29/09, commit `a62e8dd`):** bốn chỉnh sửa do người dùng
> yêu cầu — Transport Settings xếp tên tài nguyên và ô số thành hai cột;
> "Warning wine" không còn bật cho town không tụt rượu; mọi `window.alert`
> của hai script thành **toast tự tắt** (`confirm()` giữ nguyên); board
> Empire Overview chỉ hiện **5 hàng town**, còn lại cuộn, header và dòng tổng
> đứng yên.
>
> **Đợt §2.H (29/09, commit `1f7c0e7`):** hai chỉnh sửa hộp thoại do
> người dùng yêu cầu — nút "Run queue" của Auto Build thành **Save** như bản
> gốc; Transport Settings nhập **một ô số cho mỗi loại tài nguyên** thay cho
> dropdown, Add thêm một dòng cho mỗi ô đã nhập.
>
> **Đợt §2.G (28/09, commit `1f7c0e7`):** H (khoá nhiều tab), D (sọc kho
> đầy), nửa sau của 2.4 (tàu rảnh + action point trên footer), và log ai gọi
> `backToCity`.
>
> **Đợt §2.F (28/09, commit `1f7c0e7`):** Auto Build chạy lại theo
> **vòng** như bản gốc — mỗi town có queue được ghé một lần, thử entry đầu
> tiên, hết vòng thì nghỉ tới lần keep-alive reload (2 phút). Hết cảnh nhảy
> town liên tục và town cuối vòng không bao giờ tới lượt. Kèm theo:
> `needingShip` (Barbarian) tính theo sức chứa merchant ship thay vì 520.
>
> Đợt trước (§2.E, 26–28/09): Auto Build trên tài khoản thứ hai
> (`SClone1`, bật hiện toạ độ trong dropdown). Sáu lỗi, đều đã sửa và commit
> (`453482b`, `24061f0`). Auto Build hiện **cần board Empire Overview trên
> trang** — không có board thì đổi town bằng form, và form làm tải lại cả
> trang (chưa rõ vì sao).
>
> **Gửi hàng tự động: đã sửa 04/10 (§2.O phần 4), người dùng thử trên game:
> tạm ok (§2.Q).** Trước đó mọi lệnh gửi tự động đều hỏng: game đổi UI cảng biển sang
> `#js_transportPanel`, selector chọn town đích (`.cities.clearfix`) không còn
> khớp gì. Chi tiết ở §2.A.
>
> Đợt trước (§2.D, commit `1983f45`): review chất lượng code toàn bộ `src/`
> và sửa gần hết finding. Finding 🔴 cuối cùng (tên tham số của `createPopup`)
> **xong 03/10** khi có source của game (§2.N); các điểm cố ý giữ, còn sót và
> cần thử trên game thật đều ghi ở §2.D.
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

| #      | Việc                                                                                                                                                                                                                                                                                                                                      | Ở đâu                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1.1 ✅ | **Xác minh trước.** Một lệnh gọi tay trong crawler, bắn đúng một request `view=townHall&cityId=X&ajax=1` và dump shape response. Không bao giờ tự chạy.                                                                                                                                                                                   | `tools/collect-dom-report.js`               |
| 1.2 ✅ | `ikariamRequest(params)` — thêm `actionRequest` + `ajax=1`, throttle, timeout, trả về mảng đã parse                                                                                                                                                                                                                                       | `src/core/ikariam/http.ts` _(mới)_          |
| 1.3 ✅ | `applyResponse(array)` — publish vào `events("ajaxResponse")` của Empire Overview; Send Resources dùng mảng trực tiếp                                                                                                                                                                                                                     | `src/core/ikariam/http.ts`                  |
| 1.4 ✅ | `switchCity(cityId)` — serialize `#changeCityForm`, POST, xác nhận từ response. `gotoTown` thử cách này trước, giữ đường click làm dự phòng. **02/10:** đo được server trả lời bằng lệnh **reload** vào town mới, nên "xác nhận" là xác nhận **sau reload**; form xếp **đầu**, có chặn vòng lặp reload (§2.L, phần 5). Chưa thử trên game | `src/send-resources/navigation.ts`          |
| 1.5 ✅ | `syncAllTowns()` thay ruột `scanBuildings`; nút Scan giữ nguyên                                                                                                                                                                                                                                                                           | `src/send-resources/features/auto-build.ts` |

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

**Cập nhật 02/10: 1.4 đã làm — xem §2.L, phần 5.** Hai đoạn dưới là bối cảnh
trước đó, giữ lại để đối chiếu.

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

| Town       | Tavern | `wineSpendings`     | Press | Thực tế     |
| ---------- | ------ | ------------------- | ----- | ----------- |
| W-Athens   | 35     | 584 = `wineUse[35]` | 40    | 350.4       |
| M-Syracuse | 42     | 933 = `wineUse[42]` | 40    | 559.8 ≈ 560 |

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

### 2.A Cảng biển đã đổi UI — ✅ đã sửa 04/10, người dùng thử: tạm ok (§2.Q)

**Cập nhật 04/10:** đã có capture form gửi (Bug Report 03/10 23:04) và đã
sửa — xem **§2.O phần 4**. Phần dưới là bối cảnh trước đó, giữ để đối chiếu.

Selector chọn town đích trong `selectors.ts` là `dockCities:
".cities.clearfix > li > a"`, bê nguyên từ script cũ (`sample/Send
Resources.user.js:372`, `legacy/Send Resources V2.js:376`). Game không còn dựng
markup đó. Bản chụp từ trang thật:

```html
<div id="js_transportPanel" class="transportPanel variableMainBox">
  <div class="transportPanel_header variableMainHeader">
    Transport
    <div class="close"></div>
  </div>
  <div class="variableMainContent">
    <div class="transportPanel_city" data-city-id="297035">
      <div class="transportPanel_cityName">M-Corinth</div>
      <div class="transportPanel_actions">
        <a
          class="transportPanel_actionIcon action_transport"
          title="Transport goods"
          href="?view=transport&destinationCityId=297035"
        ></a>
      </div>
    </div>
  </div>
</div>
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

**Cập nhật 03/10: không cần lệnh console nữa.** Nút **Bug Report** của panel
thu đúng các trường của lệnh dưới (`gameData.shipmentForm`, §2.N) và lưu ra
file. Cách lấy: mở Trading Port, bấm "Transport goods" (**không** bấm gửi),
bấm Bug Report, chép file vào `tools/output/`. File đầu tiên (03/10) có
`present: false` — lúc bấm đang ở city view.

**Cập nhật 27/09:** màn thứ nhất **đã có** (người dùng dán hai lần, ghi ở §2.E).
Chỉ còn thiếu form gửi. Crawler dò form bằng `#textfield_wine`, nên nếu form
đổi id thì nó báo "không có form" mà không nói gì thêm. Lệnh đã gửi người dùng
thay vào đó liệt kê mọi form, ô nhập và nút **đang hiện** — chạy sau khi bấm
"Transport goods", **không** bấm gửi:

```js
copy(
  JSON.stringify(
    {
      url: location.search,
      wineFieldForm:
        document
          .querySelector("#textfield_wine")
          ?.form?.outerHTML?.slice(0, 20000) ?? null,
      visibleControls: [
        ...document.querySelectorAll(
          "form, input, select, button, a.button, [id^=slider], [id*=submit]",
        ),
      ]
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({
          tag: e.tagName,
          id: e.id,
          name: e.getAttribute("name"),
          cls: String(e.className).slice(0, 80),
          type: e.type,
          value: e.value,
          text: (e.textContent || "").trim().slice(0, 40),
          form: e.form?.id,
        })),
    },
    null,
    1,
  ),
);
```

Lưu ý khi sửa: `#js_transportPanel` có `.close` riêng và là `.close` đầu tiên
trong trang (§2.E lỗi 3). Đừng dùng lại kiểu "click `.close` đầu tiên" ở bất
cứ đâu trong luồng gửi hàng.

Khi có, sửa ở bốn chỗ:

| Chỗ                                             | Việc                                                                                                                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/ikariam/selectors.ts`                 | bỏ `dockCities`, thêm nhóm `transportPanel`                                                                                                                                                                    |
| `src/send-resources/navigation.ts`              | `clickDestinationTown` theo cityId; xoá `adjustDestinationIndex`; truyền timeout tường minh thay vì để mặc định 15 s                                                                                           |
| `src/send-resources/features/send-resources.ts` | hai chỗ dính `dockCities` — lời gọi `clickDestinationTown` (đang ném lỗi) và `waitForElements(SEL.dockCities, …)` sau submit (có `.catch` nên chỉ phí 5 s mỗi lần gửi). Số dòng cũ (131, 175) đã dịch sau §2.L |
| `navigation.test.ts`                            | xoá 4 test của `adjustDestinationIndex`, thêm fixture `transportPanel`                                                                                                                                         |

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
**Đã đổi ở §2.K (02/10):** Start giờ làm trọn quy trình và bật timer
Transport — vẫn qua `syncRunnerToFlags()` (bằng `toggleQueueRunner`), không
gọi `runner.start()` thẳng.

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
- **Cập nhật 03/10:** nguyên nhân hẹp hơn "một ô không do game tự vẽ": chính
  class **`expandable`** của ô đó. Ô không có `expandable` (kiểu IkaEasy)
  không làm hỏng header; Send Resources đã có lại mục menu theo kiểu đó
  (§2.M phần 1).

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

| Mức        | Chỗ                                                          | Vấn đề                                                                                                                                                                                                                                                                                                                               | Cần gì                                                                                                                   |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| ✅ (03/10) | `src/core/ikariam/globals.ts` — `IkariamPageApi.createPopup` | Hai tham số cuối tên `arg4`, `arg5`; chỗ gọi truyền `"???", "class"` chép từ script gốc. **Đã có source của game** (Bug Report, §2.N): tham số 4 là **loại popup** (so với `ikariam.PopupController.TYPE_BUBBLE` / `TYPE_HEAVY`, khác thì là popup thường), tham số 5 là **class CSS thêm** cho khung popup (`"popupMessage " + n`). | Xong: đổi tên thành `popupType`, `className`; chỗ gọi truyền `null, null` (vẫn popup thường, bỏ class vô nghĩa `class`). |
| ⚠️         | `src/empire-overview/main.ts` — đầu ready handler            | Điều kiện dừng script khi có "backup-lock timer" dùng `$("backupLockTimer")` — thiếu `#`/`.`, nên chưa bao giờ khớp và chưa bao giờ dừng gì. **Đã xoá** điều kiện (hành vi giữ y như trước) thay vì đoán selector, vì đoán sai sẽ làm script ngừng chạy trên trang vốn vẫn chạy.                                                     | Nếu muốn có lại điều kiện này: một capture của đúng trang có bộ đếm đó, để biết nó là id hay class và nằm trên view nào. |

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

**Cập nhật 02/10:** bốn mục đầu (gạch ngang) đã làm — §2.L, phần 4. Hai mục
cuối giữ nguyên.

- ~~`send-resources/types.ts` — nhãn tài nguyên trong `RESOURCE_OPTIONS`
  (`"Wood"`, `"Wine"`, `"Marble"`, `"Crystal"`, `"Sulfur"`) chưa chuyển sang
  `send-resources/messages.ts`.~~
- ~~`send-resources/features/wine-warning.ts` — `formatHours` viết thẳng đơn vị
  `"h"`, `"d"`, `"<1h"`, `"—"`.~~
- ~~`send-resources/ui/queue-view.ts` — `describeTask` hiện tên tài nguyên dạng id
  nội bộ (`wood`, `glass`) thay vì nhãn cho người chơi.~~
- ~~`send-resources/features/auto-build.ts` — `listBuildingsInCurrentTown` parse
  tooltip của game bằng chuỗi đã dịch `"Under construction"`: đổi ngôn ngữ giao
  diện game là hỏng. Nên dựa vào class `constructionSite` (đã dùng ngay dòng
  dưới) thay vì chữ.~~
- Bảng `Constant.LanguageData` của Empire Overview chỉ có `en`. Ba key mới
  (`toast_updated`, `toast_movementAdded`, `toast_remoteVersionUnreadable`) chỉ
  được thêm vào đó.
- `tools/collect-dom-report.js` viết thẳng key `"ikaAjaxTrace"`; trong `src/`
  giờ là `TRACE_STORAGE_KEY` (`empire-overview/ajax-trace.ts`). Crawler không
  nằm trong build nên không import được — đổi tên thì phải sửa cả hai.

#### Đã sửa nhưng đổi hành vi — cần thử trên game thật

| Thay đổi                                                                                                | Ở đâu                                                                      | Thử gì                                                                  |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Tên town trên breadcrumb đọc bằng `textContent` thay vì `innerHTML`                                     | `core/ikariam/globals.ts` — `getCurrentTownName`, dùng chung cả hai script | Chuyển town bằng Auto Build, Scan và nút trên board; không còn chờ 15 s |
| Phím tắt dựa theo phím vật lý (`event.code`) thay vì `event.which` đã lỗi thời                          | `send-resources/app.ts` — `registerHotkeys`                                | Space mở/đóng panel, A, S, B vẫn đúng việc                              |
| `readNumberOrNull` trả `null` khi ô trống (trước: 0) và hiểu hậu tố `k`                                 | `core/dom.ts`                                                              | Số tàu rảnh và action point trên panel vẫn đúng                         |
| Bug report đổi trường `jQuery` thành `pageJQuery` + `scriptJQuery`, và đọc model qua `window` của trang | `core/bug-report.ts`, `empire-overview/diagnostics.ts`                     | Bấm Bug Report: `hasIkariamModel` phải là `true` trên cả hai script     |
| Chuyển town trên board chờ bằng `waitFor` của core (logic không đổi)                                    | `empire-overview/game-api.ts` — `switchTownWithGameForm`                   | Các nút "to Saw Mill", nút level: sang đúng town, dialog không bị đóng  |
| Toast "Updated: …" và "Could not read the remote version." lấy từ `LanguageData`                        | `empire-overview/game-api.ts`, `empire.ts`                                 | Toast vẫn hiện đúng chữ                                                 |
| Bỏ các rule CSS trùng không gắn id popup                                                                | `send-resources/ui/styles.ts`                                              | Ba hộp thoại Settings (Transport, Wine, Build) trông như cũ             |

### 2.E Auto Build trên tài khoản thứ hai (26–28/09/2026)

Mọi lỗi dưới đây chỉ lộ ra trên tài khoản `SClone1` (ba town: W-Clone1
297124, M-Clone1 297155, S-Clone1 297348), vốn bật tuỳ chọn **hiện toạ độ**
trong dropdown chọn town. Tài khoản chính không bao giờ gặp lỗi nào trong số
này. Mỗi bản sửa đều có test viết trước và đã thấy đỏ trên code cũ.

| #   | Người dùng thấy                                                                                                     | Nguyên nhân                                                                                                                                                                                                                               | Sửa                                                                                                                                                                                                                                                          | Trạng thái                                      |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1   | Mọi task Auto Build báo `Town "S-Clone1" not found`; task queue cạn, cấu hình Build vẫn còn                         | `title` trong dropdown là `"[42:97]  S-Clone1"`, còn breadcrumb và tên Auto Build lưu là `S-Clone1`                                                                                                                                       | Lấy tên town từ model theo city id (`selectvalue` → `modelCityName`); `title` chỉ là dự phòng. Board chờ đúng tên đó khi đổi town bằng form                                                                                                                  | ✅ commit `453482b`, **đã thấy chạy** trên game |
| 2   | Xây xong hết thì trang tải lại liên tục, nút kẹt ở "Stop Timer"                                                     | Queue cạn → reload; cờ Build vẫn bật nên lần load sau cạn ngay, lại reload. Script gốc chặn bằng `isAutoReload`; bản port chỉ ghi cờ đó mà không bao giờ đọc                                                                              | Khôi phục cơ chế của bản gốc (`loadedAfterRun` trong `app.ts`); tự tắt timer Build khi cấu hình rỗng (`hasConfiguredUpgrades`)                                                                                                                               | ✅ commit `453482b`, **đã thấy chạy**           |
| 3   | Start Timer của Build cứ mở panel Transport                                                                         | `closeGamePopup` click `.close` đầu tiên trong trang — chính là nút của `#js_transportPanel` đang ẩn; click nó làm panel **hiện ra** (đo bằng console)                                                                                    | Chỉ click `.close` đang hiển thị                                                                                                                                                                                                                             | ✅ commit `453482b`, chưa xác nhận trên game    |
| 4   | Trang tải lại mỗi 1–2 s, bấm Stop Timer cũng không dừng                                                             | `gotoTown` đổi town bằng `#changeCityForm` trước tiên; gửi từ runner, form tải lại cả trang mà không tới town đích, và mỗi lần load lại bắt đầu đúng lần đổi town đó. Cờ Build trong storage vẫn `true`                                   | Thứ tự mới: tên town trên board (đường của bản gốc) → form → `<a>` dropdown                                                                                                                                                                                  | ✅ commit `453482b`, chưa xác nhận trên game    |
| 5   | Nút trên board: cùng town thì mở đúng dialog; town khác thì chỉ sang town đó, không mở dialog                       | Đổi town bằng form **tải lại cả trang** (người dùng xác nhận); phần chờ rồi mở view chết cùng trang cũ. Tải thẳng URL của view (`location.assign("?view=townHall&cityId=…&position=0")`) cũng chỉ sang town, không mở dialog — đã thử tay | `loadUrl` lưu view cần mở vào `sessionStorage` (`ika_pendingBoardView`) trước khi đổi town; `openPendingView()` mở nó khi board khởi động xong trên trang mới — chỉ khi đúng town và còn mới (30 s). Đổi town không reload thì callback cũ mở và xoá bản ghi | ✅ commit `24061f0`, chưa xác nhận trên game    |
| 6   | Log `Upgrade button points at position 4, expected 23 - ignoring` rồi hoãn "not enough resources?" dù đủ tài nguyên | Lấy nút `#js_buildingUpgradeButton` **đầu tiên**; đó thường là nút của công trình vừa mở trước, còn trên màn hình                                                                                                                         | Chờ (trong 15 s sẵn có) tới khi nút có `position=` đúng slot; nút của slot khác vẫn không bao giờ bị click                                                                                                                                                   | ✅ commit `24061f0`, chưa xác nhận trên game    |

**Đã đo được, ghi lại để khỏi đo lại:**

- Dropdown bật toạ độ: `<li selectvalue="297348" class="ownCity coords"><a title="[42:97]  S-Clone1">`
  — hai dấu cách sau ngoặc. Model giữ toạ độ ở field `coords` riêng.
- `#js_transportPanel` luôn có sẵn trong trang (ẩn), town đích là
  `div.transportPanel_city[data-city-id]`, nút gửi là `a.action_transport` với
  `onclick="ajaxHandlerCall(this.href);return false;"`. Đây là phần markup
  §2.A còn thiếu — **chọn town đích giờ đủ dữ liệu**; chỉ còn thiếu form gửi.
- Một dòng `Auto Build: queued N upgrades` trong log = một lần load trang (hoặc
  bấm Start). Hai dòng cách nhau vài giây = trang vừa tải lại. Từ §2.F dòng
  này là `Auto Build: queued N towns`, và chỉ xuất hiện khi bắt đầu vòng mới
  — load giữa vòng thì không ghi.
- Console của người dùng có thể lọc mất `console.log`. Probe nên **trả về** kết
  quả, và đặt `await` phía trước khi phải chờ.

**Còn mở:**

- **Vì sao form đổi town tải lại cả trang.** Chưa biết. Cho tới khi biết, Send
  Resources không có board sẽ lại dùng form và có thể lặp reload. Đây là phần
  còn lại của 1.4 ("xác nhận từ response").
- **Town rảnh không bắt đầu khi town khác đang xây** — người dùng báo trước
  bản sửa lỗi 4, chưa thử lại. **Cập nhật 28/09:** người dùng báo lại dạng
  "chỉ nhảy qua lại 2 town, town đầu board không bao giờ được nâng"; nguyên
  nhân tìm được ở §2.F. Nghi ngờ cũ vẫn còn giá trị nếu sau §2.F một town rảnh
  vẫn bị báo "already building": `TOWN_SETTLE_MS` 1200 ms có thể quá ngắn,
  slot của town trước vẫn còn trên màn hình. Chưa đo.
- **Dialog mở quá sớm?** `openPendingView` chạy ngay khi board khởi động xong.
  Nếu game còn đang tải, dialog có thể mở rồi bị đóng — kiểu lỗi đã gặp 25/09.
  Nếu gặp: chờ game rảnh như `switchTownWithGameForm`.
- ~~**C — log ai gọi `backToCity`:** đã đề xuất, chưa làm.~~ Xong ở §2.G.

### 2.F Auto Build chạy theo vòng như bản gốc, và `needingShip` (28/09/2026)

**Đã commit (`1f7c0e7`, tài liệu ở `4841fb9`), đã push. Có trong `dist/` từ bản build 29/09 01:33. Chưa thử trên game.**

**Người dùng báo** (tài khoản `SClone1`, board xếp W-Clone1, M-Clone1,
S-Clone1):

1. Nhiều town có queue nhưng runner chỉ nhảy qua lại 2 town.
2. Town đầu tiên trên board (board không xếp theo alphabet) không bao giờ được
   nâng dù đã đặt queue.
3. Vẫn chạy liên tục, không nghỉ giữa các lượt.

**Bản gốc chạy thế nào** (`legacy/Send Resources V2.js:1435-1511`, `1576-1581`):
mỗi lần load trang, sau 2 s, `checkAndProcessAutoBuild(0)` đi **một vòng**
qua các town có queue (xếp theo tên). Ở mỗi town: đang xây thì
`"This town is inprogress, Next>>"`; rảnh thì chỉ nâng **entry đầu tiên**. Hết
vòng thì đặt `isAutoReload = true` và reload; lần load đó bỏ qua. Vòng kế tiếp
tới cùng keep-alive reload ở **phút chẵn** — tức 2 phút một vòng. Không có
interval 60 s nào: `autoCheckFinishedAccount` (interval 10 s) có `return;` ngay
dòng đầu.

**Nguyên nhân trong bản port:**

| Người dùng thấy                       | Nguyên nhân                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nhảy town liên tục                    | `enqueueAutoBuild` tạo **mỗi entry một task**. Town đang xây thì task `defer` xuống cuối và xoay vòng mãi; runner tick mỗi 1 s, mỗi lần xoay là một lần đổi town                                                                                                                                                                     |
| Town đầu board không bao giờ tới lượt | Mỗi lần keep-alive reload, `start()` gọi `enqueueAutoBuild`, hàm này **xoá hết và xếp lại từ đầu theo alphabet**. Board là W, M, S; alphabet là M, S, W — W đứng cuối. Nếu các entry của M và S (mỗi entry thiếu tài nguyên chờ nút tới 15 s) chiếm hết 2 phút, W không bao giờ tới lượt. **Suy luận từ code, chưa có log xác nhận** |

**Sửa** (người dùng chọn: theo vòng như bản gốc, 2 phút, thứ tự board):

| Chỗ                                               | Thay đổi                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `features/auto-build.ts`, `enqueueAutoBuild`      | Mỗi town có queue **một task**, chỉ entry đầu tiên. Thứ tự: dòng trên board (`#BuildTab`, người chơi kéo được), không có board thì thứ tự dropdown, không tìm thấy thì cuối. Log `Auto Build: queued N towns`                                                                        |
| `features/auto-build.ts`, `handleUpgradeBuilding` | Town đang xây, không có nút Upgrade, bắt đầu xây giữa chừng, hay bấm mà không thành công trường → `endTownTurn`: log `… - next town`, trả `done`. **Không `defer` nữa.** Entry vẫn nằm trong `listAutoBuild` cho vòng sau; chỉ xoá khi thấy slot thành `constructionSite` (như §2.B) |
| `app.ts`, `start()`                               | Còn task `upgradeBuilding` trong queue (keep-alive reload giữa vòng) thì **đi tiếp vòng đó**, không xếp vòng mới. Queue lưu trong localStorage nên các town còn lại vẫn nằm đó                                                                                                       |

Hết vòng → queue cạn → `onDrain` sẵn có (dọn cấu hình, đặt `isAutoReload`,
reload) → lần load sau bỏ qua → keep-alive phút chẵn → vòng mới. Keep-alive và
cơ chế drain không đổi.

**Test:** sửa 4 test cũ của `handleUpgradeBuilding` (`defer` → `done`, thêm
kiểm tra không click nút sai slot); thêm 3 test: một task mỗi town với entry
đầu tiên, theo thứ tự board, và tiếp tục vòng sau reload (`app.test.ts`). Cả 7
đã thấy **đỏ trên code cũ**. 34 file, 466 test, typecheck sạch.

**`needingShip` (Barbarian Village/Fleet):** `barbarian.ts` chia tổng hàng cho
hằng số `520`. Giờ chia cho `getPerShipCapacity()` — sức chứa merchant ship
đã Calibrate, mặc định 500. **Chưa có test** (file này không có test nào; chưa
tạo). **✅ 04/10 (§2.P): làm tròn lên (`Math.ceil`).** Trước đó: số tàu vẫn làm tròn bằng `Math.round`, nên có thể thiếu tàu
(1.200 hàng / 500 → 2 tàu, cần 3); Fleet vẫn cộng 1 như bản gốc.

**Cần thử trên game:**

- Log mỗi vòng có đủ ba town, W-Clone1 có `Going to town W-Clone1`. Nếu W
  vẫn bị bỏ qua thì nguyên nhân không phải (hoặc không chỉ) việc xếp lại vòng
  — cần log quanh lượt của W.
- Giữa hai vòng runner đứng yên, không đổi town.

### 2.G Bốn việc không chờ gì (28/09/2026)

**Đã commit (`1f7c0e7`, tài liệu ở `4841fb9`), đã push. Có trong `dist/` từ bản build 29/09 01:33. Chưa thử trên game.** Người dùng chọn
cả bốn; làm theo thứ tự H → D → 2.4 → C. Mỗi việc có test, và test đó đã thấy
**đỏ trên code cũ** (bỏ phần sửa, chạy, khôi phục). 34 file, 477 test,
typecheck sạch.

| Việc                              | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ở đâu                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **H — khoá nhiều tab**            | `TabLock` dùng Web Locks API (`navigator.locks`), như `js/helper/syncLock.js` của IkaEasy V4. Mỗi tài khoản một khoá `ika-task-runner:<tài khoản>`. Runner bật thì xin khoá, tắt (hoặc queue cạn) thì nhả. Tab không giữ khoá chờ trong hàng đợi của trình duyệt và nhận ngay khi tab kia nhả; trình duyệt tự thu hồi khi tab đóng hoặc reload. Option mới `canRun` của `TaskRunner` được kiểm **trước cả bước drain** — nếu không, tab đang chờ thấy queue (chung qua localStorage) cạn và tự reload. Log: `This tab now runs the task queue…` / `Another tab is running the task queue… - waiting`. Trình duyệt không có Web Locks thì cấp ngay, chạy như trước khi có khoá | `core/task-queue.ts` (đặt cạnh runner, không tạo file mới), `send-resources/app.ts` (`startRunner`/`stopRunner`) |
| **D — sọc kho đầy**               | Class mới `capped` trên thanh kho của tab Resource khi tồn kho ≥ sức chứa (ngưỡng của IkaEasy: `amount >= maxAmount`), sọc chéo đỏ/cam chép từ `css/empire-resources.css`. `full` sẵn có đỏ từ 96% nên không phân biệt "sắp đầy" với "đầy, sản lượng đang mất". Gold bỏ qua — thanh của nó đo thứ khác và dùng lại chính class `full`                                                                                                                                                                                                                                                                                                                                         | `empire-overview/render.ts`, `empire-overview/helpers.ts` (CSS)                                                  |
| **2.4 — tàu rảnh + action point** | Footer panel: `… — Idle ships 227 + 5 freighters · AP 11`, đọc bằng `getFreeShips()`/`getActionPoints()` (header trước, model dự phòng) — đúng hai thứ `handleSendResource` chờ khi trả `retry`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `send-resources/ui/panel.ts`, `send-resources/messages.ts`                                                       |
| **C — ai gọi `backToCity`**       | `backToCity(reason)`, tham số bắt buộc, log `Back to the town view: <lý do>` khi thật sự bấm. Năm chỗ gọi: keep-alive, queue cạn, Auto Build cần town view, scan xong, shipment (hai chỗ)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `send-resources/navigation.ts` và các chỗ gọi                                                                    |

**Đã biết, chưa làm:**

- **H:** nhân bản tab (duplicate) không phải vấn đề — khoá theo trang, không
  theo `sessionStorage`. Nhưng hai tab của cùng tài khoản sẽ **luân phiên**
  giữ khoá: keep-alive reload tab đang giữ, khoá sang tab kia. Vô hại (lúc nào
  cũng chỉ một tab chạy), chỉ cần biết khi đọc log. Nút Scan vẫn không dùng
  khoá — nó do người dùng bấm tay, và đã từ chối khi runner đang bật.
- **2.4:** dòng trạng thái vẫn ghi "idle" khi task đầu queue là Auto Build —
  `describeCurrentTransfer` chỉ mô tả `sendResource`. Không nằm trong mục này.

**Cần thử trên game:**

- Mở hai tab cùng tài khoản, bật Start Timer: chỉ một tab đổi town; log tab
  kia có `… - waiting`.
- Tab Resource: town có kho chạm trần có sọc; town 97% chỉ đỏ.
- Footer panel khớp số tàu và action point trên header của game.

### 2.H Hai chỉnh sửa hộp thoại (29/09/2026)

**Đã commit (`1f7c0e7`, tài liệu ở `4841fb9`), đã push. Có trong `dist/` từ bản build 29/09 01:33. Chưa thử trên game.** Người dùng yêu
cầu. Bốn test mới, cả bốn đã thấy **đỏ trên code cũ**. 34 file, 481 test,
typecheck sạch.

| Người dùng muốn                                                                  | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                        | Ở đâu                                                                                            |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Nút "Run queue" trong Auto Build Settings thừa, lẫn với nút Start của Auto Build | Thành **Save**, và Save chỉ **đóng hộp thoại** — như `saveAutoBuild` của bản gốc (`legacy/Send Resources V2.js:1239-1243`). Không cần ghi gì: mỗi lần bấm `+`/`-` đã lưu `listAutoBuild`. Nạp queue và chạy giờ chỉ còn nút **Start** trên panel. Action `build.enqueue` và chuỗi `runQueue` đã xoá                                                                                                             | `ui/dialogs.ts`, `app.ts` (`build.save`), `messages.ts`                                          |
| Transport Settings: dropdown Resource mỗi lần Add chỉ được một dòng              | **Năm ô số** (Wood, Wine, Marble, Crystal, Sulfur) thay cho dropdown + ô Amount. Add thêm **một dòng queue cho mỗi ô đã nhập**, cùng town gửi/nhận; ô trống bỏ qua. Chỉ nhận số nguyên dương (chỉ chữ số — `2.5`, `-4`, `1e3`, `+4` bị từ chối): có ô sai thì không thêm dòng nào và báo tên ô; cả năm ô trống thì báo "Enter an amount for at least one resource." Số vẫn giữ trong ô sau Add, như ô Amount cũ | `ui/dialogs.ts` (`readSendForm` trả `amounts` + `invalid`), `app.ts` (`send.add`), `messages.ts` |

**Đã biết, chưa làm:** hộp thoại Auto Build vẫn còn nút **Close**, giờ làm
đúng việc của Save. Đã hỏi người dùng có bỏ không; chưa có trả lời.
**✅ 04/10 (§2.P):** đã bỏ nút Close. **Cùng ngày (§2.R): người dùng muốn có lại — đã thêm lại, cạnh Save.**

**Cần thử trên game:** Add với ba ô có số → bảng dưới hộp thoại có ba dòng;
Save trong Auto Build Settings đóng hộp thoại và không đổi town.

### 2.I Bốn chỉnh sửa người dùng yêu cầu (29/09/2026)

**Đã commit (`a62e8dd`, tài liệu ở `066eb44`), đã push. Chưa thử trên game.** `dist/` do người dùng build lúc 29/09
21:24 đã có đủ bốn phần (đã grep hai userscript: `ika-send-amounts`,
`ika-toast`, `drains`, `fitTownRows`, `:scope > tbody > tr`). 34 file,
481 → 496 test, typecheck (cả cấu hình strict) và prettier sạch.

#### 1. Layout ô số lượng trong Transport Settings

Người dùng đưa mẫu HTML/CSS: mỗi tài nguyên một dòng, tên bên trái, ô số bên
phải, số căn phải.

| Thay đổi                                                                                                                                                                                                                                                                             | Ở đâu                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Năm ô số nằm trong một khung nền be, tiêu đề **Amount**. Mỗi dòng là lưới hai cột: `<label for>` rộng 65px, ô nhập chiếm phần còn lại, số căn phải, viền đổi màu khi focus. CSS lấy nguyên từ mẫu, gắn vào `<head>` **một lần** (`#ika-send-amounts-style`) khi mở hộp thoại lần đầu | `send-resources/ui/dialogs.ts` (`sendAmountsStyles`, `installSendAmountsStyles`) |
| Chuỗi `SEND_DIALOG.amount` từ `"Amount: "` thành `"Amount"` cho khớp mẫu. Chỉ hộp thoại này dùng                                                                                                                                                                                     | `send-resources/messages.ts`                                                     |

**Khác với mẫu:** tên class có tiền tố — `.ika-send-amounts`,
`.ika-send-amounts-title`, `.ika-send-amounts-row` — thay cho `.resource-form`,
`.form-title`, `.resource-row`. Tên chung như vậy có thể trùng CSS của game và
đổi giao diện chỗ khác trên trang. Người dùng đã được báo; muốn dùng đúng tên
mẫu thì đổi lại.

**Không đổi:** id các ô (`transporterSendAmount_<resource>`), nên
`readSendForm` và việc thêm dòng vào queue y như §2.H. Dòng From/Destination và
các nút giữ nguyên. **Không có test** — chỉ đổi giao diện; test của §2.H vẫn
phủ phần đọc form.

**Cần thử trên game:** tên thẳng cột, số căn phải, khung không tràn ra ngoài
popup của game.

#### 2. Cảnh báo "Warning wine" cho town không tụt rượu

**Cách tính hiện tại** (code port nguyên từ bản gốc):

1. Lượng uống mỗi giờ — `updateCityDataFromAjax` (`models/city.ts`): lấy
   `wineSpendings`. Nếu số đó có trong bảng `wineUse` của tavern thì trừ Wine
   Press: `wineSpendings × (100 − cấp press) / 100`; không có thì dùng nguyên.
2. Số giờ còn lại — `getEmptyTime` (`models/resource.ts`):
   `net = sản lượng/giờ − lượng uống`. `net < 0` →
   `tồn kho / |net|`; ngược lại `Infinity`.
3. Làm tròn theo mốc giờ — `updateResourceCounters` (`render.ts`):
   `time > 1` → `floor(time) + (60 − phút hiện tại) / 60`, còn lại `0`.
4. Bật toast `!!! Warning wine > <town> !!!` khi `time < wineWarningTime` và ô
   "Hide tooltip 'wine warning'" không tick. Ngưỡng chọn trong Settings: 0 /
   12 / 24 / 36 / 48 / 96 giờ (mặc định 0 = tắt). Hàm này chạy lại **mỗi 5 s**
   khi board mở ở tab đầu.

**Lỗi:** khi `getEmptyTime` là `Infinity` (rượu không giảm), bản gốc lấy
`getFullTime` — số giờ tới khi **kho đầy** — để so với ngưỡng:

| Trường hợp                                                                                                  | `getFullTime`       | Kết quả cũ                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| `net = 0`: không tavern, không làm ra rượu, hoặc tavern đang nâng cấp (consumption = 0, §2 "số đo về rượu") | `0`                 | `time = 0` < mọi ngưỡng > 0 → cảnh báo **mỗi 5 s**, ô đỏ ghi 0 |
| `net > 0`: làm ra nhiều hơn uống                                                                            | giờ tới khi kho đầy | cảnh báo khi kho sắp **đầy**, nội dung vẫn là "Warning wine"   |

**Sửa** (người dùng chọn: không cảnh báo, ô để trống; `net > 0` xử lý như
`net = 0`): `getEmptyTime` là `Infinity` thì **không** lấy `getFullTime`,
**không** bật toast, ô thời gian **trống** và không tô Red/Green. Town đang tụt
rượu (`net < 0`) tính như cũ. Ghi chú `FIX (not in the original)` tại chỗ sửa
trong `empire-overview/render.ts`.

**Test** (`empire-overview/startup.test.ts`, nhóm "the wine warning"): mỗi
test đưa một response `updateGlobalData` vào board, bật cảnh báo ở 96 giờ rồi
vẽ lại tab Resource. Một test đối chứng (town sắp hết rượu vẫn bị cảnh báo, ô
đỏ) và hai test regression (`net = 0`, `net > 0`); hai test regression đã thấy
**đỏ trên code cũ**.

**Đã biết, chưa làm:**

- **✅ 04/10 (§2.P): mỗi town một lần.** Toast của town **thật sự** sắp hết rượu vẫn bật lại **mỗi 5 s** — cảnh báo
  nằm ngay trong vòng cập nhật định kỳ, không có "chỉ báo một lần". Người dùng
  chưa yêu cầu sửa.
- `$.inArray(wineSpendings, wineUse, wineUse2)` truyền `wineUse2` vào chỗ tham
  số `fromIndex`, nên chỉ `wineUse` được dò; bảng `wineUse2` (server `s202`)
  bị bỏ qua. Trên `s303` không ảnh hưởng.

**Cần thử trên game:** đặt ngưỡng > 0; town không có tavern (hoặc tavern đang
nâng cấp) và town rượu không còn toast, ô trống; town sắp cạn vẫn đỏ và có
toast.

#### 3. `window.alert` → toast tự tắt

Người dùng chọn: **toast tự tắt** (không phải hộp có nút OK, không phải popup
của game), sửa **cả hai script**, **giữ nguyên `confirm()`**.

| Script          | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ở đâu                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dùng chung      | `showToast(message)` mới, đặt cạnh widget cửa sổ (không tạo file mới). Toast ở giữa, phía dưới trang, cùng tông màu với cửa sổ panel; nhiều thông báo thì xếp chồng. Hiện `4 s + 50 ms × số ký tự`, tối đa 15 s (`toastDuration`); bấm vào thì tắt ngay; mờ dần 400 ms. Nội dung là **text thuần** (`textContent`), giữ xuống dòng (`white-space: pre-line`). Style gắn một lần (`#ika-toast-style`); khung `#ika-toast-stack` tự tạo lại nếu `body` bị vẽ lại | `core/ui/window.ts`                                                                                                                                                      |
| Send Resources  | **28 chỗ** `alert(` → `showToast(`                                                                                                                                                                                                                                                                                                                                                                                                                             | `app.ts` (10), `features/auto-build.ts` (5), `ui/data-transfer-ui.ts` (5), `features/auto-wine.ts` (4), `ship-capacity.ts` (2), `navigation.ts` (1), `ui/dialogs.ts` (1) |
| Empire Overview | **3 chỗ** (`alert_palace` ở tab Help; hai chỗ `alert` khi bật cùng lúc hai kiểu danh sách building trong Settings) → `render.toastAlert` **sẵn có** của board, tức kiểu toast cũ của board: hiện ~3 s rồi mờ                                                                                                                                                                                                                                                   | `empire-overview/render.ts`                                                                                                                                              |

Send Resources không dùng `render.toastAlert` vì nó nằm trong bundle Empire
Overview — hai script không chung module (handover §4), và Send Resources không
được phụ thuộc board (§3, quyết định thiết kế).

**Không đổi:** `confirm()` — import dữ liệu (tài khoản khác, xác nhận import),
xoá queue, và câu hỏi mở trang cập nhật khi Empire Overview thấy có bản mới
(`empire.ts`). Đổi sang hộp trong trang phải viết lại luồng code để chờ câu
trả lời.

**Test:**

- `core/ui/window.test.ts`: 7 test mới cho `showToast` (text chứ không phải
  markup, xếp chồng, tự tắt đúng hạn, lâu hơn với thông báo dài nhưng có trần,
  bấm để tắt, style một lần, khung tự tạo lại). Hàm mới nên **không có bản cũ
  để thấy đỏ**.
- `app.test.ts`, `features/auto-build.test.ts`: kiểm `showToast` thay cho
  `window.alert`, qua mock một phần `@core/ui/window` (`vi.hoisted` để cùng
  một mock sau `vi.resetModules()`; các export khác giữ thật). Chạy trên
  `app.ts` và `auto-build.ts` cũ: **7 test đỏ**.
- `features/auto-wine.test.ts`, `ship-capacity.test.ts`: bỏ dòng mock
  `window.alert` không còn cần.

**Đã biết, chưa làm:**

- Import dữ liệu của tài khoản khác mà chọn **không** đổi tên: toast
  `skippingOtherAccount` bật ngay trước một `confirm()`, nên có thể bị hộp đó
  che, hoặc chỉ thấy sau khi trả lời.
- Bản tóm tắt bug report cắt ở 800 ký tự (`BUG_SUMMARY_PREVIEW_CHARS`), nên
  toast đó luôn chạm trần 15 s.

**Cần thử trên game:** Add sai số trong Transport Settings → toast, trang không
bị chặn; Scan xong → toast nhiều dòng đọc được; toast chồng nhau khi bấm liên
tiếp.

#### 4. Board Empire Overview: header, 5 town, cuộn, footer

Người dùng muốn: header như cũ, **5 hàng town**, nhiều hơn thì cuộn, footer
tổng như cũ. Làm cho cả **ba tab có hàng town**: Resource (`table.resources`),
Buildings (`table.buildings` — không có `tfoot`, nên chỉ header + 5 town) và
Army (`table.army`). Tab có ≤ 5 town không đổi gì.

| Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                       | Ở đâu                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| CSS: `#ResTab`, `#BuildTab`, `#ArmyTab` có `overflow-y: auto`; `thead` của bảng con trực tiếp `position: sticky; top: 0`, `tfoot` `position: sticky; bottom: 0`, `z-index: 2`. Nền của `thead`/`tfoot` là rule sẵn có của board                                                                                                                                                                                | `empire-overview/helpers.ts` (chuỗi CSS chính, ngay sau rule `capped`) |
| `fitTownRows(panel)`: đặt `max-height` cho khung tab = từ đầu bảng tới đầu town thứ 6, cộng từ đầu `tfoot` tới đáy bảng (không có `tfoot` thì từ đáy town cuối). **Đo thật**, không cố định: mỗi tab cao khác nhau và đổi theo setting cỡ chữ. Bỏ `max-height` trong lúc đo, để đọc `tfoot` ở chỗ thật chứ không phải chỗ `sticky` giữ nó; giữ `scrollTop`. Tab đang ẩn đo ra 0 → giữ mức cũ, đo lại khi hiện  | `empire-overview/render.ts`                                            |
| `watchTownRows()`: gọi ở cuối `DrawTables`. Đo cả ba tab ngay, rồi `ResizeObserver` trên bảng của từng tab đo lại mỗi khi bảng đổi kích thước (hàng vẽ lại, chuyển tab, đổi cỡ chữ). Bảng còn bị **thay cả phần tử** (`Utils.setClone`), nên một `MutationObserver` (`childList`) trên mỗi tab theo bảng mới và `unobserve` bảng cũ. Chỉ cài một lần; trình duyệt không có `ResizeObserver` thì chỉ đo một lần | `empire-overview/render.ts`                                            |
| Hằng `VISIBLE_TOWN_ROWS = 5`                                                                                                                                                                                                                                                                                                                                                                                   | `empire-overview/render.ts`                                            |

**Bẫy gặp khi làm:** happy-dom **không có** `HTMLTableElement.tBodies` — bản đầu
dùng `table.tBodies` làm cả 24 test của `startup.test.ts` đỏ ("undefined is not
iterable"). Đổi sang selector `:scope > tbody > tr` / `:scope > tfoot`, chạy
được ở cả hai môi trường.

**Test** (`empire-overview/startup.test.ts`, nhóm "the town tables' height"):
happy-dom không có layout nên test tự gán hộp cho từng phần tử. Năm test: 8
town có totals → header + 5 + totals; không totals → header + 5; ≤ 5 town →
bỏ `max-height`; tab ẩn → giữ mức cũ; CSS sticky/overflow có trong trang. Tính
năng mới — **không có bản cũ để thấy đỏ** (trước đó hàm không tồn tại).

**Chưa kiểm chứng, cần xem trên game:**

- Thanh cuộn dọc chiếm ~15px — có thể làm xuất hiện thêm thanh cuộn ngang nếu
  board (absolute, co theo nội dung) không tự nới ra.
- Kéo thả sắp xếp town (jQuery UI sortable, `handle: ".city_name .icon"`) khi
  danh sách đang cuộn.
- Viền `thead`/`tfoot` khi đang cuộn có thể lệch 1–2px.
- `DrawTables` thay cả nội dung tab (`.html(...)`); nếu việc đó xảy ra khi đang
  cuộn, vị trí cuộn có thể về đầu. Cập nhật hàng thường ngày (`setClone` từng
  hàng) không đụng tới khung tab. Liên quan 2.7 (§3).

### 2.J Upgrade kẹt sau lệnh gửi đang chờ tàu (29/09/2026)

**Đã commit (`a62e8dd`, tài liệu ở `066eb44`), đã push. Chưa thử trên game.** `dist/` do người dùng build lúc 29/09
22:30 đã có bản sửa (đã grep `blockedTypes` trong userscript Send Resources).
34 file, 496 → 500 test, typecheck và prettier sạch.

**Người dùng báo:** hết tàu rảnh thì task gửi hàng không chạy, và các task
upgrade phía sau cũng không chạy, dù town đó không có công trình nào đang
nâng. Queue lúc đó:

```
1 ▶ [Auto Wine] 24,338 wine: W-1 → M-1
2   [Auto Wine] 35,191 wine: W-1 → M-2
3   [Auto Wine] 58,645 wine: W-1 → S-1
4   Upgrade Warehouse 5 in W-1
5   Upgrade Warehouse 4 in M-1
6   Upgrade Warehouse 5 in S-1
7   Upgrade Warehouse 6 in M-2
```

**Nguyên nhân:** `handleSendResource` trả `retry` khi không có tàu rảnh
(`features/send-resources.ts`), và runner hiểu `retry` là **"mọi task đều bị
chặn"** — giữ task ở đầu queue, tick sau thử lại chính nó. Comment của
`TaskResult` ghi "no ships" là thứ chặn mọi task. Điều đó chỉ đúng khi queue
chỉ có lệnh gửi; từ khi Transport và Build **dùng chung một runner** (handover
§5), hết tàu chặn luôn cả upgrade — thứ không cần tàu.

**Sửa** (người dùng chọn cách này, trong ba cách được đưa ra):

| Thay đổi                                                                                                                                                                                                                                         | Ở đâu                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `retry` giờ nghĩa là "mọi task **cùng loại** bị chặn". Runner giữ tập `blockedTypes` (trong bộ nhớ, như `busy`; reload là bắt đầu lại từ đầu queue): task trả `retry` thì loại của nó vào tập, trả kết quả khác thì ra                           | `core/task-queue.ts`, `TaskRunner.tick` |
| `nextTask()` thay cho `queue.head()`: chọn task đầu tiên có loại **không** bị chặn. Không còn task nào như vậy thì **xoá tập** và chạy task đầu queue — tức là khi chỉ còn lệnh gửi, runner thử lại lệnh đầu mỗi giây như cũ, tàu về là gửi ngay | `core/task-queue.ts`                    |
| Comment của `TaskResult` và của nhánh `retry` viết lại theo nghĩa mới                                                                                                                                                                            | `core/task-queue.ts`                    |

Với queue ở trên: task 1 trả `retry` → runner chạy 4, 5, 6, 7 (mỗi town một
lượt, như §2.F) → chỉ còn lệnh gửi → thử lại task 1 mỗi giây. Các lệnh gửi
**giữ chỗ và thứ tự**, không bị đẩy xuống cuối. Hai loại cùng `retry` (ví dụ
upgrade "Not on the town view" trong lúc hết tàu) thì runner **luân phiên**,
không kẹt, không mất task.

**Hai cách không chọn:**

- Handler gửi hàng trả `defer` khi hết tàu — đơn giản hơn, nhưng các lệnh gửi
  bị đảo thứ tự, và khi chỉ còn lệnh gửi thì cả queue `defer` → runner nghỉ
  60 s mỗi vòng thay vì bắt tàu về ngay.
- Tách hai queue riêng — đụng lưu trữ queue, queue view, export dữ liệu và
  quyết định "dùng chung một runner".

**Test** (`core/task-queue.test.ts`, nhóm "a `retry` blocks its own type
only"): upgrade chạy khi lệnh gửi chờ tàu, và lệnh gửi giữ thứ tự; hết việc
khác thì quay lại lệnh gửi đầu mỗi tick; tàu về thì gửi ngay; cả hai loại
`retry` thì luân phiên và không mất task. Cả bốn **đỏ trên runner cũ**. Test
`retry` cũ (queue chỉ có lệnh gửi, không được xoay) vẫn xanh.

**Đã biết, chưa làm:**

- **✅ 04/10 (§2.P): ▶ và dòng trạng thái theo task runner đang chạy.** **Queue view vẫn đặt ▶ ở task đầu queue** (`ui/queue-view.ts` dùng
  `queue.head()`), và dòng trạng thái của panel (`describeCurrentTransfer`)
  vẫn mô tả lệnh gửi đầu queue — kể cả khi runner đang chạy upgrade phía sau.
  Người dùng chưa yêu cầu sửa; muốn ▶ chỉ đúng task đang chạy thì runner phải
  cho biết task nó chọn.
- **Gửi hàng tự động vẫn hỏng** (§2.A). Sửa này chỉ giúp upgrade không kẹt;
  tàu về thì lệnh gửi ném lỗi và bị bỏ sau 5 lần, như trước.
- **Vòng Auto Build kế tiếp khi queue còn lệnh gửi:** queue không cạn nên
  `onDrain` (reload + đặt `isAutoReload`) không chạy. Vòng mới phải đến từ
  keep-alive reload rồi `start()` — `start()` chỉ xếp vòng mới khi không còn
  task `upgradeBuilding` nào (§2.F), điều kiện này đúng. **Chưa kiểm trên game.**
  **Cập nhật 02/10 (§2.L phần 3):** khi **chỉ** Build bật, shipment không còn
  được chạy, nên queue chỉ còn shipment tính là cạn → `onDrain` chạy như
  thường. Khi cả hai timer bật thì vẫn như mô tả ở đây.

**Cần thử trên game:** hết tàu rảnh, queue có cả lệnh gửi lẫn upgrade → log
có `Going to town …` cho từng town của vòng Auto Build; queue còn lại đúng các
lệnh gửi, đúng thứ tự; tàu về thì lệnh gửi đầu chạy.

### 2.K Nút ↑/↓ từng hàng, và Start của Auto Wine làm trọn quy trình (02/10/2026)

**Đã commit (`4f9436c`, chung một commit với §2.L; tài liệu ở `3209964`),
chưa push. Chưa build vào `dist/`, chưa thử trên game.** Người dùng yêu
cầu. 34 file, 500 → 515 test, typecheck (cả cấu hình strict) và prettier sạch.

#### 1. Nút ↑/↓ — mỗi lần bấm chỉ đổi một hàng

| Chỗ                 | Thay đổi                                                                                                                                                                                                                                   | Ở đâu                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Queue (panel)       | Thêm **↑**. **↓** không còn đẩy task xuống **cuối** queue (`moveToBack`) mà chỉ đổi chỗ với hàng kề. Hàng đầu có ↑ mờ, hàng cuối có ↓ mờ (`disabled`)                                                                                      | `ui/queue-view.ts`, `app.ts` (`queue.moveUp`/`queue.moveDown`)                                                                    |
| Transport Settings  | Cột mới ↑/↓ trong bảng lệnh gửi. Bảng chỉ có lệnh gửi, nên "hàng kề" là **lệnh gửi kề**; task upgrade xen giữa trong queue chung **giữ nguyên chỗ**                                                                                        | `ui/dialogs.ts` (`renderResourceTable`), `app.ts` (`send.moveUp`/`send.moveDown`), `messages.ts` (thêm cột trống)                 |
| Auto Build Settings | ↑/↓ cạnh nút `-` của mỗi entry, đổi chỗ trong danh sách đã lưu của town đó (`listAutoBuild`)                                                                                                                                               | `ui/dialogs.ts` (`renderTownQueue`), `features/auto-build.ts` (`moveBuildingInQueue`), `app.ts` (`build.moveUp`/`build.moveDown`) |
| Dùng chung          | `TaskQueue.moveOneStep(id, "up" \| "down", withinType?)`: đổi chỗ với task kề; có `withinType` thì task kề là task **cùng loại** gần nhất. `moveButtons()` vẽ cặp nút cho cả ba chỗ; chuỗi tooltip `MOVE_BUTTON`; CSS `.ika-move:disabled` | `core/task-queue.ts`, `ui/actions.ts`, `messages.ts`, `ui/styles.ts`                                                              |

`moveToBack` **vẫn giữ**: runner dùng nó cho task trả `defer`.

**Hai entry cùng một building** (vd. Warehouse 4, Warehouse 5) — người dùng
chọn "tính lại level theo thứ tự mới". Đổi chỗ rồi đánh số lại thì ra đúng như
cũ, nên bấm ↑/↓ giữa hai entry đó **không đổi gì**. Đổi chỗ với building khác
thì bình thường.

#### 2. Start của Auto Wine làm trọn quy trình

Trước: Scan → Settings → Load → tick town nguồn → Save → **Start** (nạp
queue) → Start Timer. Người dùng thấy nút Start thừa.

| Cách dùng                    | Giờ làm gì                                                                                                                                                                                                                                                                                      | Ở đâu                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Bấm **Start** trên panel     | Chưa tick town nguồn → báo "No town is ticked as a wine source!"; tick nhiều town → popup chọn. Rồi: **Scan** và chờ xong (toast "Sync finished …"), lấy lượng uống mỗi town như Load rồi lưu như Save (`saveMeasuredReceivers`), nạp queue, **bật Start Timer của Transport** (đã bật thì giữ) | `app.ts` (`wine.autoRun`, `wine.autoRunFrom`, `runAutoWine`, `withWineSource`), `features/auto-wine.ts` |
| Làm từng bước trong Settings | Như cũ (Load, tick nguồn), nhưng **Save** giờ vừa lưu vừa **nạp queue** (nhiều nguồn → popup chọn). Start Timer người dùng tự bấm                                                                                                                                                               | `app.ts` (`wine.save`, `wine.queueFrom`)                                                                |

- `scanBuildings` giờ trả `true` khi scan chạy xong, `false` khi từ chối (đang
  scan, không có danh sách town, runner đang chạy). Start dừng khi `false`.
- `saveMeasuredReceivers`: mỗi town **không** tick Sender lấy lượng uống đo được
  (board, rồi town cache); không có số đo thì giữ Wine/h đã lưu; town nhận khi
  số đó > 0 — đúng như mở hộp thoại, bấm Load rồi Save.
- `openWineSourceDialog(onChosen)` nhận tên action cho nút của từng town, dùng
  chung cho Start và Save. Action cũ `wine.chooseSource` / `wine.start` đổi tên
  thành `wine.autoRun` / `wine.queueFrom`.

**Test** (đã thấy đỏ ở hai chỗ quan trọng — xem dưới):

- `core/task-queue.test.ts`: `moveOneStep` một bước, không vượt hai đầu, và
  `withinType` bước qua task loại khác.
- `ui/queue-view.test.ts`: mỗi hàng có ↑ và ↓; ↑ hàng đầu và ↓ hàng cuối bị
  `disabled`.
- `features/auto-build.test.ts`: `moveBuildingInQueue` (một bước, hai đầu, hai
  entry cùng building); `scanBuildings` trả `false` khi từ chối, `true` khi xong.
- `features/auto-wine.test.ts`: `saveMeasuredReceivers` (số đo thay số đã lưu,
  không số đo thì giữ, số 0 thì bỏ).
- `app.test.ts`: ↓ trong Transport Settings bước qua upgrade; Start chạy đủ
  (scan → lưu → queue → timer bật); scan từ chối → không nạp gì; không có nguồn
  → báo, không scan; nhiều nguồn → popup với `wine.autoRunFrom`; Save nạp queue
  và không bật timer. `scanBuildings` được mock, và mock **vẽ board lúc scan**
  — nên test chứng minh bước Load chạy **sau** scan.
- Thấy đỏ: đổi `runAutoWine` cho Load chạy **trước** scan, và bỏ `withinType`
  khỏi ↑/↓ của Transport Settings → đúng hai test tương ứng đỏ. Các hàm khác là
  mới, không có bản cũ để thấy đỏ.

**Rủi ro, chưa kiểm chứng:**

- **Gửi hàng tự động vẫn hỏng** (§2.A). Start giờ tự bật timer, nên lệnh gửi
  sẽ chạy vào chỗ hỏng đó.
- Scan dùng AJAX (`syncAllTowns`); số liệu mới chỉ vào **board Empire
  Overview** (Send Resources không ghi response vào town cache). Không có board
  thì Start dùng số cũ trong town cache.
- Chưa biết board vẽ lại DOM kịp trước bước Load hay không (sự kiện là đồng bộ,
  phần vẽ chưa đo).
- Không đọc được model của game thì Scan đi bộ từng town và kết thúc bằng
  `backToCity`, có thể làm tải lại trang — khi đó các bước sau của Start không
  chạy.
- Timer (Transport hoặc Build) đang chạy thì Scan từ chối ("Stop it first,
  then scan") và Start dừng; không tự tắt timer.

**Cần thử trên game:** ↑/↓ ở ba chỗ, mỗi lần đúng một hàng; Start với một
nguồn → toast "Sync finished", queue có lệnh rượu, nút Transport thành "Stop
Timer"; Save trong Auto Wine Settings → queue có lệnh rượu, timer không bật.

### 2.L Tồn kho ít, ô số 0, runner theo timer, chuỗi hiển thị, 1.4 (02/10/2026)

**Đã commit (`4f9436c`, chung một commit với §2.K; tài liệu ở `3209964`),
chưa push. Chưa build vào `dist/`, chưa thử trên game.** Người dùng yêu
cầu từng phần. 34 file, 515 → 537 test, typecheck (cả cấu hình strict) và
prettier sạch. Mỗi bản sửa có test đã thấy **đỏ** khi tạm làm hỏng đúng chỗ
đó (bỏ bản sửa hoặc đưa về code cũ), rồi khôi phục.

#### 1. Không gửi khi tồn kho ít hơn một tàu

**Người dùng báo:** lệnh trong queue lớn hơn tồn kho của town nguồn thì Auto
Transport gửi liên tục, mỗi lần vài đơn vị — phí tàu. Code cũ không đọc tồn
kho (trừ rượu có `reserve` của Auto Wine), đặt cả số của task vào ô, và game
chỉ gửi phần đang có.

| Thay đổi                                                                                                                                                                                                                                                                                                                                                                    | Ở đâu                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Sau khi tới town nguồn, đọc tồn kho của **đúng loại** tài nguyên (`readCurrentStock`: model trước, header sau, không đọc được thì 0). Lượng gửi được = tồn kho − `reserve` (chỉ rượu Auto Wine). Thay cho kiểm tra rượu cũ                                                                                                                                                  | `features/send-resources.ts`, `game-state.ts` |
| Gửi được **ít hơn lượng còn phải gửi** **và** **ít hơn sức chứa 1 tàu** → không gửi, trả `defer` (xuống cuối queue; cả queue `defer` thì nghỉ 60 s), log ghi town còn bao nhiêu                                                                                                                                                                                             | `features/send-resources.ts`                  |
| "1 tàu" theo loại tàu sẽ đi (người dùng chốt): có merchant ship rảnh → 1 merchant ship (500, hoặc số Calibrate Cargo); không còn merchant → 1 freighter (50.000, hoặc số Calibrate Cargo). Kiểm hai lần: trước khi điều hướng (theo tàu đang rảnh, để town thiếu hàng khỏi mở cảng) và **tại form**, trước khi nhập số, theo tàu thật sự dùng (merchant có thể vừa ra khơi) | `features/send-resources.ts`                  |
| Selector header cho từng tài nguyên, crystal là `#js_GlobalMenu_crystal` (CSS của board đã dùng đúng các id này; board đọc model bằng cùng key `"resource"`, `1`–`4`)                                                                                                                                                                                                       | `core/ikariam/selectors.ts`                   |

Đủ ít nhất 1 tàu nhưng ít hơn lượng phải gửi → gửi hết phần đang có, phần
còn lại ở lại task (giờ tính theo lượng gửi thật). Task chỉ còn ít hơn 1 tàu mà
kho đủ → vẫn gửi.

**Test:** `features/send-resources.test.ts` (7: ít hơn 1 merchant ship → chờ;
đủ 1 tàu → gửi phần đang có; đơn nhỏ hơn 1 tàu → gửi; trừ `reserve`; chỉ có
freighter → chờ 1 freighter, đủ thì gửi; merchant ra khơi giữa đường → kiểm lại
tại form), `game-state.test.ts` (3: `readCurrentStock`).

**Đánh đổi:** chỉ còn freighter rảnh thì town nhỏ phải chờ tới khi đủ ~50.000
hoặc có merchant về.

#### 2. Transport Settings: ô số 0 như ô trống

Ô trống, `0`, `00` đều là "không gửi loại này", không báo lỗi; mọi ô trống
hoặc 0 → "Enter an amount for at least one resource."; số lẻ, số âm, `1e3`,
`+4` vẫn báo lỗi. Câu báo lỗi đổi thành "…whole numbers (empty or 0 = none)".
`ui/dialogs.ts` (`readSendForm`), `messages.ts`. Test: `app.test.ts` (2).

#### 3. Mỗi Start Timer chỉ cho chạy loại task của nó

Giải quyết việc thứ nhất trong "Hai việc phát sinh" ở §5: bật Build Start
Timer là chạy luôn shipment đang xếp hàng.

| Thay đổi                                                                                                                                                                     | Ở đâu                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Tùy chọn `allowsType` của `TaskRunner`: task thuộc loại không được phép **nằm yên, giữ chỗ**, bị bỏ qua. Queue chỉ còn task như vậy thì tính là **cạn** (gọi `onDrain`)      | `core/task-queue.ts` |
| Ngưỡng nghỉ 60 s (`deferStreak`) đếm theo task **được phép**, không theo cả queue — không thì task bị bỏ qua làm runner không bao giờ nghỉ                                   | `core/task-queue.ts` |
| `allowsTaskType`: `sendResource` khi Transport bật, `upgradeBuilding` khi Build bật                                                                                          | `app.ts`             |
| Nút **Start** của Build (một vòng, không bật timer) cho phép upgrade tới khi queue cạn (`oneOffRunTypes`), và không còn gọi `startRunner()` thẳng mà qua `syncRunnerToFlags` | `app.ts`             |

Hệ quả: chỉ bật Build, vòng upgrade xong mà queue còn shipment → queue tính là
cạn → reload, vòng sau theo keep-alive. Trước đây queue không bao giờ cạn
trong ca này (§2.J, "Đã biết").

**Test:** `core/task-queue.test.ts` (3), `app.test.ts` (2).

#### 4. Gom chuỗi hiển thị còn sót (§2.D)

| Thay đổi                                                                                                                                                                                                                     | Ở đâu                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Tên tài nguyên → `RESOURCE_LABEL`; `RESOURCE_OPTIONS` và hàm mới `resourceLabel` lấy từ đó                                                                                                                                   | `messages.ts`, `types.ts`                 |
| Đơn vị của cảnh báo rượu → `DURATION` (chữ hiển thị không đổi)                                                                                                                                                               | `messages.ts`, `features/wine-warning.ts` |
| Queue hiện "Wine", "Crystal" thay vì `wine`, `glass`                                                                                                                                                                         | `ui/queue-view.ts`                        |
| `listBuildingsInCurrentTown` không so chữ "Under construction" nữa: trong ngoặc là số → cấp; không phải số → cấp 0; class `constructionSite` cộng 1 như cũ. Kết quả y như trước với tiếng Anh; tiếng khác không còn ra `NaN` | `features/auto-build.ts`                  |

**Test:** `queue-view.test.ts` (1, và sửa 1 test cũ "wine" → "Wine"),
`auto-build.test.ts` (1, title tiếng Việt — code cũ ra `"Museum Đang xây NaN"`).

**✅ 04/10 (§2.P): đã làm.** **Còn sót, ngoài danh sách §2.D, chưa làm:** bảng Transport Settings vẫn hiện
id tài nguyên (`glass`); hộp thoại Auto Wine viết thẳng `"—"` và `"h"`.

#### 5. 1.4 — đổi town bằng form, chặn vòng lặp reload

**Đo trên game (02/10, người dùng chạy probe trong console):**

- Gửi `#changeCityForm` qua `ajaxHandlerCallFromForm` ở city view: **không**
  có `form.submit()` hay sự kiện `submit` — chỉ một request ajax
  `action=header&function=changeCurrentCity`, rồi ~0,3 s sau trang tải lại.
  Tắt hay bật script đều như nhau.
- Response: `["custom", ["reload", {"link":
"?view=city&cityId=<đích>&currentCityId=<đích>", ...}]]` — **chính game**
  tải lại trang theo lệnh của server. Sau reload trang ở **đúng** town đích.
- Chọn town trong dropdown của game bằng tay cũng reload. Tức là reload là
  hành vi chuẩn của game.
- Nút tên town trên board cũng gửi `changeCurrentCity` qua ajax
  (`loadUrl` trong `game-api.ts`) — nhiều khả năng cũng reload, **chưa đo**.

**Kết luận:** vòng lặp reload ngày 26/09 (§2.E lỗi 4) gần như chắc là lỗi tên
có toạ độ — trang đã sang đúng town, tên không khớp breadcrumb, nên gửi lại —
không phải do form.

| Thay đổi                                                                                                                                                                                                                                                                                                                                               | Ở đâu                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Thứ tự đổi town (người dùng chọn): **form của game → tên town trên board → dropdown**. Send Resources đổi town được mà không cần board                                                                                                                                                                                                                 | `navigation.ts`, `gotoTown` |
| Chấp nhận một lần reload mỗi lần đổi town: task còn trong queue, sau reload handler chạy lại, `gotoTown` thấy đã ở đúng town và đi tiếp. Shipment và upgrade đều đổi town trước khi làm gì khác, nên không có gì làm hai lần                                                                                                                           | `navigation.ts`             |
| Chặn lặp: trước khi gửi, ghi `{target, sentAt}` vào `sessionStorage` (`ika_pendingTownSwitch` — riêng tab, ngoài export, như `ika_pendingBoardView` của board). Sau reload mà chưa ở đúng town, và vừa gửi tới chính town đó trong 30 s (`SWITCH_LANDING_WINDOW_MS`) → ném lỗi, không gửi lại; runner bỏ task sau 5 lần. Tới đúng town thì xoá bản ghi | `navigation.ts`             |

**Test:** `navigation.test.ts` (4 mới: form trước board; reload sang nhầm town
→ không gửi lại; quá 30 s → gửi lại; tới nơi → xoá bản ghi). Test cũ "board
trước form" được thay; test "dùng board khi có board" đổi tên thành "dùng board
khi không có form".

**Rủi ro, chưa kiểm chứng:**

- Mỗi lần đổi town tốn một lần tải trang; vòng Auto Build nhiều town = nhiều
  reload.
- Scan kiểu đi bộ (chỉ khi không đọc được model) dừng ở reload đầu tiên. Scan
  thường dùng ajax, không ảnh hưởng.
- Chưa thấy runner chạy tiếp sau reload trên game. Khi thử: log `Going to town
X` → reload → task tiếp tục ở X.

**Cần thử trên game (cả §2.L):** lệnh gửi lớn hơn tồn kho ít → log "…less than
one merchant ship's cargo", không gửi; Transport Settings nhập 0 → không lỗi;
chỉ bật Build Start Timer với shipment trong queue → shipment không chạy; queue
hiện "Wine"/"Crystal"; vòng Auto Build đi qua các town bằng form (mỗi town một
reload), không lặp reload.

### 2.M Mục menu trái, panel nhớ trạng thái, thời gian xây (03/10/2026)

**Đã commit (`7ed3a85`, tài liệu ở `b45f792`), chưa push. Chưa thử trên
game** (trừ ba lệnh console ở phần 1). Người dùng yêu cầu từng phần. 34
file, 537 → 560 test, typecheck (cả cấu hình strict) và prettier sạch.

#### 1. Mục menu trái cho Send Resources — ✅ đã làm, chưa thử bằng code thật

**Người dùng muốn:** mở panel Send Resources từ một mục trong menu trái của
city view (`.menu_slots`), như mục "Empire Overview", và biết vì sao trước
đây mục đó lỗi còn mục của Empire Overview thì không.

**Đối chiếu từ code** (mục cũ của Send Resources: commit `85f8246`, gỡ ở
`d41fe28`). Hàm gây lỗi là `cityMenu.update` của game (§2.C lỗi 1), source
không có trong repo hay `sample/`:

|                       | Empire Overview (`empire-overview/debug.ts`)   | Send Resources cũ                                              | IkaEasy V4 (`js/utils.js`, `addToLeftMenu`)                    |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Class của `<li>`      | `expandable slot99 empire_Menu`                | `expandable ika-send-menu`; sau đó thử thêm `slot98` — vẫn lỗi | `slot<số li đang có> ikaeasy_slot` — **không có `expandable`** |
| Vị trí                | `.after()` ngay sau `.expandable` cuối         | `appendChild` cuối `ul` → **sau** `slot99`                     | đầu hoặc cuối `ul`                                             |
| Thời điểm             | lúc bundle được nạp (top-level của `debug.ts`) | trong `start()`                                                | khi module khởi động                                           |
| Trượt ra khi rê chuột | của game                                       | của game                                                       | CSS riêng (`css/ikaeasy.css`, `translateX`)                    |

`slot99` có từ script gốc (`legacy/Quản lý Ika Perseus -VN- V2.js:145`),
không có comment; nhiều khả năng chỉ là số lớn để không trùng `slot1…slotN`
của game. Capture `tools/output/output5.json` cho thấy chính game có một mục
**không có số slot**: `<li class="expandable transportLauncher">` "Transport"
— tức số slot không bắt buộc.

**Đo trên game (03/10, người dùng chạy trong console, cả hai script bật, ở
city view, mỗi lần một lệnh rồi F5; sau mỗi lệnh gửi hàng tay và xem header):**

| Lệnh | Mục chèn thêm                                                     | Header  |
| ---- | ----------------------------------------------------------------- | ------- |
| A    | `<li class="expandable slot98">`, **cuối** `ul` (sau `slot99`)    | ❌ hỏng |
| B    | `<li class="slot<số li> ikaeasy_slot">` (kiểu IkaEasy), cuối `ul` | ✅ đúng |
| C    | `<li class="expandable slot98">`, **trước** `slot99`              | ❌ hỏng |

**Kết luận:** thêm một mục **`expandable`** lạ là hỏng, bất kể vị trí và số
slot. Mục **không có `expandable`** thì không hỏng. Chưa giải thích được vì
sao mục `slot99` (cũng `expandable`) của Empire Overview không làm hỏng —
có thể do nó được chèn sớm hơn, trước khi game dựng menu; không cần biết để
làm, nên dừng ở đây. Probe `cityMenu` viết ở lượt trước **không cần chạy
nữa**.

**Sửa:**

| Thay đổi                                                                                                                                                                                                                                       | Ở đâu                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `buildLauncher`: có `.menu_slots` → chèn `<li class="slot<số li đang có> ika-send-menu">` vào **cuối**, ảnh `cdn/all/both/minimized/transport.png` (`MENU_ENTRY_ICON`), chữ "Send Resources"; bấm vào bật/tắt panel. **Không có `expandable`** | `send-resources/ui/panel.ts` |
| Không có `.menu_slots` → nút cố định góc dưới trái như trước (người dùng chọn giữ làm dự phòng)                                                                                                                                                | `send-resources/ui/panel.ts` |
| Hiệu ứng trượt ra khi rê chuột của IkaEasy (`width: 199px; translateX(-146px)`, hover `translateX(0)`, cả bản RTL) vì hiệu ứng của game chỉ áp cho mục `expandable` (`menuEntryStyles`)                                                        | `send-resources/ui/panel.ts` |
| `SEL.menuSlots` thêm lại (đã xoá ở review 25/09 vì không còn dùng)                                                                                                                                                                             | `core/ikariam/selectors.ts`  |

**Test** (`ui/panel.test.ts`): test REGRESSION cũ "không thêm gì vào menu"
và test "luôn có nút cố định" được thay bằng bốn test: mục menu **không có
`expandable`**, là `slot2` (sau hai mục của game), các mục của game không
đổi; có menu → không có nút cố định; không có menu → có nút cố định; bấm mục
menu → bật/tắt panel. Thêm lại `expandable` vào mục menu: test REGRESSION
**đỏ**.

**Cần thử trên game (sau khi build):** gửi hàng tay → header cập nhật (lần
này với code thật, không phải lệnh console); icon hiện đúng; rê chuột thì mục
trượt ra như các mục khác. CSS dựa vào `#container #leftMenu .slot_menu` như
IkaEasy — capture có `#js_viewCityMenu.slot_menu`, còn `#leftMenu` thì
**chưa capture** để xác nhận.

#### 2. Panel luôn hiển thị như board Empire Overview

Trước: cửa sổ Send Resources luôn **đóng** sau mỗi lần tải trang
(`root.hidden = true` trong `createWindow`), phải bấm nút góc mỗi lần. Board
Empire Overview thì nhớ `settings.window.visible` và mở lại.

| Thay đổi                                                                                                                                                                                                                                                                                          | Ở đâu                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Hai tùy chọn mới của `createWindow`: `rememberOpen` (lưu đang mở/đóng, cần `store`) và `openByDefault` (mở khi chưa lưu gì). Lưu ở `ikaWindowOpen_<id>` trong store của tài khoản, cạnh vị trí `ikaWindow_<id>` sẵn có — như vị trí, **không** vào bản export (theo máy, không theo dữ liệu chơi) | `core/ui/window.ts`          |
| Panel bật cả hai: lần đầu **mở**; sau đó giữ trạng thái lần cuối                                                                                                                                                                                                                                  | `send-resources/ui/panel.ts` |

**Người dùng chọn:** giữ cả **×**, **Esc**, **Space** và nút góc; mọi cách
mở/đóng đều được lưu.

**Không dùng lại `isSendResourceHidden`** (key của bản gốc, có trong bảng
export): CSS của Send Resources dùng chính cờ đó để ẩn **`#empireBoard`**
(`ui/styles.ts`), nên ghi vào nó thì đóng panel sẽ làm board Empire Overview
biến mất ở lần tải sau.

**Test:** `core/ui/window.test.ts` (4: mở lần đầu; đóng → lần sau vẫn đóng;
mở lại → lần sau mở; cửa sổ không bật `rememberOpen` không lưu gì).
`ui/panel.test.ts`: 4 test cũ giả định panel bắt đầu đóng được sửa theo hành
vi mới, thêm 1 (đóng → tải lại vẫn đóng). Tính năng mới — không có bản cũ để
thấy đỏ. Test bật/tắt bằng nút góc từ phần 1 trở đi chạy bằng mục menu (có
menu thì không còn nút góc).

**Đã biết:** Space vẫn bật/tắt **cả hai** board cùng lúc (cả hai script bắt
phím này), như trước.

#### 3. Thời gian nâng cấp: buff server và Chronos' Forge

**Người dùng muốn:** hai thứ giảm thời gian xây được tính vào thời gian nâng
cấp — buff giảm thời gian xây của server (cố định theo tài khoản, người chơi
tự nhập) và Chronos' Forge.

**Công thức (người dùng chốt):**
`giây = round(thời gian gốc × (1 − buff) × 0,8^cấp Forge × (1 + chính thể))`,
rồi × 1000 ra mili-giây. Giữ hệ số chính thể (Aristocracy −20%, còn lại 0)
— người dùng chọn giữ. Làm tròn **tới giây gần nhất** (`Math.round`), sau
cả ba hệ số.

**Chronos' Forge — số đo, không đoán:** cột "Construction time reduction"
trong trang Help của game (`docs/wiki/building-help-chronosForge-35.json`) là
−20% / −36% / −48,8% / −59,04% / … / −89,263% (cấp 10) — đúng bằng
`1 − 0,8^cấp`. Không phải 1%/cấp, không có trần 50% như công trình giảm giá.
**Phạm vi** (người dùng chốt): mọi công trình **trong town có Forge, trừ chính
Forge** — khớp đoạn trích trang wiki Patch 14.0.0 trong kết quả tìm kiếm;
trang gốc không đọc được (fandom trả HTTP 402).

| Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ở đâu                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cột **"Build time -%"** trong bảng Account của panel Send Resources, mỗi tài khoản một ô, phần trăm (`36` = 36%). **Bình thường chỉ hiện chữ** (`<span>`, `BUILD_TIME_BUFF_VALUE_CLASS`) kèm nút **✎**. Bấm ✎ → chữ được thay bằng ô input (`BUILD_TIME_BUFF_CLASS`), nút thành **✓**. Bấm ✓ → lưu, ô input biến mất, chữ mới hiện lại, nút về ✎. Rời ô mà không bấm ✓ thì **không** lưu. Ô trống = 0; chữ, số âm, ≥ 100 → toast, giữ số cũ, **ô input vẫn mở** để sửa. Ô input kiểu **text** (`inputmode="decimal"`): ô `number` biến "abc" thành chuỗi rỗng, tức âm thầm xoá buff. ✎ và ✓ là action của dispatcher chung (`account.editBuildTimeBuff`, `account.saveBuildTimeBuff`), mang `data-ika-account` | `features/summary-account.ts` (`setBuildTimeBuff`, `editBuildTimeBuff`, `saveBuildTimeBuff`, `buildTimeBuffCell`), `app.ts` (đăng ký hai action), `messages.ts` (`ACCOUNT_SUMMARY.buildTimeBuff*`, tooltip ✎/✓), `types.ts` (`AccountSummary.buildTimeBuffPercent`) |
| Bảng vẽ lại mỗi 10 s; **không** vẽ lại khi trong bảng còn ô input buff đang mở, để không mất số đang gõ. ✓ gỡ ô input **trước** khi vẽ lại, nếu không bước vẽ lại cũng bị chặn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `features/summary-account.ts`, `renderSummary`                                                                                                                                                                                                                      |
| Board đọc buff qua `localStorage` (hai script không chung module): `accountBuildTimeBuff(tài khoản)` đọc `listAccount`, trả phân số (36 → 0,36), số không hợp lệ hoặc không có → 0. Tên key thành hằng chung `ACCOUNT_LIST_KEY`; `KEY.listAccount` của Send Resources dùng chính hằng đó                                                                                                                                                                                                                                                                                                                                                                                                                       | `core/storage.ts`, `send-resources/state.ts`                                                                                                                                                                                                                        |
| `getUpgradeCost`: thời gian theo công thức trên. Forge tìm bằng `getBuildingFromName(CHRONOSFORGE)` của town; bỏ qua khi công trình đang tính là chính Forge. Hằng `CHRONOS_FORGE_TIME_FACTOR_PER_LEVEL = 0.8`. Tên tài khoản lấy từ `accountName` của `empire.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                             | `empire-overview/models/building.ts`                                                                                                                                                                                                                                |

**Người dùng chọn chỗ nhập:** bảng Account của Send Resources (không phải tab
Settings của board), dù như vậy board phải đọc dữ liệu của Send Resources.
Tài khoản phải có dòng trong bảng mới có ô — dòng của tài khoản hiện tại được
tạo lúc Send Resources khởi động (`updateCurrentAccount`). Không có Send
Resources thì board coi buff là 0.

**Không đổi:** phép chia 3 cho `s201`/`s202` trong tooltip (`render.ts`,
`serverTyp`) — người dùng không nhắc tới, giữ nguyên. `bon` (research giảm
chi phí) vẫn không đụng tới thời gian.

**Test:**

- `empire-overview/models/building.test.ts` (7): không có gì → đúng số giây
  của bảng; buff 36% → 165 s (258 × 0,64 = 165,12); buff không hợp lệ bị bỏ
  qua; Forge cấp 2 → 165 s; Forge không giảm chính nó; buff + Forge +
  Aristocracy → 106 s (105,68); làm tròn xuống (232,2 → 232) và lên (180,6 →
  181). Đưa `building.ts` về `HEAD`: 3 test (buff, Forge, kết hợp) **đỏ**; bỏ
  `Math.round`: 4 test **đỏ**. Ba test xanh trên code cũ là cố ý — chúng giữ
  cho bản sửa không áp nhầm.
- `core/storage.test.ts` (3): phần trăm → phân số theo đúng tài khoản; 0 khi
  không có bảng/dòng/số; 0 khi số ngoài 0–100 hoặc là chuỗi.
- `app.test.ts` (6, nhóm "the account table's build time buff"): chỉ hiện
  chữ, ✎ mới có ô input và nút thành ✓; ✓ lưu → board đọc 0,36, chữ hiện
  36, nút về ✎; chưa bấm ✓ thì không lưu (kể cả có sự kiện `change`); "abc"
  và "100" bị từ chối, giữ số cũ, có toast, ô input vẫn mở; ô trống → 0; ô
  đang mở qua lần vẽ lại 10 s vẫn giữ số đang gõ. Test bấm nút bằng cách gọi
  action mà nút đang mang (`actions[button.dataset.ikaAction]`), vì
  `app.test.ts` không cài dispatcher thật. Hành vi mới, không có bản cũ để
  thấy đỏ. Lần đầu chạy, test "✓ rồi hiện chữ" đỏ thật: `renderSummary` thấy
  ô input còn mở nên bỏ qua vẽ lại — đã sửa bằng cách gỡ ô trước.

**Rủi ro, chưa kiểm chứng:**

- Game làm tròn thời gian thế nào (round, floor hay ceil) chưa đo; chọn
  round theo yêu cầu "làm tròn theo giây".
- Thứ tự áp buff/Forge/chính thể là theo công thức người dùng đưa, chưa đối
  chiếu với thời gian game hiển thị.
- Board chỉ biết cấp Forge khi đã có dữ liệu công trình của town đó.

**Cần thử trên game:** ✎ → nhập buff → ✓ trong bảng Account; tooltip thời gian trên
tab Build của board khớp thời gian game hiện ở town có và không có Chronos'
Forge; nâng chính Forge thì thời gian không bị giảm; tải lại trang → panel
Send Resources giữ trạng thái mở/đóng.

**Ngoài lượt này:** `src/send-resources/features/barbarian.ts` có một thay
đổi chưa commit **không do lượt này làm** (`annotate(SEL.barbarianVillageResources,
false)` → `true`) — để nguyên, chờ người dùng. **04/10:** người dùng xác nhận là
thay đổi của họ, commit riêng `3f8a51b` (§2.S phần 4).

### 2.N Bug Report lưu file, `createPopup`, báo nhầm `[tên, null]` (03/10/2026)

**Commit `32fe3ba` (docs `ec3fdc4`, 04/10); lúc viết thì chưa commit. Có trong `dist/` build 03/10 22:54 (đã grep), chưa thử trên
game bản cuối** — file bug report 14:10 đến từ một bản build giữa chừng (đã
lưu file và có `gameData`). Người dùng yêu cầu từng bước. 34 file, 560 → 567
test, typecheck (cả cấu hình strict) và prettier sạch.

#### 1. Nút Bug Report

**Người dùng muốn:** bấm nút là tự lấy các dữ liệu đang chờ từ game (§2.A,
§2.D) thay vì gõ lệnh console; sau đó (vì report dán vào chat bị cắt ở
50.000 ký tự, mất phần cuối) là **lưu ra file JSON**; sau đó nữa là **xoá
lỗi đã ghi** — người dùng chọn "lưu file rồi mới xoá", không phải "xoá rồi
mới lưu" (cách đó luôn ra danh sách lỗi rỗng).

| Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                             | Ở đâu                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Luôn lưu, kể cả khi chưa có lỗi nào (trước: báo "No bugs recorded" rồi thôi)                                                                                                                                                                                                                                                                                                                                                                         | `send-resources/app.ts`, action `bug.report`                               |
| File `ikariam-bug-report-<tài khoản>-<ngày-giờ UTC>.json` qua `downloadJson` sẵn có (dùng chung với Export Data); `timestampedFilename` nhận thêm tiền tố. Không copy clipboard nữa                                                                                                                                                                                                                                                                  | `app.ts` (`BUG_REPORT_FILE_PREFIX`), `ui/data-transfer-ui.ts`              |
| Nội dung = bug report cũ + **`gameData`**: `createPopupSource` (source `ikariam.createPopup`, ≤ 20.000 ký tự — không script nào bọc hàm này, nên đọc khi script đang chạy vẫn là bản của game) và `shipmentForm` (đúng các trường của lệnh console §2.A: `present`, `url`, `wineFieldForm` — HTML của form quanh `#textfield_wine`, ≤ 20.000 ký tự — và `visibleControls`, ≤ 200). Mỗi phần thu riêng trong `try`, phần lỗi không làm hỏng cả report | `send-resources/diagnostics.ts` (`captureGameData`, `exportFullBugReport`) |
| `visibleControls` **bỏ control của chính script** (cửa sổ panel, nút mở panel, hộp thoại Settings): ở file đầu tiên chúng chiếm gần hết danh sách                                                                                                                                                                                                                                                                                                    | `diagnostics.ts` (`OWN_CONTROLS`)                                          |
| Lưu xong thì `clearBugs()`: lần bấm sau chỉ còn lỗi mới phát sinh                                                                                                                                                                                                                                                                                                                                                                                    | `app.ts`                                                                   |
| Toast: tên file, số lỗi ("…, then cleared them"), `createPopup` lấy được hay "not readable", form gửi hàng lấy được hay hướng dẫn mở Trading Port → "Transport goods" → bấm lại. Chuỗi cũ `nothingToReport`, `clipboardUnavailable` đã xoá                                                                                                                                                                                                           | `messages.ts` (`BUG_REPORT.saved`)                                         |
| Lệnh console `ikaBugReport()` trả về bản đầy đủ như nút (không lưu file, không xoá)                                                                                                                                                                                                                                                                                                                                                                  | `diagnostics.ts`                                                           |

**Test** (`app.test.ts`, nhóm "Bug Report", 6): tên file và toast; lưu khi
chưa có lỗi, có `createPopupSource`, báo form không có; thu form và chỉ đúng
ba control của game (control bị ẩn và nút của panel đều bị loại); báo khi
không đọc được `createPopup`; `ikaBugReport()` trả bản đầy đủ; xoá lỗi sau
khi lưu và lần sau ra rỗng. Test chặn `downloadJson` bằng mock một phần
`./ui/data-transfer-ui`. Đã thấy đỏ: `app.ts` ở `HEAD` (4–5 test), bỏ dòng
`clearBugs()` (1), bỏ bộ lọc `OWN_CONTROLS` (1).

#### 2. §2.D — `createPopup` (xong)

File đầu tiên (`tools/output/ikariam-bug-report-Smalldevil-2026-10-03-14-10-08.json`)
có source: `r(e, t, o, a, n)` — `e` id popup, `t` tiêu đề, `o` HTML hoặc
mảng `[message, links, nút 1, nút 2]`, `a` **loại popup** (so với
`ikariam.PopupController.TYPE_BUBBLE` — bong bóng thông báo — và
`TYPE_HEAVY` — có nền mờ modal; khác thì là popup thường), `n` **class CSS
thêm** (`"popupMessage " + n`; `null` thì không thêm). Giá trị số của các
hằng `TYPE_*` chưa đọc được (IkaEasy truyền `1`) — không cần để sửa.

| Thay đổi                                                                                                                                  | Ở đâu                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `arg4` → `popupType` (`unknown`), `arg5` → `className` (`string \| null`), `html` → `content`; comment ghi nghĩa từng tham số theo source | `core/ikariam/globals.ts`                   |
| Chỗ gọi truyền `null, null` thay cho `"???", "class"`: vẫn popup thường, bỏ class vô nghĩa tên `class` (không CSS nào dùng nó — đã grep)  | `send-resources/ui/dialogs.ts`, `openPopup` |

**Test:** `app.test.ts` ("Start asks which source…") kiểm tra tham số 4, 5
là `null, null`; đưa về `"???", "class"` thì **đỏ**.

#### 3. Empire Overview không còn báo nhầm `[tên, null]`

File đầu tiên chỉ có một lỗi, x3: `Malformed ajaxResponse entry` với entry
`["ingameCounterData", null]`. Đó là dạng bình thường của game — ngày 02/10
đã đo được response đổi town mang `updateBacklink`, `popupData`,
`removeIngameCounterData`, `ingameCounterData` đều `null`. Code bỏ qua entry
đó đúng cách nhưng vẫn ghi lỗi, nên mỗi lần đổi town thêm rác vào report.

**Sửa:** `game-api.ts` bỏ qua `[chuỗi, null]` (đúng 2 phần tử) **không ghi
lỗi**. Dạng sai thật (không phải mảng, `["updateBackgroundData"]` thiếu dữ
liệu…) vẫn ghi như cũ — test REGRESSION cũ vẫn xanh.

**Test:** `startup.test.ts` (1): response có `popupData` và
`ingameCounterData` là `null` → không có bản ghi "Malformed", entry tốt vẫn
chạy. Tắt nhánh mới thì **đỏ**.

#### 4. Đổi town sang M-Eretria không tới nơi — người dùng báo tạm ok 04/10 (§2.Q)

**Cập nhật 03–04/10 (§2.O phần 1):** đã tìm ra vì sao runner không bỏ task
(`console.error` không phải hàm trên trang game) và đã sửa; câu lỗi bỏ số
giây; Bug Report kèm log. **Vì sao đổi town không tới nơi thì vẫn chưa rõ.**

**Người dùng dán hai bug report** (bản cũ, trước khi nút lưu file; đều bị cắt
ở 50.000 ký tự). Gần như toàn bộ là một lỗi của Auto Build (task "Academy
12" ở M-Eretria):

`The switch to "M-Eretria" sent Ns ago did not land (now in "W-Athens") - not sending it again`
(nhóm trước: `now in "M-Syracuse"`)

- `totalOccurrences` 901 rồi 928. Câu báo lỗi **có số giây**, nên mỗi giây là
  một fingerprint mới: 50 chỗ của bug reporter bị lấp, lỗi cũ hơn bị đẩy ra,
  report quá dài. **Đề xuất (chưa được chọn):** bỏ số giây khỏi câu, đưa vào
  ngữ cảnh.
- Cùng một task (`upgradeBuilding-mupyiset-1`, rồi `…muq23y3h-1`) ném lỗi
  **mỗi giây, liên tục 7–12+ lần**, trong khi runner bỏ task sau 5 lần liên
  tiếp (`maxConsecutiveErrors`, đếm trong bộ nhớ). Chỉ giải thích được nếu
  **trang tải lại khoảng mỗi giây** (bộ đếm mất theo) hoặc có **hai runner**.
  Không phân biệt được từ report.
- URL ở bản đầu: `?view=city&oldBackgroundView=island&…` **không có
  `cityId`** — không phải link `?view=city&cityId=<đích>` mà game tải sau khi
  đổi town (02/10); giống một lần từ island view về. Không rõ có phải người
  chơi tự bấm.
- Bản sau và file 14:10: URL `?view=city&cityId=297042&currentCityId=297042`,
  và `#changeCityForm` ghi "M-Eretria" — **lần đổi town tới M-Eretria cuối
  cùng đã tới nơi**.
- **Thứ còn thiếu để chẩn đoán là log** (`Going to town …`, `Back to the town
view: …`, `This tab now runs…`) — bug report không kèm log. **Đề xuất
  (chưa được chọn):** kèm ~200 dòng log vào Bug Report.

**Ngoài lượt này:** `barbarian.ts` vẫn có thay đổi chưa commit không do lượt
nào làm — để nguyên. **04/10:** commit riêng `3f8a51b` (§2.S phần 4).

### 2.O Runner, câu lỗi, log trong Bug Report, cảng biển (03–04/10/2026)

**Commit `32fe3ba` (docs `ec3fdc4`, 04/10); lúc viết thì chưa commit. Chưa build, chưa thử trên game.** Người dùng chọn cả bốn việc
sau khi đọc hai file Bug Report. 34 file, 567 → 569 test, typecheck (cả cấu
hình strict) và prettier sạch (trừ ba file test lệch sẵn từ trước:
`http.test.ts`, `transport-buttons.test.ts`, `town-cache.test.ts`).

#### 1. Từ hai file Bug Report (03/10, 23:04 và 23:06 giờ máy)

`tools/output/ikariam-bug-report-Smalldevil-2026-10-03-16-04-51.json` và
`…-16-06-58.json`.

- **`console.error` không phải hàm trên trang game.** File 23:06 có
  `TypeError: console.error is not a function` x84, stack trỏ vào
  `TaskRunner.tick` của Send Resources, đúng nhịp mỗi giây của lỗi đổi town.
  Nhánh `catch` của runner gọi `console.error(e)` → tự ném → đoạn đếm lỗi
  liên tiếp và bỏ task sau 5 lần **không bao giờ chạy**. Đây là lý do task
  "did not land" bị thử lại mỗi giây mãi (§2.N phần 4). `console.log` thì
  vẫn chạy — chính `createPopup` của game dùng nó. Send Resources chạy
  `@grant none`, tức dùng chung `console` của trang.
- **Đổi town sang M-Eretria, lần này:** 23:05:34 gửi form → 23:05:36 trang ở
  **W-Athens**, lỗi mỗi giây 30 s → 23:06:04 gửi lại → **không có reload nào
  trong 15 s** (`gotoTown(M-Eretria): timed out after 15000ms`). URL cuối
  `?view=city&oldBackgroundView=city&…` **không có `cityId`**. Hàm bọc
  `cAjaxHandlerCallFromForm` của Empire Overview đã được kiểm: subscriber
  duy nhất của `formSubmit` thoát ngay vì không có
  `ikariam["changeCityFormSubmitted"]` — không chặn gì. **Nguyên nhân vẫn
  chưa rõ**; cần file Bug Report có log (phần 3).
- **Bản userscript đang cài cũ hơn `dist/` 22:54:** file 23:04 vẫn liệt kê nút
  của panel trong `visibleControls` (bộ lọc `OWN_CONTROLS` chưa có) và Empire
  Overview vẫn báo `Malformed … [name, null]` x255 — cả hai đã sửa trong
  bản `dist/` đó.
- **Form gửi hàng đã bắt được** (file 23:04, `present: true`) — phần 4.
- Hai lỗi `Script error.` (uncaught, mỗi script một): lỗi cross-origin không
  có chi tiết, bỏ qua.

#### 2. `console` an toàn, và câu lỗi "did not land" không có số giây

| Thay đổi                                                                                                                                                                                                                                                                            | Ở đâu                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `writeToConsole(level, …args)`: gọi `console[level]` nếu là hàm, không thì `console.log`, không thì thôi; không bao giờ ném. `logInfo` cũng đi qua nó                                                                                                                               | `core/logger.ts`               |
| Runner gọi `writeToConsole("error", e)` thay cho `console.error(e)`                                                                                                                                                                                                                 | `core/task-queue.ts`           |
| Các `console.warn` của core và Send Resources đi qua nó: `bug-report.ts`, `storage.ts` (JSON hỏng — trước đây có thể ném ngay trong `getJSON`), `ship-capacity.ts`, `ui/actions.ts`. `empire.ts` của Empire Overview (sandbox) và `extension/content.ts` (content script) không đổi | các file trên                  |
| "did not land" thành `The switch to "X" did not land (now in "Y") - not sending it again`; số giây chuyển sang dòng log `The switch to "X" was sent Ns ago` ngay trước khi ném                                                                                                      | `send-resources/navigation.ts` |

**Test:** `task-queue.test.ts` — `console.error` không phải hàm, handler ném
mãi → task vẫn bị bỏ sau đúng 3 lần (`maxConsecutiveErrors: 3`); đưa
`console.error(e)` trở lại thì **đỏ**. `navigation.test.ts` — lỗi sau 2 s và
sau 17 s ra cùng một câu; đưa số giây trở lại câu thì **đỏ**.

#### 3. Bug Report kèm log

File có thêm `log`: **200 dòng log gần nhất, mới nhất trước**, đọc từ
`localStorage` (`loggerInfo`) nên có cả dòng của những lần tải trang trước
(`recentLogLines` trong `core/logger.ts`, `MAX_REPORT_LOG_LINES` trong
`send-resources/diagnostics.ts`). Log là thứ bản ghi lỗi không cho thấy: thứ tự
`Going to town …`, `Back to the town view: …`, reload, qua nhiều lần tải trang.

**Test:** `app.test.ts` — 250 dòng log → file có đúng 200, dòng mới nhất đầu.
Tính năng mới, không có bản cũ để thấy đỏ.

#### 4. §2.A — cảng biển (xong trong code)

**Đo từ file 23:04** (form mở cho M-Corinth):

- Form: `<form onsubmit="checkTransporterForm();return false;" id="transportForm" method="POST">`,
  ô ẩn `action=transportOperations`, `function=loadTransportersWithFreight`,
  **`destinationCityId=297035`**, `islandId`, `oldView`, `position`,
  `avatar2Name`, `city2Name`, `type`, `activeTab`, `transportDisplayPrice`,
  `usedFreightersShips` (`#use_freighter_ships`), `capacity`
  (`#textfield_capacity`), `max_capacity`, `jetPropulsion` (`#textfield_jet`).
- Ô hàng: `#textfield_wood` (`cargo_resource`), `#textfield_wine`
  (`cargo_tradegood1`), `#textfield_marble` (`…2`), `#textfield_glass`
  (`…3`), `#textfield_sulfur` (`…4`). Mỗi ô có `#slider_<tên>_min/max`
  (`a.setMin`/`a.setMax`) và các nút ±620 của Send Resources.
- Tàu: `#textfield_premium`, `#selectedTransportersInput`
  (`normalTransportersMax`, lúc đó 223), `#selectedFreightersInput`,
  `#slider_freighters_max`, `#transporterCount`, `#freightersCount`.
- Nút gửi: `input#submit.button.action_bubble`, `value="Transport goods"`.
- Bên dưới là form trade route (`#tradeRouteTime`, `#js_tradeRouteButton`).
- `wineFieldForm` bị cắt ở 20.000 ký tự (giới hạn của capture); phần còn
  lại có trong `visibleControls`.

**Kết luận:** mọi selector cũ của form (`#textfield_*`, `#submit`,
`#slider_freighters_max`, `.setMax`) **vẫn đúng**. Chỉ bước chọn town đích là
hỏng, và game đặt town đích bằng chính view
`?view=transport&destinationCityId=<id>` — link của `a.action_transport`
trong `#js_transportPanel` (`onclick="ajaxHandlerCall(this.href)"`).

| Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                   | Ở đâu                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `openShipmentForm(destination)`: city id = `selectvalue` của dropdown; gọi `ajaxHandlerCall("?view=transport&destinationCityId=<id>")` của trang; đợi `#transportForm input[name="destinationCityId"][value="<id>"]` (`SHIPMENT_FORM_TIMEOUT_MS` = 15 s). Form mở cho town khác thì không bao giờ được điền (hết giờ → ném; chưa nhập gì nên ném là an toàn). Không có city id, hay trang không có `ajaxHandlerCall` → ném | `send-resources/navigation.ts`               |
| `townHasPort()` thay `openPort()`: cùng phép kiểm (`port`, rồi `constructionSite`, ở `#position1`/`#position2`) nhưng **không bấm**                                                                                                                                                                                                                                                                                        | `navigation.ts`                              |
| `handleSendResource`: về town view → `townHasPort` (không có → `defer`) → `openShipmentForm` → điền như cũ. Sau khi bấm gửi: đợi `#transportForm` biến mất (≤ 5 s, `.catch`, không bao giờ ném) thay cho đợi `.cities.clearfix`                                                                                                                                                                                            | `features/send-resources.ts`                 |
| **Xoá** `SEL.dockCities`, `SEL.cityPositionLink`, `openPort`, `clickDestinationTown`, `adjustDestinationIndex` — thay hẳn, không giữ dự phòng (quyết định cũ của §2.A). Thêm `SEL.shipmentForm`, `SEL.shipmentDestination(id)`                                                                                                                                                                                             | `core/ikariam/selectors.ts`, `navigation.ts` |

**Lựa chọn trong lúc làm:** gọi thẳng `ajaxHandlerCall` chứ không bấm
`a.action_transport` trong panel — cùng một lời gọi, nhưng không phụ thuộc
panel có liệt kê town đó hay không. Người dùng đã duyệt hướng "mở
`?view=transport&destinationCityId=<id>`".

**Test:**

- `navigation.test.ts`: bỏ 4 test `adjustDestinationIndex` và 5 test
  `openPort`; thêm 3 test `townHasPort` (tìm thấy mà không bấm; nhận cảng
  đang xây; không có cảng) và 4 test `openShipmentForm` (gọi đúng URL với
  city id; không chấp nhận form của town khác — hết giờ; không có
  `ajaxHandlerCall` → ném, không gửi gì; dropdown không có city id → ném).
- `send-resources.test.ts`: dựng lại game giả — town view có cảng, form do
  `ajaxHandlerCall` vẽ với ô `destinationCityId`, sau khi gửi về town / còn
  form / chỗ khác. Thêm 1 test: town không có cảng → `defer`, không gọi gì.
  Chạy với `send-resources.ts`, `navigation.ts`, `selectors.ts` ở `HEAD`:
  **8/13 đỏ** — đúng những test có tới bước form.

**Kết quả 04/10 (§2.Q): người dùng báo tạm ok.** **Cần thử trên game:** cài lại cả hai userscript; Transport Settings → một
lượng **nhỏ** → Start Timer của Transport → hàng đi đúng town đích, log có
`Sent N …`. Lỗi thì bấm Bug Report (giờ có log).

### 2.P Bảy việc nhỏ (04/10/2026)

**Commit `32fe3ba` (docs `ec3fdc4`, 04/10); lúc viết thì chưa commit. Chưa build, chưa thử trên game.** Người dùng duyệt danh sách
"việc nhỏ chưa xếp lịch" (giữ lại nút Crawl Building — còn cần crawl). 569 →
578 test. Mỗi việc có test đều đã thấy **đỏ** khi tạm làm hỏng đúng chỗ đó.

| #   | Việc                 | Thay đổi                                                                                                                                                                                                                                                                                                                                   | Ở đâu                                                                                   |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1   | Nhãn tài nguyên      | Bảng Transport Settings hiện "Crystal" thay vì `glass` (`resourceLabel`). Hộp thoại Auto Wine và phần xem trước dùng `DURATION.unknown` và `DURATION.hoursToTenths` (mới) thay cho `"—"`, `"h"` viết thẳng                                                                                                                                 | `ui/dialogs.ts`, `messages.ts`                                                          |
| 2   | Nút Close thừa       | Bỏ khỏi Auto Build Settings; Save vẫn đóng hộp thoại. **Đã đảo lại ở §2.R: nút Close có lại**                                                                                                                                                                                                                                              | `ui/dialogs.ts`                                                                         |
| 3   | `needingShip`        | `Math.ceil` thay `Math.round`: 1.200 hàng / 500 → 3 tàu (trước: 2)                                                                                                                                                                                                                                                                         | `features/barbarian.ts`                                                                 |
| 4   | Một tháng            | 2.592.000 s (30 ngày) thay 2.520.000 s, ở **cả hai** bộ định dạng                                                                                                                                                                                                                                                                          | `core/format.ts` (`TIME_FACTORS`), `empire-overview/utils.ts` (`FormatTimeLengthToStr`) |
| 5   | ▶ và dòng trạng thái | `TaskRunner.currentTaskId`: task đang chạy; giữa hai tick là task tick sau sẽ chọn (bỏ qua loại bị `retry` chặn và loại `allowsType` không cho); runner dừng → `null`, không có ▶. Queue view lấy qua `setCurrentTaskSource` (mặc định vẫn là đầu queue cho tới khi app đăng ký); dòng trạng thái `describeCurrentTransfer(currentTask())` | `core/task-queue.ts`, `ui/queue-view.ts`, `app.ts`, `features/send-resources.ts`        |
| 6   | "Warning wine"       | Người dùng chọn **"một lần mỗi town, tới khi hết cảnh báo"**: `wineWarnedCityIds` (trong bộ nhớ) — tụt dưới ngưỡng thì báo và ghi nhớ; lên lại trên ngưỡng (hoặc rượu thôi giảm) thì xoá; tải trang thì rỗng                                                                                                                               | `empire-overview/render.ts`                                                             |
| 7   | Phím Space           | Người dùng chọn **"Space chỉ cho Empire Overview"**: bỏ khỏi `registerHotkeys` của Send Resources. Panel mở bằng mục menu (`togglePanel`), đóng bằng × / Esc                                                                                                                                                                               | `app.ts`, `ui/panel.ts`                                                                 |

**Test:** `app.test.ts` (bảng Transport Settings hiện "Crystal"; Space không
bật/tắt panel), `format.test.ts` (30 ngày = "1M", 29 ngày 5 giờ = "29D 5h" — so
sau `trim()` vì bộ định dạng vẫn đệm khoảng trắng như bản gốc),
`task-queue.test.ts` (4: `currentTaskId` khi dừng, khi đang chạy, bỏ qua
shipment bị `retry`, bỏ qua loại không được chạy), `queue-view.test.ts` (▶
theo nguồn, không ▶ khi `null`), `startup.test.ts` (báo một lần qua nhiều lần
làm mới, báo lại sau khi lên trên ngưỡng — helper `renderWine` sửa để đếm mọi
toast từ trước response; bản cũ xoá toast giữa hai lần vẽ nên ngầm dựa vào
toast lặp). Việc 2 và 3 không có test (`barbarian.ts` chưa có file test).

**Chú ý khi commit:** `barbarian.ts` có cả sửa `Math.ceil` này lẫn thay đổi
`annotate(…, false)` → `true` không do lượt nào ở đây — tách khi commit. **Đã làm 04/10:** `Math.ceil` vào `32fe3ba`; thay đổi `annotate` là của người dùng (Barbarian Village hiện số tàu + 1 như Barbarian Fleet), commit riêng `3f8a51b` theo yêu cầu.

### 2.Q Thử trên game (04/10/2026)

**Người dùng thử với `dist/` build 04/10 09:09** (có đủ tới §2.P — đã grep,
xem khối trạng thái đầu file). Danh sách thử là danh sách "cần thử trên game"
của các mục dưới, gửi người dùng cùng ngày, gộp theo nhóm:

| Nhóm                        | Mục                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Cảng biển                   | §2.A (§2.O phần 4): gửi một lượng nhỏ qua Transport Settings + Start Timer của Transport                                                 |
| Runner                      | §2.O phần 2: task lỗi bị bỏ sau 5 lần, không lặp mỗi giây                                                                                |
| Auto Build                  | §2.E lỗi 3, 4 (đã thay bằng §2.L phần 5), 6; §2.F (vòng, `needingShip`)                                                                  |
| Panel, hộp thoại, nhiều tab | §2.G (khoá tab, sọc kho đầy, footer), §2.H, §2.I (bố cục ô số, toast, board 5 town + cuộn, "Warning wine")                               |
| Runner và queue             | §2.J (cần bật cả hai timer), §2.K (↑/↓, Start/Save của Auto Wine), §2.L (tồn kho ít, ô số 0, timer theo loại, chuỗi, đổi town bằng form) |
| Mục menu, thời gian xây     | §2.M (header sau khi gửi tay, buff ✎/✓, Chronos' Forge)                                                                                  |
| Số liệu công trình          | U/V (chi phí so với game, giảm giá tối đa 64%, `maxLevel` tô xám nhưng vẫn bấm được, sức chứa và hài lòng không đổi ở cấp ≤ 50)          |
| Bảy việc nhỏ                | §2.P                                                                                                                                     |

**Kết quả, nguyên văn người dùng:** "Thử trên game" và "Chờ dữ liệu" (lỗi
đổi town sang M-Eretria) — **"cả 2 tạm ok"**.

**Ghi nhận đúng mức:**

- "Tạm ok" là đánh giá chung của người dùng. Không có file Bug Report hay
  log đi kèm, và không có báo cáo riêng cho từng mục trong bảng trên — nên
  không mục nào ở đây được coi là **đã đo**, chỉ là **người dùng thấy ổn**.
- Lỗi M-Eretria: không tái hiện trong lần thử này. **Nguyên nhân gốc chưa
  từng được xác định** (§2.O phần 1). Nếu gặp lại: bấm Bug Report ngay lúc
  đó (file giờ có log), chép vào `tools/output/`.
- Những điểm "chưa kiểm chứng" ghi riêng ở từng mục (ví dụ §2.I phần 4: thanh
  cuộn ngang, kéo-thả khi đang cuộn, viền lệch 1–2px; `townHasPort` với
  shipyard đang xây — handover §7) vẫn giữ nguyên trạng thái cũ cho tới khi
  có báo cáo cụ thể.

### 2.R Tối đa 10 hàng rồi cuộn; nút Close của Auto Build có lại (04/10/2026)

**Commit `32fe3ba` (docs `ec3fdc4`, 04/10); lúc viết thì chưa commit. Có trong `dist/` build 04/10 09:44 (đã grep), chưa thử trên
game.** Người dùng yêu cầu. 578 → 583 test, typecheck (cả cấu hình strict) và
prettier sạch.

**Người dùng muốn:** queue task và queue lệnh gửi hiện tối đa 10 hàng, nhiều
hơn thì cuộn; hộp thoại Auto Build Settings có nút Close.

| Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ở đâu                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `capVisibleRows(box, rowSelector, count)`: `max-height` của khung = từ đầu khung tới đáy hàng thứ `count` (hàng tiêu đề nằm trong đó), `overflow-y: auto`. ≤ `count` hàng → bỏ giới hạn. **Đo, không cố định**: hàng trong cửa sổ của script và trong popup của game cao khác nhau. Khung chưa có layout (đang ẩn) đo ra 0 → giữ giới hạn cũ. Giữ `scrollTop` qua mỗi lần vẽ lại. Cùng cách với `fitTownRows` của board Empire (§2.I phần 4), nhưng viết lại trong core vì Send Resources không được phụ thuộc Empire Overview | `core/dom.ts`                     |
| Queue trong panel: bảng bọc trong `div.ika-queue-scroll`; `refreshQueueView` đặt giới hạn sau mỗi lần vẽ, đếm `tr[data-ika-queue-id]`. `VISIBLE_ROWS = 10` (export). Panel đang đóng thì chưa đo được; lần làm mới kế tiếp khi panel mở (vòng trạng thái vài giây một lần) sẽ đặt                                                                                                                                                                                                                                              | `send-resources/ui/queue-view.ts` |
| Bảng lệnh gửi của Transport Settings: bọc trong `div#resourceTableScroll`; `renderResourceTable` đặt giới hạn, đếm `#resourceTableBody > tr`, dùng chung `VISIBLE_ROWS`                                                                                                                                                                                                                                                                                                                                                        | `send-resources/ui/dialogs.ts`    |
| Nút **Close** (`dialog.close`) thêm lại cạnh **Save** trong Auto Build Settings — đảo lại việc 2 của §2.P                                                                                                                                                                                                                                                                                                                                                                                                                      | `send-resources/ui/dialogs.ts`    |

**Không đổi:** queue vẫn chỉ vẽ tối đa 50 task (`MAX_ROWS`) và dòng "…
more" khi vượt. Hàng tiêu đề cuộn cùng bảng (không `sticky`) — người dùng
không yêu cầu giữ cố định.

**Test** (happy-dom không có layout: test tự gán 20px mỗi hàng):

- `queue-view.test.ts` (3): 12 task → `max-height: 220px` (tiêu đề + 10
  task) và `overflow-y: auto`; 10 task → không giới hạn; không có layout →
  không đặt chiều cao vô nghĩa.
- `app.test.ts` (2): bảng Transport Settings với 12 lệnh gửi → `220px`;
  HTML của Auto Build Settings có cả `build.save` lẫn `dialog.close`.
- Đã thấy **đỏ**: bỏ lời gọi `capVisibleRows` ở queue (1) và ở bảng
  Transport Settings (1); bỏ nút Close (1).
- Không có file test riêng cho `core/dom.ts`; helper được kiểm qua hai chỗ
  dùng nó (tạo file test mới cần hỏi người dùng).

**Cần thử trên game:** queue có hơn 10 task → hiện 10 hàng và cuộn; mở panel
sau khi queue dài lên → vài giây sau có giới hạn; Transport Settings có hơn
10 lệnh gửi → cuộn; Auto Build Settings có hai nút Save, Close.

### 2.S Auto Wine theo tàu nguyên và rượu uống trên đường; bốn việc nhỏ (04/10/2026)

**Commit `b2e9084`** (cùng `3f8a51b` cho `barbarian.ts`). Có trong `dist/`
13:11; chưa thử trên game. Người dùng yêu cầu làm S và T (trước đó chỉ ghi
lại ở §4.2) cùng bốn việc nhỏ.

#### 1. S — làm tròn theo tàu

**Người dùng chọn:** phần chia của một town từ **một tàu trở lên** thì
**làm tròn xuống** theo số tàu nguyên; phần **dưới một tàu** vẫn gửi nguyên.
Phần dư ở lại town nguồn cho lượt sau.

- `distributeWine(towns, supply, { shipCapacity })`
  (`features/wine-distribution.ts`): sau khi chia, mỗi phần ≥ `shipCapacity`
  được làm tròn xuống bội số của `shipCapacity`.
- `planWineRun` truyền `getPerShipCapacity()` — sức chứa merchant ship đã
  Calibrate (`ship-capacity.ts`).
- Test Auto Wine có sẵn đổi số mong đợi thành 31.500 vì quy tắc này.

#### 2. T — rượu town nhận uống trong lúc chở

**Người dùng chọn:** ghi thời gian **theo từng tuyến** khi gửi thật, rồi
dùng khi lập kế hoạch.

- Mỗi lệnh gửi đọc `#loadingTime` + `#journeyTime` trên form **trước khi
  submit** (`recordRouteTime` trong `features/send-resources.ts`), đổi ra giây
  bằng `parseDurationSeconds` (`core/format.ts`, mới), lưu theo cặp city id:
  `KEY.routeTimes = "ikaRouteTimes"` (theo tài khoản; `recordRouteSeconds`,
  `routeSeconds` trong `state.ts`). Export Data xếp nó vào nhóm
  `measurements`.
- Auto Wine: `buildWineTowns(receivers, board, fromTown)` gắn
  `transitHours` cho mỗi town; `stockOnArrival` = tồn kho − tiêu thụ ×
  `transitHours`; chia rượu theo lượng **lúc tàu tới**, nên town xa được bù
  tới cùng số giờ như town gần.
- Tuyến **chưa gửi bao giờ** tính 0 giờ — như trước khi có T.

#### 3. Bốn việc nhỏ

| Việc                   | Thay đổi                                                                                                                                                                                                             | Ở đâu                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Dòng trạng thái        | Gọi tên task upgrade runner đang làm (`QUEUE_VIEW.upgrade`), thay vì "Nothing is transferring"                                                                                                                       | `features/send-resources.ts` (`describeCurrentTransfer`) |
| Cảng chỉ có ô đang xây | Ô biển duy nhất của town là công trường (cảng đang nâng hoặc shipyard — ô không cho biết là gì) và form gửi không mở: task **hoãn** (`defer`) thay vì ném lỗi tới khi runner bỏ nó. `townHasBuiltPort`, `seaSlotHas` | `navigation.ts`, `features/send-resources.ts`            |
| Hàng tiêu đề đứng yên  | Tiêu đề của queue và bảng Transport Settings `position: sticky` khi cuộn (§2.R chưa giữ)                                                                                                                             | `ui/styles.ts`                                           |
| Mở panel               | `togglePanel` vẽ lại queue ngay khi mở, để giới hạn 10 hàng áp liền (trước phải chờ vòng trạng thái kế tiếp)                                                                                                         | `ui/panel.ts`                                            |

#### 4. `barbarian.ts` (commit `3f8a51b`)

Thay đổi `annotate(SEL.barbarianVillageResources, false)` → `true` là **của
người dùng** (có từ phiên 03/10, không lượt nào ở đây làm). Người dùng xác
nhận và yêu cầu commit riêng: Barbarian Village hiện **số tàu + 1** như
Barbarian Fleet, thay vì "tàu (tổng)".

**Cần thử trên game:** Auto Wine với một town nhận cần hơn một tàu — gửi
đúng số tàu nguyên; sau vài lần gửi tay giữa hai town, Auto Wine chia cho
town xa nhiều hơn; một town đang nâng cảng — lệnh gửi chờ thay vì báo lỗi.

### 2.T Board và tính năng IkaEasy: 2.6, R, K, J, E, 2.8 (04/10/2026)

**Commit `c78b49e` (docs `0da427b`, 04/10, chưa push). Có trong `dist/` build
04/10 13:11 (đã grep), chưa thử trên game.** 583 → 643 test (gồm cả §2.S và §2.U), 35 file test; typecheck và
prettier sạch. Mỗi việc có test đều đã thấy **đỏ** khi tạm làm hỏng đúng
chỗ đó (chi tiết từng phần).

#### 1. Câu hỏi 2 và 3 — người dùng đã trả lời

- **Câu hỏi 2** (Phase 2 có gồm board không): "ok, làm như đề xuất" —
  **có**. Thứ tự: **2.6 trước**, **2.8 sau**, **2.7 chỉ làm khi có lỗi cụ
  thể** (nháy, mất vị trí cuộn).
- **Câu hỏi 3** (lấy mục nào ở §4.2): "làm theo đề xuất đi" — **R** (tối
  thiểu: tắt kiểm tra bản mới trỏ nhầm) và **K** trước; rồi **O, J, E**;
  **P, L** khi có capture; **F, G, I, M, N, Q không làm lúc này**.
- **O (ghi chú):** sau khi nghe giải thích (game đã có sổ ghi chú riêng; O
  không tự động hoá gì), người dùng: "vậy thì **chưa cần**".

#### 2. 2.6 — chỉ báo đồng bộ trên board

**Người dùng chọn:** icon **↻** ở góc ô tiêu đề Town của ba bảng
Resource / Build / Army; bình thường mờ, **xoay** trong lúc Send Resources
làm mới mọi town. Chỉ là chỉ báo — không overlay, không chặn thao tác.

- Hai script là hai bundle, nên tin báo đi qua `document`:
  `announceSync(running)` phát `ika:syncStarted` / `ika:syncFinished`,
  `onSyncChange(handler)` nghe (`core/ikariam/http.ts`).
- `syncAllTowns` (`features/sync-towns.ts`) bọc `refreshEveryTown` trong
  `announceSync(true)` … `finally announceSync(false)` — lỗi giữa chừng vẫn
  tắt chỉ báo.
- Board: `syncIndicatorHtml(lang)` chèn `span.empire_syncIndicator` vào 3 ô
  `th.city_name`; `main.ts` bật/tắt class `empire_syncing` trên
  `#empireBoard` — đặt trên board, không trên icon, nên bảng vẽ lại giữa
  chừng vẫn giữ trạng thái. CSS `@keyframes empire_syncSpin` ở `helpers.ts`;
  tooltip `syncIndicator` trong `constants.ts`.
- Test: `http.test.ts` (tin đi từ bản module của script này sang bản của
  script kia — `vi.resetModules()` mô phỏng hai bundle),
  `sync-towns.test.ts`, `startup.test.ts` (3 icon, class bật rồi tắt).

#### 3. R — bỏ kiểm tra bản mới trỏ nhầm

**Phát hiện:** `CheckForUpdates` của board (từ bản gốc) đọc phiên bản của
**script Empire Overview gốc trên greasyfork (id 764)** và mời cài **bản
đó**, đè lên bản fork này. Không chỗ nào gọi nó tự động (checkbox "tự kiểm
tra" không làm gì); chỉ nút "check" trong Settings gọi.

- **Đã bỏ:** `CheckForUpdates`, `scriptId`, `scriptName` (`empire.ts`, có
  comment "REMOVED (not in the original)"); nút Update, checkbox
  `autoUpdates`, nhóm "Global" của Settings, handler và hai lần khởi tạo
  `.button()` (`render.ts`); các chuỗi liên quan (`constants.ts`). **Giữ**
  khoá `autoUpdates` trong schema settings, để settings đã lưu vẫn nạp được.
- **Chưa làm — chờ người dùng:** kênh cập nhật riêng (`@updateURL` /
  `@downloadURL`) cần đặt bản build ở một URL công khai. Đó là việc đưa ra
  ngoài, người dùng quyết; chưa trả lời.
- Test: `startup.test.ts` — Settings không còn nút Update, checkbox
  `autoUpdates`; đã thấy đỏ.

#### 4. K — cấp công trình trên city view

- Code ở **cuối `features/auto-build.ts`** (không tạo file mới): phần đọc
  title "Tên (N)" tách thành `readBuildingSlot`, dùng chung với
  `listBuildingsInCurrentTown` (danh sách trong Settings không đổi).
- `showBuildingLevels`: mỗi `SEL.buildings` có một `span.ika-building-level`
  ghi `12`, hoặc `12→13` khi đang nâng (`constructionSite`), `0→1` khi đang
  xây cấp đầu. Title không có ngoặc → không nhãn.
- `startBuildingLevelObserver`: `MutationObserver` trên **`document.body`**
  (`childList`, `subtree`, thuộc tính `class`/`title`). Chọn body vì **chưa
  xác minh** được các ô công trình có nằm trong `#container` không (chưa có
  capture DOM city view). Mỗi lô thay đổi một lần chạy, **không có timer
  riêng** — test của `app.ts` đếm đúng số timer, một `setTimeout` thêm làm
  12 test đỏ.
- **Chỉ ghi khi chữ khác**: nhãn tự thêm vào cũng kích observer; ghi lại
  không điều kiện thì lặp vô hạn (đã thấy: test treo).
- CSS (`ui/styles.ts`): giữa hình công trình, nền kem, viền nâu,
  `pointer-events: none` (bấm xuyên qua). **Vị trí và kiểu là đoán.**
- Khởi động trong `app.start()`, sau `startTransportButtonObserver()`.
- Ghi chú: giải thích câu hỏi 3 nói class DOM có sẵn cấp (`building vineyard
level40`); code đọc title như Settings dialog, không đọc class.
- Test: `auto-build.test.ts` (3: nhãn đúng cho 4 kiểu slot; chạy lại không
  thêm nhãn thứ hai; observer theo game rồi dừng).

#### 5. J — thông báo desktop

**Người dùng chọn (theo đề xuất):** `Notification` API của trang cho cả hai
bản build (chỉ báo khi tab game còn mở, kể cả tab nằm sau hay thu nhỏ); cả
4 loại, **mỗi loại một checkbox**; báo **đúng lúc** xảy ra (không "báo
trước"); code chung trong **file mới** `src/core/notifications.ts` (+ test)
— người dùng đồng ý tạo.

**Sửa ghi chú cũ:** ghi chú về J ở §4.2 nói extension đã khai quyền
`notifications`/`alarms` — **sai**: manifest (`build/build-extension.mjs`)
chỉ có `host_permissions`. Báo cả khi đã đóng tab cần quyền đó + background
service worker + đường tin trang → content script → background; để sau.

| Loại            | Báo khi                                                                                            | Nối ở đâu                                                                                                | Checkbox                  |
| --------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------- |
| `buildFinished` | Công trình xây xong                                                                                | `completeUpgrade` (`empire-overview/models/building.ts`)                                                 | Settings của board        |
| `arrival`       | Tàu/quân tới nơi, cả town người khác ("another player's town")                                     | `updateTransportComplete` (`models/movement.ts`)                                                         | Settings của board        |
| `wineLow`       | Town còn dưới `CRITICAL_HOURS` (12 giờ) rượu; mỗi town một lần, báo lại sau khi đã lên trên ngưỡng | `notifyLowWine` (`features/wine-warning.ts`), chạy trên nhịp 5 giây có sẵn (`TOWN_SNAPSHOT_INTERVAL_MS`) | panel, nhóm Notifications |
| `taskDropped`   | Runner bỏ một task: `failed`, hoặc ném lỗi `maxConsecutiveErrors` lần liền                         | option mới `onTaskDropped` của `TaskRunner` (`core/task-queue.ts`)                                       | panel, nhóm Notifications |

- **Core** (`core/notifications.ts`): công tắc ở `ikaNotifications` (nhóm
  `config`, có trong Export); bản ghi đã báo ở `ikaNotified` (nhóm
  `runtime`, xoá sau 7 ngày) — **chống báo trùng** giữa hai script và nhiều
  tab, kèm `tag` của hệ điều hành; sự kiện cũ hơn **2 phút**
  (`STALE_AFTER_MS`) không báo (load trang sau khi game đóng lâu thì không
  ra cả loạt); bấm thông báo thì về tab game.
- **Bật**: `setNotificationEnabled` xin quyền trình duyệt trước; bị từ chối
  thì ô tự bỏ tick và có toast (`NOTIFICATION_PERMISSION` trong
  `core/messages.ts`). Mọi loại **mặc định tắt**.
- Checkbox của panel nghe sự kiện `change`, **không** qua bộ dispatch click:
  bộ đó `preventDefault`, mà click bị huỷ thì trình duyệt trả lại dấu tick.
- Checkbox của board lưu qua core, không vào `database.settings`.
- Test: `notifications.test.ts` (10), `task-queue.test.ts` (2),
  `wine-warning.test.ts` (2), `panel.test.ts` (3), `building.test.ts` (2).
  Đỏ đã thấy: bỏ kiểm tra "sự kiện cũ", bỏ chống trùng, bỏ callback khi bỏ
  task, bỏ việc bỏ tick khi bị từ chối, bỏ việc reset rượu. **Điểm nối
  "tàu tới" chưa có test** (không có file test đúng chủ đề).
- **Chưa xác minh:** Empire Overview chạy trong sandbox Tampermonkey —
  `Notification` có dùng được ở đó không. Nếu tick ô trong Settings của
  board mà báo "This browser cannot show notifications" thì là vì vậy.

#### 6. E — nút ▲ nâng cấp nhanh trong tab Build

**Người dùng chọn (a)** trong ba cách: gửi thẳng lệnh nâng cấp, không qua
runner. Rồi dặn: **"cần test kĩ, làm xong cần thu thập log (bug report) của
game để chắc chắn"**.

- **Phát hiện khi đọc code:** nút Upgrade của game giờ mang
  `function=upgradeBuilding` (handler có sẵn của board đọc đúng tham số này),
  còn code cũ của IkaEasy tự ghép `action=UpgradeExistingBuilding`. Nên
  **không tự ghép URL**: lấy link của chính nút Upgrade, như helper
  `buildingUpgrade.js` của IkaEasy V4.
- `upgradeBuildingNow(cityId, view, position)` (`core/ikariam/http.ts`):
  request view của công trình (`backgroundView=city`, `currentCityId`) →
  `findUpgradeLink` (`href` của `#js_buildingUpgradeButton`; `#` = không có
  nút) → request link đó (`actionRequest`, `ajax` được `ikariamRequest` ghi
  đè) → `responseFeedback`: `provideFeedback` type 10 là thành công, chữ lý
  do đổi sang text thường. Cả hai response vào board qua `onResponse`, ô tự
  cập nhật. **Sai — người dùng thử 04/10 tối: ô không cập nhật** (response
  của lệnh nâng cấp nhiều khả năng không mang công trình của town); sửa ở
  **§2.V**.
- Board (`render.ts`): nút `button.empire_quickUpgrade` (▲) **chỉ ở ô
  `upgradable`** (đủ tài nguyên, town không xây gì); `cityBuildingOfCell`
  dùng chung với handler bấm số cấp; `quickUpgrade` khoá nút tới khi game trả
  lời (từ §2.V: tới khi tải lại town xong) (nút disabled không phát click —
  đó chính là khoá), toast "Upgrade
  started" / "The game did not start the upgrade: … : lý do" / "Upgrade
  request failed" (lỗi hẳn còn vào `reportBug`).
- **Dữ liệu cho Bug Report:** 5 lần gần nhất ở `ikaQuickUpgradeTrace` (nhóm
  `diagnostics`), mỗi lần: hai response (mỗi cái tối đa 20.000 ký tự), HTML
  nút Upgrade, link đã gửi, kết quả, lỗi. Bug Report thêm
  `gameData.quickUpgrades`; toast báo "Quick upgrades from the board: N
  included."
- Red check: bỏ điều kiện hiện nút, bỏ khoá nút, bỏ ghi trace, nhận link `#`
  → đỏ. **Hai red check không đỏ, cả hai là code thừa — đã bỏ:** kiểm tra
  `disabled` trong handler, và lệnh xoá `actionRequest`/`ajax` khỏi link.
- Test: `http.test.ts` (9), `startup.test.ts` (2), `app.test.ts` (2).
- **Chưa xác minh:** dạng response (field `text` của `provideFeedback`, dạng
  link) đọc từ code, chưa capture. Header tài nguyên của game không tự cập
  nhật tới lần chuyển trang kế tiếp. Request mở view gửi `currentCityId`
  của town đó, như sync town.

**Cần thử trên game (người dùng yêu cầu):** một lần thành công (ô xanh →
▲ → town bắt đầu xây); một lần bị từ chối (ví dụ bấm ở town vừa bắt đầu xây
cái khác, trước khi board đổi màu ô); rồi **Bug Report**, chép file vào
`tools/output/` — đối chiếu response thật để chỉnh phần đọc link và lý do.

#### 7. 2.8 — tooltip trên số tồn kho

- **Phát hiện:** hệ tooltip của board (`render.toolTip`) đã giống IkaEasy
  (đi theo chuột, lật khi chạm mép), và nội dung phần lớn đã có: thanh tiến
  độ (sức chứa, an toàn, %, từng kho), dòng sản lượng (sản lượng/tiêu hao
  **1 giờ / 1 ngày / 1 tuần**), `emptytime`. Ghi chú cũ "thay cho
  `data-tooltip="dynamic"` của game" **sai** — đó là tooltip của chính
  board. Chỗ thiếu duy nhất: **số tồn kho** không có tooltip.
- **Người dùng chọn (b):** chỉ bổ sung chỗ thiếu. `getStockTip` (trong
  `dynamicTip`): tồn kho; sức chứa + % đầy; an toàn; sản lượng mỗi giờ / ngày;
  tiêu hao mỗi giờ / ngày / tuần (đỏ, rượu); "Empty in" (đỏ) hoặc "Full in".
  Ô vàng không có. `span.current` thêm `data-tooltip="dynamic"`; chuỗi
  `stockTip_*`.
- Sửa lại một câu đã nói với người dùng: lúc đề xuất mình ghi "sản lượng mỗi
  ngày chưa có" — thật ra tooltip sản lượng đã có.
- Test: `startup.test.ts` (1). Đỏ khi bỏ nối `getStockTip`, bỏ loại trừ ô
  vàng, bỏ `data-tooltip` của số tồn kho.

**Cần thử trên game (cả §2.T):** ↻ xoay khi bấm làm mới mọi town; Settings
của board không còn nút Update; nhãn cấp trên city view (vị trí, có cập
nhật khi bắt đầu/xong nâng cấp không cần tải lại); tick từng loại thông báo
(trình duyệt hỏi quyền), rồi chờ một công trình xây xong và một task bị bỏ;
E như trên; rê chuột lên số tồn kho.

### 2.U U: cấp > 50 từ trang Help của s303 (04/10/2026)

**Commit `c78b49e` (docs `0da427b`, 04/10, chưa push). Có trong `dist/` 13:11,
chưa thử trên game.** `docs/wiki/s303/` (nguồn số) vẫn untracked — dữ liệu
của người dùng.

#### 1. Dữ liệu

Người dùng crawl trang Help > building details trên **`s303-en`** (04/10,
nút Crawl Building), lưu ở `docs/wiki/s303/` (**untracked** — dữ liệu của
người dùng). 28 công trình; mỗi file là một cửa sổ **50 cấp** quanh cấp hiện
tại của tài khoản, kết thúc ở cấp 51 (Dockyard) tới 96 (Architect, Carpenter,
Optician). **Không có** (người dùng: không khác bản cũ nên không lấy):
Chronos' Forge, Palace, Governor's Residence, Pirate Fortress, Temple.

#### 2. Đo trên các cấp hai server cùng có (so với s800, `docs/wiki/`)

| Cột       | Kết quả                                                                  | Kết luận                                                                                                       |
| --------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Thời gian | s303 × 2 khớp s800 ở **696/696** ô (trong mức làm tròn của chữ hiển thị) | s303 có buff **−50% thời gian xây**                                                                            |
| Chi phí   | `round(s800 × 0,86)` = s303 ở **1.640/1.640** ô                          | Trang Help hiển thị chi phí **đã trừ 14%** — đúng bằng Pulley 2% + Geometry 4% + Spirit Level 8% của tài khoản |
| Hiệu ứng  | Giống hệt                                                                | Không bị buff nào ảnh hưởng                                                                                    |
| Mô tả     | Giống hệt ở cả 28 file                                                   | `maxLevel` giữ nguyên                                                                                          |

Thêm: các cấp liên tục, không có ô chi phí trống; chia ngược `÷ 0,86` ra
đúng số gốc ở 86% ô, còn lại lệch **tối đa 1 đơn vị**.

#### 3. Quyết định và cách nạp

- **Người dùng:** "lưu constant cần original time … thông tin get từ s303
  là đã apply buff −50% … cần x2 … việc tính toán vẫn như công thức hiện
  tại". **Chi phí** (mình phát hiện, hỏi riêng): người dùng chọn **÷ 0,86**,
  để board không trừ research hai lần (`getUpgradeCost` tự trừ).
- Chỉ **thêm** cấp sau phần đã có; cấp 1–50 (s800) giữ nguyên.
- Thời gian = s303 × 2 (giây); chi phí = `round(s303 ÷ 0,86)`; hiệu ứng lấy
  nguyên. Bảng hiệu ứng được kéo dài, ánh xạ cột dò bằng cách so với số s800
  đã nạp: `academy.maxScientists`, `museum.basicBonus`, `port.loadingSpeed`,
  `tavern.wineUse` / `basicBonus` / `wineBonus` (chỉ số = cấp);
  `warehouse.capacity`, `dump.capacity` (chỉ số = cấp − 1). Không đụng
  `tavern.wineUse2`, `townHall.actionPointsMax` (không từ trang Help).
- Kết quả: **704 cấp mới** ở 28 công trình. Kiểm: **125/125 bảng cũ** không
  đổi số nào; 704/704 cấp mới khớp trang Help sau quy đổi. Ví dụ Academy cấp
  51: wood 668.834.826 ÷ 0,86 = 777.714.914; thời gian 2M 29D × 2 =
  15.379.200 s.
- Comment trên `BuildingData` (`constants.ts`) ghi nguồn và cách quy đổi.
  Script nạp ở scratchpad của phiên, không vào repo.
- Test: `constants.test.ts` (2) chốt Academy cấp 51 (s303 đã quy đổi) và cấp
  50 (s800).

#### 4. Còn thiếu / giới hạn

- Cấp rất cao chỉ có thời gian **thô** trên trang Help (ví dụ "9Y 5M"); × 2
  thì sai số cũng × 2 — chính xác tới khoảng một tháng.
- Vẫn không có số: 5 công trình kể trên quá cấp đã liệt kê; mỗi công trình
  quá cuối cửa sổ của s303 (ví dụ Dockyard > 51); Palace và Governor's
  Residence > 30. Ở đó chi phí và thời gian vẫn ra `0` (`|| 0`) như trước.
- Nếu crawl thêm từ server khác: kiểm lại hệ số (server buff, research của
  tài khoản) bằng các cấp trùng như ở phần 2, đừng mặc định 0,86 và × 2.

### 2.V Nút ▲: ô không chuyển sang "đang nâng cấp" (04/10/2026, tối)

**Commit `cefcc92` (docs ở commit sau `9c363f7`), chưa push. Có trong
`dist/` 21:21 (đã grep `quick upgrade refresh`), chưa thử trên game.** Người dùng báo lỗi, chọn cách sửa trong ba cách được
đưa ra. 35 file, 643 → 645 test,
typecheck (cả cấu hình strict) và prettier sạch.

#### 1. Người dùng báo

Trên board Empire Overview, bấm ▲ để nâng cấp: thành công (toast "Upgrade
started: …") nhưng ô của công trình **không chuyển sang trạng thái đang
nâng cấp**. Phải bấm Scan, hoặc sang town có công trình đó, thì ô mới đúng.

#### 2. Nguyên nhân — đọc từ code, **chưa đo**

- Board chỉ đổi trạng thái công trình khi một response có
  `updateGlobalData.backgroundData.position` hoặc `updateBackgroundData`
  (`game-api.ts`, `setupEventHandlers`); `Building.update` đọc `completed`
  của từng ô (`models/building.ts`).
- `upgradeBuildingNow` (`core/ikariam/http.ts`) gửi hai request. Request 1
  (view công trình) có `backgroundView=city` + `currentCityId`, nhưng mang
  trạng thái **trước** khi nâng. Request 2 (lệnh nâng cấp) chỉ gửi **đúng
  tham số trong link** của nút Upgrade — fixture trong test giả định link
  không có `backgroundView`/`currentCityId`. Nhiều khả năng vì vậy response
  không có `backgroundData`, board không thấy ô đang xây; game vẫn nhận lệnh
  nên toast vẫn báo thành công.
- IkaEasy V4 gửi cùng link đó qua `ajaxHandlerCall` của trang
  (`js/page/bg/city.js`), hàm của game tự thêm ngữ cảnh view; link demolish
  của họ ghi thẳng `backgroundView=city&currentCityId=…`.
- `render.updateChangesForCityBuilding(city.getId, [])` sau khi thành công
  **không làm gì**: hàm chỉ chạy khi mảng `changes` khác rỗng. Dòng này chép
  từ handler nút Upgrade của chính game trong board (`AttachClickHandlers`),
  ở đó cũng không làm gì — ô cập nhật được là nhờ response của game có
  `backgroundData`.
- Khớp với điều người dùng thấy: Scan (`fetchTown`) và sang town đều gửi
  `backgroundView=city`.

#### 3. Sửa

**Người dùng chọn** "tải lại town sau khi thành công", không chọn "thêm
`backgroundView=city` + `currentCityId` vào lệnh nâng cấp" (chưa đo được
server có trả `backgroundData` cho lệnh đó) hay "gửi Bug Report trước rồi
mới sửa".

| Thay đổi                                                                                                                                                              | Ở đâu                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Game báo đã bắt đầu → gọi `fetchTown(city.getId)` — đúng request của Scan; response vào board qua `onResponse` như mọi response khác                                  | `empire-overview/render.ts`, `quickUpgrade` |
| Nút ▲ **khoá tới khi tải lại xong**: trước đó ô vẫn hiện "có thể nâng", bấm lần nữa sẽ gửi lệnh thứ hai                                                               | `render.ts`                                 |
| Tải lại lỗi → `reportBug` (`where: "quick upgrade refresh"`); toast "Upgrade started" giữ nguyên, **không** thành "Upgrade request failed" — nâng cấp đã bắt đầu thật | `render.ts`                                 |
| Bỏ `updateChangesForCityBuilding(city.getId, [])` (không làm gì)                                                                                                      | `render.ts`                                 |

`upgradeBuildingNow` và trace cho Bug Report **không đổi**.

#### 4. Test

`empire-overview/startup.test.ts`, nhóm "the quick upgrade button" (+2):

- REGRESSION: thành công → `fetchTown(297034)`, toast "Upgrade started",
  nút còn khoá tới khi tải lại xong rồi mới mở.
- Tải lại lỗi → không có toast "Upgrade request failed", nút mở lại.
- Đã thấy **đỏ**: `render.ts` ở `HEAD` → cả hai đỏ; bỏ riêng nhánh bắt lỗi
  của lần tải lại → test thứ hai đỏ.

#### 5. Còn lại, chưa làm

- Mỗi lần bấm ▲ tốn **thêm một request** (tổng ba).
- Nguyên nhân gốc chưa đo. Bug Report (`gameData.quickUpgrades`) có
  `upgradeLink` và `upgradeResponse` thật — đọc nó sẽ biết link có
  `backgroundView` không, response có `backgroundData` không.
- Comment của `upgradeBuildingNow` (`core/ikariam/http.ts`) vẫn ghi "Both
  responses reach the board … so it redraws the town" — sai theo lỗi này;
  chưa sửa (ngoài phạm vi yêu cầu).
- `AttachClickHandlers` (nút Upgrade của game) vẫn gọi
  `updateChangesForCityBuilding(…, [])` không làm gì — vô hại, ô cập nhật
  nhờ response của game; để nguyên.
- Header tài nguyên của game vẫn không tự cập nhật sau ▲ (§2.T phần 6):
  `fetchTown` chỉ đi vào board, không vào responder của game.

**Cần thử trên game** (sau khi cài lại Empire Overview từ `dist/` 21:21): bấm ▲ →
toast "Upgrade started" → trong vài giây ô chuyển sang đang nâng cấp, không
cần Scan; nút ▲ không bấm được trong lúc chờ. Rồi Bug Report, chép file vào
`tools/output/`.


### 2.W Extension Chrome không load được: manifest sai (04/10/2026, tối)

**Commit `9c363f7` (docs ở commit ngay sau), chưa push. `dist/extension/`
đã build lại (21:21), chưa load lại trong Chrome.** Người dùng báo lỗi; sửa thẳng, không có lựa chọn nào cần hỏi.

#### 1. Người dùng báo

Load unpacked `D:\Working\Ika\dist\extension` trong Chrome:

```
Failed to load extension
Invalid value for 'content_scripts[0].exclude_matches[0]': Invalid host wildcard.
Could not load manifest.
```

#### 2. Nguyên nhân — đã kiểm

- `build/build-extension.mjs` (`writeManifest`) ghi
  `exclude_matches: ["*://board.*.ikariam.gameforge.com/*", "*://*.ikariam.gameforge.com/board*"]`
  để không chạy trên diễn đàn (`board.<ngôn ngữ>.ikariam.gameforge.com`).
- Tài liệu match pattern của Chrome
  (developer.chrome.com, "Match patterns"): `*` trong host **chỉ được là ký
  tự đầu hoặc duy nhất, theo sau là `.` hoặc `/`**. `board.*.ikariam…` có
  `*` ở giữa → không hợp lệ → Chrome bỏ **cả manifest**.
- Pattern thứ hai (`*.ikariam.gameforge.com/board*`) hợp lệ.
- Userscript không bị: `@exclude` của Tampermonkey là glob, `*` ở đâu cũng
  được (`build/shared.ts`, `excludeBoard`).
- Lỗi có từ commit `e551bb8` (dựng toolchain, `git log -L`). Nghĩa là **bản
  extension chưa từng load được**; mọi lần thử trên game tới nay là
  userscript.

#### 3. Sửa

| Thay đổi | Ở đâu |
| -------- | ----- |
| `*://board.*.ikariam.gameforge.com/*` chuyển từ `exclude_matches` sang **`exclude_globs`** — theo tài liệu content scripts của Chrome, `*` của glob khớp mọi chuỗi, áp sau `matches`, MV3 vẫn hỗ trợ. Có comment giải thích tại chỗ | `build/build-extension.mjs`, `writeManifest` |
| `*://*.ikariam.gameforge.com/board*` giữ trong `exclude_matches` | như trên |

`npm run build:extension` → `dist/extension/manifest.json` có
`exclude_matches: ["*://*.ikariam.gameforge.com/board*"]` và
`exclude_globs: ["*://board.*.ikariam.gameforge.com/*"]`. Các pattern còn
lại (`matches`, `host_permissions`, `web_accessible_resources`:
`*://*.ikariam.gameforge.com/*`, `*://*.ikariam.gameforge.de/*`) đúng dạng
`*.` ở đầu host.

**Không có test**: repo không có test nào cho `build/`. Kiểm bằng cách đọc
manifest đã sinh; **Chrome chưa load lại** để xác nhận.

#### 4. Còn lại, chưa làm

- Loại trừ diễn đàn chỉ có cho `.com` trong extension (`MATCHES` có cả
  `.de`, phần loại trừ thì không) — y như trước khi sửa; userscript loại trừ
  mọi tên miền (`gameforge.*`).
- Bản extension chưa từng chạy, nên **mọi thứ riêng của extension** (content
  script tiêm `<script>` từ `page/*.js`, `web_accessible_resources`, hai bundle
  trong cùng trang) **chưa từng được thấy chạy** trên game.

**Cần thử:** `chrome://extensions` → Load unpacked `dist/extension` (đã có
thẻ thì Reload) → không báo lỗi; mở game → board Empire Overview và panel
Send Resources hiện như bản userscript. **Tắt hai userscript trong
Tampermonkey trước** — chạy cả hai bản cùng lúc thì mỗi script có hai bản sao
trên trang.

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

| #      | Việc                                                                                                                                                                                                                                                                                                                                                                                                                  | Lấy mẫu từ                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 2.1 ✅ | `createWindow({ title, width })` — header / body / footer, kéo được, ESC đóng, `max-height` theo viewport, append vào `#container`, dùng class của game (`table01 dotted`, `tabmenu`)                                                                                                                                                                                                                                 | `js/helper/win.js`, `tpl/helper-win.ejs` |
| 2.2 ✅ | Thu panel còn một điểm mở cửa sổ đó, thay vì 12 nút dán đè lên game. **Từ 25/09 là nút cố định ở góc dưới trái** (`buildLauncher`), không phải mục trong menu trái: mục menu làm header không cập nhật (§2.C). **03/10:** lại là mục trong menu trái, **không có `expandable`** (class đó mới là thứ làm header hỏng, §2.M phần 1); nút góc chỉ còn dự phòng khi không có menu; cửa sổ nhớ đang mở/đóng (§2.M phần 2) | `addToLeftMenu` trong `js/utils.js`      |
| 2.3 ✅ | Nhóm điều khiển theo tính năng — đã làm thành sáu nhóm **Wine** / **Transport** / **Build** / **Queue** / **Account** / **Data** — thay vì một hàng phẳng                                                                                                                                                                                                                                                             | `tpl/dummy/empire/window.ejs`            |
| 2.4 ✅ | Dòng trạng thái sống: task đang chạy, độ dài queue, tàu rảnh, action point. Tàu rảnh + action point thêm 28/09 (§2.G)                                                                                                                                                                                                                                                                                                 | `#empire_sync` + overlay của tab         |
| 2.5 ✅ | Bỏ toạ độ pixel cứng; nhớ vị trí cửa sổ vào storage                                                                                                                                                                                                                                                                                                                                                                   | `settings.window`                        |
| 2.6 ✅ | Overlay "đang đồng bộ" + icon refresh xoay, thay vì im lặng. **04/10 (§2.T phần 2):** chỉ làm icon ↻ ở tiêu đề Town của 3 bảng, xoay khi Send Resources làm mới mọi town; không overlay                                                                                                                                                                                                                               | `.empire-tab-overlay`                    |
| 2.7 ⏸  | Cập nhật bảng **tăng dần** thay vì vẽ lại toàn bộ mỗi vài giây (mất vị trí scroll, nháy). **Người dùng 04/10: chỉ làm khi có lỗi cụ thể**                                                                                                                                                                                                                                                                             | CHANGELOG 4.0.0.0                        |
| 2.8 ✅ | Tooltip dùng chung: tồn kho / trần kho / sản lượng / % — thay cho `data-tooltip="dynamic"` của game. **04/10 (§2.T phần 7):** `dynamic` là tooltip của chính board và đã có phần lớn số liệu; chỉ thêm tooltip cho số tồn kho                                                                                                                                                                                         | `js/helper/tooltip.js`                   |

### Đã làm tới đâu

2.1 ở `src/core/ui/window.ts` (kéo được, ESC đóng, nhớ vị trí). 2.2–2.3 và 2.5
ở `src/send-resources/ui/panel.ts`: một nút cố định ở góc dưới trái
(`buildLauncher`) mở cửa sổ, sáu nhóm **Wine / Transport / Build / Queue /
Account / Data**, vị trí lưu theo tài khoản. Ban đầu là một mục trong
`.menu_slots`; đã bỏ ngày 25/09 vì chính mục đó làm header của game ngừng cập
nhật (§2.C). **03/10: mục menu trở lại**, lần này **không có class
`expandable`** — đo trên game: chính class đó làm header hỏng (§2.M phần 1).
Nút góc chỉ hiện khi trang không có `.menu_slots`. Từ 03/10 cửa sổ cũng nhớ
đang mở hay đóng qua các lần tải trang, lần đầu thì mở (§2.M phần 2).

**2.4 xong (28/09, §2.G).** Footer có task đang chạy, độ dài queue, số tàu
rảnh (thương thuyền + freighter) và action point (`setTransferInfo`).

**2.6–2.8 nằm ở board Empire Overview**, nên chờ câu hỏi 2 ở mục 6. **04/10:
người dùng trả lời "có"** (§2.T phần 1): **2.6 xong** (icon ↻ xoay khi đồng
bộ, §2.T phần 2), **2.8 xong ở mức rút gọn** (tooltip trên số tồn kho — phần
còn lại board đã có, §2.T phần 7), **2.7 chỉ làm khi có lỗi cụ thể** (nháy,
mất vị trí cuộn).

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

| #    | Tính năng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Build       | Cần gì trước                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------- |
| A ✅ | **Nút ±500 / +1k / +5k / +50k trên form transport.** Rẻ nhất trong bảng, dùng mỗi lần gửi tay. `tpl/transport-buttons.ejs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | cả hai      | —                            |
| B ✅ | **Xem và sửa queue.** `TaskQueue` đã có `removeById` / `replaceById` / `moveToBack` dựa trên id — đúng để sửa khi đang chạy. UI hiện tại là **một dòng text** (`describeCurrentTransfer`). Không xem được còn bao nhiêu lệnh, không xoá được lệnh sai, không đổi thứ tự. API có rồi, chỉ thiếu mặt.                                                                                                                                                                                                                                                                                                                          | cả hai      | —                            |
| C ✅ | **Cảnh báo hết rượu.** `empireStore` đã mang `wineCurrent` + `wineConsumption` mọi town → "còn mấy giờ" là phép tính trên dữ liệu đang có. Tô đỏ town dưới ngưỡng.                                                                                                                                                                                                                                                                                                                                                                                                                                                           | cả hai      | —                            |
| D ✅ | **Chỉ báo kho đầy.** Sọc chéo đỏ/cam trên progress bar khi chạm trần. Thuần CSS, bê gần nguyên từ `css/empire-resources.css`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | cả hai      | —                            |
| E ✅ | **Nút nâng cấp nhanh ngay trong tab Build.** Ta có tab Build nhưng phải mở từng thành phố mới nâng được. `js/helper/buildingUpgrade.js` + `tpl/dummy/empire/other/building.ejs` **✅ 04/10 (§2.T phần 6):** nút ▲ ở ô `upgradable`, gửi thẳng link của nút Upgrade lấy từ view công trình; mỗi lần bấm lưu response cho Bug Report. **04/10 tối (§2.V):** người dùng thử — ô không chuyển sang đang nâng cấp; sửa bằng tải lại town sau khi thành công, chưa thử lại.                                                                                                                                                        | cả hai      | Phase 1                      |
| F ⬜ | **Kéo-thả chuyển tài nguyên giữa các thành phố.** Kéo một dòng town thả lên town khác → mở form transport điền sẵn. `js/page/modules/empire/resources.js:220` **Người dùng 04/10: không làm lúc này** (board đã có nút transport mỗi hàng; giá trị thêm thấp).                                                                                                                                                                                                                                                                                                                                                               | cả hai      | Phase 1                      |
| G ⬜ | **Kéo-thả điều quân / hạm đội.** Tương tự F nhưng cho tab Army. **Người dùng 04/10: không làm lúc này.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | cả hai      | Phase 1, F                   |
| H ✅ | **Khoá đồng bộ giữa nhiều tab.** Hiện **chưa có gì** ngăn hai task runner ở hai tab cùng lái một tài khoản và gửi trùng. `js/helper/syncLock.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | cả hai      | —                            |
| I ⬜ | **Tab Espionage.** Số điệp viên rảnh theo thành phố, đang phái đi đâu, mục tiêu. Ta không có gì tương đương. `js/page/modules/empire/espionage.js` **Người dùng 04/10: không làm lúc này.**                                                                                                                                                                                                                                                                                                                                                                                                                                  | cả hai      | Phase 1                      |
| J ✅ | **Thông báo desktop**: xây xong, sắp xong, transport đã tải / đã đến / đã về, tuyển quân xong. Đây là thứ biến script thành công cụ chạy nền thật sự. **✅ 04/10 (§2.T phần 5):** 4 loại — xây xong, tàu tới, rượu sắp hết, task bị bỏ — mỗi loại một checkbox; `Notification` của trang, chỉ khi tab còn mở. Chưa thử trên game.                                                                                                                                                                                                                                                                                            | xem ghi chú | Phase 1                      |
| K ✅ | **Cấp công trình hiện ngay trên city view** — khỏi rê chuột từng cái. `option.city_details` **✅ 04/10 (§2.T phần 4):** nhãn `12` / `12→13` trên mỗi công trình. Chưa thử trên game.                                                                                                                                                                                                                                                                                                                                                                                                                                         | cả hai      | —                            |
| L ⬜ | **Chọn tàu chở tự động cho Barbarian Village.** Ta mới _hiển thị_ số tàu cần (theo sức chứa merchant ship đã Calibrate từ §2.F, trước đó hard-code 520); họ _chọn_ luôn, dùng đúng cấp nâng cấp Workshop. **Người dùng 04/10: làm khi có capture** form tấn công Barbarian Village.                                                                                                                                                                                                                                                                                                                                          | cả hai      | —                            |
| M ⬜ | **Tìm đảo theo tham số ở world view.** `js/page/modules/worldmap-islandSearch.js` **Người dùng 04/10: không làm lúc này.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | cả hai      | —                            |
| N ⬜ | **Chi tiết đảo ở island view** — action point, chủ tàu, thông tin thành phố/mỏ. **Người dùng 04/10: không làm lúc này.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | cả hai      | —                            |
| O ⬜ | **Ghi chú (notes).** Lưu trong IndexedDB theo server. `js/page/modules/notes.js` **Người dùng 04/10: chưa cần** (game đã có sổ ghi chú; O không tự động hoá gì).                                                                                                                                                                                                                                                                                                                                                                                                                                                             | cả hai      | —                            |
| P ⬜ | **Chặn phá nhầm thuộc địa không di dời được.** Một hộp xác nhận, tránh mất trắng một thành phố. **Người dùng 04/10: làm khi có capture** màn phá thuộc địa (nút và form).                                                                                                                                                                                                                                                                                                                                                                                                                                                    | cả hai      | —                            |
| Q ⬜ | **Nút trả lời nhanh / xử lý hiệp ước trong Diplomacy.** **Người dùng 04/10: không làm lúc này.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | cả hai      | —                            |
| R ◐  | **Kiểm tra bản mới.** Ta không có cơ chế cập nhật nào — Tampermonkey cần `@updateURL`/`@downloadURL`, extension cài tay thì không có gì. **◐ 04/10 (§2.T phần 3):** bỏ `CheckForUpdates` của board — nó trỏ tới script gốc trên greasyfork (id 764). Kênh cập nhật riêng cần URL công khai: chờ người dùng.                                                                                                                                                                                                                                                                                                                  | cả hai      | —                            |
| S ✅ | **Auto Wine: làm tròn lượng gửi theo sức chứa tàu.** `distributeWine` chia tới từng đơn vị, nên một chuyến 621 rượu tốn 2 thương thuyền (620/tàu trên server đang test). Làm tròn theo bội số của `ship-capacity.ts` để đỡ tốn tàu, nhất là khi tàu rảnh đang thiếu; phần dư giữ lại town nguồn. **✅ 04/10 (§2.S phần 1, commit `b2e9084`):** phần ≥ 1 tàu làm tròn xuống theo tàu nguyên; phần < 1 tàu gửi nguyên.                                                                                                                                                                                                         | cả hai      | 2.A                          |
| T ✅ | **Auto Wine: tính rượu tiêu hao trong lúc chở.** Tới lúc hàng cập bến, town nhận đã uống thêm `consume × thời gian di chuyển`, nên mức giờ thực tế thấp hơn `targetHours`. Cần thời gian di chuyển giữa hai town — Send Resources hiện chưa đọc con số này ở đâu cả. **✅ 04/10 (§2.S phần 2, commit `b2e9084`):** thời gian bốc hàng + đi biển ghi theo tuyến khi gửi thật; Auto Wine chia theo tồn kho lúc tàu tới.                                                                                                                                                                                                        | cả hai      | 2.A                          |
| U ◐  | **Chi phí và thời gian nâng cấp đúng với game.** Đề xuất 29/09 là công thức; **01/10 đổi hướng: giữ bảng `Constant`, nạp lại số của chính game** (trang Help > building details). Đã nạp chi phí, thời gian, hiệu ứng và `maxLevel` logic; công thức giảm giá đã áp (tối đa 64%). **03/10:** thời gian tính thêm buff server và Chronos' Forge, làm tròn tới giây (§2.M phần 3). Còn: cấp vượt quá số cấp trang Help liệt kê. Ghi chú về U bên dưới. **04/10 (§2.U):** thêm 704 cấp > 50 từ trang Help của s303 (thời gian × 2, chi phí ÷ 0,86). Còn thiếu: 5 công trình không có trong s303 và các cấp quá cửa sổ đã crawl. | chỉ board   | nguồn số cho cấp > 50        |
| V ◐  | **Hiệu ứng của research tính đúng với game.** Người dùng đề xuất 01/10, bốn điểm: giảm chi phí xây dựng, giảm chi phí vàng cho scientist, dân số tối đa, hài lòng. Hiện trạng: ghi chú về V bên dưới.                                                                                                                                                                                                                                                                                                                                                                                                                        | chỉ board   | chi tiết (người dùng sẽ ghi) |

**Đã làm: A, B, C, D, E, H, J, K, S, T; R ở mức tối thiểu.** D và H ghi ở
§2.G; S và T ở §2.S; E, J, K, R ở §2.T. **Người dùng chọn 04/10** (câu hỏi
3): P, L làm khi có capture; F, G, I, M, N, Q không làm lúc này; O chưa cần.

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

**Ghi chú về U (chi phí và thời gian nâng cấp).**

**Cập nhật 01/10 — đã nạp số của game vào `Constant.BuildingData`.** Commit
`c38dca4` (nút crawl `6ed66c6`), chưa push, chưa thử trên game. `dist/` do
người dùng build lúc 01/10 02:23 đã có (đã grep: số mới của Academy, trần 50%
trong `modelWineConsumption`, nút Crawl Building).

- **Nguồn.** Wiki (fandom) đã cũ; game đổi cả đường cong chi phí (3.795/3.900 ô
  lệch, nhiều ô lệch trên 100%). Số mới lấy từ dialog Help > building details
  của game (`?view=buildingDetail&buildingId=N&helpId=1`), server `s800-en`,
  bằng nút tạm **Crawl Building** trong nhóm Data của panel Send Resources
  (`send-resources/features/building-help-crawler.ts` — gỡ khi xong việc). 33
  file thô, mỗi công trình một file, ở `docs/wiki/building-help-<class>-<id>.json`;
  `docs/wiki/mapping.txt` là bảng icon → tài nguyên (người dùng cung cấp). Class
  của 33 công trình trùng đúng 33 key của `BuildingData`, `buildingId` cũng trùng.
- **Đã nạp:** `wood`/`wine`/`marble`/`glass`/`sulfur` (crystal của game =
  `glass`), `time`, `maxLevel`, và các field hiệu ứng đã có sẵn: `academy.maxScientists`,
  `warehouse.capacity`, `dump.capacity`, `tavern.wineUse`/`basicBonus`/`wineBonus`,
  `museum.basicBonus`, `port.loadingSpeed`. Không đụng: `tavern.wineUse2`
  (server `s202`), `townHall.actionPointsMax` (game không có cột này). Các cột
  hiệu ứng khác của game (units "allows:", Diplomacy Points, Priests, Loading
  Speed của Trading Post...) không có field tương ứng nên chưa lấy.
- **Thời gian giờ là bảng, không còn công thức.** `time` là mảng giây theo cấp
  (index = cấp hiện tại, như chi phí); `getUpgradeCost` đọc `time[level] || 0`.
  Số lấy từ chữ game hiển thị, nên từ khoảng cấp 9 chỉ chính xác tới đơn vị thứ
  hai (ví dụ `1M 22D` mất phần giờ). **Đo được, không đoán:** `1M` = 30 ngày
  (công thức chính xác của Academy khớp 10/10 cấp có tháng chỉ với 30), `1Y` =
  365 ngày (Chronos' Forge khớp 50/50 cấp với 365, lệch 5 cấp với 360).
  ✅ 04/10 (§2.P): đã sửa thành 30 ngày ở cả `core/format.ts` lẫn `empire-overview/utils.ts`.
  Trước đó: `core/format.ts` (`TIME_FACTORS`) tính `M` = 2.520.000 s ≈ 29,17 ngày
  — sai theo số đo này, chưa sửa (ngoài phạm vi).
- **✅ Giảm thời gian (03/10, §2.M phần 3).** `getUpgradeCost` tính
  `round(giây gốc × (1 − buff server) × 0,8^cấp Chronos' Forge × (1 + chính
thể))` × 1000. Buff nhập theo tài khoản trong bảng Account của Send
  Resources; Forge chỉ áp trong town của nó, trừ chính nó.
- **`maxLevel` là max logic, không phải trần của game.** Game đã bỏ giới hạn
  cấp. `maxLevel` = cấp mà hiệu ứng ngừng tăng, theo mô tả hoặc bảng của trang
  Help; không nêu thì `0` (không có max). `isMaxLevel` = `maxLevel > 0 && cấp >= maxLevel`.
  Công trình đạt max vẫn tô xám như cũ và vẫn bấm được để nâng.

  | Công trình                                                | maxLevel | Căn cứ                                                                            |
  | --------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
  | carpentering, architect, optician, fireworker, vineyard   | 50       | "reduced by 1% ... up to a maximum of 50%"                                        |
  | forester, stonemason, glassblowing, winegrower, alchemist | 70       | "increases ... by 2% ... up to a maximum of 140%"                                 |
  | palace                                                    | 20       | "an additional town" mỗi cấp, "a total of 21 towns"                               |
  | blackMarket                                               | 25       | bảng: thuế chạm sàn 1% ở cấp 25 (đơn vị cuối mở ở cấp 23)                         |
  | shrineOfOlympus                                           | 21       | bảng: "Blessed Cities" đạt 21 ở cấp 21 rồi đứng yên                               |
  | còn lại                                                   | 0        | mô tả không nêu. Sea Chart Archive nói trần 90% nhưng không nói mỗi cấp bao nhiêu |

- **◐ 04/10 — đã thêm cấp > 50 từ trang Help của s303 (§2.U):** 704 cấp ở 28
  công trình, thời gian × 2 (s303 xây nhanh gấp đôi), chi phí ÷ 0,86 (s303
  hiển thị sau 14% research của tài khoản). Đo trên các cấp trùng với s800:
  696/696 ô thời gian, 1.640/1.640 ô chi phí. Đoạn dưới là hiện trạng trước
  04/10, giữ lại; phần còn thiếu nay ở §2.U phần 4.
- **⏸ (trước 04/10) Còn thiếu — cấp vượt quá số cấp trang Help liệt kê** (51+; Palace và
  Governor's Residence 31+). Trang Help chỉ in 50 (hoặc 30) cấp dù game không
  giới hạn. Người dùng chọn **để trống**, sẽ tìm cách bổ sung sau. Hệ quả hiện
  tại: chi phí và thời gian của các cấp đó ra `0` (`|| 0` có sẵn), nên công
  trình ở đó bị tô "có thể nâng" và tooltip ghi 0; sức chứa warehouse/depot và
  `basicBonus` của tavern/museum ở các cấp đó tính `0` (đã thêm `|| 0` để không
  ra `NaN`). Trước đây bảng cũ có số tới cấp 61–87 tuỳ công trình.
- **✅ Công thức giảm giá (01/10, người dùng cung cấp).** Bảng là **số gốc**
  của game; `getUpgradeCost` trừ một lần, cộng dồn, không nhân chồng: Pulley
  2% + Geometry 4% + Spirit Level 8% + công trình giảm giá 1%/cấp **tối đa 50%**
  (`REDUCTION_BUILDING_MAX_PERCENT` trong `core/ikariam/model.ts`) — tổng tối đa
  64%. Carpenter → wood, Wine Press → wine, Architect → marble, Optician →
  crystal, Firework Test Area → sulfur. Làm tròn giữ `Math.round` như cũ
  (người dùng chưa nói cách làm tròn; một điểm trong bảng wiki cũ — Academy cấp
  1, Pulley: 64 × 0,98 = 62,72 hiện 62 — gợi ý game làm tròn xuống, chưa kiểm).
  Đã chạy thử trên Academy cấp 50: 0,86 / 0,76 (Carpenter 10) / 0,36 (Carpenter
  50 và 60). Chưa có test trong repo. Wine Press giảm **rượu tiêu thụ** của
  Tavern cũng đã có trần 50% (01/10) — xem "Phạm vi của 5 công trình giảm giá"
  trong ghi chú về V.
- **Đã thử công thức, bỏ theo yêu cầu.** Từ số game, Academy khớp chính xác:
  wood `floor(5·L·e^(0.292757·L)) + 28` (50/50), crystal
  `floor(5·L·e^(0.32156·L)) + 100` (46/46), thời gian
  `floor(105·L·e^(k·L)) − 98` với k ≈ 0.15617. Có thể hữu ích nếu cần suy ra
  cấp > 50.

Hiện trạng trước 01/10, đọc từ code ngày 29/09 (giữ lại để đối chiếu):

- **Chi phí là bảng.** `Constant.BuildingData[tên].wood / glass / marble /
sulfur / wine` (`empire-overview/constants.ts`, từ dòng 1285) là mảng số
  theo từng cấp, hoặc `0` cho loại không cần. `getUpgradeCost`
  (`empire-overview/models/building.ts:114-194`) lấy phần tử ở
  `level = _level + isUpgrading`; cấp vượt độ dài mảng thì `|| 0`, tức **chi
  phí 0, không báo gì**.
- **Giảm giá cộng dồn rồi làm tròn:** nghiên cứu Pulley −2%, Geometry −4%,
  Spirit Level −8%, cộng thêm −1%/cấp của công trình giảm giá tương ứng
  (Carpenter → wood, Architect → marble, Optician → glass, Firework Test Area
  → sulfur, `vineyard` → wine). Phép cộng dồn và việc `vineyard` giảm chi phí
  wine đều là **chép từ bản gốc, chưa kiểm** trên game.
- **Thời gian đã là công thức, nhưng tham số cứng:**
  `round(a / b · c^(level+1) − d) · 1000 · (1 + GovernmentData[chính thể].buildingTime)`,
  với `time: { a, b, c, d }` riêng cho từng công trình. Tooltip chia thêm 3
  cho server tốc độ, nhưng chỉ nhận ra `s201`/`s202` (cứng trong
  `render.ts`, `serverTyp`).
- **Dùng ở ba chỗ:** tooltip của tab Build (`render.ts`,
  `getBuildingTooltip`), tô màu "đủ tài nguyên để nâng" (`isUpgradable`,
  `render.ts:2785`), và trừ tài nguyên dự kiến khi bấm nâng
  (`subtractUpgradeResourcesFromCity`). Send Resources và Auto Build không
  dùng.

**Đã chọn (29/09): hướng 1, công thức.** Người dùng có sẵn nguồn công thức và
sẽ cung cấp sau; chưa bắt đầu cho tới khi có. Hướng 2 ghi lại để tham khảo.

Hai hướng đã cân nhắc:

1. **Công thức theo từng công trình** (ý của người dùng). Cần một nguồn công
   thức đáng tin: nguồn nào, dạng gì (ví dụ `a · b^level` làm tròn), và hệ
   số lấy ở đâu. Kiểm chứng: so với bảng hiện có ở **mọi** cấp (bảng là dữ
   liệu duy nhất đang có), rồi so vài công trình với số game hiển thị.
2. **Đọc số thật từ game**, như IkaEasy V4
   (`js/helper/buildingUpgrade.js`): gọi ajax view của công trình, đọc
   `#buildingUpgrade ul.resources > li`. Số đó đã trừ mọi giảm giá nên không
   cần tự tính, nhưng tốn một request mỗi công trình (IkaEasy cache theo
   `thành phố:vị trí:cấp`). IkaEasy chỉ đọc chi phí, không đọc thời gian;
   thời gian ở view đó **chưa được capture**. Có thể kết hợp: số thật khi đã
   đọc, công thức khi chưa.

Việc này nằm ở board, nên cũng chạm câu hỏi 2 ở §6. Trước khi làm, cần một
capture `#buildingUpgrade` (chi phí + thời gian) của vài công trình ở cấp đã
biết, để có số thật mà đối chiếu.

**Ghi chú về V (hiệu ứng của research).** Người dùng sẽ cải thiện bốn điểm
dưới đây; **chi tiết người dùng sẽ ghi sau — chưa làm gì cho tới khi có.**
Hiện trạng đọc từ code ngày 01/10, bản port giống hệt legacy:

- **Board chỉ biết research nào đã nghiên cứu, không biết hiệu ứng của nó.**
  `parseResearchAdvisor` (`empire-overview/game-api.ts`) chỉ chạy khi người
  chơi tự mở Research Advisor, đọc `currResearchType` trong JSON
  `new_js_params` / `load_js.params` của `updateTemplateData`, và từ mỗi mục chỉ
  lấy id (`aHref`), level (`"(N)"` trong tên → `N − 1`, không có thì
  `liClass === "explored"` → 1) và tên. Lưu ở `globalData._research.topics`,
  đọc bằng `getResearchTopicLevel(id)`. JSON đó còn gì khác thì **chưa capture**.
- **Mọi hiệu ứng là số cứng trong code:**

  | Điểm cần cải thiện               | Research                                                                                         | Code hiện tại                                                        | Ở đâu                                              |
  | -------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------- |
  | ✅ Giảm chi phí xây dựng (01/10) | Pulley −2%, Geometry −4%, Spirit Level −8% + công trình giảm giá tối đa 50%                      | cộng dồn, tối đa 64%, trừ trên số gốc — ghi chú về U                 | `models/building.ts`, `getUpgradeCost`             |
  | Giảm chi phí vàng cho scientist  | Letter Chute                                                                                     | `6 + GovernmentData.researcherCost − LetterChute × 3` vàng/scientist | `models/city-research.ts`, `_researchCostModifier` |
  | Dân số tối đa                    | Well Construction +50, Utopia +200, Holiday +50, Economic Future +20/cấp                         | cộng thêm vào dân số tính từ Town Hall                               | `models/city.ts`                                   |
  | Hài lòng                         | Holiday (2080) ×25, Economic Future (2999) ×10, Well Construction (3010) ×50, Utopia (2120) ×200 | cộng vào `r.research`                                                | `models/city.ts`, `_getSatisfactionData`           |

**Phạm vi của 5 công trình giảm giá** (người dùng cung cấp 01/10). Mỗi công
trình giảm 1%/cấp, tối đa 50%, cho **mọi** chỗ trong town dùng tài nguyên của
nó, không chỉ xây dựng. Trần 50% là `REDUCTION_BUILDING_MAX_PERCENT` trong
`core/ikariam/model.ts`, dùng chung cho cả hai script.

| Công trình         | Giảm    | Áp cho                                                                 | Code hiện tại                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carpenter          | wood    | Building, Units (Generals), Ships (Generals)                           | Building ✅. Units/Ships: code không tính chi phí quân và tàu                                                                                                                                                                                                                                                                                     |
| Architect          | marble  | Building                                                               | ✅                                                                                                                                                                                                                                                                                                                                                |
| Optician           | crystal | Building, Units, Ships, Improvements (Workshop), Experiments (Academy) | Building ✅. Còn lại: code không tính                                                                                                                                                                                                                                                                                                             |
| Firework Test Area | sulfur  | Building, Units, Ships                                                 | Building ✅. Units/Ships: code không tính                                                                                                                                                                                                                                                                                                         |
| Wine Press         | wine    | Building, Units, Tavern                                                | Building ✅. **Tavern ✅ 01/10**: trần 50% ở `modelWineConsumption` (`core/ikariam/model.ts` — Auto Wine, town cache, span sản lượng) và 3 chỗ trong `empire-overview/models/city.ts` (`updateCityDataFromAjax`, `tavernlevel`, `_getSatisfactionData`, qua `winePressSavingPercent`). Trước đó tính `cấp/100` không trần. Units: code không tính |

"Code không tính" nghĩa là không có gì để sửa hôm nay: `Constant.UnitData` chỉ
có `baseTime` và `baseCost`, không có chi phí tài nguyên của quân/tàu, và code
không có phần nào về cải tiến Workshop hay thí nghiệm Academy. Nếu sau này
thêm, phải áp giảm giá theo bảng này.

**Ghi chú về J (thông báo).** **✅ Làm 04/10 (§2.T phần 5).** **Sửa 04/10:** câu "extension đã khai `"permissions": ["notifications", "alarms"]`" dưới đây **sai** — manifest (`build/build-extension.mjs`) chỉ có `host_permissions`; có lẽ nhầm sang manifest của IkaEasy. Bản đã làm dùng `Notification` của trang cho cả hai bản build. Nguyên văn cũ: ~~Extension đã khai `"permissions": ["notifications", "alarms"]` nên làm được đầy đủ, kể cả khi tab game không ở trước mặt.~~ Bản userscript chỉ dùng được `Notification` API của trang và cần người dùng cấp quyền — nhắc được khi tab còn mở, không nhắc được khi đã đóng. Nên coi đây là tính năng **ưu tiên cho bản extension**, userscript làm mức rút gọn.

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
✅ TRƯỚC HẾT   §2.A                   cảng biển — sửa 04/10 (§2.O phần 4), người dùng thử: tạm ok (§2.Q)

✅ Phase 1   1.1 → 1.5              nền móng AJAX (1.4 xong 02/10, §2.L)
✅ Phase 2   2.1 → 2.5, 2.6, 2.8    cửa sổ dùng chung + panel; board: ↻ đồng bộ, tooltip số tồn kho (04/10, §2.T)
✅ Đợt rẻ    A, B, C                nút transport, xem queue, cảnh báo rượu
✅ 28/09     D, H, 2.4, log backToCity   (§2.G)
✅ 02/10     §2.K, §2.L             ↑/↓, Start Auto Wine, tồn kho, runner theo timer, chuỗi, 1.4
✅ 03/10     §2.M                   mục menu trái (không `expandable`); panel nhớ mở/đóng; thời gian xây: buff server (✎/✓), Chronos' Forge, làm tròn giây — commit `7ed3a85`
✅ 03/10     §2.N, §2.D             Bug Report lưu file JSON (+ gameData, xoá sau khi lưu); `createPopup` đặt tên; hết báo nhầm `[tên, null]` — commit `32fe3ba`
✅ 03–04/10  §2.O                   runner bỏ task lỗi được (console.error); câu lỗi không số giây; Bug Report kèm log; cảng biển — commit `32fe3ba`
✅ 04/10     §2.P                   bảy việc nhỏ (nhãn, Close, needingShip, tháng 30 ngày, ▶, Warning wine, Space) — commit `32fe3ba`
✅ 04/10     §2.R                   queue và bảng Transport Settings tối đa 10 hàng rồi cuộn; nút Close của Auto Build Settings có lại — commit `32fe3ba`
✅ 04/10     §2.S                   S (tàu nguyên), T (rượu uống trên đường), bốn việc nhỏ — commit `b2e9084`; `barbarian.ts` của người dùng — `3f8a51b`
✅ 04/10     §2.T                   2.6 (↻ đồng bộ), R (bỏ kiểm tra bản mới trỏ nhầm), K (cấp trên city view), J (thông báo desktop), E (▲ nâng cấp nhanh + trace cho Bug Report), 2.8 (tooltip số tồn kho) — commit `c78b49e`
✅ 04/10     §2.U                   U: 704 cấp > 50 từ s303 (thời gian × 2, chi phí ÷ 0,86) — commit `c78b49e`
✅ 04/10 tối §2.V                   nút ▲: tải lại town sau khi nâng cấp thành công để ô chuyển sang đang nâng — commit `cefcc92`, có trong `dist/` 21:21
✅ 04/10 tối §2.W                   extension Chrome: pattern loại trừ diễn đàn chuyển sang `exclude_globs` (manifest bị Chrome từ chối từ `e551bb8`) — commit `9c363f7`, `dist/extension/` đã build lại

✅ ~~Chờ capture form gửi~~: §2.A — có từ Bug Report 03/10 23:04 (§2.O phần 4)
✅ ~~Chờ người dùng thử lại~~: §2.E lỗi 3–6, §2.F → §2.P, U/V — người dùng thử 04/10 với `dist/` 09:09: tạm ok (§2.Q)
✅ ~~Chờ log~~:            §2.O phần 1 — đổi town sang M-Eretria: người dùng báo tạm ok 04/10 (§2.Q); nguyên nhân gốc chưa từng được xác định
✅ ~~Chờ code của game~~: §2.D tham số `createPopup` — xong 03/10 (§2.N phần 2)
⬜ Lượt review sau:        thử trên game thật các mục §2.D; chuỗi còn sót ngoài danh sách §2.D (§2.L phần 4)
⬜ Chờ người dùng thử:     §2.R → §2.V trên game (cài lại cả hai userscript từ `dist/` 21:21); riêng E: một lần thành công (ô phải tự chuyển sang đang nâng), một lần bị từ chối, rồi Bug Report
⬜ Chờ người dùng thử:     §2.W — load lại `dist/extension` trong Chrome (tắt hai userscript trước); bản extension chưa từng chạy trên game
✅ ~~Chờ câu hỏi 2~~:      trả lời 04/10 — 2.6 ✅, 2.8 ✅ (rút gọn); ⏸ 2.7 chỉ khi có lỗi cụ thể
✅ ~~Chờ câu hỏi 3~~:      trả lời 04/10 — E, J, K ✅; R ◐; O chưa cần; F, G, I, M, N, Q không làm lúc này
⏸ Chờ capture:            P (màn phá thuộc địa), L (form tấn công Barbarian Village)
⏸ Chờ người dùng:         R — có đặt bản build ở URL công khai (@updateURL) không
◐ U (01/10, 04/10):        số game trong Constant, công thức giảm giá, cấp > 50 từ s303; ⏸ phần còn thiếu ở §2.U phần 4
◐ V (01/10):               giảm chi phí xây dựng xong; ⏸ vàng scientist, dân số tối đa, hài lòng — người dùng sẽ ghi; ghi chú về V ở §4.2
✅ ~~Ghi lại, chưa cần làm: S, T (Auto Wine)~~ — làm 04/10 (§2.S)
```

**§2.A đi trước mọi thứ khác.** Thêm tính năng lên một tầng gửi hàng không chạy
được thì không đo được gì, và mọi thử nghiệm thủ công đều vướng phải nó.
**04/10:** đã sửa; người dùng thử trên game: **tạm ok** (§2.Q). Trước đó: việc đi trước là **thử nó trên game**
(một lượng nhỏ), vì S, T và mọi thử nghiệm Auto Wine đều phụ thuộc nó.

Không còn việc nào "làm được ngay, không phụ thuộc gì": 1.4 xong 02/10
(§2.L). D, H và nửa sau của 2.4 đã xong ngày 28/09 (§2.G). **04/10 tối:**
việc kế tiếp là **người dùng cài lại từ `dist/` 21:21 và thử §2.R → §2.V
trên game** (E kèm Bug Report), và **load lại extension Chrome** (§2.W);
P, L chờ capture; R chờ câu hỏi 5 ở §6; V chờ người dùng ghi chi tiết.

**Hai việc phát sinh** (việc thứ nhất xong 02/10, §2.L phần 3):

- ~~**Runner chạy mọi loại task bất kể switch nào đang bật.**~~ **✅ 02/10:**
  runner nhận `allowsType`, mỗi timer chỉ cho chạy loại task của nó. `syncRunnerToFlags`
  quyết định runner _có chạy không_, không quyết định nó _được chạy gì_. Bật
  Build Start Timer là chạy luôn cả shipment đang xếp hàng, trong khi nút
  Transport vẫn ghi "Start Timer". Comment ở `app.ts` liệt kê đúng triệu chứng
  này như một lỗi đã sửa — nhưng bản sửa chỉ đổi _ai được start runner_.
- **`onDrain` không reset `isAutoBuildStart`.** Khi queue cạn, `setAutoStart(false)`
  tắt cờ Transport nhưng cờ Build giữ nguyên `true` và nhãn nút không đổi. Nút
  Build ghi "Stop Timer" trong khi runner đã dừng, và phải bấm hai lần mới chạy
  lại được. **◐ 26/09:** sửa khi cấu hình Build rỗng (timer tự tắt, §2.E lỗi
  2). Còn việc trong cấu hình thì cờ cố ý giữ `true` để keep-alive chạy lượt
  sau, như bản gốc. Việc thứ nhất (runner chạy mọi loại task) đã kiểm tra
  26/09 và **không** phải nguyên nhân panel Transport tự mở; đã sửa 02/10.

---

## 6. Câu hỏi còn mở

1. ~~**Chạy 1.1 trước chứ?**~~ **Đã xong.** Probe chạy trên game thật cho kết
   quả: `Content-Type` là `text/html` nhưng body là JSON (nên không bao giờ
   được kiểm theo header), payload có mang `actionRequest`, và một request
   `fetchTown` mất 328–974 ms so với 2367 ms cho mỗi lần đổi town bằng cách đi
   bộ. 1.2 được viết dựa trên các số đo này.
2. ~~**Phase 2 có bao gồm board Empire Overview không, hay chỉ panel Send
   Resources?**~~ **Đã trả lời 04/10: có** — 2.6 trước, 2.8 sau, 2.7 chỉ khi có
   lỗi cụ thể (§2.T phần 1). Câu hỏi gốc: Board đã dùng jQuery UI tabs và kéo thả sẵn; đụng vào nó là đụng
   10.767 dòng code port cơ học, rủi ro cao hơn hẳn so với làm lại panel.
3. ~~**Mục 4.2 lấy hết hay lấy một phần?**~~ **Đã trả lời 04/10:** R (tối
   thiểu) và K trước, rồi O, J, E; P, L khi có capture; F, G, I, M, N, Q không
   làm lúc này; sau đó O "chưa cần" (§2.T phần 1). Câu hỏi gốc: 22 mục (A–V); A, B, C, D, H đã xong,
   S và T chỉ ghi lại, U và V do người dùng đề xuất. Bạn đánh dấu mục nào cần,
   tôi làm theo thứ tự đó.
4. ~~**U: công thức lấy từ đâu, hay đọc số thật từ game?**~~ **Đã trả lời
   29/09:** công thức; người dùng có sẵn nguồn và sẽ cung cấp sau. **Đổi
   01/10:** giữ bảng `Constant`, nạp số thật từ trang Help của game (§4.2,
   ghi chú về U). **04/10:** thêm cấp > 50 từ trang Help của s303 (§2.U).
5. **R: có đặt bản build ở một URL công khai (ví dụ GitHub) để dùng
   `@updateURL` / `@downloadURL` không?** Đó là việc đưa ra ngoài, người dùng
   quyết. Cho tới khi có câu trả lời, hai script không có kênh cập nhật; kiểm
   tra cũ trỏ nhầm đã bỏ (§2.T phần 3).
