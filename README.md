# FluivixEdu — AI Execution Pack V2 (P0)

Nguồn nghiệp vụ: `docs/FLUIVIXEDU_MASTER_SPEC.md` ngày 23/10/2026, bản đề xuất cần discovery/UAT trước thương mại.

## Kết quả của bộ tài liệu

- **Hai lệnh điều phối**: `prompts/PROMPT_01_WEB_ADMIN.md` (backend + tenant web + platform web) và `prompts/PROMPT_02_MOBILE_APP.md` (Expo teacher/student/guardian + tích hợp và release verification).
- **Bắt buộc ba skill thiết kế**: Taste Skill, UI UX Pro Max, Web Animation Skills; quy định triển khai, mức áp dụng và kiểm tra nguồn trong `docs/ai/09_UI_SKILLS.md` và `scripts/bootstrap_ui_skills.sh`.
- **Inventory máy đọc được**: 19 web màn hình, 9 platform route, 21 mobile màn hình, FR-P0, API endpoint catalog, 30 acceptance tests.
- **Completion dựa trên bằng chứng**: không coi UI giả/API mock, `npm run build` đơn lẻ hoặc lời tuyên bố của agent là đã hoàn thành.

## Quy trình chính xác

1. Giải nén **toàn bộ nội dung** vào root của repository FluivixEdu. Giữ nguyên mã nguồn hiện có. Nếu repo chưa tồn tại, agent sẽ khởi tạo theo SRS.
2. Chạy `python3 scripts/validate_ai_pack.py`. Nếu có lỗi, sửa bộ tài liệu trước khi code.
3. Dùng coding agent có quyền terminal, filesystem, mạng, trình duyệt Chromium, PostgreSQL/Redis Docker và Expo Android/iOS build tools. Agent cần Node 22+, Python 3.x và Chrome/Chromium cho skill, hoặc đánh dấu phụ thuộc còn thiếu.
4. Gửi **nguyên văn** `prompts/PROMPT_01_WEB_ADMIN.md` cho agent. Trong session đó agent phải bootstrap skills, audit, implement theo slice, chạy kiểm thử và lưu trạng thái.
5. Khi gate web/backend đủ điều kiện, gửi **nguyên văn** `prompts/PROMPT_02_MOBILE_APP.md` vào cùng repo. Agent phải xác minh lại skills, thiết kế role-aware app, test trên thiết bị/simulator khi có quyền và nghiệm thu tích hợp.
6. Đọc `docs/ai/08_PROGRESS.md`, `docs/ai/14_RELEASE_EVIDENCE.md` và terminal output để xác định phần đã chạy, thiếu chứng cứ, blocker.

## Phạm vi

P0 theo master spec; **không** tự mở rộng sang P1/P2. App mobile là **một app Expo, ba role**. Tenant web admin và platform admin có identity/audience tách biệt. Backend NestJS và worker dùng chung.

## File map

- `AGENTS.md`: hiến pháp kỹ thuật và thứ tự ưu tiên.
- `docs/ai/00_SCOPE.md`–`08_PROGRESS.md`: bản gốc đã được cập nhật, giữ yêu cầu/nghiệm thu.
- `docs/ai/09_UI_SKILLS.md`: cài đặt ba skill (bắt buộc), audit, cách áp dụng cho web/mobile.
- `docs/ai/10_WEB_PAGE_BLUEPRINT.md`: mọi trang web/platform, hành vi, form, quyền, kiểm tra.
- `docs/ai/11_MOBILE_PAGE_BLUEPRINT.md`: mọi màn hình Expo, navigation, state, lifecycle, role.
- `docs/ai/12_COMPONENTS_AND_MOTION.md`: components, design tokens, accessibility, motion policy.
- `docs/ai/13_BACKEND_DELIVERY.md`: DB/API/auth/queue contract & implementation order.
- `docs/ai/14_RELEASE_EVIDENCE.md`: mẫu checklist chứng cứ thực thi và bàn giao.
- `docs/ai/15_DECISION_LOG.md`: những quyết định còn thiếu và default P0 an toàn.
- `docs/ai/16_SOURCE_TO_OUTPUT_MAP.md`: mapping nghiệp vụ/API/test, kiểm soát không bỏ sót.
- `docs/ai/17_TEST_MATRIX.md`: test matrix web/mobile/backend và lệnh thực thi.
- `docs/ai/18_SKILL_SOURCE_LOCK.json`: nguồn và commit đã xác minh (snapshot 23/10/2026, **không phải kiểm tra cài đặt trong repo của user**).
- `docs/ai/19_ENV_AND_DEPLOY.md`: môi trường, cấu hình, migrations, CI và release.
- `docs/ai/20_AGENT_RUNBOOK.md`: vòng lặp agent, checkpoint, rerun, chống bỏ sót.
- `scripts/bootstrap_ui_skills.sh`: script chuẩn bị cài skill khi chạy trong repo thực tế.
- `scripts/validate_ai_pack.py`: static validation manifest/test/requirements.
- `scripts/verify_delivery.sh`: gọi các script chất lượng của repo nếu tồn tại; thiếu là FAIL, không tự giả kết quả.

## Giới hạn không thể loại bỏ bằng prompt

Hai prompt không thể cam kết tự động *production-ready*: contract API thiếu field schemas, chính sách riêng tư cần pháp chế duyệt, Apple/Google developer account, push credentials, môi trường CI, UAT thực tế, restore thử và store review. Mọi mục thiếu được ghi BLOCKED; tuyệt đối không suy đoán là PASS.

## Bản quyền / phân phối

Bộ pack chỉ chứa **liên kết và hướng dẫn sử dụng**, không sao chép nội dung của ba repository skill. Skills được cài riêng, audit và lock SHA trước khi agent sử dụng. Agent phải rà soát source/trust boundary và không chạy script tùy ý ngoài quyền đã được cấp.
