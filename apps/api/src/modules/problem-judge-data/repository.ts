/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  id,
  now,
  type JudgeDataRepository,
  type JudgeDraft,
  type JudgeDataVersion,
  JudgeDataError,
} from './model.js';

export class InMemoryJudgeDataRepository implements JudgeDataRepository {
  private drafts = new Map<string, JudgeDraft>();
  private versions = new Map<string, JudgeDataVersion[]>();
  async getDraft(problemId: string) {
    return this.drafts.get(problemId)
      ? structuredClone(this.drafts.get(problemId))
      : undefined;
  }
  async saveDraft(draft: JudgeDraft, expectedRevision?: number) {
    const current = this.drafts.get(draft.problemId);
    if (
      expectedRevision !== undefined &&
      current &&
      current.revision !== expectedRevision
    )
      throw new JudgeDataError('STALE_EDIT_CONFLICT', 'Draft changed', 409);
    const value = structuredClone({
      ...draft,
      revision: (current?.revision ?? draft.revision) + 1,
      updatedAt: now(),
    });
    this.drafts.set(draft.problemId, value);
    return structuredClone(value);
  }
  async getVersion(problemId: string, versionId: string) {
    return structuredClone(
      this.versions.get(problemId)?.find((v) => v.versionId === versionId),
    );
  }
  async listVersions(problemId: string) {
    return structuredClone(this.versions.get(problemId) ?? []);
  }
  async publish(draft: JudgeDraft, actor: string, expectedRevision?: number) {
    const current = this.drafts.get(draft.problemId);
    if (
      expectedRevision !== undefined &&
      current &&
      current.revision !== expectedRevision
    )
      throw new JudgeDataError('STALE_PUBLISH_CONFLICT', 'Draft changed', 409);
    const list = this.versions.get(draft.problemId) ?? [];
    const versionNumber = list.length + 1;
    const v: JudgeDataVersion = {
      versionId: id(),
      problemId: draft.problemId,
      versionNumber,
      manifestSha256: draft.manifestSha256!,
      testcaseCount: draft.testcases.length,
      checker: draft.defaults.checker,
      createdAt: now(),
      publishedAt: now(),
      publishedBy: actor,
      testcases: structuredClone(draft.testcases),
    };
    this.versions.set(draft.problemId, [...list, v]);
    this.drafts.delete(draft.problemId);
    return structuredClone(v);
  }
}

