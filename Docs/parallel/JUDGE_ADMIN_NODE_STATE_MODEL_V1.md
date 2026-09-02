# Judge Admin Node State Model V1

`desiredState` is durable operator intent (`ONLINE`, `DRAINING`, `OFFLINE`); `observedState` is runtime observation and may be `UNHEALTHY`. `incarnation` identifies the registered Worker process and `controlVersion` guards stale mutations. Scheduling requires desired ONLINE, observed ONLINE/BUSY, fresh heartbeat, compatible capability and capacity. Completion changes load/observed state only: DRAINING/OFFLINE intent is never promoted to ONLINE. Enable changes intent only and never creates heartbeat or incarnation.
