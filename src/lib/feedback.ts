export function getOverallExaminerComment(feedback: any) {
  if (feedback?.overall_comment) return feedback.overall_comment;

  const structureNotes = feedback?.structure_notes;
  if (structureNotes && typeof structureNotes === 'object' && structureNotes.overall_comment) {
    return structureNotes.overall_comment;
  }

  if (typeof structureNotes === 'string') {
    const match = structureNotes.match(/overall examiner comment\s*:\s*([\s\S]*)/i);
    if (match?.[1]) return match[1].trim();
  }

  return '';
}
