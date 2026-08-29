package fixture

import (
	"context"
	"github.com/ojplatform/judge-worker/internal/protocol"
	"testing"
	"time"
)

func TestDeterministicFixtures(t *testing.T) {
	e := Executor{Step: time.Millisecond}
	for _, id := range []string{"FX-SUCCESS", "FX-RETRYABLE", "FX-TERMINAL"} {
		a, _, _ := e.Run(context.Background(), id)
		b, _, _ := e.Run(context.Background(), id)
		if a != b {
			t.Fatalf("%s not deterministic", id)
		}
	}
	if a, _, _ := e.Run(context.Background(), "FX-SUCCESS"); a != protocol.SafeFixtureSucceeded {
		t.Fatal(a)
	}
}
func TestSlowCancellation(t *testing.T) {
	ctx, c := context.WithCancel(context.Background())
	c()
	o, _, _ := (Executor{Step: time.Millisecond}).Run(ctx, "FX-SLOW")
	if o != protocol.Cancelled {
		t.Fatal(o)
	}
}
