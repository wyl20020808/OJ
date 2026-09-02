import {
  BUILTIN_CHECKER_VERSION,
  builtinCheckerConfigSha256,
  createTestcaseSetManifest,
  TestcaseSetContractError,
  type TestcaseSetManifest,
} from '@ojplatform/judge-runtime';
import {
  JudgeDataError,
  sha256,
  type ByteStorage,
  type JudgeDataRepository,
  type JudgeDataVersion,
} from '../problem-judge-data/index.js';

type SubmissionJudgeBinding = {
  judgeDataVersionId: string;
  judgeDataVersionNumber: number;
  judgeDataManifestSha256: string;
  testdataVersionRef: string;
};

type BoundSubmission = Partial<SubmissionJudgeBinding> & {
  problemId: string;
  problemRevisionId: string;
  languageId: string;
} & Record<string, unknown>;

const text = (bytes: Uint8Array, label: string) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new JudgeDataError(
      'INTEGRITY_MISMATCH',
      `${label} is not UTF-8`,
      409,
    );
  }
};

const same = (submission: BoundSubmission, version: JudgeDataVersion) =>
  submission.judgeDataVersionId === version.versionId &&
  submission.judgeDataVersionNumber === version.versionNumber &&
  submission.judgeDataManifestSha256 === version.manifestSha256 &&
  submission.problemRevisionId === version.problemRevisionId &&
  submission.testdataVersionRef === version.testdataVersionId;

/** Product-only bridge: object-store credentials and bytes never leave this API boundary. */
export class ProductJudgeDataSubmissionBridge {
  constructor(
    private readonly versions: JudgeDataRepository,
    private readonly storage: ByteStorage,
  ) {}

  async bind(
    problemId: string,
    problemRevisionId: string,
    languageId: string,
  ): Promise<SubmissionJudgeBinding> {
    const version = (await this.versions.listVersions(problemId)).find(
      (value) => value.problemRevisionId === problemRevisionId,
    );
    if (!version)
      throw new JudgeDataError(
        'JUDGE_DATA_UNAVAILABLE',
        'No published Judge Data version is available',
        409,
      );
    if (
      languageId !== 'cpp20' ||
      version.executionProfileId !== 'cpp20-gcc-13-v1' ||
      !version.allowedLanguageProfiles.includes('cpp20-gcc-13-v1')
    )
      throw new JudgeDataError(
        'UNSUPPORTED_LANGUAGE',
        'Language is unavailable for this Judge Data version',
        400,
      );
    return {
      judgeDataVersionId: version.versionId,
      judgeDataVersionNumber: version.versionNumber,
      judgeDataManifestSha256: version.manifestSha256,
      testdataVersionRef: version.testdataVersionId,
    };
  }

  async manifest(submission: BoundSubmission): Promise<TestcaseSetManifest> {
    if (!submission.judgeDataVersionId)
      throw new JudgeDataError(
        'JUDGE_DATA_BINDING_MISSING',
        'Submission has no immutable Judge Data binding',
        409,
      );
    const version = await this.versions.getVersion(
      submission.problemId,
      submission.judgeDataVersionId,
    );
    if (!version || !same(submission, version))
      throw new JudgeDataError(
        'JUDGE_DATA_BINDING_MISMATCH',
        'Submission Judge Data binding is invalid',
        409,
      );
    if (
      submission.languageId !== 'cpp20' ||
      version.executionProfileId !== 'cpp20-gcc-13-v1' ||
      !version.allowedLanguageProfiles.includes('cpp20-gcc-13-v1')
    )
      throw new JudgeDataError(
        'UNSUPPORTED_LANGUAGE',
        'Language is unavailable for this Judge Data version',
        409,
      );
    if (!this.storage.get)
      throw new JudgeDataError(
        'STORAGE_UNAVAILABLE',
        'Immutable Judge Data retrieval is unavailable',
        503,
      );

    const entries = await Promise.all(
      version.testcases.map(async (testcase) => {
        await this.storage.verify(testcase.input);
        await this.storage.verify(testcase.expectedOutput);
        const [input, expectedOutput] = await Promise.all([
          this.storage.get!(testcase.input),
          this.storage.get!(testcase.expectedOutput),
        ]);
        if (
          input.byteLength !== testcase.input.sizeBytes ||
          expectedOutput.byteLength !== testcase.expectedOutput.sizeBytes ||
          sha256(input) !== testcase.input.sha256 ||
          sha256(expectedOutput) !== testcase.expectedOutput.sha256
        )
          throw new JudgeDataError(
            'INTEGRITY_MISMATCH',
            'Judge Data object integrity mismatch',
            409,
          );
        return {
          testcaseId: testcase.testcaseId,
          testdataVersionId: version.testdataVersionId,
          input: text(input, 'Judge Data input'),
          inputSha256: testcase.input.sha256,
          executionProfileId: version.executionProfileId,
          expectedOutput: text(expectedOutput, 'Judge Data expected output'),
          expectedOutputSha256: testcase.expectedOutput.sha256,
          checkerType: version.checker,
          checkerVersion: BUILTIN_CHECKER_VERSION,
          checkerConfigSha256: builtinCheckerConfigSha256(version.checker),
        };
      }),
    );
    let manifest: TestcaseSetManifest;
    try {
      manifest = createTestcaseSetManifest({
        problemId: version.problemId,
        problemRevisionId: version.problemRevisionId,
        testdataVersionId: version.testdataVersionId,
        testcaseSetId: version.testcaseSetId,
        executionProfileId: version.executionProfileId,
        entries,
      });
    } catch (error) {
      if (error instanceof TestcaseSetContractError)
        throw new JudgeDataError(
          'JUDGE_DATA_MANIFEST_INVALID',
          'Published Judge Data cannot be executed',
          409,
        );
      throw error;
    }
    if (manifest.manifestHash !== version.manifestSha256)
      throw new JudgeDataError(
        'INTEGRITY_MISMATCH',
        'Judge Data manifest hash mismatch',
        409,
      );
    return manifest;
  }
}
