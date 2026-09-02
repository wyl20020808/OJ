# Judge Elastic Pool Autoscaling Matrix V1

Scale up is driven by pending jobs, average/P95 queue wait and unavailable schedulable capacity. Severe pressure uses the fast step. Scale down requires empty/low pending queue, low utilization for a sustained window, cooldown expiry and a node above minNodes; the node is drained, reaches zero active jobs, offlined, then stopped. Every decision records bounded reason and metrics.
