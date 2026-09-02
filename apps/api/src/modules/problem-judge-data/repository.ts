import {
  id,
  now,
  type JudgeDataRepository,
  type JudgeDraft,
  type DraftTestcase,
  type JudgeDataVersion,
  JudgeDataError,
} from './model.js';

const json = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const mapCase = (
  row: Record<string, unknown>,
  defaults: JudgeDraft['defaults'],
): DraftTestcase => {
  const input = json(row.input_ref, row.input as DraftTestcase['input']);
  const expectedOutput = json(
    row.expected_output_ref,
    row.expectedOutput as DraftTestcase['expectedOutput'],
  );
  const timeLimitMsOverride =
    row.time_limit_ms_override == null
      ? null
      : Number(row.time_limit_ms_override);
  const memoryLimitBytesOverride =
    row.memory_limit_bytes_override == null
      ? null
      : Number(row.memory_limit_bytes_override);
  const outputLimitBytesOverride =
    row.output_limit_bytes_override == null
      ? null
      : Number(row.output_limit_bytes_override);
  return {
    testcaseId: String(row.testcase_id ?? row.testcaseId),
    ordinal: Number(row.ordinal),
    label: row.label == null ? null : String(row.label),
    input,
    expectedOutput,
    timeLimitMsOverride,
    memoryLimitBytesOverride,
    outputLimitBytesOverride,
    effectiveTimeLimitMs:
      (Number(row.effective_time_limit_ms) || timeLimitMsOverride) ??
      defaults.timeLimitMs,
    effectiveMemoryLimitBytes:
      (Number(row.effective_memory_limit_bytes) || memoryLimitBytesOverride) ??
      defaults.memoryLimitBytes,
    effectiveOutputLimitBytes:
      (Number(row.effective_output_limit_bytes) || outputLimitBytesOverride) ??
      defaults.outputLimitBytes,
    createdAt: new Date(String(row.created_at ?? new Date())).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? new Date())).toISOString(),
  };
};

