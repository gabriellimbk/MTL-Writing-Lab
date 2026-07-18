export function getFeedbackLanguageVersion(feedback: any, language: 'english' | 'bahasa') {
  const english = feedback?.english || feedback || {};
  const bahasa = feedback?.bahasa || feedback?.bahasa_melayu || feedback?.malay;

  if (language === 'bahasa' && bahasa) return bahasa;
  return english;
}

export function hasBahasaFeedback(feedback: any) {
  return Boolean(feedback?.bahasa || feedback?.bahasa_melayu || feedback?.malay);
}

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

export function getEstimatedRubricAlignment(feedback: any) {
  const structureNotes = feedback?.structure_notes;
  if (structureNotes && typeof structureNotes === 'object') {
    const contentBand = structureNotes.content_band || structureNotes.contentBand;
    const contentReason = structureNotes.content_reason || structureNotes.contentReason;
    const languageBand = structureNotes.language_band || structureNotes.languageBand;
    const languageReason = structureNotes.language_reason || structureNotes.languageReason;

    if (contentBand || languageBand) {
      return [
        contentBand ? `Content (ISI): ${contentBand}` : '',
        contentReason ? `Content Reason: ${contentReason}` : '',
        languageBand ? `Language (BAHASA): ${languageBand}` : '',
        languageReason ? `Language Reason: ${languageReason}` : ''
      ].filter(Boolean).join('\n');
    }

    const { overall_comment, ...rubricNotes } = structureNotes;
    return rubricNotes;
  }

  if (typeof structureNotes === 'string') {
    const cleaned = structureNotes
      .replace(/\n?\s*overall(?: examiner)? comment\s*:\s*[\s\S]*$/i, '')
      .trim();

    const compact = cleaned.replace(/\s+/g, ' ');
    const compactBandMatch = compact.match(
      /^Estimated Rubric Alignment:\s*Content(?: \(ISI\))?\s+Band\s+([^,]+),?\s*(?:as\s+)?(.+?)\s+Language(?: \(BAHASA\))?\s+Band\s+([^,]+),?\s*(?:as\s+)?(.+)$/i
    );

    if (compactBandMatch) {
      return [
        `Content (ISI): Band ${compactBandMatch[1].trim()}`,
        `Content Reason: ${compactBandMatch[2].trim()}`,
        `Language (BAHASA): Band ${compactBandMatch[3].trim()}`,
        `Language Reason: ${compactBandMatch[4].trim()}`
      ].join('\n');
    }

    return cleaned.replace(/^Estimated Rubric Alignment:\s*/i, '').trim();
  }

  return structureNotes || '';
}
