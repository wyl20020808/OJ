export type AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export type Assignment = {
  id: string;
  publicId: string;
  teamId: string;
  title: string;
  description: string;
  status: AssignmentStatus;
  startsAt: string | null;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AssignmentProblem = {
  assignmentId: string;
  problemId: string;
  displayOrder: number;
};

export type AssignmentViewerCapabilities = {
  canView: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canClose: boolean;
};

export type AssignmentListItem = Assignment & {
  team: { slug: string; name: string };
  problemCount: number;
  completedCount: number;
  capabilities: AssignmentViewerCapabilities;
};

export type AssignmentDetail = AssignmentListItem & {
  problems: Array<{
    publicId: string;
    title: string;
    problemId: string;
    displayOrder: number;
    completed: boolean;
  }>;
};
