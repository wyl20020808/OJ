# Judge Host Capacity Model V1

Host capacity exposes configured and remaining Judge CPU/RAM, current allocations and maximum additional nodes for the selected template. Autoscaling reserves host CPU/RAM for the OS and control plane and blocks before physical capacity is exceeded, even when maxNodes is larger.
