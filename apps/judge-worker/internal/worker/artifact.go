package worker

import (
	"context"
	"errors"
	"io"
	"os"
	"time"

	"github.com/ojplatform/judge-worker/internal/artifact"
	"github.com/ojplatform/judge-worker/internal/queueadapter"
	"github.com/ojplatform/judge-worker/internal/supervisorclient"
	"github.com/ojplatform/judge-worker/internal/verdict"
)

func (w *Worker) processRealArtifact(ctx, queueCtx context.Context, lease queueadapter.Lease) {
	if w.Artifacts == nil || queueadapter.ValidateArtifactJob(lease.Job) != nil {
		_ = w.failTerminal(queueCtx, lease, "INVALID_ARTIFACT_CONTRACT")
		return
	}
	ref := lease.Job.JudgeArtifact
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := w.Supervisor.ReleaseArtifactInputs(cleanupCtx, ref.ID, lease.Job.ExecutionRequestID); err != nil {
			w.logger.Printf(`{"event":"artifact_staging_release_unconfirmed","judge_job_id":%q,"artifact_id":%q}`, lease.Job.ID, ref.ID)
		}
	}()
	deadline := lease.Job.LeaseExpiresAt.Add(-100 * time.Millisecond)
	ctx, cancel := context.WithDeadline(ctx, deadline)
	defer cancel()
	var transferred int64
	fail := func(err error) {
		code, retry := "ARTIFACT_UNAVAILABLE", true
		var fetchError *artifact.FetchError
		if errors.As(err, &fetchError) {
			code, retry = fetchError.Code, fetchError.Retryable
		}
		w.logger.Printf(`{"event":"artifact_execution_failed","request_id":%q,"submission_id":%q,"judge_job_id":%q,"artifact_id":%q,"code":%q}`, lease.Job.RequestID, lease.Job.SubmissionID, lease.Job.ID, ref.ID, code)
		if ctx.Err() != nil && w.cancelRequested(queueCtx, lease) {
			w.cancelLease(queueCtx, lease)
		} else if retry {
			_ = w.retry(queueCtx, lease, code)
		} else {
			_ = w.failTerminal(queueCtx, lease, code)
		}
	}
	manifestFile, err := w.Artifacts.Fetch(ctx, ref.ID, artifact.Object{ObjectID: "manifest", SizeBytes: ref.ContentLength, SHA256: ref.SHA256}, "")
	if err != nil {
		fail(err)
		return
	}
	transferred += manifestFile.Bytes
	if err := manifestFile.Close(); err != nil {
		fail(err)
		return
	}
	m := ref.Manifest
	manifest := supervisorclient.TestcaseSetManifest{ProblemID: m.ProblemID, ProblemRevisionID: m.ProblemRevisionID, TestdataVersionID: m.TestdataVersionID, TestcaseSetID: m.TestcaseSetID, ExecutionProfileID: m.ExecutionProfileID, ManifestHash: m.ManifestHash}
	inputs := make([]supervisorclient.ArtifactInput, 0, len(m.Entries))
	for _, entry := range m.Entries {
		input, err := w.Artifacts.Fetch(ctx, ref.ID, entry.Input, "")
		if err != nil {
			fail(err)
			return
		}
		transferred += input.Bytes
		handle, stageErr := w.Supervisor.StageArtifactInput(ctx, ref.ID, lease.Job.ExecutionRequestID, input, entry)
		closeErr := input.Close()
		if stageErr != nil {
			fail(stageErr)
			return
		}
		if closeErr != nil {
			fail(closeErr)
			return
		}
		inputs = append(inputs, handle)
		manifest.Entries = append(manifest.Entries, supervisorclient.TestcaseSetEntry{Index: entry.Index, TestcaseID: entry.TestcaseID, TestdataVersionID: entry.TestdataVersionID, InputSHA256: entry.InputSHA256, ExpectedOutputSHA256: entry.ExpectedOutputSHA256, ExecutionProfileID: entry.ExecutionProfileID, CheckerType: entry.CheckerType, CheckerVersion: entry.CheckerVersion, CheckerConfigSHA256: entry.CheckerConfigSHA256})
	}
	request := supervisorclient.SetRequest{ProtocolVersion: artifact.ExecutionContract, JudgeArtifactID: ref.ID, Inputs: inputs, ExecutionSetRequestID: lease.Job.ExecutionRequestID, ExecutionSetAttemptID: lease.Job.ExecutionAttemptID, JudgeJobID: lease.Job.ID, SubmissionID: lease.Job.SubmissionID, Attempt: lease.Job.Attempt, CorrelationID: lease.Job.RequestID, Manifest: manifest, ExecutionPolicy: lease.Job.ExecutionSetPolicy, LanguageProfileID: lease.Job.LanguageProfileID, SourceSnapshotRef: lease.Job.SourceSnapshotRef, SourceBytes: lease.Job.SourceBytes, SourceSHA256: lease.Job.SourceSHA256, DeadlineAt: deadline, CancellationGeneration: lease.Job.CancellationGeneration}
	execution, err := w.Supervisor.ExecuteSet(ctx, request)
	if err != nil {
		fail(err)
		return
	}
	entries := make([]verdict.Entry, 0, len(m.Entries))
	var outputFetchErr error
	for _, entry := range m.Entries {
		entry := entry
		entries = append(entries, verdict.Entry{Index: entry.Index, TestcaseID: entry.TestcaseID, TestdataVersionID: entry.TestdataVersionID, ExpectedOutputSHA256: entry.ExpectedOutputSHA256, ExpectedOutputBytes: entry.ExpectedOutput.SizeBytes, CheckerType: entry.CheckerType, CheckerVersion: entry.CheckerVersion, CheckerConfigSHA256: entry.CheckerConfigSHA256,
			OpenExpectedOutput: func() (io.ReadCloser, error) {
				output, err := w.Artifacts.Fetch(ctx, ref.ID, entry.ExpectedOutput, "")
				if err != nil {
					outputFetchErr = err
					return nil, err
				}
				transferred += output.Bytes
				file, err := os.Open(output.Path)
				if err != nil {
					if cleanupErr := output.Close(); cleanupErr != nil {
						return nil, cleanupErr
					}
					return nil, err
				}
				return &artifactOutputReader{file, output}, nil
			}})
	}
	result, err := verdict.Derive(verdict.Input{SubmissionID: lease.Job.SubmissionID, ExecutionSetRequestID: lease.Job.ExecutionRequestID, ExecutionSetAttemptID: lease.Job.ExecutionAttemptID, ManifestHash: m.ManifestHash, Attempt: lease.Job.Attempt, Authoritative: true, Entries: entries, Raw: execution.Raw})
	if outputFetchErr != nil {
		fail(outputFetchErr)
		return
	}
	if err != nil {
		fail(err)
		return
	}
	published, err := attachVerdict(execution.Raw, result)
	if err != nil {
		fail(err)
		return
	}
	w.logger.Printf(`{"event":"artifact_execution_completed","request_id":%q,"submission_id":%q,"evaluation_generation":%d,"judge_job_id":%q,"artifact_id":%q,"artifact_bytes":%d,"verdict":%q}`, lease.Job.RequestID, lease.Job.SubmissionID, lease.Job.EvaluationGeneration, lease.Job.ID, ref.ID, transferred, result.OverallUserVerdict)
	if err := w.completeReal(queueCtx, lease, published); err != nil {
		w.logger.Printf(`{"event":"artifact_result_persist_failed","judge_job_id":%q}`, lease.Job.ID)
	}
}

type artifactOutputReader struct {
	*os.File
	materialized *artifact.Materialized
}

func (r *artifactOutputReader) Close() error {
	return errors.Join(r.File.Close(), r.materialized.Close())
}
