# Communication Center Navigation Contract V1

The shell exposes no standalone `Communications` primary-navigation item. The
bell is the communication-center entry and shows only the backend-owned
notification unread count from `/api/notifications/unread-count`.

Its preview uses the existing notification source and its action reaches the
existing message workspace. Notification read operations continue to call the
existing Notification backend. Direct messages and notifications retain their
own source tables and APIs; this goal does not create a duplicate aggregate or
a client-side unread counter.

Only the already-supported Notification and direct-message capabilities are
presented. No chat or system-message type is fabricated.