export class PostgresJudgeDataRepository implements JudgeDataRepository {
  constructor(
    private readonly pool: {
      query(
        text: string,
        values?: unknown[],
      ): Promise<{ rows: Record<string, unknown>[] }>;
    },
  ) {}
  async getDraft(problemId: string) {
    const d = await this.pool.query(
      'SELECT d.*, c.time_limit_ms,c.memory_limit_bytes,c.output_limit_bytes,c.checker,c.allowed_language_profiles FROM problem_judge_drafts d JOIN problem_judge_configs c USING(problem_id) WHERE d.problem_id=$1',
      [problemId],
    );
    if (!d.rows[0]) return undefined;
    const t = await this.pool.query(
      'SELECT * FROM problem_judge_draft_testcases WHERE problem_id=$1 ORDER BY ordinal',
      [problemId],
    );
    const r = d.rows[0];
    return {
      problemId,
      status: r.status as 'DRAFT' | 'VALIDATED',
      revision: Number(r.revision),
      updatedAt: new Date(String(r.updated_at)).toISOString(),
      updatedBy: String(r.updated_by),
      defaults: {
        timeLimitMs: Number(r.time_limit_ms),
        memoryLimitBytes: Number(r.memory_limit_bytes),
        outputLimitBytes: Number(r.output_limit_bytes),
        checker: r.checker as any,
        allowedLanguageProfiles:
          (r.allowed_language_profiles as string[]) ?? [],
      },
      testcases: t.rows.map((x) => x.testcase as any),
    };
  }
  async saveDraft(draft: JudgeDraft, expectedRevision?: number) {
    const current = await this.getDraft(draft.problemId);
    if (
      expectedRevision !== undefined &&
      current &&
      current.revision !== expectedRevision
    )
      throw new JudgeDataError('STALE_EDIT_CONFLICT', 'Draft changed', 409);
    const rev = (current?.revision ?? draft.revision) + 1;
    await this.pool.query(
      'INSERT INTO problem_judge_configs(problem_id,time_limit_ms,memory_limit_bytes,output_limit_bytes,checker,allowed_language_profiles,revision) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(problem_id) DO UPDATE SET time_limit_ms=$2,memory_limit_bytes=$3,output_limit_bytes=$4,checker=$5,allowed_language_profiles=$6,revision=$7,updated_at=now()',
      [
        draft.problemId,
        draft.defaults.timeLimitMs,
        draft.defaults.memoryLimitBytes,
        draft.defaults.outputLimitBytes,
        draft.defaults.checker,
        JSON.stringify(draft.defaults.allowedLanguageProfiles),
        rev,
      ],
    );
    await this.pool.query(
      'INSERT INTO problem_judge_drafts(problem_id,status,revision,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(problem_id) DO UPDATE SET status=$2,revision=$3,updated_by=$4,updated_at=now()',
      [draft.problemId, draft.status, rev, draft.updatedBy],
    );
    await this.pool.query(
      'DELETE FROM problem_judge_draft_testcases WHERE problem_id=$1',
      [draft.problemId],
    );
    for (const c of draft.testcases)
      await this.pool.query(
        'INSERT INTO problem_judge_draft_testcases(testcase_id,problem_id,ordinal,label,input_ref,expected_output_ref,time_limit_ms_override,memory_limit_bytes_override,output_limit_bytes_override) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          c.testcaseId,
          draft.problemId,
          c.ordinal,
          c.label,
          JSON.stringify(c.input),
          JSON.stringify(c.expectedOutput),
          c.timeLimitMsOverride,
          c.memoryLimitBytesOverride,
          c.outputLimitBytesOverride,
        ],
      );
    return { ...draft, revision: rev, updatedAt: now() };
  }
  async listVersions(problemId: string) {
    const r = await this.pool.query(
      'SELECT * FROM judge_data_versions WHERE problem_id=$1 ORDER BY version_number DESC',
      [problemId],
    );
    return r.rows.map((x) => x as unknown as JudgeDataVersion);
  }
  async getVersion(problemId: string, versionId: string) {
    return (await this.listVersions(problemId)).find(
      (v) => v.versionId === versionId,
    );
  }
  async publish(draft: JudgeDraft, actor: string, expectedRevision?: number) {
    const current = await this.getDraft(draft.problemId);
    if (
      expectedRevision !== undefined &&
      current &&
      current.revision !== expectedRevision
    )
      throw new JudgeDataError('STALE_PUBLISH_CONFLICT', 'Draft changed', 409);
    const list = await this.listVersions(draft.problemId);
    const v = {
      versionId: id(),
      problemId: draft.problemId,
      versionNumber: list.length + 1,
      manifestSha256: draft.manifestSha256!,
      testcaseCount: draft.testcases.length,
      checker: draft.defaults.checker,
      createdAt: now(),
      publishedAt: now(),
      publishedBy: actor,
      testcases: draft.testcases,
    };
    await this.pool.query(
      'INSERT INTO judge_data_versions(version_id,problem_id,version_number,manifest_sha256,checker,testcase_count,published_by,published_at,manifest) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8)',
      [
        v.versionId,
        v.problemId,
        v.versionNumber,
        v.manifestSha256,
        v.checker,
        v.testcaseCount,
        actor,
        JSON.stringify(v.testcases),
      ],
    );
    await this.pool.query(
      'DELETE FROM problem_judge_drafts WHERE problem_id=$1',
      [draft.problemId],
    );
    return v;
  }
}
