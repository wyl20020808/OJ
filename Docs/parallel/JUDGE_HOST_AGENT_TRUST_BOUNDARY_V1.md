# Judge Host Agent Trust Boundary V1

The local Host Agent is a loopback-only, Judge-Service-authenticated process boundary. It accepts lifecycle requests only for fixed, enabled templates. It never accepts executable paths, shell text, arguments, or environment values from Product/Web. Process records bind node ID, launch nonce, generation, PID, start time and incarnation; stop verifies the owned record before signaling. Browser code never contacts the agent or holds its credential.
