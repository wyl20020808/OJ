# Web Runtime Backend Reproduction Cases V2

These cases contain no credentials, cookies, session tokens, or resume tokens.

## REPRO-WEB-01 Contest local draft

1. Log in as a regular test account.
2. Open `/contests/new`.
3. Enter a title and valid start/end values.
4. Submit `保存本地未提交草稿`.
5. Observe no `POST /api/contests` request; reload and the draft is gone.

## REPRO-WEB-02 Contest actions unavailable

1. Open `/contests` and a published contest.
2. Observe `报名比赛` disabled.
3. Open the contest settings/submissions routes.
4. Observe integration notices instead of typed backend calls.

## REPRO-WEB-03 Friend controls unavailable

1. Log in as a regular account.
2. Open `/messages` and choose `添加好友`.
3. Observe disabled search/input controls.
4. Choose `新的朋友`; accept/reject controls are disabled.

## REPRO-WEB-04 Message composer unavailable

1. Establish a friendship through the composed API or a seeded fixture.
2. Open `/messages` and select the conversation.
3. Observe disabled textarea and send button.
4. No `GET .../messages`, `POST .../messages`, or `POST .../read` is issued by the Web component.

## REPRO-WEB-05 Notification read controls unavailable

1. Trigger a friend-request or direct-message notification through the composed API.
2. Open `/notifications` and the header bell.
3. Observe list/preview placeholder behavior and no mark-read action.

## REPRO-BACKEND-01 Social/messaging authoritative flow

1. Create two unique regular accounts A and B with non-production test data.
2. Log in each in separate HTTP cookie sessions.
3. A searches B, sends one request; B lists incoming and accepts.
4. Verify both `/api/friends` lists contain one relationship.
5. Both call `POST /api/conversations/direct` for the other user; IDs match.
6. A sends one message with a unique client correlation ID.
7. B lists messages and unread count (`1`), then marks read (`204`) and verifies unread `0`.
8. B lists notifications and unread count; restart API; log in again and verify friend/conversation persistence.

Observed runtime: request `201`, accept `200`, duplicate request `409 ALREADY_FRIENDS`, direct conversation idempotent, message `201`, recipient message count `1`, unread `1 -> 0`, notifications `200`.

## REPRO-BACKEND-02 Standings upstream boundary

1. Open a public composed contest detail.
2. Request `GET /api/contests/:id/standings`.
3. Observe `503` with `available:false` and reason `SCORING_ENGINE_NOT_INTEGRATED`.
4. Web must retain the unavailable state and must not render synthetic rows.