const versionTestcase = (row: Record<string, unknown>) =>
  json(row.testcase, row) as JudgeDataVersion['testcases'][number];

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
      (!current || current.revision !== expectedRevision)
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
      (!current || current.revision !== expectedRevision)
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
      problemRevisionId: draft.problemRevisionId,
      testdataVersionId: draft.testdataVersionId,
      testcaseSetId: draft.testcaseSetId,
      executionProfileId: draft.executionProfileId,
      allowedLanguageProfiles: [...draft.defaults.allowedLanguageProfiles],
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
      ): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
      connect?: () => Promise<{
        query(
          text: string,
          values?: unknown[],
        ): Promise<{
          rows: Record<string, unknown>[];
          rowCount?: number | null;
        }>;
        release(): void;
      }>;
    },
  ) {}

  private async transaction<T>(
    fn: (db: {
      query(
        text: string,
        values?: unknown[],
      ): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
    }) => Promise<T>,
  ): Promise<T> {
    if (!this.pool.connect) return fn(this.pool);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async readDraft(
    db: {
      query(
        text: string,
        values?: unknown[],
      ): Promise<{ rows: Record<string, unknown>[] }>;
    },
    problemId: string,
  ) {
    const d = await db.query(
      'SELECT d.*, c.time_limit_ms,c.memory_limit_bytes,c.output_limit_bytes,c.checker,c.allowed_language_profiles FROM problem_judge_drafts d JOIN problem_judge_configs c USING(problem_id) WHERE d.problem_id=$1',
      [problemId],
    );
    if (!d.rows[0]) return undefined;
    const t = await db.query(
      'SELECT * FROM problem_judge_draft_testcases WHERE problem_id=$1 ORDER BY ordinal',
      [problemId],
    );
    const r = d.rows[0];
    const defaults = {
      timeLimitMs: Number(r.time_limit_ms),
      memoryLimitBytes: Number(r.memory_limit_bytes),
      outputLimitBytes: Number(r.output_limit_bytes),
      checker: r.checker as JudgeDraft['defaults']['checker'],
      allowedLanguageProfiles: json<string[]>(r.allowed_language_profiles, []),
    };
    return {
      problemId,
      status: r.status as 'DRAFT' | 'VALIDATED',
      revision: Number(r.revision),
      updatedAt: new Date(String(r.updated_at)).toISOString(),
      updatedBy: String(r.updated_by),
      ...(r.manifest_sha256 == null
        ? {}
        : { manifestSha256: String(r.manifest_sha256) }),
      problemRevisionId: String(r.problem_revision_id),
      testdataVersionId: String(r.testdata_version_id),
      testcaseSetId: String(r.testcase_set_id),
      executionProfileId:
        r.execution_profile_id as JudgeDraft['executionProfileId'],
      defaults,
      testcases: t.rows.map((x) => mapCase(x, defaults)),
    };
  }
  async getDraft(problemId: string) {
    return this.readDraft(this.pool, problemId);
  }
  async saveDraft(draft: JudgeDraft, expectedRevision?: number) {
    return this.transaction(async (db) => {
      const current = await this.readDraft(db, draft.problemId);
      if (
        expectedRevision !== undefined &&
        (!current || current.revision !== expectedRevision)
      )
        throw new JudgeDataError('STALE_EDIT_CONFLICT', 'Draft changed', 409);
      const rev = (current?.revision ?? draft.revision) + 1;
      const expected = expectedRevision ?? current?.revision ?? draft.revision;
      const result = await db.query(
        `INSERT INTO problem_judge_drafts(problem_id,status,revision,updated_by,problem_revision_id,testdata_version_id,testcase_set_id,execution_profile_id,manifest_sha256)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT(problem_id) DO UPDATE SET status=$2,revision=$3,updated_by=$4,problem_revision_id=$5,testdata_version_id=$6,testcase_set_id=$7,execution_profile_id=$8,manifest_sha256=$9,updated_at=now()
         WHERE problem_judge_drafts.revision=$10`,
        [
          draft.problemId,
          draft.status,
          rev,
          draft.updatedBy,
          draft.problemRevisionId,
          draft.testdataVersionId,
          draft.testcaseSetId,
          draft.executionProfileId,
          draft.manifestSha256 ?? null,
          expected,
        ],
      );
      if (expectedRevision !== undefined && result.rowCount === 0)
        throw new JudgeDataError('STALE_EDIT_CONFLICT', 'Draft changed', 409);
      await db.query(
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
      await db.query(
        'DELETE FROM problem_judge_draft_testcases WHERE problem_id=$1',
        [draft.problemId],
      );
      for (const c of draft.testcases)
        await db.query(
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
    });
  }
  private async readVersions(
    db: {
      query(
        text: string,
        values?: unknown[],
      ): Promise<{ rows: Record<string, unknown>[] }>;
    },
    problemId: string,
  ) {
    const r = await db.query(
      'SELECT * FROM judge_data_versions WHERE problem_id=$1 ORDER BY version_number DESC',
      [problemId],
    );
    const versions: JudgeDataVersion[] = [];
    for (const row of r.rows) {
      const defaults = {
        timeLimitMs: 0,
        memoryLimitBytes: 0,
        outputLimitBytes: 0,
        checker: row.checker as JudgeDataVersion['checker'],
        allowedLanguageProfiles: json<string[]>(
          row.allowed_language_profiles,
          [],
        ),
      };
      const child = await db.query(
        'SELECT * FROM judge_data_version_testcases WHERE version_id=$1 ORDER BY ordinal',
        [String(row.version_id)],
      );
      const manifest = json<Record<string, unknown>>(row.manifest, {});
      const testcases = child.rows.length
        ? child.rows.map(versionTestcase)
        : Array.isArray(manifest)
          ? (manifest as unknown as JudgeDataVersion['testcases'])
          : (json<JudgeDataVersion['testcases']>(manifest.testcases, []) ?? []);
      versions.push({
        versionId: String(row.version_id),
        problemId: String(row.problem_id),
        versionNumber: Number(row.version_number),
        manifestSha256: String(row.manifest_sha256),
        testcaseCount: Number(row.testcase_count),
        checker: defaults.checker,
        createdAt: new Date(String(row.created_at)).toISOString(),
        publishedAt: new Date(String(row.published_at)).toISOString(),
        publishedBy: String(row.published_by),
        testcases,
        problemRevisionId: String(row.problem_revision_id),
        testdataVersionId: String(row.testdata_version_id),
        testcaseSetId: String(row.testcase_set_id),
        executionProfileId:
          row.execution_profile_id as JudgeDataVersion['executionProfileId'],
        allowedLanguageProfiles: defaults.allowedLanguageProfiles,
      });
    }
    return versions;
  }
  async listVersions(problemId: string) {
    return this.readVersions(this.pool, problemId);
  }
  async getVersion(problemId: string, versionId: string) {
    return (await this.listVersions(problemId)).find(
      (v) => v.versionId === versionId,
    );
  }
  async publish(draft: JudgeDraft, actor: string, expectedRevision?: number) {
    return this.transaction(async (db) => {
      const current = await this.readDraft(db, draft.problemId);
      if (
        expectedRevision !== undefined &&
        current &&
        current.revision !== expectedRevision
      )
        throw new JudgeDataError(
          'STALE_PUBLISH_CONFLICT',
          'Draft changed',
          409,
        );
      const list = await this.readVersions(db, draft.problemId);
      const v: JudgeDataVersion = {
        versionId: id(),
        problemId: draft.problemId,
        versionNumber: list.length + 1,
        manifestSha256: draft.manifestSha256!,
        testcaseCount: draft.testcases.length,
        checker: draft.defaults.checker,
        createdAt: now(),
        publishedAt: now(),
        publishedBy: actor,
        testcases: structuredClone(draft.testcases),
        problemRevisionId: draft.problemRevisionId,
        testdataVersionId: draft.testdataVersionId,
        testcaseSetId: draft.testcaseSetId,
        executionProfileId: draft.executionProfileId,
        allowedLanguageProfiles: [...draft.defaults.allowedLanguageProfiles],
      };
      await db.query(
        'INSERT INTO judge_data_versions(version_id,problem_id,version_number,manifest_sha256,checker,testcase_count,published_by,published_at,manifest,problem_revision_id,testdata_version_id,testcase_set_id,execution_profile_id,allowed_language_profiles) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8,$9,$10,$11,$12,$13)',
        [
          v.versionId,
          v.problemId,
          v.versionNumber,
          v.manifestSha256,
          v.checker,
          v.testcaseCount,
          actor,
          JSON.stringify({
            protocolVersion: '2C.4',
            problemId: v.problemId,
            problemRevisionId: v.problemRevisionId,
            testdataVersionId: v.testdataVersionId,
            testcaseSetId: v.testcaseSetId,
            executionProfileId: v.executionProfileId,
            manifestHash: v.manifestSha256,
            entries: v.testcases,
            testcases: v.testcases,
          }),
          v.problemRevisionId,
          v.testdataVersionId,
          v.testcaseSetId,
          v.executionProfileId,
          JSON.stringify(v.allowedLanguageProfiles),
        ],
      );
      for (const testcase of v.testcases)
        await db.query(
          'INSERT INTO judge_data_version_testcases(version_id,testcase_id,ordinal,testcase) VALUES($1,$2,$3,$4)',
          [
            v.versionId,
            testcase.testcaseId,
            testcase.ordinal,
            JSON.stringify(testcase),
          ],
        );
      for (const testcase of v.testcases)
        for (const ref of [testcase.input, testcase.expectedOutput])
          await db.query(
            'INSERT INTO problem_judge_data_objects(object_id,problem_id,version_id,object_key,file_name,size_bytes,sha256) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
            [
              ref.objectId,
              v.problemId,
              v.versionId,
              ref.key,
              ref.fileName,
              ref.sizeBytes,
              ref.sha256,
            ],
          );
      const removed = await db.query(
        expectedRevision === undefined
          ? 'DELETE FROM problem_judge_drafts WHERE problem_id=$1'
          : 'DELETE FROM problem_judge_drafts WHERE problem_id=$1 AND revision=$2',
        expectedRevision === undefined
          ? [draft.problemId]
          : [draft.problemId, expectedRevision],
      );
      if (expectedRevision !== undefined && removed.rowCount === 0)
        throw new JudgeDataError(
          'STALE_PUBLISH_CONFLICT',
          'Draft changed',
          409,
        );
      return v;
    });
  }
}
