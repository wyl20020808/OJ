package supervisor

import (
	"errors"
	"fmt"
	"sync"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
)

var ErrInvalidExecutionTransition = errors.New("invalid execution lifecycle transition")

// ValidExecutionTransition is deliberately explicit.  Terminal states cannot
// be moved backwards by a late child, duplicate delivery, or cancellation.
func ValidExecutionTransition(from, to model.ExecutionState) bool {
	if from == to {
		return true
	}
	allowed := map[model.ExecutionState]map[model.ExecutionState]bool{
		model.StateAccepted:         {model.StateQueued: true, model.StateClaimed: true, model.StateCancelRequested: true},
		model.StateQueued:           {model.StateClaimed: true, model.StateCancelRequested: true, model.StateCancelled: true},
		model.StateClaimed:          {model.StateCompilePreparing: true, model.StateCancelRequested: true, model.StateCancelled: true, model.StateInfraFailed: true},
		model.StateCompilePreparing: {model.StateCompiling: true, model.StateCancelRequested: true, model.StateCancelled: true, model.StateInfraFailed: true},
		model.StateCompiling:        {model.StateCompileSucceeded: true, model.StateCompileFailed: true, model.StateRawLimitEvent: true, model.StateCancelRequested: true, model.StateCancelled: true, model.StateInfraFailed: true},
		model.StateCompileSucceeded: {model.StateRuntimePreparing: true, model.StateCancelRequested: true, model.StateCancelled: true, model.StateInfraFailed: true},
		model.StateRuntimePreparing: {model.StateRunning: true, model.StateCancelRequested: true, model.StateCancelled: true, model.StateInfraFailed: true},
		model.StateRunning:          {model.StateRawCompleted: true, model.StateRawLimitEvent: true, model.StateCancelRequested: true, model.StateCancelled: true, model.StateInfraFailed: true},
		model.StateCancelRequested:  {model.StateCancelled: true, model.StateCleanupPending: true, model.StateRawLimitEvent: true},
		model.StateRawCompleted:     {model.StateCleanupPending: true},
		model.StateRawLimitEvent:    {model.StateCleanupPending: true},
		model.StateCompileFailed:    {model.StateCleanupPending: true},
		model.StateCancelled:        {model.StateCleanupPending: true},
		model.StateInfraFailed:      {model.StateCleanupPending: true},
		model.StateCleanupPending:   {model.StateCleanupVerified: true, model.StateInfraFailed: true},
	}
	return allowed[from][to]
}

// Lifecycle serializes transitions for one execution attempt.  The first
// terminal event wins; subsequent equivalent terminal events are idempotent,
// while conflicting events are rejected.
type Lifecycle struct {
	mu    sync.Mutex
	state model.ExecutionState
}

func NewLifecycle(initial model.ExecutionState) (*Lifecycle, error) {
	if initial == "" {
		initial = model.StateAccepted
	}
	if !knownExecutionState(initial) {
		return nil, fmt.Errorf("%w: unknown state %q", ErrInvalidExecutionTransition, initial)
	}
	return &Lifecycle{state: initial}, nil
}

func (l *Lifecycle) State() model.ExecutionState {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.state
}

func (l *Lifecycle) Transition(to model.ExecutionState) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !knownExecutionState(to) || !ValidExecutionTransition(l.state, to) {
		return fmt.Errorf("%w: %s -> %s", ErrInvalidExecutionTransition, l.state, to)
	}
	l.state = to
	return nil
}

func knownExecutionState(state model.ExecutionState) bool {
	for _, candidate := range []model.ExecutionState{
		model.StateAccepted, model.StateQueued, model.StateClaimed,
		model.StateCompilePreparing, model.StateCompiling,
		model.StateCompileSucceeded, model.StateCompileFailed,
		model.StateRuntimePreparing, model.StateRunning,
		model.StateCancelRequested, model.StateCancelled,
		model.StateRawCompleted, model.StateRawLimitEvent,
		model.StateInfraFailed, model.StateCleanupPending,
		model.StateCleanupVerified,
	} {
		if state == candidate {
			return true
		}
	}
	return false
}

type ResultDecision string

const (
	ResultAccept    ResultDecision = "ACCEPT"
	ResultDuplicate ResultDecision = "DUPLICATE"
	ResultStale     ResultDecision = "STALE"
	ResultConflict  ResultDecision = "CONFLICT"
)

// DecideResult applies attempt and generation authority before any result is
// persisted.  A result from an older attempt can never roll a newer attempt
// back to success, even when its payload is otherwise valid.
func DecideResult(currentAttempt int, currentGeneration int64, resultAttempt int, resultGeneration int64, terminal bool, sameDigest bool) ResultDecision {
	if resultAttempt < currentAttempt || resultGeneration < currentGeneration {
		return ResultStale
	}
	if resultAttempt > currentAttempt || resultGeneration > currentGeneration {
		return ResultConflict
	}
	if terminal {
		if sameDigest {
			return ResultDuplicate
		}
		return ResultConflict
	}
	return ResultAccept
}
